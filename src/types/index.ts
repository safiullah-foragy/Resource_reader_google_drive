export type SupportedFileType = 'pdf' | 'excel' | 'image' | 'doc' | 'unknown';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  fileType: SupportedFileType;
  size?: number;
  modifiedTime?: string;
  iconUrl?: string;
  thumbnailLink?: string;
  isFolder?: boolean;
  isDemo?: boolean;
  isLocal?: boolean;
  fileHandle?: any;
  rawBlob?: Blob;
  rawArrayBuffer?: ArrayBuffer;
  parentFolderId?: string;
}

export interface OpenDocument {
  id: string;
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  modifiedBlob: Blob;
  hasUnsavedChanges: boolean;
  saveStatus: SaveStatus;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface GoogleCredentials {
  clientId: string;
  apiKey: string;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unsaved';

export type AnnotationTool = 
  | 'select'
  | 'draw'
  | 'underline'
  | 'highlight'
  | 'text'
  | 'note'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationItem {
  id: string;
  type: AnnotationTool;
  pageIndex: number;
  points?: Point[];
  startPoint?: Point;
  endPoint?: Point;
  color: string;
  strokeWidth: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: string;
  fill?: boolean;
  width?: number;
  height?: number;
}

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

export interface SpreadsheetCell {
  value: string | number | boolean | null;
  formula?: string;
  formatted?: string;
}

export interface SpreadsheetSheet {
  name: string;
  data: (string | number | boolean | null)[][];
  columns: string[];
}

export interface SpreadsheetWorkbook {
  sheets: SpreadsheetSheet[];
  activeSheetIndex: number;
}
