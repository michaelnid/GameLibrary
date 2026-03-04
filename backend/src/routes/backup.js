const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game, Player, Score, User } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { DEFAULT_GAME_TYPE } = require('../games');
const { sanitizeFilename, safeResolveWithin } = require('../utils/pathSafety');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));

function auditLog(action, req, details = {}) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const actor = req.userId || 'unknown';
    console.log(`[AUDIT] ${action} | actor=${actor} ip=${ip} ${Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

function inferMimeType(filename) {
    const ext = path.extname(filename || '').toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

function toSafeAvatarExt(filename) {
    const ext = path.extname(filename || '').toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.bin';
}

// All routes require admin
router.use(authenticate, requireRole('admin'));

// GET /api/backup/export - Download decrypted JSON backup
router.get('/export', async (req, res) => {
    try {
        const games = await Game.findAll();
        const players = await Player.findAll();
        const scores = await Score.findAll();
        const users = await User.findAll();
        const avatarFiles = [];

        for (const user of users) {
            if (!user.avatar) continue;

            const avatarFile = safeResolveWithin(uploadsDir, user.avatar);
            if (!avatarFile || !fs.existsSync(avatarFile.path)) continue;

            avatarFiles.push({
                filename: avatarFile.filename,
                mimeType: inferMimeType(avatarFile.filename),
                dataBase64: fs.readFileSync(avatarFile.path).toString('base64')
            });
        }

        const backup = {
            exportDate: new Date().toISOString(),
            version: '3.0',
            app: 'game-library',
            data: {
                users: users.map((user) => ({
                    id: user.id,
                    displayName: user.displayName,
                    avatar: user.avatar,
                    role: user.role,
                    totalGames: user.totalGames,
                    totalScore: user.totalScore,
                    highestSingleGame: user.highestSingleGame,
                    statsByGameType: user.statsByGameType || {},
                    // Note: username/password NOT exported for security
                    multiplayerEnabled: user.canLogin(),
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                })),
                games: games.map((game) => ({
                    id: game.id,
                    gameNumber: game.gameNumber,
                    gameType: game.gameType || DEFAULT_GAME_TYPE,
                    name: game.name,
                    status: game.status,
                    createdAt: game.createdAt,
                    updatedAt: game.updatedAt,
                    completedAt: game.completedAt
                })),
                players: players.map((player) => ({
                    id: player.id,
                    name: player.name,
                    gameId: player.gameId,
                    profileId: player.profileId,
                    createdAt: player.createdAt,
                    updatedAt: player.updatedAt
                })),
                scores: scores.map((score) => ({
                    id: score.id,
                    playerId: score.playerId,
                    category: score.category,
                    value: score.value,
                    createdAt: score.createdAt,
                    updatedAt: score.updatedAt
                })),
                avatarFiles
            }
        };

        const filename = `game-library-backup-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        auditLog('BACKUP_EXPORT', req, { games: games.length, users: users.length, avatars: avatarFiles.length });
        res.json(backup);
    } catch (err) {
        console.error('Backup export error:', err);
        res.status(500).json({ error: 'Export fehlgeschlagen' });
    }
});

