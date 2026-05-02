import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Python Bridge — spawns and communicates with the Python
 * automation engine via JSON-based stdin/stdout protocol
 */
export class PythonBridge {
  constructor() {
    this.process = null;
    this.pendingRequests = new Map();
    this.isRunning = false;
    this.buffer = '';
  }

  async start() {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    const enginePath = path.resolve(__dirname, '../../../python-engine/server.py');

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonPath, [enginePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.resolve(__dirname, '../../../python-engine'),
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr.on('data', (data) => {
        console.error('[Python]', data.toString().trim());
      });

      this.process.on('error', (err) => {
        console.error('[Python Bridge] Failed to start:', err);
        this.isRunning = false;
        reject(err);
      });

      this.process.on('close', (code) => {
        console.log(`[Python Bridge] Process exited with code ${code}`);
        this.isRunning = false;
      });

      // Wait for ready signal
      setTimeout(() => {
        this.isRunning = true;
        console.log('[Python Bridge] Started');
        resolve();
      }, 2000);
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.requestId && this.pendingRequests.has(response.requestId)) {
          const { resolve, reject } = this.pendingRequests.get(response.requestId);
          this.pendingRequests.delete(response.requestId);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      } catch {}
    }
  }

  async execute(module, action, params, timeout = 300000) {
    if (!this.isRunning) throw new Error('Python bridge not running');

    const requestId = uuidv4();
    const request = JSON.stringify({ requestId, module, action, params }) + '\n';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Python execution timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      this.process.stdin.write(request);
    });
  }

  cancelTask(taskId) {
    if (this.isRunning) {
      const request = JSON.stringify({ requestId: 'cancel', module: 'system', action: 'cancel', params: { taskId } }) + '\n';
      this.process.stdin.write(request);
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.isRunning = false;
    }
  }
}
