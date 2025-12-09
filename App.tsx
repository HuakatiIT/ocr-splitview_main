
import React, { useState, useEffect } from 'react';
import { Download, ScanLine, AlertCircle, CheckCircle2, Loader2, RefreshCw, X, Settings as SettingsIcon, LogOut, Shield, History, Play, Image as ImageIcon, Check, Trash2, Files, FileText } from 'lucide-react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { processImage } from './services/ocrService';
import { getCurrentUser, logout } from './services/authService';
import { saveHistoryItem } from './services/historyService';
import { OcrResult, ProcessingState, UploadedFile, User, OcrHistoryItem, BatchItem } from './types';
import JsonViewer from './components/JsonViewer';
import ImageViewer from './components/ImageViewer';
import UploadArea from './components/UploadArea';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import HistorySidebar from './components/HistorySidebar';

type ViewMode = 'ocr' | 'settings' | 'login' | 'register' | 'admin' | 'loading';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  
  // Single Mode State
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
    message: 'Ready',
  });
  const [ocrResult, setOcrResult] = useState<OcrResult>({
    status: 'idle',
    timestamp: new Date().toISOString(),
    extracted_text: null,
  });

  // Batch Mode State
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Authentication Check Effect
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = getCurrentUser();
        if (user) {
          setCurrentUser(user);
          setViewMode('ocr');
        } else {
          setViewMode('login');
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        setViewMode('login');
      }
    };
    checkAuth();
  }, []);

  const handleError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage((prev) => (prev === msg ? null : prev));
    }, 8000);
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    handleReset();
    setViewMode('login');
  };

  const handleReset = () => {
    if (uploadedFile?.previewUrl) URL.revokeObjectURL(uploadedFile.previewUrl);
    batchQueue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    
    setUploadedFile(null);
    setBatchQueue([]);
    setOcrResult({ status: 'idle', timestamp: new Date().toISOString(), extracted_text: null });
    setProcessingState({ status: 'idle', progress: 0, message: 'Ready' });
    setIsBatchProcessing(false);
    setErrorMessage(null);
  };

  const handleFilesSelect = (files: File[]) => {
    setErrorMessage(null);

    if (files.length === 1 && batchQueue.length === 0) {
      if (uploadedFile?.previewUrl) URL.revokeObjectURL(uploadedFile.previewUrl);
      const newPreviewUrl = URL.createObjectURL(files[0]);
      setUploadedFile({ file: files[0], previewUrl: newPreviewUrl, fromHistory: false });
      setOcrResult({ status: 'pending', timestamp: new Date().toISOString(), extracted_text: null });
      setProcessingState({ status: 'loading', progress: 0, message: 'Initializing...' });
    } else {
      let currentQueue = [...batchQueue];
      if (uploadedFile) {
        currentQueue.push({
          id: `batch-${Date.now()}-init`,
          file: uploadedFile.file,
          previewUrl: uploadedFile.previewUrl,
          status: 'success', 
          progress: 0,
          result: ocrResult.extracted_text ? ocrResult : undefined
        });
        setUploadedFile(null);
      }

      const newItems: BatchItem[] = files.map(f => ({
        id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'idle',
        progress: 0
      }));

      setBatchQueue([...currentQueue, ...newItems]);
    }
  };

  useEffect(() => {
    if (!uploadedFile || batchQueue.length > 0) return;
    if (uploadedFile.fromHistory) return;

    let isMounted = true;

    const runOcr = async () => {
      try {
        const { text, confidence } = await processImage(
          uploadedFile.previewUrl,
          (prog) => {
            if (isMounted) {
              const pct = Math.round(prog.progress * 100);
              setProcessingState({
                status: 'loading',
                progress: pct,
                message: prog.status
              });
            }
          }
        );

        if (isMounted) {
          const result: OcrResult = {
            status: 'success',
            timestamp: new Date().toISOString(),
            extracted_text: text.trim(),
            confidence: confidence,
            filename: uploadedFile.file.name
          };

          setOcrResult(result);
          setProcessingState({ status: 'success', progress: 100, message: 'Complete' });

          if (currentUser) {
             const settings = localStorage.getItem('ocr_app_settings');
             const modelName = settings ? JSON.parse(settings).model : 'typhoon-ocr';
             const reader = new FileReader();
             reader.readAsDataURL(uploadedFile.file);
             reader.onloadend = () => {
                 const base64data = reader.result as string;
                 saveHistoryItem(currentUser.id, uploadedFile.file.name, result, modelName, base64data);
             };
          }
        }
      } catch (error: any) {
        if (isMounted) {
          const errorMsg = error.message || 'Failed to extract text.';
          setOcrResult({
            status: 'error',
            timestamp: new Date().toISOString(),
            extracted_text: null,
            error: errorMsg,
          });
          setProcessingState({ status: 'error', progress: 0, message: 'Failed' });
          handleError(errorMsg);
        }
      }
    };

    runOcr();
    return () => { isMounted = false; };
  }, [uploadedFile]);

  const runBatchProcessing = async () => {
    if (isBatchProcessing) return;
    setIsBatchProcessing(true);

    for (let i = 0; i < batchQueue.length; i++) {
      const item = batchQueue[i];
      if (item.status === 'success' || item.status === 'error') continue;

      setBatchQueue(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'processing', progress: 0 } : it));

      try {
        const { text, confidence } = await processImage(
          item.previewUrl,
          (prog) => {
             const pct = Math.round(prog.progress * 100);
             setBatchQueue(prev => prev.map((it, idx) => idx === i ? { ...it, progress: pct } : it));
          }
        );

        const result: OcrResult = {
          status: 'success',
          timestamp: new Date().toISOString(),
          extracted_text: text.trim(),
          confidence: confidence,
          filename: item.file.name
        };

        setBatchQueue(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'success', progress: 100, result } : it));

      } catch (error: any) {
        setBatchQueue(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'error', progress: 0, errorMsg: error.message } : it));
      }
    }

    setIsBatchProcessing(false);
    
    if (currentUser) {
        const successfulResults = batchQueue
            .filter(i => i.status === 'success' && i.result)
            .map(i => i.result as OcrResult);
        
        if (successfulResults.length > 0) {
            const settings = localStorage.getItem('ocr_app_settings');
            const modelName = settings ? JSON.parse(settings).model : 'typhoon-ocr';
            const firstItem = batchQueue.find(i => i.status === 'success');
            if (firstItem) {
                 try {
                    const res = await fetch(firstItem.previewUrl);
                    const blob = await res.blob();
                    const reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = () => {
                        const base64data = reader.result as string;
                        saveHistoryItem(currentUser.id, `Batch Scan (${successfulResults.length} files)`, successfulResults as any, modelName, base64data);
                    };
                 } catch (e) { console.error("Failed to save batch history image"); }
            }
        }
    }
  };

  const removeFromQueue = (id: string) => {
    setBatchQueue(prev => prev.filter(i => i.id !== id));
  };

  const getBatchResults = () => {
    return batchQueue.map(item => ({
      filename: item.file.name,
      status: item.status,
      text: item.result?.extracted_text || null,
      error: item.errorMsg || null
    }));
  };

  const handleHistorySelect = async (item: OcrHistoryItem) => {
    if (Array.isArray(item.result)) {
        setBatchQueue([]); 
        setUploadedFile(null);
        setOcrResult({
            status: 'success',
            timestamp: item.timestamp,
            extracted_text: JSON.stringify(item.result, null, 2)
        });
    } else {
        setBatchQueue([]);
        setOcrResult(item.result);
        setProcessingState({ status: 'success', progress: 100, message: 'Restored' });
        
        if (item.imageBase64) {
            try {
                const res = await fetch(item.imageBase64);
                const blob = await res.blob();
                const file = new File([blob], item.fileName, { type: blob.type });
                const previewUrl = URL.createObjectURL(file);
                setUploadedFile({ file, previewUrl, fromHistory: true });
            } catch (e) {
                setUploadedFile(null);
            }
        } else {
            setUploadedFile(null);
        }
    }
  };

  const handleDownloadJson = () => {
    const dataToDownload = batchQueue.length > 0 ? getBatchResults() : ocrResult;
    const jsonString = JSON.stringify(dataToDownload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const createSearchablePdf = async (rawText: unknown, imageUrl?: string | null, imageFile?: File | null) => {
    const safeText = typeof rawText === 'string' ? rawText : JSON.stringify(rawText ?? '', null, 2);
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    const lineHeight = fontSize * 1.4;
    const margin = 24;
    const defaultPage = { width: 595, height: 842 }; // A4-ish

    let embeddedImage: any = null;
    let imageDims = { ...defaultPage };

    const tryEmbed = async (bytes: ArrayBuffer) => {
      try {
        embeddedImage = await pdfDoc.embedPng(bytes);
      } catch {
        embeddedImage = await pdfDoc.embedJpg(bytes);
      }
      imageDims = { width: embeddedImage.width, height: embeddedImage.height };
      return true;
    };

    let embedded = false;

    if (imageFile) {
      try {
        const fileBytes = await imageFile.arrayBuffer();
        embedded = await tryEmbed(fileBytes);
      } catch (err) {
        console.warn('Failed to embed image file, will try URL', err);
      }
    }

    if (!embedded && imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        const imgBytes = await imgRes.arrayBuffer();
        embedded = await tryEmbed(imgBytes);
      } catch (err) {
        console.warn('Failed to embed image for PDF, falling back to text-only', err);
      }
    }

    // scale image to fit within default A4 if larger
    const fitScale = Math.min(
      defaultPage.width / imageDims.width,
      defaultPage.height / imageDims.height,
      1
    );
    const pageWidth = embeddedImage ? imageDims.width * fitScale : defaultPage.width;
    const pageHeight = embeddedImage ? imageDims.height * fitScale : defaultPage.height;
    const textOpacity = embeddedImage ? 0.02 : 1;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    if (embeddedImage) {
      page.drawImage(embeddedImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    }

    let y = page.getHeight() - margin;
    const getMaxWidth = () => page.getWidth() - margin * 2;

    const encodeSafe = (line: string) => {
      try {
        font.encodeText(line);
        return line;
      } catch {
        // pdf-lib standard fonts can't encode some glyphs (e.g., Thai); keep ASCII to avoid crash
        return line.replace(/[^\x20-\x7E]+/g, '?');
      }
    };

    const addLine = (line: string) => {
      if (y <= margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        if (embeddedImage) {
          page.drawImage(embeddedImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        }
        y = page.getHeight() - margin;
      }
      const printable = encodeSafe(line);
      if (!printable) {
        y -= lineHeight;
        return;
      }
      page.drawText(printable, { x: margin, y, size: fontSize, font, opacity: textOpacity });
      y -= lineHeight;
    };

    const wrapAndAdd = (line: string) => {
      if (!line.trim()) {
        y -= lineHeight / 2;
        return;
      }
      const words = line.split(/\s+/);
      let current = '';
      words.forEach((word) => {
        const safeWord = encodeSafe(word);
        if (!safeWord) return;
        const candidateRaw = current ? `${current} ${safeWord}` : safeWord;
        const width = font.widthOfTextAtSize(candidateRaw, fontSize);
        if (width > getMaxWidth() && current) {
          addLine(current);
          current = safeWord;
        } else {
          current = candidateRaw;
        }
      });
      if (current) addLine(current);
    };

    safeText.split(/\r?\n/).forEach(wrapAndAdd);
    return pdfDoc.save();
  };

  const handleDownloadPdf = async () => {
    try {
      const text = isBatchMode
        ? getBatchResults()
            .map((item, idx) => {
              const title = item.filename ? `${idx + 1}. ${item.filename}` : `${idx + 1}. Item`;
              const status = `Status: ${item.status}`;
              const body = item.text || '';
              return `${title}\n${status}\n${body}`;
            })
            .join('\n\n')
        : (ocrResult.extracted_text || '');

      if (!text) {
        handleError('No OCR text available to export');
        return;
      }

      const pdfBytes = await createSearchablePdf(text, uploadedFile?.previewUrl || null, uploadedFile?.file || null);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocr-result-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      handleError('Failed to generate PDF');
    }
  };

  // --- Views ---

  if (viewMode === 'loading') {
    return <div className="h-screen bg-industrial-950 flex items-center justify-center text-gray-500">Loading...</div>;
  }

  if (viewMode === 'login') {
    return <LoginPage onLoginSuccess={(user) => { setCurrentUser(user); setViewMode('ocr'); }} onNavigateToRegister={() => setViewMode('register')} />;
  }

  if (viewMode === 'register') {
    return <RegisterPage onNavigateToLogin={() => setViewMode('login')} />;
  }

  // Ensure user is authenticated for protected views
  if (!currentUser) {
     return <LoginPage onLoginSuccess={(user) => { setCurrentUser(user); setViewMode('ocr'); }} onNavigateToRegister={() => setViewMode('register')} />;
  }

  if (viewMode === 'settings') {
    return <SettingsPage onBack={() => setViewMode('ocr')} />;
  }

  if (viewMode === 'admin') {
    return <AdminDashboard onBack={() => setViewMode('ocr')} />;
  }

  const isBatchMode = batchQueue.length > 0;

  return (
    <div className="flex flex-col h-screen bg-industrial-950 text-white overflow-hidden selection:bg-blue-500 selection:text-white relative">
      
      <HistorySidebar 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)}
        userId={currentUser.id}
        onSelectHistory={handleHistorySelect}
      />

      {errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3 p-4 bg-red-950/95 border border-red-500/50 rounded-lg shadow-2xl backdrop-blur-md text-red-100">
            <AlertCircle className="flex-shrink-0 text-red-500 mt-0.5" size={20} />
            <div className="flex-1 text-sm">
              <h3 className="font-semibold text-red-400 mb-1">Error</h3>
              <p className="opacity-90 leading-relaxed">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white transition-colors"><X size={18} /></button>
          </div>
        </div>
      )}

      <header className="h-16 flex-none bg-industrial-900 border-b border-industrial-800 flex items-center justify-between px-6 z-30 relative">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-md"><ScanLine size={20} className="text-white" /></div>
          <h1 className="font-bold text-lg tracking-tight text-gray-100">OCR SplitView {isBatchMode && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded ml-2 border border-blue-900/50">BATCH MODE</span>}</h1>
        </div>
        
        {!isBatchMode && processingState.status === 'loading' && (
          <div className="flex items-center gap-3 bg-industrial-800 px-4 py-1.5 rounded-full border border-industrial-700">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span className="text-xs font-mono text-gray-300 min-w-[120px] text-right">{processingState.message}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
            {currentUser.role === 'admin' && (
              <button onClick={() => setViewMode('admin')} className="flex items-center gap-2 px-3 py-1.5 bg-industrial-800 hover:bg-industrial-700 border border-industrial-700 text-blue-400 rounded-lg transition-all text-sm font-medium">
                <Shield size={16} /> Admin
              </button>
            )}
            <div className="h-6 w-px bg-industrial-800 mx-1"></div>
            <button onClick={() => setIsHistoryOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-industrial-800 rounded-lg transition-all" title="History"><History size={20} /></button>
            <button onClick={() => setViewMode('settings')} className="p-2 text-gray-400 hover:text-white hover:bg-industrial-800 rounded-lg transition-all" title="Settings"><SettingsIcon size={20} /></button>
            <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-400 hover:bg-industrial-800 rounded-lg transition-all" title="Sign Out"><LogOut size={20} /></button>
        </div>

        {!isBatchMode && processingState.status === 'loading' && (
          <div className="absolute bottom-0 left-0 w-full h-0.5 bg-industrial-800">
            <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-300 ease-out" style={{ width: `${processingState.progress}%` }} />
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {!uploadedFile && !isBatchMode && !ocrResult.extracted_text && (
           <div className="absolute inset-0 z-20 bg-industrial-950/80 backdrop-blur-sm flex items-center justify-center p-8">
              <div className="w-full max-w-lg h-64">
                <UploadArea onFilesSelect={handleFilesSelect} onError={handleError} />
              </div>
           </div>
        )}

        <section className={`flex-1 min-h-[50%] md:min-h-0 md:h-full relative transition-all duration-500 ${(!uploadedFile && !isBatchMode && !ocrResult.extracted_text) ? 'opacity-20 blur-sm' : ''}`}>
          <JsonViewer 
            data={isBatchMode ? getBatchResults() : (ocrResult.extracted_text && ocrResult.extracted_text.startsWith('[') ? JSON.parse(ocrResult.extracted_text) : ocrResult)} 
            title={isBatchMode ? `Batch Results (${batchQueue.filter(i => i.status === 'success').length}/${batchQueue.length})` : 'JSON Output'} 
          />
          {!isBatchMode && (
            <div className="absolute bottom-4 left-4">
               {processingState.status === 'error' && <span className="flex items-center gap-2 text-red-400 text-xs font-mono bg-red-900/20 px-2 py-1 rounded border border-red-900/50"><AlertCircle size={14} /> Failed</span>}
               {processingState.status === 'success' && <span className="flex items-center gap-2 text-green-400 text-xs font-mono bg-green-900/20 px-2 py-1 rounded border border-green-900/50"><CheckCircle2 size={14} /> Extracted</span>}
            </div>
          )}
        </section>

        <section className="flex-1 min-h-[50%] md:min-h-0 md:h-full bg-industrial-100 border-l border-industrial-800 relative shadow-inner flex flex-col">
           {isBatchMode ? (
             <div className="flex-1 overflow-y-auto p-4 bg-industrial-900 space-y-3">
                <div className="flex items-center justify-between mb-4 px-2">
                   <h3 className="text-gray-300 font-medium flex items-center gap-2"><Files size={18} /> Processing Queue</h3>
                   <span className="text-xs text-gray-500">{batchQueue.length} items</span>
                </div>
                
                {batchQueue.map((item, idx) => (
                  <div key={item.id} className="bg-industrial-950 border border-industrial-800 rounded-lg p-3 flex items-center gap-4 group">
                     <div className="w-12 h-12 bg-industrial-900 rounded border border-industrial-800 overflow-hidden flex-shrink-0">
                        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-1">
                           <span className="text-sm text-gray-300 truncate">{item.file.name}</span>
                           <span className={`text-xs font-mono ${
                             item.status === 'success' ? 'text-green-400' : 
                             item.status === 'error' ? 'text-red-400' : 
                             item.status === 'processing' ? 'text-blue-400' : 'text-gray-500'
                           }`}>
                             {item.status.toUpperCase()}
                           </span>
                        </div>
                        <div className="w-full h-1.5 bg-industrial-800 rounded-full overflow-hidden">
                           <div 
                             className={`h-full transition-all duration-300 ${
                               item.status === 'success' ? 'bg-green-500' : 
                               item.status === 'error' ? 'bg-red-500' : 
                               'bg-blue-500'
                             }`} 
                             style={{ width: `${item.progress}%` }}
                           />
                        </div>
                     </div>
                     <button 
                        onClick={() => removeFromQueue(item.id)} 
                        disabled={item.status === 'processing'}
                        className="p-1 text-gray-600 hover:text-red-400 disabled:opacity-20 transition-colors"
                     >
                       <X size={16} />
                     </button>
                  </div>
                ))}

                <div className="h-24 border-2 border-dashed border-industrial-800 rounded-lg flex items-center justify-center text-gray-600 hover:border-industrial-600 hover:text-gray-400 transition-colors relative">
                   <span className="text-xs">Drop more files here</span>
                   <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      accept="image/*" 
                      multiple
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                           handleFilesSelect(Array.from(e.target.files));
                           e.target.value = '';
                        }
                      }}
                   />
                </div>
             </div>
           ) : (
             <>
               {!uploadedFile && ocrResult.extracted_text ? (
                  <div className="flex flex-col items-center justify-center h-full text-industrial-400 text-sm">
                      <div className="p-4 bg-industrial-200 rounded-full mb-2"><History size={32} className="opacity-50" /></div>
                      <p>Restored from history</p>
                      <p className="text-xs text-industrial-500 mt-1">(Image not available)</p>
                  </div>
               ) : (
                  <ImageViewer imageUrl={uploadedFile?.previewUrl || null} />
               )}
               
               {(uploadedFile || ocrResult.extracted_text) && (
                 <div className="absolute top-4 right-4 z-20 group">
                    <label className="flex items-center justify-center w-10 h-10 bg-white/90 rounded-full shadow-lg border border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors">
                      <RefreshCw size={16} className="text-gray-600 group-hover:text-blue-600 group-hover:rotate-180 transition-all duration-500" />
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        multiple
                        onChange={(e) => {
                           if (e.target.files && e.target.files.length > 0) {
                             handleFilesSelect(Array.from(e.target.files));
                           }
                        }} 
                      />
                    </label>
                 </div>
               )}
             </>
           )}
        </section>

      </main>

      <footer className="h-16 flex-none bg-industrial-900 border-t border-industrial-800 flex items-center justify-between px-6 z-40">
        <div className="text-xs text-gray-500 font-mono flex items-center gap-4">
          <span>{currentUser.email}</span>
          <span className="text-industrial-700">|</span>
          <span className="hidden md:inline">
            {isBatchMode 
              ? `Batch: ${batchQueue.length} files` 
              : (uploadedFile ? uploadedFile.file.name : (ocrResult.extracted_text ? 'History Record' : 'No file'))
            }
          </span>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
           {isBatchMode && (
             <button
                onClick={runBatchProcessing}
                disabled={isBatchProcessing || batchQueue.every(i => i.status === 'success')}
                className="flex items-center gap-2 px-6 py-2 rounded font-medium text-sm bg-green-600 text-white hover:bg-green-500 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
             >
                {isBatchProcessing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                {isBatchProcessing ? 'Processing...' : 'Process Batch'}
             </button>
           )}

           <button 
             onClick={handleReset}
             disabled={!uploadedFile && !ocrResult.extracted_text && !isBatchMode}
             className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
           >
             Clear
           </button>
           
           <button
             onClick={handleDownloadPdf}
             disabled={isBatchMode ? !batchQueue.some(i => i.status === 'success') : processingState.status !== 'success'}
             className={`
               flex items-center gap-2 px-6 py-2 rounded font-medium text-sm transition-all
               ${(isBatchMode ? batchQueue.some(i => i.status === 'success') : processingState.status === 'success') 
                 ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.3)]' 
                 : 'bg-industrial-800 text-gray-500 cursor-not-allowed'}
             `}
           >
             <FileText size={16} />
             Download Textable PDF
           </button>

           <button
             onClick={handleDownloadJson}
             disabled={isBatchMode ? !batchQueue.some(i => i.status === 'success') : processingState.status !== 'success'}
             className={`
               flex items-center gap-2 px-6 py-2 rounded font-medium text-sm transition-all
               ${(isBatchMode ? batchQueue.some(i => i.status === 'success') : processingState.status === 'success') 
                 ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                 : 'bg-industrial-800 text-gray-500 cursor-not-allowed'}
             `}
           >
             <Download size={16} />
             Download JSON
           </button>
        </div>
      </footer>
    </div>
  );
};

export default App;
