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
Tranches 0, 1 et 2 livrées et vérifiées sur l'iPhone. **Tranche 3 (base
d'aliments personnelle) écrite, typée, testée et bundlée — rien de son
interface n'a encore tourné sur l'appareil.**

**Attention, base de départ.** La tranche 2 vit sur `tranche-2-export`, poussée
sur `origin`, **jamais fusionnée sur `main`** au 12/09/2026 : `main` est resté
au merge de la tranche 1. `tranche-3-food` part donc de `tranche-2-export` et
non de `main`. À fusionner dans l'ordre.

**Le filet existe.** Depuis le 12/09/2026, l'aller-retour export / import est
vérifié de bout en bout sur l'appareil : export depuis la quotidienne, sortie
par la feuille de partage, import dans la dev, mêmes chiffres. Les refus
d'archive, la survie de la base après un refus, et le nettoyage d'un import
interrompu le sont aussi.

**Le numéro de version du format d'export est figé à 1, pour toujours.** Dès
qu'un export réel existe, la version 1 doit rester lisible : sinon l'archive
est morte, et l'export est l'unique filet du projet.

**Le schéma est gelé. Ajout seul désormais (D6/G2).** La migration initiale
n'a jamais été dégelée : `0001_journal` a été ajoutée à côté, puis `0002_food`.
Réécrire `0000` aurait changé son horodatage, fait voir une migration en
attente à l'installation quotidienne, qui aurait tenté de recréer `setting` et
échoué au démarrage. Le dégel servait à corriger `0000` ; `0000` n'avait rien à
corriger.

Divergence assumée et validée avec le §2.3, qui pose ses ensembles de valeurs
en commentaires : `journal_entry.kind` et `base_unit` portent de vraies
contraintes `CHECK`. SQLite ne permet pas d'en ajouter une plus tard sans
reconstruire la table, et la tranche 2 importera du JSON arbitraire dedans.

**La règle qui décide du contenu d'une migration, posée en tranche 3 :** une
migration porte ce qui ne peut pas être ajouté plus tard, et diffère ce qui le
peut. SQLite sait `ALTER TABLE ADD COLUMN` (nullable, ou `NOT NULL` avec
défaut) et `CREATE` / `DROP INDEX` à volonté ; il ne sait pas ajouter une
`CHECK` ni une clé étrangère sans reconstruire la table.

Corollaire utile quand l'enjeu paraît maximal : **les index ne sont pas
irréversibles.** Seules les tables, leurs colonnes `NOT NULL` sans défaut,
leurs `CHECK` et leurs FK le sont.

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

**Et la règle a une conséquence non évidente, trouvée en tranche 3 : pour qu'une
bande du haut lise comme la même feuille de papier que le contenu, il ne faut
surtout pas la peindre — il faut `headerTransparent`.**

Peindre l'en-tête en `colors.background` donne la bonne couleur et tue l'effet.
Le rendre transparent donne la bonne couleur *parce que c'est littéralement la
même surface* — le fond de la page se voit à travers — et le contenu continue
de défiler dessous. Piège d'ordonnancement : `headerTransparent` ne vide le
fond que si `headerStyle` n'en impose pas un, donc il ne doit y avoir **aucun**
`backgroundColor` à côté.

Ce qui garde le titre lisible une fois du contenu dessous dépend de l'OS, et la
documentation prévient que les deux se superposent si on pose les deux :
- iOS 26 estompe le contenu au bord lui-même — `scrollEdgeEffects: { top }` ;
- avant, c'est un flou derrière la barre — `headerBlurEffect`.

Le conditionnel suit le précédent de la barre d'onglets : interroger
`isLiquidGlassAvailable()` avant de demander un comportement iOS 26. Posé une
fois par pile, dans `app/(tabs)/(journal)/_layout.tsx` et `app/_layout.tsx`.

Ça repose sur `contentInsetAdjustmentBehavior="automatic"` dans chaque écran —
c'est la combinaison que `react-native-screens` prévoit — pour que le contenu
commence **sous** la barre et non **derrière** elle.

`headerShadowVisible: false` complète : c'est le filet de séparation, plus
encore que la couleur, qui fait que deux surfaces ont l'air d'être deux.

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

