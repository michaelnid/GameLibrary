const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { MultiplayerRoom, MultiplayerPlayer, User } = require('../models');
const { rollDice, createTurnState, isValidHeld, calculatePossibleScores, MAX_ROLLS } = require('../services/multiplayerDice');
const { rollPhase10Dice, createPhase10TurnState, isValidPhase10Held, validatePhaseCompletion, phaseKeyFromNumber, DICE_COUNT: P10_DICE_COUNT, MAX_ROLLS: P10_MAX_ROLLS } = require('../services/phase10Dice');
const { getGameDefinition } = require('../games');
const { BOARD_SIZE: BS_BOARD_SIZE, SHIP_DEFINITIONS: BS_SHIP_DEFS } = require('../games/battleship');

// Helper: is this a Phase 10 game type?
function isPhase10(gameType) {
    return gameType === 'phase10dice' || gameType === 'phase10dice-multiplayer';
}

function isTicTacToe(gameType) {
    return gameType === 'tictactoe' || gameType === 'tictactoe-multiplayer';
}

function isConnectFour(gameType) {
    return gameType === 'connectfour' || gameType === 'connectfour-multiplayer';
}

function isTicTacToeVanish(gameType) {
    return gameType === 'tictactoevanish' || gameType === 'tictactoevanish-multiplayer';
}

function isBattleship(gameType) {
    return gameType === 'battleship' || gameType === 'battleship-multiplayer';
}

function isUno(gameType) {
    return gameType === 'uno' || gameType === 'uno-multiplayer';
}

// Any board game (TicTacToe, TicTacToe Vanish, Connect Four, Battleship)
function isBoardGame(gameType) {
    return isTicTacToe(gameType) || isTicTacToeVanish(gameType) || isConnectFour(gameType) || isBattleship(gameType);
}

function isSanitizedMultiplayerGame(gameType) {
    return isBattleship(gameType) || isUno(gameType);
}

const TICTACTOE_WIN_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

function normalizeScores(rawScores) {
    if (!rawScores) return {};

    if (typeof rawScores === 'string') {
        try {
            const parsed = JSON.parse(rawScores);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (_) {
            return {};
        }
        return {};
    }

    if (typeof rawScores === 'object' && !Array.isArray(rawScores)) {
        return rawScores;
    }

    return {};
}

function buildPhase10ScoringDice(diceState) {
    const dice = Array.isArray(diceState?.dice) ? diceState.dice : [];
    const held = Array.isArray(diceState?.held) ? diceState.held : [];
    const hasSelected = held.some(Boolean);

    if (!hasSelected) {
        return dice;
    }

    return dice.map((die, index) => (held[index] ? die : null));
}

function createTicTacToeState(turnOrder = []) {
    const marks = {};
    if (turnOrder[0]) marks[String(turnOrder[0])] = 'X';
    if (turnOrder[1]) marks[String(turnOrder[1])] = 'O';

    return {
        board: new Array(9).fill(null),
        marks,
        winnerUserId: null,
        winningLine: null,
        draw: false,
        rematchVotes: []
    };
}

function normalizeTicTacToeState(rawState, turnOrder = []) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const board = Array.isArray(state.board) && state.board.length === 9
        ? state.board.map((cell) => (cell === 'X' || cell === 'O' ? cell : null))
        : new Array(9).fill(null);

    const marks = state.marks && typeof state.marks === 'object' ? { ...state.marks } : {};
    if (turnOrder[0] && !marks[String(turnOrder[0])]) marks[String(turnOrder[0])] = 'X';
    if (turnOrder[1] && !marks[String(turnOrder[1])]) marks[String(turnOrder[1])] = 'O';

    const rematchVotes = Array.isArray(state.rematchVotes)
        ? Array.from(new Set(
            state.rematchVotes
                .map((value) => Number.parseInt(value, 10))
                .filter((value) => Number.isInteger(value) && value > 0)
        ))
        : [];

    return {
        board,
        marks,
        winnerUserId: state.winnerUserId || null,
        winningLine: Array.isArray(state.winningLine) ? state.winningLine : null,
        draw: Boolean(state.draw),
        rematchVotes
    };
}

function getNextTicTacToeTurnOrder(turnOrder = []) {
    if (!Array.isArray(turnOrder) || turnOrder.length !== 2) return turnOrder;
    return [turnOrder[1], turnOrder[0]];
}

function getTicTacToeWinner(board) {
    for (const line of TICTACTOE_WIN_LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[b] === board[c]) {
            return { symbol: board[a], line };
        }
    }
    return null;
}

function isTicTacToeDraw(board) {
    return board.every((cell) => cell === 'X' || cell === 'O');
}

function tictactoeScoresForResult(result) {
    if (result === 'win') return { result: 'win', points: 3 };
    if (result === 'draw') return { result: 'draw', points: 1 };
    return { result: 'loss', points: 0 };
}

// ── TicTacToe Vanish helpers ──
const VANISH_MAX_CHIPS = 3;

function createTicTacToeVanishState(turnOrder = []) {
    const marks = {};
    if (turnOrder[0]) marks[String(turnOrder[0])] = 'X';
    if (turnOrder[1]) marks[String(turnOrder[1])] = 'O';
    return {
        board: new Array(9).fill(null),
        marks,
        moveHistory: { X: [], O: [] },
        winnerUserId: null,
        winningLine: null,
        draw: false,
        rematchVotes: []
    };
}

function normalizeTicTacToeVanishState(rawState, turnOrder = []) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const board = Array.isArray(state.board) && state.board.length === 9
        ? state.board.map((cell) => (cell === 'X' || cell === 'O' ? cell : null))
        : new Array(9).fill(null);
    const marks = state.marks && typeof state.marks === 'object' ? { ...state.marks } : {};
    if (turnOrder[0] && !marks[String(turnOrder[0])]) marks[String(turnOrder[0])] = 'X';
    if (turnOrder[1] && !marks[String(turnOrder[1])]) marks[String(turnOrder[1])] = 'O';
    const moveHistory = state.moveHistory && typeof state.moveHistory === 'object'
        ? {
            X: Array.isArray(state.moveHistory.X) ? state.moveHistory.X.filter(v => Number.isInteger(v) && v >= 0 && v < 9) : [],
            O: Array.isArray(state.moveHistory.O) ? state.moveHistory.O.filter(v => Number.isInteger(v) && v >= 0 && v < 9) : []
        }
        : { X: [], O: [] };
    const rematchVotes = Array.isArray(state.rematchVotes)
        ? Array.from(new Set(
            state.rematchVotes
                .map((v) => Number.parseInt(v, 10))
                .filter((v) => Number.isInteger(v) && v > 0)
        ))
        : [];
    return {
        board, marks, moveHistory,
        winnerUserId: state.winnerUserId || null,
        winningLine: Array.isArray(state.winningLine) ? state.winningLine : null,
        draw: Boolean(state.draw),
        rematchVotes
    };
}

// ── Connect Four helpers ──
const C4_ROWS = 6;
const C4_COLS = 7;
const C4_CELLS = C4_ROWS * C4_COLS; // 42

function createConnectFourState(turnOrder = []) {
    const marks = {};
    if (turnOrder[0]) marks[String(turnOrder[0])] = 'R'; // Red
    if (turnOrder[1]) marks[String(turnOrder[1])] = 'Y'; // Yellow
    return {
        board: new Array(C4_CELLS).fill(null),
        marks,
        winnerUserId: null,
        winningLine: null,
        draw: false,
        rematchVotes: []
    };
}

function normalizeConnectFourState(rawState, turnOrder = []) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const board = Array.isArray(state.board) && state.board.length === C4_CELLS
        ? state.board.map((cell) => (cell === 'R' || cell === 'Y' ? cell : null))
        : new Array(C4_CELLS).fill(null);
    const marks = state.marks && typeof state.marks === 'object' ? { ...state.marks } : {};
    if (turnOrder[0] && !marks[String(turnOrder[0])]) marks[String(turnOrder[0])] = 'R';
    if (turnOrder[1] && !marks[String(turnOrder[1])]) marks[String(turnOrder[1])] = 'Y';
    const rematchVotes = Array.isArray(state.rematchVotes)
        ? Array.from(new Set(
            state.rematchVotes
                .map((v) => Number.parseInt(v, 10))
                .filter((v) => Number.isInteger(v) && v > 0)
        ))
        : [];
    return {
        board, marks,
        winnerUserId: state.winnerUserId || null,
        winningLine: Array.isArray(state.winningLine) ? state.winningLine : null,
        draw: Boolean(state.draw),
        rematchVotes
    };
}

function getNextConnectFourTurnOrder(turnOrder = []) {
    if (!Array.isArray(turnOrder) || turnOrder.length !== 2) return turnOrder;
    return [turnOrder[1], turnOrder[0]];
}

function rotateTurnOrder(turnOrder = []) {
    if (!Array.isArray(turnOrder) || turnOrder.length <= 1) return turnOrder;
    return [...turnOrder.slice(1), turnOrder[0]];
}

// Board: row 0 = top, row 5 = bottom. Index = row * 7 + col.
function c4Index(row, col) { return row * C4_COLS + col; }

function getConnectFourDropRow(board, col) {
    // Drop to lowest empty row in the given column
    for (let row = C4_ROWS - 1; row >= 0; row--) {
        if (!board[c4Index(row, col)]) return row;
    }
    return -1; // column full
}

