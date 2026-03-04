const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MultiplayerRoom = sequelize.define('MultiplayerRoom', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    code: {
        type: DataTypes.STRING(4),
        allowNull: false,
        unique: true
    },
    gameType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'kniffel'
    },
    status: {
        type: DataTypes.ENUM('waiting', 'playing', 'completed'),
        allowNull: false,
        defaultValue: 'waiting'
    },
    maxPlayers: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 4
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    currentTurnUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    turnOrder: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
    },
    diceState: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'multiplayer_rooms',
    timestamps: true
});

module.exports = MultiplayerRoom;
