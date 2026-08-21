import React, { useRef, useState } from 'react';
import { 
  Folder, 
  FolderOpen,
  FolderPlus,
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  FileCode, 
  UploadCloud, 
  Search, 
  Grid, 
  List as ListIcon, 
  ShieldCheck, 
  ShieldAlert, 
  ChevronRight,
  HardDrive,
  RefreshCw,
  Home,
  Plus,
  X,
  Check,
  Copy,
  Scissors,
  ClipboardPaste,
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  Trash2
} from 'lucide-react';
import { BreadcrumbItem, DriveFile, SupportedFileType } from '../../types';
import { formatDate, formatFileSize } from '../../utils/fileTypeUtils';

interface DriveExplorerProps {
  files: DriveFile[];
  breadcrumbs: BreadcrumbItem[];
  currentFolderId: string;
  onNavigateFolder: (folderId: string, folderName: string) => void;
  onNavigateBreadcrumb: (index: number) => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenFile: (file: DriveFile) => void;
  onUploadLocalFile: (file: File) => void;
  onUploadFilesToDrive?: (files: FileList) => void;
  onCreateFolder?: (folderName: string) => void;
  onCopyFile?: (file: DriveFile) => void;
  onCutFile?: (file: DriveFile) => void;
  onPasteFile?: () => void;
  onCancelClipboard?: () => void;
  onDeleteFile?: (file: DriveFile) => void;
  clipboard?: { file: DriveFile; operation: 'copy' | 'cut' } | null;
  onOpenLocalFilePicker: () => void;
  onOpenLocalFolder: () => void;
  onOpenAuthModal: () => void;
  isConnectedToDrive: boolean;
  onDisconnectDrive: () => void;
  onRefreshFiles: () => void;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const DriveExplorer: React.FC<DriveExplorerProps> = ({
  files,
  breadcrumbs,
  currentFolderId,
  onNavigateFolder,
  onNavigateBreadcrumb,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  onOpenFile,
  onUploadLocalFile,
  onUploadFilesToDrive,
  onCreateFolder,
  onCopyFile,
  onCutFile,
  onPasteFile,
  onCancelClipboard,
  onDeleteFile,
  clipboard,
  onOpenLocalFilePicker,
  onOpenLocalFolder,
  onOpenAuthModal,
  isConnectedToDrive,
  onDisconnectDrive,
  onRefreshFiles,
  isLoading,
  searchQuery,
  onSearchChange,
}) => {
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const multiUploadInputRef = useRef<HTMLInputElement | null>(null);

  // Single click: select item
  const handleItemSelect = (item: DriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFileId(item.id);
  };

  // Double click or Enter: open item
  const handleItemOpen = (item: DriveFile) => {
    if (item.isFolder) {
      onNavigateFolder(item.id, item.name);
    } else {
      onOpenFile(item);
    }
  };

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+C, Ctrl+X, Ctrl+V, Enter, Escape)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const selectedItem = files.find((f) => f.id === selectedFileId);

