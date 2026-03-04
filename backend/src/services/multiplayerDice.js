/**
 * Multiplayer Dice Engine – server-authoritative Kniffel dice logic
 */

const DICE_COUNT = 5;
const MAX_ROLLS = 3;

/**
 * Generate a random die value (1-6)
 */
function rollSingleDie() {
    return Math.floor(Math.random() * 6) + 1;
}

/**
 * Roll dice – only re-rolls dice that are not held.
 * @param {number[]|null} currentDice - Current dice values (null = fresh roll)
 * @param {boolean[]} held - Which dice are held (true = keep)
 * @returns {number[]} New dice array
 */
function rollDice(currentDice, held) {
    const dice = new Array(DICE_COUNT);
    for (let i = 0; i < DICE_COUNT; i++) {
        if (currentDice && held && held[i]) {
            dice[i] = currentDice[i];
        } else {
            dice[i] = rollSingleDie();
        }
    }
    return dice;
}

/**
 * Create initial dice state for a new turn
 */
function createTurnState() {
    return {
        dice: [0, 0, 0, 0, 0],
        held: [false, false, false, false, false],
        rollsLeft: MAX_ROLLS
    };
}

/**
 * Validate held array
 */
function isValidHeld(held) {
    return Array.isArray(held) &&
        held.length === DICE_COUNT &&
        held.every(h => typeof h === 'boolean');
}

/**
 * Calculate all possible Kniffel scores for the given dice.
 * Returns an object with category keys and their computed values.
 */
function calculatePossibleScores(dice) {
    if (!Array.isArray(dice) || dice.length !== DICE_COUNT) return {};

    const counts = [0, 0, 0, 0, 0, 0]; // index 0-5 for dice values 1-6
    let sum = 0;
    for (const die of dice) {
        counts[die - 1]++;
        sum += die;
    }

    const sorted = [...dice].sort((a, b) => a - b);
    const uniqueSorted = [...new Set(sorted)];

    const results = {};

    // Upper section (ones through sixes)
    const upperKeys = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
    for (let i = 0; i < 6; i++) {
        results[upperKeys[i]] = counts[i] * (i + 1);
    }

    // Three of a kind
    results.threeOfAKind = counts.some(c => c >= 3) ? sum : 0;

    // Four of a kind
    results.fourOfAKind = counts.some(c => c >= 4) ? sum : 0;

    // Full House (3+2)
    results.fullHouse = (counts.includes(3) && counts.includes(2)) ? 25 : 0;

    // Small Straight (4 consecutive)
    const straights4 = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
    results.smallStraight = straights4.some(s => s.every(v => dice.includes(v))) ? 30 : 0;

    // Large Straight (5 consecutive)
    const isLargeStraight = (
        (uniqueSorted.length === 5) &&
        (uniqueSorted[4] - uniqueSorted[0] === 4)
    );
    results.largeStraight = isLargeStraight ? 40 : 0;

    // Kniffel (5 of a kind)
    results.kniffel = counts.some(c => c >= 5) ? 50 : 0;

    // Chance
    results.chance = sum;

    return results;
}

module.exports = {
    DICE_COUNT,
    MAX_ROLLS,
    rollDice,
    createTurnState,
    isValidHeld,
    calculatePossibleScores
};
