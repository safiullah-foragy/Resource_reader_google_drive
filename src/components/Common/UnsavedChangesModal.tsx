import React from 'react';
import { AlertTriangle, Save, LogOut, X, Loader2 } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  fileName: string;
  onSaveAndContinue: () => void;
  onContinueWithoutSaving: () => void;
  onClose: () => void;
  isSaving?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  fileName,
  onSaveAndContinue,
  onContinueWithoutSaving,
  onClose,
  isSaving = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          borderRadius: '16px',
          padding: '24px 28px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(245, 158, 11, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          animation: 'fadeInScale 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header with Warning Icon & Close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Unsaved Updates Detected
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                You have unsaved changes in this document
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Cancel and stay here"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message Body */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '13.5px',
            lineHeight: 1.5,
            color: 'var(--text-primary)',
          }}
        >
          <span>
            You have made changes or markings to <strong style={{ color: '#fbbf24' }}>"{fileName}"</strong>. If you leave without saving, all your recent markings and updates will be lost.
          </span>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          {/* Option 1: Save and Continue */}
          <button
            className="btn-primary"
            onClick={onSaveAndContinue}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 16px',
              fontSize: '13.5px',
              fontWeight: 600,
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
            }}
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving changes...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save and Continue</span>
              </>
            )}
          </button>

          {/* Option 2: Continue without Saving (Discard) */}
          <button
            onClick={onContinueWithoutSaving}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <LogOut size={15} />
            <span>Continue Without Saving (Discard)</span>
          </button>

          {/* Option 3: Cancel / Close (Stay Here) */}
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span>Close (Stay on this page)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
