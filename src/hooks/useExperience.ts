import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNextTheme,
  MILESTONE_SPECS,
  playSubtleChime,
  type ExperienceMode,
  type MilestoneId,
  type VaultOre,
  type VaultTheme,
} from '../lib/experience.ts';

const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

function readInitialTheme(): VaultTheme {
  try {
    const saved = localStorage.getItem('vaultbeam_mono_theme');
    if (saved === 'dark' || saved === 'cipher' || saved === 'light') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

function readInitialMode(): ExperienceMode {
  try {
    const saved = localStorage.getItem('vaultbeam_ui_mode');
    if (saved === 'advanced' || saved === 'simple') {
      return saved;
    }
  } catch {
    // Ignore
  }
  return 'simple';
}

function readInitialCipherUnlocked(): boolean {
  try {
    return (
      localStorage.getItem('vaultbeam_cipher_unlocked') === '1' ||
      localStorage.getItem('vaultbeam_mono_theme') === 'cipher'
    );
  } catch {
    return false;
  }
}

function readInitialMilestones(): MilestoneId[] {
  try {
    const raw = localStorage.getItem('vaultbeam_milestones');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const valid = new Set(MILESTONE_SPECS.map((m) => m.id));
      return parsed.filter(
        (item): item is MilestoneId => typeof item === 'string' && valid.has(item as MilestoneId)
      );
    }
  } catch {
    // Ignore
  }
  return [];
}

function readInitialVaultOre(): VaultOre {
  try {
    const saved = localStorage.getItem('vaultbeam_vault_ore');
    if (saved === 'aurum' || saved === 'cuprum' || saved === 'malachite' || saved === 'pyrite') {
      return saved;
    }
  } catch {
    // Ignore
  }
  return 'aurum';
}

function readInitialIntroVisible(): boolean {
  if (typeof window !== 'undefined') {
    if (/^\/room\/[A-Za-z0-9]{6,16}\/?$/.test(window.location.pathname)) {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return false;
  }
  return true;
}

export function useExperience(params: {
  inPrivateRoom: boolean;
  onNotify: (message: string, tone?: 'info' | 'success' | 'warning' | 'error') => void;
  onOpenCommandPalette: () => void;
}) {
  const { inPrivateRoom, onNotify, onOpenCommandPalette } = params;

  const [theme, setThemeState] = useState<VaultTheme>(readInitialTheme);
  const [vaultOre, setVaultOreState] = useState<VaultOre>(readInitialVaultOre);
  const [mode, setModeState] = useState<ExperienceMode>(readInitialMode);
  const [showIntro, setShowIntro] = useState<boolean>(readInitialIntroVisible);
  const [cipherUnlocked, setCipherUnlocked] = useState<boolean>(readInitialCipherUnlocked);
  const [zenMode, setZenMode] = useState(false);
  const [matrixBackdrop, setMatrixBackdrop] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [milestones, setMilestones] = useState<MilestoneId[]>(readInitialMilestones);

  const logoTapTimestampsRef = useRef<number[]>([]);
  const konamiIndexRef = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);
  const milestonesRef = useRef<MilestoneId[]>(milestones);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    milestonesRef.current = milestones;
  }, [milestones]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
    try {
      localStorage.setItem('vaultbeam_mono_theme', theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  // Apply Mineral / Ore chemistry palette strictly while inside a Private Room
  useEffect(() => {
    const root = document.documentElement;
    if (inPrivateRoom) {
      root.setAttribute('data-vault-ore', vaultOre);
    } else {
      root.removeAttribute('data-vault-ore');
    }
    try {
      localStorage.setItem('vaultbeam_vault_ore', vaultOre);
    } catch {
      // Ignore
    }
  }, [inPrivateRoom, vaultOre]);

  const setVaultOre = useCallback((next: VaultOre) => {
    setVaultOreState(next);
  }, []);

  const setMode = useCallback((next: ExperienceMode) => {
    setModeState(next);
    try {
      localStorage.setItem('vaultbeam_ui_mode', next);
    } catch {
      // Ignore
    }
  }, []);

  const unlockMilestone = useCallback(
    (id: MilestoneId, silent = false) => {
      if (milestonesRef.current.includes(id)) return;
      const next = [...milestonesRef.current, id];
      milestonesRef.current = next;
      setMilestones(next);
      try {
        localStorage.setItem('vaultbeam_milestones', JSON.stringify(next));
      } catch {
        // Ignore
      }
      const spec = MILESTONE_SPECS.find((m) => m.id === id);
      if (spec && !silent) {
        playSubtleChime('tick', soundEnabledRef.current);
        onNotify(`Milestone: ${spec.title}`, 'success');
      }
    },
    [onNotify]
  );

  const setTheme = useCallback((next: VaultTheme) => {
    setThemeState(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((curr) => getNextTheme(curr, cipherUnlocked));
  }, [cipherUnlocked]);

  const activateCipherSecret = useCallback(
    (source: 'konami' | 'logo' | 'command') => {
      setCipherUnlocked(true);
      try {
        localStorage.setItem('vaultbeam_cipher_unlocked', '1');
      } catch {
        // Ignore
      }
      setThemeState((curr) => (curr === 'cipher' && source === 'command' ? 'light' : 'cipher'));
      playSubtleChime('unlock', soundEnabledRef.current);
      unlockMilestone('cipher_awakened', true);
      onNotify(
        source === 'konami'
          ? 'Cipher monochrome theme unlocked'
          : source === 'logo'
            ? 'Cipher theme unlocked via emblem cadence'
            : 'Cipher theme toggled',
        'success'
      );
    },
    [onNotify, unlockMilestone]
  );

  const registerLogoTap = useCallback(() => {
    const now = Date.now();
    const recent = logoTapTimestampsRef.current.filter((t) => now - t < 1800);
    recent.push(now);
    logoTapTimestampsRef.current = recent;

    if (recent.length >= 5) {
      logoTapTimestampsRef.current = [];
      activateCipherSecret('logo');
      return true;
    }
    return false;
  }, [activateCipherSecret]);

  const toggleZenMode = useCallback(() => {
    setZenMode((prev) => {
      const next = !prev;
      if (next) {
        unlockMilestone('zen_explorer');
      }
      return next;
    });
  }, [unlockMilestone]);

  const toggleMatrixBackdrop = useCallback(() => {
    setMatrixBackdrop((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      if (e.key === 'Escape' && zenMode) {
        setZenMode(false);
        return;
      }

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const expected = KONAMI_SEQUENCE[konamiIndexRef.current];
      const pressed = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (pressed === expected) {
        konamiIndexRef.current += 1;
        if (konamiIndexRef.current === KONAMI_SEQUENCE.length) {
          konamiIndexRef.current = 0;
          activateCipherSecret('konami');
        }
      } else {
        konamiIndexRef.current = pressed === KONAMI_SEQUENCE[0] ? 1 : 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activateCipherSecret, onOpenCommandPalette, zenMode]);

  return {
    theme,
    setTheme,
    cycleTheme,
    vaultOre,
    setVaultOre,
    mode,
    setMode,
    showIntro,
    setShowIntro,
    cipherUnlocked,
    activateCipherSecret,
    registerLogoTap,
    zenMode,
    setZenMode,
    toggleZenMode,
    matrixBackdrop,
    toggleMatrixBackdrop,
    soundEnabled,
    setSoundEnabled,
    milestones,
    unlockMilestone,
  };
}
