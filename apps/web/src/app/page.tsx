'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/chat');
  }, [router]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)] gap-3 font-sans">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-indigo-500/25 animate-pulse">
        T
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Launching TeamTrack Studio...</span>
      </div>
    </div>
  );
}
