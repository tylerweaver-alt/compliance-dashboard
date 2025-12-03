// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const ADMIN_ROLES = ['OM', 'Director', 'VP', 'Admin'];
const ROLE_OPTIONS = ['PFS', 'OS', 'OM', 'Director', 'VP', 'Admin', 'OC', 'Risk Assessment', 'QICM'];

// Available columns for View All Calls config (same as ParishSettingsModal)
const AVAILABLE_COLUMNS = [
  { id: 'response_number', label: 'Response Number', category: 'Core' },
  { id: 'response_date', label: 'Response Date', category: 'Core' },
  { id: 'radio_name', label: 'Radio Name (Unit)', category: 'Core' },
  { id: 'response_area', label: 'Response Area', category: 'Core' },
  { id: 'priority', label: 'Priority', category: 'Core' },
  { id: 'origin_address', label: 'Origin Address', category: 'Origin' },
  { id: 'origin_location_city', label: 'Origin City', category: 'Origin' },
  { id: 'call_in_que_time', label: 'Received Time', category: 'Timestamps' },
  { id: 'assigned_time', label: 'Dispatched Time', category: 'Timestamps' },
  { id: 'enroute_time', label: 'Enroute Time', category: 'Timestamps' },
  { id: 'staged_time', label: 'Staged Time', category: 'Timestamps' },
  { id: 'arrived_at_scene_time', label: 'Arrived at Scene', category: 'Timestamps' },
  { id: 'depart_scene_time', label: 'Depart Scene', category: 'Timestamps' },
  { id: 'arrived_destination_time', label: 'Arrived Destination', category: 'Timestamps' },
  { id: 'call_cleared_time', label: 'Call Cleared', category: 'Timestamps' },
  { id: 'response', label: 'Response Time (Calculated)', category: 'Custom' },
  { id: 'status', label: 'Compliance Status', category: 'Custom' },
];

const RESPONSE_START_OPTIONS = [
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'received', label: 'Received' },
  { id: 'enroute', label: 'Enroute' },
];

type TabType = 'users' | 'regions' | 'logs';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  role: string;
  is_active: boolean;
  allowed_regions: string[];
  has_all_regions: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface UserRegion {
  id: number;
  name: string;
  display_order: number | null;
}

interface Area {
  id: number;
  name: string;
  place_type: string | null;
  logo_url: string | null;
  is_contracted: boolean;
  use_zones: boolean | null;
}

interface RegionWithAreas {
  id: number;
  name: string;
  display_order: number | null;
  areas: Area[];
}

interface AuditLog {
  id: string;
  timestamp: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: string | null;
  metadata: any;
}

interface AdminSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onRefreshDashboard?: () => void;
}