// POST /api/backup/import - Upload JSON backup and re-encrypt
router.post('/import', upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Keine Backup-Datei hochgeladen' });
        }

        if (req.file.originalname && !req.file.originalname.toLowerCase().endsWith('.json')) {
            return res.status(400).json({ error: 'Ungültiger Dateityp. Bitte JSON-Backup hochladen.' });
        }

        const backup = JSON.parse(req.file.buffer.toString('utf8'));
        if (!backup.data) {
            return res.status(400).json({ error: 'Ungültiges Backup-Format' });
        }

        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const avatarNameMap = new Map();
        const writtenAvatarPaths = [];
        const avatarFiles = Array.isArray(backup.data.avatarFiles) ? backup.data.avatarFiles : [];

        for (let index = 0; index < avatarFiles.length; index += 1) {
            const avatarFile = avatarFiles[index];
            if (!avatarFile || !avatarFile.filename || !avatarFile.dataBase64) continue;

            try {
                const originalSafeName = sanitizeFilename(avatarFile.filename);
                if (!originalSafeName) continue;

                const avatarBuffer = Buffer.from(avatarFile.dataBase64, 'base64');
                if (!avatarBuffer || avatarBuffer.length === 0 || avatarBuffer.length > 5 * 1024 * 1024) continue;

                const ext = toSafeAvatarExt(originalSafeName);
                const randomSuffix = crypto.randomBytes(6).toString('hex');
                const newFilename = `avatar_import_${Date.now()}_${index}_${randomSuffix}${ext}`;
                const targetAvatar = safeResolveWithin(uploadsDir, newFilename);
                if (!targetAvatar) continue;

                fs.writeFileSync(targetAvatar.path, avatarBuffer);
                avatarNameMap.set(originalSafeName, targetAvatar.filename);
                writtenAvatarPaths.push(targetAvatar.path);
            } catch (avatarErr) {
                console.error('Failed to restore avatar from backup:', avatarErr);
            }
        }

        const sequelize = require('../config/database');
        const transaction = await sequelize.transaction();

        // Support both old (playerProfiles) and new (users) backup format
        const usersData = Array.isArray(backup.data.users) ? backup.data.users : [];
        const legacyProfiles = Array.isArray(backup.data.playerProfiles) ? backup.data.playerProfiles : [];
        const gamesData = Array.isArray(backup.data.games) ? backup.data.games : [];
        const playersData = Array.isArray(backup.data.players) ? backup.data.players : [];
        const scoresData = Array.isArray(backup.data.scores) ? backup.data.scores : [];

        try {
            await Score.destroy({ where: {}, transaction });
            await Player.destroy({ where: {}, transaction });
            await Game.destroy({ where: {}, transaction });

            const importedUserIds = new Set();

            // Import users from new format
            for (const userData of usersData) {
                const requestedAvatar = sanitizeFilename(userData.avatar);
                const restoredAvatarName = requestedAvatar
                    ? avatarNameMap.get(requestedAvatar)
                    || (() => {
                        const existingAvatar = safeResolveWithin(uploadsDir, requestedAvatar);
                        if (!existingAvatar || !fs.existsSync(existingAvatar.path)) return null;
                        return existingAvatar.filename;
                    })()
                    : null;

                // Don't overwrite the current admin user
                const existingUser = await User.findByPk(userData.id);
                if (existingUser) {
                    existingUser.avatar = restoredAvatarName;
                    existingUser.totalGames = userData.totalGames || 0;
                    existingUser.totalScore = userData.totalScore || 0;
                    existingUser.highestSingleGame = userData.highestSingleGame || 0;
                    existingUser.statsByGameType = userData.statsByGameType || {};
                    await existingUser.save({ transaction });
                    importedUserIds.add(existingUser.id);
                } else {
                    const created = await User.create({
                        id: userData.id,
                        displayName: userData.displayName,
                        avatar: restoredAvatarName,
                        role: userData.role || 'player',
                        totalGames: userData.totalGames || 0,
                        totalScore: userData.totalScore || 0,
                        highestSingleGame: userData.highestSingleGame || 0,
                        statsByGameType: userData.statsByGameType || {}
                    }, { transaction });
                    importedUserIds.add(created.id);
                }
            }

            // Import from legacy playerProfiles format (backward compat)
            for (const profile of legacyProfiles) {
                const requestedAvatar = sanitizeFilename(profile.avatar);
                const restoredAvatarName = requestedAvatar
                    ? avatarNameMap.get(requestedAvatar)
                    || (() => {
                        const existingAvatar = safeResolveWithin(uploadsDir, requestedAvatar);
                        if (!existingAvatar || !fs.existsSync(existingAvatar.path)) return null;
                        return existingAvatar.filename;
                    })()
                    : null;

                const created = await User.create({
                    displayName: profile.name,
                    avatar: restoredAvatarName,
                    role: 'player',
                    totalGames: profile.totalGames || 0,
                    totalScore: profile.totalScore || 0,
                    highestSingleGame: profile.highestSingleGame || 0,
                    statsByGameType: profile.statsByGameType || {}
                }, { transaction });
                importedUserIds.add(created.id);
            }

            for (const game of gamesData) {
                await Game.create({
                    id: game.id,
                    gameNumber: game.gameNumber || null,
                    gameType: game.gameType || DEFAULT_GAME_TYPE,
                    name: game.name,
                    status: game.status,
                    createdBy: req.userId,
                    completedAt: game.completedAt
                }, { transaction });
            }

            for (const player of playersData) {
                const safeProfileId = player.profileId && importedUserIds.has(player.profileId)
                    ? player.profileId
                    : null;

                await Player.create({
                    id: player.id,
                    name: player.name,
                    gameId: player.gameId,
                    profileId: safeProfileId
                }, { transaction });
            }

            for (const score of scoresData) {
                await Score.create({
                    id: score.id,
                    playerId: score.playerId,
                    category: score.category,
                    value: score.value
                }, { transaction });
            }

            await transaction.commit();
            auditLog('BACKUP_IMPORT', req, { games: gamesData.length, users: usersData.length + legacyProfiles.length, scores: scoresData.length, avatars: avatarNameMap.size });
            res.json({ message: 'Backup erfolgreich importiert', avatarsImported: avatarNameMap.size });
        } catch (innerErr) {
            await transaction.rollback();
            for (const avatarPath of writtenAvatarPaths) {
                if (fs.existsSync(avatarPath)) {
                    fs.unlinkSync(avatarPath);
                }
            }
            throw innerErr;
        }
    } catch (err) {
        console.error('Backup import error:', err);
        res.status(500).json({ error: 'Import fehlgeschlagen' });
    }
});

module.exports = router;
