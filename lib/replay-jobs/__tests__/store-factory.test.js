/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createReplayJobStoreFromEnv,
  normalizeJobStoreKind,
} = require('../store-factory');

describe('Replay job store factory', () => {
  it('defaults to the SQLite replay job store', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-store-factory-'));
    const store = createReplayJobStoreFromEnv({
      env: {
        LIGHTHOUSE_DB_PATH: path.join(tempDir, 'jobs.sqlite'),
      },
    });

    try {
      expect(store.dbPath).toBe(path.join(tempDir, 'jobs.sqlite'));
    } finally {
      store.close();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('normalizes supported store kinds and rejects unknown values', () => {
    expect(normalizeJobStoreKind()).toBe('sqlite');
    expect(normalizeJobStoreKind(' SQLITE ')).toBe('sqlite');
    expect(normalizeJobStoreKind('azure-sql')).toBe('azure-sql');
    expect(() => normalizeJobStoreKind('postgres')).toThrow(
      'Unsupported LIGHTHOUSE_JOB_STORE "postgres"'
    );
  });
});