function getConnectFourWinner(board) {
    // Check all possible 4-in-a-row lines
    const directions = [
        [0, 1],  // horizontal
        [1, 0],  // vertical
        [1, 1],  // diagonal down-right
        [1, -1]  // diagonal down-left
    ];
    for (let row = 0; row < C4_ROWS; row++) {
        for (let col = 0; col < C4_COLS; col++) {
            const cell = board[c4Index(row, col)];
            if (!cell) continue;
            for (const [dr, dc] of directions) {
                const endRow = row + dr * 3;
                const endCol = col + dc * 3;
                if (endRow < 0 || endRow >= C4_ROWS || endCol < 0 || endCol >= C4_COLS) continue;
                const line = [];
                let match = true;
                for (let step = 0; step < 4; step++) {
                    const idx = c4Index(row + dr * step, col + dc * step);
                    line.push(idx);
                    if (board[idx] !== cell) { match = false; break; }
                }
                if (match) return { symbol: cell, line };
            }
        }
    }
    return null;
}

function isConnectFourDraw(board) {
    return board.every((cell) => cell === 'R' || cell === 'Y');
}

function connectFourScoresForResult(result) {
    if (result === 'win') return { result: 'win', points: 3 };
    if (result === 'draw') return { result: 'draw', points: 1 };
    return { result: 'loss', points: 0 };
}

// ── Battleship helpers ──
function createBattleshipState(turnOrder = []) {
    const boards = {};
    for (const userId of turnOrder) {
        boards[String(userId)] = { ships: [], attacks: [] };
    }
    return {
        phase: 'placing',
        boards,
        placementReady: [],
        winnerUserId: null,
        rematchVotes: []
    };
}

function normalizeBattleshipState(rawState, turnOrder = []) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const boards = state.boards && typeof state.boards === 'object' ? state.boards : {};
    for (const userId of turnOrder) {
        const key = String(userId);
        if (!boards[key] || typeof boards[key] !== 'object') {
            boards[key] = { ships: [], attacks: [] };
        }
        if (!Array.isArray(boards[key].ships)) boards[key].ships = [];
        if (!Array.isArray(boards[key].attacks)) boards[key].attacks = [];
    }
    const placementReady = Array.isArray(state.placementReady)
        ? state.placementReady.filter(v => turnOrder.includes(v))
        : [];
    const rematchVotes = Array.isArray(state.rematchVotes)
        ? Array.from(new Set(
            state.rematchVotes
                .map(v => Number.parseInt(v, 10))
                .filter(v => Number.isInteger(v) && v > 0)
        ))
        : [];
    return {
        phase: state.phase === 'attacking' ? 'attacking' : 'placing',
        boards,
        placementReady,
        winnerUserId: state.winnerUserId || null,
        rematchVotes
    };
}

function validateShipPlacement(ships) {
    if (!Array.isArray(ships) || ships.length !== BS_SHIP_DEFS.length) {
        return { valid: false, error: `Genau ${BS_SHIP_DEFS.length} Schiffe erforderlich` };
    }

    const occupied = new Set();
    const usedIds = new Set();

    for (const ship of ships) {
        if (!ship || typeof ship !== 'object') return { valid: false, error: 'Ungueltiges Schiff-Objekt' };
        const def = BS_SHIP_DEFS.find(d => d.id === ship.id);
        if (!def) return { valid: false, error: `Unbekanntes Schiff: ${ship.id}` };
        if (usedIds.has(ship.id)) return { valid: false, error: `Schiff doppelt: ${ship.id}` };
        usedIds.add(ship.id);

        const cells = ship.cells;
        if (!Array.isArray(cells) || cells.length !== def.size) {
            return { valid: false, error: `${def.name} muss ${def.size} Zellen haben` };
        }

        for (const cell of cells) {
            if (!cell || typeof cell !== 'object') return { valid: false, error: 'Ungueltige Zelle' };
            const { row, col } = cell;
            if (!Number.isInteger(row) || !Number.isInteger(col) ||
                row < 0 || row >= BS_BOARD_SIZE || col < 0 || col >= BS_BOARD_SIZE) {
                return { valid: false, error: 'Zelle ausserhalb des Spielfelds' };
            }
            const key = `${row},${col}`;
            if (occupied.has(key)) return { valid: false, error: 'Schiffe ueberlappen sich' };
            occupied.add(key);
        }

        // Validate cells form a straight line (horizontal or vertical)
        const rows = cells.map(c => c.row);
        const cols = cells.map(c => c.col);
        const sameRow = rows.every(r => r === rows[0]);
        const sameCol = cols.every(c => c === cols[0]);
        if (!sameRow && !sameCol) return { valid: false, error: `${def.name}: Zellen muessen in einer Linie liegen` };

        // Check contiguity
        if (sameRow) {
            const sorted = [...cols].sort((a, b) => a - b);
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i] - sorted[i - 1] !== 1) return { valid: false, error: `${def.name}: Zellen muessen zusammenhaengend sein` };
            }
        } else {
            const sorted = [...rows].sort((a, b) => a - b);
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i] - sorted[i - 1] !== 1) return { valid: false, error: `${def.name}: Zellen muessen zusammenhaengend sein` };
            }
        }
    }

    // All ship IDs must be present
    for (const def of BS_SHIP_DEFS) {
        if (!usedIds.has(def.id)) return { valid: false, error: `Schiff fehlt: ${def.name}` };
    }

    return { valid: true };
}

function processAttack(board, row, col) {
    // Check if already attacked
    if (board.attacks.some(a => a.row === row && a.col === col)) {
        return { valid: false, error: 'Dieses Feld wurde bereits angegriffen' };
    }

    // Check for hit
    for (const ship of board.ships) {
        const cellIndex = ship.cells.findIndex(c => c.row === row && c.col === col);
        if (cellIndex !== -1) {
            ship.hits[cellIndex] = true;
            const isSunk = ship.hits.every(Boolean);
            const attack = { row, col, result: isSunk ? 'sunk' : 'hit', shipId: isSunk ? ship.id : null };
            board.attacks.push(attack);
            return { valid: true, result: isSunk ? 'sunk' : 'hit', shipId: isSunk ? ship.id : null, sunkShip: isSunk ? ship : null };
        }
    }

    // Miss
    board.attacks.push({ row, col, result: 'miss' });
    return { valid: true, result: 'miss' };
}

function allShipsSunk(board) {
    return board.ships.length > 0 && board.ships.every(ship => ship.hits.every(Boolean));
}

