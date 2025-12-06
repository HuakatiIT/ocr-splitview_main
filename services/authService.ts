import { User } from '../types';

//const API_URL = 'http://localhost:3001/api';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const API_URL = `${BASE_URL}/api`;
const CURRENT_USER_KEY = 'ocr_app_current_user';

// --- Local Storage Keys (สำหรับโหมด Local) ---
const USERS_KEY = 'ocr_app_users';
const PASSWORDS_KEY = 'ocr_app_passwords';
const SETTINGS_KEY = 'ocr_app_settings'; // Key สำหรับอ่านค่า Settings

// Helper: เช็คว่าตอนนี้ระบบใช้โหมดอะไร (Local หรือ Server)
const getDbMode = async (): Promise<'local' | 'server'> => {
  try {
    // 1. ถาม Server ว่าตอนนี้ใช้ DB Provider ตัวไหน (Global Config)
    // ใช้ timestamp เพื่อป้องกัน Browser Cache Response
    const response = await fetch(`${API_URL}/config?t=${Date.now()}`);
    if (response.ok) {
      const config = await response.json();
      
      // Sync ค่าลง LocalStorage
      const currentLocal = localStorage.getItem(SETTINGS_KEY);
      let newSettings = currentLocal ? JSON.parse(currentLocal) : {};
      newSettings = { ...newSettings, ...config };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));

      // เช็คค่า dbProvider จาก Server
      if (config.dbProvider === 'local') return 'local';
      
      // ถ้าเป็น mysql, oracle หรืออื่นๆ ให้ถือว่าเป็น server
      return 'server';
    }
  } catch (e) {
    console.warn("Server unreachable, checking local cache");
  }

  // 2. ถ้าต่อ Server ไม่ได้ (Offline) ให้ดูจาก Cache ในเครื่อง
  const storedSettings = localStorage.getItem(SETTINGS_KEY);
  if (storedSettings) {
    try {
      const config = JSON.parse(storedSettings);
      if (config.dbProvider === 'local') return 'local';
    } catch (e) {}
  }
  
  // Default fallback
  return 'server';
};

// Helper: สร้าง Admin เริ่มต้นใน Local Storage (ถ้ายังไม่มี)
const initializeLocalUsers = () => {
  const usersJson = localStorage.getItem(USERS_KEY);
  if (!usersJson) {
    const defaultAdmin: User = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'System Admin',
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([defaultAdmin]));
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify({ 'admin@example.com': 'admin123' }));
  }
};

// --- Authentication Functions ---

export const login = async (email: string, password: string): Promise<User> => {
  const mode = await getDbMode();
  console.log(`[Auth] Login Mode: ${mode}`);

  if (mode === 'local') {
    // === Logic แบบ Local Storage (Offline) ===
    initializeLocalUsers();
    await new Promise(resolve => setTimeout(resolve, 500));

    const passwords = JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '{}');
    if (passwords[email] !== password) {
      throw new Error('Invalid email or password');
    }

    const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find(u => u.email === email);

    if (!user) throw new Error('User not found');
    if (user.status === 'pending') throw new Error('Account pending approval');
    if (user.status === 'rejected') throw new Error('Account rejected');

    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;

  } else {
    // === Logic แบบ Server API (Online) ===
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const user: User = await response.json();
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    } catch (error: any) {
      throw new Error(error.message || 'Unable to connect to server');
    }
  }
};

export const register = async (email: string, password: string, name: string): Promise<void> => {
  const mode = await getDbMode();
  console.log(`[Auth] Register Mode: ${mode}`);

  if (mode === 'local') {
    // === Logic แบบ Local Storage ===
    initializeLocalUsers();
    await new Promise(resolve => setTimeout(resolve, 500));

    const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (users.find(u => u.email === email)) {
      throw new Error('Email already registered');
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      email,
      name,
      role: 'user',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    const passwords = JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '{}');
    passwords[email] = password;
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

  } else {
    // === Logic แบบ Server API ===
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Unable to connect to server');
    }
  }
};

// --- Password Reset Functions ---

export const requestPasswordReset = async (email: string): Promise<{ token?: string; message: string }> => {
  const mode = await getDbMode();
  
  if (mode === 'local') {
    await new Promise(resolve => setTimeout(resolve, 500));
    const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('Email not found');
    return { token: '123456', message: 'Reset code generated (Simulated)' };
  } else {
    const response = await fetch(`${API_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to request reset');
    }
    return await response.json();
  }
};

export const resetPassword = async (email: string, token: string, newPassword: string): Promise<void> => {
  const mode = await getDbMode();

  if (mode === 'local') {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (token !== '123456') throw new Error('Invalid reset code');

    const passwords = JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '{}');
    if (!passwords[email]) throw new Error('User not found');

    passwords[email] = newPassword;
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));

  } else {
    const response = await fetch(`${API_URL}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to reset password');
    }
  }
};

export const logout = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

export const getCurrentUser = (): User | null => {
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
};

// --- Admin Functions ---

export const getAllUsers = async (): Promise<User[]> => {
  const mode = await getDbMode();

  if (mode === 'local') {
    initializeLocalUsers();
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } else {
    try {
      const response = await fetch(`${API_URL}/users`);
      if (!response.ok) throw new Error('Failed to fetch users');
      return await response.json();
    } catch (error) {
      return [];
    }
  }
};

export const updateUserStatus = async (userId: string, status: 'active' | 'rejected'): Promise<void> => {
  const mode = await getDbMode();

  if (mode === 'local') {
    const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const updatedUsers = users.map(user => 
      user.id === userId ? { ...user, status } : user
    );
    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
  } else {
    const response = await fetch(`${API_URL}/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error('Failed to update status');
  }
};

export const deleteUser = async (userId: string): Promise<void> => {
  const mode = await getDbMode();

  if (mode === 'local') {
    const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete) {
      const updatedUsers = users.filter(user => user.id !== userId);
      localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
      
      const passwords = JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '{}');
      delete passwords[userToDelete.email];
      localStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));
    }
  } else {
    const response = await fetch(`${API_URL}/users/${userId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete user');
  }
};
