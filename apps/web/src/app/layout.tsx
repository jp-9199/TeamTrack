import type { Metadata, Viewport } from 'next';
import React from 'react';
import { NotificationProvider } from '../components/notifications/NotificationContext';
import { AuthProvider } from '../components/auth/AuthContext';
import { RealtimeProvider } from '../components/realtime/RealtimeContext';
import { FluentClientProvider } from '../components/providers/FluentClientProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'TeamTrack Studio | Modern High-Velocity Workspace',
  description: 'TeamTrack Studio - Ultra-fast, unified team collaboration with free unlimited AI Copilot and 4K HD meetings.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#5B5FC7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%236366f1'/><text x='16' y='22' font-size='18' font-weight='bold' font-family='sans-serif' text-anchor='middle' fill='white'>T</text></svg>"
        />
      </head>
      <body className="m-0 p-0 font-sans bg-[var(--bg-canvas)] text-[var(--text-primary)] h-screen w-screen overflow-hidden antialiased select-none">
        <FluentClientProvider>
          <AuthProvider>
            <RealtimeProvider>
              <NotificationProvider>
                {children}
              </NotificationProvider>
            </RealtimeProvider>
          </AuthProvider>
        </FluentClientProvider>
      </body>
    </html>
  );
}
