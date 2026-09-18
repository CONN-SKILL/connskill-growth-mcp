# CONNSKILL Growth Services MCP

Stand: 18.09.2026. Status `partial`: GitHub-Quelle 0.3.0; npm und MCP Registry führen beim heutigen Abruf noch 0.2.1. Ein Git-Push veröffentlicht kein npm-Paket.

## Auf einen Blick

MCP-Adapter und portabler Agenten-Skill für die Angebote von [agent.connskill.com](https://agent.connskill.com). Kostenlose Kataloge und Angebote brauchen keine Wallet. Bezahlte Anfragen sind getrennte, ausdrücklich autorisierte Käufe.

## Offen

- Geprüfte Quelle 0.3.0 über npm und anschließend MCP Registry veröffentlichen.
- Externe Listings auf Ergebnisangebote ausrichten und deren tatsächliche Veröffentlichung prüfen.

## Regeln und Ablage

- [README.md](README.md): Nutzeranleitung und tatsächliche Veröffentlichungsgrenzen.
- [skills/connskill-growth/SKILL.md](skills/connskill-growth/SKILL.md): Aufträge und Kaufgrenzen.
- `index.mjs` und `skills/connskill-growth/scripts/`: MCP-Adapter und Zahlungsclient.
- `server.json`, `package.json`: getrennte Registry- und npm-Metadaten.
- Interne Entwicklung und Betriebsbelege liegen im CONNSKILL-STACK, Bereich automaton. Dieses Repository enthält nur öffentliche Distributionsdateien.

## Entscheidungen und Verlauf

18.09.2026: Der Local Market Check ist auf der Service-Website veröffentlicht. Die Distributionsunterlagen werden um dessen Ergebnis, freie Quote und genau einen Paketauftrag ergänzt. Ein Listing oder Download beweist keinen Verkauf. Keine Testzahlung im Rahmen dieser Dokumentationsarbeit.
