const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const { syncNow, isZohoActive } = require('../services/zohoSync.service');

/**
 * The safety net under Zoho's webhook: even with no workflow rules set up (or a
 * webhook that never arrives) stock catches up with Zoho Books on this schedule.
 */
function startZohoSyncJob() {
  if (!cron.validate(env.zoho.syncCron)) {
    logger.warn(`ZOHO_SYNC_CRON "${env.zoho.syncCron}" is not a valid cron expression - Zoho sync job not started`);
    return;
  }
  cron.schedule(env.zoho.syncCron, async () => {
    if (!(await isZohoActive().catch(() => false))) return;
    syncNow({ reason: 'scheduled' }).catch(() => {});
  });
  logger.info(`Zoho Books stock sync scheduled (${env.zoho.syncCron})`);
}

module.exports = { startZohoSyncJob };
