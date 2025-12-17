// OCR service: call backend gateway without requiring a user/developer key

interface OcrProgress {
  status: string;
  progress: number;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const GATEWAY_URL = `${BASE_URL}/v1/ocr`;

export const processImage = async (
  imageUrl: string,
  onProgress: (progress: OcrProgress) => void
): Promise<{ text: string; confidence: number }> => {
  // No developer key required
  try {
    onProgress({ status: "Preparing Image", progress: 0.1 });
    const imageRes = await fetch(imageUrl);
    const blob = await imageRes.blob();

    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    onProgress({ status: "Uploading to Server", progress: 0.3 });

    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      body: formData,
    });

    onProgress({ status: "Processing", progress: 0.7 });

    if (!response.ok) {
      let errorMsg = `API Error ${response.status}`;
      const errorText = await response.text();
      if (errorText) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) errorMsg = errorData.error;
          if (errorData.message) errorMsg += `: ${errorData.message}`;
        } catch {
          errorMsg = errorText;
        }
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    onProgress({ status: "Finalizing", progress: 0.9 });

    const extractedTexts: string[] = [];

    if (result.results && Array.isArray(result.results)) {
      for (const pageResult of result.results) {
        if (pageResult.success && pageResult.message) {
          let content = pageResult.message.choices?.[0]?.message?.content || "";
          try {
            const parsedContent = JSON.parse(content);
            content = parsedContent.natural_text || content;
          } catch {}
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
