const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encrypt, decrypt } = require('../config/encryption');

const Player = sequelize.define('Player', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(512),
        allowNull: false,
        get() {
            const raw = this.getDataValue('name');
            return decrypt(raw);
        },
        set(value) {
            this.setDataValue('name', encrypt(value));
        }
    },
    gameId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'games',
            key: 'id'
        }
    },
    profileId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        }
    }
}, {
    tableName: 'players',
    timestamps: true
});

module.exports = Player;
