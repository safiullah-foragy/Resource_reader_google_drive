import React, { useRef } from 'react';
import { 
  Folder, 
  FolderOpen,
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
  Home
} from 'lucide-react';
import { BreadcrumbItem, DriveFile, SupportedFileType } from '../../types';
import { formatDate, formatFileSize } from '../../utils/fileTypeUtils';

interface DriveExplorerProps {
  files: DriveFile[];
  breadcrumbs: BreadcrumbItem[];
  currentFolderId: string;
  onNavigateFolder: (folderId: string, folderName: string) => void;
  onNavigateBreadcrumb: (index: number) => void;
  onOpenFile: (file: DriveFile) => void;
  onUploadLocalFile: (file: File) => void;
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
  onOpenFile,
  onUploadLocalFile,
  onOpenAuthModal,
  isConnectedToDrive,
  onDisconnectDrive,
  onRefreshFiles,
  isLoading,
  searchQuery,
  onSearchChange,
}) => {
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleItemClick = (item: DriveFile) => {
    if (item.isFolder) {
      onNavigateFolder(item.id, item.name);
    } else {
      onOpenFile(item);
    }
  };

  return (
    <div className="explorer-container">
      {/* Top Banner / Hero Header */}
      <div className="explorer-header">
        <div className="explorer-title-row">
          <div>
            <h1 className="explorer-title">
              <HardDrive size={28} style={{ color: '#3b82f6' }} />
              <span>Google Drive Resource Explorer</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
              Browse your main Drive folders, open any PDF, Spreadsheet, Image, or Doc, and edit directly.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Upload File button */}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
              accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.md,.txt,.docx"
            />
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              title="Open any local PDF, Excel, Image, or Doc from your computer"
            >
              <UploadCloud size={16} />
              <span>Open Local File</span>
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
              <button className="btn-primary" onClick={onOpenAuthModal}>
                <ShieldAlert size={16} />
                <span>Connect Google Drive</span>
              </button>
            )}
          </div>
        </div>

        {/* Breadcrumb Bar & Toolbar */}
        <div className="explorer-toolbar" style={{ justifyContent: 'space-between' }}>
          {/* Breadcrumb Folder Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
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
      {files.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-medium)',
          }}
        >
          <Folder size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>This folder is empty</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {searchQuery ? `No files match "${searchQuery}"` : 'No files or subfolders found in this directory.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Folders Section (if any folders present) */}
          {folders.length > 0 && (
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📁 Folders ({folders.length})
              </div>
              <div className="files-grid">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="file-card"
                    style={{
                      background: 'rgba(30, 41, 59, 0.7)',
                      borderColor: 'rgba(245, 158, 11, 0.25)',
                    }}
                    onClick={() => handleItemClick(folder)}
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
                ))}
              </div>
            </div>
          )}

          {/* Files Section */}
          {regularFiles.length > 0 && (
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📄 Files ({regularFiles.length})
              </div>
              <div className="files-grid">
                {regularFiles.map((file) => {
                  const cardClass = `file-card card-${file.fileType}`;
                  const iconClass = `file-icon-box file-icon-${file.fileType}`;
                  const badgeClass = `badge badge-${file.fileType}`;

                  return (
                    <div
                      key={file.id}
                      className={cardClass}
                      onClick={() => handleItemClick(file)}
                    >
                      <div className="file-card-top">
                        <div className={iconClass}>
                          {getIconForType(file)}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {file.isDemo && <span className="badge badge-demo">Demo</span>}
                          <span className={badgeClass}>{file.fileType}</span>
                        </div>
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
    </div>
  );
};
