import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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
  Undo2, 
  Redo2,
  RotateCcw, 
  Loader2, 
  ChevronDown,
  Trash2,
  Check,
  X
} from 'lucide-react';
import { AnnotationItem, AnnotationTool, DriveFile, Point } from '../../../types';

// Configure bundled local worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

// 5 Opacity / Strength Divisions for Highlighter
const HIGHLIGHT_STRENGTHS = [
  { label: '1 - Very Light', value: 0.15, height: '6px' },
  { label: '2 - Light', value: 0.30, height: '10px' },
  { label: '3 - Medium', value: 0.50, height: '15px' },
  { label: '4 - Strong', value: 0.70, height: '22px' },
  { label: '5 - Very Dark', value: 0.90, height: '30px' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Green', hex: '#4ade80' },
  { name: 'Blue', hex: '#60a5fa' },
  { name: 'Pink', hex: '#f472b6' },
  { name: 'Orange', hex: '#fb923c' },
  { name: 'Purple', hex: '#c084fc' },
  { name: 'Teal', hex: '#2dd4bf' },
];

const HIGHLIGHT_WIDTHS = [
  { label: 'Fine (8px)', value: 2, height: '6px' },
  { label: 'Standard (14px)', value: 3.2, height: '10px' },
  { label: 'Medium (20px)', value: 4.5, height: '14px' },
  { label: 'Broad (28px)', value: 6.5, height: '20px' },
  { label: 'Extra Broad (38px)', value: 8.5, height: '26px' },
];

const UNDERLINE_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#ffffff' },
];

const UNDERLINE_WIDTHS = [
  { label: '1px (Fine)', value: 1 },
  { label: '2px (Standard)', value: 2 },
  { label: '3px (Medium)', value: 3 },
  { label: '5px (Thick)', value: 5 },
  { label: '8px (Bold)', value: 8 },
];

const PEN_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#ffffff' },
];

const PEN_WIDTHS = [
  { label: '1px (Hairline)', value: 1 },
  { label: '2px (Fine)', value: 2 },
  { label: '3px (Standard)', value: 3 },
  { label: '5px (Medium)', value: 5 },
  { label: '8px (Thick)', value: 8 },
  { label: '12px (Heavy)', value: 12 },
];

const NOTE_COLORS = [
  '#38bdf8', // Sky Blue
  '#facc15', // Yellow
  '#ef4444', // Red
  '#10b981', // Green
  '#c084fc', // Purple
  '#fb923c', // Orange
  '#ffffff', // White
  '#000000', // Black
];

const NOTE_FONT_SIZES = [11, 14, 18, 24, 32];

// Note Modal State with full 4-way resize and position
interface ActiveNoteModal {
  id?: string; // present if editing existing note
  pos: Point;
  text: string;
  fontSize: number;
  color: string;
  width: number;
  height: number;
}

type ResizeDirection = 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw' | null;

// Helper to word wrap text on 2D canvas
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// Single Page View Component
interface PageViewProps {
  pageNumber: number;
  pdfDocProxy: any;
  scale: number;
  activeTool: AnnotationTool | 'none';
  selectedColor: string;
  strokeWidth: number;
  highlightOpacity: number;
  highlightMode: 'fixed' | 'variable';
  underlineWidth: number;
  noteFontSize: number;
  noteColor: string;
  annotations: AnnotationItem[];
  onAddAnnotation: (annotation: AnnotationItem) => void;
  onUpdateAnnotation: (id: string, updates: Partial<AnnotationItem>) => void;
  onDeleteAnnotation: (id: string) => void;
  onEraseAtPoint: (pageNumber: number, pt: Point) => void;
}

