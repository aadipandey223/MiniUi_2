import { useCallback, useEffect, useState } from 'react';
import { Binary, Copy, Pause, Play, RefreshCw, X } from 'lucide-react';
import { bytesToHex } from '../lib/crypto.ts';
import { calculateShannonEntropy } from '../lib/experience.ts';

interface EntropyModalProps {
  open: boolean;
  onClose: () => void;
  onCopyText: (value: string, label: string) => void;
}

export function EntropyModal({ open, onClose, onCopyText }: EntropyModalProps) {
  const [bytes, setBytes] = useState<Uint8Array>(() => new Uint8Array(64));
  const [streaming, setStreaming] = useState(true);
  const [entropyBits, setEntropyBits] = useState(0);
  const [buckets, setBuckets] = useState<number[]>(() => Array(16).fill(0));

  const sampleNow = useCallback(() => {
    const sample = new Uint8Array(256);
    crypto.getRandomValues(sample);
    setBytes(sample.slice(0, 64));
    setEntropyBits(calculateShannonEntropy(sample));
    const hist = Array(16).fill(0) as number[];
    for (let i = 0; i < sample.length; i++) {
      hist[sample[i] >> 4]++;
    }
    setBuckets(hist);
  }, []);

  useEffect(() => {
    if (!open) return;
    sampleNow();
    if (!streaming) return;
    const timer = window.setInterval(sampleNow, 900);
    return () => window.clearInterval(timer);
  }, [open, streaming, sampleNow]);

  if (!open) return null;

  const hexDump = bytesToHex(bytes).toUpperCase();
  const maxBucket = Math.max(...buckets, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="entropy-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-xl vb-panel-elevated overflow-hidden animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--vb-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Binary className="w-4 h-4 text-[var(--vb-verified)]" />
            <h2 id="entropy-modal-title" className="text-base font-semibold text-[var(--vb-ink)]">
              Live CSPRNG Entropy Inspector
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            aria-label="Close entropy inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Entropy Readout */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg vb-inset">
              <span className="text-xs text-[var(--vb-ink-muted)] block">Shannon Entropy</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-[var(--vb-verified)] mt-0.5 block">
                {entropyBits.toFixed(3)} <span className="text-xs font-normal text-[var(--vb-ink-muted)]">/ 8.000 bits</span>
              </span>
            </div>
            <div className="p-3.5 rounded-lg vb-inset">
              <span className="text-xs text-[var(--vb-ink-muted)] block">Entropy Source</span>
              <span className="font-mono text-sm font-medium text-[var(--vb-ink)] mt-1 block">
                crypto.getRandomValues
              </span>
            </div>
          </div>

          {/* 16-Bucket Nibble Distribution */}
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--vb-ink-muted)] mb-2">
              <span>High-Nibble Uniformity (0x0 – 0xF)</span>
              <span className="font-mono tabular-nums">256-byte window</span>
            </div>
            <div className="p-3 rounded-lg vb-inset grid grid-cols-16 gap-1.5 items-end h-24">
              {buckets.map((count, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    className="w-full rounded-xs bg-[var(--vb-accent)] transition-all duration-200"
                    style={{ height: `${Math.max(12, Math.round((count / maxBucket) * 100))}%`, opacity: 0.8 }}
                  />
                  <span className="font-mono text-[9px] text-[var(--vb-ink-muted)]">
                    {idx.toString(16).toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Hex Stream Preview */}
          <div>
            <span className="text-xs text-[var(--vb-ink-muted)] block mb-1.5">
              512-Bit Sample Block
            </span>
            <div className="p-3 rounded-lg vb-inset font-mono text-[11px] leading-relaxed tracking-wider text-[var(--vb-ink-2)] break-all select-all">
              {hexDump}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStreaming((s) => !s)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--vb-surface-2)] hover:bg-[var(--vb-surface-hover)] border border-[var(--vb-border)] text-xs font-medium text-[var(--vb-ink)] cursor-pointer"
              >
                {streaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {streaming ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={sampleNow}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--vb-border)] hover:bg-[var(--vb-surface-2)] text-xs font-medium text-[var(--vb-ink)] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Resample
              </button>
            </div>

            <button
              type="button"
              onClick={() => onCopyText(hexDump.slice(0, 64), '256-bit random hex seed')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-xs font-semibold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy 256-Bit Seed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
