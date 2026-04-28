/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

function createMockRequest({ body, method = 'GET', query = {} } = {}) {
  return {
    body,
    method,
    query,
  };
}

function createMockResponse() {
  const headers = {};

  return {
    body: null,
    headers,
    statusCode: null,
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

function createTempReplayEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-api-'));

  return {
    cleanup: () => {
      fs.rmSync(tempDir, { force: true, recursive: true });
    },
    env: {
      KAFKA_BROKERS: 'localhost:19092',
      LIGHTHOUSE_DB_PATH: path.join(tempDir, 'jobs.sqlite'),
    },
  };
}

module.exports = {
  createMockRequest,
  createMockResponse,
  createTempReplayEnvironment,
};
