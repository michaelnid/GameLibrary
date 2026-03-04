const UPPER_CATEGORIES = [
    { key: 'ones', label: 'Einser' },
    { key: 'twos', label: 'Zweier' },
    { key: 'threes', label: 'Dreier' },
    { key: 'fours', label: 'Vierer' },
    { key: 'fives', label: 'Fünfer' },
    { key: 'sixes', label: 'Sechser' }
];

const LOWER_CATEGORIES = [
    { key: 'threeOfAKind', label: 'Dreierpasch' },
    { key: 'fourOfAKind', label: 'Viererpasch' },
    { key: 'fullHouse', label: 'Full House' },
    { key: 'smallStraight', label: 'Kleine Straße' },
    { key: 'largeStraight', label: 'Große Straße' },
    { key: 'kniffel', label: 'Kniffel' },
    { key: 'chance', label: 'Chance' }
];

const categoryKeys = [
    ...UPPER_CATEGORIES.map((c) => c.key),
    ...LOWER_CATEGORIES.map((c) => c.key)
];

function toSafeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function calculateSectionTotal(scoreMap, categories) {
    return categories.reduce((sum, category) => sum + toSafeNumber(scoreMap[category.key]), 0);
}

function getPlayerSummary(scoreMap = {}) {
    const upperSum = calculateSectionTotal(scoreMap, UPPER_CATEGORIES);
    const lowerSum = calculateSectionTotal(scoreMap, LOWER_CATEGORIES);
    const bonus = upperSum >= 63 ? 35 : 0;
    const total = upperSum + lowerSum + bonus;

    return {
        upperSum,
        lowerSum,
        bonus,
        total,
        sectionTotals: {
            upper: upperSum,
            lower: lowerSum
        }
    };
}

module.exports = {
    id: 'kniffel',
    name: 'Kniffel',
    description: 'Klassischer digitaler Kniffel-Spielblock mit Live-Scoreboard.',
    supportsDiceInput: true,
    sections: [
        { id: 'upper', label: 'Oberer Block', categories: UPPER_CATEGORIES },
        { id: 'lower', label: 'Unterer Block', categories: LOWER_CATEGORIES }
    ],
    categoryKeys,
    getPlayerSummary,
    getProfileScore(scoreMap = {}) {
        return getPlayerSummary(scoreMap).total;
    }
};
