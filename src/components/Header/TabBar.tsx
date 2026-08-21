import React from 'react';
import { 
  HardDrive, 
  FolderOpen,
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  FileCode, 
  X, 
  Plus,
  UserPlus
} from 'lucide-react';
import { ConnectedDriveAccount, OpenDocument } from '../../types';

interface TabBarProps {
  openDocuments: OpenDocument[];
  activeTabId: string; // 'explorer' or document id
  connectedAccounts: ConnectedDriveAccount[];
  activeAccountId: string | null;
  onSelectTab: (tabId: string) => void;
  onSelectAccount: (accountId: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (e: React.MouseEvent, accountId: string) => void;
  onCloseTab: (e: React.MouseEvent, docId: string) => void;
  onOpenExplorer: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  openDocuments,
  activeTabId,
  connectedAccounts,
  activeAccountId,
  onSelectTab,
  onSelectAccount,
  onAddAccount,
  onRemoveAccount,
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
        gap: '4px',
        userSelect: 'none',
      }}
    >
      {/* Local Drive Workspace Tab */}
      <button
        onClick={() => {
          onSelectAccount('local');
          onOpenExplorer();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0.35rem 0.85rem',
          height: '32px',
          background: activeTabId === 'explorer' && (!activeAccountId || activeAccountId === 'local') ? 'var(--bg-secondary)' : 'transparent',
          color: activeTabId === 'explorer' && (!activeAccountId || activeAccountId === 'local') ? '#fbbf24' : 'var(--text-secondary)',
          borderTop: activeTabId === 'explorer' && (!activeAccountId || activeAccountId === 'local') ? '2px solid #fbbf24' : '2px solid transparent',
          borderLeft: '1px solid var(--border-subtle)',
          borderRight: '1px solid var(--border-subtle)',
          borderBottom: 'none',
          borderRadius: '6px 6px 0 0',
          fontWeight: activeTabId === 'explorer' && (!activeAccountId || activeAccountId === 'local') ? 700 : 500,
          fontSize: '12px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.12s ease',
        }}
      >
        <FolderOpen size={14} style={{ color: '#f59e0b' }} />
        <span>Local Drive</span>
      </button>

      {/* Connected Google Drive Account Tabs */}
      {connectedAccounts.map((acc, index) => {
        const isDriveActive = activeTabId === 'explorer' && activeAccountId === acc.id;
        const displayName = acc.email ? acc.email.split('@')[0] : `Drive ${index + 1}`;

        return (
          <div
            key={acc.id}
            onClick={() => {
              onSelectAccount(acc.id);
              onOpenExplorer();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.35rem 0.75rem',
              height: '32px',
              background: isDriveActive ? 'var(--bg-secondary)' : 'rgba(255,255,255,0.03)',
              color: isDriveActive ? '#38bdf8' : 'var(--text-secondary)',
              borderTop: isDriveActive ? '2px solid #38bdf8' : '2px solid transparent',
              borderLeft: '1px solid var(--border-subtle)',
              borderRight: '1px solid var(--border-subtle)',
              borderBottom: 'none',
              borderRadius: '6px 6px 0 0',
              fontWeight: isDriveActive ? 700 : 500,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              maxWidth: '220px',
              transition: 'all 0.12s ease',
            }}
            title={`${acc.email || acc.name} (Drive ${index + 1})`}
          >
            <HardDrive size={14} style={{ color: '#38bdf8' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
              Drive {index + 1}: {displayName}
            </span>

            {/* Remove / Disconnect Drive button */}
            <button
              onClick={(e) => onRemoveAccount(e, acc.id)}
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
              title="Disconnect this Google Drive"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {/* + Add Another Google Drive Button */}
      <button
        onClick={onAddAccount}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0.3rem 0.65rem',
          height: '28px',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px dashed rgba(59, 130, 246, 0.4)',
          color: '#60a5fa',
          borderRadius: '4px',
          fontSize: '11.5px',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.12s ease',
        }}
        title="Connect another Google Drive account"
      >
        <Plus size={13} />
        <span>Add Drive</span>
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '18px', background: 'var(--border-medium)', margin: '0 4px' }} />

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
    </div>
  );
};
