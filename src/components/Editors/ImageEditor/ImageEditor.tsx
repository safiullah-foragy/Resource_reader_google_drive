import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  RotateCw, 
  RotateCcw,
  FlipHorizontal, 
  FlipVertical, 
  Check, 
  X,
  Undo2
} from 'lucide-react';
import { DriveFile } from '../../../types';

interface ImageEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

type CropAspect = 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '9:16';

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  file,
  arrayBuffer,
  onModify,
  onHasUnsavedChanges,
}) => {
  // Image & History
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [history, setHistory] = useState<HTMLImageElement[]>([]);
  const [scale, setScale] = useState<number>(1);

  // Rotation & Flip
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);

  // Crop Box & State
  const [cropAspect, setCropAspect] = useState<CropAspect>('free');
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; box: CropBox } | null>(null);

  // Auto-fit image strictly inside viewport boundaries without any scrolling
  const calculateFitScale = useCallback((img: HTMLImageElement, rot: number = rotation) => {
    const viewport = viewportRef.current;
    const isRotated = rot % 180 !== 0;
    const imgW = isRotated ? (img.naturalHeight || 800) : (img.naturalWidth || 800);
    const imgH = isRotated ? (img.naturalWidth || 600) : (img.naturalHeight || 600);

    const padX = 32;
    const padY = 32;
    const availW = (viewport && viewport.clientWidth > 60) ? (viewport.clientWidth - padX) : (window.innerWidth - 300);
    const availH = (viewport && viewport.clientHeight > 60) ? (viewport.clientHeight - padY) : (window.innerHeight - 200);

    const scaleX = availW / imgW;
    const scaleY = availH / imgH;
    return Math.min(scaleX, scaleY, 1.0);
  }, [rotation]);

  // Load image element from ArrayBuffer / Blob
  useEffect(() => {
    let isCancelled = false;
    const blob = file.rawBlob || new Blob([arrayBuffer], { type: file.mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    const handleLoaded = async () => {
      try {
        if ('decode' in img) {
          await img.decode();
        }
      } catch (e) {}
      if (!isCancelled) {
        setImgElement(img);
        setHistory([img]);
        const fitScale = calculateFitScale(img, 0);
        setScale(fitScale);

        // Default crop box covers 90% of image centered
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;
        setCropBox({
          x: Math.round(w * 0.05),
          y: Math.round(h * 0.05),
          width: Math.round(w * 0.9),
          height: Math.round(h * 0.9),
        });
      }
      URL.revokeObjectURL(url);
    };

    img.onload = handleLoaded;
    img.onerror = (err) => {
      console.error('Failed to load image:', err);
      URL.revokeObjectURL(url);
    };
    img.src = url;

    return () => {
      isCancelled = true;
    };
  }, [arrayBuffer, file.rawBlob, file.mimeType, calculateFitScale]);

  // ResizeObserver & window resize listener to ensure zero scrolling at all times
  useEffect(() => {
    const handleResize = () => {
      if (imgElement) {
        setScale(calculateFitScale(imgElement, rotation));
      }
    };

    window.addEventListener('resize', handleResize);
    const viewport = viewportRef.current;
    let observer: ResizeObserver | null = null;

    if (viewport && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => handleResize());
      observer.observe(viewport);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
    };
  }, [imgElement, rotation, calculateFitScale]);

  // Render image to canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isRotated = rotation % 180 !== 0;
    const origW = imgElement.naturalWidth || 800;
    const origH = imgElement.naturalHeight || 600;

    canvas.width = isRotated ? origH : origW;
    canvas.height = isRotated ? origW : origH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(imgElement, -origW / 2, -origH / 2, origW, origH);
    ctx.restore();
  }, [imgElement, rotation, flipH, flipV]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Export modified image to Blob
  const exportCanvasBlob = (): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return resolve(new Blob([arrayBuffer], { type: 'image/png' }));
      }
      canvas.toBlob((blob) => {
        resolve(blob || new Blob([arrayBuffer], { type: 'image/png' }));
      }, 'image/png');
    });
  };

  // Rotate 90 degrees
  const handleRotate = (deg: number = 90) => {
    const newRot = (rotation + deg + 360) % 360;
    setRotation(newRot);
    if (imgElement) {
      setScale(calculateFitScale(imgElement, newRot));
    }
    onHasUnsavedChanges(true);

    setTimeout(async () => {
      const blob = await exportCanvasBlob();
      onModify(blob);
    }, 100);
  };

  // Flip Horizontal
  const handleFlipHorizontal = () => {
    setFlipH((v) => !v);
    onHasUnsavedChanges(true);
    setTimeout(async () => {
      const blob = await exportCanvasBlob();
      onModify(blob);
    }, 100);
  };

  // Flip Vertical
  const handleFlipVertical = () => {
    setFlipV((v) => !v);
    onHasUnsavedChanges(true);
    setTimeout(async () => {
      const blob = await exportCanvasBlob();
      onModify(blob);
    }, 100);
  };

  // Apply Aspect Ratio Constraint to Crop Box
  const handleSelectAspect = (aspect: CropAspect) => {
    setCropAspect(aspect);
    const canvas = canvasRef.current;
    if (!canvas || !cropBox) return;

    let ratio = 0;
    if (aspect === '1:1') ratio = 1;
    else if (aspect === '4:3') ratio = 4 / 3;
    else if (aspect === '16:9') ratio = 16 / 9;
    else if (aspect === '3:2') ratio = 3 / 2;
    else if (aspect === '9:16') ratio = 9 / 16;

    if (ratio > 0) {
      let newW = cropBox.width;
      let newH = Math.round(newW / ratio);

      if (newH > canvas.height * 0.95) {
        newH = Math.round(canvas.height * 0.9);
        newW = Math.round(newH * ratio);
      }

      setCropBox({
        x: Math.max(0, Math.round((canvas.width - newW) / 2)),
        y: Math.max(0, Math.round((canvas.height - newH) / 2)),
        width: Math.min(canvas.width, newW),
        height: Math.min(canvas.height, newH),
      });
    }
  };

  // Execute Crop
  const handleApplyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !cropBox || !imgElement) return;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.max(10, Math.round(cropBox.width));
    cropCanvas.height = Math.max(10, Math.round(cropBox.height));
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;

    cropCtx.drawImage(
      canvas,
      Math.max(0, cropBox.x),
      Math.max(0, cropBox.y),
      cropBox.width,
      cropBox.height,
      0,
      0,
      cropBox.width,
      cropBox.height
    );

    const croppedUrl = cropCanvas.toDataURL('image/png');
    const newImg = new Image();
    newImg.onload = () => {
      setImgElement(newImg);
      setHistory((prev) => [...prev, newImg]);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);

      const fitScale = calculateFitScale(newImg, 0);
      setScale(fitScale);

      // Reset crop box for next crop operation
      setCropBox({
        x: Math.round(newImg.naturalWidth * 0.05),
        y: Math.round(newImg.naturalHeight * 0.05),
        width: Math.round(newImg.naturalWidth * 0.9),
        height: Math.round(newImg.naturalHeight * 0.9),
      });

      cropCanvas.toBlob((blob) => {
        if (blob) {
          onModify(blob);
          onHasUnsavedChanges(true);
        }
      }, 'image/png');
    };
    newImg.src = croppedUrl;
  };

  // Undo Last Crop
  const handleUndoCrop = () => {
    if (history.length <= 1) return;
    const prevHistory = history.slice(0, -1);
    const prevImg = prevHistory[prevHistory.length - 1];
    setHistory(prevHistory);
    setImgElement(prevImg);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);

    const fitScale = calculateFitScale(prevImg, 0);
    setScale(fitScale);

    setCropBox({
      x: Math.round(prevImg.naturalWidth * 0.05),
      y: Math.round(prevImg.naturalHeight * 0.05),
      width: Math.round(prevImg.naturalWidth * 0.9),
      height: Math.round(prevImg.naturalHeight * 0.9),
    });

    onHasUnsavedChanges(prevHistory.length > 1);
  };

  // Reset Crop to Full Frame
  const handleResetCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCropBox({
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });
  };

  // Mouse Interaction for Draggable Crop Handles & Move
  const handleCropMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cropBox) return;

    setActiveHandle(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      box: { ...cropBox },
    };
  };

  const handleCropMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!activeHandle || !dragStartRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleFactor = canvas.width / rect.width;

      const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleFactor;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleFactor;
      const orig = dragStartRef.current.box;

      let { x, y, width, height } = orig;
      const minSize = 30;

      if (activeHandle === 'move') {
        x = Math.max(0, Math.min(canvas.width - width, orig.x + deltaX));
        y = Math.max(0, Math.min(canvas.height - height, orig.y + deltaY));
      } else if (activeHandle === 'nw') {
        const newW = Math.max(minSize, orig.width - deltaX);
        const newH = Math.max(minSize, orig.height - deltaY);
        x = orig.x + (orig.width - newW);
        y = orig.y + (orig.height - newH);
        width = newW;
        height = newH;
      } else if (activeHandle === 'ne') {
        width = Math.max(minSize, orig.width + deltaX);
        const newH = Math.max(minSize, orig.height - deltaY);
        y = orig.y + (orig.height - newH);
        height = newH;
      } else if (activeHandle === 'sw') {
        const newW = Math.max(minSize, orig.width - deltaX);
        x = orig.x + (orig.width - newW);
        width = newW;
        height = Math.max(minSize, orig.height + deltaY);
      } else if (activeHandle === 'se') {
        width = Math.max(minSize, orig.width + deltaX);
        height = Math.max(minSize, orig.height + deltaY);
      } else if (activeHandle === 'n') {
        const newH = Math.max(minSize, orig.height - deltaY);
        y = orig.y + (orig.height - newH);
        height = newH;
      } else if (activeHandle === 's') {
        height = Math.max(minSize, orig.height + deltaY);
      } else if (activeHandle === 'w') {
        const newW = Math.max(minSize, orig.width - deltaX);
        x = orig.x + (orig.width - newW);
        width = newW;
      } else if (activeHandle === 'e') {
        width = Math.max(minSize, orig.width + deltaX);
      }

      // Constrain inside canvas
      x = Math.max(0, Math.min(canvas.width - minSize, x));
      y = Math.max(0, Math.min(canvas.height - minSize, y));
      width = Math.min(canvas.width - x, width);
      height = Math.min(canvas.height - y, height);

      setCropBox({ x, y, width, height });
    },
    [activeHandle]
  );

  const handleCropMouseUp = useCallback(() => {
    setActiveHandle(null);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('mousemove', handleCropMouseMove);
      window.addEventListener('mouseup', handleCropMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleCropMouseMove);
        window.removeEventListener('mouseup', handleCropMouseUp);
      };
    }
  }, [activeHandle, handleCropMouseMove, handleCropMouseUp]);

  const isRotated = rotation % 180 !== 0;
  const naturalW = imgElement ? (isRotated ? (imgElement.naturalHeight || 800) : (imgElement.naturalWidth || 800)) : 800;
  const naturalH = imgElement ? (isRotated ? (imgElement.naturalWidth || 600) : (imgElement.naturalHeight || 600)) : 600;

  const displayWidth = Math.max(50, Math.round(naturalW * scale));
  const displayHeight = Math.max(50, Math.round(naturalH * scale));

  return (
    <div className="editor-container" style={{ overflow: 'hidden' }}>
      {/* Top Toolbar */}
      <div className="editor-toolbar" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
        {/* Aspect Ratio Presets */}
        <div className="toolbar-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, marginRight: '4px' }}>
              Aspect:
            </span>
            {(['free', '1:1', '4:3', '16:9', '3:2', '9:16'] as CropAspect[]).map((aspect) => (
              <button
                key={aspect}
                onClick={() => handleSelectAspect(aspect)}
                className={`tool-button ${cropAspect === aspect ? 'active' : ''}`}
                style={{ padding: '3px 10px', fontSize: '12px', textTransform: 'capitalize' }}
              >
                {aspect}
              </button>
            ))}
          </div>

          <div className="tool-divider" />

          {/* Rotate & Flip Tools */}
          <button className="tool-button" onClick={() => handleRotate(-90)} title="Rotate Left 90°">
            <RotateCcw size={16} />
            <span>-90°</span>
          </button>
          <button className="tool-button" onClick={() => handleRotate(90)} title="Rotate Right 90°">
            <RotateCw size={16} />
            <span>+90°</span>
          </button>
          <button
            className={`tool-button ${flipH ? 'active' : ''}`}
            onClick={handleFlipHorizontal}
            title="Flip Horizontal"
          >
            <FlipHorizontal size={16} />
          </button>
          <button
            className={`tool-button ${flipV ? 'active' : ''}`}
            onClick={handleFlipVertical}
            title="Flip Vertical"
          >
            <FlipVertical size={16} />
          </button>

          <div className="tool-divider" />

          {/* Undo Crop */}
          <button
            className="tool-button"
            onClick={handleUndoCrop}
            disabled={history.length <= 1}
            title="Undo Crop"
          >
            <Undo2 size={16} />
            <span>Undo</span>
          </button>

          {/* Reset Frame */}
          <button
            className="tool-button"
            onClick={handleResetCrop}
            title="Reset Crop Frame"
          >
            <X size={16} />
            <span>Reset Box</span>
          </button>
        </div>

        {/* Apply Crop Action Button */}
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <button
            className="btn-primary"
            onClick={handleApplyCrop}
            style={{
              padding: '5px 18px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#2563eb',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <Check size={16} />
            <span>Apply Crop</span>
          </button>
        </div>
      </div>

      {/* Non-scrolling Image Canvas Viewport */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          padding: '1rem',
          position: 'relative',
          background: '#0d1117',
          userSelect: 'none',
        }}
      >
        <div
          className="image-canvas-wrapper"
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            flexShrink: 0,
            margin: 'auto',
            position: 'relative',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7)',
            borderRadius: '6px',
            overflow: 'visible',
            transition: 'width 0.1s ease-out, height 0.1s ease-out',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              borderRadius: '6px',
            }}
          />

          {/* Draggable Interactive Crop Frame Overlay */}
          {cropBox && canvasRef.current && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              {/* Active Crop Box */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(cropBox.x / canvasRef.current.width) * 100}%`,
                  top: `${(cropBox.y / canvasRef.current.height) * 100}%`,
                  width: `${(cropBox.width / canvasRef.current.width) * 100}%`,
                  height: `${(cropBox.height / canvasRef.current.height) * 100}%`,
                  border: '2px solid #60a5fa',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                  cursor: 'move',
                  pointerEvents: 'all',
                }}
                onMouseDown={(e) => handleCropMouseDown(e, 'move')}
              >
                {/* Rule of Thirds Grid Lines */}
                <div style={{ position: 'absolute', top: '33.33%', left: 0, width: '100%', height: '1px', background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: '66.66%', left: 0, width: '100%', height: '1px', background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: '33.33%', top: 0, width: '1px', height: '100%', background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: '66.66%', top: 0, width: '1px', height: '100%', background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />

                {/* 4 Corner Draggable Handles */}
                <div
                  style={{ position: 'absolute', top: '-6px', left: '-6px', width: '14px', height: '14px', borderTop: '3px solid #60a5fa', borderLeft: '3px solid #60a5fa', cursor: 'nw-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'nw')}
                />
                <div
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '14px', height: '14px', borderTop: '3px solid #60a5fa', borderRight: '3px solid #60a5fa', cursor: 'ne-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'ne')}
                />
                <div
                  style={{ position: 'absolute', bottom: '-6px', left: '-6px', width: '14px', height: '14px', borderBottom: '3px solid #60a5fa', borderLeft: '3px solid #60a5fa', cursor: 'sw-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'sw')}
                />
                <div
                  style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '14px', height: '14px', borderBottom: '3px solid #60a5fa', borderRight: '3px solid #60a5fa', cursor: 'se-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'se')}
                />

                {/* 4 Mid-Edge Draggable Handles */}
                <div
                  style={{ position: 'absolute', top: '-5px', left: '50%', transform: 'translateX(-50%)', width: '18px', height: '8px', background: '#60a5fa', borderRadius: '2px', cursor: 'n-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'n')}
                />
                <div
                  style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: '18px', height: '8px', background: '#60a5fa', borderRadius: '2px', cursor: 's-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 's')}
                />
                <div
                  style={{ position: 'absolute', top: '50%', left: '-5px', transform: 'translateY(-50%)', width: '8px', height: '18px', background: '#60a5fa', borderRadius: '2px', cursor: 'w-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'w')}
                />
                <div
                  style={{ position: 'absolute', top: '50%', right: '-5px', transform: 'translateY(-50%)', width: '8px', height: '18px', background: '#60a5fa', borderRadius: '2px', cursor: 'e-resize' }}
                  onMouseDown={(e) => handleCropMouseDown(e, 'e')}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
