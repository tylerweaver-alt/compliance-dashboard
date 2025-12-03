'use client';

import { useState, useEffect, useMemo } from 'react';
import ParishSettingsModal from './ParishSettingsModal';

interface Parish {
  key: string;
  id: number;
  name: string;
  icon?: string;
}

// Region parish from API response
interface RegionParish {
  id: number;
  name: string;
  is_contracted?: boolean;
  logo_url?: string | null;
}

interface ParishSettingsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  regionId?: string | number;
  regionName?: string;
  regionParishes?: RegionParish[]; // Parishes already loaded from region data
}

export default function ParishSettingsManager({
  isOpen,
  onClose,
  regionId,
  regionName,
  regionParishes = []
}: ParishSettingsManagerProps) {
  const [selectedParish, setSelectedParish] = useState<Parish | null>(null);

  // Convert region parishes to our format
  const parishes = useMemo(() => {
    return regionParishes
      .filter(p => p.is_contracted !== false) // Only show contracted parishes
      .map(p => ({
        key: p.name.toLowerCase().replace(/\s+/g, '_'),
        id: p.id,
        name: p.name,
        icon: p.logo_url || undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [regionParishes]);

  // Select first parish when parishes change or modal opens
  useEffect(() => {
    if (isOpen && parishes.length > 0 && !selectedParish) {
      setSelectedParish(parishes[0]);
    }
  }, [isOpen, parishes, selectedParish]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedParish(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-6xl h-[85vh] flex overflow-hidden">
        {/* Left sidebar - Parish List */}
        <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">
              {regionName || 'Region'} Parishes
            </h2>
            <p className="text-xs text-slate-500 mt-1">Select a parish to configure</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {parishes.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No contracted parishes found.
              </div>
            ) : (
              parishes.map((parish) => (
                <button
                  key={parish.key}
                  onClick={() => setSelectedParish(parish)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors flex items-center gap-3 ${
                    selectedParish?.key === parish.key
                      ? 'bg-[#004437] text-white'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {parish.icon && (
                    <img
                      src={parish.icon}
                      alt={parish.name}
                      className="w-8 h-8 object-contain"
                    />
                  )}
                  <span className="font-medium">{parish.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right side - Settings Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <h2 className="text-xl font-bold text-slate-800">
              {selectedParish ? `${selectedParish.name} Parish Settings` : 'Select a Parish'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Embedded Parish Settings Content */}
          <div className="flex-1 overflow-hidden">
            {selectedParish ? (
              <ParishSettingsModal
                parishId={selectedParish.id}
                parishName={selectedParish.name}
                isOpen={true}
                onClose={() => {}} // We handle close at the manager level
                embedded={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                Select a parish from the list
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

