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
Tranches 0 et 1 livrées. Tranche 2 (export / import) à venir — le filet, placé
délibérément avant tout le reste parce que de vraies données s'accumulent
depuis la tranche 1 et que rien ne les protège encore.

**Le schéma est gelé. Ajout seul désormais (D6/G2).** La migration initiale
n'a jamais été dégelée : `0001_journal` a été ajoutée à côté. Réécrire `0000`
aurait changé son horodatage, fait voir une migration en attente à
l'installation quotidienne, qui aurait tenté de recréer `setting` et échoué au
démarrage. Le dégel servait à corriger `0000` ; `0000` n'avait rien à
corriger.

Divergence assumée et validée avec le §2.3, qui pose ses ensembles de valeurs
en commentaires : `journal_entry.kind` et `base_unit` portent de vraies
contraintes `CHECK`. SQLite ne permet pas d'en ajouter une plus tard sans
reconstruire la table, et la tranche 2 importera du JSON arbitraire dedans.

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
- `npm run bundle:ios` — fabrique le bundle JS sans Mac, pré-vol utile.
  C'est le seul contrôle local qui attrape ce que `tsc` ne voit pas :
  résolution de modules, greffons Babel, routes `expo-router`.

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

La connexion s'ouvre avec `enableChangeListener: true`. Sans cette option,
`addDatabaseChangeListener` ne reçoit rien et le bus de D8 n'invalide jamais
rien : chaque écran affiche les chiffres d'hier, sans le dire.

## Pièges de l'environnement local
- `npm install` échoue : `better-sqlite3` tente de se recompiler alors qu'il
  embarque ses binaires, et `make` est absent de ce WSL2. Utiliser
  `npm install --ignore-scripts`, ou installer `build-essential`.
- npm perd les dépendances optionnelles quand l'arbre bouge (npm/cli#4828),
  typiquement après un `expo install`. Les liaisons rolldown disparaissent
  **du lockfile**, et les tests échouent sur « Cannot find native binding ».
  Remède : `rm -rf node_modules package-lock.json && npm install --ignore-scripts`,
  puis vérifier que le lockfile porte bien les quinze liaisons.
- Un dépôt fraîchement cloné n'a pas de `node_modules` : `npm ci --ignore-scripts`.
- **`ulid` lève une exception sur l'appareil si on le laisse choisir son
  générateur.** Il cherche `crypto.getRandomValues` sur l'objet global et
  échoue s'il ne le trouve pas, sans repli. Ni React Native 0.86 ni les
  polyfills *winter* d'Expo ne le définissent — ils couvrent `AbortSignal`,
  `FormData`, `TextDecoder` et `URL`, pas `crypto`. La suite Node reste verte
  puisque Node l'a. `core/id` lui injecte donc son générateur ;
  `monotonicFactory` incrémente dans la milliseconde, donc aucune collision
  n'est possible quelle que soit la qualité du tirage. Un test le fixe en
  supprimant `crypto` du global.
- Metro affiche `React Native DevTools ... libnspr4.so: cannot open shared
  object file`. C'est le débogueur graphique de bureau, qui réclame des
  bibliothèques GUI absentes de WSL. Sans effet sur le bundling ni sur
  l'appareil. Pour l'avoir : `sudo apt install libnspr4 libnss3`.

## Boucle de développement (résolue)
WSL2 est en **mode réseau miroir** : il partage les interfaces de Windows, donc
l'iPhone joint Metro directement. Plus de NAT, et surtout pas d'IP qui change à
chaque redémarrage.

`C:\Users\colin\.wslconfig` :

```ini
[wsl2]
networkingMode=mirrored
```

Appliqué par `wsl --shutdown` depuis PowerShell — ce qui tue la session WSL en
cours, terminal Claude Code compris.

Vérifier le mode : `ip -4 -o addr show` doit montrer l'IP Wi-Fi du PC
(`192.168.1.172` au 11/09/2026) et non un `172.x.x.x`.

Marche à suivre : `npm start`, puis ouvrir `http://<IP>:8081` **dans Safari sur
l'iPhone** avant de suspecter l'application — ça isole le réseau du client de
développement. Puis saisir cette URL dans le lanceur de « Suivi dev ».

Le `ip.txt` embarqué dans le build dev contient l'IP du runner GitHub, figée à
la compilation. C'est normal ; la saisie manuelle de l'URL le contourne.

