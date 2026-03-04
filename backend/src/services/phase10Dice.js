/**
 * Phase 10 Wuerfelspiel – Server-authoritative dice engine
 *
 * Dice composition:
 *   4 "low" dice  – faces: 1, 2, 3, 4, W, W   (W = wild / joker)
 *   6 "high" dice – faces: 5, 6, 7, 8, 9, 10
 *
 * Each numbered face has one of 4 colors: blue, red, orange, green.
 * Wilds can represent any number / color but score 0 points.
 */

const DICE_COUNT = 10;
const MAX_ROLLS = 3;

const COLORS = ['blue', 'red', 'orange', 'green'];

// Faces for the two dice types
const LOW_DIE_FACES = [
    { value: 1, isWild: false },
    { value: 2, isWild: false },
    { value: 3, isWild: false },
    { value: 4, isWild: false },
    { value: 0, isWild: true },
    { value: 0, isWild: true }
];

const HIGH_DIE_FACES = [
    { value: 5, isWild: false },
    { value: 6, isWild: false },
    { value: 7, isWild: false },
    { value: 8, isWild: false },
    { value: 9, isWild: false },
    { value: 10, isWild: false }
];

// First 4 dice are low, rest are high
const DIE_TYPES = [
    'low', 'low', 'low', 'low',
    'high', 'high', 'high', 'high', 'high', 'high'
];

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function rollSingleDie(dieIndex) {
    const faces = DIE_TYPES[dieIndex] === 'low' ? LOW_DIE_FACES : HIGH_DIE_FACES;
    const face = faces[Math.floor(Math.random() * faces.length)];
    return {
        value: face.value,
        color: randomColor(), // Wilds also get a color (for color phases)
        isWild: face.isWild
    };
}

/**
 * Roll dice – only re-rolls dice that are not held.
 */
function rollPhase10Dice(currentDice, held) {
    const dice = new Array(DICE_COUNT);
    for (let i = 0; i < DICE_COUNT; i++) {
        if (currentDice && held && held[i]) {
            dice[i] = currentDice[i];
        } else {
            dice[i] = rollSingleDie(i);
        }
    }
    return dice;
}

/**
 * Create initial dice state for a new turn.
 */
function createPhase10TurnState() {
    const emptyDice = new Array(DICE_COUNT).fill(null).map(() => ({
        value: 0, color: null, isWild: false
    }));
    return {
        dice: emptyDice,
        held: new Array(DICE_COUNT).fill(false),
        rollsLeft: MAX_ROLLS
    };
}

/**
 * Validate held array for Phase 10 (10 dice).
 */
function isValidPhase10Held(held) {
    return Array.isArray(held) &&
        held.length === DICE_COUNT &&
        held.every(h => typeof h === 'boolean');
}

// ────────────────────────────────────────────────────
//  Phase requirement validation
// ────────────────────────────────────────────────────

/**
 * Try to find N dice of the same value from available dice.
 * Wilds can substitute any value. Returns the matched dice indices or null.
 * targetValue = specific number to match, or null = best available.
 */
function findOfAKind(available, n, targetValue) {
    // Group by value (excluding wilds)
    const groups = {};
    const wildIndices = [];
    available.forEach((entry) => {
        if (entry.die.isWild) {
            wildIndices.push(entry.idx);
        } else {
            const v = entry.die.value;
            if (!groups[v]) groups[v] = [];
            groups[v].push(entry.idx);
        }
    });

    // If targetValue is set, try only that value
    const valuesToTry = targetValue != null ? [targetValue] :
        Object.keys(groups).map(Number).sort((a, b) => b - a);

    for (const val of valuesToTry) {
        const matched = groups[val] ? [...groups[val]] : [];
        const wildsNeeded = Math.max(0, n - matched.length);
        if (matched.length + wildIndices.length >= n) {
            const result = matched.slice(0, n);
            for (let w = 0; w < wildsNeeded; w++) {
                result.push(wildIndices[w]);
            }
            return { indices: result.slice(0, n), value: val };
        }
    }
    return null;
}

/**
 * Try to find a run (consecutive sequence) of length n.
 * Wilds fill gaps. Returns matched dice indices or null.
 */
