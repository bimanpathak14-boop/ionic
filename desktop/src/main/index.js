import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { AgentWebSocket } from '../sync/websocketClient.js';
import { PythonBridge } from '../bridge/pythonBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store();

let mainWindow = null;
let tray = null;
let wsClient = null;
let pythonBridge = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVFhH7c4xDQAwDASx+4/eFJQhkOXpnqT5JN3dVlV9+xZQVVVVVVVVVVVVVVVV/Y6q+vas4OP1Taqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqup/VNW3JH0AOTpByLcSN/EAAAAASUVORK5CYII='
  );
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Status: Connected', id: 'status', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Pocket AI Office Agent');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

async function initializeAgent() {
  const serverUrl = store.get('serverUrl', 'https://pocket-ai-backend.onrender.com');
  const token = store.get('authToken');
  const deviceId = store.get('deviceId');

  // Initialize Python bridge
  pythonBridge = new PythonBridge();
  await pythonBridge.start();

  // Connect WebSocket if we have credentials
  if (token && deviceId) {
    wsClient = new AgentWebSocket(serverUrl, token, deviceId, pythonBridge);
    wsClient.connect();
  }
}

// IPC handlers for renderer
ipcMain.handle('get-config', () => ({
  serverUrl: store.get('serverUrl', 'https://pocket-ai-backend.onrender.com'),
  deviceId: store.get('deviceId'),
  isConnected: wsClient?.isConnected || false,
}));

ipcMain.handle('save-config', (_, config) => {
  if (config.serverUrl) store.set('serverUrl', config.serverUrl);
  if (config.authToken) store.set('authToken', config.authToken);
  if (config.deviceId) store.set('deviceId', config.deviceId);
  return { success: true };
});

ipcMain.handle('pair-device', async (_, { serverUrl, pairingCode, token }) => {
  try {
    const os = await import('os');
    const res = await fetch(`${serverUrl}/api/v1/devices/pair/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pairingCode,
        deviceName: os.hostname(),
        platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
        type: 'desktop',
      }),
    });

    const data = await res.json();
    if (data.device) {
      store.set('serverUrl', serverUrl);
      store.set('authToken', token);
      store.set('deviceId', data.device.id);

      wsClient = new AgentWebSocket(serverUrl, token, data.device.id, pythonBridge);
      wsClient.connect();
    }
    return data;
  } catch (error) {
    return { error: error.message };
  }
});

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  createTray();
  await initializeAgent();
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => {
  wsClient?.disconnect();
  pythonBridge?.stop();
});
