import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 1. โหลดค่า Environment Variables ทั้งหมด (ตาม mode ที่รันอยู่)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    server: {
      // 2. ถ้าใน .env มี VITE_PORT ให้ใช้ค่านั้น ถ้าไม่มีให้ใช้ 3000
      port: parseInt(env.VITE_PORT) || 3000, 
      host: '0.0.0.0', // เปิดให้เครื่องอื่นในวง LAN เข้าถึงได้
    },
    plugins: [react()],
    resolve: {
      alias: {
        // ตั้งค่า Alias ให้ @ แทน root folder (ตามโค้ดเดิมของคุณ)
        '@': path.resolve(__dirname, '.'),
      }
    }
    // 🗑️ ส่วน define ที่ไม่จำเป็น ถูกลบทิ้งไปแล้ว เพื่อความปลอดภัยและสะอาด
  }
})
