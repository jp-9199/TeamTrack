import type { Metadata } from 'next';
import React from 'react';
import { NotificationProvider } from '../components/notifications/NotificationContext';
import { AuthProvider } from '../components/auth/AuthContext';
import { FluentClientProvider } from '../components/providers/FluentClientProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Microsoft Teams | TeamTrack',
  description: 'TeamTrack - Microsoft Teams Modern Collaboration Workspace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="https://statics.teams.cdn.office.net/hashedassets/favicon/prod/favicon.ico" />
      </head>
      <body className="m-0 p-0 font-sans bg-teams-grayBg text-teams-textDark h-screen w-screen overflow-hidden antialiased">
        <FluentClientProvider>
          <AuthProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </AuthProvider>
        </FluentClientProvider>
      </body>
    </html>
  );
}
