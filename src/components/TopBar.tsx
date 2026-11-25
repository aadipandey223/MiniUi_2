import type { RoomSummary, WorkspaceTab } from '../../shared/types.ts';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  activeRoom: RoomSummary | null;
  queueBadgeCount: number;
  onPrimaryAction: () => void;
  onLogoClick: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'workspace', label: 'Send' },
  { id: 'queue', label: 'Queue' },
  { id: 'history', label: 'History' },
  { id: 'security', label: 'Security' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  activeRoom,
  queueBadgeCount,
  onPrimaryAction,
  onLogoClick,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[var(--vb-border)] bg-[var(--vb-surface)]/95 backdrop-blur-xs">
      <div className="max-w-[1120px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onLogoClick();
            onSelectTab('workspace');
          }}
          className="font-display text-lg font-bold tracking-tight text-[var(--vb-ink)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--vb-accent)] rounded select-none"
        >
          VaultBeam
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          className="hidden md:flex items-center gap-7 overflow-x-auto no-scrollbar"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-4 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--vb-accent)] ${
                  isActive
                    ? 'text-[var(--vb-ink)]'
                    : 'text-[var(--vb-ink-2)] hover:text-[var(--vb-ink)]'
                }`}
              >
                <span>{item.label}</span>
                {item.id === 'queue' && queueBadgeCount > 0 && (
                  <span className="ml-1.5 font-mono text-xs tabular-nums text-[var(--vb-ink-muted)]">
                    ({queueBadgeCount})
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--vb-accent)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="min-h-[38px] px-4 py-2 rounded-lg bg-[var(--vb-accent)] hover:bg-[var(--vb-accent-hover)] text-[var(--vb-accent-ink)] text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vb-accent)]"
          >
            {activeRoom ? 'Invite Peer' : 'New Room'}
          </button>
        </div>
      </div>
    </header>
  );
}
