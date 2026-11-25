import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VAULT_ORE_SPECS,
  buildKeyArtGrid,
  calculateShannonEntropy,
  getNextTheme,
  getThemeLabel,
  getVaultOreSpec,
} from './experience.ts';

test('theme cycling respects locked and unlocked cipher states', () => {
  assert.equal(getNextTheme('light', false), 'dark');
  assert.equal(getNextTheme('dark', false), 'light');
  assert.equal(getNextTheme('dark', true), 'cipher');
  assert.equal(getNextTheme('cipher', true), 'light');
  assert.equal(getThemeLabel('light'), 'Light');
  assert.equal(getThemeLabel('dark'), 'Dark');
  assert.equal(getThemeLabel('cipher'), 'Cipher');
});

test('private room mineral ore specs provide Aurum, Cuprum, Malachite, and Pyrite', () => {
  assert.equal(VAULT_ORE_SPECS.length, 4);
  assert.equal(getVaultOreSpec('aurum').symbol, 'Au');
  assert.equal(getVaultOreSpec('aurum').notation, '79');
  assert.equal(getVaultOreSpec('cuprum').symbol, 'Cu');
  assert.equal(getVaultOreSpec('malachite').notation, 'Cu₂CO₃');
  assert.equal(getVaultOreSpec('pyrite').notation, 'FeS₂');
});

test('buildKeyArtGrid generates deterministic 9x9 horizontally symmetric cells', () => {
  const gridA = buildKeyArtGrid('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE');
  const gridB = buildKeyArtGrid('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE');
  assert.equal(gridA.length, 81);
  assert.deepEqual(gridA, gridB);

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 4; col++) {
      const left = gridA.find((c) => c.row === row && c.col === col);
      const right = gridA.find((c) => c.row === row && c.col === 8 - col);
      assert.ok(left && right);
      assert.equal(left.intensity, right.intensity);
    }
  }
});

test('calculateShannonEntropy returns 0 for constant bytes and ~8 for uniform bytes', () => {
  assert.equal(calculateShannonEntropy(new Uint8Array(0)), 0);
  assert.equal(calculateShannonEntropy(new Uint8Array(64).fill(42)), 0);

  const uniform = new Uint8Array(256);
  for (let i = 0; i < 256; i++) uniform[i] = i;
  assert.equal(calculateShannonEntropy(uniform), 8);
});
