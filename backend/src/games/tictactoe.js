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
    id: 'tictactoe',
    name: 'TicTacToe',
    description: '2-Spieler TicTacToe im Multiplayer. Sieg = 3 Punkte, Unentschieden = 1 Punkt.',
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