> **Le mécanisme a fonctionné.** `0002_food` a fait passer quatre tests au
> rouge d'un coup — le classement des tables, l'ordre d'export, les tags
> restant à appliquer, et l'inventaire du round-trip contre `PRAGMA
> table_info`. Deux n'avaient pas été prévus. Et l'archive tranche 2 s'importe
> **sans une ligne de code en plus** : `introducedIn: '0002_food'` suffit, la
> comparaison portant sur la position dans le journal.

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

## Ce que la tranche 3 a établi

**Toute colonne doit se réduire à un scalaire JSON — dans tout le schéma, pour
toujours.** L'exporteur lit les colonnes directement sur les objets Drizzle et
**lève** sur ce qui n'est ni une chaîne, ni un nombre fini, ni `null`. Donc les
mappages `mode` de Drizzle sont exclus partout : `mode: 'boolean'` rendrait
`true`/`false`, `mode: 'timestamp'` une `Date`, et chaque export planterait dès
la première ligne concernée. `is_favorite` est un `integer` typé `0 | 1`, pas
un booléen. Découvert en lisant `export-payload.ts` avant d'écrire la colonne,
pas après ; ça mordra en tranche 8 (poids) et 11 (séances).

**`source` vaut `'perso' | 'off'`, et ce n'est pas un arbitrage.** Les
documents tranchent : le §6 des specs **s'ouvre en se déclarant « description
conceptuelle, non normative »**, le schéma normatif étant celui de
l'architecture. Le §6.1 n'a donc pas autorité sur les valeurs stockées, et son
`openfoodfacts` ne s'applique pas. `off` est aussi déjà l'orthographe du projet
partout : `off_cache` (§2.4), `features/nutrition/off/` (§3). Un test refuse
explicitement `openfoodfacts` à l'import, pour que la décision ne soit pas
reprise en silence par qui relira le §6.1.

**Où l'on pose une CHECK, et où l'on refuse d'en poser une.** La ligne n'est
pas la probabilité qu'un ensemble bouge, c'est **ce qu'un élargissement
casserait** :
- `kind` et `base_unit` en portent une : élargir `kind` casse l'invariant
  d'agrégation — le `SUM` sans clause ne tient que parce que l'ensemble est
  fermé — et élargir `base_unit` casse l'étanchéité du §5.1.
- `food_portion.name` n'en porte **aucune** : élargir le vocabulaire des
  portions ne casse rien, c'est une étiquette avec un nombre à côté. La liste
  fermée du §6.1 est tenue par une règle `one_of` du catalogue d'export,
  appliquée **avant la première insertion**, qui nomme table, ligne et colonne
  au lieu de citer une contrainte. D7 veut un fichier réparable à la main : ici
  la CHECK serait la barrière **faible**.

**Aucune CHECK sur les macros, et c'est un refus.** Le §8.5 exige que les
valeurs Open Food Facts soient *signalées et éditables*, jamais refusées, et la
tranche 4 copie automatiquement en base tout produit logué. Une
`CHECK (protein_100 >= 0)` transformerait une anomalie signalable en échec
d'INSERT sur ce chemin de copie — un parcours bloqué là où les specs demandent
un marquage non bloquant.

**`journal_entry.source_food_id` n'a pas de clé étrangère, et ne pouvait pas en
avoir.** Un cascade détruirait l'historique, un restrict bloquerait une
suppression que le §5.3 dit n'être jamais bloquée — et de toute façon la table
est gelée depuis `0001`, or SQLite n'a pas d'`ALTER TABLE ADD CONSTRAINT`.
`ON DELETE SET NULL` était le seul candidat non absurde : refusé, il effacerait
la seule trace reliant l'entrée à ce qu'elle fut. Conséquence actée : la
barrière 3 de l'import ne verra jamais une entrée pointant vers un aliment
supprimé. C'est la spécification, pas un trou.

**La liste fermée des portions est déclarée une fois, en données.**
`PORTION_NAMES` est un tableau `as const` dans le module de schéma, et le type
en est **dérivé**. Une union de littéraux ne se parcourt pas à l'exécution :
la paire type + tableau devrait être tenue à la main, et l'endroit où elle
dériverait est le validateur d'import. (`kind` et `base_unit`, plus anciens,
portent encore la duplication — voir les points ouverts.)

**`display_ref_qty` est clôturée, et la clôture est testée.** Ce n'est pas une
donnée dérivable : c'est une entrée capturée, ce que D9 déclare légitime. Le
risque est l'inverse — que quelque chose se mette à dériver *d'elle*. Deux
fonctions seulement la multiplient, `toCanonical` et `fromCanonical`, toutes
deux à la frontière d'affichage ; `food-reads.ts` rend toujours les macros pour
100 ; rien dans `macros.ts` ne l'accepte en argument. **Et un test la rend
falsifiable : changer `display_ref_qty` sur un aliment et vérifier que tous les
totaux du journal sont identiques.**

**`ix_food_name` n'achète pas la recherche, et il faut le savoir.**
`LIKE '%x%'` n'utilise aucun index, jamais ; même en préfixe celui-là serait
ignoré, SQLite n'appliquant son optimisation LIKE que si la collation de
l'index correspond au réglage `case_sensitive_like`, qui est *off* par défaut.
Il sert le `ORDER BY`, en `COLLATE NOCASE` pour qu'« abricot » ne se classe pas
après toutes les majuscules. À l'échelle du §D16 (quelques centaines de lignes)
il n'achète rien de mesurable ; il existe parce que le §2.2 est normatif et
qu'un index se laisse supprimer.

**La recherche est une fonction pure sur une liste en cache.** Zéro SQL par
frappe, ce que le §8.4b demande, et le seul moyen d'ignorer les accents :
`NOCASE` et `lower()` de SQLite sont ASCII seuls, et une colonne repliée serait
de la donnée dérivée stockée (D9). Le repli passe par `normalize('NFD')` quand
le moteur le sait, et par une table sinon — **Hermes n'est pas Node et peut
très bien ne pas porter les tables de normalisation Unicode**. La stratégie est
injectable et les deux chemins sont comparés lettre par lettre, parce que Node
prend toujours le premier : sans ça, la branche qui tournera sur l'iPhone
serait la seule ligne non testée du chemin critique.

**Les portions sont remplacées en bloc, pas réconciliées ligne à ligne.**
`ux_portion_food_name` est unique sur `(food_id, name)` : échanger deux noms en
une édition fait collisionner toute mise à jour séquentielle sur celle qu'elle
écrit en premier. Les alternatives — renommage en deux temps, analyse de la
permutation — sont de la machinerie au service d'identifiants que **rien ne
référence** : une entrée fige le nom et la taille de la portion dans ses
propres colonnes. Les laisser changer fait disparaître le cas.

**Le pré-remplissage : quatre temps, et c'est le quatrième cas qui lui donne sa
forme.** Dernière entrée → même quantité en unité de base si ses termes ne
tiennent plus → `display_ref_qty` → 100. Si une tranche valait 25 g quand
« 2 tranches » a été logué et vaut 30 g aujourd'hui, **la taille figée gagne** :
reproposer « 2 tranches » écrirait 60 g pour une habitude à 50 g, sur l'écran
dont tout le rôle est d'être validé sans être lu. 50 g n'est pas une réponse
dégradée, c'est ce qui a été mangé.

**« Dernière » veut dire dernière *enregistrée*.** L'index normatif est
`(source_food_id, created_at)`, pas `date` : loguer ce matin le déjeuner d'hier
en fait le pré-remplissage. Lu sur l'index, pas deviné. Et comme `created_at`
est **nullable** dans le schéma gelé, le tri ajoute `id` : SQLite classe les
`NULL` en dernier sur un ordre descendant et rendrait donc la ligne la plus
*ancienne*. Les ULID étant triables par date de création, `id` est à la fois
départageur et repli.

**Une quantité stockée est toujours en unité de base.** Jamais un nombre de
portions. `readDayTotals` somme `quantity * protein_100 / 100.0` sans aucune
clause ; si `quantity` pouvait valoir 2 pour deux tranches, ce total serait faux
de façon *plausible*. `portion_name` et `portion_quantity` enregistrent comment
l'utilisateur l'a exprimé — exactement le statut de `display_ref_qty`.

**La bibliothèque vit dans le stack du Journal**, `app/(tabs)/(journal)/library/`,
et non à la racine comme le dessine le §3. Poussée depuis la racine elle serait
sœur de `(tabs)` et recouvrirait la barre d'onglets, emportant la minimisation
iOS 26 — alors que le §7 la décrit comme un endroit où le Journal mène. Une
règle en sort, valable pour toute la suite : **consulter est un empilement,
ajouter est une modale.**

**L'étape de quantité est un état de la modale d'ajout, pas une seconde
modale.** D16 budgète 0,2 s entre le choix d'un aliment et l'écran de quantité,
et le critère de sortie est deux touchers : échanger le contenu d'une modale
déjà à l'écran coûte un rendu, en présenter une seconde coûte une animation et
un second congédiement au retour. `(modals)/quantity` existe quand même comme
route — le §3 la demande — et sert quand on touche une entrée déjà loguée.

**En édition, l'aliment n'est jamais relu pour ses macros.** L'entrée est une
capsule fermée (D5/R1) : corriger « 60 g et non 50 » ne doit pas adopter au
passage des macros éditées depuis. L'aliment n'est consulté que pour les
portions qu'il propose aujourd'hui.

### Deux pièges d'interface, établis par l'échec sur l'appareil

**`autoFocus` + `selectTextOnFocus` ne sélectionnent rien quand la valeur
arrive d'une requête.** `autoFocus` se déclenche **au montage**, or à cet
instant le champ est vide : le pré-remplissage vient de React Query et arrive
un tick plus tard. `selectTextOnFocus` sélectionne donc consciencieusement une
chaîne vide, puis la valeur apparaît avec le curseur là où iOS l'a laissé —
pré-rempli mais pas sélectionné, ce qui coûte un toucher pour effacer et fait
tomber tout le levier du §8.4.

Remède : **pas d'`autoFocus`**, et focaliser depuis l'effet qui pose la valeur,
dans une `requestAnimationFrame` — le focus place lui-même le curseur, donc une
sélection posée dans le même tick est écrasée. `selectTextOnFocus` reste, pour
tous les touchers **ultérieurs** sur le champ. On retombe alors dans le cas où
il fonctionne : focaliser un champ **déjà rempli**.

**Un `fullScreenModal` n'a aucune sortie par défaut.** C'est la racine de sa
propre présentation : la pile native ne lui dessine pas de bouton retour, et
iOS n'offre pas le glissement vers le bas d'une feuille. Un `headerLeft` vide y
signifie « écran dont on ne sort qu'en le complétant ». La saisie libre vivait
ainsi depuis la tranche 1 sans que ça se voie, parce que « Ajouter » et
« Supprimer » ferment tous les deux : **annuler était simplement impossible.**
`core/ui/header-text-button.tsx` porte la sortie des trois modales.

Corollaire pour l'étape de quantité, qui est un **état** et non une route
poussée (D16 budgète 0,2 s pour y arriver) : le navigateur ne lui donne aucun
retour non plus, et il faut le déclarer à la main. Sans lui, se tromper
d'aliment obligeait à fermer la modale et recommencer — trois touchers pour en
annuler un.

**Divergence assumée avec le §8.3, demandée : plus de boutons précédent /
suivant.** Le §8.3 demande trois façons de changer de jour — boutons, accès
direct à une date, balayage horizontal. La barre porte désormais le jour à
gauche et deux icônes à droite (calendrier, bibliothèque) ; les deux autres
voies restent. Le balayage était déjà le geste principal, et les chevrons le
doublaient. **À rouvrir si naviguer au clavier ou à l'accessibilité s'avère
pénible** : un balayage n'a pas d'équivalent VoiceOver, là où un bouton en a un.

**Le calendrier est une fenêtre ancrée, pas une feuille.** Elle naît du bouton
et s'y replie, ce qui n'est vrai que si elle part de là où le bouton est
réellement : la position dépend de la zone sûre et de la hauteur de barre, deux
nombres qui seraient devinés et faux sur un téléphone sur trois. Le bouton est
donc **mesuré** au moment du toucher (`measureInWindow`) et la fenêtre reçoit
son rectangle. `transformOrigin: 'top right'` fait le reste : grandir depuis un
coin est ce qui la fait venir d'un point plutôt que de son propre milieu.

Et l'animation de fermeture vit **dans** la fenêtre, pas chez l'appelant :
toutes les sorties — les deux boutons, choisir une date, le balayage, le fond —
doivent jouer la même animation avant que la modale soit démontée. Si le parent
basculait `visible` à `false`, React l'arracherait de l'écran en plein vol.

## Points ouverts après la tranche 3
- **Vérification iPhone en cours.** Première passe faite : l'application
  démarre, la migration `0002` s'applique, et deux défauts ont été trouvés et
  corrigés — le chiffre pré-rempli non sélectionné, et l'absence de sortie des
  modales (voir « deux pièges d'interface » ci-dessus). Restent à confirmer :
  que la sélection tient maintenant, que la recherche trouve « crème » depuis
  « creme » (c'est-à-dire que Hermes porte `String.prototype.normalize`, ou que
  le repli prend la main), et que l'en-tête du Journal à deux icônes par côté
  ne serre pas.
- **Hypothèse signalée** : `String.prototype.normalize` sur Hermes. Sonde
  écrite, repli écrit, les deux testés en Node — mais lequel s'exécute sur
  l'appareil ne se sait qu'en le regardant.
- Depuis l'écran d'ajout, « Saisie libre » fait un `router.replace` : le retour
  ramène au Journal, pas à l'accès rapide. Choisi pour ne pas empiler deux
  modales plein écran et garder un congédiement unique. À revoir si le
  demi-tour manque à l'usage.
- `kind` et `base_unit` dupliquent encore leur ensemble de valeurs entre le
  type TypeScript et le tableau `one_of` du catalogue. `PORTION_NAMES` montre
  la forme correcte — données d'abord, type dérivé. Non corrigé : ce serait
  toucher du code livré sans autre motif que la cohérence.
- **Hors périmètre, décidé** : les repas récents du §8.4a (le §7 cadre la
  tranche 3 sur les aliments ; ils iront en tranche 5, où un repas a un sens),
  le seuil « au-delà de 900 kcal pour 100 g » du §8.5 (écrit pour le parcours
  Open Food Facts), et `barcode` avec son index unique partiel — nullable, sans
  CHECK, sans utilisateur avant le scan, donc ajoutable par `ALTER TABLE` en
  tranche 4.
- L'avertissement d'écart kcal de 10 % est maintenant devant l'utilisateur dans
  l'éditeur d'aliment. Le dénominateur reste la valeur théorique et l'alcool
  reste un faux positif structurel (voir tranche 1). Nouveau et gratuit : un
  test fixe que l'écart est **invariant d'échelle**, donc saisir les macros pour
  30 g ou pour 100 g donne le même verdict.

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
  suivie telle quelle — et `food_portion` n'en a pas non plus sur
  `(food_id, position)`, même inégalité, même choix.
- Le taux d'adhérence de la tranche 7 devra compter les journées **ayant au
  moins une entrée**, pas les journées matérialisées : une journée vidée de
  ses entrées reste matérialisée, l'utilisateur ayant bien agi dessus.

## Points hérités de la tranche 0, toujours ouverts
- Où vit le sélecteur segmenté de l'onglet Entraînement, une fois qu'il
  composera Musculation et Activités (tranche 10). L'écran est provisoirement
  dans `features/strength`.
- ~~Les en-têtes natifs.~~ **Résolu.** Un groupe `app/(tabs)/(journal)/`
  n'ajoute aucun segment de chemin : l'écran reste la route index du groupe
  d'onglets et gagne un `Stack` natif. ~~L'icône de bibliothèque du §7 s'y
  posera tranche 3.~~ **Posée**, à gauche à côté du chevron, et c'est ce même
  `Stack` qui accueille la bibliothèque.
- Le dossier de sauvegardes s'appelle `backups`, en anglais comme le code,
  alors qu'il est visible dans l'app Fichiers. La tranche 2 y ajoute les copies
  manuelles sous `suivi-copy-`, en anglais par cohérence plutôt que par
  conviction : le point reste ouvert, et le trancher renommera les deux.
- `src/core/db/version-guard.ts` et `database-gate.tsx` ne figurent pas dans
  l'arborescence du §3 : G3 exige un refus de démarrage avec message, il lui
  faut un porteur. S'y ajoutent `core/db/database.ts`, `app-database.ts`,
  `change-bus.ts` (celui-ci prévu au §3), `core/id/`, `core/format/` et
  `core/query/`, puis, depuis la tranche 2, `core/db/staging.ts` et
  `core/db/database-files.ts`. La tranche 3 y ajoute une divergence d'un autre
  ordre, parce qu'elle déplace quelque chose que le §3 nomme : la bibliothèque
  passe de `app/library/` à `app/(tabs)/(journal)/library/`, motif écrit
  plus haut.
