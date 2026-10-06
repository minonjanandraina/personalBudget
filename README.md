# personalBudget

Application **Android** de gestion de budget personnel (Ariary, compte Orange Money), **100 % hors ligne**, open source.

- Spécifications : [CLAUDE.md](CLAUDE.md)
- Plan de travail : [SPRINTS.md](SPRINTS.md)
- Prototype Django archivé : [legacy_django/](legacy_django/)

## Développement (Windows)

```
npm install      # installe les outils (une seule fois)
npm run dev      # ouvre l'application dans le navigateur : http://localhost:5173
npm test         # lance les tests de la logique métier
npm run build    # produit la version finale dans dist/
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/core/` | logique métier en JavaScript pur (testable sans téléphone) |
| `src/ui/` | écrans |
| `src/platform/` | accès Android (SMS, USSD, fichiers) avec version simulée |
| `android/app/src/main/java/org/minonja/volako/` | plugin Android en Kotlin (SMS au sprint 9, USSD au sprint 10) |

Note : les fichiers JSON (`package.json`) n'acceptent pas de commentaires ; leur rôle est expliqué ici.
`package.json` liste les outils (Vite = serveur de développement, Vitest = tests, Capacitor = emballage en APK) et les commandes ci-dessus.
