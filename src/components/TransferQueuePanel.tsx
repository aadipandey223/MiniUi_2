import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronUp,
  GlobeLock,
  GripVertical,
  ListOrdered,
  Radio,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ActiveUpload, QueueItem, SchedulingAlgorithm } from '../../shared/types.ts';
import { formatBytes, formatSpeed, maskSensitive } from '../lib/format.ts';

interface TransferQueuePanelProps {
  queue: QueueItem[];
  activeUploads: ActiveUpload[];
  schedulingAlgorithm: SchedulingAlgorithm;
  incognito: boolean;
  showSchedulerControls?: boolean;
  onChangeAlgorithm: (algo: SchedulingAlgorithm) => void;
  onBoostItem: (queueId: string) => void;
  onCancelItem: (queueId: string) => void;
  onReorderWaiting: (draggedId: string, targetId: string) => void;
}

const ALGORITHMS: { id: SchedulingAlgorithm; label: string; hint: string }[] = [
  { id: 'FCFS', label: 'First In', hint: 'First Come, First Served (FCFS)' },
  { id: 'SJF', label: 'Smallest', hint: 'Shortest Job First (SJF)' },
  { id: 'Priority', label: 'Priority', hint: 'Highest priority first' },
];

export function TransferQueuePanel({
  queue,
  activeUploads,
  schedulingAlgorithm,
  incognito,
  showSchedulerControls = true,
  onChangeAlgorithm,
  onBoostItem,
  onCancelItem,
  onReorderWaiting,
}: TransferQueuePanelProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const runningCount = queue.filter((q) => q.status === 'running' || q.status === 'verifying').length;
  const waitingCount = queue.filter((q) => q.status === 'waiting').length;
  const totalActive = runningCount + activeUploads.length;

  return (
    <section className="rounded-xl vb-panel overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--vb-border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-[var(--vb-ink)]" />
          <h2 className="text-sm font-semibold text-[var(--vb-ink)]">
            {showSchedulerControls ? 'Transfer Queue' : 'Active Transfers'}
          </h2>
          <span className="font-mono text-xs tabular-nums text-[var(--vb-ink-muted)]">
            · {totalActive} active · {waitingCount} waiting
          </span>
        </div>

        {showSchedulerControls && (
          <div
            className="inline-flex items-center p-0.5 rounded-lg vb-inset"
            role="group"
            aria-label="Queue order policy"
          >
            {ALGORITHMS.map((algo) => {
              const active = schedulingAlgorithm === algo.id;
              return (
                <button
                  key={algo.id}
                  type="button"
                  title={algo.hint}
                  onClick={() => onChangeAlgorithm(algo.id)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-[var(--vb-accent)] text-[var(--vb-accent-ink)]'
                      : 'text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)]'
                  }`}
                >
                  {algo.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {queue.length === 0 && activeUploads.length === 0 ? (
        <div className="px-6 py-9 text-center text-sm text-[var(--vb-ink-2)]">
          No active transfers right now. Click Download on any available file to add it to the queue.
        </div>
      ) : (
        <div className="divide-y divide-[var(--vb-border)]/70">
          {/* Active Uploads */}
          {activeUploads.map((upload) => (
            <div key={upload.transferId} className="px-4 sm:px-5 py-3.5 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-[var(--vb-surface-2)] border border-[var(--vb-border)] flex items-center justify-center text-[var(--vb-ink)] shrink-0">
                <ArrowUp className="w-4 h-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--vb-ink)] truncate">
                    {maskSensitive(upload.fileName, incognito, 'file')}
                  </span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--vb-ink)] shrink-0">
                    {Math.round(upload.progress)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--vb-surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--vb-accent)] transition-all duration-150"
                    style={{ width: `${Math.min(100, upload.progress)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vb-ink-2)] font-mono tabular-nums">
                  <span>
                    Sending · {formatBytes(upload.bytesSent)} / {formatBytes(upload.fileSize)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {upload.transport === 'webrtc' ? (
                      <Radio className="w-3 h-3 text-[var(--vb-ink-2)]" />
                    ) : (
                      <GlobeLock className="w-3 h-3 text-[var(--vb-ink-2)]" />
                    )}
                    {formatSpeed(upload.speedBytesPerSec)} · {upload.transport === 'webrtc' ? 'Direct' : 'Relay'}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Scheduled Downloads */}
          {queue.map((item) => {
            const isWaiting = item.status === 'waiting';
            const isVerifying = item.status === 'verifying';
            const isDragTarget = dragOverId === item.queueId && draggedId !== item.queueId;

            return (
              <div
                key={item.queueId}
                draggable={isWaiting && showSchedulerControls}
                onDragStart={() => isWaiting && showSchedulerControls && setDraggedId(item.queueId)}
                onDragOver={(e) => {
                  if (!isWaiting || !draggedId) return;
                  e.preventDefault();
                  setDragOverId(item.queueId);
                }}
                onDragLeave={() => {
                  if (dragOverId === item.queueId) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (isWaiting && draggedId) {
                    onReorderWaiting(draggedId, item.queueId);
                  }
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`px-4 sm:px-5 py-3.5 flex items-center gap-3 transition-colors duration-150 ${
                  isDragTarget ? 'bg-[var(--vb-accent-soft)]' : 'hover:bg-[var(--vb-surface-2)]/50'
                }`}
              >
                {showSchedulerControls && (
                  isWaiting ? (
                    <div
                      className="hidden sm:block text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] cursor-grab active:cursor-grabbing shrink-0"
                      title="Drag to reorder waiting queue"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="hidden sm:block w-4 shrink-0" />
                  )
                )}

                <div className="w-9 h-9 rounded-lg bg-[var(--vb-surface-2)] border border-[var(--vb-border)] flex items-center justify-center text-[var(--vb-ink)] shrink-0">
                  {isVerifying ? (
                    <ShieldCheck className="w-4 h-4 text-[var(--vb-verified)]" />
                  ) : (
                    <ArrowDown className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--vb-ink)] truncate">
                      {maskSensitive(item.file.name, incognito, 'file')}
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-[var(--vb-ink)] shrink-0">
                      {isWaiting
                        ? showSchedulerControls
                          ? `P${item.priority}`
                          : 'Waiting'
                        : isVerifying
                          ? 'Verifying...'
                          : `${Math.round(item.progress)}%`}
                    </span>
                  </div>

                  {!isWaiting && (
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--vb-surface-2)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--vb-accent)] transition-all duration-150"
                        style={{ width: `${Math.min(100, item.progress)}%` }}
                      />
                    </div>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vb-ink-2)] font-mono tabular-nums">
                    <span>
                      {formatBytes(item.file.size)}
                      {' · '}
                      {isWaiting
                        ? 'Waiting in line'
                        : isVerifying
                          ? 'Checking file integrity'
                          : `${formatBytes(item.bytesTransferred)} received`}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {!isWaiting &&
                        (item.transport === 'relay' ? (
                          <GlobeLock className="w-3 h-3 text-[var(--vb-ink-2)]" />
                        ) : (
                          <Radio className="w-3 h-3 text-[var(--vb-ink-2)]" />
                        ))}
                      {isWaiting
                        ? showSchedulerControls
                          ? `Priority ${item.priority}`
                          : 'Queued'
                        : `${formatSpeed(item.speedBytesPerSec)} · ${item.transport === 'relay' ? 'Relay' : 'Direct'}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isWaiting && showSchedulerControls && (
                    <button
                      type="button"
                      onClick={() => onBoostItem(item.queueId)}
                      title="Move to front of queue"
                      aria-label="Move to front of queue"
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] transition-colors cursor-pointer"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onCancelItem(item.queueId)}
                    title="Cancel transfer"
                    aria-label="Cancel transfer"
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[var(--vb-ink-2)] hover:text-[var(--vb-danger)] hover:bg-[var(--vb-danger-soft)] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
