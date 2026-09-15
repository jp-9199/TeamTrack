import React from 'react';

export default function HomePage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '12px',
          padding: '2.5rem 3rem',
          maxWidth: '560px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            margin: '0 0 1rem 0',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #60a5fa 0%, #a855f7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          TeamTrack
        </h1>
        <p
          style={{
            color: '#94a3b8',
            fontSize: '1rem',
            lineHeight: 1.6,
            margin: '0 0 1.5rem 0',
          }}
        >
          Phase 1: Web Foundation
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '9999px',
            color: '#4ade80',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '1.5rem',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#4ade80',
            }}
          />
          Phase 9D-D Notification Center Ready
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/notifications"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: '#2563eb',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            🔔 Notification Center &rarr;
          </a>
          <a
            href="/meetings"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            Meetings App
          </a>
        </div>
      </div>
    </main>
  );
}