Si le téléphone ne joint pas Metro : règle de pare-feu entrante sur le port
8081, puis le pare-feu Hyper-V. Les box isolant les clients sur le réseau
invité et les VPN actifs cassent aussi la liaison.

## Animations et gestes
**Les worklets Reanimated sont disponibles sans configuration.** Vérifié dans
la source : `babel-preset-expo` ajoute `react-native-worklets/plugin` de
lui-même dès que le paquet se résout, et `react-native-worklets` arrive avec
`react-native-reanimated` 4. Il n'y a pas de `babel.config.js` dans ce dépôt
et il n'en faut pas.

Vérification qui ne se devine pas : exporter en JS lisible avec
`npx expo export --platform ios --output-dir dist --no-bytecode`, puis
chercher `__workletHash` et le nom d'une fonction à soi. Le bundle par défaut
est du bytecode Hermes, illisible. C'est le seul moyen local de prouver que le
greffon a bien transformé **ses propres** fichiers et pas seulement ceux des
bibliothèques, qui sont livrées déjà transformées.

Conséquence : un geste qui suit le doigt tourne sur le fil d'interface.
Le faire depuis le fil JS saccade dès que React travaille — c'est-à-dire
exactement au moment intéressant.

## Direction iOS 26
Demande explicite : utiliser les outils natifs d'iOS 26, Liquid Glass compris.

Ligne de partage avec D10, qui écarte les bibliothèques de composants :
- **Le chrome appartient au système.** Barre d'onglets, en-têtes, feuilles,
  accessoires : contrôles natifs, configurés et non peints. Une bibliothèque
  tierce reste écartée ; la plateforme n'en est pas une.
- **Le contenu reste sur mesure.** Anneau de progression, rangée de RIR,
  balayage pour supprimer, carte corporelle, graphiques : maison, sur
  `react-native-svg` (D13).

Le Liquid Glass est un traitement qu'UIKit applique à ses propres contrôles.
Une vue dessinée en JavaScript ne peut pas le recevoir, quel que soit son style.
La CI compilant contre le SDK iOS 26, les contrôles natifs l'adoptent seuls :
il n'y a rien à activer.

**Ne jamais peindre le fond d'une surface en verre** (`backgroundColor` sur la
barre d'onglets, un en-tête, une feuille). L'opacité annule l'effet.

`expo-glass-effect` fournit `GlassView`, `GlassContainer` et surtout
`isLiquidGlassAvailable()`, à interroger avant toute option iOS 26 puisque les
specs annoncent iOS 18 minimum.

Réserve : le verre coûte du contraste. Le §8.3 exige que le restant de calories
soit lisible sans aucune interaction, et D16 fait de la lisibilité immédiate la
priorité. Verre sur le chrome, jamais sous un chiffre qui doit se lire d'un
coup d'œil.

`expo-router/unstable-native-tabs` est marqué **unstable** : à revérifier à
chaque montée de SDK, et chaque vérification coûte un cycle CI.

## Ce que la tranche 1 a établi

**Où vivent lecture et écriture.** `features/*/data/` porte deux faces :
`*-writes.ts`, fonctions transactionnelles portant les règles métier, et
`*-reads.ts`, fonctions de lecture pures. Ni l'une ni l'autre n'importe de
module natif : elles prennent la base en paramètre, typée `AppDatabase` sur
`BaseSQLiteDatabase<'sync', unknown, typeof schema>`, l'ancêtre commun à
`expo-sqlite` et `better-sqlite3`. C'est ce qui les fait tourner contre un
vrai fichier SQLite en Node, ce que D15 réclame. Corollaire : le résultat de
`.run()` est inconnu et ne se lit jamais — inutile, les identifiants étant
frappés par l'application. `*-queries.ts` habille le tout en hooks.

**Comment le bus traduit sans table de correspondance.** Chaque requête
déclare, dans son `meta`, les tables qu'elle lit, via `readsFrom(day, dayMeal)`
— les noms viennent des objets du schéma, pas de chaînes. Le bus invalide par
prédicat. Aucun site d'écriture n'énumère quoi que ce soit, et il n'y a pas un
seul `onSuccess` dans la couche de requête. Regroupement de 60 ms : le hook
SQLite se déclenche ligne par ligne, et loguer un repas sur une journée
virtuelle en écrit six.

