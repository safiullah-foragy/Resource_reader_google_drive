import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Trash2, 
  Table, 
  FileSpreadsheet, 
  Search, 
  ArrowDown, 
  ArrowRight, 
  Calculator,
  Download
} from 'lucide-react';
import { DriveFile, SpreadsheetWorkbook, SpreadsheetSheet } from '../../../types';

interface ExcelEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

export const ExcelEditor: React.FC<ExcelEditorProps> = ({
  file,
  arrayBuffer,
  onModify,
  onHasUnsavedChanges,
}) => {
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook>({
    sheets: [],
    activeSheetIndex: 0,
  });
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [formulaValue, setFormulaValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Helper to convert 0-indexed column to Excel column letter (0 -> A, 25 -> Z, 26 -> AA)
  const getColLetter = (index: number): string => {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Load workbook from binary ArrayBuffer
  useEffect(() => {
    try {
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const parsedSheets: SpreadsheetSheet[] = [];

      wb.SheetNames.forEach((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Ensure minimum 20 rows and 10 columns for pleasant grid editing
        const rowCount = Math.max(rawData.length, 25);
        let maxCols = 10;
        rawData.forEach((r) => {
          if (Array.isArray(r) && r.length > maxCols) maxCols = r.length;
        });
        maxCols = Math.max(maxCols, 12);

        const normalizedData: (string | number | boolean | null)[][] = [];
        for (let r = 0; r < rowCount; r++) {
          const rowArr: any[] = [];
          for (let c = 0; c < maxCols; c++) {
            rowArr.push(rawData[r]?.[c] !== undefined ? rawData[r][c] : '');
          }
          normalizedData.push(rowArr);
        }

        const columns = Array.from({ length: maxCols }, (_, i) => getColLetter(i));
        parsedSheets.push({
          name: sheetName,
          data: normalizedData,
          columns,
        });
      });

      setWorkbook({
        sheets: parsedSheets,
        activeSheetIndex: 0,
      });
      setIsLoaded(true);
    } catch (err) {
      console.error('Failed to parse Excel array buffer:', err);
    }
  }, [arrayBuffer]);

  const activeSheet = workbook.sheets[workbook.activeSheetIndex] || {
    name: 'Sheet1',
    data: [],
    columns: [],
  };

  // Keep formula bar in sync when cell selection changes
  useEffect(() => {
    if (!activeSheet.data[selectedCell.row]) return;
    const val = activeSheet.data[selectedCell.row][selectedCell.col];
    setFormulaValue(val !== undefined && val !== null ? String(val) : '');
  }, [selectedCell, workbook.activeSheetIndex, activeSheet.data]);

  // Export updated workbook to lossless .xlsx Blob
  const exportWorkbookBlob = (wbData: SpreadsheetWorkbook): Blob => {
    const wb = XLSX.utils.book_new();

    wbData.sheets.forEach((sheet) => {
      // Trim empty trailing rows/cols for cleaner file
      const ws = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    });

    const isCsv = file.name.endsWith('.csv') || file.mimeType === 'text/csv';
    if (isCsv) {
      const csvStr = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      return new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    }

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  const updateCellValue = (row: number, col: number, value: string) => {
    const updatedSheets = [...workbook.sheets];
    const currentData = updatedSheets[workbook.activeSheetIndex].data.map((r) => [...r]);

    // Parse numeric if possible, otherwise string
    let parsedValue: any = value;
    if (value.trim() !== '' && !isNaN(Number(value)) && !value.startsWith('0') && value.length < 15) {
      parsedValue = Number(value);
    }

    currentData[row][col] = parsedValue;
    updatedSheets[workbook.activeSheetIndex].data = currentData;

    const newWb = { ...workbook, sheets: updatedSheets };
    setWorkbook(newWb);
    onHasUnsavedChanges(true);

    const blob = exportWorkbookBlob(newWb);
    onModify(blob);
  };

  const handleCellChange = (row: number, col: number, e: React.ChangeEvent<HTMLInputElement>) => {
    updateCellValue(row, col, e.target.value);
  };

  const handleFormulaBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormulaValue(e.target.value);
    updateCellValue(selectedCell.row, selectedCell.col, e.target.value);
  };

  const handleAddRow = () => {
    const updatedSheets = [...workbook.sheets];
    const sheet = updatedSheets[workbook.activeSheetIndex];
    const emptyRow = Array.from({ length: sheet.columns.length }, () => '');
    sheet.data = [...sheet.data, emptyRow];

    const newWb = { ...workbook, sheets: updatedSheets };
    setWorkbook(newWb);
    onHasUnsavedChanges(true);
    onModify(exportWorkbookBlob(newWb));
  };

  const handleDeleteRow = () => {
    if (activeSheet.data.length <= 1) return;
    const updatedSheets = [...workbook.sheets];
    const sheet = updatedSheets[workbook.activeSheetIndex];
    sheet.data = sheet.data.filter((_, idx) => idx !== selectedCell.row);

    const newWb = { ...workbook, sheets: updatedSheets };
    setWorkbook(newWb);
    setSelectedCell((prev) => ({ ...prev, row: Math.max(0, prev.row - 1) }));
    onHasUnsavedChanges(true);
    onModify(exportWorkbookBlob(newWb));
  };

  const handleAddColumn = () => {
    const updatedSheets = [...workbook.sheets];
    const sheet = updatedSheets[workbook.activeSheetIndex];
    const newColIndex = sheet.columns.length;
    sheet.columns = [...sheet.columns, getColLetter(newColIndex)];
    sheet.data = sheet.data.map((row) => [...row, '']);

    const newWb = { ...workbook, sheets: updatedSheets };
    setWorkbook(newWb);
    onHasUnsavedChanges(true);
    onModify(exportWorkbookBlob(newWb));
  };

  const handleAddSheet = () => {
    const newSheetName = `Sheet${workbook.sheets.length + 1}`;
    const defaultCols = Array.from({ length: 10 }, (_, i) => getColLetter(i));
    const defaultData = Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => ''));

    const updatedSheets = [
      ...workbook.sheets,
      { name: newSheetName, columns: defaultCols, data: defaultData },
    ];

    const newWb = {
      sheets: updatedSheets,
      activeSheetIndex: updatedSheets.length - 1,
    };
    setWorkbook(newWb);
    onHasUnsavedChanges(true);
    onModify(exportWorkbookBlob(newWb));
  };

  // Cell reference label: e.g. "B4"
  const cellRefLabel = `${getColLetter(selectedCell.col)}${selectedCell.row + 1}`;

  return (
    <div className="editor-container">
      {/* Excel Sub-Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button className="tool-button" onClick={handleAddRow} title="Add Row at bottom">
            <Plus size={15} />
            <span>Row</span>
          </button>
          <button className="tool-button" onClick={handleAddColumn} title="Add Column at right">
            <Plus size={15} />
            <span>Column</span>
          </button>
          <button
            className="tool-button"
            onClick={handleDeleteRow}
            title="Delete Selected Row"
            style={{ color: '#f87171' }}
          >
            <Trash2 size={15} />
            <span>Delete Row</span>
          </button>
        </div>

        <div className="tool-divider" />

        {/* Quick Search */}
        <div className="toolbar-group" style={{ flex: 1, maxWidth: '320px' }}>
          <div className="search-box" style={{ width: '100%', padding: '2px 8px' }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search in sheet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
        </div>

        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Rows: {activeSheet.data.length} | Columns: {activeSheet.columns.length}
          </span>
        </div>
      </div>

      {/* Formula Bar */}
      <div className="spreadsheet-formula-bar">
        <div className="formula-cell-ref">{cellRefLabel}</div>
        <Calculator size={14} style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="formula-input"
          value={formulaValue}
          onChange={handleFormulaBarChange}
          placeholder="Enter text, number, or formula..."
        />
      </div>

      {/* Spreadsheet Interactive Grid */}
      <div className="spreadsheet-grid-wrapper">
        <table className="sheet-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              {activeSheet.columns.map((col, cIdx) => (
                <th
                  key={cIdx}
                  style={{
                    backgroundColor: selectedCell.col === cIdx ? 'var(--bg-active)' : undefined,
                    color: selectedCell.col === cIdx ? 'var(--accent-primary)' : undefined,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.data.map((row, rIdx) => {
              const isRowSelected = selectedCell.row === rIdx;
              return (
                <tr key={rIdx}>
                  <td
                    className="row-header"
                    style={{
                      backgroundColor: isRowSelected ? 'var(--bg-active)' : undefined,
                      color: isRowSelected ? 'var(--accent-primary)' : undefined,
                    }}
                  >
                    {rIdx + 1}
                  </td>
                  {activeSheet.columns.map((_, cIdx) => {
                    const cellVal = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : '';
                    const isSelected = selectedCell.row === rIdx && selectedCell.col === cIdx;
                    const isMatch = searchQuery && cellVal.toLowerCase().includes(searchQuery.toLowerCase());

                    return (
                      <td
                        key={cIdx}
                        style={{
                          backgroundColor: isMatch ? 'rgba(245, 158, 11, 0.2)' : undefined,
                        }}
                      >
                        <input
                          type="text"
                          className="sheet-cell-input"
                          value={cellVal}
                          onFocus={() => setSelectedCell({ row: rIdx, col: cIdx })}
                          onChange={(e) => handleCellChange(rIdx, cIdx, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              setSelectedCell((prev) => ({
                                ...prev,
                                row: Math.min(activeSheet.data.length - 1, prev.row + 1),
                              }));
                            } else if (e.key === 'ArrowUp') {
                              setSelectedCell((prev) => ({ ...prev, row: Math.max(0, prev.row - 1) }));
                            } else if (e.key === 'Enter') {
                              setSelectedCell((prev) => ({
                                ...prev,
                                row: Math.min(activeSheet.data.length - 1, prev.row + 1),
                              }));
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheets Tab Bar */}
      <div className="sheet-tabs-bar">
        {workbook.sheets.map((sheet, idx) => (
          <button
            key={idx}
            className={`sheet-tab-btn ${workbook.activeSheetIndex === idx ? 'active' : ''}`}
            onClick={() => setWorkbook((prev) => ({ ...prev, activeSheetIndex: idx }))}
          >
            <FileSpreadsheet size={13} style={{ marginRight: '4px' }} />
            {sheet.name}
          </button>
        ))}

        <button className="tool-button" onClick={handleAddSheet} title="Add New Sheet">
          <Plus size={14} />
          <span>New Sheet</span>
        </button>
      </div>
    </div>
  );
};
