import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopAuthBridge {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  removeRefreshToken(): Promise<void>;
}

export interface DesktopWindowBridge {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(callback: (isMax: boolean) => void): () => void;
}

export interface DesktopSystemBridge {
  showNotification(title: string, body: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

export interface DesktopServerBridge {
  getServerUrl(): Promise<string>;
  setServerUrl(url: string): Promise<boolean>;
}

export interface DesktopBridge {
  platform: string;
  version: string;
  auth: DesktopAuthBridge;
  window: DesktopWindowBridge;
  system: DesktopSystemBridge;
  server: DesktopServerBridge;
}

const desktopBridge: DesktopBridge = {
  platform: process.platform,
  version: '0.1.0',
  auth: {
    getRefreshToken: () => ipcRenderer.invoke('teamtrack:auth:get-refresh-token'),
    setRefreshToken: (token: string) => ipcRenderer.invoke('teamtrack:auth:set-refresh-token', token),
    removeRefreshToken: () => ipcRenderer.invoke('teamtrack:auth:remove-refresh-token'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('teamtrack:window:minimize'),
    maximize: () => ipcRenderer.invoke('teamtrack:window:maximize'),
    close: () => ipcRenderer.invoke('teamtrack:window:close'),
    isMaximized: () => ipcRenderer.invoke('teamtrack:window:is-maximized'),
    onMaximizedChange: (callback: (isMax: boolean) => void) => {
      const handler = (_event: unknown, isMax: boolean) => callback(isMax);
      ipcRenderer.on('teamtrack:window:maximized-change', handler);
      return () => {
        ipcRenderer.removeListener('teamtrack:window:maximized-change', handler);
      };
    },
  },
  system: {
    showNotification: (title: string, body: string) =>
      ipcRenderer.invoke('teamtrack:system:notification', { title, body }),
    openExternal: (url: string) =>
      ipcRenderer.invoke('teamtrack:system:open-external', url),
  },
  server: {
    getServerUrl: () => ipcRenderer.invoke('teamtrack:server:get-url'),
    setServerUrl: (url: string) => ipcRenderer.invoke('teamtrack:server:set-url', url),
  },
};

contextBridge.exposeInMainWorld('teamtrack', desktopBridge);
