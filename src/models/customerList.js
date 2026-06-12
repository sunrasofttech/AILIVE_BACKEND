const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CustomerList extends Model {}

CustomerList.init(
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'CustomerList',
    tableName: 'customer_lists',
  }
);

module.exports = CustomerList;
