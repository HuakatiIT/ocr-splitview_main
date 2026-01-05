import { ApiKey, ApiKeyStatus, SystemConfig, User } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const API_URL = `${BASE_URL}/api`;
const SYSTEM_CONFIG_KEY = 'ocr_app_system_config';

// System config cache (localStorage) for UI convenience
export const getSystemConfig = (): SystemConfig => {
  const stored = localStorage.getItem(SYSTEM_CONFIG_KEY);
  return stored ? JSON.parse(stored) : { autoApproveApiKeys: false, allowSignup: true } as any;
};

export const setSystemConfig = (config: SystemConfig): void => {
  localStorage.setItem(SYSTEM_CONFIG_KEY, JSON.stringify(config));
};

// --- API Keys (server-only) ---

export const getAllApiKeys = async (): Promise<ApiKey[]> => {
  const response = await fetch(`${API_URL}/keys`);
  if (!response.ok) return [];
  return await response.json();
};

export const getUserApiKey = async (userId: string): Promise<ApiKey | null> => {
  try {
    const response = await fetch(`${API_URL}/keys/user/${userId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const requestApiKey = async (userId: string): Promise<ApiKey> => {
  const response = await fetch(`${API_URL}/keys/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) throw new Error('Failed to request API key');
  return await response.json();
};

export const updateApiKeyStatus = async (
  keyId: string,
  status: ApiKeyStatus,
  expiresAt?: string | null,
  usageLimit?: number | null
): Promise<void> => {
  const payload: any = { status };
  if (expiresAt !== undefined) payload.expiresAt = expiresAt;
  if (usageLimit !== undefined) payload.usageLimit = usageLimit;

  const response = await fetch(`${API_URL}/keys/${keyId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to update API key');
};

export const deleteApiKey = async (keyId: string): Promise<void> => {
  const response = await fetch(`${API_URL}/keys/${keyId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete API key');
};

export const getUsersWithKeys = async (users: User[]): Promise<(User & { apiKey?: ApiKey })[]> => {
  const keys = await getAllApiKeys();
  return users.map(user => {
    const key = keys.find(k => String(k.userId) === String(user.id));
    return { ...user, apiKey: key };
  });
};
