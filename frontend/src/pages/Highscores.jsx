import { useState, useEffect } from 'react';
import api from '../services/api';
import { loadGameTypesOrFallback } from '../services/gameTypes';

export default function Highscores() {
    const [profiles, setProfiles] = useState([]);
    const [gameTypes, setGameTypes] = useState([]);
    const [selectedGameType, setSelectedGameType] = useState('kniffel');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadGameTypes();
    }, []);

    useEffect(() => {
        loadHighscores(selectedGameType);
    }, [selectedGameType]);

    const loadGameTypes = async () => {
        const types = await loadGameTypesOrFallback();
        setGameTypes(types);
        if (types.length > 0) {
            setSelectedGameType(types[0].id);
        }
    };

    const loadHighscores = async (gameType) => {
        setLoading(true);
        try {
            const res = await api.get(`/highscores?gameType=${encodeURIComponent(gameType)}`);
            setProfiles(res.data);
        } catch (err) {
            console.error('Failed to load highscores:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="text-center mt-lg text-muted">Laden...</div>;
    }

    const medalEmoji = ['🥇', '🥈', '🥉'];
    const selectedTypeName = gameTypes.find((gameType) => gameType.id === selectedGameType)?.name || selectedGameType;

    const top3 = profiles.slice(0, 3);
    const rest = profiles.slice(3);
    const topCountClass = Math.min(top3.length, 3);
    const isWinLoss = profiles[0]?.scoringType === 'winLoss';

    const podiumOrder = top3.length >= 3
        ? [top3[1], top3[0], top3[2]]
        : top3;
    const podiumRanks = top3.length >= 3 ? [2, 1, 3] : top3.map((_, index) => index + 1);
    const podiumHeights = podiumRanks.map((rank) => {
        if (top3.length === 1) return 130;
        if (rank === 1) return 140;
        if (rank === 2) return top3.length === 2 ? 105 : 100;
        return 70;
    });

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Highscores</h1>
                    <p className="page-subtitle">Ranking für {selectedTypeName}</p>
                </div>
                {gameTypes.length > 1 && (
                    <select
                        className="form-select"
                        style={{ width: 'auto', minWidth: 160, maxWidth: 240 }}
                        value={selectedGameType}
                        onChange={(event) => setSelectedGameType(event.target.value)}
                    >
                        {gameTypes.map((gameType) => (
                            <option key={gameType.id} value={gameType.id}>{gameType.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {profiles.length === 0 ? (
                <div className="card empty-state">
                    <div className="empty-state-icon">🎲</div>
                    <p className="empty-state-title">Noch keine Highscores</p>
                    <p>Schließe ein Spiel ab, um in den Highscores zu erscheinen.</p>
                </div>
            ) : (
                <>
                    <div className="hs-podium-section">
                        <div className={`hs-podium hs-podium-${topCountClass}`}>
                            {podiumOrder.map((profile, index) => (
                                <div key={profile.id} className={`hs-podium-item hs-podium-${podiumRanks[index]}`}>
                                    <div className="hs-podium-medal">{medalEmoji[podiumRanks[index] - 1]}</div>
                                    <div className="hs-podium-avatar">
                                        {profile.avatar ? (
                                            <img src={`/uploads/${profile.avatar}`} alt="" />
                                        ) : (
                                            <span>{profile.name.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div className="hs-podium-name">{profile.name}</div>
                                    <div className="hs-podium-score">
                                        {isWinLoss ? `${profile.winRate}%` : profile.averageScore}
                                    </div>
                                    <div className="hs-podium-label">
                                        {isWinLoss ? 'Siegrate' : 'Ø Punkte'}
                                    </div>
                                    <div className="hs-podium-bar" style={{ height: podiumHeights[index] + 'px' }}>
                                        <span>{podiumRanks[index]}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={`hs-stats-grid hs-stats-grid-${topCountClass}`}>
                        {top3.map((profile, index) => (
                            <div key={profile.id} className={`hs-stat-card hs-stat-card-${index + 1}`}>
                                <div className="hs-stat-card-header">
                                    <div className="hs-stat-card-avatar">
                                        {profile.avatar ? (
                                            <img src={`/uploads/${profile.avatar}`} alt="" />
                                        ) : (
                                            <span>{profile.name.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="hs-stat-card-name">{medalEmoji[index]} {profile.name}</div>
                                        <div className="hs-stat-card-games">{profile.totalGames} {profile.totalGames === 1 ? 'Spiel' : 'Spiele'}</div>
                                    </div>
                                </div>
                                <div className="hs-stat-card-stats">
                                    {isWinLoss ? (
                                        <>
                                            <div className="hs-stat-item">
                                                <span className="hs-stat-value">{profile.winRate}%</span>
                                                <span className="hs-stat-label">Siegrate</span>
                                            </div>
                                            <div className="hs-stat-item">
                                                <span className="hs-stat-value hs-stat-win">{profile.wins}</span>
                                                <span className="hs-stat-label">Siege</span>
                                            </div>
                                            <div className="hs-stat-item">
                                                <span className="hs-stat-value hs-stat-loss">{profile.losses}</span>
                                                <span className="hs-stat-label">Niederlagen</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="hs-stat-item">
                                                <span className="hs-stat-value">{profile.averageScore}</span>
                                                <span className="hs-stat-label">Ø Punkte</span>
                                            </div>
                                            <div className="hs-stat-item">
                                                <span className="hs-stat-value">{profile.highestSingleGame}</span>
                                                <span className="hs-stat-label">Bestes Spiel</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {rest.length > 0 && (
                        <div className="hs-rest-list">
                            <h3 className="hs-rest-title">Weitere Spieler</h3>
                            {rest.map((profile, index) => (
                                <div key={profile.id} className="hs-rest-item">
                                    <div className="hs-rest-rank">{index + 4}</div>
                                    <div className="hs-rest-avatar">
                                        {profile.avatar ? (
                                            <img src={`/uploads/${profile.avatar}`} alt="" />
                                        ) : (
                                            <span>{profile.name.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div className="hs-rest-info">
                                        <div className="hs-rest-name">{profile.name}</div>
                                        <div className="hs-rest-sub">
                                            {isWinLoss
                                                ? `${profile.wins}S / ${profile.losses}N · ${profile.winRate}%`
                                                : `${profile.totalGames} ${profile.totalGames === 1 ? 'Spiel' : 'Spiele'} · Ø ${profile.averageScore}`
                                            }
                                        </div>
                                    </div>
                                    <div className="hs-rest-scores">
                                        <span className="hs-rest-best">
                                            {isWinLoss
                                                ? `${profile.totalGames} ${profile.totalGames === 1 ? 'Spiel' : 'Spiele'}`
                                                : `Best: ${profile.highestSingleGame}`
                                            }
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
