import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import * as path from 'path';
import { desktopSecureStorage } from './auth/secureStorage.js';

// Suppress Windows Crashpad registration errors and accelerate rendering
app.commandLine.appendSwitch('disable-features', 'Crashpad');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let mainWindow: BrowserWindow | null = null;

function registerAuthIpcHandlers(): void {
  ipcMain.handle('teamtrack:auth:get-refresh-token', async () => {
    return desktopSecureStorage.getRefreshToken();
  });

  ipcMain.handle('teamtrack:auth:set-refresh-token', async (_event, token: string) => {
    return desktopSecureStorage.setRefreshToken(token);
  });

  ipcMain.handle('teamtrack:auth:remove-refresh-token', async () => {
    return desktopSecureStorage.removeRefreshToken();
  });
}

function registerWindowIpcHandlers(): void {
  ipcMain.handle('teamtrack:window:minimize', async () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('teamtrack:window:maximize', async () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('teamtrack:window:close', async () => {
    mainWindow?.close();
  });

  ipcMain.handle('teamtrack:window:is-maximized', async () => {
    return mainWindow?.isMaximized() ?? false;
  });
}

function registerSystemIpcHandlers(): void {
  ipcMain.handle('teamtrack:system:notification', async (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title: title || 'TeamTrack', body: body || '' }).show();
    }
  });

  ipcMain.handle('teamtrack:system:open-external', async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });
}

import * as fs from 'fs';

function getConfigFilePath(): string {
  return path.join(app.getPath('userData'), 'teamtrack-config.json');
}

function getSavedServerUrl(): string {
  if (process.env.TEAMTRACK_WEB_URL) {
    return process.env.TEAMTRACK_WEB_URL;
  }
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.serverUrl && typeof data.serverUrl === 'string') {
        return data.serverUrl;
      }
    }
  } catch (err) {
    console.error('Failed to read desktop config:', err);
  }
  return 'http://localhost:3000/chat';
}

function saveServerUrl(url: string): void {
  try {
    const configPath = getConfigFilePath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const currentData = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    currentData.serverUrl = url;
    fs.writeFileSync(configPath, JSON.stringify(currentData, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save desktop config:', err);
  }
}

function registerServerIpcHandlers(): void {
  ipcMain.handle('teamtrack:server:get-url', async () => {
    return getSavedServerUrl();
  });

  ipcMain.handle('teamtrack:server:set-url', async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      saveServerUrl(url);
      if (mainWindow) {
        void loadMainWindow(mainWindow);
      }
      return true;
    }
    return false;
  });
}

async function loadMainWindow(win: BrowserWindow): Promise<void> {
  const targetUrl = getSavedServerUrl();
  const offlinePath = path.join(__dirname, '../src/index.html');

  // Attempt to connect to live web application
  let loaded = false;
  for (let attempt = 1; attempt <= 25; attempt++) {
    try {
      await win.loadURL(targetUrl);
      loaded = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (!loaded) {
    console.warn(`[TeamTrack Desktop] Could not connect to ${targetUrl}, loading offline fallback.`);
    await win.loadFile(offlinePath);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 920,
    minHeight: 640,
    title: 'Microsoft Teams — TeamTrack',
    frame: false,
    backgroundColor: '#ECEEF0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('teamtrack:window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('teamtrack:window:maximized-change', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void loadMainWindow(mainWindow);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerAuthIpcHandlers();
    registerWindowIpcHandlers();
    registerSystemIpcHandlers();
    registerServerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

