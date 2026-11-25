import { useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Fingerprint,
  KeyRound,
  Lock,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { RoomSummary } from '../../shared/types.ts';
import type { CryptoSelfTestResult, LocalCryptoIdentity } from '../lib/crypto.ts';
import { CRYPTO_TRIVIA, MILESTONE_SPECS, type MilestoneId } from '../lib/experience.ts';
import { formatBytes } from '../lib/format.ts';
import securityLayersImg from '../assets/images/security_layers_mono_1795603380047.jpg';

interface SecurityViewProps {
  identity: LocalCryptoIdentity | null;
  activeRoom: RoomSummary | null;
  selfTestResult: CryptoSelfTestResult | null;
  selfTestRunning: boolean;
  milestones: MilestoneId[];
  triviaIndex: number;
  onChangeTriviaIndex: (next: number) => void;
  onRunSelfTest: () => void;
  onOpenKeyArt: () => void;
  onCopyText: (value: string, label: string) => void;
}

export function SecurityView({
  identity,
  activeRoom,
  selfTestResult,
  selfTestRunning,
  milestones,
  triviaIndex,
  onChangeTriviaIndex,
  onRunSelfTest,
  onOpenKeyArt,
  onCopyText,
}: SecurityViewProps) {
  const [imageError, setImageError] = useState(false);
  const safeIdx = ((triviaIndex % CRYPTO_TRIVIA.length) + CRYPTO_TRIVIA.length) % CRYPTO_TRIVIA.length;
  const trivia = CRYPTO_TRIVIA[safeIdx];

  return (
    <div className="space-y-6">
      {/* Editorial Monochrome Security Hero Card */}
      <section className="rounded-xl vb-panel overflow-hidden">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-5">
            <div className="space-y-2.5">
              <div className="text-xs text-[var(--vb-ink-muted)]">
                Built-in Browser Web Crypto · Zero Server Access
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--vb-ink)]">
                How your files stay private
              </h1>
              <p className="text-sm text-[var(--vb-ink-2)] leading-relaxed max-w-xl">
                Every file is locked with a fresh key inside your browser before a single byte leaves your device. Even the signaling server cannot read file contents, passwords, or keys.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onRunSelfTest}
                disabled={selfTestRunning || !identity}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] disabled:opacity-50 text-[var(--vb-accent-ink)] text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {selfTestRunning ? 'Testing Encryption...' : 'Run Verification Check'}
              </button>

              <button
                type="button"
                onClick={onOpenKeyArt}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--vb-border-strong)] hover:bg-[var(--vb-surface-2)] text-xs sm:text-sm font-medium text-[var(--vb-ink)] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Fingerprint className="w-4 h-4 text-[var(--vb-ink-2)]" />
                View Visual Key Art
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-[var(--vb-border)] bg-[var(--vb-surface-2)] min-h-[200px]">
            {!imageError ? (
              <img
                src={securityLayersImg}
                alt="Three stacked monochrome architectural layers of dark stone, brushed aluminum, and frosted glass symbolizing triple-layer encryption"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="w-full h-full object-cover block"
              />
            ) : (
              <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center p-6 text-center">
                <ShieldCheck className="w-7 h-7 text-[var(--vb-ink-2)] mb-2" />
                <span className="text-xs font-mono text-[var(--vb-ink-muted)]">
                  AES-256-GCM · ECDH P-256 · ECDSA
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Self-Test Live Results */}
      {selfTestResult && (
        <section className="rounded-xl vb-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2
                className={`w-4 h-4 ${
                  selfTestResult.passed ? 'text-[var(--vb-verified)]' : 'text-[var(--vb-danger)]'
                }`}
              />
              <h2 className="text-sm font-semibold text-[var(--vb-ink)]">
                Verification Check {selfTestResult.passed ? 'Passed' : 'Failed'}
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-[var(--vb-ink-2)]">
              {formatBytes(selfTestResult.payloadBytes)} · {selfTestResult.chunkCount} chunks ·{' '}
              {selfTestResult.durationMs} ms
            </span>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-3 border-t border-[var(--vb-border)] text-xs">
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Chunk + AAD</dt>
              <dd className="font-mono text-[var(--vb-verified)] mt-1">
                {selfTestResult.layer1Ok ? 'Verified' : 'Failed'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Key Wrapping</dt>
              <dd className="font-mono text-[var(--vb-verified)] mt-1">
                {selfTestResult.layer2Ok ? 'Verified' : 'Failed'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Tamper Rejection</dt>
              <dd className="font-mono text-[var(--vb-verified)] mt-1">
                {selfTestResult.tamperRejectedOk ? 'Blocked' : 'Failed'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--vb-ink-muted)]">SHA-256 Root</dt>
              <dd className="font-mono text-[var(--vb-ink)] tabular-nums mt-1">
                {selfTestResult.chainRootPreview}…
              </dd>
            </div>
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Digital Signature</dt>
              <dd className="font-mono text-[var(--vb-verified)] mt-1">
                {selfTestResult.layer3SignatureOk ? 'Verified' : 'Failed'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Plain-English + Technical 3-Layer Breakdown */}
      <section className="rounded-xl vb-panel overflow-hidden">
        <div className="divide-y divide-[var(--vb-border)]">
          <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--vb-ink)]">
                <KeyRound className="w-4 h-4 text-[var(--vb-ink-2)] shrink-0" />
                <span>01. Fresh key per transfer + chunk binding</span>
              </div>
              <p className="text-xs text-[var(--vb-ink-2)] leading-relaxed max-w-2xl">
                Every file gets a one-time 256-bit key. Each 48 KB chunk is encrypted with a fresh 96-bit nonce and authenticated with Associated Data (AAD) bound to its transfer ID and chunk position, blocking reordering or cross-file splicing.
              </p>
            </div>
            <span className="font-mono text-xs text-[var(--vb-ink-muted)] whitespace-nowrap shrink-0">
              AES-256-GCM · AAD
            </span>
          </div>

          <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--vb-ink)]">
                <Lock className="w-4 h-4 text-[var(--vb-ink-2)] shrink-0" />
                <span>
                  02. {activeRoom ? 'Hardened private vault lock' : 'Direct peer key agreement'}
                </span>
              </div>
              <p className="text-xs text-[var(--vb-ink-2)] leading-relaxed max-w-2xl">
                {activeRoom
                  ? `Room ${activeRoom.id} derives its encryption key locally via 310,000 PBKDF2-SHA256 rounds. Passwords use zero-knowledge HMAC challenge-response with automatic brute-force lockout and never leave your device.`
                  : 'In the open lobby, sender and receiver negotiate a private wrapping key directly using ephemeral ECDH P-256, with key downgrade protection enabled automatically inside private rooms.'}
              </p>
            </div>
            <span className="font-mono text-xs text-[var(--vb-ink-muted)] whitespace-nowrap shrink-0">
              {activeRoom ? 'PBKDF2 · 310k' : 'ECDH P-256'}
            </span>
          </div>

          <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--vb-ink)]">
                <ShieldCheck className="w-4 h-4 text-[var(--vb-verified)] shrink-0" />
                <span>03. Pinned sender identity & tamper-proof chain</span>
              </div>
              <p className="text-xs text-[var(--vb-ink-2)] leading-relaxed max-w-2xl">
                Receivers pin the sender’s ECDSA P-256 public key against the active room registry, verify exact byte totals, validate the sequential SHA-256 hash chain, and sanitize filenames before saving.
              </p>
            </div>
            <span className="font-mono text-xs text-[var(--vb-ink-muted)] whitespace-nowrap shrink-0">
              ECDSA Pin + SHA-256
            </span>
          </div>
        </div>
      </section>

      {/* Session Key Identity */}
      <section className="rounded-xl vb-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--vb-ink)]">Your Session Identity</h2>
          <span className="text-xs text-[var(--vb-ink-muted)]">
            Private key stays in memory only
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-lg vb-inset space-y-1.5">
            <div className="flex items-center justify-between text-[var(--vb-ink-2)]">
              <span>Device Fingerprint</span>
              {identity && (
                <button
                  type="button"
                  onClick={() => onCopyText(identity.fingerprint, 'Fingerprint')}
                  className="text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
              )}
            </div>
            <div className="font-mono text-sm font-semibold text-[var(--vb-ink)] tracking-wider tabular-nums">
              {identity?.fingerprint || 'Generating...'}
            </div>
          </div>

          <div className="p-3.5 rounded-lg vb-inset space-y-1.5">
            <div className="flex items-center justify-between text-[var(--vb-ink-2)]">
              <span>Public Signing Key (SPKI)</span>
              {identity && (
                <button
                  type="button"
                  onClick={() => onCopyText(identity.signingPublicKeyBase64, 'Public key')}
                  className="text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
              )}
            </div>
            <div className="font-mono text-xs text-[var(--vb-ink-2)] truncate">
              {identity?.signingPublicKeyBase64 || 'Generating...'}
            </div>
          </div>
        </div>
      </section>

      {/* Milestones & Field Notes */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-xl vb-panel overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--vb-border)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[var(--vb-ink-2)]" />
              <h2 className="text-sm font-semibold text-[var(--vb-ink)]">Milestones</h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-[var(--vb-ink-muted)]">
              {milestones.length} / {MILESTONE_SPECS.length}
            </span>
          </div>

          <div className="p-4 grid sm:grid-cols-2 gap-2.5">
            {MILESTONE_SPECS.map((spec) => {
              const unlocked = milestones.includes(spec.id);
              const hideDetails = Boolean(spec.secret && !unlocked);
              return (
                <div
                  key={spec.id}
                  className="p-3 rounded-lg vb-inset flex items-start gap-2.5"
                  style={{ opacity: unlocked ? 1 : 0.6 }}
                >
                  <div className="mt-0.5 shrink-0">
                    {unlocked ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--vb-verified)]" />
                    ) : spec.secret ? (
                      <Sparkles className="w-3.5 h-3.5 text-[var(--vb-ink-muted)]" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[var(--vb-ink-muted)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--vb-ink)] truncate">
                      {hideDetails ? 'Hidden Discovery' : spec.title}
                    </div>
                    <p className="text-[11px] text-[var(--vb-ink-muted)] mt-0.5 leading-snug">
                      {hideDetails
                        ? 'Try Cmd+K commands or visual fingerprints to unlock.'
                        : spec.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-xl vb-panel p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--vb-ink-2)]">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Cryptography Note</span>
                <span className="font-mono text-[var(--vb-ink-muted)]">· {trivia.year}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangeTriviaIndex(safeIdx - 1)}
                  className="w-7 h-7 rounded-md vb-inset hover:bg-[var(--vb-surface-2)] flex items-center justify-center text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] transition-colors cursor-pointer"
                  aria-label="Previous cryptography note"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] tabular-nums text-[var(--vb-ink-muted)] px-1">
                  {safeIdx + 1}/{CRYPTO_TRIVIA.length}
                </span>
                <button
                  type="button"
                  onClick={() => onChangeTriviaIndex(safeIdx + 1)}
                  className="w-7 h-7 rounded-md vb-inset hover:bg-[var(--vb-surface-2)] flex items-center justify-center text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] transition-colors cursor-pointer"
                  aria-label="Next cryptography note"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-[var(--vb-ink)]">{trivia.title}</h3>
            <p className="text-xs text-[var(--vb-ink-2)] leading-relaxed">{trivia.body}</p>
          </div>

          <div className="pt-3 border-t border-[var(--vb-border)] text-[11px] text-[var(--vb-ink-muted)] font-mono">
            Tip: Press ⌘K anywhere for quick commands
          </div>
        </section>
      </div>
    </div>
  );
}
