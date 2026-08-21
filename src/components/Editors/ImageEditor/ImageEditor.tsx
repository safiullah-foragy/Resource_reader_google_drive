import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Pen, 
  Highlighter, 
  Type, 
  Square, 
  Circle, 
  ArrowRight, 
  Eraser,
  RotateCw, 
  Sliders, 
  Undo2, 
  RotateCcw,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { AnnotationItem, AnnotationTool, DriveFile, Point } from '../../../types';

interface ImageEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

const COLOR_PRESETS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow / Orange
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#000000', // Black
];

export const ImageEditor: React.FC<ImageEditorProps> = ({
  file,
  arrayBuffer,
  onModify,
  onHasUnsavedChanges,
}) => {
  const [activeTool, setActiveTool] = useState<AnnotationTool>('draw');
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [rotation, setRotation] = useState<number>(0);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [scale, setScale] = useState<number>(1);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);
  const [textInputValue, setTextInputValue] = useState<string>('');
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentPathRef = useRef<Point[]>([]);
  const shapeStartRef = useRef<Point | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Load image element from ArrayBuffer
  useEffect(() => {
    const blob = new Blob([arrayBuffer], { type: file.mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgElement(img);
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [arrayBuffer, file.mimeType]);

  // Main canvas render function (draws base image + filter adjustments + vector annotations)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle rotation dimensions
    const isRotated = rotation % 180 !== 0;
    const originalWidth = imgElement.naturalWidth || 800;
    const originalHeight = imgElement.naturalHeight || 600;

    canvas.width = isRotated ? originalHeight : originalWidth;
    canvas.height = isRotated ? originalWidth : originalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply rotation & center transformations
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(imgElement, -originalWidth / 2, -originalHeight / 2, originalWidth, originalHeight);
    ctx.restore();

    // Draw all annotation layers
    annotations.forEach((item) => {
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = item.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (item.type === 'highlight') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = item.strokeWidth * 3.5;
      } else {
        ctx.globalAlpha = item.opacity || 1.0;
      }

      if ((item.type === 'draw' || item.type === 'highlight') && item.points && item.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x, item.points[i].y);
        }
        ctx.stroke();
      } else if (item.type === 'rect' && item.startPoint && item.endPoint) {
        const x = Math.min(item.startPoint.x, item.endPoint.x);
        const y = Math.min(item.startPoint.y, item.endPoint.y);
        const w = Math.abs(item.endPoint.x - item.startPoint.x);
        const h = Math.abs(item.endPoint.y - item.startPoint.y);
        ctx.strokeRect(x, y, w, h);
      } else if (item.type === 'circle' && item.startPoint && item.endPoint) {
        const x1 = item.startPoint.x;
        const y1 = item.startPoint.y;
        const x2 = item.endPoint.x;
        const y2 = item.endPoint.y;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        ctx.beginPath();
        ctx.ellipse(Math.min(x1, x2) + rx, Math.min(y1, y2) + ry, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (item.type === 'arrow' && item.startPoint && item.endPoint) {
        const { x: sx, y: sy } = item.startPoint;
        const { x: ex, y: ey } = item.endPoint;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        const headlen = 16;
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'text' && item.startPoint && item.text) {
        // Draw crisp background tag for readable text
        ctx.font = `bold ${item.fontSize || 18}px Inter, sans-serif`;
        const textMetrics = ctx.measureText(item.text);
        const textW = textMetrics.width;
        const textH = item.fontSize || 18;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.roundRect(item.startPoint.x - 6, item.startPoint.y - textH - 4, textW + 12, textH + 10, 4);
        ctx.fill();

        ctx.fillStyle = item.color;
        ctx.fillText(item.text, item.startPoint.x, item.startPoint.y);
      }

      ctx.restore();
    });
  }, [imgElement, rotation, brightness, contrast, annotations]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Export modified image to clean lossless PNG Blob
  const exportImageBlob = (updatedAnnotations: AnnotationItem[] = annotations): Promise<Blob> => {
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

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);

    if (activeTool === 'eraser') {
      eraseAnnotationAtPoint(pt);
      setIsDrawing(true);
      return;
    }

    if (activeTool === 'text') {
      setTextInputPos(pt);
      setTextInputValue('');
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    setIsDrawing(true);
    shapeStartRef.current = pt;
    currentPathRef.current = [pt];
  };

  const eraseAnnotationAtPoint = (pt: Point) => {
    const updated = annotations.filter((ann) => {
      if (ann.points && ann.points.length > 0) {
        return !ann.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 20);
      }
      if (ann.startPoint && ann.endPoint) {
        const minX = Math.min(ann.startPoint.x, ann.endPoint.x);
        const maxX = Math.max(ann.startPoint.x, ann.endPoint.x);
        const minY = Math.min(ann.startPoint.y, ann.endPoint.y);
        const maxY = Math.max(ann.startPoint.y, ann.endPoint.y);
        return !(pt.x >= minX - 12 && pt.x <= maxX + 12 && pt.y >= minY - 12 && pt.y <= maxY + 12);
      }
      if (ann.startPoint) {
        return Math.hypot(ann.startPoint.x - pt.x, ann.startPoint.y - pt.y) > 30;
      }
      return true;
    });

    if (updated.length !== annotations.length) {
      setAnnotations(updated);
      onHasUnsavedChanges(true);
      setTimeout(async () => {
        const blob = await exportImageBlob(updated);
        onModify(blob);
      }, 50);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pt = getCanvasCoordinates(e);

    if (activeTool === 'eraser') {
      eraseAnnotationAtPoint(pt);
      return;
    }

    if (activeTool === 'draw' || activeTool === 'highlight') {
      currentPathRef.current.push(pt);
      renderCanvas();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = activeTool === 'highlight' ? strokeWidth * 3.5 : strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = activeTool === 'highlight' ? 0.35 : 1.0;

      const pts = currentPathRef.current;
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (['rect', 'circle', 'arrow'].includes(activeTool)) {
      renderCanvas();
      const canvas = canvasRef.current;
      if (!canvas || !shapeStartRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const start = shapeStartRef.current;
      ctx.save();
      ctx.strokeStyle = selectedColor;
      ctx.fillStyle = selectedColor;
      ctx.lineWidth = strokeWidth;

      if (activeTool === 'rect') {
        const x = Math.min(start.x, pt.x);
        const y = Math.min(start.y, pt.y);
        const w = Math.abs(pt.x - start.x);
        const h = Math.abs(pt.y - start.y);
        ctx.strokeRect(x, y, w, h);
      } else if (activeTool === 'circle') {
        const rx = Math.abs(pt.x - start.x) / 2;
        const ry = Math.abs(pt.y - start.y) / 2;
        ctx.beginPath();
        ctx.ellipse(Math.min(start.x, pt.x) + rx, Math.min(start.y, pt.y) + ry, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const handleClearAll = () => {
    setAnnotations([]);
    onHasUnsavedChanges(true);
    setTimeout(async () => {
      const blob = await exportImageBlob([]);
      onModify(blob);
    }, 50);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const pt = getCanvasCoordinates(e);

    const newAnnotation: AnnotationItem = {
      id: 'img_ann_' + Date.now(),
      type: activeTool,
      pageIndex: 1,
      color: selectedColor,
      strokeWidth,
    };

    if (activeTool === 'draw' || activeTool === 'highlight') {
      if (currentPathRef.current.length < 2) return;
      newAnnotation.points = [...currentPathRef.current];
    } else if (['rect', 'circle', 'arrow'].includes(activeTool)) {
      if (!shapeStartRef.current) return;
      newAnnotation.startPoint = shapeStartRef.current;
      newAnnotation.endPoint = pt;
    }

    const updated = [...annotations, newAnnotation];
    setAnnotations(updated);
    onHasUnsavedChanges(true);

    setTimeout(async () => {
      const blob = await exportImageBlob(updated);
      onModify(blob);
    }, 50);
  };

  const handleCommitText = () => {
    if (!textInputPos || !textInputValue.trim()) {
      setTextInputPos(null);
      return;
    }

    const newAnnotation: AnnotationItem = {
      id: 'img_text_' + Date.now(),
      type: 'text',
      pageIndex: 1,
      color: selectedColor,
      strokeWidth: 1,
      fontSize: 18,
      startPoint: textInputPos,
      text: textInputValue.trim(),
    };

    const updated = [...annotations, newAnnotation];
    setAnnotations(updated);
    setTextInputPos(null);
    setTextInputValue('');
    onHasUnsavedChanges(true);

    setTimeout(async () => {
      const blob = await exportImageBlob(updated);
      onModify(blob);
    }, 50);
  };

  const handleUndo = () => {
    if (annotations.length === 0) return;
    const updated = annotations.slice(0, -1);
    setAnnotations(updated);
    onHasUnsavedChanges(updated.length > 0);
    setTimeout(async () => {
      const blob = await exportImageBlob(updated);
      onModify(blob);
    }, 50);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
    onHasUnsavedChanges(true);
    setTimeout(async () => {
      const blob = await exportImageBlob();
      onModify(blob);
    }, 100);
  };

  return (
    <div className="editor-container">
      {/* Image Editor Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            className={`tool-button ${activeTool === 'draw' ? 'active' : ''}`}
            onClick={() => setActiveTool('draw')}
            title="Pen / Freehand Markup"
          >
            <Pen size={16} />
            <span>Draw</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'highlight' ? 'active' : ''}`}
            onClick={() => setActiveTool('highlight')}
            title="Highlighter"
          >
            <Highlighter size={16} />
            <span>Highlight</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setActiveTool('arrow')}
            title="Arrow Marker"
          >
            <ArrowRight size={16} />
            <span>Arrow</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')}
            title="Add Text Label"
          >
            <Type size={16} />
            <span>Text</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'rect' ? 'active' : ''}`}
            onClick={() => setActiveTool('rect')}
            title="Rectangle Box"
          >
            <Square size={16} />
          </button>

          <button
            className={`tool-button ${activeTool === 'circle' ? 'active' : ''}`}
            onClick={() => setActiveTool('circle')}
            title="Circle"
          >
            <Circle size={16} />
          </button>

          <button
            className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setActiveTool('eraser')}
            title="Eraser (Click or drag across any line, arrow or note to erase)"
          >
            <Eraser size={16} />
            <span>Eraser</span>
          </button>
        </div>

        <div className="tool-divider" />

        {/* Color Palette */}
        <div className="toolbar-group">
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: selectedColor === color ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                  padding: 0,
                }}
              />
            ))}
          </div>

          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
            style={{ padding: '2px 6px', fontSize: '12px', height: '28px' }}
          >
            <option value="2">2px</option>
            <option value="4">4px</option>
            <option value="8">8px</option>
            <option value="14">14px</option>
          </select>
        </div>

        <div className="tool-divider" />

        {/* Rotate & Adjustments */}
        <div className="toolbar-group">
          <button className="tool-button" onClick={handleRotate} title="Rotate 90°">
            <RotateCw size={16} />
            <span>Rotate</span>
          </button>

          <button
            className={`tool-button ${showAdjustments ? 'active' : ''}`}
            onClick={() => setShowAdjustments((v) => !v)}
            title="Brightness & Contrast"
          >
            <Sliders size={16} />
            <span>Filters</span>
          </button>

          <button
            className="tool-button"
            onClick={handleUndo}
            disabled={annotations.length === 0}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>

          <button
            className="tool-button"
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            title="Clear All Annotations"
          >
            <RotateCcw size={16} />
            <span>Clear All</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <button className="tool-button" onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}>
            <ZoomOut size={16} />
          </button>
          <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {Math.round(scale * 100)}%
          </span>
          <button className="tool-button" onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}>
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* Adjustments Popup Panel */}
      {showAdjustments && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0.6rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            fontSize: '13px',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Brightness: {brightness}%</span>
            <input
              type="range"
              min="50"
              max="150"
              value={brightness}
              onChange={(e) => {
                setBrightness(parseInt(e.target.value, 10));
                onHasUnsavedChanges(true);
              }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Contrast: {contrast}%</span>
            <input
              type="range"
              min="50"
              max="150"
              value={contrast}
              onChange={(e) => {
                setContrast(parseInt(e.target.value, 10));
                onHasUnsavedChanges(true);
              }}
            />
          </label>
        </div>
      )}

      {/* Image Canvas Viewport */}
      <div className="editor-viewport">
        <div
          className="image-canvas-wrapper"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.1s ease',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ cursor: activeTool === 'text' ? 'text' : 'crosshair', display: 'block' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />

          {/* Text Input Overlay */}
          {textInputPos && (
            <div
              style={{
                position: 'absolute',
                left: textInputPos.x,
                top: textInputPos.y - 15,
                zIndex: 30,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(15, 23, 42, 0.9)',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #3b82f6',
              }}
            >
              <input
                ref={textInputRef}
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitText();
                  if (e.key === 'Escape') setTextInputPos(null);
                }}
                placeholder="Enter text..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: selectedColor,
                  fontWeight: 600,
                  fontSize: '14px',
                  width: '180px',
                }}
              />
              <button
                className="btn-primary"
                style={{ padding: '2px 8px', fontSize: '12px' }}
                onClick={handleCommitText}
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
