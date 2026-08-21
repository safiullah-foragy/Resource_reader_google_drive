import { SupportedFileType } from '../types';

export function getFileTypeFromMimeAndExt(mimeType?: string, fileName?: string): SupportedFileType {
  const mime = (mimeType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  if (
    mime.includes('pdf') ||
    ext === 'pdf'
  ) {
    return 'pdf';
  }

  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['xlsx', 'xls', 'csv', 'ods'].includes(ext)
  ) {
    return 'excel';
  }

  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext)
  ) {
    return 'image';
  }

  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime.includes('text') ||
    ['docx', 'doc', 'txt', 'md', 'json', 'log', 'rtf'].includes(ext)
  ) {
    return 'doc';
  }

  return 'unknown';
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(dateString?: string): string {
  if (!dateString) return 'Just now';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer();
}
