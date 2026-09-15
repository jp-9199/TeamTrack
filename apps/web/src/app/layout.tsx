import type { Metadata } from 'next';
import React from 'react';
import { NotificationProvider } from '../components/notifications/NotificationContext';
import { AppHeader } from '../components/layout/AppHeader';

export const metadata: Metadata = {
  title: 'TeamTrack',
  description: 'TeamTrack Collaboration Platform - Web Foundation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <NotificationProvider>
          <AppHeader />
          <div style={{ flex: 1 }}>{children}</div>
        </NotificationProvider>
      </body>
    </html>
  );
}
