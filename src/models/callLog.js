const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CallLog extends Model {}

CallLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    callSessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'call_session_id',
    },
    logLevel: {
      type: DataTypes.STRING(20),
      defaultValue: 'info',
      field: 'log_level',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'CallLog',
    tableName: 'call_logs',
    updatedAt: false, // only track created_at
    indexes: [
      {
        fields: ['call_session_id'],
        name: 'idx_call_logs_session',
      },
    ],
  }
);

module.exports = CallLog;
