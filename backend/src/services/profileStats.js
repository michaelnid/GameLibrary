const { Game, Player, Score, User, MultiplayerRoom, MultiplayerPlayer } = require('../models');
const { DEFAULT_GAME_TYPE, getGameDefinition } = require('../games');

function createEmptyStats() {
    return {
        totalGames: 0,
        totalScore: 0,
        highestSingleGame: 0
    };
}

function addGameResultToStats(statsByGameType, gameType, gameTotal) {
    const current = statsByGameType[gameType] || createEmptyStats();

    const next = {
        totalGames: current.totalGames + 1,
        totalScore: current.totalScore + gameTotal,
        highestSingleGame: Math.max(current.highestSingleGame, gameTotal)
    };

    return {
        ...statsByGameType,
        [gameType]: next
    };
}

function toGlobalStats(statsByGameType) {
    const entries = Object.values(statsByGameType || {});

    return entries.reduce((acc, item) => ({
        totalGames: acc.totalGames + (item.totalGames || 0),
        totalScore: acc.totalScore + (item.totalScore || 0),
        highestSingleGame: Math.max(acc.highestSingleGame, item.highestSingleGame || 0)
    }), createEmptyStats());
}

async function rebuildProfileStatsFromCompletedGames() {
    const users = await User.findAll();

    const userById = new Map();
    const userByName = new Map();
    const statsByUserId = new Map();

    users.forEach((user) => {
        userById.set(user.id, user);
        if (!userByName.has(user.displayName)) {
            userByName.set(user.displayName, user);
        }
        statsByUserId.set(user.id, {});
    });

    // --- Regular (singleplayer) games ---
    const games = await Game.findAll({
        where: { status: 'completed' },
        include: [{
            model: Player,
            as: 'players',
            include: [{ model: Score, as: 'scores' }]
        }],
        order: [['completedAt', 'ASC'], ['id', 'ASC']]
    });

    for (const game of games) {
        const gameType = game.gameType || DEFAULT_GAME_TYPE;
        const definition = getGameDefinition(gameType);
        if (!definition) continue;

        for (const player of game.players) {
            let user = null;

            if (player.profileId) {
                user = userById.get(player.profileId) || null;
            }
            if (!user) {
                user = userByName.get(player.name) || null;
            }
            if (!user) continue;

            const scoreMap = {};
            (player.scores || []).forEach((scoreEntry) => {
                scoreMap[scoreEntry.category] = scoreEntry.value;
            });

            const gameTotal = definition.getProfileScore(scoreMap);

            const currentStats = statsByUserId.get(user.id) || {};
            const nextStats = addGameResultToStats(currentStats, gameType, gameTotal);
            statsByUserId.set(user.id, nextStats);
        }
    }

    // --- Multiplayer rooms ---
    const mpRooms = await MultiplayerRoom.findAll({
        where: { status: 'completed' },
        include: [{
            model: MultiplayerPlayer,
            as: 'players',
            include: [{ model: User, as: 'user', attributes: ['id'] }]
        }],
        order: [['completedAt', 'ASC'], ['id', 'ASC']]
    });

    for (const room of mpRooms) {
        const baseType = room.gameType || DEFAULT_GAME_TYPE;
        const mpGameType = `${baseType}-multiplayer`;
        const definition = getGameDefinition(mpGameType) || getGameDefinition(baseType);
        if (!definition) continue;

        const isWinLoss = definition.scoringType === 'winLoss';

        for (const mp of room.players) {
            const user = userById.get(mp.userId) || null;
            if (!user) continue;

            const pScores = mp.scores || {};
            const gameTotal = definition.getProfileScore(pScores);

            const currentStats = statsByUserId.get(user.id) || {};
            const nextStats = addGameResultToStats(currentStats, mpGameType, gameTotal);

            // Track win/loss/draw for board games
            if (isWinLoss) {
                const gameTypeStats = nextStats[mpGameType];
                gameTypeStats.wins = (gameTypeStats.wins || 0) + (pScores.result === 'win' ? 1 : 0);
                gameTypeStats.losses = (gameTypeStats.losses || 0) + (pScores.result === 'loss' ? 1 : 0);
                gameTypeStats.draws = (gameTypeStats.draws || 0) + (pScores.result === 'draw' ? 1 : 0);
            }

            statsByUserId.set(user.id, nextStats);
        }
    }

    // --- Write back ---
    for (const user of users) {
        const perTypeStats = statsByUserId.get(user.id) || {};
        const global = toGlobalStats(perTypeStats);

        user.statsByGameType = perTypeStats;
        user.totalGames = global.totalGames;
        user.totalScore = global.totalScore;
        user.highestSingleGame = global.highestSingleGame;

        await user.save();
    }

    return {
        profiles: users.length,
        completedGames: games.length + mpRooms.length
    };
}

module.exports = {
    rebuildProfileStatsFromCompletedGames
};
