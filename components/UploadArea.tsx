
import React, { useCallback } from 'react';
import { UploadCloud, FileImage, Files } from 'lucide-react';

interface UploadAreaProps {
  onFilesSelect: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const UploadArea: React.FC<UploadAreaProps> = ({ onFilesSelect, onError, disabled }) => {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const validateAndSelect = (files: FileList | File[]) => {
    const validFiles: File[] = [];
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        onError(`Skipped ${file.name}: Unsupported format. Use PNG, JPG, or BMP.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        onError(`Skipped ${file.name}: Exceeds 10MB limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files);
    }
  }, [onFilesSelect, onError, disabled]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files);
      e.target.value = ''; 
    }
  }, [onFilesSelect, onError]);

  return (
    <label 
      className={`
        relative flex flex-col items-center justify-center w-full h-32 md:h-full
        border-2 border-dashed rounded-lg cursor-pointer transition-all duration-300
        ${isDragOver 
          ? 'border-blue-500 bg-blue-500/10' 
          : 'border-industrial-700 bg-industrial-900 hover:bg-industrial-800 hover:border-industrial-500'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6">
        {isDragOver ? (
           <Files className="w-8 h-8 mb-2 text-blue-400" />
        ) : (
           <UploadCloud className="w-8 h-8 mb-2 text-gray-400" />
        )}
        <p className="mb-2 text-sm text-gray-400 font-mono text-center">
          <span className="font-semibold text-gray-200">Click to upload</span> or drag images
        </p>
        <p className="text-xs text-gray-500">Supports Single or Batch Upload (Max 10MB)</p>
      </div>
      <input 
        type="file" 
        className="hidden" 
        accept="image/*"
        multiple // Enable multiple selection
        onChange={handleInputChange}
        disabled={disabled}
      />
    </label>
  );
};

export default UploadArea;