function battleshipScoresForResult(result) {
    if (result === 'win') return { result: 'win', points: 3 };
    return { result: 'loss', points: 0 };
}

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];
const UNO_TYPES = ['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];
const UNO_START_HAND = 7;

function isUnoColor(color) {
    return typeof color === 'string' && UNO_COLORS.includes(color);
}

function isUnoType(type) {
    return typeof type === 'string' && UNO_TYPES.includes(type);
}

function createUnoCard(color, type, value, index) {
    return {
        id: `uno-${index}`,
        color: color || null,
        type,
        value: Number.isInteger(value) ? value : null
    };
}

function normalizeUnoCard(rawCard) {
    if (!rawCard || typeof rawCard !== 'object') return null;
    if (typeof rawCard.id !== 'string' || !rawCard.id) return null;
    if (!isUnoType(rawCard.type)) return null;

    if (rawCard.type === 'number') {
        if (!isUnoColor(rawCard.color)) return null;
        if (!Number.isInteger(rawCard.value) || rawCard.value < 0 || rawCard.value > 9) return null;
    } else if (rawCard.type === 'wild' || rawCard.type === 'wild4') {
        if (rawCard.color !== null) return null;
    } else if (!isUnoColor(rawCard.color)) {
        return null;
    }

    return {
        id: rawCard.id,
        color: rawCard.color,
        type: rawCard.type,
        value: rawCard.type === 'number' ? rawCard.value : null
    };
}

function shuffleCards(cards) {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function createUnoDeck() {
    const cards = [];
    let index = 1;
    for (const color of UNO_COLORS) {
        cards.push(createUnoCard(color, 'number', 0, index++));
        for (let number = 1; number <= 9; number++) {
            cards.push(createUnoCard(color, 'number', number, index++));
            cards.push(createUnoCard(color, 'number', number, index++));
        }
        for (let copy = 0; copy < 2; copy++) {
            cards.push(createUnoCard(color, 'skip', null, index++));
            cards.push(createUnoCard(color, 'reverse', null, index++));
            cards.push(createUnoCard(color, 'draw2', null, index++));
        }
    }
    for (let copy = 0; copy < 4; copy++) {
        cards.push(createUnoCard(null, 'wild', null, index++));
        cards.push(createUnoCard(null, 'wild4', null, index++));
    }
    return shuffleCards(cards);
}

function replenishUnoDrawPile(state) {
    if (!Array.isArray(state?.drawPile) || state.drawPile.length > 0) return;
    if (!Array.isArray(state?.discardPile) || state.discardPile.length <= 1) return;
    const topCard = state.discardPile[state.discardPile.length - 1];
    const rest = state.discardPile.slice(0, -1);
    state.drawPile = shuffleCards(rest);
    state.discardPile = [topCard];
}

function drawUnoCards(state, amount) {
    const cards = [];
    const count = Math.max(0, Number.parseInt(amount, 10) || 0);
    for (let i = 0; i < count; i++) {
        replenishUnoDrawPile(state);
        if (!state.drawPile.length) break;
        cards.push(state.drawPile.pop());
    }
    return cards;
}

function getUnoNextTurnUserId(turnOrder = [], currentUserId, direction = 1, steps = 1) {
    if (!Array.isArray(turnOrder) || turnOrder.length === 0) return null;
    const currentIndex = turnOrder.indexOf(currentUserId);
    if (currentIndex < 0) return turnOrder[0];
    const normalizedDirection = direction === -1 ? -1 : 1;
    let nextIndex = currentIndex;
    for (let i = 0; i < steps; i++) {
        nextIndex = (nextIndex + normalizedDirection + turnOrder.length) % turnOrder.length;
    }
    return turnOrder[nextIndex];
}

function isPlayableUnoCard(card, topCard, currentColor) {
    if (!card || !topCard) return false;
    if (card.type === 'wild' || card.type === 'wild4') return true;
    if (card.color && card.color === currentColor) return true;
    if (card.type === 'number' && topCard.type === 'number') {
        return card.value === topCard.value;
    }
    if (card.type !== 'number' && topCard.type !== 'number') {
        return card.type === topCard.type;
    }
    return false;
}

function unoScoresForResult(result) {
    if (result === 'win') return { result: 'win', points: 3 };
    return { result: 'loss', points: 0 };
}

function createUnoState(turnOrder = []) {
    const hands = {};
    const drawPile = createUnoDeck();

    for (const userId of turnOrder) {
        const key = String(userId);
        hands[key] = drawUnoCards({ drawPile, discardPile: [] }, UNO_START_HAND);
    }

    let firstCard = null;
    let guard = drawPile.length + 1;
    while (guard > 0 && drawPile.length > 0) {
        guard -= 1;
        const candidate = drawPile.pop();
        if (candidate && candidate.type === 'number') {
            firstCard = candidate;
            break;
        }
        if (candidate) {
            drawPile.unshift(candidate);
        }
    }

    if (!firstCard) {
        firstCard = createUnoCard('red', 'number', 0, Date.now());
    }

    return {
        hands,
        drawPile,
        discardPile: [firstCard],
        currentColor: firstCard.color || 'red',
        direction: 1,
        winnerUserId: null,
        rematchVotes: []
    };
}

function normalizeUnoState(rawState, turnOrder = []) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const hands = state.hands && typeof state.hands === 'object' ? state.hands : {};
    const normalizedHands = {};
    for (const userId of turnOrder) {
        const key = String(userId);
        normalizedHands[key] = Array.isArray(hands[key])
            ? hands[key].map(normalizeUnoCard).filter(Boolean)
            : [];
    }

    let drawPile = Array.isArray(state.drawPile)
        ? state.drawPile.map(normalizeUnoCard).filter(Boolean)
        : [];
    let discardPile = Array.isArray(state.discardPile)
        ? state.discardPile.map(normalizeUnoCard).filter(Boolean)
        : [];

    if (discardPile.length === 0 && drawPile.length > 0) {
        discardPile = [drawPile.pop()];
    }

    if (discardPile.length === 0) {
        return createUnoState(turnOrder);
    }

    const topCard = discardPile[discardPile.length - 1];
    const currentColor = isUnoColor(state.currentColor)
        ? state.currentColor
        : (isUnoColor(topCard.color) ? topCard.color : 'red');

    const rematchVotes = Array.isArray(state.rematchVotes)
        ? Array.from(new Set(
            state.rematchVotes
                .map((value) => Number.parseInt(value, 10))
                .filter((value) => Number.isInteger(value) && value > 0)
        ))
        : [];

    if (!Array.isArray(drawPile)) {
        drawPile = [];
    }

    return {
        hands: normalizedHands,
        drawPile,
        discardPile,
        currentColor,
        direction: state.direction === -1 ? -1 : 1,
        winnerUserId: state.winnerUserId || null,
        rematchVotes
    };
}

function sanitizeUnoStateForUser(state, userId) {
    if (!state || typeof state !== 'object') return state;
    const userKey = String(userId);
    const hands = state.hands && typeof state.hands === 'object' ? state.hands : {};
    const sanitizedHands = {};
    const handCounts = {};

    for (const [key, cards] of Object.entries(hands)) {
        const cardList = Array.isArray(cards) ? cards : [];
        handCounts[key] = cardList.length;
        sanitizedHands[key] = key === userKey ? cardList : [];
    }

    return {
        ...state,
        hands: sanitizedHands,
        drawPile: [],
        handCounts,
        drawCount: Array.isArray(state.drawPile) ? state.drawPile.length : 0
    };
}

// Build a sanitized view of battleship state for a specific user
// Other player's ship positions are hidden unless the ship is sunk
function sanitizeBattleshipStateForUser(state, userId) {
    if (!state) return state;
    const sanitized = { ...state, boards: {} };
    const userKey = String(userId);

    for (const [key, board] of Object.entries(state.boards || {})) {
        if (key === userKey) {
            // Own board: show everything
            sanitized.boards[key] = board;
        } else {
            if (state.phase === 'placing') {
                // Placing phase: hide all opponent ships completely
                sanitized.boards[key] = { ships: [], attacks: [] };
            } else {
                // Attacking phase: only show attacks and sunk ships
                const visibleShips = state.winnerUserId
                    ? board.ships  // Game over: reveal all ships
                    : board.ships.filter(s => s.hits.every(Boolean)); // Only sunk
                sanitized.boards[key] = {
                    ships: visibleShips,
                    attacks: board.attacks
                };
            }
        }
    }
    return sanitized;
}

async function applyMultiplayerStatsForCompletedRoom(room, definition) {
    const mpGameType = `${room.gameType}-multiplayer`;
    const isWinLoss = definition.scoringType === 'winLoss';

    for (const p of room.players) {
        const user = await User.findByPk(p.userId);
        if (!user) continue;

        const pScores = normalizeScores(p.scores);
        const gameTotal = definition.getProfileScore(pScores);

        const statsByGameType = user.statsByGameType || {};
        const current = statsByGameType[mpGameType] || { totalGames: 0, totalScore: 0, highestSingleGame: 0 };
        current.totalGames += 1;
        current.totalScore += gameTotal;
        if (gameTotal > current.highestSingleGame) current.highestSingleGame = gameTotal;

        // Track win/loss/draw for board games
        if (isWinLoss) {
            current.wins = (current.wins || 0) + (pScores.result === 'win' ? 1 : 0);
            current.losses = (current.losses || 0) + (pScores.result === 'loss' ? 1 : 0);
            current.draws = (current.draws || 0) + (pScores.result === 'draw' ? 1 : 0);
        }

        user.statsByGameType = { ...statsByGameType, [mpGameType]: current };

        user.totalGames += 1;
        user.totalScore += gameTotal;
        if (gameTotal > user.highestSingleGame) user.highestSingleGame = gameTotal;
        await user.save();
    }
}

// Generate a unique 4-digit room code
async function generateRoomCode() {
    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const existing = await MultiplayerRoom.findOne({ where: { code } });
        if (!existing) return code;
    }
    throw new Error('Konnte keinen eindeutigen Raumcode generieren');
}

// Serialize room for API responses
// userId: if provided, sanitize sensitive multiplayer state (Battleship / UNO) for this specific user
function serializeRoom(room, userId = null) {
    const players = (room.players || []).map(mp => ({
        id: mp.id,
        userId: mp.userId,
        displayName: mp.user?.displayName || `Spieler ${mp.userId}`,
        scores: normalizeScores(mp.scores),
        currentPhase: mp.currentPhase || 1,
        phaseAttempt: mp.phaseAttempt || 1,
        isReady: mp.isReady,
        joinedAt: mp.joinedAt
    }));

    // Sanitize game-specific sensitive state per user
    let diceState = room.diceState || null;
    if (diceState && isBattleship(room.gameType)) {
        diceState = userId ? sanitizeBattleshipStateForUser(diceState, userId) : null;
    } else if (diceState && isUno(room.gameType)) {
        diceState = userId ? sanitizeUnoStateForUser(diceState, userId) : null;
    }

    return {
        id: room.id,
        code: room.code,
        gameType: room.gameType,
        status: room.status,
        maxPlayers: room.maxPlayers,
        createdBy: room.createdBy,
        creatorName: room.creator?.displayName || null,
        currentTurnUserId: room.currentTurnUserId,
        turnOrder: room.turnOrder || [],
        diceState,
        players,
        playerCount: players.length,
        createdAt: room.createdAt,
        completedAt: room.completedAt
    };
}

// Include associations for room queries
const ROOM_INCLUDE = [
    { model: User, as: 'creator', attributes: ['id', 'displayName'] },
    {
        model: MultiplayerPlayer,
        as: 'players',
        include: [{ model: User, as: 'user', attributes: ['id', 'displayName'] }]
    }
];

// POST /api/multiplayer/rooms – Create a new room (admin/gamemaster only)
router.post('/rooms', authenticate, requireRole('admin', 'gamemaster'), async (req, res) => {
    try {
        const gameType = req.body.gameType || 'kniffel';
        let maxPlayers = Math.min(Math.max(parseInt(req.body.maxPlayers, 10) || 4, 2), 8);
        if (isTicTacToe(gameType) || isConnectFour(gameType) || isTicTacToeVanish(gameType) || isBattleship(gameType)) {
            maxPlayers = 2;
        } else if (isUno(gameType)) {
            maxPlayers = Math.min(maxPlayers, 4);
        }

        const definition = getGameDefinition(gameType);
        if (!definition) {
            return res.status(400).json({ error: `Unbekannter Spieltyp: ${gameType}` });
        }

        const code = await generateRoomCode();
        const room = await MultiplayerRoom.create({
            code,
            gameType,
            maxPlayers,
            createdBy: req.userId,
            status: 'waiting'
        });

        // Creator auto-joins
        await MultiplayerPlayer.create({
            roomId: room.id,
            userId: req.userId,
            isReady: true
        });

        const fullRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const io = req.app.get('io');
        if (io) io.emit('mp:roomCreated', { code: room.code });

        res.status(201).json(serializeRoom(fullRoom, req.userId));
    } catch (err) {
        console.error('Error creating room:', err);
        res.status(500).json({ error: 'Fehler beim Erstellen des Raums' });
    }
});

