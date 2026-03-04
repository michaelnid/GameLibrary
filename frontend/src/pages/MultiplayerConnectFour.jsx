import { useState } from 'react';

const C4_ROWS = 6;
const C4_COLS = 7;

function resolveBoard(state) {
    const board = Array.isArray(state?.board) && state.board.length === C4_ROWS * C4_COLS
        ? state.board : new Array(C4_ROWS * C4_COLS).fill(null);
    return board.map((cell) => (cell === 'R' || cell === 'Y' ? cell : null));
}

function resolveMarks(state) {
    if (state?.marks && typeof state.marks === 'object') return state.marks;
    return {};
}

function resolveRematchVotes(state) {
    if (!Array.isArray(state?.rematchVotes)) return [];
    return Array.from(new Set(
        state.rematchVotes
            .map((v) => Number.parseInt(v, 10))
            .filter((v) => Number.isInteger(v) && v > 0)
    ));
}

function chipColor(symbol) {
    if (symbol === 'R') return '#ff4d6d';
    if (symbol === 'Y') return '#fbbf24';
    return 'transparent';
}

function chipGlow(symbol) {
    const c = chipColor(symbol);
    if (symbol === 'R') return `0 0 10px ${c}, 0 0 22px ${c}cc`;
    if (symbol === 'Y') return `0 0 10px ${c}, 0 0 24px ${c}dd`;
    return 'none';
}

function chipLabel(symbol) {
    if (symbol === 'R') return 'Rot';
    if (symbol === 'Y') return 'Gelb';
    return '?';
}

function getDropRow(board, col) {
    for (let row = C4_ROWS - 1; row >= 0; row--) {
        if (!board[row * C4_COLS + col]) return row;
    }
    return -1;
}

export default function MultiplayerConnectFour({
    room,
    user,
    isMyTurn,
    error,
    submitting,
    onMove,
    onRematch,
    onLeave
}) {
    const state = room?.diceState || {};
    const board = resolveBoard(state);
    const marks = resolveMarks(state);
    const myMark = marks[String(user?.id)] || '?';

    const winnerUserId = state.winnerUserId || null;
    const draw = Boolean(state.draw);
    const winningLine = Array.isArray(state.winningLine) ? state.winningLine : [];
    const winningSet = new Set(winningLine);
    const rematchVotes = resolveRematchVotes(state);
    const rematchReadyCount = rematchVotes.length;
    const meReadyForRematch = rematchVotes.includes(user?.id);

    const winnerPlayer = winnerUserId
        ? room.players.find((p) => p.userId === winnerUserId)
        : null;
    const currentTurnPlayer = room.players.find((p) => p.userId === room.currentTurnUserId);

    const [hoverCol, setHoverCol] = useState(null);
    const canPlay = room.status !== 'completed' && isMyTurn && !submitting;

    const handleColumnClick = (col) => {
        if (!canPlay) return;
        const dropRow = getDropRow(board, col);
        if (dropRow < 0) return;
        onMove(col);
    };

    // Build columns for rendering (column-major for drop effect)
    const columns = [];
    for (let col = 0; col < C4_COLS; col++) {
        const cells = [];
        for (let row = 0; row < C4_ROWS; row++) {
            const idx = row * C4_COLS + col;
            cells.push({ idx, row, col, chip: board[idx] });
        }
        const isFull = cells.every((c) => c.chip);
        columns.push({ col, cells, isFull });
    }

    // Preview drop position
    const previewRow = hoverCol !== null && canPlay ? getDropRow(board, hoverCol) : -1;

    return (
        <div className="mp-game mp-playing">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">Vier Gewinnt</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    {room.status === 'completed'
                        ? (
                            <span className="mp-turn-badge mp-turn-other">
                                {draw ? 'Unentschieden' : `Gewinner: ${winnerPlayer?.displayName || 'Unbekannt'}`}
                            </span>
                        )
                        : isMyTurn
                            ? <span className="mp-turn-badge mp-turn-mine">Du bist dran! <span style={{ color: chipColor(myMark), fontWeight: 800 }}>({chipLabel(myMark)})</span></span>
                            : <span className="mp-turn-badge mp-turn-other">{currentTurnPlayer?.displayName || '...'} ist dran</span>}
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            <div className="card" style={{ maxWidth: 560, margin: '0 auto 16px auto', overflow: 'hidden' }}>
                <div className="c4-board">
                    {columns.map(({ col, cells, isFull }) => (
                        <div
                            key={col}
                            className={`c4-column ${canPlay && !isFull ? 'c4-column-active' : ''} ${hoverCol === col && canPlay ? 'c4-column-hover' : ''}`}
                            onClick={() => handleColumnClick(col)}
                            onMouseEnter={() => setHoverCol(col)}
                            onMouseLeave={() => setHoverCol(null)}
                        >
                            {cells.map(({ idx, row, chip }) => {
                                const isWinning = winningSet.has(idx);
                                const isPreview = hoverCol === col && row === previewRow && canPlay && !chip;
                                return (
                                    <div
                                        key={idx}
                                        className={`c4-cell ${chip ? 'c4-cell-filled' : ''} ${isWinning ? 'c4-cell-winning' : ''} ${isPreview ? 'c4-cell-preview' : ''}`}
                                    >
                                        {chip && (
                                            <div
                                                className="c4-chip c4-chip-drop"
                                                style={{
                                                    backgroundColor: chipColor(chip),
                                                    boxShadow: isWinning ? chipGlow(chip) : 'none',
                                                    animationDelay: `${row * 30}ms`
                                                }}
                                            />
                                        )}
                                        {isPreview && (
                                            <div
                                                className="c4-chip c4-chip-preview"
                                                style={{ backgroundColor: chipColor(myMark) }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div className="card" style={{ maxWidth: 520, margin: '0 auto 16px auto' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    {room.players.map((p) => {
                        const mark = marks[String(p.userId)] || '?';
                        const result = p.scores?.result || null;
                        const points = typeof p.scores?.points === 'number' ? p.scores.points : null;
                        return (
                            <div key={p.userId} className="flex-between" style={{ alignItems: 'center' }}>
                                <div>
                                    <strong>{p.displayName}</strong>{' '}
                                    <span style={{ color: chipColor(mark), fontWeight: 700 }}>({chipLabel(mark)})</span>
                                </div>
                                <div className="text-muted">
                                    {result ? `${result} · ${points ?? 0} Punkte` : 'laeuft'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {room.status === 'completed' && (
                <div className="card" style={{ maxWidth: 520, margin: '0 auto 16px auto' }}>
                    <div className="flex-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div className="text-muted">
                            Rematch bereit: {rematchReadyCount}/{room.players.length}
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={onRematch}
                            disabled={submitting || meReadyForRematch}
                        >
                            {meReadyForRematch ? 'Warte auf Gegner...' : 'Nochmal spielen'}
                        </button>
                    </div>
                </div>
            )}

            <div className="mp-game-actions">
                <button className="btn btn-ghost btn-sm" onClick={onLeave}>Spiel verlassen</button>
            </div>
        </div>
    );
}
