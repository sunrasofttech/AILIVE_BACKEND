const sequelize = require('../src/config/database');

async function run() {
  try {
    console.log('Altering vobiz_numbers table to add agent_id...');
    await sequelize.query(`
      ALTER TABLE vobiz_numbers
      ADD COLUMN agent_id CHAR(36) NULL REFERENCES agents(id) ON DELETE SET NULL ON UPDATE CASCADE;
    `);
    console.log('Successfully altered vobiz_numbers table.');
  } catch (err) {
    console.log('Error altering table or column already exists:', err.message);
  }
  process.exit(0);
}

run();
