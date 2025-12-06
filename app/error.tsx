'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-8 py-6 rounded-lg max-w-lg">
          <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
          <p className="text-sm mb-4 opacity-80">
            {error.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={reset}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Try Again
            </button>
            <a
              href="/AcadianDashboard"
              className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

