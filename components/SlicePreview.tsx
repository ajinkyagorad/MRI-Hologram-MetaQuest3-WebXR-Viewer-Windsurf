
import React, { useEffect, useRef } from 'react';
import { NiftiData } from '../types';

interface SlicePreviewProps {
  data: NiftiData;
  axis: 'x' | 'y' | 'z';
  sliceIndex: number;
  label: string;
  color?: string;
}

const SlicePreview: React.FC<SlicePreviewProps> = ({ data, axis, sliceIndex, label, color = "#94a3b8" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const [nx, ny, nz] = data.dims;
    let width = 0, height = 0;

    if (axis === 'z') { width = nx; height = ny; }
    else if (axis === 'y') { width = nx; height = nz; }
    else { width = ny; height = nz; }

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Parse color
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;

    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        let idx = 0;
        if (axis === 'z') idx = i + j * nx + sliceIndex * nx * ny;
        else if (axis === 'y') idx = i + sliceIndex * nx + j * nx * ny;
        else idx = sliceIndex + i * nx + j * nx * ny;

        const val = data.data[idx] || 0;
        const outIdx = (i + (height - 1 - j) * width) * 4;
        
        // Boost contrast for clinical preview
        const boost = val > 10 ? 1.2 : 1.0;
        pixels[outIdx] = val * r * boost;     
        pixels[outIdx + 1] = val * g * boost; 
        pixels[outIdx + 2] = val * b * boost; 
        pixels[outIdx + 3] = 255; // Solid background for clarity
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [data, axis, sliceIndex, color]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative group">
        <div className="absolute -inset-1 bg-slate-500/10 blur-xl rounded-2xl group-hover:bg-teal-500/20 transition-all duration-500" />
        <div className="p-3 rounded-2xl border border-slate-700/50 bg-slate-900 shadow-2xl relative overflow-hidden">
          <canvas 
            ref={canvasRef} 
            className="w-40 h-40 md:w-56 md:h-56 rounded-lg object-contain bg-slate-950"
          />
        </div>
      </div>
      <div className="bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-700">
        <span className="text-[10px] text-slate-300 font-mono tracking-widest uppercase font-semibold">{label}</span>
      </div>
    </div>
  );
};

export default SlicePreview;
