const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransitionStatus, getAllowedTransitions } = require('../statusRules');

test('status Menunggu hanya bisa ke Dikonfirmasi atau Dibatalkan', () => {
  assert.deepEqual(getAllowedTransitions('Menunggu'), ['Dikonfirmasi', 'Dibatalkan']);
  assert.equal(canTransitionStatus('Menunggu', 'Dikonfirmasi'), true);
  assert.equal(canTransitionStatus('Menunggu', 'Dibatalkan'), true);
  assert.equal(canTransitionStatus('Menunggu', 'Selesai'), false);
});

test('status Dikonfirmasi hanya bisa ke Selesai atau Dibatalkan', () => {
  assert.deepEqual(getAllowedTransitions('Dikonfirmasi'), ['Selesai', 'Dibatalkan']);
  assert.equal(canTransitionStatus('Dikonfirmasi', 'Selesai'), true);
  assert.equal(canTransitionStatus('Dikonfirmasi', 'Dibatalkan'), true);
  assert.equal(canTransitionStatus('Dikonfirmasi', 'Menunggu'), false);
});

test('status akhir tidak bisa diubah lagi', () => {
  assert.deepEqual(getAllowedTransitions('Selesai'), []);
  assert.deepEqual(getAllowedTransitions('Dibatalkan'), []);
  assert.equal(canTransitionStatus('Selesai', 'Dibatalkan'), false);
  assert.equal(canTransitionStatus('Dibatalkan', 'Menunggu'), false);
});
