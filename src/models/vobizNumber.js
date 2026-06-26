const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class VobizNumber extends Model {}

VobizNumber.init(
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
    number: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active', // active, inactive
    },
    providerData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'provider_data',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'agent_id',
    },
  },
  {
    sequelize,
    modelName: 'VobizNumber',
    tableName: 'vobiz_numbers',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'number'],
        name: 'uq_merchant_number',
      },
    ],
  }
);

module.exports = VobizNumber;
