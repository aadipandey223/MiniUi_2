import { useRef, useState } from 'react';
import { Clock, FolderUp, Lock, Upload } from 'lucide-react';

interface DropZoneProps {
  defaultExpiryMs: number;
  onChangeExpiryMs: (ms: number) => void;
  onFilesSelected: (files: File[]) => void;
  scopeLabel: string;
  zenMode?: boolean;
}

const EXPIRY_OPTIONS: { label: string; value: number }[] = [
  { label: '30 seconds', value: 30_000 },
  { label: '5 minutes', value: 300_000 },
  { label: '10 minutes', value: 600_000 },
  { label: '1 hour', value: 3_600_000 },
  { label: '24 hours', value: 86_400_000 },
  { label: 'No auto-delete', value: 0 },
];

export function DropZone({
  defaultExpiryMs,
  onChangeExpiryMs,
  onFilesSelected,
  scopeLabel,
  zenMode = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFileList = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFilesSelected(Array.from(list));
  };

  return (
    <section
      aria-label="Share files"
      className="rounded-xl vb-panel overflow-hidden"
    >
      {/* Clean Header Bar */}
      <div className="px-4 sm:px-5 py-3 border-b border-[var(--vb-border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--vb-ink-2)]">
          <Lock className="w-3.5 h-3.5 text-[var(--vb-ink)] shrink-0" />
          <span>
            Sharing to <span className="text-[var(--vb-ink)] font-medium">{scopeLabel}</span>
          </span>
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--vb-ink-2)]">
          <Clock className="w-3.5 h-3.5 text-[var(--vb-ink-muted)]" />
          <span className="whitespace-nowrap">Auto-delete after</span>
          <select
            value={defaultExpiryMs}
            onChange={(e) => onChangeExpiryMs(Number(e.target.value))}
            className="min-h-[34px] bg-[var(--vb-canvas)] border border-[var(--vb-border)] rounded-md px-2.5 py-1 text-xs font-mono text-[var(--vb-ink)] focus:outline-none focus:border-[var(--vb-accent)] cursor-pointer"
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Interactive Drop Area */}
      <div className="p-4 sm:p-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFileList(e.dataTransfer.files);
          }}
          className={`rounded-lg border border-dashed px-6 ${
            zenMode ? 'py-20 sm:py-28' : 'py-10 sm:py-12'
          } flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--vb-accent)] ${
            dragging
              ? 'border-[var(--vb-accent)] bg-[var(--vb-accent-soft)]'
              : 'border-[var(--vb-border-strong)] bg-[var(--vb-canvas)]/60 hover:bg-[var(--vb-surface-2)]/70'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFileList(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="w-11 h-11 rounded-lg border border-[var(--vb-border-strong)] bg-[var(--vb-surface)] flex items-center justify-center mb-3.5 text-[var(--vb-ink)]">
            {dragging ? <FolderUp className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
          </div>

          <h2 className="text-base sm:text-lg font-semibold text-[var(--vb-ink)]">
            {dragging ? 'Release to share files' : 'Drop files here, or browse your device'}
          </h2>

          <p className="text-xs sm:text-sm text-[var(--vb-ink-2)] mt-1.5 max-w-md leading-relaxed">
            Files stay on your device and stream directly to peers up to 2 GB each.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--vb-ink-muted)]">
            <span>Browser-encrypted</span>
            <span aria-hidden="true">·</span>
            <span>Integrity checked</span>
            <span aria-hidden="true">·</span>
            <span>Nothing stored online</span>
          </div>
        </div>
      </div>
    </section>
  );
}
