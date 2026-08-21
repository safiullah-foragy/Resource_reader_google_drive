import React from 'react';
import { 
  ArrowLeft, 
  Save, 
  Copy, 
  Download, 
  Sun, 
  Moon, 
  Check, 
  Loader2, 
  AlertCircle, 
  Layers,
  Cloud,
  FileCheck
} from 'lucide-react';
import { DriveFile, SaveStatus } from '../../types';

interface HeaderProps {
  activeFile: DriveFile | null;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
  onBackToExplorer: () => void;
  onSaveToDrive: () => void;
  onSaveAsCopy: () => void;
  onDownloadLocal: () => void;
  onRenameFile: (newName: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isConnectedToDrive: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeFile,
  saveStatus,
  hasUnsavedChanges,
  onBackToExplorer,
  onSaveToDrive,
  onSaveAsCopy,
  onDownloadLocal,
  onRenameFile,
  isDarkMode,
  onToggleTheme,
  isConnectedToDrive,
}) => {
  return (
    <header className="app-header">
      {/* Left side: Brand or Back Button */}
      <div className="header-left">
        {activeFile ? (
          <button className="btn-secondary" onClick={onBackToExplorer} style={{ padding: '0.4rem 0.75rem' }}>
            <ArrowLeft size={16} />
            <span>Files</span>
          </button>
        ) : (
          <div className="brand-logo">
            <div className="brand-icon">
              <Layers size={16} />
            </div>
            <span>Drive Studio</span>
          </div>
        )}

        {/* Editable file title if file is open */}
        {activeFile && (
          <div className="file-title-container">
            <input
              type="text"
              className="file-title-input"
              value={activeFile.name}
              onChange={(e) => onRenameFile(e.target.value)}
              title="Click to rename file"
            />
          </div>
        )}
      </div>

      {/* Center: Save Status & Sync Indicator */}
      <div className="header-center">
        {activeFile && (
          <div className={`save-status-indicator status-${saveStatus}`}>
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Saving to Drive...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check size={13} />
                <span>Saved Losslessly</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <FileCheck size={13} />
                <span>Unsaved Changes</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle size={13} />
                <span>Sync Error</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right side: Actions & Theme Toggle */}
      <div className="header-right">
        {activeFile && (
          <>
            {/* Save to Drive Primary Action */}
            <button
              className="btn-primary"
              onClick={onSaveToDrive}
              disabled={saveStatus === 'saving'}
              title="Commit binary updates directly to Google Drive"
            >
              {saveStatus === 'saving' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Cloud size={16} />
              )}
              <span>Save to Drive</span>
            </button>

            {/* Save as Copy */}
            <button
              className="btn-secondary"
              onClick={onSaveAsCopy}
              disabled={saveStatus === 'saving'}
              title="Save as a new copy in Google Drive"
            >
              <Copy size={15} />
              <span>Save Copy</span>
            </button>

            {/* Download Local Backup */}
            <button
              className="btn-secondary"
              onClick={onDownloadLocal}
              title="Download clean binary directly to computer"
            >
              <Download size={15} />
              <span>Export</span>
            </button>

            <div className="tool-divider" />
          </>
        )}

        {/* Theme Toggle */}
        <button
          className="btn-ghost"
          onClick={onToggleTheme}
          title={isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
};
