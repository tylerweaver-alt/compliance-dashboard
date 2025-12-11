'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ParishSettingsManager from '../components/ParishSettingsManager';
import AdminSettingsModal from '../components/AdminSettingsModal';
import AcadianIntelligenceButton from '../components/AcadianIntelligenceButton';
import {
  loadDateRange,
  saveDateRange,
  clearDateRange,
  getDefaultDateRange,
} from '@/lib/dates/dateRange';

const ADMIN_ROLES = ['OM', 'Director', 'VP', 'Admin'];
const HEATMAP_SETTINGS_ROLES = ['OS', 'OM', 'Director', 'VP', 'Admin'];

const ACADIAN_LOGO_URL = '/Images/Acadian_no_background.png';

// ===================== LOGIN SCREEN =====================
// Same visual design, but now uses Google OAuth via NextAuth
function LoginScreen() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError('');
    try {
      // signIn will redirect to Google, then back to our callback
      await signIn('google', { callbackUrl: '/AcadianDashboard' });
    } catch (err) {
      setError('Failed to initiate sign-in. Please try again.');
      setIsSigningIn(false);
    }
  };

  // Check for error in URL (NextAuth redirects here on auth errors)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
      if (errorParam === 'AccessDenied') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError('Access denied. Only @acadian.com users in the system may sign in.');
      } else if (errorParam === 'OAuthSignin') {
        setError('Failed to connect to Google. Please check configuration or try again.');
      } else {
        setError('Sign-in failed. Please try again or contact support.');
      }
      // Clear the error from URL so it doesn't persist on refresh
      window.history.replaceState({}, '', '/AcadianDashboard');
    }
  }, []);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img src={ACADIAN_LOGO_URL} alt="Acadian Ambulance" />
          </div>
          <h1 className="login-title">Compliance Dashboard</h1>
        </div>

        <div className="login-form">
          {error && <div className="login-error">{error}</div>}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="login-submit"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: isSigningIn ? 0.7 : 1,
              cursor: isSigningIn ? 'wait' : 'pointer',
            }}
          >
            {isSigningIn ? (
              <>
                <svg
                  className="animate-spin"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Signing in...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#fff"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#fff"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#fff"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#fff"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          <div className="login-footer">
            <p>Use your @acadian.com Google account</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== END LOGIN SCREEN =====================

// Map dashboard keys → real DB parishes.id values
const parishIdMap = {
  allen: 20,
  avoyelles: 7,
  beauregard: 3,
  concordia: 8,
  evangeline: 6,
  rapides: 4,
  sabine: 1,
  grant: 5,
  vernon: 2,
  other: 0, // Special ID for non-contracted areas
};

// Default parish data (empty state before data loads from API)
const defaultParishData = {
  allen: { name: 'Allen', overall: null, totalCalls: 0, areas: [] },
  avoyelles: { name: 'Avoyelles', overall: null, totalCalls: 0, areas: [] },
  beauregard: { name: 'Beauregard', overall: null, totalCalls: 0, areas: [] },
  concordia: { name: 'Concordia', overall: null, totalCalls: 0, areas: [] },
  evangeline: { name: 'Evangeline', overall: null, totalCalls: 0, areas: [] },
  rapides: { name: 'Rapides', overall: null, totalCalls: 0, areas: [] },
  sabine: { name: 'Sabine', overall: null, totalCalls: 0, areas: [] },
  grant: { name: 'Grant', overall: null, totalCalls: 0, areas: [] },
  vernon: { name: 'Vernon', overall: null, totalCalls: 0, areas: [] },
  other: { name: 'Other', overall: null, totalCalls: 0, areas: [] },
};

// UPDATED ICON PATHS (JS version – no types)
const parishIcons = {
  allen: '/Images/New_Allen_NO_Background.png',
  avoyelles: '/Images/New_Avoyelles_NO_Background.png',
  beauregard: '/Images/New_Beauregard_NO_Background.png',
  concordia: '/Images/New_Concordia_NO_Background.png',
  evangeline: '/Images/New_Evangeline_NO_Background.png',
  rapides: '/Images/New_Rapides_NO_Background.png',
  sabine: '/Images/New_Sabine_NO_Background.png',
  grant: '/Images/New_Grant_NO_Background.png',
  vernon: '/Images/New_Vernon_NO_Background.png',
  other: null, // No icon for "Other" - will use a generic icon
};

// Available regions for dropdown
// areaType: 'Parish' for Louisiana, 'County' for TX/TN/MS, etc.
const REGIONS = [
  {
    id: 'cenla',
    name: 'Central Louisiana (CENLA)',
    areaType: 'Parish',
    areaTypePlural: 'Parishes',
  },
  { id: 'swla', name: 'Southwest LA', areaType: 'Parish', areaTypePlural: 'Parishes' },
  { id: 'capital', name: 'Capital Region', areaType: 'Parish', areaTypePlural: 'Parishes' },
  { id: 'bayou', name: 'Bayou Region', areaType: 'Parish', areaTypePlural: 'Parishes' },
  { id: 'hubcity', name: 'Hub City', areaType: 'Parish', areaTypePlural: 'Parishes' },
  { id: 'northshore', name: 'Northshore', areaType: 'Parish', areaTypePlural: 'Parishes' },
  { id: 'texas', name: 'Texas Region', areaType: 'County', areaTypePlural: 'Counties' },
  { id: 'tennessee', name: 'Tennessee Region', areaType: 'County', areaTypePlural: 'Counties' },
  { id: 'mississippi', name: 'Mississippi Region', areaType: 'County', areaTypePlural: 'Counties' },
];

// ===================== UPLOAD COMPLIANCE MODAL =====================
function UploadComplianceModal({ isOpen, onClose, regionId, regionName }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [testResult, setTestResult] = useState(null); // Results from test mode
  const [uploadProgress, setUploadProgress] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setUploadStatus({ type: 'error', message: 'Only .CSV files are allowed' });
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setUploadStatus(null);
      setTestResult(null);
    }
  };

  const handleTest = async () => {
    if (!file) {
      setUploadStatus({ type: 'error', message: 'Please select a file first' });
      return;
    }
    if (!regionId) {
      setUploadStatus({ type: 'error', message: 'No region selected' });
      return;
    }

    setUploading(true);
    setUploadStatus(null);
    setTestResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('testMode', 'true');
      formData.append('regionId', regionId.toString());

      const response = await fetch('/api/upload-compliance', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setTestResult(result);
        setUploadStatus({
          type: 'info',
          message: result.message,
        });
      } else {
        setUploadStatus({ type: 'error', message: result.error || 'Test failed' });
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus({ type: 'error', message: 'Please select a file first' });
      return;
    }
    if (!regionId) {
      setUploadStatus({ type: 'error', message: 'No region selected' });
      return;
    }

    setUploading(true);
    setUploadStatus(null);
    setUploadProgress(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('regionId', regionId.toString());

      const response = await fetch('/api/upload-compliance', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus({
          type: 'success',
          message: `Successfully processed ${result.processed} calls for ${regionName}`,
        });
        setUploadProgress({
          total: result.total,
          processed: result.processed,
          skipped: result.skipped || 0,
          errors: result.errors || 0,
        });
        setTestResult(null);
        setFile(null);
        const fileInput = document.getElementById('compliance-file-input');
        if (fileInput) fileInput.value = '';
      } else {
        setUploadStatus({ type: 'error', message: result.error || 'Upload failed' });
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setFile(null);
      setUploadStatus(null);
      setTestResult(null);
      setUploadProgress(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Upload Compliance File</h2>
              <p className="text-sm text-slate-500">
                Uploading to: <span className="font-medium text-[#004437]">{regionName}</span>
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={uploading}
              className="p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <svg
                className="w-6 h-6 text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {/* Instructions */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
              <div className="flex gap-3">
                <svg
                  className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">
                    Export Calls from MicroStrategy for the ENTIRE region, set export to CSV ONLY,
                    any other file format will not work.
                  </p>
                </div>
              </div>
            </div>

            {/* File Upload Area */}
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-[#004437] transition-colors">
              <input
                id="compliance-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />
              <label htmlFor="compliance-file-input" className="cursor-pointer">
                <svg
                  className="w-12 h-12 text-slate-400 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-[#004437]">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Click to choose a different file</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-slate-700">Click to select a CSV file</p>
                    <p className="text-xs text-slate-500 mt-1">Only .CSV files are accepted</p>
                  </div>
                )}
              </label>
            </div>

            {/* Status Messages */}
            {uploadStatus && (
              <div
                className={`mt-4 p-3 rounded-lg ${
                  uploadStatus.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2 text-sm">
                  {uploadStatus.type === 'success' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {uploadStatus.type === 'error' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                  {uploadStatus.type === 'info' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                  {uploadStatus.message}
                </div>
              </div>
            )}

            {/* Test Results */}
            {testResult && (
              <div className="mt-4 space-y-3">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <h4 className="font-medium text-slate-900 mb-2">Analysis Summary</h4>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <p className="text-slate-500">Total Rows</p>
                      <p className="font-semibold text-slate-900">{testResult.total}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Would Insert</p>
                      <p className="font-semibold text-green-600">{testResult.wouldProcess}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Would Skip</p>
                      <p className="font-semibold text-amber-600">{testResult.wouldSkip}</p>
                    </div>
                  </div>
                </div>

                {/* Parish Breakdown */}
                {testResult.parishBreakdown &&
                  Object.keys(testResult.parishBreakdown).length > 0 && (
                    <div className="p-3 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-green-900 mb-2">Calls by Parish</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm max-h-32 overflow-y-auto">
                        {Object.entries(testResult.parishBreakdown).map(([parish, count]) => (
                          <div key={parish} className="flex justify-between">
                            <span className="text-green-700">{parish}</span>
                            <span className="font-medium text-green-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Unknown Response Areas - going to "Other" */}
                {testResult.unknownResponseAreas &&
                  Object.keys(testResult.unknownResponseAreas).length > 0 && (
                    <div className="p-3 bg-slate-100 rounded-lg">
                      <h4 className="font-medium text-slate-700 mb-2">
                        Response Areas → &quot;Other&quot; tile
                      </h4>
                      <div className="text-sm max-h-32 overflow-y-auto space-y-1">
                        {Object.entries(testResult.unknownResponseAreas).map(([area, count]) => (
                          <div key={area} className="flex justify-between">
                            <span className="text-slate-600 truncate">{area || '(empty)'}</span>
                            <span className="font-medium text-slate-800">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Sample Rows */}
                {testResult.sampleRows && testResult.sampleRows.length > 0 && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <h4 className="font-medium text-slate-900 mb-2">Sample Rows (first 5)</h4>
                    <div className="text-xs space-y-1 max-h-24 overflow-y-auto">
                      {testResult.sampleRows.map((row, i) => (
                        <div key={i} className="flex gap-2 text-slate-600">
                          <span className="font-mono">{row.responseNumber}</span>
                          <span>→</span>
                          <span className="font-medium text-slate-800">{row.parish}</span>
                          <span className="text-slate-400">|</span>
                          <span>Time: {row.complianceTime}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <div className="grid grid-cols-4 gap-4 text-center text-sm">
                  <div>
                    <p className="text-slate-500">Total</p>
                    <p className="font-semibold text-slate-900">{uploadProgress.total}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Inserted</p>
                    <p className="font-semibold text-green-600">{uploadProgress.processed}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Skipped</p>
                    <p className="font-semibold text-amber-600">{uploadProgress.skipped}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Errors</p>
                    <p className="font-semibold text-red-600">{uploadProgress.errors}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <button
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleTest}
              disabled={!file || uploading}
              className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Test First
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-[#004437] rounded-lg hover:bg-[#003329] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Upload & Insert
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Dashboard({ user, onLogout }) {
  const router = useRouter();
  const [selectedParish, setSelectedParish] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [showParishSettings, setShowParishSettings] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);

  // Check if current user has admin privileges
  const isAdmin = user?.is_admin === true || (user?.role && ADMIN_ROLES.includes(user.role));
  const canAccessHeatmapSettings = user?.role && HEATMAP_SETTINGS_ROLES.includes(user.role);

  // =========================================================================
  // REGION DATA FROM DATABASE
  // =========================================================================
  const [regions, setRegions] = useState([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState(null);

  // =========================================================================
  // CADALYTIX SCORE STATE
  // =========================================================================
  const [cadalytixScore, setCadalytixScore] = useState(null);
  const [cadalytixLoading, setCadalytixLoading] = useState(false);

  // Load regions from database on mount
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const res = await fetch('/api/regions');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setRegions(data);
          // Set initial region (first one user has access to)
          const userAllowedRegions = user?.allowed_regions || [];
          const userHasAllRegions = user?.has_all_regions || false;
          const userIsAdmin = user?.is_admin || false;

          const accessible =
            userHasAllRegions || userIsAdmin
              ? data
              : data.filter((r) => userAllowedRegions.includes(r.name));

          if (accessible.length > 0) {
            setSelectedRegion(accessible[0]);
          } else if (data.length > 0) {
            setSelectedRegion(data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch regions:', err);
      } finally {
        setRegionsLoading(false);
      }
    };
    fetchRegions();
  }, [user]);

  // =========================================================================
  // CADALYTIX SCORE FETCHING
  // =========================================================================
  useEffect(() => {
    if (!selectedRegion?.id) {
      setCadalytixScore(null);
      return;
    }

    const fetchCadalytixScore = async () => {
      setCadalytixLoading(true);
      try {
        const res = await fetch(`/api/cadalytix/regions/${selectedRegion.id}`);
        if (res.ok) {
          const data = await res.json();
          setCadalytixScore(data);
        } else {
          console.warn('Failed to fetch CADalytix score');
          setCadalytixScore(null);
        }
      } catch (err) {
        console.error('Error fetching CADalytix score:', err);
        setCadalytixScore(null);
      } finally {
        setCadalytixLoading(false);
      }
    };

    fetchCadalytixScore();
  }, [selectedRegion?.id]);

  // =========================================================================
  // REGION ACCESS CONTROL (from NextAuth session)
  // =========================================================================
  const userAllowedRegions = user?.allowed_regions || [];
  const userHasAllRegions = user?.has_all_regions || false;
  const userIsAdmin = user?.is_admin || false;

  // Filter regions to only those the user can access
  const accessibleRegions =
    userHasAllRegions || userIsAdmin
      ? regions
      : regions.filter((r) => userAllowedRegions.includes(r.name));

  // Can the user switch regions? (has access to more than one)
  const canSwitchRegions = accessibleRegions.length > 1;

  // Helper: Get previous month date range (kept for backward compatibility)
  const getPreviousMonthRange = () => {
    const defaultRange = getDefaultDateRange();
    const date = new Date(defaultRange.startDate + 'T00:00:00');
    return {
      start: defaultRange.startDate,
      end: defaultRange.endDate,
      monthName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  };

  // Date range state - initialized from sessionStorage or defaults to previous month
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateSource, setDateSource] = useState('default'); // 'user' or 'default'

  // Initialize date range from sessionStorage on mount
  useEffect(() => {
    const stored = loadDateRange();
    setStartDate(stored.startDate);
    setEndDate(stored.endDate);
    setDateSource(stored.source);
  }, []);

  // Save date range to sessionStorage when user changes it
  const handleStartDateChange = useCallback(
    (newDate) => {
      setStartDate(newDate);
      setDateSource('user');
      saveDateRange({ startDate: newDate, endDate });
    },
    [endDate]
  );

  const handleEndDateChange = useCallback(
    (newDate) => {
      setEndDate(newDate);
      setDateSource('user');
      saveDateRange({ startDate, endDate: newDate });
    },
    [startDate]
  );

  // Track the display month name for empty state messaging
  const [displayMonthName, setDisplayMonthName] = useState(() => getPreviousMonthRange().monthName);

  // Parish data from API
  const [parishData, setParishData] = useState(defaultParishData);
  const [loading, setLoading] = useState(true);

  // Track if region has no data for the selected date range
  const [hasNoData, setHasNoData] = useState(false);

  // Last updated info (will be set when data is loaded from API)
  const [lastUpdated, setLastUpdated] = useState({
    date: '-',
    time: '-',
    user: 'No data uploaded yet',
  });

  // Live clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live clock effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update display month name when dates change
  useEffect(() => {
    if (startDate) {
      const date = new Date(startDate + 'T00:00:00');
      setDisplayMonthName(date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
    }
  }, [startDate]);

  // Track if this is the initial load (for auto-detecting date range)
  const [initialLoad, setInitialLoad] = useState(true);

  // Refresh counter - increment to trigger a re-fetch
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Callback to refresh dashboard data (passed to AdminSettingsModal)
  const handleRefreshDashboard = () => {
    setRefreshCounter((prev) => prev + 1);
  };

  // Re-fetch dashboard stats when user returns to this tab/window
  // This ensures exclusions applied on the calls page are reflected in the tiles
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setRefreshCounter((prev) => prev + 1);
      }
    };

    const handleFocus = () => {
      setRefreshCounter((prev) => prev + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Fetch dashboard stats when dates or region changes
  useEffect(() => {
    // Don't fetch until we have a region selected
    if (!selectedRegion?.id) return;

    const fetchStats = async () => {
      setLoading(true);
      setHasNoData(false);
      try {
        const params = new URLSearchParams();
        params.set('regionId', selectedRegion.id.toString());

        // Always use selected dates (defaulted to previous month)
        if (startDate) params.set('start', startDate);
        if (endDate) params.set('end', endDate);

        const response = await fetch(`/api/dashboard-stats?${params.toString()}`);
        const data = await response.json();

        if (data.ok && data.stats) {
          // Use stats directly from API (dynamic parishes)
          setParishData(data.stats);

          // Update last updated info
          if (data.lastUpdated) {
            setLastUpdated(data.lastUpdated);
          }

          // Check if all parishes have 0 total calls (no data for this region/date range)
          const totalCalls = Object.values(data.stats).reduce(
            (sum, p) => sum + (p.totalCalls || 0),
            0
          );
          setHasNoData(totalCalls === 0);

          // Mark initial load complete
          if (initialLoad) {
            setInitialLoad(false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
        setHasNoData(true);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [startDate, endDate, initialLoad, selectedRegion?.id, refreshCounter]);

  // Get parish keys from the current data (dynamic based on region)
  // Sort contracted parishes first, then "other" last
  const parishes = Object.keys(parishData).sort((a, b) => {
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    return a.localeCompare(b);
  });

  const handleParishClick = (parishKey) => {
    setSelectedParish((prev) => (prev === parishKey ? null : parishKey));
  };

  const handleViewAllCalls = (parishKey) => {
    // Get parish ID from the stats data (dynamic from API)
    const parishId = parishData[parishKey]?.id || parishIdMap[parishKey] || 0;
    // Pass date range to calls page so it syncs with dashboard selection
    const params = new URLSearchParams();
    params.set('parish_id', parishId.toString());
    if (selectedRegion?.id) params.set('region_id', selectedRegion.id.toString());
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    window.location.href = `/calls?${params.toString()}`;
  };

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    setRegionMenuOpen(false);
    // For now just switches the label - full implementation later
  };

  return (
    <div className="h-screen bg-[#f5f5f5] flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="w-full bg-white border-b border-slate-200 flex-shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img
              src={ACADIAN_LOGO_URL}
              alt="Acadian Ambulance"
              className="h-28 w-auto object-contain"
            />
            <div className="h-16 w-px bg-slate-300" /> {/* Vertical divider */}
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-[#004437] tracking-wide">
                Compliance Dashboard
              </span>
              <span className="text-sm text-slate-500">
                Welcome,{' '}
                <span className="font-medium text-slate-700">{user?.displayName || 'User'}</span>
              </span>
            </div>
            <div className="h-16 w-px bg-slate-300" /> {/* Vertical divider */}
            <AcadianIntelligenceButton />
          </div>

          {/* User Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#004437] text-white hover:bg-[#003329] transition-colors"
            >
              <span>{user?.displayName || 'User'}</span>
              <svg
                className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                <button
                  onClick={() => {
                    setShowUploadModal(true);
                    setUserMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Update Compliance
                </button>
                <button
                  onClick={() => {
                    setShowParishSettings(true);
                    setUserMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Parish Settings
                </button>
                {isAdmin && (
                  <>
                    <div className="my-1 h-px bg-slate-100" />
                    <button
                      onClick={() => {
                        setShowAdminSettings(true);
                        setUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                        />
                      </svg>
                      Admin Settings
                    </button>
                  </>
                )}

                {/* TODO (CADalytix): For VP+ roles, add a "CADalytix Scores" global view here.
                    This will show an analytics-heavy table of all regions and their CADalytix
                    scores, with the ability to click each region to open its detailed
                    CADalytix breakdown page.

                    Implementation notes:
                    - Check user.role includes 'VP', 'Director', or 'Admin'
                    - Button should link to /cadalytix (global view page to be created)
                    - The global view should display all regions in a sortable table
                    - Columns: Region Name, Overall Score, Tier, Worst Category, Last Updated
                    - Clicking a row navigates to /cadalytix/[regionId]
                */}
                {canAccessHeatmapSettings && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      const params = new URLSearchParams();
                      if (selectedRegion?.id) params.set('regionId', selectedRegion.id.toString());
                      router.push(`/heatmap-settings?${params.toString()}`);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                      />
                    </svg>
                    Heatmap Settings
                  </button>
                )}
                <hr className="my-1 border-slate-200" />
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* TOP ROW: Region dropdown + Date Range + Last Updated */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            {/* REGION DROPDOWN */}
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-slate-900">Your Region:</span>
              <div className="relative">
                {/* Show loading state while regions are being fetched */}
                {regionsLoading || !selectedRegion ? (
                  <span className="text-xl font-semibold text-slate-400">Loading...</span>
                ) : canSwitchRegions ? (
                  <button
                    onClick={() => setRegionMenuOpen(!regionMenuOpen)}
                    className="flex items-center gap-2 text-xl font-semibold text-[#004437] hover:text-[#003329] transition-colors"
                  >
                    {selectedRegion.name}
                    <svg
                      className={`w-5 h-5 transition-transform ${regionMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                ) : (
                  // If user has only one region, just show the name (no dropdown)
                  <span className="text-xl font-semibold text-[#004437]">
                    {selectedRegion.name}
                  </span>
                )}

                {regionMenuOpen && canSwitchRegions && selectedRegion && (
                  <div className="absolute left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                    {accessibleRegions.map((region) => (
                      <button
                        key={region.id}
                        onClick={() => handleRegionSelect(region)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 flex items-center justify-between ${
                          selectedRegion.id === region.id
                            ? 'text-[#004437] font-medium bg-emerald-50'
                            : 'text-slate-700'
                        }`}
                      >
                        {region.name}
                        {selectedRegion.id === region.id && (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* DATE RANGE SELECTOR */}
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
              <svg
                className="w-5 h-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm text-slate-600">Date Range:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#004437] focus:border-transparent"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#004437] focus:border-transparent"
              />
            </div>

            {/* LAST UPDATED INFO */}
            <div className="text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-lg">
              <span className="text-slate-400">Last Updated:</span>{' '}
              <span className="text-slate-600 font-medium">
                {lastUpdated.date} {lastUpdated.time}
              </span>
              <span className="text-slate-400 ml-1">by</span>{' '}
              <span className="text-slate-600 font-medium">{lastUpdated.user}</span>
            </div>

            {/* CADALYTIX SCORE BADGE */}
            {selectedRegion?.id && (
              <button
                onClick={() => router.push(`/cadalytix/${selectedRegion.id}`)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg border shadow-sm
                  transition-all hover:scale-105 cursor-pointer
                  ${
                    cadalytixLoading
                      ? 'bg-slate-100 border-slate-200'
                      : cadalytixScore?.tier === 'Platinum'
                        ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-300'
                        : cadalytixScore?.tier === 'Green'
                          ? 'bg-emerald-50 border-emerald-300'
                          : cadalytixScore?.tier === 'Yellow'
                            ? 'bg-amber-50 border-amber-300'
                            : cadalytixScore?.tier === 'Red'
                              ? 'bg-red-50 border-red-300'
                              : 'bg-slate-100 border-slate-200'
                  }
                `}
                title="Click to view full CADalytix breakdown for this region"
              >
                <svg
                  className="w-4 h-4 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span className="text-sm font-medium text-slate-600">CADalytix Score:</span>
                {cadalytixLoading ? (
                  <span className="text-sm text-slate-400">Loading...</span>
                ) : cadalytixScore ? (
                  <>
                    <span
                      className={`text-lg font-bold font-mono ${
                        cadalytixScore.tier === 'Platinum'
                          ? 'text-cyan-600'
                          : cadalytixScore.tier === 'Green'
                            ? 'text-emerald-600'
                            : cadalytixScore.tier === 'Yellow'
                              ? 'text-amber-600'
                              : 'text-red-600'
                      }`}
                    >
                      {cadalytixScore.overallScore}
                    </span>
                    <span
                      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        cadalytixScore.tier === 'Platinum'
                          ? 'bg-cyan-100 text-cyan-700'
                          : cadalytixScore.tier === 'Green'
                            ? 'bg-emerald-100 text-emerald-700'
                            : cadalytixScore.tier === 'Yellow'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {cadalytixScore.tier}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-slate-400">--</span>
                )}
              </button>
            )}
          </div>

          {/* NO DATA EMPTY STATE */}
          {!loading && hasNoData && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="max-w-md mx-auto">
                <svg
                  className="w-16 h-16 mx-auto text-slate-300 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No Data Uploaded Yet</h3>
                <p className="text-sm text-slate-500 mb-6">
                  There is no compliance data for{' '}
                  <span className="font-medium">{selectedRegion?.name || 'this region'}</span> in{' '}
                  <span className="font-medium">{displayMonthName}</span>.
                </p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#004437] text-white font-medium rounded-lg hover:bg-[#003328] transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  Upload {displayMonthName} Compliance
                </button>
              </div>
            </div>
          )}

          {/* GRID - Compact layout for no scrolling */}
          {!hasNoData && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {parishes.map((key) => {
                const parish = parishData[key];
                const isExpanded = selectedParish === key;
                const isOther = key === 'other';
                // Use place_type from region (from DB), fallback to 'Parish'
                const areaType = selectedRegion?.place_type || 'Parish';
                const areaTypePlural =
                  areaType === 'Parish'
                    ? 'Parishes'
                    : areaType === 'County'
                      ? 'Counties'
                      : `${areaType}s`;
                const hasData = parish?.totalCalls > 0;

                // Find the parish info from the region's parishes list (for logo_url)
                const regionParish = selectedRegion?.parishes?.find(
                  (p) =>
                    p.name.toLowerCase().replace(/\s+/g, '_') === key ||
                    p.name.toLowerCase() === key
                );
                // Use logo_url from DB, fallback to hardcoded icons
                const iconUrl = regionParish?.logo_url || parishIcons[key] || null;

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleParishClick(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleParishClick(key);
                      }
                    }}
                    className={[
                      'group text-left bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer',
                      'transition-all duration-150 ease-out px-3 py-2 relative',
                      'hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02]',
                      isExpanded ? 'border-[#b8860b] shadow-lg z-50' : 'hover:border-[#b8860b]',
                      isOther ? 'bg-slate-50' : '',
                    ].join(' ')}
                  >
                    {/* ICON + NAME */}
                    <div className="flex flex-col items-center justify-center mb-1">
                      {isOther || !iconUrl ? (
                        // Generic icon for "Other" tile or parishes without icons
                        <div className="w-10 h-10 flex items-center justify-center mb-1 bg-slate-200 rounded-lg">
                          <svg
                            className="w-6 h-6 text-slate-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                      ) : (
                        <img
                          src={iconUrl}
                          alt={parish?.name || key}
                          className="w-10 h-10 object-contain mb-1"
                        />
                      )}
                      <span className="text-xs font-medium text-slate-900 text-center">
                        {isOther ? `Other ${areaTypePlural}` : `${parish?.name || key} ${areaType}`}
                      </span>
                    </div>

                    {/* Compliance + Total calls with status indicator */}
                    <div className="flex flex-col items-center justify-center">
                      {loading ? (
                        <span className="text-xl font-semibold text-slate-300">...</span>
                      ) : isOther ? (
                        <span className="text-xl font-semibold text-slate-400">N/A</span>
                      ) : hasData ? (
                        <>
                          {/* Compliance with status dot */}
                          {parish.overall !== null && parish.overall !== undefined && (
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    parish.overall >= (parish.targetCompliancePercent || 90)
                                      ? '#22c55e' // green
                                      : parish.overall >= (parish.targetCompliancePercent || 90) - 5
                                        ? '#f59e0b' // amber
                                        : '#ef4444', // red
                                }}
                              />
                              <span className="text-lg font-bold text-slate-900">
                                {parish.overall}%
                              </span>
                            </div>
                          )}
                          <span className="text-xs text-slate-500">{parish.totalCalls} calls</span>
                          {parish.targetCompliancePercent && parish.overall !== null && (
                            <span className="text-[10px] text-slate-400">
                              Target: {parish.targetCompliancePercent}%
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm font-medium text-slate-400">No Data</span>
                      )}
                    </div>

                    {/* EXPANDED DETAIL - Regular parishes (absolute overlay) */}
                    {isExpanded && !isOther && (
                      <div
                        className="absolute left-0 right-0 top-full bg-white border border-t-0 border-slate-200 rounded-b-xl shadow-lg px-3 py-2"
                        style={{ zIndex: 50 }}
                      >
                        <div className="space-y-0.5">
                          {parish.areas.map((area, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-xs text-slate-800"
                            >
                              <span className="truncate mr-1">{area.name}</span>
                              <span className="font-semibold">{area.compliance}%</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const parishId = parishData[key]?.id || parishIdMap[key] || 0;
                              const params = new URLSearchParams();
                              params.set('parishId', parishId.toString());
                              if (selectedRegion?.id)
                                params.set('regionId', selectedRegion.id.toString());
                              if (startDate) params.set('start', startDate);
                              if (endDate) params.set('end', endDate);
                              window.location.href = `/stats/parish?${params.toString()}`;
                            }}
                            className="rounded bg-slate-600 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
                          >
                            Statistics
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewAllCalls(key);
                            }}
                            className="rounded bg-[#004437] px-2 py-1 text-xs font-medium text-white hover:bg-[#043527]"
                          >
                            View All Calls
                          </button>
                        </div>
                      </div>
                    )}

                    {/* EXPANDED DETAIL - "Other" tile (absolute overlay) */}
                    {isExpanded && isOther && (
                      <div
                        className="absolute left-0 right-0 top-full bg-white border border-t-0 border-slate-200 rounded-b-xl shadow-lg px-3 py-2"
                        style={{ zIndex: 50 }}
                      >
                        <p className="text-xs text-slate-500 text-center mb-2">
                          Calls from non-contracted areas
                        </p>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewAllCalls(key);
                            }}
                            className="rounded bg-slate-500 px-2 py-1 text-xs font-medium text-white hover:bg-slate-600"
                          >
                            View All Calls
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* BOTTOM BUTTONS - Heatmap + Regional Statistics */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            {/* Heatmap Button */}
            <button
              type="button"
              onClick={() => {
                const regionCode =
                  selectedRegion?.name?.toUpperCase().replace(/\s+/g, '') || 'CENLA';
                const shortCode =
                  regionCode === 'CENTRALLOUISIANA'
                    ? 'CENLA'
                    : regionCode === 'SOUTHWESTLA'
                      ? 'SWLA'
                      : regionCode;
                window.location.href = `/heatmap?region=${shortCode}`;
              }}
              className="group text-left bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer transition-all duration-150 ease-out px-4 py-4 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[#004437] flex items-center gap-4"
            >
              {/* Heatmap Icon */}
              <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-slate-900">
                <img
                  src="/Images/heatmap-tile.png"
                  alt="Heatmap"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-full h-full hidden items-center justify-center bg-gradient-to-br from-red-500 via-yellow-500 to-green-500">
                  <svg
                    className="w-7 h-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                </div>
              </div>

              {/* Title and Description */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-[#004437]">
                  HEATMAP
                </h3>
                <p className="text-xs text-slate-500 truncate">Call density & optimized posting</p>
              </div>

              {/* Arrow */}
              <svg
                className="w-5 h-5 text-slate-400 group-hover:text-[#004437] group-hover:translate-x-1 transition-transform flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* Regional Statistics Button */}
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (selectedRegion?.id) params.set('regionId', selectedRegion.id.toString());
                if (startDate) params.set('start', startDate);
                if (endDate) params.set('end', endDate);
                window.location.href = `/stats/region?${params.toString()}`;
              }}
              className="group text-left bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer transition-all duration-150 ease-out px-4 py-4 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.01] hover:border-slate-600 flex items-center gap-4"
            >
              {/* Statistics Icon */}
              <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>

              {/* Title and Description */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-slate-700">
                  REGIONAL STATISTICS
                </h3>
                <p className="text-xs text-slate-500 truncate">Operational metrics & analytics</p>
              </div>

              {/* Arrow */}
              <svg
                className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-transform flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </main>

      {/* Click outside to close dropdowns */}
      {(userMenuOpen || regionMenuOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setUserMenuOpen(false);
            setRegionMenuOpen(false);
          }}
        />
      )}

      {/* Upload Compliance Modal */}
      <UploadComplianceModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        regionId={selectedRegion?.id}
        regionName={selectedRegion?.name}
      />

      {/* Parish Settings Manager Modal */}
      <ParishSettingsManager
        isOpen={showParishSettings}
        onClose={() => setShowParishSettings(false)}
        regionId={selectedRegion?.id}
        regionName={selectedRegion?.name}
        regionParishes={selectedRegion?.parishes || []}
      />

      {/* Admin Settings Modal */}
      <AdminSettingsModal
        open={showAdminSettings}
        onClose={() => setShowAdminSettings(false)}
        onRefreshDashboard={handleRefreshDashboard}
      />

      {/* Live Clock - Bottom Right Corner */}
      <div className="fixed bottom-4 right-4 text-sm text-slate-400 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-slate-200">
        {currentTime.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}{' '}
        •{' '}
        {currentTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
    </div>
  );
}

export default function AcadianDashboardPage() {
  // Use NextAuth session instead of local state
  const { data: session, status } = useSession();

  // Handler for logout - uses NextAuth signOut and clears date range
  const handleLogout = () => {
    clearDateRange(); // Clear persisted date range on logout
    signOut({ callbackUrl: '/AcadianDashboard' });
  };

  // Show loading while checking session
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#004437] border-t-transparent rounded-full" />
      </div>
    );
  }

  // If not authenticated, show login screen
  if (!session) {
    return <LoginScreen />;
  }

  // Build user object from session for Dashboard component
  // Uses custom properties from our NextAuth session callback
  const user = {
    displayName:
      session.user?.display_name ||
      session.user?.name ||
      session.user?.email?.split('@')[0] ||
      'User',
    email: session.user?.email,
    photoURL: session.user?.image,
    // Role/region data from session (populated by NextAuth session callback)
    role: session.user?.role,
    allowed_regions: session.user?.allowed_regions || [],
    has_all_regions: session.user?.has_all_regions || false,
    is_admin: session.user?.is_admin || false,
  };

  // Otherwise show dashboard
  return <Dashboard user={user} onLogout={handleLogout} />;
}
