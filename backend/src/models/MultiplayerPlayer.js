const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MultiplayerPlayer = sequelize.define('MultiplayerPlayer', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    roomId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'multiplayer_rooms',
            key: 'id'
        }
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    scores: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    currentPhase: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    phaseAttempt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    isReady: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    joinedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'multiplayer_players',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['roomId', 'userId']
        }
    ]
});

module.exports = MultiplayerPlayer;
