const express = require('express');
const { User } = require('../models');
const { DEFAULT_GAME_TYPE, getGameDefinition } = require('../games');

const router = express.Router();

function selectStats(user, gameType) {
    const statsByGameType = user.statsByGameType || {};
    const gameStats = statsByGameType[gameType];
    if (gameStats) {
        return {
            totalGames: gameStats.totalGames || 0,
            totalScore: gameStats.totalScore || 0,
            highestSingleGame: gameStats.highestSingleGame || 0,
            wins: gameStats.wins || 0,
            losses: gameStats.losses || 0,
            draws: gameStats.draws || 0
        };
    }

    if (Object.keys(statsByGameType).length === 0 && gameType === DEFAULT_GAME_TYPE) {
        return {
            totalGames: user.totalGames,
            totalScore: user.totalScore,
            highestSingleGame: user.highestSingleGame,
            wins: 0,
            losses: 0,
            draws: 0
        };
    }

    return {
        totalGames: 0,
        totalScore: 0,
        highestSingleGame: 0,
        wins: 0,
        losses: 0,
        draws: 0
    };
}

// GET /api/highscores - Public: top players by average score (or win rate for board games)
router.get('/', async (req, res) => {
    try {
        const gameType = req.query.gameType || DEFAULT_GAME_TYPE;
        const users = await User.findAll();

        // Check if this game type uses win/loss scoring
        const definition = getGameDefinition(gameType);
        const isWinLoss = definition?.scoringType === 'winLoss';

        const sorted = users
            .map((user) => {
                const stats = selectStats(user, gameType);
                const averageScore = stats.totalGames > 0
                    ? Math.round(stats.totalScore / stats.totalGames)
                    : 0;
                const winRate = stats.totalGames > 0
                    ? Math.round((stats.wins / stats.totalGames) * 100)
                    : 0;

                return {
                    id: user.id,
                    name: user.displayName,
                    avatar: user.avatar,
                    gameType,
                    scoringType: isWinLoss ? 'winLoss' : 'score',
                    totalGames: stats.totalGames,
                    totalScore: stats.totalScore,
                    averageScore,
                    highestSingleGame: stats.highestSingleGame,
                    wins: stats.wins,
                    losses: stats.losses,
                    draws: stats.draws,
                    winRate
                };
            })
            .filter((entry) => entry.totalGames > 0)
            .sort((a, b) => {
                if (isWinLoss) {
                    // Sort by win rate, then by total wins, then by name
                    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    return a.name.localeCompare(b.name, 'de');
                }
                // Score-based: sort by average score, then best game, then name
                if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
                if (b.highestSingleGame !== a.highestSingleGame) return b.highestSingleGame - a.highestSingleGame;
                return a.name.localeCompare(b.name, 'de');
            });

        res.json(sorted);
    } catch (err) {
        console.error('Highscores error:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;

