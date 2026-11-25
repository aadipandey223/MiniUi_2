import { useState } from 'react';
import { ArrowRight, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import heroIntroImg from '../assets/images/hero_vaultbeam_intro_1795603379922.jpg';

interface IntroHeroProps {
  inPrivateRoom: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onDismiss: () => void;
}

export function IntroHero({
  inPrivateRoom,
  onCreateRoom,
  onJoinRoom,
  onDismiss,
}: IntroHeroProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <section
      aria-label="Introduction"
      className="rounded-xl vb-panel overflow-hidden"
    >
      <div className="grid lg:grid-cols-12 items-stretch">
        {/* Right Architectural Visual Column (shown first on mobile for immediate visual presence) */}
        <div className="order-first lg:order-last lg:col-span-6 border-b lg:border-b-0 lg:border-l border-[var(--vb-border)] bg-[var(--vb-surface-2)] h-52 sm:h-64 lg:h-auto relative overflow-hidden">
          {!imageError ? (
            <img
              src={heroIntroImg}
              alt="Minimalist monochrome architectural blocks connected by a clean beam of light representing direct encrypted file transfer"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover block"
            />
          ) : (
            <div className="w-full h-full min-h-[208px] flex flex-col items-center justify-center p-8 text-center bg-[var(--vb-surface-2)]">
              <ShieldCheck className="w-8 h-8 text-[var(--vb-ink-2)] mb-2" />
              <span className="text-sm font-medium text-[var(--vb-ink)]">VaultBeam Direct Channel</span>
              <span className="text-xs text-[var(--vb-ink-muted)] mt-1">
                AES-256-GCM · Direct WebRTC Stream
              </span>
            </div>
          )}
        </div>

        {/* Left Editorial Column: Plain-language clarity for beginners & pros */}
        <div className="lg:col-span-6 p-5 sm:p-7 lg:p-8 flex flex-col justify-between gap-5">
          <div className="space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-medium text-[var(--vb-ink-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="whitespace-nowrap">Direct P2P</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">End-to-End Encrypted</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">Zero Storage</span>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
              >
                Hide intro
              </button>
            </div>

            <h1 className="text-[clamp(1.65rem,2.8vw,2.35rem)] leading-[1.12] font-semibold tracking-tight text-[var(--vb-ink)]">
              Send files directly. Private by default.
            </h1>

            <p className="text-sm text-[var(--vb-ink-2)] leading-relaxed max-w-lg">
              Drop any file below to stream it straight to another device. Everything is encrypted inside your browser and never saved on a server.
            </p>
          </div>

          {/* 3-Step Plain-Language Guide */}
          <ol className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-[var(--vb-border)] text-xs">
            <li className="space-y-1">
              <span className="font-mono text-[11px] text-[var(--vb-ink-muted)]">01</span>
              <div className="font-semibold text-[var(--vb-ink)]">Drop a file</div>
              <p className="text-[var(--vb-ink-2)] leading-relaxed">
                Pick anything up to 2 GB and choose when it expires.
              </p>
            </li>
            <li className="space-y-1">
              <span className="font-mono text-[11px] text-[var(--vb-ink-muted)]">02</span>
              <div className="font-semibold text-[var(--vb-ink)]">Share room or link</div>
              <p className="text-[var(--vb-ink-2)] leading-relaxed">
                Send openly or lock a private room with a QR invite.
              </p>
            </li>
            <li className="space-y-1">
              <span className="font-mono text-[11px] text-[var(--vb-ink-muted)]">03</span>
              <div className="font-semibold text-[var(--vb-ink)]">Direct download</div>
              <p className="text-[var(--vb-ink-2)] leading-relaxed">
                Verified chunk by chunk before saving to disk.
              </p>
            </li>
          </ol>

          {/* Clean Single-Row Action Strip */}
          {!inPrivateRoom && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onCreateRoom}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-xs sm:text-sm font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                Create Private Room
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onJoinRoom}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--vb-border-strong)] hover:bg-[var(--vb-surface-2)] text-[var(--vb-ink)] text-xs sm:text-sm font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5 text-[var(--vb-ink-2)]" />
                Join with Code
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
