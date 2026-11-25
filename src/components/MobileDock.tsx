import { History, ListOrdered, Send, ShieldCheck } from 'lucide-react';
import type { WorkspaceTab } from '../../shared/types.ts';

interface MobileDockProps {
  activeTab: WorkspaceTab;
  queueBadgeCount: number;
  onSelectTab: (tab: WorkspaceTab) => void;
}

const MOBILE_TABS: {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'workspace', label: 'Send', icon: Send },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'history', label: 'History', icon: History },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

export function MobileDock({ activeTab, queueBadgeCount, onSelectTab }: MobileDockProps) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--vb-border)] bg-[var(--vb-surface)]/95 backdrop-blur-xs pb-safe"
    >
      <div className="grid grid-cols-4 h-14">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 cursor-pointer ${
                isActive ? 'text-[var(--vb-ink)]' : 'text-[var(--vb-ink-muted)] hover:text-[var(--vb-ink)]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.id === 'queue' && queueBadgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-3 font-mono text-[10px] font-semibold tabular-nums text-[var(--vb-ink)]">
                    {queueBadgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-[var(--vb-accent)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
