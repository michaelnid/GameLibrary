function toSafeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function getPlayerSummary(scoreMap = {}) {
    const total = toSafeNumber(scoreMap.points);
    return {
        total,
        sectionTotals: {
            result: total
        }
    };
}

module.exports = {
    id: 'tictactoevanish',
    name: 'TicTacToe Vanish',
    description: '2-Spieler TicTacToe Vanish: Jeder hat max. 3 Chips, der aelteste verschwindet. Kein Unentschieden!',
    supportsDiceInput: false,
    multiplayerOnly: true,
    scoringType: 'winLoss',
    sections: [
        {
            id: 'result',
            label: 'Ergebnis',
            categories: [
                { key: 'points', label: 'Punkte' }
            ]
        }
    ],
    categoryKeys: ['points'],
    getPlayerSummary,
    getProfileScore(scoreMap = {}) {
        return getPlayerSummary(scoreMap).total;
    }
};
