import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopAuthBridge {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  removeRefreshToken(): Promise<void>;
}

export interface DesktopBridge {
  platform: string;
  version: string;
  auth: DesktopAuthBridge;
}

const desktopBridge: DesktopBridge = {
  platform: process.platform,
  version: '0.1.0',
  auth: {
    getRefreshToken: () => ipcRenderer.invoke('teamtrack:auth:get-refresh-token'),
    setRefreshToken: (token: string) => ipcRenderer.invoke('teamtrack:auth:set-refresh-token', token),
    removeRefreshToken: () => ipcRenderer.invoke('teamtrack:auth:remove-refresh-token'),
  },
};

contextBridge.exposeInMainWorld('teamtrack', desktopBridge);
