import React from 'react';
import { 
  X, 
  Palette, 
  Maximize2, 
  HardDrive, 
  LogOut, 
  Check, 
  RotateCcw, 
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';
import { ConnectedDriveAccount } from '../../types';

export type AppTheme = 'dark' | 'light' | 'cyberpunk' | 'forest' | 'amber';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  uiScale: number;
  onSetUiScale: (scale: number) => void;
  connectedAccounts: ConnectedDriveAccount[];
  onDisconnectAccount: (accountId: string) => void;
  onDisconnectAll: () => void;
}

const THEME_OPTIONS: Array<{
  id: AppTheme;
  name: string;
  desc: string;
  bg: string;
  accent: string;
  border: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'dark',
    name: 'Midnight Dark',
    desc: 'Deep obsidian with tech cyan & slate',
    bg: '#0b0f19',
    accent: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.4)',
    icon: <Moon size={18} style={{ color: '#38bdf8' }} />,
  },
  {
    id: 'light',
    name: 'Pure Light',
    desc: 'Crisp silver with vibrant blue',
    bg: '#f8fafc',
    accent: '#2563eb',
    border: '#cbd5e1',
    icon: <Sun size={18} style={{ color: '#f59e0b' }} />,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    desc: 'Deep violet with electric pink & purple',
    bg: '#0a0319',
    accent: '#ec4899',
    border: 'rgba(236, 72, 153, 0.5)',
    icon: <Sparkles size={18} style={{ color: '#ec4899' }} />,
  },
  {
    id: 'forest',
    name: 'Forest Emerald',
    desc: 'Deep pine with luminous mint & emerald',
    bg: '#03130d',
    accent: '#10b981',
    border: 'rgba(16, 185, 129, 0.5)',
    icon: <Palette size={18} style={{ color: '#34d399' }} />,
  },
  {
    id: 'amber',
    name: 'Warm Amber / Coffee',
    desc: 'Dark roast with golden honey & amber',
    bg: '#120e09',
    accent: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.5)',
    icon: <Palette size={18} style={{ color: '#fbbf24' }} />,
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
  uiScale,
  onSetUiScale,
  connectedAccounts,
  onDisconnectAccount,
  onDisconnectAll,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-medium)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}
            >
              <Palette size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Settings & Customization</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Themes, UI scaling, and Google Drive account sessions
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: '6px', borderRadius: '8px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {/* Section 1: Themes (5 Choices) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
              <Palette size={16} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>🎨 Color Theme (5 Themes)</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {THEME_OPTIONS.map((theme) => {
                const isSelected = currentTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => onSelectTheme(theme.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      background: isSelected ? 'var(--bg-active)' : 'var(--bg-tertiary)',
                      border: isSelected ? `2px solid ${theme.accent}` : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? `0 0 12px ${theme.accent}33` : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: theme.bg,
                          border: `2px solid ${theme.accent}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {theme.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {theme.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {theme.desc}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: theme.accent,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: UI Scale / Zoom */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Maximize2 size={16} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>🔍 UI Scale & Zoom</h3>
              </div>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--accent-primary)',
                  background: 'var(--bg-tertiary)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {Math.round(uiScale * 100)}%
              </span>
            </div>

            {/* Scale Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '1rem' }}>
              {[
                { label: '85% Compact', val: 0.85 },
                { label: '100% Normal', val: 1.0 },
                { label: '115% Large', val: 1.15 },
                { label: '130% XL', val: 1.3 },
              ].map((p) => {
                const isActive = Math.abs(uiScale - p.val) < 0.02;
                return (
                  <button
                    key={p.val}
                    onClick={() => onSetUiScale(p.val)}
                    style={{
                      padding: '6px 4px',
                      fontSize: '11.5px',
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: '6px',
                      background: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>80%</span>
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={uiScale}
                onChange={(e) => onSetUiScale(parseFloat(e.target.value))}
                style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>140%</span>
              <button
                className="btn-ghost"
                onClick={() => onSetUiScale(1.0)}
                title="Reset to 100%"
                style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--text-muted)' }}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Section 3: Connected Google Accounts & Global Logout */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
              <HardDrive size={16} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                🔐 Connected Google Drives ({connectedAccounts.length})
              </h3>
            </div>

            {connectedAccounts.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'var(--bg-tertiary)',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                No Google Drive accounts connected. (Using Offline Local Drive)
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
                {connectedAccounts.map((acc, idx) => (
                  <div
                    key={acc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: '#60a5fa',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {acc.email}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Drive {idx + 1} • Connected
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onDisconnectAccount(acc.id)}
                      className="btn-ghost"
                      style={{
                        padding: '4px 8px',
                        fontSize: '11.5px',
                        color: '#f87171',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Disconnect this account"
                    >
                      <LogOut size={12} />
                      <span>Disconnect</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {connectedAccounts.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to disconnect all connected Google Drive accounts?')) {
                    onDisconnectAll();
                  }
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '0.65rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <LogOut size={15} />
                <span>Logout / Disconnect All Google Drives</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn-primary" onClick={onClose} style={{ padding: '0.45rem 1.25rem' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
