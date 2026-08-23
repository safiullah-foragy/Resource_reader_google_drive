import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { PDFDocument, rgb, StandardFonts, BlendMode, LineCapStyle } from 'pdf-lib';
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
  Maximize2,
  Minimize2,
  Hand,
  Gauge,
  Undo2, 
  Redo2,
  RotateCcw, 
  Loader2, 
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Check,
  X
} from 'lucide-react';
import { AnnotationItem, AnnotationTool, DriveFile, Point } from '../../../types';
import { googleDriveService } from '../../../services/googleDriveService';
import { pdfRamCache } from '../../../services/pdfRamCache';

// Configure bundled local worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker || '/pdfjs/pdf.worker.min.mjs';

interface PdfEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
  isHeaderCollapsed?: boolean;
  onToggleCollapseHeader?: () => void;
}

// 15 Opacity / Strength Variations for Highlighter (MS Edge style translucent levels)
const HIGHLIGHT_STRENGTHS = [
  { level: 1, value: 0.06 },
  { level: 2, value: 0.10 },
  { level: 3, value: 0.15 },
  { level: 4, value: 0.20 },
  { level: 5, value: 0.25 },
  { level: 6, value: 0.30 },
  { level: 7, value: 0.36 },
  { level: 8, value: 0.42 },
  { level: 9, value: 0.48 },
  { level: 10, value: 0.55 },
  { level: 11, value: 0.63 },
  { level: 12, value: 0.71 },
  { level: 13, value: 0.79 },
  { level: 14, value: 0.87 },
  { level: 15, value: 0.95 },
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
  { name: 'Red', hex: '#dc2626' },
  { name: 'Blue', hex: '#1d4ed8' },
  { name: 'Green', hex: '#15803d' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Purple', hex: '#7e22ce' },
  { name: 'Pink', hex: '#be185d' },
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
  { name: 'Red', hex: '#dc2626' },
  { name: 'Blue', hex: '#1d4ed8' },
  { name: 'Green', hex: '#15803d' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Purple', hex: '#7e22ce' },
  { name: 'Pink', hex: '#be185d' },
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
  docId: string;
  pageNumber: number;
  pdfDocProxy: any;
  scale: number;
  defaultDimensions: { width: number; height: number };
  cachedDimensions?: { width: number; height: number };
  onDimensionsKnown?: (pageNumber: number, dimensions: { width: number; height: number }) => void;
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
  docId,
  pageNumber,
  pdfDocProxy,
  scale,
  defaultDimensions,
  cachedDimensions,
  onDimensionsKnown,
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
  const highlightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialDim = cachedDimensions || defaultDimensions;
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: initialDim.width * scale,
    height: initialDim.height * scale,
  });

  useEffect(() => {
    const dim = cachedDimensions || defaultDimensions;
    setDimensions({
      width: dim.width * scale,
      height: dim.height * scale,
    });
  }, [scale, cachedDimensions, defaultDimensions]);
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

  // Dynamic vertical-bar '|' cursor matching the exact highlighter width and selected color
  const highlightCursor = useMemo(() => {
    if (activeTool !== 'highlight') return null;
    const markHeight = Math.round(strokeWidth * 4.5 * scale);
    const svgHeight = Math.max(14, Math.min(128, markHeight));
    const svgWidth = 22;
    const cx = 11;
    const cy = Math.round(svgHeight / 2);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <!-- Outer contrast border for crisp visibility over any background -->
      <line x1="${cx}" y1="2" x2="${cx}" y2="${svgHeight - 2}" stroke="#0f172a" stroke-width="4.5" stroke-linecap="round"/>
      <!-- Inner vertical bar '|' in highlight color -->
      <line x1="${cx}" y1="2" x2="${cx}" y2="${svgHeight - 2}" stroke="${selectedColor || '#facc15'}" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Top guide tick showing upper boundary of highlight -->
      <line x1="${cx - 5}" y1="2" x2="${cx + 5}" y2="2" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="${cx - 5}" y1="2" x2="${cx + 5}" y2="2" stroke="${selectedColor || '#facc15'}" stroke-width="1.8" stroke-linecap="round"/>
      <!-- Bottom guide tick showing lower boundary of highlight -->
      <line x1="${cx - 5}" y1="${svgHeight - 2}" x2="${cx + 5}" y2="${svgHeight - 2}" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="${cx - 5}" y1="${svgHeight - 2}" x2="${cx + 5}" y2="${svgHeight - 2}" stroke="${selectedColor || '#facc15'}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;

    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${cx} ${cy}, text`;
  }, [activeTool, strokeWidth, scale, selectedColor]);

  // Render PDF page canvas (with 0ms RAM Bitmap Cache)
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
        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        // 1. Check in-memory RAM bitmap cache (0ms instant response)
        const ramCached = pdfRamCache.get(docId, pageNumber, scale);
        if (ramCached) {
          canvas.width = ramCached.pixelWidth;
          canvas.height = ramCached.pixelHeight;
          canvas.style.width = `${ramCached.cssWidth}px`;
          canvas.style.height = `${ramCached.cssHeight}px`;
          ctx.drawImage(ramCached.bitmap, 0, 0);

          setDimensions({ width: ramCached.cssWidth, height: ramCached.cssHeight });
          if (!isCancelled) {
            setIsRendered(true);
          }
          return;
        }

        // 2. RAM Cache Miss: Render via worker & cache bitmap in RAM
        const page = await pdfRamCache.getPage(pdfDocProxy, docId, pageNumber);
        if (isCancelled) return;

        // Support High DPI displays for crisp rendering while respecting GPU canvas limits
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const cssViewport = page.getViewport({ scale });

        const MAX_CANVAS_DIM = 4096;
        let renderScale = scale * dpr;
        if (unscaledViewport.width * renderScale > MAX_CANVAS_DIM || unscaledViewport.height * renderScale > MAX_CANVAS_DIM) {
          renderScale = Math.min(MAX_CANVAS_DIM / unscaledViewport.width, MAX_CANVAS_DIM / unscaledViewport.height);
        }
        const pixelViewport = page.getViewport({ scale: renderScale });

        canvas.width = pixelViewport.width;
        canvas.height = pixelViewport.height;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

        setDimensions({ width: cssViewport.width, height: cssViewport.height });
        if (onDimensionsKnown) {
          onDimensionsKnown(pageNumber, { width: unscaledViewport.width, height: unscaledViewport.height });
        }

        const renderContext: any = {
          canvasContext: ctx,
          viewport: pixelViewport,
          intent: 'display',
        };

        if ((pdfjsLib as any).AnnotationMode) {
          renderContext.annotationMode = (pdfjsLib as any).AnnotationMode.ENABLE;
        }

        if (typeof (pdfDocProxy as any).getOptionalContentConfig === 'function') {
          renderContext.optionalContentConfigPromise = (pdfDocProxy as any)
            .getOptionalContentConfig()
            .then((ocConfig: any) => {
              if (ocConfig && typeof ocConfig.getOrder === 'function') {
                const order = ocConfig.getOrder();
                if (Array.isArray(order)) {
                  for (const id of order) {
                    if (typeof id === 'string') {
                      ocConfig.setVisibility(id, true, false);
                    }
                  }
                }
              }
              return ocConfig;
            })
            .catch(() => null);
        }

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;

        if (!isCancelled) {
          setIsRendered(true);

          // Store rendered bitmap in system RAM for future instant page flips
          try {
            createImageBitmap(canvas).then((bitmap) => {
              pdfRamCache.set(
                docId,
                pageNumber,
                scale,
                bitmap,
                pixelViewport.width,
                pixelViewport.height,
                cssViewport.width,
                cssViewport.height
              );
            });
          } catch (e) {}
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
  }, [docId, pdfDocProxy, pageNumber, scale, onDimensionsKnown]);

  // Redraw annotations on overlay
  const redrawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    const highlightCanvas = highlightCanvasRef.current;
    if (!overlay || !highlightCanvas) return;

    const ctx = overlay.getContext('2d');
    const hlCtx = highlightCanvas.getContext('2d');
    if (!ctx || !hlCtx) return;

    overlay.width = dimensions.width;
    overlay.height = dimensions.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    highlightCanvas.width = dimensions.width;
    highlightCanvas.height = dimensions.height;
    hlCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

    const pageAnnotations = annotations.filter((a) => a.pageIndex === pageNumber);

    pageAnnotations.forEach((item) => {
      if (item.type === 'highlight') {
        hlCtx.save();
        hlCtx.strokeStyle = item.color;
        hlCtx.fillStyle = item.color;
        // With mix-blend-mode: multiply on the highlight layer, text stays 100% visible even 5+ times
        hlCtx.globalAlpha = item.opacity !== undefined ? item.opacity : 0.95;
        hlCtx.lineWidth = (item.strokeWidth || 3) * 4.5 * scale;
        hlCtx.lineCap = item.points && item.points.length > 1 ? 'round' : 'square';
        hlCtx.lineJoin = item.points && item.points.length > 1 ? 'round' : 'miter';

        if (item.startPoint && item.endPoint) {
          hlCtx.beginPath();
          hlCtx.moveTo(item.startPoint.x * scale, item.startPoint.y * scale);
          hlCtx.lineTo(item.endPoint.x * scale, item.endPoint.y * scale);
          hlCtx.stroke();
        } else if (item.points && item.points.length > 1) {
          hlCtx.beginPath();
          hlCtx.moveTo(item.points[0].x * scale, item.points[0].y * scale);
          for (let i = 1; i < item.points.length; i++) {
            hlCtx.lineTo(item.points[i].x * scale, item.points[i].y * scale);
          }
          hlCtx.stroke();
        }
        hlCtx.restore();
      } else if (item.type === 'underline') {
        ctx.save();
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = item.strokeWidth * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else {
        ctx.save();
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.lineWidth = item.strokeWidth * scale;
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

    if (activeTool === 'highlight') {
      redrawOverlay();
      const highlightCanvas = highlightCanvasRef.current;
      if (highlightCanvas) {
        const hlCtx = highlightCanvas.getContext('2d');
        if (hlCtx) {
          hlCtx.save();
          hlCtx.globalAlpha = highlightOpacity;
          hlCtx.strokeStyle = selectedColor;
          hlCtx.lineWidth = strokeWidth * 4.5 * scale;
          hlCtx.lineCap = highlightMode === 'variable' ? 'round' : 'square';
          hlCtx.lineJoin = highlightMode === 'variable' ? 'round' : 'miter';
          hlCtx.beginPath();
          hlCtx.moveTo(pt.x * scale, pt.y * scale);
          hlCtx.lineTo(pt.x * scale + 0.1, pt.y * scale);
          hlCtx.stroke();
          hlCtx.restore();
        }
      }

      // Initial visual start vertical bar '|' indicator at placement point
      if (highlightMode === 'fixed') {
        const overlay = overlayCanvasRef.current;
        if (overlay) {
          const ctx = overlay.getContext('2d');
          if (ctx) {
            const markThickness = strokeWidth * 4.5 * scale;
            const halfH = markThickness / 2;
            ctx.save();
            ctx.strokeStyle = selectedColor || '#0284c7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pt.x * scale, pt.y * scale - halfH);
            ctx.lineTo(pt.x * scale, pt.y * scale + halfH);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }
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
        // Variable Mode: smooth continuous polyline stroke in multiply layer
        currentPathRef.current.push(pt);
        redrawOverlay();
        const highlightCanvas = highlightCanvasRef.current;
        if (!highlightCanvas) return;
        const hlCtx = highlightCanvas.getContext('2d');
        if (!hlCtx) return;

        const pts = currentPathRef.current;
        if (pts.length > 1) {
          hlCtx.save();
          hlCtx.globalAlpha = highlightOpacity;
          hlCtx.strokeStyle = selectedColor;
          hlCtx.lineWidth = strokeWidth * 4.5 * scale;
          hlCtx.lineCap = 'round';
          hlCtx.lineJoin = 'round';

          hlCtx.beginPath();
          hlCtx.moveTo(pts[0].x * scale, pts[0].y * scale);
          for (let i = 1; i < pts.length; i++) {
            hlCtx.lineTo(pts[i].x * scale, pts[i].y * scale);
          }
          hlCtx.stroke();
          hlCtx.restore();
        }
      } else {
        // Fixed Mode: Smart straight-line uniform highlighter flow from initial click following the covered area
        redrawOverlay();
        const highlightCanvas = highlightCanvasRef.current;
        if (!highlightCanvas || !shapeStartPointRef.current) return;
        const hlCtx = highlightCanvas.getContext('2d');
        if (!hlCtx) return;

        const start = shapeStartPointRef.current;
        const straightEndX = pt.x;
        const straightEndY = start.y;
        const markThickness = strokeWidth * 4.5 * scale;

        hlCtx.save();
        hlCtx.globalAlpha = highlightOpacity;
        hlCtx.strokeStyle = selectedColor;
        hlCtx.lineWidth = markThickness;
        hlCtx.lineCap = 'square';
        hlCtx.lineJoin = 'miter';

        hlCtx.beginPath();
        hlCtx.moveTo(start.x * scale, start.y * scale);
        hlCtx.lineTo(straightEndX * scale, straightEndY * scale);
        hlCtx.stroke();
        hlCtx.restore();

        // Draw dynamic '|' signs at initial start point and current cursor point tracking covered area
        const overlay = overlayCanvasRef.current;
        if (overlay) {
          const ctx = overlay.getContext('2d');
          if (ctx) {
            const halfH = markThickness / 2;
            const startX = start.x * scale;
            const startY = start.y * scale;
            const curX = straightEndX * scale;

            ctx.save();
            ctx.strokeStyle = selectedColor || '#0284c7';
            ctx.lineWidth = 2;

            // Initial start vertical bar '|'
            ctx.beginPath();
            ctx.moveTo(startX, startY - halfH);
            ctx.lineTo(startX, startY + halfH);
            ctx.stroke();

            // End / current vertical bar '|' following the covered area
            ctx.beginPath();
            ctx.moveTo(curX, startY - halfH);
            ctx.lineTo(curX, startY + halfH);
            ctx.stroke();

            ctx.restore();
          }
        }
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
        if (currentPathRef.current.length < 2) {
          redrawOverlay();
          return;
        }
        newAnnotation.points = [...currentPathRef.current];
        newAnnotation.strokeWidth = strokeWidth;
        newAnnotation.opacity = highlightOpacity;
      } else {
        if (!shapeStartPointRef.current) {
          redrawOverlay();
          return;
        }
        const start = shapeStartPointRef.current;
        const straightEndX = pt.x;
        const straightEndY = start.y;
        if (Math.abs(straightEndX - start.x) < 2) {
          redrawOverlay();
          return;
        }

        const minX = Math.min(start.x, straightEndX);
        const maxX = Math.max(start.x, straightEndX);

        newAnnotation.startPoint = { x: minX, y: start.y };
        newAnnotation.endPoint = { x: maxX, y: straightEndY };
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
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          position: 'relative',
          backgroundColor: '#ffffff',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          borderRadius: '4px',
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
              borderRadius: '4px',
              zIndex: 1,
            }}
          >
            <Loader2 size={16} className="animate-spin" />
            <span>Rendering page {pageNumber}...</span>
          </div>
        )}

        {/* Base PDF Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            backgroundColor: '#ffffff',
            borderRadius: '4px',
          }}
        />

        {/* Highlight Layer Canvas (Multiply blend mode over base PDF page) */}
        <canvas
          ref={highlightCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            zIndex: 5,
            pointerEvents: 'none',
            mixBlendMode: 'multiply',
          }}
        />

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
                ? highlightCursor || 'text'
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
  isHeaderCollapsed,
  onToggleCollapseHeader,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(() => {
    try {
      const storageKey = `pdf_last_scale_${file.id || file.name}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.4 && parsed <= 3.0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved pdf scale:', e);
    }
    return 1.2;
  });

  // Persist zoom level per document so switching tabs preserves user zoom state
  useEffect(() => {
    if (scale) {
      try {
        const storageKey = `pdf_last_scale_${file.id || file.name}`;
        localStorage.setItem(storageKey, scale.toString());
      } catch (e) {
        console.warn('Could not save pdf scale:', e);
      }
    }
  }, [scale, file.id, file.name]);
  const [activeTool, setActiveTool] = useState<AnnotationTool | 'none'>('draw');

  // Custom Dynamic Drag-Scroll Speed (0.5x to 4.0x)
  const [scrollSpeed, setScrollSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('pdf_drag_scroll_speed');
    return saved ? parseFloat(saved) : 1.5;
  });
  const [showSpeedPopover, setShowSpeedPopover] = useState<boolean>(false);

  const handleSetScrollSpeed = (speed: number) => {
    setScrollSpeed(speed);
    localStorage.setItem('pdf_drag_scroll_speed', speed.toString());
  };

  // Pen settings
  const [penColor, setPenColor] = useState<string>('#dc2626');
  const [penWidth, setPenWidth] = useState<number>(3); // 1px to 12px
  const [showPenPopover, setShowPenPopover] = useState<boolean>(false);

  // Highlight settings (Default is highest strength: Level 15 / 0.95)
  const [highlightColor, setHighlightColor] = useState<string>('#facc15');
  const [highlightStrength, setHighlightStrength] = useState<number>(0.95); // Default Level 15 (0.95)
  const [highlightWidth, setHighlightWidth] = useState<number>(4.5); // 2 to 8.5
  const [highlightMode, setHighlightMode] = useState<'fixed' | 'variable'>('fixed'); // 'fixed' = straight line, 'variable' = freehand cursor follow
  const [showHighlightPopover, setShowHighlightPopover] = useState<boolean>(false);

  // Underline settings
  const [underlineColor, setUnderlineColor] = useState<string>('#dc2626');
  const [underlineWidth, setUnderlineWidth] = useState<number>(2); // 1px to 8px
  const [showUnderlinePopover, setShowUnderlinePopover] = useState<boolean>(false);

  // Note settings
  const [noteColor, setNoteColor] = useState<string>('#38bdf8');
  const [noteFontSize, setNoteFontSize] = useState<number>(14);

  // General drawing color
  const [selectedColor, setSelectedColor] = useState<string>('#dc2626');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);

  // Page dimension caching & virtualization
  const [defaultDimensions, setDefaultDimensions] = useState<{ width: number; height: number }>({ width: 595.28, height: 841.89 });
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const handleDimensionsKnown = useCallback((pageNum: number, dim: { width: number; height: number }) => {
    setPageDimensions((prev) => (prev[pageNum] ? prev : { ...prev, [pageNum]: dim }));
  }, []);

  // Annotation List & Undo/Redo Stacks (Auto-persisted to prevent data loss on sudden power/wifi cuts)
  const [annotations, setAnnotations] = useState<AnnotationItem[]>(() => {
    try {
      const saved = localStorage.getItem(`pdf_annotations_${file.id || file.name}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const undoStackRef = useRef<AnnotationItem[][]>([]);
  const redoStackRef = useRef<AnnotationItem[][]>([]);

  useEffect(() => {
    if (annotations.length > 0) {
      localStorage.setItem(`pdf_annotations_${file.id || file.name}`, JSON.stringify(annotations));
    } else {
      localStorage.removeItem(`pdf_annotations_${file.id || file.name}`);
    }
  }, [annotations, file.id, file.name]);

  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoredPage, setRestoredPage] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 1, end: 4 });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Load entire PDF document with local worker & restore last-read page
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingPdf(true);
    setLoadError(null);
    if (annotations.length > 0) {
      onHasUnsavedChanges(true);
    } else {
      onHasUnsavedChanges(false);
    }

    async function loadPdf() {
      try {
        let rawData: Uint8Array | null = null;

        // 1. Try reading directly from fileHandle (local drive picker)
        if (file.fileHandle && typeof file.fileHandle.getFile === 'function') {
          try {
            const localFile = await file.fileHandle.getFile();
            const buf = await localFile.arrayBuffer();
            if (buf && buf.byteLength > 0) {
              rawData = new Uint8Array(buf);
            }
          } catch (e) {
            console.warn('Could not read from fileHandle:', e);
          }
        }

        // 2. Try reading from rawBlob
        if (!rawData && file.rawBlob) {
          try {
            const buf = await file.rawBlob.arrayBuffer();
            if (buf && buf.byteLength > 0) {
              rawData = new Uint8Array(buf);
            }
          } catch (e) {
            console.warn('Could not read from rawBlob:', e);
          }
        }

        // 3. Try using arrayBuffer if intact
        if (!rawData && arrayBuffer && arrayBuffer.byteLength > 0) {
          rawData = new Uint8Array(arrayBuffer.slice(0));
        }

        // 4. Try re-downloading from Google Drive if remote file
        if (!rawData && !file.isLocal && !file.id.startsWith('local_')) {
          try {
            const { data } = await googleDriveService.downloadFile(file.id, file.mimeType, undefined, file.driveAccountId);
            if (data && data.byteLength > 0) {
              rawData = new Uint8Array(data);
            }
          } catch (e) {
            console.warn('Could not re-download from Drive:', e);
          }
        }

        if (!rawData || rawData.byteLength === 0) {
          throw new Error('PDF file buffer is empty or detached. Please close and re-open this file.');
        }

        const loadingTask = pdfjsLib.getDocument({
          data: rawData,
          wasmUrl: '/pdfjs/wasm/',
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          disableFontFace: false,
          disableAutoFetch: true,
          disableStream: true,
          disableRange: true,
          enableXfa: true,
          useWasm: true,
          verbosity: 1,
        } as any);

        const pdf = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDocProxy(pdf);
          setNumPages(pdf.numPages);
          setIsLoadingPdf(false);

          // Restore last-read page position for this specific document
          const storageKey = `pdf_last_read_page_${file.id || file.name}`;
          const savedPage = localStorage.getItem(storageKey);
          const initialPage = savedPage ? parseInt(savedPage, 10) : 1;
          const safeInitial = (initialPage > 1 && initialPage <= pdf.numPages) ? initialPage : 1;

          setVisibleRange({
            start: Math.max(1, safeInitial - 1),
            end: Math.min(pdf.numPages, safeInitial + 3),
          });

          if (safeInitial > 1) {
            setCurrentPage(safeInitial);
            setRestoredPage(safeInitial);
            setTimeout(() => {
              const el = document.getElementById(`pdf-page-${safeInitial}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 150);
            setTimeout(() => setRestoredPage(null), 4500);
          } else {
            setTimeout(() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
              }
            }, 30);
          }

          // Asynchronously prefetch page 1 dimensions in background without blocking UI
          pdf.getPage(1).then((firstPage: any) => {
            const vp = firstPage.getViewport({ scale: 1.0 });
            setDefaultDimensions({ width: vp.width, height: vp.height });
            setPageDimensions((prev) => ({ ...prev, 1: { width: vp.width, height: vp.height } }));
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error('PDF loading error:', err);
        if (!isCancelled) {
          setLoadError(err.message || 'Failed to load PDF.');
        }
      } finally {
        if (!isCancelled) setIsLoadingPdf(false);
      }
    }

    loadPdf();
    return () => {
      isCancelled = true;
    };
  }, [file.rawBlob, file.fileHandle, arrayBuffer, file.id, file.name]);

  // Intelligent Background RAM Prefetcher: Pre-loads upcoming pages into System RAM for 0ms transitions
  useEffect(() => {
    if (!pdfDocProxy || numPages <= 1) return;

    const docId = file.id || file.name;
    const center = currentPage;

    // Queue prefetch for forward and backward neighbors
    const pagesToPrefetch = [center + 1, center + 2, center + 3, center - 1, center + 4].filter(
      (p) => p >= 1 && p <= numPages && !pdfRamCache.has(docId, p, scale)
    );

    if (pagesToPrefetch.length === 0) return;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      if (!cancelled) {
        await pdfRamCache.prefetchPages(docId, pdfDocProxy, pagesToPrefetch, scale);
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [currentPage, scale, pdfDocProxy, numPages, file.id, file.name]);

  const isZoomingRef = useRef<boolean>(false);
  const pendingScrollAnchorRef = useRef<{
    page: number;
    ratio: number;
  } | null>(null);

  // Accurate single-page height including header badge and bottom margin
  const getSinglePageHeight = useCallback(
    (p: number, currentScale: number) => {
      const h = pageDimensions[p]?.height || defaultDimensions.height || 841.89;
      return h * currentScale + 72;
    },
    [pageDimensions, defaultDimensions.height]
  );

  // Cumulative vertical offset from top of document to top of target page
  const getCumulativeTop = useCallback(
    (targetPage: number, currentScale: number) => {
      let top = 0;
      for (let p = 1; p < targetPage; p++) {
        top += getSinglePageHeight(p, currentScale);
      }
      return top;
    },
    [getSinglePageHeight]
  );

  // Determine active page at a given vertical scroll offset
  const findPageAtScrollTop = useCallback(
    (scrollTopOffset: number, currentScale: number) => {
      let accumulated = 0;
      for (let p = 1; p <= numPages; p++) {
        const h = getSinglePageHeight(p, currentScale);
        if (scrollTopOffset < accumulated + h) {
          return p;
        }
        accumulated += h;
      }
      return Math.max(1, numPages);
    },
    [numPages, getSinglePageHeight]
  );

  // Virtual spacer calculations for 60fps instant rendering of 800+ page documents
  const startPage = Math.max(1, Math.min(numPages || 1, visibleRange.start));
  const endPage = Math.max(startPage, Math.min(numPages || 1, visibleRange.end));

  const topSpacerHeight = useMemo(() => {
    if (startPage <= 1) return 0;
    return getCumulativeTop(startPage, scale);
  }, [startPage, scale, getCumulativeTop]);

  const bottomSpacerHeight = useMemo(() => {
    if (endPage >= numPages) return 0;
    let height = 0;
    for (let p = endPage + 1; p <= numPages; p++) {
      height += getSinglePageHeight(p, scale);
    }
    return height;
  }, [endPage, numPages, scale, getSinglePageHeight]);

  const visiblePages = useMemo(() => {
    if (!numPages) return [];
    const list: number[] = [];
    for (let p = startPage; p <= endPage; p++) {
      list.push(p);
    }
    return list;
  }, [startPage, endPage, numPages]);

  // Steady Zoom Handler: Preserves exact reading page & paragraph position during Zoom In / Zoom Out
  const changeScale = useCallback(
    (newScaleOrUpdater: number | ((prev: number) => number)) => {
      const container = scrollContainerRef.current;
      const nextScale =
        typeof newScaleOrUpdater === 'function'
          ? (newScaleOrUpdater as (prev: number) => number)(scale)
          : newScaleOrUpdater;
      const clampedScale = Math.max(0.4, Math.min(3.0, Math.round(nextScale * 100) / 100));

      if (clampedScale === scale) return;

      let anchorPage = currentPage;
      let ratio = 0;

      if (container) {
        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;

        // Find which page is currently in view near the top of the viewport
        let found = false;
        const pagesToCheck = visiblePages.length > 0 ? visiblePages : [currentPage];
        for (const p of pagesToCheck) {
          const el = document.getElementById(`pdf-page-${p}`);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.bottom > containerTop + 10 && r.top <= containerTop + containerRect.height * 0.65) {
              anchorPage = p;
              const pageH = r.height || 1;
              const offset = Math.max(0, containerTop - r.top);
              ratio = offset / pageH;
              found = true;
              break;
            }
          }
        }

        if (!found) {
          anchorPage = currentPage;
          const currentTop = getCumulativeTop(anchorPage, scale);
          const pageH = getSinglePageHeight(anchorPage, scale);
          ratio = Math.max(0, Math.min(1, (container.scrollTop - currentTop) / Math.max(1, pageH)));
        }
      }

      pendingScrollAnchorRef.current = { page: anchorPage, ratio };
      isZoomingRef.current = true;

      // Update visible range around anchor page immediately so it renders in DOM
      setVisibleRange({
        start: Math.max(1, anchorPage - 2),
        end: Math.min(numPages, anchorPage + 3),
      });

      setScale(clampedScale);
    },
    [scale, currentPage, visiblePages, getCumulativeTop, getSinglePageHeight, numPages]
  );

  // Synchronously lock scroll position to same page and exact relative position upon scale change
  useLayoutEffect(() => {
    if (!pendingScrollAnchorRef.current || !scrollContainerRef.current) return;
    const { page, ratio } = pendingScrollAnchorRef.current;
    pendingScrollAnchorRef.current = null;

    const newPageTop = getCumulativeTop(page, scale);
    const newPageH = getSinglePageHeight(page, scale);
    const targetScrollTop = Math.max(0, newPageTop + ratio * newPageH);

    scrollContainerRef.current.scrollTop = targetScrollTop;

    // Settle browser layout and release zooming lock
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = targetScrollTop;
      }
      setTimeout(() => {
        isZoomingRef.current = false;
      }, 50);
    });
  }, [scale, getCumulativeTop, getSinglePageHeight]);

  // Support smooth Ctrl + Mouse Wheel / trackpad pinch zooming without page jumping
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomStep = e.deltaY < 0 ? 0.15 : -0.15;
        changeScale((s) => Math.max(0.4, Math.min(3.0, Math.round((s + zoomStep) * 100) / 100)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [changeScale]);

  // Track active page and update visible rendering window smoothly
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || numPages === 0) return;
    if (isZoomingRef.current) return;

    const container = scrollContainerRef.current;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight || 800;

    const startPage = Math.max(1, findPageAtScrollTop(Math.max(0, scrollTop - clientHeight), scale) - 1);
    const endPage = Math.min(numPages, findPageAtScrollTop(scrollTop + clientHeight * 2, scale) + 1);
    const centerPage = Math.min(numPages, Math.max(1, findPageAtScrollTop(scrollTop + clientHeight / 3, scale)));

    setVisibleRange((prev) => {
      if (prev.start === startPage && prev.end === endPage) return prev;
      return { start: startPage, end: endPage };
    });

    if (centerPage !== currentPage) {
      setCurrentPage(centerPage);
      const storageKey = `pdf_last_read_page_${file.id || file.name}`;
      localStorage.setItem(storageKey, centerPage.toString());
    }
  }, [numPages, scale, file.id, file.name, currentPage, findPageAtScrollTop]);

  // Jump to specific page
  const scrollToPage = useCallback((pageNum: number) => {
    const targetPage = Math.max(1, Math.min(numPages, pageNum));
    setCurrentPage(targetPage);
    setVisibleRange({
      start: Math.max(1, targetPage - 2),
      end: Math.min(numPages, targetPage + 2),
    });
    const storageKey = `pdf_last_read_page_${file.id || file.name}`;
    localStorage.setItem(storageKey, targetPage.toString());

    const targetTop = getCumulativeTop(targetPage, scale);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      });
    }
  }, [numPages, file.id, file.name, scale, getCumulativeTop]);

  // Auto Fit to Screen Width (minimizes wasted side margin/empty space)
  const handleFitToWidth = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth || 900;
    const pageWidth = pageDimensions[currentPage]?.width || defaultDimensions.width || 595.28;
    const targetScale = Math.max(0.4, Math.min(3.0, (containerWidth - 48) / pageWidth));
    changeScale(Math.round(targetScale * 100) / 100);
  }, [defaultDimensions.width, pageDimensions, currentPage, changeScale]);

  // Fit Entire Page into Viewport Height
  const handleFitToPage = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const containerHeight = scrollContainerRef.current.clientHeight || 800;
    const pageHeight = (pageDimensions[currentPage]?.height || defaultDimensions.height || 841.89) + 72;
    const targetScale = Math.max(0.4, Math.min(3.0, (containerHeight - 48) / pageHeight));
    changeScale(Math.round(targetScale * 100) / 100);
  }, [defaultDimensions.height, pageDimensions, currentPage, changeScale]);

  // Single-Click Press & Hold Drag-to-Scroll with Kinetic Inertia
  const panDragRef = useRef<{
    clientY: number;
    scrollTop: number;
    isDragging: boolean;
    lastY: number;
    lastTime: number;
    velocity: number;
  }>({
    clientY: 0,
    scrollTop: 0,
    isDragging: false,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  });
  const inertiaRafRef = useRef<number | null>(null);

  const stopInertia = useCallback(() => {
    if (inertiaRafRef.current) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }, []);

  const handleStartDragScroll = useCallback((e: React.MouseEvent) => {
    // If double click or multi click (e.detail >= 2), cancel drag and prevent native browser word selection / scroll
    if (e.detail > 1) {
      e.preventDefault();
      e.stopPropagation();
      panDragRef.current.isDragging = false;
      return;
    }
    if (!scrollContainerRef.current) return;
    stopInertia();
    const now = performance.now();
    panDragRef.current = {
      clientY: e.clientY,
      scrollTop: scrollContainerRef.current.scrollTop,
      isDragging: true,
      lastY: e.clientY,
      lastTime: now,
      velocity: 0,
    };
  }, [stopInertia]);

  const handleMoveDragScroll = useCallback((e: React.MouseEvent) => {
    if (panDragRef.current.isDragging && scrollContainerRef.current) {
      const now = performance.now();
      const dt = Math.max(1, now - panDragRef.current.lastTime);
      const instantVelocity = (panDragRef.current.lastY - e.clientY) / dt;
      panDragRef.current.velocity = panDragRef.current.velocity * 0.4 + instantVelocity * 0.6;
      panDragRef.current.lastY = e.clientY;
      panDragRef.current.lastTime = now;

      const deltaY = e.clientY - panDragRef.current.clientY;
      scrollContainerRef.current.scrollTop = panDragRef.current.scrollTop - deltaY * scrollSpeed;
    }
  }, [scrollSpeed]);

  const handleEndDragScroll = useCallback(() => {
    if (!panDragRef.current.isDragging) return;
    panDragRef.current.isDragging = false;

    const now = performance.now();
    const wasMoving = now - panDragRef.current.lastTime < 90;
    const velocity = wasMoving ? panDragRef.current.velocity : 0;

    if (Math.abs(velocity) > 0.04 && scrollContainerRef.current) {
      let v = velocity * scrollSpeed * 14;
      const friction = 0.94;

      const applyInertia = () => {
        if (!scrollContainerRef.current || Math.abs(v) < 0.25) {
          inertiaRafRef.current = null;
          return;
        }
        scrollContainerRef.current.scrollTop += v;
        v *= friction;
        inertiaRafRef.current = requestAnimationFrame(applyInertia);
      };

      stopInertia();
      inertiaRafRef.current = requestAnimationFrame(applyInertia);
    }
  }, [scrollSpeed, stopInertia]);

  // Global window listeners for single-click drag scrolling and inertia
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (panDragRef.current.isDragging && scrollContainerRef.current) {
        const now = performance.now();
        const dt = Math.max(1, now - panDragRef.current.lastTime);
        const instantVelocity = (panDragRef.current.lastY - e.clientY) / dt;
        panDragRef.current.velocity = panDragRef.current.velocity * 0.4 + instantVelocity * 0.6;
        panDragRef.current.lastY = e.clientY;
        panDragRef.current.lastTime = now;

        const deltaY = e.clientY - panDragRef.current.clientY;
        scrollContainerRef.current.scrollTop = panDragRef.current.scrollTop - deltaY * scrollSpeed;
      }
    };

    const handleGlobalMouseUp = () => {
      if (panDragRef.current.isDragging) {
        handleEndDragScroll();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      stopInertia();
    };
  }, [scrollSpeed, handleEndDragScroll, stopInertia]);

  // Keyboard navigation for PDF reading: Left & Right arrow keys to scroll one page up / down
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in an input, textarea, or editable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        scrollToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        scrollToPage(currentPage + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPage, scrollToPage]);

  // Compile annotations into valid PDF binary across all pages
  const exportModifiedPdf = async (updatedAnnotations: AnnotationItem[]): Promise<Blob> => {
    try {
      let bufferToLoad: ArrayBuffer | null = null;
      if (file.fileHandle && typeof file.fileHandle.getFile === 'function') {
        try {
          const f = await file.fileHandle.getFile();
          bufferToLoad = await f.arrayBuffer();
        } catch (e) {}
      }
      if (!bufferToLoad && file.rawBlob) {
        try {
          bufferToLoad = await file.rawBlob.arrayBuffer();
        } catch (e) {}
      }
      if (!bufferToLoad && arrayBuffer && arrayBuffer.byteLength > 0) {
        bufferToLoad = arrayBuffer.slice(0);
      }
      if (!bufferToLoad) {
        throw new Error('Cannot export PDF: source buffer not available.');
      }

      const pdfDoc = await PDFDocument.load(bufferToLoad);
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
            opacity: ann.opacity !== undefined ? ann.opacity : 0.95,
            blendMode: BlendMode.Multiply,
            lineCap: LineCapStyle.Butt,
          });
        } else if ((ann.type === 'draw' || ann.type === 'highlight') && ann.points && ann.points.length > 1) {
          const isHighlight = ann.type === 'highlight';
          for (let i = 0; i < ann.points.length - 1; i++) {
            const p1 = ann.points[i];
            const p2 = ann.points[i + 1];
            targetPage.drawLine({
              start: { x: p1.x, y: pdfPageHeight - p1.y },
              end: { x: p2.x, y: pdfPageHeight - p2.y },
              thickness: isHighlight ? (ann.strokeWidth || 3) * 4.5 : (ann.strokeWidth || 2),
              color: rgb(r, g, b),
              opacity: isHighlight ? (ann.opacity !== undefined ? ann.opacity : 0.95) : 1.0,
              blendMode: isHighlight ? BlendMode.Multiply : BlendMode.Normal,
              lineCap: LineCapStyle.Round,
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

  // Debounce PDF binary export so strokes and rapid edits stay 60fps fast
  const exportTimeoutRef = useRef<any>(null);
  const debouncedExportModifiedPdf = useCallback(
    (updatedAnnotations: AnnotationItem[]) => {
      if (exportTimeoutRef.current) {
        clearTimeout(exportTimeoutRef.current);
      }
      exportTimeoutRef.current = setTimeout(() => {
        exportModifiedPdf(updatedAnnotations).then(onModify);
      }, 500);
    },
    [arrayBuffer, onModify]
  );

  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current) {
        clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const pushToHistory = (current: AnnotationItem[]) => {
    undoStackRef.current.push([...current]);
    redoStackRef.current = [];
  };

  const handleAddAnnotation = (annotation: AnnotationItem) => {
    pushToHistory(annotations);
    const updated = [...annotations, annotation];
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    debouncedExportModifiedPdf(updated);
  };

  const handleUpdateAnnotation = (id: string, updates: Partial<AnnotationItem>) => {
    pushToHistory(annotations);
    const updated = annotations.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann));
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    debouncedExportModifiedPdf(updated);
  };

  const handleDeleteAnnotation = (id: string) => {
    pushToHistory(annotations);
    const updated = annotations.filter((ann) => ann.id !== id);
    setAnnotations(updated);
    onHasUnsavedChanges(true);
    debouncedExportModifiedPdf(updated);
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
      debouncedExportModifiedPdf(updated);
    }
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    redoStackRef.current.push([...annotations]);
    setAnnotations(previous);
    onHasUnsavedChanges(previous.length > 0 || undoStackRef.current.length > 0);
    debouncedExportModifiedPdf(previous);
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push([...annotations]);
    setAnnotations(next);
    onHasUnsavedChanges(true);
    debouncedExportModifiedPdf(next);
  };

  const handleClearAll = () => {
    if (annotations.length === 0) return;
    pushToHistory(annotations);
    setAnnotations([]);
    onHasUnsavedChanges(false);
    debouncedExportModifiedPdf([]);
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
    <div
      className="editor-container"
      onClick={() => {
        if (showPenPopover) setShowPenPopover(false);
        if (showHighlightPopover) setShowHighlightPopover(false);
        if (showUnderlinePopover) setShowUnderlinePopover(false);
        if (showSpeedPopover) setShowSpeedPopover(false);
      }}
    >
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
                  zIndex: 120,
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
                  zIndex: 120,
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
              title="Highlighter Colors & Strength Levels"
            >
              <ChevronDown size={13} />
            </button>
            {/* Highlight Settings Popover with Mode, Color, Width & Strength Divisions */}
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
                  zIndex: 120,
                  width: '270px',
                  maxHeight: '80vh',
                  overflowY: 'auto',
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

                {/* 15-Step Variable Strength Selection Line */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Highlight Strength
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa' }}>
                      Level {HIGHLIGHT_STRENGTHS.find((s) => Math.abs(s.value - highlightStrength) < 0.01)?.level || 15} / 15
                    </span>
                  </div>

                  {/* Dynamic Color & Transparency Live Preview Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '14px',
                      backgroundColor: highlightColor,
                      opacity: highlightStrength,
                      borderRadius: '3px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                    }}
                    title={`Current highlight opacity: ${Math.round(highlightStrength * 100)}%`}
                  />

                  {/* Continuous Range Slider Selection Line */}
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={HIGHLIGHT_STRENGTHS.find((s) => Math.abs(s.value - highlightStrength) < 0.01)?.level || 15}
                    onChange={(e) => {
                      const lvl = parseInt(e.target.value, 10);
                      const match = HIGHLIGHT_STRENGTHS.find((s) => s.level === lvl);
                      if (match) {
                        setHighlightStrength(match.value);
                        setActiveTool('highlight');
                      }
                    }}
                    style={{
                      width: '100%',
                      accentColor: '#3b82f6',
                      cursor: 'pointer',
                    }}
                  />

                  {/* 15 Variable Selection Steps Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: '2px' }}>
                    {HIGHLIGHT_STRENGTHS.map((s) => {
                      const isSelected = Math.abs(highlightStrength - s.value) < 0.01;
                      return (
                        <button
                          key={s.level}
                          onClick={() => {
                            setHighlightStrength(s.value);
                            setActiveTool('highlight');
                          }}
                          title={`Strength Level ${s.level} (${Math.round(s.value * 100)}%)`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px 0',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: isSelected ? 700 : 500,
                            background: isSelected ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                            color: isSelected ? '#60a5fa' : 'var(--text-secondary)',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>{s.level}</span>
                          <div
                            style={{
                              width: '10px',
                              height: '2.5px',
                              marginTop: '2px',
                              backgroundColor: highlightColor,
                              opacity: s.value,
                              borderRadius: '1px',
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
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
        <div className="toolbar-group" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {numPages > 1 && (
            <>
              <button
                className="tool-button"
                disabled={currentPage <= 1}
                onClick={() => scrollToPage(currentPage - 1)}
                title="Previous Page"
                style={{ padding: '4px 6px', height: '28px' }}
              >
                <ChevronLeft size={15} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={currentPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1 && val <= numPages) {
                      scrollToPage(val);
                    }
                  }}
                  style={{
                    width: `${Math.max(42, (numPages.toString().length + 1) * 9)}px`,
                    textAlign: 'center',
                    fontSize: '12px',
                    height: '26px',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '0 4px',
                  }}
                  title="Type page number & Enter to jump"
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/ {numPages}</span>
              </div>

              <button
                className="tool-button"
                disabled={currentPage >= numPages}
                onClick={() => scrollToPage(currentPage + 1)}
                title="Next Page"
                style={{ padding: '4px 6px', height: '28px' }}
              >
                <ChevronRight size={15} />
              </button>

              <select
                value={currentPage}
                onChange={(e) => scrollToPage(parseInt(e.target.value, 10))}
                style={{ padding: '2px 6px', fontSize: '12px', height: '28px', background: 'var(--bg-tertiary)', maxWidth: '110px' }}
                title="Select page from list"
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
            </>
          )}

          {numPages <= 1 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              1 Page
            </span>
          )}

          <div className="tool-divider" />

          <button
            className="tool-button"
            onClick={() => changeScale((s) => Math.max(0.4, Math.round((s - 0.15) * 100) / 100))}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span style={{ fontSize: '12px', minWidth: '38px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            className="tool-button"
            onClick={() => changeScale((s) => Math.min(3.0, Math.round((s + 0.15) * 100) / 100))}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>

          <div className="tool-divider" />

          {/* Fit to Width: Automatically fills screen and removes side margins */}
          <button
            className="tool-button"
            onClick={handleFitToWidth}
            title="Fit to Width (Fills screen width)"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11.5px' }}
          >
            <Maximize2 size={14} />
            <span>Fit Width</span>
          </button>

          {/* Fit to Page: Fits entire page height */}
          <button
            className="tool-button"
            onClick={handleFitToPage}
            title="Fit to Page (Fits full page on screen)"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11.5px' }}
          >
            <Minimize2 size={14} />
            <span>Fit Page</span>
          </button>

          <div className="tool-divider" />

          {/* Custom Dynamic Scroll Speed Popover */}
          <div style={{ position: 'relative' }}>
            <button
              className="tool-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedPopover((v) => !v);
              }}
              title="Custom Dynamic Scroll Speed"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                fontSize: '11.5px',
                background: showSpeedPopover ? 'var(--bg-tertiary)' : undefined,
              }}
            >
              <Gauge size={14} style={{ color: '#38bdf8' }} />
              <span>Speed: {scrollSpeed}x</span>
              <ChevronDown size={12} />
            </button>

            {showSpeedPopover && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  minWidth: '210px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Scroll Speed
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                    {scrollSpeed}x
                  </span>
                </div>

                <input
                  type="range"
                  min="0.5"
                  max="4.0"
                  step="0.25"
                  value={scrollSpeed}
                  onChange={(e) => handleSetScrollSpeed(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />

                <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
                  {[0.75, 1.0, 1.5, 2.0, 3.0].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSetScrollSpeed(s)}
                      style={{
                        padding: '3px 6px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        border: scrollSpeed === s ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                        background: scrollSpeed === s ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-tertiary)',
                        color: scrollSpeed === s ? '#38bdf8' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: scrollSpeed === s ? 600 : 400,
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Collapse/Expand Upper Header & Tab Options (^ / v) */}
          {onToggleCollapseHeader && (
            <>
              <div className="tool-divider" />
              <button
                className={`tool-button ${isHeaderCollapsed ? 'active' : ''}`}
                onClick={onToggleCollapseHeader}
                title={isHeaderCollapsed ? "Expand Upper Tabs & Options (v)" : "Collapse Upper Tabs & Options (^ Focus Mode)"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: isHeaderCollapsed ? 'rgba(59, 130, 246, 0.25)' : undefined,
                  border: isHeaderCollapsed ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid var(--border-subtle)',
                  color: isHeaderCollapsed ? '#60a5fa' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                {isHeaderCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Continuous Multi-Page Scroll Viewport (with Press & Hold Drag-Scroll) */}
      <div
        ref={scrollContainerRef}
        className="editor-viewport"
        onScroll={handleScroll}
        onMouseDown={handleStartDragScroll}
        onMouseMove={handleMoveDragScroll}
        onMouseUp={handleEndDragScroll}
        onMouseLeave={handleEndDragScroll}
        onMouseDownCapture={(e) => {
          if (e.detail > 1) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          overflowX: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '1.5rem 0.5rem',
          boxSizing: 'border-box',
          position: 'relative',
          cursor: activeTool === 'none' ? 'grab' : 'default',
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

        {loadError && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '18px 28px',
              borderRadius: '16px',
              color: '#fca5a5',
              fontSize: '14px',
              maxWidth: '500px',
              textAlign: 'center',
              margin: '2rem auto',
            }}
          >
            <span>⚠️ {loadError}</span>
            <button
              className="btn-primary"
              onClick={() => window.location.reload()}
              style={{ fontSize: '12px', padding: '4px 14px' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Virtual Spacer */}
        {topSpacerHeight > 0 && (
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: `${topSpacerHeight}px`,
              flexShrink: 0,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Render Only Active Visible Pages in DOM */}
        {pdfDocProxy &&
          visiblePages.map((pageNum) => (
            <PdfPageView
              key={pageNum}
              docId={file.id || file.name}
              pageNumber={pageNum}
              pdfDocProxy={pdfDocProxy}
              scale={scale}
              defaultDimensions={defaultDimensions}
              cachedDimensions={pageDimensions[pageNum]}
              onDimensionsKnown={handleDimensionsKnown}
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

        {/* Bottom Virtual Spacer */}
        {bottomSpacerHeight > 0 && (
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: `${bottomSpacerHeight}px`,
              flexShrink: 0,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
};
