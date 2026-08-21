import { DriveFile, GoogleCredentials } from '../types';
import { getFileTypeFromMimeAndExt } from '../utils/fileTypeUtils';

const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file';
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

  constructor() {
    this.loadSavedCredentials();
    this.accessToken = localStorage.getItem('drive_studio_google_token') || null;
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
    localStorage.removeItem('drive_studio_google_creds');
    localStorage.removeItem('drive_studio_google_token');
    localStorage.removeItem('drive_studio_token_expires');
  }

  public getCredentials(): GoogleCredentials | null {
    return this.credentials;
  }

  public isConnected(): boolean {
    if (!this.accessToken) return false;
    const expiresAtStr = localStorage.getItem('drive_studio_token_expires');
    if (expiresAtStr && parseInt(expiresAtStr, 10) < Date.now()) {
      this.logout();
      return false;
    }
    return true;
  }

  public getAccessToken(): string | null {
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
        callback: (resp: any) => {
          if (resp.error) {
            console.error('Auth error:', resp);
            return;
          }
          this.accessToken = resp.access_token;
          if (this.accessToken) {
            localStorage.setItem('drive_studio_google_token', this.accessToken);
            // Tokens expire in ~3600 seconds
            const expiresIn = resp.expires_in ? parseInt(resp.expires_in, 10) : 3500;
            localStorage.setItem('drive_studio_token_expires', (Date.now() + expiresIn * 1000).toString());
          }
        },
      });
      this.gisInited = true;
      return true;
    } catch (e) {
      console.error('Error initializing GIS client', e);
      return false;
    }
  }

  public async login(): Promise<string> {
    if (!this.credentials?.clientId) {
      throw new Error('Google Client ID is missing. Please configure credentials.');
    }

    await this.initializeGis();
    await this.initializeGapi();

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient.callback = (resp: any) => {
          if (resp.error) {
            return reject(new Error(resp.error_description || resp.error));
          }
          this.accessToken = resp.access_token;
          localStorage.setItem('drive_studio_google_token', resp.access_token);
          const expiresIn = resp.expires_in ? parseInt(resp.expires_in, 10) : 3500;
          localStorage.setItem('drive_studio_token_expires', (Date.now() + expiresIn * 1000).toString());
          resolve(resp.access_token);
        };

        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  public logout(): void {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(this.accessToken, () => {});
      } catch (e) {}
    }
    this.accessToken = null;
    localStorage.removeItem('drive_studio_google_token');
    localStorage.removeItem('drive_studio_token_expires');
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
      isDemo: false,
    }));
  }

  public async downloadFile(fileId: string, mimeType?: string): Promise<{ data: ArrayBuffer; mimeType: string }> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }

    // Check if it's a native Google Docs / Sheets / Slides file
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    let effectiveMime = mimeType || 'application/octet-stream';

    if (mimeType?.includes('google-apps.document')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
      effectiveMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (mimeType?.includes('google-apps.spreadsheet')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
      effectiveMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file from Google Drive (${response.status}: ${response.statusText})`);
    }

    const arrayBuffer = await response.arrayBuffer();
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
