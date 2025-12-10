'use client';

import React from 'react';

interface DevLogsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  regionId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * DevLogsPanel - Development logs panel for debugging and monitoring.
 * 
 * This component displays development logs and debugging information
 * for SuperAdmin users.
 */
export default function DevLogsPanel({
  isOpen,
  onClose,
  regionId,
  startDate,
  endDate,
}: DevLogsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Development Logs</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            {/* Context Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Context</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Region:</span>{' '}
                  <span className="font-mono">{regionId || 'None'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date Range:</span>{' '}
                  <span className="font-mono">
                    {startDate && endDate ? `${startDate} to ${endDate}` : 'Not set'}
                  </span>
                </div>
              </div>
            </div>

            {/* Placeholder for logs */}
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400">
              <p className="text-gray-500"># Development logs will appear here</p>
              <p className="text-gray-500"># This panel is for SuperAdmin debugging</p>
              <p className="mt-2">$ Ready for log output...</p>
            </div>

            {/* Info */}
            <div className="text-sm text-gray-500">
              <p>
                This panel displays development logs and debugging information.
                It is only visible to SuperAdmin users.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

