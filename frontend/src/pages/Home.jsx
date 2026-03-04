import { useState } from 'react';
import { Link } from 'react-router-dom';
import changelog from '../data/changelog';

export default function Home() {
    const [showChangelog, setShowChangelog] = useState(false);
    const currentVersion = changelog[0]?.version || '1.0.0';

    return (
        <div className="home-page">
            {/* Floating background dice */}
            <div className="home-floating-dice" aria-hidden="true">
                <div className="floating-die floating-die-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                </div>
                <div className="floating-die floating-die-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                </div>
                <div className="floating-die floating-die-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                </div>
                <div className="floating-die floating-die-4">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                </div>
                <div className="floating-die floating-die-5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                        <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                </div>
            </div>

            {/* Hero Section */}
            <div className="home-hero">
                <div className="home-hero-glow" aria-hidden="true" />
                <div className="home-hero-glow home-hero-glow-secondary" aria-hidden="true" />
                <h1 className="home-title">
                    Willkommen in der
                    <span className="home-title-accent"> Game Library</span>
                </h1>
                <p className="home-subtitle">
                    Wähle deinen Spielmodus und starte direkt los
                </p>
            </div>

            {/* Mode Selection */}
            <div className="mode-grid mode-grid-3">
                {/* Lokal Card */}
                <Link to="/spiele" className="mode-card mode-card-local">
                    <div className="mode-card-glow mode-card-glow-local" aria-hidden="true" />
                    <div className="mode-card-inner">
                        <div className="mode-card-icon mode-card-icon-local">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="8" height="8" rx="2" />
                                <circle cx="4.5" cy="4.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="7.5" cy="4.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="4.5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="7.5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
                                <rect x="14" y="2" width="8" height="8" rx="2" />
                                <circle cx="18" cy="6" r="0.6" fill="currentColor" stroke="none" />
                                <rect x="2" y="14" width="8" height="8" rx="2" />
                                <circle cx="4.5" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="7.5" cy="19.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="6" cy="18" r="0.6" fill="currentColor" stroke="none" />
                                <rect x="14" y="14" width="8" height="8" rx="2" />
                                <circle cx="16.5" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="19.5" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="16.5" cy="19.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="19.5" cy="19.5" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="18" cy="18" r="0.6" fill="currentColor" stroke="none" />
                                <circle cx="16.5" cy="18" r="0.6" fill="currentColor" stroke="none" />
                            </svg>
                        </div>
                        <h2 className="mode-card-title">Lokaler Spielmodus</h2>
                        <p className="mode-card-desc">
                            Würfle in Echt und trage deine Punkte digital ein.
                            Perfekt für den Spieleabend am Tisch.
                        </p>
                        <div className="mode-card-features">
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Kniffel & Phase 10
                            </span>
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Live-Scoreboard
                            </span>
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Zuschauer-Ansicht
                            </span>
                        </div>
                    </div>
                </Link>

                {/* Multiplayer Card */}
                <Link to="/multiplayer" className="mode-card mode-card-multi">
                    <div className="mode-card-glow mode-card-glow-multi" aria-hidden="true" />
                    <div className="mode-card-inner">
                        <div className="mode-card-icon mode-card-icon-multi">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M2 12h20" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
                                <circle cx="19" cy="8" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
                                <circle cx="7" cy="18" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
                                <circle cx="17" cy="17" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
                            </svg>
                        </div>
                        <h2 className="mode-card-title">Online Multiplayer</h2>
                        <p className="mode-card-desc">
                            Spiele zusammen mit Freunden online.
                            Erstelle Räume, tritt bei und würfle digital.
                        </p>
                        <div className="mode-card-features">
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Online Kniffel
                            </span>
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Digitale Würfel
                            </span>
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Raum-System
                            </span>
                        </div>
                    </div>
                </Link>

                {/* Highscores Card */}
                <Link to="/highscores" className="mode-card mode-card-highscores">
                    <div className="mode-card-glow mode-card-glow-highscores" aria-hidden="true" />
                    <div className="mode-card-inner">
                        <div className="mode-card-icon mode-card-icon-highscores">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                <path d="M4 22h16" />
                                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2" />
                                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 19.24 17 20v2" />
                                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                            </svg>
                        </div>
                        <h2 className="mode-card-title">Highscores</h2>
                        <p className="mode-card-desc">
                            Vergleiche deine Ergebnisse mit anderen Spielern.
                            Wer hat die höchste Punktzahl?
                        </p>
                        <div className="mode-card-features">
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Ranglisten
                            </span>
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Statistiken
                            </span>
                            <span className="mode-feature">
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06-1.06L6.94 7.88 5.84 6.78a.75.75 0 0 0-1.06 1.06l1.63 1.63a.75.75 0 0 0 1.06 0l3.75-3.75Z" /></svg>
                                Alle Spieltypen
                            </span>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Version / Changelog */}
            <div className="home-version">
                <button className="btn-changelog" onClick={() => setShowChangelog(true)}>
                    v{currentVersion} · Changelog
                </button>
            </div>

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
