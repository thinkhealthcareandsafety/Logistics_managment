// Convenience script for local development when no standalone MongoDB (or Docker)
// is installed: spins up a real mongod binary (downloaded once, then cached) bound
// to the default local port so MONGODB_URI=mongodb://127.0.0.1:27017/... just works.
// Data is kept on disk in server/.dev-data, so shipments and stock survive a restart
// or a closed window. Delete that folder for a clean start. For a real deployment,
// point MONGODB_URI at a real MongoDB instance (Atlas, a managed service, etc.).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const logger = require('../config/logger');

const DB_PATH = path.resolve(__dirname, '../../.dev-data');

(async () => {
  fs.mkdirSync(DB_PATH, { recursive: true });
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017, dbName: 'logistics-tracker', dbPath: DB_PATH, storageEngine: 'wiredTiger' },
  });
  logger.info(`Local dev MongoDB running at ${mongod.getUri()} (data in ${DB_PATH})`);
  logger.info('Keep this process running while you develop. Ctrl+C to stop - data is kept.');

  const shutdown = async () => {
    // doCleanup false: never delete the data folder on the way out.
    await mongod.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {}); // keep process alive
})();