// GET /api/multiplayer/rooms – List rooms (default: open only, ?all=true: include completed, ?mine=true: only my rooms)
router.get('/rooms', authenticate, async (req, res) => {
    try {
        const where = {};
        if (req.query.all !== 'true') {
            where.status = ['waiting', 'playing'];
        }

        let rooms;
        if (req.query.mine === 'true') {
            // Find rooms where the current user is a player
            const myPlayerEntries = await MultiplayerPlayer.findAll({
                where: { userId: req.userId },
                attributes: ['roomId']
            });
            const myRoomIds = myPlayerEntries.map(p => p.roomId);
            if (myRoomIds.length === 0) {
                return res.json([]);
            }
            where.id = myRoomIds;
            rooms = await MultiplayerRoom.findAll({
                where,
                include: ROOM_INCLUDE,
                order: [['createdAt', 'DESC']],
                limit: 100
            });
        } else {
            rooms = await MultiplayerRoom.findAll({
                where,
                include: ROOM_INCLUDE,
                order: [['createdAt', 'DESC']],
                limit: 100
            });
        }

        res.json(rooms.map((entry) => serializeRoom(entry, req.userId)));
    } catch (err) {
        console.error('Error listing rooms:', err);
        res.status(500).json({ error: 'Fehler beim Laden der Räume' });
    }
});

// GET /api/multiplayer/rooms/:code – Get room details
router.get('/rooms/:code', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        res.json(serializeRoom(room, req.userId));
    } catch (err) {
        console.error('Error getting room:', err);
        res.status(500).json({ error: 'Fehler beim Laden des Raums' });
    }
});

// POST /api/multiplayer/rooms/:code/join – Join a room
router.post('/rooms/:code/join', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (room.status !== 'waiting') return res.status(400).json({ error: 'Spiel läuft bereits oder ist abgeschlossen' });

        const alreadyJoined = room.players.some(p => p.userId === req.userId);
        if (alreadyJoined) return res.status(400).json({ error: 'Du bist bereits in diesem Raum' });

        if (room.players.length >= room.maxPlayers) {
            return res.status(400).json({ error: 'Raum ist voll' });
        }

        await MultiplayerPlayer.create({
            roomId: room.id,
            userId: req.userId
        });

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const io = req.app.get('io');
        if (io) io.to(`mp:${room.code}`).emit('mp:playerJoined', serializeRoom(updatedRoom, req.userId));

        res.json(serializeRoom(updatedRoom, req.userId));
    } catch (err) {
        console.error('Error joining room:', err);
        res.status(500).json({ error: 'Fehler beim Beitreten' });
    }
});

// POST /api/multiplayer/rooms/:code/leave – Leave a room
router.post('/rooms/:code/leave', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });

        const player = room.players.find(p => p.userId === req.userId);
        if (!player) return res.status(400).json({ error: 'Du bist nicht in diesem Raum' });

        await player.destroy();

        // If room is empty, delete it
        const remaining = await MultiplayerPlayer.count({ where: { roomId: room.id } });
        if (remaining === 0) {
            await room.destroy();
            const io = req.app.get('io');
            if (io) io.emit('mp:roomDeleted', { code: room.code });
            return res.json({ message: 'Raum verlassen und gelöscht' });
        }

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const io = req.app.get('io');
        if (io) io.to(`mp:${room.code}`).emit('mp:playerLeft', serializeRoom(updatedRoom, req.userId));

        res.json(serializeRoom(updatedRoom, req.userId));
    } catch (err) {
        console.error('Error leaving room:', err);
        res.status(500).json({ error: 'Fehler beim Verlassen' });
    }
});

// POST /api/multiplayer/rooms/:code/ready – Toggle ready state
router.post('/rooms/:code/ready', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (room.status !== 'waiting') return res.status(400).json({ error: 'Spiel läuft bereits' });

        const player = room.players.find(p => p.userId === req.userId);
        if (!player) return res.status(400).json({ error: 'Du bist nicht in diesem Raum' });

        player.isReady = !player.isReady;
        await player.save();

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const io = req.app.get('io');
        if (io) io.to(`mp:${room.code}`).emit('mp:playerReady', serializeRoom(updatedRoom, req.userId));

        res.json(serializeRoom(updatedRoom, req.userId));
    } catch (err) {
        console.error('Error toggling ready:', err);
        res.status(500).json({ error: 'Fehler' });
    }
});

// POST /api/multiplayer/rooms/:code/start – Start the game (room creator only)
router.post('/rooms/:code/start', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (room.createdBy !== req.userId) return res.status(403).json({ error: 'Nur der Ersteller kann das Spiel starten' });
        if (room.status !== 'waiting') return res.status(400).json({ error: 'Spiel läuft bereits' });
        if (room.players.length < 2) return res.status(400).json({ error: 'Mindestens 2 Spieler benötigt' });
        if (isTicTacToe(room.gameType) && room.players.length !== 2) {
            return res.status(400).json({ error: 'TicTacToe ist nur für genau 2 Spieler verfügbar' });
        }
        if (isConnectFour(room.gameType) && room.players.length !== 2) {
            return res.status(400).json({ error: 'Vier Gewinnt ist nur fuer genau 2 Spieler verfuegbar' });
        }
        if (isTicTacToeVanish(room.gameType) && room.players.length !== 2) {
            return res.status(400).json({ error: 'TicTacToe Vanish ist nur fuer genau 2 Spieler verfuegbar' });
        }
        if (isBattleship(room.gameType) && room.players.length !== 2) {
            return res.status(400).json({ error: 'Schiffe Versenken ist nur fuer genau 2 Spieler verfuegbar' });
        }
        if (isUno(room.gameType) && (room.players.length < 2 || room.players.length > 4)) {
            return res.status(400).json({ error: 'UNO ist fuer 2 bis 4 Spieler verfuegbar' });
        }

        const allReady = room.players.every(p => p.isReady);
        if (!allReady) return res.status(400).json({ error: 'Nicht alle Spieler sind bereit' });

        // Randomize turn order
        const playerUserIds = room.players.map(p => p.userId);
        const turnOrder = playerUserIds.sort(() => Math.random() - 0.5);

        room.status = 'playing';
        room.turnOrder = turnOrder;
        room.currentTurnUserId = turnOrder[0];

        // Game-type-aware dice state
        if (isPhase10(room.gameType)) {
            room.diceState = createPhase10TurnState();
            // Reset all players to phase 1, attempt 1
            for (const p of room.players) {
                p.currentPhase = 1;
                p.phaseAttempt = 1;
                await p.save();
            }
        } else if (isTicTacToe(room.gameType)) {
            room.diceState = createTicTacToeState(turnOrder);
        } else if (isTicTacToeVanish(room.gameType)) {
            room.diceState = createTicTacToeVanishState(turnOrder);
        } else if (isConnectFour(room.gameType)) {
            room.diceState = createConnectFourState(turnOrder);
        } else if (isBattleship(room.gameType)) {
            room.diceState = createBattleshipState(turnOrder);
            room.currentTurnUserId = null; // No turns during placement phase
        } else if (isUno(room.gameType)) {
            room.diceState = createUnoState(turnOrder);
        } else {
            room.diceState = createTurnState();
        }
        await room.save();

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const io = req.app.get('io');
        if (io) {
            if (isSanitizedMultiplayerGame(room.gameType)) {
                io.to(`mp:${room.code}`).emit('mp:gameStarted', {
                    code: room.code,
                    gameType: room.gameType
                });
            } else {
                io.to(`mp:${room.code}`).emit('mp:gameStarted', serializeRoom(updatedRoom));
            }
        }

        res.json(serializeRoom(updatedRoom, req.userId));
    } catch (err) {
        console.error('Error starting game:', err);
        res.status(500).json({ error: 'Fehler beim Starten' });
    }
});

// POST /api/multiplayer/rooms/:code/roll – Roll dice (player's turn only)
router.post('/rooms/:code/roll', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (room.status !== 'playing') return res.status(400).json({ error: 'Spiel läuft nicht' });
        if (room.currentTurnUserId !== req.userId) return res.status(403).json({ error: 'Du bist nicht am Zug' });
        if (isBoardGame(room.gameType) || isUno(room.gameType)) return res.status(400).json({ error: 'Bei diesem Spieltyp gibt es keine Wuerfe' });

        if (isPhase10(room.gameType)) {
            // Phase 10 dice rolling (10 dice)
            const diceState = room.diceState || createPhase10TurnState();
            if (diceState.rollsLeft <= 0) return res.status(400).json({ error: 'Keine Würfe mehr übrig' });

            const held = diceState.rollsLeft === P10_MAX_ROLLS
                ? new Array(P10_DICE_COUNT).fill(false)
                : (diceState.held || new Array(P10_DICE_COUNT).fill(false));

            const newDice = rollPhase10Dice(diceState.dice, held);
            const newState = { dice: newDice, held, rollsLeft: diceState.rollsLeft - 1 };

            room.diceState = newState;
            await room.save();

            // Check which phase this player is on and if dice can complete it
            const player = room.players.find(p => p.userId === req.userId);
            const phaseKey = phaseKeyFromNumber(player ? player.currentPhase : 1);
            const scoringDice = buildPhase10ScoringDice(newState);
            const phaseResult = validatePhaseCompletion(scoringDice, phaseKey);

            const io = req.app.get('io');
            if (io) {
                io.to(`mp:${room.code}`).emit('mp:diceRolled', {
                    code: room.code,
                    diceState: newState,
                    phaseResult: { valid: phaseResult.valid, score: phaseResult.score || 0, indices: phaseResult.indices || [] },
                    userId: req.userId
                });
            }

            return res.json({ diceState: newState, phaseResult: { valid: phaseResult.valid, score: phaseResult.score || 0, indices: phaseResult.indices || [] } });
        }

        // Kniffel dice rolling (5 dice)
        const diceState = room.diceState || createTurnState();
        if (diceState.rollsLeft <= 0) return res.status(400).json({ error: 'Keine Würfe mehr übrig' });

        const held = diceState.rollsLeft === MAX_ROLLS
            ? [false, false, false, false, false]
            : (diceState.held || [false, false, false, false, false]);

        const newDice = rollDice(diceState.dice, held);
        const newState = {
            dice: newDice,
            held: held,
            rollsLeft: diceState.rollsLeft - 1
        };

        room.diceState = newState;
        await room.save();

        const possibleScores = calculatePossibleScores(newDice);

        const io = req.app.get('io');
        if (io) {
            io.to(`mp:${room.code}`).emit('mp:diceRolled', {
                code: room.code,
                diceState: newState,
                possibleScores,
                userId: req.userId
            });
        }

        res.json({ diceState: newState, possibleScores });
    } catch (err) {
        console.error('Error rolling dice:', err);
        res.status(500).json({ error: 'Fehler beim Würfeln' });
    }
});

