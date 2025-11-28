import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Eye, EyeOff, Server, Sliders, Cpu, ArrowLeft, Database, Wifi, CheckCircle2, AlertCircle, HardDrive, FileText, Code2, Key, Copy, XCircle, Clock, Lock, Activity, Calendar, Hash, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { ApiKey } from '../types';
import { getUserApiKey, requestApiKey } from '../services/apiKeyService';
import { getCurrentUser } from '../services/authService';

interface SettingsPageProps {
  onBack: () => void;
}

type Tab = 'ai' | 'database' | 'developer';
type DbProvider = 'local' | 'mysql' | 'oracle';

const SETTINGS_KEY = 'ocr_app_settings';

// 🔥 แก้ไขจุดที่ 1: ใช้ Base URL จาก .env (ถ้าไม่มีให้ใช้ localhost)
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`; // ต่อท้ายด้วย /api สำหรับเรียก Backend ปกติ

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const defaultSettings = {
    apiKey: '',
    baseUrl: 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-ocr',
    taskType: 'default',
    maxTokens: 16000,
    temperature: 0.1,
    topP: 0.6,
    repetitionPenalty: 1.1,
    dbProvider: 'mysql' as DbProvider,
    mysqlHost: 'localhost',
    mysqlPort: 3306,
    mysqlUser: 'root',
    mysqlPassword: '',
    mysqlDatabase: 'ocr_users_db',
    oracleHost: 'localhost',
    oraclePort: 1521,
    oracleUser: 'SYSTEM',
    oraclePassword: '',
    oracleServiceName: 'FREEPDB1',
  };

  const [settings, setSettings] = useState(defaultSettings);
  const [activeTab, setActiveTab] = useState<Tab>(isAdmin ? 'ai' : 'developer');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionErrorMsg, setConnectionErrorMsg] = useState<string>('');
  const [userApiKey, setUserApiKey] = useState<ApiKey | null>(null);
  const [showUserKey, setShowUserKey] = useState(false);

  // State สำหรับ Modal ยืนยันขอคีย์ใหม่
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  // State สำหรับ Notification
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    const savedLocal = localStorage.getItem(SETTINGS_KEY);
    let localConfig = {};
    if (savedLocal) {
        try { localConfig = JSON.parse(savedLocal); } catch(e) {}
    }

    const fetchServerConfig = async () => {
        try {
            const res = await fetch(`${API_URL}/config`);
            if (res.ok) {
                const serverConfig = await res.json();
                setSettings(prev => ({ ...prev, ...localConfig, ...serverConfig }));
            }
        } catch (error) {
            console.error("Failed to fetch config", error);
            setSettings(prev => ({ ...prev, ...localConfig }));
        }
    };

    fetchServerConfig();

    const fetchUserKey = async () => {
      if (currentUser) {
        const key = await getUserApiKey(currentUser.id);
        setUserApiKey(key);
      }
    };
    fetchUserKey();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!isAdmin) return;
    const { name, value, type } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
    
    if (name.startsWith('mysql') || name.startsWith('oracle')) {
      setConnectionStatus('idle');
      setConnectionErrorMsg('');
    }
  };

  const handleProviderChange = (provider: DbProvider) => {
    if (!isAdmin) return;
    setSettings(prev => ({ ...prev, dbProvider: provider }));
    setConnectionStatus('idle');
    setConnectionErrorMsg('');
  };

  const handleSave = async () => {
    if (!isAdmin) return;

    try {
        const res = await fetch(`${API_URL}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (res.ok) {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            showNotification("Settings saved successfully! System configuration updated.");
            setTimeout(onBack, 1500);
        } else {
            showNotification("Failed to save configuration.", "error");
        }
    } catch (error) {
        showNotification("Error connecting to server to save config.", "error");
    }
  };

  const handleReset = () => {
    if (!isAdmin) return;
    if(confirm("Are you sure you want to reset settings?")) {
      setSettings(defaultSettings);
      setConnectionStatus('idle');
      showNotification("Settings reset to defaults.");
    }
  };

  const handleRequestApiKey = async () => {
    if (currentUser) {
      if (userApiKey && userApiKey.status === 'active') {
          setShowRevokeConfirm(true);
          return;
      }
      await executeRequestKey();
    }
  };

  const executeRequestKey = async () => {
     if (currentUser) {
        const newKey = await requestApiKey(currentUser.id);
        setUserApiKey(newKey);
        setShowRevokeConfirm(false);
        showNotification("API Key requested successfully.");
     }
  };

  const testDbConnection = async () => {
    if (settings.dbProvider === 'local') {
        setConnectionStatus('success');
        return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionErrorMsg('');

    try {
        let payload: any = { provider: settings.dbProvider };
        if (settings.dbProvider === 'mysql') {
            payload = { ...payload, host: settings.mysqlHost, port: settings.mysqlPort, user: settings.mysqlUser, password: settings.mysqlPassword, database: settings.mysqlDatabase };
        } else if (settings.dbProvider === 'oracle') {
            payload = { ...payload, host: settings.oracleHost, port: settings.oraclePort, user: settings.oracleUser, password: settings.oraclePassword, serviceName: settings.oracleServiceName };
        }

        const response = await fetch(`${API_URL}/test-db-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (response.ok && result.status === 'success') {
            setConnectionStatus('success');
        } else {
            setConnectionStatus('error');
            setConnectionErrorMsg(result.message || 'Connection failed');
        }
    } catch (error: any) {
        setConnectionStatus('error');
        setConnectionErrorMsg(error.message || 'Server error');
    } finally {
        setIsTestingConnection(false);
    }
  };

  const inputBaseClasses = `w-full px-4 py-2 bg-industrial-950 border border-industrial-700 rounded-lg outline-none text-gray-200 placeholder-industrial-600 transition-all ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`;
  const focusBlue = isAdmin ? "focus:ring-2 focus:ring-blue-600 focus:border-blue-600" : "";
  const focusRed = isAdmin ? "focus:ring-2 focus:ring-red-600 focus:border-red-600" : "";

  // Logic การแสดงผลวันหมดอายุ (แก้ไขให้เป็นสิ้นสุดวัน)
  const isKeyExpired = (() => {
    if (!userApiKey?.expiresAt) return false;
    const expiryDate = new Date(userApiKey.expiresAt);
    expiryDate.setHours(23, 59, 59, 999);
    return expiryDate < new Date();
  })();

  const isLimitReached = userApiKey?.usageLimit && (userApiKey.usageCount || 0) >= userApiKey.usageLimit;
  const isKeyInvalid = isKeyExpired || isLimitReached;

  return (
    <div className="flex flex-col h-full bg-industrial-950 text-gray-200 overflow-y-auto relative">
      
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border backdrop-blur-md ${
            notification.type === 'success' 
              ? 'bg-green-950/90 border-green-500/50 text-green-100' 
              : 'bg-red-950/90 border-red-500/50 text-red-100'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 size={20} className="text-green-400" /> : <AlertCircle size={20} className="text-red-400" />}
            <span className="text-sm font-medium">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-industrial-900 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-md p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-red-950/30 p-6 border-b border-red-500/10 flex items-start gap-4">
                <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20">
                    <AlertTriangle size={24} className="text-red-500" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Revoke Current Key?</h3>
                    <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                        You currently have an existing API key. Requesting a new one will <span className="text-red-400 font-semibold">immediately revoke</span> the old key.
                    </p>
                </div>
             </div>
             <div className="p-6 bg-industrial-900">
                <p className="text-sm text-gray-400 bg-industrial-950 p-3 rounded border border-industrial-800">
                   Any applications currently using the old key will stop working immediately. Are you sure you want to proceed?
                </p>
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setShowRevokeConfirm(false)}
                        className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={executeRequestKey}
                        className="px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] text-white text-sm font-medium rounded-lg shadow-lg shadow-red-900/20 transition-all"
                    >
                        Yes, Revoke & Request
                    </button>
                </div>
             </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto w-full p-6">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-industrial-800">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-industrial-800 rounded-lg transition-colors text-gray-400 hover:text-white"><ArrowLeft size={24} /></button>
            <div><h1 className="text-2xl font-bold text-gray-100">System Configuration</h1><p className="text-sm text-gray-500 mt-1">System Settings & API Access</p></div>
          </div>
          {isAdmin && activeTab === 'ai' && <Cpu className="text-blue-500 w-8 h-8 opacity-80" />}
          {isAdmin && activeTab === 'database' && <Database className="text-blue-500 w-8 h-8 opacity-80" />}
          {activeTab === 'developer' && <Code2 className="text-purple-500 w-8 h-8 opacity-80" />}
        </div>

        <div className="flex gap-2 mb-6 bg-industrial-900/50 p-1 rounded-lg border border-industrial-800 w-fit overflow-x-auto max-w-full">
          {isAdmin && (
            <>
              <button onClick={() => setActiveTab('ai')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-industrial-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-industrial-800/50'}`}><Cpu size={16} /> AI Configuration</button>
              <button onClick={() => setActiveTab('database')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'database' ? 'bg-industrial-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-industrial-800/50'}`}><Database size={16} /> Database </button>
            </>
          )}
          <button onClick={() => setActiveTab('developer')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'developer' ? 'bg-purple-900/40 text-purple-200 shadow-sm border border-purple-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-industrial-800/50'}`}><Code2 size={16} /> Developer Access</button>
        </div>

        <div className="space-y-8 bg-industrial-900/50 p-8 rounded-xl border border-industrial-800 shadow-xl min-h-[600px]">
          {/* AI Tab - Only Admin */}
          {activeTab === 'ai' && isAdmin && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-300">
              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-6 text-blue-400"><Server size={20} /> Connection</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2"><label className="block text-sm font-medium text-gray-400 mb-2">Typhoon API Key</label><div className="relative"><input type={showApiKey ? "text" : "password"} name="apiKey" value={settings.apiKey} onChange={handleChange} disabled={!isAdmin} placeholder="sk-..." className={`${inputBaseClasses} ${focusBlue}`} /><button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">{showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
                   <div className="col-span-1 md:col-span-2"><label className="block text-sm font-medium text-gray-400 mb-2">Base URL</label><input type="text" name="baseUrl" value={settings.baseUrl} onChange={handleChange} disabled={!isAdmin} className={`${inputBaseClasses} ${focusBlue}`} /></div>
                </div>
              </section>
              <hr className="border-industrial-800 my-8" />
              <section>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-6 text-blue-400"><Sliders size={20} /> Model Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div><label className="block text-sm font-medium text-gray-400 mb-2">Model Name</label><input type="text" name="model" value={settings.model} onChange={handleChange} disabled={!isAdmin} placeholder="typhoon-ocr" className={`${inputBaseClasses} ${focusBlue}`} /></div>
                  <div><label className="block text-sm font-medium text-gray-400 mb-2">Task Type</label><input type="text" name="taskType" value={settings.taskType} onChange={handleChange} disabled={!isAdmin} placeholder="default" className={`${inputBaseClasses} ${focusBlue}`} /></div>
                  <div><label className="block text-sm font-medium text-gray-400 mb-2">Max Tokens</label><input type="number" name="maxTokens" value={settings.maxTokens} onChange={handleChange} disabled={!isAdmin} className={`${inputBaseClasses} ${focusBlue}`} /></div>
                   <div><label className="block text-sm font-medium text-gray-400 mb-2">Repetition Penalty</label><input type="number" name="repetitionPenalty" step="0.1" value={settings.repetitionPenalty} onChange={handleChange} disabled={!isAdmin} className={`${inputBaseClasses} ${focusBlue}`} /></div>
                  <div><div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-400">Temperature</label><span className="text-sm font-mono text-blue-400 bg-blue-900/20 px-2 rounded border border-blue-900/50">{settings.temperature}</span></div><input type="range" name="temperature" min="0" max="2" step="0.05" value={settings.temperature} onChange={handleChange} className={`w-full h-2 bg-industrial-800 rounded-lg appearance-none cursor-pointer accent-blue-600`} /></div>
                  <div><div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-400">Top P</label><span className="text-sm font-mono text-blue-400 bg-blue-900/20 px-2 rounded border border-blue-900/50">{settings.topP}</span></div><input type="range" name="topP" min="0" max="1" step="0.05" value={settings.topP} onChange={handleChange} className={`w-full h-2 bg-industrial-800 rounded-lg appearance-none cursor-pointer accent-blue-600`} /></div>
                </div>
              </section>
            </div>
          )}

          {/* Database Tab - Only Admin */}
          {activeTab === 'database' && isAdmin && (
             <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold flex items-center gap-2 text-blue-400"><Database size={20} /> Storage Provider </h2><span className="text-xs text-yellow-500 bg-yellow-900/20 px-2 py-1 rounded border border-yellow-900/50">⚠️ Changing this affects ALL users</span></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <button onClick={() => handleProviderChange('local')} className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200 group ${settings.dbProvider === 'local' ? 'bg-industrial-800 border-blue-500 text-white shadow-lg' : 'bg-industrial-950 border-industrial-800 text-gray-500 hover:border-industrial-600 hover:bg-industrial-800'}`}><div className={`p-3 rounded-full mb-3 ${settings.dbProvider === 'local' ? 'bg-blue-500/20' : 'bg-industrial-900 group-hover:bg-industrial-700'}`}><HardDrive size={28} className={settings.dbProvider === 'local' ? 'text-blue-400' : 'text-gray-500'} /></div><span className="font-semibold text-sm">Local Storage</span></button>
                  <button onClick={() => handleProviderChange('mysql')} className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200 group ${settings.dbProvider === 'mysql' ? 'bg-industrial-800 border-blue-500 text-white shadow-lg' : 'bg-industrial-950 border-industrial-800 text-gray-500 hover:border-industrial-600 hover:bg-industrial-800'}`}><div className={`p-3 rounded-full mb-3 ${settings.dbProvider === 'mysql' ? 'bg-blue-500/20' : 'bg-industrial-900 group-hover:bg-industrial-700'}`}><Server size={28} className={settings.dbProvider === 'mysql' ? 'text-blue-400' : 'text-gray-500'} /></div><span className="font-semibold text-sm">MySQL Database</span></button>
                  <button onClick={() => handleProviderChange('oracle')} className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200 group ${settings.dbProvider === 'oracle' ? 'bg-industrial-800 border-blue-500 text-white shadow-lg' : 'bg-industrial-950 border-industrial-800 text-gray-500 hover:border-industrial-600 hover:bg-industrial-800'}`}><div className={`p-3 rounded-full mb-3 ${settings.dbProvider === 'oracle' ? 'bg-blue-500/20' : 'bg-industrial-900 group-hover:bg-industrial-700'}`}><Database size={28} className={settings.dbProvider === 'oracle' ? 'text-blue-400' : 'text-gray-500'} /></div><span className="font-semibold text-sm">Oracle Database</span></button>
                </div>
                <div className="bg-industrial-950/50 border border-industrial-800 rounded-xl p-6 relative overflow-hidden min-h-[350px]">
                  {settings.dbProvider === 'local' && (<div className="flex flex-col items-center justify-center h-full py-12 animate-in fade-in zoom-in-95"><div className="w-16 h-16 bg-industrial-900 rounded-full flex items-center justify-center mb-4 border border-industrial-800"><HardDrive size={32} className="text-industrial-500" /></div><h3 className="text-lg font-medium text-gray-300">Browser Local Storage</h3><p className="text-sm text-gray-500 mt-2 max-w-sm text-center leading-relaxed">Data is stored securely within your browser's indexedDB/localStorage. No external server connection is required.</p></div>)}
                  {settings.dbProvider === 'mysql' && (<div className="space-y-6 animate-in fade-in slide-in-from-bottom-2"><div className="flex items-center gap-2 text-blue-400 mb-2 border-b border-blue-900/30 pb-2"><Server size={18} /><span className="text-sm font-semibold uppercase tracking-wider">MySQL Configuration</span></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-400 mb-2">Host Address</label><input type="text" name="mysqlHost" value={settings.mysqlHost} onChange={handleChange} placeholder="e.g., 127.0.0.1" className={`${inputBaseClasses} ${focusBlue}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Port</label><input type="number" name="mysqlPort" value={settings.mysqlPort} onChange={handleChange} placeholder="3306" className={`${inputBaseClasses} ${focusBlue}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Database Name</label><input type="text" name="mysqlDatabase" value={settings.mysqlDatabase} onChange={handleChange} placeholder="ocr_app_db" className={`${inputBaseClasses} ${focusBlue}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Username</label><input type="text" name="mysqlUser" value={settings.mysqlUser} onChange={handleChange} className={`${inputBaseClasses} ${focusBlue}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Password</label><div className="relative"><input type={showDbPassword ? "text" : "password"} name="mysqlPassword" value={settings.mysqlPassword} onChange={handleChange} className={`${inputBaseClasses} ${focusBlue}`} /><button type="button" onClick={() => setShowDbPassword(!showDbPassword)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">{showDbPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div></div></div>)}
                  {settings.dbProvider === 'oracle' && (<div className="space-y-6 animate-in fade-in slide-in-from-bottom-2"><div className="flex items-center gap-2 text-blue-400 mb-2 border-b border-blue-900/30 pb-2"><Database size={18} /><span className="text-sm font-semibold uppercase tracking-wider">Oracle DB Configuration</span></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-400 mb-2">Host Address</label><input type="text" name="oracleHost" value={settings.oracleHost} onChange={handleChange} placeholder="e.g., localhost" className={`${inputBaseClasses} ${focusRed}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Port</label><input type="number" name="oraclePort" value={settings.oraclePort} onChange={handleChange} placeholder="1521" className={`${inputBaseClasses} ${focusRed}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Service Name / SID</label><input type="text" name="oracleServiceName" value={settings.oracleServiceName} onChange={handleChange} placeholder="FREEPDB1" className={`${inputBaseClasses} ${focusRed}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Username</label><input type="text" name="oracleUser" value={settings.oracleUser} onChange={handleChange} className={`${inputBaseClasses} ${focusRed}`} /></div><div><label className="block text-sm font-medium text-gray-400 mb-2">Password</label><div className="relative"><input type={showDbPassword ? "text" : "password"} name="oraclePassword" value={settings.oraclePassword} onChange={handleChange} className={`${inputBaseClasses} ${focusRed}`} /><button type="button" onClick={() => setShowDbPassword(!showDbPassword)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">{showDbPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div></div></div>)}
                  {settings.dbProvider !== 'local' && (<div className="pt-6 mt-6 border-t border-industrial-800 flex items-center justify-between"><div className="flex flex-col gap-1 w-full"><div className="flex items-center gap-3"><button onClick={testDbConnection} disabled={isTestingConnection} className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors disabled:opacity-50 ${settings.dbProvider === 'mysql' ? 'bg-blue-900/20 text-blue-400 border-blue-900/50 hover:bg-blue-900/40' : 'bg-blue-900/20 text-blue-400 border-blue-900/50 hover:bg-blue-900/40'}`}>{isTestingConnection ? <Wifi size={18} className="animate-ping" /> : <Wifi size={18} />} Test Connection</button>{connectionStatus === 'success' && <span className="text-green-400 flex items-center gap-1.5 text-sm animate-in fade-in"><CheckCircle2 size={16} /> Connection Successful</span>}{connectionStatus === 'error' && <span className="text-red-400 flex items-center gap-1.5 text-sm animate-in fade-in"><AlertCircle size={16} /> Connection Failed</span>}</div>{connectionErrorMsg && <p className="text-red-400/80 text-xs font-mono mt-1 ml-1">{connectionErrorMsg}</p>}</div></div>)}
                </div>
             </section>
          )}

          {activeTab === 'developer' && (
            <section className="animate-in fade-in slide-in-from-bottom-2">
               <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold flex items-center gap-2 text-purple-400"><Code2 size={20} /> Developer API Access</h2></div>
               <div className="bg-industrial-950 border border-industrial-800 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
                 {!userApiKey ? (
                   <div className="max-w-md">
                      <div className="w-16 h-16 bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-purple-500/30"><Key size={32} className="text-purple-400" /></div>
                      <h3 className="text-xl font-bold text-gray-200 mb-2">Get your API Key</h3>
                      <p className="text-gray-400 mb-8 leading-relaxed">Integrate our OCR capabilities directly into your applications.</p>
                      <button onClick={handleRequestApiKey} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg shadow-purple-900/20 transition-all flex items-center gap-2 mx-auto"><Key size={18} /> Request API Key</button>
                   </div>
                 ) : (
                   <div className="w-full max-w-2xl text-left">
                      <div className="flex items-center justify-between mb-6 border-b border-industrial-800 pb-4"><div><h3 className="text-lg font-medium text-gray-200">Your API Credential</h3><p className="text-sm text-gray-500">Use this key to authenticate your requests.</p></div><div className={`px-3 py-1 rounded-full text-xs font-medium border uppercase tracking-wide ${userApiKey.status === 'active' ? 'bg-green-900/20 text-green-400 border-green-900/50' : userApiKey.status === 'pending' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50' : 'bg-red-900/20 text-red-400 border-red-900/50'}`}>{userApiKey.status}</div></div>
                      
                      <div className="space-y-6">
                        {userApiKey.status === 'active' ? (
                            <>
                              {isKeyInvalid && (
                                <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex items-center justify-between mb-4 animate-in fade-in slide-in-from-top-2">
                                  <div className="flex items-center gap-3 text-red-400 text-sm font-medium">
                                    <AlertTriangle size={20} />
                                    <span>
                                      {isKeyExpired ? "Attention: Your API key has expired." : "Attention: Usage limit reached."}
                                    </span>
                                  </div>
                                  <button 
                                    onClick={handleRequestApiKey} 
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wide rounded shadow-lg shadow-red-900/20 transition-all"
                                  >
                                     <RefreshCw size={14} /> Request Renewal
                                  </button>
                                </div>
                              )}

                              <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">API Key</label>
                                <div className="flex items-center gap-2"><div className="relative flex-1"><input type={showUserKey ? "text" : "password"} value={userApiKey.key} readOnly className="w-full px-4 py-3 bg-industrial-900 border border-industrial-700 rounded-lg outline-none text-gray-300 font-mono text-sm" /><button onClick={() => setShowUserKey(!showUserKey)} className="absolute right-3 top-3 text-gray-500 hover:text-gray-300">{showUserKey ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><button onClick={() => navigator.clipboard.writeText(userApiKey.key)} className="p-3 bg-industrial-800 hover:bg-industrial-700 text-gray-400 hover:text-white rounded-lg border border-industrial-700 transition-colors" title="Copy to clipboard"><Copy size={20} /></button></div>
                                
                                <div className="grid grid-cols-2 gap-4 mt-6">
                                    <div className={`bg-industrial-900 p-3 rounded border ${isLimitReached ? 'border-red-500/50 bg-red-900/10' : 'border-industrial-800'}`}>
                                        <div className="flex items-center gap-2 text-gray-500 mb-1 text-xs uppercase tracking-wider">
                                            <Activity size={14} /> Usage
                                        </div>
                                        <div className="text-lg font-mono text-gray-200">
                                            <span className={isLimitReached ? 'text-red-500 font-bold' : ''}>
                                                {userApiKey.usageCount || 0}
                                            </span>
                                            <span className="text-gray-600 text-sm"> / {userApiKey.usageLimit ? userApiKey.usageLimit : '∞'}</span>
                                        </div>
                                    </div>
                                    <div className={`bg-industrial-900 p-3 rounded border ${isKeyExpired ? 'border-red-500/50 bg-red-900/10' : 'border-industrial-800'}`}>
                                        <div className="flex items-center gap-2 text-gray-500 mb-1 text-xs uppercase tracking-wider">
                                            <Calendar size={14} /> Expires
                                        </div>
                                        <div className={`text-sm font-mono mt-1 ${isKeyExpired ? 'text-red-500 font-bold' : 'text-gray-200'}`}>
                                            {userApiKey.expiresAt ? new Date(userApiKey.expiresAt).toLocaleDateString() : 'No Expire'}
                                        </div>
                                    </div>
                                </div>
                              </div>

                              {!isKeyInvalid && (
                                <div className="flex justify-end mt-4">
                                 <button 
                                    onClick={() => setShowRevokeConfirm(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold uppercase tracking-wide rounded border border-red-600/50 transition-all"
                                  >
                                     <RefreshCw size={14} /> Request Renewal
                                  </button>
                              </div>
                              )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-yellow-900/50 bg-yellow-900/10 rounded-xl">
                                <Clock className="w-12 h-12 text-yellow-500 mb-3 opacity-80" />
                                <h4 className="text-lg font-medium text-yellow-400">Approval Pending</h4>
                                <p className="text-sm text-yellow-200/70 text-center max-w-xs mt-1">Your API key request has been sent. Please wait for an administrator to activate your key.</p>
                            </div>
                        )}
                        
                        {/* 🔥 แก้ไขจุดที่ 2: ใช้ BASE_URL จาก .env 🔥 */}
                        {userApiKey.status === 'active' && (
                            <div className="pt-4 border-t border-industrial-800">
                                <h4 className="text-sm font-medium text-gray-300 mb-2">Example Usage (cURL)</h4>
                                <div className="bg-black/50 p-4 rounded-lg border border-industrial-800 font-mono text-xs text-gray-400 overflow-x-auto">
                                    <span className="text-purple-400">curl</span> -X POST {BASE_URL}/v1/ocr \<br/>
                                    &nbsp;&nbsp;-H <span className="text-green-400">"Authorization: Bearer {showUserKey ? userApiKey.key : 'sk-...'}"</span> \<br/>
                                    &nbsp;&nbsp;-F "file=@image.png"
                                </div>
                            </div>
                        )}
                      </div>
                   </div>
                 )}
               </div>
            </section>
          )}

          {/* Footer Actions */}
          {activeTab !== 'developer' && (
            <div className="pt-6 border-t border-industrial-800 flex justify-between items-center mt-8">
              <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-white hover:bg-industrial-800 rounded-lg transition"><RotateCcw size={18} /><span>Reset Defaults</span></button>
              <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 transition transform active:scale-95"><Save size={18} /><span>{isAdmin ? 'Save Config' : 'Save Settings'}</span></button>
            </div>
          )}
          {activeTab === 'developer' && (
             <div className="pt-6 border-t border-industrial-800 flex justify-end mt-8"><button onClick={onBack} className="px-6 py-2 bg-industrial-800 hover:bg-industrial-700 text-white rounded-lg transition">Close</button></div>
          )}

        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
