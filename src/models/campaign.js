const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Campaign extends Model {}

Campaign.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    vobizNumberId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'vobiz_number_id',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'agent_id',
    },
    customerListId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'customer_list_id',
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_time',
    },
    intervalBetweenCalls: {
      type: DataTypes.INTEGER,
      defaultValue: 5, // in seconds
      field: 'interval_between_calls',
    },
    maxConcurrentCalls: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'max_concurrent_calls',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft', // draft, scheduled, running, paused, completed, failed
    },
  },
  {
    sequelize,
    modelName: 'Campaign',
    tableName: 'campaigns',
  }
);

module.exports = Campaign;
