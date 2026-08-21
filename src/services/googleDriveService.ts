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
    // Preload default client ID
    this.credentials = {
      clientId: '60848340645-t0am6ngk8f7u8dc7lgs03k4bt57rmkf8.apps.googleusercontent.com',
      apiKey: '',
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
  }

  public getCredentials(): GoogleCredentials | null {
    return this.credentials;
  }

  public isConnected(): boolean {
    return !!this.accessToken;
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
      window.google.accounts.oauth2.revoke(this.accessToken, () => {
        this.accessToken = null;
        localStorage.removeItem('drive_studio_google_token');
      });
    } else {
      this.accessToken = null;
      localStorage.removeItem('drive_studio_google_token');
    }
  }

  public async listFiles(folderId: string = 'root', searchQuery?: string): Promise<DriveFile[]> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please connect to Google Drive first.');
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
   * Lossless Multipart Upload to Google Drive
   * Preserves exact binary stream without corrupting PDF / XLSX / Image bytes.
   */
  public async uploadFileContent(
    fileId: string,
    fileName: string,
    mimeType: string,
    content: Blob | ArrayBuffer
  ): Promise<DriveFile> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: mimeType,
    };

    const blobContent = content instanceof Blob ? content : new Blob([content], { type: mimeType });

    const metadataPart = new Blob(
      [`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`],
      { type: 'text/plain' }
    );

    const mediaHeaderPart = new Blob(
      [`${delimiter}Content-Type: ${mimeType}\r\n\r\n`],
      { type: 'text/plain' }
    );

    const closePart = new Blob([closeDelimiter], { type: 'text/plain' });

    // Combine all chunks into a unified multipart body Blob to preserve binary integrity
    const multipartRequestBody = new Blob([metadataPart, mediaHeaderPart, blobContent, closePart]);

    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;

    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to update file in Google Drive: ${response.statusText}`);
    }

    const updated = await response.json();
    return {
      id: updated.id,
      name: updated.name,
      mimeType: updated.mimeType,
      fileType: getFileTypeFromMimeAndExt(updated.mimeType, updated.name),
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
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata: any = {
      name: fileName,
      mimeType: mimeType,
    };

    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const blobContent = content instanceof Blob ? content : new Blob([content], { type: mimeType });

    const metadataPart = new Blob(
      [`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`],
      { type: 'text/plain' }
    );

    const mediaHeaderPart = new Blob(
      [`${delimiter}Content-Type: ${mimeType}\r\n\r\n`],
      { type: 'text/plain' }
    );

    const closePart = new Blob([closeDelimiter], { type: 'text/plain' });
    const multipartRequestBody = new Blob([metadataPart, mediaHeaderPart, blobContent, closePart]);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Failed to create file in Google Drive: ${response.statusText}`);
    }

    const created = await response.json();
    return {
      id: created.id,
      name: created.name,
      mimeType: created.mimeType,
      fileType: getFileTypeFromMimeAndExt(created.mimeType, created.name),
      isDemo: false,
    };
  }
}

export const googleDriveService = new GoogleDriveService();