export default function AdminSettingsModal({ open, onClose, onRefreshDashboard }: AdminSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const { data: session, status } = useSession();

  // Users tab state
  const [users, setUsers] = useState<User[]>([]);
  const [userRegions, setUserRegions] = useState<UserRegion[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersSuccess, setUsersSuccess] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Form fields
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState('PFS');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formHasAllRegions, setFormHasAllRegions] = useState(false);
  const [formAllowedRegions, setFormAllowedRegions] = useState<string[]>([]);

  // Logs tab state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [logsLoaded, setLogsLoaded] = useState(false);

  // Regions & Areas tab state
  const [regionsData, setRegionsData] = useState<RegionWithAreas[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [regionsError, setRegionsError] = useState('');
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);

  // Add Region form
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionOrder, setNewRegionOrder] = useState<string>('');
  const [savingRegion, setSavingRegion] = useState(false);
  const [regionFormError, setRegionFormError] = useState('');

  // Add Area form - Step 1
  const [showAddArea, setShowAddArea] = useState(false);
  const [addAreaStep, setAddAreaStep] = useState<1 | 2>(1);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaPlaceType, setNewAreaPlaceType] = useState<'parish' | 'county' | 'district'>('parish');
  const [newAreaContracted, setNewAreaContracted] = useState(false);
  const [newAreaLogoUrl, setNewAreaLogoUrl] = useState('');
  const [savingArea, setSavingArea] = useState(false);
  const [areaFormError, setAreaFormError] = useState('');
  const [areaFormSuccess, setAreaFormSuccess] = useState('');

  // Add Area form - Step 2 (Config Wizard)
  const [configMode, setConfigMode] = useState<'parish_average' | 'zone_based'>('parish_average');
  const [configThresholdMinutes, setConfigThresholdMinutes] = useState<string>('10');
  const [configTargetAvgMinutes, setConfigTargetAvgMinutes] = useState<string>('8');
  const [configZones, setConfigZones] = useState<{ name: string; minutes: string }[]>([
    { name: 'Urban', minutes: '8' },
    { name: 'Rural', minutes: '15' },
  ]);
  const [configColumns, setConfigColumns] = useState<string[]>([
    'response_date', 'response_number', 'radio_name', 'origin_address',
    'call_in_que_time', 'assigned_time', 'enroute_time', 'arrived_at_scene_time',
    'response', 'status'
  ]);
  const [configResponseStart, setConfigResponseStart] = useState<'dispatched' | 'received' | 'enroute'>('dispatched');

  // Edit Area logo
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [savingLogo, setSavingLogo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Edit Area full (Step 11)
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [editAreaName, setEditAreaName] = useState('');
  const [editAreaPlaceType, setEditAreaPlaceType] = useState<'parish' | 'county' | 'district'>('parish');
  const [editAreaContracted, setEditAreaContracted] = useState(false);
  const [editAreaLogoUrl, setEditAreaLogoUrl] = useState('');
  const [savingAreaEdit, setSavingAreaEdit] = useState(false);
  const [deletingArea, setDeletingArea] = useState(false);
  const [editAreaSuccess, setEditAreaSuccess] = useState('');
  const [editAreaError, setEditAreaError] = useState('');

  // Region User Access (Step 12)
  const [regionUsers, setRegionUsers] = useState<User[]>([]);
  const [regionUsersLoaded, setRegionUsersLoaded] = useState(false);
  const [loadingRegionUsers, setLoadingRegionUsers] = useState(false);
  const [updatingUserAccess, setUpdatingUserAccess] = useState<string | null>(null);
  const [userAccessError, setUserAccessError] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userActiveFilter, setUserActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Region deletion (Step 13)
  const [deletingRegion, setDeletingRegion] = useState(false);
  const [regionDeleteError, setRegionDeleteError] = useState('');

  // Toast notifications (Step 15C)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const sessionUser: any = session?.user;
  const sessionRole = sessionUser?.role;
  const isAdmin = sessionUser?.is_admin === true || (sessionRole && ADMIN_ROLES.includes(sessionRole));

  // Load users when Users tab is active
  useEffect(() => {
    if (open && activeTab === 'users' && isAdmin && !usersLoaded) {
      loadUsersAndRegions();
    }
  }, [open, activeTab, isAdmin, usersLoaded]);

  // Load logs when Logs tab is active
  useEffect(() => {
    if (open && activeTab === 'logs' && isAdmin && !logsLoaded) {
      loadLogs();
    }
  }, [open, activeTab, isAdmin, logsLoaded]);

  // Load regions when Regions & Areas tab is active
  useEffect(() => {
    if (open && activeTab === 'regions' && isAdmin && !regionsLoaded) {
      loadRegionsData();
    }
  }, [open, activeTab, isAdmin, regionsLoaded]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setUsersLoaded(false);
      setLogsLoaded(false);
      setRegionsLoaded(false);
      clearForm();
      setShowAddRegion(false);
      setShowAddArea(false);
    }
  }, [open]);

  const loadUsersAndRegions = async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const [usersRes, regionsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/regions-list'),
      ]);
      if (!usersRes.ok) throw new Error('Failed to load users');
      if (!regionsRes.ok) throw new Error('Failed to load regions');
      const usersData = await usersRes.json();
      const regionsData = await regionsRes.json();
      setUsers(usersData);
      setUserRegions(regionsData);
      setUsersLoaded(true);
    } catch (err: any) {
      setUsersError(err.message || 'Failed to load data');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    setLogsError('');
    try {
      const res = await fetch('/api/admin/logs?limit=100');
      if (!res.ok) throw new Error('Failed to load logs');
      const data = await res.json();
      setLogs(data);
      setLogsLoaded(true);
    } catch (err: any) {
      setLogsError(err.message || 'Failed to load logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadRegionsData = async () => {
    setLoadingRegions(true);
    setRegionsError('');
    try {
      const res = await fetch('/api/admin/regions');
      if (!res.ok) throw new Error('Failed to load regions');
      const data = await res.json();
      setRegionsData(data);
      setRegionsLoaded(true);
      // Select first region if none selected
      if (data.length > 0 && selectedRegionId === null) {
        setSelectedRegionId(data[0].id);
      }
    } catch (err: any) {
      setRegionsError(err.message || 'Failed to load regions');
    } finally {
      setLoadingRegions(false);
    }
  };

  const handleCreateRegion = async () => {
    if (!newRegionName.trim()) {
      setRegionFormError('Region name is required');
      return;
    }
    setSavingRegion(true);
    setRegionFormError('');
    try {
      const res = await fetch('/api/admin/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRegionName.trim(),
          display_order: newRegionOrder ? parseInt(newRegionOrder, 10) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create region');
      }
      const newRegion = await res.json();
      // Refresh regions and select the new one
      await loadRegionsData();
      setSelectedRegionId(newRegion.id);
      setShowAddRegion(false);
      setNewRegionName('');
      setNewRegionOrder('');
    } catch (err: any) {
      setRegionFormError(err.message || 'Failed to create region');
    } finally {
      setSavingRegion(false);
    }
  };

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) {
      setAreaFormError('Area name is required');
      return;
    }
    if (!selectedRegionId) {
      setAreaFormError('No region selected');
      return;
    }
    setSavingArea(true);
    setAreaFormError('');
    setAreaFormSuccess('');
    try {
      // Build config object from wizard step 2
      const config = {
        mode: configMode,
        default_threshold_minutes: parseFloat(configThresholdMinutes) || 10,
        target_average_minutes: parseFloat(configTargetAvgMinutes) || 8,
        zones: configMode === 'zone_based'
          ? configZones.filter(z => z.name.trim()).map(z => ({
              name: z.name.trim(),
              threshold_minutes: parseFloat(z.minutes) || 10,
            }))
          : [],
        view_columns: configColumns,
        response_start_time: configResponseStart,
      };

      const res = await fetch(`/api/admin/regions/${selectedRegionId}/areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAreaName.trim(),
          place_type: newAreaPlaceType,
          is_contracted: newAreaContracted,
          logo_url: newAreaLogoUrl.trim() || null,
          config,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create area');
      }
      // Refresh regions
      await loadRegionsData();
      setAreaFormSuccess(`Area "${newAreaName.trim()}" created successfully!`);
      showToast('success', `Area "${newAreaName.trim()}" created successfully!`);
      // Reset form
      resetAreaWizard();
    } catch (err: any) {
      setAreaFormError(err.message || 'Failed to create area');
      showToast('error', err.message || 'Failed to create area');
    } finally {
      setSavingArea(false);
    }
  };

  const resetAreaWizard = () => {
    setNewAreaName('');
    setNewAreaPlaceType('parish');
    setNewAreaContracted(false);
    setNewAreaLogoUrl('');
    setAddAreaStep(1);
    setConfigMode('parish_average');
    setConfigThresholdMinutes('10');
    setConfigTargetAvgMinutes('8');
    setConfigZones([{ name: 'Urban', minutes: '8' }, { name: 'Rural', minutes: '15' }]);
    setConfigColumns([
      'response_date', 'response_number', 'radio_name', 'origin_address',
      'call_in_que_time', 'assigned_time', 'enroute_time', 'arrived_at_scene_time',
      'response', 'status'
    ]);
    setConfigResponseStart('dispatched');
  };

  const clearAreaForm = () => {
    resetAreaWizard();
    setAreaFormError('');
    setAreaFormSuccess('');
    setShowAddArea(false);
  };

  const handleAddZone = () => {
    setConfigZones([...configZones, { name: '', minutes: '10' }]);
  };

  const handleRemoveZone = (index: number) => {
    setConfigZones(configZones.filter((_, i) => i !== index));
  };

  const handleZoneChange = (index: number, field: 'name' | 'minutes', value: string) => {
    const updated = [...configZones];
    updated[index][field] = value;
    setConfigZones(updated);
  };

  const handleColumnToggle = (columnId: string) => {
    if (configColumns.includes(columnId)) {
      setConfigColumns(configColumns.filter(c => c !== columnId));
    } else {
      setConfigColumns([...configColumns, columnId]);
    }
  };

  const handleToggleContracted = async (areaId: number, currentStatus: boolean) => {
    if (!selectedRegionId) return;

    try {
      const res = await fetch(`/api/admin/regions/${selectedRegionId}/areas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaId,
          is_contracted: !currentStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update area');
      }

      // Refresh regions data to reflect the change
      await loadRegionsData();
    } catch (err: any) {
      console.error('Failed to toggle contracted status:', err);
      setRegionsError(err.message || 'Failed to update area');
    }
  };

  const handleEditLogo = (area: Area) => {
    setEditingAreaId(area.id);
    setEditingAreaName(area.name);
    setEditLogoUrl(area.logo_url || '');
  };

  const handleUploadLogo = async (file: File) => {
    if (!editingAreaId) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parishName', editingAreaName);

      const res = await fetch('/api/admin/upload-logo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to upload logo');
      }

      const data = await res.json();
      setEditLogoUrl(data.url);
    } catch (err: any) {
      console.error('Failed to upload logo:', err);
      setRegionsError(err.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveLogo = async () => {
    if (!selectedRegionId || !editingAreaId) return;

    setSavingLogo(true);
    try {
      const res = await fetch(`/api/admin/regions/${selectedRegionId}/areas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaId: editingAreaId,
          logo_url: editLogoUrl.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update logo');
      }

      // Refresh regions data to reflect the change
      await loadRegionsData();
      setEditingAreaId(null);
      setEditingAreaName('');
      setEditLogoUrl('');
    } catch (err: any) {
      console.error('Failed to save logo:', err);
      setRegionsError(err.message || 'Failed to update logo');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleCancelEditLogo = () => {
    setEditingAreaId(null);
    setEditingAreaName('');
    setEditLogoUrl('');
  };

  const clearForm = () => {
    setSelectedUserId(null);
    setFormEmail('');
    setFormFullName('');
    setFormRole('PFS');
    setFormIsActive(true);
    setFormIsAdmin(false);
    setFormHasAllRegions(false);
    setFormAllowedRegions([]);
    setUsersError('');
    setUsersSuccess('');
  };

  const selectUserForEdit = (u: User) => {
    setSelectedUserId(u.id);
    setFormEmail(u.email);
    setFormFullName(u.full_name || '');
    setFormRole(u.role || 'PFS');
    setFormIsActive(u.is_active);
    setFormIsAdmin(u.is_admin);
    setFormHasAllRegions(u.has_all_regions);
    setFormAllowedRegions(u.allowed_regions || []);
    setUsersError('');
    setUsersSuccess('');
  };

  const handleSaveUser = async () => {
    setLoadingSave(true);
    setUsersError('');
    setUsersSuccess('');

    try {
      if (selectedUserId) {
        // PATCH existing user
        const res = await fetch(`/api/admin/users/${selectedUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: formRole,
            is_active: formIsActive,
            is_admin: formIsAdmin,
            has_all_regions: formHasAllRegions,
            allowed_regions: formAllowedRegions,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || 'Failed to update user');
        }
        setUsersSuccess('User updated successfully');
        showToast('success', 'User updated successfully');
      } else {
        // POST new user
        if (!formEmail || !formEmail.includes('@')) {
          throw new Error('Valid email is required');
        }
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formEmail,
            full_name: formFullName || null,
            display_name: formFullName || null,
            role: formRole,
            is_active: formIsActive,
            is_admin: formIsAdmin,
            has_all_regions: formHasAllRegions,
            allowed_regions: formAllowedRegions,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to create user');
        }
        setUsersSuccess('User created successfully');
        showToast('success', 'User created successfully');
      }
      // Reload users
      const usersRes = await fetch('/api/admin/users');
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
      clearForm();
    } catch (err: any) {
      setUsersError(err.message || 'Failed to save user');
      showToast('error', err.message || 'Failed to save user');
    } finally {
      setLoadingSave(false);
    }
  };

  const toggleRegion = (regionName: string) => {
    setFormAllowedRegions((prev) =>
      prev.includes(regionName) ? prev.filter((r) => r !== regionName) : [...prev, regionName]
    );
  };

  // Step 11: Edit Area functions
  const handleStartEditArea = (area: Area) => {
    setEditingArea(area);
    setEditAreaName(area.name);
    setEditAreaPlaceType((area.place_type as 'parish' | 'county' | 'district') || 'parish');
    setEditAreaContracted(area.is_contracted);
    setEditAreaLogoUrl(area.logo_url || '');
    setEditAreaError('');
    setEditAreaSuccess('');
  };

  const handleCancelEditArea = () => {
    setEditingArea(null);
    setEditAreaName('');
    setEditAreaPlaceType('parish');
    setEditAreaContracted(false);
    setEditAreaLogoUrl('');
    setEditAreaError('');
    setEditAreaSuccess('');
  };

  const handleSaveAreaEdit = async () => {
    if (!editingArea) return;
    const contractedStatusChanged = editingArea.is_contracted !== editAreaContracted;
    setSavingAreaEdit(true);
    setEditAreaError('');
    setEditAreaSuccess('');
    try {
      const res = await fetch(`/api/admin/areas/${editingArea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editAreaName.trim(),
          place_type: editAreaPlaceType,
          is_contracted: editAreaContracted,
          logo_url: editAreaLogoUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update area');
      }
      setEditAreaSuccess('Area updated successfully');
      showToast('success', 'Area updated successfully');
      await loadRegionsData();
      // Refresh dashboard if contracted status changed
      if (contractedStatusChanged && onRefreshDashboard) {
        onRefreshDashboard();
      }
      setTimeout(() => handleCancelEditArea(), 1500);
    } catch (err: any) {
      setEditAreaError(err.message || 'Failed to update area');
      showToast('error', err.message || 'Failed to update area');
    } finally {
      setSavingAreaEdit(false);
    }
  };

  const handleDeleteArea = async () => {
    if (!editingArea) return;
    if (!window.confirm(`Are you sure you want to permanently remove "${editingArea.name}"? This will remove its configuration and it will no longer appear in Parish Settings.`)) return;
    setDeletingArea(true);
    setEditAreaError('');
    try {
      const res = await fetch(`/api/admin/areas/${editingArea.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete area');
      }
      setEditAreaSuccess('Area deleted successfully');
      showToast('success', 'Area deleted successfully');
      await loadRegionsData();
      handleCancelEditArea();
    } catch (err: any) {
      setEditAreaError(err.message || 'Failed to delete area');
      showToast('error', err.message || 'Failed to delete area');
    } finally {
      setDeletingArea(false);
    }
  };

  // Step 12: Region User Access functions
  const loadRegionUsers = async () => {
    if (regionUsersLoaded) return;
    setLoadingRegionUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setRegionUsers(data);
      setRegionUsersLoaded(true);
    } catch (err: any) {
      setUserAccessError(err.message || 'Failed to load users');
    } finally {
      setLoadingRegionUsers(false);
    }
  };

  const handleToggleUserRegionAccess = async (user: User, regionName: string, hasAccess: boolean) => {
    setUpdatingUserAccess(user.id);
    setUserAccessError('');
    try {
      let newAllowedRegions: string[];
      if (hasAccess) {
        // Remove access
        newAllowedRegions = (user.allowed_regions || []).filter(r => r !== regionName);
      } else {
        // Add access
        newAllowedRegions = [...(user.allowed_regions || []), regionName];
      }
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_regions: newAllowedRegions }),
      });
      if (!res.ok) throw new Error('Failed to update user access');
      // Update local state
      setRegionUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, allowed_regions: newAllowedRegions } : u
      ));
      showToast('success', hasAccess ? `Removed ${user.email} from ${regionName}` : `Added ${user.email} to ${regionName}`);
    } catch (err: any) {
      setUserAccessError(err.message || 'Failed to update user access');
      showToast('error', err.message || 'Failed to update user access');
    } finally {
      setUpdatingUserAccess(null);
    }
  };

  const getFilteredRegionUsers = (regionName: string) => {
    return regionUsers.filter(user => {
      if (userRoleFilter !== 'all' && user.role !== userRoleFilter) return false;
      if (userActiveFilter === 'active' && !user.is_active) return false;
      if (userActiveFilter === 'inactive' && user.is_active) return false;
      return true;
    });
  };

  // Step 13: Region deletion
  const handleDeleteRegion = async () => {
    if (!selectedRegionId) return;
    const selectedRegion = regionsData.find(r => r.id === selectedRegionId);
    if (!selectedRegion) return;
    if (!window.confirm(`Are you sure you want to delete the region "${selectedRegion.name}"? You must remove or reassign all areas first.`)) return;
    setDeletingRegion(true);
    setRegionDeleteError('');
    try {
      const res = await fetch(`/api/admin/regions?regionId=${selectedRegionId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete region');
      }
      showToast('success', `Region "${selectedRegion.name}" deleted successfully`);
      await loadRegionsData();
      // Select first remaining region
      const remaining = regionsData.filter(r => r.id !== selectedRegionId);
      setSelectedRegionId(remaining.length > 0 ? remaining[0].id : null);
    } catch (err: any) {
      setRegionDeleteError(err.message || 'Failed to delete region');
      showToast('error', err.message || 'Failed to delete region');
    } finally {
      setDeletingRegion(false);
    }
  };

  const tabs = [
    { id: 'users' as TabType, label: 'Users', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )},
    { id: 'regions' as TabType, label: 'Regions & Areas', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: 'logs' as TabType, label: 'Logs', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
  ];

  const renderContent = () => {
    if (status === 'loading') {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004437] mx-auto mb-3"></div>
            <p className="text-slate-500 text-sm">Checking access…</p>
          </div>
        </div>
      );
    }

    if (!isAdmin) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Access Denied</h3>
            <p className="text-slate-500">You do not have permission to access Admin Settings.</p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'users':
        if (loadingUsers) {
          return (
            <div className="p-6 flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004437] mx-auto mb-3"></div>
                <p className="text-slate-500 text-sm">Loading users…</p>
              </div>
            </div>
          );
        }
        return (
          <div className="p-4 space-y-4">
            {/* Form Card */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                {selectedUserId ? 'Edit User' : 'Add New User'}
              </h4>
              {usersError && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{usersError}</div>
              )}
              {usersSuccess && (
                <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-600">{usersSuccess}</div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    disabled={!!selectedUserId}
                    placeholder="user@acadian.com"
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Checkboxes row */}
              <div className="flex flex-wrap gap-4 mt-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  Active
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formIsAdmin} onChange={(e) => setFormIsAdmin(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  Is Admin
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formHasAllRegions} onChange={(e) => setFormHasAllRegions(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  All Regions
                </label>
              </div>
              {/* Region checkboxes */}
              {!formHasAllRegions && userRegions.length > 0 && (
                <div className="mt-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1.5">Allowed Regions</label>
                  <div className="flex flex-wrap gap-2">
                    {userRegions.map((reg) => (
                      <label key={reg.id} className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer bg-slate-50 px-2 py-1 rounded border border-slate-200">
                        <input
                          type="checkbox"
                          checked={formAllowedRegions.includes(reg.name)}
                          onChange={() => toggleRegion(reg.name)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        {reg.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {/* Buttons */}
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleSaveUser}
                  disabled={loadingSave}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loadingSave ? 'Saving…' : 'Save User'}
                </button>
                <button onClick={clearForm} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800">
                  Clear Form
                </button>
              </div>
            </div>
            {/* Users Table */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(80vh-380px)]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Full Name</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Role</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-600">Active</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-600">All</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Regions</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-600">Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-6 text-slate-400">No users found</td></tr>
                    ) : (
                      users.map((u) => (
                        <tr
                          key={u.id}
                          onClick={() => selectUserForEdit(u)}
                          className={`cursor-pointer hover:bg-slate-50 ${selectedUserId === u.id ? 'bg-emerald-50' : ''}`}
                        >
                          <td className="px-3 py-2 text-slate-700">{u.email}</td>
                          <td className="px-3 py-2 text-slate-600">{u.full_name || '—'}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{u.role}</span></td>
                          <td className="text-center px-2 py-2">{u.is_active ? '✓' : '—'}</td>
                          <td className="text-center px-2 py-2">{u.has_all_regions ? '✓' : '—'}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{u.has_all_regions ? 'All' : (u.allowed_regions?.join(', ') || '—')}</td>
                          <td className="text-center px-2 py-2">{u.is_admin ? '✓' : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      case 'regions':
        if (loadingRegions) {
          return (
            <div className="p-6 flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004437] mx-auto mb-3"></div>
                <p className="text-slate-500 text-sm">Loading regions…</p>
              </div>
            </div>
          );
        }
        if (regionsError) {
          return (
            <div className="p-6">
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{regionsError}</div>
            </div>
          );
        }
        const selectedRegion = regionsData.find((r) => r.id === selectedRegionId);
        return (
          <div className="flex h-full">
            {/* Left column: Regions list */}
            <div className="w-48 border-r border-slate-200 flex flex-col">
              <div className="p-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase">Regions</span>
                  <button
                    onClick={() => setShowAddRegion(!showAddRegion)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-600"
                  >
                    + Add
                  </button>
                </div>
                {showAddRegion && (
                  <div className="bg-slate-50 rounded p-2 space-y-2">
                    <input
                      type="text"
                      value={newRegionName}
                      onChange={(e) => setNewRegionName(e.target.value)}
                      placeholder="Region name"
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                    />
                    <input
                      type="number"
                      value={newRegionOrder}
                      onChange={(e) => setNewRegionOrder(e.target.value)}
                      placeholder="Order (optional)"
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                    />
                    {regionFormError && <p className="text-[10px] text-red-500">{regionFormError}</p>}
                    <div className="flex gap-1">
                      <button onClick={handleCreateRegion} disabled={savingRegion} className="flex-1 px-2 py-1 text-[10px] bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                        {savingRegion ? '…' : 'Save'}
                      </button>
                      <button onClick={() => { setShowAddRegion(false); setNewRegionName(''); setNewRegionOrder(''); setRegionFormError(''); }} className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {regionsData.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No regions yet</p>
                ) : (
                  regionsData.map((region) => (
                    <button
                      key={region.id}
                      onClick={() => { setSelectedRegionId(region.id); setShowAddArea(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-xs transition-colors ${
                        selectedRegionId === region.id
                          ? 'bg-[#004437] text-white'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="font-medium">{region.name}</div>
                      <div className={`text-[10px] ${selectedRegionId === region.id ? 'text-emerald-200' : 'text-slate-400'}`}>
                        {region.areas.length} area{region.areas.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right column: Selected region details */}
            <div className="flex-1 p-4 overflow-y-auto">
              {!selectedRegion ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  Select a region to view its areas
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-slate-800">{selectedRegion.name}</h3>
                      <button
                        onClick={handleDeleteRegion}
                        disabled={deletingRegion}
                        className="px-2 py-1 text-[10px] font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
                        title="Delete this region (must have no areas)"
                      >
                        {deletingRegion ? 'Deleting...' : 'Delete Region'}
                      </button>
                    </div>
                    <button
                      onClick={() => { setShowAddArea(true); setAreaFormError(''); setAreaFormSuccess(''); }}
                      className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      + Add Area
                    </button>
                  </div>
                  {regionDeleteError && (
                    <div className="mb-3 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
                      {regionDeleteError}
                    </div>
                  )}

                  {/* Add Area Wizard */}
                  {showAddArea && (
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-4">
                      {/* Wizard Header */}
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-slate-700">
                          Add New Area - Step {addAreaStep} of 2
                        </h4>
                        <div className="flex gap-1">
                          <span className={`w-2 h-2 rounded-full ${addAreaStep >= 1 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className={`w-2 h-2 rounded-full ${addAreaStep >= 2 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        </div>
                      </div>
                      {areaFormError && <p className="text-xs text-red-500 mb-2">{areaFormError}</p>}
                      {areaFormSuccess && <p className="text-xs text-emerald-600 mb-2">{areaFormSuccess}</p>}

                      {/* Step 1: Basic Info */}
                      {addAreaStep === 1 && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Name</label>
                            <input
                              type="text"
                              value={newAreaName}
                              onChange={(e) => setNewAreaName(e.target.value)}
                              placeholder="e.g. Allen Parish"
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded text-black"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Type</label>
                            <div className="flex gap-4">
                              {(['parish', 'county', 'district'] as const).map((type) => (
                                <label key={type} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="placeType"
                                    value={type}
                                    checked={newAreaPlaceType === type}
                                    onChange={() => setNewAreaPlaceType(type)}
                                    className="w-3 h-3"
                                  />
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="contracted"
                              checked={newAreaContracted}
                              onChange={(e) => setNewAreaContracted(e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor="contracted" className="text-xs text-slate-600 cursor-pointer">Contracted</label>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Icon URL (optional)</label>
                            <input
                              type="text"
                              value={newAreaLogoUrl}
                              onChange={(e) => setNewAreaLogoUrl(e.target.value)}
                              placeholder="https://..."
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded text-black"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => {
                                if (!newAreaName.trim()) {
                                  setAreaFormError('Area name is required');
                                  return;
                                }
                                setAreaFormError('');
                                setAddAreaStep(2);
                              }}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Next →
                            </button>
                            <button onClick={clearAreaForm} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Config Wizard */}
                      {addAreaStep === 2 && (
                        <div className="space-y-4">
                          {/* Evaluation Mode */}
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-2">Evaluation Mode</label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                <input
                                  type="radio"
                                  name="configMode"
                                  checked={configMode === 'parish_average'}
                                  onChange={() => setConfigMode('parish_average')}
                                  className="w-3 h-3"
                                />
                                Parish Average
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                <input
                                  type="radio"
                                  name="configMode"
                                  checked={configMode === 'zone_based'}
                                  onChange={() => setConfigMode('zone_based')}
                                  className="w-3 h-3"
                                />
                                Zone Response
                              </label>
                            </div>
                          </div>

                          {/* Thresholds */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 mb-1">Default Threshold (min)</label>
                              <input
                                type="number"
                                value={configThresholdMinutes}
                                onChange={(e) => setConfigThresholdMinutes(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded text-black"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 mb-1">Target Average (min)</label>
                              <input
                                type="number"
                                value={configTargetAvgMinutes}
                                onChange={(e) => setConfigTargetAvgMinutes(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded text-black"
                              />
                            </div>
                          </div>

                          {/* Response Start Time */}
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Response Time Starts At</label>
                            <select
                              value={configResponseStart}
                              onChange={(e) => setConfigResponseStart(e.target.value as any)}
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded text-black"
                            >
                              {RESPONSE_START_OPTIONS.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Zones (only if zone_based) */}
                          {configMode === 'zone_based' && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-[11px] font-medium text-slate-500">Response Zones</label>
                                <button
                                  onClick={handleAddZone}
                                  className="text-[10px] text-emerald-600 hover:text-emerald-700"
                                >
                                  + Add Zone
                                </button>
                              </div>
                              <div className="space-y-2 max-h-32 overflow-y-auto">
                                {configZones.map((zone, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={zone.name}
                                      onChange={(e) => handleZoneChange(idx, 'name', e.target.value)}
                                      placeholder="Zone name"
                                      className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded text-black"
                                    />
                                    <input
                                      type="number"
                                      value={zone.minutes}
                                      onChange={(e) => handleZoneChange(idx, 'minutes', e.target.value)}
                                      placeholder="Min"
                                      className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-black"
                                    />
                                    <span className="text-[10px] text-slate-400">min</span>
                                    {configZones.length > 1 && (
                                      <button
                                        onClick={() => handleRemoveZone(idx)}
                                        className="text-red-400 hover:text-red-600 text-xs"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* View Columns */}
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-2">Report Columns</label>
                            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded p-2">
                              {AVAILABLE_COLUMNS.map(col => (
                                <label key={col.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={configColumns.includes(col.id)}
                                    onChange={() => handleColumnToggle(col.id)}
                                    className="w-3 h-3"
                                  />
                                  {col.label}
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                            <button
                              onClick={() => setAddAreaStep(1)}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                            >
                              ← Back
                            </button>
                            <button
                              onClick={handleCreateArea}
                              disabled={savingArea}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {savingArea ? 'Creating…' : 'Create Area'}
                            </button>
                            <button onClick={clearAreaForm} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                            {areaFormSuccess && (
                              <button
                                onClick={() => { setAreaFormSuccess(''); resetAreaWizard(); }}
                                className="px-3 py-1.5 text-xs text-emerald-600 hover:text-emerald-700"
                              >
                                Add Another
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Areas list */}
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Type</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Logo</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600 w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRegion.areas.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-6 text-slate-400">No areas in this region yet.</td></tr>
                        ) : (
                          selectedRegion.areas.map((area) => (
                            <tr key={area.id} className={`hover:bg-slate-50 ${editingArea?.id === area.id ? 'bg-blue-50' : ''}`}>
                              <td className="px-3 py-2 text-slate-700 font-medium">{area.name}</td>
                              <td className="px-3 py-2 text-slate-500">
                                {area.use_zones === true ? 'Zone Response' : area.use_zones === false ? 'Parish Average' : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                  area.is_contracted
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {area.is_contracted ? 'Contracted' : 'Non-contracted'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {area.logo_url ? (
                                    <img
                                      src={area.logo_url}
                                      alt=""
                                      className="w-5 h-5 object-contain rounded"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  ) : (
                                    <span className="text-slate-300 text-[10px]">No logo</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => handleStartEditArea(area)}
                                  className="px-2 py-0.5 text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>



                  {/* Region User Access Section */}
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-700">Region User Access</h4>
                      <button
                        onClick={() => { loadRegionUsers(); }}
                        disabled={loadingRegionUsers}
                        className="text-[10px] text-blue-600 hover:text-blue-800"
                      >
                        {regionUsersLoaded ? 'Refresh' : loadingRegionUsers ? 'Loading...' : 'Load Users'}
                      </button>
                    </div>
                    {regionUsersLoaded && (
                      <>
                        {/* Filters */}
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-500">Role:</label>
                            <select
                              value={userRoleFilter}
                              onChange={(e) => setUserRoleFilter(e.target.value)}
                              className="text-[10px] px-1.5 py-0.5 border border-slate-200 rounded text-black"
                            >
                              <option value="all">All Roles</option>
                              {ROLE_OPTIONS.map(role => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-500">Status:</label>
                            <select
                              value={userActiveFilter}
                              onChange={(e) => setUserActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
                              className="text-[10px] px-1.5 py-0.5 border border-slate-200 rounded text-black"
                            >
                              <option value="all">All</option>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>
                        </div>
                        {userAccessError && (
                          <div className="px-3 py-2 text-xs text-red-600 bg-red-50">{userAccessError}</div>
                        )}
                        <div className="max-h-48 overflow-y-auto">
                          <table className="w-full text-[10px]">
                            <thead className="bg-slate-50 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-medium text-slate-600">Email</th>
                                <th className="text-left px-3 py-1.5 font-medium text-slate-600">Role</th>
                                <th className="text-center px-3 py-1.5 font-medium text-slate-600">Active</th>
                                <th className="text-center px-3 py-1.5 font-medium text-slate-600">All Regions</th>
                                <th className="text-center px-3 py-1.5 font-medium text-slate-600">Has Access</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {getFilteredRegionUsers(selectedRegion.name).length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-slate-400">No users match filters</td></tr>
                              ) : (
                                getFilteredRegionUsers(selectedRegion.name).map((user) => {
                                  const hasAccess = user.has_all_regions || (user.allowed_regions || []).includes(selectedRegion.name);
                                  return (
                                    <tr key={user.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-1.5 text-slate-700">{user.email}</td>
                                      <td className="px-3 py-1.5 text-slate-500">{user.role}</td>
                                      <td className="px-3 py-1.5 text-center">
                                        {user.is_active ? '✓' : '—'}
                                      </td>
                                      <td className="px-3 py-1.5 text-center">
                                        {user.has_all_regions ? '✓' : '—'}
                                      </td>
                                      <td className="px-3 py-1.5 text-center">
                                        <input
                                          type="checkbox"
                                          checked={hasAccess}
                                          disabled={user.has_all_regions || updatingUserAccess === user.id}
                                          onChange={() => handleToggleUserRegionAccess(user, selectedRegion.name, hasAccess)}
                                          className="w-3 h-3"
                                          title={user.has_all_regions ? 'User has access to all regions' : `Toggle access to ${selectedRegion.name}`}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    {!regionUsersLoaded && !loadingRegionUsers && (
                      <div className="px-3 py-4 text-center text-[10px] text-slate-400">
                        Click "Load Users" to manage user access to this region
                      </div>
                    )}
                    {loadingRegionUsers && (
                      <div className="px-3 py-4 text-center text-[10px] text-slate-400">
                        Loading users...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      case 'logs':
        if (loadingLogs) {
          return (
            <div className="p-6 flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004437] mx-auto mb-3"></div>
                <p className="text-slate-500 text-sm">Loading logs…</p>
              </div>
            </div>
          );
        }
        if (logsError) {
          return (
            <div className="p-6">
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{logsError}</div>
            </div>
          );
        }
        return (
          <div className="p-4">
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(80vh-140px)]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-40">Time</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Actor</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Action</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Target</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">No audit events yet.</td></tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{log.actor_email || 'System'}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">{log.action}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {log.target_type}{log.target_id ? ` #${log.target_id.slice(0, 8)}` : ''}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[300px] truncate">{log.summary || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-500 text-white'
              : toast.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-blue-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' && <span>✓</span>}
            {toast.type === 'error' && <span>✕</span>}
            {toast.type === 'info' && <span>ℹ</span>}
            {toast.message}
          </div>
        </div>
      )}

      {/* Edit Area Popup Modal */}
      {editingArea && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelEditArea();
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-[400px] max-w-[90vw] overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">Edit Area: {editingArea.name}</h4>
              <button
                onClick={handleCancelEditArea}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {editAreaError && <p className="text-xs text-red-500 mb-3 p-2 bg-red-50 rounded">{editAreaError}</p>}
              {editAreaSuccess && <p className="text-xs text-emerald-600 mb-3 p-2 bg-emerald-50 rounded">{editAreaSuccess}</p>}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={editAreaName}
                    onChange={(e) => setEditAreaName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-black bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Place Type</label>
                  <div className="flex gap-4">
                    {(['parish', 'county', 'district'] as const).map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                          type="radio"
                          name="editPlaceType"
                          value={type}
                          checked={editAreaPlaceType === type}
                          onChange={() => setEditAreaPlaceType(type)}
                          className="w-4 h-4 text-emerald-600"
                        />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editContractedModal"
                    checked={editAreaContracted}
                    onChange={(e) => setEditAreaContracted(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <label htmlFor="editContractedModal" className="text-sm text-slate-600 cursor-pointer">Contracted</label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Logo URL</label>
                  <input
                    type="text"
                    value={editAreaLogoUrl}
                    onChange={(e) => setEditAreaLogoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-black bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={handleDeleteArea}
                disabled={savingAreaEdit || deletingArea}
                className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {deletingArea ? 'Deleting...' : 'Delete Area'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelEditArea}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAreaEdit}
                  disabled={savingAreaEdit || deletingArea}
                  className="px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingAreaEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-2xl w-[92vw] max-w-6xl h-[88vh] flex overflow-hidden">
        {/* Left sidebar - Navigation */}
        <div className="w-56 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Admin</h2>
            <p className="text-xs text-slate-500 mt-1">System configuration</p>
          </div>
          <div className="flex-1 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 mb-1 ${
                  activeTab === tab.id
                    ? 'bg-[#004437] text-white'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                {tab.icon}
                <span className="font-medium text-sm">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right side - Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Admin Settings</h2>
              <p className="text-sm text-slate-500 mt-0.5">Manage users, regions, and audit logs.</p>
            </div>
            <div className="flex items-center gap-4">
              {/* User info badge */}
              {sessionUser && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">{sessionUser.email}</span>
                  {sessionRole && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                      {sessionRole}
                    </span>
                  )}
                </div>
              )}
              {/* Close button */}
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content area - scrollable */}
          <div className="flex-1 overflow-y-auto bg-white">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

