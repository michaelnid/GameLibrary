const PHASE_CATEGORIES = [
    { key: 'phase1', label: 'Phase 1', requirement: '2 Drillinge', maxPoints: 60 },
    { key: 'phase2', label: 'Phase 2', requirement: '1 Drilling + 1 Viererfolge', maxPoints: 57 },
    { key: 'phase3', label: 'Phase 3', requirement: '1 Vierling + 1 Viererfolge', maxPoints: 59 },
    { key: 'phase4', label: 'Phase 4', requirement: '1 Siebenerfolge', maxPoints: 49 },
    { key: 'phase5', label: 'Phase 5', requirement: '1 Achterfolge', maxPoints: 52 },
    { key: 'phase6', label: 'Phase 6', requirement: '1 Neunerfolge', maxPoints: 54 },
    { key: 'phase7', label: 'Phase 7', requirement: '2 Vierlinge', maxPoints: 60 },
    { key: 'phase8', label: 'Phase 8', requirement: '7 gleiche Farbe', maxPoints: 56 },
    { key: 'phase9', label: 'Phase 9', requirement: '1 Fünfling + 1 Zwilling', maxPoints: 60 },
    { key: 'phase10', label: 'Phase 10', requirement: '1 Fünfling + 1 Drilling', maxPoints: 62 }
];

const BONUS_CATEGORIES = [
    { key: 'bonusThreshold', label: '>=221 bis Phase 5', requirement: 'Automatisch +40', maxPoints: 40 },
    { key: 'bonusFinisher', label: 'Schnellster Abschluss', requirement: 'Automatisch +40 fuer ersten Durchlauf', maxPoints: 40 }
];

const BONUS_THRESHOLD_KEY = 'bonusThreshold';
const BONUS_FINISH_KEY = 'bonusFinisher';
const LEGACY_BONUS_KEY = 'bonus';
const PHASE_BONUS_THRESHOLD = 221;
const PHASE_BONUS_VALUE = 40;
const FIRST_FINISHER_BONUS_VALUE = 40;

const phaseCategoryKeys = PHASE_CATEGORIES.map((category) => category.key);
const categoryKeys = [...phaseCategoryKeys];
const scoreTableCategories = [
    ...PHASE_CATEGORIES.slice(0, 5),
    BONUS_CATEGORIES[0],
    ...PHASE_CATEGORIES.slice(5),
    BONUS_CATEGORIES[1]
];

function toSafeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function calculateSectionTotal(scoreMap, categories) {
    return categories.reduce((sum, category) => sum + toSafeNumber(scoreMap[category.key]), 0);
}

function getPlayerSummary(scoreMap = {}) {
    let phaseTotal = calculateSectionTotal(scoreMap, scoreTableCategories);

    // Backward compatibility for older backups/games with a single legacy bonus field.
    const hasNewBonusEntries = Object.prototype.hasOwnProperty.call(scoreMap, BONUS_THRESHOLD_KEY)
        || Object.prototype.hasOwnProperty.call(scoreMap, BONUS_FINISH_KEY);
    if (!hasNewBonusEntries) {
        phaseTotal += toSafeNumber(scoreMap[LEGACY_BONUS_KEY]);
    }

    const total = phaseTotal;

    return {
        phaseTotal,
        total,
        sectionTotals: {
            phases: phaseTotal
        }
    };
}

module.exports = {
    id: 'phase10dice',
    name: 'Phase 10 Würfelspiel',
    description: 'Punktetafel für das Phase 10 Würfelspiel mit 10 Phasen und automatischen Boni.',
    supportsDiceInput: false,
    sections: [
        { id: 'phases', label: 'Phasen 1-10', categories: scoreTableCategories }
    ],
    categoryKeys,
    phaseCategoryKeys,
    bonusThresholdKey: BONUS_THRESHOLD_KEY,
    bonusFinisherKey: BONUS_FINISH_KEY,
    phaseBonusThreshold: PHASE_BONUS_THRESHOLD,
    phaseBonusValue: PHASE_BONUS_VALUE,
    firstFinisherBonusValue: FIRST_FINISHER_BONUS_VALUE,
    getPlayerSummary,
    getProfileScore(scoreMap = {}) {
        return getPlayerSummary(scoreMap).total;
    }
};
