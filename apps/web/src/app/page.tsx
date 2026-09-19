'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/chat');
  }, [router]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#ECEEF0] text-[#5B5FC7] font-semibold text-[15px]">
      Loading Microsoft Teams...
    </div>
  );
}
