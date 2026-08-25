import { ConnectedDriveAccount, DriveFile, GoogleCredentials } from '../types';
import { getFileTypeFromMimeAndExt } from '../utils/fileTypeUtils';
import { fileBufferCache } from './fileBufferCache';

const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

class GoogleDriveService {
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private credentials: GoogleCredentials | null = null;
  private gapiInited = false;
  private gisInited = false;

  private accounts: ConnectedDriveAccount[] = [];
  private activeAccountId: string | null = null;
  private refreshPromise: Map<string, Promise<string>> = new Map();
  private autoRefreshTimer: any = null;

  constructor() {
    this.loadSavedCredentials();
    this.loadAccounts();
    this.startAutoTokenRefresh();
  }

  /**
   * Background token refresher to silently extend session before token expires (1 hour lifetime)
   */
  private startAutoTokenRefresh(): void {
    if (typeof window === 'undefined') return;
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }

    // Check every 4 minutes if active account's token is expiring within 8 minutes
    this.autoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      const active = this.getActiveAccount();
      if (active && active.token && active.tokenExpires) {
        const remaining = active.tokenExpires - Date.now();
        if (remaining < 8 * 60 * 1000) {
          this.refreshToken(active.id, false).catch((err) => {
            console.debug('Background silent token refresh notice:', err);
          });
        }
      }
    }, 4 * 60 * 1000);
  }

  public loadAccounts(): ConnectedDriveAccount[] {
    try {
      const saved = localStorage.getItem('drive_studio_connected_accounts');
      if (saved) {
        this.accounts = JSON.parse(saved);
      }
      this.activeAccountId = localStorage.getItem('drive_studio_active_account_id') || null;

      // Validate active account or fallback to first valid account
      const active = this.accounts.find((a) => a.id === this.activeAccountId) || this.accounts[0] || null;
      if (active) {
        this.activeAccountId = active.id;
        this.accessToken = active.token;
      } else {
        this.activeAccountId = null;
        this.accessToken = null;
      }
    } catch (e) {
      this.accounts = [];
    }
    return this.accounts;
  }

  private saveAccounts(): void {
    localStorage.setItem('drive_studio_connected_accounts', JSON.stringify(this.accounts));
    if (this.activeAccountId) {
      localStorage.setItem('drive_studio_active_account_id', this.activeAccountId);
    } else {
      localStorage.removeItem('drive_studio_active_account_id');
    }
  }

  public getAccounts(): ConnectedDriveAccount[] {
    return this.accounts;
  }

  public getActiveAccount(): ConnectedDriveAccount | null {
    if (!this.activeAccountId) return null;
    return this.accounts.find((a) => a.id === this.activeAccountId) || null;
  }

  public switchAccount(accountId: string): ConnectedDriveAccount | null {
    const target = this.accounts.find((a) => a.id === accountId);
    if (!target) return null;

    this.activeAccountId = target.id;
    this.accessToken = target.token;
    this.saveAccounts();
    return target;
  }

  public removeAccount(accountId: string): void {
    const target = this.accounts.find((a) => a.id === accountId);
    if (target?.token && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(target.token, () => {});
      } catch (e) {
        console.warn('Error revoking token:', e);
      }
    }
    this.accounts = this.accounts.filter((a) => a.id !== accountId);
    if (this.activeAccountId === accountId) {
      const next = this.accounts[0] || null;
      this.activeAccountId = next ? next.id : null;
      this.accessToken = next ? next.token : null;
    }
    this.saveAccounts();
  }

  public loadSavedCredentials(): GoogleCredentials | null {
    try {
      const saved = localStorage.getItem('drive_studio_google_creds');
      if (saved) {
        this.credentials = JSON.parse(saved);
        return this.credentials;
      }
    } catch (e) {
      console.error('Failed to load saved credentials', e);
    }
    // Preload default client ID (or from env variable)
    this.credentials = {
      clientId:
        (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
        '60848340645-t0am6ngk8f7u8dc7lgs03k4bt57rmkf8.apps.googleusercontent.com',
      apiKey: (import.meta as any).env?.VITE_GOOGLE_API_KEY || '',
    };
    return this.credentials;
  }

  public saveCredentials(creds: GoogleCredentials): void {
    this.credentials = creds;
    localStorage.setItem('drive_studio_google_creds', JSON.stringify(creds));
  }

  public clearCredentials(): void {
    this.credentials = null;
    this.accessToken = null;
    this.accounts = [];
    this.activeAccountId = null;
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
    localStorage.removeItem('drive_studio_google_creds');
    localStorage.removeItem('drive_studio_connected_accounts');
    localStorage.removeItem('drive_studio_active_account_id');
    localStorage.removeItem('drive_studio_google_token');
    localStorage.removeItem('drive_studio_token_expires');
  }

  public getCredentials(): GoogleCredentials | null {
    return this.credentials;
  }

  /**
   * Check if user has an active connected Google Drive account.
   * Does NOT aggressively delete accounts on expired tokens.
   */
  public isConnected(accountId?: string): boolean {
    if (accountId && accountId !== 'local') {
      return this.accounts.some((a) => a.id === accountId || a.email === accountId);
    }
    return !!this.getActiveAccount();
  }

  public getAccessToken(accountId?: string): string | null {
    if (accountId && accountId !== 'local') {
      const acc = this.accounts.find((a) => a.id === accountId || a.email === accountId);
      if (acc && acc.token) return acc.token;
    }
    return this.accessToken;
  }

  public async initializeGapi(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.gapiInited) {
        return resolve(true);
      }

      if (!window.gapi) {
        console.warn('gapi script not loaded yet');
        return resolve(false);
      }

      window.gapi.load('client:picker', async () => {
        try {
          if (this.credentials?.apiKey) {
            await window.gapi.client.init({
              apiKey: this.credentials.apiKey,
              discoveryDocs: [DISCOVERY_DOC],
            });
            this.gapiInited = true;
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (err) {
          console.error('Error initializing GAPI client', err);
          resolve(false);
        }
      });
    });
  }

  public async initializeGis(): Promise<boolean> {
    if (this.gisInited && this.tokenClient) {
      return true;
    }

    if (!window.google?.accounts?.oauth2) {
      console.warn('Google Identity Services script not ready');
      return false;
    }

    if (!this.credentials?.clientId) {
      return false;
    }

    try {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.credentials.clientId,
        scope: SCOPES,
        callback: () => {},
      });
      this.gisInited = true;
      return true;
    } catch (e) {
      console.error('Error initializing GIS client', e);
      return false;
    }
  }

  /**
   * Refreshes or requests a token for a given account.
   * If interactive=false, requests silently without prompting if possible.
   */
  public async refreshToken(accountId?: string, interactive: boolean = false): Promise<string> {
    const target = accountId && accountId !== 'local'
      ? this.accounts.find((a) => a.id === accountId || a.email === accountId)
      : this.getActiveAccount();

    if (!target) {
      throw new Error('No Google Drive account connected. Please connect your Google Drive.');
    }

    const accId = target.id;
    if (this.refreshPromise.has(accId)) {
      return this.refreshPromise.get(accId)!;
    }

    const task = (async () => {
      await this.initializeGis();
      if (!this.tokenClient) {
        throw new Error('Google Identity Services client is not available yet.');
      }

      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Token refresh request timed out.'));
        }, 15000);

        this.tokenClient.callback = async (resp: any) => {
          clearTimeout(timeout);
          if (resp.error) {
            console.warn('GIS token request response error:', resp.error, resp.error_description);
            return reject(new Error(resp.error_description || resp.error));
          }

          const token = resp.access_token;
          const expiresIn = resp.expires_in ? parseInt(resp.expires_in, 10) : 3500;
          const tokenExpires = Date.now() + expiresIn * 1000;

          // Update target account in state and storage
          target.token = token;
          target.tokenExpires = tokenExpires;

          const idx = this.accounts.findIndex((a) => a.id === target.id);
          if (idx >= 0) {
            this.accounts[idx] = { ...target };
          }

          if (this.activeAccountId === target.id) {
            this.accessToken = token;
          }

          this.saveAccounts();
          resolve(token);
        };

        try {
          if (interactive) {
            this.tokenClient.requestAccessToken({
              prompt: 'select_account consent',
              hint: target.email,
            });
          } else {
            // Silent renewal with empty prompt and email hint
            this.tokenClient.requestAccessToken({
              prompt: '',
              hint: target.email,
            });
          }
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    })().finally(() => {
      this.refreshPromise.delete(accId);
    });

    this.refreshPromise.set(accId, task);
    return task;
  }

  /**
   * Ensures an account has a valid, non-expired access token before making Google Drive API requests.
   * Silently refreshes if token is expiring within 2 minutes or has expired.
   */
  public async ensureValidToken(accountId?: string): Promise<string> {
    const target = accountId && accountId !== 'local'
      ? this.accounts.find((a) => a.id === accountId || a.email === accountId)
      : this.getActiveAccount();

    if (!target) {
      throw new Error('Please connect your Google Drive account.');
    }

    const now = Date.now();
    // Valid for at least another 2 minutes (120,000ms)
    if (target.token && target.tokenExpires && target.tokenExpires - now > 120 * 1000) {
      return target.token;
    }

    // Token is close to expiring or already expired -> attempt silent renewal
    try {
      const freshToken = await this.refreshToken(target.id, false);
      return freshToken;
    } catch (silentErr) {
      console.warn('Silent token renewal failed; evaluating fallback:', silentErr);
      // If current token hasn't fully expired yet, allow trying it
      if (target.token && target.tokenExpires && target.tokenExpires > now) {
        return target.token;
      }
      throw new Error('Google Drive session expired. Please reconnect to Google Drive.');
    }
  }

  /**
   * Wrapper for making authenticated fetch requests with automatic 401 retry & token renewal
   */
  private async fetchWithAuth(
    url: string,
    options: RequestInit = {},
    accountId?: string
  ): Promise<Response> {
    let token = await this.ensureValidToken(accountId);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      console.warn('Google Drive API returned 401; attempting silent token refresh retry...');
      try {
        token = await this.refreshToken(accountId, false);
        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set('Authorization', `Bearer ${token}`);
        response = await fetch(url, { ...options, headers: retryHeaders });
      } catch (retryErr) {
        console.warn('Retry on 401 failed:', retryErr);
      }
    }

    return response;
  }

  public async login(): Promise<string> {
    const account = await this.loginNewAccount();
    return account.token;
  }

  /**
   * Connect a new or additional Google Drive account with interactive consent
   */
  public async loginNewAccount(): Promise<ConnectedDriveAccount> {
    if (!this.credentials?.clientId) {
      throw new Error('Google Client ID is missing. Please configure credentials.');
    }

    await this.initializeGis();
    await this.initializeGapi();

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient.callback = async (resp: any) => {
          if (resp.error) {
            return reject(new Error(resp.error_description || resp.error));
          }
          const token = resp.access_token;
          const expiresIn = resp.expires_in ? parseInt(resp.expires_in, 10) : 3500;
          const tokenExpires = Date.now() + expiresIn * 1000;

          // Fetch user profile info
          let email = `drive_account_${this.accounts.length + 1}@gmail.com`;
          let name = `Drive ${this.accounts.length + 1}`;
          let picture = '';

          try {
            const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userResp.ok) {
              const userInfo = await userResp.json();
              if (userInfo.email) email = userInfo.email;
              if (userInfo.name) name = userInfo.name;
              if (userInfo.picture) picture = userInfo.picture;
            }
          } catch (e) {
            console.warn('Could not fetch user profile info:', e);
          }

          const account: ConnectedDriveAccount = {
            id: email,
            email,
            name,
            picture,
            token,
            tokenExpires,
            addedAt: new Date().toISOString(),
          };

          // Update existing or add new account
          const existingIdx = this.accounts.findIndex((a) => a.id === account.id || a.email === account.email);
          if (existingIdx >= 0) {
            this.accounts[existingIdx] = account;
          } else {
            this.accounts.push(account);
          }

          this.activeAccountId = account.id;
          this.accessToken = account.token;
          this.saveAccounts();

          resolve(account);
        };

        // Prompt account selection and consent
        this.tokenClient.requestAccessToken({ prompt: 'select_account consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  public logout(): void {
    if (this.activeAccountId) {
      this.removeAccount(this.activeAccountId);
    }
  }

  public async listFiles(folderId: string = 'root', searchQuery?: string, accountId?: string): Promise<DriveFile[]> {
    let q = "trashed = false";
    if (searchQuery && searchQuery.trim()) {
      q += ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`;
    } else if (folderId) {
      q += ` and '${folderId}' in parents`;
    }

    const fields = 'files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink, parents)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=folder,name`;

    const response = await this.fetchWithAuth(url, {}, accountId);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to fetch files: ${response.statusText}`);
    }

    const data = await response.json();
    const files = data.files || [];

    return files.map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      fileType: getFileTypeFromMimeAndExt(f.mimeType, f.name),
      size: f.size ? parseInt(f.size, 10) : 0,
      modifiedTime: f.modifiedTime,
      iconUrl: f.iconLink,
      thumbnailLink: f.thumbnailLink,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      parentFolderId: f.parents?.[0],
      driveAccountId: accountId || this.activeAccountId || undefined,
      isDemo: false,
    }));
  }

  public async downloadFile(
    fileId: string,
    mimeType?: string,
    _onProgress?: (receivedBytes: number, totalBytes: number) => void,
    accountId?: string
  ): Promise<{ data: ArrayBuffer; mimeType: string }> {
    const effectiveMime = mimeType || 'application/octet-stream';

    // 1. Instant Cache Hit: Return from local IndexedDB/RAM in <50ms without network wait
    const cachedData = await fileBufferCache.get(fileId);
    if (cachedData && cachedData.byteLength > 0) {
      return { data: cachedData, mimeType: effectiveMime };
    }

    // Check if it's a native Google Docs / Sheets / Slides file
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    if (mimeType?.includes('google-apps.document')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
    } else if (mimeType?.includes('google-apps.spreadsheet')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    }

    const response = await this.fetchWithAuth(downloadUrl, {}, accountId);

    if (!response.ok) {
      throw new Error(`Failed to download file from Google Drive (${response.status}: ${response.statusText})`);
    }

    // Download full lossless ArrayBuffer atomically
    const arrayBuffer = await response.arrayBuffer();

    // Cache downloaded buffer in local IndexedDB + RAM so subsequent clicks open in 0.01s!
    if (arrayBuffer && arrayBuffer.byteLength > 0) {
      fileBufferCache.set(fileId, arrayBuffer);
    }

    return { data: arrayBuffer, mimeType: effectiveMime };
  }

  /**
   * Lossless Direct Media Upload to Google Drive
   * Preserves exact binary stream without corrupting PDF / XLSX / Image bytes.
   */
  public async uploadFileContent(
    fileId: string,
    fileName: string,
    mimeType: string,
    content: Blob | ArrayBuffer,
    accountId?: string
  ): Promise<DriveFile> {
    const blobContent = content instanceof Blob ? content : new Blob([content], { type: mimeType });

    // Step 1: Upload the binary content directly to Google Drive via uploadType=media
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

    const response = await this.fetchWithAuth(
      uploadUrl,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
        },
        body: blobContent,
      },
      accountId
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to update file in Google Drive: ${response.statusText}`);
    }

    // Step 2: If fileName was provided, update metadata name
    try {
      const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
      const metaResp = await this.fetchWithAuth(
        metaUrl,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({ name: fileName }),
        },
        accountId
      );
      if (metaResp.ok) {
        const metaJson = await metaResp.json();
        return {
          id: metaJson.id,
          name: metaJson.name,
          mimeType: metaJson.mimeType,
          fileType: getFileTypeFromMimeAndExt(metaJson.mimeType, metaJson.name),
          driveAccountId: accountId || this.activeAccountId || undefined,
          isDemo: false,
        };
      }
    } catch (e) {
      console.warn('Metadata name update note:', e);
    }

    const updated = await response.json().catch(() => ({ id: fileId, name: fileName, mimeType }));
    return {
      id: updated.id || fileId,
      name: updated.name || fileName,
      mimeType: updated.mimeType || mimeType,
      fileType: getFileTypeFromMimeAndExt(updated.mimeType || mimeType, updated.name || fileName),
      driveAccountId: accountId || this.activeAccountId || undefined,
      isDemo: false,
    };
  }

  /**
   * Create a new file or "Save as Copy" in Google Drive
   */
  public async createNewFile(
    fileName: string,
    mimeType: string,
    content: Blob | ArrayBuffer,
    parentFolderId?: string,
    accountId?: string
  ): Promise<DriveFile> {
    // Step 1: Create file metadata
    const createMetaUrl = 'https://www.googleapis.com/drive/v3/files';
    const metaBody: any = {
      name: fileName,
      mimeType: mimeType,
    };
    if (parentFolderId && parentFolderId !== 'root') {
      metaBody.parents = [parentFolderId];
    }

    const metaResp = await this.fetchWithAuth(
      createMetaUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(metaBody),
      },
      accountId
    );

    if (!metaResp.ok) {
      if (metaResp.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await metaResp.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to create file: ${metaResp.statusText}`);
    }

    const createdFile = await metaResp.json();

    // Step 2: Upload content to newly created file
    const blobContent = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${createdFile.id}?uploadType=media`;

    const uploadResp = await this.fetchWithAuth(
      uploadUrl,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
        },
        body: blobContent,
      },
      accountId
    );

    if (!uploadResp.ok) {
      const errJson = await uploadResp.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to upload content: ${uploadResp.statusText}`);
    }

    return {
      id: createdFile.id,
      name: createdFile.name,
      mimeType: createdFile.mimeType,
      fileType: getFileTypeFromMimeAndExt(createdFile.mimeType, createdFile.name),
      driveAccountId: accountId || this.activeAccountId || undefined,
      isDemo: false,
    };
  }

  /**
   * Create a new folder in Google Drive
   */
  public async createFolder(folderName: string, parentFolderId?: string, accountId?: string): Promise<DriveFile> {
    const createMetaUrl = 'https://www.googleapis.com/drive/v3/files';
    const metaBody: any = {
      name: folderName.trim(),
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId && parentFolderId !== 'root') {
      metaBody.parents = [parentFolderId];
    }

    const response = await this.fetchWithAuth(
      createMetaUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(metaBody),
      },
      accountId
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to create folder: ${response.statusText}`);
    }

    const created = await response.json();
    return {
      id: created.id,
      name: created.name,
      mimeType: created.mimeType,
      fileType: 'unknown',
      isFolder: true,
      isDemo: false,
      driveAccountId: accountId || this.activeAccountId || undefined,
      parentFolderId: parentFolderId || 'root',
      modifiedTime: new Date().toISOString(),
    };
  }

  /**
   * Copy a file in Google Drive
   */
  public async copyFile(fileId: string, destinationFolderId?: string, accountId?: string): Promise<DriveFile> {
    const copyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/copy`;
    const copyBody: any = {};
    if (destinationFolderId && destinationFolderId !== 'root') {
      copyBody.parents = [destinationFolderId];
    }

    const response = await this.fetchWithAuth(
      copyUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(copyBody),
      },
      accountId
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to copy file: ${response.statusText}`);
    }

    const created = await response.json();
    return {
      id: created.id,
      name: created.name,
      mimeType: created.mimeType,
      fileType: getFileTypeFromMimeAndExt(created.mimeType, created.name),
      driveAccountId: accountId || this.activeAccountId || undefined,
      isDemo: false,
      parentFolderId: destinationFolderId || 'root',
      modifiedTime: new Date().toISOString(),
    };
  }

  /**
   * Move / Cut & Paste a file to another folder in Google Drive
   */
  public async moveFile(fileId: string, previousFolderId?: string, targetFolderId?: string, accountId?: string): Promise<DriveFile> {
    let moveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${encodeURIComponent(targetFolderId || 'root')}`;
    if (previousFolderId && previousFolderId !== 'root') {
      moveUrl += `&removeParents=${encodeURIComponent(previousFolderId)}`;
    }

    const response = await this.fetchWithAuth(
      moveUrl,
      {
        method: 'PATCH',
      },
      accountId
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to move file: ${response.statusText}`);
    }

    const updated = await response.json();
    return {
      id: updated.id,
      name: updated.name,
      mimeType: updated.mimeType,
      fileType: getFileTypeFromMimeAndExt(updated.mimeType, updated.name),
      driveAccountId: accountId || this.activeAccountId || undefined,
      isDemo: false,
      parentFolderId: targetFolderId || 'root',
      modifiedTime: new Date().toISOString(),
    };
  }

  /**
   * Delete a file or folder in Google Drive
   */
  public async deleteFile(fileId: string, accountId?: string): Promise<void> {
    const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const response = await this.fetchWithAuth(
      deleteUrl,
      {
        method: 'DELETE',
      },
      accountId
    );

    if (!response.ok && response.status !== 204) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to delete: ${response.statusText}`);
    }
  }
}

export const googleDriveService = new GoogleDriveService();
