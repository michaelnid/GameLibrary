const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../config/database');
const { encrypt, decrypt } = require('../config/encryption');

function computeUsernameHash(username) {
    if (!username) return null;
    const key = process.env.ENCRYPTION_KEY || '';
    return crypto.createHmac('sha256', key).update(username.toLowerCase()).digest('hex');
}

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(512),
        allowNull: true,
        unique: true,
        get() {
            const raw = this.getDataValue('username');
            if (!raw) return null;
            return decrypt(raw);
        },
        set(value) {
            if (value) {
                this.setDataValue('username', encrypt(value));
                this.setDataValue('usernameHash', computeUsernameHash(value));
            } else {
                this.setDataValue('username', null);
                this.setDataValue('usernameHash', null);
            }
        }
    },
    usernameHash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    displayName: {
        type: DataTypes.STRING(512),
        allowNull: false,
        get() {
            const raw = this.getDataValue('displayName');
            return decrypt(raw);
        },
        set(value) {
            this.setDataValue('displayName', encrypt(value));
        }
    },
    passwordHash: {
        type: DataTypes.STRING(512),
        allowNull: true,
        defaultValue: null
    },
    role: {
        type: DataTypes.ENUM('admin', 'gamemaster', 'player'),
        allowNull: false,
        defaultValue: 'player'
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
    tableName: 'users',
    timestamps: true
});

// Fast username lookup using deterministic hash, with decryption verification
User.findByUsername = async function (username) {
    const hash = computeUsernameHash(username);

    // Try hash-based lookup first (O(1))
    const byHash = await User.findOne({ where: { usernameHash: hash } });
    if (byHash && byHash.username === username) {
        return byHash;
    }

    // Fallback for legacy rows without usernameHash
    const users = await User.findAll();
    return users.find(u => u.username === username) || null;
};

// Backfill usernameHash for existing users on startup
User.backfillUsernameHashes = async function () {
    const users = await User.findAll();
    let updated = 0;
    for (const user of users) {
        if (user.getDataValue('username') && !user.getDataValue('usernameHash')) {
            const hash = computeUsernameHash(user.username);
            await User.update({ usernameHash: hash }, { where: { id: user.id }, individualHooks: false });
            updated++;
        }
    }
    if (updated > 0) {
        console.log(`Backfilled usernameHash for ${updated} user(s).`);
    }
};

// Check if user can log in (has credentials)
User.prototype.canLogin = function () {
    return !!(this.getDataValue('username') && this.getDataValue('passwordHash'));
};

module.exports = User;
