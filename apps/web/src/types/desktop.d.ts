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

declare global {
  interface Window {
    teamtrack?: DesktopBridge;
  }
}
