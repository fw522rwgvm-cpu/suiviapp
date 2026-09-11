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
Tranches 0, 1 et 2 livrées et vérifiées sur l'iPhone. Tranche 3 (base
d'aliments personnelle) à venir.

**Le filet existe.** Depuis le 12/09/2026, l'aller-retour export / import est
vérifié de bout en bout sur l'appareil : export depuis la quotidienne, sortie
par la feuille de partage, import dans la dev, mêmes chiffres. Les refus
d'archive, la survie de la base après un refus, et le nettoyage d'un import
interrompu le sont aussi.

**Le numéro de version du format d'export est figé à 1, pour toujours.** Dès
qu'un export réel existe, la version 1 doit rester lisible : sinon l'archive
est morte, et l'export est l'unique filet du projet.

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

Séquence de démarrage, normative, **cinq étapes depuis la tranche 2** :
ouvrir et poser les PRAGMA → refuser si la base est plus récente (G3) →
supprimer la base d'accueil d'un import interrompu (D7) → sauvegarder (G1) →
migrer.

Le refus précède tout. Le nettoyage vient après lui et pas avant : le fichier
résiduel peut avoir été écrit par le binaire même que G3 refuse, et le
supprimer depuis un binaire plus ancien détruirait une preuve, voire un import
à moitié bâti que le plus récent pourrait finir.

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

## Ce que la tranche 2 a établi

**La version de format versionne l'enveloppe, jamais le contenu.** La version 1
veut dire : un objet en-tête, plus un dictionnaire « nom de table → tableau de
lignes », clés = noms de colonnes SQL, valeurs = scalaires JSON. Ajouter une
table ne la bouge pas. Ajouter une colonne ne la bouge pas. Elle ne bougerait
que si la forme changeait — compression, NDJSON, ingrédients imbriqués sous
leur recette. Sinon elle passerait à 2 en tranche 3, 3 en tranche 5, et
atteindrait 8 à la fin de la V3 sans rien signifier, chaque incrément étant une
occasion d'orpheliner une archive. Le contenu est couvert par le tag de
migration, qui a déjà un ordre total et dont la table de correspondance est
déjà générée : `meta/_journal.json`.

**Les clés du JSON sont les noms SQL, en `snake_case`.** Le fichier est un
artefact de base de données : il doit se lire à côté d'un `.schema` quand on le
répare à la main, ce que D7 invoque pour refuser la compression. Corollaire
gratuit : renommer une propriété Drizzle est un refactor pur qui n'invalide
aucune archive.

**Le catalogue de tables est dérivé du schéma, jamais réécrit.** Colonnes,
types, `notNull`, `hasDefault` et clés primaires viennent de `getTableColumns`.
Un test exige que toute table du schéma soit exportée **ou** explicitement
exclue : quand `food` arrivera tranche 3, la CI passera au rouge tant que
personne n'aura tranché. C'est ce qui fait vieillir la tranche correctement.
`off_cache` figure déjà dans les exclusions, avec son motif, avant d'exister.