// POST /api/multiplayer/rooms/:code/hold – Toggle hold on dice
router.post('/rooms/:code/hold', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (room.status !== 'playing') return res.status(400).json({ error: 'Spiel läuft nicht' });
        if (room.currentTurnUserId !== req.userId) return res.status(403).json({ error: 'Du bist nicht am Zug' });
        if (isBoardGame(room.gameType) || isUno(room.gameType)) return res.status(400).json({ error: 'Bei diesem Spieltyp gibt es kein Hold' });

        const { held } = req.body;

        if (isPhase10(room.gameType)) {
            if (!isValidPhase10Held(held)) return res.status(400).json({ error: 'Ungültige held-Daten' });
            const diceState = room.diceState || createPhase10TurnState();
            if (diceState.rollsLeft === P10_MAX_ROLLS) return res.status(400).json({ error: 'Zuerst würfeln' });

            const newDiceState = { ...diceState, held };
            room.diceState = newDiceState;
            await room.save();

            const player = room.players.find((p) => p.userId === req.userId);
            const phaseKey = phaseKeyFromNumber(player ? player.currentPhase : 1);
            const scoringDice = buildPhase10ScoringDice(newDiceState);
            const phaseResult = validatePhaseCompletion(scoringDice, phaseKey);

            const io = req.app.get('io');
            if (io) {
                io.to(`mp:${room.code}`).emit('mp:diceHeld', {
                    code: room.code,
                    diceState: newDiceState,
                    userId: req.userId,
                    phaseResult: { valid: phaseResult.valid, score: phaseResult.score || 0, indices: phaseResult.indices || [] }
                });
            }
            return res.json({
                diceState: newDiceState,
                phaseResult: { valid: phaseResult.valid, score: phaseResult.score || 0, indices: phaseResult.indices || [] }
            });
        }

        // Kniffel
        if (!isValidHeld(held)) return res.status(400).json({ error: 'Ungültige held-Daten' });

        const diceState = room.diceState || createTurnState();
        if (diceState.rollsLeft === MAX_ROLLS) return res.status(400).json({ error: 'Zuerst würfeln' });

        const newDiceState = { ...diceState, held };
        room.diceState = newDiceState;
        await room.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`mp:${room.code}`).emit('mp:diceHeld', {
                code: room.code,
                diceState: newDiceState,
                userId: req.userId
            });
        }

        res.json({ diceState: newDiceState });
    } catch (err) {
        console.error('Error holding dice:', err);
        res.status(500).json({ error: 'Fehler' });
    }
});

// POST /api/multiplayer/rooms/:code/draft-ships – Save draft ship placement (not ready yet)
router.post('/rooms/:code/draft-ships', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (!isBattleship(room.gameType)) return res.status(400).json({ error: 'Nur fuer Schiffe Versenken' });
        if (room.status !== 'playing') return res.status(400).json({ error: 'Spiel laeuft nicht' });

        const player = room.players.find(p => p.userId === req.userId);
        if (!player) return res.status(403).json({ error: 'Du bist nicht in diesem Raum' });

        const turnOrder = Array.isArray(room.turnOrder) ? room.turnOrder : [];
        // Deep clone to avoid Sequelize change detection issues
        const freshState = JSON.parse(JSON.stringify(
            normalizeBattleshipState(room.diceState || createBattleshipState(turnOrder), turnOrder)
        ));

        if (freshState.phase !== 'placing') {
            return res.status(400).json({ error: 'Platzierungsphase ist vorbei' });
        }
        if (freshState.placementReady.includes(req.userId)) {
            return res.status(400).json({ error: 'Du hast bereits bestaetigt' });
        }

        const { ships } = req.body;
        if (!Array.isArray(ships)) {
            return res.status(400).json({ error: 'ships muss ein Array sein' });
        }

        // Save draft ships (loose validation - just structure)
        const userKey = String(req.userId);
        freshState.boards[userKey].ships = ships.map(ship => ({
            id: ship.id,
            cells: Array.isArray(ship.cells) ? ship.cells.map(c => ({ row: c.row, col: c.col })) : [],
            hits: new Array(Array.isArray(ship.cells) ? ship.cells.length : 0).fill(false)
        }));

        room.diceState = freshState;
        room.changed('diceState', true);
        await room.save();

        res.json({ ok: true });
    } catch (err) {
        console.error('Draft ships error:', err);
        res.status(500).json({ error: 'Interner Fehler' });
    }
});

// POST /api/multiplayer/rooms/:code/place-ships – Battleship: place ships
router.post('/rooms/:code/place-ships', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (!isBattleship(room.gameType)) return res.status(400).json({ error: 'Dieser Endpoint ist nur fuer Schiffe Versenken' });
        if (room.status !== 'playing') return res.status(400).json({ error: 'Spiel laeuft nicht' });

        const player = room.players.find(p => p.userId === req.userId);
        if (!player) return res.status(403).json({ error: 'Du bist nicht in diesem Raum' });

        const turnOrder = Array.isArray(room.turnOrder) ? room.turnOrder : [];
        // Deep clone to avoid Sequelize change detection issues
        const state = JSON.parse(JSON.stringify(
            normalizeBattleshipState(room.diceState || createBattleshipState(turnOrder), turnOrder)
        ));

        if (state.phase !== 'placing') {
            return res.status(400).json({ error: 'Schiffe wurden bereits platziert' });
        }

        if (state.placementReady.includes(req.userId)) {
            return res.status(400).json({ error: 'Du hast deine Schiffe bereits platziert' });
        }

        const { ships } = req.body;
        const validation = validateShipPlacement(ships);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Store ships with hit tracking
        const userKey = String(req.userId);
        state.boards[userKey].ships = ships.map(ship => ({
            id: ship.id,
            cells: ship.cells.map(c => ({ row: c.row, col: c.col })),
            hits: new Array(ship.cells.length).fill(false)
        }));

        state.placementReady.push(req.userId);

        // Both players placed? Transition to attacking phase
        const bothReady = turnOrder.every(id => state.placementReady.includes(id));
        if (bothReady) {
            state.phase = 'attacking';
            room.currentTurnUserId = turnOrder[0];
        }

        room.diceState = state;
        room.changed('diceState', true);
        await room.save();

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const serialized = serializeRoom(updatedRoom, req.userId);

        const io = req.app.get('io');
        if (io) {
            io.to(`mp:${room.code}`).emit('mp:shipsPlaced', {
                code: room.code,
                userId: req.userId,
                placementReady: state.placementReady,
                phase: state.phase
            });

            if (bothReady) {
                // Minimal event - no diceState (clients fetchRoom for sanitized view)
                io.to(`mp:${room.code}`).emit('mp:gameStarted', {
                    code: room.code,
                    gameType: room.gameType
                });
            }
        }

        // Return personalized state for the requesting user
        return res.json({
            ...serialized,
            diceState: bothReady
                ? sanitizeBattleshipStateForUser(updatedRoom.diceState, req.userId)
                : sanitizeBattleshipStateForUser(state, req.userId)
        });
    } catch (err) {
        console.error('Error placing ships:', err);
        return res.status(500).json({ error: 'Fehler beim Platzieren der Schiffe' });
    }
});

