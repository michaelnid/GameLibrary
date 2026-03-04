const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encrypt, decrypt } = require('../config/encryption');

const PlayerProfile = sequelize.define('PlayerProfile', {
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
    avatar: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
    },
    totalGames: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    totalScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    highestSingleGame: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    statsByGameType: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    }
}, {
    tableName: 'player_profiles',
    timestamps: true
});

module.exports = PlayerProfile;
