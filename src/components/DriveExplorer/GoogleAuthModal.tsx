import React, { useState } from 'react';
import { Key, ShieldCheck, ExternalLink, X, CheckCircle, AlertCircle } from 'lucide-react';
import { googleDriveService } from '../../services/googleDriveService';
import { GoogleCredentials } from '../../types';

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const existingCreds = googleDriveService.getCredentials();
  const [clientId, setClientId] = useState<string>(existingCreds?.clientId || '');
  const [apiKey, setApiKey] = useState<string>(existingCreds?.apiKey || '');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) {
      setErrorMsg('Please enter your Google OAuth Client ID.');
      return;
    }

    setIsAuthenticating(true);
    setErrorMsg(null);

    try {
      const creds: GoogleCredentials = {
        clientId: clientId.trim(),
        apiKey: apiKey.trim(),
      };

      googleDriveService.saveCredentials(creds);
      await googleDriveService.login();
      setIsAuthenticating(false);
      onConnected();
      onClose();
    } catch (err: any) {
      console.error('Google login failed:', err);
      setErrorMsg(err.message || 'Failed to authenticate with Google. Please check your credentials.');
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <ShieldCheck size={24} style={{ color: '#3b82f6' }} />
            <span>Connect Google Drive</span>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Enter your Google Cloud credentials to view, annotate, and sync your real Google Drive files. All requests are authenticated securely directly from your browser.
        </p>

        {errorMsg && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#f87171',
              fontSize: '0.875rem',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveAndConnect} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Google OAuth Client ID <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 1234567890-xxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Google API Key (Optional, for Picker & Metadata)
            </label>
            <input
              type="text"
              placeholder="e.g. AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Setup Guide Accordion */}
          <div
            style={{
              background: 'var(--bg-tertiary)',
              padding: '0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ExternalLink size={14} />
              <span>How to get credentials (Free & Fast):</span>
            </div>
            <ol style={{ paddingLeft: '1.25rem', lineHeight: '1.5' }}>
              <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Google Cloud Console</a>.</li>
              <li>Create a Project & enable <strong>Google Drive API</strong>.</li>
              <li>Go to <strong>APIs & Services &gt; Credentials</strong> and create an <strong>OAuth 2.0 Web Client ID</strong>.</li>
              <li>Add <code>http://localhost:5173</code> (or your current URL) to <strong>Authorized JavaScript origins</strong>.</li>
            </ol>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isAuthenticating}>
              {isAuthenticating ? 'Connecting...' : 'Authorize & Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
