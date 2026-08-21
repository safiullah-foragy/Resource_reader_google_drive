import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastNotification } from '../../types';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  const getIcon = (type: ToastNotification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />;
      case 'error':
        return <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />;
      case 'warning':
        return <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />;
      case 'info':
      default:
        return <Info size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />;
    }
  };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item toast-${t.type}`}>
          {getIcon(t.type)}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              {t.title}
            </div>
            {t.message && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {t.message}
              </div>
            )}
          </div>
          <button
            className="btn-ghost"
            onClick={() => onDismiss(t.id)}
            style={{ padding: '2px', color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
