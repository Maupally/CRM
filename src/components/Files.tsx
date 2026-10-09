import { useRef, useState } from 'react';
import { FileText, FileImage, FileCode, File as FileIcon, Download, ExternalLink, StickyNote } from 'lucide-react';
import type { KnowledgeItem } from '../../shared/domain';

export const fileUrl = (id: number, inline = false) => `/api/knowledge/${id}/file${inline ? '?inline=1' : ''}`;

export function fileSize(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileKindIcon({ mime, size = 18 }: { mime: string; size?: number }) {
  if (!mime) return <StickyNote size={size} />;
  if (mime.startsWith('image/')) return <FileImage size={size} />;
  if (mime.includes('html')) return <FileCode size={size} />;
  if (mime.includes('pdf') || mime.startsWith('text/') || mime.includes('word')) return <FileText size={size} />;
  return <FileIcon size={size} />;
}

/** A knowledge-base file: open it in the browser or download it. */
export function FileCard({ f, onOpen }: { f: KnowledgeItem; onOpen?: () => void }) {
  const previewable = f.hasFile && /^(image\/|application\/pdf|text\/)/.test(f.mime);
  return (
    <div className="file-card">
      <span className="type-ic"><FileKindIcon mime={f.hasFile ? f.mime : ''} /></span>
      <button className="grow file-name" onClick={onOpen} disabled={!onOpen} title={f.title}>
        <span className="trunc" style={{ display: 'block', fontWeight: 600 }}>{f.title}</span>
        <span className="small soft trunc" style={{ display: 'block' }}>{[f.filename, fileSize(f.size)].filter(Boolean).join(' · ') || 'notatka'}</span>
      </button>
      {f.hasFile && previewable && <a className="btn sm ghost icon" href={fileUrl(f.id, true)} target="_blank" rel="noreferrer" aria-label="Otwórz"><ExternalLink size={15} /></a>}
      {f.hasFile && <a className="btn sm ghost icon" href={fileUrl(f.id)} aria-label="Pobierz"><Download size={15} /></a>}
    </div>
  );
}

/**
 * Drag and drop files onto an area. Spread `props` on the element (it needs `position: relative`
 * via the `drop-zone` class); `over` is true while files hover above it.
 */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
  const props = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e) || disabled) return; e.preventDefault(); depth.current++; setOver(true); },
    onDragOver: (e: React.DragEvent) => { if (!hasFiles(e) || disabled) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      depth.current = 0; setOver(false);
      if (!disabled && e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
    },
  };
  return { over, props };
}