**Compatibilité ascendante, que D7 ne traite pas.** Une archive écrite à `0000`
n'a pas de clé `journal_entry`, et ce n'est pas de la corruption : la table
n'existait pas. Chaque table est donc datée par la migration qui l'a créée, et
l'absence n'est un problème que si l'archive lui est postérieure. Un cran plus
bas, pour les colonnes, c'est SQLite qui fournit le raisonnement : `ALTER TABLE
ADD COLUMN` ne peut pas ajouter une colonne `NOT NULL` sans défaut, donc une
colonne absente qui est nullable ou défautée vient d'une archive ancienne, et
une colonne absente `NOT NULL` sans défaut vient d'une ligne cassée.

**Archive plus ancienne : restaurer à son schéma, puis migrer.** Plutôt que
bâtir directement au schéma courant, parce que D6 pose que chaque migration
embarque son remplissage de données dans la même transaction — bâtir au schéma
courant le jette, et une colonne ajoutée tranche 5 avec un calcul de reprise
atterrirait sur son défaut, en silence. Et parce que rejouer des migrations sur
une base peuplée est déjà le chemin testé : c'est G4.

**`zod` n'a pas été ajouté, et c'est une décision.** La charge utile n'est pas
étrangère : ses colonnes sont déjà décrites par les objets Drizzle. Un schéma
zod serait une seconde déclaration du même schéma, maintenue à la main, libre
de diverger de la première — dans le validateur de l'unique filet. Il arrive
tranche 4, pour Open Food Facts, où la charge utile est vraiment étrangère.

**`expo-document-picker` n'a pas été ajouté non plus.** `File.pickFileAsync`
d'`expo-file-system` 57 ouvre le même sélecteur iOS et rend une copie
temporaire. Une dépendance native de moins, pour toujours.

**`expo-sharing` n'est pas déclaré dans `plugins`.** Son `app.plugin.js` est
`withShareExtension` : il ajoute une **cible d'extension de partage** iOS, pour
recevoir des fichiers. Avec un compte Apple gratuit et SideStore, une cible de
plus veut dire un second identifiant et un second profil. `shareAsync` n'en a
pas besoin : le module natif est autolinké par `expo-module.config.json`.

**La bascule ne redémarre pas l'application, et c'est vérifié sur l'appareil.**
`backupDatabaseSync` est l'API de sauvegarde en ligne de SQLite : elle copie
page à page vers une connexion **déjà ouverte**. L'objet `SQLiteDatabase`,
l'instance Drizzle et l'abonnement du bus survivent tous. Aucune dépendance du
§5 ne sait redémarrer une application, donc c'était la seule voie praticable.

Le doute portait sur une destination en WAL ouverte avec
`enableChangeListener` : la contrainte que SQLite documente porte sur la taille
de page, identique ici, mais un raisonnement n'est pas une observation. Levé le
12/09/2026 — export complet de la quotidienne importé dans la dev, mêmes
chiffres, sans redémarrage. **Les deux replis envisagés n'ont pas servi et ne
sont pas écrits.**

**Mais le hook de mise à jour ne voit rien de cette bascule** : il réagit aux
lignes, la sauvegarde écrit des pages. Le bus resterait muet pendant que chaque
écran affiche la base qu'on vient de jeter. D'où `announceFullReplacement()`,
**deuxième entrée nommée du bus** plutôt qu'une invalidation au site d'import :
la règle interdit qu'un site d'écriture énumère des clés, or un remplacement
intégral n'énumère rien, il dit « tout ».

**`PRAGMA foreign_keys` est silencieusement ignoré dans une transaction.**
SQLite le documente et ne lève pas. Le basculement encadre donc la transaction
de remplissage au lieu d'y vivre. À l'envers, l'import échouerait sur la
première ligne enfant avec une erreur nommant une contrainte. Les FK sont
coupées parce que `journal_entry` se référence elle-même : aucun ordre de
lignes ne peut satisfaire toutes les lignes à l'insertion.

**Insertion par paquets de 900 variables.** `SQLITE_MAX_VARIABLE_NUMBER` vaut
32766 sur SQLite récent et 999 sur les anciens. Deux pilotes, deux plateformes :
se tromper donne un import qui marche sur l'historique d'un appareil et échoue
sur celui d'un autre.

**Ce que l'aller-retour prouve, et ce qu'il ne prouve pas.** L'égalité se mesure
contre la base **source**, lue en SQL brut — jamais contre un second export,
qui serait circulaire : un sérialiseur qui perd une colonne la perd à l'aller
et au retour, les deux fichiers concordent, la donnée est perdue.

Trou trouvé par mutation et corrigé : la première version ne voyait pas un
exporteur laissant tomber une colonne nullable, parce que les fixtures ne
remplissaient jamais `brand` et que `NULL` valait `NULL` des deux côtés.
**Une colonne sans valeur est une colonne sans test.** D'où une ligne par table
remplissant chaque colonne, et une assertion de couverture exigeant que chaque
colonne porte une vraie valeur dans au moins une ligne.

Il ne prouve **rien de la bascule** — elle est du natif `expo-sqlite` alors que
les tests sont sur `better-sqlite3`, donc la seule partie capable de détruire
la base quotidienne est exactement la partie non testée. Ni rien du transport :
fichier, feuille de partage, sélecteur, encodage.

**L'export est écrit dans le cache, pas dans Documents.** D15 pose qu'aucun
export réel ne traîne, et une archive posée dans un dossier que l'utilisateur
parcourt finira par être prise pour la sauvegarde qu'elle n'est pas.
`.gitignore` refuse `suivi-export-*.json` ; le motif `*.export.json` qui
existait ne couvrait pas ce nom.

**`last_export_at` n'est écrit qu'après fermeture de la feuille de partage**, et
c'est la limite honnête : iOS ne dit pas si le fichier a été enregistré,
seulement que la feuille s'est fermée. Plus tôt, un export annulé remettrait à
zéro le seul chiffre de l'application qui ne doit jamais tromper dans le sens
rassurant.

**« Préparer une copie » a son propre préfixe et sa propre rotation.** Même
dossier, parce que le §5.4 décrit **un** second filet. Rotation séparée, parce
que trois copies délibérées chasseraient sinon la sauvegarde pré-migration hors
de la fenêtre de trois — et celle-là est la copie que personne n'a choisi de
prendre.

## Points ouverts après la tranche 2
- **Hypothèse signalée** : `export_reminder_days` vaut 7 par défaut. Les specs
  demandent une mise en évidence « au-delà d'un délai » sans jamais donner le
  délai. 7 pour coïncider avec le cycle du certificat SideStore. C'est un
  réglage précisément pour que cette supposition se corrige sans migration.
- L'indicateur d'ancienneté se mesure en **durée**, pas en journées civiles.
  Lecture délibérée de D3 : « depuis combien de temps » est un écart entre deux
  instants. Un export à 23h50 et un coup d'œil à 00h10 sont à une journée civile
  et à vingt minutes d'écart ; vingt minutes est la réponse honnête.
- `features/backup/domain/` et la paire `run-export.ts` / `run-import.ts` /
  `swap.ts` ne figurent pas dans l'arborescence du §3, qui ne détaille pas
  `backup/`. Le découpage suit celui que la tranche 0 avait déjà fait dans
  `core/db` : pur d'un côté, natif de l'autre.
- `core/db/database-files.ts` non plus. Il isole les noms de fichiers pour que
  la seule propriété qui compte absolument soit testable : aucune routine de
  nettoyage ne nomme jamais la vraie base.

## Points ouverts après la tranche 1
- ~~Vérification iPhone en attente.~~ **Résolu :** tranche 1 vérifiée sur
  l'appareil.
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
  alors qu'il est visible dans l'app Fichiers. La tranche 2 y ajoute les copies
  manuelles sous `suivi-copy-`, en anglais par cohérence plutôt que par
  conviction : le point reste ouvert, et le trancher renommera les deux.
- `src/core/db/version-guard.ts` et `database-gate.tsx` ne figurent pas dans
  l'arborescence du §3 : G3 exige un refus de démarrage avec message, il lui
  faut un porteur. S'y ajoutent `core/db/database.ts`, `app-database.ts`,
  `change-bus.ts` (celui-ci prévu au §3), `core/id/`, `core/format/` et
  `core/query/`, puis, depuis la tranche 2, `core/db/staging.ts` et
  `core/db/database-files.ts`.
