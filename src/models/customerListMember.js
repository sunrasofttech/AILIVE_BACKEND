const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CustomerListMember extends Model {}

CustomerListMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    customerListId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'customer_list_id',
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'customer_id',
    },
  },
  {
    sequelize,
    modelName: 'CustomerListMember',
    tableName: 'customer_list_members',
    timestamps: true,
    updatedAt: false, // only track created_at
    indexes: [
      {
        unique: true,
        fields: ['customer_list_id', 'customer_id'],
        name: 'uq_list_customer',
      },
    ],
  }
);

module.exports = CustomerListMember;
