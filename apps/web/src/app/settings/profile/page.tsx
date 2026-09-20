'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileSettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings?tab=profile');
  }, [router]);

  return (
    <div className="h-full w-full flex items-center justify-center p-8 text-slate-400 text-xs">
      Redirecting to Profile Settings...
    </div>
  );
}
