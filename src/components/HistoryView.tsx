import { ArrowDown, ArrowUp, GlobeLock, History, Radio, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { TransferHistoryEntry } from '../../shared/types.ts';
import { formatBytes, formatDuration, formatSpeed, maskSensitive } from '../lib/format.ts';
import { FileTypeIcon } from './FileTypeIcon.tsx';

interface HistoryViewProps {
  history: TransferHistoryEntry[];
  incognito: boolean;
}

export function HistoryView({ history, incognito }: HistoryViewProps) {
  return (
    <section className="rounded-xl vb-panel overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--vb-border)] flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <History className="w-4 h-4 text-[var(--vb-accent)] mt-0.5 shrink-0" />
          <div>
            <h1 className="text-base font-semibold text-[var(--vb-ink)]">Transfer History</h1>
            <p className="text-xs text-[var(--vb-ink-2)] mt-0.5">
              Session log of completed and failed encrypted transfers with SHA-256 and ECDSA verification outcomes.
            </p>
          </div>
        </div>
        <span className="font-mono text-xs tabular-nums text-[var(--vb-ink-muted)] shrink-0">
          {history.length} {history.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {history.length === 0 ? (
        <div className="px-6 py-14 text-center text-sm text-[var(--vb-ink-2)]">
          No completed transfers in this session yet. Uploads and verified downloads appear here automatically.
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (<md) */}
          <div className="md:hidden divide-y divide-[var(--vb-border)]/70">
            {history.map((entry) => (
              <div key={entry.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileTypeIcon fileName={entry.fileName} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--vb-ink)] truncate">
                        {maskSensitive(entry.fileName, incognito, 'file')}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-[var(--vb-ink-muted)] mt-0.5">
                        {formatBytes(entry.size)} · {new Date(entry.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {entry.status === 'completed' && entry.verified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vb-verified)] shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verified
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vb-danger)] shrink-0"
                      title={entry.error}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {entry.error ? 'Failed' : 'Unverified'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vb-ink-2)] pt-1">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      entry.direction === 'upload'
                        ? 'text-[var(--vb-accent)]'
                        : 'text-[var(--vb-verified)]'
                    }`}
                  >
                    {entry.direction === 'upload' ? (
                      <ArrowUp className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5" />
                    )}
                    {entry.direction === 'upload' ? 'Upload' : 'Download'}
                  </span>

                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--vb-ink-muted)]">
                    {entry.transport === 'webrtc' ? (
                      <Radio className="w-3 h-3 text-[var(--vb-verified)]" />
                    ) : (
                      <GlobeLock className="w-3 h-3 text-[var(--vb-accent)]" />
                    )}
                    {entry.transport === 'webrtc' ? 'WebRTC' : 'Relay'} ·{' '}
                    {entry.status === 'completed' ? formatSpeed(entry.avgSpeedBytesPerSec) : '—'} ·{' '}
                    {formatDuration(entry.durationSec)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Precision Table (>=md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--vb-border)] text-[11px] font-medium text-[var(--vb-ink-muted)]">
                  <th className="py-2.5 pl-5 pr-3">File</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Avg Speed</th>
                  <th className="py-2.5 px-3">Transport</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--vb-border)]/60 text-sm">
                {history.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[var(--vb-surface-2)]/55 transition-colors">
                    <td className="py-3 pl-5 pr-3 max-w-[260px]">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileTypeIcon fileName={entry.fileName} />
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--vb-ink)] truncate">
                            {maskSensitive(entry.fileName, incognito, 'file')}
                          </div>
                          <div className="text-xs text-[var(--vb-ink-muted)] font-mono tabular-nums mt-0.5">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                            {entry.algorithm ? ` · ${entry.algorithm}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          entry.direction === 'upload'
                            ? 'text-[var(--vb-accent)]'
                            : 'text-[var(--vb-verified)]'
                        }`}
                      >
                        {entry.direction === 'upload' ? (
                          <ArrowUp className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5" />
                        )}
                        {entry.direction === 'upload' ? 'Upload' : 'Download'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-[var(--vb-ink)] whitespace-nowrap">
                      {formatBytes(entry.size)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-[var(--vb-ink-2)] whitespace-nowrap">
                      {formatDuration(entry.durationSec)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-[var(--vb-ink)] whitespace-nowrap">
                      {entry.status === 'completed' ? formatSpeed(entry.avgSpeedBytesPerSec) : '—'}
                    </td>
                    <td className="py-3 px-3 text-xs font-mono text-[var(--vb-ink-2)] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {entry.transport === 'webrtc' ? (
                          <Radio className="w-3.5 h-3.5 text-[var(--vb-verified)]" />
                        ) : (
                          <GlobeLock className="w-3.5 h-3.5 text-[var(--vb-accent)]" />
                        )}
                        {entry.transport === 'webrtc' ? 'WebRTC Direct' : 'E2E Relay'}
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                      {entry.status === 'completed' && entry.verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vb-verified)]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vb-danger)]"
                          title={entry.error}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {entry.error ? 'Failed' : 'Unverified'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