// POST /api/multiplayer/rooms/:code/move – Move endpoint for board games and UNO
router.post('/rooms/:code/move', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        const isTTT = isTicTacToe(room.gameType);
        const isTTTV = isTicTacToeVanish(room.gameType);
        const isC4 = isConnectFour(room.gameType);
        const isBS = isBattleship(room.gameType);
        const isUnoGame = isUno(room.gameType);
        if (!isTTT && !isTTTV && !isC4 && !isBS && !isUnoGame) {
            return res.status(400).json({ error: 'Dieser Endpoint ist fuer diesen Spieltyp nicht verfuegbar' });
        }
        if (room.status !== 'playing') return res.status(400).json({ error: 'Spiel laeuft nicht' });
        if (room.currentTurnUserId !== req.userId) return res.status(403).json({ error: 'Du bist nicht am Zug' });

        const turnOrder = Array.isArray(room.turnOrder) ? room.turnOrder : [];
        if (!isUnoGame && turnOrder.length !== 2) {
            return res.status(400).json({ error: 'Dieses Spiel benoetigt genau 2 Spieler' });
        }
        if (isUnoGame && (turnOrder.length < 2 || turnOrder.length > 4)) {
            return res.status(400).json({ error: 'UNO benoetigt 2 bis 4 Spieler' });
        }

        const definition = getGameDefinition(room.gameType);
        if (!definition) return res.status(400).json({ error: 'Unbekannter Spieltyp' });

        let board, marks, playerMark, winner, isDraw, placedIndex, vanishedIndex, moveHistory;

        if (isUnoGame) {
            const state = normalizeUnoState(room.diceState || createUnoState(turnOrder), turnOrder);
            const userKey = String(req.userId);
            const hand = Array.isArray(state.hands[userKey]) ? state.hands[userKey] : [];
            if (!Array.isArray(state.hands[userKey])) {
                state.hands[userKey] = hand;
            }
            const topCard = state.discardPile[state.discardPile.length - 1];
            const action = req.body?.action === 'draw' ? 'draw' : 'play';

            if (!topCard) {
                return res.status(400).json({ error: 'UNO-Status ungueltig' });
            }

            if (action === 'draw') {
                const drawn = drawUnoCards(state, 1);
                if (!drawn.length) {
                    return res.status(400).json({ error: 'Keine Karten mehr zum Ziehen' });
                }
                hand.push(...drawn);

                const nextUserId = getUnoNextTurnUserId(turnOrder, req.userId, state.direction, 1);
                room.currentTurnUserId = nextUserId;
                room.diceState = state;
                room.changed('diceState', true);
                await room.save();

                const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
                const io = req.app.get('io');
                if (io) {
                    io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                        code: room.code,
                        category: 'draw',
                        value: 1,
                        userId: req.userId
                    });
                    io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                        code: room.code,
                        currentTurnUserId: nextUserId
                    });
                }
                return res.json(serializeRoom(updatedRoom, req.userId));
            }

            const cardId = typeof req.body?.cardId === 'string' ? req.body.cardId : '';
            const cardIndex = hand.findIndex((card) => card.id === cardId);
            if (cardIndex < 0) {
                return res.status(400).json({ error: 'Karte nicht in deiner Hand' });
            }

            const card = hand[cardIndex];
            if (!isPlayableUnoCard(card, topCard, state.currentColor)) {
                return res.status(400).json({ error: 'Diese Karte ist nicht spielbar' });
            }

            let nextDirection = state.direction;
            let nextSteps = 1;
            let forcedDraw = 0;

            if (card.type === 'reverse') {
                if (turnOrder.length === 2) {
                    nextSteps = 2;
                } else {
                    nextDirection = nextDirection * -1;
                }
            } else if (card.type === 'skip') {
                nextSteps = 2;
            } else if (card.type === 'draw2') {
                forcedDraw = 2;
                nextSteps = 2;
            } else if (card.type === 'wild4') {
                forcedDraw = 4;
                nextSteps = 2;
            }

            let nextColor = card.color;
            if (card.type === 'wild' || card.type === 'wild4') {
                const chosenColor = typeof req.body?.chosenColor === 'string' ? req.body.chosenColor : '';
                if (!isUnoColor(chosenColor)) {
                    return res.status(400).json({ error: 'Bei Wild musst du eine Farbe waehlen' });
                }
                nextColor = chosenColor;
            }

            hand.splice(cardIndex, 1);
            state.discardPile.push(card);
            state.currentColor = nextColor;
            state.direction = nextDirection;

            if (forcedDraw > 0) {
                const targetUserId = getUnoNextTurnUserId(turnOrder, req.userId, nextDirection, 1);
                const targetKey = String(targetUserId);
                if (!Array.isArray(state.hands[targetKey])) {
                    state.hands[targetKey] = [];
                }
                const drawnCards = drawUnoCards(state, forcedDraw);
                state.hands[targetKey].push(...drawnCards);
            }

            const isGameWon = hand.length === 0;
            if (isGameWon) {
                state.winnerUserId = req.userId;
                room.status = 'completed';
                room.completedAt = new Date();
                room.currentTurnUserId = null;
            } else {
                const nextUserId = getUnoNextTurnUserId(turnOrder, req.userId, nextDirection, nextSteps);
                room.currentTurnUserId = nextUserId;
            }

            room.diceState = state;
            room.changed('diceState', true);
            await room.save();

            if (isGameWon) {
                for (const p of room.players) {
                    const result = p.userId === req.userId ? 'win' : 'loss';
                    const playerScores = unoScoresForResult(result);
                    await MultiplayerPlayer.update(
                        { scores: playerScores },
                        { where: { id: p.id } }
                    );
                    p.scores = playerScores;
                }
                await applyMultiplayerStatsForCompletedRoom(room, definition);
            }

            const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
            const io = req.app.get('io');
            if (io) {
                io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                    code: room.code,
                    category: 'play',
                    value: { cardType: card.type, cardColor: nextColor },
                    userId: req.userId
                });

                if (isGameWon) {
                    io.to(`mp:${room.code}`).emit('mp:gameCompleted', { code: room.code });
                } else {
                    io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                        code: room.code,
                        currentTurnUserId: room.currentTurnUserId
                    });
                }
            }

            return res.json(serializeRoom(updatedRoom, req.userId));
        }

        // ── Battleship attack ──
        if (isBS) {
            const bsRow = Number.parseInt(req.body?.row, 10);
            const bsCol = Number.parseInt(req.body?.col, 10);
            if (!Number.isInteger(bsRow) || !Number.isInteger(bsCol) ||
                bsRow < 0 || bsRow >= BS_BOARD_SIZE || bsCol < 0 || bsCol >= BS_BOARD_SIZE) {
                return res.status(400).json({ error: 'Ungueltiges Feld' });
            }

            // Deep clone to avoid Sequelize change detection issues
            const bsState = JSON.parse(JSON.stringify(
                normalizeBattleshipState(room.diceState || createBattleshipState(turnOrder), turnOrder)
            ));
            if (bsState.phase !== 'attacking') {
                return res.status(400).json({ error: 'Schiffe muessen zuerst platziert werden' });
            }

            // Find opponent
            const opponentId = turnOrder.find(id => id !== req.userId);
            const opponentBoard = bsState.boards[String(opponentId)];
            if (!opponentBoard) return res.status(400).json({ error: 'Gegner-Board nicht gefunden' });

            const attackResult = processAttack(opponentBoard, bsRow, bsCol);
            if (!attackResult.valid) {
                return res.status(400).json({ error: attackResult.error });
            }

            // Check if all opponent ships are sunk
            const gameWon = allShipsSunk(opponentBoard);

            if (gameWon) {
                bsState.winnerUserId = req.userId;
                room.status = 'completed';
                room.completedAt = new Date();
                room.currentTurnUserId = null;
            } else if (attackResult.result === 'miss') {
                // Miss → next player's turn
                const currentIndex = turnOrder.indexOf(req.userId);
                const nextIndex = (currentIndex + 1) % turnOrder.length;
                room.currentTurnUserId = turnOrder[nextIndex];
            }
            // Hit or sunk → same player keeps shooting

            room.diceState = bsState;
            room.changed('diceState', true);
            await room.save();

            if (gameWon) {
                const definition = getGameDefinition(room.gameType);
                for (const p of room.players) {
                    const result = p.userId === req.userId ? 'win' : 'loss';
                    const playerScores = battleshipScoresForResult(result);
                    await MultiplayerPlayer.update(
                        { scores: playerScores },
                        { where: { id: p.id } }
                    );
                    p.scores = playerScores;
                }
                if (definition) await applyMultiplayerStatsForCompletedRoom(room, definition);
            }

            const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });

            const io = req.app.get('io');
            if (io) {
                // Emit minimal events - NO room/diceState data (clients fetchRoom for their sanitized view)
                io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                    code: room.code,
                    category: 'attack',
                    value: { row: bsRow, col: bsCol, result: attackResult.result },
                    userId: req.userId
                });

                if (gameWon) {
                    io.to(`mp:${room.code}`).emit('mp:gameCompleted', {
                        code: room.code
                    });
                } else {
                    io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                        code: room.code,
                        currentTurnUserId: room.currentTurnUserId
                    });
                }
            }

            // Return personalized state for the requesting user
            return res.json(serializeRoom(updatedRoom, req.userId));
        }

        if (isTTT || isTTTV) {
            const index = Number.parseInt(req.body?.index, 10);
            if (!Number.isInteger(index) || index < 0 || index > 8) {
                return res.status(400).json({ error: 'Ungueltiges Feld' });
            }

            const state = isTTTV
                ? normalizeTicTacToeVanishState(room.diceState || createTicTacToeVanishState(turnOrder), turnOrder)
                : normalizeTicTacToeState(room.diceState || createTicTacToeState(turnOrder), turnOrder);

            if (state.board[index]) {
                return res.status(400).json({ error: 'Feld ist bereits belegt' });
            }
            playerMark = state.marks[String(req.userId)];
            if (!playerMark) return res.status(400).json({ error: 'Spieler-Markierung konnte nicht zugeordnet werden' });

            board = [...state.board];
            board[index] = playerMark;
            marks = state.marks;
            placedIndex = index;
            vanishedIndex = null;

            // Vanish logic: remove oldest chip if player exceeds max
            if (isTTTV) {
                moveHistory = {
                    X: [...(state.moveHistory?.X || [])],
                    O: [...(state.moveHistory?.O || [])]
                };
                moveHistory[playerMark].push(index);
                if (moveHistory[playerMark].length > VANISH_MAX_CHIPS) {
                    vanishedIndex = moveHistory[playerMark].shift();
                    board[vanishedIndex] = null;
                }
            }

            winner = getTicTacToeWinner(board);
            isDraw = isTTTV ? false : (!winner && isTicTacToeDraw(board));
        } else {
            // Connect Four: column-based drop
            const col = Number.parseInt(req.body?.column ?? req.body?.index, 10);
            if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) {
                return res.status(400).json({ error: 'Ungueltige Spalte' });
            }
            const state = normalizeConnectFourState(room.diceState || createConnectFourState(turnOrder), turnOrder);
            playerMark = state.marks[String(req.userId)];
            if (!playerMark) return res.status(400).json({ error: 'Spieler-Markierung konnte nicht zugeordnet werden' });

            board = [...state.board];
            const row = getConnectFourDropRow(board, col);
            if (row < 0) return res.status(400).json({ error: 'Spalte ist voll' });

            placedIndex = c4Index(row, col);
            board[placedIndex] = playerMark;
            marks = state.marks;

            winner = getConnectFourWinner(board);
            isDraw = !winner && isConnectFourDraw(board);
        }

        let nextUserId = null;
        if (winner || isDraw) {
            room.status = 'completed';
            room.completedAt = new Date();
            room.currentTurnUserId = null;
        } else {
            const currentIndex = turnOrder.indexOf(req.userId);
            const nextIndex = (currentIndex + 1) % turnOrder.length;
            nextUserId = turnOrder[nextIndex];
            room.currentTurnUserId = nextUserId;
        }

        const winnerUserId = winner
            ? room.players.find((p) => marks[String(p.userId)] === winner.symbol)?.userId || req.userId
            : null;

        const newDiceState = {
            board,
            marks,
            winnerUserId,
            winningLine: winner ? winner.line : null,
            draw: isDraw,
            rematchVotes: []
        };
        if (isTTTV) {
            newDiceState.moveHistory = moveHistory || { X: [], O: [] };
            if (vanishedIndex !== null && vanishedIndex !== undefined) {
                newDiceState.lastVanished = vanishedIndex;
            }
        }
        room.diceState = newDiceState;
        await room.save();

        if (winner || isDraw) {
            const scoreFn = isC4 ? connectFourScoresForResult : tictactoeScoresForResult;
            for (const p of room.players) {
                const result = isDraw
                    ? 'draw'
                    : (p.userId === winnerUserId ? 'win' : 'loss');
                const playerScores = scoreFn(result);
                await MultiplayerPlayer.update(
                    { scores: playerScores },
                    { where: { id: p.id } }
                );
                p.scores = playerScores;
            }

            await applyMultiplayerStatsForCompletedRoom(room, definition);
        }

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const serialized = serializeRoom(updatedRoom);

        const io = req.app.get('io');
        if (io) {
            io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                code: room.code,
                room: serialized,
                category: 'move',
                value: placedIndex,
                userId: req.userId
            });

            if (winner || isDraw) {
                io.to(`mp:${room.code}`).emit('mp:gameCompleted', serialized);
            } else {
                io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                    code: room.code,
                    currentTurnUserId: nextUserId,
                    diceState: serialized.diceState
                });
            }
        }

        return res.json(serialized);
    } catch (err) {
        console.error('Error processing board game move:', err);
        return res.status(500).json({ error: 'Fehler beim Zug' });
    }
});

