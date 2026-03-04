const changelog = [
    {
        version: '5.6.0',
        date: '2026-03-03',
        title: 'Schiffe Versenken',
        changes: [
            'Neues Multiplayer-Spiel: Schiffe Versenken (Battleship)',
            'Platzierungsphase: 5 Schiffe auf 10x10 Raster positionieren',
            'Server-autorit\u00e4re Spiellogik: Gegnerische Schiffpositionen bleiben bis zum Versenken verborgen',
            'Treffer-, Wasser- und Versenkt-Anzeige mit Animationen',
            'Rematch-Support nach Spielende',
            'Highscores mit Siegrate f\u00fcr Schiffe Versenken'
        ]
    },
    {
        version: '5.5.0',
        date: '2026-03-02',
        title: 'Hauptseite Redesign & Footer',
        changes: [
            'Hauptseite: Drittes Card f\u00fcr Highscores mit Pokal-Icon',
            'Hauptseite: Animierte schwebende W\u00fcrfel im Hintergrund',
            'Hauptseite: Zweiter Glow-Effekt f\u00fcr mehr Tiefe',
            'Hauptseite: 3-Spalten Grid mit responsivem Fallback',
            'Footer: Globaler Footer auf allen Seiten',
            'Footer: Links zu mike-server.eu und GitHub Repository'
        ]
    },
    {
        version: '5.4.0',
        date: '2026-03-01',
        title: 'WebSocket Stabilit\u00e4t & phpMyAdmin Auto-Login',
        changes: [
            'phpMyAdmin: Auto-Login direkt aus dem Admin-Panel (wie bei Plesk)',
            'iPad/iOS: WebSocket-Verbindung bleibt nach Standby/Tab-Wechsel stabil',
            'Socket.IO: Schnellere Ping-Erkennung (10s statt 25s)',
            'Automatischer Reconnect mit unbegrenzten Versuchen',
            'Nginx: WebSocket-Timeout auf 5 Minuten erh\u00f6ht'
        ]
    },
    {
        version: '5.2.0',
        date: '2026-03-01',
        title: 'Multiplayer Lobby & Auto-Updater Umbau',
        changes: [
            'Multiplayer Lobby: Eigene aktive Räume werden nach Seitenreload angezeigt',
            'Raumcode auf 4 Ziffern vereinfacht (vorher 6 alphanumerisch)',
            'Offene Räume entfernt - Beitritt nur noch per Code',
            'Auto-Updater: Zieht direkt von GitHub Main-Branch (keine manuellen Releases nötig)',
            'Lokal-Filter: Multiplayer-Spieltypen nicht mehr im Lokal-Modus sichtbar',
            'Passwort Mindestlänge auf 5 Zeichen reduziert',
            'Multiplayer-Spiele im Admin löschbar',
            'Multiplayer Highscores als eigene Kategorie'
        ]
    },
    {
        version: '5.0.6',
        date: '2026-02-25',
        title: 'Multiplayer Bugfix',
        changes: [
            'Multiplayer Kniffel: Spiel wird jetzt automatisch abgeschlossen wenn alle Kategorien ausgefüllt sind'
        ]
    },
    {
        version: '5.0.5',
        date: '2026-02-24',
        title: 'Dark Theme Korrekturen',
        changes: [
            'Scoreboard: Helle Phase-10-Zeilenfarben auf Dark-Theme umgestellt',
            'Dashboard: Game-Cards, Player-Pills und Action-Buttons auf Dark-Theme korrigiert',
            'Section-Count Badge: Heller Hintergrund durch transparente Glassmorphism-Variante ersetzt'
        ]
    },
    {
        version: '5.0.4',
        date: '2026-02-23',
        title: 'Multiplayer Fixes & Deutsche Routen',
        changes: [
            'Frontend-Routen eingedeutscht: /game → /spiel, /games → /spiele',
            'Multiplayer Kniffel: Würfel-Darstellung repariert (fehlende Dot-Positionierung)',
            'Multiplayer Kniffel: Würfel halten funktioniert jetzt zuverlässig (1 Klick)',
            'Multiplayer Kniffel: Shake-Animation beim Würfeln',
            'Installer: SIGPIPE-Crash bei phpMyAdmin-Setup behoben'
        ]
    },
    {
        version: '5.0.0',
        date: '2026-02-22',
        title: 'Spieler & Benutzer Merge',
        changes: [
            'Spieler-Profile und Benutzer zu einer Entität vereint',
            'Neues Spieler-Profil mit Avatar, Statistiken und optionalem Multiplayer-Login',
            'Multiplayer-Checkbox: Username + Passwort nur bei Bedarf',
            'Admin-Bereich: Benutzerverwaltung mit Profilkarten statt Tabelle',
            'Automatische Migration bestehender Spieler-Profile',
            'Backup-Format v3.0 mit Rückwärtskompatibilität'
        ]
    },
    {
        version: '4.1.1',
        date: '2026-02-22',
        title: 'Dark Theme Fixes',
        changes: [
            'iPad: Weißer Rand oben behoben (theme-color + viewport-fit)',
            'Highscores: Stat-Cards und Platzierungs-Liste auf Dark-Theme umgestellt',
            'Alle verbleibenden weißen Hintergründe entfernt (Würfel, Changelog, etc.)'
        ]
    },
    {
        version: '4.1.0',
        date: '2026-02-22',
        title: 'LiquidGlass Dark Theme',
        changes: [
            'Globales Dark-Theme: Gesamte App im LiquidGlass-Design',
            'Glassmorphism-Navbar mit Backdrop-Blur',
            'Halbtransparente Cards, Formulare und Tabellen',
            'Dunkle Modals mit verstärktem Blur-Overlay',
            'Badges mit leuchtenden Farben auf transparentem Hintergrund',
            'Navbar: "Bibliothek" umbenannt in "Lokal"',
            'Doppelte Route /games entfernt – /spiele ist jetzt die einzige URL'
        ]
    },
    {
        version: '4.0.0',
        date: '2026-02-22',
        title: 'Online Multiplayer',
        changes: [
            'Neuer Spielmodus: Online Multiplayer (Kniffel)',
            'Home-Seite: Redesign mit Lokal/Multiplayer Modus-Auswahl',
            'Multiplayer-Lobby: Räume erstellen, per Code beitreten, offene Räume anzeigen',
            'Warteraum mit Ready-System und Spieler-Übersicht',
            'Interaktive Würfel-UI mit Hold-Mechanik (3 Würfe pro Zug)',
            'Vollständiges Kniffel-Scoreboard mit Echtzeit-Punkteingabe',
            'Server-autoritäre Würfel-Engine (Cheat-sicher)',
            'Echtzeit-Synchronisation über Socket.IO',
            'Neue Rolle: Player (für Multiplayer-Teilnahme)',
            'Admin: Benutzer können jetzt als Player angelegt werden',
            'Sieges-Anzeige mit Trophy und Endstand'
        ]
    },
    {
        version: '3.1.4',
        date: '2026-02-21',
        title: 'Patch',
        changes: [
            'Fehlerbehebungen'
        ]
    },
    {
        version: '3.1.3',
        date: '2026-02-21',
        title: 'Stabilität',
        changes: [
            'Stabilitätsverbesserungen'
        ]
    },
    {
        version: '3.1.2',
        date: '2026-02-21',
        title: 'Fixes & Optimierungen',
        changes: [
            'Fehlerbehebungen und Optimierungen'
        ]
    },
    {
        version: '3.1.1',
        date: '2026-02-21',
        title: 'Bugfixes',
        changes: [
            'Fehlerbehebungen und Optimierungen'
        ]
    },
    {
        version: '3.1.0',
        date: '2026-02-21',
        title: 'Server Status & Auto-Updater',
        changes: [
            'Server-Status API-Route hinzugefügt',
            'Admin-Panel: Server-Status Anzeige',
            'Auto-Updater erfolgreich getestet und stabilisiert'
        ]
    },
    {
        version: '3.0.12',
        date: '2026-02-21',
        title: 'Updater Test v4',
        changes: [
            'Auto-Update Mechanismus Test'
        ]
    },
    {
        version: '3.0.11',
        date: '2026-02-21',
        title: 'Updater Fixes',
        changes: [
            'Auto-Update Mechanismus Verbesserungen'
        ]
    },
    {
        version: '3.0.10',
        date: '2026-02-21',
        title: 'Updater Test v3',
        changes: [
            'Auto-Update Mechanismus Test'
        ]
    },
    {
        version: '3.0.9',
        date: '2026-02-21',
        title: 'Updater Feinschliff',
        changes: [
            'Auto-Update Mechanismus weiter optimiert'
        ]
    },
    {
        version: '3.0.8',
        date: '2026-02-21',
        title: 'Updater Test v2',
        changes: [
            'Auto-Update Mechanismus Test'
        ]
    },
    {
        version: '3.0.7',
        date: '2026-02-21',
        title: 'Admin UI Fix',
        changes: [
            'Admin-Panel: Update-Ansicht korrigiert'
        ]
    },
    {
        version: '3.0.6',
        date: '2026-02-21',
        title: 'Updater Test',
        changes: [
            'Auto-Update Mechanismus Testversion'
        ]
    },
    {
        version: '3.0.5',
        date: '2026-02-21',
        title: 'Update-Service Stabilisierung',
        changes: [
            'Update-Service und Route: Stabilitätsverbesserungen'
        ]
    },
    {
        version: '3.0.4',
        date: '2026-02-21',
        title: 'Admin & Home Fixes',
        changes: [
            'Admin-Panel: UI-Verbesserungen',
            'Startseite: Layout-Anpassungen'
        ]
    },
    {
        version: '3.0.3',
        date: '2026-02-21',
        title: 'Updater Bugfix',
        changes: [
            'Update-Route: Fehlerbehandlung verbessert'
        ]
    },
    {
        version: '3.0.2',
        date: '2026-02-21',
        title: 'Update & UI Fixes',
        changes: [
            'Update-Mechanismus: Backend-Route und Admin-UI verbessert',
            'Startseite: UI-Anpassungen'
        ]
    },
    {
        version: '3.0.1',
        date: '2026-02-21',
        title: 'Update-Mechanismus Test',
        changes: [
            'Erster Test des Auto-Update-Mechanismus über den Admin-Bereich'
        ]
    },
    {
        version: '3.0.0',
        date: '2026-02-21',
        title: 'Auto-Update System',
        changes: [
            'One-Click Auto-Updates direkt aus dem Admin-Bereich',
            'Update-Service mit SHA256-Integritätsprüfung und Backup vor jedem Update',
            'Automatischer Health-Check nach Update-Installation',
            'Update-Status und Log-Ansicht im Admin-Panel',
            'Versions-Manifest (latest.json) für dynamische Update-Erkennung',
            'Updater-Script mit File-Lock, Fehlerbehandlung und Rollback-Schutz',
            'One-Line Installer: curl -sL .../setup.sh | sudo bash',
            'build.sh generiert automatisch Checksumme und Manifest'
        ]
    },
    {
        version: '2.4.2',
        date: '2026-02-20',
        title: 'Phase 10 Scoring Fix',
        changes: [
            'Phase 10 Würfelspiel: Scoring-Logik und Bonus-Berechnung korrigiert',
            'Frontend-Registry für Phase 10 aktualisiert'
        ]
    },
    {
        version: '2.4.1',
        date: '2026-02-20',
        title: 'Spielansicht Bugfixes',
        changes: [
            'ManageGame: UI-Korrekturen und Stabilitätsverbesserungen',
            'GameView: Zuschauer-Ansicht optimiert'
        ]
    },
    {
        version: '2.4.0',
        date: '2026-02-20',
        title: 'Zuschauer-Ansicht & Phase 10 Feinschliff',
        changes: [
            'Neue Zuschauer-Spielansicht (GameView) mit Live-Scoreboard',
            'Phase 10 Würfelspiel: Backend-Spiellogik erweitert',
            'Phase 10 Würfelspiel: Frontend-Registry und Spieltyp-Registrierung aktualisiert',
            'ManageGame: Erweiterte Spielverwaltung und UI-Optimierungen',
            'CSS-Verbesserungen für die Spielansichten'
        ]
    },
    {
        version: '2.3.0',
        date: '2026-02-20',
        title: 'Phase 10 – Scoring Verbesserungen',
        changes: [
            'Phase 10 Würfelspiel: Bonus-Berechnung korrigiert (>=221 statt >221)',
            'Phase 10 Würfelspiel: Score-Logik und Validierung optimiert',
            'ManageGame: UI-Verbesserungen für Phase 10 Spielansicht'
        ]
    },
    {
        version: '2.2.0',
        date: '2026-02-20',
        title: 'Phase 10 Würfelspiel – Bonus & Scoring',
        changes: [
            'Phase 10 Würfelspiel: Automatisches Bonussystem (+40 bei >=221 Punkte bis Phase 5)',
            'Phase 10 Würfelspiel: Erster-Durchlauf-Bonus (+40 für den ersten Spieler der alle Phasen abschließt)',
            'Phase 10 Würfelspiel: Bonus-Kategorie in Extras-Sektion',
            'Score-Eingabe mit erweiterter Validierung und Spieltyp-spezifischer Logik',
            'Frontend-Registry für Phase 10 Würfelspiel aktualisiert'
        ]
    },
    {
        version: '2.1.1',
        date: '2026-02-20',
        title: 'WebSocket Fix',
        changes: [
            'WebSocket-Verbindung stabilisiert'
        ]
    },
    {
        version: '2.1.0',
        date: '2026-02-20',
        title: 'Security Hardening',
        changes: [
            'Content Security Policy (CSP) aktiviert mit strikten Direktiven',
            'Username-Lookup via HMAC-SHA256 Hash optimiert (O(1) statt Full-Table-Scan)',
            'Audit-Logging für Login-Versuche, Benutzerverwaltung und Backup-Operationen',
            'Username-Validierung mit Regex-Whitelist (Buchstaben, Zahlen, ._-)',
            'Backup-Import-Limit von 50MB auf 10MB reduziert',
            'CORS-Warnung bei fehlender Konfiguration in Production'
        ]
    },
    {
        version: '2.0.0',
        date: '2026-02-20',
        title: 'Major Release – Security & Stabilität',
        changes: [
            'Umfassender Security-Audit aller Backend- und Frontend-Komponenten',
            'Dashboard Redesign mit KPI-Kacheln und Segmented Controls',
            'Highscores-Seite mit responsivem Podium-Layout',
            'Multi-Spieltyp-Architektur (Kniffel + Phase 10 Würfelspiel)',
            'Backup & Restore v2.1 mit Avatar-Export',
            'phpMyAdmin-Integration mit sicherem Basic-Auth-Zugang',
            'Mobile-optimiertes UI für alle Bereiche',
            'Live-Spielansicht mit WebSocket-Updates'
        ]
    },
    {
        version: '1.4.2',
        date: '2026-02-20',
        title: 'Mobile Login-Button',
        changes: [
            'Login-Button auf Mobile als kompaktes SVG-Icon statt Text'
        ]
    },
    {
        version: '1.4.1',
        date: '2026-02-20',
        title: 'Dashboard Cleanup',
        changes: [
            'Zähler-Badges aus den Sektions-Headern entfernt (Info bereits in KPI-Kacheln)',
            'Filter "Abgeschlossen" klappt die Sektion automatisch auf'
        ]
    },
    {
        version: '1.4.0',
        date: '2026-02-20',
        title: 'Dashboard Redesign',
        changes: [
            'Neues "Control Deck"-Layout mit KPI-Kacheln (Aktive, Abgeschlossene, Spieler)',
            'Segmented Control für Statusfilter (Alle / Aktiv / Abgeschlossen)',
            'Spieler-Pills mit Avatar-Bild oder Initialen-Fallback',
            'Abgeschlossene Spiele ein-/ausklappbar',
            'Vollständig responsives Mobile-Layout'
        ]
    },
    {
        version: '1.3.0',
        date: '2026-02-20',
        title: 'Branding, phpMyAdmin & UI-Polish',
        changes: [
            'Rebranding zu "MIKE - Game Library" (Titel, Meta, Favicon)',
            'SVG-Icons statt Emojis auf der Startseite',
            'Backup v2.1: Avatare mitexportiert, Import mit sicherer Reihenfolge (Profile → Spiele → Scores)',
            'phpMyAdmin mit Konfigurationsspeicher (pmadb) und DB-User-Setup',
            'phpMyAdmin-Link im Admin-Bereich',
            'Changelog-Button auf der Startseite mit Versionshistorie',
            'Mobile: Dice-Icon in Navbar ausgeblendet, Brand zentriert',
            'Mobile Grid-Layout für Spielsteuerungs-Buttons'
        ]
    },
    {
        version: '1.2.0',
        date: '2026-02-20',
        title: 'UI-Verbesserungen & Spielsteuerung',
        changes: [
            'Turn-Change-Animation beim Spielerwechsel (Pulse, Sweep & Texteffekt)',
            'Spieltyp-Badge im ManageGame-Header sichtbar',
            'Mobile-optimiertes Header-Layout für Spielsteuerung',
            '"Weiter (ohne Eintrag)"-Button nur bei Phase 10 Würfelspiel',
            'Vorzeitiges Abschließen von Spielen möglich',
            'Navbar zentriert auf Mobilgeräten',
            'Kategorie-Anforderungen als Hinweistext in GameView und ManageGame'
        ]
    },
    {
        version: '1.1.0',
        date: '2026-02-19',
        title: 'Highscores & Statistiken',
        changes: [
            'Highscores-Seite mit responsivem Podium (1–3 Spieler)',
            'Spieltyp-Filter nur bei mehreren Spieltypen sichtbar',
            'Profil-Statistiken jetzt pro Spieltyp gespeichert',
            'Rebuild der Statistiken beim Server-Start',
            'Singular/Plural für Spielanzahl (1 Spiel / 2 Spiele)',
            'Stat Cards mit dynamischem Grid-Layout'
        ]
    },
    {
        version: '1.0.0',
        date: '2026-02-19',
        title: 'Game Library Launch',
        changes: [
            'Umbenennung von "Kniffel Tracker" zu "Game Library"',
            'Multi-Spieltyp-Architektur (Kniffel + Phase 10 Würfelspiel)',
            'Spieltyp-spezifische Kategorien und Scoring-Logik',
            'Dashboard mit Spieltyp-Filter und Neues-Spiel-Dialog',
            'Live-Spielansicht mit WebSocket-Updates und Würfelanzeige',
            'Spieler-Profile mit Statistiken pro Spieltyp',
            'Admin-Bereich mit mobilfreundlichen Tabellen',
            'Backup & Restore mit Versionierung (v2.0)'
        ]
    }
];

export default changelog;
