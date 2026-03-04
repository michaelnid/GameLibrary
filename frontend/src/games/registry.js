import { getKniffelLiveSummary } from './kniffel';

const KNIFFEL_DEFINITION = {
    id: 'kniffel',
    name: 'Kniffel',
    description: 'Klassischer digitaler Kniffel-Spielblock mit Live-Scoreboard.',
    supportsDiceInput: true,
    categoryKeys: [
        'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
        'threeOfAKind', 'fourOfAKind', 'fullHouse',
        'smallStraight', 'largeStraight', 'kniffel', 'chance'
    ],
    sections: [
        {
            id: 'upper',
            label: 'Oberer Block',
            categories: [
                { key: 'ones', label: 'Einser' },
                { key: 'twos', label: 'Zweier' },
                { key: 'threes', label: 'Dreier' },
                { key: 'fours', label: 'Vierer' },
                { key: 'fives', label: 'Fünfer' },
                { key: 'sixes', label: 'Sechser' }
            ]
        },
        {
            id: 'lower',
            label: 'Unterer Block',
            categories: [
                { key: 'threeOfAKind', label: 'Dreierpasch' },
                { key: 'fourOfAKind', label: 'Viererpasch' },
                { key: 'fullHouse', label: 'Full House' },
                { key: 'smallStraight', label: 'Kleine Straße' },
                { key: 'largeStraight', label: 'Große Straße' },
                { key: 'kniffel', label: 'Kniffel' },
                { key: 'chance', label: 'Chance' }
            ]
        }
    ]
};

const PHASE10_DICE_DEFINITION = {
    id: 'phase10dice',
    name: 'Phase 10 Würfelspiel',
    description: 'Punktetafel für das Phase 10 Würfelspiel mit 10 Phasen und automatischen Boni.',
    supportsDiceInput: false,
    categoryKeys: [
        'phase1', 'phase2', 'phase3', 'phase4', 'phase5',
        'phase6', 'phase7', 'phase8', 'phase9', 'phase10'
    ],
    sections: [
        {
            id: 'phases',
            label: 'Phasen 1-10',
            categories: [
                { key: 'phase1', label: 'Phase 1', requirement: '2 Drillinge', maxPoints: 60 },
                { key: 'phase2', label: 'Phase 2', requirement: '1 Drilling + 1 Viererfolge', maxPoints: 57 },
                { key: 'phase3', label: 'Phase 3', requirement: '1 Vierling + 1 Viererfolge', maxPoints: 59 },
                { key: 'phase4', label: 'Phase 4', requirement: '1 Siebenerfolge', maxPoints: 49 },
                { key: 'phase5', label: 'Phase 5', requirement: '1 Achterfolge', maxPoints: 52 },
                { key: 'bonusThreshold', label: '>=221 bis Phase 5', requirement: 'Automatisch +40', maxPoints: 40 },
                { key: 'phase6', label: 'Phase 6', requirement: '1 Neunerfolge', maxPoints: 54 },
                { key: 'phase7', label: 'Phase 7', requirement: '2 Vierlinge', maxPoints: 60 },
                { key: 'phase8', label: 'Phase 8', requirement: '7 gleiche Farbe', maxPoints: 56 },
                { key: 'phase9', label: 'Phase 9', requirement: '1 Fünfling + 1 Zwilling', maxPoints: 60 },
                { key: 'phase10', label: 'Phase 10', requirement: '1 Fünfling + 1 Drilling', maxPoints: 62 },
                { key: 'bonusFinisher', label: 'Schnellster Abschluss', requirement: 'Automatisch +40 fuer ersten Durchlauf', maxPoints: 40 }
            ]
        }
    ]
};

function cloneDefinition(definition) {
    return {
        ...definition,
        categoryKeys: [...definition.categoryKeys],
        sections: definition.sections.map((section) => ({
            id: section.id,
            label: section.label,
            categories: section.categories.map((category) => ({
                ...category,
                requirement: category.requirement || null
            }))
        }))
    };
}

export const FALLBACK_GAME_TYPES = [
    cloneDefinition(KNIFFEL_DEFINITION)
];

export function getFallbackGameDefinition(gameType = 'kniffel') {
    if (gameType === 'kniffel') {
        return cloneDefinition(KNIFFEL_DEFINITION);
    }

    if (gameType === 'phase10dice') {
        return cloneDefinition(PHASE10_DICE_DEFINITION);
    }

    return {
        id: gameType,
        name: gameType,
        description: '',
        supportsDiceInput: false,
        categoryKeys: [],
        sections: []
    };
}

function calculateGenericSectionTotals(scores, sections) {
    const totals = {};
    sections.forEach((section) => {
        totals[section.id] = section.categories.reduce((sum, category) => {
            const value = scores[category.key];
            return sum + (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
        }, 0);
    });
    return totals;
}

function normalizePlayer(player, gameType, gameDefinition) {
    const scores = player.scores || {};

    if (gameType === 'kniffel') {
        const summary = getKniffelLiveSummary(scores);
        return {
            ...player,
            scores,
            upperSum: player.upperSum ?? summary.upperSum,
            lowerSum: player.lowerSum ?? summary.lowerSum,
            bonus: player.bonus ?? summary.bonus,
            total: player.total ?? summary.total,
            sectionTotals: player.sectionTotals || {
                upper: player.upperSum ?? summary.upperSum,
                lower: player.lowerSum ?? summary.lowerSum
            }
        };
    }

    const sectionTotals = player.sectionTotals || calculateGenericSectionTotals(scores, gameDefinition.sections || []);
    const total = player.total ?? Object.values(sectionTotals).reduce((sum, value) => sum + value, 0);

    return {
        ...player,
        scores,
        total,
        sectionTotals
    };
}

export function normalizeGamePayload(game) {
    if (!game) return game;

    const gameType = game.gameType || 'kniffel';
    const gameDefinition = game.gameDefinition || getFallbackGameDefinition(gameType);

    return {
        ...game,
        gameType,
        gameTypeName: game.gameTypeName || gameDefinition.name || gameType,
        gameDefinition,
        players: (game.players || []).map((player) => normalizePlayer(player, gameType, gameDefinition))
    };
}
