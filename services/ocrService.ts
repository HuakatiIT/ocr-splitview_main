// Replaces Tesseract.js with Typhoon OCR API fetch call

interface OcrProgress {
  status: string;
  progress: number;
}

interface OcrSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  taskType: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
}

// --- แก้ไข: ฟังก์ชันดึง Settings จาก Server (Async) ---
const getSettings = async (): Promise<OcrSettings> => {
  const defaults: OcrSettings = {
    apiKey: '',
    baseUrl: 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-ocr',
    taskType: 'default',
    maxTokens: 16000,
    temperature: 0.1,
    topP: 0.6,
    repetitionPenalty: 1.1,
  };
  
  try {
    // 1. ยิงไปขอ Config จาก Server (Global Config ที่ Admin ตั้ง)
    const response = await fetch('http://localhost:3001/api/config');
    if (response.ok) {
       const serverConfig = await response.json();
       // ผสมค่า Default เข้ากับค่าจาก Server
       return { ...defaults, ...serverConfig };
    }
  } catch (e) {
    console.error("Failed to fetch global config for OCR", e);
  }

  // Fallback: ถ้าดึง Server ไม่ได้ ค่อยไปดู LocalStorage (เผื่อกรณี Server ตาย)
  const saved = localStorage.getItem('ocr_app_settings');
  if (saved) {
    try {
      return { ...defaults, ...JSON.parse(saved) };
    } catch (e) {}
  }
  
  return defaults;
};

export const processImage = async (
  imageUrl: string, 
  onProgress: (progress: OcrProgress) => void
): Promise<{ text: string; confidence: number }> => {
  
  // --- ต้องใช้ await เพราะ getSettings เป็น Async แล้ว ---
  const settings = await getSettings(); 
  
  // Validate and Sanitize API Key
  const rawApiKey = settings.apiKey || '';
  const apiKey = rawApiKey.trim();

  if (!apiKey) {
    throw new Error("System API Key is missing. Please contact Admin.");
  }

  // ... (ส่วนที่เหลือเหมือนเดิม) ...

  // Check for non-ASCII characters which break HTTP headers
  if (/[^\x00-\x7F]/.test(apiKey)) {
    throw new Error("API Key contains invalid non-ASCII characters.");
  }

  try {
    // 1. Convert the blob URL (previewUrl) back to a File/Blob
    onProgress({ status: "Preparing Image", progress: 0.1 });
    const imageRes = await fetch(imageUrl);
    const blob = await imageRes.blob();
    
    // 2. Prepare FormData
    const formData = new FormData();
    formData.append('file', blob, 'image.png'); 
    formData.append('model', settings.model);
    formData.append('task_type', settings.taskType);
    formData.append('max_tokens', settings.maxTokens.toString());
    formData.append('temperature', settings.temperature.toString());
    formData.append('top_p', settings.topP.toString());
    formData.append('repetition_penalty', settings.repetitionPenalty.toString());

    // 3. Call Typhoon API
    onProgress({ status: "Uploading to Typhoon OCR", progress: 0.3 });
    
    // Construct endpoint
    let endpoint = settings.baseUrl.trim();
    if (endpoint.endsWith('/v1')) endpoint += '/ocr';
    else if (!endpoint.endsWith('/ocr')) endpoint += '/ocr'; 
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData,
    });

    onProgress({ status: "Processing", progress: 0.7 });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error details:', errorText);
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    onProgress({ status: "Finalizing", progress: 0.9 });

    // 4. Parse Result
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
    console.error("OCR API Failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred.";
    throw new Error(errorMessage);
  }
};