// POST /api/multiplayer/rooms/:code/rematch – Board game rematch vote/start
router.post('/rooms/:code/rematch', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        const isTTT = isTicTacToe(room.gameType);
        const isTTTV = isTicTacToeVanish(room.gameType);
        const isC4 = isConnectFour(room.gameType);
        const isBS = isBattleship(room.gameType);
        const isUnoGame = isUno(room.gameType);
        if (!isTTT && !isTTTV && !isC4 && !isBS && !isUnoGame) {
            return res.status(400).json({ error: 'Rematch ist fuer diesen Spieltyp nicht verfuegbar' });
        }
        if (room.status !== 'completed') return res.status(400).json({ error: 'Rematch erst nach Spielende moeglich' });

        const player = room.players.find((p) => p.userId === req.userId);
        if (!player) return res.status(403).json({ error: 'Du bist nicht in diesem Raum' });

        const turnOrder = Array.isArray(room.turnOrder) ? room.turnOrder : [];
        if (!isUnoGame && (turnOrder.length !== 2 || room.players.length !== 2)) {
            return res.status(400).json({ error: 'Rematch benoetigt genau 2 Spieler' });
        }
        if (isUnoGame && (turnOrder.length < 2 || turnOrder.length > 4 || room.players.length < 2 || room.players.length > 4)) {
            return res.status(400).json({ error: 'UNO-Rematch benoetigt 2 bis 4 Spieler' });
        }

        let state;
        if (isBS) {
            state = normalizeBattleshipState(room.diceState || createBattleshipState(turnOrder), turnOrder);
        } else if (isUnoGame) {
            state = normalizeUnoState(room.diceState || createUnoState(turnOrder), turnOrder);
        } else if (isTTTV) {
            state = normalizeTicTacToeVanishState(room.diceState || createTicTacToeVanishState(turnOrder), turnOrder);
        } else if (isTTT) {
            state = normalizeTicTacToeState(room.diceState || createTicTacToeState(turnOrder), turnOrder);
        } else {
            state = normalizeConnectFourState(room.diceState || createConnectFourState(turnOrder), turnOrder);
        }
        const votes = new Set(state.rematchVotes || []);
        votes.add(req.userId);

        if (votes.size < room.players.length) {
            room.diceState = {
                ...state,
                rematchVotes: Array.from(votes)
            };
            await room.save();

            const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
            const requesterRoom = serializeRoom(updatedRoom, req.userId);

            const io = req.app.get('io');
            if (io) {
                if (isSanitizedMultiplayerGame(room.gameType)) {
                    io.to(`mp:${room.code}`).emit('mp:rematchUpdated', { code: room.code });
                } else {
                    io.to(`mp:${room.code}`).emit('mp:rematchUpdated', { code: room.code, room: serializeRoom(updatedRoom) });
                }
            }

            return res.json(requesterRoom);
        }

        const nextTurnOrder = isUnoGame
            ? rotateTurnOrder(turnOrder)
            : (isTTT || isTTTV)
                ? getNextTicTacToeTurnOrder(turnOrder)
                : getNextConnectFourTurnOrder(turnOrder);
        let nextState;
        if (isBS) nextState = createBattleshipState(nextTurnOrder);
        else if (isUnoGame) nextState = createUnoState(nextTurnOrder);
        else if (isTTTV) nextState = createTicTacToeVanishState(nextTurnOrder);
        else if (isTTT) nextState = createTicTacToeState(nextTurnOrder);
        else nextState = createConnectFourState(nextTurnOrder);

        room.status = 'playing';
        room.completedAt = null;
        room.turnOrder = nextTurnOrder;
        room.currentTurnUserId = isBS ? null : nextTurnOrder[0]; // Battleship: no turns during placing
        room.diceState = nextState;
        await room.save();

        for (const p of room.players) {
            await MultiplayerPlayer.update(
                { scores: {} },
                { where: { id: p.id } }
            );
        }

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const requesterRoom = serializeRoom(updatedRoom, req.userId);

        const io = req.app.get('io');
        if (io) {
            if (isSanitizedMultiplayerGame(room.gameType)) {
                io.to(`mp:${room.code}`).emit('mp:gameStarted', {
                    code: room.code,
                    gameType: room.gameType
                });
            } else {
                io.to(`mp:${room.code}`).emit('mp:gameStarted', serializeRoom(updatedRoom));
            }
        }

        return res.json(requesterRoom);
    } catch (err) {
        console.error('Error starting rematch:', err);
        return res.status(500).json({ error: 'Rematch konnte nicht gestartet werden' });
    }
});


