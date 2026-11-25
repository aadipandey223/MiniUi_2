import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { CreatedRoomInvite } from '../hooks/useVaultBeam.ts';
import { evaluatePasswordStrength, generateStrongPassword } from '../lib/crypto.ts';
import { extractRoomIdFromInput } from '../../shared/security.ts';

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (params: { name: string; password: string; expiresInMs: number | null }) => Promise<void>;
  onCopyText: (value: string, label: string) => void;
}

const ROOM_EXPIRY_OPTIONS: { label: string; value: number }[] = [
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '2 hours', value: 2 * 60 * 60 * 1000 },
  { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  { label: 'Until everyone leaves', value: 0 },
];

export function CreateRoomModal({ open, onClose, onCreate, onCopyText }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiryMs, setExpiryMs] = useState<number>(2 * 60 * 60 * 1000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setPassword('');
      setShowPassword(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const strength = evaluatePasswordStrength(password);
  const strengthColor =
    strength.score <= 1
      ? 'var(--vb-danger)'
      : strength.score === 2
        ? 'var(--vb-caution)'
        : 'var(--vb-verified)';

  const handleGeneratePassword = () => {
    const generated = generateStrongPassword(18);
    setPassword(generated);
    setShowPassword(true);
    onCopyText(generated, 'Generated room password');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name,
        password,
        expiresInMs: expiryMs > 0 ? expiryMs : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
    >
      <div
        className="w-full max-w-md rounded-xl vb-panel-elevated overflow-hidden animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--vb-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-[var(--vb-accent)]" />
            <h2 id="create-room-title" className="text-base font-semibold text-[var(--vb-ink)]">
              Create Private Room
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="room-name-input" className="block text-xs font-medium text-[var(--vb-ink-2)] mb-1.5">
              Room Name (optional)
            </label>
            <input
              id="room-name-input"
              type="text"
              maxLength={48}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Release Artifacts"
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--vb-canvas)] border border-[var(--vb-border)] text-sm text-[var(--vb-ink)] placeholder:text-[var(--vb-ink-muted)] focus:outline-none focus:border-[var(--vb-accent)]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="room-pass-input" className="text-xs font-medium text-[var(--vb-ink-2)]">
                Room Password (optional)
              </label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="inline-flex items-center gap-1 text-xs text-[var(--vb-accent)] hover:text-[var(--vb-accent-hover)] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Generate & Copy
              </button>
            </div>
            <div className="relative">
              <input
                id="room-pass-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Zero-knowledge HMAC challenge auth"
                className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-[var(--vb-canvas)] border border-[var(--vb-border)] font-mono text-sm text-[var(--vb-ink)] placeholder:font-sans placeholder:text-[var(--vb-ink-muted)] focus:outline-none focus:border-[var(--vb-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] p-1 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {password && (
              <div className="mt-2 space-y-1">
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((lvl) => (
                    <div
                      key={lvl}
                      className="h-1 rounded-full transition-colors"
                      style={{
                        backgroundColor:
                          lvl <= strength.score ? strengthColor : 'var(--vb-border-strong)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--vb-ink-muted)]">
                  <span>Strength: {strength.label}</span>
                  <span>Password never leaves your device</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="room-expiry-select" className="block text-xs font-medium text-[var(--vb-ink-2)] mb-1.5">
              Room Lifespan
            </label>
            <select
              id="room-expiry-select"
              value={expiryMs}
              onChange={(e) => setExpiryMs(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--vb-canvas)] border border-[var(--vb-border)] text-sm text-[var(--vb-ink)] focus:outline-none focus:border-[var(--vb-accent)] cursor-pointer"
            >
              {ROOM_EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-[var(--vb-danger)] bg-[var(--vb-danger-soft)] border border-[var(--vb-danger)]/35 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--vb-border)] text-sm font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] disabled:opacity-50 text-[var(--vb-accent-ink)] text-sm font-semibold cursor-pointer"
            >
              {submitting ? 'Deriving Key...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RoomInviteModalProps {
  invite: CreatedRoomInvite | null;
  alreadyInRoom: boolean;
  onClose: () => void;
  onEnterRoom: (roomId: string, password: string) => void;
  onCopyText: (value: string, label: string) => void;
}

export function RoomInviteModal({
  invite,
  alreadyInRoom,
  onClose,
  onEnterRoom,
  onCopyText,
}: RoomInviteModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!invite) return null;

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-room-title"
    >
      <div
        className="w-full max-w-md rounded-xl vb-panel-elevated overflow-hidden animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--vb-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-4 h-4 text-[var(--vb-verified)] shrink-0" />
            <h2 id="invite-room-title" className="text-base font-semibold text-[var(--vb-ink)] truncate">
              Room Invite · {invite.room.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* QR Code — high-contrast white quiet zone for reliable camera scanning in all themes */}
          <div className="flex flex-col items-center">
            <div className="p-3 rounded-xl bg-white border border-[var(--vb-border)]">
              <img
                src={invite.qrDataUrl}
                alt={`QR code for room ${invite.room.id}`}
                width={184}
                height={184}
                className="block rounded-xs"
              />
            </div>
            <p className="text-xs text-[var(--vb-ink-2)] mt-2.5 text-center">
              Scan on another device or share the room code below.
              {invite.room.requiresPassword ? ' Share your password separately.' : ''}
            </p>
          </div>

          {/* Room Code */}
          <div>
            <span className="block text-xs text-[var(--vb-ink-muted)] mb-1.5">Room Code</span>
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg vb-inset">
              <span className="font-mono text-base font-semibold tracking-widest text-[var(--vb-ink)] tabular-nums">
                {invite.room.id}
              </span>
              <button
                type="button"
                onClick={() => {
                  onCopyText(invite.room.id, 'Room code');
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 1600);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--vb-surface-2)] hover:bg-[var(--vb-surface-hover)] text-xs font-medium text-[var(--vb-ink)] cursor-pointer"
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-[var(--vb-verified)]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedId ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Direct Share URL */}
          <div>
            <span className="block text-xs text-[var(--vb-ink-muted)] mb-1.5">Direct Link</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={invite.shareLink}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-lg vb-inset font-mono text-xs text-[var(--vb-ink-2)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onCopyText(invite.shareLink, 'Room link');
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 1600);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[var(--vb-surface-2)] hover:bg-[var(--vb-surface-hover)] border border-[var(--vb-border)] text-xs font-medium text-[var(--vb-ink)] whitespace-nowrap cursor-pointer"
              >
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-end gap-2.5">
            {alreadyInRoom ? (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-sm font-semibold cursor-pointer"
              >
                Done · Start Sharing
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--vb-border)] text-sm font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => onEnterRoom(invite.room.id, invite.password)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-sm font-semibold cursor-pointer"
                >
                  Enter Room
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface JoinRoomModalProps {
  open: boolean;
  prefillRoomId: string;
  prefillRoomName?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onJoin: (roomId: string, password: string) => Promise<void>;
  onClearError: () => void;
}

export function JoinRoomModal({
  open,
  prefillRoomId,
  prefillRoomName = null,
  busy,
  error,
  onClose,
  onJoin,
  onClearError,
}: JoinRoomModalProps) {
  const [roomId, setRoomId] = useState(prefillRoomId);
  const [password, setPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState<boolean | null>(null);
  const [roomName, setRoomName] = useState<string | null>(prefillRoomName);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRoomId(prefillRoomId);
      setPassword('');
      setRequiresPassword(prefillRoomId ? true : null);
      setRoomName(prefillRoomName);
      setLocalError(null);
      onClearError();
    }
  }, [open, prefillRoomId, prefillRoomName, onClearError]);

  if (!open) return null;

  const displayError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = extractRoomIdFromInput(roomId);
    if (!/^[A-Z0-9]{6,16}$/.test(cleaned)) {
      setLocalError('Enter a valid room code or paste a VaultBeam room link.');
      return;
    }
    setRoomId(cleaned);
    setLocalError(null);
    onClearError();

    if (requiresPassword === null) {
      setChecking(true);
      try {
        const res = await fetch(`/api/rooms/${cleaned}`);
        const data = (await res.json()) as {
          success: boolean;
          room?: { id: string; name: string; requiresPassword: boolean };
          error?: string;
        };
        if (!data.success || !data.room) {
          setLocalError(data.error || 'Room not found.');
          setChecking(false);
          return;
        }
        setRoomName(data.room.name);
        if (data.room.requiresPassword && !password) {
          setRequiresPassword(true);
          setChecking(false);
          return;
        }
        setChecking(false);
        await onJoin(data.room.id, password);
      } catch {
        setChecking(false);
        setLocalError('Unable to reach server to check room.');
      }
      return;
    }

    if (requiresPassword && !password) {
      setLocalError('Enter the room password to complete authentication.');
      return;
    }

    await onJoin(cleaned, password);
  };

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-room-title"
    >
      <div
        className="w-full max-w-md rounded-xl vb-panel-elevated overflow-hidden animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--vb-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[var(--vb-accent)]" />
            <h2 id="join-room-title" className="text-base font-semibold text-[var(--vb-ink)]">
              Join Private Room
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="join-code-input" className="block text-xs font-medium text-[var(--vb-ink-2)] mb-1.5">
              Room Code or Share Link
            </label>
            <input
              id="join-code-input"
              type="text"
              maxLength={160}
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setRequiresPassword(null);
                setRoomName(null);
                setLocalError(null);
              }}
              placeholder="e.g. K9M4PX2QR or paste room link"
              autoFocus={!prefillRoomId}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--vb-canvas)] border border-[var(--vb-border)] font-mono text-sm tracking-wider text-[var(--vb-ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--vb-ink-muted)] focus:outline-none focus:border-[var(--vb-accent)]"
            />
            {roomName && (
              <p className="text-xs text-[var(--vb-verified)] mt-1.5">
                Private room: {roomName}
              </p>
            )}
          </div>

          {requiresPassword && (
            <div>
              <label htmlFor="join-pass-input" className="block text-xs font-medium text-[var(--vb-ink-2)] mb-1.5">
                Room Password
              </label>
              <input
                id="join-pass-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="Verified via HMAC challenge-response"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--vb-canvas)] border border-[var(--vb-border)] font-mono text-sm text-[var(--vb-ink)] placeholder:font-sans placeholder:text-[var(--vb-ink-muted)] focus:outline-none focus:border-[var(--vb-accent)]"
              />
            </div>
          )}

          {displayError && (
            <p className="text-xs text-[var(--vb-danger)] bg-[var(--vb-danger-soft)] border border-[var(--vb-danger)]/35 rounded-lg px-3 py-2">
              {displayError}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--vb-border)] text-sm font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={checking || busy}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] disabled:opacity-50 text-[var(--vb-accent-ink)] text-sm font-semibold cursor-pointer"
            >
              {checking ? 'Checking...' : busy ? 'Authenticating...' : requiresPassword ? 'Verify & Join' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmLeaveModalProps {
  open: boolean;
  roomName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmLeaveModal({ open, roomName, onCancel, onConfirm }: ConfirmLeaveModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-room-title"
    >
      <div
        className="w-full max-w-sm rounded-xl vb-panel-elevated p-5 space-y-4 animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="leave-room-title" className="text-base font-semibold text-[var(--vb-ink)]">
            Leave {roomName}?
          </h2>
          <p className="text-sm text-[var(--vb-ink-2)] mt-1.5 leading-relaxed">
            Leaving will unshare files you posted in this room, cancel active room downloads, and wipe the derived room key from memory.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--vb-border)] text-sm font-medium text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--vb-danger)] hover:opacity-90 text-white text-sm font-semibold cursor-pointer"
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
