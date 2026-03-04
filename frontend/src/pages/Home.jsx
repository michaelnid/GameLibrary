import { useState } from 'react';
import { Link } from 'react-router-dom';
import changelog from '../data/changelog';

export default function Home() {
    const [showChangelog, setShowChangelog] = useState(false);
    const currentVersion = changelog[0]?.version || '1.0.0';

    const games = [
        {
            name: 'Kniffel',
            type: 'Lokal & Online',
            color: '#f59e0b',
            icon: (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="6" width="16" height="16" rx="3" />
                    <circle cx="11" cy="11" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="17" cy="11" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="17" cy="17" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="14" cy="14" r="1.5" fill="currentColor" stroke="none" />
                    <rect x="26" y="6" width="16" height="16" rx="3" />
                    <circle cx="31" cy="11" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="37" cy="11" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="34" cy="14" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="31" cy="17" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="37" cy="17" r="1.5" fill="currentColor" stroke="none" />
                    <rect x="6" y="26" width="16" height="16" rx="3" />
                    <circle cx="14" cy="34" r="1.5" fill="currentColor" stroke="none" />
                    <rect x="26" y="26" width="16" height="16" rx="3" />
                    <circle cx="31" cy="31" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="37" cy="31" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="31" cy="37" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="37" cy="37" r="1.5" fill="currentColor" stroke="none" />
                </svg>
            )
        },
        {
            name: 'Phase 10',
            type: 'Lokal & Online',
            color: '#8b5cf6',
            icon: (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="4" width="32" height="40" rx="4" />
                    <text x="24" y="20" textAnchor="middle" fill="currentColor" stroke="none" fontSize="14" fontWeight="800" fontFamily="sans-serif">10</text>
                    <path d="M14 28h20" strokeWidth="1.5" opacity="0.4" />
                    <circle cx="17" cy="34" r="2" fill="currentColor" stroke="none" opacity="0.5" />
                    <circle cx="24" cy="34" r="2" fill="currentColor" stroke="none" opacity="0.5" />
                    <circle cx="31" cy="34" r="2" fill="currentColor" stroke="none" opacity="0.5" />
                </svg>
            )
        },
        {
            name: 'TicTacToe',
            type: 'Online',
            color: '#3b82f6',
            icon: (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="16" y1="8" x2="16" y2="40" />
                    <line x1="32" y1="8" x2="32" y2="40" />
                    <line x1="8" y1="16" x2="40" y2="16" />
                    <line x1="8" y1="32" x2="40" y2="32" />
                    <line x1="10" y1="10" x2="14" y2="14" strokeWidth="2" />
                    <line x1="14" y1="10" x2="10" y2="14" strokeWidth="2" />
                    <circle cx="24" cy="12" r="2.5" fill="none" strokeWidth="2" />
                    <line x1="34" y1="10" x2="38" y2="14" strokeWidth="2" />
                    <line x1="38" y1="10" x2="34" y2="14" strokeWidth="2" />
                    <circle cx="12" cy="24" r="2.5" fill="none" strokeWidth="2" />
                    <line x1="22" y1="22" x2="26" y2="26" strokeWidth="2" />
                    <line x1="26" y1="22" x2="22" y2="26" strokeWidth="2" />
                </svg>
            )
        },
        {
            name: 'Vier Gewinnt',
            type: 'Online',
            color: '#ef4444',
            icon: (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="8" width="40" height="32" rx="4" />
                    <circle cx="14" cy="18" r="3" fill="#ef4444" stroke="none" opacity="0.7" />
                    <circle cx="24" cy="18" r="3" fill="#3b82f6" stroke="none" opacity="0.5" />
                    <circle cx="34" cy="18" r="3" fill="none" strokeWidth="1.5" opacity="0.3" />
                    <circle cx="14" cy="28" r="3" fill="#3b82f6" stroke="none" opacity="0.5" />
                    <circle cx="24" cy="28" r="3" fill="#ef4444" stroke="none" opacity="0.7" />
                    <circle cx="34" cy="28" r="3" fill="#ef4444" stroke="none" opacity="0.7" />
                    <circle cx="14" cy="36" r="3" fill="#ef4444" stroke="none" opacity="0.7" />
                    <circle cx="24" cy="36" r="3" fill="#3b82f6" stroke="none" opacity="0.5" />
                    <circle cx="34" cy="36" r="3" fill="#3b82f6" stroke="none" opacity="0.5" />
                </svg>
            )
        },
        {
            name: 'Battleship',
            type: 'Online',
            color: '#06b6d4',
            icon: (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 30 C6 30 10 24 24 24 C38 24 42 30 42 30" />
                    <path d="M4 30h40v4c0 2-2 4-4 4H8c-2 0-4-2-4-4v-4z" />
                    <rect x="20" y="18" width="8" height="6" rx="1" />
                    <rect x="22" y="14" width="4" height="4" rx="1" />
                    <line x1="24" y1="10" x2="24" y2="14" />
                    <line x1="14" y1="28" x2="14" y2="24" strokeWidth="1.5" />
                    <line x1="34" y1="28" x2="34" y2="24" strokeWidth="1.5" />
                    <circle cx="10" cy="16" r="2" fill="none" strokeWidth="1" opacity="0.3" />
                    <line x1="8" y1="16" x2="12" y2="16" strokeWidth="1" opacity="0.3" />
                    <line x1="10" y1="14" x2="10" y2="18" strokeWidth="1" opacity="0.3" />
                    <circle cx="38" cy="20" r="1.5" fill="currentColor" stroke="none" opacity="0.2" />
                </svg>
            )
        },
        {
            name: 'UNO',
            type: 'Online',
            color: '#22c55e',
            icon: (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="8" width="24" height="32" rx="4" transform="rotate(-8 18 24)" />
                    <rect x="18" y="8" width="24" height="32" rx="4" transform="rotate(8 30 24)" fill="none" />
                    <text x="16" y="28" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="800" fontFamily="sans-serif" transform="rotate(-8 16 26)">U</text>
                    <text x="32" y="28" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="800" fontFamily="sans-serif" transform="rotate(8 32 26)">N</text>
                </svg>
            )
        }
    ];

    return (
        <div className="home-page">
            {/* Animated background mesh */}
            <div className="home-bg-mesh" aria-hidden="true">
                <div className="home-mesh-orb home-mesh-orb-1" />
                <div className="home-mesh-orb home-mesh-orb-2" />
                <div className="home-mesh-orb home-mesh-orb-3" />
            </div>

            {/* Hero Section */}
            <div className="home-hero">
                <h1 className="home-title-new">
                    <span className="home-title-label">MIKE</span>
                    <span className="home-title-gradient">Game Library</span>
                </h1>
                <p className="home-tagline">
                    Dein digitaler Spieleabend — würfle, spiele und gewinne
                </p>
            </div>

            {/* Games Showcase */}
            <section className="home-showcase">
                <h2 className="home-section-label">Verfügbare Spiele</h2>
                <div className="home-games-grid">
                    {games.map((game, i) => (
                        <div
                            key={game.name}
                            className="home-game-tile"
                            style={{
                                '--tile-color': game.color,
                                animationDelay: `${i * 80}ms`
                            }}
                        >
                            <div className="home-game-tile-icon">
                                {game.icon}
                            </div>
                            <span className="home-game-tile-name">{game.name}</span>
                            <span className="home-game-tile-type">{game.type}</span>
                        </div>
                    ))}
                </div>
            </section>


            {/* Quick Actions Row */}
            <div className="home-quick-actions">
                <Link to="/highscores" className="home-quick-pill home-quick-highscores">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2" />
                        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 19.24 17 20v2" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                    Highscores & Ranglisten
                </Link>
                <button className="home-quick-pill home-quick-changelog" onClick={() => setShowChangelog(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                    v{currentVersion} — Changelog
                </button>
            </div>

            {/* Changelog Modal */}
            {showChangelog && (
                <div className="modal-overlay" onClick={() => setShowChangelog(false)}>
                    <div className="modal changelog-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Changelog</h2>
                            <button className="modal-close" onClick={() => setShowChangelog(false)}>&#x2715;</button>
                        </div>
                        <div className="changelog-content">
                            {changelog.map((entry, index) => (
                                <div key={entry.version} className={`changelog-entry ${index === 0 ? 'changelog-latest' : ''}`}>
                                    <div className="changelog-entry-header">
                                        <span className="changelog-version">v{entry.version}</span>
                                        <span className="changelog-date">{entry.date}</span>
                                    </div>
                                    <h3 className="changelog-entry-title">{entry.title}</h3>
                                    <ul className="changelog-list">
                                        {entry.changes.map((change, changeIndex) => (
                                            <li key={changeIndex}>{change}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
