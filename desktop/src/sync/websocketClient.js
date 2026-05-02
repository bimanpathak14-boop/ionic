import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';

/**
 * Desktop Agent WebSocket client — connects to backend
 * and executes commands dispatched from mobile app
 */
export class AgentWebSocket {
  constructor(serverUrl, token, deviceId, pythonBridge) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.deviceId = deviceId;
    this.pythonBridge = pythonBridge;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
  }

  connect() {
    this.socket = io(this.serverUrl, {
      auth: { token: this.token, deviceId: this.deviceId },
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('[Agent WS] Connected to backend');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', () => {
      console.log('[Agent WS] Disconnected');
      this.isConnected = false;
    });

    // ---- Command Execution ----
    this.socket.on('command:execute', async (data) => {
      console.log('[Agent WS] Command received:', data.type, data.command);
      await this.executeCommand(data);
    });

    this.socket.on('command:cancel', (data) => {
      console.log('[Agent WS] Cancel command:', data.taskId);
      this.pythonBridge?.cancelTask(data.taskId);
    });

    this.socket.on('live:capture', async (data) => {
      // Screen capture for live preview
      const screenshot = await this.pythonBridge?.execute('system', 'screenshot', {});
      if (screenshot) {
        this.socket.emit('live:update', { ...data, screenshot: screenshot.data });
      }
    });

    // Heartbeat
    setInterval(() => {
      if (this.isConnected) {
        this.socket.emit('heartbeat');
      }
    }, 25000);
  }

  async executeCommand(data) {
    const { taskId, type, command, params } = data;

    try {
      // Report task started
      this.socket.emit('task:progress', { taskId, progress: 0, status: 'running' });

      // Map task type to Python module
      const moduleMap = {
        document_create: 'office',
        document_edit: 'office',
        presentation_create: 'office',
        spreadsheet_create: 'office',
        code_project: 'coding',
        code_edit: 'coding',
        file_operation: 'system',
        app_launch: 'system',
        browser_action: 'browser',
        image_generate: 'creative',
        image_edit: 'creative',
        system_command: 'system',
        print: 'system',
        export: 'office',
      };

      const module = moduleMap[type] || 'system';
      const result = await this.pythonBridge.execute(module, command, { ...params, taskId });

      // Report completion
      this.socket.emit('task:completed', {
        taskId,
        result: result.data,
        filesCreated: result.filesCreated || [],
      });

      // Upload created files to backend
      if (result.filesCreated) {
        for (const file of result.filesCreated) {
          try {
            await this.uploadFile(file, taskId);
          } catch (uploadError) {
            console.error('[Agent WS] File upload failed:', file.name, uploadError);
          }
        }
      }
    } catch (error) {
      console.error('[Agent WS] Command execution error:', error);
      this.socket.emit('task:failed', {
        taskId,
        error: error.message || 'Execution failed',
      });
    }
  }

  async uploadFile(fileInfo, taskId) {
    const { name, path: localPath, type } = fileInfo;
    
    if (!fs.existsSync(localPath)) {
      console.warn(`[Agent WS] File not found for upload: ${localPath}`);
      return;
    }

    console.log(`[Agent WS] Uploading file: ${name}`);

    // Create form data for upload
    const formData = new FormData();
    const stats = fs.statSync(localPath);
    const fileBuffer = fs.readFileSync(localPath);
    
    // In Node.js environment with fetch, we can use Blob
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, name);
    formData.append('deviceId', this.deviceId);
    formData.append('taskId', taskId);
    formData.append('type', type || 'document');
    formData.append('path', localPath);

    const response = await fetch(`${this.serverUrl}/api/v1/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Agent WS] File uploaded successfully: ${name} -> ${result.file.cloudUrl}`);
    return result.file;
  }

  disconnect() {
    this.socket?.disconnect();
    this.isConnected = false;
  }
}
