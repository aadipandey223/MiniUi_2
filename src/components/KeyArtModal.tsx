import { useMemo, useState } from 'react';
import { Check, Copy, Fingerprint, Radio, ShieldCheck, X } from 'lucide-react';
import type { LocalCryptoIdentity } from '../lib/crypto.ts';
import { buildKeyArtGrid, playSubtleChime } from '../lib/experience.ts';

interface KeyArtModalProps {
  open: boolean;
  identity: LocalCryptoIdentity | null;
  displayName: string;
  soundEnabled: boolean;
  onClose: () => void;
  onCopyText: (value: string, label: string) => void;
}

export function KeyArtModal({
  open,
  identity,
  displayName,
  soundEnabled,
  onClose,
  onCopyText,
}: KeyArtModalProps) {
  const [pulseCount, setPulseCount] = useState(0);
  const [copiedFp, setCopiedFp] = useState(false);

  const cells = useMemo(
    () => buildKeyArtGrid(identity?.signingPublicKeyBase64 || 'vaultbeam-init'),
    [identity?.signingPublicKeyBase64]
  );

  if (!open) return null;

  const triggerHandshakePulse = () => {
    setPulseCount((c) => c + 1);
    playSubtleChime('pulse', soundEnabled);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-art-title"
    >
      <div
        className="w-full max-w-md rounded-xl vb-panel-elevated overflow-hidden animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--vb-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="w-4 h-4 text-[var(--vb-accent)]" />
            <h2 id="key-art-title" className="text-base font-semibold text-[var(--vb-ink)]">
              Cryptographic Identity Sigil
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            aria-label="Close identity sigil modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Interactive Deterministic Geometric Sigil */}
          <div className="relative flex flex-col items-center justify-center py-4 rounded-xl vb-inset overflow-hidden">
            {pulseCount > 0 && (
              <div
                key={pulseCount}
                className="pointer-events-none absolute w-40 h-40 rounded-full border border-[var(--vb-accent)] animate-vb-ring"
              />
            )}

            <svg
              width="162"
              height="162"
              viewBox="0 0 162 162"
              className="relative z-10"
              aria-label={`Visual randomart fingerprint for ${identity?.fingerprint || 'session'}`}
            >
              {cells.map((cell) => {
                const x = cell.col * 18 + 2;
                const y = cell.row * 18 + 2;
                if (cell.intensity === 0) {
                  return (
                    <rect
                      key={`${cell.row}-${cell.col}`}
                      x={x + 5}
                      y={y + 5}
                      width="4"
                      height="4"
                      rx="1"
                      fill="var(--vb-border)"
                      opacity="0.55"
                    />
                  );
                }
                const fill =
                  cell.intensity === 3
                    ? 'var(--vb-accent)'
                    : cell.intensity === 2
                      ? 'var(--vb-verified)'
                      : 'var(--vb-ink-2)';
                const opacity = cell.intensity === 3 ? 0.95 : cell.intensity === 2 ? 0.65 : 0.35;
                return (
                  <rect
                    key={`${cell.row}-${cell.col}`}
                    x={x}
                    y={y}
                    width="14"
                    height="14"
                    rx="3"
                    fill={fill}
                    opacity={opacity}
                  />
                );
              })}
            </svg>

            <div className="mt-4 text-center">
              <div className="font-mono text-sm font-semibold tracking-widest text-[var(--vb-ink)] tabular-nums">
                #{identity?.fingerprint || 'GENERATING'}
              </div>
              <div className="text-xs text-[var(--vb-ink-muted)] mt-0.5">
                {displayName} · ECDSA P-256 Visual Randomart
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--vb-ink-2)] leading-relaxed">
            This geometric sigil is mathematically projected from your live non-extractable ECDSA P-256 public key bytes. Compare fingerprints visually with a peer to confirm zero-mitm authenticity.
          </p>

          {/* Key Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg vb-inset">
              <span className="text-[var(--vb-ink-muted)] block">Signing Curve</span>
              <span className="font-mono text-[var(--vb-ink)] mt-0.5 block">NIST P-256 · SHA-256</span>
            </div>
            <div className="p-3 rounded-lg vb-inset">
              <span className="text-[var(--vb-ink-muted)] block">Private Key Storage</span>
              <span className="font-mono text-[var(--vb-verified)] mt-0.5 inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Memory Only
              </span>
            </div>
          </div>

          {/* Interactive Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={triggerHandshakePulse}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--vb-surface-2)] hover:bg-[var(--vb-surface-hover)] border border-[var(--vb-border)] text-xs font-medium text-[var(--vb-ink)] transition-colors cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-[var(--vb-accent)]" />
              Pulse Handshake
            </button>

            <div className="flex items-center gap-2">
              {identity && (
                <button
                  type="button"
                  onClick={() => {
                    onCopyText(identity.fingerprint, 'Identity fingerprint');
                    setCopiedFp(true);
                    setTimeout(() => setCopiedFp(false), 1600);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[var(--vb-border)] hover:bg-[var(--vb-surface-2)] text-xs font-medium text-[var(--vb-ink)] cursor-pointer"
                >
                  {copiedFp ? (
                    <Check className="w-3.5 h-3.5 text-[var(--vb-verified)]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedFp ? 'Copied' : 'Copy ID'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
