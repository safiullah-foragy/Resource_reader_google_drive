import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { DriveFile } from '../types';

export class DemoDataService {
  private demoFiles: DriveFile[] = [];
  private initialized = false;

  public async getDemoFiles(folderId: string = 'root'): Promise<DriveFile[]> {
    if (!this.initialized) {
      await this.initDemoFiles();
    }
    if (folderId === 'root') {
      return this.demoFiles.filter(f => !f.parentFolderId || f.parentFolderId === 'root');
    }
    return this.demoFiles.filter(f => f.parentFolderId === folderId);
  }

  private async initDemoFiles(): Promise<void> {
    try {
      const pdfBlob = await this.generateSamplePdf();
      const excelBlob = await this.generateSampleExcel();
      const imageBlob = await this.generateSampleImage();
      const docBlob = await this.generateSampleDoc();

      this.demoFiles = [
        // Folders
        {
          id: 'folder-finance',
          name: 'Finance & Compliance Reports',
          mimeType: 'application/vnd.google-apps.folder',
          fileType: 'unknown',
          isFolder: true,
          isDemo: true,
          parentFolderId: 'root',
          modifiedTime: new Date(Date.now() - 3600000 * 1).toISOString(),
        },
        {
          id: 'folder-engineering',
          name: 'Engineering & Diagrams',
          mimeType: 'application/vnd.google-apps.folder',
          fileType: 'unknown',
          isFolder: true,
          isDemo: true,
          parentFolderId: 'root',
          modifiedTime: new Date(Date.now() - 3600000 * 3).toISOString(),
        },
        {
          id: 'folder-specs',
          name: 'Project Specs & Notes',
          mimeType: 'application/vnd.google-apps.folder',
          fileType: 'unknown',
          isFolder: true,
          isDemo: true,
          parentFolderId: 'root',
          modifiedTime: new Date(Date.now() - 3600000 * 5).toISOString(),
        },
        // Files inside folders and root
        {
          id: 'demo-pdf-report',
          name: 'Q3_Financial_Review_&_Compliance.pdf',
          mimeType: 'application/pdf',
          fileType: 'pdf',
          size: pdfBlob.size,
          modifiedTime: new Date(Date.now() - 3600000 * 2).toISOString(),
          isFolder: false,
          isDemo: true,
          parentFolderId: 'folder-finance',
          rawBlob: pdfBlob,
        },
        {
          id: 'demo-excel-budget',
          name: 'Global_Budget_Allocation_2026.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileType: 'excel',
          size: excelBlob.size,
          modifiedTime: new Date(Date.now() - 3600000 * 8).toISOString(),
          isFolder: false,
          isDemo: true,
          parentFolderId: 'folder-finance',
          rawBlob: excelBlob,
        },
        {
          id: 'demo-image-arch',
          name: 'System_Architecture_Diagram.png',
          mimeType: 'image/png',
          fileType: 'image',
          size: imageBlob.size,
          modifiedTime: new Date(Date.now() - 3600000 * 24).toISOString(),
          isFolder: false,
          isDemo: true,
          parentFolderId: 'folder-engineering',
          rawBlob: imageBlob,
        },
        {
          id: 'demo-doc-specs',
          name: 'Project_Specification_&_Milestones.md',
          mimeType: 'text/markdown',
          fileType: 'doc',
          size: docBlob.size,
          modifiedTime: new Date(Date.now() - 3600000 * 36).toISOString(),
          isFolder: false,
          isDemo: true,
          parentFolderId: 'folder-specs',
          rawBlob: docBlob,
        },
        {
          id: 'demo-root-pdf',
          name: 'Master_Executive_Brief.pdf',
          mimeType: 'application/pdf',
          fileType: 'pdf',
          size: pdfBlob.size,
          modifiedTime: new Date(Date.now() - 3600000 * 12).toISOString(),
          isFolder: false,
          isDemo: true,
          parentFolderId: 'root',
          rawBlob: pdfBlob,
        },
      ];

      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize demo files:', err);
    }
  }

