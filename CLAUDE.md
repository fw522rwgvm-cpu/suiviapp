# Règles du projet

## Documents de référence
- `specs_v2_2.md` — fonctionnel, fait autorité
- `architecture_v1_0.md` — technique, décisions D1 à D16, fait autorité
Toute divergence avec ces documents est un bug. Toute modification
souhaitée de ces documents doit être proposée explicitement, jamais
appliquée en silence.

## Interdits absolus
- `new Date()` sur une chaîne `AAAA-MM-JJ`. Point d'entrée unique : `core/date`.
- Écriture en base depuis un composant. Les écritures passent par les
  fonctions transactionnelles du domaine.
- Calcul métier dans un composant.
- Logique ou requête dans `app/` : câblage de route uniquement.
- Modification d'une migration déjà livrée. Ajout seul.
- Stockage d'une valeur dérivable (D9). Figé ≠ dérivé.
- Ajout d'une dépendance native sans validation explicite.
- Ajout d'une bibliothèque de composants d'interface, de NativeWind,
  ou d'une bibliothèque d'internationalisation.

## Règles structurantes
- Une date civile est `TEXT AAAA-MM-JJ`. Un instant est un entier epoch ms.
  Un instant ne détermine jamais l'appartenance à une journée.
- Les macros sont stockées pour 100 unités de base.
- Une entrée de journal fige la référence et la quantité, jamais le total.
- Seules les lignes sans enfant portent des macros.
- Toute opération multi-lignes est explicitement transactionnelle.
- Aucune invalidation de cache écrite à la main : elle passe par le bus
  de changements.
- Un composant ne migre vers `core/ui` qu'à son deuxième utilisateur réel.
- TypeScript strict, aucun `any`, types marqués pour `LocalDate` et les
  identifiants d'entité.
- Code et schéma en anglais, `snake_case` en base, `camelCase` en TypeScript.
  Français réservé aux chaînes affichées.

## Contexte de build
Pas de Mac. Chaque build iOS passe par GitHub Actions (5 à 15 min).
Compte Apple gratuit, SideStore, certificat expirant tous les 7 jours.
L'application doit tolérer un arrêt forcé à tout moment sans perte.

## Attentes de travail
- Plan avant code, validé, sur les tâches non triviales.
- Une tranche à la fois (voir §7 de l'architecture).
- Signaler toute hypothèse devinée plutôt que la présenter comme acquise.
---

## État du projet
Tranche 0 livrée. Tranche 1 (journal en saisie libre) à venir.

**La migration initiale est encore dégelable.** Elle se gèle le jour où la
première donnée réelle est saisie sur l'installation quotidienne, c'est-à-dire
à la tranche 1 (D6/G2). À partir de là : ajout seul.

## Identifiants d'application
Décision irréversible : changer l'identifiant quotidien vide son conteneur
sans avertissement (specs §2.2).

| Variante | `APP_VARIANT` | Identifiant | Configuration |
| --- | --- | --- | --- |
| Quotidienne | `production` | `com.billjackpot.suiviapp` | Release |
| Développement | `dev` | `com.billjackpot.suiviapp.dev` | Debug |

Le défaut est `dev`. Oublier la variable ne doit jamais produire un binaire
qui écrase l'installation quotidienne.

## Commandes
- `npm run typecheck` — TypeScript strict
- `npm test` — suite complète sous UTC, America/New_York et Pacific/Kiritimati
- `npm run migrations:generate` — migration Drizzle **et** module embarqué
- `npm run bundle:ios` — fabrique le bundle JS sans Mac, pré-vol utile

Vérifier avec `npm ci` avant de pousser, jamais `npm install` : le premier est
strict, le second permissif, et la CI utilise le premier.

## Chaîne de build
`main` déclenche les deux builds. IPA publiées en release GitHub, tags
`app-b<n>` et `dev-b<n>`, conservés (D6/G3 pose qu'un retour arrière arrivera).

Pré-vol local avant de brûler un cycle de 15 minutes :
`APP_VARIANT=production npx expo prebuild --platform ios --clean --no-install`
puis inspecter `ios/Suivi.xcodeproj` et l'`Info.plist`.

Réglages non évidents, tous établis par l'échec :
- Runner `macos-26` : `expo-router` tire `expo-glass-effect` et `expo-symbols`,
  qui compilent contre des API iOS 26.
- Le schéma Xcode est **déduit** du `.xcodeproj`, jamais `schemes[0]` : un
  workspace CocoaPods expose un schéma par pod, et le premier est un pod.
- `ENABLE_DEBUG_DYLIB=NO` : sinon le build Debug scinde l'exécutable et un
  dylib, et iOS refuse l'installation pour intégrité non vérifiable.

## Migrations
Les `.sql` ne sont **pas** importés directement. Le chemin que Drizzle
documente pour Expo exige `babel-plugin-inline-import`, hors du §5, et ne
compile pas tel quel. `scripts/generate-migrations-bundle.mjs` produit à la
place un module TypeScript. Toujours passer par `npm run migrations:generate`,
qui enchaîne les deux.

Séquence de démarrage, normative : ouvrir et poser les PRAGMA → refuser si la
base est plus récente → sauvegarder → migrer. Le refus précède la sauvegarde.

## Pièges de l'environnement local
- `npm install` échoue : `better-sqlite3` tente de se recompiler alors qu'il
  embarque ses binaires, et `make` est absent de ce WSL2. Utiliser
  `npm install --ignore-scripts`, ou installer `build-essential`.
- npm perd les dépendances optionnelles quand l'arbre bouge (npm/cli#4828),
  typiquement après un `expo install`. Les liaisons rolldown disparaissent
  **du lockfile**, et les tests échouent sur « Cannot find native binding ».
  Remède : `rm -rf node_modules package-lock.json && npm install --ignore-scripts`,
  puis vérifier que le lockfile porte bien les quinze liaisons.
- Metro n'est pas joignable depuis WSL2 par défaut : la boucle de D1 exige le
  mode réseau `mirrored` de WSL2, ou un `netsh portproxy`. Non résolu.

## Points laissés ouverts par la tranche 0
- Où vit le sélecteur segmenté de l'onglet Entraînement, une fois qu'il
  composera Musculation et Activités (tranche 10). L'écran est provisoirement
  dans `features/strength`.
- Le dossier de sauvegardes s'appelle `backups`, en anglais comme le code,
  alors qu'il est visible dans l'app Fichiers.
- `src/core/db/version-guard.ts` et `database-gate.tsx` ne figurent pas dans
  l'arborescence du §3 : G3 exige un refus de démarrage avec message, il lui
  faut un porteur.
