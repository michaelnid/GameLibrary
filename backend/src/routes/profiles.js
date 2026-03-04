const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PlayerProfile } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { DEFAULT_GAME_TYPE } = require('../games');
const { safeResolveWithin } = require('../utils/pathSafety');

const router = express.Router();

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

function statsForGameType(profile, gameType) {
    const statsByGameType = profile.statsByGameType || {};
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
            totalGames: profile.totalGames,
            totalScore: profile.totalScore,
            highestSingleGame: profile.highestSingleGame
        };
    }

    return {
        totalGames: 0,
        totalScore: 0,
        highestSingleGame: 0
    };
}

function toProfileResponse(profile, gameType) {
    const stats = statsForGameType(profile, gameType);

    return {
        id: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        totalGames: stats.totalGames,
        totalScore: stats.totalScore,
        averageScore: stats.totalGames > 0 ? Math.round(stats.totalScore / stats.totalGames) : 0,
        highestSingleGame: stats.highestSingleGame,
        globalTotalGames: profile.totalGames,
        globalTotalScore: profile.totalScore,
        globalHighestSingleGame: profile.highestSingleGame,
        statsByGameType: profile.statsByGameType || {}
    };
}

// GET /api/profiles - List all profiles (authenticated)
router.get('/', authenticate, async (req, res) => {
    try {
        const gameType = req.query.gameType || DEFAULT_GAME_TYPE;
        const profiles = await PlayerProfile.findAll({
            order: [['name', 'ASC']]
        });

        res.json(profiles.map((profile) => toProfileResponse(profile, gameType)));
    } catch (err) {
        console.error('List profiles error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/profiles - Create profile (admin only)
router.post('/', authenticate, requireRole('admin', 'gamemaster'), upload.single('avatar'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name ist erforderlich' });
        }

        const profile = await PlayerProfile.create({
            name: name.trim(),
            avatar: req.file ? req.file.filename : null,
            statsByGameType: {}
        });

        res.status(201).json(toProfileResponse(profile, DEFAULT_GAME_TYPE));
    } catch (err) {
        console.error('Create profile error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/profiles/:id - Update profile (admin only)
router.put('/:id', authenticate, requireRole('admin', 'gamemaster'), upload.single('avatar'), async (req, res) => {
    try {
        const profile = await PlayerProfile.findByPk(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Profil nicht gefunden' });
        }

        if (req.body.name && req.body.name.trim()) {
            profile.name = req.body.name.trim();
        }

        if (req.file) {
            // Delete old avatar if exists
            if (profile.avatar) {
                const oldAvatar = safeResolveWithin(uploadsDir, profile.avatar);
                if (oldAvatar && fs.existsSync(oldAvatar.path)) fs.unlinkSync(oldAvatar.path);
            }
            profile.avatar = req.file.filename;
        }

        await profile.save();

        res.json(toProfileResponse(profile, req.query.gameType || DEFAULT_GAME_TYPE));
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// DELETE /api/profiles/:id - Delete profile (admin only)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const profile = await PlayerProfile.findByPk(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Profil nicht gefunden' });
        }

        // Delete avatar file
        if (profile.avatar) {
            const avatarFile = safeResolveWithin(uploadsDir, profile.avatar);
            if (avatarFile && fs.existsSync(avatarFile.path)) fs.unlinkSync(avatarFile.path);
        }

        await profile.destroy();
        res.json({ message: 'Profil gelöscht' });
    } catch (err) {
        console.error('Delete profile error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

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
