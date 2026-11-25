export type VaultTheme = 'light' | 'dark' | 'cipher';
export type ExperienceMode = 'simple' | 'advanced';
export type VaultOre = 'aurum' | 'cuprum' | 'malachite' | 'pyrite';

export interface VaultOreSpec {
  id: VaultOre;
  name: string;
  symbol: string;
  notation: string;
  mineral: string;
  lightSwatch: string;
  darkSwatch: string;
}

export const VAULT_ORE_SPECS: VaultOreSpec[] = [
  {
    id: 'aurum',
    name: 'Aurum',
    symbol: 'Au',
    notation: '79',
    mineral: 'Brushed Gold',
    lightSwatch: '#8A6414',
    darkSwatch: '#D6B15B',
  },
  {
    id: 'cuprum',
    name: 'Cuprum',
    symbol: 'Cu',
    notation: '29',
    mineral: 'Native Copper',
    lightSwatch: '#8C4124',
    darkSwatch: '#D48464',
  },
  {
    id: 'malachite',
    name: 'Malachite',
    symbol: 'Ma',
    notation: 'Cu₂CO₃',
    mineral: 'Mineral Jade',
    lightSwatch: '#1B5E42',
    darkSwatch: '#68B894',
  },
  {
    id: 'pyrite',
    name: 'Pyrite',
    symbol: 'Fe',
    notation: 'FeS₂',
    mineral: 'Smoked Brass',
    lightSwatch: '#685D2C',
    darkSwatch: '#C9BC7E',
  },
];

export function getVaultOreSpec(ore: VaultOre): VaultOreSpec {
  return VAULT_ORE_SPECS.find((item) => item.id === ore) ?? VAULT_ORE_SPECS[0];
}

export type MilestoneId =
  | 'first_share'
  | 'private_vault'
  | 'crypto_verified'
  | 'sigil_inspected'
  | 'command_master'
  | 'zen_explorer'
  | 'cipher_awakened';

export interface MilestoneSpec {
  id: MilestoneId;
  title: string;
  description: string;
  secret?: boolean;
}

export const MILESTONE_SPECS: MilestoneSpec[] = [
  {
    id: 'first_share',
    title: 'First File Shared',
    description: 'Added a file into the encrypted peer-to-peer workspace.',
  },
  {
    id: 'private_vault',
    title: 'Private Room Host',
    description: 'Created or joined an isolated private room.',
  },
  {
    id: 'crypto_verified',
    title: 'Verified Transfer',
    description: 'Completed a browser Web Crypto & SHA-256 verification check.',
  },
  {
    id: 'sigil_inspected',
    title: 'Visual Key Check',
    description: 'Inspected your ECDSA P-256 visual key pattern.',
    secret: true,
  },
  {
    id: 'command_master',
    title: 'Quick Commands',
    description: 'Used a slash command inside the Cmd+K command palette.',
    secret: true,
  },
  {
    id: 'zen_explorer',
    title: 'Focus Mode',
    description: 'Entered distraction-free Zen Drop Mode.',
    secret: true,
  },
  {
    id: 'cipher_awakened',
    title: 'Graphite Cipher',
    description: 'Unlocked the hidden Cipher monochrome theme.',
    secret: true,
  },
];

export interface CryptoTriviaItem {
  year: string;
  title: string;
  body: string;
}

export const CRYPTO_TRIVIA: CryptoTriviaItem[] = [
  {
    year: '1976',
    title: 'Diffie-Hellman Key Exchange',
    body: 'Whitfield Diffie and Martin Hellman proved two people can agree on a shared secret over a public channel—the foundation of VaultBeam’s lobby encryption.',
  },
  {
    year: '1985',
    title: 'Zero-Knowledge Proofs',
    body: 'Goldwasser, Micali, and Rackoff introduced proofs that verify you know a password without ever sending the password itself.',
  },
  {
    year: '1998',
    title: 'AES-256-GCM Encryption',
    body: 'Joan Daemen and Vincent Rijmen designed AES. Combined with GCM authentication, every 48 KB file chunk is protected against tampering.',
  },
  {
    year: '1979',
    title: 'Sequential Hash Chains',
    body: 'Chaining each chunk’s SHA-256 hash ensures even a single missing or modified byte is detected before the file is saved.',
  },
  {
    year: '2009',
    title: 'Visual Key Art',
    body: 'Humans spot subtle differences in geometric shapes far more easily than in long hexadecimal strings, making visual fingerprints ideal for quick verification.',
  },
];

export function getNextTheme(current: VaultTheme, cipherUnlocked: boolean): VaultTheme {
  if (current === 'light') return 'dark';
  if (current === 'dark') return cipherUnlocked ? 'cipher' : 'light';
  return 'light';
}

export function getThemeLabel(theme: VaultTheme): string {
  if (theme === 'dark') return 'Dark';
  if (theme === 'cipher') return 'Cipher';
  return 'Light';
}

/** Subtle optional Web Audio harmonic cue — silently ignored if blocked or muted */
export function playSubtleChime(kind: 'unlock' | 'pulse' | 'tick', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes =
      kind === 'unlock'
        ? [523.25, 659.25, 783.99]
        : kind === 'pulse'
          ? [440, 587.33]
          : [523.25];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.028, now + idx * 0.055 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.055 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.24);
    });

    setTimeout(() => {
      void ctx.close();
    }, 600);
  } catch {
    // Ignore audio context restrictions gracefully
  }
}

export interface KeyArtCell {
  row: number;
  col: number;
  intensity: 0 | 1 | 2 | 3;
}

/** Deterministic 9x9 horizontally-symmetric geometric sigil derived from ECDSA public key bytes */
export function buildKeyArtGrid(publicKeyBase64: string): KeyArtCell[] {
  const cells: KeyArtCell[] = [];
  let rawBytes: Uint8Array;
  try {
    const bin = atob(publicKeyBase64);
    rawBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) rawBytes[i] = bin.charCodeAt(i);
  } catch {
    rawBytes = new Uint8Array(45);
  }

  const size = 9;
  const half = 5;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < half; col++) {
      const byteIdx = (row * half + col) % Math.max(1, rawBytes.length);
      const val = rawBytes[byteIdx] ?? 0;
      const intensity = ((val ^ (row * 17 + col * 31)) % 4) as 0 | 1 | 2 | 3;
      cells.push({ row, col, intensity });
      const mirroredCol = size - 1 - col;
      if (mirroredCol !== col) {
        cells.push({ row, col: mirroredCol, intensity });
      }
    }
  }
  return cells;
}

/** Compute exact Shannon entropy in bits/byte (ideal CSPRNG approaches 8.00 bits/byte) */
export function calculateShannonEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const freq = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) {
    freq[bytes[i]]++;
  }
  let entropy = 0;
  const len = bytes.length;
  for (let i = 0; i < 256; i++) {
    if (freq[i] === 0) continue;
    const p = freq[i] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
