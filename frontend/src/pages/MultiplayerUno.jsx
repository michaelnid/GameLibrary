import { useState } from 'react';

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];

const UNO_COLOR_META = {
    red: { label: 'Rot', bg: '#ef4444', border: '#f87171', tint: 'rgba(239, 68, 68, 0.18)' },
    yellow: { label: 'Gelb', bg: '#f59e0b', border: '#fbbf24', tint: 'rgba(245, 158, 11, 0.2)' },
    green: { label: 'Gruen', bg: '#10b981', border: '#34d399', tint: 'rgba(16, 185, 129, 0.2)' },
    blue: { label: 'Blau', bg: '#3b82f6', border: '#60a5fa', tint: 'rgba(59, 130, 246, 0.2)' }
};

function normalizeCard(card) {
    if (!card || typeof card !== 'object' || typeof card.id !== 'string') return null;
    const type = typeof card.type === 'string' ? card.type : '';
    if (!['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'].includes(type)) return null;
    if (type === 'number') {
        if (!Number.isInteger(card.value) || card.value < 0 || card.value > 9) return null;
    }
    return {
        id: card.id,
        type,
        color: typeof card.color === 'string' ? card.color : null,
        value: Number.isInteger(card.value) ? card.value : null
    };
}

function getCardLabel(card) {
    if (!card) return '?';
    if (card.type === 'number') return String(card.value);
    if (card.type === 'skip') return 'S';
    if (card.type === 'reverse') return 'R';
    if (card.type === 'draw2') return '+2';
    if (card.type === 'wild') return 'W';
    if (card.type === 'wild4') return '+4';
    return '?';
}

function isPlayableCard(card, topCard, currentColor) {
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

function resolveRematchVotes(state) {
    if (!Array.isArray(state?.rematchVotes)) return [];
    return Array.from(new Set(
        state.rematchVotes
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isInteger(value) && value > 0)
    ));
}

