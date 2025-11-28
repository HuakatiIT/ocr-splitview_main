import { ApiKey, ApiKeyStatus, SystemConfig, User } from '../types';

const API_URL = 'http://localhost:3001/api';
const SYSTEM_CONFIG_KEY = 'ocr_app_system_config';
const API_KEYS_KEY = 'ocr_app_api_keys'; // สำหรับ Local Mode

// Helper: เช็คโหมดการทำงาน (Local หรือ Server)
const getDbMode = async (): Promise<'local' | 'server'> => {
  try {
    const response = await fetch(`${API_URL}/config`);
    if (response.ok) {
      const config = await response.json();
      if (config.dbProvider === 'local') return 'local';
      return 'server';
    }
  } catch (e) {}
  return 'local';
};

// System Config (เก็บ Local เสมอ เพื่อความง่าย)
export const getSystemConfig = (): SystemConfig => {
  const stored = localStorage.getItem(SYSTEM_CONFIG_KEY);
  return stored ? JSON.parse(stored) : { autoApproveApiKeys: false };
};

export const setSystemConfig = (config: SystemConfig): void => {
  localStorage.setItem(SYSTEM_CONFIG_KEY, JSON.stringify(config));
};

// --- API Keys (Hybrid Logic) ---

const generateKey = (): string => {
  return 'sk-ocr-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const getAllApiKeys = async (): Promise<ApiKey[]> => {
  const mode = await getDbMode();
  if (mode === 'local') {
    // Local Mode: อ่านจาก Browser
    const stored = localStorage.getItem(API_KEYS_KEY);
    return stored ? JSON.parse(stored) : [];
  } else {
    // Server Mode: ยิง API ไปหา Server
    try {
      const response = await fetch(`${API_URL}/keys`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) { return []; }
  }
};

export const getUserApiKey = async (userId: string): Promise<ApiKey | null> => {
  const mode = await getDbMode();
  if (mode === 'local') {
    const keys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '[]');
    return keys.find((k: ApiKey) => k.userId === userId) || null;
  } else {
    try {
      const response = await fetch(`${API_URL}/keys/user/${userId}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) { return null; }
  }
};

export const requestApiKey = async (userId: string): Promise<ApiKey> => {
  const mode = await getDbMode();
  if (mode === 'local') {
    // Local Mode: สร้างเอง เก็บเอง
    const keys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '[]');
    const cleanKeys = keys.filter((k: ApiKey) => k.userId !== userId);
    
    const config = getSystemConfig();
    const newKey: ApiKey = {
      id: `key-${Date.now()}`,
      userId,
      key: generateKey(),
      status: config.autoApproveApiKeys ? 'active' : 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageLimit: null,
      usageCount: 0
    };
    cleanKeys.push(newKey);
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(cleanKeys));
    return newKey;
  } else {
    // Server Mode: ส่งคำขอไป Server
    const response = await fetch(`${API_URL}/keys/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await response.json();
  }
};

// แก้ไข: เพิ่ม expiresAt และ usageLimit ให้รองรับการอัปเดต
export const updateApiKeyStatus = async (
  keyId: string, 
  status: ApiKeyStatus, 
  expiresAt?: string | null, 
  usageLimit?: number | null
): Promise<void> => {
  const mode = await getDbMode();
  
  // สร้าง payload ที่จะส่งไปอัปเดต
  const payload: any = { status };
  if (expiresAt !== undefined) payload.expiresAt = expiresAt;
  if (usageLimit !== undefined) payload.usageLimit = usageLimit;

  if (mode === 'local') {
    const keys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '[]');
    const updatedKeys = keys.map((k: ApiKey) => {
        if (k.id === keyId) {
            return { ...k, ...payload };
        }
        return k;
    });
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(updatedKeys));
  } else {
    await fetch(`${API_URL}/keys/${keyId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
};

export const deleteApiKey = async (keyId: string): Promise<void> => {
  const mode = await getDbMode();
  if (mode === 'local') {
    const keys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '[]');
    const updatedKeys = keys.filter((k: ApiKey) => k.id !== keyId);
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(updatedKeys));
  } else {
    await fetch(`${API_URL}/keys/${keyId}`, {
      method: 'DELETE',
    });
  }
};

// Helper: ผสมข้อมูล User (จาก DB) เข้ากับ Key (จาก Server หรือ Local)
export const getUsersWithKeys = async (users: User[]): Promise<(User & { apiKey?: ApiKey })[]> => {
  // 1. ดึง Keys ทั้งหมด (จะวิ่งไปถาม Server หรือ Local ตามโหมด)
  const keys = await getAllApiKeys();
  
  // 2. จับคู่ User กับ Key
  return users.map(user => {
    // ต้องแปลงเป็น String เพื่อความชัวร์ในการเปรียบเทียบ (เผื่อ id เป็น number)
    const key = keys.find(k => String(k.userId) === String(user.id));
    return { ...user, apiKey: key };
  });
};