Deux conséquences assumées : le hook se déclenche **pendant** une transaction,
y compris une qui sera annulée, donc le bus peut invalider sur une écriture
qui n'a pas eu lieu — coût : un rafraîchissement pour rien, jamais un chiffre
faux.

**La matérialisation n'est jamais une opération publique.** `ensureMaterialized`
n'est pas exporté. Elle est la première instruction, dans la même transaction,
de chaque écriture qui peut porter sur une journée virtuelle. Appelable seule,
un arrêt forcé entre elle et l'action qui la justifie laisserait une journée
vide matérialisée — de la donnée créée par consultation, ce que le §8.2
interdit. Les repas se désignent **par position**, pas par identifiant : sur
une journée virtuelle ils n'en ont pas.

**Les repas par défaut sont en code**, dans `features/nutrition/domain/day-plan.ts`.
Le §8.2 suppose qu'un modèle existe toujours et aucun n'existe avant la
tranche 5 : c'est un trou de spécification, comblé par une liste de repli.
`day.template_id_snapshot` reste `NULL`, ce qui évitera tout changement de
schéma tranche 5.

**La saisie libre tient sans cas particulier — dans les agrégations.** Une
somme de macros s'écrit sans aucune clause filtrant les feuilles et reste
juste : un parent groupé porte `NULL`, `SUM` l'ignore. Les cas particuliers
sont strictement d'affichage : ne pas écrire « 100 g », ne pas proposer de
champ quantité.

## Points ouverts après la tranche 1
- **Vérification iPhone en attente** : le code est complet, typé, testé et
  bundlé, mais rien de l'interface n'a tourné sur l'appareil.
- L'heure de bascule de la journée n'est **pas lue** : `currentLocalDate()`
  utilise le défaut de minuit. Son réglage et sa lecture arrivent tranche 7.
- Pas d'anneau de progression : il réclame `react-native-svg`, dépendance
  native que le §7 place avec les primitives graphiques de la tranche 7. Sans
  objectif avant la tranche 5, ce serait un cycle CI pour un cercle vide.
- **Hypothèse signalée** : le §5.1 parle d'un écart kcal de 10 % sans nommer le
  dénominateur. La valeur théorique est retenue. Faux positif connu et sans
  remède dans les specs : l'alcool fait 7 kcal/g et n'est pas une macro suivie,
  donc un verre de vin déclenchera toujours l'avertissement. Non bloquant.
- Arbitrage des gestes entre le balayage d'une rangée et celui du jour : le
  plus interne gagne. Le balayage du jour est un carrousel qui suit le doigt ;
  celui d'une rangée ne suit pas encore le doigt, il décide au relâchement.
  À unifier si l'écart se sent.
- `day_meal` n'a pas de contrainte d'unicité sur `(date, position)` là où
  `food_portion` en a une sur `(food_id, name)`. Rigueur inégale du §2.3,
  suivie telle quelle.
- Le taux d'adhérence de la tranche 7 devra compter les journées **ayant au
  moins une entrée**, pas les journées matérialisées : une journée vidée de
  ses entrées reste matérialisée, l'utilisateur ayant bien agi dessus.

## Points hérités de la tranche 0, toujours ouverts
- Où vit le sélecteur segmenté de l'onglet Entraînement, une fois qu'il
  composera Musculation et Activités (tranche 10). L'écran est provisoirement
  dans `features/strength`.
- ~~Les en-têtes natifs.~~ **Résolu.** Un groupe `app/(tabs)/(journal)/`
  n'ajoute aucun segment de chemin : l'écran reste la route index du groupe
  d'onglets et gagne un `Stack` natif. L'icône de bibliothèque du §7 s'y
  posera tranche 3.
- Le dossier de sauvegardes s'appelle `backups`, en anglais comme le code,
  alors qu'il est visible dans l'app Fichiers.
- `src/core/db/version-guard.ts` et `database-gate.tsx` ne figurent pas dans
  l'arborescence du §3 : G3 exige un refus de démarrage avec message, il lui
  faut un porteur. S'y ajoutent `core/db/database.ts`, `app-database.ts`,
  `change-bus.ts` (celui-ci prévu au §3), `core/id/`, `core/format/` et
  `core/query/`.
