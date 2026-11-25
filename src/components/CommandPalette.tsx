import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Binary,
  BookOpen,
  Command,
  EyeOff,
  Fingerprint,
  History,
  KeyRound,
  ListOrdered,
  Lock,
  Maximize2,
  Moon,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { SchedulingAlgorithm, WorkspaceTab } from '../../shared/types.ts';
import {
  VAULT_ORE_SPECS,
  type ExperienceMode,
  type VaultOre,
  type VaultTheme,
} from '../lib/experience.ts';

export interface CommandItem {
  id: string;
  label: string;
  subtitle: string;
  group: 'Navigation' | 'Workspace' | 'Appearance' | 'Commands';
  keywords: string;
  shortcut?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  theme: VaultTheme;
  vaultOre: VaultOre;
  inPrivateRoom: boolean;
  mode: ExperienceMode;
  cipherUnlocked: boolean;
  incognito: boolean;
  zenMode: boolean;
  matrixBackdrop: boolean;
  soundEnabled: boolean;
  onSelectTab: (tab: WorkspaceTab) => void;
  onSetMode: (mode: ExperienceMode) => void;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onSetTheme: (theme: VaultTheme) => void;
  onSetVaultOre: (ore: VaultOre) => void;
  onActivateCipher: () => void;
  onToggleIncognito: () => void;
  onToggleZen: () => void;
  onToggleMatrix: () => void;
  onToggleSound: () => void;
  onSetAlgorithm: (algo: SchedulingAlgorithm) => void;
  onRunSelfTest: () => void;
  onOpenKeyArt: () => void;
  onOpenEntropy: () => void;
  onShowTrivia: () => void;
  onSecretCommandUsed: () => void;
}

