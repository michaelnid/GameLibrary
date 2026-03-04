import { useState, useCallback, useEffect, useRef } from 'react';
import { getDiceDots } from '../games/kniffel';

export default function DiceRoller({ dice, held, rollsLeft, isMyTurn, onRoll, onToggleHold, disabled }) {
    const canRoll = isMyTurn && rollsLeft > 0 && !disabled;
    const hasRolled = dice.some(d => d > 0);
    const [rolling, setRolling] = useState(false);
    const [holdingIndex, setHoldingIndex] = useState(null);
    const prevRollsLeft = useRef(rollsLeft);

    // Trigger animation when rollsLeft decreases (for ALL players via socket)
    useEffect(() => {
        if (rollsLeft < prevRollsLeft.current && prevRollsLeft.current <= 3) {
            setRolling(true);
            const timer = setTimeout(() => setRolling(false), 400);
            prevRollsLeft.current = rollsLeft;
            return () => clearTimeout(timer);
        }
        prevRollsLeft.current = rollsLeft;
    }, [rollsLeft]);

    const handleRoll = useCallback(async () => {
        if (!canRoll) return;
        // Animation is now triggered by rollsLeft change in useEffect
        await onRoll();
    }, [canRoll, onRoll]);

    const handleHold = useCallback(async (index) => {
        if (!isMyTurn || !hasRolled || holdingIndex !== null) return;
        setHoldingIndex(index);
        try {
            await onToggleHold(index);
        } finally {
            setHoldingIndex(null);
        }
    }, [isMyTurn, hasRolled, holdingIndex, onToggleHold]);

    return (
        <div className="dice-roller">
            <div className="dice-roller-dice">
                {dice.map((value, index) => {
                    const isHeld = held[index];
                    const dieActive = value > 0;
                    const isRolling = rolling && !isHeld;
                    return (
                        <button
                            key={index}
                            className={`die ${dieActive ? 'die-active' : 'die-empty'} ${isHeld ? 'die-held' : ''} ${!isMyTurn || !hasRolled ? 'die-disabled' : ''} ${isRolling ? 'die-rolling' : ''}`}
                            onClick={() => handleHold(index)}
                            disabled={!isMyTurn || !hasRolled || holdingIndex !== null}
                            title={isHeld ? 'Loslassen' : 'Halten'}
                            style={{ '--roll-delay': `${index * 40}ms` }}
                        >
                            {dieActive ? (
                                <div className="die-face">
                                    {getDiceDots(value).map((pos) => (
                                        <span key={pos} className={`die-dot die-dot-${pos}`} />
                                    ))}
                                </div>
                            ) : (
                                <span className="die-placeholder">?</span>
                            )}
                            {isHeld && <span className="die-held-badge">HOLD</span>}
                        </button>
                    );
                })}
            </div>
            <div className="dice-roller-controls">
                <button
                    className={`btn dice-roll-btn ${canRoll ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={handleRoll}
                    disabled={!canRoll || rolling}
                >
                    {!hasRolled ? 'Wuerfeln' : `Nochmal (${rollsLeft})`}
                </button>
                <div className="dice-rolls-left">
                    {[...Array(3)].map((_, i) => (
                        <span key={i} className={`dice-roll-dot ${i < rollsLeft ? 'dice-roll-dot-active' : ''}`} />
                    ))}
                </div>
            </div>
        </div>
    );
}