function findRun(available, n) {
    const byValue = {};
    const wildIndices = [];
    available.forEach((entry) => {
        if (entry.die.isWild) {
            wildIndices.push(entry.idx);
        } else {
            const v = entry.die.value;
            if (!byValue[v]) byValue[v] = [];
            byValue[v].push(entry.idx);
        }
    });

    const allValues = Object.keys(byValue).map(Number).sort((a, b) => a - b);
    if (allValues.length === 0 && wildIndices.length < n) return null;

    // Try all possible starting values for the run
    const minStart = Math.max(1, (allValues[0] || 1) - wildIndices.length);
    const maxStart = Math.min(10 - n + 1, (allValues[allValues.length - 1] || 10));

    let bestResult = null;
    let bestScore = -1;

    for (let start = minStart; start <= maxStart; start++) {
        const end = start + n - 1;
        if (end > 10) continue;

        const result = [];
        let wildsUsed = 0;
        let valid = true;
        let score = 0;

        for (let v = start; v <= end; v++) {
            if (byValue[v] && byValue[v].length > 0) {
                // Pick one die with this value (prefer non-used ones)
                const picked = byValue[v].find(idx => !result.includes(idx));
                if (picked !== undefined) {
                    result.push(picked);
                    score += v;
                    continue;
                }
            }
            // Need a wild
            if (wildsUsed < wildIndices.length) {
                result.push(wildIndices[wildsUsed]);
                wildsUsed++;
                // Wild scores 0
            } else {
                valid = false;
                break;
            }
        }

        if (valid && result.length === n && score > bestScore) {
            bestScore = score;
            bestResult = result;
        }
    }

    return bestResult ? { indices: bestResult, score: bestScore } : null;
}

/**
 * Find N dice of the same color from available dice.
 * Wilds count as their assigned color (each wild has a color).
 */
function findSameColor(available, n) {
    const byColor = {};
    available.forEach((entry) => {
        const c = entry.die.color;
        if (!c) return; // skip dice without color (shouldn't happen)
        if (!byColor[c]) byColor[c] = [];
        byColor[c].push(entry);
    });

    // Try each color, pick highest-value dice first (wilds score 0)
    for (const color of COLORS) {
        const colorDice = (byColor[color] || [])
            .sort((a, b) => {
                // Non-wilds first (higher value), wilds last
                if (a.die.isWild !== b.die.isWild) return a.die.isWild ? 1 : -1;
                return b.die.value - a.die.value;
            });
        if (colorDice.length >= n) {
            return colorDice.slice(0, n).map(e => e.idx);
        }
    }
    return null;
}

/**
 * Remove indices from the available pool.
 */
function removeUsed(available, usedIndices) {
    const usedSet = new Set(usedIndices);
    return available.filter(entry => !usedSet.has(entry.idx));
}

/**
 * Calculate score for a set of dice indices. Wilds = 0.
 */
function scoreForIndices(dice, indices) {
    return indices.reduce((sum, idx) => {
        const d = dice[idx];
        return sum + (d && !d.isWild ? d.value : 0);
    }, 0);
}

/**
 * Make an available pool from dice array.
 */
function makePool(dice) {
    return dice
        .map((die, idx) => ({ die, idx }))
        .filter((entry) =>
            entry.die
            && typeof entry.die === 'object'
            && typeof entry.die.value === 'number'
            && typeof entry.die.isWild === 'boolean'
        );
}

/**
 * Try both orderings of two-component phase requirements.
 * Returns the best valid result (highest score), or null.
 * This prevents greedy allocation where the first component
 * consumes wilds/dice needed by the second component.
 */
function tryTwoComponents(dice, findA, findB) {
    const results = [];
    // Order 1: A first, then B
    const poolAB = makePool(dice);
    const a1 = findA(poolAB);
    if (a1) {
        const rem1 = removeUsed(poolAB, a1.indices);
        const b1 = findB(rem1);
        if (b1) {
            const all = [...a1.indices, ...b1.indices];
            results.push({ indices: all, score: scoreForIndices(dice, all) });
        }
    }
    // Order 2: B first, then A
    const poolBA = makePool(dice);
    const b2 = findB(poolBA);
    if (b2) {
        const rem2 = removeUsed(poolBA, b2.indices);
        const a2 = findA(rem2);
        if (a2) {
            const all = [...b2.indices, ...a2.indices];
            results.push({ indices: all, score: scoreForIndices(dice, all) });
        }
    }
    if (results.length === 0) return null;
    return results.reduce((best, r) => r.score > best.score ? r : best);
}

