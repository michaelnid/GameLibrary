const express = require('express');
const { Score, Player, Game } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');
const { getGameDefinition } = require('../games');

const router = express.Router();
const PHASE10_GAME_TYPE = 'phase10dice';
const PHASE10_PHASE_KEYS = [
    'phase1', 'phase2', 'phase3', 'phase4', 'phase5',
    'phase6', 'phase7', 'phase8', 'phase9', 'phase10'
];
const PHASE10_BONUS_THRESHOLD_KEY = 'bonusThreshold';
const PHASE10_BONUS_FINISHER_KEY = 'bonusFinisher';
const PHASE10_BONUS_KEYS = new Set([PHASE10_BONUS_THRESHOLD_KEY, PHASE10_BONUS_FINISHER_KEY, 'bonus']);

function hasEnteredValue(value) {
    return value !== undefined && value !== null;
}

function buildScoreMap(scores = []) {
    const scoreMap = {};
    scores.forEach((scoreEntry) => {
        scoreMap[scoreEntry.category] = scoreEntry.value;
    });
    return scoreMap;
}

function nextPhase10Category(scoreMap) {
    return PHASE10_PHASE_KEYS.find((key) => !hasEnteredValue(scoreMap[key])) || null;
}

function phase10MidBonus(scoreMap) {
    const requiredKeys = PHASE10_PHASE_KEYS.slice(0, 5);
    if (!requiredKeys.every((key) => hasEnteredValue(scoreMap[key]))) {
        return 0;
    }

    const sum = requiredKeys.reduce((total, key) => total + Number(scoreMap[key] || 0), 0);
    return sum >= 221 ? 40 : 0;
}

function scoreTimestamp(scoreEntry) {
    const ts = new Date(scoreEntry.createdAt).getTime();
    return Number.isFinite(ts) ? ts : 0;
}

function phase10FastFinisherIdsByRound(players) {
    if (!Array.isArray(players) || players.length === 0) return new Set();

    const phaseEntriesOrdered = players
        .flatMap((player) => (player.scores || [])
            .filter((scoreEntry) => PHASE10_PHASE_KEYS.includes(scoreEntry.category) && hasEnteredValue(scoreEntry.value))
            .map((scoreEntry) => ({
                playerId: player.id,
                scoreId: scoreEntry.id,
                category: scoreEntry.category,
                createdAtTs: scoreTimestamp(scoreEntry)
            })))
        .sort((a, b) => {
            if (a.createdAtTs !== b.createdAtTs) return a.createdAtTs - b.createdAtTs;
            return a.scoreId - b.scoreId;
        });

    if (phaseEntriesOrdered.length === 0) return new Set();

    const sequenceByScoreId = new Map();
    phaseEntriesOrdered.forEach((entry, index) => {
        sequenceByScoreId.set(entry.scoreId, index + 1);
    });

    const completionEvents = players
        .map((player) => {
            const phase10Entry = (player.scores || []).find(
                (scoreEntry) => scoreEntry.category === 'phase10' && hasEnteredValue(scoreEntry.value)
            );
            if (!phase10Entry) return null;

            const sequence = sequenceByScoreId.get(phase10Entry.id);
            if (!sequence) return null;

            return {
                playerId: player.id,
                completionRound: Math.ceil(sequence / players.length)
            };
        })
        .filter(Boolean);

    if (completionEvents.length === 0) return new Set();

    const fastestRound = Math.min(...completionEvents.map((event) => event.completionRound));
    return new Set(
        completionEvents
            .filter((event) => event.completionRound === fastestRound)
            .map((event) => event.playerId)
    );
}

async function syncAutoBonusScore(player, category, targetValue, changes) {
    const current = (player.scores || []).find((entry) => entry.category === category);
    const currentValue = current && hasEnteredValue(current.value) ? current.value : null;

    if (targetValue <= 0) {
        if (current) {
            await current.destroy();
            changes.push({ playerId: player.id, category, value: null });
        }
        return;
    }

    if (!current) {
        await Score.create({
            playerId: player.id,
            category,
            value: targetValue
        });
        changes.push({ playerId: player.id, category, value: targetValue });
        return;
    }

    if (currentValue !== targetValue) {
        current.value = targetValue;
        await current.save();
        changes.push({ playerId: player.id, category, value: targetValue });
    }
}

