const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encrypt, decrypt } = require('../config/encryption');

const Game = sequelize.define('Game', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    gameNumber: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true
    },
    name: {
        type: DataTypes.STRING(512),
        allowNull: true,
        get() {
            const raw = this.getDataValue('name');
            if (!raw) return null;
            return decrypt(raw);
        },
        set(value) {
            this.setDataValue('name', value ? encrypt(value) : null);
        }
    },
    status: {
        type: DataTypes.ENUM('active', 'completed'),
        allowNull: false,
        defaultValue: 'active'
    },
    gameType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'kniffel'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'games',
    timestamps: true
});

module.exports = Game;
