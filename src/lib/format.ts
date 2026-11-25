export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0.0 KB/s';
  const kbps = bytesPerSec / 1024;
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(2)} MB/s`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${mins}m ${rem}s`;
}

export function formatCountdown(expiresAt: number | null, nowMs: number): {
  label: string;
  isUrgent: boolean;
  isExpired: boolean;
} {
  if (!expiresAt) {
    return { label: 'Persistent', isUrgent: false, isExpired: false };
  }
  const diffMs = expiresAt - nowMs;
  if (diffMs <= 0) {
    return { label: 'Expired', isUrgent: true, isExpired: true };
  }
  const totalSec = Math.ceil(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  let label: string;
  if (hrs > 0) {
    label = `${hrs}h ${mins}m`;
  } else if (mins > 0) {
    label = `${mins}m ${secs.toString().padStart(2, '0')}s`;
  } else {
    label = `${secs}s`;
  }

  return {
    label,
    isUrgent: diffMs < 60_000,
    isExpired: false,
  };
}

export function maskSensitive(value: string, incognito: boolean, kind: 'file' | 'code' | 'peer' = 'file'): string {
  if (!incognito) return value;
  if (kind === 'code') return '•••••••••';
  if (kind === 'peer') return 'Masked Peer';
  const dotIdx = value.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < value.length - 1) {
    const ext = value.slice(dotIdx);
    return `••••••••${ext}`;
  }
  return '••••••••••';
}

export function getFileKindLabel(mimeType: string, fileName: string): string {
  const lower = fileName.toLowerCase();
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(lower)) return 'Image';
  if (mimeType.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(lower)) return 'Video';
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a)$/.test(lower)) return 'Audio';
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'PDF';
  if (/\.(zip|tar|gz|7z|rar)$/.test(lower)) return 'Archive';
  if (/\.(ts|tsx|js|jsx|py|go|rs|json|md|html|css|yml|yaml|sql)$/.test(lower)) return 'Code';
  if (/\.(doc|docx|xls|xlsx|csv|txt|ppt|pptx)$/.test(lower)) return 'Document';
  return 'Binary';
}