async function recalculatePhase10Bonuses(gameId) {
    const players = await Player.findAll({
        where: { gameId: parseInt(gameId, 10) },
        include: [{ model: Score, as: 'scores' }]
    });

    const fastFinisherIds = phase10FastFinisherIdsByRound(players);
    const changes = [];

    for (const player of players) {
        const scoreMap = buildScoreMap(player.scores || []);
        const baseBonus = phase10MidBonus(scoreMap);
        const finisherBonus = fastFinisherIds.has(player.id) ? 40 : 0;

        await syncAutoBonusScore(player, PHASE10_BONUS_THRESHOLD_KEY, baseBonus, changes);
        await syncAutoBonusScore(player, PHASE10_BONUS_FINISHER_KEY, finisherBonus, changes);

        const legacyBonus = (player.scores || []).find((entry) => entry.category === 'bonus');
        if (legacyBonus) {
            await legacyBonus.destroy();
        }
    }

    return changes;
}

// PUT /api/games/:gameId/players/:playerId/scores
// GameMaster+: enter or update a score
router.put(
    '/games/:gameId/players/:playerId/scores',
    authenticate,
    requireRole('admin', 'gamemaster'),
    async (req, res) => {
        try {
            const { gameId, playerId } = req.params;
            const { category, value } = req.body;

            if (!category || typeof category !== 'string') {
                return res.status(400).json({ error: 'Ungültige Kategorie' });
            }
            if (value !== null && value !== undefined && (typeof value !== 'number' || value < 0)) {
                return res.status(400).json({ error: 'Ungültiger Wert' });
            }

            // Verify game exists and is active
            const game = await Game.findByPk(gameId);
            if (!game) {
                return res.status(404).json({ error: 'Spiel nicht gefunden' });
            }
            if (game.status !== 'active') {
                return res.status(400).json({ error: 'Spiel ist bereits abgeschlossen' });
            }

            const definition = getGameDefinition(game.gameType);
            if (!definition) {
                return res.status(500).json({ error: `Unbekannter Spieltyp: ${game.gameType}` });
            }
            if (game.gameType === PHASE10_GAME_TYPE && PHASE10_BONUS_KEYS.has(category)) {
                return res.status(400).json({ error: 'Boni werden bei Phase 10 automatisch berechnet' });
            }

            if (!definition.categoryKeys.includes(category)) {
                return res.status(400).json({ error: 'Kategorie passt nicht zum Spieltyp' });
            }

            // Verify player belongs to this game
            const player = await Player.findOne({
                where: { id: playerId, gameId: parseInt(gameId, 10) },
                include: [{ model: Score, as: 'scores' }]
            });
            if (!player) {
                return res.status(404).json({ error: 'Spieler nicht gefunden' });
            }

            if (game.gameType === PHASE10_GAME_TYPE) {
                const scoreMap = buildScoreMap(player.scores || []);
                const isKnownPhaseCategory = PHASE10_PHASE_KEYS.includes(category);
                if (isKnownPhaseCategory) {
                    const alreadyEntered = hasEnteredValue(scoreMap[category]);
                    const nextCategory = nextPhase10Category(scoreMap);

                    if (!alreadyEntered && nextCategory && category !== nextCategory) {
                        return res.status(400).json({ error: 'Bei Phase 10 muss von oben nach unten eingetragen werden' });
                    }
                }
            }

            // Upsert the score
            const [score, created] = await Score.findOrCreate({
                where: { playerId: parseInt(playerId, 10), category },
                defaults: { value }
            });

            if (!created) {
                score.value = value;
                await score.save();
            }

            // Emit real-time update
            const io = req.app.get('io');
            if (io) {
                io.to(`game:${gameId}`).emit('scoreUpdate', {
                    gameId: parseInt(gameId, 10),
                    playerId: parseInt(playerId, 10),
                    category,
                    value,
                    gameType: game.gameType
                });
            }

            if (game.gameType === PHASE10_GAME_TYPE) {
                const bonusChanges = await recalculatePhase10Bonuses(gameId);
                if (io) {
                    bonusChanges.forEach((change) => {
                        io.to(`game:${gameId}`).emit('scoreUpdate', {
                            gameId: parseInt(gameId, 10),
                            playerId: change.playerId,
                            category: change.category,
                            value: change.value,
                            gameType: game.gameType
                        });
                    });
                }
            }

            res.json({
                playerId: parseInt(playerId, 10),
                category,
                value: score.value,
                gameType: game.gameType
            });
        } catch (err) {
            console.error('Update score error:', err);
            res.status(500).json({ error: 'Serverfehler' });
        }
    }
);

module.exports = router;
