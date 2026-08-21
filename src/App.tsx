import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BreadcrumbItem, DriveFile, SaveStatus, ToastNotification } from './types';
import { googleDriveService } from './services/googleDriveService';
import { demoDataService } from './services/demoDataService';
import { getFileTypeFromMimeAndExt, downloadBlob, blobToArrayBuffer } from './utils/fileTypeUtils';

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
    { id: 'root', name: 'My Drive' },
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [activeFile, setActiveFile] = useState<DriveFile | null>(null);
  const [activeArrayBuffer, setActiveArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [modifiedBlob, setModifiedBlob] = useState<Blob | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isConnectedToDrive, setIsConnectedToDrive] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

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

  // Load Folder Files (Drive or Demo Files)
  const loadFolderFiles = useCallback(
    async (folderId: string = currentFolderId, search: string = searchQuery) => {
      setIsLoading(true);
      try {
        if (googleDriveService.isConnected()) {
          const driveFiles = await googleDriveService.listFiles(folderId, search);
          setFiles(driveFiles);
          setIsConnectedToDrive(true);
        } else {
          const demoFiles = await demoDataService.getDemoFiles(folderId);
          setFiles(demoFiles);
          setIsConnectedToDrive(false);
        }
      } catch (err: any) {
        console.error('Error loading files:', err);
        const demoFiles = await demoDataService.getDemoFiles(folderId);
        setFiles(demoFiles);
        showToast('warning', 'Offline / Demo Mode Active', 'Loaded folder contents. Connect Google Drive anytime.');
      } finally {
        setIsLoading(false);
      }
    },
    [currentFolderId, searchQuery, showToast]
  );

  useEffect(() => {
    loadFolderFiles(currentFolderId, searchQuery);
  }, [currentFolderId, searchQuery, loadFolderFiles]);

  // Navigate into a subfolder
  const handleNavigateFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
    setSearchQuery('');
  };

  // Navigate via breadcrumbs
  const handleNavigateBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setCurrentFolderId(target.id);
    setSearchQuery('');
  };

  // Open a File in Editor
  const handleOpenFile = async (file: DriveFile) => {
    setIsLoading(true);
    setSaveStatus('idle');
    setHasUnsavedChanges(false);

    try {
      let buffer: ArrayBuffer;
      let initialBlob: Blob;

      if (file.isDemo || file.rawBlob) {
        initialBlob = file.rawBlob!;
        buffer = await blobToArrayBuffer(initialBlob);
      } else {
        // Download directly from Google Drive API
        const { data } = await googleDriveService.downloadFile(file.id, file.mimeType);
        buffer = data;
        initialBlob = new Blob([buffer], { type: file.mimeType });
      }

      setActiveFile(file);
      setActiveArrayBuffer(buffer);
      setModifiedBlob(initialBlob);
      showToast('info', `Opened ${file.name}`, `Ready for in-browser editing & markup.`);
    } catch (err: any) {
      console.error('Failed to open file:', err);
      showToast('error', 'Failed to Open File', err.message || 'Could not fetch file content.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Binary Modification from any editor
  const handleEditorModify = (newBlob: Blob) => {
    setModifiedBlob(newBlob);
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
  };

  // Save to Google Drive (Lossless Multipart Upload)
  const handleSaveToDrive = async () => {
    if (!activeFile || !modifiedBlob) return;

    setSaveStatus('saving');
    try {
      if (activeFile.isDemo || !googleDriveService.isConnected()) {
        const newBuffer = await blobToArrayBuffer(modifiedBlob);
        setActiveArrayBuffer(newBuffer);
        setActiveFile((prev) => (prev ? { ...prev, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() } : null));

        setFiles((prev) =>
          prev.map((f) =>
            f.id === activeFile.id
              ? { ...f, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() }
              : f
          )
        );

        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        showToast('success', 'Changes Saved Losslessly!', 'File updated in-memory. Connect Google Drive to sync directly to cloud.');
        return;
      }

      // Real Google Drive Sync via Multipart PATCH
      const updated = await googleDriveService.uploadFileContent(
        activeFile.id,
        activeFile.name,
        activeFile.mimeType,
        modifiedBlob
      );

      const newBuffer = await blobToArrayBuffer(modifiedBlob);
      setActiveArrayBuffer(newBuffer);
      setActiveFile((prev) => (prev ? { ...prev, modifiedTime: new Date().toISOString() } : null));

      setSaveStatus('saved');
      setHasUnsavedChanges(false);
      showToast('success', 'Synced to Google Drive!', `Successfully saved "${updated.name}" without corruption.`);
    } catch (err: any) {
      console.error('Save to Drive error:', err);
      setSaveStatus('error');
      showToast('error', 'Save Failed', err.message || 'Failed to update file in Google Drive.');
    }
  };

  // Save as Copy
  const handleSaveAsCopy = async () => {
    if (!activeFile || !modifiedBlob) return;

    const ext = activeFile.name.includes('.') ? '.' + activeFile.name.split('.').pop() : '';
    const baseName = activeFile.name.replace(ext, '');
    const copyName = `${baseName}_copy_${Date.now().toString().slice(-4)}${ext}`;

    setSaveStatus('saving');
    try {
      if (activeFile.isDemo || !googleDriveService.isConnected()) {
        const copyFile: DriveFile = {
          id: 'demo-copy-' + Date.now(),
          name: copyName,
          mimeType: activeFile.mimeType,
          fileType: activeFile.fileType,
          size: modifiedBlob.size,
          modifiedTime: new Date().toISOString(),
          isDemo: true,
          parentFolderId: currentFolderId,
          rawBlob: modifiedBlob,
        };

        setFiles((prev) => [copyFile, ...prev]);
        setActiveFile(copyFile);
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        showToast('success', 'Saved as New Copy!', `Created "${copyName}"`);
        return;
      }

      const created = await googleDriveService.createNewFile(
        copyName,
        activeFile.mimeType,
        modifiedBlob,
        currentFolderId !== 'root' ? currentFolderId : undefined
      );

      setFiles((prev) => [created, ...prev]);
      setActiveFile(created);
      setSaveStatus('saved');
      setHasUnsavedChanges(false);
      showToast('success', 'Created Copy in Google Drive!', `Created "${created.name}"`);
    } catch (err: any) {
      console.error('Save as Copy error:', err);
      setSaveStatus('error');
      showToast('error', 'Copy Failed', err.message || 'Could not create new file.');
    }
  };

  // Download Local Copy
  const handleDownloadLocal = () => {
    if (!activeFile || !modifiedBlob) return;
    downloadBlob(modifiedBlob, activeFile.name);
    showToast('info', 'File Downloaded', `Saved "${activeFile.name}" to your computer.`);
  };

  // Upload Local File from Disk
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
        isDemo: false,
        parentFolderId: currentFolderId,
        rawBlob: blob,
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
    if (!activeFile) return;
    setActiveFile((prev) => (prev ? { ...prev, name: newName } : null));
    setHasUnsavedChanges(true);
    setSaveStatus('unsaved');
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
    loadFolderFiles('root');
    setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
    showToast('info', 'Disconnected', 'Switched back to Demo / Local mode.');
  };

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        activeFile={activeFile}
        saveStatus={saveStatus}
        hasUnsavedChanges={hasUnsavedChanges}
        onBackToExplorer={() => {
          setActiveFile(null);
          setActiveArrayBuffer(null);
          setModifiedBlob(null);
        }}
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
        {!activeFile ? (
          <DriveExplorer
            files={files}
            breadcrumbs={breadcrumbs}
            currentFolderId={currentFolderId}
            onNavigateFolder={handleNavigateFolder}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            onOpenFile={handleOpenFile}
            onUploadLocalFile={handleUploadLocalFile}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            isConnectedToDrive={isConnectedToDrive}
            onDisconnectDrive={handleDisconnectDrive}
            onRefreshFiles={() => loadFolderFiles(currentFolderId, searchQuery)}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ) : (
          activeArrayBuffer && (
            <>
              {activeFile.fileType === 'pdf' && (
                <PdfEditor
                  file={activeFile}
                  arrayBuffer={activeArrayBuffer}
                  onModify={handleEditorModify}
                  onHasUnsavedChanges={setHasUnsavedChanges}
                />
              )}

              {activeFile.fileType === 'excel' && (
                <ExcelEditor
                  file={activeFile}
                  arrayBuffer={activeArrayBuffer}
                  onModify={handleEditorModify}
                  onHasUnsavedChanges={setHasUnsavedChanges}
                />
              )}

              {activeFile.fileType === 'image' && (
                <ImageEditor
                  file={activeFile}
                  arrayBuffer={activeArrayBuffer}
                  onModify={handleEditorModify}
                  onHasUnsavedChanges={setHasUnsavedChanges}
                />
              )}

              {activeFile.fileType === 'doc' && (
                <DocEditor
                  file={activeFile}
                  arrayBuffer={activeArrayBuffer}
                  onModify={handleEditorModify}
                  onHasUnsavedChanges={setHasUnsavedChanges}
                />
              )}

              {activeFile.fileType === 'unknown' && (
                <div style={{ padding: '3rem', textAlign: 'center', margin: 'auto' }}>
                  <h3>File Format Loaded</h3>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Preview is not available for mime type: {activeFile.mimeType}
                  </p>
                  <button className="btn-primary" onClick={handleDownloadLocal} style={{ marginTop: '1rem' }}>
                    Download File Directly
                  </button>
                </div>
              )}
            </>
          )
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
