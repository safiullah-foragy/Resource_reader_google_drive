import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BreadcrumbItem, DriveFile, OpenDocument, SaveStatus, ToastNotification } from './types';
import { googleDriveService } from './services/googleDriveService';
import { getFileTypeFromMimeAndExt, downloadBlob, blobToArrayBuffer } from './utils/fileTypeUtils';
import {
  getPersistedDirectoryHandle,
  savePersistedDirectoryHandle,
  readFilesFromDirectoryHandle,
} from './services/localDirectoryService';

import { TabBar } from './components/Header/TabBar';
import { Header } from './components/Header/Header';
import { DriveExplorer } from './components/DriveExplorer/DriveExplorer';
import { GoogleAuthModal } from './components/DriveExplorer/GoogleAuthModal';
import { ToastContainer } from './components/Common/ToastContainer';

import { PdfEditor } from './components/Editors/PdfEditor/PdfEditor';
import { ExcelEditor } from './components/Editors/ExcelEditor/ExcelEditor';
import { ImageEditor } from './components/Editors/ImageEditor/ImageEditor';
import { DocEditor } from './components/Editors/DocEditor/DocEditor';

export function App() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'local-workspace', name: 'Local & Cloud Workspace' },
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-Document Tabs State
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('explorer'); // 'explorer' or document id

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isConnectedToDrive, setIsConnectedToDrive] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [clipboard, setClipboard] = useState<{ file: DriveFile; operation: 'copy' | 'cut' } | null>(null);

  // Folder Navigation History (Back / Forward)
  const [navHistory, setNavHistory] = useState<Array<{ folderId: string; breadcrumbs: BreadcrumbItem[] }>>([
    { folderId: 'root', breadcrumbs: [{ id: 'local-workspace', name: 'Local & Cloud Workspace' }] },
  ]);
  const [navHistoryIndex, setNavHistoryIndex] = useState<number>(0);

  const canGoBack = navHistoryIndex > 0;
  const canGoForward = navHistoryIndex < navHistory.length - 1;

  const handleGoBack = () => {
    if (navHistoryIndex > 0) {
      const nextIndex = navHistoryIndex - 1;
      const target = navHistory[nextIndex];
      if (target) {
        setNavHistoryIndex(nextIndex);
        setCurrentFolderId(target.folderId);
        setBreadcrumbs(target.breadcrumbs);
        setSearchQuery('');
      }
    }
  };

  const handleGoForward = () => {
    if (navHistoryIndex < navHistory.length - 1) {
      const nextIndex = navHistoryIndex + 1;
      const target = navHistory[nextIndex];
      if (target) {
        setNavHistoryIndex(nextIndex);
        setCurrentFolderId(target.folderId);
        setBreadcrumbs(target.breadcrumbs);
        setSearchQuery('');
      }
    }
  };

  // Find currently active document
  const activeDocument = openDocuments.find((d) => d.id === activeTabId) || null;

  // Toast Helper
  const showToast = useCallback(
    (type: ToastNotification['type'], title: string, message?: string, duration: number = 4000) => {
      const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const newToast: ToastNotification = { id, type, title, message, duration };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Folder Files from Google Drive
  const loadFolderFiles = useCallback(
    async (folderId: string = currentFolderId, search: string = searchQuery) => {
      if (!googleDriveService.isConnected()) {
        setIsConnectedToDrive(false);
        return;
      }

      setIsLoading(true);
      try {
        const driveFiles = await googleDriveService.listFiles(folderId, search);
        setFiles(driveFiles);
        setIsConnectedToDrive(true);
      } catch (err: any) {
        console.error('Error loading files:', err);
        if (
          err.message?.includes('Authentication') ||
          err.message?.includes('credential') ||
          err.message?.includes('401')
        ) {
          setIsConnectedToDrive(false);
          showToast('warning', 'Session Expired', 'Please reconnect your Google Drive account.');
        } else {
          showToast('error', 'Failed to load Drive files', err.message || 'Please check your connection.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [currentFolderId, searchQuery, showToast]
  );

  // Restore active login session or persisted Local Drive on startup
  useEffect(() => {
    let isCancelled = false;

    async function initWorkspace() {
      if (googleDriveService.isConnected()) {
        setIsConnectedToDrive(true);
        loadFolderFiles(currentFolderId, searchQuery);
        return;
      }

      setIsConnectedToDrive(false);

      // By default, check if user had a local drive/folder opened previously
      try {
        const savedDirHandle = await getPersistedDirectoryHandle();
        if (savedDirHandle && !isCancelled) {
          setIsLoading(true);
          const localFiles = await readFilesFromDirectoryHandle(savedDirHandle);
          if (!isCancelled) {
            setFiles(localFiles);
            setBreadcrumbs([{ id: 'local-dir', name: savedDirHandle.name || 'Local Drive' }]);
          }
        } else if (!isCancelled) {
          setFiles([]);
          setBreadcrumbs([{ id: 'local-workspace', name: 'Local & Cloud Workspace' }]);
        }
      } catch (err) {
        console.warn('Could not auto-restore persisted directory:', err);
        if (!isCancelled) {
          setFiles([]);
          setBreadcrumbs([{ id: 'local-workspace', name: 'Local & Cloud Workspace' }]);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    initWorkspace();
    return () => {
      isCancelled = true;
    };
  }, [currentFolderId, searchQuery, loadFolderFiles]);

  // Navigate into a subfolder
  const handleNavigateFolder = (folderId: string, folderName: string) => {
    const nextBreadcrumbs = [...breadcrumbs, { id: folderId, name: folderName }];
    setCurrentFolderId(folderId);
    setBreadcrumbs(nextBreadcrumbs);
    setSearchQuery('');

    setNavHistory((prev) => {
      const truncated = prev.slice(0, navHistoryIndex + 1);
      return [...truncated, { folderId, breadcrumbs: nextBreadcrumbs }];
    });
    setNavHistoryIndex((prev) => prev + 1);
  };

  // Navigate via breadcrumbs
  const handleNavigateBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolderId(target.id);
    setSearchQuery('');

    setNavHistory((prev) => {
      const truncated = prev.slice(0, navHistoryIndex + 1);
      return [...truncated, { folderId: target.id, breadcrumbs: nextBreadcrumbs }];
    });
    setNavHistoryIndex((prev) => prev + 1);
  };

  const openingFilesRef = React.useRef<Set<string>>(new Set());

  // Open a File in a New / Existing Tab (Idempotent & Double-Click Safe)
  const handleOpenFile = async (file: DriveFile) => {
    // If already open, switch to that tab immediately
    const existing = openDocuments.find((d) => d.id === file.id);
    if (existing) {
      setActiveTabId(file.id);
      return;
    }

    // Prevent concurrent duplicate openings from double clicks
    if (openingFilesRef.current.has(file.id)) {
      return;
    }
    openingFilesRef.current.add(file.id);

    setIsLoading(true);
    try {
      let buffer: ArrayBuffer;
      let initialBlob: Blob;

      if (file.rawBlob) {
        initialBlob = file.rawBlob;
        buffer = file.rawArrayBuffer || (await blobToArrayBuffer(initialBlob));
      } else if (file.fileHandle && typeof file.fileHandle.getFile === 'function') {
        const localFile = await file.fileHandle.getFile();
        buffer = await localFile.arrayBuffer();
        initialBlob = new Blob([buffer], { type: localFile.type || file.mimeType || 'application/octet-stream' });
      } else if (file.isLocal || file.id.startsWith('local_')) {
        throw new Error('Local file content could not be accessed.');
      } else {
        const { data } = await googleDriveService.downloadFile(file.id, file.mimeType);
        buffer = data;
        initialBlob = new Blob([buffer], { type: file.mimeType });
      }

      const newDoc: OpenDocument = {
        id: file.id,
        file: { ...file, rawBlob: initialBlob, rawArrayBuffer: buffer },
        arrayBuffer: buffer,
        modifiedBlob: initialBlob,
        hasUnsavedChanges: false,
        saveStatus: 'idle',
      };

      setOpenDocuments((prev) => {
        if (prev.some((d) => d.id === file.id)) {
          return prev;
        }
        return [...prev, newDoc];
      });
      setActiveTabId(file.id);
      showToast('info', `Opened ${file.name}`, `Ready in tab.`);
    } catch (err: any) {
      console.error('Failed to open file:', err);
      showToast('error', 'Failed to Open File', err.message || 'Could not fetch file content.');
    } finally {
      openingFilesRef.current.delete(file.id);
      setIsLoading(false);
    }
  };

  // Close a Document Tab
  const handleCloseTab = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();

    const docToClose = openDocuments.find((d) => d.id === docId);
    if (docToClose?.hasUnsavedChanges) {
      const confirmDiscard = window.confirm(`"${docToClose.file.name}" has unsaved changes. Close tab anyway?`);
      if (!confirmDiscard) return;
    }

    const remainingDocs = openDocuments.filter((d) => d.id !== docId);
    setOpenDocuments(remainingDocs);

    if (activeTabId === docId) {
      if (remainingDocs.length > 0) {
        setActiveTabId(remainingDocs[remainingDocs.length - 1].id);
      } else {
        setActiveTabId('explorer');
      }
    }
  };

  // Handle Binary Modification from any editor
  const handleEditorModify = (newBlob: Blob) => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeDocument.id
          ? { ...doc, modifiedBlob: newBlob, hasUnsavedChanges: true, saveStatus: 'unsaved' }
          : doc
      )
    );
  };

  const handleSetHasUnsavedChanges = (hasChanges: boolean) => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeDocument.id
          ? { ...doc, hasUnsavedChanges: hasChanges, saveStatus: hasChanges ? 'unsaved' : 'saved' }
          : doc
      )
    );
  };

  // Save to Google Drive or In-Place to Local Disk
  const handleSaveToDrive = async () => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((d) => (d.id === activeDocument.id ? { ...d, saveStatus: 'saving' } : d))
    );

    try {
      const { file, modifiedBlob } = activeDocument;

      // 1. If opened via File System Access API handle (Local C:, D:, G: drive), save in-place directly to disk!
      if (file.fileHandle && typeof file.fileHandle.createWritable === 'function') {
        try {
          const writable = await file.fileHandle.createWritable();
          await writable.write(modifiedBlob);
          await writable.close();

          const newBuffer = await blobToArrayBuffer(modifiedBlob);
          setOpenDocuments((prev) =>
            prev.map((d) =>
              d.id === activeDocument.id
                ? {
                    ...d,
                    arrayBuffer: newBuffer,
                    file: {
                      ...d.file,
                      rawBlob: modifiedBlob,
                      size: modifiedBlob.size,
                      modifiedTime: new Date().toISOString(),
                    },
                    hasUnsavedChanges: false,
                    saveStatus: 'saved',
                  }
                : d
            )
          );

          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? { ...f, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() }
                : f
            )
          );

          showToast('success', 'Saved Directly to Local File!', `Updated "${file.name}" in place on your disk.`);
          return;
        } catch (localWriteErr: any) {
          console.warn('Direct fileHandle write failed, attempting fallback:', localWriteErr);
        }
      }

      // 2. If not connected to Google Drive, save to in-memory blob
      if (!googleDriveService.isConnected()) {
        const newBuffer = await blobToArrayBuffer(modifiedBlob);

        setOpenDocuments((prev) =>
          prev.map((d) =>
            d.id === activeDocument.id
              ? {
                  ...d,
                  arrayBuffer: newBuffer,
                  file: { ...d.file, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() },
                  hasUnsavedChanges: false,
                  saveStatus: 'saved',
                }
              : d
          )
        );

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() }
              : f
          )
        );

        showToast('success', 'Changes Saved in Memory!', 'File updated. Click "Download" to save or Connect Google Drive to sync.');
        return;
      }

      // 3. Connected to Google Drive: upload/patch file
      let updated: DriveFile;
      if (file.id.startsWith('local_')) {
        // Upload local file to connected Google Drive
        updated = await googleDriveService.createNewFile(
          file.name,
          file.mimeType,
          modifiedBlob,
          currentFolderId !== 'root' ? currentFolderId : undefined
        );
      } else {
        // Direct media update to Google Drive
        updated = await googleDriveService.uploadFileContent(
          file.id,
          file.name,
          file.mimeType,
          modifiedBlob
        );
      }

      const newBuffer = await blobToArrayBuffer(modifiedBlob);

      setOpenDocuments((prev) =>
        prev.map((d) =>
          d.id === activeDocument.id
            ? {
                ...d,
                id: updated.id,
                arrayBuffer: newBuffer,
                file: {
                  ...d.file,
                  id: updated.id,
                  name: updated.name,
                  size: modifiedBlob.size,
                  modifiedTime: new Date().toISOString(),
                },
                hasUnsavedChanges: false,
                saveStatus: 'saved',
              }
            : d
        )
      );

      if (updated.id !== file.id) {
        setActiveTabId(updated.id);
      }

      // Refresh files list so the explorer displays the updated file size and timestamp
      loadFolderFiles(currentFolderId, searchQuery);
      showToast('success', 'Synced to Google Drive!', `Successfully saved "${updated.name}".`);
    } catch (err: any) {
      console.error('Save to Drive error:', err);
      setOpenDocuments((prev) =>
        prev.map((d) => (d.id === activeDocument.id ? { ...d, saveStatus: 'error' } : d))
      );
      showToast('error', 'Save Failed', err.message || 'Failed to update file.');
    }
  };

  // Save as Copy
  const handleSaveAsCopy = async () => {
    if (!activeDocument) return;

    const { file, modifiedBlob } = activeDocument;
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const baseName = file.name.replace(ext, '');
    const copyName = `${baseName}_copy_${Date.now().toString().slice(-4)}${ext}`;

    setOpenDocuments((prev) =>
      prev.map((d) => (d.id === activeDocument.id ? { ...d, saveStatus: 'saving' } : d))
    );

    try {
      if (!googleDriveService.isConnected()) {
        const copyFile: DriveFile = {
          id: 'local-copy-' + Date.now(),
          name: copyName,
          mimeType: file.mimeType,
          fileType: file.fileType,
          size: modifiedBlob.size,
          modifiedTime: new Date().toISOString(),
          isLocal: true,
          parentFolderId: currentFolderId,
          rawBlob: modifiedBlob,
        };

        setFiles((prev) => [copyFile, ...prev]);
        handleOpenFile(copyFile);
        showToast('success', 'Saved as New Copy!', `Created "${copyName}"`);
        return;
      }

      const created = await googleDriveService.createNewFile(
        copyName,
        file.mimeType,
        modifiedBlob,
        currentFolderId !== 'root' ? currentFolderId : undefined
      );

      setFiles((prev) => [created, ...prev]);
      handleOpenFile(created);
      showToast('success', 'Created Copy in Google Drive!', `Created "${created.name}"`);
    } catch (err: any) {
      console.error('Save as Copy error:', err);
      showToast('error', 'Copy Failed', err.message || 'Could not create new file.');
    }
  };

  // Download Local Copy
  const handleDownloadLocal = () => {
    if (!activeDocument) return;
    downloadBlob(activeDocument.modifiedBlob, activeDocument.file.name);
    showToast('info', 'File Downloaded', `Saved "${activeDocument.file.name}" to your computer.`);
  };

  // Native Open Local File Picker (Direct File System Access API with in-place save)
  const handleOpenLocalFilePicker = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Supported Files (PDF, Excel, Images, Docs)',
              accept: {
                'application/pdf': ['.pdf'],
                'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/vnd.ms-excel': ['.xls'],
                'text/plain': ['.txt', '.md'],
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              },
            },
          ],
          multiple: false,
        });

        if (!fileHandle) return;
        const localFile = await fileHandle.getFile();
        const buffer = await localFile.arrayBuffer();
        const blob = new Blob([buffer], { type: localFile.type || 'application/octet-stream' });
        const fileType = getFileTypeFromMimeAndExt(localFile.type, localFile.name);

        const localDriveFile: DriveFile = {
          id: 'local_' + Date.now(),
          name: localFile.name,
          mimeType: localFile.type || 'application/octet-stream',
          fileType,
          size: localFile.size,
          modifiedTime: new Date(localFile.lastModified).toISOString(),
          isLocal: true,
          fileHandle,
          rawBlob: blob,
          rawArrayBuffer: buffer,
        };

        setFiles((prev) => [localDriveFile, ...prev]);
        handleOpenFile(localDriveFile);
        showToast('success', `Opened "${localFile.name}"`, 'Edit and click Save to write directly back to your local disk.');
      } else {
        // Fallback file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.md,.txt,.docx';
        input.onchange = (e: any) => {
          const f = e.target.files?.[0];
          if (f) handleUploadLocalFile(f);
        };
        input.click();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening local file:', err);
        showToast('error', 'Open Failed', err.message || 'Could not open local file.');
      }
    }
  };

  // Open Entire Local Folder / Drive (e.g. C:, D:, G: directory)
  const handleOpenLocalFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        if (!dirHandle) return;

        setIsLoading(true);
        await savePersistedDirectoryHandle(dirHandle);
        const loadedFiles = await readFilesFromDirectoryHandle(dirHandle);

        setFiles(loadedFiles);
        setBreadcrumbs([{ id: 'local-dir', name: dirHandle.name || 'Local Drive' }]);
        showToast('success', `Opened Folder "${dirHandle.name}"`, `Loaded ${loadedFiles.length} files from your disk.`);
      } else {
        showToast('warning', 'Folder Picker Not Supported', 'Please use "Open Local File" instead.');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening directory:', err);
        showToast('error', 'Folder Open Failed', err.message || 'Could not access folder.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Create New Folder (Google Drive or Local)
  const handleCreateFolder = async (folderName: string) => {
    if (!folderName.trim()) return;

    if (googleDriveService.isConnected()) {
      setIsLoading(true);
      try {
        const newFolder = await googleDriveService.createFolder(
          folderName.trim(),
          currentFolderId !== 'root' ? currentFolderId : undefined
        );
        setFiles((prev) => [newFolder, ...prev]);
        showToast('success', 'Folder Created in Google Drive!', `Created "${newFolder.name}".`);
      } catch (err: any) {
        console.error('Error creating folder:', err);
        showToast('error', 'Folder Creation Failed', err.message || 'Could not create folder in Google Drive.');
      } finally {
        setIsLoading(false);
      }
    } else {
      const localFolder: DriveFile = {
        id: 'local_folder_' + Date.now(),
        name: folderName.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        fileType: 'unknown',
        isFolder: true,
        isLocal: true,
        parentFolderId: currentFolderId,
        modifiedTime: new Date().toISOString(),
      };
      setFiles((prev) => [localFolder, ...prev]);
      showToast('success', 'Folder Created!', `Created folder "${folderName.trim()}".`);
    }
  };

  // Upload Multiple Files to Google Drive or Local
  const handleUploadFilesToDrive = async (uploadedFiles: FileList) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsLoading(true);
    let successCount = 0;

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      try {
        if (googleDriveService.isConnected()) {
          const created = await googleDriveService.createNewFile(
            file.name,
            file.type || 'application/octet-stream',
            file,
            currentFolderId !== 'root' ? currentFolderId : undefined
          );
          setFiles((prev) => [created, ...prev]);
          successCount++;
        } else {
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
          const fileType = getFileTypeFromMimeAndExt(file.type, file.name);

          const localFile: DriveFile = {
            id: 'local_' + Date.now() + '_' + i,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            fileType,
            size: file.size,
            modifiedTime: new Date(file.lastModified).toISOString(),
            isLocal: true,
            parentFolderId: currentFolderId,
            rawBlob: blob,
            rawArrayBuffer: buffer,
          };
          setFiles((prev) => [localFile, ...prev]);
          successCount++;
        }
      } catch (err: any) {
        console.error('Failed to upload file:', file.name, err);
        showToast('error', `Failed to upload "${file.name}"`, err.message);
      }
    }

    setIsLoading(false);
    if (successCount > 0) {
      showToast(
        'success',
        googleDriveService.isConnected() ? 'Uploaded to Google Drive!' : 'Loaded Files!',
        `Successfully added ${successCount} file(s).`
      );
    }
  };

  // Copy File to Clipboard
  const handleCopyFile = (file: DriveFile) => {
    setClipboard({ file, operation: 'copy' });
    showToast('info', `Copied "${file.name}"`, 'Navigate to any destination folder and click "Paste Here".');
  };

  // Cut File (Prepare for Move)
  const handleCutFile = (file: DriveFile) => {
    setClipboard({ file, operation: 'cut' });
    showToast('info', `Cut "${file.name}"`, 'Navigate to destination folder and click "Paste Here" to move.');
  };

  // Cancel Clipboard
  const handleCancelClipboard = () => {
    setClipboard(null);
  };

  // Paste File into Current Folder
  const handlePasteFile = async () => {
    if (!clipboard) return;

    setIsLoading(true);
    try {
      if (clipboard.operation === 'copy') {
        if (googleDriveService.isConnected()) {
          const copied = await googleDriveService.copyFile(
            clipboard.file.id,
            currentFolderId !== 'root' ? currentFolderId : undefined
          );
          setFiles((prev) => [copied, ...prev]);
          showToast('success', 'File Copied in Drive!', `Pasted "${copied.name}" into this folder.`);
        } else {
          const copyName = 'Copy_' + clipboard.file.name;
          const localCopy: DriveFile = {
            ...clipboard.file,
            id: 'local_copy_' + Date.now(),
            name: copyName,
            parentFolderId: currentFolderId,
          };
          setFiles((prev) => [localCopy, ...prev]);
          showToast('success', 'File Copied!', `Pasted "${copyName}" into this folder.`);
        }
      } else if (clipboard.operation === 'cut') {
        if (googleDriveService.isConnected()) {
          const moved = await googleDriveService.moveFile(
            clipboard.file.id,
            clipboard.file.parentFolderId,
            currentFolderId !== 'root' ? currentFolderId : undefined
          );
          setFiles((prev) => [moved, ...prev.filter((f) => f.id !== clipboard.file.id)]);
          showToast('success', 'File Moved in Drive!', `Moved "${moved.name}" into this folder.`);
        } else {
          const movedLocal: DriveFile = {
            ...clipboard.file,
            parentFolderId: currentFolderId,
          };
          setFiles((prev) => [movedLocal, ...prev.filter((f) => f.id !== clipboard.file.id)]);
          showToast('success', 'File Moved!', `Moved "${movedLocal.name}" into this folder.`);
        }
        setClipboard(null);
      }
    } catch (err: any) {
      console.error('Paste error:', err);
      showToast('error', 'Paste Failed', err.message || 'Could not paste file into folder.');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete File / Folder (Google Drive or Local)
  const handleDeleteFile = async (file: DriveFile) => {
    if (!window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    setIsLoading(true);
    try {
      if (googleDriveService.isConnected() && !file.isLocal) {
        await googleDriveService.deleteFile(file.id);
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        showToast('success', 'Deleted in Google Drive', `"${file.name}" was deleted.`);
      } else {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        showToast('success', 'Removed Item', `Removed "${file.name}".`);
      }
    } catch (err: any) {
      console.error('Delete failed:', err);
      showToast('error', 'Delete Failed', err.message || 'Could not delete item.');
    } finally {
      setIsLoading(false);
    }
  };

  // Upload Local File from Disk (fallback)
  const handleUploadLocalFile = async (uploadedFile: File) => {
    try {
      const buffer = await uploadedFile.arrayBuffer();
      const blob = new Blob([buffer], { type: uploadedFile.type });
      const fileType = getFileTypeFromMimeAndExt(uploadedFile.type, uploadedFile.name);

      const localDriveFile: DriveFile = {
        id: 'local_' + Date.now(),
        name: uploadedFile.name,
        mimeType: uploadedFile.type || 'application/octet-stream',
        fileType,
        size: uploadedFile.size,
        modifiedTime: new Date(uploadedFile.lastModified).toISOString(),
        isLocal: true,
        parentFolderId: currentFolderId,
        rawBlob: blob,
        rawArrayBuffer: buffer,
      };

      setFiles((prev) => [localDriveFile, ...prev]);
      handleOpenFile(localDriveFile);
    } catch (err: any) {
      console.error('Failed to load local file:', err);
      showToast('error', 'Load Failed', 'Could not parse local file.');
    }
  };

  // Rename File Title
  const handleRenameFile = (newName: string) => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((d) =>
        d.id === activeDocument.id
          ? {
              ...d,
              file: { ...d.file, name: newName },
              hasUnsavedChanges: true,
              saveStatus: 'unsaved',
            }
          : d
      )
    );
  };

  // Theme Toggle
  const handleToggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      document.body.className = next ? 'dark-theme' : 'light-theme';
      return next;
    });
  };

  // Disconnect Drive
  const handleDisconnectDrive = () => {
    googleDriveService.logout();
    setIsConnectedToDrive(false);
    setFiles([]);
    setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
    showToast('info', 'Disconnected', 'Google Drive session closed.');
  };

  return (
    <div className="app-container">
      {/* Top Browser-style Tab Bar */}
      <TabBar
        openDocuments={openDocuments}
        activeTabId={activeTabId}
        onSelectTab={(tabId) => setActiveTabId(tabId)}
        onCloseTab={handleCloseTab}
        onOpenExplorer={() => setActiveTabId('explorer')}
      />

      {/* Header with Save & Action Controls */}
      <Header
        activeFile={activeDocument?.file || null}
        saveStatus={activeDocument?.saveStatus || 'idle'}
        hasUnsavedChanges={activeDocument?.hasUnsavedChanges || false}
        onBackToExplorer={() => setActiveTabId('explorer')}
        onSaveToDrive={handleSaveToDrive}
        onSaveAsCopy={handleSaveAsCopy}
        onDownloadLocal={handleDownloadLocal}
        onRenameFile={handleRenameFile}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isConnectedToDrive={isConnectedToDrive}
      />

      {/* Main View Area */}
      <main className="app-main">
        {activeTabId === 'explorer' || !activeDocument ? (
          <DriveExplorer
            files={files}
            breadcrumbs={breadcrumbs}
            currentFolderId={currentFolderId}
            onNavigateFolder={handleNavigateFolder}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onOpenFile={handleOpenFile}
            onUploadLocalFile={handleUploadLocalFile}
            onUploadFilesToDrive={handleUploadFilesToDrive}
            onCreateFolder={handleCreateFolder}
            onCopyFile={handleCopyFile}
            onCutFile={handleCutFile}
            onPasteFile={handlePasteFile}
            onDeleteFile={handleDeleteFile}
            onCancelClipboard={handleCancelClipboard}
            clipboard={clipboard}
            onOpenLocalFilePicker={handleOpenLocalFilePicker}
            onOpenLocalFolder={handleOpenLocalFolder}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            isConnectedToDrive={isConnectedToDrive}
            onDisconnectDrive={handleDisconnectDrive}
            onRefreshFiles={() => loadFolderFiles(currentFolderId, searchQuery)}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ) : (
          <>
            {activeDocument.file.fileType === 'pdf' && (
              <PdfEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'excel' && (
              <ExcelEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'image' && (
              <ImageEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'doc' && (
              <DocEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'unknown' && (
              <div style={{ padding: '3rem', textAlign: 'center', margin: 'auto' }}>
                <h3>File Format Loaded</h3>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  Preview is not available for mime type: {activeDocument.file.mimeType}
                </p>
                <button className="btn-primary" onClick={handleDownloadLocal} style={{ marginTop: '1rem' }}>
                  Download File Directly
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Google Auth Modal */}
      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onConnected={() => {
          setIsConnectedToDrive(true);
          loadFolderFiles('root');
          showToast('success', 'Connected to Google Drive!', 'Your Drive folders and files are now accessible.');
        }}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
