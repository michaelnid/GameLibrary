const kniffel = require('./kniffel');
const phase10dice = require('./phase10dice');
const tictactoe = require('./tictactoe');
const tictactoevanish = require('./tictactoevanish');
const connectfour = require('./connectfour');
const battleship = require('./battleship');
const uno = require('./uno');

const DEFAULT_GAME_TYPE = 'kniffel';

// Multiplayer variants reuse the same scoring logic but get a dedicated highscore category
const kniffelMultiplayer = {
    ...kniffel,
    id: 'kniffel-multiplayer',
    name: 'Kniffel Multiplayer',
    multiplayerOnly: true
};

const phase10diceMultiplayer = {
    ...phase10dice,
    id: 'phase10dice-multiplayer',
    name: 'Phase 10 Würfelspiel Multiplayer',
    multiplayerOnly: true
};

const tictactoeMultiplayer = {
    ...tictactoe,
    id: 'tictactoe-multiplayer',
    name: 'TicTacToe Multiplayer',
    multiplayerOnly: true
};

const connectfourMultiplayer = {
    ...connectfour,
    id: 'connectfour-multiplayer',
    name: 'Vier Gewinnt Multiplayer',
    multiplayerOnly: true
};

const tictactoevanishMultiplayer = {
    ...tictactoevanish,
    id: 'tictactoevanish-multiplayer',
    name: 'TicTacToe Vanish Multiplayer',
    multiplayerOnly: true
};

const battleshipMultiplayer = {
    ...battleship,
    id: 'battleship-multiplayer',
    name: 'Schiffe Versenken Multiplayer',
    multiplayerOnly: true
};

const unoMultiplayer = {
    ...uno,
    id: 'uno-multiplayer',
    name: 'UNO Multiplayer',
    multiplayerOnly: true
};

// All definitions – used for internal lookups (getGameDefinition)
const gameDefinitions = [
    kniffel,
    kniffelMultiplayer,
    phase10dice,
    phase10diceMultiplayer,
    tictactoe,
    tictactoeMultiplayer,
    tictactoevanish,
    tictactoevanishMultiplayer,
    connectfour,
    connectfourMultiplayer,
    battleship,
    battleshipMultiplayer,
    uno,
    unoMultiplayer
];

// Board games that only exist as multiplayer – no local mode
const multiplayerOnlyBaseIds = new Set(['tictactoe', 'tictactoevanish', 'connectfour', 'battleship', 'uno']);

// Public list – excludes base entries for multiplayer-only games
const publicGameDefinitions = gameDefinitions.filter(
    (def) => !multiplayerOnlyBaseIds.has(def.id)
);
const registry = new Map(gameDefinitions.map((definition) => [definition.id, definition]));

function serializeDefinition(definition) {
    return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        supportsDiceInput: Boolean(definition.supportsDiceInput),
        multiplayerOnly: Boolean(definition.multiplayerOnly),
        scoringType: definition.scoringType || 'score',
        categoryKeys: [...definition.categoryKeys],
        sections: definition.sections.map((section) => ({
            id: section.id,
            label: section.label,
            categories: section.categories.map((category) => ({
                key: category.key,
                label: category.label,
                requirement: category.requirement || null,
                maxPoints: Number.isFinite(category.maxPoints) ? category.maxPoints : null
            }))
        }))
    };
}

function getGameDefinition(gameType) {
    if (!gameType) {
        return registry.get(DEFAULT_GAME_TYPE);
    }
    return registry.get(gameType) || null;
}

function listGameDefinitions() {
    return publicGameDefinitions.map((definition) => serializeDefinition(definition));
}

function listLocalGameDefinitions() {
    return gameDefinitions
        .filter((definition) => !definition.multiplayerOnly)
        .map((definition) => serializeDefinition(definition));
}

module.exports = {
    DEFAULT_GAME_TYPE,
    getGameDefinition,
    listGameDefinitions,
    listLocalGameDefinitions,
    serializeDefinition
};