export default function MultiplayerUno({
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
    const myKey = String(user?.id || '');
    const hands = state.hands && typeof state.hands === 'object' ? state.hands : {};
    const handCounts = state.handCounts && typeof state.handCounts === 'object' ? state.handCounts : {};
    const myHand = Array.isArray(hands[myKey]) ? hands[myKey].map(normalizeCard).filter(Boolean) : [];
    const discardPile = Array.isArray(state.discardPile) ? state.discardPile.map(normalizeCard).filter(Boolean) : [];
    const topCard = discardPile[discardPile.length - 1] || null;
    const currentColor = typeof state.currentColor === 'string' ? state.currentColor : topCard?.color;
    const winnerUserId = state.winnerUserId || null;
    const players = Array.isArray(room?.players) ? room.players : [];
    const turnOrder = Array.isArray(room?.turnOrder) ? room.turnOrder : [];
    const currentTurnPlayer = players.find((p) => p.userId === room.currentTurnUserId);
    const winnerPlayer = players.find((p) => p.userId === winnerUserId);
    const rematchVotes = resolveRematchVotes(state);
    const meReadyForRematch = rematchVotes.includes(user?.id);
    const canDraw = room.status === 'playing' && isMyTurn && !submitting;

    const [pendingWildCardId, setPendingWildCardId] = useState(null);
    const [playingCardId, setPlayingCardId] = useState(null);

    const canPlayMap = new Map(
        myHand.map((card) => [card.id, room.status === 'playing' && isMyTurn && isPlayableCard(card, topCard, currentColor)])
    );

    const drawCount = Number.isInteger(state.drawCount) ? state.drawCount : 0;

    const handlePlayCard = async (card) => {
        if (!card || !canPlayMap.get(card.id) || submitting) return;

        if (card.type === 'wild' || card.type === 'wild4') {
            setPendingWildCardId(card.id);
            return;
        }

        setPlayingCardId(card.id);
        try {
            await onMove({ action: 'play', cardId: card.id });
            setPendingWildCardId(null);
        } catch (_) {
            // Parent sets error state
        } finally {
            setPlayingCardId(null);
        }
    };

    const handlePlayWild = async (chosenColor) => {
        if (!pendingWildCardId || !UNO_COLORS.includes(chosenColor) || submitting) return;
        setPlayingCardId(pendingWildCardId);
        try {
            await onMove({ action: 'play', cardId: pendingWildCardId, chosenColor });
            setPendingWildCardId(null);
        } catch (_) {
            // Parent sets error state
        } finally {
            setPlayingCardId(null);
        }
    };

    const handleDraw = async () => {
        if (!canDraw) return;
        try {
            await onMove({ action: 'draw' });
            setPendingWildCardId(null);
        } catch (_) {
            // Parent sets error state
        }
    };

    return (
        <div className="mp-game mp-playing uno-game">
            <div className="mp-game-header">
                <div className="mp-game-header-left">
                    <h1 className="mp-game-title">UNO</h1>
                    <span className="mp-room-code-small">{room.code}</span>
                </div>
                <div className="mp-turn-indicator">
                    {room.status === 'completed'
                        ? (
                            <span className="mp-turn-badge mp-turn-other">
                                Gewinner: {winnerPlayer?.displayName || 'Unbekannt'}
                            </span>
                        )
                        : isMyTurn
                            ? <span className="mp-turn-badge mp-turn-mine">Du bist dran!</span>
                            : <span className="mp-turn-badge mp-turn-other">{currentTurnPlayer?.displayName || '...'} ist dran</span>}
                </div>
            </div>

            {error && <div className="mp-error">{error}</div>}

            <div className="uno-table card">
                <div className="uno-center-area">
                    <div className="uno-pile">
                        <div className="uno-pile-label">Ziehstapel</div>
                        <button
                            type="button"
                            className={`uno-card uno-card-back ${canDraw ? 'uno-card-clickable' : ''}`}
                            onClick={handleDraw}
                            disabled={!canDraw}
                        >
                            UNO
                        </button>
                        <div className="uno-pile-count">{drawCount} Karten</div>
                    </div>

                    <div className="uno-pile">
                        <div className="uno-pile-label">Ablage</div>
                        <div
                            className="uno-card uno-card-top"
                            style={{
                                background: topCard?.color ? UNO_COLOR_META[topCard.color]?.tint : 'rgba(255,255,255,0.06)',
                                borderColor: topCard?.color ? UNO_COLOR_META[topCard.color]?.border : 'rgba(255,255,255,0.18)'
                            }}
                        >
                            <span>{getCardLabel(topCard)}</span>
                        </div>
                        <div className="uno-current-color">
                            Farbe: <strong>{UNO_COLOR_META[currentColor]?.label || 'Wild'}</strong>
                        </div>
                    </div>
                </div>

                <div className="uno-player-strip">
                    {turnOrder.map((playerId) => {
                        const player = players.find((entry) => entry.userId === playerId);
                        const count = Number.isInteger(handCounts[String(playerId)]) ? handCounts[String(playerId)] : 0;
                        const isActive = room.currentTurnUserId === playerId && room.status === 'playing';
                        const isWinner = winnerUserId === playerId;
                        return (
                            <div
                                key={playerId}
                                className={`uno-player-chip ${isActive ? 'uno-player-chip-active' : ''} ${isWinner ? 'uno-player-chip-winner' : ''}`}
                            >
                                <span className="uno-player-name">{player?.displayName || `Spieler ${playerId}`}</span>
                                <span className="uno-player-count">{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="uno-hand card">
                <div className="uno-hand-header">
                    <h3>Deine Hand</h3>
                    <span>{myHand.length} Karten</span>
                </div>
                <div className="uno-hand-cards">
                    {myHand.map((card) => {
                        const playable = canPlayMap.get(card.id);
                        const isPendingWild = pendingWildCardId === card.id;
                        const isPlaying = playingCardId === card.id;
                        const canClick = playable && room.status === 'playing' && isMyTurn && !submitting && !isPlaying;
                        const colorMeta = UNO_COLOR_META[card.color] || null;
                        return (
                            <button
                                key={card.id}
                                type="button"
                                className={`uno-card ${canClick ? 'uno-card-clickable' : ''} ${playable ? 'uno-card-playable' : ''} ${isPendingWild ? 'uno-card-selected' : ''}`}
                                style={{
                                    background: colorMeta ? colorMeta.tint : 'rgba(255,255,255,0.08)',
                                    borderColor: colorMeta ? colorMeta.border : 'rgba(255,255,255,0.25)'
                                }}
                                onClick={() => handlePlayCard(card)}
                                disabled={!canClick}
                            >
                                <span>{getCardLabel(card)}</span>
                            </button>
                        );
                    })}
                </div>

                {pendingWildCardId && (
                    <div className="uno-color-picker">
                        <span>Farbe waehlen:</span>
                        {UNO_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className="uno-color-btn"
                                style={{ backgroundColor: UNO_COLOR_META[color].bg }}
                                onClick={() => handlePlayWild(color)}
                                disabled={submitting}
                                title={UNO_COLOR_META[color].label}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="card" style={{ maxWidth: 720, margin: '0 auto 16px auto' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    {players.map((p) => {
                        const result = p.scores?.result || null;
                        const points = typeof p.scores?.points === 'number' ? p.scores.points : null;
                        return (
                            <div key={p.userId} className="flex-between" style={{ alignItems: 'center' }}>
                                <strong>{p.displayName}</strong>
                                <div className="text-muted">
                                    {result ? `${result} · ${points ?? 0} Punkte` : 'laeuft'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {room.status === 'completed' && (
                <div className="card" style={{ maxWidth: 720, margin: '0 auto 16px auto' }}>
                    <div className="flex-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div className="text-muted">
                            Rematch bereit: {rematchVotes.length}/{players.length}
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={onRematch}
                            disabled={submitting || meReadyForRematch}
                        >
                            {meReadyForRematch ? 'Warte auf Mitspieler...' : 'Nochmal spielen'}
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
