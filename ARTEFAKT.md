# CONNSKILL Growth Services MCP

Stand: 16.10.2026. Version 0.3.1 auf npm, GitHub, MCP Registry und Glama veröffentlicht. Status `e2e_verified` für Paketintegrität, kostenlose Discovery und Wallet-Sperre. SDK 1.32.1, fünf transitive Sicherheitsupdates, npm audit ohne Befund; 57 synthetische Regressionen und 9 AMD64-Containerprüfungen bestanden. Kein realer Zahlungstest in diesem Wartungsrelease.

Historischer Veröffentlichungsstand 18.09.2026: Version 0.3.0 ist auf GitHub, npm und in der offiziellen MCP Registry veröffentlicht und öffentlich geprüft. Status `e2e_verified` für Veröffentlichung, Paketintegrität und kostenlose MCP-Discovery; bezahlte Lieferung wurde bei dieser Abnahme nicht getestet.

## Auf einen Blick

MCP-Adapter und portabler Agenten-Skill für die Angebote von [agent.connskill.com](https://agent.connskill.com). Kostenlose Kataloge und Angebote brauchen keine Wallet. Bezahlte Anfragen sind getrennte, ausdrücklich autorisierte Käufe.

## Offen

- Externe Listings auf Ergebnisangebote ausrichten und deren tatsächliche Veröffentlichung prüfen.

## Regeln und Ablage

- [README.md](README.md): Nutzeranleitung und tatsächliche Veröffentlichungsgrenzen.
- [skills/connskill-growth/SKILL.md](skills/connskill-growth/SKILL.md): Aufträge und Kaufgrenzen.
- `index.mjs` und `skills/connskill-growth/scripts/`: MCP-Adapter und Zahlungsclient.
- `server.json`, `package.json`: getrennte Registry- und npm-Metadaten.
- Interne Entwicklung und Betriebsbelege liegen im CONNSKILL-STACK, Bereich automaton. Dieses Repository enthält nur öffentliche Distributionsdateien.

## Entscheidungen und Verlauf

18.09.2026: Der Local Market Check ist auf der Service-Website veröffentlicht. Die Distributionsunterlagen werden um dessen Ergebnis, freie Quote und genau einen Paketauftrag ergänzt. Ein Listing oder Download beweist keinen Verkauf. Keine Testzahlung im Rahmen dieser Dokumentationsarbeit.

18.09.2026: npm latest und MCP Registry latest jeweils 0.3.0 öffentlich bestätigt. Heruntergeladenes npm-Archiv bytegleich zum vorbereiteten Paket; kostenlose Probe erkennt 78 Tools inklusive Local Market Check und Quote. Ohne Wallet kein Kaufdispatch.

16.10.2026: npm-Archiv vollständig bytegleich zum geprüften Quellstand `6d0e33b`; npm/GitHub/MCP Registry jeweils 0.3.1. Glama-Build `01a1432e-71fe-73a4-a8c4-7ec1927c88b3` erfolgreich, Release 0.3.1 veröffentlicht. Build verwendet `npm ci`, Node 22 und den geprüften Commit; Inspektion ohne Wallet mit Zahlungscap null. Öffentlicher Hinweis „cannot be deployed“ entfernt. Automatische Kompatibilitätsprüfung wird im bestehenden CONNSKILL-Tageslauf geführt; keine automatischen Paketveröffentlichungen.