  public async generateSamplePdf(): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    // Page 1: Executive Summary & Financial Audit
    const page1 = pdfDoc.addPage([595.28, 841.89]); // A4
    const { height } = page1.getSize();

    // Top Brand Bar
    page1.drawRectangle({
      x: 0,
      y: height - 50,
      width: 595.28,
      height: 50,
      color: rgb(0.09, 0.12, 0.18),
    });

    page1.drawText('ENTERPRISE FINANCIAL & COMPLIANCE REVIEW', {
      x: 40,
      y: height - 32,
      size: 14,
      font: fontBold,
      color: rgb(0.9, 0.95, 1),
    });

    page1.drawText('CONFIDENTIAL - Q3 2026', {
      x: 430,
      y: height - 32,
      size: 10,
      font: fontMono,
      color: rgb(0.4, 0.7, 1),
    });

    // Content
    let y = height - 90;
    page1.drawText('1. Executive Overview & Operations', {
      x: 40,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.25),
    });

    y -= 25;
    page1.drawText(
      'This document contains the verified operational performance, resource allocation, and audited metrics for the current fiscal cycle. Reviewers may highlight key sections, add compliance stamps, and verify approval.',
      {
        x: 40,
        y,
        size: 10,
        font: fontRegular,
        color: rgb(0.25, 0.3, 0.35),
        lineHeight: 14,
        maxWidth: 515,
      }
    );

    // Table Header
    y -= 50;
    page1.drawRectangle({
      x: 40,
      y: y - 5,
      width: 515,
      height: 24,
      color: rgb(0.92, 0.94, 0.98),
    });

    page1.drawText('Division', { x: 50, y: y + 2, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.3) });
    page1.drawText('Target ($M)', { x: 180, y: y + 2, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.3) });
    page1.drawText('Actual ($M)', { x: 290, y: y + 2, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.3) });
    page1.drawText('Growth', { x: 400, y: y + 2, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.3) });
    page1.drawText('Status', { x: 480, y: y + 2, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.3) });

    const rows = [
      ['Cloud Infrastructure', '$ 14.50', '$ 16.80', '+15.8%', 'Approved'],
      ['AI & Automation Lab', '$ 22.00', '$ 25.40', '+15.4%', 'Approved'],
      ['Security & Compliance', '$ 8.20', '$ 7.90', '-3.6%', 'Pending Review'],
      ['Enterprise Services', '$ 31.00', '$ 34.20', '+10.3%', 'Approved'],
    ];

    rows.forEach((row, i) => {
      y -= 25;
      if (i % 2 === 1) {
        page1.drawRectangle({
          x: 40,
          y: y - 5,
          width: 515,
          height: 22,
          color: rgb(0.97, 0.98, 1),
        });
      }
      page1.drawText(row[0], { x: 50, y: y + 2, size: 9, font: fontRegular, color: rgb(0.1, 0.15, 0.2) });
      page1.drawText(row[1], { x: 180, y: y + 2, size: 9, font: fontMono, color: rgb(0.2, 0.25, 0.3) });
      page1.drawText(row[2], { x: 290, y: y + 2, size: 9, font: fontMono, color: rgb(0.1, 0.4, 0.2) });
      page1.drawText(row[3], { x: 400, y: y + 2, size: 9, font: fontBold, color: row[3].startsWith('+') ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.2, 0.2) });
      page1.drawText(row[4], { x: 480, y: y + 2, size: 9, font: fontRegular, color: rgb(0.3, 0.35, 0.4) });
    });

    // Verification Box
    y -= 70;
    page1.drawRectangle({
      x: 40,
      y: y - 10,
      width: 515,
      height: 80,
      borderColor: rgb(0.8, 0.85, 0.9),
      borderWidth: 1,
      color: rgb(0.99, 1, 1),
    });

    page1.drawText('COMPLIANCE & SIGN-OFF SECTION (ANNOTATE BELOW)', {
      x: 55,
      y: y + 50,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });

    page1.drawText('Authorized Signature: _______________________      Date: ____________', {
      x: 55,
      y: y + 20,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });

    page1.drawText('Notes / Observations: [Use pen or text tool to write feedback here]', {
      x: 55,
      y: y,
      size: 9,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.6),
    });

    // Page 2: Operational Notes
    const page2 = pdfDoc.addPage([595.28, 841.89]);
    const { height: h2 } = page2.getSize();

    page2.drawRectangle({
      x: 0,
      y: h2 - 50,
      width: 595.28,
      height: 50,
      color: rgb(0.09, 0.12, 0.18),
    });

    page2.drawText('PAGE 2 - AUDIT CHECKLIST & ACTION ITEMS', {
      x: 40,
      y: h2 - 32,
      size: 14,
      font: fontBold,
      color: rgb(0.9, 0.95, 1),
    });

    let y2 = h2 - 90;
    const checklist = [
      '[ ] Review cloud compute expenditure for anomaly detection in Q3.',
      '[ ] Confirm zero-trust data access policies for multi-region clusters.',
      '[ ] Verify Google Drive automated backup and synchronization integrity.',
      '[ ] Sign off on engineering headcount expansion and budget cap.',
    ];

    checklist.forEach((item) => {
      page2.drawText(item, {
        x: 40,
        y: y2,
        size: 11,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.25),
      });
      y2 -= 35;
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  }

  public async generateSampleExcel(): Promise<Blob> {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Financials
    const financialData = [
      ['Department', 'Q1 Actual ($)', 'Q2 Actual ($)', 'Q3 Projection ($)', 'Q4 Target ($)', 'Total Budget ($)', 'Variance (%)'],
      ['Engineering & R&D', 1250000, 1420000, 1550000, 1600000, 5820000, 4.2],
      ['Product Design', 340000, 360000, 390000, 410000, 1500000, 2.1],
      ['Sales & Marketing', 890000, 950000, 1100000, 1250000, 4190000, 6.8],
      ['Operations & Cloud', 450000, 475000, 510000, 530000, 1965000, -1.4],
      ['Legal & Compliance', 180000, 190000, 210000, 220000, 800000, 0.0],
      ['Customer Success', 310000, 335000, 360000, 385000, 1390000, 3.5],
      ['Total Company', 3420000, 3730000, 4120000, 4395000, 15665000, 3.8],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(financialData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Quarterly Financials');

    // Sheet 2: Project Roadmap
    const roadmapData = [
      ['Feature / Initiative', 'Owner', 'Priority', 'Start Date', 'Target Release', 'Completion (%)', 'Status'],
      ['Google Drive Two-Way Sync', 'Alex Rivera', 'High', '2026-06-01', '2026-08-15', 100, 'Completed'],
      ['In-Browser PDF Annotation', 'Sophia Chen', 'Critical', '2026-06-15', '2026-08-20', 95, 'In Progress'],
      ['Excel Spreadsheet Grid Engine', 'Marcus Vance', 'High', '2026-07-01', '2026-08-25', 90, 'In Progress'],
      ['Lossless Multipart Binary Uploader', 'Dev Team', 'Critical', '2026-07-10', '2026-08-22', 100, 'Verified'],
      ['Canvas Image Markup Studio', 'Elena Rostova', 'Medium', '2026-07-20', '2026-08-30', 85, 'In Progress'],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(roadmapData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Project Roadmap');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  public async generateSampleImage(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 750;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return new Blob([], { type: 'image/png' });
    }

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1200, 750);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 750);

    // Grid lines pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1200; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 750);
      ctx.stroke();
    }
    for (let y = 0; y < 750; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1200, y);
      ctx.stroke();
    }

    // Title Header
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillText('Google Drive Cloud Sync & In-Browser Multi-Editor Architecture', 60, 70);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('Lossless stream pipeline with client-side binary rendering & multipart PATCH', 60, 105);

    // Box 1: Google Drive Storage
    this.drawDiagramBox(ctx, 80, 180, 260, 180, '#3b82f6', 'Google Drive Cloud', [
      'OAuth2 Authentication',
      'Drive API v3 REST',
      'Lossless Binary Stream',
      'Resumable / Multipart',
    ]);

    // Arrow 1
    this.drawArrow(ctx, 340, 270, 460, 270, '#60a5fa', 'Fetch / Patch (Lossless)');

    // Box 2: Client Web App Engine
    this.drawDiagramBox(ctx, 460, 150, 320, 240, '#10b981', 'React Studio Core', [
      'Multi-Format Dispatcher',
      'State & Undo/Redo Engine',
      'Vector Annotation Canvas',
      'SheetJS Binary Matrix',
      'Draft Cache & Autosave',
    ]);

    // Arrow 2
    this.drawArrow(ctx, 780, 270, 900, 270, '#34d399', 'Render & Edit');

    // Box 3: Specialized In-Browser Editors
    this.drawDiagramBox(ctx, 900, 160, 240, 220, '#8b5cf6', 'In-Browser Editors', [
      'PDF (pdf-lib vector)',
      'Excel (SheetJS grid)',
      'Image Markup Studio',
      'Doc / Markdown Editor',
    ]);

    // Bottom banner
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.roundRect(80, 460, 1040, 180, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillText('Image Markup & Annotation Sandbox', 110, 500);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '15px Inter, sans-serif';
    ctx.fillText('• Use the Pen or Arrow tool above to mark critical pathways on this diagram.', 110, 535);
    ctx.fillText('• Add text callouts, highlight architectural components, or draw bounding boxes.', 110, 565);
    ctx.fillText('• Click "Save to Drive" to compile the new markup directly into the image file!', 110, 595);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || new Blob([], { type: 'image/png' }));
      }, 'image/png');
    });
  }

  private drawDiagramBox(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    title: string,
    items: string[]
  ) {
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header strip
    ctx.fillStyle = color;
    ctx.roundRect(x, y, w, 40, [10, 10, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillText(title, x + 16, y + 25);

    // List items
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '13px Inter, sans-serif';
    items.forEach((item, idx) => {
      ctx.fillText(`•  ${item}`, x + 18, y + 68 + idx * 26);
    });
    ctx.restore();
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string,
    label?: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    const headLen = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (label) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillText(label, (fromX + toX) / 2 - textWidth / 2, fromY - 10);
    }
    ctx.restore();
  }

  public async generateSampleDoc(): Promise<Blob> {
    const markdownContent = `# Product Specification: Cloud Resource Sync & In-Browser Editor

**Status:** Approved for Production  
**Author:** Antigravity Engineering Team  
**Last Updated:** August 2026  

---

## 1. Overview
The goal of this application is to empower users to browse their Google Drive resources, open any supported document format in-browser without external software, perform direct edits or visual markup, and persist the modifications back to Google Drive without risk of data corruption.

## 2. Core Capabilities
- **PDF Annotation & Sign-off**: Freehand pen, text callouts, shapes, highlights, and vector burning via \`pdf-lib\`.
- **Excel Spreadsheet Editing**: Multi-sheet grid manipulation, cell formula calculations, and native \`.xlsx\` binary output via SheetJS.
- **Image Markup Studio**: Drawing, arrows, highlights, cropping, and lossless PNG serialization.
- **Document / Text Editor**: Clean markdown and rich text editing with live formatting tools.

## 3. Data Integrity & Lossless Patch
When saving modified files back to Google Drive:
\`\`\`http
PATCH /upload/drive/v3/files/{fileId}?uploadType=multipart
Content-Type: multipart/related; boundary=-------314159265358979323846

[JSON Metadata Part]
[Raw Binary Payload Part]
\`\`\`

This ensures that binary encoding headers and streams are preserved exactly as compiled in-memory.

---
*Feel free to edit this document in real-time, modify sections, and click "Save to Drive" or "Download" to verify instant synchronization!*
`;

    return new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
  }
}

export const demoDataService = new DemoDataService();