      // Delete / Backspace: delete selected item (files only, folders protected)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItem && !selectedItem.isFolder && onDeleteFile) {
          e.preventDefault();
          onDeleteFile(selectedItem);
          setSelectedFileId(null);
        }
      }

      // Ctrl+C / Cmd+C: copy selected item
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedItem && onCopyFile) {
          e.preventDefault();
          onCopyFile(selectedItem);
        }
      }

      // Ctrl+X / Cmd+X: cut selected item
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedItem && onCutFile) {
          e.preventDefault();
          onCutFile(selectedItem);
        }
      }

      // Ctrl+V / Cmd+V: paste clipboard item
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboard && onPasteFile) {
          e.preventDefault();
          onPasteFile();
        }
      }

      // Enter: Open selected item
      if (e.key === 'Enter') {
        if (selectedItem) {
          e.preventDefault();
          handleItemOpen(selectedItem);
        }
      }

      // Escape: Deselect
      if (e.key === 'Escape') {
        setSelectedFileId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, selectedFileId, onDeleteFile, onCopyFile, onCutFile, onPasteFile, clipboard]);

  // Separate folders and files
  const folders = files.filter((f) => f.isFolder);
  const regularFiles = files.filter((f) => !f.isFolder);

  const getIconForType = (file: DriveFile) => {
    if (file.isFolder) {
      return <Folder size={24} style={{ color: '#f59e0b' }} />;
    }
    switch (file.fileType) {
      case 'pdf':
        return <FileText size={24} />;
      case 'excel':
        return <FileSpreadsheet size={24} />;
      case 'image':
        return <ImageIcon size={24} />;
      case 'doc':
        return <FileCode size={24} />;
      default:
        return <FileText size={24} />;
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      onUploadLocalFile(uploadedFile);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMultiUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (uploadedFiles && uploadedFiles.length > 0) {
      if (onUploadFilesToDrive) {
        onUploadFilesToDrive(uploadedFiles);
      } else {
        onUploadLocalFile(uploadedFiles[0]);
      }
      if (multiUploadInputRef.current) multiUploadInputRef.current.value = '';
    }
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (onCreateFolder) {
      onCreateFolder(newFolderName.trim());
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  return (
    <div className="explorer-container" onClick={() => setSelectedFileId(null)}>
      {/* Top Banner / Hero Header */}
      <div className="explorer-header">
        <div className="explorer-title-row">
          <div>
            <h1 className="explorer-title">
              <HardDrive size={28} style={{ color: '#3b82f6' }} />
              <span>{breadcrumbs[0]?.name === 'Local Folder' ? 'Local Drive / Folder Explorer' : 'Google Drive & Local Resource Explorer'}</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
              Browse your Google Drive or local C:, D:, G: drives, open documents in browser tabs, annotate, and save directly.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Hidden fallback file input */}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
              accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.md,.txt,.docx"
            />

            {/* Multiple files uploader */}
            <input
              ref={multiUploadInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleMultiUploadChange}
              accept="*/*"
            />

            {/* Upload Files Button (PDF, Image, Doc, any file) */}
            <button
              className="btn-primary"
              onClick={() => multiUploadInputRef.current?.click()}
              title="Upload PDF, Image, Spreadsheet, Doc, or any file to this folder"
            >
              <UploadCloud size={16} />
              <span>Upload Files</span>
            </button>

            {/* Open Local Folder / Drive button */}
            <button
              className="btn-secondary"
              onClick={onOpenLocalFolder}
              title="Open any local folder or drive (C:, D:, G: drive) to browse and edit files"
            >
              <FolderOpen size={16} style={{ color: '#f59e0b' }} />
              <span>Local Drive</span>
            </button>

            {/* Create New Folder Button - Placed beside Drive button with matching Drive color theme */}
            <button
              className="btn-secondary"
              onClick={() => setIsCreatingFolder(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: '#60a5fa',
                padding: '0.45rem 0.9rem',
                fontWeight: 600,
              }}
              title="Create a new folder directly in Google Drive"
            >
              <FolderPlus size={16} style={{ color: '#60a5fa' }} />
              <span>+ New Folder</span>
            </button>

            {/* Google Drive Auth Button */}
            {isConnectedToDrive ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8125rem',
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.15)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <ShieldCheck size={15} />
                  <span>Drive Connected</span>
                </span>
                <button className="btn-ghost" onClick={onDisconnectDrive} title="Disconnect Google Account">
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn-secondary" onClick={onOpenAuthModal} style={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}>
                <ShieldAlert size={16} style={{ color: '#3b82f6' }} />
                <span>Connect Google Drive</span>
              </button>
            )}
          </div>
        </div>

        {/* In-line Create Folder Form */}
        {isCreatingFolder && (
          <form
            onSubmit={handleCreateFolderSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: 'rgba(30, 41, 59, 0.9)',
              border: '1px solid rgba(59, 130, 246, 0.45)',
              borderRadius: '8px',
              marginTop: '10px',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <FolderPlus size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />
            <input
              type="text"
              placeholder={isConnectedToDrive ? 'Enter folder name to create in Google Drive...' : 'Enter folder name...'}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-medium)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#ffffff',
                fontSize: '13px',
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px', background: '#3b82f6', borderColor: '#2563eb' }}
            >
              <Check size={14} />
              <span>Create Folder</span>
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              style={{ padding: '6px 8px' }}
            >
              <X size={16} />
            </button>
          </form>
        )}

        {/* Breadcrumb Bar & Toolbar */}
        <div className="explorer-toolbar" style={{ justifyContent: 'space-between' }}>
          {/* Breadcrumb Folder Navigation with Back & Forward Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            {/* Back & Forward Folder History Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginRight: '4px' }}>
              <button
                className="btn-ghost"
                onClick={onGoBack}
                disabled={!canGoBack}
                title={canGoBack ? 'Back to previous folder' : 'No previous folder'}
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  opacity: canGoBack ? 1 : 0.35,
                  cursor: canGoBack ? 'pointer' : 'not-allowed',
                  background: canGoBack ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: canGoBack ? '#e2e8f0' : 'var(--text-muted)',
                }}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                className="btn-ghost"
                onClick={onGoForward}
                disabled={!canGoForward}
                title={canGoForward ? 'Forward to next folder' : 'No next folder'}
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  opacity: canGoForward ? 1 : 0.35,
                  cursor: canGoForward ? 'pointer' : 'not-allowed',
                  background: canGoForward ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: canGoForward ? '#e2e8f0' : 'var(--text-muted)',
                }}
              >
                <ArrowRight size={16} />
              </button>
            </div>

            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id || idx}>
                  <button
                    onClick={() => onNavigateBreadcrumb(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: isLast ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                      color: isLast ? '#60a5fa' : 'var(--text-secondary)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontWeight: isLast ? 700 : 500,
                      fontSize: '13px',
                    }}
                  >
                    {idx === 0 ? <Home size={14} /> : <FolderOpen size={14} />}
                    <span>{crumb.name}</span>
                  </button>
                  {!isLast && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                </React.Fragment>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Search Bar */}
            <div className="search-box" style={{ minWidth: '220px' }}>
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search files in Drive..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>

            <button className="btn-ghost" onClick={onRefreshFiles} title="Refresh Current Folder">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <button
              className={`tool-button ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid size={16} />
            </button>
            <button
              className={`tool-button ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Folder-Wise Content Area */}
      {!isConnectedToDrive && files.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '4.5rem 2rem',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}
          >
            <FolderOpen size={36} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Local Drive & Resource Workspace</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', fontSize: '0.925rem', lineHeight: 1.5, marginTop: '0.35rem' }}>
              Open any folder or drive partition (C:, D:, G: drive) from your computer to browse PDFs, spreadsheets, and images, annotate, and save changes directly back to your local disk in place.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn-primary"
              onClick={onOpenLocalFolder}
              style={{
                padding: '0.7rem 1.6rem',
                fontSize: '0.95rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
              }}
            >
              <FolderOpen size={18} />
              <span>Browse Local Drive / Folder</span>
            </button>
            <button className="btn-secondary" onClick={onOpenLocalFilePicker} style={{ padding: '0.7rem 1.35rem', fontSize: '0.95rem' }}>
              <UploadCloud size={18} />
              <span>Open Local File</span>
            </button>
            <button className="btn-secondary" onClick={onOpenAuthModal} style={{ padding: '0.7rem 1.35rem', fontSize: '0.95rem' }}>
              <HardDrive size={18} style={{ color: '#3b82f6' }} />
              <span>Connect Google Drive</span>
            </button>
          </div>
        </div>
      ) : files.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-medium)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <Folder size={48} style={{ color: 'var(--text-muted)' }} />
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.35rem' }}>This folder is empty</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {searchQuery ? `No files match "${searchQuery}"` : 'Create a subfolder or upload files directly into this directory.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn-secondary"
              onClick={() => setIsCreatingFolder(true)}
              style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.35)', color: '#60a5fa' }}
            >
              <FolderPlus size={16} />
              <span>+ New Folder</span>
            </button>
            <button className="btn-primary" onClick={() => multiUploadInputRef.current?.click()}>
              <UploadCloud size={16} />
              <span>Upload Files to this Folder</span>
            </button>
            {clipboard && (
              <button
                className="btn-secondary"
                onClick={onPasteFile}
                style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#34d399' }}
              >
                <ClipboardPaste size={16} />
                <span>Paste "{clipboard.file.name}"</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Folders Section - Always accessible */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📁 Folders ({folders.length})
              </div>
              <button
                className="btn-ghost"
                onClick={() => setIsCreatingFolder(true)}
                style={{ fontSize: '12px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'rgba(59, 130, 246, 0.12)', borderRadius: '6px' }}
                title="Create a new subfolder in this directory"
              >
                <FolderPlus size={14} />
                <span>+ New Folder</span>
              </button>
            </div>

            {folders.length > 0 && (
              <div className="files-grid">
                {folders.map((folder) => {
                  const isSelected = selectedFileId === folder.id;
                  return (
                    <div
                      key={folder.id}
                      className="file-card"
                      style={{
                        background: isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(30, 41, 59, 0.7)',
                        border: isSelected ? '2px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.25)',
                        boxShadow: isSelected ? '0 0 0 3px rgba(245, 158, 11, 0.35), 0 8px 24px rgba(0, 0, 0, 0.4)' : undefined,
                        position: 'relative',
                        transform: isSelected ? 'translateY(-2px)' : undefined,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={(e) => handleItemSelect(folder, e)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleItemOpen(folder);
                      }}
                    >
                      <div className="file-card-top">
                        <div
                          className="file-icon-box"
                          style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}
                        >
                          <Folder size={24} />
                        </div>
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                          Folder
                        </span>
                      </div>

                      <div className="file-card-name" style={{ fontSize: '1rem', fontWeight: 600 }}>
                        {folder.name}
                      </div>

                      <div className="file-card-meta">
                        <span>Folder</span>
                        <span>{formatDate(folder.modifiedTime)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Files Section */}
          {regularFiles.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📄 Files ({regularFiles.length})
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {clipboard && (
                    <button
                      className="btn-secondary"
                      onClick={onPasteFile}
                      style={{ fontSize: '12px', padding: '3px 10px', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ClipboardPaste size={14} />
                      <span>Paste (Ctrl+V)</span>
                    </button>
                  )}
                  <button
                    className="btn-ghost"
                    onClick={() => setIsCreatingFolder(true)}
                    style={{ fontSize: '12px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px' }}
                    title="Create a new folder"
                  >
                    <FolderPlus size={14} />
                    <span>+ New Folder</span>
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => multiUploadInputRef.current?.click()}
                    style={{ fontSize: '12px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px' }}
                    title="Upload files to this folder"
                  >
                    <UploadCloud size={14} />
                    <span>Upload to Folder</span>
                  </button>
                </div>
              </div>

              <div className="files-grid">
                {regularFiles.map((file) => {
                  const cardClass = `file-card card-${file.fileType}`;
                  const iconClass = `file-icon-box file-icon-${file.fileType}`;
                  const badgeClass = `badge badge-${file.fileType}`;
                  const isBeingCut = clipboard?.operation === 'cut' && clipboard.file.id === file.id;
                  const isSelected = selectedFileId === file.id;

                  return (
                    <div
                      key={file.id}
                      className={cardClass}
                      style={{
                        position: 'relative',
                        opacity: isBeingCut ? 0.5 : 1,
                        background: isSelected ? 'rgba(59, 130, 246, 0.22)' : undefined,
                        border: isSelected ? '2px solid #3b82f6' : undefined,
                        boxShadow: isSelected ? '0 0 0 3px rgba(59, 130, 246, 0.35), 0 8px 24px rgba(0, 0, 0, 0.4)' : undefined,
                        transform: isSelected ? 'translateY(-2px)' : undefined,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={(e) => handleItemSelect(file, e)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleItemOpen(file);
                      }}
                    >
                      {/* Copy / Cut / Delete Quick Action Bar */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'flex',
                          gap: '3px',
                          zIndex: 10,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="btn-ghost"
                          onClick={() => onCopyFile && onCopyFile(file)}
                          title="Copy (Ctrl+C)"
                          style={{
                            padding: '3px 6px',
                            background: 'rgba(15, 23, 42, 0.8)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => onCutFile && onCutFile(file)}
                          title="Cut (Ctrl+X)"
                          style={{
                            padding: '3px 6px',
                            background: 'rgba(15, 23, 42, 0.8)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Scissors size={13} />
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => onDeleteFile && onDeleteFile(file)}
                          title="Delete (Delete key)"
                          style={{
                            padding: '3px 6px',
                            background: 'rgba(15, 23, 42, 0.8)',
                            borderRadius: '4px',
                            color: '#f87171',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="file-card-top">
                        <div className={iconClass}>
                          {getIconForType(file)}
                        </div>
                        <span className={badgeClass}>{file.fileType}</span>
                      </div>

                      <div className="file-card-name" title={file.name}>
                        {file.name}
                      </div>

                      <div className="file-card-meta">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{formatDate(file.modifiedTime)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Clipboard Bar */}
      {clipboard && (
        <div
          style={{
            position: 'sticky',
            bottom: '20px',
            zIndex: 90,
            margin: '1.5rem auto 0',
            maxWidth: '520px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #3b82f6',
            borderRadius: '30px',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(10px)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <ClipboardPaste size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Ready to <strong>{clipboard.operation.toUpperCase()}</strong>: "{clipboard.file.name}"
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              className="btn-primary"
              onClick={onPasteFile}
              style={{ padding: '5px 12px', fontSize: '12px', background: '#3b82f6' }}
            >
              Paste Here
            </button>
            <button
              className="btn-ghost"
              onClick={onCancelClipboard}
              style={{ padding: '5px 8px', fontSize: '12px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
