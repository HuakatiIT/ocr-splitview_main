import React, { useState } from 'react';
import { UserPlus, AlertCircle, ArrowLeft } from 'lucide-react';
import { register } from '../services/authService';

interface RegisterPageProps {
  onNavigateToLogin: () => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigateToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await register(email, password, name);
      setSuccess(true);
      setName('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-industrial-950 px-4">
        <div className="w-full max-w-md bg-industrial-900 border border-industrial-800 rounded-xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="text-green-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-100 mb-2">Registration Successful</h2>
          <p className="text-gray-400 mb-6">
            Your account has been created and is pending approval by an administrator. Please check back later.
          </p>
          <button
            onClick={onNavigateToLogin}
            className="px-6 py-2 bg-industrial-800 hover:bg-industrial-700 text-white rounded-lg transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-industrial-950 px-4">
      <div className="w-full max-w-md bg-industrial-900 border border-industrial-800 rounded-xl shadow-2xl p-8">
        
        <button 
          onClick={onNavigateToLogin}
          className="flex items-center gap-1 text-gray-500 hover:text-white mb-6 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> Back to Login
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-100">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">Join the OCR platform</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/30 border border-red-800/50 rounded-lg flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 placeholder-industrial-600 transition-all"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 placeholder-industrial-600 transition-all"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-industrial-950 border border-industrial-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-gray-200 placeholder-industrial-600 transition-all"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus size={18} />
                Register
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
