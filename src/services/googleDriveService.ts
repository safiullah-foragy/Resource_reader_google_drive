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

  constructor() {
    this.loadSavedCredentials();
    this.loadAccounts();
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
    localStorage.removeItem('drive_studio_google_creds');
    localStorage.removeItem('drive_studio_connected_accounts');
    localStorage.removeItem('drive_studio_active_account_id');
    localStorage.removeItem('drive_studio_google_token');
    localStorage.removeItem('drive_studio_token_expires');
  }

  public getCredentials(): GoogleCredentials | null {
    return this.credentials;
  }

  public isConnected(): boolean {
    const active = this.getActiveAccount();
    if (!active || !active.token) return false;
    if (active.tokenExpires && active.tokenExpires < Date.now()) {
      this.removeAccount(active.id);
      return false;
    }
    return true;
  }

  public getAccessToken(accountId?: string): string | null {
    if (accountId) {
      const acc = this.accounts.find((a) => a.id === accountId);
      if (acc) return acc.token;
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

  public async login(): Promise<string> {
    const account = await this.loginNewAccount();
    return account.token;
  }

  /**
   * Connect a new or additional Google Drive account
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

        // Always prompt account selection and consent so users must explicitly authenticate each time
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

  public async listFiles(folderId: string = 'root', searchQuery?: string): Promise<DriveFile[]> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    let q = "trashed = false";
    if (searchQuery && searchQuery.trim()) {
      q += ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`;
    } else if (folderId) {
      q += ` and '${folderId}' in parents`;
    }

    const fields = 'files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink, parents)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,name`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
        throw new Error('Authentication expired. Please connect to Google Drive.');
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
      driveAccountId: this.activeAccountId || undefined,
      isDemo: false,
    }));
  }

  public async downloadFile(
    fileId: string,
    mimeType?: string,
    onProgress?: (receivedBytes: number, totalBytes: number) => void
  ): Promise<{ data: ArrayBuffer; mimeType: string }> {
    const effectiveMime = mimeType || 'application/octet-stream';

    // 1. Instant Cache Hit: Return from local IndexedDB/RAM in <50ms without network wait
    const cachedData = await fileBufferCache.get(fileId);
    if (cachedData && cachedData.byteLength > 0) {
      return { data: cachedData, mimeType: effectiveMime };
    }

    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }

    // Check if it's a native Google Docs / Sheets / Slides file
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    if (mimeType?.includes('google-apps.document')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
    } else if (mimeType?.includes('google-apps.spreadsheet')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    }

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file from Google Drive (${response.status}: ${response.statusText})`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    let arrayBuffer: ArrayBuffer;

    if (response.body && onProgress && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          onProgress(receivedBytes, totalBytes);
        }
      }

      const combined = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      arrayBuffer = combined.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

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
    content: Blob | ArrayBuffer
  ): Promise<DriveFile> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    const blobContent = content instanceof Blob ? content : new Blob([content], { type: mimeType });

    // Step 1: Upload the binary content directly to Google Drive via uploadType=media
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: blobContent,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to update file in Google Drive: ${response.statusText}`);
    }

    // Step 2: If fileName was provided, update metadata name
    try {
      const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
      const metaResp = await fetch(metaUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ name: fileName }),
      });
      if (metaResp.ok) {
        const metaJson = await metaResp.json();
        return {
          id: metaJson.id,
          name: metaJson.name,
          mimeType: metaJson.mimeType,
          fileType: getFileTypeFromMimeAndExt(metaJson.mimeType, metaJson.name),
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
    parentFolderId?: string
  ): Promise<DriveFile> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    // Step 1: Create file metadata
    const createMetaUrl = 'https://www.googleapis.com/drive/v3/files';
    const metaBody: any = {
      name: fileName,
      mimeType: mimeType,
    };
    if (parentFolderId && parentFolderId !== 'root') {
      metaBody.parents = [parentFolderId];
    }

    const metaResp = await fetch(createMetaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(metaBody),
    });

    if (!metaResp.ok) {
      if (metaResp.status === 401) {
        this.logout();
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await metaResp.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to create file: ${metaResp.statusText}`);
    }

    const createdFile = await metaResp.json();

    // Step 2: Upload content to newly created file
    const blobContent = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${createdFile.id}?uploadType=media`;

    const uploadResp = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: blobContent,
    });

    if (!uploadResp.ok) {
      const errJson = await uploadResp.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to upload content: ${uploadResp.statusText}`);
    }

    return {
      id: createdFile.id,
      name: createdFile.name,
      mimeType: createdFile.mimeType,
      fileType: getFileTypeFromMimeAndExt(createdFile.mimeType, createdFile.name),
      isDemo: false,
    };
  }

  /**
   * Create a new folder in Google Drive
   */
  public async createFolder(folderName: string, parentFolderId?: string): Promise<DriveFile> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    const createMetaUrl = 'https://www.googleapis.com/drive/v3/files';
    const metaBody: any = {
      name: folderName.trim(),
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId && parentFolderId !== 'root') {
      metaBody.parents = [parentFolderId];
    }

    const response = await fetch(createMetaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(metaBody),
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
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
      parentFolderId: parentFolderId || 'root',
      modifiedTime: new Date().toISOString(),
    };
  }

  /**
   * Copy a file in Google Drive
   */
  public async copyFile(fileId: string, destinationFolderId?: string): Promise<DriveFile> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    const copyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/copy`;
    const copyBody: any = {};
    if (destinationFolderId && destinationFolderId !== 'root') {
      copyBody.parents = [destinationFolderId];
    }

    const response = await fetch(copyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(copyBody),
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
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
      isDemo: false,
      parentFolderId: destinationFolderId || 'root',
      modifiedTime: new Date().toISOString(),
    };
  }

  /**
   * Move / Cut & Paste a file to another folder in Google Drive
   */
  public async moveFile(fileId: string, previousFolderId?: string, targetFolderId?: string): Promise<DriveFile> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    let moveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${encodeURIComponent(targetFolderId || 'root')}`;
    if (previousFolderId && previousFolderId !== 'root') {
      moveUrl += `&removeParents=${encodeURIComponent(previousFolderId)}`;
    }

    const response = await fetch(moveUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
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
      isDemo: false,
      parentFolderId: targetFolderId || 'root',
      modifiedTime: new Date().toISOString(),
    };
  }

  /**
   * Delete a file or folder in Google Drive
   */
  public async deleteFile(fileId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Authentication expired. Please connect to Google Drive.');
    }

    const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      if (response.status === 401) {
        this.logout();
        throw new Error('Authentication expired. Please reconnect to Google Drive.');
      }
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to delete: ${response.statusText}`);
    }
  }
}

export const googleDriveService = new GoogleDriveService();