export function CommandPalette({
  open,
  onClose,
  theme,
  vaultOre,
  inPrivateRoom,
  mode,
  cipherUnlocked,
  incognito,
  zenMode,
  matrixBackdrop,
  soundEnabled,
  onSelectTab,
  onSetMode,
  onOpenCreateRoom,
  onOpenJoinRoom,
  onSetTheme,
  onSetVaultOre,
  onActivateCipher,
  onToggleIncognito,
  onToggleZen,
  onToggleMatrix,
  onToggleSound,
  onSetAlgorithm,
  onRunSelfTest,
  onOpenKeyArt,
  onOpenEntropy,
  onShowTrivia,
  onSecretCommandUsed,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    return [
      {
        id: 'toggle-mode',
        label: mode === 'simple' ? 'Switch to Advanced Mode' : 'Switch to Simple Mode',
        subtitle:
          mode === 'simple'
            ? 'Reveal transfer scheduler, concurrency slots, and live throughput graph'
            : 'Return to the clean, minimal file transfer layout',
        group: 'Workspace',
        keywords: 'simple advanced mode beginner pro toggle',
        shortcut: mode === 'advanced' ? 'Advanced' : 'Simple',
        icon: <SlidersHorizontal className="w-4 h-4 text-[var(--vb-ink)]" />,
        run: () => onSetMode(mode === 'simple' ? 'advanced' : 'simple'),
      },
      {
        id: 'new-room',
        label: 'Create Private Room',
        subtitle: 'Start an isolated encrypted room with optional password & QR invite',
        group: 'Workspace',
        keywords: 'create room vault private qr',
        icon: <Plus className="w-4 h-4 text-[var(--vb-ink)]" />,
        run: onOpenCreateRoom,
      },
      {
        id: 'join-room',
        label: 'Join Room by Code',
        subtitle: 'Enter a room code and verify password without sending it to the server',
        group: 'Workspace',
        keywords: 'join room code password',
        icon: <KeyRound className="w-4 h-4 text-[var(--vb-ink)]" />,
        run: onOpenJoinRoom,
      },
      {
        id: 'incognito',
        label: incognito ? 'Show Names (Disable Privacy Mask)' : 'Hide Names (Privacy Mask)',
        subtitle: 'Mask filenames, device names, and room codes while screen-sharing',
        group: 'Workspace',
        keywords: 'incognito privacy mask blur hide',
        icon: <EyeOff className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: onToggleIncognito,
      },
      {
        id: 'key-art',
        label: 'View Visual Key Art',
        subtitle: 'Inspect your deterministic ECDSA P-256 visual pattern',
        group: 'Workspace',
        keywords: 'fingerprint key art sigil randomart identity',
        icon: <Fingerprint className="w-4 h-4 text-[var(--vb-ink)]" />,
        run: onOpenKeyArt,
      },
      {
        id: 'self-test',
        label: 'Run Encryption Verification Check',
        subtitle: 'Test live AES-256-GCM, key wrap, SHA-256 chain & ECDSA signature',
        group: 'Workspace',
        keywords: 'crypto test verify benchmark security',
        icon: <ShieldCheck className="w-4 h-4 text-[var(--vb-verified)]" />,
        run: () => {
          onSelectTab('security');
          onRunSelfTest();
        },
      },
      {
        id: 'nav-workspace',
        label: 'Go to Send',
        subtitle: 'Drop files, view available downloads, and manage your shared items',
        group: 'Navigation',
        keywords: 'send workspace drop files home',
        icon: <Send className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSelectTab('workspace'),
      },
      {
        id: 'nav-queue',
        label: 'Go to Queue',
        subtitle: 'Manage active transfers, FCFS / SJF / Priority scheduling & speed',
        group: 'Navigation',
        keywords: 'queue scheduler fcfs sjf priority',
        icon: <ListOrdered className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSelectTab('queue'),
      },
      {
        id: 'nav-history',
        label: 'Go to History',
        subtitle: 'Review completed transfers and integrity verification logs',
        group: 'Navigation',
        keywords: 'history log audit completed',
        icon: <History className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSelectTab('history'),
      },
      {
        id: 'nav-security',
        label: 'Go to Security',
        subtitle: 'Understand encryption layers, keys, and session milestones',
        group: 'Navigation',
        keywords: 'security milestones lore trivia keys',
        icon: <Lock className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSelectTab('security'),
      },
      {
        id: 'algo-fcfs',
        label: 'Queue Order: FCFS (First Come, First Served)',
        subtitle: 'Download queued files strictly in arrival order',
        group: 'Workspace',
        keywords: 'scheduler fcfs algorithm',
        icon: <Activity className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSetAlgorithm('FCFS'),
      },
      {
        id: 'algo-sjf',
        label: 'Queue Order: SJF (Smallest Files First)',
        subtitle: 'Finish smaller files first to minimize waiting time',
        group: 'Workspace',
        keywords: 'scheduler sjf shortest algorithm',
        icon: <Activity className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSetAlgorithm('SJF'),
      },
      {
        id: 'algo-priority',
        label: 'Queue Order: Priority',
        subtitle: 'Process high-priority or manually reordered items first',
        group: 'Workspace',
        keywords: 'scheduler priority algorithm',
        icon: <Activity className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSetAlgorithm('Priority'),
      },
      {
        id: 'theme-light',
        label: 'Theme: Light (Paper Monochrome)',
        subtitle: 'Clean off-white canvas with crisp black ink and hairline borders',
        group: 'Appearance',
        keywords: 'theme light white paper monochrome',
        shortcut: theme === 'light' ? 'Active' : undefined,
        icon: <Sun className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSetTheme('light'),
      },
      {
        id: 'theme-dark',
        label: 'Theme: Dark (Charcoal Monochrome)',
        subtitle: 'Matte black charcoal canvas with crisp chalk white accents',
        group: 'Appearance',
        keywords: 'theme dark black charcoal monochrome',
        shortcut: theme === 'dark' ? 'Active' : undefined,
        icon: <Moon className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => onSetTheme('dark'),
      },
      ...VAULT_ORE_SPECS.map<CommandItem>((spec) => ({
        id: `ore-${spec.id}`,
        label: `Private Room Ore: ${spec.name} (${spec.symbol} · ${spec.notation})`,
        subtitle: `${spec.mineral} mineral finish${inPrivateRoom ? ' — applies now' : ' — active inside private rooms'}`,
        group: 'Appearance',
        keywords: `ore mineral chemistry private room ${spec.id} ${spec.name.toLowerCase()} ${spec.symbol.toLowerCase()} ${spec.mineral.toLowerCase()} gold copper jade brass`,
        shortcut: vaultOre === spec.id ? 'Selected' : spec.symbol,
        icon: (
          <span
            aria-hidden="true"
            className="w-3.5 h-3.5 rounded-xs"
            style={{ backgroundColor: theme === 'light' ? spec.lightSwatch : spec.darkSwatch }}
          />
        ),
        run: () => onSetVaultOre(spec.id),
      })),
      {
        id: 'toggle-sound',
        label: soundEnabled ? 'Mute Subtle Chimes' : 'Enable Subtle Chimes',
        subtitle: 'Toggle quiet audio feedback on milestones and key pulse',
        group: 'Appearance',
        keywords: 'sound audio mute chime',
        icon: soundEnabled ? (
          <Volume2 className="w-4 h-4 text-[var(--vb-ink-2)]" />
        ) : (
          <VolumeX className="w-4 h-4 text-[var(--vb-ink-muted)]" />
        ),
        run: onToggleSound,
      },
      {
        id: 'slash-zen',
        label: '/zen',
        subtitle: zenMode
          ? 'Exit distraction-free Focus Drop Mode'
          : 'Hide chrome for a serene drop-only workspace',
        group: 'Commands',
        keywords: '/zen focus minimal clean distraction',
        shortcut: zenMode ? 'Active' : 'Slash',
        icon: <Maximize2 className="w-4 h-4 text-[var(--vb-ink)]" />,
        run: () => {
          onSecretCommandUsed();
          onToggleZen();
        },
      },
      {
        id: 'slash-entropy',
        label: '/entropy',
        subtitle: 'Inspect live browser CSPRNG random bytes and Shannon entropy',
        group: 'Commands',
        keywords: '/entropy random csprng hex shannon bits',
        shortcut: 'Slash',
        icon: <Binary className="w-4 h-4 text-[var(--vb-ink)]" />,
        run: () => {
          onSecretCommandUsed();
          onOpenEntropy();
        },
      },
      {
        id: 'slash-matrix',
        label: '/matrix',
        subtitle: matrixBackdrop
          ? 'Disable subtle monochrome glyph backdrop'
          : 'Enable subtle monochrome hex glyph backdrop',
        group: 'Commands',
        keywords: '/matrix rain glyph backdrop',
        shortcut: matrixBackdrop ? 'Active' : 'Slash',
        icon: <Terminal className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => {
          onSecretCommandUsed();
          onToggleMatrix();
        },
      },
      {
        id: 'slash-cipher',
        label: '/cipher',
        subtitle: cipherUnlocked
          ? 'Toggle the hidden Graphite Cipher monochrome theme'
          : 'Unlock the hidden Graphite Cipher theme',
        group: 'Commands',
        keywords: '/cipher secret theme graphite konami',
        shortcut: theme === 'cipher' ? 'Active' : 'Secret',
        icon: <Sparkles className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => {
          onSecretCommandUsed();
          onActivateCipher();
        },
      },
      {
        id: 'slash-trivia',
        label: '/trivia',
        subtitle: 'Read a short cryptography history note',
        group: 'Commands',
        keywords: '/trivia lore history fact diffie aes',
        shortcut: 'Slash',
        icon: <BookOpen className="w-4 h-4 text-[var(--vb-ink-2)]" />,
        run: () => {
          onSecretCommandUsed();
          onShowTrivia();
        },
      },
    ];
  }, [
    cipherUnlocked,
    inPrivateRoom,
    incognito,
    matrixBackdrop,
    mode,
    onActivateCipher,
    onOpenCreateRoom,
    onOpenEntropy,
    onOpenJoinRoom,
    onOpenKeyArt,
    onRunSelfTest,
    onSecretCommandUsed,
    onSelectTab,
    onSetAlgorithm,
    onSetMode,
    onSetTheme,
    onSetVaultOre,
    onShowTrivia,
    onToggleIncognito,
    onToggleMatrix,
    onToggleSound,
    onToggleZen,
    soundEnabled,
    theme,
    vaultOre,
    zenMode,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.subtitle.toLowerCase().includes(q) ||
        cmd.keywords.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const executeItem = (item: CommandItem) => {
    onClose();
    item.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      executeItem(filtered[selectedIndex]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--vb-backdrop)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl rounded-xl vb-panel-elevated overflow-hidden animate-vb-fade"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-4 py-3.5 border-b border-[var(--vb-border)] flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--vb-ink-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions, Light/Dark, or /zen, /entropy..."
            className="flex-1 bg-transparent text-sm text-[var(--vb-ink)] placeholder:text-[var(--vb-ink-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)] hover:bg-[var(--vb-surface-2)] cursor-pointer"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--vb-ink-muted)]">
              No matching commands. Try <span className="font-mono text-[var(--vb-ink)]">/zen</span> or{' '}
              <span className="font-mono text-[var(--vb-ink)]">/entropy</span>.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeItem(item)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-100 cursor-pointer ${
                    isSelected ? 'bg-[var(--vb-surface-2)]' : 'hover:bg-[var(--vb-surface-2)]/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-[var(--vb-canvas)] border border-[var(--vb-border)] flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--vb-ink)] truncate">
                        {item.label}
                      </div>
                      <div className="text-xs text-[var(--vb-ink-muted)] truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <span className="font-mono text-[11px] text-[var(--vb-ink-2)]">
                        {item.shortcut}
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--vb-ink-muted)] hidden sm:inline">
                      {item.group}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-[var(--vb-border)] bg-[var(--vb-canvas)]/70 flex items-center justify-between gap-3 text-[11px] text-[var(--vb-ink-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <Command className="w-3 h-3" />
            Arrows to move · Enter to run · Esc to close
          </span>
          <span className="font-mono hidden sm:inline">/zen · /entropy · /cipher</span>
        </div>
      </div>
    </div>
  );
}
