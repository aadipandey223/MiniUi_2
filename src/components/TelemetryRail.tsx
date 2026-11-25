import { useEffect, useRef } from 'react';
import { Activity, Gauge, Minus, Plus } from 'lucide-react';
import { getVaultOreSpec, type VaultOre, type VaultTheme } from '../lib/experience.ts';
import { formatDuration, formatSpeed } from '../lib/format.ts';

interface TelemetryRailProps {
  theme: VaultTheme;
  activeOre?: VaultOre | null;
  uploadSpeedHistory: number[];
  downloadSpeedHistory: number[];
  currentUploadSpeed: number;
  currentDownloadSpeed: number;
  peakSpeedBytes: number;
  activeSlotCount: number;
  maxConcurrent: number;
  waitingCount: number;
  utilizationPct: number;
  avgWaitTimeSec: number;
  avgTurnaroundSec: number;
  throughputPerMin: number;
  onChangeMaxConcurrent: (limit: number) => void;
}

const CHART_PALETTE: Record<
  VaultTheme,
  {
    grid: string;
    uploadStroke: string;
    uploadFillTop: string;
    uploadFillBottom: string;
    downloadStroke: string;
    downloadFillTop: string;
    downloadFillBottom: string;
  }
> = {
  light: {
    grid: 'rgba(212, 212, 216, 0.85)',
    uploadStroke: '#111111',
    uploadFillTop: 'rgba(17, 17, 17, 0.14)',
    uploadFillBottom: 'rgba(17, 17, 17, 0.0)',
    downloadStroke: '#71717A',
    downloadFillTop: 'rgba(113, 113, 122, 0.14)',
    downloadFillBottom: 'rgba(113, 113, 122, 0.0)',
  },
  dark: {
    grid: 'rgba(63, 63, 70, 0.65)',
    uploadStroke: '#F4F4F5',
    uploadFillTop: 'rgba(244, 244, 245, 0.18)',
    uploadFillBottom: 'rgba(244, 244, 245, 0.0)',
    downloadStroke: '#A1A1AA',
    downloadFillTop: 'rgba(161, 161, 170, 0.16)',
    downloadFillBottom: 'rgba(161, 161, 170, 0.0)',
  },
  cipher: {
    grid: 'rgba(52, 64, 58, 0.72)',
    uploadStroke: '#D7E2DC',
    uploadFillTop: 'rgba(215, 226, 220, 0.18)',
    uploadFillBottom: 'rgba(215, 226, 220, 0.0)',
    downloadStroke: '#4ADE80',
    downloadFillTop: 'rgba(74, 222, 128, 0.16)',
    downloadFillBottom: 'rgba(74, 222, 128, 0.0)',
  },
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TelemetryRail({
  theme,
  activeOre = null,
  uploadSpeedHistory,
  downloadSpeedHistory,
  currentUploadSpeed,
  currentDownloadSpeed,
  peakSpeedBytes,
  activeSlotCount,
  maxConcurrent,
  waitingCount,
  utilizationPct,
  avgWaitTimeSec,
  avgTurnaroundSec,
  throughputPerMin,
  onChangeMaxConcurrent,
}: TelemetryRailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const basePalette = CHART_PALETTE[theme];
    const oreSwatch = activeOre
      ? theme === 'light'
        ? getVaultOreSpec(activeOre).lightSwatch
        : getVaultOreSpec(activeOre).darkSwatch
      : null;

    const palette = oreSwatch
      ? {
          ...basePalette,
          uploadStroke: oreSwatch,
          uploadFillTop: hexToRgba(oreSwatch, 0.22),
          uploadFillBottom: hexToRgba(oreSwatch, 0.0),
        }
      : basePalette;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 320;
    const cssHeight = 116;
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padTop = 10;
    const padBottom = 8;
    const plotH = cssHeight - padTop - padBottom;
    const maxVal = Math.max(...uploadSpeedHistory, ...downloadSpeedHistory, 1);

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let step = 0; step <= 2; step++) {
      const y = padTop + (plotH / 2) * step;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }

    const drawSeries = (data: number[], strokeColor: string, fillStart: string, fillEnd: string) => {
      if (data.length < 2) return;
      ctx.beginPath();
      data.forEach((val, idx) => {
        const x = (idx / (data.length - 1)) * cssWidth;
        const y = padTop + plotH - (val / maxVal) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.lineTo(cssWidth, cssHeight - padBottom);
      ctx.lineTo(0, cssHeight - padBottom);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padTop, 0, cssHeight);
      grad.addColorStop(0, fillStart);
      grad.addColorStop(1, fillEnd);
      ctx.fillStyle = grad;
      ctx.fill();
    };

    drawSeries(
      downloadSpeedHistory,
      palette.downloadStroke,
      palette.downloadFillTop,
      palette.downloadFillBottom
    );
    drawSeries(
      uploadSpeedHistory,
      palette.uploadStroke,
      palette.uploadFillTop,
      palette.uploadFillBottom
    );

    ctx.restore();
  }, [theme, activeOre, uploadSpeedHistory, downloadSpeedHistory]);

  return (
    <section
      aria-label="Network throughput and concurrency controls"
      className="rounded-xl vb-panel overflow-hidden"
    >
      <div className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[var(--vb-border)]">
        {/* Live Monochrome Throughput Chart */}
        <div className="md:col-span-6 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--vb-ink)]">
              <Activity className="w-3.5 h-3.5 text-[var(--vb-ink-2)]" />
              <span>Live Throughput</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--vb-ink-muted)] font-mono tabular-nums">
              <span>Up {formatSpeed(currentUploadSpeed)}</span>
              <span aria-hidden="true">·</span>
              <span>Down {formatSpeed(currentDownloadSpeed)}</span>
            </div>
          </div>

          <div className="rounded-lg vb-inset p-2">
            <canvas
              ref={canvasRef}
              data-testid="throughput-canvas"
              className="w-full h-[116px] block"
              aria-label="Live upload and download throughput graph"
            />
          </div>
        </div>

        {/* Concurrency & Scheduler Metrics */}
        <div className="md:col-span-6 p-5 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--vb-ink)]">
                <Gauge className="w-3.5 h-3.5 text-[var(--vb-ink-2)]" />
                <span>Parallel Transfer Limit</span>
              </div>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeMaxConcurrent(maxConcurrent - 1)}
                  disabled={maxConcurrent <= 1}
                  className="w-7 h-7 rounded-md vb-inset flex items-center justify-center text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Decrease max concurrent transfers"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs font-semibold tabular-nums text-[var(--vb-ink)] w-9 text-center">
                  {activeSlotCount}/{maxConcurrent}
                </span>
                <button
                  type="button"
                  onClick={() => onChangeMaxConcurrent(maxConcurrent + 1)}
                  disabled={maxConcurrent >= 6}
                  className="w-7 h-7 rounded-md vb-inset flex items-center justify-center text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Increase max concurrent transfers"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-1.5" aria-label="Active transfer slots">
              {Array.from({ length: 6 }).map((_, idx) => {
                const enabled = idx < maxConcurrent;
                const occupied = idx < activeSlotCount;
                return (
                  <div
                    key={idx}
                    className="h-1.5 rounded-xs"
                    style={{
                      backgroundColor: !enabled
                        ? 'var(--vb-canvas)'
                        : occupied
                          ? 'var(--vb-accent)'
                          : 'var(--vb-border-strong)',
                      border: !enabled ? '1px dashed var(--vb-border)' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-4 pt-3 border-t border-[var(--vb-border)] text-xs">
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Queued</dt>
              <dd className="font-mono font-semibold tabular-nums text-[var(--vb-ink)] mt-0.5">
                {waitingCount} ({utilizationPct}%)
              </dd>
            </div>
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Peak Speed</dt>
              <dd className="font-mono font-semibold tabular-nums text-[var(--vb-ink)] mt-0.5">
                {formatSpeed(peakSpeedBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--vb-ink-muted)]">Avg Wait / Done</dt>
              <dd className="font-mono font-semibold tabular-nums text-[var(--vb-ink)] mt-0.5">
                {formatDuration(avgWaitTimeSec)} · {throughputPerMin}/m
              </dd>
            </div>
          </dl>
          <span className="sr-only">Average turnaround {formatDuration(avgTurnaroundSec)}</span>
        </div>
      </div>
    </section>
  );
}
