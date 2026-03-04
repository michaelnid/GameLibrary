const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Score = sequelize.define('Score', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    playerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'players',
            key: 'id'
        }
    },
    category: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    value: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'scores',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['playerId', 'category']
        }
    ]
});

module.exports = Score;
