import React, { useEffect, useState } from 'react';
import { X, Clock, FileText, Trash2, ChevronRight, Calendar, AlertTriangle } from 'lucide-react';
import { OcrHistoryItem } from '../types';
import { getUserHistory, deleteHistoryItem, clearUserHistory } from '../services/historyService';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSelectHistory: (item: OcrHistoryItem) => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ isOpen, onClose, userId, onSelectHistory }) => {
  const [history, setHistory] = useState<OcrHistoryItem[]>([]);
  // เพิ่ม State สำหรับ Modal ยืนยันการลบ
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadHistory = () => {
    setHistory(getUserHistory(userId));
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, userId]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteHistoryItem(id);
    loadHistory();
  };

  // เปลี่ยนจาก confirm() เป็นเปิด Modal
  const requestClearAll = () => {
    setShowClearConfirm(true);
  };

  // ฟังก์ชันลบจริง (ทำงานเมื่อกดปุ่มแดงใน Modal)
  const executeClearAll = () => {
    clearUserHistory(userId);
    loadHistory();
    setShowClearConfirm(false); // ปิด Modal
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* --- Clear History Confirmation Modal (เพิ่มใหม่) --- */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop ซ้อนอีกชั้นสำหรับ Modal */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}></div>
          
          <div className="bg-industrial-900 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-sm p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative z-10">
             <div className="bg-red-950/30 p-5 border-b border-red-500/10 flex items-start gap-4">
                <div className="p-2 bg-red-500/10 rounded-full border border-red-500/20">
                    <Trash2 size={20} className="text-red-500" />
                </div>
                <div>
                    <h3 className="text-base font-bold text-white">Clear Entire History?</h3>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        This action will <span className="text-red-400 font-medium">permanently delete</span> all your scan history records.
                    </p>
                </div>
             </div>
             
             <div className="p-5 bg-industrial-900">
                <p className="text-xs text-gray-400 bg-industrial-950 p-3 rounded border border-industrial-800 mb-4">
                   You will not be able to recover these records or their extracted text.
                </p>
                
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => setShowClearConfirm(false)}
                        className="px-3 py-1.5 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-xs font-medium"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={executeClearAll}
                        className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-red-900/20 transition-all"
                    >
                        Yes, Clear All
                    </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Sidebar Panel */}
      <div 
        className={`fixed top-0 right-0 h-full w-full md:w-96 bg-industrial-950 border-l border-industrial-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-industrial-800 bg-industrial-900">
            <div className="flex items-center gap-2">
              <Clock className="text-blue-500" size={20} />
              <h2 className="text-xl font-bold text-gray-100">Scan History</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-industrial-800 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500 mt-10">
                <FileText size={48} className="opacity-20 mb-4" />
                <p>No history found.</p>
                <p className="text-xs mt-1">Scans will appear here.</p>
              </div>
            ) : (
              history.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => {
                    onSelectHistory(item);
                    onClose();
                  }}
                  className="group relative bg-industrial-900/50 hover:bg-industrial-800 border border-industrial-800 hover:border-blue-500/50 rounded-xl p-4 cursor-pointer transition-all duration-200"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-gray-200 truncate max-w-[200px]" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(item.timestamp).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                     <span className="text-[10px] uppercase tracking-wider font-mono text-industrial-500 bg-industrial-950 px-2 py-0.5 rounded border border-industrial-800">
                        {item.modelUsed || 'Typhoon'}
                     </span>
                     <ChevronRight size={14} className="text-blue-500 opacity-0 group-hover:opacity-100 transform translate-x-[-5px] group-hover:translate-x-0 transition-all" />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {history.length > 0 && (
            <div className="p-4 border-t border-industrial-800 bg-industrial-900">
              <button
                onClick={requestClearAll}
                className="w-full py-2 flex items-center justify-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors text-sm font-medium border border-transparent hover:border-red-500/30"
              >
                <Trash2 size={16} />
                Clear Entire History
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default HistorySidebar;