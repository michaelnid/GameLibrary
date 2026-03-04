const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { User } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { DEFAULT_GAME_TYPE } = require('../games');
const { safeResolveWithin } = require('../utils/pathSafety');

const router = express.Router();
const MIN_PASSWORD_LENGTH = 5;
const MAX_PASSWORD_LENGTH = 128;
const USERNAME_REGEX = /^[A-Za-z0-9._-]{2,64}$/;

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for avatar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const suffix = crypto.randomBytes(6).toString('hex');
        const name = `avatar_${Date.now()}_${suffix}${ext}`;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Nur Bilddateien erlaubt (jpg, png, gif, webp)'));
        }
    }
});

function auditLog(action, req, details = {}) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const actor = req.userId || 'unknown';
    console.log(`[AUDIT] ${action} | actor=${actor} ip=${ip} ${Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidPassword(value) {
    return typeof value === 'string'
        && value.length >= MIN_PASSWORD_LENGTH
        && value.length <= MAX_PASSWORD_LENGTH;
}

function statsForGameType(user, gameType) {
    const statsByGameType = user.statsByGameType || {};
    const perType = statsByGameType[gameType];
    if (perType) {
        return {
            totalGames: perType.totalGames || 0,
            totalScore: perType.totalScore || 0,
            highestSingleGame: perType.highestSingleGame || 0
        };
    }

    if (Object.keys(statsByGameType).length === 0 && gameType === DEFAULT_GAME_TYPE) {
        return {
            totalGames: user.totalGames,
            totalScore: user.totalScore,
            highestSingleGame: user.highestSingleGame
        };
    }

    return { totalGames: 0, totalScore: 0, highestSingleGame: 0 };
}

function toUserResponse(user, gameType) {
    const stats = statsForGameType(user, gameType || DEFAULT_GAME_TYPE);
    const canLogin = user.canLogin();
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatar: user.avatar,
        multiplayerEnabled: canLogin,
        totalGames: stats.totalGames,
        totalScore: stats.totalScore,
        averageScore: stats.totalGames > 0 ? Math.round(stats.totalScore / stats.totalGames) : 0,
        highestSingleGame: stats.highestSingleGame,
        statsByGameType: user.statsByGameType || {},
        createdAt: user.createdAt
    };
}

// All routes require admin or gamemaster
router.use(authenticate, requireRole('admin', 'gamemaster'));

// GET /api/users - List all users/profiles
router.get('/', async (req, res) => {
    try {
        const gameType = req.query.gameType || DEFAULT_GAME_TYPE;
        const users = await User.findAll({ order: [['displayName', 'ASC']] });
        res.json(users.map(u => toUserResponse(u, gameType)));
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/users - Create user/profile
router.post('/', upload.single('avatar'), async (req, res) => {
    try {
        const displayName = normalizeText(req.body?.displayName);
        const multiplayerEnabled = req.body?.multiplayerEnabled === 'true' || req.body?.multiplayerEnabled === true;

        if (!displayName) {
            return res.status(400).json({ error: 'Anzeigename ist erforderlich' });
        }
        if (displayName.length > 128) {
            return res.status(400).json({ error: 'Anzeigename ist zu lang' });
        }

        const userData = {
            displayName,
            role: 'player',
            avatar: req.file ? req.file.filename : null,
            statsByGameType: {}
        };

        // If multiplayer is enabled, require username + password
        if (multiplayerEnabled) {
            const username = normalizeText(req.body?.username);
            const password = req.body?.password;

            if (!username) {
                return res.status(400).json({ error: 'Benutzername ist für Multiplayer erforderlich' });
            }
            if (!USERNAME_REGEX.test(username)) {
                return res.status(400).json({ error: 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Bindestriche und Unterstriche enthalten (2-64 Zeichen)' });
            }
            if (!password || !isValidPassword(password)) {
                return res.status(400).json({ error: `Passwort muss zwischen ${MIN_PASSWORD_LENGTH} und ${MAX_PASSWORD_LENGTH} Zeichen lang sein` });
            }

            const existing = await User.findByUsername(username);
            if (existing) {
                return res.status(409).json({ error: 'Benutzername bereits vergeben' });
            }

            userData.username = username;
            userData.passwordHash = await bcrypt.hash(password, 12);
        }

        // Admin-only: allow setting role
        if (req.body?.role && ['admin', 'gamemaster', 'player'].includes(req.body.role)) {
            // Only admins can assign admin/gamemaster roles
            const requestingUser = await User.findByPk(req.userId);
            if (requestingUser && requestingUser.role === 'admin') {
                userData.role = req.body.role;
            }
        }

        const user = await User.create(userData);

        res.status(201).json(toUserResponse(user));
        auditLog('USER_CREATED', req, { targetUser: user.id, displayName, multiplayerEnabled });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/users/:id - Update user/profile
router.put('/:id', upload.single('avatar'), async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        const displayName = normalizeText(req.body?.displayName);
        const multiplayerEnabled = req.body?.multiplayerEnabled;
        const password = req.body?.password;
        const changedFields = [];

        if (displayName) {
            if (displayName.length > 128) {
                return res.status(400).json({ error: 'Anzeigename ist zu lang' });
            }
            user.displayName = displayName;
            changedFields.push('displayName');
        }

        // Handle avatar upload
        if (req.file) {
            // Delete old avatar
            if (user.avatar) {
                const oldAvatar = safeResolveWithin(uploadsDir, user.avatar);
                if (oldAvatar && fs.existsSync(oldAvatar.path)) fs.unlinkSync(oldAvatar.path);
            }
            user.avatar = req.file.filename;
            changedFields.push('avatar');
        }

        // Handle multiplayer toggle
        if (multiplayerEnabled === 'true' || multiplayerEnabled === true) {
            // Enable multiplayer - need username + password if not already set
            if (!user.canLogin()) {
                const username = normalizeText(req.body?.username);
                if (!username && !user.getDataValue('username')) {
                    return res.status(400).json({ error: 'Benutzername ist für Multiplayer erforderlich' });
                }
                if (username) {
                    if (!USERNAME_REGEX.test(username)) {
                        return res.status(400).json({ error: 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Bindestriche und Unterstriche enthalten (2-64 Zeichen)' });
                    }
                    const existing = await User.findByUsername(username);
                    if (existing && existing.id !== user.id) {
                        return res.status(409).json({ error: 'Benutzername bereits vergeben' });
                    }
                    user.username = username;
                    changedFields.push('username');
                }
                if (!password && !user.getDataValue('passwordHash')) {
                    return res.status(400).json({ error: 'Passwort ist für Multiplayer erforderlich' });
                }
            }
        } else if (multiplayerEnabled === 'false' || multiplayerEnabled === false) {
            // Disable multiplayer - clear credentials
            user.username = null;
            user.setDataValue('username', null);
            user.setDataValue('usernameHash', null);
            user.passwordHash = null;
            changedFields.push('multiplayer_disabled');
        }

        // Handle password change
        if (password !== undefined && password !== null && password !== '') {
            if (!isValidPassword(password)) {
                return res.status(400).json({ error: `Passwort muss zwischen ${MIN_PASSWORD_LENGTH} und ${MAX_PASSWORD_LENGTH} Zeichen lang sein` });
            }
            user.passwordHash = await bcrypt.hash(password, 12);
            changedFields.push('password');
        }

        // Handle role change (admin only)
        if (req.body?.role && ['admin', 'gamemaster', 'player'].includes(req.body.role)) {
            const requestingUser = await User.findByPk(req.userId);
            if (requestingUser && requestingUser.role === 'admin') {
                user.role = req.body.role;
                changedFields.push('role');
            }
        }

        await user.save();

        res.json(toUserResponse(user));
        auditLog('USER_UPDATED', req, { targetUser: user.id, changedFields: changedFields.join(',') });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        if (parseInt(req.params.id) === req.userId) {
            return res.status(400).json({ error: 'Eigenen Account kann man nicht löschen' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        // Delete avatar file
        if (user.avatar) {
            const avatarFile = safeResolveWithin(uploadsDir, user.avatar);
            if (avatarFile && fs.existsSync(avatarFile.path)) fs.unlinkSync(avatarFile.path);
        }

        await user.destroy();
        auditLog('USER_DELETED', req, { targetUser: user.id, displayName: user.displayName });
        res.json({ message: 'Benutzer gelöscht' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Error handler for multer
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Datei zu groß (max. 5MB)' });
        }
        return res.status(400).json({ error: 'Ungültiger Datei-Upload' });
    }

    if (err && err.message && err.message.includes('Nur Bilddateien erlaubt')) {
        return res.status(400).json({ error: err.message });
    }

    return next(err);
});

module.exports = router;
