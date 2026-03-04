const express = require('express');
const { Game, Player, Score, User } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { DEFAULT_GAME_TYPE, getGameDefinition, serializeDefinition } = require('../games');
const { clearGameState } = require('../socket/gameSocket');

const router = express.Router();

function buildScoreMap(scores = []) {
    const scoreMap = {};
    scores.forEach((scoreEntry) => {
        scoreMap[scoreEntry.category] = scoreEntry.value;
    });
    return scoreMap;
}

function mapPlayerBasic(player) {
    return {
        id: player.id,
        name: player.name,
        profileId: player.profileId,
        avatar: player.profile?.avatar || null
    };
}

function mapGameListEntry(game) {
    const definition = getGameDefinition(game.gameType) || getGameDefinition(DEFAULT_GAME_TYPE);

    return {
        id: game.id,
        gameNumber: game.gameNumber,
        name: game.name,
        status: game.status,
        gameType: game.gameType,
        gameTypeName: definition?.name || game.gameType,
        playerCount: game.players.length,
        players: game.players.map(mapPlayerBasic),
        createdAt: game.createdAt,
        completedAt: game.completedAt
    };
}

function mapGameDetails(game, definition) {
    return {
        id: game.id,
        gameNumber: game.gameNumber,
        name: game.name,
        status: game.status,
        gameType: game.gameType,
        gameTypeName: definition.name,
        createdAt: game.createdAt,
        completedAt: game.completedAt,
        categoryCompletionTarget: definition.categoryKeys.length,
        gameDefinition: serializeDefinition(definition),
        players: game.players.map((player) => {
            const scoreMap = buildScoreMap(player.scores || []);
            const summary = definition.getPlayerSummary(scoreMap);

            return {
                id: player.id,
                name: player.name,
                profileId: player.profileId,
                avatar: player.profile?.avatar || null,
                scores: scoreMap,
                ...summary
            };
        })
    };
}

function updateUserGameStats(user, gameType, gameTotal) {
    const statsByGameType = user.statsByGameType || {};
    const currentTypeStats = statsByGameType[gameType] || {
        totalGames: 0,
        totalScore: 0,
        highestSingleGame: 0
    };

    currentTypeStats.totalGames += 1;
    currentTypeStats.totalScore += gameTotal;
    if (gameTotal > currentTypeStats.highestSingleGame) {
        currentTypeStats.highestSingleGame = gameTotal;
    }

    user.statsByGameType = {
        ...statsByGameType,
        [gameType]: currentTypeStats
    };

    user.totalGames += 1;
    user.totalScore += gameTotal;
    if (gameTotal > user.highestSingleGame) {
        user.highestSingleGame = gameTotal;
    }
}

