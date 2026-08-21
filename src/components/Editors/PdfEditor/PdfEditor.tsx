import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  Pen, 
  Highlighter, 
  Underline as UnderlineIcon,
  Type, 
  StickyNote,
  Square, 
  Circle, 
  ArrowRight, 
  Eraser, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  Undo2, 
  RotateCcw,
  Loader2
} from 'lucide-react';
import { AnnotationItem, AnnotationTool, DriveFile, Point } from '../../../types';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.0.379'}/pdf.worker.min.mjs`;

interface PdfEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

const COLOR_PRESETS = [
  '#ef4444', // Red
  '#f59e0b', // Yellow / Amber
  '#3b82f6', // Blue
  '#10b981', // Green
  '#8b5cf6', // Purple
  '#000000', // Black
  '#ffffff', // White
];

export const PdfEditor: React.FC<PdfEditorProps> = ({
  file,
  arrayBuffer,
  onModify,
  onHasUnsavedChanges,
}) => {
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('draw');
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);
  const [textInputValue, setTextInputValue] = useState<string>('');
  const [noteInputPos, setNoteInputPos] = useState<Point | null>(null);
  const [noteInputValue, setNoteInputValue] = useState<string>('');
  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [isPageRendering, setIsPageRendering] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const currentPathRef = useRef<Point[]>([]);
  const shapeStartPointRef = useRef<Point | null>(null);

  // Load PDF with PDF.js
  useEffect(() => {
    let isCancelled = false;
    setIsPageRendering(true);

    async function loadPdf() {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
        const pdf = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDocProxy(pdf);
          setNumPages(pdf.numPages);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('PDF loading error:', err);
      } finally {
        if (!isCancelled) setIsPageRendering(false);
      }
    }

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [arrayBuffer]);

  // Render current page to base canvas
  useEffect(() => {
    if (!pdfDocProxy || !canvasRef.current) return;

    let isCancelled = false;
    setIsPageRendering(true);

    async function renderPage() {
      try {
        const page = await pdfDocProxy.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        setPageDimensions({ width: viewport.width, height: viewport.height });

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        redrawOverlay();
      } catch (err) {
        console.error('Error rendering PDF page:', err);
      } finally {
        if (!isCancelled) setIsPageRendering(false);
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDocProxy, currentPage, scale]);

  // Redraw annotations on overlay canvas
  const redrawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width = pageDimensions.width;
    overlay.height = pageDimensions.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const pageAnnotations = annotations.filter((a) => a.pageIndex === currentPage);

    pageAnnotations.forEach((item) => {
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = item.strokeWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (item.type === 'highlight') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = item.strokeWidth * scale * 3.5;
      } else if (item.type === 'underline') {
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2.5 * scale;
      } else {
        ctx.globalAlpha = item.opacity || 1.0;
      }

      if ((item.type === 'draw' || item.type === 'highlight') && item.points && item.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x * scale, item.points[0].y * scale);
        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x * scale, item.points[i].y * scale);
        }
        ctx.stroke();
      } else if (item.type === 'underline' && item.startPoint && item.endPoint) {
        // Draw crisp horizontal/slanted underline
        ctx.beginPath();
        ctx.moveTo(item.startPoint.x * scale, item.startPoint.y * scale);
        ctx.lineTo(item.endPoint.x * scale, item.endPoint.y * scale);
        ctx.stroke();
      } else if (item.type === 'rect' && item.startPoint && item.endPoint) {
        const x = Math.min(item.startPoint.x, item.endPoint.x) * scale;
        const y = Math.min(item.startPoint.y, item.endPoint.y) * scale;
        const w = Math.abs(item.endPoint.x - item.startPoint.x) * scale;
        const h = Math.abs(item.endPoint.y - item.startPoint.y) * scale;
        ctx.strokeRect(x, y, w, h);
      } else if (item.type === 'circle' && item.startPoint && item.endPoint) {
        const x1 = item.startPoint.x * scale;
        const y1 = item.startPoint.y * scale;
        const x2 = item.endPoint.x * scale;
        const y2 = item.endPoint.y * scale;
        const radiusX = Math.abs(x2 - x1) / 2;
        const radiusY = Math.abs(y2 - y1) / 2;
        const centerX = Math.min(x1, x2) + radiusX;
        const centerY = Math.min(y1, y2) + radiusY;

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (item.type === 'arrow' && item.startPoint && item.endPoint) {
        const startX = item.startPoint.x * scale;
        const startY = item.startPoint.y * scale;
        const endX = item.endPoint.x * scale;
        const endY = item.endPoint.y * scale;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        const headlen = 12 * scale;
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'text' && item.startPoint && item.text) {
        ctx.font = `bold ${(item.fontSize || 14) * scale}px Inter, sans-serif`;
        ctx.fillText(item.text, item.startPoint.x * scale, item.startPoint.y * scale);
      } else if (item.type === 'note' && item.startPoint && item.text) {
        // Render sticky note badge with background card
        const nx = item.startPoint.x * scale;
        const ny = item.startPoint.y * scale;

        // Sticky icon box
        ctx.fillStyle = item.color;
        ctx.roundRect(nx, ny, 26 * scale, 26 * scale, 4 * scale);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
        ctx.fillText('📝', nx + 4 * scale, ny + 18 * scale);

        // Note content balloon
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5 * scale;
        ctx.roundRect(nx + 32 * scale, ny, 160 * scale, 48 * scale, 6 * scale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = `${11 * scale}px Inter, sans-serif`;
        ctx.fillText(item.text.slice(0, 30) + (item.text.length > 30 ? '...' : ''), nx + 40 * scale, ny + 22 * scale);
      }

      ctx.restore();
    });
  }, [annotations, currentPage, pageDimensions, scale]);

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  // Compile annotations into PDF binary using pdf-lib
  const exportModifiedPdf = async (updatedAnnotations: AnnotationItem[]): Promise<Blob> => {
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0));
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const ann of updatedAnnotations) {
        const targetPage = pages[ann.pageIndex - 1];
        if (!targetPage) continue;

        const { height: pdfPageHeight } = targetPage.getSize();

        // Convert hex color to rgb
        const hex = ann.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        if (ann.type === 'text' && ann.startPoint && ann.text) {
          const pdfY = pdfPageHeight - ann.startPoint.y;
          targetPage.drawText(ann.text, {
            x: ann.startPoint.x,
            y: pdfY,
            size: ann.fontSize || 14,
            font,
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'note' && ann.startPoint && ann.text) {
          const pdfY = pdfPageHeight - ann.startPoint.y;
          // Draw note badge
          targetPage.drawRectangle({
            x: ann.startPoint.x,
            y: pdfY - 20,
            width: 140,
            height: 35,
            color: rgb(0.12, 0.16, 0.24),
            borderColor: rgb(r, g, b),
            borderWidth: 1.5,
          });

          targetPage.drawText(`Note: ${ann.text}`, {
            x: ann.startPoint.x + 6,
            y: pdfY - 6,
            size: 9,
            font: fontRegular,
            color: rgb(1, 1, 1),
            maxWidth: 128,
          });
        } else if (ann.type === 'underline' && ann.startPoint && ann.endPoint) {
          targetPage.drawLine({
            start: { x: ann.startPoint.x, y: pdfPageHeight - ann.startPoint.y },
            end: { x: ann.endPoint.x, y: pdfPageHeight - ann.endPoint.y },
            thickness: 2,
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'rect' && ann.startPoint && ann.endPoint) {
          const x = Math.min(ann.startPoint.x, ann.endPoint.x);
          const y = Math.min(ann.startPoint.y, ann.endPoint.y);
          const w = Math.abs(ann.endPoint.x - ann.startPoint.x);
          const h = Math.abs(ann.endPoint.y - ann.startPoint.y);
          const pdfY = pdfPageHeight - (y + h);

          targetPage.drawRectangle({
            x,
            y: pdfY,
            width: w,
            height: h,
            borderColor: rgb(r, g, b),
            borderWidth: ann.strokeWidth,
          });
        } else if (ann.type === 'circle' && ann.startPoint && ann.endPoint) {
          const x1 = ann.startPoint.x;
          const y1 = ann.startPoint.y;
          const x2 = ann.endPoint.x;
          const y2 = ann.endPoint.y;
          const radiusX = Math.abs(x2 - x1) / 2;
          const radiusY = Math.abs(y2 - y1) / 2;
          const centerX = Math.min(x1, x2) + radiusX;
          const centerY = Math.min(y1, y2) + radiusY;
          const pdfY = pdfPageHeight - centerY;

          targetPage.drawEllipse({
            x: centerX,
            y: pdfY,
            xScale: radiusX,
            yScale: radiusY,
            borderColor: rgb(r, g, b),
            borderWidth: ann.strokeWidth,
          });
        } else if ((ann.type === 'draw' || ann.type === 'highlight') && ann.points && ann.points.length > 1) {
          for (let i = 0; i < ann.points.length - 1; i++) {
            const p1 = ann.points[i];
            const p2 = ann.points[i + 1];
            targetPage.drawLine({
              start: { x: p1.x, y: pdfPageHeight - p1.y },
              end: { x: p2.x, y: pdfPageHeight - p2.y },
              thickness: ann.type === 'highlight' ? ann.strokeWidth * 3 : ann.strokeWidth,
              color: rgb(r, g, b),
              opacity: ann.type === 'highlight' ? 0.35 : 1.0,
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    } catch (err) {
      console.error('Failed to compile modified PDF:', err);
      return new Blob([arrayBuffer], { type: 'application/pdf' });
    }
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return { x, y };
  };

  const eraseAnnotationAtPoint = (pt: Point) => {
    const updated = annotations.filter((ann) => {
      if (ann.pageIndex !== currentPage) return true;
      if (ann.points && ann.points.length > 0) {
        return !ann.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 18);
      }
      if (ann.startPoint && ann.endPoint) {
        const minX = Math.min(ann.startPoint.x, ann.endPoint.x);
        const maxX = Math.max(ann.startPoint.x, ann.endPoint.x);
        const minY = Math.min(ann.startPoint.y, ann.endPoint.y);
        const maxY = Math.max(ann.startPoint.y, ann.endPoint.y);
        return !(pt.x >= minX - 12 && pt.x <= maxX + 12 && pt.y >= minY - 12 && pt.y <= maxY + 12);
      }
      if (ann.startPoint) {
        return Math.hypot(ann.startPoint.x - pt.x, ann.startPoint.y - pt.y) > 28;
      }
      return true;
    });

    if (updated.length !== annotations.length) {
      setAnnotations(updated);
      onHasUnsavedChanges(true);
      exportModifiedPdf(updated).then(onModify);
    }
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

    if (activeTool === 'note') {
      setNoteInputPos(pt);
      setNoteInputValue('');
      setTimeout(() => noteInputRef.current?.focus(), 50);
      return;
    }

    setIsDrawing(true);
    shapeStartPointRef.current = pt;
    currentPathRef.current = [pt];
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
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = (activeTool === 'highlight' ? strokeWidth * 3.5 : strokeWidth) * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = activeTool === 'highlight' ? 0.35 : 1.0;

      const pts = currentPathRef.current;
      if (pts.length > 1) {
        const last = pts[pts.length - 2];
        ctx.beginPath();
        ctx.moveTo(last.x * scale, last.y * scale);
        ctx.lineTo(pt.x * scale, pt.y * scale);
        ctx.stroke();
      }
      ctx.restore();
    } else if (['underline', 'rect', 'circle', 'arrow'].includes(activeTool)) {
      redrawOverlay();
      const overlay = overlayCanvasRef.current;
      if (!overlay || !shapeStartPointRef.current) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      const start = shapeStartPointRef.current;
      ctx.save();
      ctx.strokeStyle = selectedColor;
      ctx.fillStyle = selectedColor;
      ctx.lineWidth = strokeWidth * scale;

      if (activeTool === 'underline') {
        ctx.lineWidth = 2.5 * scale;
        ctx.beginPath();
        ctx.moveTo(start.x * scale, start.y * scale);
        ctx.lineTo(pt.x * scale, pt.y * scale);
        ctx.stroke();
      } else if (activeTool === 'rect') {
        const x = Math.min(start.x, pt.x) * scale;
        const y = Math.min(start.y, pt.y) * scale;
        const w = Math.abs(pt.x - start.x) * scale;
        const h = Math.abs(pt.y - start.y) * scale;
        ctx.strokeRect(x, y, w, h);
      } else if (activeTool === 'circle') {
        const x1 = start.x * scale;
        const y1 = start.y * scale;
        const x2 = pt.x * scale;
        const y2 = pt.y * scale;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        ctx.beginPath();
        ctx.ellipse(Math.min(x1, x2) + rx, Math.min(y1, y2) + ry, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(start.x * scale, start.y * scale);
        ctx.lineTo(pt.x * scale, pt.y * scale);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const pt = getCanvasCoordinates(e);

    const newAnnotation: AnnotationItem = {
      id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: activeTool,
      pageIndex: currentPage,
      color: selectedColor,
      strokeWidth,
    };

    if (activeTool === 'draw' || activeTool === 'highlight') {
      if (currentPathRef.current.length < 2) return;
      newAnnotation.points = [...currentPathRef.current];
    } else if (['underline', 'rect', 'circle', 'arrow'].includes(activeTool)) {
      if (!shapeStartPointRef.current) return;
      newAnnotation.startPoint = shapeStartPointRef.current;
      newAnnotation.endPoint = pt;
    }

    const updated = [...annotations, newAnnotation];
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleCommitText = () => {
    if (!textInputPos || !textInputValue.trim()) {
      setTextInputPos(null);
      return;
    }

    const newAnnotation: AnnotationItem = {
      id: 'ann_text_' + Date.now(),
      type: 'text',
      pageIndex: currentPage,
      color: selectedColor,
      strokeWidth: 1,
      fontSize: 15,
      startPoint: textInputPos,
      text: textInputValue.trim(),
    };

    const updated = [...annotations, newAnnotation];
    setAnnotations(updated);
    setTextInputPos(null);
    setTextInputValue('');
    onHasUnsavedChanges(true);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleCommitNote = () => {
    if (!noteInputPos || !noteInputValue.trim()) {
      setNoteInputPos(null);
      return;
    }

    const newAnnotation: AnnotationItem = {
      id: 'ann_note_' + Date.now(),
      type: 'note',
      pageIndex: currentPage,
      color: selectedColor,
      strokeWidth: 1,
      startPoint: noteInputPos,
      text: noteInputValue.trim(),
    };

    const updated = [...annotations, newAnnotation];
    setAnnotations(updated);
    setNoteInputPos(null);
    setNoteInputValue('');
    onHasUnsavedChanges(true);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleUndo = () => {
    if (annotations.length === 0) return;
    const updated = annotations.slice(0, -1);
    setAnnotations(updated);
    onHasUnsavedChanges(updated.length > 0);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleClearPage = () => {
    const updated = annotations.filter((a) => a.pageIndex !== currentPage);
    setAnnotations(updated);
    onHasUnsavedChanges(updated.length > 0);
    exportModifiedPdf(updated).then(onModify);
  };

  return (
    <div className="editor-container">
      {/* PDF Sub-Toolbar */}
      <div className="editor-toolbar">
        {/* Annotation Tools */}
        <div className="toolbar-group">
          <button
            className={`tool-button ${activeTool === 'draw' ? 'active' : ''}`}
            onClick={() => setActiveTool('draw')}
            title="Pen / Freehand Draw"
          >
            <Pen size={15} />
            <span>Pen</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'underline' ? 'active' : ''}`}
            onClick={() => setActiveTool('underline')}
            title="Underline Text"
          >
            <UnderlineIcon size={15} />
            <span>Underline</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'highlight' ? 'active' : ''}`}
            onClick={() => setActiveTool('highlight')}
            title="Highlighter"
          >
            <Highlighter size={15} />
            <span>Highlight</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'note' ? 'active' : ''}`}
            onClick={() => setActiveTool('note')}
            title="Add Sticky Note"
          >
            <StickyNote size={15} />
            <span>Note</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')}
            title="Insert Text"
          >
            <Type size={15} />
            <span>Text</span>
          </button>

          <button
            className={`tool-button ${activeTool === 'rect' ? 'active' : ''}`}
            onClick={() => setActiveTool('rect')}
            title="Rectangle"
          >
            <Square size={15} />
          </button>

          <button
            className={`tool-button ${activeTool === 'circle' ? 'active' : ''}`}
            onClick={() => setActiveTool('circle')}
            title="Circle"
          >
            <Circle size={15} />
          </button>

          <button
            className={`tool-button ${activeTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setActiveTool('arrow')}
            title="Arrow"
          >
            <ArrowRight size={15} />
          </button>

          <button
            className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setActiveTool('eraser')}
            title="Eraser (Click any mark to remove)"
          >
            <Eraser size={15} />
            <span>Eraser</span>
          </button>
        </div>

        <div className="tool-divider" />

        {/* Color Palette & Stroke Width */}
        <div className="toolbar-group">
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: selectedColor === color ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                  padding: 0,
                  boxShadow: selectedColor === color ? '0 0 6px rgba(255,255,255,0.6)' : 'none',
                }}
              />
            ))}
          </div>

          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
            style={{ padding: '2px 6px', fontSize: '12px', height: '28px' }}
          >
            <option value="2">Fine (2px)</option>
            <option value="3">Regular (3px)</option>
            <option value="6">Bold (6px)</option>
            <option value="10">Heavy (10px)</option>
          </select>
        </div>

        <div className="tool-divider" />

        {/* Undo & Clear */}
        <div className="toolbar-group">
          <button
            className="tool-button"
            onClick={handleUndo}
            disabled={annotations.length === 0}
            title="Undo"
          >
            <Undo2 size={15} />
          </button>

          <button
            className="tool-button"
            onClick={handleClearPage}
            title="Clear Page Annotations"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Page & Zoom Navigation */}
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <button
            className="tool-button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {currentPage} / {numPages}
          </span>
          <button
            className="tool-button"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>

          <div className="tool-divider" />

          <button
            className="tool-button"
            onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span style={{ fontSize: '12px', minWidth: '38px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            className="tool-button"
            onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* PDF Viewport */}
      <div className="editor-viewport">
        {isPageRendering && (
          <div
            style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.85)',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              fontSize: '12px',
              color: '#60a5fa',
            }}
          >
            <Loader2 size={13} className="animate-spin" />
            <span>Rendering PDF...</span>
          </div>
        )}

        <div
          className="pdf-page-container"
          style={{
            width: pageDimensions.width,
            height: pageDimensions.height,
          }}
        >
          {/* Base PDF Canvas */}
          <canvas ref={canvasRef} />

          {/* Interactive Annotation Layer Canvas */}
          <canvas
            ref={overlayCanvasRef}
            className="pdf-annotation-layer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />

          {/* Inline Text Input Placement */}
          {textInputPos && (
            <div
              style={{
                position: 'absolute',
                left: textInputPos.x * scale,
                top: (textInputPos.y - 12) * scale,
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(15, 23, 42, 0.95)',
                padding: '4px 8px',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
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
                placeholder="Type text & hit Enter..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: selectedColor,
                  fontWeight: 600,
                  fontSize: '14px',
                  width: '200px',
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

          {/* Sticky Note Popover */}
          {noteInputPos && (
            <div
              style={{
                position: 'absolute',
                left: noteInputPos.x * scale,
                top: noteInputPos.y * scale,
                zIndex: 25,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                background: 'rgba(15, 23, 42, 0.95)',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                border: `1px solid ${selectedColor}`,
                width: '220px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <StickyNote size={14} style={{ color: selectedColor }} />
                <span>Add Note / Remark</span>
              </div>
              <textarea
                ref={noteInputRef}
                value={noteInputValue}
                onChange={(e) => setNoteInputValue(e.target.value)}
                placeholder="Type your note or observation here..."
                rows={3}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '12px',
                  padding: '6px',
                  resize: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setNoteInputPos(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={handleCommitNote}
                >
                  Save Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
