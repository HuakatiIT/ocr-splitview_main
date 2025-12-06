import { getUserApiKey } from './apiKeyService';
import { getCurrentUser } from './authService';

// Replaces Tesseract.js with Typhoon OCR API fetch call via Local Proxy

interface OcrProgress {
  status: string;
  progress: number;
}

// URL ของ API Gateway ที่เราสร้างไว้ใน server.js
//const GATEWAY_URL = 'http://localhost:3001/v1/ocr';

// 🟢 อ่านจาก Environment Variable (ถ้าไม่มีให้ใช้ localhost เป็นค่าสำรอง)
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const GATEWAY_URL = `${BASE_URL}/v1/ocr`;

export const processImage = async (
  imageUrl: string, 
  onProgress: (progress: OcrProgress) => void
): Promise<{ text: string; confidence: number }> => {
  
  // 1. ดึงข้อมูล User ปัจจุบัน
  const user = getCurrentUser();
  if (!user) {
    throw new Error("User not logged in. Please login to use OCR.");
  }

  // 2. ดึง API Key ของ User (ตั๋วผ่านทาง)
  const userKeyData = await getUserApiKey(user.id);
  
  if (!userKeyData) {
      throw new Error("API Key not found. Please request a key in Settings.");
  }
  
  if (userKeyData.status !== 'active') {
      throw new Error(`Your API Key is ${userKeyData.status}. Please check Settings.`);
  }

  const apiKey = userKeyData.key;

  try {
    // 3. แปลงรูปให้พร้อมส่ง
    onProgress({ status: "Preparing Image", progress: 0.1 });
    const imageRes = await fetch(imageUrl);
    const blob = await imageRes.blob();
    
    // 4. ส่งแค่ไฟล์อย่างเดียว (ไม่ต้องส่ง Config/Model แล้ว Backend จัดการเอง)
    const formData = new FormData();
    formData.append('file', blob, 'image.png'); 

    // 5. ยิงเข้า API Gateway ของเรา
    onProgress({ status: "Uploading to Server", progress: 0.3 });
    
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}` // ส่ง User Key ไปเช็คสิทธิ์
      },
      body: formData,
    });

    onProgress({ status: "Processing", progress: 0.7 });

    if (!response.ok) {
      let errorMsg = `API Error ${response.status}`;
      try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = errorData.error;
          if (errorData.message) errorMsg += `: ${errorData.message}`;
      } catch (e) {
          const text = await response.text();
          if (text) errorMsg = text;
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    onProgress({ status: "Finalizing", progress: 0.9 });

    // 6. แกะผลลัพธ์ (Logic เดิม)
    const extractedTexts: string[] = [];
    
    if (result.results && Array.isArray(result.results)) {
        for (const pageResult of result.results) {
            if (pageResult.success && pageResult.message) {
                let content = pageResult.message.choices?.[0]?.message?.content || "";
                try {
                    const parsedContent = JSON.parse(content);
                    content = parsedContent.natural_text || content;
                } catch (e) {}
                extractedTexts.push(content);
            } else if (!pageResult.success) {
                console.warn(`Page error: ${pageResult.error}`);
            }
        }
    } else {
        console.warn("Unexpected API response structure", result);
    }

    const fullText = extractedTexts.join('\n');

    if (!fullText && !result.results) {
        throw new Error("No text extracted or invalid response format.");
    }

    return {
      text: fullText,
      confidence: 100,
    };

  } catch (error: any) {
    console.error("OCR Process Failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred.";
    throw new Error(errorMessage);
  }
};
