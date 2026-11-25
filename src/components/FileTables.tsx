import { useMemo, useState } from 'react';
import {
  CheckSquare,
  Clock,
  Copy,
  Download,
  FolderOpen,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type { SharedFileMeta } from '../../shared/types.ts';
import type { LocalSharedFile } from '../hooks/useVaultBeam.ts';
import { formatBytes, formatCountdown, getFileKindLabel, maskSensitive } from '../lib/format.ts';
import { FileTypeIcon } from './FileTypeIcon.tsx';

interface FileTablesProps {
  mySharedFiles: LocalSharedFile[];
  remoteFiles: SharedFileMeta[];
  incognito: boolean;
  nowMs: number;
  inPrivateRoom: boolean;
  advancedMode?: boolean;
  onUnshareFile: (fileId: string) => void;
  onUnshareAll: () => void;
  onDownloadFile: (file: SharedFileMeta, priority: number) => void;
  onBatchDownload: (files: SharedFileMeta[], priority: number) => void;
  onCopyAppUrl: () => void;
}

export function FileTables({
  mySharedFiles,
  remoteFiles,
  incognito,
  nowMs,
  inPrivateRoom,
  advancedMode = false,
  onUnshareFile,
  onUnshareAll,
  onDownloadFile,
  onBatchDownload,
  onCopyAppUrl,
}: FileTablesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [priorities, setPriorities] = useState<Record<string, number>>({});

  const filteredRemoteFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return remoteFiles;
    return remoteFiles.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.peerName.toLowerCase().includes(q) ||
        getFileKindLabel(f.mimeType, f.name).toLowerCase().includes(q)
    );
  }, [remoteFiles, searchQuery]);

  const activeSelectedFiles = useMemo(
    () => filteredRemoteFiles.filter((f) => selectedIds.has(f.id)),
    [filteredRemoteFiles, selectedIds]
  );

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (activeSelectedFiles.length === filteredRemoteFiles.length && filteredRemoteFiles.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRemoteFiles.map((f) => f.id)));
    }
  };

  const handleBatchDownload = () => {
    if (activeSelectedFiles.length === 0) return;
    onBatchDownload(activeSelectedFiles, 5);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Available Files from Other Devices */}
      <section className="rounded-xl vb-panel overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--vb-border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--vb-ink)]" />
            <h2 className="text-sm font-semibold text-[var(--vb-ink)]">Files Ready to Download</h2>
            <span className="font-mono text-xs tabular-nums text-[var(--vb-ink-muted)]">
              · {remoteFiles.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {activeSelectedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDownload}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download ({activeSelectedFiles.length})
              </button>
            )}

            {remoteFiles.length > 0 && (
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 text-[var(--vb-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  aria-label="Search available files"
                  className="min-h-[36px] pl-8 pr-7 py-1.5 w-full sm:w-48 rounded-lg bg-[var(--vb-canvas)] border border-[var(--vb-border)] text-xs text-[var(--vb-ink)] placeholder:text-[var(--vb-ink-muted)] focus:outline-none focus:border-[var(--vb-accent)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {filteredRemoteFiles.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-[var(--vb-ink-2)]">
              {searchQuery
                ? 'No files match your search.'
                : inPrivateRoom
                  ? 'No files shared by anyone else in this room yet.'
                  : 'No files from other devices yet.'}
            </p>
            {!searchQuery && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-[var(--vb-ink-muted)]">
                <span>Open this link on another device or browser tab to send files back and forth.</span>
                <button
                  type="button"
                  onClick={onCopyAppUrl}
                  className="inline-flex items-center gap-1 text-[var(--vb-ink)] underline underline-offset-4 hover:opacity-80 font-medium cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy link
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Touch Card List (< md) */}
            <div className="md:hidden divide-y divide-[var(--vb-border)]/70">
              {filteredRemoteFiles.map((file) => {
                const countdown = formatCountdown(file.expiresAt, nowMs);
                const priority = priorities[file.id] ?? 5;
                const isSelected = selectedIds.has(file.id);
                return (
                  <div key={file.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(file.id)}
                        aria-label={`Select ${file.name}`}
                        className="mt-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-[var(--vb-ink-muted)] cursor-pointer"
                      >
                        <CheckSquare
                          className={`w-4 h-4 ${
                            isSelected ? 'text-[var(--vb-ink)]' : 'text-[var(--vb-border-strong)]'
                          }`}
                        />
                      </button>
                      <FileTypeIcon mimeType={file.mimeType} fileName={file.name} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--vb-ink)] truncate">
                          {maskSensitive(file.name, incognito, 'file')}
                        </div>
                        <div className="mt-1 text-xs text-[var(--vb-ink-muted)] font-mono tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{formatBytes(file.size)}</span>
                          <span>·</span>
                          <span>{maskSensitive(file.peerName, incognito, 'peer')}</span>
                          <span>·</span>
                          <span className={countdown.isUrgent ? 'text-[var(--vb-caution)]' : ''}>
                            {countdown.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pl-10">
                      {advancedMode && (
                        <select
                          aria-label={`Priority for ${file.name}`}
                          value={priority}
                          onChange={(e) =>
                            setPriorities((prev) => ({
                              ...prev,
                              [file.id]: Number(e.target.value),
                            }))
                          }
                          className="min-h-[44px] bg-[var(--vb-canvas)] border border-[var(--vb-border)] rounded-lg px-2.5 text-xs text-[var(--vb-ink-2)] focus:outline-none focus:border-[var(--vb-accent)]"
                        >
                          <option value={1}>Low</option>
                          <option value={5}>Normal</option>
                          <option value={10}>High</option>
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => onDownloadFile(file, priority)}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-xs font-medium text-[var(--vb-accent-ink)] transition-colors cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--vb-border)] text-[11px] font-medium text-[var(--vb-ink-muted)]">
                    <th className="py-2.5 pl-5 pr-2 w-9">
                      <input
                        type="checkbox"
                        checked={
                          filteredRemoteFiles.length > 0 &&
                          activeSelectedFiles.length === filteredRemoteFiles.length
                        }
                        onChange={toggleSelectAll}
                        aria-label="Select all available files"
                        className="rounded border-[var(--vb-border)] bg-[var(--vb-canvas)] accent-[var(--vb-accent)] cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3">File</th>
                    <th className="py-2.5 px-3">From</th>
                    <th className="py-2.5 px-3 text-right">Size</th>
                    <th className="py-2.5 px-3 text-right">Expires</th>
                    <th className="py-2.5 pl-3 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--vb-border)]/60 text-sm">
                  {filteredRemoteFiles.map((file) => {
                    const countdown = formatCountdown(file.expiresAt, nowMs);
                    const priority = priorities[file.id] ?? 5;
                    return (
                      <tr
                        key={file.id}
                        className="hover:bg-[var(--vb-surface-2)]/60 transition-colors duration-100"
                      >
                        <td className="py-3 pl-5 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(file.id)}
                            onChange={() => toggleSelect(file.id)}
                            aria-label={`Select ${file.name}`}
                            className="rounded border-[var(--vb-border)] bg-[var(--vb-canvas)] accent-[var(--vb-accent)] cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3 max-w-[260px]">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileTypeIcon mimeType={file.mimeType} fileName={file.name} size="sm" />
                            <div className="min-w-0">
                              <div
                                className="font-medium text-[var(--vb-ink)] truncate"
                                title={incognito ? undefined : file.name}
                              >
                                {maskSensitive(file.name, incognito, 'file')}
                              </div>
                              <div className="text-xs text-[var(--vb-ink-muted)] mt-0.5">
                                {getFileKindLabel(file.mimeType, file.name)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-[var(--vb-ink-2)] whitespace-nowrap">
                          <span>{maskSensitive(file.peerName, incognito, 'peer')}</span>
                          {advancedMode && file.peerFingerprint && (
                            <span className="font-mono text-[var(--vb-ink-muted)] ml-1.5">
                              #{file.peerFingerprint.slice(0, 6)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-[var(--vb-ink)] whitespace-nowrap">
                          {formatBytes(file.size)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap ${
                            countdown.isUrgent ? 'text-[var(--vb-caution)]' : 'text-[var(--vb-ink-2)]'
                          }`}
                        >
                          {countdown.label}
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {advancedMode && (
                              <select
                                aria-label={`Priority for ${file.name}`}
                                value={priority}
                                onChange={(e) =>
                                  setPriorities((prev) => ({
                                    ...prev,
                                    [file.id]: Number(e.target.value),
                                  }))
                                }
                                className="bg-[var(--vb-canvas)] border border-[var(--vb-border)] rounded-md px-2 py-1 text-xs text-[var(--vb-ink-2)] focus:outline-none focus:border-[var(--vb-accent)] cursor-pointer"
                              >
                                <option value={1}>Low</option>
                                <option value={5}>Normal</option>
                                <option value={10}>High</option>
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => onDownloadFile(file, priority)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-xs font-medium text-[var(--vb-accent-ink)] transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Your Shared Files */}
      <section className="rounded-xl vb-panel overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--vb-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[var(--vb-ink)]" />
            <h2 className="text-sm font-semibold text-[var(--vb-ink)]">Your Shared Files</h2>
            <span className="font-mono text-xs tabular-nums text-[var(--vb-ink-muted)]">
              · {mySharedFiles.length}
            </span>
          </div>

          {mySharedFiles.length > 0 && (
            <button
              type="button"
              onClick={onUnshareAll}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium text-[var(--vb-danger)] hover:bg-[var(--vb-danger-soft)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove All
            </button>
          )}
        </div>

        {mySharedFiles.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-[var(--vb-ink-2)]">
            Files you drop above appear here until they expire or you remove them.
          </div>
        ) : (
          <>
            {/* Mobile Cards (< md) */}
            <div className="md:hidden divide-y divide-[var(--vb-border)]/70">
              {mySharedFiles.map((entry) => {
                const countdown = formatCountdown(entry.meta.expiresAt, nowMs);
                return (
                  <div key={entry.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileTypeIcon mimeType={entry.meta.mimeType} fileName={entry.meta.name} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--vb-ink)] truncate">
                          {maskSensitive(entry.meta.name, incognito, 'file')}
                        </div>
                        <div className="mt-0.5 text-xs font-mono tabular-nums text-[var(--vb-ink-muted)] flex items-center gap-1.5">
                          <span>{formatBytes(entry.meta.size)}</span>
                          <span>·</span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              countdown.isUrgent ? 'text-[var(--vb-caution)]' : ''
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {countdown.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnshareFile(entry.id)}
                      aria-label={`Remove ${entry.meta.name}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--vb-ink-muted)] hover:text-[var(--vb-danger)] hover:bg-[var(--vb-danger-soft)] transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--vb-border)] text-[11px] font-medium text-[var(--vb-ink-muted)]">
                    <th className="py-2.5 pl-5 pr-3">File</th>
                    <th className="py-2.5 px-3 text-right">Size</th>
                    <th className="py-2.5 px-3 text-right">Expires In</th>
                    <th className="py-2.5 pl-3 pr-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--vb-border)]/60 text-sm">
                  {mySharedFiles.map((entry) => {
                    const countdown = formatCountdown(entry.meta.expiresAt, nowMs);
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-[var(--vb-surface-2)]/60 transition-colors duration-100"
                      >
                        <td className="py-3 pl-5 pr-3 max-w-[300px]">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileTypeIcon mimeType={entry.meta.mimeType} fileName={entry.meta.name} size="sm" />
                            <div className="min-w-0">
                              <div
                                className="font-medium text-[var(--vb-ink)] truncate"
                                title={incognito ? undefined : entry.meta.name}
                              >
                                {maskSensitive(entry.meta.name, incognito, 'file')}
                              </div>
                              <div className="text-xs text-[var(--vb-ink-muted)] mt-0.5">
                                {getFileKindLabel(entry.meta.mimeType, entry.meta.name)}
                                {' · '}
                                {entry.meta.roomId ? `Room ${entry.meta.roomId}` : 'Open Lobby'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-[var(--vb-ink)] whitespace-nowrap">
                          {formatBytes(entry.meta.size)}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap ${
                            countdown.isUrgent ? 'text-[var(--vb-caution)]' : 'text-[var(--vb-ink-2)]'
                          }`}
                        >
                          {countdown.label}
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onUnshareFile(entry.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-danger)] hover:bg-[var(--vb-danger-soft)] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
