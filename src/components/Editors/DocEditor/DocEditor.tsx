import React, { useState, useEffect, useRef } from 'react';
import { 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  List, 
  Code, 
  Quote, 
  Search, 
  Eye, 
  Edit3, 
  Columns,
  Sparkles
} from 'lucide-react';
import { DriveFile } from '../../../types';

interface DocEditorProps {
  file: DriveFile;
  arrayBuffer: ArrayBuffer;
  onModify: (newBlob: Blob) => void;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

export const DocEditor: React.FC<DocEditorProps> = ({
  file,
  arrayBuffer,
  onModify,
  onHasUnsavedChanges,
}) => {
  const [content, setContent] = useState<string>('');
  const [viewMode, setViewMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [showFindReplace, setShowFindReplace] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Decode array buffer to text
  useEffect(() => {
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(arrayBuffer);
      setContent(text);
    } catch (err) {
      console.error('Failed to decode document text:', err);
    }
  }, [arrayBuffer]);

  const handleContentChange = (newText: string) => {
    setContent(newText);
    onHasUnsavedChanges(true);

    const encoder = new TextEncoder();
    const encoded = encoder.encode(newText);
    const blob = new Blob([encoded], { type: file.mimeType || 'text/plain;charset=utf-8' });
    onModify(blob);
  };

  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const replacement = `${prefix}${selectedText || 'text'}${suffix}`;

    const updated = content.substring(0, start) + replacement + content.substring(end);
    handleContentChange(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selectedText.length || 4));
    }, 50);
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const updated = content.replaceAll(searchQuery, replaceQuery);
    handleContentChange(updated);
  };

  // Word and character count
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="editor-container">
      {/* Doc Sub-Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button className="tool-button" onClick={() => insertFormatting('**', '**')} title="Bold">
            <Bold size={15} />
          </button>
          <button className="tool-button" onClick={() => insertFormatting('*', '*')} title="Italic">
            <Italic size={15} />
          </button>
          <button className="tool-button" onClick={() => insertFormatting('# ', '')} title="Heading 1">
            <Heading1 size={15} />
          </button>
          <button className="tool-button" onClick={() => insertFormatting('## ', '')} title="Heading 2">
            <Heading2 size={15} />
          </button>
          <button className="tool-button" onClick={() => insertFormatting('- ', '')} title="Bullet List">
            <List size={15} />
          </button>
          <button className="tool-button" onClick={() => insertFormatting('```\n', '\n```')} title="Code Block">
            <Code size={15} />
          </button>
          <button className="tool-button" onClick={() => insertFormatting('> ', '')} title="Quote">
            <Quote size={15} />
          </button>
        </div>

        <div className="tool-divider" />

        {/* Find & Replace Toggle */}
        <div className="toolbar-group">
          <button
            className={`tool-button ${showFindReplace ? 'active' : ''}`}
            onClick={() => setShowFindReplace((v) => !v)}
            title="Find & Replace"
          >
            <Search size={15} />
            <span>Find & Replace</span>
          </button>
        </div>

        {/* View Mode Switcher */}
        <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
          <button
            className={`tool-button ${viewMode === 'edit' ? 'active' : ''}`}
            onClick={() => setViewMode('edit')}
            title="Editor Only"
          >
            <Edit3 size={15} />
          </button>
          <button
            className={`tool-button ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
            title="Split View"
          >
            <Columns size={15} />
          </button>
          <button
            className={`tool-button ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => setViewMode('preview')}
            title="Preview Only"
          >
            <Eye size={15} />
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {wordCount} words | {charCount} chars
          </span>
        </div>
      </div>

      {/* Find & Replace Bar */}
      {showFindReplace && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0.5rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <input
            type="text"
            placeholder="Find text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '200px' }}
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            style={{ width: '200px' }}
          />
          <button className="btn-primary" onClick={handleReplaceAll} style={{ padding: '0.35rem 0.75rem' }}>
            Replace All
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor Area */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            style={{
              flex: viewMode === 'split' ? '1 1 50%' : '1 1 100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRight: viewMode === 'split' ? '1px solid var(--border-subtle)' : 'none',
            }}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start typing your document..."
              style={{
                flex: 1,
                width: '100%',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '1.5rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                lineHeight: '1.6',
                resize: 'none',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Live Preview Area */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            style={{
              flex: viewMode === 'split' ? '1 1 50%' : '1 1 100%',
              height: '100%',
              overflowY: 'auto',
              padding: '2rem',
              background: 'var(--bg-secondary)',
            }}
          >
            <div style={{ maxWidth: '750px', margin: '0 auto', lineHeight: '1.7' }}>
              {content.split('\n').map((line, idx) => {
                if (line.startsWith('# ')) {
                  return <h1 key={idx} style={{ margin: '1.25rem 0 0.75rem', fontSize: '1.8rem', color: '#60a5fa' }}>{line.replace('# ', '')}</h1>;
                }
                if (line.startsWith('## ')) {
                  return <h2 key={idx} style={{ margin: '1.1rem 0 0.5rem', fontSize: '1.4rem', color: '#93c5fd' }}>{line.replace('## ', '')}</h2>;
                }
                if (line.startsWith('### ')) {
                  return <h3 key={idx} style={{ margin: '1rem 0 0.5rem', fontSize: '1.2rem', color: '#bfdbfe' }}>{line.replace('### ', '')}</h3>;
                }
                if (line.startsWith('- ')) {
                  return <li key={idx} style={{ marginLeft: '1.5rem', color: 'var(--text-primary)' }}>{line.replace('- ', '')}</li>;
                }
                if (line.startsWith('> ')) {
                  return (
                    <blockquote
                      key={idx}
                      style={{
                        borderLeft: '3px solid #3b82f6',
                        paddingLeft: '1rem',
                        color: 'var(--text-secondary)',
                        margin: '0.75rem 0',
                        fontStyle: 'italic',
                      }}
                    >
                      {line.replace('> ', '')}
                    </blockquote>
                  );
                }
                if (line.trim() === '---') {
                  return <hr key={idx} style={{ borderColor: 'var(--border-subtle)', margin: '1.5rem 0' }} />;
                }
                if (!line.trim()) {
                  return <div key={idx} style={{ height: '0.75rem' }} />;
                }
                return (
                  <p key={idx} style={{ margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