// Phase validators – each returns { indices, score } or null
const PHASE_VALIDATORS = {
    // Phase 1: 2 Drillinge (two three-of-a-kinds)
    phase1(dice) {
        const pool = makePool(dice);
        const first = findOfAKind(pool, 3, null);
        if (!first) return null;
        const remaining = removeUsed(pool, first.indices);
        const second = findOfAKind(remaining, 3, null);
        if (!second) return null;
        const allIndices = [...first.indices, ...second.indices];
        return { indices: allIndices, score: scoreForIndices(dice, allIndices) };
    },

    // Phase 2: 1 Drilling + 1 Viererfolge
    phase2(dice) {
        return tryTwoComponents(dice,
            pool => findRun(pool, 4),
            pool => findOfAKind(pool, 3, null)
        );
    },

    // Phase 3: 1 Vierling + 1 Viererfolge
    phase3(dice) {
        return tryTwoComponents(dice,
            pool => findRun(pool, 4),
            pool => findOfAKind(pool, 4, null)
        );
    },

    // Phase 4: 1 Siebenerfolge (run of 7)
    phase4(dice) {
        const pool = makePool(dice);
        const run = findRun(pool, 7);
        if (!run) return null;
        return { indices: run.indices, score: scoreForIndices(dice, run.indices) };
    },

    // Phase 5: 1 Achterfolge (run of 8)
    phase5(dice) {
        const pool = makePool(dice);
        const run = findRun(pool, 8);
        if (!run) return null;
        return { indices: run.indices, score: scoreForIndices(dice, run.indices) };
    },

    // Phase 6: 1 Neunerfolge (run of 9)
    phase6(dice) {
        const pool = makePool(dice);
        const run = findRun(pool, 9);
        if (!run) return null;
        return { indices: run.indices, score: scoreForIndices(dice, run.indices) };
    },

    // Phase 7: 2 Vierlinge (two four-of-a-kinds)
    phase7(dice) {
        return tryTwoComponents(dice,
            pool => findOfAKind(pool, 4, null),
            pool => findOfAKind(pool, 4, null)
        );
    },

    // Phase 8: 7 gleiche Farbe (7 of same color)
    phase8(dice) {
        const pool = makePool(dice);
        const colorMatch = findSameColor(pool, 7);
        if (!colorMatch) return null;
        return { indices: colorMatch, score: scoreForIndices(dice, colorMatch) };
    },

    // Phase 9: 1 Fuenfling + 1 Zwilling
    phase9(dice) {
        return tryTwoComponents(dice,
            pool => findOfAKind(pool, 5, null),
            pool => findOfAKind(pool, 2, null)
        );
    },

    // Phase 10: 1 Fuenfling + 1 Drilling
    phase10(dice) {
        return tryTwoComponents(dice,
            pool => findOfAKind(pool, 5, null),
            pool => findOfAKind(pool, 3, null)
        );
    }
};

/**
 * Validate whether the rolled dice can complete a given phase.
 * Returns { valid: true, score, indices } or { valid: false }.
 */
function validatePhaseCompletion(dice, phaseKey) {
    if (!dice || !Array.isArray(dice) || dice.length !== DICE_COUNT) {
        return { valid: false };
    }
    const validator = PHASE_VALIDATORS[phaseKey];
    if (!validator) return { valid: false };

    const result = validator(dice);
    if (!result) return { valid: false };

    return { valid: true, score: result.score, indices: result.indices };
}

/**
 * Get the phase key for a given phase number (1-10).
 */
function phaseKeyFromNumber(phaseNumber) {
    if (phaseNumber < 1 || phaseNumber > 10) return null;
    return `phase${phaseNumber}`;
}

module.exports = {
    DICE_COUNT,
    MAX_ROLLS,
    COLORS,
    rollPhase10Dice,
    createPhase10TurnState,
    isValidPhase10Held,
    validatePhaseCompletion,
    phaseKeyFromNumber
};
