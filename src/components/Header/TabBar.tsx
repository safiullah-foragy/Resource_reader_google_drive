import React from 'react';
import { 
  HardDrive, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  FileCode, 
  X, 
  Plus 
} from 'lucide-react';
import { OpenDocument } from '../../types';

interface TabBarProps {
  openDocuments: OpenDocument[];
  activeTabId: string; // 'explorer' or document id
  onSelectTab: (tabId: string) => void;
  onCloseTab: (e: React.MouseEvent, docId: string) => void;
  onOpenExplorer: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  openDocuments,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenExplorer,
}) => {
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return <FileText size={15} style={{ color: '#f87171' }} />;
      case 'excel':
        return <FileSpreadsheet size={15} style={{ color: '#34d399' }} />;
      case 'image':
        return <ImageIcon size={15} style={{ color: '#a78bfa' }} />;
      case 'doc':
        return <FileCode size={15} style={{ color: '#60a5fa' }} />;
      default:
        return <FileText size={15} style={{ color: '#94a3b8' }} />;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: '#090d16',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 0.5rem',
        overflowX: 'auto',
        height: '38px',
        minHeight: '38px',
        gap: '2px',
        userSelect: 'none',
      }}
    >
      {/* Permanent Main Drive Explorer Tab */}
      <button
        onClick={onOpenExplorer}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0.35rem 0.85rem',
          height: '32px',
          background: activeTabId === 'explorer' ? 'var(--bg-secondary)' : 'transparent',
          color: activeTabId === 'explorer' ? '#38bdf8' : 'var(--text-secondary)',
          borderTop: activeTabId === 'explorer' ? '2px solid #38bdf8' : '2px solid transparent',
          borderLeft: '1px solid var(--border-subtle)',
          borderRight: '1px solid var(--border-subtle)',
          borderBottom: 'none',
          borderRadius: '6px 6px 0 0',
          fontWeight: activeTabId === 'explorer' ? 700 : 500,
          fontSize: '12.5px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.12s ease',
        }}
      >
        <HardDrive size={15} style={{ color: '#38bdf8' }} />
        <span>📁 My Drive</span>
      </button>

      {/* Dynamic Opened Document Tabs */}
      {openDocuments.map((doc) => {
        const isActive = activeTabId === doc.id;
        return (
          <div
            key={doc.id}
            onClick={() => onSelectTab(doc.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.35rem 0.75rem',
              height: '32px',
              background: isActive ? 'var(--bg-secondary)' : 'rgba(255,255,255,0.03)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              borderTop: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
              borderLeft: '1px solid var(--border-subtle)',
              borderRight: '1px solid var(--border-subtle)',
              borderBottom: 'none',
              borderRadius: '6px 6px 0 0',
              fontWeight: isActive ? 600 : 500,
              fontSize: '12px',
              cursor: 'pointer',
              maxWidth: '220px',
              whiteSpace: 'nowrap',
              transition: 'all 0.12s ease',
            }}
          >
            {getFileIcon(doc.file.fileType)}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '130px',
              }}
              title={doc.file.name}
            >
              {doc.file.name}
            </span>

            {/* Unsaved indicator dot */}
            {doc.hasUnsavedChanges && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  flexShrink: 0,
                }}
                title="Unsaved changes"
              />
            )}

            {/* Close tab button */}
            <button
              onClick={(e) => onCloseTab(e, doc.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                padding: '2px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                marginLeft: '2px',
              }}
              title="Close tab"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {/* Add Document button (jump to explorer) */}
      <button
        onClick={onOpenExplorer}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          padding: '4px 6px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          marginLeft: '4px',
        }}
        title="Open more files from Drive"
      >
        <Plus size={15} />
      </button>
    </div>
  );
};
