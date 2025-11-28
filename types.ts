export interface OcrResult {
  status: 'success' | 'pending' | 'error' | 'idle';
  timestamp: string;
  extracted_text: string | null;
  confidence?: number;
  error?: string;
  filename?: string;
}

export interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  progress: number;
  message: string;
}

export interface UploadedFile {
  file: File;
  previewUrl: string;
  fromHistory?: boolean;
}

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number;
  result?: OcrResult;
  errorMsg?: string;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'pending' | 'rejected';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface OcrHistoryItem {
  id: string;
  userId: string;
  fileName: string;
  timestamp: string;
  result: OcrResult | OcrResult[];
  modelUsed: string;
  imageBase64?: string;
}

export type ApiKeyStatus = 'active' | 'pending' | 'revoked';

export interface ApiKey {
  id: string;
  userId: string;
  key: string;
  status: ApiKeyStatus;
  createdAt: string;
  // --- ส่วนที่เพิ่มใหม่ ---
  expiresAt?: string | null;   // วันหมดอายุ (ISO String) หรือ null (No Expire)
  usageLimit?: number | null;  // จำกัดจำนวนครั้ง หรือ null (Unlimited)
  usageCount?: number;         // จำนวนที่ใช้ไปแล้ว
}

export interface ApiKeyRequestParams {
  userId: string;
}

export interface SystemConfig {
  autoApproveApiKeys: boolean;
}
