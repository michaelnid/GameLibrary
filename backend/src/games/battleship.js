// ── Battleship (Schiffe Versenken) Game Definition ──

const BOARD_SIZE = 10;

const SHIP_DEFINITIONS = [
    { id: 'carrier', name: 'Schlachtschiff', size: 5 },
    { id: 'cruiser', name: 'Kreuzer', size: 4 },
    { id: 'destroyer', name: 'Zerstoerer', size: 3 },
    { id: 'submarine', name: 'U-Boot', size: 3 },
    { id: 'patrol', name: 'Patrouillenboot', size: 2 }
];

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
    id: 'battleship',
    name: 'Schiffe Versenken',
    description: '2-Spieler Schiffe Versenken im Multiplayer. Platziere deine Schiffe und versenke die des Gegners!',
    supportsDiceInput: false,
    multiplayerOnly: true,
    scoringType: 'winLoss',
    BOARD_SIZE,
    SHIP_DEFINITIONS,
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
