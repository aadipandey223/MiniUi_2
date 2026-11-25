import { useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  QrCode,
  Users,
} from 'lucide-react';
import type { PeerInfo, RoomSummary } from '../../shared/types.ts';
import type { LocalCryptoIdentity } from '../lib/crypto.ts';
import {
  VAULT_ORE_SPECS,
  getVaultOreSpec,
  type VaultOre,
  type VaultTheme,
} from '../lib/experience.ts';
import { formatCountdown, maskSensitive } from '../lib/format.ts';

interface SessionBarProps {
  connected: boolean;
  myPeerId: string | null;
  displayName: string;
  onUpdateDisplayName: (name: string) => void;
  identity: LocalCryptoIdentity | null;
  activeRoom: RoomSummary | null;
  vaultOre: VaultOre;
  theme: VaultTheme;
  onSelectVaultOre: (ore: VaultOre) => void;
  peers: PeerInfo[];
  incognito: boolean;
  onToggleIncognito: (next: boolean) => void;
  nowMs: number;
  advancedMode: boolean;
  onOpenJoinRoom: () => void;
  onOpenInviteModal: () => void;
  onRequestLeaveRoom: () => void;
  onOpenKeyArt: () => void;
  onCopyText: (value: string, label: string) => void;
}

export function SessionBar({
  connected,
  myPeerId,
  displayName,
  onUpdateDisplayName,
  identity,
  activeRoom,
  vaultOre,
  theme,
  onSelectVaultOre,
  peers,
  incognito,
  onToggleIncognito,
  nowMs,
  advancedMode,
  onOpenJoinRoom,
  onOpenInviteModal,
  onRequestLeaveRoom,
  onOpenKeyArt,
  onCopyText,
}: SessionBarProps) {
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState(displayName);
  const [copiedCode, setCopiedCode] = useState(false);
  const [peersOpen, setPeersOpen] = useState(false);

  const roomExpiry = activeRoom ? formatCountdown(activeRoom.expiresAt, nowMs) : null;
  const activeOreSpec = getVaultOreSpec(vaultOre);

  const handleSaveAlias = () => {
    onUpdateDisplayName(aliasDraft);
    setEditingAlias(false);
  };

  const handleCopyCode = () => {
    if (!activeRoom) return;
    onCopyText(activeRoom.id, 'Room code');
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1600);
  };

  return (
    <section
      aria-label="Current session"
      className={`rounded-xl vb-panel overflow-hidden ${activeRoom ? 'vb-ore-bar' : ''}`}
    >
      <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Current Space (Open Lobby or Private Room) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {activeRoom ? (
              <Lock className="w-4 h-4 text-[var(--vb-accent)] shrink-0" />
            ) : (
              <Globe className="w-4 h-4 text-[var(--vb-ink-2)] shrink-0" />
            )}
            <span className="text-sm font-semibold text-[var(--vb-ink)] truncate">
              {activeRoom ? maskSensitive(activeRoom.name, incognito, 'peer') : 'Open Lobby'}
            </span>
          </div>

          <span className="text-xs text-[var(--vb-ink-muted)] font-mono tabular-nums flex items-center gap-2">
            <span aria-hidden="true">·</span>
            <span className={connected ? 'text-[var(--vb-verified)]' : 'text-[var(--vb-danger)]'}>
              {connected ? 'Connected' : 'Reconnecting'}
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setPeersOpen((v) => !v)}
              aria-expanded={peersOpen}
              className="inline-flex items-center gap-1 text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              {peers.length} {peers.length === 1 ? 'device' : 'devices'}
            </button>
          </span>

          {activeRoom && (
            <div className="flex items-center gap-1.5 pl-1">
              <span className="font-mono text-xs font-semibold tracking-wider text-[var(--vb-ink)] bg-[var(--vb-surface-2)] border border-[var(--vb-border-strong)] px-2 py-0.5 rounded">
                {maskSensitive(activeRoom.id, incognito, 'code')}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                aria-label="Copy room code"
                title="Copy room code"
                className="p-1.5 rounded-md text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] transition-colors cursor-pointer"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-[var(--vb-verified)]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenInviteModal}
                aria-label="Show QR invite and share link"
                title="Show QR invite and share link"
                className="p-1.5 rounded-md text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
              </button>
              {roomExpiry && (
                <span className="hidden sm:inline font-mono text-[11px] text-[var(--vb-ink-muted)] ml-1">
                  {roomExpiry.label}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Identity, Privacy Mask, Join / Leave */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {editingAlias ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveAlias();
              }}
              className="flex items-center gap-1.5"
            >
              <label htmlFor="alias-edit-input" className="sr-only">
                Your display name
              </label>
              <input
                id="alias-edit-input"
                type="text"
                value={aliasDraft}
                onChange={(e) => setAliasDraft(e.target.value)}
                maxLength={32}
                autoFocus
                className="w-36 px-2.5 py-1 rounded-md bg-[var(--vb-canvas)] border border-[var(--vb-accent)] text-xs text-[var(--vb-ink)] focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-md bg-[var(--vb-accent)] text-[var(--vb-accent-ink)] text-xs font-medium cursor-pointer"
              >
                Save
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAliasDraft(displayName);
                setEditingAlias(true);
              }}
              title="Rename your device"
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[var(--vb-surface-2)] text-xs text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] transition-colors cursor-pointer"
            >
              <span className="truncate max-w-[120px]">
                {maskSensitive(displayName, incognito, 'peer')}
              </span>
              <Pencil className="w-3 h-3 text-[var(--vb-ink-muted)]" />
            </button>
          )}

          {advancedMode && (
            <button
              type="button"
              onClick={onOpenKeyArt}
              title="Inspect visual ECDSA key pattern"
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--vb-border)] hover:bg-[var(--vb-surface-2)] font-mono text-[11px] text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] tabular-nums transition-colors cursor-pointer"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              #{identity?.fingerprint || 'INIT'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleIncognito(!incognito)}
            aria-pressed={incognito}
            title={incognito ? 'Show file and device names' : 'Hide names for privacy'}
            className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors cursor-pointer whitespace-nowrap ${
              incognito
                ? 'border-[var(--vb-accent)] bg-[var(--vb-accent-soft)] text-[var(--vb-ink)] font-medium'
                : 'border-[var(--vb-border)] text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)]'
            }`}
          >
            {incognito ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{incognito ? 'Hidden' : 'Hide names'}</span>
          </button>

          {activeRoom ? (
            <button
              type="button"
              onClick={onRequestLeaveRoom}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--vb-danger)]/35 text-xs font-medium text-[var(--vb-danger)] hover:bg-[var(--vb-danger-soft)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenJoinRoom}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--vb-border)] hover:bg-[var(--vb-surface-2)] text-xs font-medium text-[var(--vb-ink)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5 text-[var(--vb-ink-2)]" />
              Join Code
            </button>
          )}
        </div>
      </div>

      {/* Private Room Mineral / Ore Chemistry Strip (only visible inside Private Rooms) */}
      {activeRoom && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-[var(--vb-border)] bg-[var(--vb-surface-2)]/65 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-[var(--vb-ink-2)] min-w-0">
            <span className="font-mono font-semibold text-[var(--vb-accent)] tabular-nums">
              {activeOreSpec.symbol} {activeOreSpec.notation}
            </span>
            <span aria-hidden="true" className="text-[var(--vb-ink-muted)]">·</span>
            <span className="text-[var(--vb-ink)] font-medium truncate">
              {activeOreSpec.name} Vault
            </span>
            <span className="hidden sm:inline text-[var(--vb-ink-muted)]">
              ({activeOreSpec.mineral} · Isolated PBKDF2-310k + AAD)
            </span>
          </div>

          <div
            role="group"
            aria-label="Private room mineral finish"
            className="flex items-center gap-1"
          >
            {VAULT_ORE_SPECS.map((spec) => {
              const selected = spec.id === vaultOre;
              const swatch = theme === 'light' ? spec.lightSwatch : spec.darkSwatch;
              return (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => onSelectVaultOre(spec.id)}
                  aria-pressed={selected}
                  title={`${spec.name} (${spec.symbol} · ${spec.notation}) — ${spec.mineral}`}
                  className={`min-h-[28px] inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                    selected
                      ? 'border-[var(--vb-accent)] bg-[var(--vb-surface)] text-[var(--vb-ink)] font-semibold'
                      : 'border-transparent text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface)]/70'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: swatch }}
                  />
                  <span>{spec.symbol}</span>
                  <span className="hidden md:inline font-sans text-[11px]">{spec.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Connected Devices Drawer (inline, quiet hairline divider) */}
      {peersOpen && (
        <div className="px-4 sm:px-5 py-3 border-t border-[var(--vb-border)] bg-[var(--vb-canvas)]/60">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="text-[var(--vb-ink-muted)] font-medium">Connected devices:</span>
            {peers.map((peer) => {
              const isSelf = peer.id === myPeerId;
              return (
                <span key={peer.id} className="inline-flex items-center gap-1.5 text-[var(--vb-ink)]">
                  <span>
                    {maskSensitive(peer.displayName, incognito, 'peer')}
                    {isSelf ? ' (You)' : ''}
                  </span>
                  {advancedMode && peer.fingerprint && (
                    <span className="font-mono text-[11px] text-[var(--vb-ink-muted)]">
                      #{peer.fingerprint.slice(0, 6)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
