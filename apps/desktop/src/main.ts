import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { desktopSecureStorage } from './auth/secureStorage.js';

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'TeamTrack',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const indexPath = path.join(__dirname, '../src/index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerAuthIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
