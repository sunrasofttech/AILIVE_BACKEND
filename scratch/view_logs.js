const { CallLog, CallSession } = require('../src/models');

async function checkRecentLogs() {
  try {
    console.log('Fetching last 10 call sessions...');
    const sessions = await CallSession.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
    });

    for (const session of sessions) {
      console.log(`\nSession ID: ${session.id}`);
      console.log(`Status: ${session.status}, Direction: ${session.direction}`);
      console.log(`Token: ${session.wsSessionToken}`);
      console.log(`Call UUID: ${session.vobizCallUuid}`);
      console.log(`Created At: ${session.createdAt}`);

      const logs = await CallLog.findAll({
        where: { callSessionId: session.id },
        order: [['createdAt', 'ASC']],
      });

      console.log('Logs:');
      if (logs.length === 0) {
        console.log('  (No logs for this session)');
      }
      for (const log of logs) {
        console.log(`  [${log.logLevel.toUpperCase()}] ${log.message}`);
      }
    }
  } catch (err) {
    console.error('Error querying logs:', err.message);
  } finally {
    process.exit(0);
  }
}

checkRecentLogs();
