/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string;
  // ถ้ามีตัวแปรอื่นใน .env อีก ก็มาเพิ่มตรงนี้ได้
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
