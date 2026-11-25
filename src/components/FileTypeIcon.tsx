import {
  FileArchive,
  FileBox,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { getFileKindLabel } from '../lib/format.ts';

interface FileTypeIconProps {
  mimeType?: string;
  fileName: string;
  size?: 'sm' | 'md';
}

export function FileTypeIcon({ mimeType = '', fileName, size = 'md' }: FileTypeIconProps) {
  const kind = getFileKindLabel(mimeType, fileName);
  const iconClass = size === 'sm' ? 'w-4 h-4 text-[var(--vb-ink-2)]' : 'w-4 h-4 text-[var(--vb-ink)]';
  const boxClass = size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-lg';

  const renderGlyph = () => {
    switch (kind) {
      case 'Image':
        return <ImageIcon className={iconClass} />;
      case 'Video':
        return <Film className={iconClass} />;
      case 'Audio':
        return <Music className={iconClass} />;
      case 'PDF':
        return <FileText className={iconClass} />;
      case 'Archive':
        return <FileArchive className={iconClass} />;
      case 'Code':
        return <FileCode2 className={iconClass} />;
      case 'Document':
        return <FileSpreadsheet className={iconClass} />;
      default:
        return <FileBox className={iconClass} />;
    }
  };

  return (
    <div
      className={`${boxClass} shrink-0 flex items-center justify-center bg-[var(--vb-surface-2)] border border-[var(--vb-border)]`}
      aria-hidden="true"
    >
      {renderGlyph()}
    </div>
  );
}
