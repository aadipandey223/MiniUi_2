import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  formatCountdown,
  formatDuration,
  formatSpeed,
  getFileKindLabel,
  maskSensitive,
} from './format.ts';

test('formatBytes and formatSpeed handle edge cases and units accurately', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatSpeed(0), '0.0 KB/s');
  assert.equal(formatSpeed(512 * 1024), '512.0 KB/s');
  assert.equal(formatSpeed(2 * 1024 * 1024), '2.00 MB/s');
});

test('formatCountdown and formatDuration format time properly', () => {
  assert.equal(formatDuration(12.34), '12.3s');
  assert.equal(formatDuration(125), '2m 5s');
  assert.deepEqual(formatCountdown(null, 1000), {
    label: 'Persistent',
    isUrgent: false,
    isExpired: false,
  });
  assert.deepEqual(formatCountdown(1000, 1000), {
    label: 'Expired',
    isUrgent: true,
    isExpired: true,
  });
  const urgent = formatCountdown(45_000, 10_000);
  assert.equal(urgent.label, '35s');
  assert.equal(urgent.isUrgent, true);
});

test('maskSensitive preserves extensions and hides names in incognito', () => {
  assert.equal(maskSensitive('report.pdf', false, 'file'), 'report.pdf');
  assert.equal(maskSensitive('report.pdf', true, 'file'), '••••••••.pdf');
  assert.equal(maskSensitive('AB12CD34E', true, 'code'), '•••••••••');
  assert.equal(maskSensitive('Alice', true, 'peer'), 'Masked Peer');
});

test('getFileKindLabel classifies common MIME types and extensions', () => {
  assert.equal(getFileKindLabel('image/png', 'photo.png'), 'Image');
  assert.equal(getFileKindLabel('', 'archive.tar.gz'), 'Archive');
  assert.equal(getFileKindLabel('', 'app.tsx'), 'Code');
  assert.equal(getFileKindLabel('application/pdf', 'doc.pdf'), 'PDF');
});