// GET /api/games - Public: list all games
router.get('/', async (req, res) => {
    try {
        const { status, gameType } = req.query;
        const where = {};

        if (status && ['active', 'completed'].includes(status)) {
            where.status = status;
        }
        if (gameType) {
            where.gameType = gameType;
        }

        const games = await Game.findAll({
            where,
            include: [{
                model: Player,
                as: 'players',
                attributes: ['id', 'name', 'profileId'],
                include: [{
                    model: User,
                    as: 'profile',
                    attributes: ['id', 'avatar']
                }]
            }],
            order: [['createdAt', 'DESC']]
        });

        res.json(games.map(mapGameListEntry));
    } catch (err) {
        console.error('List games error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/games/:id - Public: get game with all scores
router.get('/:id', async (req, res) => {
    try {
        const game = await Game.findByPk(req.params.id, {
            include: [{
                model: Player,
                as: 'players',
                include: [
                    { model: Score, as: 'scores' },
                    { model: User, as: 'profile', attributes: ['id', 'avatar'] }
                ]
            }]
        });

        if (!game) {
            return res.status(404).json({ error: 'Spiel nicht gefunden' });
        }

        const definition = getGameDefinition(game.gameType);
        if (!definition) {
            return res.status(500).json({ error: `Unbekannter Spieltyp: ${game.gameType}` });
        }

        res.json(mapGameDetails(game, definition));
    } catch (err) {
        console.error('Get game error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/games - GameMaster+: create new game
// Accepts profileIds (array of user IDs) or playerNames (array of strings)
router.post('/', authenticate, requireRole('admin', 'gamemaster'), async (req, res) => {
    try {
        const { name, playerNames, profileIds, gameType = DEFAULT_GAME_TYPE } = req.body;

        const definition = getGameDefinition(gameType);
        if (!definition) {
            return res.status(400).json({ error: 'Unbekannter Spieltyp' });
        }

        const hasProfiles = profileIds && Array.isArray(profileIds) && profileIds.length > 0;
        const hasNames = playerNames && Array.isArray(playerNames) && playerNames.length > 0;

        if (!hasProfiles && !hasNames) {
            return res.status(400).json({ error: 'Mindestens ein Spieler erforderlich' });
        }

        const maxResult = await Game.max('gameNumber');
        const nextNumber = (maxResult || 0) + 1;

        const game = await Game.create({
            gameNumber: nextNumber,
            name: name && name.trim() ? name.trim() : null,
            gameType,
            createdBy: req.userId,
            status: 'active'
        });

        const players = [];

        if (hasProfiles) {
            for (const profileId of profileIds) {
                const userProfile = await User.findByPk(profileId);
                if (!userProfile) continue;
                const player = await Player.create({
                    name: userProfile.displayName,
                    gameId: game.id,
                    profileId: userProfile.id
                });
                players.push({
                    id: player.id,
                    name: player.name,
                    profileId: userProfile.id,
                    avatar: userProfile.avatar
                });
            }
        }

        if (hasNames) {
            for (const playerName of playerNames) {
                if (!playerName.trim()) continue;
                const player = await Player.create({
                    name: playerName.trim(),
                    gameId: game.id
                });
                players.push({
                    id: player.id,
                    name: player.name,
                    profileId: null,
                    avatar: null
                });
            }
        }

        if (players.length === 0) {
            await game.destroy();
            return res.status(400).json({ error: 'Keine gültigen Spieler' });
        }

        const io = req.app.get('io');
        if (io) io.emit('gameListChanged');

        res.status(201).json({
            id: game.id,
            gameNumber: game.gameNumber,
            name: game.name,
            status: game.status,
            gameType: game.gameType,
            gameTypeName: definition.name,
            gameDefinition: serializeDefinition(definition),
            players,
            createdAt: game.createdAt
        });
    } catch (err) {
        console.error('Create game error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/games/:id/complete - GameMaster+: complete a game
router.put('/:id/complete', authenticate, requireRole('admin', 'gamemaster'), async (req, res) => {
    try {
        const game = await Game.findByPk(req.params.id, {
            include: [{
                model: Player,
                as: 'players',
                include: [{ model: Score, as: 'scores' }]
            }]
        });

        if (!game) {
            return res.status(404).json({ error: 'Spiel nicht gefunden' });
        }
        if (game.status === 'completed') {
            return res.status(400).json({ error: 'Spiel ist bereits abgeschlossen' });
        }

        const definition = getGameDefinition(game.gameType);
        if (!definition) {
            return res.status(500).json({ error: `Unbekannter Spieltyp: ${game.gameType}` });
        }

        const allFieldsFilled = game.players.every((player) => {
            const scoreMap = buildScoreMap(player.scores || []);
            return definition.categoryKeys.every((categoryKey) =>
                scoreMap[categoryKey] !== undefined && scoreMap[categoryKey] !== null
            );
        });

        game.status = 'completed';
        game.completedAt = new Date();
        await game.save();

        for (const player of game.players) {
            const scoreMap = buildScoreMap(player.scores || []);
            const gameTotal = definition.getProfileScore(scoreMap);

            let userProfile;

            if (player.profileId) {
                userProfile = await User.findByPk(player.profileId);
            } else {
                // Try to find user by displayName
                const allUsers = await User.findAll();
                userProfile = allUsers.find((u) => u.displayName === player.name);
            }

            if (userProfile) {
                updateUserGameStats(userProfile, game.gameType, gameTotal);
                await userProfile.save();
            }
            // No auto-creation of profiles for unknown players
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`game:${game.id}`).emit('gameCompleted', { gameId: game.id, gameType: game.gameType });
            io.emit('gameListChanged');
        }
        clearGameState(game.id);

        res.json({
            message: allFieldsFilled ? 'Spiel abgeschlossen' : 'Spiel vorzeitig abgeschlossen',
            gameId: game.id,
            gameType: game.gameType,
            completedEarly: !allFieldsFilled
        });
    } catch (err) {
        console.error('Complete game error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// DELETE /api/games/:id - Admin only
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const game = await Game.findByPk(req.params.id);
        if (!game) {
            return res.status(404).json({ error: 'Spiel nicht gefunden' });
        }

        const wasCompleted = game.status === 'completed';

        const players = await Player.findAll({ where: { gameId: game.id } });
        for (const player of players) {
            await Score.destroy({ where: { playerId: player.id } });
        }
        await Player.destroy({ where: { gameId: game.id } });
        await game.destroy();
        clearGameState(game.id);

        // Recalculate all user stats from remaining completed games
        if (wasCompleted) {
            const { rebuildProfileStatsFromCompletedGames } = require('../services/profileStats');
            await rebuildProfileStatsFromCompletedGames();
        }

        const io = req.app.get('io');
        if (io) io.emit('gameListChanged');

        res.json({ message: 'Spiel gelöscht' });
    } catch (err) {
        console.error('Delete game error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
