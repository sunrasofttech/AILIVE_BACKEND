const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CampaignCustomer extends Model {}

CampaignCustomer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'campaign_id',
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'customer_id',
    },
    callStatus: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending', // pending, calling, completed, failed, retrying
      field: 'call_status',
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'retry_count',
    },
    lastCallTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_call_time',
    },
  },
  {
    sequelize,
    modelName: 'CampaignCustomer',
    tableName: 'campaign_customers',
    indexes: [
      {
        unique: true,
        fields: ['campaign_id', 'customer_id'],
        name: 'uq_campaign_customer',
      },
      {
        fields: ['campaign_id', 'call_status'],
        name: 'idx_campaign_status',
      },
    ],
  }
);

module.exports = CampaignCustomer;
