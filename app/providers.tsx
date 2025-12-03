'use client';

/**
 * App Providers
 * 
 * Wraps the application with necessary context providers.
 * Currently provides NextAuth SessionProvider for authentication.
 */

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}