const PdfPageView: React.FC<PageViewProps> = ({
  pageNumber,
  pdfDocProxy,
  scale,
  activeTool,
  selectedColor,
  strokeWidth,
  highlightOpacity,
  highlightMode,
  underlineWidth,
  noteFontSize,
  noteColor,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onEraseAtPoint,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [isRendered, setIsRendered] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // In-place Note modal with draggable & 4-way resizable placeholder
  const [activeNoteModal, setActiveNoteModal] = useState<ActiveNoteModal | null>(null);
  const [isDraggingModal, setIsDraggingModal] = useState<boolean>(false);
  const [resizingDirection, setResizingDirection] = useState<ResizeDirection>(null);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialPos: Point;
    initialWidth: number;
    initialHeight: number;
  }>({ clientX: 0, clientY: 0, initialPos: { x: 0, y: 0 }, initialWidth: 260, initialHeight: 140 });

  // Direct Text Input
  const [activeTextCreation, setActiveTextCreation] = useState<{ pos: Point; text: string } | null>(null);

  const currentPathRef = useRef<Point[]>([]);
  const shapeStartPointRef = useRef<Point | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Render PDF page canvas
  useEffect(() => {
    if (!pdfDocProxy || !canvasRef.current) return;
    let isCancelled = false;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {}
    }

    async function render() {
      try {
        const page = await pdfDocProxy.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setDimensions({ width: viewport.width, height: viewport.height });

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;

        if (!isCancelled) {
          setIsRendered(true);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    }

    render();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDocProxy, pageNumber, scale]);

  // Redraw annotations on overlay
  const redrawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width = dimensions.width;
    overlay.height = dimensions.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const pageAnnotations = annotations.filter((a) => a.pageIndex === pageNumber);

    pageAnnotations.forEach((item) => {
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = item.strokeWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (item.type === 'highlight') {
        // True transparent fluorescent highlight overlay using multiply
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = item.opacity !== undefined ? item.opacity : 0.30;
        ctx.lineWidth = (item.strokeWidth || 3) * 4.5 * scale;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';

        if (item.startPoint && item.endPoint) {
          ctx.beginPath();
          ctx.moveTo(item.startPoint.x * scale, item.startPoint.y * scale);
          ctx.lineTo(item.endPoint.x * scale, item.endPoint.y * scale);
          ctx.stroke();
        } else if (item.points && item.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(item.points[0].x * scale, item.points[0].y * scale);
          for (let i = 1; i < item.points.length; i++) {
            ctx.lineTo(item.points[i].x * scale, item.points[i].y * scale);
          }
          ctx.stroke();
        }
      } else if (item.type === 'underline') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = item.strokeWidth * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = item.opacity || 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }

      if (item.type === 'draw' && item.points && item.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x * scale, item.points[0].y * scale);
        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x * scale, item.points[i].y * scale);
        }
        ctx.stroke();
      } else if (item.type === 'underline' && item.startPoint && item.endPoint) {
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
        // Direct transparent floating note text with word wrap according to item.width
        const nx = item.startPoint.x * scale;
        const ny = item.startPoint.y * scale;
        const fSize = (item.fontSize || 14) * scale;
        const maxWidth = (item.width || 260) * scale;

        ctx.font = `600 ${fSize}px Inter, sans-serif`;
        ctx.fillStyle = item.color;

        // Word-wrap lines
        const lines = wrapCanvasText(ctx, item.text, maxWidth);
        const lineHeight = fSize * 1.3;

        lines.forEach((line, index) => {
          ctx.fillText(line, nx, ny + index * lineHeight);
        });

        // Small indicator pin next to note
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(nx - 8 * scale, ny - fSize / 3, 3.5 * scale, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.restore();
    });
  }, [annotations, pageNumber, dimensions, scale]);

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return { x, y };
  };

  // Find if click landed on an existing note
  const findNoteAtPoint = (pt: Point): AnnotationItem | undefined => {
    return annotations.find((ann) => {
      if (ann.pageIndex !== pageNumber || ann.type !== 'note' || !ann.startPoint || !ann.text) return false;
      const fSize = ann.fontSize || 14;
      const boxWidth = ann.width || 260;
      const boxHeight = ann.height || 100;
      return (
        pt.x >= ann.startPoint.x - 20 &&
        pt.x <= ann.startPoint.x + boxWidth + 20 &&
        pt.y >= ann.startPoint.y - fSize - 15 &&
        pt.y <= ann.startPoint.y + boxHeight + 15
      );
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);

    // 1. If clicked an existing note: Auto-load on editable placeholder for modification!
    const existingNote = findNoteAtPoint(pt);
    if (existingNote && existingNote.startPoint) {
      setActiveNoteModal({
        id: existingNote.id,
        pos: existingNote.startPoint,
        text: existingNote.text || '',
        fontSize: existingNote.fontSize || noteFontSize,
        color: existingNote.color || noteColor,
        width: existingNote.width || 260,
        height: existingNote.height || 140,
      });
      return;
    }

    if (activeTool === 'eraser') {
      onEraseAtPoint(pageNumber, pt);
      setIsDrawing(true);
      return;
    }

    // 2. If in Note mode and clicked on PDF: Auto-open editable note placeholder at that spot
    if (activeTool === 'note') {
      setActiveNoteModal({
        pos: pt,
        text: '',
        fontSize: noteFontSize,
        color: noteColor,
        width: 260,
        height: 140,
      });
      return;
    }

    if (activeTool === 'text') {
      setActiveTextCreation({ pos: pt, text: '' });
      return;
    }

    if (activeTool === 'none' || activeTool === 'select') {
      return;
    }

    setIsDrawing(true);
    shapeStartPointRef.current = pt;
    currentPathRef.current = [pt];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoordinates(e);

    if (!isDrawing) return;

    if (activeTool === 'eraser') {
      onEraseAtPoint(pageNumber, pt);
      return;
    }

    if (activeTool === 'draw') {
      currentPathRef.current.push(pt);
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = strokeWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const pts = currentPathRef.current;
      if (pts.length > 1) {
        const last = pts[pts.length - 2];
        ctx.beginPath();
        ctx.moveTo(last.x * scale, last.y * scale);
        ctx.lineTo(pt.x * scale, pt.y * scale);
        ctx.stroke();
      }
      ctx.restore();
    } else if (activeTool === 'highlight') {
      if (highlightMode === 'variable') {
        // Variable Mode: follows cursor freely so user can make random markings
        currentPathRef.current.push(pt);
        const overlay = overlayCanvasRef.current;
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = highlightOpacity;
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = strokeWidth * 4.5 * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const pts = currentPathRef.current;
        if (pts.length > 1) {
          const last = pts[pts.length - 2];
          ctx.beginPath();
          ctx.moveTo(last.x * scale, last.y * scale);
          ctx.lineTo(pt.x * scale, pt.y * scale);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // Fixed Mode: Smart straight-line uniform highlighter flow from initial click to straight end
        redrawOverlay();
        const overlay = overlayCanvasRef.current;
        if (!overlay || !shapeStartPointRef.current) return;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;

        const start = shapeStartPointRef.current;
        const straightEndX = pt.x;
        const straightEndY = start.y;

        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = highlightOpacity;
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = strokeWidth * 4.5 * scale;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';

        ctx.beginPath();
        ctx.moveTo(start.x * scale, start.y * scale);
        ctx.lineTo(straightEndX * scale, straightEndY * scale);
        ctx.stroke();
        ctx.restore();
      }
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
      ctx.lineWidth = (activeTool === 'underline' ? underlineWidth : strokeWidth) * scale;

      if (activeTool === 'underline') {
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
        const rx = Math.abs(pt.x - start.x) / 2;
        const ry = Math.abs(pt.y - start.y) / 2;
        ctx.beginPath();
        ctx.ellipse(Math.min(start.x, pt.x) + rx, Math.min(start.y, pt.y) + ry, rx, ry, 0, 0, 2 * Math.PI);
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

    if (activeTool === 'none' || activeTool === 'select') return;

    const newAnnotation: AnnotationItem = {
      id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: activeTool as AnnotationTool,
      pageIndex: pageNumber,
      color: selectedColor,
      strokeWidth: activeTool === 'underline' ? underlineWidth : strokeWidth,
      opacity: activeTool === 'highlight' ? highlightOpacity : 1.0,
    };

    if (activeTool === 'draw') {
      if (currentPathRef.current.length < 2) return;
      newAnnotation.points = [...currentPathRef.current];
    } else if (activeTool === 'highlight') {
      if (highlightMode === 'variable') {
        if (currentPathRef.current.length < 2) return;
        newAnnotation.points = [...currentPathRef.current];
        newAnnotation.strokeWidth = strokeWidth;
        newAnnotation.opacity = highlightOpacity;
      } else {
        if (!shapeStartPointRef.current) return;
        const start = shapeStartPointRef.current;
        const straightEndX = pt.x;
        const straightEndY = start.y;
        if (Math.abs(straightEndX - start.x) < 2) return;

        newAnnotation.startPoint = { x: start.x, y: start.y };
        newAnnotation.endPoint = { x: straightEndX, y: straightEndY };
        newAnnotation.strokeWidth = strokeWidth;
        newAnnotation.opacity = highlightOpacity;
      }
    } else if (['underline', 'rect', 'circle', 'arrow'].includes(activeTool)) {
      if (!shapeStartPointRef.current) return;
      newAnnotation.startPoint = shapeStartPointRef.current;
      newAnnotation.endPoint = pt;
    }

    onAddAnnotation(newAnnotation);
  };

  // Start Dragging Note Box (Any non-functional area)
  const handleStartDragModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeNoteModal) return;
    setIsDraggingModal(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialPos: { ...activeNoteModal.pos },
      initialWidth: activeNoteModal.width,
      initialHeight: activeNoteModal.height,
    };
  };

  // Start 4-Directional Resizing of Note Box
  const handleStartResize = (e: React.MouseEvent, dir: ResizeDirection) => {
    e.stopPropagation();
    if (!activeNoteModal) return;
    setResizingDirection(dir);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialPos: { ...activeNoteModal.pos },
      initialWidth: activeNoteModal.width,
      initialHeight: activeNoteModal.height,
    };
  };

  // Global mousemove/mouseup for Dragging & 4-Directional Resizing
  useEffect(() => {
    if (!isDraggingModal && !resizingDirection) return;

    const handleMouseMoveDoc = (e: MouseEvent) => {
      if (!activeNoteModal) return;
      const dx = (e.clientX - dragStartRef.current.clientX) / scale;
      const dy = (e.clientY - dragStartRef.current.clientY) / scale;

      if (isDraggingModal) {
        setActiveNoteModal((prev) =>
          prev
            ? {
                ...prev,
                pos: {
                  x: Math.max(5, dragStartRef.current.initialPos.x + dx),
                  y: Math.max(10, dragStartRef.current.initialPos.y + dy),
                },
              }
            : null
        );
      } else if (resizingDirection) {
        setActiveNoteModal((prev) => {
          if (!prev) return null;
          let newWidth = prev.width;
          let newHeight = prev.height;
          let newX = prev.pos.x;
          let newY = prev.pos.y;

          // East / West (Line width adjustment)
          if (resizingDirection.includes('e')) {
            newWidth = Math.max(120, dragStartRef.current.initialWidth + dx);
          } else if (resizingDirection.includes('w')) {
            const possibleWidth = dragStartRef.current.initialWidth - dx;
            if (possibleWidth >= 120) {
              newWidth = possibleWidth;
              newX = dragStartRef.current.initialPos.x + dx;
            }
          }

          // South / North (Height adjustment)
          if (resizingDirection.includes('s')) {
            newHeight = Math.max(70, dragStartRef.current.initialHeight + dy);
          } else if (resizingDirection.includes('n')) {
            const possibleHeight = dragStartRef.current.initialHeight - dy;
            if (possibleHeight >= 70) {
              newHeight = possibleHeight;
              newY = dragStartRef.current.initialPos.y + dy;
            }
          }

          return {
            ...prev,
            pos: { x: newX, y: newY },
            width: newWidth,
            height: newHeight,
          };
        });
      }
    };

    const handleMouseUpDoc = () => {
      setIsDraggingModal(false);
      setResizingDirection(null);
    };

    window.addEventListener('mousemove', handleMouseMoveDoc);
    window.addEventListener('mouseup', handleMouseUpDoc);

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveDoc);
      window.removeEventListener('mouseup', handleMouseUpDoc);
    };
  }, [isDraggingModal, resizingDirection, activeNoteModal, scale]);

  // Save Note / Commit Changes
  const handleCommitNoteModal = () => {
    if (!activeNoteModal || !activeNoteModal.text.trim()) {
      if (activeNoteModal?.id) {
        onDeleteAnnotation(activeNoteModal.id);
      }
      setActiveNoteModal(null);
      return;
    }

    if (activeNoteModal.id) {
      // Update existing note
      onUpdateAnnotation(activeNoteModal.id, {
        text: activeNoteModal.text.trim(),
        fontSize: activeNoteModal.fontSize,
        color: activeNoteModal.color,
        startPoint: activeNoteModal.pos,
        width: activeNoteModal.width,
        height: activeNoteModal.height,
      });
    } else {
      // Create new note
      const newAnnotation: AnnotationItem = {
        id: 'ann_note_' + Date.now(),
        type: 'note',
        pageIndex: pageNumber,
        color: activeNoteModal.color,
        strokeWidth: 1,
        fontSize: activeNoteModal.fontSize,
        startPoint: activeNoteModal.pos,
        text: activeNoteModal.text.trim(),
        width: activeNoteModal.width,
        height: activeNoteModal.height,
      };
      onAddAnnotation(newAnnotation);
    }

    setActiveNoteModal(null);
  };

  // Save Regular Text
  const handleSaveText = () => {
    if (!activeTextCreation || !activeTextCreation.text.trim()) {
      setActiveTextCreation(null);
      return;
    }

    const newAnnotation: AnnotationItem = {
      id: 'ann_text_' + Date.now(),
      type: 'text',
      pageIndex: pageNumber,
      color: selectedColor,
      strokeWidth: 1,
      fontSize: 16,
      startPoint: activeTextCreation.pos,
      text: activeTextCreation.text.trim(),
    };

    onAddAnnotation(newAnnotation);
    setActiveTextCreation(null);
  };

  return (
    <div
      id={`pdf-page-${pageNumber}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '2.5rem',
        width: '100%',
      }}
    >
      {/* Page Badge */}
      <div
        style={{
          fontSize: '11.5px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '8px',
          background: 'rgba(255,255,255,0.06)',
          padding: '3px 12px',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        Page {pageNumber}
      </div>

      <div
        className="pdf-page-container"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          position: 'relative',
        }}
      >
        {!isRendered && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff',
              color: '#3b82f6',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            <Loader2 size={16} className="animate-spin" />
            <span>Loading page {pageNumber}...</span>
          </div>
        )}

        {/* Base PDF Canvas */}
        <canvas ref={canvasRef} style={{ display: 'block' }} />

        {/* Interactive Annotation Canvas */}
        <canvas
          ref={overlayCanvasRef}
          className="pdf-annotation-layer"
          style={{
            cursor:
              activeTool === 'eraser'
                ? 'cell'
                : activeTool === 'note'
                ? 'text'
                : activeTool === 'draw'
                ? 'crosshair'
                : activeTool === 'highlight'
                ? 'crosshair'
                : 'default',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        {/* Moveable & 4-Way Resizable Note Writing Box */}
        {activeNoteModal && (
          <div
            onMouseDown={handleStartDragModal}
            style={{
              position: 'absolute',
              left: activeNoteModal.pos.x * scale,
              top: (activeNoteModal.pos.y - 25) * scale,
              width: `${activeNoteModal.width * scale}px`,
              minHeight: `${activeNoteModal.height * scale}px`,
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.98)',
              padding: '10px 12px',
              borderRadius: '10px',
              border: `2px solid ${activeNoteModal.color}`,
              boxShadow: '0 14px 40px rgba(0,0,0,0.85)',
              cursor: 'move',
              userSelect: 'none',
              boxSizing: 'border-box',
            }}
          >
            {/* 4-Directional Edge & Corner Resize Handles (with visible grips) */}
            {/* Right Handle (e-resize) */}
            <div
              onMouseDown={(e) => handleStartResize(e, 'e')}
              style={{
                position: 'absolute',
                top: 0,
                right: -6,
                width: '12px',
                height: '100%',
                cursor: 'e-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 60,
              }}
              title="Drag right/left to expand or shorten line length"
            >
              <div style={{ width: '4px', height: '24px', backgroundColor: activeNoteModal.color, borderRadius: '2px', opacity: 0.8 }} />
            </div>

            {/* Left Handle (w-resize) */}
            <div
              onMouseDown={(e) => handleStartResize(e, 'w')}
              style={{
                position: 'absolute',
                top: 0,
                left: -6,
                width: '12px',
                height: '100%',
                cursor: 'w-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 60,
              }}
              title="Drag left to expand line length"
            >
              <div style={{ width: '4px', height: '24px', backgroundColor: activeNoteModal.color, borderRadius: '2px', opacity: 0.8 }} />
            </div>

            {/* Bottom Handle (s-resize) */}
            <div
              onMouseDown={(e) => handleStartResize(e, 's')}
              style={{
                position: 'absolute',
                bottom: -6,
                left: 0,
                width: '100%',
                height: '12px',
                cursor: 's-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 60,
              }}
              title="Drag down to expand box height"
            >
              <div style={{ width: '28px', height: '4px', backgroundColor: activeNoteModal.color, borderRadius: '2px', opacity: 0.8 }} />
            </div>

            {/* Top Handle (n-resize) */}
            <div
              onMouseDown={(e) => handleStartResize(e, 'n')}
              style={{
                position: 'absolute',
                top: -6,
                left: 0,
                width: '100%',
                height: '12px',
                cursor: 'n-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 60,
              }}
              title="Drag up to expand box height"
            >
              <div style={{ width: '28px', height: '4px', backgroundColor: activeNoteModal.color, borderRadius: '2px', opacity: 0.8 }} />
            </div>

            {/* Corner Handles */}
            <div
              onMouseDown={(e) => handleStartResize(e, 'se')}
              style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: '12px',
                height: '12px',
                backgroundColor: activeNoteModal.color,
                borderRadius: '3px',
                cursor: 'se-resize',
                zIndex: 65,
                boxShadow: '0 0 6px rgba(0,0,0,0.5)',
              }}
              title="Drag corner to resize width and height simultaneously"
            />
            <div
              onMouseDown={(e) => handleStartResize(e, 'sw')}
              style={{
                position: 'absolute',
                bottom: -4,
                left: -4,
                width: '12px',
                height: '12px',
                backgroundColor: activeNoteModal.color,
                borderRadius: '3px',
                cursor: 'sw-resize',
                zIndex: 65,
                boxShadow: '0 0 6px rgba(0,0,0,0.5)',
              }}
              title="Drag corner to resize width and height simultaneously"
            />

            {/* Top Header: Title, Color Swatches & Font Size */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '6px',
                paddingBottom: '6px',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                cursor: 'move',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: activeNoteModal.color }}>
                  {activeNoteModal.id ? 'Edit Note' : 'Note'}
                </span>

                {/* Color Swatches */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onMouseDown={(e) => e.stopPropagation()}>
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setActiveNoteModal((prev) => (prev ? { ...prev, color: c } : null))}
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: activeNoteModal.color === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              {/* Font Size Selector */}
              <div onMouseDown={(e) => e.stopPropagation()}>
                <select
                  value={activeNoteModal.fontSize}
                  onChange={(e) =>
                    setActiveNoteModal((prev) =>
                      prev ? { ...prev, fontSize: parseInt(e.target.value, 10) } : null
                    )
                  }
                  style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    height: '22px',
                    background: 'var(--bg-secondary)',
                    color: '#fff',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  {NOTE_FONT_SIZES.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}px Font
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Auto-focused Direct Text Input Area */}
            <textarea
              autoFocus
              onMouseDown={(e) => e.stopPropagation()}
              value={activeNoteModal.text}
              onChange={(e) =>
                setActiveNoteModal((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitNoteModal();
                }
                if (e.key === 'Escape') setActiveNoteModal(null);
              }}
              placeholder="Type your note here... (drag borders to resize)"
              style={{
                flex: 1,
                width: '100%',
                minHeight: '60px',
                background: 'rgba(0,0,0,0.45)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '6px',
                color: activeNoteModal.color,
                fontSize: `${activeNoteModal.fontSize * scale}px`,
                fontWeight: 600,
                padding: '8px',
                resize: 'none',
                userSelect: 'text',
                cursor: 'text',
                boxSizing: 'border-box',
              }}
            />

            {/* Actions Bar (Set & Cancel) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '4px',
                cursor: 'move',
              }}
            >
              {activeNoteModal.id ? (
                <button
                  className="btn-danger"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
                  onClick={() => {
                    onDeleteAnnotation(activeNoteModal.id!);
                    setActiveNoteModal(null);
                  }}
                  title="Delete Note"
                >
                  <Trash2 size={12} />
                  <span>Delete</span>
                </button>
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Drag body to move • Drag edges to resize
                </span>
              )}

              <div style={{ display: 'flex', gap: '6px' }} onMouseDown={(e) => e.stopPropagation()}>
                <button
                  className="btn-secondary"
                  style={{ padding: '3px 12px', fontSize: '12px' }}
                  onClick={() => setActiveNoteModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ padding: '3px 14px', fontSize: '12px', fontWeight: 600 }}
                  onClick={handleCommitNoteModal}
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Regular Text Input Overlay */}
        {activeTextCreation && (
          <div
            style={{
              position: 'absolute',
              left: activeTextCreation.pos.x * scale,
              top: (activeTextCreation.pos.y - 12) * scale,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(15, 23, 42, 0.95)',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #3b82f6',
            }}
          >
            <input
              autoFocus
              type="text"
              value={activeTextCreation.text}
              onChange={(e) =>
                setActiveTextCreation((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveText();
                if (e.key === 'Escape') setActiveTextCreation(null);
              }}
              placeholder="Type text & Enter..."
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
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={handleSaveText}
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Main Continuous Multi-Page PDF Editor
export const PdfEditor: React.FC<PdfEditorProps> = ({
  file,
  arrayBuffer,
  onModify,
  onHasUnsavedChanges,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [activeTool, setActiveTool] = useState<AnnotationTool | 'none'>('draw');

  // Pen settings
  const [penColor, setPenColor] = useState<string>('#ef4444');
  const [penWidth, setPenWidth] = useState<number>(3); // 1px to 12px
  const [showPenPopover, setShowPenPopover] = useState<boolean>(false);

  // Highlight settings
  const [highlightColor, setHighlightColor] = useState<string>('#facc15');
  const [highlightStrength, setHighlightStrength] = useState<number>(0.30); // 5 divisions (0.15 to 0.90)
  const [highlightWidth, setHighlightWidth] = useState<number>(4.5); // 2 to 8.5
  const [highlightMode, setHighlightMode] = useState<'fixed' | 'variable'>('fixed'); // 'fixed' = straight line, 'variable' = freehand cursor follow
  const [showHighlightPopover, setShowHighlightPopover] = useState<boolean>(false);

  // Underline settings
  const [underlineColor, setUnderlineColor] = useState<string>('#ef4444');
  const [underlineWidth, setUnderlineWidth] = useState<number>(2); // 1px to 8px
  const [showUnderlinePopover, setShowUnderlinePopover] = useState<boolean>(false);

  // Note settings
  const [noteColor, setNoteColor] = useState<string>('#38bdf8');
  const [noteFontSize, setNoteFontSize] = useState<number>(14);

  // General drawing color
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);

  // Annotation List & Undo/Redo Stacks
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const undoStackRef = useRef<AnnotationItem[][]>([]);
  const redoStackRef = useRef<AnnotationItem[][]>([]);

  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [restoredPage, setRestoredPage] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Load entire PDF document with local worker & restore last-read page
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingPdf(true);

    async function loadPdf() {
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer.slice(0)),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDocProxy(pdf);
          setNumPages(pdf.numPages);

          // Restore last-read page position for this specific document
          const storageKey = `pdf_last_read_page_${file.id || file.name}`;
          const savedPage = localStorage.getItem(storageKey);
          const initialPage = savedPage ? parseInt(savedPage, 10) : 1;

          if (initialPage > 1 && initialPage <= pdf.numPages) {
            setCurrentPage(initialPage);
            setRestoredPage(initialPage);
            setTimeout(() => {
              const el = document.getElementById(`pdf-page-${initialPage}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 300);
            setTimeout(() => setRestoredPage(null), 4500);
          } else {
            setTimeout(() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
              }
            }, 50);
          }
        }
      } catch (err) {
        console.error('PDF loading error:', err);
      } finally {
        if (!isCancelled) setIsLoadingPdf(false);
      }
    }

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [arrayBuffer, file.id, file.name]);

  // Track active page as user scrolls & persist position
  const handleScroll = () => {
    if (!scrollContainerRef.current || numPages === 0) return;
    const container = scrollContainerRef.current;
    const containerTop = container.scrollTop;
    const viewportMid = containerTop + container.clientHeight / 3;

    for (let p = 1; p <= numPages; p++) {
      const el = document.getElementById(`pdf-page-${p}`);
      if (el) {
        const top = el.offsetTop - container.offsetTop;
        const bottom = top + el.clientHeight;
        if (viewportMid >= top && viewportMid <= bottom) {
          setCurrentPage(p);
          const storageKey = `pdf_last_read_page_${file.id || file.name}`;
          localStorage.setItem(storageKey, p.toString());
          break;
        }
      }
    }
  };

  // Jump to specific page
  const scrollToPage = (pageNum: number) => {
    const el = document.getElementById(`pdf-page-${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(pageNum);
      const storageKey = `pdf_last_read_page_${file.id || file.name}`;
      localStorage.setItem(storageKey, pageNum.toString());
    }
  };

  // Compile annotations into valid PDF binary across all pages
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
          const fSize = ann.fontSize || 14;
          const boxWidth = ann.width || 260;

          // Word-wrap lines for PDF document
          const words = ann.text.split(' ');
          const lines: string[] = [];
          let currentLine = '';

          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const textWidth = fontRegular.widthOfTextAtSize(testLine, fSize);
            if (textWidth > boxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);

          lines.forEach((line, index) => {
            targetPage.drawText(line, {
              x: ann.startPoint!.x,
              y: pdfY - index * (fSize * 1.3),
              size: fSize,
              font: fontRegular,
              color: rgb(r, g, b),
            });
          });
        } else if (ann.type === 'underline' && ann.startPoint && ann.endPoint) {
          targetPage.drawLine({
            start: { x: ann.startPoint.x, y: pdfPageHeight - ann.startPoint.y },
            end: { x: ann.endPoint.x, y: pdfPageHeight - ann.endPoint.y },
            thickness: ann.strokeWidth || 2,
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
        } else if (ann.type === 'highlight' && ann.startPoint && ann.endPoint) {
          targetPage.drawLine({
            start: { x: ann.startPoint.x, y: pdfPageHeight - ann.startPoint.y },
            end: { x: ann.endPoint.x, y: pdfPageHeight - ann.endPoint.y },
            thickness: (ann.strokeWidth || 3) * 4.5,
            color: rgb(r, g, b),
            opacity: ann.opacity !== undefined ? ann.opacity : 0.30,
          });
        } else if ((ann.type === 'draw' || ann.type === 'highlight') && ann.points && ann.points.length > 1) {
          for (let i = 0; i < ann.points.length - 1; i++) {
            const p1 = ann.points[i];
            const p2 = ann.points[i + 1];
            targetPage.drawLine({
              start: { x: p1.x, y: pdfPageHeight - p1.y },
              end: { x: p2.x, y: pdfPageHeight - p2.y },
              thickness: ann.type === 'highlight' ? ann.strokeWidth * 4.5 : ann.strokeWidth,
              color: rgb(r, g, b),
              opacity: ann.type === 'highlight' ? (ann.opacity !== undefined ? ann.opacity : 0.30) : 1.0,
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
      return new Blob([buffer], { type: 'application/pdf' });
    } catch (err) {
      console.error('Failed to compile modified PDF:', err);
      return new Blob([arrayBuffer], { type: 'application/pdf' });
    }
  };

  const pushToHistory = (current: AnnotationItem[]) => {
    undoStackRef.current.push([...current]);
    redoStackRef.current = [];
  };

  const handleAddAnnotation = (annotation: AnnotationItem) => {
    pushToHistory(annotations);
    const updated = [...annotations, annotation];
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleUpdateAnnotation = (id: string, updates: Partial<AnnotationItem>) => {
    pushToHistory(annotations);
    const updated = annotations.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann));
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleDeleteAnnotation = (id: string) => {
    pushToHistory(annotations);
    const updated = annotations.filter((ann) => ann.id !== id);
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    exportModifiedPdf(updated).then(onModify);
  };

  const handleEraseAtPoint = (pageNumber: number, pt: Point) => {
    const updated = annotations.filter((ann) => {
      if (ann.pageIndex !== pageNumber) return true;
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
      pushToHistory(annotations);
      setAnnotations(updated);
      onHasUnsavedChanges(true);
      exportModifiedPdf(updated).then(onModify);
    }
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    redoStackRef.current.push([...annotations]);
    setAnnotations(previous);
    onHasUnsavedChanges(previous.length > 0 || undoStackRef.current.length > 0);
    exportModifiedPdf(previous).then(onModify);
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push([...annotations]);
    setAnnotations(next);
    onHasUnsavedChanges(true);
    exportModifiedPdf(next).then(onModify);
  };

  const handleClearAll = () => {
    pushToHistory(annotations);
    setAnnotations([]);
    onHasUnsavedChanges(true);
    exportModifiedPdf([]).then(onModify);
  };

  // Toggle Highlight tool
  const handleHighlightClick = () => {
    if (activeTool === 'highlight') {
      setActiveTool('none');
    } else {
      setActiveTool('highlight');
      setSelectedColor(highlightColor);
    }
  };

  // Toggle Underline tool
  const handleUnderlineClick = () => {
    if (activeTool === 'underline') {
      setActiveTool('none');
    } else {
      setActiveTool('underline');
      setSelectedColor(underlineColor);
    }
  };

  // Toggle Note tool
  const handleNoteClick = () => {
    if (activeTool === 'note') {
      setActiveTool('none');
    } else {
      setActiveTool('note');
      setSelectedColor(noteColor);
    }
  };

  return (
    <div className="editor-container" onClick={() => {
      if (showPenPopover) setShowPenPopover(false);
      if (showHighlightPopover) setShowHighlightPopover(false);
      if (showUnderlinePopover) setShowUnderlinePopover(false);
    }}>
      {/* PDF Main Toolbar */}
      <div className="editor-toolbar">
        {/* Annotation Tools */}
        <div className="toolbar-group">
          {/* Pen Split Tool + Options Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <button
              className={`tool-button ${activeTool === 'draw' ? 'active' : ''}`}
              onClick={() => {
                setActiveTool(activeTool === 'draw' ? 'none' : 'draw');
                setSelectedColor(penColor);
              }}
              style={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                paddingRight: '6px',
              }}
              title="Pen / Freehand Draw (Click to toggle on/off)"
            >
              <Pen size={15} />
              <span>Pen</span>
            </button>
            <button
              className="tool-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPenPopover((v) => !v);
                setShowHighlightPopover(false);
                setShowUnderlinePopover(false);
              }}
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: '0.4rem 4px',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                background: showPenPopover ? 'var(--bg-active)' : undefined,
              }}
              title="Pen Colors & Thickness Settings"
            >
              <ChevronDown size={13} />
            </button>

            {/* Pen Settings Popover */}
            {showPenPopover && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  padding: '12px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 60,
                  width: '240px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Pen Color
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => {
                        setPenColor(c.hex);
                        setSelectedColor(c.hex);
                        setActiveTool('draw');
                      }}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: c.hex,
                        border: penColor === c.hex ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      title={c.name}
                    />
                  ))}
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>
                  Pen Width / Thickness
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {PEN_WIDTHS.map((w) => (
                    <button
                      key={w.value}
                      onClick={() => {
                        setPenWidth(w.value);
                        setActiveTool('draw');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: penWidth === w.value ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: penWidth === w.value ? '#60a5fa' : 'var(--text-primary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{w.label}</span>
                      <div
                        style={{
                          width: '40px',
                          height: `${w.value}px`,
                          backgroundColor: penColor,
                          borderRadius: '2px',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Underline Split Tool + Options Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <button
              className={`tool-button ${activeTool === 'underline' ? 'active' : ''}`}
              onClick={handleUnderlineClick}
              style={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                paddingRight: '6px',
              }}
              title="Underline Text (Click to toggle on/off)"
            >
              <UnderlineIcon size={15} />
              <span>Underline</span>
            </button>
            <button
              className="tool-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowUnderlinePopover((v) => !v);
                setShowPenPopover(false);
                setShowHighlightPopover(false);
              }}
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: '0.4rem 4px',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                background: showUnderlinePopover ? 'var(--bg-active)' : undefined,
              }}
              title="Underline Colors & Thickness Settings"
            >
              <ChevronDown size={13} />
            </button>

            {/* Underline Settings Popover */}
            {showUnderlinePopover && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  padding: '12px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 60,
                  width: '240px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Underline Color
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {UNDERLINE_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => {
                        setUnderlineColor(c.hex);
                        setSelectedColor(c.hex);
                        setActiveTool('underline');
                      }}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: c.hex,
                        border: underlineColor === c.hex ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      title={c.name}
                    />
                  ))}
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>
                  Underline Thickness
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {UNDERLINE_WIDTHS.map((w) => (
                    <button
                      key={w.value}
                      onClick={() => {
                        setUnderlineWidth(w.value);
                        setActiveTool('underline');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: underlineWidth === w.value ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: underlineWidth === w.value ? '#60a5fa' : 'var(--text-primary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{w.label}</span>
                      <div
                        style={{
                          width: '40px',
                          height: `${w.value}px`,
                          backgroundColor: underlineColor,
                          borderRadius: '2px',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Highlight Split Tool + Options Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            <button
              className={`tool-button ${activeTool === 'highlight' ? 'active' : ''}`}
              onClick={handleHighlightClick}
              style={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                paddingRight: '6px',
              }}
              title="Highlighter (Click to toggle on/off)"
            >
              <Highlighter size={15} />
              <span>Highlight</span>
            </button>
            <button
              className="tool-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowHighlightPopover((v) => !v);
                setShowPenPopover(false);
                setShowUnderlinePopover(false);
              }}
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: '0.4rem 4px',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                background: showHighlightPopover ? 'var(--bg-active)' : undefined,
              }}
              title="Highlighter Colors & 5 Strength Divisions"
            >
              <ChevronDown size={13} />
            </button>              {/* Highlight Settings Popover with Mode, Color, Width & 5 Strength Divisions */}
            {showHighlightPopover && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '10px',
                  padding: '12px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 60,
                  width: '270px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Mode Selector: Fixed vs Variable */}
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Highlight Mode
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setHighlightMode('fixed');
                      setActiveTool('highlight');
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: highlightMode === 'fixed' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                      border: highlightMode === 'fixed' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      color: highlightMode === 'fixed' ? '#60a5fa' : 'var(--text-primary)',
                      cursor: 'pointer',
                      gap: '2px',
                    }}
                  >
                    <span>Fixed (Straight)</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 400 }}>Initial to straight end</span>
                  </button>

                  <button
                    onClick={() => {
                      setHighlightMode('variable');
                      setActiveTool('highlight');
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: highlightMode === 'variable' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                      border: highlightMode === 'variable' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      color: highlightMode === 'variable' ? '#60a5fa' : 'var(--text-primary)',
                      cursor: 'pointer',
                      gap: '2px',
                    }}
                  >
                    <span>Variable (Free)</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 400 }}>Follows cursor freely</span>
                  </button>
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>
                  Highlight Color
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => {
                        setHighlightColor(c.hex);
                        setSelectedColor(c.hex);
                        setActiveTool('highlight');
                      }}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: c.hex,
                        border: highlightColor === c.hex ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      title={c.name}
                    />
                  ))}
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>
                  Highlight Width / Height
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {HIGHLIGHT_WIDTHS.map((w) => (
                    <button
                      key={w.value}
                      onClick={() => {
                        setHighlightWidth(w.value);
                        setActiveTool('highlight');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: highlightWidth === w.value ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: highlightWidth === w.value ? '#60a5fa' : 'var(--text-primary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{w.label}</span>
                      <div
                        style={{
                          width: '50px',
                          height: w.height,
                          backgroundColor: highlightColor,
                          opacity: highlightStrength,
                          borderRadius: '2px',
                        }}
                      />
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>
                  Highlight Strength (5 Divisions)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {HIGHLIGHT_STRENGTHS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        setHighlightStrength(s.value);
                        setActiveTool('highlight');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: highlightStrength === s.value ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: highlightStrength === s.value ? '#60a5fa' : 'var(--text-primary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{s.label}</span>
                      <div
                        style={{
                          width: '50px',
                          height: s.height,
                          backgroundColor: highlightColor,
                          opacity: s.value,
                          borderRadius: '2px',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Note Tool (Toggle ON / OFF) */}
          <button
            className={`tool-button ${activeTool === 'note' ? 'active' : ''}`}
            onClick={handleNoteClick}
            title={
              activeTool === 'note'
                ? 'Note tool is ACTIVE (Click anywhere to add/edit a note. Click here to turn OFF)'
                : 'Click to Activate Note mode'
            }
          >
            <StickyNote size={15} />
            <span>Note {activeTool === 'note' ? '(ON)' : ''}</span>
          </button>

          {/* Insert Text Tool */}
          <button
            className={`tool-button ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'text' ? 'none' : 'text')}
            title="Insert Text"
          >
            <Type size={15} />
            <span>Text</span>
          </button>

          {/* Shapes */}
          <button
            className={`tool-button ${activeTool === 'rect' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'rect' ? 'none' : 'rect')}
            title="Rectangle Box"
          >
            <Square size={15} />
          </button>

          <button
            className={`tool-button ${activeTool === 'circle' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'circle' ? 'none' : 'circle')}
            title="Circle"
          >
            <Circle size={15} />
          </button>

          <button
            className={`tool-button ${activeTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'arrow' ? 'none' : 'arrow')}
            title="Arrow"
          >
            <ArrowRight size={15} />
          </button>

          {/* Eraser */}
          <button
            className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'eraser' ? 'none' : 'eraser')}
            title="Eraser (Click or drag across any mark/note to erase)"
          >
            <Eraser size={15} />
            <span>Eraser</span>
          </button>
        </div>

        <div className="tool-divider" />

        {/* Undo, Redo & Clear All */}
        <div className="toolbar-group">
          <button
            className="tool-button"
            onClick={handleUndo}
            disabled={undoStackRef.current.length === 0}
            title="Undo"
          >
            <Undo2 size={15} />
          </button>

          <button
            className="tool-button"
            onClick={handleRedo}
            disabled={redoStackRef.current.length === 0}
            title="Redo"
          >
            <Redo2 size={15} />
          </button>

          <button
            className="tool-button"
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            title="Clear All Annotations"
          >
            <RotateCcw size={15} />
            <span>Clear All</span>
          </button>
        </div>

        {/* Page Jump Selector & Zoom */}
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          {numPages > 1 && (
            <select
              value={currentPage}
              onChange={(e) => scrollToPage(parseInt(e.target.value, 10))}
              style={{ padding: '2px 6px', fontSize: '12px', height: '28px', background: 'var(--bg-tertiary)' }}
            >
              {Array.from({ length: numPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Page {i + 1} / {numPages}
                </option>
              ))}
            </select>
          )}

          {numPages <= 1 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              1 Page
            </span>
          )}

          <div className="tool-divider" />

          <button
            className="tool-button"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
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

      {/* Continuous Multi-Page Scroll Viewport */}
      <div
        ref={scrollContainerRef}
        className="editor-viewport"
        onScroll={handleScroll}
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          overflowX: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '2.5rem 1rem',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Smart Resumed from Page Banner */}
        {restoredPage && (
          <div
            style={{
              position: 'sticky',
              top: '16px',
              zIndex: 70,
              background: 'rgba(15, 23, 42, 0.94)',
              border: '1px solid rgba(59, 130, 246, 0.45)',
              backdropFilter: 'blur(8px)',
              padding: '7px 18px',
              borderRadius: '24px',
              color: '#93c5fd',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '1rem',
            }}
          >
            <span>📖 Resumed from Page {restoredPage}</span>
            <button
              onClick={() => {
                scrollToPage(1);
                setRestoredPage(null);
              }}
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#ffffff',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Go to Page 1
            </button>
            <button
              onClick={() => setRestoredPage(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {isLoadingPdf && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(15, 23, 42, 0.9)',
              padding: '12px 24px',
              borderRadius: '24px',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa',
              fontSize: '14px',
            }}
          >
            <Loader2 size={18} className="animate-spin" />
            <span>Loading document ({numPages || '...'} pages)...</span>
          </div>
        )}

        {/* Render Every Page from Page 1 to N */}
        {pdfDocProxy &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageView
              key={pageNum}
              pageNumber={pageNum}
              pdfDocProxy={pdfDocProxy}
              scale={scale}
              activeTool={activeTool}
              selectedColor={
                activeTool === 'draw'
                  ? penColor
                  : activeTool === 'highlight'
                  ? highlightColor
                  : activeTool === 'underline'
                  ? underlineColor
                  : activeTool === 'note'
                  ? noteColor
                  : selectedColor
              }
              strokeWidth={
                activeTool === 'draw'
                  ? penWidth
                  : activeTool === 'highlight'
                  ? highlightWidth
                  : strokeWidth
              }
              highlightOpacity={highlightStrength}
              highlightMode={highlightMode}
              underlineWidth={underlineWidth}
              noteFontSize={noteFontSize}
              noteColor={noteColor}
              annotations={annotations}
              onAddAnnotation={handleAddAnnotation}
              onUpdateAnnotation={handleUpdateAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onEraseAtPoint={handleEraseAtPoint}
            />
          ))}
      </div>
    </div>
  );
};
