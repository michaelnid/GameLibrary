export const KNIFFEL_UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const KNIFFEL_LOWER = ['threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'kniffel', 'chance'];
export const KNIFFEL_ALL = [...KNIFFEL_UPPER, ...KNIFFEL_LOWER];

const DICE_DOTS = {
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
};

function hasSmallStraight(dice) {
    const unique = [...new Set(dice)].sort((a, b) => a - b).join(',');
    return unique.includes('1,2,3,4') || unique.includes('2,3,4,5') || unique.includes('3,4,5,6');
}

function hasLargeStraight(dice) {
    const unique = [...new Set(dice)].sort((a, b) => a - b);
    return unique.length === 5 && unique[4] - unique[0] === 4;
}

export function calculateKniffelScores(dice, playerScores = {}) {
    if (!dice || dice.length !== 5) return null;

    const counts = [0, 0, 0, 0, 0, 0];
    const sum = dice.reduce((acc, value) => acc + value, 0);
    dice.forEach((value) => {
        counts[value - 1] += 1;
    });

    const maxCount = Math.max(...counts);
    const isKniffel = maxCount === 5;

    const hasKniffelBonus = isKniffel
        && playerScores.kniffel !== undefined
        && playerScores.kniffel !== null
        && playerScores.kniffel === 50;

    const joker = hasKniffelBonus;
    const bonus = hasKniffelBonus ? 50 : 0;

    return {
        ones: counts[0] + bonus,
        twos: counts[1] * 2 + bonus,
        threes: counts[2] * 3 + bonus,
        fours: counts[3] * 4 + bonus,
        fives: counts[4] * 5 + bonus,
        sixes: counts[5] * 6 + bonus,
        threeOfAKind: maxCount >= 3 ? sum : 0,
        fourOfAKind: maxCount >= 4 ? sum : 0,
        fullHouse: (counts.includes(3) && counts.includes(2)) || joker ? 25 : 0,
        smallStraight: hasSmallStraight(dice) || joker ? 30 : 0,
        largeStraight: hasLargeStraight(dice) || joker ? 40 : 0,
        kniffel: isKniffel ? 50 : 0,
        chance: sum
    };
}

export function calculateKniffelPreview(dice) {
    return calculateKniffelScores(dice, {});
}

export function getKniffelLiveSummary(scores = {}) {
    const upperSum = KNIFFEL_UPPER.reduce((sum, category) => sum + (scores[category] || 0), 0);
    const lowerSum = KNIFFEL_LOWER.reduce((sum, category) => sum + (scores[category] || 0), 0);
    const bonus = upperSum >= 63 ? 35 : 0;

    return {
        upperSum,
        lowerSum,
        bonus,
        total: upperSum + lowerSum + bonus
    };
}

export function getDiceDots(value) {
    return DICE_DOTS[value] || [];
}
