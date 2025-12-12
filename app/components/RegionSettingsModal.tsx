'use client';

import React, { useState, useEffect } from 'react';

interface CoveragePost {
  id: number;
  regionId: string;
  name: string;
  address: string | null;
  intersection: string | null;
  lat: number | null;
  lng: number | null;
  defaultUnits: number;
  coverageLevel: number;
  isActive?: boolean;
}

interface RegionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  regionId: string;
  regionName: string;
  onOpenCoveragePolicy?: () => void;
}
export default function RegionSettingsModal({
  isOpen,
  onClose,
  regionId,
  regionName,
  onOpenCoveragePolicy,
}: RegionSettingsModalProps) {
  const [posts, setPosts] = useState<CoveragePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New post form state
  const [showAddPost, setShowAddPost] = useState(false);
  const [newPostName, setNewPostName] = useState('');
  const [newPostAddress, setNewPostAddress] = useState('');
  const [newPostIntersection, setNewPostIntersection] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  // Fetch posts when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchPosts();
  }, [isOpen, regionId]);

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const postsRes = await fetch(`/api/posts?region_id=${regionId}`);
      const postsData = await postsRes.json();
      if (postsData.ok) setPosts(postsData.posts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Geocode address using OpenRouteService
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
    if (!apiKey) {
      // Fallback: use a simple geocoding approach or return null
      console.warn('No ORS API key for geocoding');
      return null;
    }

    try {
      const res = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=US&size=1`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return { lat, lng };
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
    return null;
  };

  const handleAddPost = async () => {
    if (!newPostName.trim()) {
      setError('Post name is required');
      return;
    }

    setSaving(true);
    setError(null);

    let lat: number | null = null;
    let lng: number | null = null;

    // Try to geocode if address or intersection provided
    const locationText = newPostAddress || newPostIntersection;
    if (locationText) {
      setGeocoding(true);
      const coords = await geocodeAddress(`${locationText}, Louisiana, USA`);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
      setGeocoding(false);
    }

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regionId,
          name: newPostName.trim(),
          address: newPostAddress.trim() || null,
          intersection: newPostIntersection.trim() || null,
          lat,
          lng,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setPosts([...posts, data.post]);
        setShowAddPost(false);
        resetNewPostForm();
      } else {
        setError(data.error || 'Failed to add post');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetNewPostForm = () => {
    setNewPostName('');
    setNewPostAddress('');
    setNewPostIntersection('');
  };

  if (!isOpen) return null;

  const handleDeletePost = async (postId: number) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      if (res.ok) {
        setPosts(posts.filter(p => p.id !== postId));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[2000] p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Region Settings</h2>
            <p className="text-sm text-black">{regionName} ({regionId})</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Post Assignments Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-black">Post Assignments</h3>
              <button
                onClick={() => setShowAddPost(true)}
                className="px-3 py-1.5 bg-[#004437] text-white text-xs font-medium rounded hover:bg-[#003329] transition-colors"
              >
                + Add Post
              </button>
            </div>

            {/* Add Post Form */}
            {showAddPost && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-black">New Post Assignment</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-black mb-1">Post Name *</label>
                    <input
                      type="text"
                      value={newPostName}
                      onChange={(e) => setNewPostName(e.target.value)}
                      placeholder="e.g., Leesville Main Post"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-[#004437] focus:border-transparent placeholder:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-black mb-1">Address</label>
                    <input
                      type="text"
                      value={newPostAddress}
                      onChange={(e) => setNewPostAddress(e.target.value)}
                      placeholder="e.g., 123 Main St, Leesville, LA"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-[#004437] focus:border-transparent placeholder:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-black mb-1">Or Intersection</label>
                    <input
                      type="text"
                      value={newPostIntersection}
                      onChange={(e) => setNewPostIntersection(e.target.value)}
                      placeholder="e.g., Hwy 171 & Entrance Rd"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-[#004437] focus:border-transparent placeholder:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => { setShowAddPost(false); resetNewPostForm(); }}
                    className="px-4 py-2 text-sm text-black hover:text-black"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddPost}
                    disabled={saving || geocoding}
                    className="px-4 py-2 bg-[#004437] text-white text-sm font-medium rounded hover:bg-[#003329] disabled:opacity-50"
                  >
                    {geocoding ? 'Geocoding...' : saving ? 'Saving...' : 'Add Post'}
                  </button>
                </div>
              </div>
            )}

            {/* Posts List */}
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-[#004437] border-t-transparent rounded-full" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-8 text-black text-sm">
                No posts configured for this region yet.
              </div>
            ) : (
              <div className="space-y-2">
                {posts.map(post => (
                  <div key={post.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${post.lat && post.lng ? 'bg-emerald-500' : 'bg-amber-500'}`}
                           title={post.lat && post.lng ? 'Location set' : 'Needs geocoding'} />
                      <div>
                        <p className="text-sm font-medium text-black">{post.name}</p>
                        <p className="text-xs text-black">
                          {post.address || post.intersection || 'No location set'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coverage Policy Link Section */}
          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-black">Coverage Levels & Policy Rules</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Coverage levels and post assignments are managed in the Coverage Policy panel.
                </p>
              </div>
              {onOpenCoveragePolicy && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCoveragePolicy();
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 transition-colors"
                >
                  Open Coverage Policy
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-black hover:text-black">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

