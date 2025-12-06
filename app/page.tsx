'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the dashboard - use replace to avoid polluting browser history
    router.replace('/AcadianDashboard');
  }, [router]);

  return null;
}
