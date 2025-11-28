import { OcrHistoryItem, OcrResult } from '../types';

const HISTORY_KEY = 'ocr_app_history';
const MAX_HISTORY_ITEMS = 10; // Reduced limit because images take up a lot of space

// Helper to get all history
const getFullHistory = (): OcrHistoryItem[] => {
  const json = localStorage.getItem(HISTORY_KEY);
  return json ? JSON.parse(json) : [];
};

export const getUserHistory = (userId: string): OcrHistoryItem[] => {
  const allHistory = getFullHistory();
  // Return filtered by user, sorted by newest first
  return allHistory
    .filter(item => item.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const saveHistoryItem = (
  userId: string,
  fileName: string,
  result: OcrResult,
  modelUsed: string,
  imageBase64: string // New parameter
): void => {
  try {
    const allHistory = getFullHistory();
    
    const newItem: OcrHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      fileName,
      timestamp: new Date().toISOString(),
      result,
      modelUsed,
      imageBase64
    };

    // Filter by user
    let userHistory = allHistory.filter(h => h.userId === userId);
    const otherHistory = allHistory.filter(h => h.userId !== userId);

    // Add new item to front
    userHistory = [newItem, ...userHistory];

    // Attempt to save. If it fails (QuotaExceeded), remove oldest items recursively
    while (true) {
      // Enforce max item limit first
      if (userHistory.length > MAX_HISTORY_ITEMS) {
        userHistory = userHistory.slice(0, MAX_HISTORY_ITEMS);
      }

      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify([...userHistory, ...otherHistory]));
        break; // Success
      } catch (e: any) {
        // Check if error is quota related
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          if (userHistory.length > 1) {
            // Remove oldest item and try again
            userHistory.pop();
          } else {
            // Cannot save even one item (image too big?), give up
            console.error("Storage full, cannot save history item.");
            break;
          }
        } else {
          throw e;
        }
      }
    }
  } catch (error) {
    console.error("Failed to save history", error);
  }
};

export const deleteHistoryItem = (itemId: string): void => {
  const allHistory = getFullHistory();
  const updatedHistory = allHistory.filter(item => item.id !== itemId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
};

export const clearUserHistory = (userId: string): void => {
  const allHistory = getFullHistory();
  const updatedHistory = allHistory.filter(item => item.userId !== userId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
};