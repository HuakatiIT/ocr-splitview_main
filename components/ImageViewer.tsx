import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ImageViewerProps {
  imageUrl: string | null;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl }) => {
  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-industrial-50 text-industrial-400">
        <div className="p-4 rounded-full bg-industrial-100 mb-4">
          <ImageIcon size={48} className="opacity-50" />
        </div>
        <p className="text-sm font-medium">No Image Selected</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full w-full bg-industrial-50 p-4 relative overflow-hidden">
        {/* Subtle grid background for the 'design tool' feel */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.05]" 
          style={{
            backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
            backgroundSize: '20px 20px'
          }}
        ></div>
        
        <img 
          src={imageUrl} 
          alt="Original" 
          className="max-w-full max-h-full object-contain shadow-2xl rounded-sm border border-gray-200 relative z-10" 
        />
        
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-xs px-2 py-1 rounded border border-gray-200 shadow-sm text-gray-500 z-20">
            Original Preview
        </div>
    </div>
  );
};

export default ImageViewer;
