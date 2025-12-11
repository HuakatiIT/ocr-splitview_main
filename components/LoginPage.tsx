import React, { useEffect, useState } from 'react';
import { LogIn, AlertCircle, ScanLine, XCircle, ShieldAlert, ArrowLeft, CheckCircle2, Key } from 'lucide-react';
import { login, requestPasswordReset, resetPassword } from '../services/authService';
import { User } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
  onNavigateToRegister: () => void;
}

type LoginView = 'login' | 'forgot' | 'reset';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const API_URL = `${BASE_URL}/api`;

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onNavigateToRegister }) => {
  const [allowSignup, setAllowSignup] = useState(true);
  const [view, setView] = useState<LoginView>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Reset Fields
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/config`);
        if (res.ok) {
          const cfg = await res.json();
          setAllowSignup(cfg.allowSignup !== false);
          localStorage.setItem('ocr_app_settings', JSON.stringify(cfg));
          return;
        }
      } catch {}
      try {
        const saved = localStorage.getItem('ocr_app_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setAllowSignup(parsed.allowSignup !== false);
        }
      } catch {}
    };
    loadConfig();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = await login(email, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const res = await requestPasswordReset(email);
      // ในระบบจริง User จะได้ Token ทางอีเมล
      // แต่ใน Demo เราจะแสดง Token ให้เห็นเลย เพื่อให้ก๊อปปี้ไปใช้ต่อได้
      if (res.token) {
          setSuccessMsg(`[Local Mode] Your Demo Code: ${res.token}`);
      } else {
          setSuccessMsg(res.message); // "Please check your email..."
      }
      
      // รอ user อ่านข้อความแป๊บนึง แล้วค่อยเปลี่ยนหน้าไปกรอกรหัส
      setTimeout(() => {
          setSuccessMsg(null); // clear msg เพื่อไม่ให้รกในหน้าถัดไป
          setView('reset');
      }, 2000);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      await resetPassword(email, resetToken, newPassword);
      setSuccessMsg("Password changed successfully. Please login.");
      setTimeout(() => {
          setView('login');
          setPassword('');
          setSuccessMsg(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-industrial-950 px-4">
      <div className="w-full max-w-md bg-industrial-900 border border-industrial-800 rounded-xl shadow-2xl p-8">
        
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-lg mb-4 shadow-lg shadow-blue-900/20">
            <ScanLine size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">
            {view === 'login' ? 'Welcome Back' : view === 'forgot' ? 'Reset Password' : 'Set New Password'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
             {view === 'login' ? 'Sign in to access OCR Tools' : view === 'forgot' ? 'Enter email to verify identity' : 'Enter the code sent to your email'}
          </p>
        </div>

        {/* System Alert (Error) */}
        {error && (
          <div className="mb-6 bg-red-950/30 border-l-4 border-red-600 rounded-r-lg p-4 flex items-start gap-4 shadow-lg shadow-red-900/10 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-red-500/10 p-2 rounded-full flex-shrink-0">
              <ShieldAlert size={20} className="text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-red-400 tracking-wide uppercase">Error</h3>
              </div>
              <p className="text-sm text-gray-300/90 leading-relaxed font-light">{error}</p>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-6 bg-green-950/30 border-l-4 border-green-600 rounded-r-lg p-4 flex items-start gap-4 shadow-lg shadow-green-900/10 animate-in fade-in">
             <div className="bg-green-500/10 p-2 rounded-full flex-shrink-0"><CheckCircle2 size={20} className="text-green-500" /></div>
             <p className="text-sm text-gray-300 pt-1">{successMsg}</p>
          </div>
        )}

        {/* --- View 1: Login --- */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 transition-all" placeholder="name@company.com" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Password</label>
                <button type="button" onClick={() => setView('forgot')} className="text-xs text-blue-400 hover:text-blue-300">Forgot Password?</button>
              </div>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 transition-all" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 mt-2 active:scale-[0.98]">
              {isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><LogIn size={18} /> Sign In</>}
            </button>
          </form>
        )}

        {/* --- View 2: Forgot Password --- */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 transition-all" placeholder="Enter your email" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg transition-all disabled:opacity-50 mt-2">
              {isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => setView('login')} className="w-full text-gray-500 hover:text-white text-sm mt-4 flex items-center justify-center gap-2"><ArrowLeft size={16} /> Back to Login</button>
          </form>
        )}

        {/* --- View 3: Reset Password --- */}
        {view === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div>
               <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reset Code</label>
               <input type="text" required value={resetToken} onChange={(e) => setResetToken(e.target.value)} className="w-full px-4 py-3 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 text-center tracking-widest font-mono text-lg" placeholder="123456" />
               <p className="text-xs text-gray-500 mt-2 text-center">Check your email for the 6-digit code</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">New Password</label>
              <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200" placeholder="New password" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg shadow-lg transition-all disabled:opacity-50 mt-2">
              {isLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Key size={18} /> Set New Password</>}
            </button>
            <button type="button" onClick={() => setView('login')} className="w-full text-gray-500 hover:text-white text-sm mt-4 flex items-center justify-center gap-2"><ArrowLeft size={16} /> Cancel</button>
          </form>
        )}

        {/* Footer */}
        {view === 'login' && (
          <div className="mt-8 text-center pt-6 border-t border-industrial-800">
            {allowSignup ? (
              <p className="text-sm text-gray-500">
                Don't have an account? <button onClick={onNavigateToRegister} className="text-blue-400 hover:text-blue-300 font-medium transition-colors hover:underline">Register here</button>
              </p>
            ) : (
              <p className="text-sm text-gray-500">Signup is disabled. Please contact admin.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