// POST /api/multiplayer/rooms/:code/score – Submit a score for a category
router.post('/rooms/:code/score', authenticate, async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() },
            include: ROOM_INCLUDE
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });
        if (room.status !== 'playing') return res.status(400).json({ error: 'Spiel läuft nicht' });
        if (room.currentTurnUserId !== req.userId) return res.status(403).json({ error: 'Du bist nicht am Zug' });
        if (isTicTacToe(room.gameType)) return res.status(400).json({ error: 'Bei TicTacToe werden Züge über /move gespielt' });
        if (isUno(room.gameType)) return res.status(400).json({ error: 'Bei UNO werden Zuege ueber /move gespielt' });

        const player = room.players.find(p => p.userId === req.userId);
        if (!player) return res.status(400).json({ error: 'Spieler nicht gefunden' });

        const definition = getGameDefinition(room.gameType);
        if (!definition) return res.status(400).json({ error: 'Unbekannter Spieltyp' });

        let value = 0;
        let category = null;

        if (isPhase10(room.gameType)) {
            try {
                // ── Phase 10 scoring ──
                const diceState = room.diceState || createPhase10TurnState();
                if (diceState.rollsLeft === P10_MAX_ROLLS) {
                    return res.status(400).json({ error: 'Du musst zuerst wuerfeln' });
                }

                const currentPhase = player.currentPhase || 1;
                if (currentPhase > 10) return res.status(400).json({ error: 'Alle Phasen bereits abgeschlossen' });

                const phaseKey = phaseKeyFromNumber(currentPhase);
                category = phaseKey;
                let currentAttempt = 1;
                try { currentAttempt = player.phaseAttempt || 1; } catch (_) { /* column may not exist yet */ }
                const action = req.body.action || 'submit'; // 'submit' or 'skip'

                const scores = normalizeScores(player.scores);

                // ── Skip: only allowed on attempt 1 ──
                if (action === 'skip') {
                    if (currentAttempt >= 2) {
                        return res.status(400).json({ error: 'Kein Ueberspringen mehr moeglich - 2. Versuch' });
                    }
                    // Advance to attempt 2, advance turn, reset dice
                    const nextAttempt = 2;
                    await MultiplayerPlayer.update(
                        { phaseAttempt: nextAttempt },
                        { where: { id: player.id } }
                    );
                    player.phaseAttempt = nextAttempt;

                    const turnOrder = room.turnOrder || [];
                    const currentIndex = turnOrder.indexOf(req.userId);
                    let nextUserId = null;
                    for (let step = 1; step <= turnOrder.length; step++) {
                        const candidateIndex = (currentIndex + step) % turnOrder.length;
                        const candidateId = turnOrder[candidateIndex];
                        const candidatePlayer = room.players.find(p => p.userId === candidateId);
                        if (candidatePlayer && (candidatePlayer.currentPhase || 1) <= 10) {
                            nextUserId = candidateId;
                            break;
                        }
                    }
                    if (!nextUserId) nextUserId = turnOrder[(currentIndex + 1) % turnOrder.length];

                    room.currentTurnUserId = nextUserId;
                    room.diceState = createPhase10TurnState();
                    await room.save();

                    const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
                    const serialized = serializeRoom(updatedRoom);

                    const io = req.app.get('io');
                    if (io) {
                        io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                            code: room.code, room: serialized, category: null, value: null, userId: req.userId, skipped: true
                        });
                        io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                            code: room.code, currentTurnUserId: nextUserId, diceState: createPhase10TurnState()
                        });
                    }
                    return res.json(serialized);
                }

                // ── Submit score ──
                const scoringDice = buildPhase10ScoringDice(diceState);
                const phaseResult = validatePhaseCompletion(scoringDice, phaseKey);
                const nextScores = { ...scores };
                let nextPhase = currentPhase + 1;
                let nextAttempt = 1;

                if (phaseResult.valid) {
                    value = phaseResult.score;
                    nextScores[phaseKey] = value;
                } else {
                    // Phase not completed: 0 points, advance to next phase
                    value = 0;
                    nextScores[phaseKey] = 0;
                }

                // ── Auto-bonus: Threshold (>= 221 after Phase 5 → +40) ──
                if (nextPhase > 5 && !nextScores.bonusThreshold) {
                    const sumPhase1to5 = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5']
                        .reduce((sum, key) => sum + (typeof nextScores[key] === 'number' ? nextScores[key] : 0), 0);
                    if (sumPhase1to5 >= 221) {
                        nextScores.bonusThreshold = 40;
                    }
                }

                // ── Auto-bonus: First Finisher (first to complete Phase 10 → +40) ──
                if (nextPhase > 10 && !nextScores.bonusFinisher) {
                    const anyOtherFinished = room.players.some(p =>
                        p.userId !== req.userId && (p.currentPhase > 10 || normalizeScores(p.scores).bonusFinisher)
                    );
                    if (!anyOtherFinished) {
                        nextScores.bonusFinisher = 40;
                    }
                }

                await MultiplayerPlayer.update(
                    {
                        scores: nextScores,
                        currentPhase: nextPhase,
                        phaseAttempt: nextAttempt
                    },
                    { where: { id: player.id } }
                );

                player.scores = nextScores;
                player.currentPhase = nextPhase;
                player.phaseAttempt = nextAttempt;

                // Advance turn – skip players who already finished all 10 phases
                const turnOrder = room.turnOrder || [];
                const currentIndex = turnOrder.indexOf(req.userId);
                let nextUserId = null;
                for (let step = 1; step <= turnOrder.length; step++) {
                    const candidateIndex = (currentIndex + step) % turnOrder.length;
                    const candidateId = turnOrder[candidateIndex];
                    const candidatePlayer = room.players.find(p => p.userId === candidateId);
                    if (candidatePlayer && (candidatePlayer.currentPhase || 1) <= 10) {
                        nextUserId = candidateId;
                        break;
                    }
                }

                // Game is over only when ALL players have finished all 10 phases
                const allPlayersFinished = room.players.every(p => (p.currentPhase || 1) > 10);
                const gameOver = allPlayersFinished;

                if (gameOver) {
                    room.status = 'completed';
                    room.completedAt = new Date();
                    room.currentTurnUserId = null;
                    room.diceState = null;
                    await room.save();

                    // Update user stats
                    const mpGameType = `${room.gameType}-multiplayer`;
                    for (const p of room.players) {
                        const user = await User.findByPk(p.userId);
                        if (!user) continue;
                        const pScores = normalizeScores(p.scores);
                        const gameTotal = definition.getProfileScore(pScores);

                        const statsByGameType = user.statsByGameType || {};
                        const current = statsByGameType[mpGameType] || { totalGames: 0, totalScore: 0, highestSingleGame: 0 };
                        current.totalGames += 1;
                        current.totalScore += gameTotal;
                        if (gameTotal > current.highestSingleGame) current.highestSingleGame = gameTotal;
                        user.statsByGameType = { ...statsByGameType, [mpGameType]: current };

                        user.totalGames += 1;
                        user.totalScore += gameTotal;
                        if (gameTotal > user.highestSingleGame) user.highestSingleGame = gameTotal;
                        await user.save();
                    }
                } else {
                    room.currentTurnUserId = nextUserId;
                    room.diceState = createPhase10TurnState();
                    await room.save();
                }

                const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
                const serialized = serializeRoom(updatedRoom);

                const io = req.app.get('io');
                if (io) {
                    io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                        code: room.code, room: serialized, category, value, userId: req.userId
                    });
                    if (gameOver) {
                        io.to(`mp:${room.code}`).emit('mp:gameCompleted', serialized);
                    } else {
                        io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                            code: room.code, currentTurnUserId: nextUserId, diceState: createPhase10TurnState()
                        });
                    }
                }

                return res.json(serialized);
            } catch (p10Err) {
                console.error('Phase 10 score error:', p10Err);
                return res.status(500).json({ error: `Phase 10 Fehler: ${p10Err.message}` });
            }
        }

        // ── Kniffel scoring (unchanged) ──
        const { category: kniffelCategory } = req.body;
        category = kniffelCategory;
        if (!category || typeof category !== 'string') {
            return res.status(400).json({ error: 'Kategorie fehlt' });
        }
        if (!definition.categoryKeys.includes(category)) {
            return res.status(400).json({ error: 'Ungültige Kategorie' });
        }

        const diceState = room.diceState || { dice: [0, 0, 0, 0, 0] };
        if (diceState.rollsLeft === MAX_ROLLS) {
            return res.status(400).json({ error: 'Du musst zuerst würfeln' });
        }

        const scores = normalizeScores(player.scores);
        if (scores[category] !== undefined && scores[category] !== null) {
            return res.status(400).json({ error: 'Kategorie bereits belegt' });
        }

        // Calculate score
        const possibleScores = calculatePossibleScores(diceState.dice);
        value = possibleScores[category] || 0;
        player.scores = { ...scores, [category]: value };
        await player.save();

        // Advance turn
        const turnOrder = room.turnOrder || [];
        const currentIndex = turnOrder.indexOf(req.userId);
        const nextIndex = (currentIndex + 1) % turnOrder.length;
        const nextUserId = turnOrder[nextIndex];

        // Check if game is over (all players have filled all categories)
        const allCategories = definition.categoryKeys;
        const allPlayersFinished = room.players.every(p => {
            const s = normalizeScores(p.scores);
            return allCategories.every(cat => s[cat] !== undefined && s[cat] !== null);
        });

        if (allPlayersFinished) {
            room.status = 'completed';
            room.completedAt = new Date();
            room.currentTurnUserId = null;
            room.diceState = null;
            await room.save();

            const mpGameType = `${room.gameType}-multiplayer`;
            for (const p of room.players) {
                const user = await User.findByPk(p.userId);
                if (!user) continue;
                const pScores = normalizeScores(p.scores);
                const gameTotal = definition.getProfileScore(pScores);

                const statsByGameType = user.statsByGameType || {};
                const current = statsByGameType[mpGameType] || { totalGames: 0, totalScore: 0, highestSingleGame: 0 };
                current.totalGames += 1;
                current.totalScore += gameTotal;
                if (gameTotal > current.highestSingleGame) current.highestSingleGame = gameTotal;
                user.statsByGameType = { ...statsByGameType, [mpGameType]: current };

                user.totalGames += 1;
                user.totalScore += gameTotal;
                if (gameTotal > user.highestSingleGame) user.highestSingleGame = gameTotal;
                await user.save();
            }
        } else {
            room.currentTurnUserId = nextUserId;
            room.diceState = createTurnState();
            await room.save();
        }

        const updatedRoom = await MultiplayerRoom.findByPk(room.id, { include: ROOM_INCLUDE });
        const serialized = serializeRoom(updatedRoom);

        const io = req.app.get('io');
        if (io) {
            io.to(`mp:${room.code}`).emit('mp:scoreSubmitted', {
                code: room.code,
                room: serialized,
                category,
                value,
                userId: req.userId
            });

            if (allPlayersFinished) {
                io.to(`mp:${room.code}`).emit('mp:gameCompleted', serialized);
            } else {
                io.to(`mp:${room.code}`).emit('mp:turnChanged', {
                    code: room.code,
                    currentTurnUserId: nextUserId,
                    diceState: createTurnState()
                });
            }
        }

        res.json(serialized);
    } catch (err) {
        console.error('Error submitting score:', err);
        res.status(500).json({ error: 'Fehler beim Eintragen' });
    }
});

// DELETE /api/multiplayer/rooms/:code – Admin only: delete a multiplayer room
router.delete('/rooms/:code', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const room = await MultiplayerRoom.findOne({
            where: { code: req.params.code.toUpperCase() }
        });
        if (!room) return res.status(404).json({ error: 'Raum nicht gefunden' });

        const wasCompleted = room.status === 'completed';

        // Delete players first, then room
        await MultiplayerPlayer.destroy({ where: { roomId: room.id } });
        await room.destroy();

        // If room was completed, recalculate all user stats
        if (wasCompleted) {
            const { rebuildProfileStatsFromCompletedGames } = require('../services/profileStats');
            await rebuildProfileStatsFromCompletedGames();
        }

        const io = req.app.get('io');
        if (io) io.emit('mp:roomDeleted', { code: req.params.code.toUpperCase() });

        res.json({ message: 'Multiplayer-Raum gelöscht' });
    } catch (err) {
        console.error('Error deleting room:', err);
        res.status(500).json({ error: 'Fehler beim Löschen' });
    }
});

module.exports = router;
