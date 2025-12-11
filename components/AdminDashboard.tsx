import React, { useState, useEffect } from 'react';
import { getAllUsers, updateUserStatus, deleteUser, resetUserPassword } from '../services/authService';
import { updateApiKeyStatus, getSystemConfig, setSystemConfig, getUsersWithKeys, deleteApiKey } from '../services/apiKeyService';
import { User, ApiKey } from '../types';
import { Check, X, Shield, ArrowLeft, RefreshCw, User as UserIcon, Key, Settings, ToggleLeft, ToggleRight, Ban, Trash2, RotateCcw, Users, Calendar, Hash, Activity, AlertTriangle, KeyRound, Eye, EyeOff } from 'lucide-react';

interface AdminDashboardProps {
  onBack: () => void;
}

type UserWithKey = User & { apiKey?: ApiKey };
type DashboardTab = 'users' | 'api-keys';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const API_URL = `${BASE_URL}/api`;
const MAILDEV_URL = import.meta.env.VITE_MAILDEV_URL || 'http://maildev.localtest.me';
const DESIGN_URL = import.meta.env.VITE_DESIGN_URL || '#';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [users, setUsers] = useState<UserWithKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoApproveKeys, setAutoApproveKeys] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('users');

  // --- State สำหรับ Modal อนุมัติ ---
  const [approvingKeyId, setApprovingKeyId] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [usageLimit, setUsageLimit] = useState<string>('');

  // --- State สำหรับ Modal ลบ Key ---
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // --- State สำหรับ Modal ลบ User (เพิ่มใหม่) ---
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [resettingLoading, setResettingLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // ปรับปรุง fetchData ให้เป็น async (สำคัญมากสำหรับระบบ Hybrid/Server)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Get System Config (prefer server)
      let config = getSystemConfig();
      try {
        const res = await fetch(`${API_URL}/config`);
        if (res.ok) {
          config = await res.json();
          setSystemConfig(config as any);
        }
      } catch (e) {
        console.warn('Failed to fetch server config, using local cache', e);
      }
      setAutoApproveKeys(config.autoApproveApiKeys ?? false);
      setAllowSignup(config.allowSignup ?? true);

      // 2. Get Users from API (ต้อง await)
      const allUsers = await getAllUsers();
      
      // 3. ผสมข้อมูล Users กับ Keys (ต้อง await)
      const usersWithKeys = await getUsersWithKeys(allUsers);
      
      // Sort by creation date
      setUsers(usersWithKeys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.error("Failed to load admin data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Handlers ---

  const handleUserStatusChange = async (userId: string, newStatus: 'active' | 'rejected') => {
    await updateUserStatus(userId, newStatus);
    fetchData(); 
  };

  // --- Delete User Logic (แก้ไขใหม่ให้ใช้ Modal) ---
  const openDeleteUserModal = (userId: string) => {
    setDeletingUserId(userId);
  };

  const confirmDeleteUser = async () => {
    if (deletingUserId) {
      await deleteUser(deletingUserId);
      setDeletingUserId(null);
      fetchData();
    }
  };

  // --- Reset Password Logic ---
  const openResetUserModal = (userId: string) => {
    setResettingUserId(userId);
    setNewPassword('');
    setResetError(null);
  };

  const confirmResetUser = async () => {
    if (!resettingUserId || !newPassword.trim()) return;
    try {
      setResettingLoading(true);
      setResetError(null);
      await resetUserPassword(resettingUserId, newPassword.trim());
      setResettingUserId(null);
      setNewPassword('');
      setShowResetPassword(false);
    } catch (err: any) {
      setResetError(err?.message || 'Failed to reset password');
    } finally {
      setResettingLoading(false);
    }
  };

  // --- Approve Modal Logic ---
  const openApproveModal = (keyId: string) => {
    setApprovingKeyId(keyId);
    setExpiryDate('');
    setUsageLimit('');
  };

  const confirmApprove = async () => {
    if (!approvingKeyId) return;
    const limit = usageLimit ? parseInt(usageLimit) : null;
    const expiry = expiryDate || null;
    await updateApiKeyStatus(approvingKeyId, 'active', expiry, limit);
    setApprovingKeyId(null);
    fetchData();
  };

  // --- Key Management Handlers ---
  const handleKeyStatusChange = async (keyId: string, newStatus: 'active' | 'revoked') => {
    await updateApiKeyStatus(keyId, newStatus);
    fetchData();
  };

  // --- Delete Key Modal Logic ---
  const openDeleteKeyModal = (keyId: string) => {
    setDeletingKeyId(keyId);
  };

  const confirmDeleteKey = async () => {
    if (deletingKeyId) {
      await deleteApiKey(deletingKeyId);
      setDeletingKeyId(null);
      fetchData();
    }
  };

  const toggleAutoApprove = async () => {
    const newVal = !autoApproveKeys;
    setAutoApproveKeys(newVal);
    await syncServerConfig({ autoApproveApiKeys: newVal, allowSignup });
  };

  const toggleSignup = async () => {
    const newVal = !allowSignup;
    setAllowSignup(newVal);
    await syncServerConfig({ allowSignup: newVal, autoApproveApiKeys: autoApproveKeys });
    // re-fetch from server to reflect persisted value and avoid local cache drift
    fetchData();
  };

  const syncServerConfig = async (partial: Partial<{ allowSignup: boolean; autoApproveApiKeys: boolean }>) => {
    try {
      const res = await fetch(`${API_URL}/config`);
      const current = res.ok ? await res.json() : {};
      const next = { ...current, ...partial };
      await fetch(`${API_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      });
      setSystemConfig(next as any);
      setAllowSignup(next.allowSignup ?? true);
      setAutoApproveKeys(next.autoApproveApiKeys ?? false);
    } catch (e) {
      console.warn('Failed to sync server config', e);
      const fallback = { ...(getSystemConfig() as any), ...partial };
      setSystemConfig(fallback);
      if (partial.allowSignup !== undefined) setAllowSignup(partial.allowSignup);
      if (partial.autoApproveApiKeys !== undefined) setAutoApproveKeys(partial.autoApproveApiKeys);
    }
  };

  // --- Derived Lists ---
  
  const sortedUsers = [...users].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return 0; 
  });

  const apiUsers = users
    .filter(u => u.apiKey)
    .sort((a, b) => {
      const aPending = a.apiKey?.status === 'pending';
      const bPending = b.apiKey?.status === 'pending';
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      return 0;
    });

  const pendingUserCount = users.filter(u => u.status === 'pending').length;
  const pendingKeyCount = users.filter(u => u.apiKey?.status === 'pending').length;

  return (
    <div className="flex flex-col h-full bg-industrial-950 text-gray-200 overflow-y-auto relative">
      
      {/* --- Approve Modal --- */}
      {approvingKeyId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-industrial-900 border border-industrial-700 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Key className="text-green-500" size={20} /> Approve API Key
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Expiration Date (Optional)</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={expiryDate} 
                    onChange={(e) => setExpiryDate(e.target.value)} 
                    className="w-full px-4 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-gray-200 focus:border-blue-500 outline-none" 
                  />
                  <Calendar className="absolute right-3 top-2.5 text-gray-500 pointer-events-none" size={16} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty for No Expiration</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Usage Limit (Requests)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="1" 
                    value={usageLimit} 
                    onChange={(e) => setUsageLimit(e.target.value)} 
                    placeholder="Unlimited" 
                    className="w-full px-4 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-gray-200 focus:border-blue-500 outline-none" 
                  />
                  <Hash className="absolute right-3 top-2.5 text-gray-500 pointer-events-none" size={16} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty for Unlimited</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setApprovingKeyId(null)} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-industrial-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={confirmApprove} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg shadow-lg shadow-green-900/20 transition-all">Confirm Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Delete Key Confirmation Modal --- */}
      {deletingKeyId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-industrial-900 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-md p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-red-950/30 p-6 border-b border-red-500/10 flex items-start gap-4">
                <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20">
                    <Trash2 size={24} className="text-red-500" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Delete API Key?</h3>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                        This action is <span className="text-red-400 font-semibold">permanent</span> and cannot be undone.
                    </p>
                </div>
             </div>
             <div className="p-6 bg-industrial-900">
                <p className="text-sm text-gray-400 bg-industrial-950 p-3 rounded border border-industrial-800">
                   Are you sure you want to remove this API Key? The user will need to request a new one.
                </p>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setDeletingKeyId(null)} className="px-4 py-2 text-gray-300 hover:text-white hover:bg-industrial-800 rounded-lg transition-colors text-sm font-medium">Cancel</button>
                    <button onClick={confirmDeleteKey} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-red-900/20 transition-all">Yes, Delete Key</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* --- Delete User Confirmation Modal (เพิ่มใหม่) --- */}
      {deletingUserId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-industrial-900 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-md p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-red-950/30 p-6 border-b border-red-500/10 flex items-start gap-4">
                <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20">
                    <Users size={24} className="text-red-500" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Delete User?</h3>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                        This action is <span className="text-red-400 font-semibold">permanent</span> and cannot be undone.
                    </p>
                </div>
             </div>
             <div className="p-6 bg-industrial-900">
                <p className="text-sm text-gray-400 bg-industrial-950 p-3 rounded border border-industrial-800">
                   Are you sure you want to delete this user? This will remove their account and all associated data.
                </p>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setDeletingUserId(null)} className="px-4 py-2 text-gray-300 hover:text-white hover:bg-industrial-800 rounded-lg transition-colors text-sm font-medium">Cancel</button>
                    <button onClick={confirmDeleteUser} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-red-900/20 transition-all">Yes, Delete User</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* --- Reset Password Modal --- */}
      {resettingUserId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-industrial-900 border border-blue-500/30 rounded-xl shadow-2xl w-full max-w-md p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-blue-950/30 p-6 border-b border-blue-500/10 flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-full border border-blue-500/20">
                    <KeyRound size={24} className="text-blue-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Reset Password</h3>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                        Set a new password for this user. They will use it on next login.
                    </p>
                </div>
             </div>
             <div className="p-6 bg-industrial-900 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2 bg-industrial-950 border border-industrial-800 rounded-lg text-gray-200 focus:border-blue-500 outline-none pr-10"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300"
                      aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                    >
                      {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Min 4 characters</p>
                  {resetError && <p className="text-xs text-red-400 mt-1">{resetError}</p>}
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={() => { setResettingUserId(null); setNewPassword(''); setResetError(null); }} className="px-4 py-2 text-gray-300 hover:text-white hover:bg-industrial-800 rounded-lg transition-colors text-sm font-medium">Cancel</button>
                    <button onClick={confirmResetUser} disabled={!newPassword.trim() || newPassword.trim().length < 4 || resettingLoading} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-900/20 transition-all">
                      {resettingLoading ? 'Updating...' : 'Update Password'}
                    </button>
                </div>
             </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto w-full p-6">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-industrial-800">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-industrial-800 rounded-lg transition-colors text-gray-400 hover:text-white"><ArrowLeft size={24} /></button>
            <div><h1 className="text-2xl font-bold text-gray-100">Admin Dashboard</h1><p className="text-sm text-gray-500 mt-1">Manage user access and API keys</p></div>
          </div>
          <div className="flex items-center gap-2">
            {DESIGN_URL && (
              <a
                href={DESIGN_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-sm rounded-lg border border-industrial-700 text-gray-300 hover:text-white hover:border-purple-500 hover:bg-industrial-800 transition-colors"
              >
                Design Sheet
              </a>
            )}
            {MAILDEV_URL && (
              <a
                href={MAILDEV_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-sm rounded-lg border border-industrial-700 text-gray-300 hover:text-white hover:border-blue-500 hover:bg-industrial-800 transition-colors"
              >
                MailDev
              </a>
            )}
            <button onClick={fetchData} className="p-2 hover:bg-industrial-800 rounded-lg text-blue-400 hover:text-blue-300"><RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
           <div className="md:col-span-2 bg-industrial-900 p-4 rounded-xl border border-industrial-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
               <div className="p-2 bg-industrial-800 rounded-lg text-gray-400"><Settings size={24} /></div>
               <div><p className="text-gray-200 font-semibold">Auto-Approve API Keys</p><p className="text-xs text-gray-500 mt-0.5">If enabled, new key requests are active immediately.</p></div>
            </div>
            <button onClick={toggleAutoApprove} className={`text-2xl transition-colors ${autoApproveKeys ? 'text-green-500' : 'text-gray-600'}`}>{autoApproveKeys ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}</button>
          </div>
          <div className="md:col-span-2 bg-industrial-900 p-4 rounded-xl border border-industrial-800 flex items-center justify-between">
            <div className="flex items-start gap-3">
               <div className="p-2 bg-industrial-800 rounded-lg text-gray-400"><KeyRound size={24} /></div>
               <div><p className="text-gray-200 font-semibold">Allow User Signup</p><p className="text-xs text-gray-500 mt-0.5">New users can self-register (still pending approval).</p></div>
            </div>
            <button onClick={toggleSignup} className={`text-2xl transition-colors ${allowSignup ? 'text-green-500' : 'text-gray-600'}`}>{allowSignup ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}</button>
          </div>
          <div className="bg-industrial-900 p-4 rounded-xl border border-industrial-800 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Pending Users</p><p className={`text-2xl font-bold ${pendingUserCount > 0 ? 'text-yellow-500' : 'text-gray-400'}`}>{pendingUserCount}</p></div>
            <UserIcon className={`${pendingUserCount > 0 ? 'text-yellow-600' : 'text-gray-700'} opacity-50`} size={24} />
          </div>
          <div className="bg-industrial-900 p-4 rounded-xl border border-industrial-800 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Pending Keys</p><p className={`text-2xl font-bold ${pendingKeyCount > 0 ? 'text-purple-400' : 'text-gray-400'}`}>{pendingKeyCount}</p></div>
            <Key className={`${pendingKeyCount > 0 ? 'text-purple-600' : 'text-gray-700'} opacity-50`} size={24} />
          </div>
        </div>

        <div className="flex gap-4 mb-6 border-b border-industrial-800">
          <button onClick={() => setActiveTab('users')} className={`pb-3 px-2 flex items-center gap-2 text-sm font-medium transition-all relative ${activeTab === 'users' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}><Users size={18} /> User Management {pendingUserCount > 0 && (<span className="ml-1 px-1.5 py-0.5 bg-yellow-600 text-white text-[10px] rounded-full">{pendingUserCount}</span>)}{activeTab === 'users' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-t-full" />}</button>
          <button onClick={() => setActiveTab('api-keys')} className={`pb-3 px-2 flex items-center gap-2 text-sm font-medium transition-all relative ${activeTab === 'api-keys' ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}><Key size={18} /> API Key Requests {pendingKeyCount > 0 && (<span className="ml-1 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] rounded-full">{pendingKeyCount}</span>)}{activeTab === 'api-keys' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500 rounded-t-full" />}</button>
        </div>

        {activeTab === 'users' && (
          <div className="bg-industrial-900 rounded-xl border border-industrial-800 overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-industrial-950 border-b border-industrial-800">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User Info</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800">
                  {sortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-industrial-800/50 transition-colors">
                      <td className="px-6 py-4"><div className="flex flex-col"><span className="font-medium text-gray-200">{user.name}</span><span className="text-sm text-gray-500">{user.email}</span></div></td>
                      <td className="px-6 py-4">{user.role === 'admin' ? <span className="flex items-center gap-1 text-xs font-mono text-purple-400 bg-purple-900/10 px-2 py-0.5 rounded w-fit"><Shield size={12} /> ADMIN</span> : <span className="text-xs font-mono text-gray-500">USER</span>}</td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2 py-1 rounded-full flex w-fit items-center gap-1 ${user.status === 'active' ? 'bg-green-900/20 text-green-400 border border-green-900/50' : user.status === 'pending' ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-900/50' : 'bg-red-900/20 text-red-400 border-red-900/50'}`}><span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-400' : user.status === 'pending' ? 'bg-yellow-400' : 'bg-red-400'}`}></span>{user.status.charAt(0).toUpperCase() + user.status.slice(1)}</span></td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openResetUserModal(user.id)}
                            className="p-1.5 bg-blue-600/15 text-blue-300 hover:bg-blue-600 hover:text-white rounded border border-blue-600/40 transition-colors"
                            title="Reset password"
                          >
                            <KeyRound size={16} />
                          </button>
                          {user.role !== 'admin' && (
                            <>
                              {user.status === 'pending' && (
                                <>
                                  <button onClick={() => handleUserStatusChange(user.id, 'active')} className="p-1.5 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded border border-green-600/50 transition-colors"><Check size={16} /></button>
                                  <button onClick={() => handleUserStatusChange(user.id, 'rejected')} className="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded border border-red-600/50 transition-colors"><X size={16} /></button>
                                </>
                              )}
                              {user.status === 'active' && (
                                <button onClick={() => handleUserStatusChange(user.id, 'rejected')} className="p-1.5 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded border border-yellow-600/50 transition-colors"><Ban size={16} /></button>
                              )}
                              {user.status === 'rejected' && (
                                <button onClick={() => handleUserStatusChange(user.id, 'active')} className="p-1.5 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded border border-green-600/50 transition-colors"><RotateCcw size={16} /></button>
                              )}
                              <button onClick={() => openDeleteUserModal(user.id)} className="p-1.5 bg-gray-700/30 text-gray-400 hover:bg-red-600 hover:text-white rounded border border-gray-600/30 hover:border-red-600 transition-colors ml-1"><Trash2 size={16} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'api-keys' && (
          <div className="bg-industrial-900 rounded-xl border border-industrial-800 overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-industrial-950 border-b border-industrial-800">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Key Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usage / Limits</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-800">
                  {apiUsers.length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">No API key requests found.</td></tr>) : (
                    apiUsers.map((user) => {
                      const realStatus = (() => {
                        if (user.apiKey!.status !== 'active') return { label: user.apiKey!.status, color: 'red' };
                        if (user.apiKey!.expiresAt) {
                            const expiryDate = new Date(user.apiKey!.expiresAt);
                            expiryDate.setHours(23, 59, 59, 999); // ปรับให้เป็นสิ้นสุดวัน
                            if (expiryDate < new Date()) {
                                return { label: 'Expired', color: 'red' };
                            }
                        }
                        if (user.apiKey!.usageLimit && (user.apiKey!.usageCount || 0) >= user.apiKey!.usageLimit) return { label: 'Limit Reached', color: 'orange' };
                        return { label: 'active', color: 'purple' };
                      })();

                      return (
                      <tr key={user.apiKey!.id} className="hover:bg-industrial-800/50 transition-colors">
                        <td className="px-6 py-4"><div className="flex flex-col"><span className="font-medium text-gray-200">{user.name}</span><span className="text-sm text-gray-500">{user.email}</span></div></td>
                        <td className="px-6 py-4">
                           <span className={`text-xs px-2 py-1 rounded border capitalize inline-flex items-center gap-2 
                              ${realStatus.label === 'active' ? 'bg-purple-900/20 text-purple-400 border-purple-900/50' : 
                                realStatus.label === 'pending' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50' : 
                                realStatus.color === 'orange' ? 'bg-orange-900/20 text-orange-400 border-orange-900/50' :
                                'bg-red-900/20 text-red-400 border-red-900/50'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full 
                                ${realStatus.label === 'active' ? 'bg-purple-400' : 
                                  realStatus.label === 'pending' ? 'bg-yellow-400' : 
                                  realStatus.color === 'orange' ? 'bg-orange-400' :
                                  'bg-red-400'}`}></span>
                              {realStatus.label}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{new Date(user.apiKey!.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm font-mono text-xs">
                           <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 text-gray-300">
                                <Activity size={14} className="text-blue-500" />
                                <span>Used: <b className="text-white">{user.apiKey!.usageCount || 0}</b> / {user.apiKey!.usageLimit ? user.apiKey!.usageLimit : '∞'}</span>
                              </div>
                              {user.apiKey!.expiresAt ? (
                                <span className={`flex items-center gap-1 ${new Date(user.apiKey!.expiresAt) < new Date() ? 'text-red-400 font-bold' : 'text-orange-400'}`}>
                                   {new Date(user.apiKey!.expiresAt) < new Date() && <AlertTriangle size={12} />}
                                   <Calendar size={12} /> Exp: {new Date(user.apiKey!.expiresAt).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="text-gray-600">No Expiry</span>
                              )}
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                                {user.apiKey!.status === 'pending' && (<><button onClick={() => openApproveModal(user.apiKey!.id)} className="p-1.5 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded border border-green-600/50 transition-colors"><Check size={16} /></button><button onClick={() => handleKeyStatusChange(user.apiKey!.id, 'revoked')} className="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded border border-red-600/50 transition-colors ml-1"><X size={16} /></button></>)}
                                {user.apiKey!.status === 'active' && (<button onClick={() => handleKeyStatusChange(user.apiKey!.id, 'revoked')} className="p-1.5 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded border border-yellow-600/50 transition-colors"><Ban size={16} /></button>)}
                                {user.apiKey!.status === 'revoked' && (<><button onClick={() => handleKeyStatusChange(user.apiKey!.id, 'active')} className="p-1.5 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded border border-green-600/50 transition-colors"><RotateCcw size={16} /></button>
                                <button onClick={() => openDeleteKeyModal(user.apiKey!.id)} className="p-1.5 bg-gray-700/30 text-gray-400 hover:bg-red-600 hover:text-white rounded border border-gray-600/30 hover:border-red-600 transition-colors ml-1"><Trash2 size={16} /></button></>)}
                            </div>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
