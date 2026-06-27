const sequelize = require('../src/config/database');
const { Sequelize } = require('sequelize');

async function run() {
  try {
    console.log(`Connecting to database: ${sequelize.config.database} on ${sequelize.config.host}...`);
    await sequelize.authenticate();
    console.log('Database connected.');

    const queryInterface = sequelize.getQueryInterface();
    const tableInfo = await queryInterface.describeTable('call_sessions');

    if (tableInfo.direction) {
      console.log('Column "direction" already exists in "call_sessions" table.');
    } else {
      console.log('Adding "direction" column to "call_sessions" table...');
      await queryInterface.addColumn('call_sessions', 'direction', {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'outbound'
      });
      console.log('[SUCCESS] "direction" column added successfully.');
    }
  } catch (err) {
    console.error('Error during database update:', err.message);
  }
  process.exit(0);
}

run();
