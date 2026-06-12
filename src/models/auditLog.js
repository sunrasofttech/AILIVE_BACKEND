const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class AuditLog extends Model {}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true, // system actions might not have user_id
      field: 'user_id',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    tableName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'table_name',
    },
    recordId: {
      type: DataTypes.STRING(36),
      allowNull: true,
      field: 'record_id',
    },
    oldValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'old_values',
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'new_values',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false, // only track created_at
  }
);

module.exports = AuditLog;
