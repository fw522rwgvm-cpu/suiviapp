# Règles du projet

## Documents de référence
- `specs_v2_2.md` — fonctionnel, fait autorité
- `architecture_v1_0.md` — technique, décisions D1 à D16, fait autorité

Toute divergence avec ces documents est un bug.

**Depuis le 12/09/2026 : une demande qui diverge des documents modifie les
documents.** Ils sont normatifs, donc on les tient à jour plutôt que de laisser
une divergence vivre dans le code — c'était l'erreur à éviter, et accumuler des
« divergences assumées » dans ce fichier y menait tout droit. La modification
est **signalée**, jamais silencieuse, et consignée : `specs §14.4`,
`architecture §9`. Quand une demande contredit une décision structurante, on le
dit avant de l'appliquer, puis on l'applique.

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
- Import du baril `@/core/theme` depuis un module que la suite Node atteint —
  `data/`, `domain/`, `dev/`. Il réexporte `ThemeProvider`, donc `react-native`,
  dont l'`index.js` est du Flow que rolldown refuse de parser : dix-sept
  fichiers de test rougissent d'un coup sur une erreur qui ne parle pas de
  thème. Viser `@/core/theme/tokens`, qui est pur.

## Règles structurantes
- Une date civile est `TEXT AAAA-MM-JJ`. Un instant est un entier epoch ms.
  Un instant ne détermine jamais l'appartenance à une journée.
- Les macros sont stockées pour 100 unités de base.
- Une entrée de journal fige la référence et la quantité, jamais le total.
- Seules les lignes sans enfant portent des macros.
- Une quantité stockée est en unité de base. **Une seule exception, et elle
  n'en est une que parce que la ligne ne porte aucune macro** : le parent d'un
  bloc groupé, dont la quantité dit combien de la recette a été mangé.
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
Tranches 0 à 11 livrées. La tranche 9 (notifications) **clôt la V2** ; les
tranches 10 (exercices et routines) et 11 (séance en direct) **ouvrent la V3**.
**1645 tests verts** sous les trois fuseaux, `tsc` vert, bundle produit.

**La tranche 11 ne demande AUCUN cycle CI, et c'est vérifiable avant de
commencer** : aucune dépendance n'entre. `expo-notifications` est dans le
binaire depuis la tranche 9 — prouvé, pas déduit, une notification a été reçue
le 15/09 — `react-native-svg` depuis `dev-b19`. Les dessins d'exercices sont
des chaînes de chemins dans un module TypeScript, le mécanisme de
`paths.generated.ts` : du JavaScript. Metro suffit.

**Le bundle JavaScript passe de 6,3 à 7,0 Mo, et 876 exercices tiennent dans
ces 0,7 Mo.** Les photographies sont des **assets** — 30,8 Mo dans
`dist/assets`, que Hermes n'analyse jamais. La première version inlinait 32 SVG
et coûtait 1,2 Mo de bundle JS analysé à chaque démarrage à froid ; les mesures
sont dans `architecture §9.25` n° 2 et `§9.27` n° 1.

**Rien de la tranche 11 n'a tourné sur l'appareil**, et elle s'empile sur les
tranches 6, 8 et 10 qui n'y ont jamais tourné non plus.

Ce qui reste à voir est ce qu'aucun test ne couvre : **que la carte corporelle
ressemble à un corps et s'allume aux bons endroits.** Un test dit que `chest`
possède un tracé ; il ne dit pas que ce tracé traverse les pectoraux.

**Une notification locale a été reçue sur l'appareil (15/09/2026).** C'est le
premier constat de la tranche 9, et il en emporte trois autres par déduction —
signalée comme telle, puisque seul le résultat a été rapporté :

- le binaire a nécessairement été **reconstruit**, sans quoi l'écran aurait
  planté au montage faute de module natif ;
- il s'est donc **compilé et installé** avec le greffon d'entitlements
  neutralisé. C'était la réserve la plus lourde : `aps-environment` retiré au
  pré-vol ne dit rien de ce qu'un build CI produit ni de ce que SideStore
  accepte de signer. Maintenant si ;
- l'autorisation a été demandée et accordée, et une occurrence programmée par
  l'application s'est déclenchée.

**Ce que ça ne dit pas**, et qu'il faut continuer à lire comme non exercé : les
**conditions**. Qu'un rappel de pesée disparaisse quand on s'est pesé, qu'il
revienne le lendemain, et que le bilan porte les chiffres du soir et non ceux du
matin — c'est le critère de sortie, et il demande de dormir une nuit. Restent
aussi non exercées les tranches 6 et 8, qui n'ont jamais tourné sur l'appareil.

**La tranche 8 ne demande AUCUN cycle CI.** Aucune dépendance n'entre :
`react-native-svg`, `d3-scale` et `d3-shape` sont dans le binaire depuis
`dev-b19`. Donc aucune installation, donc **le piège du lockfile ne peut pas se
présenter** — pour la première fois depuis la tranche 2. `0006` arrive par
Metro comme tout le reste du JavaScript.

**Rien de la tranche 8 n'a tourné sur l'appareil**, et elle s'empile sur deux
dettes plus anciennes : la tranche 6 n'y a jamais tourné non plus, et le thème
face au chrome natif reste décidé sur une lecture de source.

**La tranche 7 a tourné sur l'iPhone** (14/09/2026), Stats compris : le binaire
`dev-b19` porte `react-native-svg`, l'onglet s'ouvre, et neuf retours d'usage
ont été traités — le code-barres saisissable, le détour du scan, le graphique
qui suit le doigt, l'objectif en récipient, l'axe rogné, les graduations
intermédiaires, le dépassement en rouge, les macros lissées, et le
dénominateur qui ne comptait pas contre la plage choisie.

**La tranche 7 demandait UN cycle CI, et un seul.** `react-native-svg` est la
seule dépendance native qui entre, elle n'est importée qu'à la dernière étape,
et **le binaire de développement doit être reconstruit avant que l'onglet Stats
ne puisse s'ouvrir**. Tout le reste de la tranche — thème, heure de bascule,
tolérance, écran À propos, les chiffres des statistiques — est vérifiable par
Metro sur le binaire actuel.

**Réserve jamais levée, et sans conséquence tant que la reconstruction précède
l'essai** : on ne sait toujours pas si importer `react-native-svg` sans son
module natif fait rougir *seulement* l'onglet Stats ou empêche l'application de
s'ouvrir. Elle n'a pas eu l'occasion de se poser — le binaire a été reconstruit
avant le premier lancement.

**La tranche 6 n'a toujours pas tourné sur l'appareil**, à deux défauts près
corrigés sur retour d'usage. La tranche 7 n'y change rien et s'empile dessus :
la vérification devra regarder les deux, et dans cet ordre.

Ce qui reste à regarder sur l'appareil, et qui n'a pas été touché :
- **le bloc groupé du Journal** — le repli, l'indent, et surtout que le tap de
  repli n'ait pas volé le balayage de suppression ;
- **les deux `SwipeBack` empilés** dans la fenêtre d'ajout ;
- **le thème face au chrome natif** : que « Sombre » sous un iOS clair peigne
  bien la barre d'onglets, les en-têtes, les molettes et les alertes. C'est le
  seul point de la tranche décidé sur une lecture de source
  (`RCTAppearance.mm`) sans jamais être observé ;
- **l'heure de bascule**, qui demande d'être devant le Journal avant l'heure
  choisie.

La tranche 5 a été éprouvée sur l'iPhone en plusieurs tours : jauge, couleurs,
icônes, police, modèles, planning, calendrier.

Tranches 0 à 4 livrées avant elle. **La tranche 4 est vérifiée sur l'iPhone,
scan compris** (13/09/2026) : le code-barres se lit, le produit arrive avec ses
macros, et la recherche sans accent est confirmée à l'usage.

L'appareil a fait remonter trois choses que rien d'autre n'aurait trouvées —
un balayage qui déclenchait le press de sa rangée (le Journal l'avait aussi),
des molettes qui tournaient en s'ouvrant, et la réserve de la tranche 3 sur le
clavier, qui s'est avérée fondée. Les trois sont traitées.

**Ce qui n'a pas été exercé, et qu'il faut lire comme tel** : les chemins
dégradés du client Open Food Facts — hors ligne, réponse illisible, quota 429 —
et la bascule vers le formulaire pré-rempli sur un produit incomplet. Ils sont
testés en Node contre un `fetch` injecté, ce qui fixe la *taxonomie* des
réponses et non qu'Open Food Facts les produise encore. Le premier qui se
présentera en usage sera le premier à être vu.

**L'aller-retour export / import avec `food` et `food_portion` est vérifié**
(13/09/2026). Le filet tient avec les tables de la tranche 3 dedans.

**Le binaire de développement doit être reconstruit avant de toucher au scan.**
`expo-camera` est la première dépendance native ajoutée depuis
`@react-native-picker/picker`, et elle porte la même conséquence : le bundle JS
ne contient pas son module natif, donc `npm run bundle:ios` reste vert pendant
que l'écran de scan plante sur l'appareil. Tout le reste de la tranche —
recherche distante, bandeau, panier, bascule vers le formulaire — est
vérifiable par Metro **sans** reconstruire. C'est pour ça que le scan est la
dernière étape : un seul cycle CI au lieu de plusieurs.

**Base de départ, résolue.** La tranche 2 a été fusionnée sur `main` le
12/09/2026 (PR #3). `tranche-3-food` partait de `tranche-2-export` et contient
donc déjà tout ce que `main` porte : une PR vers `main` se fusionne sans
conflit.

**Le filet existe.** Depuis le 12/09/2026, l'aller-retour export / import est
vérifié de bout en bout sur l'appareil : export depuis la quotidienne, sortie
par la feuille de partage, import dans la dev, mêmes chiffres. Les refus
d'archive, la survie de la base après un refus, et le nettoyage d'un import
interrompu le sont aussi.

**Le numéro de version du format d'export est figé à 1, pour toujours.** Dès
qu'un export réel existe, la version 1 doit rester lisible : sinon l'archive
est morte, et l'export est l'unique filet du projet.

**Le schéma est gelé. Ajout seul désormais (D6/G2).** La migration initiale
n'a jamais été dégelée : `0001_journal` a été ajoutée à côté, puis `0002_food`,
`0003_barcode_off_cache`, `0004_templates_planning`, `0005_recipes`,
`0006_weight`, `0007_notifications`, `0008_strength`, `0009_duration` et
`0010_session`.
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
  Remède : `rm -rf node_modules package-lock.json && npm install --ignore-scripts`.

  **Ça mord silencieusement, et ça se vérifie mal.** Tombé dessus en tranche 3
  après l'ajout du picker : la suite locale restait verte — `node_modules` était
  correct, seul le lockfile était amputé — et la CI a échoué sur `npm ci` avec
  quinze « Missing: @rolldown/binding-… from lock file ».

  **Mordu deux fois de plus en tranche 4** : après `npm install --save zod`,
  puis après `npx expo install expo-camera`. Ce n'est donc pas lié à `expo
  install` en particulier — c'est lié à TOUT mouvement de l'arbre. La règle
  pratique : après la moindre installation, compter, et si le compte est faux,
  reconstruire.

  **Cinquième morsure en tranche 7**, après `expo install react-native-svg`
  puis deux `npm install` : le compte est tombé à **zéro**, pas à un chiffre
  intermédiaire. Ce que ça ajoute au constat : la tranche 7 a groupé ses trois
  installations pour ne payer qu'une reconstruction, et ça a marché — le remède
  est le même quel que soit le nombre de mouvements. Donc **installer tout d'un
  coup, puis vérifier une fois**, plutôt qu'installer et vérifier trois fois.

  Et le contrôle évident est faux. Compter `grep -c rolldown package-lock.json`
  ou chercher les noms des liaisons trouve les **déclarations** de `rolldown`,
  qui sont toujours là. Ce qui manque, ce sont les **entrées de paquet**. Le
  seul comptage qui veuille dire quelque chose :

  ```
  grep -c '"node_modules/@rolldown/binding-' package-lock.json   # doit valoir 15
  ```

  Et la seule vérification qui vaille est celle que fait la CI :
  `rm -rf node_modules && npm ci --ignore-scripts`. `npm test` ne la remplace
  pas — il ne lit jamais le lockfile.

  **Mordu une quatrième fois en tranche 5, et cette fois tout était écrit
  ci-dessus.** `expo-font` ajoutée au `package.json`, lockfile mis à jour avec
  **`npm install --package-lock-only`** — qui résout l'arbre sans l'installer et
  laisse tomber les paquets de plateforme à tous les coups. Puis le mauvais
  `grep`, celui que le paragraphe précédent déclare faux, qui a rendu quinze
  pour quinze déclarations et zéro paquet. `npm ci` local est passé, la CI a
  échoué.

  Deux conséquences. **Ne jamais mettre un lockfile à jour autrement que par un
  vrai `npm install`.** Et savoir qu'un piège est documenté ne suffit pas : la
  seule chose qui l'attrape est de rejouer la commande de la CI, pas de compter
  quoi que ce soit.
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

**L'implémentation de référence est dans `node_modules`, et elle tranche.**
`ReanimatedSwipeable` de gesture-handler est le balayage de rangée que tout le
monde utilise, il est livré avec une dépendance déjà présente, et il se lit.
Trois de ses choix ne se devinent pas, et les trois ont été trouvés après coup,
en cherchant pourquoi une rangée répondait à droite et pas à gauche :

- **Aucun veto vertical.** Poser `failOffsetY` paraît évidemment prudent et ne
  l'est pas. Un pouce qui balaie vers la gauche pivote depuis la base de la
  main : plus il part de la gauche, plus son arc monte dans les premiers
  millimètres. Le veto gagnait alors la course contre le seuil horizontal — à
  gauche seulement, jamais près du pouce. Un glissement vertical se laisse à la
  `ScrollView`, qui le réclame de toute façon la première.
- **Dix points pour réclamer le toucher, pas vingt.** C'est la différence entre
  une rangée qui répond et une rangée sur laquelle il faut insister.
- **Le `Pan` appartient au conteneur, qui ne bouge pas** ; seul le `Tap` va sur
  la couche translatée. Attacher le `Pan` à ce qui se déplace met la vue du
  reconnaisseur en mouvement sous le doigt.

Et un choix qui, lui, ne doit **pas** être copié : la référence active dans les
deux sens parce qu'elle porte des actions des deux côtés. Ici une seule, et
réclamer le glissement vers la droite volerait le geste de retour — qui part
précisément de ces rangées. Sens unique tant que la rangée est fermée.

Dernier point de la même famille : **un `Tap` armé seulement à l'ouverture**
plutôt qu'un `Pressable`. Mélanger le système de responder de React Native et
les gestes dans le même sous-arbre est un piège documenté, et les rangées du
Journal sont pressables — un tap toujours actif les rendrait inertes.

**Supprimer par balayage demande deux gestes, et c'est une regle, pas un
reglage.** Le premier balayage decouvre le bouton sans jamais supprimer, si
loin et si fort qu'il soit lance ; le second, ou un appui sur le bouton,
supprime. D'ou `swipe-settle.ts` : la decision est sortie du geste parce
qu'elle n'a rien a voir avec la sensation, et qu'un reglage ulterieur d'un
ressort ou d'un seuil la deferait sans que rien ait l'air faux. Elle est
testee, et elle porte un piege qui ne se voit pas : un balayage vif depuis une
rangee ouverte mais revenue vers sa position fermee est quelqu'un qui se
ravise, pas qui confirme — d'ou la condition « plus loin que la ou il a
commence ».

Corollaire applique : **plus aucune confirmation pour retirer une entree du
journal**, ni au balayage ni au bouton de l'ecran d'edition. Elle etait la
parce qu'un balayage unique supprimait ; deux gestes, avec le bouton nomme et
entierement visible entre les deux, repondent deja a la question. Le §5.3
reserve d'ailleurs l'avertissement a la seule suppression qui detruise
vraiment quelque chose — celle d'un exercice — et la suppression d'un aliment
de la bibliotheque garde la sienne parce qu'elle **apprend** quelque chose :
les entrees deja enregistrees ne changent pas.

Elle porte la directive `'worklet'` et tourne donc sur le fil d'interface.
Verifie par la methode ci-dessus, pas suppose : dans l'export lisible, elle
porte `__workletHash`, son `__closure` et son `__initData`.

**Le verre ne se fond pas par l'opacite d'un parent.** Un `GlassView` est un
`UIVisualEffectView`, et il ne s'attenue pas a travers l'opacite d'une vue
parente comme une vue ordinaire — la facon dont Apple retire un effet visuel
est de lui retirer son effet, pas de le faire disparaitre en fondu. Constate
sur l'appareil : faire se croiser deux boutons de verre entiers ne produisait
aucune transition visible, deux fois de suite.

Conclusion, valable pour toute transition entre deux etats d'un controle en
verre : **un seul bouton reste monte, et seul son contenu se croise** —
symbole et libelle, qui sont des vues ordinaires. Ce que ca ne peut pas cacher
est la largeur : rond avec un symbole seul, gelule avec un libelle, et ce
changement-la tombe en une image. La copie qui part est centree sur celle qui
arrive, pour que le rognage par le bouton soit symetrique.

**Une animation Reanimated a UNE forme qui marche ici, et il faut la copier
telle quelle.** Elle est dans `OverlayPanel` : une valeur partagée créée **à sa
valeur de départ**, **une seule écriture** dans un effet de montage, et un
worklet de style qui ne ferme sur **rien d'autre que la valeur partagée**.

Trois tentatives de fondu ont échoué avant de s'y ranger, et chacune s'écartait
d'un de ces trois points : remettre la valeur à zéro puis animer dans le même
tick ; faire alterner la valeur entre ses deux extrémités en laissant le
worklet de style fermer sur l'état React qui dit quelle extrémité veut dire
« arrivé » ; et construire l'easing côté JavaScript, qui doit alors traverser
vers l'autre runtime. Aucune des trois ne s'animait sur l'appareil.

Conséquence de conception : **une animation appartient à une vue fraîchement
montée.** Une transition entre deux états se fait donc avec un petit composant
par côté, monté pour la durée d'une transition et jamais rejoué — on le remonte
par un `key` plutôt que de lui demander de repartir en sens inverse. Sans
easing explicite, `withTiming` applique le sien, sur le fil d'interface.

**Et une animation de montage se decide PENDANT le rendu, pas dans un effet.**
Un effet tourne apres que son rendu a ete peint. Donc si c'est lui qui change
le `key` d'une vue qui doit apparaitre en fondu, le nouveau contenu est d'abord
peint sous l'ancien `key` — a pleine opacite, sans aucun fondu — et ce n'est
qu'au rendu suivant que la vue se remonte et commence a traverser. Ce que ca
donne : le changement tombe d'un coup, puis vacille. Ajuster l'etat pendant le
rendu est la reponse de React a exactement ca : la mise a jour est appliquee et
le composant rejoue avant que quoi que ce soit n'atteigne l'ecran.

Corollaire d'apparence, appris au meme endroit : **un controle qui porte deux
sens prend une taille fixe.** Le laisser se dimensionner le fait sauter de rond
a gelule en une image, sous un contenu qui met un cinquieme de seconde a
traverser — et c'est le conteneur qui saute que l'oeil lit, pas le fondu a
l'interieur.

Vérification, pas supposition : l'export lisible doit montrer le worklet du
style ne fermant que sur la valeur partagée —
`function crossFadeTsx1(){const{opacity}=this.__closure;...}` — avec son
`__workletHash`.

**Un composant qui anime une sortie doit avoir une identité par étape.**
`SwipeBack` emmène la couche qui part jusqu'au bord de l'écran **puis**
prévient : au moment où l'appelant échange son contenu, le glissement vaut
encore une largeur d'écran. Si l'étape suivante rend un `SwipeBack` à la même
position dans le même parent, React met à jour l'instance au lieu d'en monter
une neuve, la valeur partagée survit, et l'étape qui arrive naît poussée hors
de l'écran — ce qu'on voit alors est la couche de derrière.

Le bug s'est lu comme une mauvaise destination : revenir d'une correction de
ligne tombait sur la liste d'aliments. Il n'en était rien, le panier était là,
une largeur d'écran plus loin. Remettre la valeur à zéro après l'appel n'est
pas le remède — elle atteindrait l'écran une image avant que React ne commite
le nouveau contenu, et ferait clignoter l'étape qu'on vient de quitter. Un
`key` fait de la remise à zéro et de l'échange un seul commit.

**Une ombre déborde du côté où on ne la veut pas.** `shadowRadius` diffuse sur
les quatre côtés quel que soit `shadowOffset` : l'ombre de bord d'attaque d'une
couche qui glisse remonte donc au-dessus d'elle, et sous un en-tête transparent
elle se lit comme une salissure en travers des boutons. La rogner n'est pas
possible non plus — une ombre est dessinée **hors** des limites de la vue, donc
tout parent en `overflow: hidden` la prend entière. Le remède est un filet
d'un point : c'est une vue, elle a quatre bords, et elle voyage avec ce qu'elle
sépare.

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

> **⚠️ CORRECTION (tranche 9) : le raisonnement ci-dessus attribue l'effet à la
> mauvaise cause, et la cause fausse a été réutilisée deux fois.** Ne pas
> déclarer un paquet dans `plugins` **n'empêche pas son greffon de tourner** :
> sur le SDK 57 un config plugin de paquet est **auto-appliqué**. Si
> `expo-sharing` n'ajoute aucune cible, c'est que `withShareExtension` est
> **inerte sans `props.ios.enabled`**, qui vaut `false` par défaut — constaté en
> lisant `plugin/build/withShareExtension.js` et en comptant les cibles du
> `.xcodeproj` généré : une seule. La conclusion tient, le motif non.
>
> Ce que ça a coûté : le plan de la tranche 9 comptait éviter l'entitlement
> `aps-environment` d'`expo-notifications` en ne le déclarant pas. Le pré-vol a
> montré qu'il s'écrit quand même. Il faut un greffon **qui en défait un autre**
> — voir `plugins/with-no-aps-environment.js`. Et la justification
> d'`expo-camera` en tranche 4 repose sur la même erreur : sans déclaration, la
> clé `NSCameraUsageDescription` est écrite quand même, en anglais par défaut.
>
> **La règle qui remplace celle-ci : pour toute dépendance native, un pré-vol
> `expo prebuild` puis lecture de l'`Info.plist` ET des `.entitlements`.** Aucun
> test en Node ne peut le remplacer — un greffon auto-appliqué ajoute un
> entitlement sans jamais apparaître dans `app.config.ts`.

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

> **⚠️ RENVERSÉ LE 17/09/2026, sur demande.** Elle est revenue à `app/library/`,
> là où le §3 la dessinait, et **recouvre la barre** — le coût décrit ci-dessus
> est devenu l'intention. Voir « La bibliothèque n'est pas une page du Journal »
> plus bas. **La règle qui en était sortie, elle, tient sans changement** : c'est
> toujours un empilement, avec le geste de retour du système ; seule la pile sur
> laquelle il se fait a changé.

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

**Un retour par glissement, c'est DEUX couches qui bougent.** Une vue du dessus
qui part en révélant du vide se lit comme une carte qu'on jette. Ce que fait
iOS — Réglages, Fichiers, partout — déplace deux écrans à la fois : celui qui
part traverse toute la largeur sous le doigt, celui qui arrive vient d'environ
un tiers en arrière, à un tiers de la vitesse. L'œil y lit une surface qui
glisse sur une autre, et c'est ce qui fait que la destination semble avoir
toujours été là plutôt que d'être construite au relâchement.

`core/ui/swipe-back.tsx` prend donc aussi **ce qu'il y a derrière**, monté en
permanence. Et il part du **bord** : sinon il réclamerait n'importe quel
glissement vers la droite, alors que ces étapes contiennent une liste qui
défile, des lignes qui se balaient et un clavier.

**Réserve, pour ce geste comme pour le balayage de suppression : React Native
n'expose rien de natif ici.** Ni contrôle système d'actions de balayage, ni
moyen d'emprunter le retour interactif d'UIKit pour une vue qui n'est pas un
contrôleur — et les bibliothèques disponibles sont elles-mêmes des
réimplémentations JavaScript. Ce sont des reconstructions qui en suivent la
forme et les proportions. Le dire plutôt que de le laisser croire.

### Trois pièges d'interface, établis par l'échec sur l'appareil

**Sous un en-tête transparent, le haut d'une `ScrollView` n'est pas zéro.**
`contentInsetAdjustmentBehavior="automatic"` pousse le contenu sous la barre en
posant `adjustedContentInset`, et la position de repos vaut **moins** cet
encart. `scrollTo({ y: 0 })` atterrit donc une hauteur de barre trop bas.

Et la valeur ne se lit pas depuis JavaScript : l'événement de défilement
transporte `contentInset`, que l'ajustement automatique laisse à zéro —
`RCTScrollView` envoie `scrollView.contentInset`, pas `adjustedContentInset`.
C'est le navigateur qui la connaît, et `useHeaderHeight()` donne le même nombre,
zone sûre comprise. Viser `-headerHeight`.

L'autre voie — couper l'ajustement et poser la marge à la main — est pire :
elle supprime aussi l'encart **du bas**, et le contenu passe sous la barre
d'onglets.

**Et viser la bonne valeur ne suffit pas : `scrollTo` la rogne.**
`RCTScrollView` borne la cible avec `contentInset` — l'explicite, laissé à zéro
par l'ajustement automatique — donc toute cible négative devient silencieusement
zéro. `scrollToOverflowEnabled` désactive ce bornage.

**Mais c'est la mauvaise sortie, et le carrousel l'a prouvé en trois tours.**
Viser `-useHeaderHeight()` est *proche*, et proche est précisément le problème :
sans le bornage, une visée de quelques points trop généreuse **dépasse**, le
contenu se repose plus bas que son haut, et rien ne le ramène — une bande de
vide sous la barre.

**La sortie est de déclarer les encarts au lieu d'en hériter.**
`contentInsetAdjustmentBehavior="never"` plus `paddingTop: useHeaderHeight()` :
le haut vaut zéro, le bornage le protège, et aucun dépassement n'est atteignable.
Le prix est d'assumer aussi le bas, que « never » supprime — ce qui est sans
gravité, le contenu passant sous une barre d'onglets en verre étant l'intention
d'iOS 26 ; il suffit d'assez de marge pour lire la dernière ligne au clair.

**Et une page montée vide n'a rien à faire défiler.** Un retour en haut posé
avant l'arrivée du contenu ne fait rien du tout ; il en faut un second au moment
où les données arrivent, pendant que l'indicateur couvre encore la page.

**Ne jamais échanger le type d'élément d'une page selon son état de
chargement.** Rendre une `View` en attente puis une `ScrollView` une fois
chargée fait échanger un type d'élément contre un autre : React démonte le
premier et monte le second, et **UIKit recalcule alors de zéro l'encart de
contenu d'une `ScrollView` neuve** — encart qui n'est pas nul sous un en-tête
transparent. Le contenu sautait donc en place. C'est ce qui se lisait comme
« la page de la journée qui bouge très vite » sur un jour pas encore chargé :
pas le carrousel du tout, mais une `ScrollView` qui naît sous l'en-tête.

Une seule `ScrollView`, dans les deux états : rien n'est créé, rien n'est
remesuré, et les points de chargement sont simplement ce que la page contient
pendant une image ou deux.

Au passage, un piège voisin sur le même écran : `flex: 1` sur une page du
carrousel agit sur l'axe **horizontal**, la bande étant en `flexDirection:
'row'`. Avec une largeur fixe à côté, Yoga répartit l'espace libre et les
largeurs cessent de valoir exactement un écran — or la bande est translatée par
écrans entiers. Sur la disposition d'un enfant de rangée, préférer `flexGrow`
sur le conteneur de contenu, qui est une colonne.

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

**Consulter est un empilement, agir sur une journée est une fenêtre
par-dessus.** La règle a fini par se simplifier : la bibliothèque s'empile dans
l'onglet, et **tout le reste** — ajouter au journal, corriger une ligne,
choisir une date — s'ouvre en panneau sur la journée. Aucune de ces trois
choses n'est un endroit : elles se font **sur** la journée, et un écran opaque
dit qu'on l'a quittée. Le §7 appelle l'écran d'ajout une modale plein écran ;
c'est une fenêtre, et les specs sont amendées en ce sens.

`core/ui/overlay-panel.tsx` porte la fenêtre, avec `transparentModal` et
`animation: 'none'`. Le panneau est au fond de **page**, pas au fond de carte :
ce qu'on y met porte ses propres cartes, et des cartes `surface` sur un panneau
`surface` cessent d'être visibles.

**Un `fullScreenModal` n'a aucune sortie par défaut.** C'est la racine de sa
propre présentation : la pile native ne lui dessine pas de bouton retour, et
iOS n'offre pas le glissement vers le bas d'une feuille. Un `headerLeft` vide y
signifie « écran dont on ne sort qu'en le complétant ». La saisie libre vivait
ainsi depuis la tranche 1 sans que ça se voie, parce que « Ajouter » et
« Supprimer » ferment tous les deux : **annuler était simplement impossible.**

Le piège a cessé d'exister en même temps que les modales plein écran : aucune
n'en est restée une, et `OverlayPanel` porte la sortie de toutes. Même
corollaire pour les étapes internes — quantité, saisie libre — qui sont des
**états** et non des routes poussées (D16 budgète 0,2 s pour y arriver) : le
navigateur ne leur donne aucun retour, il faut le déclarer. Sans lui, se
tromper d'aliment obligeait à fermer et recommencer — trois touchers pour en
annuler un.

**La barre du Journal, et les documents mis à jour avec elle.** Le jour à
gauche, deux boutons icônes à droite. Les chevrons précédent / suivant sont
supprimés — le balayage était déjà le geste principal et ils le doublaient.
**Ce n'est plus une divergence : le §8.3 des specs a été amendé** (voir
`specs §14.4`). Réserve inscrite dans les specs elles-mêmes : un balayage n'a
pas d'équivalent VoiceOver, là où un bouton en a un.

**Un bouton dessiné en JS peut recevoir le Liquid Glass — via `GlassView`, et
seulement là.** La direction iOS 26 dit qu'une vue JavaScript ne peut pas
l'obtenir, et c'est vrai d'une `View` stylée : c'est un traitement qu'UIKit
applique à ses propres contrôles. `GlassView` est l'exception, et la raison
d'être d'`expo-glass-effect` au §5 — c'est un vrai `UIVisualEffectView` avec des
enfants, donc ce qu'on y met est réellement derrière le même matériau au lieu de
l'imiter. `core/ui/glass-button.tsx` le porte, avec ses deux règles : **aucun
`backgroundColor`** sur le verre, et **deux** sondes avant tout, exportées
sous `canUseGlass()`. `isLiquidGlassAvailable()` parce que les specs annoncent
iOS 18 quand l'effet demande 26 — sans elle, le bouton est un rectangle
invisible sur un téléphone plus ancien. Et `isGlassEffectAPIAvailable()`, qui
n'est pas une ceinture de plus : le paquet l'a ajoutée parce que **certaines
bêtas d'iOS 26 n'ont pas l'API et plantent** à la création d'une vue en verre.
Une vérification de version seule leur offrirait un crash. Le repli, lui,
peint : ce n'est pas du verre.

**`@react-native-picker/picker` est au §5 depuis la tranche 3, demandee et
validee.** C'est la premiere dependance native ajoutee depuis la tranche 0, et
elle porte la consequence de toutes : **le binaire doit etre reconstruit**. Le
bundle JS ne contient pas son module natif, donc `npm run bundle:ios` reste
vert pendant que l'ecran plante sur l'appareil, tant que GitHub Actions n'a pas
refait un build de developpement.

`Picker` sur iOS EST un `UIPickerView`. Mais **trois colonnes veulent dire
trois vues** : un `UIPickerView` a bien plusieurs composants en son sein,
aucune liaison React Native ne les expose, donc la bande de selection est
dessinee trois fois au lieu d'une. Visible si on la cherche.

**Un `InputAccessoryView` ne se partage pas entre plusieurs champs.** Sa
documentation le presente comme une barre qu'on relie a plusieurs `TextInput`
par un `nativeID`. C'est faux, et la source de React Native le dit :
`RCTInputAccessoryComponentView`, en entrant dans la fenetre, cherche **le
premier** champ portant cet identifiant et lui attribue la barre. Une vue, un
champ. Une barre partagee par quatre champs s'affiche donc au-dessus d'un seul
— constate sur l'appareil comme « les chevrons ne s'affichent pas ».

Remede : **une barre par champ**, chacune avec son identifiant, toutes
dessinant la meme chose ; seul l'etat des chevrons change, selon la place du
champ dans le formulaire. Et la barre se rend **apres** le champ dans l'arbre,
la vue native se liant a l'entree dans la fenetre : le champ doit y etre deja.

Corollaire de mise en page : l'accessoire est pose en absolu et se dimensionne
sur son contenu, donc son contenu doit declarer une hauteur.

**Jamais de `GlassButton` dans un en-tête natif.** Sur iOS 26 la barre pose
déjà son propre matériau derrière ce qu'on lui donne : un bouton de verre
dedans, c'est du verre dans du verre, et ça se voit — un bouton dans un bouton.
Dans un en-tête, un `Pressable` nu avec son seul `SymbolView`. `GlassButton`
est pour le **contenu**, qui ne reçoit aucun matériau gratuitement : l'étoile
d'une rangée de liste, les actions d'un panneau dessiné à la main. C'est la
ligne de partage de la direction iOS 26, prise du mauvais côté une fois.

**Et la ligne de partage n'est PAS « natif contre maison » — c'est « cette
surface porte-t-elle déjà un matériau ».** Précisé le 17/09/2026, parce que
l'énoncé court se retourne facilement : un `InputAccessoryView` est une vue
native et un conteneur **vide**, rien ne lui est appliqué, donc `GlassView` y
est la seule façon d'obtenir le matériau — exactement comme pour une vue
dessinée en JavaScript. Un en-tête, lui, en porte un. Les deux sont natifs et
la réponse est opposée.

**Animer la géométrie, mais pas celle d'une vue native.** Piloter les
propriétés de disposition d'une `GlassView` image par image depuis un worklet
n'est pas quelque chose qu'elle promet de supporter. La morphose reste donc
sur une `Animated.View` ordinaire, qui découpe — `overflow: 'hidden'` et un
rayon animé — et le verre se contente de la remplir. La forme change, le
matériau est bien celui du système, et ni l'un ni l'autre n'a à connaître
l'autre.

**Des mots, pas des symboles, quand aucun glyphe ne dit la chose.** « Fermer »
se lit comme une croix ; rien ne dit « revenir à aujourd'hui » sans avoir été
appris — la flèche de retour essayée là disait « annuler ». Épinglé parce que
l'erreur est facile à refaire : une barre d'icônes est plus jolie qu'une barre
de mots, et c'est le mauvais critère.

**Le calendrier passe par la transition zoom native d'iOS**, pas par une
imitation. `expo-router` 57 l'expose — `<Link.AppleZoom>` sur la source,
`<Link.AppleZoomTarget>` sur la destination, soit `preferredTransition = .zoom`
d'UIKit (iOS 18+). Rien ne l'exporte à la racine du paquet, d'où le temps mis à
la trouver : elle vit dans `build/link/zoom/`.

Elle anime une **navigation**, donc la destination doit être une route. C'est la
seule raison pour laquelle le calendrier est un écran et non une fenêtre
dessinée par-dessus le Journal. Une morphose écrite à la main a existé avant —
interpolation de `left`, `top`, `width`, `height` et du rayon depuis le
rectangle du bouton mesuré — elle marchait, et elle restait une imitation ; le
git en garde la trace si l'API venait à manquer.

**Le retour de la date choisie ne passe pas par l'URL**, et c'est le point non
évident. Un paramètre de route survit à la visite qui l'a posé, or le §7 veut le
Journal sur la journée courante à chaque lancement ; et le Journal lirait sa
date de deux endroits à la fois, le paramètre et le balayage — or le carrousel
est la seule pièce de cet écran vérifiée sur l'appareil. La date voyage donc
comme une **demande consommée une fois**
(`features/nutrition/hooks/requested-date.tsx`) : le calendrier demande, le
Journal prend et efface. Dans l'autre sens, la date affichée voyage bien par
l'URL — c'est une entrée, une valeur périmée y est sans conséquence.

**`Link.AppleZoomTarget` n'entoure PAS l'écran de destination.** C'est l'erreur
qui a coûté deux tours : le nom se lit comme « la vue que le bouton devient »,
et c'est faux. Il marque le **rectangle d'alignement** — quelle partie de la
destination correspond à la source — et l'exemple de la bibliothèque le met
autour d'une image de 200 pt posée dans un écran ordinaire, jamais autour de
l'écran.

Le coût de la méprise est total, parce que le composant enveloppe son enfant
dans une vue native stylée `display: 'contents'`, censée ne participer à aucune
disposition. En racine d'écran, ça retire la racine de la disposition : tout ce
qui est dedans se mesure contre rien, et la page est blanche.

**La transition n'en a pas besoin.** Le zoom est demandé par `Link.AppleZoom`
côté source ; la cible ne fait qu'affiner l'alignement. Sans elle le système
choisit le sien, ce qui est le bon défaut ici — la destination est un panneau
entier, pas une image ayant sa contrepartie.

**Le panneau porte quand même ses propres dimensions**, prises de la fenêtre et
non du parent : il ne peut pas s'effondrer, et il monte jusqu'à l'île dynamique
au lieu de commencer sous une zone sûre qu'il n'a pas demandée. La zone sûre
revient en **marge intérieure**, pour que le fond aille au bord sans que rien de
lisible se cache sous l'île.

**Un indicateur de chargement se tient au moins une seconde.** SQLite local
répond en dizaines de millisecondes : l'indicateur se dépensait en un
clignotement, et un clignotement se lit comme un défaut, pas comme du travail.
`core/ui/use-minimum-visible.ts` impose le minimum **seulement une fois
l'attente commencée** — sans quoi chaque journée déjà en cache serait retardée
d'une seconde au nom de la fluidité, ce que personne ne veut. Et seul le
**reste** est attendu, donc ça ne peut jamais ralentir une journée lente.

## Ce que la tranche 4 a établi

**Sonder l'API a changé la conception quatre fois, et aucune de ces quatre
choses n'était dans la documentation.** Huit requêtes le 13/09/2026 :

- **Une consultation répond HTTP 200 que le produit existe ou non.** Le signal
  est `status: 0` dans le corps. Un client branché sur le code HTTP rapporte un
  produit là où il n'y en a pas.
- **`nutriments_estimated` revient qu'on le demande ou non**, volumineux, et il
  est rempli *précisément* pour les produits dont les nutriments déclarés
  manquent — ce sont des estimations calculées depuis la liste d'ingrédients.
  C'est le champ le plus dangereux de la réponse : le lire comblerait
  exactement les trous censés faire basculer vers le formulaire, avec des
  chiffres que personne n'a déclarés. Il n'est **pas dans le schéma zod**, donc
  il ne peut pas être lu par accident, et un test l'envoie seul pour le prouver.
- **La recherche texte vit sur un autre hôte.** `cgi/search.pl` et
  `/api/v2/search` répondent aujourd'hui par une page HTML d'indisponibilité
  sous un 200 ; seul `search.openfoodfacts.org/search?q=` fonctionne. Donc une
  réponse illisible n'est pas un cas théorique : c'est l'état courant de deux
  points d'entrée de cette API.
- **`fields=` ne se comporte pas pareil sur les deux.** La consultation
  restreint jusqu'au nutriment ; la recherche répond `nutriments: null` si on
  lui demande un sous-champ. Deux listes de champs écrites séparément, donc —
  une seule partagée coûterait ses macros à la recherche.

Et un cinquième constat qui abîme une garantie existante : sur un produit
testé, OFF donne `energy-kcal_100g` **égal à la valeur théorique** 4P+4G+9L.
L'avertissement d'écart de 10 % du §5.1 est donc structurellement muet sur ces
produits-là, exactement là où les données sont les plus douteuses. Constaté sur
un produit, pas mesuré sur un échantillon.

**ABSENT NE DOIT JAMAIS DEVENIR ZÉRO, et c'est la règle centrale de la
tranche.** `Number('')` vaut 0, `Number(null)` vaut 0, `Number([])` vaut 0 — et
`z.coerce.number()` appelle exactement `Number()`. Un produit qui ne déclare pas
ses protéines deviendrait un produit *sans* protéines : plausible, faux,
invisible, et **complet**, donc engagé dans le parcours rapide au lieu du
formulaire pré-rempli que le §8.5 exige. Une mutation vers la coercion naïve
fait rougir cinq tests ; c'est la seule preuve qui vaille.

Une seule exception, et elle est sûre parce qu'elle est terminale : le
formulaire pré-rempli affiche 0 pour une macro absente. Un champ ne sait pas
porter l'absence, l'utilisateur est sur le point d'écrire par-dessus, et tout
l'amont a gardé le `null` — donc la décision de dévier a été prise sur la
vérité.

**La copie automatique a lieu à « Confirmer », et `ensureOffFood` n'est pas
exportée.** Même forme et même motif qu'`ensureMaterialized` : appelable seule,
un arrêt forcé entre elle et l'action qui la justifie laisserait un aliment que
personne n'a validé. La règle que les deux partagent, énoncée une fois : **ce
que l'utilisateur enregistre explicitement s'écrit ; ce qu'il se contente de
choisir non.** Le formulaire pré-rempli écrit avant confirmation et n'y fait
pas exception — quelqu'un a rempli un formulaire et appuyé sur Enregistrer.

Elle ne **réécrit** jamais un aliment existant : trouvé par code-barres, rendu
tel quel. C'est un get-or-create, jamais un insert-or-replace, parce qu'une
correction est « le mécanisme principal de compensation de la qualité inégale
de la source » (§8.5) et que recopier par-dessus l'annulerait en silence, sur
le chemin où l'utilisateur s'y attend le moins.

**Un index unique est la première chose qui puisse faire échouer un INSERT dans
`food`** — et la tranche 3 avait écarté toute CHECK sur les macros pour que la
copie automatique ne puisse jamais échouer. `ux_food_barcode` rouvre cette
porte : deux produits peuvent partager un EAN, et deux lignes du même produit
neuf dans un panier collisionnent avec elles-mêmes. La réponse n'est pas de
renoncer à l'index, c'est que le chemin de copie lise d'abord. **Corollaire non
évident : une chaîne vide n'est pas un code-barres.** Les NULL sont distincts
dans un index unique, pas les chaînes vides — une seule prendrait la place et
refuserait tous les aliments suivants qui n'en ont pas, c'est-à-dire presque
toute la bibliothèque.

**Le cache et la base personnelle ne se rencontrent jamais.** Le
rafraîchissement opportuniste réécrit `off_cache.payload` et rien d'autre ;
aucun chemin de code ne va de là à `food`. C'est la réponse entière à « que
devient une correction au rafraîchissement » : rien, structurellement plutôt
que par prudence. Deux tests le fixent, parce que la modification tentante —
« le rafraîchissement devrait tenir la bibliothèque à jour » — tient en une
ligne.

Corollaire qui redimensionne le cache : **une fois le produit copié, la copie
fait autorité pour toujours**, et le dédoublonnage fait que la recherche ne le
consulte même plus. Ce qui reste au cache est le produit scanné puis
**abandonné**, et la latence d'un second scan avant confirmation. Réel, utile,
et beaucoup plus étroit qu'il n'y paraît — de quoi ne pas sur-investir dedans.

**Le limiteur est en deux morceaux, et un seul survit à un arrêt forcé.** La
fenêtre glissante d'une minute vit en mémoire : elle expire en soixante
secondes, et la persister coûterait une écriture SQLite **par requête réseau**.
La suspension consécutive à un 429 va dans `setting` — c'est le seul état dont
la perte a un coût *hors* du téléphone, le bannissement par IP.

Et **l'horloge n'est pas crue** : une échéance plus lointaine qu'une heure est
lue comme expirée, parce que reculer l'heure du téléphone suspendrait sinon
l'application indéfiniment, sans rien à l'écran pour l'expliquer. Même
raisonnement pour un horodatage d'appel situé dans le futur. La règle, dans les
deux sens : être un peu trop permissif coûte une requête refusée, être trop
strict coûte une fonctionnalité qui ne remarche jamais.

**La retry unique n'est pas dépensée sur un délai d'attente.** Un timeout a
déjà reçu toutes les millisecondes qu'on était prêt à attendre ; réessayer
double une attente déjà jugée trop longue, en magasin, le téléphone à la main.
Un refus immédiat n'a rien coûté et est la panne la plus probablement
passagère : c'est lui qui vaut la seconde tentative. **Les deux tentatives
comptent dans le budget**, parce que le serveur les a vues.

**`badResponse` n'est JAMAIS `offline`.** Le serveur a parlé, donc le téléphone
est connecté, et un bandeau « hors ligne » serait un mensonge que l'utilisateur
ne peut pas vérifier. C'est la distinction qu'un `catch` distrait efface, et
une mutation le confirme : replier le corps illisible sur l'échec réseau fait
rougir deux tests.

**Deux registres de message, et le choix n'est pas affaire de goût.** Hors
ligne est la circonstance de l'utilisateur, qu'il voit lui-même : discret. Un
quota signalé par le **serveur** est quelque chose qu'il ne peut pas voir,
qu'il aggraverait en réessayant, et qui risque un bannissement : c'est le seul
message de l'application qui interrompt. Notre propre fenêtre préventive ne
l'obtient pas.

**Le bandeau appartient à la fenêtre, pas au champ de recherche**, et il
apparaît sur l'échec d'une requête, jamais sur l'absence de réseau. Détecter
celle-ci demanderait une dépendance hors du §5 ; la réponse serait fausse
derrière un portail captif ; et D11 range déjà le bandeau dans son paragraphe
« Échecs ». Conséquence assumée : rien ne s'affiche tant que rien n'a été
demandé.

**Un résultat de recherche ne suffit pas à construire un aliment.** Il peut ne
porter que des kilojoules là où la consultation fournit les kcal. Choisir un
résultat coûte donc une consultation par code-barres — qui est aussi l'appel
que D11 met en cache durablement, et celui que le scan partage. Les kilojoules,
eux, ne sont pas convertis : le §5.1 conserve la valeur d'une source telle
quelle. **Réserve consignée** : si le formulaire s'ouvre trop souvent à
l'usage, la conversion est le premier remède et tient en une ligne.

**Pas d'anti-rebond sur la recherche distante, un submit.** Un anti-rebond
serait une façon de chercher au fil d'une frappe lente : il respecterait la
limite de dix par minute sans respecter l'interdiction, qui porte sur
l'intention et non sur la fréquence. Deux états — ce qu'on tape, ce qu'on a
demandé — et React Query **est** le cache mémoire que D11 réclame pour les
recherches texte, donc il n'y a pas de seconde table à écrire.

**Le dédoublonnage masque, sans rien proposer**, y compris quand les macros
distantes diffèrent désormais des locales. Un écran de comparaison sur ce
parcours aurait toujours la même réponse : celle que l'utilisateur a corrigée.

**Le scan lit une fois, et le verrou est une `ref`.** `onBarcodeScanned` se
déclenche plusieurs fois par seconde tant qu'un code est dans le cadre : sans
verrou, des dizaines de consultations contre un budget de quinze par minute —
un bannissement, pas un défaut d'affichage. Une `ref` et non un état, parce
qu'il doit agir à l'événement suivant et non au rendu suivant.

**`zod` ne sert qu'à la frontière étrangère, et un test le garde.** La charge
utile d'export n'est pas étrangère — Drizzle la décrit — donc `validate-payload`
reste écrit à la main. La première chose qu'on voudra faire avec zod dans
l'arbre est de « ranger » ce validateur, ce qui déferait la décision de la
tranche 2 en silence : `tests/conventions/zod-boundary.test.ts` fait échouer le
build en nommant le fichier fautif.

**Un produit Open Food Facts est toujours en grammes, sans heuristique.** L'API
publie des valeurs pour 100 g y compris pour les liquides — c'est littéralement
ce qu'elle mesure. Les lire comme « pour 100 ml » appliquerait une densité de 1,
que le §5.1 exclut. Deviner depuis une étiquette « 1 L » serait la même
conversion avec une supposition devant. Qui veut des millilitres corrige
l'aliment, ce que le §8.5 prévoit expressément.

**Le greffon `expo-camera` est déclaré, pas laissé à l'autolinking**, parce
qu'il écrit `NSCameraUsageDescription` dans l'`Info.plist`. iOS tue une
application qui ouvre l'appareil photo sans elle : l'alternative n'est pas une
chaîne manquante, c'est un plantage que le bundle JS ne sait pas reproduire.
Vérifié par le pré-vol `expo prebuild` puis lecture de l'`Info.plist`, pas
supposé.

**Le piège du lockfile a mordu deux fois dans la même tranche**, une fois après
`npm install --save zod` et une fois après `npx expo install expo-camera` — les
quinze liaisons rolldown disparues du lockfile à chaque fois, la suite locale
restant verte. Le seul contrôle qui vaille reste
`rm -rf node_modules && npm ci --ignore-scripts`, et le seul comptage qui veuille
dire quelque chose reste `grep -c '"node_modules/@rolldown/binding-'`.

**Toute ligne d'aliment personnel se répète en un toucher, et la quantité
affichée EST celle qui sera ajoutée.** Pas « la même à peu près » : la ligne, le bouton et l'écran de
quantité tirent la valeur de `prefillQuantity`, une seule fonction pure, une
seule fois. Deux chemins vers « la dernière quantité » s'accorderaient presque
toujours — et le jour où ils divergeraient, la ligne mentirait sur ce que fait
son propre bouton, sans que rien ne se voie : les deux chiffres sont
plausibles. Chaque test l'assert contre `readQuantityPrefill`, jamais contre un
littéral.

Le cas qui décide reste celui du pré-remplissage : une tranche à 25 g quand
« 2 tranches » a été logué, à 30 g aujourd'hui → le bouton ajoute **50 g**, pas
60. Une seconde implémentation se serait trompée là.

**Un aliment jamais consommé garde son bouton**, et la chaîne répond comme elle
l'a toujours fait : sa quantité de référence, puis 100. La ligne n'affirme
jamais que cette quantité a été mangée — elle énonce ce que le bouton ajoutera,
ce qui est vrai à chaque étape. Retirer le bouton aurait coupé la liste des
favoris en deux selon un critère invisible.

**Un seul chiffre de calories par ligne, toujours au même endroit, et ce qu'il
veut dire appartient à l'écran.** L'écran d'ajout y met le prix du toucher —
les calories de la quantité que le « + » enregistrerait ; la bibliothèque y met
ce que l'aliment **est**, ses calories pour 100. Il y en avait un second sous
le nom : deux nombres de calories sur une carte, sans que l'un soit
manifestement celui qu'on lit.

**Conséquence assumée** : les listes de l'écran d'ajout cessent d'être
comparables entre elles, chaque ligne étant désormais énoncée contre sa propre
quantité. C'est correct pour un écran où l'on logue plutôt qu'où l'on compare —
et c'est pour ça que la bibliothèque, elle, garde le chiffre pour 100, qui est
ce qui la rend comparable. La règle de `FoodRow` n'a pas été enfreinte : son
motif a cessé de s'appliquer d'un côté et continue de l'autre.

**L'en-tête de l'écran d'ajout ne défile pas.** Les deux entrées rapides et le
champ restent à l'écran ; seules les listes bougent. Atteindre le scanner ne
doit jamais coûter un retour vers le haut, sur un parcours budgété à cinq
secondes, en magasin, à une main. Effet de bord qui n'en est pas un : un champ
placé **au-dessus** d'une zone qui défile se lit comme le filtre de cette zone,
ce qu'il est ; à l'intérieur, il se lisait comme le premier élément d'une liste
qui contenait une boîte de texte.

**Trois formulations d'une quantité coexistent, et chacune a sa raison** :
« 2 tranches · 50 g » au Journal, où une entrée se lit face à un total ;
« 2 tranches » au panier, où la ligne a la place d'une seule chose ;
« 2 tranches (50 g) » sur une ligne de liste, parce que la ligne du dessous
énonce toujours « kcal / 100 g » et qu'une portion sans grammes à côté ne s'y
compare pas.

**Étendre la même chose aux favoris et à la recherche a forcé la bonne
requête.** Tant que seuls les récents la portaient, une lecture indexée par
rangée était un coût plafonné à vingt. La recherche porte sur **toute** la
bibliothèque : ç'aurait été quelques centaines de requêtes à chaque ouverture
de la fenêtre, sur un chemin budgété à 0,3 s. D'où une fonction de fenêtre,
`ROW_NUMBER() OVER (PARTITION BY source_food_id ORDER BY created_at DESC,
id DESC)` — l'ordre **caractère pour caractère** celui de
`readLastEntryForFood`, donc `rn = 1` sélectionne exactement la ligne que cette
fonction rend.

Deux implémentations d'une même question, c'est précisément ce que toute cette
fonctionnalité cherche à éviter. Elles ne sont donc pas tenues d'accord par le
soin mais **par un test** : sur un journal généré de quatre mois, aliment par
aliment, les deux doivent coïncider. Une mutation de l'ordre le fait rougir.
Trois requêtes pour une liste de n'importe quelle longueur, et aucune
arithmétique hors de `prefillQuantity`.

**Et c'est sans danger uniquement parce que le panier existe.** Rien n'est
écrit avant « Confirmer », une ligne ajoutée par erreur se retire d'un
balayage, et le compteur de l'en-tête change aussitôt pour dire que le toucher
a porté. Un ajout direct au journal aurait réclamé une confirmation ; une ligne
au panier n'en réclame aucune. C'est la même propriété qui rend le geste rapide
et qui le rend rattrapable.

**Le rouge destructif est le seul jeton dont la lisibilité est fixée par un
test, parce qu'il sert à deux choses incompatibles** : il remplit le bouton
« Retirer » sous un libellé clair, et il écrit du texte sur une carte — le
bouton « Supprimer » de l'éditeur, chaque problème de validation. L'éclaircir
pour l'un dégrade l'autre, et l'échec est invisible à qui fait le changement :
**un rouge difficile à lire a toujours l'air rouge.**

D'où le choix par l'arithmétique plutôt qu'à l'œil. `#ff3b30`, le systemRed
d'iOS en clair, n'atteint que 3,55:1 sur blanc : Apple l'applique à des
libellés, ce projet l'appliquerait aussi à des phrases. Le clair est donc
`#e02d1f` — le rouge le plus vif qui franchisse 4,5:1 (il fait 4,60). Le sombre
est `#ff453a`, le systemRed d'iOS **exactement**, l'arithmétique jouant dans
l'autre sens sur un fond quasi noir : 5,10:1 en texte, 5,62:1 sous le libellé
d'un bouton plein.

Et le test garde **les deux directions**, vérifié par mutation : il rougit sur
les anciennes valeurs (trop ternes) comme sur systemRed en clair (contraste
insuffisant). La mesure de « vif » est la saturation et la valeur HSV, jamais
la luminance — première tentative et mauvais instrument : la formule pondère le
vert à 0,72, donc un rouge saturé a une luminance basse par construction. La
brique `#a8291f` était saturée mais sombre (valeur 0,66), le saumon `#e8796e`
clair mais délavé (saturation 0,53), ce qui le faisait lire comme un contrôle
désactivé.

**Le clavier est revenu sur l'écran de quantité, et c'est une réserve qui se
dépense.** La tranche 3 l'avait retiré pour rendre les fractions de portion
possibles, en écrivant le prix : « taper 137 g demande de faire tourner une
roue ; à rouvrir si une quantité précise devient pénible ». Elle l'est devenue.

La forme compte : **les molettes restent l'unique source de vérité.** Ce qui est
tapé y atterrit par `wheelWithAmount`, et tout le reste les lit. Garder la
valeur tapée *à côté* aurait fait deux réponses à une question — exactement la
forme de bug que cet écran évite déjà une fois.

Trois détails qui ne se devinent pas :
- **Le nombre seul est saisi, jamais l'unité.** Le champ s'ouvre sur une ligne
  qui dit « 2 tranches (50 g) » : ce qu'on retape est le 2. Un clavier qui
  rebasculerait en grammes répondrait à une question que personne n'a posée.
- **La valeur s'applique au blur, pas à chaque frappe.** Appliquer en direct
  ferait tourner les molettes par 1, puis 13, puis 137 — ce sont des pickers
  natifs, ils s'animent, et un pavé numérique n'est pas un endroit d'où
  regarder ça. D'où une barre « OK » au-dessus du clavier : un seul champ, donc
  pas de chevrons, qui seraient deux contrôles morts.
- ~~**`autoFocus` + `selectTextOnFocus` fonctionnent ici**, là où la tranche 3
  avait constaté qu'ils ne sélectionnaient rien.~~ **FAUX, rapporté à l'usage le
  17/09/2026.** Le raisonnement — « la valeur existe avant le champ, donc c'est
  le cas où la paire marche » — a un trou : iOS applique `selectTextOnFocus` au
  début de l'édition, et une valeur **contrôlée** est écrite dans le champ
  après, ce qui pousse le curseur à la fin. Lequel des deux atterrit en dernier
  ne nous appartient pas. La sélection est désormais **énoncée** à la frame
  suivante — exactement le remède que la tranche 3 avait trouvé pour ce même
  champ, et qu'il fallait garder.

Et le champ est un composant à lui, pour que le texte en cours de frappe naisse
et meure avec lui : gardé sur l'écran, il faudrait le vider à chaque
ouverture, et le bug que ça produit — un champ qui s'ouvre sur l'édition
précédente — ne se voit qu'à la deuxième.

### Deux défauts trouvés sur l'appareil, et ce qu'ils enseignent

**Un balayage qui se termine sur la rangée déclenchait son press.** Découvrir
« Retirer » sur une ligne du panier ouvrait l'écran de quantité. La cause est
celle que `swipe-to-delete-row.tsx` mettait déjà en garde un paragraphe plus
haut, sans en tirer toutes les conséquences : **le système de responder de
React Native et gesture-handler sont deux reconnaisseurs qui n'arbitrent pas
entre eux.** Un `Pan` qui s'active n'annule pas un `Pressable` en dessous,
donc le relâchement se lit comme un appui.

Le remède n'est pas un verrou temporel mais un déplacement : **le press est un
geste, et il vit dans le composant de balayage.** Un `Tap` et un `Pan` dans le
même détecteur sont en **course** — gesture-handler les rend exclusifs par
défaut — donc un pan qui s'active fait échouer le tap. C'est exactement
l'arbitrage qui manquait. Les appelants passent `onPress` au lieu d'envelopper
leur contenu.

Le Journal avait le même défaut, sur l'écran le plus utilisé. Il est corrigé
par la même bascule.

Deux prix à payer, et ils sont payés plutôt que subis : un geste n'a pas d'état
« pressé », donc la surbrillance est reconstruite sur une valeur partagée pilotée
par `onBegin` / `onFinalize` — sur le fil d'interface, donc sans le retard d'un
aller-retour d'état ; et un geste est invisible à VoiceOver, donc le rôle et le
libellé sont déclarés sur la rangée. **Corollaire : plus aucun enfant ne doit
peindre son fond**, sinon il masque la surbrillance du parent.

**Les molettes de quantité tournaient en s'ouvrant.** Elles se montaient sur un
défaut de 100, et un effet les déplaçait quand la requête répondait. **Un effet
tourne APRÈS que son rendu a été peint** — c'est la même leçon que le carrousel
de la tranche 3 avait apprise sur son `key` — donc aucune disposition d'effets
ne pouvait le corriger : la valeur doit exister avant les molettes.

Le formulaire est donc scindé. La `ScrollView` reste la même dans les deux
états — échanger une `View` contre une `ScrollView` est ce qui faisait sauter la
page de journée — et seul le **corps**, qui porte les molettes, attend d'avoir
une quantité. Il l'obtient par `wheelFor`, fonction pure appelée à
l'initialisation de l'état et non dans un effet.

Piège au passage : `null` veut dire **« pas encore »**, jamais « aucune ». Un
écran qui n'a rien à attendre — un produit Open Food Facts porte tout — énonce
sa valeur de départ, sinon il attendrait pour toujours sur le seul chemin qui
n'a pas de requête.

## Ce que la mise au point de la tranche 3 a laissé derrière elle

Des pièces partagées, nées d'une demande précise et devenues la façon dont
l'application s'écrit. À connaître avant d'en redessiner une :

- `core/ui/form-section.tsx` — l'idiome groupé encastré des Réglages :
  `FormSection`, `FormRow`, `FormInput`, plus `FormNavigation` et ses chevrons
  au-dessus du clavier. **La rangée est le champ** ; rien ne se dessine autour
  d'une valeur.
- `core/ui/list-separator.tsx` — le filet entre deux rangées, en retrait des
  deux côtés. Il a remplacé six définitions et trois retraits différents.
- `core/ui/cross-fade.tsx` — deux contenus qui se croisent, pour un contrôle
  qui change de sens sans bouger.
- `core/ui/overlay-panel.tsx` — la fenêtre par-dessus la journée, et depuis la
  tranche 3 son bandeau : `usePanelHeading` fait remonter le titre depuis
  l'écran qui le connaît, comme `useDismiss` fait redescendre la fermeture.
- `features/nutrition/components/` — `unit-toggle`, `macro-fields`,
  `macro-row`, `quantity-wheel` et sa règle de domaine `wheel-choice`.

Et une règle d'interface qui vaut pour toute la suite : **le chrome appartient
au système, le contenu est à nous.** Un `GlassButton` dans un en-tête natif est
du verre dans du verre ; une étoile dans une rangée de liste est du contenu et
doit porter son propre matériau.

## Ce que la tranche 5 a établi

**Tout l'irréversible tient dans `0004`, et ça se réduit à trois lignes** :
deux clés étrangères et une `CHECK`. SQLite n'a pas d'`ALTER TABLE ADD
CONSTRAINT`, donc ce qui n'y entrait pas n'y entrerait jamais. Le reste de la
tranche — tables, colonnes, index, écrans — se corrige à volonté.

**L'asymétrie qui décide des clés étrangères était déjà écrite au §2.3, par
quelqu'un d'autre.** `day.template_id_snapshot` y est déclaré « informatif,
sans lien vivant » et ne porte aucune clé, parce qu'un cascade y détruirait
l'historique. `planning_weekday` est l'inverse : de la **configuration
vivante**, où une ligne désignant un modèle disparu ne s'affiche pas et ne se
résout pas. La supprimer n'est pas une perte, c'est la seule sémantique
cohérente. `RESTRICT` était exclu par le §5.3 ; `CASCADE` ne bloque rien non
plus, donc la règle est tenue et non contournée.

Ce qui a décidé contre « aucune clé » : **l'import perdrait une barrière.**
`foreign_key_check` est la barrière 3 de la tranche 2, et sans clé déclarée
elle ne distinguerait plus une archive saine d'une archive dont le planning
pointe dans le vide.

**« Une journée matérialisée n'est pas affectée rétroactivement » n'est pas une
règle appliquée quelque part : c'est une requête qu'on ne fait pas.** `readDay`
branche — matérialisée, elle lit ses propres `day_meal` ; virtuelle, elle
résout le planning. Une journée future préparée à l'avance est couverte par la
même phrase **sans cas particulier** : elle tient parce qu'elle est
matérialisée, pas parce qu'elle est dans le futur.

**La résolution se fait DANS la transaction de matérialisation**, sur la ligne
qui précède le figeage. Plus tôt — dans l'écran, ou dans une lecture faite
avant de décider d'écrire — un modèle édité entre les deux produirait une
journée dont les repas viennent d'une version et dont `template_name_snapshot`
en nomme une autre.

**Le pointeur par défaut est le seul de l'application qu'aucune contrainte ne
peut protéger**, `setting` étant une table clé/valeur en TEXT. Il est traité
des deux côtés, et ce ne sont pas deux fois la même chose : `deleteTemplate`
l'efface dans la même transaction — **la règle** — et `readDefaultTemplateId`
vérifie que le modèle existe encore — **la garantie**. Seule la seconde survit
à une archive écrite par un autre binaire ou à une ligne réparée à la main.
Trois tests couvrent le pointeur qui pend, la valeur qui n'est pas un
identifiant, et la récurrence qui répond quand même.

**La conversion `1 = lundi` n'a rien coûté : elle existait depuis la tranche
0.** `core/date.weekday()` rend l'ISO 1..7 par arithmétique entière sur le
numéro de jour, et `tests/date/local-date.test.ts` porte littéralement
`it('keeps the weekday numbering the planning table expects')`, avec
`planning_weekday` nommée en commentaire. La tranche 0 avait écrit le test de
la table de la tranche 5. **Rien de neuf n'est sensible au fuseau** — le
planning est indexé par date civile et par jour ISO, tous deux tirés d'une
chaîne : il n'y a pas un seul instant dans ces modules.

**Le repli en code a survécu, exactement comme `day-plan.ts` l'avait écrit.**
« No template applies » est devenu « le planning ne désigne rien », qui est
l'état d'une base neuve **et** de toute base dont le dernier modèle vient
d'être supprimé. Aucune graine n'a été posée en migration : elle ne livrerait
pas d'objectif, ne permettrait pas de retirer le repli, et une migration porte
ce qui ne peut pas être ajouté plus tard.

**Le bandeau serait resté muet le jour même où les modèles arrivent.**
Aujourd'hui est matérialisée dès le petit-déjeuner logué, et une journée
matérialisée ne consulte jamais le planning. D'où `applyPlanTargetsToDay`, acte
**explicite** : le §8.2 fait de l'action de l'utilisateur l'acte qui définit
une journée, et rien ici ne se déclenche seul. Le repli refusé était de faire
retomber une journée sans objectif sur le planning **à la lecture** — éditer un
modèle bougerait alors le bandeau de journées vieilles de trois mois.

Elle ne touche que les quatre colonnes d'objectif, **appariées par position**.
Jamais un nom, jamais le nombre de repas, jamais une entrée : une journée porte
des repas que l'utilisateur a pu renommer et qui contiennent des lignes. D'où
le libellé « appliquer les **objectifs** de X » — la promesse est exactement ce
qui se passe.

**Le Journal doit dire d'où viennent ses repas, sinon rien ne l'explique.**
Une journée matérialisée énonce son snapshot sans être touchable, et c'est la
seule chose à l'écran qui réponde à « j'ai modifié mon modèle, pourquoi mon
jeudi n'a pas bougé ». Le §8.2 rend ce comportement correct ; il ne l'explique
à personne.

**Un dossier réel, pas un groupe entre parenthèses.** `(journal)` porte des
parenthèses parce que le Journal **doit rester** la route index du groupe
d'onglets. Les Réglages ne sont pas cet index : un `(settings)/index.tsx`
aurait réclamé « / » une seconde fois, à côté de celui du Journal. Écrit en
groupe d'abord, corrigé avant le commit — **le bundle ne l'aurait pas
attrapé**, c'est le genre d'ambiguïté qui se paie sur l'appareil.

**Les repas d'un modèle sont remplacés en bloc**, pour le motif établi en
tranche 3 sur les portions : la machinerie d'une réconciliation ligne à ligne
servirait des identifiants que **rien ne référence**. Une journée copie le nom
et les objectifs dans ses propres lignes ; aucune colonne ne pointe vers
`day_template_meal.id`.

**Un repas récent rejoue les choix, pas les chiffres figés.** La capsule d'une
vieille entrée est ce qui a été mangé *alors* ; ajouter un repas aujourd'hui
est un ajout d'aujourd'hui, donc chaque ligne repasse par son aliment et fige
ce qu'il dit maintenant. Le cas qui tranche : le §8.5 fait de la correction d'un
produit copié « le mécanisme principal de compensation de la qualité inégale de
la source » — rejouer la capsule réimporterait en silence l'erreur qu'on vient
de corriger, sur le chemin construit pour répéter une habitude.

La **quantité**, elle, reste figée : même arbitrage que le pré-remplissage de
la tranche 3, la taille de portion figée gagne. Trois lignes repartent malgré
tout de leur capsule, chacune pour son motif — une saisie libre n'a aucun
aliment à relire, un aliment supprimé ne se lit pas (et le §5.3 déclare cette
suppression gratuite), et un aliment dont l'**unité de base** a changé
apparierait des macros pour 100 ml avec une quantité comptée en grammes. Ce
dernier est un chiffre faux et parfaitement plausible : le seul genre qui
compte.

**Aucune dépendance n'est entrée.** Le choix d'un modèle passe par
`ActionSheetIOS`, un vrai `UIAlertController` du cœur de React Native — la
direction iOS 26 appliquée telle qu'écrite, le chrome appartient au système.

## Ce que les retours d'appareil de la tranche 5 ont établi

**Une dépendance native ne se juge pas sur sa légitimité mais sur l'écran qui
la monte.** `react-native-svg` est au §5 et D13 en fait l'outil graphique
unique : l'utiliser pour l'anneau n'enfreignait rien. Ce qui a décidé contre,
c'est que le premier écran à le monter est le **Journal** — l'application
cesserait de s'ouvrir jusqu'à un cycle CI et une réinstallation, et tout ce qui
est livré à côté deviendrait intestable au même instant. `picker` et
`expo-camera` avaient déjà facturé ça, les deux fois sur un écran qu'on pouvait
éviter. Règle qui en sort : **avant d'ajouter du natif, demander quel écran le
monte en premier.**

**L'anneau en vues, et pourquoi ce n'est pas un second outil graphique.** Un
cercle en `borderRadius`, deux demi-anneaux tournés, deux masques : cinquante
lignes, une seule interface (`progress`, `size`, `thickness`, `color`). La
tranche 7 le réécrit sur svg sans qu'un appelant bouge. La géométrie est
reproduite en test — le composant ne se rend pas depuis Node, mais les deux
rotations qu'il calcule, si.

**Les deux seuils n'ont désormais même plus la même unité, et c'est mieux.**
`KCAL_DISCREPANCY_THRESHOLD` reste un ratio — il vérifie qu'une valeur calorique
déclarée s'accorde avec `4P + 4G + 9L` (§5.1). `KCAL_OVERSHOOT_KCAL` est
maintenant **50 kcal**, un nombre de kilocalories. Avoir refusé de les confondre
en une constante quand ils partageaient le nombre 10 est exactement ce qui a
permis de changer l'un — de 10 % à 50 kcal — sans toucher l'autre.

**Les calories sont le seul chiffre qui a le droit d'élever la voix.** Anneau
rouge dès qu'il est plein ; les trois barres de macros ne rougissent jamais,
journée comme repas. Dépasser en glucides n'est pas le même
genre d'événement que dépasser sur la journée, et une rangée de barres rouges
dirait que si.

**Une macro tronquée est pire qu'une petite.** Les points de suspension tombent
là où un chiffre tomberait, donc la ligne se lit comme une valeur au lieu de se
lire comme une valeur manquante. La ligne grise du journal est descendue à 10
points, interlettrage resserré, avec dix points de largeur repris sur les
marges de la rangée.

**Anneau et bandeau de macros n'apparaissent que contre un objectif.** Un
anneau sans rien à remplir n'est pas un anneau à zéro, c'est une forme qui a
l'air cassée — et une journée sans modèle en empilerait quatre. Sur un repas
sans objectif, l'en-tête reste exactement ce qu'il était avant la tranche 5.

**Un vocabulaire fermé de quatre noms de repas, et un numéro qui n'est pas
stocké.** Petit-déjeuner, Déjeuner, Dîner, Collation. Un seul de chacun des
trois premiers par journée et par modèle ; les collations se répètent, et ce
sont les seules à avoir jamais besoin d'un numéro.

Le numéro est **dérivé à chaque lecture**, jamais écrit. D9 interdit de stocker
ce qui se dérive, et c'est le cas qui montre pourquoi ça compte au lieu d'être
seulement propre : stockée, « Collation 2 » survivrait à la suppression de
« Collation 1 » et resterait là à nommer un rang qui n'existe plus. Dérivée, la
survivante redevient « Collation » toute seule. Une seule collation n'est pas
numérotée — le numéro sert à en distinguer plusieurs.

D'où `DayMealView.name` (ce qui est **stocké**, ce qu'une écriture adresse) et
`DayMealView.label` (ce qui s'**affiche**). Le libellé vit sur la vue et non
dans les composants parce qu'il ne se dérive pas d'un repas : il dépend de la
journée entière, et deux composants le calculant seraient deux façons de
numéroter.

**Aucune contrainte SQL, et c'est la position tenue.** `day_meal` est gelée
depuis `0001`, donc une `CHECK` demanderait de reconstruire la table dont pend
tout le journal. L'index unique partiel, lui, **serait** ajoutable — les index
sont la seule partie d'une migration qui le reste — et il est refusé quand même :
une base en service porte déjà des repas nommés comme leur propriétaire les a
tapés, une archive aussi, donc l'index échouerait à se construire sur exactement
les données qu'il existe pour protéger. La règle vit à la frontière d'écriture,
où elle peut nommer ce qu'elle refuse. Même arbitrage que `food_portion.name` en
tranche 3.

**Les lignes écrites avant la règle la gardent.** Renuméroter la vieille journée
de quelqu'un serait réécrire l'historique pour satisfaire une règle qui
n'existait pas quand il l'a faite (§5.2). Un nom hors liste s'affiche tel quel
et ne bloque aucun ajout : n'étant pas l'un des quatre, il ne peut pas être
l'occurrence unique de l'un d'eux.

**La liste fermée devait atteindre les modèles.** Une journée copie ses repas de
son modèle à la matérialisation : un modèle libre de nommer n'importe quoi
poserait n'importe quoi sur une journée, et la règle tiendrait partout sauf à
l'endroit qui décide de quoi une journée a l'air.

**L'icône reste, l'anneau part.** Le glyphe dit quel repas c'est et reste vrai
qu'un objectif ait été posé ou non. L'anneau est une proportion, et une
proportion de rien n'est pas un anneau à zéro : c'est une forme qui a l'air
cassée. Les trois repas fixes se distinguent par l'**heure** — lever, midi,
nuit — et non par la nourriture, parce qu'une fourchette dirait « repas » sur
les quatre ; la collation prend le seul glyphe de nourriture, ce qui la fait
lire comme l'intruse qu'elle est.

**Ajouter un repas est passé d'un `Alert.prompt` à une modale**, et le prompt
n'aurait pas pu survivre au changement : un repas n'est plus un nom tapé mais un
choix entre quatre, avec quatre objectifs facultatifs à côté. Une alerte porte
un champ de texte et rien d'autre. Les objectifs se modifient par la même
modale, depuis l'appui long — et ça touche la journée, jamais le modèle.

**Une route modale non déclarée retombe sur une poussée latérale, en silence.**
`(modals)/meal` manquait au `Stack` racine, donc elle prenait le défaut — une
carte opaque venue de la **droite** — pendant que ses trois sœurs montaient du
bas. `OverlayPanel` la levait déjà correctement ; personne ne l'a jamais vu,
parce que l'écran qui la portait était poussé. Règle qui en sort : **toute route
ajoutée sous `(modals)/` doit être déclarée**, et l'oubli ne produit ni erreur
ni avertissement.

**Les embouts arrondis sont des pastilles, et c'est exact plutôt
qu'approchant.** SVG les donnerait par `strokeLinecap="round"`. Ici chaque
extrémité est un cercle dont le **diamètre est l'épaisseur du trait**, centré
sur la ligne médiane de l'arc — géométriquement la même forme qu'un embout
rond. Un test le vérifie à 37°, un angle qu'aucun axe ne traverse : la distance
au centre doit valoir le rayon de la médiane. Ils sont omis là où ils seraient
faux et non seulement inutiles : un arc vide n'a pas d'extrémités à arrondir, un
cercle fermé n'en a pas du tout.

**Une jauge est le même arc, tourné.** `sweep` le raccourcit, `startAngle`
tourne le cadre entier : trois quarts = 270° à partir de 225°, soit un vide de
90° centré sur six heures. Une forme ouverte a deux bouts, et les bouts sont ce
qui dit dans quel sens elle se remplit — un cercle fermé à 95 % et un à 5 % ne
diffèrent que par l'endroit de la couture. **Les enfants restent hors de la
rotation**, sinon le chiffre au centre pendrait de travers.

**Une icône ne prend pas la couleur de ce qui l'entoure.** Le glyphe dit *quel*
repas c'est ; l'anneau dit *comment* ce repas se passe. Les teinter ensemble
faisait colorer un fait par l'autre — une collation virant à l'ambre avait l'air
d'une autre collation — et faisait passer l'icône par trois couleurs là où la
même icône, sur un repas sans objectif, restait grise.

**Une molette native plutôt qu'une feuille d'action, pour une valeur que le
formulaire porte.** `Picker` sur iOS **est** un `UIPickerView`, déjà au §5 et
déjà dans le binaire, donc aucune reconstruction. Il est en ligne et montre tous
les choix à la fois : une feuille est une décision qu'on prend et qu'on congédie,
une molette est une valeur sur laquelle on peut revenir pendant que les quatre
champs d'objectif sont encore devant soi.

**La couleur voyage avec le glyphe, dans le même module.** Séparées, le soleil
pourrait finir bleu le jour où quelqu'un ajoute une cinquième sorte ou réordonne
une palette — et tout l'intérêt de la couleur est qu'elle s'accorde avec ce qui
est dessiné. **Quelle** couleur est un jeton de thème, parce qu'elle doit
différer entre clair et sombre ; **quel** jeton est l'affaire de
`meal-symbol.ts`, parce que ça dépend de ce que le glyphe représente.

Les quatre voisinent délibérément les teintes des macros, et ça ne coûte rien :
un repas s'identifie par la **forme** de son glyphe et une barre de macro par
l'**étiquette** écrite dessus, donc ni l'un ni l'autre n'est jamais décodé par
la couleur. Ce qui aurait coûté quelque chose, c'est une couleur qui contredit
l'image.

**Le seuil d'un glyphe est 3:1, pas 4,5:1.** WCAG sépare le texte des objets
graphiques, et une icône est le second. Le midi a été assombri de `#c08a00` à
`#a8780a` pour avoir de la marge — il était à 3,05.

**Une roue est le bon contrôle pour une quantité, le mauvais pour quatre mots.**
Le `UIPickerView` a été essayé pour le nom du repas puis ressorti : la valeur
d'une quantité est continue et tourner **est** le réglage, alors que quatre mots
fixes se touchent. Elle coûtait un défilement pour atteindre ce qui pouvait être
un toucher, et mangeait cent cinquante points d'un panneau dont les quatre
champs d'objectif sont tout le propos.

**Un dixième de gramme est une mesure sur un aliment et du bruit sur une
somme.** Les macros d'une journée et d'un repas s'affichent à l'entier ;
une entrée individuelle garde sa décimale, parce que là le chiffre **est** la
mesure. Divergence assumée avec le §5.1, consignée en `specs §14.6`. Le calcul
interne reste en pleine précision : c'est un arrondi au point d'affichage, comme
tous les autres de `core/format`. Un test pose `formatMacro` et
`formatMacroWhole` côte à côte pour qu'on ne les fusionne pas par mégarde.

**Une dépendance native déjà autolinkée ne coûte pas de cycle CI.** `expo-font`
est une dépendance directe d'`expo` et porte son `expo-module.config.json` :
son module natif est **déjà dans le client installé**. Les fontes se chargent
donc à l'exécution et non à la compilation, et Nunito est arrivée sans
reconstruire. C'est le pendant exact de la règle posée pour l'anneau — avant
d'ajouter du natif, demander quel écran le monte en premier — et ici la réponse
était « il est déjà là ».

Elle est quand même **déclarée au `package.json`** plutôt que laissée
transitive : une montée mineure d'`expo` pourrait la retirer, et le §5 veut ses
dépendances nommées.

**Trois fichiers statiques, pas une fonte variable.** Un seul fichier aurait été
plus propre, mais `fontWeight` ne pilote pas un axe variable à travers React
Native : iOS enregistre l'instance par défaut et **synthétise** le gras — un
faux épaissi qui se voit à côté de vraie typographie, surtout aux petites
tailles, c'est-à-dire presque partout ici. La graisse choisit donc le fichier.

**Et la graisse redevient `normal` en sortie.** Sinon iOS reçoit une demande de
gras *sur une fonte déjà grasse* et en synthétise un par-dessus : le double-gras
qui donne mauvaise réputation aux polices embarquées.

**Un composant plutôt qu'un réglage global, parce qu'il n'y en a plus.**
`Text.defaultProps` au démarrage était le recours habituel ; React 19 a supprimé
`defaultProps` des composants fonction. Y revenir demanderait une affirmation de
type sur un composant — interdite par le §4 — pour écrire un champ que React ne
lit plus. D'où `core/ui/text.tsx` et trente-cinq imports déplacés une fois ; le
prochain changement de police en changera un.

**Le fichier d'actifs est séparé de la table de correspondance**, et ce n'est pas
du rangement : `require` d'un `.ttf` parle à Metro et pas à Node. Sans la
coupure, la table — le mécanisme entier, ce qui produit du faux gras en silence
quand elle est fausse — ne pourrait pas être testée du tout.

**Rien n'est bloqué sur la fonte.** Le chargement peut échouer ; `fontFamilyFor`
rend alors `undefined`, chaque `Text` retombe sur la police système, et c'est
exactement ce qui a tourné pendant cinq tranches. Retenir l'application pour une
fonte mettrait un écran blanc sur le chemin critique d'une application dont
toute la cible est quinze secondes.

**Une boîte carrée qui ne peint que son haut laisse un écart qu'on prend pour
une marge.** Une jauge trois quarts descend à cos(45°) × rayon sous le centre,
soit une vingtaine de points au-dessus du bord sur une boîte de 186. La bande
vide se lisait comme un espace entre le chiffre et les barres ; elle est reprise
par une marge négative, avec l'arithmétique écrite à côté du nombre.

**Le mint est `#08c99c` dans les deux thèmes, et ce qu'il coûte est mesuré, pas
caché.** La variante assombrie a été essayée et refusée à vue : elle se lisait
comme une autre couleur, plus terne, et non comme la même adaptée. Prix : **2,13:1
sur blanc**, sous le 4,5:1 d'une étiquette et sous le 3:1 d'une forme dessinée.
En thème clair, tout ce qui porte l'accent est donc pâle. Sur le sombre il
atteint 9,60:1.

**Le test enregistre la mesure au lieu d'asséner un seuil que la palette ne
tient plus.** Supprimer l'assertion aurait effacé la connaissance ; la garder
aurait fait échouer la CI sur une chose déjà décidée. Elle vérifie donc la
valeur exacte et nomme la sortie : **si ça gêne à l'usage, la réponse n'est pas
un vert plus sombre — c'est une surface plus sombre derrière lui.**

**Changer une couleur de marque casse ce qui empruntait son jeton.** Deux cas,
et aucun n'était visible avant de mesurer :

- `onAccent` a dû passer au quasi-noir (blanc sur mint : 1,81:1). Or le bouton
  de suppression peignait `danger` et écrivait `onAccent` dessus — le noir sur
  le rouge tombe à 4,16:1. D'où un jeton **`onDanger`** propre : deux fonds
  différents ne prennent plus la même étiquette.
- Le **réticule du scanner** empruntait `onAccent` parce qu'il se trouvait être
  blanc. Il est dessiné sur un flux caméra, pas sur une surface que
  l'application peint : il serait devenu quasi noir sur l'étagère sombre où se
  trouve justement un code-barres. Règle qui en sort : **ce qui est posé sur du
  contenu que l'application ne peint pas ne prend pas un jeton de thème.**

**Le chiffre des calories reste dans la couleur du texte, quel que soit
l'état.** C'est la seule chose que le §8.3 exige lisible sans aucune
interaction, et un nombre rouge sur une carte se lit comme une erreur avant de
se lire comme une quantité. L'anneau autour dit déjà l'état, là où un état a sa
place.

**Quatre aliments plutôt que quatre moments.** Le lever, le midi et la nuit
séparaient proprement les trois repas fixes mais laissaient la collation seule à
n'être pas un moment — une intruse parmi ses propres sœurs. Café, couverts,
verre de vin, carotte : chacun se reconnaît sans être déduit, et aucun n'est
l'exception. Coût connu et assumé : une fourchette dit « un repas » en général
plutôt que « déjeuner » en particulier.

Le vin est tenu à l'écart du rouge destructif **par la saturation et non par la
teinte** — ce sont les deux seuls rouges d'une carte de repas, et l'un des deux
veut dire « ça supprime ».

**Deux entrées de menu pour une seule pensée, c'est une de trop.** « Changer de
repas » et « modifier les objectifs » forçaient l'utilisateur à choisir quelle
moitié d'une modification il voulait **avant** qu'on lui montre l'une ou
l'autre. Fusionnées en « Modifier le repas », elles deviennent aussi
**atomiques**, ce qu'elles n'étaient pas : deux écritures voulaient dire qu'un
arrêt forcé entre les deux pouvait laisser un repas renommé avec ses anciens
objectifs (§2.2). Le test qui compte n'est pas que la fusion marche — c'est
qu'un changement refusé pour doublon n'ait **rien** bougé, chiffres compris.

Corollaire de câblage : les repas voisins ne remontent plus du carrousel
jusqu'à l'écran. La modale lit la journée elle-même et décide là quels types
sont libres — un paramètre de moins à faire traverser trois composants pour
répondre à une question que le destinataire pouvait poser lui-même.

**Une jauge pleine n'est pas un événement.** Atteindre l'objectif veut dire
qu'il ne reste rien, ce qui est le but *atteint* : l'arc se ferme donc dans la
couleur ordinaire et la garde tant que le dépassement reste petit. Le rouge y a
été posé un temps, puis une bande ambre — et l'ambre était pire, parce qu'elle
mettait un avertissement sur l'instant de la réussite **puis un second juste
après**. Deux états, un seuil, rouge seulement au-delà de la marge.

**La marge est de 50 kcal, absolue, et pas un pourcentage.** La différence n'est
pas cosmétique : 10 % accorde 260 kcal de tolérance à une journée
d'entraînement à 2 600 et seulement 140 à une journée de repos à 1 400. Le mou
qu'un pourcentage donne est maximal exactement là où l'objectif est le plus dur
à tenir, ce qui est à l'envers. Cinquante kilocalories, c'est un biscuit,
n'importe quel jour.

**Deux cercles sur une rangée doivent faire la même taille, ou ils cessent
d'être une paire.** L'anneau du repas et le bouton d'ajout sont aux deux bouts
de la même ligne, et l'œil lit une paire avant de lire l'un ou l'autre. À 34
contre 54, c'étaient une petite chose et une grande qui se trouvaient toutes
deux rondes. Une seule constante sert les deux, pour qu'ils ne divergent pas à
la prochaine retouche.

**Un compromis de contraste doit rester un seul compromis.** L'étiquette blanche
sur le mint est à 2,13:1 — exactement ce que l'accent coûte déjà contre une
carte blanche. Le quasi-noir aurait été lisible (8,98:1) et a été refusé à vue :
il se lisait comme une étiquette noire sur un bouton vif plutôt que comme un
contrôle plein. Le test ne vérifie donc pas un seuil mais **que le compromis ne
s'aggrave pas** : l'étiquette sur l'accent n'est jamais pire que l'accent sur
du blanc. Et la même valeur dans les deux thèmes, parce que le fond est le même
hex dans les deux : un bouton d'une seule couleur ne peut pas porter deux
étiquettes selon un réglage qui ne le change pas.

**Un titre fait ce qu'une carte ne peut pas faire seule : dire ce qu'elle est.**
« Résumé » et « Alimentation » sont deux questions différentes — ce à quoi la
journée revient, et ce qui a été mangé — et des cartes empilées se lisent comme
une seule liste tant que rien ne les nomme. Ferrés à gauche et en gras : ils
appartiennent à la page, pas à la carte en dessous. Et tirés vers le bas sur
elle, écartés de celle du dessus, parce qu'un titre appartient à ce qui le
suit.

**`calendar` n'a pas de variante `.fill`.** Seulement `.circle.fill`. Donc rendre
les icônes d'en-tête « pleines » obligeait à choisir : apparier un disque plein
et un glyphe plein ordinaire aurait fait lire une icône comme un bouton et
l'autre comme une étiquette. Les deux sont passées au disque.

**Un titre de barre native n'est pas atteint par un composant `Text`.** La barre
est une `UINavigationBar` et son titre est peint par UIKit, pas rendu dans
l'arbre React : `core/ui/text.tsx` ne le voit jamais. Sa police vient de
`headerTitleStyle` ou de nulle part — et rien n'étant posé, la date est restée
en San Francisco au-dessus d'une page entièrement en Nunito, sans que rien ne
le signale. **À vérifier pour tout texte peint par le système** : titres de
`Stack`, `Alert`, `ActionSheetIOS`, molettes.

**Une quatrième fonte pour une seule ligne, et c'est justifié.** Bold était la
plus lourde embarquée, donc « encore plus gras » n'avait nulle part où aller :
demander 800 contre un fichier Bold fait **synthétiser** le surplus à iOS au
lieu d'utiliser une graisse plus lourde. `Nunito-ExtraBold` existe pour le nom
de la journée et rien d'autre.

**SF Symbols n'a pas de calendrier rempli.** `calendar` n'existe qu'au trait, et
tous ses remplissages sont des `.circle.fill` — le glyphe dans un disque opaque,
ce qui n'est pas le glyphe lui-même plein. `31.square.fill` est la seule
métaphore de date réellement pleine du jeu, et c'est celle d'Apple.

**Et les noms de symboles sont vérifiables ici, ce que j'ignorais.**
`sf-symbols-typescript` type `SFSymbol` comme l'union de tous les symboles
réels : un nom inventé échoue au `tsc` au lieu de rendre un carré vide sur
l'appareil. Le point ouvert qui disait le contraire tombe.

**Une surcharge ne suffit pas à « changer le modèle » d'une journée.** Elle
n'est lue que tant que la journée est **virtuelle** ; sur une journée
matérialisée elle écrit une ligne qui ne change rien à l'écran, la journée
portant ses propres repas (§8.1). Proposer le contrôle là et n'avoir aucun effet
aurait été **un contrôle qui ment**. `setDayTemplate` fait donc les deux moitiés
en une transaction : la surcharge est enregistrée, et les objectifs du modèle
choisi sont appliqués à la journée quand elle existe déjà.

Pas de rétroactif pour autant : le §8.2 fait de l'action de l'utilisateur sur
une journée l'acte qui la définit, et c'est une action sur *cette* journée, une
fois. Deux refus sont écrits dans la fonction — une journée virtuelle n'est pas
matérialisée au passage (choisir n'est pas agir), et « suivre le planning » sur
une journée dont le planning ne dit rien **ne vide pas** ses objectifs, ce qui
serait un effacement que personne n'a demandé.

**Trois comportements derrière une seule ligne en cachaient un manquant.** Le
contrôle était tour à tour un constat, un bouton « appliquer les objectifs » et
un sélecteur — et le cas qui comptait le plus n'existait pas : dès le
petit-déjeuner logué, le modèle de la journée cessait d'être modifiable. Quand
un composant a trois branches selon l'état, la question à poser n'est pas si
elles sont justes mais **s'il en manque une**.

**Apparier par position était faux, et il a fallu une suppression pour le
voir.** Appliquer un modèle marchait index à index. Supprimez le dîner et tout
ce qui suit le trou remonte d'un cran : les objectifs du dîner s'écrivaient sur
la collation. **Rien ne le montrait** — les chiffres étaient plausibles, ils
étaient simplement les mauvais, ce qui est le seul genre de faux qui compte.

L'appariement se fait par **nom**, ce que les noms peuvent porter depuis qu'ils
sont une liste fermée de quatre avec au plus un petit-déjeuner, un déjeuner et
un dîner par journée : « le dîner de la journée » est une question à une seule
réponse. Les collations, la seule sorte qui se répète, sont appariées dans
l'ordre et le reste est rendu — manquantes d'un côté, non réclamées de l'autre.

**Un repas du modèle que la journée n'a plus revient, à sa place dans le
modèle.** Appliquer un modèle réordonne la journée : chaque repas qu'il nomme
prend sa place dans sa séquence, et ce qu'il ne nomme pas suit derrière dans
l'ordre qu'il avait déjà.

**Renuméroter est sûr, et pour deux raisons qui ne se devinent pas.** Les
entrées pendent de `day_meal.id` et **jamais** de sa position, donc rien de
logué ne bouge quand les rangs changent. Et `day_meal` ne porte délibérément
aucun index unique sur `(date, position)` — noté comme une rigueur inégale du
§2.3 dès la tranche 1 — ce qui laisse ces lignes traverser des positions en
double au milieu de la transaction au lieu d'exiger un emplacement temporaire
pour permuter. `food_portion`, qui porte un tel index, avait dû être remplacée
en bloc pour exactement ce motif. **Une absence de contrainte qui paie quatre
tranches plus tard.**

Ce qui reste intouché : un nom, une entrée, et tout repas que le modèle ne
nomme pas — celui-là garde tout et ne perd que ses chiffres.

**`Link.AppleZoom` a été essayé pour le calendrier, puis retiré — et le motif
vaut pour tout usage futur.** La transition d'Apple **recule l'écran
présentateur** pendant que la feuille est levée, et `LinkZoomTransitionSource`
n'expose que `identifier`, `alignment` et `animateAspectRatioChange` : rien qui
l'en empêche. Vérifié dans l'API, pas supposé. Le Journal rétréci derrière, avec
la fenêtre blanche au-dessus et en dessous, coûtait plus que l'ancrage au bouton
ne rapportait.

**Trois choses apprises en chemin, toutes payées cher.** Une transition native
et une animation maison ne peuvent pas partager une fenêtre : `OverlayPanel`
repliait sa fenêtre *puis* appelait `router.back()`, si bien qu'au départ de la
navigation il ne restait rien à rétrécir vers le bouton. Un voile est incompatible
avec le zoom : c'est l'écran *tout entier* qui sort du bouton, assombrissement
compris. Et **passer de la modale au push ne supprime pas le recul** — je l'ai
cru, essayé, et ça a coûté le geste au passage : le renvoi interactif d'une pile
native est le balayage horizontal, donc un glissement vers le bas n'a rien à
suivre.

**La fenêtre n'a aucun fond posé**, d'où le blanc. `backgroundColor` dans
`app.config.ts` ou `expo-system-ui` le corrigeraient, les deux nativement, donc
au prix d'un cycle CI. Non fait : sans zoom, plus rien ne découvre la fenêtre.

## Ce que la tranche 6 a établi

**La contrainte qui ressemble à un bug et n'en est pas.** `recipe_ingredient.food_id`
porte une clé étrangère **sans clause `ON DELETE`**, donc `NO ACTION`, que SQLite
applique **immédiatement**. Lue seule, elle contredit le §5.3 : supprimer un
aliment ingrédient échouerait, alors qu'aucune suppression n'est jamais bloquée.

Elle cesse de le contredire dès que D5/R3 est obéi — le gel remplit la capsule
et rompt le lien dans une transaction unique, donc au moment du `DELETE` plus
rien ne référence l'aliment. Ce n'est donc pas un obstacle à contourner :
**c'est la seule chose qui prouve que le gel a tourné.** Simplifier `deleteFood`
un jour, et la base refuse bruyamment au lieu qu'une recette perde ses macros
en silence.

Le test le pose **des deux côtés**, et c'est la seconde moitié qui compte :
`deleteFood` passe, le `DELETE` brut sur une situation identique lève. Sans
elle, le test passerait aussi bien contre un `ON DELETE SET NULL` — c'est-à-dire
contre la version qui perd les macros. `SET NULL` était le candidat tentant et
il est refusé pour la raison même qui fait exister R3 : il rompt le lien **sans**
remplir la capsule.

**Le gel est UN SEUL `UPDATE`.** Une boucle aurait rendu l'atomicité de R3
affaire de chance ; là, un demi-gel est *inexprimable*. L'aliment est lu dans
la transaction, donc la capsule porte ce que `readFood` rend — la même forme
que tous les autres lecteurs voient — et non ce qu'une sous-requête SQL aurait
reconstruit à côté. Et il fige l'aliment **tel qu'il se lit à cet instant**,
pas tel qu'il a été créé : le §8.5 fait de la correction d'un produit copié le
mécanisme principal de compensation de la source, donc figer les valeurs de
création réinstallerait en silence l'erreur qu'on vient de corriger, sur le
seul chemin où personne ne la cherchera.

**Une recette ne stocke aucune macro, donc son total est calculé DEUX FOIS par
construction.** En SQL pour la bibliothèque — une lecture par recette serait
impayable sur un chemin que D16 budgète en dixièmes de seconde — et en
TypeScript pour l'écran d'une recette, qui tient déjà tous ses ingrédients et
n'a aucune raison de redemander à SQL de les sommer. Les deux sont justes et
aucune n'est retirable.

Ce qui les tient égales n'est donc pas le soin mais **un test, sur une
bibliothèque générée dont un tiers des lignes sont gelées**. Elles
s'accorderaient sur tous les exemples qu'on penserait à écrire à la main. Le
partage est net : SQL multiplie et somme, `recipe-macros` divise et rien
d'autre.

**Les deux rendements sont LA MÊME FORMULE, et il faut le dire tout haut.**
`consommé / rendement`, à l'identique : deux portions sur quatre, 250 g sur
850 g. Le type de rendement ne change que l'unité écrite sur la molette.
L'implémentation évidente est un `switch` à deux branches identiques, et la
seconde branche est exactement l'endroit où une divergence finit par
s'introduire. Un test la fixe.

**`COALESCE` et `LEFT JOIN` font qu'un ingrédient gelé n'a aucun cas
particulier** : la valeur vivante, ou la capsule, en une expression sans
branche. Un `INNER JOIN` aurait fait disparaître les lignes gelées et une
recette aurait silencieusement perdu des calories — précisément ce que le §5.3
promet qu'il n'arrive pas.

**Le §5.3 — « modifier un aliment met à jour les recettes » — n'a demandé
aucune ligne de code.** C'est une propriété de **ne pas stocker** : le total se
somme depuis les lignes vivantes à chaque lecture, donc corriger un aliment
déplace toutes les recettes qui l'utilisent et ne déplace rien de ce qui a déjà
été mangé. Un test l'énonce quand même, parce qu'il énonce D5 en entier en un
fichier.

**Le brouillon transporte la capsule gelée, et c'est porteur.** Les ingrédients
sont remplacés en bloc à l'enregistrement, sur le précédent de
`replacePortions` ; mais les valeurs d'une ligne gelée n'existent **nulle part
ailleurs**, son aliment étant supprimé. Sans elle, **ouvrir une recette et
l'enregistrer sans rien changer** détruirait la seule copie des macros d'un
aliment supprimé, et le total bougerait sans raison visible. Vérifié par
mutation : deux tests rougissent.

**La règle qu'aucune contrainte ne peut porter, parce qu'elle est
inter-tables** : `unit` doit égaler le `base_unit` de l'aliment.
`ck_ingredient_unit` tient la colonne à `g|ml` mais ne voit pas l'aliment, et
des millilitres contre des macros pour 100 g donnent un nombre faux et
parfaitement plausible. Elle vit à la frontière d'écriture, avec son test.

**Un ingrédient se saisit en unité de base, jamais en portions.** Le §6.1
laisse l'unité ouverte et cette table n'a pas la paire `portion_name` /
`portion_quantity` qu'une entrée de journal possède — une portion ne pourrait
donc s'exprimer qu'en faisant du nombre un compte de portions, ce qui casse la
règle de la tranche 3 dont dépend le `SUM` sans clause. L'éditeur peut proposer
les portions comme commodité de saisie ; ce qui atterrit en base est toujours
des grammes ou des millilitres.

**Un rendement en poids veut toujours dire des grammes.** Une recette mélange
les deux unités de base par nature — 300 g de tomates et 200 ml de bouillon —
donc aucune unité ne peut sommer les deux et le rendement ne se dérive pas des
ingrédients. Un plat fini se pèse. Le §5.1 le dit par l'autre bout : le poids
d'un aliment est cru et non préparé, et « l'écart est absorbé par le rendement
des recettes » — or cet écart est de l'eau.

**Le bloc porte les lignes AJUSTÉES, jamais un identifiant de recette à
relire.** C'est le §8.6 points 2 et 3 : l'ajustement n'existe que sur l'écran
qui l'a fait, et le redériver à l'écriture le jetterait — l'utilisateur
confirmerait un jeu de chiffres et un autre serait écrit.

C'est **l'inverse exact du chemin `food`**, où l'entrée *est* construite en
relisant l'aliment dans la transaction, et la différence est de principe : une
entrée d'aliment fige une **référence** dont la base fait autorité, une
occurrence fige une **décision** qui n'existe que sur l'écran qui l'a prise.

**Les deux étapes du §8.6 restent deux, et l'ordre n'est pas cosmétique.** Un
seul écran coûterait moins de touchers, et les lignes se re-échelonnant pendant
la frappe seraient l'énoncé le plus clair de ce que la quantité fait. Refusé
parce que **les deux éditions ne commutent pas** : ajuster une ligne *puis*
changer la quantité devrait re-échelonner depuis la recette, effaçant
l'ajustement sans que rien ne le dise. Régler la quantité d'abord supprime le
cas, et revenir en arrière devient un acte explicite dont re-dériver est la
réponse attendue.

**Le `quantity` d'un parent `recipe` n'est PAS en unités de base — c'est
l'ombre de l'invariant, pas une entorse.** Il dit combien de la recette a été
mangé : portions dans `portion_name`, grammes dans `base_unit`,
`portion_quantity` toujours `NULL` parce qu'une portion de recette n'a pas de
taille en unités de base — c'est précisément ce qu'un rendement en portions
veut dire.

C'est sûr pour une seule raison : **le parent ne porte aucune macro**, donc
`SUM(quantity * NULL)` vaut `NULL` quelle que soit la quantité. Et rien d'autre
ne peut porter cette information, une recette étant un objet vivant qui a pu
changer de rendement depuis. D'où le test qui rend la chose falsifiable : muter
la quantité d'un parent ne déplace **aucun** total, et une troisième assertion
vérifie que la mutation a bien eu lieu — sinon les deux premières porteraient
sur un non-événement. Même parade que `display_ref_qty` en tranche 3.

**La fuite que personne n'aurait vue.** Une ligne `recipe_item` porte un
`source_food_id` et une quantité, donc avant le filtre `kind = 'food'` elle
était éligible à devenir « la dernière quantité pour cet aliment ». Loguer une
bolognaise faisait offrir à l'oignon une dose d'**ingrédient** sur l'écran
d'ajout — échelonnée par la part de recette mangée, puis ajustée à la main.
Plausible, faux, invisible : trente grammes d'oignon est une quantité d'oignon
parfaitement croyable.

Le filtre est sur les **deux** lectures, et le test qui les tient d'accord
depuis la tranche 4 génère désormais des blocs. Vérifié par mutation : le
retirer fait rougir deux tests.

**Une ligne mise à zéro s'en va, elle n'est pas refusée.** Retirer un ingrédient
pour une fois est exactement ce que l'écran d'ajustement sert à faire, et
demander de supprimer la rangée serait une seconde façon de dire la même chose.
Le filtrage tourne **dans** `addEntries`, donc l'écran ne peut pas oublier de le
faire. Un bloc vide, lui, est refusé : un parent sans enfant ne porte aucune
macro et loguerait un repas à zéro calorie qui a l'air d'une mesure.

**Le catalogue d'export sait lire une clé primaire composite.** Vérifié par
exécution avant d'écrire quoi que ce soit : Drizzle laisse `column.primary` à
`false` sur **chaque** colonne d'une PK déclarée au niveau table. La moitié
bruyante était le test de couverture ; la moitié silencieuse aurait été la
perte de l'`ORDER BY` de `recipe_tag`, donc deux exports des mêmes données
cessant d'être le même fichier.

**Et le mécanisme a fonctionné trois fois de plus.** `0005` a fait rougir
quatre tests d'un coup, dont **deux imprévus** — et l'un des deux était un
défaut latent de la tranche 5 : « 0004 ajoute quatre tables et rien d'autre »
passait par `applyMigrationsAfter`, **qui n'est pas borné par le haut** et
allait donc casser à la migration suivante quel qu'en soit le contenu. D'où
`applyOneMigration`, la primitive qui pose vraiment la question. Puis le jeu de
démonstration, en semant des recettes, a fait tomber « une archive écrite avant
l'existence des tables d'aliments » : la fixture décrivait une base qui n'a
jamais existé, une archive à `0001_journal` ne pouvant pas porter de recettes
non plus.

**Une règle de pluriel a été supprimée.** `describeYield` en avait une (« plus
de 1 ») à côté de celle de `portion-text` (« 2 ou plus »), et les deux divergent
exactement sur les valeurs qu'une demi-portion produit. Tout passe désormais par
`formatPortionCount`.

**`searchFoods` tolère une entité sans marque.** Une recette a un nom et **pas**
de marque — pas une marque nulle — et ajouter la colonne à `RecipeListItem`
pour satisfaire une signature aurait été la vue qui se plie à la recherche. Le
remède est un `== null` au lieu d'un `=== null`, sans quoi le pliage serait
appelé sur `undefined` ; un test l'attrape.

**Le filtrage par tag est un SECOND filtre, composé avec la recherche, jamais
fondu dedans.** Taper « végétarien » et toucher la puce « végétarien » sont deux
questions différentes, et une recherche qui comprendrait les deux devrait les
classer l'une contre l'autre : une recette *nommée* « gratin végétarien »
vaut-elle mieux qu'une recette *taguée* végétarien ? Quelle que soit la réponse,
l'ordre de la liste cesserait d'être explicable. **Un seul tag à la fois**, pour
la même raison : deux puces posent aussitôt la question union/intersection que
personne n'a tranchée.

**Pas de bouton « + » sur une rangée de recette**, là où toute rangée d'aliment
en porte un. Le §8.4a v2.4 promet que la quantité affichée **est** celle
qu'ajoute le bouton ; un aliment tient cette promesse par sa chaîne de
pré-remplissage à quatre temps, une recette n'a aucun équivalent — le §8.6 fait
de la quantité consommée sa *première* question. Un « + » inventerait une
quantité ou ouvrirait un écran, et les deux défont ce que les rangées voisines
viennent de promettre.

**Choisir une recette remplit le panier**, comme un aliment et contrairement à
un repas récent : le §8.4a écrit la ligne des recettes mot pour mot comme celle
des aliments, et l'exception de la tranche 5 était motivée par le fait qu'un
repas récent est « un repas entier en un geste », ce qu'une recette n'est pas.

**Le tap d'un bloc replie, il n'édite pas** — et c'est une divergence signalée
(`specs §14.7` n° 1). Le §8.3 point 6 dit que toucher une entrée ouvre l'écran
d'ajustement ; sur un bloc, la rangée vit dans `SwipeToDeleteRow`, **qui possède
le tap** parce qu'il le met en course avec le pan — l'arbitrage qui manquait en
tranche 4. Y imbriquer un second `Pressable` pour le chevron remettrait le
système de responder de React Native dans un sous-arbre de gestes, c'est-à-dire
le piège documenté déjà payé une fois. L'ajustement est un bouton nommé au pied
du bloc ouvert, ce qui est mieux placé de toute façon : il est là où sont les
ingrédients qu'il va éditer.

**Les enfants d'un bloc ne se balaient pas.** Une ligne d'ingrédient n'est pas
une entrée que quelqu'un a choisie ; la supprimer laisserait une occurrence qui
ne correspond plus à rien, et le §8.6 donne exactement une façon de changer une
occurrence. Balayer le parent emporte tout, par cascade — une seule instruction,
ce qui est pourquoi `deleteEntry` n'a jamais eu besoin d'une boucle.

**Imbriquer les enfants a rendu le repas sommable depuis ses rangées.** Avec les
enfants **dans** leur parent plutôt qu'à côté, additionner les `total` des
rangées rendues donne le repas, sans clause et sans risque de compter un bloc
deux fois. Un test le compare à la somme SQL.

**L'avertissement de suppression apprend au lieu d'alarmer.** Rien n'est perdu
et il ne le dit pas ; il dit que le **lien** part, donc qu'une correction future
n'atteindra plus ces ingrédients. `describeRecipeUses` rend `null` sur
`undefined` — « pas encore lu » n'est jamais « aucune », faute de quoi la
confirmation mentirait dans le sens rassurant, le seul sens que ce projet
n'autorise jamais.

**La version de format d'export n'a pas bougé, et c'était écrit.** La tranche 2
avait posé que la version 1 versionne l'**enveloppe** et jamais le contenu, et
nommé les seules choses qui la déplaceraient — compression, NDJSON, *ingrédients
imbriqués sous leur recette*. Quatre tables entrent, la version reste 1, et le
contenu est couvert comme prévu par le tag de migration. Une tranche qui aurait
suivi les tables en serait à 4 pour rien, chaque incrément étant une occasion
d'orpheliner une archive.

**Un cycle d'import type-only, le premier du dépôt.** `recipes.ts` importe
l'objet `food` ; `nutrition.ts` importe seulement le **type** `RecipeId`. Un
`import type` est effacé avant le bundler, donc le graphe d'exécution reste à
sens unique — mais `planning.ts` n'importe rien de `nutrition.ts`, donc aucun
précédent n'existait. Vérifié par `npm run bundle:ios`, pas supposé.

## Ce que le filtre de listes a établi (14/09/2026)

**Trois listes empilées étaient une file d'attente.** L'écran d'ajout a gagné
ses listes une par tranche — aliments en 3, Open Food Facts en 4, repas récents
en 5, recettes en 6 — et à la quatrième les recettes se retrouvaient sous les
repas sous deux listes d'aliments. Sur l'écran que D16 budgète en **touchers**,
c'était devenu un défilement. Un filtre segmenté les remplace : toujours
exactement un actif, jamais aucun, Aliments par défaut.

**Le filtre est SOUS le champ, pas au-dessus.** Lu de haut en bas il dit
« cherche ceci, parmi ceux-là ». Au-dessus, il aurait séparé les deux entrées
rapides — Scanner, Saisie libre — du champ qu'elles surplombent délibérément
depuis la tranche 4.

**Les trois listes ne répondent pas de la même façon au terme, et c'est un fait
sur elles.** Aliments et recettes échangent l'accès rapide contre **toute la
bibliothèque** dès qu'un terme est tapé ; un repas récent ne peut être que
*filtré*. La raison est dans le §14.6 n° 5 : un repas récent **est** un repas
passé, donc il n'existe aucun repas qu'on pourrait chercher sans l'avoir déjà
mangé. Chercher à l'intérieur de l'accès rapide serait l'alternative plausible
et elle est fausse — ce dont on tape le nom est précisément ce que l'accès
rapide ne contient pas.

**La recherche distante appartient aux Aliments seuls, et le déclencheur est
silencieux plutôt que désactivé.** Valider le champ sous Recettes ou Repas ne
fait rien ; changer de filtre efface le résultat distant. C'est le seul geste
de cet écran qui coûte quelque chose **hors** du téléphone, et dépenser une
requête contre le quota de D11 pour une liste que personne ne regardera est
exactement ce que le limiteur existe pour éviter. Vérifié à la source plutôt
que supposé : `useOffSearch` est `enabled` sur un terme soumis non vide, donc
mettre `submitted` à `null` suffit à ce qu'aucune requête ne parte.

**Le bandeau d'échec suit la liste qu'il explique.** Il était « directement
sous le champ » ; il est maintenant sous le filtre et seulement avec les
aliments. Sous les recettes, il parlerait de quelque chose qui n'est pas à
l'écran.

**Un titre de section qui répète l'onglet actif est le même mot deux fois.**
`RecipesSection` et `RecentMealsSection` ont perdu le leur. Les aliments
gardent les leurs — « Favoris », « Récents » — parce que ce sont deux groupes
sous un seul onglet, ce qui est autre chose.

**Les recettes ont leurs deux sections, comme les aliments.** « Favoris » et
« Récents » séparés, pas une liste fusionnée. La fusion a été essayée d'abord,
sur l'argument que l'étoile de chaque rangée dit déjà dans quelle moitié elle
est — vrai d'une rangée lue seule, faux d'une liste lue comme une forme. Ce que
le titre achète est de savoir **où les favoris s'arrêtent**, ce qu'aucune marque
par rangée ne peut dire. Un terme tapé les refond en une seule « Mes recettes »,
parce qu'à ce moment le partage n'a plus rien à dire : le classement est
l'ordre, et un favori est là où la correspondance le met.

**Une rangée de repas dit ce qu'il y a dedans, pas combien il y en a.**
« 8 lignes » dit la taille du repas et jamais ce qu'il était : deux repas de
huit lignes ne se distinguent par rien, ce qui est la seule chose que cette
liste ait à faire. Une ligne, coupée par la plateforme — rien ne la mesure, une
liste qui rentre est rare et une liste coupée nomme quand même les deux ou
trois premières choses, ce qui identifie le repas.

**Un bloc de recette y donne SON nom, jamais ses ingrédients.** Un repas est
fait de ce qui a été **choisi**, et les ingrédients d'une recette ne l'ont pas
été un par un.

**Et ça a découvert deux réponses à une question.** `entryCount` était un
`count(*)` sur la jointure ; les noms ne comptent que les lignes de tête. Un
repas « Amorce + Curry » était donc rapporté à **quatre** lignes tout en en
nommant deux, et l'étiquette VoiceOver lisait la contradiction à voix haute. Le
compte est désormais **dérivé** des noms — une seule source, plus de désaccord
possible. C'est le test écrit pour la nouvelle ligne qui l'a trouvé, pas une
relecture.

**La recherche est inerte sous Repas, et désactivée plutôt que cachée.** Un
repas récent **est** un repas passé : il n'y a aucune bibliothèque derrière lui,
et filtrer dix rangées déjà à l'écran n'est pas une recherche mais une façon
d'en cacher certaines. Désactivée et non retirée parce que le filtre est
directement en dessous — un contrôle qui saute quand le choix change est pire
qu'un contrôle qui a visiblement rien à faire. Et le champ s'affiche **vide**
pendant qu'il est inerte plutôt que de montrer un terme qu'il n'applique pas :
un « poulet » grisé au-dessus d'une liste qui l'ignore serait un mensonge. Le
terme survit dans l'état, donc revenir le restaure.

**Le « + » de la bibliothèque crée le type affiché au lieu de demander lequel.**
Il posait une question à deux réponses dans une feuille d'action ; le filtre
vient de rendre la réponse **visible à l'écran**, donc la reposer serait
redemander ce que l'utilisateur vient de dire. Deux touchers pour ce qui en
vaut un, à chaque fois. Créer l'autre type coûte un toucher sur le filtre, et
devient prévisible au lieu d'être mémorisé.

**`core/ui/segmented.tsx` arrive avec deux utilisateurs réels le premier jour**,
ce qui est exactement ce que la règle de migration demande. Il diffère de
`TagFilter` sur un point qui n'est pas cosmétique : **toucher l'option active
ne fait rien**, là où toucher la puce active l'efface. Un tag *narrowe* une
liste qui a du sens sans lui ; celui-ci *sélectionne* quelle liste s'affiche, et
« aucune » n'est pas un état que quelqu'un a demandé.

*Duplication connue, nommée plutôt que cachée* : `unit-toggle.tsx` et
`yield-toggle.tsx` dessinent la même chose et lui sont antérieurs. Ils sont
laissés tels quels — toucher du code livré pour la seule cohérence est ce que
ce projet décline — mais celui des deux qu'on éditera ensuite pour ses propres
raisons doit se replier dessus au lieu d'être copié une quatrième fois.

## Deux renversements, et pourquoi ils tiennent (14/09/2026)

**Un repas récent passe par le panier.** Il écrivait et fermait, et c'était une
exception consignée (`specs §14.6 n° 8`) : mettre en attente semblait
transformer un toucher en un toucher plus une confirmation.

L'argument était plus faible qu'il n'en avait l'air. Le « Confirmer » est
**déjà là** pour le reste du repas, donc l'exception ne faisait économiser
aucun geste à qui ajoutait autre chose en même temps — et elle rendait
impossibles trois choses : combiner un repas récent avec un aliment, le
corriger avant qu'il n'atterrisse, le retirer sans qu'il ait été écrit. Le
« d'un coup » du §8.4a est satisfait par le geste unique qui remplit le panier ;
rien n'y dit que le geste doit atteindre la base.

**La ligne de panier d'un repas porte un IDENTIFIANT, là où une recette porte
ses lignes.** L'asymétrie est le point : une recette a été **ajustée** à
l'écran, donc ce que l'utilisateur a confirmé n'existe que là ; un repas récent
n'a été touché en rien. Le relire au moment de l'écriture est donc strictement
meilleur — le §14.6 n° 6 veut les macros des aliments telles qu'elles se lisent
**aujourd'hui**, et une copie prise au remplissage du panier serait plus
vieille de quelques secondes pour rien.

**`addRecentMeal` n'existe plus.** Le rejeu est devenu `replayMeal`, privé, une
étape de la transaction d'`addEntries` — la règle qu'`ensureMaterialized` et
`ensureOffFood` suivent déjà : ce que l'utilisateur enregistre explicitement
s'écrit, ce qu'il se contente de choisir non.

**Une conséquence qui change un comportement, signalée** : confirmer un panier
contenant un repas depuis vidé **matérialise** la journée, là où l'ancien
chemin refusait. L'ancien refus lisait « un repas vide est un panier vide ». Le
panier, lui, n'était pas vide. Le §8.2 fait de l'action de l'utilisateur l'acte
qui définit une journée, et une journée matérialisée sans rien dedans est déjà
l'état d'une journée vidée de ses entrées.

**Une ligne de repas au panier ne se corrige pas.** Le §8.4 v2.3 dit que
toucher une ligne rouvre le choix qui l'a faite ; pour un repas ce choix était
« ce repas-là », qui n'a pas de milieu à rouvrir. Elle se reprend comme elle
s'est refusée, par un balayage.

---

**Les deux écrans d'une recette n'en font qu'un, et l'objection tombe au lieu
d'être acceptée.** Ils étaient séparés parce que les deux éditions ne commutent
pas : ajuster une ligne puis changer la quantité devrait re-dériver depuis la
recette, effaçant l'ajustement en silence (`specs §14.7 n° 2`).

Changer la quantité **ré-échelonne** désormais au lieu de re-dériver. Un
ajustement est conservé comme un **rapport** — la moitié de crème à deux
portions reste la moitié à quatre — et sur le chemin ordinaire, où rien n'a
encore été ajusté, les deux sont arithmétiquement la même chose :

```
q × (c₁ / rendement) × (c₂ / c₁)  =  q × (c₂ / rendement)
```

Un test le fixe. Ce que la fusion achète est exactement ce que la séparation
coûtait : les lignes se re-échelonnent sous le doigt, ce qui est l'énoncé le
plus clair de ce que la quantité fait.

**Le ré-échelonnement s'applique au blur, pas à chaque frappe.** En direct il
passerait sur « 1 », puis « 13 », puis « 137 » — trois passes sur la liste,
deux à des montants que personne n'a voulus, sur un formulaire dont les
chiffres sont lus pendant qu'ils bougent. Même arbitrage que les molettes de la
tranche 4.

**Une ligne mise à zéro reste à zéro quand la quantité change.** Elle a été
retirée de cette fois-là ; changer la part du plat qu'on mange ne l'y remet pas.

**Et échelonner depuis zéro est refusé plutôt que toléré.** Le champ passe par
la chaîne vide pendant qu'on le retape. Rendre les lignes inchangées les
figerait en silence à l'ancienne quantité, donc `rescaleLines` rend `null` et
l'appelant re-dérive.

**La quantité existe AVANT les lignes, et c'est structurel.** La tranche 4 l'a
payé sur l'appareil : les molettes se montaient sur un défaut et un effet les
déplaçait quand la requête répondait — **un effet tourne après que son rendu a
été peint**, donc elles tournaient visiblement en s'ouvrant. L'écran est donc
scindé en deux composants et seul le **corps** attend ; il initialise son état
depuis ses props, dans l'initialiseur, jamais dans un effet.

Corollaire : **`autoFocus` + `selectTextOnFocus` fonctionnent ici**, là où la
tranche 3 avait constaté qu'ils ne sélectionnaient rien. La différence est la
seule qui compte — la valeur vient d'un initialiseur d'état et existe **avant**
le champ.

**Le pré-remplissage d'une recette est plus court que celui d'un aliment, et
c'est normal.** La chaîne à quatre temps du §8.4 a deux étapes sans contrepartie
ici : une recette n'a ni portions propres dont revérifier la taille, ni
`display_ref_qty`. Reste « la dernière fois, sinon un défaut » — 1 portion, ou
100 g pour un rendement en poids, faute d'analogue d'« une portion ».

**Réserve levée, et non exploitée** : le §14.7 n° 4 refusait un bouton « + »
sur une rangée de recette faute de pré-remplissage. Il devient possible. Il
n'est pas ajouté, parce que la rangée n'affiche pas de quantité et que le
§8.4a v2.4 exige que les deux aillent ensemble — ce serait un troisième
changement que personne n'a demandé.

**Aucun index derrière la lecture de la dernière quantité**, et c'est toujours
le report de la tranche 6. `ix_entry_source_recipe` refléterait
`ix_entry_source_food`, mais la règle dit qu'un index est la seule chose d'une
migration qui s'ajoute toujours plus tard, et ajouter une migration par symétrie
est ce que ce projet décline. Le jour où un vrai historique le rend mesurable,
c'est un `CREATE INDEX`.

**Le test le plus lourd de la suite a un délai à lui.** Une année d'historique
généré traverse export, validation, import et une comparaison ligne à ligne sur
quatorze tables ; il tenait sous les cinq secondes par défaut jusqu'à ce que la
tranche 6 ajoute quatre tables à chacune de ces quatre passes, et il s'est mis à
dépasser **par intermittence** — la pire façon pour un test d'échouer. L'année
n'est pas négociable : D15 donne au générateur la tâche de « vérifier les
performances sur de longs historiques », et la rétrécir pour tenir dans un délai
supprimerait le seul endroit où ça se fait. C'est le budget qui bouge.

## Le « + » des trois listes, et le repas qui se déplie (14/09/2026)

**Le bouton refusé est devenu honnête, et c'est l'obstacle qui a disparu — pas
la règle.** Le §8.4a v2.4 exige que la quantité affichée **soit** celle
qu'ajoute le bouton, et une recette n'en avait aucune à afficher : le §8.6 fait
de la quantité consommée sa première question. Le pré-remplissage lui en donne
une, donc la promesse redevient tenable.

La rangée, le bouton et l'écran d'occurrence lisent tous
`prefillRecipeQuantity` — **une valeur produite une fois**, portée sur
`RecipeListItem`. Deux chemins vers elle s'accorderaient presque toujours, et
le jour où ils divergeraient la rangée mentirait sur ce que fait son propre
bouton. Un test l'assert contre la fonction, jamais contre un littéral.

**La liste porte désormais les ingrédients, et c'est ce qui rend le toucher
unique possible.** Une requête pour toute la bibliothèque, sur le patron de
`tagsByRecipe`, plutôt qu'une lecture par rangée — le coût que la tranche 4
avait déjà refusé en étendant la quantité aux favoris et à la recherche. Le
bouton échelonne ces lignes-là, donc le chiffre affiché est le chiffre déposé.

Un test tient `recipeTotal` sur ces ingrédients contre le `total` que SQL somme,
dans **le même objet** : les deux implémentations du même nombre y sont
désormais côte à côte, ce qui rend leur désaccord immédiat au lieu d'être
lointain.

**Une rangée de recette dit deux choses différentes selon l'écran.** C'est la
règle de la tranche 4 appliquée : un seul chiffre de calories par rangée,
toujours au même endroit, et ce qu'il veut dire appartient à l'écran. À l'ajout
c'est **le prix du toucher** — la dernière quantité loguée et ses calories. Dans
la bibliothèque c'est ce que la recette **est**, par unité de rendement, parce
que c'est ce qui la rend comparable. Le composant retombe sur la seconde forme
quand l'appelant ne lui donne rien, donc la bibliothèque n'a rien à dire.

**Le repas se déplie au panier, une ligne par entrée de tête.** Il était une
ligne unique portant l'identifiant du repas source, rejouée dans la transaction
d'écriture (`specs §14.10 n° 1`). Ce que le dépliage change n'est pas le moment
mais ce que l'utilisateur peut faire : **un repas qui arrive en quatre lignes
peut en perdre une, ou en corriger une, avant que quoi que ce soit ne soit
écrit.** En une ligne c'était tout ou rien — ce que le panier existe
précisément pour éviter.

Une recette groupée à l'intérieur reste **une** ligne. Elle est une des choses
qui ont été choisies ; ses ingrédients ne l'ont jamais été un par un.

**`refreshedReference` a déménagé dans les lectures, et `replayMeal` a
disparu.** La fonction répond à « que dit cet aliment maintenant », ce qui est
une lecture, et son seul appelant était le rejeu. Plus rien dans la couche
d'écriture ne relit un aliment pour le rafraîchir : une ligne rejouée arrive
**déjà résolue** et s'écrit telle quelle.

Prix nommé : les macros sont lues **quelques secondes plus tôt**, au toucher
plutôt qu'à « Confirmer ». Le §14.6 n° 6 demande les valeurs d'*aujourd'hui*
plutôt que la capsule figée — quelques secondes ne sont pas la distinction
qu'il trace. Ce que ça rachète est la promesse du panier elle-même : une ligne
montre exactement ce qu'elle écrira.

**Les trois replis du §14.6 n° 7 ont survécu au déménagement** — saisie libre,
aliment supprimé, unité de base changée. Même règle, même raisonnement ; seul
son porteur a bougé.

**Un comportement a fait l'aller-retour, et la troisième lecture est la
bonne.** Un repas vidé entre le moment où la liste est dessinée et le toucher :

1. Rejeu autonome — ne matérialisait pas, « un repas vide est un panier vide ».
2. Une ligne au panier — matérialisait, parce que le panier n'était **pas**
   vide : l'utilisateur y avait mis une ligne et confirmé.
3. Déplié au toucher — ne matérialise pas, parce qu'il ne produit **aucune
   ligne**. Il n'y a rien à confirmer et rien à créer, sans aucun cas
   particulier.

La troisième est la meilleure parce qu'elle ne décide rien : ce que
l'utilisateur confirme est ce que le panier contient, et le panier contient ce
qu'on lui a montré.

**Une ligne rejouée ne se corrige pas**, elle se retire. Le §8.4 v2.3 dit que
toucher une ligne rouvre le choix qui l'a faite ; celle-ci n'a pas été
*choisie*, elle a été **levée** d'un repas passé, et il n'y a aucun écran
derrière elle à rouvrir.

**Et le « + » d'un repas fait exactement ce que fait la rangée.** Il n'y a pas
d'écran de quantité derrière un repas, donc rien d'autre que la rangée pourrait
vouloir dire. Il est là parce que les trois listes se lisent maintenant comme
une seule grammaire — et parce qu'un « plus » décoratif entre deux vrais serait
celui qui ne répond pas.

## Une ligne rejouée se corrige, comme tout ce qui est au panier

**Rapporté depuis l'appareil : la quantité d'un aliment venu d'un repas ne
pouvait pas être changée.** C'est moi qui l'avais bloqué, et le raisonnement
était faux. Je l'avais justifié ainsi : le §8.4 v2.3 dit que toucher une ligne
rouvre le **choix** qui l'a faite, et une ligne rejouée n'a pas été *choisie* —
elle a été levée d'un repas passé, donc il n'y aurait rien à rouvrir.

Mais c'est un aliment avec une quantité, et « combien » est exactement la
question que le panier existe pour laisser changer avant que quoi que ce soit
ne soit écrit. L'argument confondait *l'origine* de la ligne avec *ce qu'elle
est*.

**Trois écrans, et la branche est la forme de la ligne, pas une recherche :**

- une **saisie libre** rouvre ses quatre chiffres. Ses macros *sont* le choix
  (D5/R2), et il n'y a aucun aliment derrière elle à consulter ;
- une ligne **pointant encore un aliment** rouvre l'écran de quantité ordinaire,
  donc **toute** la liste de portions de l'aliment est offerte — et la ligne
  corrigée devient une ligne d'aliment ordinaire, ce qu'elle est ;
- une ligne dont **l'aliment est parti** rouvre contre sa propre capsule, avec
  la portion dans laquelle elle a été loguée et aucune autre. Il n'y a plus rien
  à interroger, et le §5.3 dit que cette suppression ne doit rien coûter à
  l'entrée.

**Le mode `frozen` de l'écran de quantité n'interroge rien**, pour la raison que
`collectOff` n'interroge rien : tout voyage sur la ligne. Il porte **sa** portion
et aucune autre — en offrir davantage demanderait une requête, et n'en offrir
aucune ferait retomber « 2 tranches » sur les grammes au premier toucher, ce qui
est exactement le défaut que cet écran venait de payer.

**Et un blocage latent de la même famille, corrigé au passage.** Corriger une
ligne dont l'aliment avait été supprimé *pendant* la session laissait l'écran
sur les points de chargement pour toujours : `undefined` (requête en cours) et
`null` (requête ayant répondu « pas d'aliment ») étaient repliés l'un sur
l'autre par un `?? null`. C'est la même confusion, à une fonction d'écart.

## Un défaut trouvé sur l'appareil : la molette qui s'ouvrait en grammes

**Une entrée loguée « 2 tranches » rouvrait son écran de quantité sur les
grammes.** Sur le journal comme au panier, et de façon déterministe.

**La cause n'est pas dans `wheelFor`**, qui est juste : il résout le nom de
portion de l'entrée contre les portions que l'aliment propose *aujourd'hui* et
retombe sur l'unité de base quand il ne l'y trouve pas. C'est le bon
comportement pour une portion renommée ou supprimée depuis.

Elle est dans ce que l'appelant lui passait. **Une liste vide est une vraie
réponse** — un aliment sans portions, un produit Open Food Facts, un aliment
supprimé — et elle est *indiscernable* d'une liste simplement en retard. Or le
formulaire n'attendait que la **quantité** :

- au journal, la requête de l'aliment ne peut même pas démarrer avant que celle
  de l'entrée ait répondu, l'aliment étant trouvé *à travers* l'entrée. Les
  molettes se montaient donc toujours contre une liste vide ;
- au panier, `amending` est une prop, donc la quantité est là dès la première
  image pendant que la requête de pré-remplissage, elle, ne l'est pas.

Dans les deux cas la portion ne se résolvait contre rien, et l'unité tombait
sur zéro.

**C'est la règle « null veut dire *pas encore*, jamais *aucune* » — appliquée à
un seul des deux entrants.** Elle était écrite, testée et respectée pour la
quantité ; le second entrant du même écran ne l'avait pas. Le remède est de
l'étendre : `portions` devient nullable, `null` retient les molettes, `[]` est
passé uniquement quand il n'y a rien à attendre — un produit distant, une
saisie libre, un aliment supprimé.

**Prix payé, et il est du bon côté** : une correction au panier coûte désormais
un battement de points de chargement là où elle était instantanée. Instantanée
et sur la mauvaise unité.

**Ce que le test peut et ne peut pas dire.** L'écran ne se rend pas depuis
Node, donc rien ne peut vérifier le garde lui-même. Ce qui est fixé est le
**piège** : `wheelFor(portion, [])` retombe sur l'unité de base, et
`wheelFor(portion, [la portion])` ne le fait pas. Le test dit donc pourquoi
l'appelant n'a pas le droit de passer une liste vide qu'il n'a pas encore lue —
ce qui est la seule moitié du défaut qu'un test puisse tenir.

## Ce que la tranche 7 a établi

**Il n'y a pas eu de migration, et c'est la première fois.** `theme`,
`day_cutoff_hour` et `adherence_tolerance_pct` sont des lignes de `setting`,
table clé/valeur livrée par `0000` — ce pour quoi elle existe. Aucune table,
aucune colonne, aucune `CHECK`, aucune FK, et **pas même un index** :
`ix_entry_date` et `ix_day_meal_date` servent déjà exactement les deux
balayages de plage dont les statistiques ont besoin. Le catalogue d'export ne
bouge pas non plus, une clé de `setting` étant une ligne et non du schéma.

**Une préférence se lit par `useQuery` + `initialData`, et jamais autrement.**
C'est la pièce qui a demandé le plus de réflexion et elle tient en une raison :
un `useQuery` ordinaire rend `undefined` au rendu qui le monte, **si
synchrone que soit sa fonction**. Or le Journal gèle sa date dans son état
*initial* — donc un seuil arrivant un tick plus tard arriverait après la
décision qu'il devait prendre. C'est le défaut des molettes de la tranche 4 et
du `key` du carrousel de la tranche 3, une troisième fois, et la réponse est
la même : **la valeur doit exister avant ce qui en dépend.**

`initialData` est honnête plutôt qu'optimiste — la base est locale, synchrone
et connue ouverte, donc c'est une vraie lecture. Et ça ne coûte rien de plus :
`staleTime: Infinity` fait qu'aucun refetch ne suit, et le bus garde
l'invalidation. Pas de second magasin, pas de `useSyncExternalStore`, pas de
second abonnement à `addDatabaseChangeListener`.

**`ThemeProvider` a dû descendre sous la base, et ça se paie.** Il enveloppait
tout, ce qui était juste tant qu'il ne suivait que le système. La préférence
stockée est une ligne de `setting` : **rien au-dessus de la porte ne peut la
lire.** Un provider placé là aurait démarré sur un défaut puis se serait
corrigé — un éclair du mauvais thème à chaque démarrage à froid. Prix nommé
plutôt que découvert : les trois écrans de `DatabaseGate` (attente, refus G3,
échec) n'ont plus ni thème ni Nunito, et sont toujours clairs. Ce sont ceux
qu'on voit quand l'application ne peut pas tourner du tout.

**`currentLocalDate` a perdu son paramètre par défaut, et c'est ça qui rend le
réglage sûr.** Il en avait un — minuit — parce que rien ne lisait la clé. Dès
qu'elle se lit, le défaut devient le danger : un site qui l'oublie répond
minuit **en silence**, c'est-à-dire le mauvais jour, plausiblement, sur l'écran
dont tout le rôle est de s'ouvrir sur le bon. Requis, c'est `tsc` qui nomme les
huit appelants, et un neuf ne peut pas s'écrire sans décider d'où vient son
seuil.

`useToday()` est **gelé contre l'horloge, vivant contre le réglage** : il lit
l'heure au montage et quand le seuil change, jamais à chaque rendu. C'est le
comportement que les appelants documentaient déjà — « une étiquette ne doit pas
changer sous une liste parce que minuit est passé pendant qu'elle était
ouverte » — plus la seule chose qui manquait : changer le réglage est un acte,
pas l'écoulement du temps, et doit se sentir tout de suite.

**Le thème ne peint que la moitié de l'écran sans `Appearance.setColorScheme`.**
`app.config.ts` pose `userInterfaceStyle: 'automatic'` : la barre d'onglets,
les en-têtes natifs, le `UIPickerView` des quantités, `ActionSheetIOS`, les
alertes et le clavier sont dessinés par UIKit et suivent l'**OS**, pas notre
réglage. Quelqu'un qui choisit « sombre » sous un iOS clair aurait eu des
cartes sombres sous une barre claire.

**Constaté en lisant la source, pas dans une documentation** — qui dit
d'ailleurs l'inverse (« this will not change the appearance of the system
UI ») : `RCTAppearance.mm` parcourt chaque fenêtre de chaque scène connectée et
y pose `overrideUserInterfaceStyle`. `'unspecified'` rend la main à l'OS, et
c'est la valeur que les types acceptent là où `null` marche à l'exécution.

### Les trois décisions que le §8.7 ne prend pas

Le §8.7 donne **une phrase et un exemple chiffré** pour une fonction qui doit
produire un pourcentage. Chacune de ces trois produit un chiffre plausible dans
les deux sens.

**Un trou n'est pas un zéro.** Le §8.7 n° 3 dit « par moyenne » sans dire sur
quels jours. Compter une journée non renseignée pour 0 kcal mesurerait
l'assiduité du journal et non ce qui a été mangé — ce que le n° 1 de la même
section refuse déjà pour l'adhérence. Ce n'est même pas une inférence : **le
§9.2 l'écrit mot pour mot** pour le lissage du poids. La règle existante est
appliquée au cas analogue, plutôt qu'une neuve inventée.

**Aujourd'hui ne compte dans aucun chiffre, et le graphique le dessine quand
même.** Hypothèse signalée : aucun document ne l'évoque. Une journée en cours
est une **mesure partielle** — à neuf heures du matin elle manque presque tout
son objectif — donc le taux tomberait chaque matin et remonterait chaque soir
sans que personne ait changé de façon de manger. La barre reste, parce que la
regarder grandir est le but de l'écran. **Conséquence assumée : la dernière
barre du graphique ne fait pas partie de la moyenne écrite à côté d'elle**, ce
qui est dit à l'écran plutôt que laissé à découvrir.

**L'objectif retenu est celui que le Journal AFFICHE, partiel compris.** Le
§8.1 fait de l'objectif du jour la somme de ceux de ses repas et le §14.6 n° 10
permet un repas sans objectif : une journée dont seul le petit-déjeuner est
ciblé porte donc un objectif qui couvre un quart d'elle. Comparer la
consommation entière à ça se lit comme un large dépassement. C'est une vraie
tension — et elle est tranchée comme elle l'est déjà à l'écran : **le bandeau
somme exactement cet objectif-là depuis la tranche 5.** Faire diverger la
statistique mettrait deux réponses à « quel est l'objectif de cette journée »
dans la même application, ce que ce projet passe son temps à éviter.

**Et une journée sans objectif est exclue, comme une journée sans entrée.** Ce
n'est pas rare : **toute journée matérialisée avant `0004` est dans ce cas,
définitivement.** D'où la seconde ligne de la carte, qui nomme ce qui a été
écarté — sans elle, l'arithmétique ne tomberait visiblement pas juste sur
l'historique le plus courant qui soit.

**Le dénominateur n'est pas un détail derrière un toucher.** Le §8.7 n° 2 le
rend obligatoire, et la raison tient en une comparaison : 100 % sur deux jours
et 100 % sur vingt-huit sont le même nombre.

### Ce que les deux lectures d'objectif ont coûté

**L'objectif d'une journée est calculé deux fois par construction**, et c'est
le troisième tour du motif du §9.6 n° 11. Une lecture par jour est juste pour
un jour et impayable pour quatre-vingt-dix ; une lecture groupée ne peut pas
servir un écran qui tient déjà les repas d'une journée. Aucune des deux n'est
retirable.

**Le cas qui décide n'est pas théorique.** `readTargets` exige les **quatre**
colonnes non nulles — un objectif partiel est un objectif que personne ne peut
lire. `sum(target_protein)` en SQL ignore tranquillement les `NULL` des trois
autres et rend un objectif de 60 g de protéines que personne n'a posé. Aucune
écriture de l'application ne produit une telle ligne ; une archive réparée à la
main si, et `day_meal` n'a pas de `CHECK` pour l'en empêcher (§14.6 n° 16).

D'où les quatre clauses `IS NOT NULL`, et surtout **le test qui les tient**.
Mutation vérifiée : sans elles, il rougit sur `{protein: 60, carbs: 100}` puis
sur `{protein: 110}` — un objectif inventé, puis un objectif cassé additionné à
un objectif valide. Les deux chiffres sont parfaitement plausibles.

### Les graphiques

**Trois séries sur un seul axe, ce que D13 donne comme la raison même de les
faire à la main.** Des barres pour les jours, un **escalier** pour l'objectif,
une courbe pour la moyenne à sept jours.

**L'objectif est un escalier, jamais une pente.** Il tient une journée entière
puis change d'un modèle à l'autre : une pente entre deux jours dessinerait des
objectifs que personne n'a posés. `curveStepAfter` porte la valeur jusqu'au
sommet suivant avant de sauter, ce qui est la forme qu'un objectif quotidien a
réellement.

**L'axe part toujours de zéro.** Les barres encodent une quantité par leur
longueur : un axe démarrant à 1 800 ferait paraître 2 000 quatre fois 1 900 —
et mentirait dans le sens flatteur, qui est celui qui compte.

**Un trou est un trou dans les trois séries**, sinon l'image contredirait la
légende. `defined()` le fait pour les lignes ; pour les barres, c'est
simplement ne pas émettre de `Rect`.

**Les barres s'amincissent, le graphique ne défile pas.** Quatre-vingt-dix
jours sur trois cent cinquante points font moins de quatre points par jour :
l'écart entre deux barres est donc une **part** du créneau et non un nombre de
points fixe, qui serait devenu négatif quelque part entre sept jours et
quatre-vingt-dix. Un plancher d'un point, parce qu'une barre arrondie à zéro ne
dessine rien et qu'une journée pourtant loguée manquerait.

**Ce que `d3-scale` achète n'est pas la multiplication linéaire**, qui est une
ligne. C'est `nice()` et `ticks()` : choisir des nombres ronds pour un axe est
un petit problème déjà résolu, et la version qu'on écrit soi-même gradue à
1 837 et 3 674.

**Et le graphique n'est testé nulle part.** Seule son arithmétique l'est —
`scale.ts` — parce qu'une barre au mauvais endroit ressemble exactement à une
barre au bon endroit. C'est dit dans le fichier de test plutôt que laissé
entendre.

### Ce qui a été vérifié plutôt que supposé

- **`react-native-svg` est autolié** : confirmé en exécutant la commande exacte
  que le Podfile lance (`expo-modules-autolinking react-native-config`), pas en
  lisant une documentation. Neuf paquets, svg dedans.
- **`d3-scale` et `d3-shape` se résolvent**, sous vitest *et* dans un bundle
  réel, **avant** qu'une ligne ne soit écrite dessus. Ils sont ESM pur et rien
  ne garantissait que Metro les prenne. Le bundle passe de 5,3 à 5,9 Mo.
- **Le lockfile a re-cassé**, cinquième fois, et le remède documenté l'a réparé.
- **Aucune permission n'est ajoutée** par svg : l'`Info.plist` du pré-vol est
  inchangé.

### Trois pièges qui ne se devinent pas

**Un module que la suite Node atteint ne doit JAMAIS importer le baril
`@/core/theme`.** Il réexporte `ThemeProvider`, qui importe `react-native`,
dont l'`index.js` est du Flow que rolldown refuse de parser. Dix-sept fichiers
de test ont rougi d'un coup sur `Parse failure: Flow is not supported`, dont
aucun ne parlait de thème. `core/theme/tokens` est pur — « des valeurs, pas des
composants » — et c'est lui que la couche de données vise. Aucun test ne garde
la règle : la panne est bruyante et le build la trouve en une exécution.

**Le démarrage à froid doit être amorcé et CONSOMMÉ comme les trois autres
transitions.** Lu depuis une constante posée au chargement du module, il aurait
été re-mesuré depuis la naissance du bundle à **chaque** passage ultérieur par
le Journal — un chiffre énorme, assuré, et vide de sens. Le mettre dans la même
table que les autres, où `done` consomme le départ, le fait tirer exactement
une fois.

**Seule la page ACTIVE du carrousel rapporte une mesure.** Trois pages sont
montées à la fois. Les deux voisines ne sont pas la journée où l'on vient
d'écrire, donc leurs requêtes n'ont jamais été invalidées et leur `pending`
tombe immédiatement : une voisine rapportant « validation → Journal à jour »
chronométrerait une page qui n'avait rien à attendre et afficherait un beau
résultat que personne n'a mérité. Exactement le chiffre faux et plausible que
D15 vise.

## Ce que la vérification de la tranche 7 a changé (14/09/2026)

**Le refus G3 jetait les deux nombres qui l'expliquent.** `compareVersions`
rend `databaseWhen` et `binaryWhen` ; `startup.ts` les perdait en mappant
`too_recent` vers `blocked`. Le refus était donc correct et indiagnosticable.
G3 existe pour être lu par quelqu'un debout devant une application qui ne
démarre pas : retenir le seul fait qui identifie le problème est l'inverse de
ça. L'écran nomme désormais la dernière migration du binaire avec sa date, et
date celle de la base — qui ne peut pas être *nommée*, son tag étant par
définition absent de ce bundle.

**Et le piège qui l'a provoqué, qui n'a rien à voir avec la tranche 7 :
`npm start` lancé dans le mauvais dossier.** Le build dev est en Debug, donc
le JavaScript vient de Metro — et `bundle.generated.ts`, c'est-à-dire **le
journal des migrations que G3 compare**, est dans ce JavaScript. Metro servi
depuis un dossier resté à la tranche 4 donnait un binaire à `0003` contre une
base à `0005` : refus, parfaitement légitime.

> **Corollaire à retenir : la version du schéma vient de Metro, pas du binaire.**
> Un dossier de travail périmé se présente comme une base corrompue. Le
> symptôme et la cause n'ont aucun rapport visible.

**Un aliment à soi peut porter son code-barres.** Le §6.1 lui en donnait un
depuis le début et `FoodDraft` le transportait jusqu'en base ; l'éditeur
n'avait simplement aucun champ. L'unicité se dit **avant** d'enregistrer :
`requireFreeBarcode` la garde déjà mais en *levant*, ce qui est le bon filet et
la mauvaise première ligne. Ce n'est pas un `FoodProblem` — `validateFoodDraft`
est pur — et contrairement à l'écart kcal et à l'énergie impossible, qui se
contentent d'être marqués, celui-là **bloque** : le §8.5 refuse une *valeur*
douteuse, or deux aliments pour un produit est une question sans réponse.

**Un scan qui n'aboutit pas ouvre le formulaire, quelle qu'en soit la raison.**
Le §8.5 ne l'écrivait que pour un code-barres inconnu et D11 répond à un échec
par un bandeau : ensemble, ils déposaient l'utilisateur sur la liste avec un
code-barres qui n'avait servi à rien. **Rien n'est écrit en y arrivant** — le
formulaire est une étape, donc un scan raté puis abandonné ne laisse
exactement rien, ce qui est la propriété autour de laquelle `ensureOffFood` a
été bâtie.

**Conséquence obligatoire, et c'est elle qui demandait de l'attention : le
message de quota a dû déménager.** D11 en fait le seul message qui interrompt,
et il vivait dans un bandeau rendu **uniquement sur la liste**. Dériver vers le
formulaire l'aurait emmené loin de la seule chose qui devait l'interrompre. Il
est désormais la première ligne du formulaire — plus visible, pas moins.

**Le graphique suit le doigt, et c'est un renversement consigné.**
`calories-chart.tsx` disait qu'un glissement serait « une seconde interaction
que personne n'a demandée », et le §10.6 pose « une seule interaction ». La
demande l'a renversé, et l'objection ne survit pas : glisser ne zoome ni ne
déplace — la fenêtre ne bouge jamais — donc c'est la **même** interaction lue
en continu. Ce que la règle protégeait, le zoom et le déplacement, est intact.

Le prix technique, nommé : un `Pan` remplace le `Pressable`, avec
`activeOffsetX` **sans quoi l'écran Stats cesserait de défiler au-dessus de son
propre tracé**. Coût assumé : commencer un défilement vertical sur le graphique
fait clignoter une lecture avant que la `ScrollView` ne gagne.

**La valeur touchée est passée au-dessus de la barre, et le motif est
mécanique.** Un doigt qui atteint une barre vient du bas : la main couvrait la
réponse à la question qu'elle posait. Au-dessus, le chiffre est dans la seule
région du tracé qu'une main qui lit ne recouvre jamais. Trois bornages, chacun
un cas réel — les deux barres des bouts poussent la bulle hors du tracé, et la
barre la plus haute de la plage, qui est le cas le plus courant, la pousse hors
du haut ; elle bascule alors à l'intérieur du sommet de la barre.

### Ce que les graphiques ont coûté, et la règle qui en sort

**Deux nombres devinés, deux défauts, et exactement le même remède.** L'axe
perdait le haut de son chiffre du haut, et l'infobulle se posait en travers du
sommet de la barre. Dans les deux cas j'avais écrit une taille en constante :

- `.nice()` arrondit le domaine pour que la graduation haute tombe **exactement**
  sur le maximum, donc à `y = 0`. Une étiquette centrée sur cette ligne a ses
  jambages en `y` négatif et la fenêtre SVG les coupe. Seul le chiffre du haut
  perd sa tête, ce qui se lit comme un défaut de rendu et non comme une réserve
  manquante. D'où `GUTTER_TOP`, passé à `verticalScale`.
- `TOOLTIP_HEIGHT = 54` était faux par construction : la bulle fait trois lignes
  avec un objectif et deux sans. Quel que soit le nombre choisi, il était faux
  pour l'une des deux formes.

> **La règle : ne jamais positionner depuis une taille supposée.** Ancrer depuis
> le côté qu'on connaît — l'infobulle est ancrée par son **bas**, donc sa hauteur
> n'entre plus dans le calcul — ou mesurer par `onLayout`. Sa hauteur ne sert
> plus qu'à décider d'un basculement, donc une valeur périmée ne peut plus que
> retarder ce basculement d'une image.

**Deux formes qui se recouvrent ne peuvent pas être atténuées.** Le rouge du
dépassement était peint *sur* le vert. Atténuer une barre pour faire ressortir
sa voisine envoyait alors 35 % de rouge à travers 35 % de vert et inventait une
troisième couleur. Et ses coins bas arrondis laissaient voir le vert dessous,
donc le cap se lisait comme un bloc collé.

**Corollaire qui ne se devine pas : `rx` sur un `Rect` arrondit les QUATRE
coins.** SVG n'a pas de rayon par coin. Une barre en deux segments veut un
chemin — `barPath` — dont seul le sommet est capé, et les deux segments se
touchent bord à bord sans jamais se recouvrir.

**Un test a trouvé un défaut que la lecture n'avait pas vu.** En sortant le
pilon des libellés d'axe dans `core/charts` pour pouvoir le tester, l'assertion
« jamais deux libellés plus proches que le minimum » a rougi : le plancher
`Math.max(1, slotWidth)`, posé pour rendre une division sûre, cassait
silencieusement la seule garantie de la fonction. Le cas zéro est traité à part,
et la garantie est inconditionnelle.

**Les deux libellés des bouts se collent aux bords du tracé.** Centré sur sa
barre, le dernier dépassait de la toile — la dernière barre est à deux points du
bord droit à quatre-vingt-dix jours. Ancrage `end` et `start` : aucune mesure,
donc pas de seconde devinette.

**Un second axe ne trace aucune ligne d'horizon.** Les calories rejoignent le
graphique des macros sur un axe à droite — deux mille contre cent cinquante
écraserait les trois macros au sol. Celui de gauche possède les lignes, celui de
droite n'étiquette que ses graduations, **teinté de la couleur de sa série**
pour qu'il ne soit jamais à deviner lequel sert qui. Deux jeux de règles à deux
hauteurs sont le bruit qui donne aux doubles axes leur mauvaise réputation.

**Un objectif n'est pas une série.** Il était tracé en escalier pointillé
au-dessus des barres, et ça ne se lisait pas : une règle glissant sur
quatre-vingt-dix barres dit qu'un objectif existait sans permettre de voir, sur
une barre donnée, si cette journée-là l'a tenu. C'est la **borne de chaque
barre**, donc la barre est le volume de l'objectif et le consommé la remplit.

**Un dépassement recouvre son propre objectif**, et c'est le dessin qui l'a
révélé : le remplissage est plus haut, donc la borne disparaît dessous et la
barre dit « beaucoup » sans dire « beaucoup de plus que quoi ». La bascule au
rouge le remet en place — la frontière entre les deux teintes **est** l'objectif.

**Deux seuils différents pour « dépassé », et c'est délibéré.** La jauge du
Journal garde sa marge de 50 kcal (§14.6 n° 21) ; le graphique rougit au premier
kilocalorie. Les deux ne posent pas la même question : la marge existe pour
qu'un chiffre **vivant** ne clignote pas à +5 kcal, et un historique n'a pas ce
problème. `KCAL_OVERSHOOT_KCAL` n'est donc **pas** importé dans les stats.

**Et rien de tout ça n'est testé.** Seule l'arithmétique l'est — `scale.ts` —
parce qu'une barre au mauvais endroit ressemble exactement à une barre au bon
endroit. C'est écrit dans le fichier de test plutôt que laissé entendre.

### Le dénominateur doit compter contre ce que l'utilisateur a choisi

Retour d'usage, et le défaut était réel : choisir « 7 jours » et lire « sur 6 »
partout. La règle — la journée en cours n'entre dans aucun chiffre — **reste
juste** : à neuf heures du matin une journée a trois cents kilocalories au
compteur. Ce qui était faux, c'est qu'elle se **taisait**.

> Le §8.7 n° 2 rend le dénominateur obligatoire pour que la statistique ne
> trompe pas. **Un dénominateur que le lecteur ne reconnaît pas fait exactement
> ce qu'il devait empêcher.**

`Adherence` porte donc `range` à côté de `span` — la plage choisie à côté des
journées terminées — toutes les phrases comptent contre la première, et « la
journée en cours » rejoint les exclusions nommées. Un test exige que
`mesurées + non renseignées + sans objectif + en cours` fasse exactement la
plage.

## Ce que la tranche 8 a établi

**`0006` porte deux tables, cinq CHECK et un index, et c'est tout
l'irréversible.** La règle de la tranche 3 appliquée colonne par colonne : une
migration porte ce qui ne peut pas être ajouté plus tard et diffère ce qui le
peut. Ce qui est entré, ce sont les tables, leurs colonnes `NOT NULL` sans
défaut et les CHECK. L'index ne l'est pas ; `notification_setting` non plus.

**`ck_weight_goal_terms` est la décision de cette migration.** Le §6.2 fait de
l'un des deux termes d'un objectif une valeur **dérivée** de l'autre — date
cible et le rythme se calcule, rythme et la date s'estime — or D9 interdit de
stocker ce qui se dérive. Une ligne portant les deux serait donc soit une
entorse à D9, soit une ambiguïté sans réponse : laquelle fait autorité ? La
CHECK rend cet état **inexprimable**, ce qui vaut mieux qu'une règle que la
couche d'écriture doit se souvenir d'appliquer.

Et son autre moitié compte autant : un objectif en mode `rate` sans rythme est
un objectif que **personne ne peut lire**, et rien ne le signalerait — le défaut
exact que les quatre `IS NOT NULL` de `readDailyTargets` évitent une table plus
loin. Précédent : `ck_ingredient_link`, la seule CHECK du schéma qui soit
l'unique barrière disponible, parce qu'une règle de catalogue est par colonne et
que celle-ci en croise trois.

**Une CHECK sur `value_kg`, là où les macros n'en ont aucune — et le motif de la
tranche 3 ne s'applique pas.** Ce qui avait écarté toute CHECK sur les macros,
c'est que le §8.5 exige des valeurs Open Food Facts *signalées et jamais
refusées* et que la tranche 4 copie automatiquement en base tout produit logué :
une CHECK y aurait transformé une anomalie signalable en échec d'INSERT sur ce
chemin. Ici il n'y a **ni source externe, ni copie automatique, ni chemin où une
valeur arrive sans avoir été tapée**. Un poids nul n'est pas une valeur douteuse
à corriger, c'est une valeur impossible — et `value_kg` est le seul contenu de
la table. Précédents déjà livrés : `ck_portion_quantity`, `ck_recipe_yield_value`.

Aucune borne haute, en revanche : ce serait légiférer sur ce qu'un corps peut
peser, et une borne trop basse refuserait une mesure légitime en silence.

**Aucune clé étrangère, et c'est la décision qu'on ne voit pas.**
`weight_measure.date REFERENCES day(date)` est la forme tentante — deux dates
civiles, et un poids appartient à une journée dans la langue courante. Elle est
fausse : une journée n'existe qu'une fois **matérialisée** (§8.2), donc la clé
forcerait à créer une journée pour y peser, soit de la donnée créée par
consultation. Se peser un jour où l'on n'a rien logué est parfaitement ordinaire.
Un test l'exerce des deux côtés plutôt que de le laisser au commentaire.

**Un seul objectif actif, et l'index est sûr ici pour la raison qui l'avait fait
refuser ailleurs.** Tout l'aval suppose un objectif : l'écart compare à **un**
rythme, la courbe porte **une** ligne. La tranche 5 avait refusé un index unique
partiel sur `day_meal` parce qu'une base en service porte déjà les lignes qui le
violeraient — l'index aurait échoué à se construire sur exactement les données
qu'il existait pour protéger. **Cette table est neuve** : aucune ligne n'existe
nulle part, dans aucune base ni aucune archive, donc il se construit toujours.

Corollaire trouvé par exécution, et utile : **un index unique ne nomme pas son
index dans l'erreur**, il nomme la colonne — « UNIQUE constraint failed:
weight_goal.is_active ». C'est le seul endroit où une CHECK est strictement
meilleure pour le diagnostic : `ck_weight_goal_terms` dit son propre nom, donc
qui répare une archive à la main sait quelle règle il a enfreinte.

**Désactiver n'est pas supprimer, et ça se voit en base.** Le §6.2 liste
« modifiable, désactivable, supprimable » comme trois actions, donc elles
laissent trois traces. Un objectif retiré garde sa cible, son mode et sa date de
définition ; `setActiveGoal` le désactive **avant** d'insérer le nouveau, dans
une transaction — l'ordre est forcé par l'index, et un arrêt forcé entre les deux
laisserait sinon l'utilisateur sans aucun objectif actif, sans rien à l'écran
pour l'expliquer.

### Le chiffre que personne n'aurait vu

**La régression charge vingt jours pour n'en mesurer que quatorze.** Le §9.2 fait
porter le rythme réel sur « la série lissée des 14 derniers jours ». Chaque point
lissé étant une moyenne glissante à sept jours, le plus ancien point de la
fenêtre a besoin des **six jours qui le précèdent** pour exister.

Charger exactement quatorze ne plante pas. Ça calcule les six premiers points
contre des fenêtres courtes, qui sur une série descendante tombent trop bas, et
les ajuster **aplatit la droite**. Mesuré sur une perte parfaitement régulière de
0,7 kg par semaine :

```
chargé 14, lissé, ajusté      ->  -0,5438 kg/semaine   (22,3 % trop lent)
chargé 20, lissé, 14 gardés   ->  -0,7000 kg/semaine   (exact)
```

Une moyenne glissante **pleine** sur une droite est cette droite décalée, donc
elle en garde la pente exactement : toute l'erreur vient des fenêtres courtes du
début, et toute l'erreur disparaît en chargeant six jours de plus. « Vous perdez
0,54 kg par semaine » est une phrase parfaitement croyable — c'est le seul genre
de faux qui compte.

**Et une chose que j'avais affirmée et que le test a démentie.** J'avais écrit
que le lissage protège la régression des valeurs aberrantes. Il ne le fait pas
partout. En balayant une pointe sur les quatorze positions d'une série propre :

```
position  0  1 | 2  3  4  5 | 6  7  8  9 | 10 11 12 13
aide ?    no no |  Y  Y  Y  Y | no no no no |  Y  Y  Y  Y
```

La forme est le **levier**. L'influence d'un point sur une pente croît avec sa
distance au centre des abscisses, donc une pointe à une extrémité fait basculer
toute la droite tandis qu'une pointe au milieu ne la bouge presque pas. Le
lissage étale la pointe sur les sept jours suivants — ce qui tire une aberration
à fort levier vers le milieu, et une aberration inoffensive vers le bord. Il
échange donc une grosse erreur contre une petite, ce qui est le bon échange : le
cas qu'il aggrave était déjà presque gratuit.

### L'agrégation de D9 a enfin un client

**`core/db/date-bucket.ts` porte le grain, et il vit dans le noyau pour une
raison.** La règle « semaine au-delà de 90 jours, mois au-delà d'un an » n'avait
jamais servi : la plus longue plage du §8.7 vaut exactement 90, et « au-delà de
90 » n'inclut pas 90. Le §9.2 offre « 1 an » et « tout ».

Le module est dans `core/db` et non dans `features/weight` parce que **deux
features groupent sur les mêmes seaux** — la courbe groupe `weight_measure`, le
graphique croisé du §9.4 groupe `journal_entry`. Deux séries d'un même graphique
tombant sur des seaux distants de six jours est exactement le défaut que le
partage évite.

**Chaque grain rend une DATE CIVILE**, jamais un libellé de période. Pas
`2026-W11` ni `2026-03` : le lundi de la semaine, le premier du mois. Donc tout
point — jour, semaine ou mois — porte une vraie date que l'axe sait placer et
avec laquelle `core/date` sait compter, et **rien en aval ne branche sur le
grain**.

**Le lundi a deux implémentations, tenues par un test et pas par le soin.**
`date(d, 'weekday 0', '-6 days')` en SQL avance jusqu'au dimanche suivant puis
recule de six jours — y compris quand `d` **est** un dimanche, SQLite ne
déplaçant pas une date déjà sur le jour nommé. C'est une seconde implémentation
de `startOfWeek`. Comparées date par date sur **1601 dates consécutives**, sur le
patron que la tranche 4 a posé pour la fonction de fenêtre : les cas qui
casseraient sont les bords d'année et ce dimanche-là, et aucun des deux ne
s'écrit à la main.

**L'axe dense part du SEAU qui contient le début de plage**, jamais du début de
plage. Une plage commence rarement un lundi, et un axe partant du 5 mars ne
dessinerait jamais le 2 mars dans lequel SQL a groupé cette mesure : la première
mesure de la plage disparaîtrait en silence.

**Au-delà de 90 jours, la moyenne d'agrégation EST la série lissée.** Le §9.2
n° 3 le dit sans le dire : « agrégées par semaine ou par mois, série brute et
série lissée se confondent visuellement » n'est vrai que parce qu'une moyenne
hebdomadaire de poids quotidiens est **déjà** une moyenne sur sept jours. Lisser
en plus, jour par jour, obligerait à remonter tous les jours — ce que D13
interdit. Conséquence assumée : **la définition de « lissé » change avec la
plage**, consignée plutôt que laissée à découvrir.

**Le rythme ne lit PAS la série du graphique**, et le poids actuel non plus. Le
§9.2 fixe la fenêtre à quatorze jours : une carte dont le chiffre bougerait en
touchant « 1 an » rapporterait l'image plutôt que le corps, avec un chiffre
plausible à chaque fois. `readRateWindow` est donc toujours quotidienne. Même
chose pour le « poids actuel » dont descendent tous les chiffres d'objectif : sur
« 1 an » le dernier seau du graphique est une moyenne de semaine.

### Ce que les graphiques ont demandé

**Une courbe n'a pas de zéro, donc l'échelle des barres ne pouvait pas servir.**
`verticalScale` part de zéro et doit continuer : une barre encode par sa
**longueur**. Une ligne encode par sa **pente** — rien en elle n'invite l'œil à
comparer 78 kg à zéro — et sur un domaine de 0 à 80 une perte de trois kilos sur
un trimestre occupe quatre pour cent du tracé.

**Deux fonctions, jamais une avec un drapeau.** La version à drapeau est la façon
dont un graphique à barres finit par gagner une base non nulle parce que
quelqu'un a passé le mauvais argument.

Le rembourrage de `linearScale` est une **part de l'étendue**, jamais un nombre
d'unités : des kilos ici, des kilocalories dans le croisé, et un `2` fixe serait
généreux sur l'un et invisible sur l'autre. Une série plate — une seule mesure,
ou plusieurs identiques — retombe sur une bande fixe, sans quoi le domaine serait
un point, d3 rendrait `NaN`, et **`react-native-svg` dessine `NaN` comme rien du
tout plutôt que comme une erreur**.

**`ChartFrame` a gagné trois options et n'en a perdu aucune.** La ligne de base
renforcée devient facultative — elle dit « c'est ici que les barres se tiennent »,
et sur une échelle sans zéro ce serait un trait épais à une valeur arbitraire,
disant ça avec insistance. Le format des graduations devient injectable : le
défaut à l'entier est juste pour des kilocalories et **faux** dès que les
graduations tombent entre deux entiers — sur un domaine de 76,2 à 76,8, d3
choisit 76,2 / 76,4 / 76,6 et l'arrondi imprimerait « 76 » trois fois, ce qui se
lit comme un défaut de rendu et non comme un formateur manquant.

**Et l'axe de droite a le sien, corrigé avant d'être livré.** Le propos même d'un
second axe est qu'il porte une série d'une autre **nature** : un format partagé
écrirait « 2 450,0 » à côté de kilos à une décimale.

**La série brute est en points, la lissée en ligne.** Deux lignes se
disputeraient, et c'est la lissée qu'il faut lire : le §9.2 régresse dessus, et
un poids brut saute de plusieurs centaines de grammes par jour pour des raisons
étrangères à la tendance. Les points disparaissent au-delà de 90 jours (§9.2
n° 3) — agrégés, les deux séries sont la même ligne tracée deux fois.

**La ligne se BRISE sur un jour non pesé.** Joindre par-dessus dessinerait un
segment droit à travers une quinzaine que personne n'a mesurée : c'est la
« prolongée artificiellement » que le §9.2 n° 1 interdit, en image.

**L'objectif est une ligne plate à la cible, et il entre dans le DOMAINE.** Une
trajectoire demanderait un poids de départ à la date de définition, qui peut ne
pas exister — personne n'est obligé de s'être pesé ce jour-là. Et sans la cible
dans l'échelle, un objectif huit kilos plus bas sortirait du tracé : **une ligne
d'objectif invisible est pire qu'aucune, parce que le graphique a l'air
complet.**

**Le graphique croisé n'a rien eu à construire.** `ChartFrame` portait déjà un
second axe depuis la tranche 7 ; il lui manquait exactement ce qui manquait à la
courbe. Son axe droit **part de zéro** là où le gauche n'en a pas : un poids nul
n'a aucun sens, un apport calorique nul est une vraie quantité lisible.

**Pas de lecture au doigt sur le croisé**, contrairement aux trois autres. Un
toucher lit **une** valeur, et le sujet de ce graphique est la relation entre
deux. Ce qui s'y lit est la forme.

### Deux décisions d'interface qui ne se devinent pas

**Le poids se saisit par une rangée qui ouvre une fenêtre, pas par un champ
vivant.** Le §9.1 dit « champ de saisie sous la liste des repas », et la lecture
littérale ne survit pas à l'écran qui la porte. Trois raisons, la troisième
décide : le Journal est un carrousel dont **trois pages sont montées à la fois** ;
un clavier qui monte dans une bande qui se balaie horizontalement se bat contre
le geste autour duquel cette page est construite ; et la confirmation
d'écrasement que le §9.1 exige doit tomber **entre** la frappe et l'écriture, or
un champ qui enregistre au blur n'a pas cet instant.

**La carte se rend sur les pages voisines aussi, mais inerte.** C'est le seul
élément de cette page qui porte un chiffre pour la date : la cacher sur les deux
flancs ferait apparaître le nombre une image après chaque balayage, soit le
vacillement que le carrousel a passé la tranche 3 à supprimer. Un toucher, lui,
n'a rien à faire sur une journée que personne ne regarde.

**La confirmation ne se déclenche que sur une date déjà renseignée**, et c'est la
lettre du §9.1. Une alerte à chaque pesée serait ce que la tranche 4 a retiré
partout : une question déjà répondue reposée. L'écriture reste un upsert et doit
le rester — elle sert aussi la graine, l'import et une correction depuis
l'historique.

**L'historique vit dans l'onglet Stats, et c'est un trou de spécification
comblé.** Le §9.1 exige la liste et ne lui donne aucun endroit ; le §7 ne la
nomme pas, le §12 ne la range pas dans les Réglages. Elle est à un toucher de la
courbe parce que corriger une mesure **suit** le fait de la voir aberrante.

**Chaque volet du tableau de bord porte sa propre plage.** Le §8.7 donne
7 / 30 / 90 à la nutrition, le §9.2 donne 30 / 90 / 1 an / tout au poids : deux
listes normatives et différentes. Un contrôle unique devrait inventer une plage
qu'aucun document ne demande — sept jours d'une courbe lissée sur sept jours n'a
qu'**un** point utilisable. Le contrôle de la nutrition n'a pas bougé ; son
commentaire, qui promettait de « gouverner tous les volets », a été corrigé
plutôt que laissé : c'était devenu un contrôle qui ment.

**Le volet poids est rendu hors de la branche « Rien à agréger ».** Quelqu'un qui
se pèse tous les jours sans rien loguer a un volet poids plein et un volet
nutrition vide, et l'écran doit pouvoir dire les deux à la fois.

**L'écart au rythme est une différence, jamais une avance ou un retard.** « En
avance » a été écrit d'abord et est faux pour la moitié des objectifs : une prise
de masse à +0,5 visant +0,3 a le même écart **positif** qu'une perte à −0,3
visant −0,5, et ce sont des situations opposées. Juger demande la direction du
voyage, qui appartient à l'écran.

**Le champ de rythme n'est pas un `decimal-pad`.** Un rythme est signé, le pavé
décimal d'iOS n'a **aucune touche de signe**, et un objectif de perte serait
littéralement inatteignable. C'est `numbers-and-punctuation`.

**Un interdit absolu évité de justesse, noté parce que le raccourci est
tentant** : `new Date().toISOString().slice(0, 10)` pour obtenir aujourd'hui est
faux deux fois — c'est la construction que le projet interdit, et `toISOString`
répond en **UTC**, donc à l'est de Greenwich elle nomme demain pendant toute la
soirée. Une date cible validée contre le mauvais jour est refusée ou acceptée à
un jour près. `useToday()` est le seul point d'entrée.

### Ce que la graine devait, et le défaut qu'elle portait

**Sans poids semé, la moitié de la tranche est invisible sur l'appareil** —
courbes, rythme, écart, graphique croisé, tous vides. Exactement ce que la
tranche 7 a rencontré avec les modèles.

La forme est une dérive lente plus du bruit quotidien, et les deux moitiés
comptent : une droite parfaite rendrait le lissage inutile et la régression
trivialement juste, ce qui en fait la seule histoire sur laquelle un calcul de
rythme cassé a encore l'air correct. Le rythme visé semé est **plus raide** que
la dérive semée — un objectif collant à la tendance afficherait un écart de zéro,
la seule valeur qui a la même tête que le calcul marche ou non.

**Et un défaut réel, trouvé en écrivant le test plutôt qu'après : la graine
écrasait de vraies pesées.** Le bouton des Réglages promet de n'effacer rien, et
la moitié « journal » tient cette promesse gratuitement puisqu'elle **ajoute**
des entrées. `setWeight` est un upsert sur une clé primaire : un second appui
remplaçait en silence chaque pesée réelle de la plage par une valeur inventée.
Aucun retour arrière, et l'export est l'unique filet. Chaque date est désormais
lue avant d'être écrite.

### Le point ouvert de la tranche 5 qui se ferme

**`core/ui/stack-header.ts` naît du troisième utilisateur**, ce que
`settings/_layout.tsx` avait lui-même annoncé : « deux piles aux mêmes options ne
sont pas encore un composant, la suivante tranchera ». L'onglet Stats gagne une
pile native pour l'historique, et elle est la troisième.

Le **style de titre reste chez chaque pile** : le Nunito extra-gras du Journal
est une décision, pas un mécanisme que trois piles ont en commun. Et l'écran
Stats garde `headerShown: false` avec son grand titre à lui — une pile ajoutée
dessous est du câblage, pas un changement visuel que personne n'a demandé.

## Ce que les retours sur le poids ont établi (15/09/2026)

**Une date sans mesure propose la dernière pesée qui la précède**, et c'est le
levier du §8.4 appliqué au poids : un corps bouge de quelques centaines de
grammes d'un jour à l'autre, donc partir du dernier connu met la valeur juste à
un ou deux touchers là où un champ vide la fait retaper chaque matin.

**Interprétation signalée** : « la journée précédente » est lue comme *la
dernière pesée antérieure*, pas comme J-1 au sens strict. La lecture littérale
laisserait le défaut vide dès qu'une veille est manquée — c'est-à-dire la
plupart du temps, sur un historique qui a délibérément des trous.

**Et c'est là que cette fonctionnalité pouvait produire un chiffre faux et
plausible.** Une carte affichant « 78,4 kg » sur une journée non pesée énoncerait
un poids sur lequel personne ne s'est tenu. D'où **trois cas et non deux** —
`measured`, `carried`, `none` — plutôt qu'un `number | null` : un nombre
nullable aurait suffi à afficher un chiffre et aurait rendu les deux
indiscernables. Le chiffre repris est atténué et porte la date dont il vient
(« repris du 14 sept. ») ; rien n'atteint la base tant que l'utilisateur n'a pas
agi, ce qui est la règle qu'`ensureMaterialized` et `ensureOffFood` suivent déjà.

C'est la même distinction que `undefined` contre `null` ailleurs, et elle se
paie au même endroit.

**La carte, les deux boutons et la fenêtre lisent UNE fonction, une seule
fois.** Le motif de la tranche 4 appliqué tel quel : trois chemins vers « la
valeur courante » s'accorderaient presque toujours, et le jour où ils
divergeraient **la rangée mentirait sur ce que fait son propre bouton**. Chaque
test l'assert contre `weightPrefill` et `stepWeight`, jamais contre un littéral.

Le cas qui décide : hier dit 78,4, aujourd'hui ne dit rien, un appui sur « − »
doit écrire **78,3** — ni 78,4, ni une mesure vide, ni rien du tout.

**`stepWeight` arrondit au dixième, et ce n'est pas de la cosmétique.**
`78.4 - 0.1` vaut `78.30000000000001` en virgule flottante binaire. Stocké tel
quel, ce serait un poids à quatorze décimales en base, **exporté tel quel dans
l'archive**, et affiché « 78,3 » — donc le chiffre à l'écran et le chiffre dans
le fichier cesseraient d'être le même nombre dès le premier toucher. Un test le
fixe sur douze touchers d'affilée.

**Et il est borné par le bas à 0,1 kg**, parce que `ck_weight_value` refuse zéro
et qu'une violation de CHECK est une exception SQLite levée, pas un bouton grisé.
Personne ne descendra depuis 0,1 kg — mais « personne ne le fera » n'est pas une
raison de laisser un plantage atteignable.

**Un appui écrit immédiatement, et sans confirmation d'écrasement.** C'est une
lecture du §9.1 plutôt qu'une exception : la confirmation y protège une
*nouvelle saisie* tapée par-dessus une mesure qu'on ne voit pas, alors qu'un
incrément part de la valeur **affichée** et la décale d'un chiffre visible.
Demander confirmation tous les cent grammes serait l'alerte qu'on congédie sans
lire. Et un bouton qui ne déplacerait qu'un brouillon réclamerait un second
toucher pour valider — exactement celui que ces boutons existent pour supprimer.

**`readWeightPrefill` est UNE lecture, pas deux hooks joints dans le
composant.** La forme évidente — un hook pour la mesure, un pour la précédente —
donnerait à la carte **deux états `undefined` à réconcilier**, et replier « pas
encore » sur « aucune » est le défaut que la tranche 4 a payé deux fois.

**Trois cibles tactiles sœurs, jamais imbriquées** : « − », le chiffre, « + ».
Un `Pressable` dans un `Pressable` est le piège déjà payé une fois, et il n'y a
aucune raison de tester si l'intérieur gagne. La boîte du chiffre a une largeur
minimale fixe : un contrôle qui change de largeur sous un doigt qui le tape en
rafale est la seule chose que ces boutons ne doivent pas faire.

### Le futur est refusé, et la règle ne peut pas vivre en base

**Divergence explicite avec le §9.1, demandée et appliquée.** Il disait « saisie
possible sur n'importe quelle date, **passée comme future**, sans limite ». La
phrase est amendée, pas contournée (`specs §14.15` n° 3).

**Aucune CHECK ne peut la porter**, et c'est le même raisonnement que pour
`target_date` : « dans le futur » n'est pas une propriété de la ligne mais une
relation entre la ligne et l'horloge, qui change toute seule pendant la nuit. Une
CHECK évaluée à l'écriture serait silencieusement fausse pour toute mesure qui
vieillit — ce qui n'est pas une corruption, c'est hier.

Elle vit donc **à deux endroits, et ce n'est pas une redite** : la carte et
l'écran de saisie. L'écran est une **route**, sa date arrive en paramètre de
chaîne, et le schéma d'URL est enregistré — un lien profond peut demander
n'importe quelle date.

**Une mesure future déjà enregistrée reste visible partout**, y compris sur sa
page de Journal. Corrigé avant livraison : la première version masquait tout sur
une date future, donc une pesée venue d'une archive disparaissait du Journal
tout en restant dans la courbe et dans l'historique — le Journal aurait été le
seul écran à faire comme si elle n'existait pas. Ce qui est refusé est d'en
**créer** une.

**Réserve inscrite, à regarder sur l'appareil.** Un appui sur « − » ou « + »
écrit, le bus invalide, la requête se relit — le tout en local et synchrone.
Sur un appui en rafale, rien ne garantit que l'affichage suive sans battement.
Aucun état optimiste n'a été posé : ce serait une seconde source de vérité pour
la même valeur, exactement ce que la règle de la fonction unique existe pour
éviter. Si ça bat à l'usage, la réponse sera un regroupement, jamais un second
chiffre.

## L'écran Stats prend deux onglets, et le bloc poids se dépouille (15/09/2026)

**Les deux volets étaient empilés, et ça mettait deux contrôles de plage à un
défilement l'un de l'autre** — le second arrivant sans prévenir au milieu de la
page. Un sélecteur segmenté les sépare : Nutrition, Poids.

Ce n'est pas une invention : **le §7 pose déjà ce principe pour l'onglet
Entraînement** — « sélecteur segmenté au sein d'un écran unique, et non
navigation imbriquée ». Stats le suit, et le §7 est amendé pour le dire
(`specs §14.16`). Le « tableau de bord unique » du §7 tient : c'est un écran,
pas deux.

**Conséquence non demandée et retenue : seul le volet choisi est monté**, donc
les lectures de l'autre ne tournent pas. Empilé, le volet poids interrogeait la
base à chaque visite de l'onglet, que quelqu'un descende jusqu'à lui ou non.
React Query garde ce qu'il a lu, donc revenir est le cache et non SQLite.

**Les plages sont tenues par l'écran, au-dessus des deux volets.** Un état posé
dans un composant démonté disparaît avec lui : la plage choisie sur un onglet
doit survivre à une visite sur l'autre, ce que n'importe qui attend d'un
contrôle réglé exprès.

**Le retour en haut se fait DANS LE HANDLER, pas dans un effet.** Les deux
volets n'ont pas la même longueur, donc arriver à un décalage que le nouveau ne
peut pas remplir le laisse borné à un endroit arbitraire — la page s'ouvrirait
à mi-hauteur d'un volet que personne n'a fait défiler. Un effet le ferait
**après** que le nouveau contenu a été peint, ce qui est le vacillement que la
tranche 3 a retiré du carrousel ; là il tourne sur un toucher, avant le
re-rendu, sur du contenu qui va être remplacé.

> **⚠️ RENVERSÉ LE 17/09/2026, sur demande : il n'y a plus de retour en haut du
> tout.** Le risque décrit était réel et plus petit que son prix — iOS borne un
> tel décalage au bas du nouveau contenu, donc la page est *défilée*, pas
> fausse, alors que le saut obligeait à redescendre après chaque comparaison
> entre deux volets ou deux plages. **La partie qui reste vraie** est le
> raisonnement sur l'effet : si un retour en haut devait revenir un jour, il
> serait dans le handler.

**`NutritionPanelSection` sort de l'écran, tel quel.** Avec un volet poids à
côté, un écran qui tenait en ligne les requêtes d'un volet, son état de plage et
sa branche vide aurait dû tenir les deux. L'écran est du câblage à nouveau.

### Le bloc poids ne garde que ce qu'un chiffre ne dit pas

**Le titre « Poids » de la carte part** : le titre de section au-dessus le dit
déjà, et le même mot deux fois en dix-huit points de hauteur est le mot qui ne
dit rien la seconde fois. Même raisonnement que les titres retirés des listes de
recettes et de repas récents une fois que le filtre les nommait.

**« Enregistré pour cette date » part aussi**, parce qu'il ne répétait que ce
qu'un chiffre en noir plein signifie déjà. Ce qui reste est le chiffre — 30
points, en gras — entre deux boutons de 44, qui est le minimum tactile d'Apple
et non un nombre qui avait l'air juste. La carte n'a plus rien d'autre à loger.

**Mais « Repris du 14 sept. » SURVIT, et c'est le point.** Cette ligne n'est pas
du même ordre que celle qu'on retire : c'est la seule chose qu'un chiffre ne
peut pas dire — que personne ne s'est tenu sur une balance pour lui, et de quel
jour il vient. La supprimer laisserait la distinction reposer sur une nuance de
gris, et **un nombre gris ne s'explique pas tout seul**. La couleur atténuée et
la ligne sont un signal en deux moitiés, pas deux signaux.

Un poids repris affiché comme un poids mesuré est exactement le chiffre faux et
plausible que le §14.15 n° 2 existe pour empêcher.

**Une hauteur retenue pendant l'attente.** La carte réserve la hauteur du
stepper tant que la requête n'a pas répondu, sinon elle grandirait sous les
repas au moment où elle répond — le tassement que le carrousel a passé la
tranche 3 à supprimer, en plus petit.

## Les plages du poids, et un défaut livré qui déplaçait les chiffres (15/09/2026)

**« Tout » disparaît, une semaine prend sa place** : 7 / 30 / 90 jours / 1 an.
Divergence avec le §9.2, demandée et amendée (`specs §14.17`).

**Et la semaine n'était défendable qu'avec la rampe de lissage.** Un point lissé
est une moyenne glissante sur sept jours, donc le premier point d'une plage a
besoin des **six jours qui la précèdent** pour avoir une fenêtre pleine. Sans
eux il est calculé contre une fenêtre courte et tombe trop bas — exactement le
biais mesuré à 22 % sur le rythme.

Sur 90 jours ça abîmait six points sur quatre-vingt-dix et passait inaperçu ;
**sur 7 jours ce serait six sur sept**. D'où `readRangeFor` : ce qui est **lu**
et ce qui est **dessiné** sont deux valeurs distinctes, pas un drapeau, pour que
les jours de rampe ne puissent pas atteindre un axe. Le panneau lisse sur la
première puis coupe à la seconde.

La rampe vaut **zéro au-dessus du grain jour** : un seau hebdomadaire est déjà
une moyenne de ses jours, il n'y a aucune fenêtre glissante à remplir.

**`readFirstWeightDate` et son hook sont supprimés** — « tout » était leur unique
appelant. Supprimés plutôt que gardés : du code sans appelant est un piège pour
qui le rebranchera en le croyant utilisé, et le jour où une plage « tout »
revient, c'est six lignes.

**Le grain `month` n'a plus aucun appelant, et la branche reste.** D9 est
normative — « par mois au-delà d'un an » — et le calcul doit déjà être juste le
jour où une plage plus longue revient. Mais aucune plage offerte ne dépasse 365.
**Un test le dit explicitement**, pour qu'un lecteur ne le déduise pas lui-même
et qu'une suppression « de code mort » soit un acte délibéré.

### Un champ décimal lié à un nombre déplace les chiffres

**Défaut livré depuis la tranche 3, reproduit puis corrigé en cinq endroits.**

Lier un champ à un nombre — `String(valeur)` à l'affichage, `parseDecimal` à la
frappe — ne perd pas seulement le séparateur. Il **déplace les chiffres** :

```
tapé "1"    -> stocké 1  -> le champ montre "1"
tapé "1,"   -> stocké 1  -> le champ montre "1"     la virgule a disparu
tapé "1,2"  -> le champ contient "12"
stocké: 12
```

Douze grammes là où un virgule deux était voulu. Plausible, faux, invisible —
le seul genre de faux qui compte. Atteignable sur **les quatre macros d'un
aliment, la quantité d'une portion, celle d'un ingrédient, le rendement d'une
recette et une ligne ajustée**.

**`core/ui/decimal-input.tsx`** le règle : l'état **est le texte tapé**, et le
nombre est rapporté vers le haut. « 1, » est un état légal de la frappe de
« 1,2 » et doit survivre à l'écran ; il se lit simplement 1 pour qui demande.

**Et il se resynchronise quand la valeur change de l'extérieur** — un aliment
qui se charge, des lignes qui se ré-échelonnent — en comparant la valeur
entrante à ce que son propre texte **parse**. Après « 1, » les deux valent 1,
donc rien n'est touché ; au chargement, elles diffèrent et le champ se remplit.

**La correction se fait PENDANT le rendu, jamais dans un effet.** C'est la
réponse de React à une valeur que l'état doit suivre, et la règle que ce projet
a apprise deux fois : un effet tourne après que son rendu a été peint, donc le
champ montrerait le texte périmé une image puis vacillerait.

**`MacroFieldRow` n'a pas bougé ; c'est son appelant qui était fautif.** Le
fichier le nommait déjà : « the editor as numbers on a draft, free entry as the
strings that were typed — **and the string is the one that can be shared** ». La
saisie libre tenait du texte et était juste ; l'éditeur d'aliment tenait des
nombres. Il tient désormais quatre chaînes à côté du brouillon, écrites ensemble
dans `setMacro` pour qu'elles ne puissent pas dériver. Zéro changement sur une
rangée partagée et vérifiée sur l'appareil.

**Audit consigné** : tout champ décimal restant tient déjà du texte — saisie
libre, quantité, objectifs de repas et de modèle, poids, objectif de poids.
`recipe.prepMinutes` reste lié à un nombre et n'est pas concerné, son clavier
`number-pad` ne portant aucun séparateur.

## Un formulaire ne se fige plus sur une valeur périmée (15/09/2026)

**Signalé à l'usage** : modifier un aliment de la bibliothèque, l'enregistrer,
puis le rouvrir affichait les valeurs d'**avant** la modification. Sortir et
revenir une seconde fois donnait les bonnes.

**Trois pièces, et aucune n'est fausse toute seule** :

1. enregistrer navigue en arrière dans le `onSuccess` de la mutation, donc
   **l'écran est démonté tout de suite** ;
2. le bus regroupe à 60 ms, donc il invalide **après**, sur une requête devenue
   **inactive** — React Query la marque périmée et ne la relit pas, personne ne
   la regardant ;
3. à la réouverture il sert d'abord la valeur **en cache** et lance une relecture
   derrière. Le formulaire se figeait sur cette première valeur — « réappliquer
   à chaque rendu écraserait ce qui est en train d'être tapé » — et ignorait la
   fraîche arrivée un instant plus tard.

D'où le symptôme exact : première ouverture périmée, seconde correcte, la
relecture ayant entre-temps rendu le cache juste.

**Et ce n'est pas un défaut d'affichage.** Un formulaire ouvert sur une valeur
périmée puis **enregistré** la réécrit par-dessus la valeur courante. Corriger
le nom d'un aliment aujourd'hui, le rouvrir pour corriger sa marque, et ses
macros repartent à ce qu'elles étaient ce matin. Rien ne le dit, et l'export
emporte le résultat. C'est ce qui fait que ça se corrige plutôt que se signale.

**`isStale` est la bonne question ici, et le couplage se dit.** Le client pose
`staleTime: Infinity` — délibéré, « il n'y a pas de serveur, pas d'autre
écrivain, pas de synchronisation ». Donc `isStale` ne veut pas dire « vieux » :
il veut dire **exactement** « le bus a signalé un changement sur une table que
cette requête lit, et elle n'a pas été relue depuis ». Avec un `staleTime` fini,
tout serait périmé tôt ou tard et **aucun formulaire ne se remplirait jamais** —
raison pour laquelle `use-settled` vit dans `core/query`, à côté du client qui
le rend vrai.

**L'état est ajusté pendant le rendu**, jamais dans un effet : un effet tourne
après que son rendu a été peint, donc le formulaire serait vide une image puis
se remplirait. Même règle que le `key` du carrousel et les molettes de la
tranche 4.

**Et il ne change jamais d'avis.** Une fois une valeur fraîche rendue, c'est
celle-là pour la vie de l'écran — sinon une écriture faite depuis ce formulaire
lui reviendrait et écraserait ce qui est en train d'être tapé, ce que les
drapeaux `loaded` protégeaient depuis le début.

**Sept écrans corrigés, pas un.** Le patron « drapeau `loaded` + effet qui capte
la première donnée » était partout : éditeur d'aliment (rapporté), saisie libre,
éditeur de recette, éditeur de modèle, éditeur de repas, écran de quantité,
saisie du poids. Tous rouvrables après édition, tous capables de réécrire
l'ancienne valeur.

Deux prennent la valeur figée **à un seul endroit**, et c'est délibéré :
`meal-editor` dérive son repas d'une requête de journée qui sert aussi à décider
quels **types** sont encore libres — la faire attendre offrirait brièvement les
quatre, ce qui est un vacillement là où la valeur périmée était inoffensive. Et
`quantity` initialise ses molettes depuis `initial` dans un initialiseur d'état,
ce qui les a empêchées de tourner en s'ouvrant en tranche 4 : ce qu'il reçoit au
montage est ce qu'il garde.

**Ce que le test peut dire** : le hook ne se rend pas depuis Node, donc ce qui
est fixé est la **décision**, sortie en fonction pure — une valeur signalée par
le bus est refusée, une fraîche acceptée, `undefined` n'est jamais une réponse
et `null` en est une. La séquence des trois rendus d'un écran rouvert est jouée
telle quelle.

## Deux icônes, et un PNG écrit à la main (15/09/2026)

**Les deux variantes partageaient la même icône.** `app.config.ts` nommait
`./assets/icon.png` une seule fois, donc la quotidienne et la dev étaient
indiscernables sur l'écran d'accueil — alors que le §2.2 en fait deux
identifiants, deux conteneurs, l'un avec les vraies données et l'autre jetable.
Lancer la mauvaise ne coûte rien ; **exporter depuis la mauvaise**, ou croire un
chiffre lu sur la mauvaise, si.

**Aucun outil de rendu n'existe sur cette machine** — pas d'ImageMagick, pas de
rsvg, pas de PIL — et le §5 n'admet aucune dépendance pour dessiner un carré.
Donc `scripts/generate-icons.mjs` **écrit le PNG à la main** : `zlib` est natif
à Node, et un PNG est une signature, un IHDR, un IDAT dégonflé et un IEND, avec
un CRC par bloc. Le dessin passe par des **champs de distance signés**
échantillonnés une fois par pixel, ce qui donne des bords propres sans
suréchantillonner seize millions de points.

Un script plutôt que deux fichiers binaires, pour le motif du module de
migrations : **un asset que personne ne peut régénérer est une décision que
personne ne peut revoir.**

**La forme est celle de l'application** : la jauge trois quarts de
`progress-ring.tsx`, 270° à partir de 225°, embouts arrondis compris. Le fond
sombre n'est pas un goût mais une mesure — le mint est à **2,13:1 sur blanc et
9,60:1 sur le fond sombre**, et une icône se lit à soixante points par-dessus un
fond d'écran que personne ne contrôle.

**L'icône dev cumule trois différences**, parce qu'une seule ne porte pas à
cette taille : fond ambre au lieu du presque noir, jauge réduite et remontée, et
**DEV** en toutes lettres en bas. Ambre et non rouge : le rouge est la couleur
destructive de cette application (`#e02d1f`, tenue par un test de contraste), et
une icône qui crierait « danger » à chaque ouverture apprendrait à l'œil à
l'ignorer. `warning` veut déjà dire « regarde » et ne veut dire que ça.

**Les lettres sont des traits, pas de la typographie.** Aucune fonte n'est
embarquée : trois lettres géométriques sont une douzaine de segments, là où une
fonte devrait être licenciée, lue et rasterisée pour un mot qui ne change
jamais.

### Le script se vérifie lui-même, parce que personne ici ne peut regarder

**« Il a écrit un fichier » n'est pas une preuve qu'il a dessiné quelque
chose.** Le script imprime donc un aperçu ASCII en luminance *et* sonde des
pixels dont la couleur découle de la géométrie : le montant d'un D est sombre,
le contre-poinçon qu'il enferme ne l'est pas. Dix-neuf sondes.

**Et elles ont attrapé un vrai défaut avant livraison.** La première version
posait un trait de `0.055` pour une hauteur de `0.17` : trois barres de 56
pixels dans 174, ce qui **laisse trois pixels entre elles**. Le E se serait lu
comme un rectangle plein à taille d'icône, et rien dans le dessin ne l'aurait
dit. La règle qui en sort : une lettre à trois barres a besoin de **cinq
bandes** — barre, air, barre, air, barre — donc le trait vaut un cinquième de la
hauteur.

**Conséquence de chaîne de build : les icônes entrent dans le binaire par
`expo prebuild`.** Les voir demande donc **un cycle CI et une réinstallation**,
pour les deux variantes. Rien dans le bundle JS ne les porte, donc `npm run
bundle:ios` reste vert sans rien prouver — la même famille de piège que
`expo-camera` et `react-native-svg`, à ceci près qu'ici il n'y a aucun plantage
au bout, seulement l'ancienne image.

## Ce que la tranche 9 a établi

**Le greffon d'un paquet Expo s'applique TOUT SEUL, et la tranche 2 avait écrit
le contraire.** C'est le constat le plus important de la tranche, et il a failli
coûter un cycle CI plus une installation refusée.

La tranche 2 avait inscrit qu'`expo-sharing` n'ajoute pas sa cible d'extension
« parce qu'il n'est pas déclaré dans `plugins` ». C'est faux. Sur le SDK 57 un
config plugin de paquet est **auto-appliqué** ; si `expo-sharing` n'ajoute rien,
c'est que `withShareExtension` est **inerte sans `props.ios.enabled`**, qui vaut
`false` par défaut. L'effet observé était vrai, la cause inscrite ne l'était pas
— et une cause fausse se réutilise.

Elle a été réutilisée deux fois :

- **Le plan de la tranche 9 prévoyait de ne pas déclarer `expo-notifications`**
  pour éviter son entitlement. Le pré-vol a montré que `expo prebuild` avec rien
  de déclaré écrit `aps-environment: development` dans `Suivi.entitlements` —
  la capacité Push, qu'un compte Apple gratuit n'a pas et que SideStore ne peut
  pas signer. La forme exacte de l'échec du test B avec HealthKit.
- **La justification d'`expo-camera` en tranche 4** — « sans la déclaration, iOS
  tue l'application faute de `NSCameraUsageDescription` » — est fausse aussi.
  Mesuré en retirant la déclaration puis en relançant le pré-vol : la clé est
  écrite quand même, avec le texte anglais du paquet, `Allow $(PRODUCT_NAME) to
  access your camera`. Ce que la déclaration achète est le **texte français**,
  ce qui suffit à la garder — mais la raison était la mauvaise.

**Le remède est un greffon qui en défait un autre** : `plugins/with-no-aps-environment.js`,
déclaré **en dernier** pour s'exécuter après celui qu'il annule. Il `delete` la
clé plutôt que de l'écraser, `withNotificationsIOS` ne l'écrivant que
`if (!config.modResults['aps-environment'])` — poser une autre valeur ne ferait
que choisir la valeur. Vérifié, pas déduit : le fichier d'entitlements sort avec
un `<dict/>` vide et `NSCameraUsageDescription` survit.

**La règle qui en sort, pour toute dépendance native à venir : un pré-vol
`expo prebuild` puis une lecture de l'`Info.plist` ET des `.entitlements`.**
Il est local, il coûte une minute, et aucun test en Node ne peut le remplacer —
un greffon auto-appliqué ajoute un entitlement sans jamais apparaître dans
`app.config.ts`.

**Une notification LOCALE ne demande aucun entitlement.** Lu dans la source du
paquet, pas de mémoire : `registerForRemoteNotifications` ne vit que dans
`ios/.../PushToken/PushTokenModule.swift`, atteint seulement par
`getDevicePushTokenAsync` ; le subscriber AppDelegate autolinké n'implémente que
des rappels passifs et ne déclenche rien ; et l'effet auto-exécuté à l'import,
`DevicePushTokenAutoRegistration.fx`, sort immédiatement faute d'information
d'enregistrement stockée — seul `setAutoServerRegistrationEnabledAsync(true)`
l'arme. Rien ici n'appelle ces chemins.

**Le déclencheur `DATE` d'`expo-notifications` n'est pas une date.** Lu dans
`TriggerRecords.swift` : `DateTriggerRecord` construit un
`UNTimeIntervalNotificationTrigger` depuis `timeIntervalSinceNow`, c'est-à-dire
**un délai en secondes figé à la planification** — il dérive au changement
d'heure et lève si l'instant est passé. Seul `CalendarTriggerRecord` produit un
vrai `UNCalendarNotificationTrigger`, apparié sur des composantes murales. Une
occurrence porte donc `year/month/day/hour/minute` et pas seulement son instant.
C'est D3 à la frontière native : une date civile est la clé métier, et un délai
en millisecondes est précisément ce qu'`addDays` existe pour ne pas faire.

**Les quatre sortes n'anticipent pas pareil, et D14 en parle comme si.** C'est
la forme de toute la tranche :

- **Pesée et journal vide** anticipent pleinement : leur texte ne porte aucun
  chiffre, la condition de demain est inconnue aujourd'hui, donc les sept
  occurrences sont programmées et celle du jour est retirée dès que la condition
  est satisfaite.
- **Le bilan ne le peut pas.** Son texte EST les chiffres du jour. En programmer
  sept mettrait six notifications en file annonçant les chiffres d'aujourd'hui
  des jours où ils n'ont rien à voir. Seule l'occurrence du jour est planifiée.
  Prix assumé : un jour où l'application n'est pas ouverte, aucun bilan ne
  sonne — ce qui est juste, une journée sans saisie n'ayant rien à annoncer.
- **Le rappel d'export anticipe MIEUX que les autres**, seul à le pouvoir :
  `last_export_at` ne bouge que si l'application tourne, donc savoir si le jour
  J+k sera en retard est une arithmétique d'aujourd'hui. Les jours qui ne le
  seront pas ne sont jamais programmés, au lieu d'être programmés puis annulés.

**Aucun déclencheur répétitif, et c'est une contradiction interne à D14 qu'il
fallait trancher.** Le même paragraphe demande « déclencheurs répétitifs
préférés » (pour le plafond de 64) et « annulation immédiate dès que la
condition devient satisfaite ». Incompatible : un répétitif est **une** entrée
en file, donc l'occurrence de demain ne s'annule pas sans tuer toutes les
suivantes. Et le plafond n'est pas approché — quatre sortes sur sept jours font
vingt-huit contre soixante-quatre.

**Le bilan se reprogramme par la VALEUR de ses chiffres, jamais par un filtre de
date.** C'est le point le plus délicat, et il se résout en ne le résolvant pas
là où il se pose. D14 veut une reprogrammation à chaque écriture concernant la
journée courante et surtout pas sur une date passée ; le bus invalide par
prédicat de table et ne dit rien de la date (D8) ; et écrire une invalidation à
la main est un interdit absolu.

La discrimination n'est donc pas faite à l'écriture. La requête compose les
chiffres du jour, le bus l'invalide sur tout changement de `journal_entry`, elle
se relit — et une écriture sur une date **passée** rend exactement les mêmes
chiffres, donc exactement le même texte, donc le diff ne trouve rien à faire.
La règle de D14 est obtenue **comme conséquence de la donnée qui n'a pas bougé**.
Coût : un rafraîchissement pour rien, celui que le bus assume déjà par écrit.

Corollaire : la comparaison porte sur le **texte rendu**, pas sur l'objet de la
requête — React Query en rend un neuf à chaque relecture. Et un effet de bord
qui n'en est pas un : un dixième de kilocalorie ne déplace rien à l'écran, donc
ne reprogramme rien.

**L'horloge est lue dans la requête, jamais par `useToday`.** `useToday` est
**figé contre l'horloge** à dessein — il ne se relit que si le seuil change,
pour qu'un libellé ne bouge pas sous une liste parce que minuit est passé. Un
planificateur veut l'inverse : le jour qu'il planifie doit être le jour qu'il
est, à chaque fois qu'il tourne.

**`refetch()` au passage au premier plan, jamais `invalidateQueries`.** Rien
n'énumère de clé et le bus reste seul à traduire table vers invalidation.
Revenir dans l'application n'est pas une écriture : c'est l'horloge qui a bougé,
donc une raison pour **cette** requête de se relire et pour rien d'autre de se
produire. C'est aussi ce qui fait rouler la fenêtre de sept jours — chaque
retour au premier plan planifie un jour de plus au bout et laisse tomber ceux
qui sont passés.

**Personne n'annule jamais une notification : elle est annulée en n'étant plus
dans le plan.** `applyPlan` est un diff entre le plan voulu et ce qu'iOS tient,
sur des identifiants `<sorte>:<date>` stables — donc idempotent, donc sans
risque à lancer à chaque rendu. L'alternative — un `cancel` au site d'écriture
du poids — serait un second endroit qui connaît les règles, libre de diverger de
`buildPlan`, et le désaccord se lirait comme un rappel qui sonne après qu'on
s'est pesé.

**Et le diff ne touche qu'à ce qu'il a posé.** Défaut trouvé en chemin, qui
aurait mordu en tranche 11 : « en attente et pas dans le plan » décrit
parfaitement le minuteur de repos, qui vit dans la même file. Il aurait été
annulé au milieu d'une séance par un planificateur qui n'en a jamais entendu
parler, et rien ne l'aurait signalé — le minuteur n'aurait simplement pas sonné.
L'appartenance est le préfixe de l'identifiant, lu depuis `NOTIFICATION_KINDS`.

**`cancelAll` a existé une heure puis a disparu** : un plan vide annule déjà
tout ce qui est à nous par le diff ordinaire. Un second chemin aurait été un
second endroit qui décide ce qui nous appartient.

**`annule avant de programmer`, et l'ordre n'est pas cosmétique.** Quand une
occurrence est remplacée parce que son texte a changé — le bilan, à chaque
repas logué — programmer d'abord laisserait les deux versions en file un
instant, et si l'annulation échouait ensuite, ce sont les **anciens** chiffres
qui survivraient. Le mauvais sens de panne pour la notification dont tout le
rôle est de porter des chiffres à jour.

**La réserve du §14.15 se résout sans arbitrage.** Le §9.1 place la pesée « au
réveil » et le §8.2 laisse régler l'heure de bascule entre 0 h et 6 h ; ici le
rappel doit décider seul de « la date du jour ». La sortie est de ne pas
raisonner en « le rappel du jour J » : **une occurrence est un instant, et la
date qu'elle concerne est `currentLocalDate(cutoff, cet instant)`** — la même
fonction que tout l'écran. La condition lit la même date, donc les deux ne
peuvent pas se contredire, à n'importe quelle heure.

Le cas ordinaire est sûr sans rien de tout ça : le seuil est **plafonné à 6 h**,
donc toute heure ≥ 6 h tombe sur la date civile du jour. Le cas qui l'exige est
un rappel réglé **avant** le seuil — 5h30 avec un seuil à 6 h — qui porte alors
sur la veille. Ce n'est pas un défaut : à 5h30 toute l'application dit qu'on est
encore hier, ce que le §14.15 énonçait déjà d'une pesée à 3 h du matin.

**La lecture itère sur le CODE, jamais sur la table**, et c'est cette direction
qui rend sûre l'absence de CHECK sur `kind` plutôt qu'un pari sur ce qu'une
archive contiendra. Les quatre sortes viennent de `NOTIFICATION_KINDS` et
chacune s'interroge par clé : une ligne de sorte inconnue ne peut atteindre ni
le planificateur, ni l'écran, ni être activée par un import. Écrite dans l'autre
sens — `SELECT *` puis brancher sur ce qui revient — la même archive aurait
tendu au planificateur une sorte sans branche, et le schéma aurait **dû** porter
une CHECK. La structure achète la liberté dont la tranche 11 aura besoin.

**`readDayHasEntries` plutôt que `readDayTotals().kcal > 0`.** Une entrée peut
ne porter aucune calorie — un café noir, une saisie libre à zéro, un parent de
recette dont les macros sont `NULL` par conception. « Rien de logué » et « rien
qui compte » sont deux questions, et le §9.3 pose la première.

**Une molette pour l'heure, là où le §14.12 n° 9 avait choisi des rangées à
coche.** Ce n'est pas une exception à cet arbitrage mais le même raisonnement
arrivant à l'autre réponse : il tenait à ce qu'un `UIPickerView` coûte un
défilement pour ce qui peut être un toucher, et à ce qu'en rangées « bornée
entre 0 h et 6 h » se **voie**. Une heure de notification a 24 × 12 valeurs — la
liste serait exactement le défilement qu'on refusait — et aucune borne n'y est à
montrer. Minutes par pas de cinq ; une valeur hors grille garde son propre
élément, pour que la molette montre la vérité au lieu de s'aimanter sur un
chiffre que personne n'a choisi.

**Un refus d'autorisation ne rabat pas l'interrupteur.** Le faire mentirait à
l'écran sur ce qui a été demandé et laisserait un contrôle qui se défait tout
seul. Maintenu, le jour où l'autorisation est donnée dans les Réglages iOS tout
se met à sonner sans qu'on retouche quoi que ce soit. Le bandeau nomme le
chemin, parce qu'un utilisateur qui ne sait pas où aller n'a pas de recours.

**`setNotificationHandler` au niveau module**, sinon iOS délivre en silence à
une application au premier plan — et la notification la plus susceptible
d'arriver téléphone en main est justement le bilan. **Aucun badge** :
l'application n'a pas de compteur de non-lus, et un nombre sur l'icône que rien
n'efface est un défaut qui survit à la notification.

**Une seule porte vers iOS, et un test de conventions la tient.**
`expo-notifications` ne s'importe que depuis `features/notifications/native/`.
Même dispositif que la frontière zod, pour un problème plus tranchant : zod au
mauvais endroit coûte une seconde déclaration du schéma ; une dépendance
**native** au mauvais endroit coûte **un cycle CI** pour être diagnostiquée, le
bundle JS restant vert pendant que l'écran plante. C'est aussi ce qui a permis
d'écrire et de vérifier par Metro tout ce qui précède le natif, sur le binaire
déjà installé, et de ne payer qu'un seul cycle.

**Ce qu'aucun test ne pourra couvrir, dit plutôt que laissé croire.** iOS ne
déclenche rien en Node, et la moitié de cette tranche est une conversation avec
le système.

*Testable, et testé* : les conditions contre un vrai fichier SQLite ; la
sélection des occurrences et leurs dates sous les trois fuseaux ; le texte du
bilan ; qu'une écriture sur une date passée ne le change pas ; le diff et son
idempotence ; que le plan reste sous 64 ; la normalisation des heures ; la
présence du greffon de retrait, en dernière position.

*Non testable* : qu'iOS déclenche quoi que ce soit ; que l'autorisation arrive
au bon moment ; que le plafond se comporte comme documenté ; que l'annulation
atteigne réellement la file ; que le texte tienne dans la bannière. Le
planificateur est exercé contre un hôte factice, ce qui fixe la **taxonomie** de
ce qu'on demande à iOS et non qu'iOS l'honore — exactement la limite du client
Open Food Facts contre un `fetch` injecté.

**Le piège du lockfile a mordu une SIXIÈME fois**, à l'installation
d'`expo-notifications` : **zéro** liaison rolldown au lieu de quinze. Le compte
reste le seul contrôle qui veuille dire quelque chose, et
`rm -rf node_modules && npm ci --ignore-scripts` la seule vérification qui
vaille.

**Dépendance native transitive, signalée** : `expo-application` arrive avec
`expo-notifications`. Elle n'a pas été choisie, elle est autolinkée, et elle lit
l'identifiant de bundle et la version. Consignée plutôt que laissée entrer en
silence, l'ajout d'une dépendance native sans validation étant un interdit
absolu.

## Les Réglages prennent une page par catégorie, et une molette cesse de tourner seule (15/09/2026)

**Une molette pilotée par une valeur qui fait l'aller-retour en base revient à
sa position, puis tourne toute seule jusqu'à la valeur choisie.** Constaté à
l'usage sur l'écran d'heure de notification, diagnostiqué dans le code.

La première version alimentait le `Picker` directement depuis la requête :
`value` venait de `notification_setting`, `onChange` y écrivait. Tourner la
molette faisait alors ceci — elle bouge, `onChange` écrit, et React rend de
nouveau avec l'**ancienne** valeur, puisque l'écriture doit traverser SQLite et
que le bus groupe 60 ms avant d'invalider. React Native commande alors
consciencieusement le picker à la valeur qu'on lui a tendue : il revient. Un
instant plus tard la nouvelle valeur arrive, et il traverse tout seul jusqu'à
elle.

**Un `UIPickerView` n'est pas un champ de texte.** Il *anime* vers le
`selectedValue` qu'on lui donne, donc une valeur contrôlée qui passe par une
base de données ne peut pas en piloter un. Un `TextInput` dans la même
situation se contenterait de clignoter ; une molette joue toute la transition,
ce qui la rend spectaculaire et parfaitement illisible.

**Le remède est la règle que la tranche 4 avait déjà écrite, arrivant par
l'autre bout** : « les molettes restent l'unique source de vérité, ce qui est
tapé atterrit **dessus** ». La molette possède la valeur tant que l'écran est
ouvert ; la base est écrite **en conséquence**, et ce qui en revient ne
l'atteint jamais.

Et la valeur de départ est prise **une seule fois, pendant le rendu** qui l'a en
premier — jamais dans un effet. C'est le même piège que les molettes de
quantité de la tranche 4 et que le `key` du carrousel de la tranche 3 : un effet
tourne **après** que son rendu a été peint, donc la molette serait montée sur
autre chose avant de bouger.

**Corollaire, valable pour tout contrôle natif animé** : la question à se poser
n'est pas « d'où vient la valeur » mais « que fait le contrôle quand on lui en
tend une autre ». Un contrôle qui *anime* vers sa valeur ne peut pas être
contrôlé par un état asynchrone. Ça vaut pour `Picker`, et ça vaudra pour tout
`UIDatePicker` ou `UISlider` qui arriverait.

**Les Réglages prennent une page par catégorie**, et l'onglet devient une liste
de destinations. C'était un seul défilement contenant tous les réglages de
l'application, ce qui marchait à trois catégories ; la tranche 9 en a ajouté une
septième et l'écran est devenu quelque chose qu'on **traverse** pour atteindre
ce qu'on est venu chercher. Le §12 des specs range d'ailleurs déjà les réglages
par catégorie : une page par catégorie l'applique plutôt qu'elle n'en diverge.

Deux gains au-delà du défilement, et le second est celui qui comptait :

- une catégorie a enfin la place de la note qui l'explique ;
- **un contrôle qui demande de la place — une molette, un pavé numérique —
  cesse d'être coincé entre deux rangées sans rapport, sur une page qui défile
  sous un en-tête transparent.**

**Chaque rangée de l'index énonce sa propre réponse** : le thème en vigueur,
l'heure de bascule, combien de rappels sont actifs, l'ancienneté du dernier
export. Une liste de liens sans rien à droite est une table des matières — il
faut ouvrir une page pour savoir ce qu'elle dit. Ces quatre réponses tiennent en
une chaîne courte, donc le cas courant, **vérifier**, ne coûte aucune
navigation. L'ancienneté de l'export y est parce que le §5.4 en fait le seul
chiffre qui ne doit jamais rassurer à tort : derrière un empilement, c'est un
chiffre que personne ne voit.

**Et chaque notification a sa propre page.** Les quatre étaient en ligne, la
molette se dépliant sous sa rangée. C'est ce que fait iOS avec ses propres
réglages de notifications — une rangée par application, les interrupteurs à
l'intérieur — et surtout c'est ce qui donne à la molette une page où elle est
simplement un élément de la disposition : rien en dessous à bousculer, rien
au-dessus qui la fasse passer sous la barre.

**Réserve inscrite** : le défaut d'affichage — la molette qui se superposait à
ce qui la suivait — a été **rapporté, pas observé ici**. Ce qui est certain est
que cette disposition supprime la cause la plus probable, un picker natif qui
déborde de sa rangée sur la suivante. La confirmation appartient à l'appareil.

**`core/ui/settings-list.tsx` naît à son second utilisateur**, ce que la règle
demande : `SettingsPage`, `SettingsSection`, `SettingsCard`, `SettingsNote`,
`ChoiceRow` et `LinkRow` étaient privés à `settings-screen.tsx` depuis la
tranche 7, ce qui était juste tant qu'un seul écran s'en servait. Le découpage
leur donne six utilisateurs réels dans **deux** features. Sortis tels quels
plutôt que redessinés : leur espacement est celui de `DataSection`, écrit avant
eux et que ces pages côtoient, et un « rangement » au passage aurait fait
cohabiter deux groupes espacés différemment sur une même page.

**`describeAge` descend dans le domaine**, pour la même règle : la rangée
Données énonce l'ancienneté et la page derrière la redit en entier. Deux
orthographes d'un même chiffre seraient libres de diverger, et celle qui
dériverait est celle qu'on lit d'un coup d'œil.

**Le paramètre de route est rétréci dans `app/`, et c'est du câblage.** Un
paramètre est une chaîne venue du dehors — lien profond, historique périmé,
faute de frappe. `NOTIFICATION_KINDS` est la constante que les lectures
parcourent déjà et que le catalogue d'export valide : la comparer est l'unique
vérification qu'il y a, et l'écran reçoit une valeur déjà rétrécie. Une sorte
inconnue revient en arrière au lieu de rendre une page vide avec un titre et
rien dedans.

## Ce que la tranche 10 a établi

**Le vocabulaire des muscles et du matériel n'existait nulle part, et il est
inventé ici.** « Muscle » apparaît cinq fois dans les specs et jamais comme une
liste ; le §2.6 stocke `primary_muscle` en TEXT nu. Pourtant le §10.1 fait du
filtrage par muscle et matériel une fonctionnalité. Quinze groupes et huit
matériels sont donc **choisis**, à la granularité où l'on étiquette un exercice —
pas celle du dessin, qui découpe bien plus fin.

C'est exactement pour ça qu'aucune `CHECK` ne les tient. **Le critère reste celui
de la tranche 3 — ce qu'un élargissement casserait — et il donne ici la réponse
inverse de l'intuition** : une liste inventée ce matin, qui n'a jamais rencontré
un exercice réel, est le candidat le plus probable au changement de tout le
schéma. La tranche 3 avait refusé une CHECK sur `food_portion.name` pour huit
mots que les specs **donnaient**.

**`set_type` non plus, et c'est le §10.1 qui décide.** « Volume = charge ×
répétitions, sur les séries de travail validées uniquement » est une clause
**positive** — `WHERE set_type = 'work'`. Comparer avec `journal_entry.kind`,
dont le `SUM` n'a aucune clause et n'est juste que parce que l'ensemble est
fermé : élargir celui-là produit un total faux, élargir celui-ci exclut
simplement un type d'un total dont la définition l'exclut. Rien ne devient
plausible et faux.

**Différer `session_*` ne coûte rien, et le test est la direction des clés
étrangères.** `session_set.exercise_id` est déclarée dans `session_set`, que
`0009` créera entière contre un `exercise` déjà là. Le seul cas qui aurait coûté
est l'inverse — une table de `0008` référençant `session` — et il n'existe pas.
Mot pour mot l'argument de `notification_setting` différée de `0006` à `0007`.

**`exercise_note` est spécifiée**, contrairement à ce qu'on croit en lisant le
seul §10 : le §6.3 la définit et le §10.3 la place dans la séance en direct. Sa
colonne `consumed_at` le confirme. C'est une table de la tranche 11, pas un trou.

**`routine_line.exercise_id` est en `NO ACTION`, et c'est le §5.3 qui l'a décidé
— par sa seconde phrase, pas par la première.** La première dit qu'aucune
suppression n'est bloquée, ce qui écarte le défaut SQLite. La seconde demande
« un avertissement nommant explicitement ce qui sera perdu » — et **pour nommer,
il faut compter d'abord**. Un CASCADE ferait le même travail en silence et
l'avertissement devrait deviner. Précédent : `deleteFood`, qui fige puis
supprime. La clé étrangère est le filet ; la transaction est la politique.

Conséquence nettoyée dans la même transaction : **retirer la dernière ligne d'un
bloc laisse un bloc vide**, que la page afficherait comme une rangée que
personne ne peut expliquer. `removeLine` fait la même chose côté brouillon — les
deux chemins s'accordent au lieu que l'un laisse du travail à l'autre.

**Un superset, c'est deux exercices distincts dans un bloc — jamais deux
séries.** C'est la distinction qui décide quel temps de repos s'applique, donc
tout le reste. Compter les *lignes* aurait fait de tout bloc à plusieurs séries
un superset et déplacé son repos en silence : plausible, et faux pour chaque
exercice ordinaire de la routine. `restForLine` est le **seul** endroit où ce
choix se prend, pour que l'écran, l'écriture et la séance de la tranche 11 n'en
aient pas trois versions. Et ce qui est écrit suit : un superset pose son repos
sur le bloc et `NULL` sur ses lignes, un bloc simple l'inverse — stocker les deux
laisserait deux nombres sans règle disant lequel gagne.

Corollaire d'interface : **le champ de repos du bloc n'apparaît que sur un
superset.** L'offrir ailleurs inviterait à saisir une valeur que rien ne lit.

**`set_index` et `position` sont dérivés de l'ordre du tableau, jamais portés par
le brouillon.** Un tableau porte déjà un ordre, et deux sources pour un ordre est
la façon dont une liste finit par se contredire (D9). Dans un superset A/B à
trois séries, les lignes sont groupées par exercice et les index valent
1,2,3,1,2,3 : **la routine est une liste à LIRE**, c'est la séance qui décidera
de l'ordre d'exécution.

**La recherche partage le pliage et rien d'autre.** `foldForSearch` monte dans
`core/search/` — un exercice se cherche par son nom comme un aliment, et Hermes
n'est pas plus susceptible de porter les tables Unicode pour l'un que pour
l'autre. Ce qui ne monte **pas** est le barème : « danone » cherche une marque,
« poulie » un matériel, et ce ne sont pas les mêmes rangs. Partager le pliage
partage un vrai problème commun ; partager le barème aurait partagé une
coïncidence.

Deux choix de filtrage qui ne se devinent pas : **un muscle filtre les
secondaires aussi**, sans quoi filtrer sur Triceps cacherait le développé couché
— ce que cherche exactement qui bâtit une séance de poussée ; et **un matériel
non renseigné ne répond à AUCUN filtre**, parce que prétendre qu'il correspond
serait affirmer ce que personne n'a dit.

**Les exercices se cherchent sur leurs libellés FRANÇAIS.** Personne ne tape
`lower_back` ; on tape « lombaires ». La valeur est stockée en anglais pour que
la colonne et l'export restent d'une seule langue, et la recherche est le seul
endroit où les deux se rencontrent.

**Le réglage d'incrément est une valeur d'INITIALISATION, et l'écran le dit.**
Le §6.3 et le §10.4 le répètent : « propre à l'exercice, initialisé depuis la
valeur globale ». Lue une fois, recopiée. La phrase est **sur la page** parce que
l'hypothèse inverse est la naturelle — un réglage global qui ne change rien de
l'existant est surprenant tant qu'il ne le dit pas, et la première correction
faite là n'aurait silencieusement rien fait de ce qu'on attendait. C'est aussi
pourquoi `exercise.increment_kg` n'a **pas** de DEFAULT SQL : ce serait une
seconde source du même nombre, libre de diverger en silence.

### La carte corporelle, et les deux défauts que seul le regard a trouvés

**Sourcée, pas dessinée** : `melihcolpan/MuscleMap`, licence **MIT** —
permissive, attribution seule, aucun copyleft. On prend les **données**, pas la
bibliothèque : c'est un SDK SwiftUI dont le `BodyView` dessine dans un
`CGContext`, inatteignable depuis React Native. Aucune dépendance, donc **aucun
cycle CI** : `react-native-svg` est dans le binaire depuis la tranche 7 et D13
nommait déjà cet usage précis.

Vingt-cinq régions dessinées, quinze muscles stockés, une table entre les deux.
**Huit régions ne s'allument jamais et DESSINENT LE CORPS** — c'est ce qui donne
une silhouette à une routine qui ne travaille qu'un muscle, au lieu d'un membre
flottant sur du blanc. La huitième, `tibialis`, est une décision : c'est
l'antagoniste du mollet, l'allumer avec `calves` serait joli et faux.

**L'erreur contre laquelle cette carte est conçue est le FAUX NÉGATIF.** Un
muscle travaillé mais laissé gris se lit « je ne travaille jamais ça » — une
croyance fausse sur laquelle on agit pendant des semaines. Une région un peu trop
allumée coûte quelques points de largeur. Là où les deux vocabulaires ne
coïncident pas exactement, la table penche donc vers l'allumage.

**Premier défaut : arrondir les coordonnées cassait le dessin.** SVG colle les
nombres sans séparateur, donc `0.999.5` vaut 0,999 puis 0,5 ; arrondir le premier
à `1` donne `1.5`, soit **un seul** nombre. Le résultat sortait avec des bras
vraisemblables et faux. Les paths sont donc copiés **verbatim** — et ça vaut pour
toute retouche future de données SVG.

**Second défaut : le viewBox ne peut pas se calculer à l'exécution.** Une région
porte `a2.05 2.05 0 1.92-2.71` : un arc réclame sept nombres, celui-là en offre
cinq, et ses deux drapeaux d'un chiffre sont collés à ce qui suit de façon
**indécidable**. Les deux lectures placent le bord droit de la figure de face à
150 unités d'écart, et la plus large chevauche la figure de dos. Les paths étant
générés et immuables, **la boîte est une constante**, mesurée une fois par
`scripts/extract-body-map.mjs`.

Piège voisin, à connaître avant de parser du SVG ici : **les drapeaux d'un arc
sont des chiffres uniques**, et le SVG compressé écrit `01-.19` pour (0, 1,
−0,19). Un tokeniseur qui lit `01` comme un nombre décale tout ce qui suit. Et
**après un `m`, les paires suivantes sont des `l`**, pas d'autres `m` : les
traiter comme des déplacements accumule les décalages et fait dériver tout path
relatif.

**Ce qu'aucun test ne peut dire, et les tests le disent** : qu'une région allumée
soit anatomiquement au bon endroit. Un test vérifie que `chest` possède un path,
jamais que ce path traverse les pectoraux. Ça se règle en regardant.

### Trois choses apprises en exécutant

**`COLLATE NOCASE` ne trie QUE l'ASCII.** « Épaulé » se classe après « Zercher »
parce que U+00C9 est un code point plus grand que 'Z'. Ce n'est pas un défaut à
corriger dans le SQL : l'ordre affiché vient de `searchExercises`, qui compare
sur le nom **plié** — seul endroit où les accents peuvent l'être, `lower()` de
SQLite étant ASCII aussi et une colonne repliée étant de la donnée dérivée (D9).
L'`ORDER BY` donne un point de départ stable, pas un ordre final. `ix_food_name`
porte le même défaut depuis la tranche 3 sans que ça ait jamais été écrit.

**`tsc` a attrapé trois fois ce que `vitest` laissait passer** : des assertions
`as ExerciseId`, un helper de test typant ses muscles en `string`, des types non
importés dans le seed. Les trois fois, la suite était **verte**. Vitest ne
vérifie pas les types. C'est tout l'intérêt d'enchaîner par `&&` et non par `;`.

**Un test qui nomme une table FUTURE comme contre-exemple se périme en silence.**
`refuses a table it has never heard of` utilisait `'exercise'` depuis la
tranche 2. `0008` l'a rendue vraie, donc le test passait au vert **en n'assertant
plus rien** — le jour où il servait le plus. Il nomme désormais
`not_a_table_0000`, qu'aucune migration ne peut créer.

## Ce que les retours sur les routines ont établi (17/09/2026)

**Un exercice peut se mesurer en durée**, et ni le §6.3 ni le §2.6 ne le
prévoyaient — les deux ne décrivent une série que par ses « répétitions, fixes
ou en plage ». `exercise.tracks_duration` porte le fait, `routine_line.duration_seconds`
la cible. Le drapeau est sur l'**exercice** : un gainage est toujours
chronométré, un développé couché jamais, donc le fait appartient au mouvement.
Posé sur la ligne, il faudrait le répéter à chaque série et il pourrait se
contredire à l'intérieur d'un bloc, qui n'a qu'une colonne.

**Et la règle de la tranche 3 coupe dans les DEUX sens.** Une CHECK
`duration_seconds > 0` avait été écrite ; la génération a montré pourquoi elle
ne peut pas partir. SQLite ne sait pas ajouter une CHECK, donc drizzle-kit est
retombé sur une **reconstruction de `routine_line`** — et la reconstruction
produite était **cassée**, son `INSERT ... SELECT` lisant `duration_seconds`
depuis l'ancienne table qui ne l'a pas encore.

« Une migration porte ce qui ne peut pas s'ajouter plus tard » veut donc dire
aussi : **le moment de poser une CHECK était `0008`, et il est passé.** La
valeur est tenue par `validateRoutineDraft`, là où vivent déjà le `non_empty`
de `food.barcode` et la positivité de `weight_measure.value_kg`.

**Le repos appartient au bloc dans toutes les formes.** Le §10.2 ne l'énonce
que du superset, et la première version en avait déduit « la ligne le porte
sinon ». Faux à l'usage — personne ne se repose différemment entre deux séries
du même exercice — et ça coûtait à la rangée la largeur dont les quatre
colonnes ont besoin. Un bloc à un exercice **est** cet exercice.
`routine_line.rest_seconds` reste en base et `restForBlock` la lit en repli :
les lignes que cette application n'a pas écrites sont affichées, jamais
corrigées.

**Les séries sont un tableau, et un seul composant sert la lecture et la
saisie** — le §10.2 pris à la lettre (« présentation identique à la création »).
Deux composants dessinant une rangée finissent par diverger, et la première
chose à dériver serait la colonne où vivent les répétitions. La saisie comblait
au passage un **manque réel** : la première version n'offrait aucun moyen
d'entrer une charge, une plage ou un RIR.

Corollaire : **le press de rangée disparaît.** Les cellules sont des champs, et
un press couvrant quatre nombres se battrait avec le balayage qui supprime.
Dupliquer devient un bouton nommé ; toucher un exercice passe au **titre** du
bloc.

### La carte nuance, et la pondération est un arbitrage

**Une série pour un muscle secondaire compte une demie.** La règle évidente —
1 pour chaque muscle nommé — fait mentir la carte : sur une séance de poussée
les triceps atteignent 8 séries contre 3 aux pectoraux, et le dessin annonce
une séance de triceps. Ne compter que les primaires échoue dans l'autre sens :
les avant-bras ne sont presque jamais le primaire de personne et resteraient
gris pour toujours — le **faux négatif** contre lequel toute cette carte est
conçue.

**Les demies n'atteignent jamais l'écran.** « 4,5 séries » n'est pas une chose
que quelqu'un a faite. Le total pondéré décide la **couleur** ; l'infobulle
énonce des entiers — « 5 séries dont 2 directes ».

**Quatre paliers, pas un dégradé continu** : l'œil ne classe pas deux verts à
quelques pour cent d'écart, donc une échelle lisse se lit comme du bruit et
revendique une précision que rien ici n'a. Les seuils — 3, 6, 10 séries
pondérées — se lisent contre **une routine**, jamais contre une semaine : les
10-20 séries hebdomadaires habituelles mettraient chaque routine au palier le
plus bas et la carte ne changerait jamais de couleur. **Choisis, pas mesurés.**

**Les teintes sont l'accent désaturé vers la surface**, pas trois couleurs sans
rapport : la carte nuance **une** quantité, donc ses paliers doivent se lire
comme une échelle. En sombre elles vont vers la surface et non vers le blanc —
sinon le muscle le moins travaillé serait le plus lumineux de la figure et
l'échelle tournerait à l'envers.

**L'infobulle applique le §10.6**, qui tranche déjà l'interaction de tous les
graphiques : « toucher un point affiche sa valeur et sa date », aucun zoom,
aucun déplacement. Une seule différence — une région **non** travaillée ne
répond pas, parce qu'une infobulle disant « Tête » serait un contrôle qui a
l'air cassé.

**Un piège de jointure, attrapé par un test de base** : une ligne de muscle
secondaire existe une fois par **exercice**, donc une requête qui joint
`exercise_secondary_muscle` sans passer par `routine_line` compte trois
développés couchés comme une seule série indirecte de triceps.

### Une leçon d'outillage qui a failli coûter cher

**`npm run typecheck 2>&1 | grep … | head` masque les erreurs.** `head` ferme
le tuyau, `tsc` reçoit SIGPIPE, et le statut de sortie vient du `grep` — donc
un `&&` enchaîne sur du rouge invisible. Trois erreurs de types sont restées
cachées plusieurs commandes de cette façon. **Le typecheck se lit en entier ou
pas du tout.**

### Deux défauts d'interface trouvés à l'usage (17/09/2026)

**`pointerEvents="box-only"` empêche tout champ d'une rangée balayable de
prendre le focus.** Rapporté comme « les inputs ne marchent pas », diagnostiqué
dans le code. `box-only` veut dire : la couche prend le toucher et **rien à
l'intérieur n'en reçoit jamais**. C'était juste tant que chaque appelant
confiait du **texte** à `SwipeToDeleteRow` et laissait `onPress` porter la
pression — un `Pressable` reglissé dans le contenu réintroduirait l'échec
d'arbitrage pour lequel ce composant a été corrigé. Ça a cessé d'être juste le
jour où un appelant y a mis des **champs**.

La couche n'avale donc le toucher que lorsqu'elle a de quoi faire : une rangée
**ouverte**, ou une rangée à qui on a donné un `onPress`. **Réserve inscrite** :
un champ peut encore prendre le focus au relâchement d'un balayage, son
responder n'étant pas arbitré contre le pan — supportable là où un `Pressable`
ne l'était pas, focaliser un champ ne détruisant rien.

**Et un champ numérique lié au brouillon reperd son séparateur décimal.** Même
cause que le champ de poids en tranche 8 — et cette fois le commentaire du
fichier décrivait le remède *sans l'appliquer*. « 6, » se parse en 6, se rend
« 6 », la virgule disparaît sous le curseur. Le texte est un **état local**,
ajusté **pendant** le rendu quand une valeur entrante dit autre chose que lui,
jamais dans un effet.

**Modifier une routine reste sur sa page.** La règle « agir sur quelque chose
ouvre une fenêtre par-dessus » existe pour que la chose sur laquelle on agit
**reste visible** ; une fenêtre d'édition couvrait exactement la routine
qu'elle modifiait. Le §10.2 demande « présentation identique à la création » :
une page en deux états, pas deux pages qui se ressemblent. **La création garde
sa fenêtre** — il n'y a pas de page à basculer quand rien n'existe encore.

**Le repos s'affiche en haut de son bloc.** Sous les séries il se lisait comme
une note attachée à la dernière ; au-dessus, comme ce qui gouverne toutes — et
c'est la question qu'on se pose *entre* deux séries.

### Un superset s'exécute en alternance, et l'ordre stocké est celui-là (17/09/2026)

**La tranche 10 avait groupé un superset par exercice — A,A,A puis B,B,B — et
l'avait défendu en écrivant « la routine est une liste à LIRE, c'est la séance
qui décidera de l'ordre d'exécution ». La phrase se réfutait elle-même.** Un
superset n'a pas d'autre ordre d'exécution que l'alternance : une page qui
montre l'un et une séance qui exécute l'autre sont deux réponses à une seule
question, et la tranche 11 aurait dû redériver un ordre que l'écriture
connaissait déjà. `routine_line.position` est donc l'ordre d'exécution, et
`set_index` est le numéro de **tour**.

**Les tours sont dérivés, jamais stockés**, ce qui laisse intacte la règle
d'ouverture du module : le tour d'une ligne est son rang pour son propre
exercice — ce que `setIndexOf` calculait déjà — et l'ordre à l'intérieur d'un
tour est l'ordre d'apparition des exercices dans le bloc. Une source, le
tableau.

**Et c'est cette dérivation qui évite une migration.** Une routine stockée
groupée par exercice se lit en tours corrects telle quelle, puisque les rangs
par exercice sont les mêmes ; elle se réécrit entrelacée à la prochaine
sauvegarde. Rien à migrer, rien à corriger en base, et les deux formes
coexistent sans que l'écran sache laquelle il lit.

Conséquence de vocabulaire, pas de cosmétique : dans un superset, « Ajouter une
série » devient **« Ajouter un tour »** et ajoute une série de *chaque*
exercice. Un demi-tour de superset ne s'entraîne pas.

### Retirer un contrôle demande de dire où la règle passe (17/09/2026)

**La flèche ↗ au bout de certaines lignes portait la règle de progression du
§10.4.** La retirer seule aurait laissé cette règle sans aucune entrée : une
colonne dans le schéma que plus rien ne peut jamais écrire, et que la tranche 12
lirait toujours à zéro. Le réflexe — supprimer ce qui est demandé et passer à la
suite — aurait produit un défaut invisible pendant deux tranches.

Elle va au **bloc**, pour le motif exact qui y a déjà mis le repos : personne ne
fait progresser la deuxième série d'un exercice et pas la troisième. **La
colonne reste par ligne** — le §10.4 la définit ainsi, la tranche 12 la lira
ainsi, et stocker un second état au bloc serait la valeur dérivée que D9 refuse.
`blockProgression` est une **lecture** : vrai si toutes les séries de travail du
bloc la portent. Les échauffements et les drop sets sont exclus de l'écriture ;
un échauffement qui monterait de 2,5 kg par semaine a cessé d'en être un.

### Une colonne relue partout et écrite nulle part (17/09/2026)

**`routine_line.duration_seconds`, ajoutée par `0009`, ne figurait dans aucun
`INSERT`.** Les 45 s d'un gainage étaient acceptées par le tableau,
enregistrées, et perdues. Trouvé en touchant la table de projection de
`writeContents`, pas par un écran en échec.

**Rien d'autre ne pouvait l'attraper, et c'est le point à retenir** : la lecture
rendait fidèlement le `null` qu'elle avait elle-même écrit, donc l'aller-retour
était **cohérent et faux** — exactement la forme de défaut que la tranche 2
décrit en refusant de comparer un export à un second export. Un aller-retour ne
prouve rien d'une colonne qu'aucun côté ne remplit. Le test le fixe désormais
par la **valeur**, pas par la symétrie.

### Naviguer depuis un écran en cours d'édition ne perd rien (17/09/2026)

Le nom d'un exercice était rendu non cliquable pendant l'édition d'une routine,
pour protéger le brouillon. **Il n'y avait rien à protéger** : un `push` laisse
l'écran précédent **monté** dessous — c'est la raison d'être des événements de
focus d'un navigateur — donc l'état React survit à la visite et au retour. La
prudence coûtait la seule action que le §10.2 demande sur un nom d'exercice.

Au passage, un titre unique sur un bloc ne peut pas servir un superset : il
n'ouvre que le premier de ses exercices. Le titre est donc une **liste de noms**,
chacun préfixé de la lettre que ses lignes portent, chacun sa propre
destination.

### Ce que « ressembler à Hevy » a voulu dire, et ce qu'on n'a pas pris (17/09/2026)

Demande sans critère mesurable, traduite en décisions nommables : nom
d'exercice en couleur d'accent et cliquable, repos en une ligne sous les noms
avec son glyphe de minuteur, tableau **sans cadre intérieur** — une grille
dessinée dans une carte, ce sont deux boîtes — numéro de série en pastille, et
un rail d'accent sur le bord gauche d'un superset.

**Aucun jeton de couleur ajouté** : la pastille prend le fond de la **page**,
qui la creuse dans la carte, plutôt qu'une sixième couleur que la palette
devrait justifier avec ses mesures de contraste.

**Ce qui n'a pas été pris, et pourquoi** — la vignette de l'exercice, parce que
le média est hors de la tranche 10 et qu'un rond de remplacement est une
promesse que l'application ne tient pas ; et la colonne « précédent », qui est
l'historique de la tranche 12 : vide, elle dirait qu'il n'y a rien plutôt que
que rien n'est encore enregistré.

### La bibliothèque n'est pas une page du Journal (17/09/2026)

**Renversement demandé, et le §3 de l'architecture avait raison depuis le
début.** La tranche 3 avait descendu la bibliothèque dans la pile du Journal en
écrivant exactement ce qui se passerait sinon : sœur de `(tabs)`, elle recouvre
la barre d'onglets et emporte la minimisation iOS 26.

**Ce qui change est le SIGNE de cette conséquence.** La bibliothèque est là où
vivent les fiches d'aliments et de recettes, et chacun de ses écrans est une
tâche avec sa propre sortie. Couvrir la barre est ce qui le dit. Le §7 la décrit
comme un endroit où le Journal mène, ce qui reste vrai et ne dit rien de ce
qu'elle doit recouvrir une fois qu'on y est.

**La règle de la tranche 3 tient sans retouche** : consulter est un empilement,
agir est une fenêtre. C'est toujours un empilement, avec le geste de retour du
système. Seule la pile sur laquelle il se fait a changé.

Prix nommé plutôt que découvert : la barre est absente pendant qu'on parcourt,
donc partir vers un autre onglet coûte un retour d'abord.

**Et le piège de la tranche 5 a mordu une troisième fois, trouvé en ouvrant la
pile racine pour y déclarer la bibliothèque** : `(modals)/exercise-edit` et
`(modals)/routine-edit`, ajoutées en tranche 10, n'y étaient pas déclarées. Une
route non déclarée sous `(modals)/` prend le défaut de la pile — une carte
opaque poussée par la **droite** — sans erreur ni avertissement, pendant
qu'`OverlayPanel` la lève correctement sans que personne puisse le voir. **La
règle se répète parce qu'elle ne se voit pas : toute route ajoutée sous
`(modals)/` doit être déclarée, et l'oubli est silencieux.**

### Un acte vise le jour qu'il est ; un libellé garde le jour qu'il avait (17/09/2026)

Appuyer sur l'onglet Journal ramène à aujourd'hui. **Par la demande qui existait
déjà** — celle que le calendrier utilise depuis la tranche 3 — et non par une
seconde façon de dire au Journal quel jour montrer : le carrousel garde la date,
la demande est consommée une fois, rien ne persiste.

**Et l'horloge est lue AU MOMENT DE L'APPUI, pas par `useToday`.** C'est
l'arbitrage que le planificateur de notifications avait déjà pris en tranche 9,
et il se généralise : `useToday` est **gelé contre l'horloge** à dessein, pour
qu'un libellé ne bouge pas sous une liste parce que minuit est passé ; un
**acte** veut l'inverse, et une application laissée ouverte toute la nuit
enverrait sinon sur hier en l'appelant aujourd'hui.

**Réserve inscrite, et elle porte sur le choix d'implémentation, pas sur le
comportement.** L'écoute est posée sur *chaque* appui de l'onglet et non
seulement quand il est déjà actif. La forme restreinte est l'idiome iOS et
collerait à la demande au mot près ; elle repose sur `navigation.isFocused()`
dans `unstable-native-tabs`, qu'aucun test en Node ne peut exercer et qu'aucun
appareil n'est là pour essayer — et **son mode de panne est le silence**, une
fonctionnalité qui n'arrive simplement jamais. Conséquence assumée : revenir
depuis un autre onglet atterrit aussi sur aujourd'hui.

Conséquence de structure : `RequestedDateProvider` monte au-dessus des onglets,
un déclencheur d'onglet étant déclaré dans la disposition des onglets.

### Une carte doit dire OÙ, sinon elle n'est pas une carte (17/09/2026)

Deux demandes en une phrase — « le muscle sélectionné doit se voir dans le
schéma corporel » — et les deux lectures étaient vraies au même endroit.

**Là où l'on *sélectionne* un muscle, c'est le formulaire d'exercice.** Le
vocabulaire des quinze muscles est inventé en tranche 10 et n'a jamais rencontré
un exercice réel : « lats » ou « traps » est un mot avant d'être un endroit. La
figure est ce qui retraduit le choix en anatomie, et **la seule chose de ce
formulaire capable de dire que la puce qu'on vient de toucher n'est pas le
muscle qu'on visait.**

**Et la carte elle-même ne disait pas où.** L'infobulle de la tranche 10
répondait en mots sous les figures en laissant le dessin intact, donc la seule
chose qu'elle ne pouvait pas dire était *où se trouve le muscle touché*. Le
muscle est désormais cerné, toutes ses régions à la fois, pour que le nom en
dessous et la forme au-dessus soient une seule réponse.

**Deux modes de nuance, jamais un détournement du volume.** `volume` répond
« combien de travail », `roles` répond « quelle part » — et un exercice n'a
aucune série à compter. Faire passer un muscle principal pour dix séries
pondérées aurait nuancé correctement **et** fait dire « 10 séries » à
l'infobulle.

**Un trait de contour se mesure en unités de viewBox, pas en points.** Les
figures font environ 1 270 unités de haut et c'est la hauteur en points qui
contraint l'échelle, donc une unité vaut `height / 1270` de point : douze
unités valent près de deux points à toutes les tailles où cette carte est
dessinée. Choisi par arithmétique parce que rien ici ne peut être regardé. Et
**couleur du texte, pas de l'accent** : le remplissage est déjà une nuance
d'accent, et un contour de la même teinte par-dessus n'est pas un contour.

### Garder sa place demande de la remettre (17/09/2026)

**Retirer le `scrollTo` ne suffisait pas, et le cas manquant est le premier.**
La première visite d'une plage : le volet rend un indicateur de chargement, la
page fait quelques centaines de points, **iOS y borne le décalage** — ce qui est
correct, et irréversible, parce que plus rien ne se souvient d'où la page était
quand le vrai contenu arrive une seconde plus tard.

Le décalage est donc **retenu au changement** et remis dès que le contenu peut
le porter. `onContentSizeChange` est l'événement qui dit « la page vient de
faire cette hauteur », c'est-à-dire exactement la question posée — un délai
deviné ne l'aurait jamais été.

**Et un vrai glissement l'annule.** Quelqu'un qui fait défiler pendant que le
volet charge a dit où il voulait être ; être ramené par une requête qui arrive
serait la page qui bouge sous un doigt.

Règle générale qui en sort : **un état de chargement plus court que son contenu
est un état qui détruit le défilement**, et personne ne le voit tant que les
données sont en cache.

### La racine d'une pile ne dessine aucun bouton retour (17/09/2026)

Trouvé en déplaçant la bibliothèque à la racine : elle s'ouvrait sur une barre
**vide**, avec le seul balayage pour sortir. Dans sa propre pile il n'y a rien
derrière son écran d'accueil, et le parent qui a le groupe d'onglets derrière
lui montre `headerShown: false`.

**Une pile imbriquée était le réflexe, sur le précédent de `settings/`, `stats/`
et `training/` — et ces trois-là sont dans un ONGLET**, où personne n'attend un
retour depuis leur écran d'accueil. La bibliothèque est poussée par-dessus tout,
donc elle en veut un. Ses écrans sont déclarés à plat sur la pile racine.

**Le bouton « en verre » demandé est celui du système, et c'est la règle prise
du bon côté.** Un `GlassButton` dans un en-tête est du verre dans du verre — la
direction iOS 26 le nomme, et la tranche 3 l'avait pris du mauvais côté une
fois. Un bouton de barre natif **est** un `UIBarButtonItem`, et c'est à ses
propres contrôles qu'UIKit applique le matériau : le demander revient à ne rien
dessiner soi-même. `headerBackTitle` dit ce qu'il écrit, l'écran précédent étant
un groupe d'onglets qui n'a pas de titre à prêter.

### iOS révèle le champ focalisé UNE fois, et ce n'est pas celle qui manque (17/09/2026)

**Le système révèle le premier répondant quand le clavier ARRIVE.** Ça couvre le
premier toucher dans un formulaire et rien d'autre. Les chevrons déplacent le
focus pendant que le clavier est déjà levé : aucune notification, aucun
changement d'encart, rien à quoi réagir — donc descendre un formulaire met le
curseur dans un champ **derrière le clavier**, et on tape dans quelque chose
qu'on ne voit pas.

C'est ce que `useFormScroll` existe pour faire, et l'éditeur d'aliment portait le
défaut aussi, sans que ça se soit jamais vu : sa `KeyboardAvoidingView` fait la
place, elle ne déplace pas la page.

**Deux déclencheurs, et l'idempotence est ce qui les rend compatibles** : au
focus, et à l'arrivée du clavier. Le premier ne connaît pas encore la hauteur du
clavier au tout premier toucher ; le second la connaît. Un champ déjà dégagé
rend **zéro**, donc les deux ne se battent jamais.

**Et l'arithmétique est sortie dans `core/ui/reveal.ts`.** Un `.tsx` qui importe
react-native est hors de portée de la suite Node — l'index du framework est du
Flow que rolldown refuse — donc un calcul laissé dans un composant est un calcul
que **rien** ne vérifie, et rien ne dessine un clavier en Node. Le §4 le
demandait déjà ; ici c'est en plus le seul moyen que ces nombres soient jamais
contrôlés.

Le haut de la bande visible est **déduit, pas connu** : rien ici ne peut demander
la hauteur d'un en-tête transparent. Ce qui se voit est que la vue défilante est
plus courte que la fenêtre, et la différence est ce qui la borde. Prendre le tout
pour le bord haut se trompe du bon côté — ça ne peut demander que moins de
mouvement, jamais pousser un champ sous une barre.

### Un chiffre est remplacé, un mot est corrigé (17/09/2026)

**La sélection au focus n'est pas une préférence d'écran, c'est une propriété du
contenu.** Un nombre : on en énonce un autre, et effacer quatre chiffres coûte
quatre touchers sur une touche de retour. Un nom : toucher « Développé couché »
pour corriger son accent ne doit pas armer toute la chaîne pour la suppression.

**Le clavier dit lequel des deux c'est** — `decimal-pad`, `number-pad`,
`numeric`, `numbers-and-punctuation` — donc c'est posé une fois dans `FormInput`,
aucune rangée n'a à le déclarer et aucune ne peut l'oublier. Un appelant garde le
dernier mot.

**Et la sélection est demandée deux fois, ce qui n'est pas une ceinture de
plus** : iOS applique `selectTextOnFocus` au début de l'édition, puis une valeur
contrôlée est écrite dans le champ, et écrire du texte pousse le curseur à la
fin. Lequel des deux atterrit en dernier ne nous appartient pas, donc la
sélection est aussi **énoncée** à la frame suivante. Sélectionner tout deux fois
sélectionne tout.

### Toujours la Pressable, jamais une Pressable conditionnelle (17/09/2026)

Presser une rangée de formulaire met le curseur dans son champ — « la rangée est
le champ » était la règle de ce composant depuis la tranche 3, et le libellé à
gauche était le seul endroit où elle ne tenait pas.

**La rangée est TOUJOURS une `Pressable`, jamais une seulement quand un champ
s'est inscrit.** Un champ s'inscrit depuis un effet, donc le type d'élément
changerait après le premier rendu : React démonterait le sous-arbre et le
remonterait, **en emportant le texte en cours de frappe**. Le prix de presser
une rangée sans champ est qu'il ne se passe rien, ce qui est ce que presser une
rangée faisait avant.

**L'exception `flush` n'est pas un contournement.** Ce marqueur veut déjà dire
« un contrôle a besoin de toute cette rangée », et celui qui le demande est la
molette de quantité — un `UIPickerView` avec ses propres reconnaisseurs de
gestes. Une `Pressable` JavaScript autour d'un contrôle natif qui défile est la
seule imbrication sans contrepartie ici, sur un contrôle du chemin critique
vérifié sur l'appareil. Le même marqueur décide des deux : **une rangée qui donne
sa largeur donne aussi ses touchers.**

### Tout écran qui remplace son contenu par une requête clignote (17/09/2026)

Deuxième occurrence du défaut que la tranche 3 avait trouvé sur le carrousel, et
la règle générale se dégage : **une requête qui répond en un temps assez long
pour se voir et assez court pour que ce qu'on voie soit un éclair fait paraître
la page défectueuse.** Un éclair se lit comme un défaut, pas comme du travail.

Et **ça ne se voit jamais pendant qu'on développe**, parce qu'à ce moment-là
tout a déjà été lu une fois : le défaut n'existe qu'à la visite où rien n'est en
cache, c'est-à-dire la première de l'utilisateur.

`useMinimumVisible` existe pour ça depuis la tranche 3 et n'avait qu'un appelant.
Ce qui rend son usage gratuit est la propriété écrite dans le hook lui-même : le
plancher n'est imposé qu'une fois **l'attente commencée**, donc rien n'est jamais
retardé sur du contenu déjà là.

**Le chiffre dépend du geste, pas de l'écran.** 500 ms quand on bascule après
avoir touché un contrôle — on attend quelque chose qu'on vient de demander ;
1 000 ms sur une journée qu'on balaie, qui doit rester continue.

### Quitter et avoir fini sont deux actes, et un seul se garde (17/09/2026)

La fenêtre d'ajout demande confirmation quand le panier n'est pas vide. La
conception s'est jouée sur une distinction qu'aucune fenêtre n'avait eu besoin
de faire jusque-là :

- **`useDismiss` est ce qu'un écran appelle quand il a FINI** — une routine
  créée, une quantité confirmée, un aliment enregistré ;
- **`useRequestClose` est quitter sans finir.**

Sans garde les deux sont le même, ce qui est pourquoi rien ne les distinguait.
Avec un garde branché sur les deux, « Confirmer » demanderait s'il faut
abandonner les lignes qu'il vient d'écrire — le garde qui se déclenche sur le
seul chemin où il n'y a rien à perdre.

**Les deux sorties sont gardées, le bouton et le glissement.** C'est une seule
décision — quitter ça — et le geste est celui des deux qui se fait par accident.

**Refuser ne coûte rien, et c'est la forme qui le décide** : gardée, une
fermeture par glissement **remet d'abord la fenêtre en place** et demande
ensuite. Pas « fermer puis annuler » — il n'y a rien à annuler une fois la
fenêtre repliée, et une fenêtre qui part et revient est une plus mauvaise
réponse qu'une qui n'est jamais partie.

**Le drapeau du garde est une valeur partagée, pas la prop lue dans le
worklet.** Le geste tourne sur le fil d'interface et ne voit d'une prop que ce
qui a été capturé à sa construction ; un panier qui se remplit pendant que la
fenêtre est ouverte doit armer le garde, pas la version qui existait au premier
rendu.

**Rien n'est demandé sur un panier vide.** Une confirmation sur une fenêtre qui
ne contient rien est celle qui apprend à passer outre sans lire — et elle userait
celles qui comptent. Même raison pour la formulation : « pas enregistrées »
plutôt que « perdues », puisque rien n'a été écrit. **Une confirmation qui
surestime ce qu'elle évite s'use.**

### Deux canaux qui n'ont aucun ordre entre eux (17/09/2026)

**Le carrousel a été rapporté deux fois, et c'est la deuxième fois qui donne la
leçon.** Un jour voisin apparaissait après un balayage ; corrigé une première
fois, il est revenu — cette fois comme *deux journées à la fois*, donc la bande
à un décalage qui montre la couture.

La cause n'est pas un mauvais endroit où écrire, c'est qu'un pas se jouait dans
**deux canaux différents** : les trois pages voyagent sur le commit de React, le
décalage de la bande voyage sur le canal de Reanimated vers le fil d'interface.
**Rien n'ordonne les deux l'un par rapport à l'autre.** Le faire dans un effet de
disposition était faux (il tourne après la peinture), le faire pendant le rendu
était moins faux, et aucun des deux n'était juste — une course réduite reste une
course.

**La sortie est de retirer le mouvement d'un des deux canaux, pas de les
synchroniser** — et il a fallu s'y reprendre à deux fois, ce qui donne la
deuxième leçon.

*Tentative qui a échoué, et pourquoi elle avait l'air juste* : rendre le décalage
**cumulatif** pour n'avoir plus rien à réinitialiser, et le compenser par un
**compte de pas en état React** passé en dépendance de `useAnimatedStyle`.
L'état voyageait bien dans le commit. **Mais `useAnimatedStyle` livre son
résultat par le canal de Reanimated même quand sa dépendance vient de React** —
ce n'est écrit nulle part dans la documentation de la bibliothèque, et c'est la
seule chose qui comptait ici. Intermittent, exactement comme rapporté.

**La forme qui marche : les deux moitiés ne partagent plus de vue.**

- la vue **extérieure** porte le pas, en style React ordinaire — c'est une prop,
  elle voyage dans le même commit que les trois pages ;
- l'`Animated.View` **intérieure** porte le glissement du geste et rien d'autre,
  et ce glissement ne change pas quand la journée change.

Les transformations se composent, donc la bande atterrit où elle a toujours
atterri. Au moment du pas, **on ne demande rien au fil d'interface** : il ne
reste rien qui puisse se désaccorder.

Prix : un geste doit partir de là où la bande se trouve déjà, `translationX`
comptant depuis le doigt et non depuis l'origine. Gratuit : sauter à une date par
le calendrier ou l'onglet ne touche ni l'un ni l'autre, donc ce chemin-là ne peut
pas clignoter non plus.

**Deux règles générales en sortent.** Si deux choses doivent bouger ensemble et
ne peuvent pas être posées par le même commit, faire en sorte que l'une des deux
ne bouge pas. Et : **la seule façon de faire voyager une transformation avec les
enfants qu'elle place est d'en faire une prop de style ordinaire sur une vue
ordinaire** — un style animé, quelle que soit sa dépendance, prend l'autre
chemin.

### Un remède qui se voit n'est pas un remède (17/09/2026)

Stats gardait sa place en **retenant le décalage puis en le remettant**. Ça
marchait, et ça se voyait : la page montait en haut et redescendait — deux
mouvements là où le bon nombre est zéro, et c'est ainsi que ça a été rapporté.

**La bonne forme est d'empêcher la cause.** Pendant qu'un volet recharge, le
conteneur garde une hauteur minimale égale à celle qu'il avait, donc le contenu
ne rétrécit jamais, donc iOS n'a rien à borner et personne ne touche au
décalage. Rien n'est restauré parce que rien n'est perdu.

**Le volet dit quand relâcher**, par `onReady`, appelé à la fin du plancher de
son propre indicateur : il est le seul à savoir s'il attend, et un délai deviné
serait un troisième nombre à tenir. Et la hauteur n'est mesurée que **hors**
plancher — mesurée sous lui, elle enregistrerait le plancher et le tiendrait
pour toujours.

### Ce qu'on ne peut pas emprunter au système, et qu'il faut dire (17/09/2026)

La barre au-dessus du clavier a été demandée « exactement comme celle d'iOS 26 ».
Elle ne peut pas l'être : **`InputAccessoryView` rend un conteneur vide**, et iOS
n'expose aucune barre d'accessoire standard à demander — ni par React Native, ni
par UIKit hors d'une vue web, d'où vient celle de Safari. Tout ce qui est dedans
est dessiné ici.

**Quatre formes ont été essayées à l'aveugle, et une capture d'écran a réglé la
question en une image.** Dans l'ordre : la surface peinte d'origine (un
accessoire d'avant iOS 26), des capsules de verre flottantes, une dalle de verre
pleine largeur, puis des capsules dans un `GlassContainer` assez proches pour
fusionner. Chacune était une conjecture défendable sur une question de **forme**,
et aucune source textuelle ne donne une forme.

**Ce qu'iOS 26 pose là est UNE SEULE capsule de verre** : en retrait des deux
bords, dégagée du clavier, la page visible autour d'elle. Les contrôles sont
dedans — ceux qui parcourent le formulaire au bord avant, celui qui termine au
bord arrière — et il n'y a rien que du matériau entre les deux.

**Trois détails qu'aucune description ne contenait**, et qui sont ce que l'image
a apporté :

- **aucun bouton de verre dedans.** Une capsule dans une capsule est du verre
  dans du verre — la règle de l'en-tête, un cran plus bas. Les contrôles sont des
  `Pressable` nus et la barre est le matériau ;
- **les glyphes sont dans la couleur du texte, pas de l'accent.** Sur la barre du
  système ils sont de la couleur d'un libellé ; en accent ils se liraient comme
  des liens sur une surface dont tout le rôle est d'être neutre ;
- **le contrôle de fin est une coche**, pas le mot « OK ».

`GlassContainer` a donc été essayé puis retiré : le conteneur est la bonne pièce
pour un **groupe** de contrôles de verre, et une barre d'accessoire n'en est pas
un.

C'est la troisième réserve de cette forme, après le balayage de suppression et le
retour par glissement : **une reconstruction se dit, elle ne se laisse pas
croire** — le matériau est celui du système, la forme et les glyphes sont lus sur
une image et dessinés ici.

**Et un fond uni restait derrière la capsule, qu'aucun style de ce projet ne
pouvait atteindre.** Il appartient à la vue native : `InputAccessoryView` prend
une prop `backgroundColor` et la passe telle quelle à
`RCTInputAccessoryComponentView`, qui en peint sa vue de contenu. Lu dans la
source de React Native — rien dans la documentation du composant n'annonce qu'une
barre a un fond par défaut.

**Corollaire général, et c'est le troisième de cette famille dans ce projet** —
après l'`InputAccessoryView` qui ne se partage pas et le greffon Expo qui
s'applique tout seul : **un conteneur natif peut peindre sous ce qu'on lui
confie, donc « aucun fond dans mon style » ne veut pas dire « aucun fond ».**
Quand une surface a l'air peinte et que rien dans l'arbre ne la peint, la réponse
est dans la source du composant natif.

**Et rendre l'accessoire transparent a découvert ce qu'il y avait dessous, qui
n'était pas la page.** Le blanc a été cherché trois fois au mauvais endroit — la
barre, l'accessoire natif, le conteneur de React Native — et il n'était dans
aucun des trois.

`behavior="padding"` garde la `KeyboardAvoidingView` à **pleine hauteur** et
remonte le contenu par sa propre marge basse : la `ScrollView` **rétrécit** donc
au-dessus du clavier. Ce qui ne peignait qu'elle cessait de peindre la bande où
le clavier et son accessoire se posent, et ce qui se voyait à travers était la
**fenêtre**, qui n'a aucun fond à elle.

Ce n'est pas un constat neuf : la tranche 5 avait trouvé le même blanc autour de
la fenêtre du calendrier, en notant qu'il ne se corrigerait que nativement, au
prix d'un cycle CI. **Vu par en dessous il se corrige en JavaScript** : on peint
la vue **rembourrée**, jamais celle qui se rétrécit.

**Règle : dans une pile où une vue se rétrécit pour faire place au clavier, la
couleur appartient à celle qui garde sa hauteur.** Cinq écrans portaient la même
construction et la même erreur.

**Et la leçon de méthode, qui vaut au-delà de cette barre : sur une question de
forme, demander l'image plutôt que deviner quatre fois.** Deux tours ont été
dépensés à reformuler une description ; le troisième a coûté une capture d'écran
et n'a laissé aucune ambiguïté.

### Une édition a deux fins honnêtes, et « revenir » n'en est pas une (17/09/2026)

Quitter une modification non enregistrée demande désormais confirmation, sur un
exercice comme sur une routine. Ce qui a décidé la **forme** est une question
qu'on ne se pose qu'en l'écrivant : que fait le bouton retour ?

Une édition non enregistrée a exactement deux fins honnêtes — **enregistrer** et
**abandonner** — et un geste qui veut dire « revenir » ne se distingue d'aucune
des deux. L'intercepter pour le contredire est possible (`beforeRemove`) et
mauvais : la pile native le fait mal, et ce qu'on obtient est un écran qui part
et revient — le défaut que le panier a évité en remettant la fenêtre **avant** de
demander.

**Donc on ne l'offre pas.** Pendant l'édition, le retour et le balayage sont
coupés ; la seule sortie est nommée, et elle demande. Ne pas offrir une sortie
est plus simple que de la reprendre.

**Et rien n'est demandé quand rien n'a été touché.** La comparaison porte sur le
brouillon **stocké**, pas sur un drapeau « touché » : taper un caractère et le
retaper ne demande rien, ce qui est ce que la question veut dire. Une
confirmation sur un formulaire encore exactement tel qu'il a été ouvert est celle
qui apprend à passer outre sans lire — même raison que sur le panier vide.

**Les égalités sont écrites champ par champ, jamais génériquement.** La question
est « y a-t-il quelque chose à perdre », et une comparaison profonde y répondrait
sur des champs que personne n'a choisi de garder — y compris celui qu'on ajoutera
ensuite. Le test nomme donc **chaque** champ du brouillon, parce que le défaut
qu'il garde est un champ ajouté et oublié dans la comparaison, que rien d'autre
n'attraperait et qui ferait dire à une confirmation qu'il n'y a rien à perdre.

Deux détails qui ne se devinent pas : `incrementKg` se compare comme la **chaîne**
qu'elle est — « 2,5 » et « 2.5 » se parsent pareil et ne sont pas la même chose à
retaper, et une confirmation parle de ce qui serait perdu, pas de ce qui serait
stocké ; et `exerciseName` est délibérément absent d'une ligne de routine, étant
porté pour l'affichage et venant de l'exercice, donc un renommage n'est pas une
modification de cette routine.

### La même correction, la deuxième fois, sur l'autre page (17/09/2026)

Modifier un exercice se fait sur sa page. C'est mot pour mot ce que la routine a
fait en tranche 10, et le fait que les deux pages aient eu besoin de la même
correction dit quelque chose sur la règle plutôt que sur les pages :

**« agir ouvre une fenêtre par-dessus » se lit trop littéralement dès que la
chose sur laquelle on agit occupe déjà tout l'écran.** La règle existe pour que
cette chose **reste visible** ; une fenêtre qui la couvre exactement ne gagne
rien et dépense un congédiement. La création, elle, garde sa fenêtre dans les
deux cas — il n'y a pas de page à basculer quand rien n'existe encore.

Corollaire de structure, deux fois identique : une page en deux états demande
**un** composant partagé (`RoutineBody`, puis `ExerciseBody`), sinon les deux
états dérivent.

### Une carte qui ne se voit qu'en éditant ne sert qu'à celui qui édite (17/09/2026)

Le schéma corporel est désormais sur la page d'un exercice en permanence, pas
seulement sur son formulaire. Ce qui le justifie n'est pas la symétrie : les
quinze noms de muscles sont **inventés en tranche 10** et n'ont jamais rencontré
un exercice réel, donc « lats » est un mot avant d'être un endroit — et la page
d'un exercice est exactement là où « c'est où ? » se pose, par quelqu'un qui ne
modifie rien.

### Un champ multiligne n'est pas une option, c'est un autre objet (17/09/2026)

`multiline` était déjà passé aux quatre champs de notes, et ils restaient d'une
ligne. L'idiome du formulaire explique pourquoi : **« la rangée est le champ »
marche parce qu'une valeur est courte et se lit le long du bord droit.** Une
note est une phrase ou trois — alignée à droite elle se lit comme de la poésie
en escalier, et centrée dans une rangée de 44 points elle ne peut pas grandir du
tout.

Ce qu'il fallait n'était donc pas un réglage mais un autre objet : pleine
largeur, aligné à gauche, taille de paragraphe, une hauteur minimale de deux
lignes et **aucune hauteur fixe** — c'est l'absence de hauteur qui laisse un
champ grandir. Et **jamais `flex`** : dans une colonne il s'étirerait jusqu'au
parent au lieu de son propre contenu, ce qui est exactement le contraire du but.

Détail qui n'en est pas un : le libellé passe **au-dessus**, ce qui est déjà la
forme qu'une note a en lecture. La page ne change donc pas de disposition en
basculant en édition — c'est la même exigence que « présentation identique à la
création », appliquée à un champ.

**Et un champ qui grandit doit emmener la page avec lui.** `onContentSizeChange`
est exactement l'événement « ce champ vient de grandir » : pas de sondage, pas de
mesure à chaque frappe. Le révélage qu'il demande rend **zéro** quand le champ a
encore de la place — c'est cette idempotence qui le rend sûr à appeler à chaque
ligne gagnée, exactement comme elle le rend sûr à appeler au focus *et* à
l'arrivée du clavier.

**Une bagarre à trancher, qu'on ne voit pas en lisant le code.** Une note plus
haute que ce que le clavier laisse voir déclenche les DEUX corrections à la
fois : son bas est sous le clavier et son haut est hors de l'écran. Appliquées
tour à tour, elles tirent la page d'avant en arrière à chaque ligne. **Le bas
gagne**, parce que c'est là qu'est le curseur : ce qu'on écrit doit se voir, le
début d'une note en cours d'écriture non. La correction du haut ne tourne donc
que pour un champ qui **tient** dans la bande.

### Une note se lit pendant la séance, pas à un toucher de là (17/09/2026)

Les quatre notes d'un exercice s'affichent désormais sur la page de la séance. Le
§6.3 les appelle « exécution, réglage, respiration, erreurs fréquentes » : elles
sont écrites précisément pour être lues **pendant** l'entraînement, et la page
ouverte à ce moment-là est celle de la séance. Une page plus loin, elles étaient
une référence et pas un rappel.

**En lecture seule, et c'est une règle et non une économie** : une note appartient
à l'exercice. La modifier depuis une routine la modifierait pour toutes les
routines qui l'utilisent, depuis un écran qui n'en dit rien. Le chemin vers elles
existe déjà et il est nommé — toucher le nom de l'exercice ouvre sa page.

**Et c'est gratuit pour une seule raison, qu'il faut redire** : les colonnes
montent sur l'élément de **liste**, comme `tracks_duration` en tranche 10, parce
qu'elles viennent de la même ligne et de la même requête. C'est le seul motif qui
autorise un élément de liste à porter du texte que personne ne liste ; lire un
exercice par bloc serait le coût par rangée que la tranche 4 a rencontré en
étendant l'ajout rapide à toute la bibliothèque.

## Ce que la tranche 11 a établi

**`0009` était morte dans l'eau, et personne ne pouvait le savoir.**
`exercise.tracks_duration` était lue en quatre endroits — `exercise-reads`,
`routine-reads`, `SetTable`, `RoutineBody` — et écrite **nulle part** : absente
d'`ExerciseDraft`, de `columnsOf`, de `readExerciseDraft`. Donc `0` sur tous
les exercices ayant jamais existé, la colonne « Temps » inatteignable, et
`routine_line.duration_seconds` hors de portée.

C'est **le même défaut que la tranche 10 a corrigé un étage plus bas**, trouvé
de la même façon — en touchant une table de projection, pas par un écran en
échec — et pour la même raison, qu'il faut redire parce qu'elle est la leçon :
**la lecture rendait fidèlement le défaut que l'écriture n'avait jamais écrasé,
donc l'aller-retour était cohérent et faux.** Un test le garde désormais par la
valeur, jamais par la symétrie.

**Et le test censé l'attraper ne l'a pas attrapé.** « notice EVERY field of the
draft » existe précisément pour un champ ajouté et oublié (`architecture
§9.22 n° 2`) ; sa liste était un **tableau**, donc elle est restée verte le jour
où elle devait rougir. Elle est maintenant un `Record<keyof ExerciseDraft, …>` :
omettre un champ fait échouer `tsc` **en le nommant**. Vérifié par mutation.

> **Règle qui en sort : un test qui garde l'exhaustivité d'un type doit être
> indexé PAR ce type, jamais par une liste d'exemples.** Une liste tenue à la
> main ne peut pas remarquer ce qui n'y est pas.

**« Une seule séance en cours » est une PAIRE, pas un index.**
`ux_session_active` est partiel — `WHERE status = 'in_progress'` — donc il ne
contraint **rien** sur une ligne dont le statut dit autre chose. Une archive
posant deux séances à `'running'` importerait proprement et l'application
tiendrait deux séances vivantes : exactement la contournabilité que D12 exige
d'impossible, atteinte par la route que D12 dit d'éviter. `ck_session_status`
est ce qui rend l'index total. **C'est le seul endroit du schéma où c'est vrai
d'un index**, et un test insère la ligne en contournant la fonction — sans lui,
l'index pourrait disparaître sans qu'aucun autre test bronche.

Et l'objection de la tranche 5 ne s'applique pas : `day_meal` avait vu son index
partiel refusé parce qu'une base en service portait déjà les lignes qui le
violeraient. `session` est **neuve**, donc il se construit toujours. Argument de
`weight_goal.is_active`, mot pour mot.

**La fin d'un segment est estampillée par l'écriture SUIVANTE, jamais par un
minuteur.** D12 dit « se ferme après 30 minutes sans aucune écriture », ce qui
est inimplémentable lu comme une consigne à un minuteur : rien de l'application
ne tourne en arrière-plan ou après un kill, donc la fermeture n'aurait aucun
moment où se produire et un segment resterait ouvert trois jours.

D'où la décision qui porte tout : **`ended_at` n'est jamais NULL pendant que
l'application tourne.** La forme évidente — NULL tant que le segment est
ouvert — oblige à deviner une fin à la lecture, et `COALESCE(ended_at, now)`
compte la nuit entière. Un arrêt forcé laisse donc le segment finissant à la
dernière chose qui s'est réellement produite, sans que personne ait rien à
calculer.

**Conséquence acceptée, trouvée par un test dont la première version supposait
le contraire** : un silence plus long que le seuil n'est pas compté **même au
tout début**. Un échauffement n'écrit rien, donc il ne compte pas. La règle
appliquée plutôt qu'un trou dedans — compter un silence parce qu'il est le
premier voudrait dire que le même silence compte au début et pas au milieu.

**Réserve inscrite : la durée affichée REDESCEND** au franchissement du seuil,
d'au plus trente minutes. C'est juste, et il faut quelqu'un qui regarde cet
écran trente minutes sans rien écrire pour le voir. Plafonner la queue au seuil
montrerait une demi-heure d'entraînement qui n'a pas eu lieu.

**Le minuteur de repos n'est PAS une cinquième sorte de notification — et la
tranche 9 s'était trompée par écrit, deux fois.** Le commentaire de
`notification_setting` disait « slice 11 puts the rest timer on a local
notification » et le catalogue d'export disait « slice 11 adds a kind here ».
Suivre l'invitation aurait introduit exactement le défaut que la **même**
tranche 9 a écrit un paragraphe pour éviter : `diffSchedule` décide ce qui
appartient au planificateur avec `NOTIFICATION_KINDS.some(kind =>
id.startsWith(kind + ':'))` et annule tout ce qu'il possède et qui n'est pas
dans le plan, à chaque passage au premier plan. Le minuteur aurait été annulé en
pleine séance, silencieusement.

Il vit donc dans `rest:<séance>`, **aucune ligne de la tranche 9 ne bouge**, et
un test assert qu'aucune sorte n'en est un préfixe — parce que la propriété est
**invisible** : elle tient à ce que deux constantes ne se rencontrent pas, et
rien dans l'une ni dans l'autre ne le dit. Les deux commentaires sont corrigés.

**Et le minuteur ne stocke rien.** D12 demande de stocker l'instant de départ ;
il existait déjà — `session_set.completed_at`, écrit dans la même transaction
que la série. Le décompte est entièrement dérivé, donc il survit à un arrêt
forcé parce que la séance y survit. Un seul identifiant par **séance**, ce qui
rend l'annulation du §9.3 automatique : programmer le suivant remplace le
précédent par identité.

**TIME_INTERVAL ici, CALENDAR pour les quatre sortes quotidiennes**, et c'est
le même constat de la tranche 9 qui donne les deux réponses : un déclencheur de
délai figé dérive sur sept jours et un changement d'heure, ce qui le rend faux
pour une date et exactement juste pour un compte à rebours de quatre-vingt-dix
secondes.

**Le placeholder est une promesse, et la plage est l'exception qui compte.** Le
§10.3 dit que les champs portent les valeurs attendues « en texte indicatif » :
valider sans toucher au champ enregistre donc ce qui était prescrit, ce qui rend
le parcours courant à deux touchers. Une plage ne prescrit aucun nombre, et
remplir le **haut** est le défaut tentant — le §10.4 déclenche la suggestion de
progression quand toutes les séries atteignent le haut de la plage, donc ce
serait proposer une charge plus lourde parce que quelqu'un a touché un RIR.
`needsReps` le **dit** au lieu de refuser en silence : une rangée de RIR qui ne
ferait rien se lirait comme un contrôle cassé.

**`deleteExercise` aurait levé dès la première séance enregistrée.**
`session_set.exercise_id` est en NO ACTION comme `routine_line.exercise_id`, et
rien ne l'aurait signalé avant qu'une vraie séance existe. Le schéma porte la
réponse en deux colonnes : l'id est nullable, `exercise_name_frozen` est
NOT NULL. Le lien meurt, le nom survit (D5/R4). La transaction délie ; la clé
étrangère reste le filet qui prouvera qu'elle a tourné.

**Et l'avertissement du §5.3 gagne ce que la tranche 10 lui avait retiré.** Le
`specs §14.20 n° 3` écrivait qu'il ne mentionne « ni séances, ni records, ni
graphiques » **parce qu'ils demandent `session_set`**. Ce motif expire ici — et
un amendement dont la raison a cessé et dont la phrase ne bouge pas est
exactement la façon dont un avertissement cesse de dire vrai sans que personne
l'édite. Les routines sont **nommées**, l'historique est **compté**, et ce sont
deux phrases parce que ce sont deux pertes différentes : une ligne de routine
est retirée, une série enregistrée est gardée et seulement déliée. Un test
refuse le mot « perdues ».

### Les images, et pourquoi la source a changé TROIS fois

> **Mise à jour du 19/09/2026 : la source est désormais `free-exercise-db`**
> (876 exercices, 1746 photographies, Unlicense). Tout ce qui suit décrit le
> chemin qui y a mené et **reste vrai de ce qu'il énonce**, sauf un point
> corrigé en place plus bas : j'avais écrit que ce dépôt se *déclarait*
> Unlicense sans en avoir le droit. Il a bien un `LICENSE.md` au texte intégral
> de l'Unlicense. Voir `specs §14.33` et `architecture §9.27`.

**La licence ne dépend pas du nombre d'utilisateurs, et c'est la première chose
à savoir.** « Seul moi l'utilise » serait vrai d'un dépôt privé. D15 fait du
dépôt un dépôt **public** et les IPA sont publiées en release : ce sont deux
**diffusions**, et le droit d'auteur porte sur la copie et la diffusion, pas sur
l'usage privé. Le seul contournement propre — dépôt privé, releases privées —
coûterait les minutes de CI gratuites que D15 nomme comme la contrainte la plus
pénible du projet. Mauvais échange.

**Rien d'animé n'existe sous licence permissive**, vérifié avant qu'une ligne ne
soit copiée :

- les jeux de GIF animés (hasaneyldrm, FitnessDB, RepDB) sont MIT sur le
  **dépôt** et disent eux-mêmes que les médias sont © Gym Visual, dont les
  conditions exigent d'**acheter** une licence pour s'en servir ;
- ~~`yuhonas/free-exercise-db` se déclare Unlicense sans en avoir le droit.~~
  **FAUX, corrigé le 19/09/2026.** Le dépôt porte un `LICENSE.md` contenant le
  texte intégral de l'Unlicense ; j'avais cherché `LICENSE` sans extension et
  pris le 404 pour une réponse. **Ce qui reste vrai** : ce sont des
  photographies de studio d'une personne identifiable, et une dédicace de droit
  d'auteur règle qui peut copier le fichier, pas ce que cette personne a
  accepté. Distinction signalée, décision prise, `specs §14.33 n° 7`.

**La première version a pris `everkinetic/data`** : 293 exercices, anglais
seulement, dont 32 nommés à la main en français. Ce n'était pas assez, et ce qui
rendait la croissance chère était la **taille** — un SVG inliné coûte ~40 Ko de
chemins dans le bundle JavaScript, analysés à chaque démarrage à froid, et les
chemins ne peuvent pas être raccourcis : ils contiennent des **arcs**, le cas
exact que la tranche 10 a documenté comme indécidable à re-sérialiser.

**wger tranche, et la raison est presque drôle : il CONTIENT déjà everkinetic.**
Une grande part de ses images leur est créditée, **déjà traduites en français**
par ses contributeurs. Changer de source n'était donc pas troquer un jeu contre
un autre — c'était prendre les mêmes dessins plus cinq cents exercices, le
nommage fait. 520 exercices, 194 dessins, CC-BY-SA crédité par auteur.

**Et une image est structurellement moins chère qu'un chemin inliné.** Hermes ne
la lit jamais : le bundle JavaScript est redescendu de 7,6 à 6,5 Mo pendant que
le catalogue passait de 32 à 520, et il ne remonte qu'à 7,0 Mo à 876 — les
30,8 Mo d'images partent dans les assets, chargés à l'affichage.

**La troisième source a été prise pour sa licence, et elle a coûté les noms.**
wger livrait ses exercices **déjà traduits par ses contributeurs**, ce qui avait
compté comme un bénéfice de cette source. free-exercise-db est en anglais seul :
les 876 noms sont donc écrits un par un dans `scripts/exercise-names-fr.mjs`,
jamais produits par un traducteur par jetons. Un tel traducteur traite sept noms
sur dix et se trompe sur la traîne idiomatique — or **un nom faux dans une
bibliothèque n'est pas un écran cassé, c'est une étiquette plausible sur le
mauvais mouvement.**

Un contrôle a d'ailleurs attrapé exactement ça : « Cable Incline Pushdown »
était traduit « Extension triceps » alors que sa source dit
`primaryMuscles: ['lats']` — c'est un pull-over bras tendus. Trouvé en comparant
le muscle que le nom français annonce aux muscles réels de l'exercice, pas à la
relecture.

**Et la paire d'images EST le mouvement** : [0] le départ, [1] l'arrivée. La
rangée de liste montre la première, la fiche montre les deux — « jusqu'où
est-il descendu » est précisément ce qu'une photo seule ne dit pas.

**Deux conséquences assumées, écrites plutôt que découvertes :**

- **Le dessin ne s'anime plus, et il n'a plus à le faire.** Un dessin wger montre
  le départ et l'arrivée **côte à côte avec une flèche** — ce que l'animation
  deux poses disait, en un coup d'œil au lieu de deux secondes.
- **Un PNG ne prend pas le thème.** L'encre est noire, donc sur une carte sombre
  le dessin serait un trou dans la page. La carte est **blanche dans les deux
  thèmes** : c'est le seul endroit de l'application où une surface ne suit pas
  le thème, et c'est la forme honnête de « ceci est une image ».

**Le vocabulaire : deux des trois constats de la première version étaient des
trous de la SOURCE, pas du vocabulaire.** `forearms` n'avait aucun exercice
primaire et `kettlebell` aucun exercice du tout ; wger en a onze au kettlebell,
et les quinze muscles comme les huit matériels sont désormais tous atteints.
Restent vraies les deux autres moitiés : `shoulders` est toujours un mot pour
trois muscles, gardé en un groupe sur décision explicite ; et un exercice sans
matériel ne répond à aucun filtre.

**Et une règle de nom PRIME sur la source pour les muscles qu'elle ne sait pas
exprimer, sur aucun autre.** wger ne modélisait ni lombaires, ni avant-bras, ni
adducteurs, et la première version ne laissait une règle de nom que *compléter*
un primaire absent — ce qui n'en a atteint aucun, wger disant toujours quelque
chose : une hyperextension revenait en ischio-jambiers. Or cette réponse n'est
pas *différente* de la nôtre, c'est **la moins fausse que la source puisse
donner**. Déférer à un vocabulaire pour un muscle qu'il ne sait pas exprimer,
c'est déférer à un choix forcé.

**free-exercise-db nomme les trois, ce qui retire l'instrument — et il n'en
reste qu'un.** `obliques`, qu'elle replie dans `abdominals`. La règle survit
pour lui seul et **ne se déclenche QUE lorsque la source dit `abdominals`** :
elle réattribue à l'intérieur de la famille abdominale et ne peut donc pas voler
un exercice de pectoraux à « Incline Dumbbell Flyes - With A Twist ». C'est la
raison pour laquelle le mot `twist` seul n'est pas dans le motif.

**Défaut dans six tests, et la leçon vaut au-delà d'eux** : ils nommaient des
clés du catalogue en **littéraux**. C'était juste tant que trente-trois entrées
étaient écrites à la main dans le fichier d'à côté ; le catalogue étant généré,
un littéral est un pari sur le nommage d'un tiers. Au changement de source, six
tests ont rougi sur des clés disparues plutôt que sur un comportement qui aurait
bougé. Ils indexent le catalogue désormais.

**Le catalogue n'est JAMAIS installé par une migration.** La tranche 5 avait
déjà refusé une graine, mais le motif qui décide ici est plus fort : **une
migration est rejouée par chaque import (G4)**, donc la graine réinjecterait ces
lignes dans une archive qui n'en portait aucune, **avec des ULID neufs** —
importer deux fois la même archive produirait deux exemplaires de tout.
Idempotent **par nom**, jamais par clé de média : celui qui a tapé « Squat »
lui-même a un Squat, et en installer un second serait l'application qui le
contredit sur sa propre bibliothèque.

**Ce qui a changé, c'est QUI demande.** Les 552 exercices de musculation sont
installés seuls au premier lancement (`useDefaultCatalogOnce`).

**Le critère a été faux deux fois avant d'être juste.** « A un dessin » marchait
tant que 194 entrées sur 520 en avaient un ; avec free-exercise-db tout en a un,
donc l'instrument disparaît. `level: 'beginner'` a été essayé ensuite et **il
est cassé** — vérifié en listant les mouvements de base contre lui : il exclut
le soulevé de terre, le développé militaire, le soulevé de terre roumain, la
fente et le front squat. Ce champ note la **difficulté technique**, pas la
fréquence, et une bibliothèque par défaut sans soulevé de terre est une
bibliothèque cassée.

Ce qui reste est la question honnête — est-ce qu'on fait ça en séries et
répétitions — et la `category` de la source y répond : `strength` et
`powerlifting` entrent, les étirements, le cardio, la pliométrie, le strongman
et l'haltérophilie restent au catalogue. **552 sur 876, les quinze muscles
couverts.**

La propriété qui comptait dans le premier critère survit et est désormais
**dérivée au lieu d'être définitionnelle**, donc elle a son propre test :
**toute ligne de la bibliothèque a une image dès le premier jour**, donc le
substitut du §5.4 n° 3 n'y ressemble pas à un défaut le jour de l'installation.

Le hook tourne **après la première peinture**, jamais dans la séquence de
démarrage : ses cinq étapes doivent toutes finir avant qu'on dessine, et y
glisser deux cents insertions mettrait une écriture que personne n'attend devant
les 1,5 s que D16 budgète pour un chiffre lisible à froid. La Journée est déjà à
l'écran, et le bus de D8 fait apparaître la bibliothèque quand elle atterrit.

**Et la décision se prend sur un DRAPEAU, jamais sur une bibliothèque vide.** Le
test évident — « si elle est vide, remplis-la » — est faux exactement là où il
compte : le §5.3 fait de la suppression d'un exercice le seul acte de
l'application qui détruise quelque chose, donc la défaire au nom de
l'utilisateur, au lancement, sans rien demander, est le pire moment possible pour
rendre service. Une ligne `setting` (`catalog_seeded_at`) dit que la question a
été posée. Elle n'a besoin d'aucune colonne ni d'aucune migration, et le
catalogue d'export ne pose **aucune** règle `one_of` sur `setting.key` — vérifié,
pas supposé — donc elle traverse l'aller-retour sans code en plus : vider sa
bibliothèque exprès survit à un export / import, et une archive antérieure à
cette tranche reçoit les défauts au lancement suivant, comme une installation
neuve. Un test tient les deux directions.

**Et l'écran est une RECHERCHE — celle du RESTE.** À trente-trois entrées, tout
cocher évitait trente-trois questions ; à huit cent soixante-seize, tout
installer ne serait pas une bibliothèque mais une copie d'une base de données
sur le téléphone. Les 552 exercices de musculation arrivent seuls, les 324
autres — étirements, cardio, pliométrie, strongman, haltérophilie — se cherchent
ici. Rien n'est coché, on cherche ce qu'on fait. **Les
résultats sont plafonnés à quarante et la page le dit** — D16 écarte une liste
virtualisée, donc la réponse est d'en montrer moins, pas d'en montrer autrement.
La sélection survit au terme et aux filtres : affiner après avoir coché ne doit
pas laisser tomber ce qui l'était.

**`media_uri` porte deux espaces de noms, et la valeur dit lequel.** Un dessin
du catalogue est du **code** — dans le binaire, jamais manquant, survivant à une
réinstallation ; un média choisi est un fichier du conteneur. Le préfixe
`catalog:` les distingue **sur la valeur seule**, sans consultation. Conséquence
bonne : une valeur `catalog:` revient **vivante** après un aller-retour.

**Le vocabulaire de la tranche 10 rencontre enfin des exercices réels.** Trois
constats, et deux confirment que la tranche 10 avait raison :

- **`shoulders` est un mot pour trois muscles** entraînés séparément. Gardé en
  un groupe sur décision explicite — et le dessin est d'accord, `deltoids` y
  étant une région **unique**, donc scinder aurait donné trois valeurs allumant
  la même forme.
- ~~**`forearms` n'est le primaire de rien.**~~ Vrai d'everkinetic, puis atteint
  par une règle de nom chez wger. **free-exercise-db lui donne 25 exercices
  primaires** : c'était un trou de la source, pas du vocabulaire. Le constat du
  `specs §14.21 n° 5` — les avant-bras sont rarement le primaire de quelqu'un —
  garde son sens, et la demi-série d'un secondaire garde sa raison d'être.
- ~~**`kettlebell` n'a aucun exercice** dans la source.~~ Zéro chez everkinetic,
  onze chez wger, **cinquante-six ici**. Le vocabulaire avait raison et les
  données n'arrêtaient pas d'être maigres.
- **Il ne reste qu'un muscle qu'aucune source n'exprime : `obliques`**, replié
  dans les abdominaux. Atteint par une règle de nom qui ne se déclenche que sur
  `abdominals`.

**Une régression évitée en relisant les tests, pas un écran en échec.** Le
générateur réécrit pour free-exercise-db avait **perdu `tracksDuration`** — la
colonne exacte que la tranche 11 a trouvée morte dans l'eau, lue en quatre
endroits et écrite nulle part. Le catalogue est le **seul** à y poser une valeur
non nulle sur une installation neuve : la perdre l'aurait remise à `0` partout,
en silence, reproduisant `0009` à l'identique un jour après l'avoir corrigé.
161 exercices sont chronométrés, dont 8 dans le jeu par défaut — étirements et
cardio par catégorie, gainages, portages et isométriques par nom.

**Et le dépôt grossit de 30,8 Mo, ce qui est le prix assumé de « toute ligne a
une image ».** Chaque `checkout` de la CI les tire. Écrit ici plutôt que
découvert au premier build lent.

**Et la vignette a coûté une régression de rendu, le jour même.** Rapporté
depuis l'appareil : « l'app est beaucoup plus lente ». La liste rendait ses
**552 rangées d'un coup**, donc 552 photographies décodées pour ouvrir un
onglet. C'était invisible tant que la bibliothèque contenait ce que quelqu'un
avait tapé ; le catalogue par défaut l'a rendue visible en une journée.

Plafond à quarante rangées, et la page le dit — D16 écarte une liste
virtualisée, donc la réponse est d'en montrer moins, pas d'en montrer
autrement. C'est le même nombre et le même énoncé que l'écran du catalogue.
**Réserve honnête** : rien ici ne chronomètre un rendu React Native, donc ce
qui est corrigé est la **cause** — un nombre d'images décodées — et non un
chiffre observé.

**Le « + » est devenu une bifurcation, et le lien « Parcourir le catalogue » est
supprimé.** C'étaient deux contrôles disant la même chose à deux endroits, et un
lien en bas d'une liste n'est pas où l'on regarde quand on veut ajouter quelque
chose. Créer un exercice, ou le prendre au catalogue : une feuille d'action,
parce que c'est une bifurcation et non une étape.

**L'onglet Séances existe, et ses rangées terminées ne sont pas cliquables.** Il
n'y a qu'un écran de séance et il montre celle **en cours** ; l'historique est
la tranche 12. Une rangée qui a l'air cliquable et ne fait rien est pire qu'une
rangée qui se présente comme un relevé — et tout ce que la liste peut
honnêtement montrer est déjà dessus. `listSessions` en trois requêtes groupées,
tenue d'accord avec `readSession` par un test vérifié par mutation.

**Et le drapeau ne rattrape pas un changement de source.** `catalog_seeded_at`
dit « la question a été posée », pas « ce catalogue-ci est installé ». C'est
voulu — le §5.3 interdit de défaire une suppression délibérée — et la
conséquence est qu'une bibliothèque installée **avant** une bascule de catalogue
garde l'ancienne. Le bouton de réinitialisation est la réponse.

**La vignette est enfin sur la rangée d'exercice, et le motif de son absence
avait expiré.** Le §10.1 la demandait mot pour mot ; la tranche 10 ne pouvait
pas l'honorer parce que rien ne savait écrire `media_uri` — chaque rangée aurait
montré le **même** carré gris, « ce qui n'est pas une vignette mais une
excuse ». Le catalogue l'écrit désormais, donc la colonne est faite de
photographies et le gris redevient l'exception qu'il devait être. Une seule pose
en liste, les deux sur la fiche.

**Et le jeu d'essai créait des exercices SANS photographie — troisième
occurrence de la même classe de défaut.** Rapporté depuis l'appareil : « les
vignettes s'affichent dans le catalogue mais pas dans la page de l'exercice ».
Les douze exercices de démonstration étaient des brouillons écrits à la main, or
`media_uri` n'est délibérément **pas** un champ de `ExerciseDraft` — ils n'en
avaient donc aucune, et une fiche sans média masque la carte entière au lieu
d'en dessiner une vide.

Rien d'autre ne pouvait l'attraper : les lignes étaient valides, la liste les
montrait, les routines pointaient dessus ; la seule chose fausse était **une
colonne qu'aucun test ne lisait**. C'est `tracks_duration` en `0009`, puis
`duration_seconds` en tranche 10, une troisième fois. Le jeu d'essai installe
désormais depuis le catalogue, ce qui règle au passage un second défaut qu'on
n'avait pas vu : un « Squat » tapé à la main à côté d'un « Squat à la barre »
installé faisait **deux exercices pour un mouvement, dont l'un vide.**

**Vider la base est un bouton des Réglages dev, et il supprime des LIGNES, pas
le fichier.** Il n'existait aucun moyen de retrouver un état neuf sans
reconstruire un binaire — quinze minutes de CI pour repartir de zéro. Supprimer
`Documents/SQLite/suivi.db` serait le reset évident et il est impossible de
l'intérieur : la connexion est un singleton ouvert une fois, et rien du §5 ne
sait redémarrer une application — c'est exactement ce que la tranche 2 avait
établi en devant **basculer** une base en place plutôt qu'en rouvrir une. Les
lignes partent, le schéma reste, et le résultat **est** l'état qu'une
installation neuve atteint après ses migrations.

La liste des tables est **dérivée** (`allSchemaTableNames()`), jamais écrite : une
liste tenue à la main serait le défaut même que le catalogue d'export existe pour
empêcher, dans le seul endroit où se tromper est invisible — un reset qui oublie
une table a l'air d'avoir marché, et les lignes restantes ressortent en données
impossibles trois jours plus tard. `PRAGMA foreign_keys` **hors** de la
transaction, la tranche 2 ayant déjà payé pour apprendre qu'il y est
silencieusement ignoré, et restauré dans un `finally`.

### Deux pièces sorties, et où elles vont

- `set-cell.tsx` — la cellule numérique d'une table de séries, à son deuxième
  utilisateur réel. **Dans la feature, pas dans `core/ui`** : elle sait qu'elle
  est une cellule de table. `core/ui/decimal-input` est la forme générique et
  enveloppe une rangée de **formulaire**. Deux formes, deux composants, une
  règle partagée en prose — dit parce que les fusionner est le rangement tentant.
- `restForBlock` prend désormais **les deux champs qu'elle lit** au lieu d'un
  `BlockDraft`. Élargie structurellement plutôt que dupliquée : quel repos
  s'applique est **une** règle, et une seconde écriture est la façon dont une
  séance et la routine dont elle vient finiraient par prescrire des repos
  différents.

## Points ouverts après la tranche 11

- **La source du catalogue est free-exercise-db, et mon refus initial reposait
  sur un fait faux.** J'avais annoncé que le dépôt n'avait aucun fichier de
  licence : il en a un, `LICENSE.md`, texte intégral de l'**Unlicense**. J'avais
  cherché `LICENSE` sans extension et pris le 404 pour une réponse. Vérifié
  depuis en lisant le fichier.
  **Ce qui reste vrai et n'est pas une objection juridique** : les photographies
  montrent une personne identifiable, et une dédicace de droit d'auteur n'est
  pas une autorisation de droit à l'image — elle règle qui peut copier le
  fichier, pas ce que la personne a accepté. Signalé, décision prise en
  connaissance de cause, consignée en `specs §14.33 n° 7` pour rester visible.
- **Rien de la tranche 11 n'a tourné sur l'appareil, et aucun cycle CI n'est
  nécessaire** : aucune dépendance n'entre. `expo-notifications` est dans le
  binaire depuis la tranche 9, `react-native-svg` depuis `dev-b19`, et les
  dessins sont du JavaScript. Metro suffit.

  À regarder dans cet ordre, parce que les premiers rendent les suivants
  observables :
  1. **que les dessins ressemblent à l'exercice qu'ils nomment**, et qu'ils
     soient lisibles à 44 points dans une rangée de liste. C'est le seul point
     qu'aucun test ne peut couvrir — même classe que « un test dit que `chest`
     possède un tracé, pas que ce tracé traverse les pectoraux ». **Et la carte
     blanche en thème sombre** : c'est le seul endroit où une surface ne suit
     pas le thème, et il faut vérifier que ça se lit comme une image et non
     comme un défaut ;
  2. **où se pose le bandeau de séance.** 49 points sont déclarés pour la barre
     d'onglets parce que sa hauteur n'est pas lisible depuis JavaScript
     (`useBottomTabBarHeight` appartient au navigateur JS et lève sous
     `unstable-native-tabs`). L'erreur possible laisse un jour, pas un
     recouvrement — mais elle n'a pas été regardée ;
  3. **que le minuteur de repos sonne.** iOS ne déclenche rien en Node. Et la
     permission est demandée **au premier armement**, ce qui n'a jamais été
     exercé : c'est le seul endroit de l'application qui demande hors des
     Réglages ;
  4. **qu'un arrêt forcé en pleine séance la retrouve intacte.** Le critère de
     sortie n° 2, et il demande de tuer l'application pour de vrai ;
  5. **qu'une séance laissée une nuit ne compte pas la nuit.** Testé en
     arithmétique et contre un vrai fichier SQLite, jamais contre une vraie
     nuit ;
  6. que le balayage supprime une série **dans une liste imbriquée** — deux
     niveaux de rangées balayables, jamais exercés ici ;
  7. que la rangée de RIR tienne sur 390 points : huit cellules, à la limite des
     44 points d'Apple, d'où une rangée plus **haute** plutôt que plus étroite.

- **Ce qu'aucun test ne pourra couvrir, dit plutôt que laissé croire.**
  Qu'iOS déclenche le minuteur ; que le vidage en arrière-plan tourne avant
  qu'iOS suspende (`AppState` n'existe pas en Node — ce qui est testable est que
  la fonction de vidage écrive ce qui était en attente) ; que les dessins soient
  anatomiquement justes ; qu'un arrêt forcé laisse une séance reprenable (ce qui
  est testable est que toute écriture soit transactionnelle). Le temps lui-même
  se teste contre une horloge injectée, ce qui fixe la **règle** et non la
  plateforme — exactement la limite du client Open Food Facts contre un `fetch`
  injecté.

- **L'aller-retour export / import n'a toujours pas été refait sur l'appareil
  depuis `0005`.** `0010` porte le total à **dix-huit tables non vérifiées**
  dans l'unique filet, contre treize avant. C'est la dette la plus vieille et la
  plus chère de la liste, et elle vient de grossir d'un tiers. Les six tables
  neuves sont couvertes par le round-trip en Node, avec une ligne remplissant
  **chaque** colonne — mais rien de la bascule elle-même, qui est du natif
  `expo-sqlite`.

- **La position du bandeau est le seul nombre deviné de la tranche.** 49 points,
  constante de plateforme depuis iOS 7, et une ligne à changer. Voir
  `architecture §9.24` n° 14.

- **Le seuil de trente minutes et le battement de 400 ms sont choisis, pas
  mesurés.** Le premier vient de D12 ; le second est « une fraction de seconde »
  traduite en un nombre. La façon de savoir qu'ils sont faux est de s'entraîner
  avec.

- **La durée affichée redescend au franchissement du seuil**, d'au plus trente
  minutes. Réserve assumée : il faut regarder l'écran trente minutes sans rien
  écrire pour le voir. Si ça se voit malgré tout, le remède n'est **pas** de
  plafonner la queue — ce serait montrer une demi-heure qui n'a pas eu lieu.

- **`glutes` n'a qu'un exercice primaire, et c'est un jugement.** Le soulevé de
  terre est classé glutes-primaire plutôt que lombaires-primaire pour que le
  groupe ne soit pas gris à jamais. Les deux lectures se défendent ; celle-ci se
  change en une ligne.

- **`kettlebell` n'a aucun exercice** : la source n'en contient pas un seul sur
  ses 293 entrées. Un filtre matériel vide est une chose qu'un utilisateur peut
  trouver.

- **Aucune note n'est livrée avec le catalogue**, et c'est une décision : les
  quatre notes du §6.3 sont écrites pour un corps et des erreurs précises, et la
  page de séance les affiche pendant chaque entraînement. Du texte générique là
  apprendrait à l'œil à sauter l'endroit où une vraie note ira.

- **Une séance terminée n'a pas d'écran d'historique pour y revenir.** Le §10.3
  dit qu'elle « reste éditable et supprimable » ; le §7 met l'historique en
  tranche 12. Ce qui est livré : elle reste atteignable tant qu'elle est en
  cours. Le trou est nommé, pas comblé — un écran d'historique bâti maintenant
  serait la couche « pour plus tard » que le §7 interdit.

- **La progression du §10.4 n'est ni lue ni suggérée.** `progression_enabled`
  est copiée sur chaque `session_set`, donc la tranche 12 a tout ce qu'il lui
  faut ; rien ne la lit encore, ce qui est le périmètre.

- **`sweepCache` n'a toujours pas de site d'appel** (hérité de la tranche 4).
- **L'instrumentation des quatre transitions de D16 n'existe toujours pas.**
- **Les tranches 6, 8 et 10 n'ont toujours pas tourné sur l'appareil**, et le
  critère de sortie de la tranche 9 — les conditions des notifications —
  demande toujours de dormir une nuit.
- **`fontVariant: ['tabular-nums']` n'est toujours pas vérifié sur Nunito**, et
  la table de séries en direct s'en sert comme `SetRow`.

## Points ouverts après la tranche 10

- **Rien de la tranche 10 n'a tourné sur l'appareil.** Aucune dépendance n'a été
  ajoutée, donc **aucun cycle CI n'est nécessaire** : Metro suffit, le binaire de
  développement porte déjà `react-native-svg`, `gesture-handler` et le picker.
  À vérifier dans cet ordre : que la carte corporelle **ressemble à un corps** et
  s'allume aux bons endroits (c'est le seul point qu'aucun test ne couvre) ; que
  le balayage d'une série réponde dans une liste imbriquée — deux niveaux de
  rangées balayables n'ont jamais été exercés ici ; et que l'étape de choix
  d'exercice revienne sans que la couche arrière apparaisse, le piège du `key`
  de `SwipeBack` étant exactement celui-là. **S'y ajoutent depuis le
  17/09/2026** : qu'un superset se lise bien en tours A,B,A,B ; que toucher un
  nom d'exercice ouvre sa page depuis les deux états de la page ; et que
  l'interrupteur de progression du bloc se manœuvre sans que le tableau
  au-dessous perde le focus d'un champ. **Et depuis les retours de navigation
  du 17/09/2026**, cinq choses qu'aucun test ne peut dire : que l'appui sur
  l'onglet Journal ramène bien à aujourd'hui — l'écoute `tabPress` d'une API
  marquée *unstable* est le point le plus incertain de tout ce lot, et son mode
  de panne est le silence ; que la bibliothèque recouvre effectivement la barre
  et que son bouton retour n'affiche qu'un chevron ; que les deux fenêtres de la
  tranche 10 montent enfin du bas au lieu de glisser par la droite ; que le
  contour d'un muscle touché se voie à douze unités de viewBox ; et que le
  schéma du formulaire d'exercice tienne dans une fenêtre déjà longue.
  **Et depuis les retours clavier du même jour**, quatre de plus : que les
  chevrons emmènent bien la page avec le focus — la marge de 24 points et la
  déduction du haut de bande sont de l'arithmétique, pas une observation ; que
  presser le libellé d'une rangée focalise son champ sans gêner le « Ajouter »
  des éditeurs de portions et d'ingrédients, qui est une `Pressable` désormais
  imbriquée ; que la molette de quantité tourne exactement comme avant, la
  rangée `flush` étant justement là pour ça ; et que la quantité pré-remplie
  arrive bien sélectionnée.
  **Et depuis les retours du soir**, trois de plus, dont une qui touche un
  écran vérifié : que la barre au-dessus du clavier ressemble enfin à celle de
  Safari — c'est le seul point où le rendu du verre décide, et rien ici ne peut
  le regarder ; que fermer la fenêtre d'ajout par glissement la **remette** en
  place avant de demander, et que « Confirmer » ne demande rien ; et que les
  500 ms de plancher se lisent comme du travail plutôt que comme de la lenteur.
  **Et depuis la reprise de ces trois points** : que la bande du Journal ne
  montre plus jamais que la bonne journée — c'est le seul de tous ces points qui
  a été rapporté **trois fois**, et la troisième correction est la première qui
  ne repose sur aucun ordre entre deux canaux, elle le supprime ; que le
  défilement de Stats ne bouge **pas du tout** au changement de plage ; et que
  la barre du clavier ressemble à la capture d'écran de référence : une capsule
  unique en retrait des bords, chevrons à gauche, coche à droite. **Le carrousel
  est confirmé réglé** (17/09/2026), donc il sort de cette liste.
- **Les seuils de nuance de la carte sont choisis, pas mesurés** : 3, 6 et 10
  séries pondérées. La façon de savoir qu'ils sont faux est de regarder deux
  routines qu'on sait différentes et de voir si la carte les distingue. Une
  ligne dans `muscle-volume.ts`.
- **La demi-série d'un secondaire est une convention**, pas une mesure. Si la
  carte paraît surestimer les triceps et les épaules, c'est ce nombre qu'il faut
  bouger — et il est à un seul endroit.
- **La vignette du §10.1 n'est pas affichée et `media_uri` n'est écrite par
  rien.** Choisir un média demande `expo-image-picker`, hors du §5 : c'est une
  demande de dépendance native à valider, et elle coûterait un cycle CI. La
  colonne existe parce qu'elle est nullable — donc gratuite — et que l'oublier
  aurait coûté une migration.
- ~~**Le bouton de démarrage d'une routine n'existe pas.**~~ **Livré en
  tranche 11.** Restent les graphiques, les records et l'historique de la page
  d'un exercice : ils lisent `session_set`, qui existe depuis `0010`, et sont
  le périmètre de la tranche 12.
- **Hypothèse signalée : l'incrément par défaut vaut 2,5 kg.** Le plus petit pas
  qu'une barre encaisse vraiment, un disque de 1,25 kg de chaque côté. Choisi, pas
  mesuré — d'où un réglage, pour que ça se corrige sans migration.
- **Le vocabulaire est une hypothèse entière.** Quinze muscles et huit matériels
  inventés en tranche 10, jamais confrontés à un exercice réel. C'est précisément
  pourquoi aucune CHECK ne les tient : la correction est une ligne de TypeScript.
  La façon de savoir qu'ils sont faux est de créer vingt exercices.
- **`serratus` et `hip-flexors` sont rattachés par contiguïté**, pas par
  anatomie — au pectoral et au quadriceps. Sur ce dessin l'enjeu est faible, les
  deux étant minuscules. Les éteindre est une ligne dans `body-map.ts`.
- **`lats` est posé sur `upper-back`**, qui couvre aussi les rhomboïdes et le
  trapèze moyen. Le mot est celui qu'on emploie en salle ; le dessin est un peu
  plus large que le mot.
- **L'aller-retour export / import n'a toujours pas été refait sur l'appareil
  depuis `0005`.** `0008` portait le total à treize tables non vérifiées ;
  **`0010` le porte à dix-huit** (voir les points de la tranche 11). C'est la
  dette la plus vieille et la plus chère de la liste.
- **`sweepCache` n'a toujours pas de site d'appel** (hérité de la tranche 4).
- **L'instrumentation des quatre transitions de D16 n'existe toujours pas.**
- **Les tranches 6 et 8 n'ont toujours pas tourné sur l'appareil**, et le critère
  de sortie de la tranche 9 — les conditions des notifications — n'est toujours
  pas atteint.
- **`fontVariant: ['tabular-nums']` n'est toujours pas vérifié sur Nunito**, et
  `SetRow` s'en sert pour aligner les numéros de série.

## Points ouverts après la tranche 9

- ~~**Rien de la tranche 9 n'a tourné sur l'appareil.**~~ **Une notification a
  été reçue (15/09/2026)** : la chaîne build → installation → autorisation →
  planification → déclenchement fonctionne, entitlement neutralisé compris.
  **Restent non exercées les CONDITIONS**, qui sont la moitié qui peut produire
  un résultat faux et plausible : qu'un rappel de pesée s'annule quand on s'est
  pesé et revienne le lendemain, et que le bilan annonce les chiffres du soir.
  C'est le critère de sortie, et il demande de dormir une nuit.
  **S'y ajoutent deux choses signalées à l'usage et corrigées sans être
  observées ici** : que la molette d'heure ne revienne plus en arrière avant de
  tourner toute seule (certain — la cause est diagnostiquée), et qu'elle ne se
  superpose plus à ce qui la suit (probable — la cause la plus vraisemblable est
  supprimée par la page dédiée, mais le défaut a été rapporté, pas observé).
  **Le binaire de développement doit être reconstruit avant toute chose** —
  `expo-notifications` est native, donc le bundle JS reste vert pendant que
  l'écran planterait. À vérifier dans cet ordre : que l'installation réussit
  malgré le greffon d'entitlements neutralisé ; qu'iOS demande l'autorisation à
  l'activation et **pas avant** ; que le rappel de pesée sonne le lendemain
  matin et **ne sonne pas** si la pesée est faite ; que le bilan annonce les
  chiffres du **soir**.
- ~~**L'entitlement est retiré au pré-vol, pas à la signature.**~~ **Levé
  (15/09/2026)** : une notification reçue suppose une application installée et
  lancée, donc un build CI et une signature SideStore qui ont accepté le
  greffon neutralisé.
- **Les heures par défaut sont choisies, pas mesurées** (§13 n° 4 des specs,
  toujours ouvert). La façon de savoir qu'elles sont fausses est de vivre avec
  une semaine.
- **Le bilan ne sonne pas un jour où l'application n'est pas ouverte.**
  Conséquence assumée du n° 1 de `specs §14.18`. Si ça se sent à l'usage, le
  remède n'est pas d'anticiper des chiffres qui n'existent pas : ce serait une
  occurrence au texte générique, donc un amendement au §9.3 qui demande « l'état
  des macros ».
- ~~**Le minuteur de repos de la tranche 11 est la prochaine sorte.**~~
  **FAUX, et corrigé en tranche 11.** Il n'en est pas une : `diffSchedule`
  décide ce qui appartient au planificateur en testant si un identifiant
  commence par une sorte, et annule tout ce qu'il possède et qui n'est pas dans
  le plan. L'ajouter aurait fait annuler le minuteur **en pleine séance**, par
  un planificateur qui n'en a jamais entendu parler — exactement ce que le
  paragraphe voisin de la même tranche 9 avait écrit pour l'éviter. Il vit dans
  `rest:<séance>`, sans réglage, et l'absence de CHECK sur `kind` n'a pas été
  dépensée.
- **`sweepCache` n'a toujours pas de site d'appel** (hérité de la tranche 4).
  Inchangé.
- **L'instrumentation des quatre transitions de D16 n'existe toujours pas.**
  Inchangé, et la tranche 9 n'ajoute rien au chemin critique.
- **L'aller-retour export / import n'a pas été refait sur l'appareil depuis
  `0005`.** `0007` porte le total à **sept tables non vérifiées** dans l'unique
  filet. C'est la dette la plus vieille et la plus chère de la liste.

## Points ouverts après la tranche 8

- **Vérification iPhone en attente, et elle s'empile sur deux dettes.** La
  tranche 6 n'a toujours pas tourné sur l'appareil — le bloc groupé du Journal,
  et que son tap de repli n'ait pas volé le balayage de suppression — et le
  thème face au chrome natif reste décidé sur une lecture de source. La
  tranche 8 touche le Journal et ajoute une pile native à Stats : elle
  s'empile dessus.
- **L'aller-retour export / import est la dette la plus urgente.** Il n'a pas
  été refait sur l'appareil depuis `0005`, et `0006` porte le total à **six
  tables non vérifiées** dans l'unique filet. La bascule reste du natif
  `expo-sqlite` qu'aucun test n'atteint — la seule partie capable de détruire
  la base quotidienne est exactement la partie non testée, comme depuis la
  tranche 2. Et le §9.1 v2.2 le dit mieux que moi : **le poids n'existe qu'ici**,
  intervals.icu ne l'expose pas, il n'y a aucune échappatoire technique.
- **Conséquence de `0006` à connaître avant de la rencontrer** : la base de
  développement devient plus récente que le binaire quotidien, resté à `0005`.
  Un export dev importé dans la quotidienne sera refusé par G3. C'est le
  comportement voulu.
- **Hypothèse signalée : la pesée est supposée matinale.** Le §9.1 la place « au
  réveil », donc après l'heure de bascule (bornée à 6 h) dans tous les cas
  ordinaires. Une pesée à 3 h du matin avec un seuil à 4 h atterrit sur la
  veille, ce qui est exactement ce que le seuil veut dire — mais personne ne
  l'a essayé. La question se repose en tranche 9, où le rappel de pesée doit
  décider seul de « la date du jour ».
- **Le rendu des graphiques reste non testé, par construction**, comme en
  tranche 7. Seule l'arithmétique l'est. Ce que l'appareil seul peut dire :
  l'épaisseur des points bruts à quatre-vingt-dix jours, la lisibilité de l'axe
  à une décimale, et si la ligne d'objectif en pointillés se distingue de la
  courbe lissée en thème sombre.
- **Le graphique croisé n'a aucune lecture au doigt**, contrairement aux trois
  autres. Délibéré — son sujet est une relation, pas une valeur — mais c'est la
  seule incohérence d'interaction de l'écran, et elle se remarquera peut-être
  à l'usage avant d'être comprise.
- **Aucun test ne couvre l'écran de saisie ni celui de l'objectif**, qui ne se
  rendent pas depuis Node. Ce qui est fixé est ce qu'ils appellent :
  `validateGoalDraft`, `parseDecimal`, `formatWeight`. Le piège qu'aucun test ne
  peut tenir reste le même que pour les molettes de la tranche 4 — un appelant
  qui confondrait `undefined` et `null`.
- **`progress-ring.tsx` ne sera pas réécrit sur svg**, et c'est désormais un
  renversement consigné (`architecture §9.9` n° 11) plutôt qu'un report. Les
  quatre motifs sont là ; le principal est qu'on échangerait du code testé et
  vérifié sur l'appareil contre du code qui ne serait ni l'un ni l'autre, sur
  l'écran d'accueil, pour un gain fonctionnel nul.
- **Hypothèse signalée : douze semaines par défaut** pour une date cible neuve,
  et des pas d'une semaine. Choisi, pas mesuré. Aucun sélecteur de date natif
  n'est ajouté — le §5 n'en porte pas, et une molette de tous les jours sur deux
  ans est un défilement plutôt qu'un choix.
- **`weight_measure` n'a pas de règle de validation numérique à l'import.** Une
  archive réparée à la main avec `value_kg: 0` échoue sur `ck_weight_value`,
  donc avec une erreur SQLite nommant une contrainte plutôt qu'une ligne. Le
  catalogue d'export n'a **aucune** règle numérique — seulement des formes
  (`civil_date`, `entity_id`, `epoch_ms`) et des ensembles fermés (`one_of`) —
  et en ajouter une est le même report que `non_empty` pour `food.barcode`.
- **Rien ne propose de corriger une mesure depuis la courbe.** Toucher un point
  affiche sa valeur ; pour la corriger il faut passer par l'historique. Le §9.1
  ne demande pas mieux, et l'ajouter mettrait une écriture derrière un geste de
  lecture.
- **`fontVariant: ['tabular-nums']` reste non vérifié sur Nunito**, et la
  tranche 8 en ajoute : le chiffre de tête des trois cartes de poids, la colonne
  de l'historique, les valeurs des infobulles. Si Nunito ne porte pas `tnum`, la
  colonne de l'historique est l'endroit où ça se verra le plus.
- **Les deux icônes n'ont jamais été vues sur un téléphone.** Elles sont
  vérifiées par sondes de pixels et par aperçu ASCII, ce qui dit que les formes
  sont aux bonnes coordonnées — pas qu'elles sont belles ni que « DEV » se lit à
  soixante points. Le prochain cycle CI le dira.
- **Le splash (`assets/splash-icon.png`) n'a pas été refait** et reste commun
  aux deux variantes. Non demandé, et il n'a pas le même rôle : on le voit une
  seconde au lancement, quand on sait déjà quelle application on a ouverte.
- **Le battement qu'ajoute `useSettled` n'a pas été observé.** Un formulaire
  rouvert après édition attend désormais la relecture avant de se remplir, ce
  qui sur SQLite local se compte en dizaines de millisecondes — et c'est déjà ce
  que chaque écran fait à froid. Si ça se voit, la sortie est un indicateur
  d'attente, jamais un remplissage depuis la valeur périmée.
- **Si une relecture échoue, le formulaire reste vide** au lieu de s'ouvrir sur
  du périmé. C'est le même comportement qu'avant en cas d'échec (`data`
  `undefined` → rien), donc aucun risque nouveau — mais sur une base locale, une
  lecture qui échoue veut dire que l'application a déjà des problèmes plus
  graves que ce formulaire.
- **Aucun champ décimal ne se rend depuis Node**, donc `DecimalInput` lui-même
  n'est pas testé : ce qui est fixé est l'arithmétique du round-trip qu'il
  supprime, des deux côtés — la liaison par nombre qui transforme « 1,2 » en 12,
  et celle par texte qui ne le fait pas. La resynchronisation depuis l'extérieur
  (un aliment qui se charge, des lignes qui se ré-échelonnent) reste ce que
  l'appareil seul peut confirmer.
- **Le battement possible des boutons ± n'a pas été observé.** Un appui écrit,
  le bus invalide, la requête se relit — en local et synchrone, donc en
  dizaines de millisecondes, mais rien ne le garantit sur un appui en rafale.
  Aucun état optimiste n'a été posé délibérément : ce serait une seconde source
  de vérité pour la même valeur. Si ça bat, la réponse est un regroupement.
- **Rien ne permet d'enregistrer la valeur reprise TELLE QUELLE en un
  toucher.** Se peser exactement comme la veille demande d'ouvrir la fenêtre et
  de valider, soit deux touchers, là où un écart d'un dixième n'en coûte qu'un.
  Le cas est réel mais rare — un poids identique au gramme près d'un jour sur
  l'autre — et un troisième bouton « valider » sur la carte coûterait plus qu'il
  ne rapporte. À rouvrir si ça gêne.
- **L'interdiction du futur n'est pas rétroactive**, et c'est voulu : une
  archive écrite avant cette règle peut porter des pesées futures, qui restent
  lues, dessinées et supprimables. Elles ne sont refusées qu'à la création.
- **Le seuil de « objectif atteint » vaut 100 g.** Choisi parce que c'est une
  graduation de balance domestique. Sans lui, « atteint » serait une égalité
  exacte de deux flottants, qui n'arrive jamais — donc l'écran dirait pour
  toujours qu'il reste quelques grammes.

## Points ouverts après la tranche 7

- ~~**Vérification iPhone en attente.**~~ **Faite pour la tranche 7, Stats
  compris** (14/09/2026). **La tranche 6 n'a toujours pas été touchée** : le
  bloc groupé du Journal et les `SwipeBack` empilés restent inconnus.
- **Le rendu des graphiques reste non testé, par construction.** Seule leur
  arithmétique l'est : une barre au mauvais endroit ressemble à une barre au
  bon endroit. Ce que l'appareil seul peut dire, et qui a déjà rendu neuf
  retours, restera le seul juge.
- **La journée en cours est exclue de tous les chiffres, et ça se paie sur
  7 jours.** Une journée sur sept écartée, c'est 14 % de la plage ; sur 30 et
  90 c'est du bruit. C'est nommé à l'écran depuis le retour d'usage, mais la
  règle elle-même reste une hypothèse signalée. La sortie tient en une ligne :
  `adherenceOf` cesse de filtrer sur la date, et le taux plafonne alors à 86 %
  chaque matin jusqu'au dîner.
- **La moyenne glissante est molle sur 7 jours**, forcément : chaque point ne
  dispose que des jours qui le précèdent dans la plage. Correct et visible. La
  sortie serait de garder le brut sous 30 jours, au prix d'un comportement qui
  change avec la plage.
- **Les chemins dégradés d'Open Food Facts n'ont toujours pas été provoqués.**
  Le détour vers le formulaire les couvre désormais tous les quatre, mais seul
  le mode avion est facile à essayer : le quota et la réponse illisible
  demandent que le serveur se comporte mal.
- **`fontVariant: ['tabular-nums']` reste non vérifié sur Nunito**, et la
  tranche 7 en ajoute : le chiffre de tête de chaque carte, les trois parts de
  la répartition, les quatre mesures de D16. Si Nunito ne porte pas `tnum`, ça
  se verra d'abord ici.
- ~~**L'anneau n'est pas réécrit sur svg**, reporté en tranche 8.~~ **Tranché en
  tranche 8 : il ne le sera pas**, et le report devient définitif
  (`architecture §9.9` n° 11). Le motif principal : ses tests portent sur
  l'arithmétique des deux rotations et des pastilles, arithmétique qui
  **disparaît** avec svg, alors que le rendu d'un graphique n'est testé nulle
  part — on échangerait du code testé et vérifié sur l'appareil contre du code
  qui ne serait ni l'un ni l'autre, sur l'écran d'accueil, pour un gain
  fonctionnel nul.
- **Hypothèse signalée : la tolérance vaut 10 % par défaut.** Aucun document ne
  donne ce nombre. La façon de savoir qu'il est faux est de regarder le taux
  après un mois d'usage : s'il est toujours à 0 %, le seuil est trop serré.
- **Hypothèse signalée : aujourd'hui est exclu des chiffres.** Défendable et non
  demandé. À rouvrir si l'absence de la journée en cours dans la moyenne
  surprend plus qu'elle n'aide.
- **Le taux d'adhérence compare une journée entière à un objectif qui peut être
  partiel**, quand un repas n'a pas de cible. Aligné sur le bandeau du Journal
  délibérément, mais le défaut est réel et partagé par les deux. À rouvrir en
  décidant des **deux** ensemble, jamais d'un seul.
- **Rien ne montre la répartition dans le temps.** Les parts P/G/L sont une
  moyenne sur la plage, pas une série : on ne peut pas voir qu'on a dérivé. Le
  §8.7 ne le demande pas ; le graphique empilé serait le remède.
- **`export_reminder_days` n'a toujours pas d'interface.** Le §8.8 ne le range
  pas dans les Réglages et la tranche 9 lui donnera un second utilisateur
  (la notification de rappel). Différé jusque-là plutôt qu'ajouté par symétrie.
- **La séparation des rangées de choix est peut-être doublée dans
  `meal-editor-screen.tsx`.** `FormSection` insère un `ListSeparator` entre ses
  enfants, et ce fichier en insère un lui-même dans son `.map` — or
  `Children.toArray` aplatit les tableaux, donc les deux devraient s'appliquer.
  **Lu dans la source, jamais vu à l'écran** : la tranche 6 n'a pas tourné sur
  l'appareil. Non corrigé pour ça — à confirmer d'un coup d'œil avant de
  toucher du code livré.
- **`tests/dev/seed.test.ts` a rougi une fois, sans être reproductible.**
  « carries a long history without choking » — trois ans générés en une
  transaction, le test le plus lourd de la suite — a échoué sous UTC et
  America/New_York au cours d'une exécution, puis six suites complètes l'ont
  passé. **Le message n'a pas été capturé**, donc l'hypothèse d'un dépassement
  du délai de vitest sous charge (soixante-six workers) n'est qu'une hypothèse.
  À regarder si la CI le refait : c'est le seul test dont le coût dépende de la
  machine.
- **`ios/Suivi/Info.plist` porte trois `UsageDescription`** là où une seule est
  déclarée dans `app.config.ts`. Constaté au pré-vol, antérieur à cette tranche,
  et sans rapport avec svg qui n'en demande aucune. À regarder un jour : une
  permission qu'on ne demande pas est une permission qui fait refuser une app.

## Points ouverts après la tranche 6
- **Vérification iPhone en attente.** Rien de l'interface des recettes n'a été
  touché sur l'appareil. À regarder en premier : le bloc groupé du Journal — le
  repli, l'indent, et surtout que le tap de repli n'ait pas volé le balayage de
  suppression — puis les deux étapes de l'ajout, où un `SwipeBack` de plus est
  empilé dans une fenêtre qui en contient déjà.
- **L'aller-retour export / import n'a pas été refait sur l'appareil** avec les
  quatre tables de `0005` dedans — et `0006` en ajoute deux, ce qui porte le
  total à six. Il est vert en Node, fixtures remplissant
  chaque colonne, mais la bascule reste du natif `expo-sqlite` que les tests
  n'atteignent pas — c'est la partie capable de détruire la base quotidienne et
  c'est exactement la partie non testée, comme depuis la tranche 2.
- **Aucune recette ne se saisit en portions d'ingrédient.** L'éditeur ne propose
  pas encore les portions d'un aliment comme commodité de saisie : un ingrédient
  s'ouvre sur 100 unités de base et se retape. La conversion à la capture est
  prévue par la décision (`architecture §9.6` n° 7) et non faite — c'est du
  confort, pas une règle.
- **Un ingrédient gelé n'est pas re-liable depuis l'éditeur.** Sa ligne s'édite
  en quantité et porte une marque, mais rien ne permet de la rattacher à un
  aliment. Choisir un aliment est *ajouter* un ingrédient. Volontaire : laisser
  re-lier remplacerait une capsule par les valeurs d'un autre aliment, en
  silence. À rouvrir si supprimer puis recréer un aliment devient courant.
- **Trois dessins du même contrôle segmenté.** `core/ui/segmented.tsx` est le
  bon, `unit-toggle.tsx` et `yield-toggle.tsx` lui sont antérieurs et copient
  ses styles. Non fusionnés : ce serait toucher du code livré sans autre motif
  que la cohérence. À replier au premier de ces deux fichiers qu'on rouvrira
  pour une autre raison.
- **La recherche de la bibliothèque ne cherche pas dans les tags.** Seul le nom
  et la marque sont classés ; un tag ne se trouve qu'en touchant sa puce. C'est
  la conséquence directe du refus de fondre les deux filtres, et la réserve est
  que quelqu'un tapera « végétarien » dans le champ avant de voir la puce.
- ~~**Aucun pré-remplissage de quantité pour une recette.**~~ **Fait**, et il a
  levé la réserve sur le bouton « + ». L'index reste différé : la fonction de
  fenêtre tourne sans lui, et ajouter une migration par symétrie avec
  `ix_entry_source_food` est ce que ce projet décline. Le jour où un vrai
  historique le rend mesurable, c'est un `CREATE INDEX`.
- **Le bloc ne dit pas combien d'ingrédients il contient quand il est replié.**
  Le nom, la quantité et le total, rien de plus. Trois touchers pour compter.
  Non fait parce qu'aucune spec ne le demande et que la rangée porte déjà cinq
  valeurs sur sa ligne grise.
- **`recipe_step` n'a pas d'index sur `recipe_id`**, comme `day_template_meal`
  n'en a pas sur `template_id` et pour le même motif : la table est bornée par
  ce que l'utilisateur crée, et un index reste la seule chose d'une migration
  qui puisse encore être ajoutée sans rien reconstruire. Idem `recipe_tag`, dont
  la clé primaire composite sert déjà les lectures par recette.
- **Hypothèse signalée : quatre portions par défaut** sur une recette neuve.
  Choisi, pas mesuré. Un rendement de 1 est la valeur qui rend l'arithmétique
  des portions invisible, donc celle où un défaut faux passerait inaperçu — d'où
  un nombre qui force à regarder.

## Points ouverts après la tranche 5
- ~~**Vérification iPhone en attente.**~~ **Faite pour l'essentiel** : la
  tranche 5 a tourné sur l'appareil et a rendu six retours d'interface, tous
  traités. **Le bandeau et les cartes de repas remaniés n'ont pas encore été
  revus sur l'appareil** — l'anneau en particulier, dont la géométrie est
  testée en arithmétique mais dont le rendu ne l'est pas.
- **La jauge n'a jamais été peinte.** Deux demi-anneaux tournés, clippés, dans
  un cadre lui-même tourné de 225°, plus deux pastilles placées par
  trigonométrie : c'est la seule chose de cette tranche dont aucun test ne dit à
  quoi elle ressemble. Ce qu'il faut regarder : l'arc à 0 (rien, pas même une
  pastille), la jonction à mi-course, le raccord des deux bouts sur le vide du
  bas, et l'alignement des pastilles sur l'épaisseur du trait.
- **Le vide de la jauge est à six heures, et le chiffre est dedans.** Si le
  texte déborde sur les arcs, c'est la taille du cadre (186) qu'il faut monter,
  pas celle du chiffre — le rayon et l'épaisseur sont liés au premier.
- **Les repas récents affichent le nom stocké, sans numéro de collation.** Le
  numéro se dérive de la journée entière, que cette liste ne charge pas — elle
  lit un repas par ligne. « Collation · 15 septembre » reste sans ambiguïté ;
  à rouvrir si deux collations du même jour s'y côtoient et se confondent.
- ~~**Plus rien ne dit pourquoi une journée matérialisée ne suit pas son
  modèle.**~~ **Partiellement répondu** : la ligne au pied des repas nomme le
  modèle de la journée, donc le snapshot est de nouveau visible. Ce qui reste
  non dit, c'est *pourquoi* il ne bouge pas quand le modèle est édité — mais le
  contrôle offre désormais la sortie, ce qui vaut mieux qu'une explication.
- **Le thème clair porte un accent à 2,13:1, et c'est une décision prise en
  connaissance de cause.** Chevrons, « Enregistrer », le glyphe du bouton
  d'ajout et la jauge y sont pâles. Rien ne casse ; tout est moins lisible. La
  sortie, si ça gêne, est une surface plus sombre derrière l'accent — jamais un
  vert plus sombre, qui est précisément ce qui a été refusé.
- ~~**Les noms de SF Symbols ne sont pas vérifiés.**~~ **Ils le sont** : le type
  `SFSymbol` est l'union de tous les symboles réels, donc `tsc` refuse un nom
  qui n'existe pas. Reste non vérifié le **rendu** — qu'un symbole présent dans
  le jeu soit disponible sur la version d'iOS de l'appareil.

- ~~**La police de l'application n'a pas changé.**~~ **Nunito est en place**
  (Regular, SemiBold, Bold), sous licence OFL, chargée à l'exécution.
- **Nunito n'a jamais été vue à l'écran.** Les trois fichiers sont dans le
  bundle et la table graisse → fonte est testée, mais rien ne dit qu'iOS les
  enregistre sous les noms attendus : une famille mal nommée rend la police
  système sans erreur. Le témoin est un titre en 700 — s'il n'est pas plus gras
  que le corps, c'est le nom de famille qui est faux, pas la graisse.
- **`fontVariant: ['tabular-nums']` n'est pas vérifié sur Nunito.** Une
  vingtaine de chiffres de l'application en dépendent pour s'aligner en colonne.
  Si Nunito ne porte pas la fonctionnalité `tnum`, les colonnes de nombres
  danseront — visible surtout sur la liste des entrées et les barres de macros.
- **Les contrôles natifs gardent la police système**, et c'est irréductible :
  `ActionSheetIOS`, les alertes, les en-têtes de `Stack` et le
  `UIPickerView` des quantités sont dessinés par UIKit. Nunito s'arrête à ce
  que l'application dessine elle-même.
- **Un repas nommé librement avant la règle reste tel quel, et c'est voulu**
  (§5.2). Conséquence à connaître : sa fiche ne propose que les types encore
  libres, donc un tel repas ne peut pas être « corrigé » vers un type déjà pris
  sans supprimer l'autre d'abord.
- **Le parcours à vérifier en premier**, parce qu'il est le critère de sortie :
  créer « Jour d'entraînement » avec quatre repas et leurs objectifs, l'affecter
  au mardi, surcharger une date depuis le Journal, et lire un vrai restant sur
  une journée jamais touchée **et** sur une journée déjà loguée.
- **`ActionSheetIOS` n'a jamais tourné dans ce projet.** C'est du natif de base
  et il n'y a pas de raison qu'il échoue, mais aucun test Node ne le touche et
  c'est le seul contrôle système que la tranche introduit.
- **Un modèle sans repas est permis et mène à une journée sans repas.** Cohérent
  — le §8.3 laisse déjà vider une journée matérialisée de tous ses repas — mais
  l'écran n'offre alors rien à quoi ajouter. L'échappatoire existe (« Ajouter un
  repas » matérialise et crée), elle n'est simplement pas signalée.
- ~~**Le taux d'adhérence de la tranche 7 devra exclure les journées sans
  objectif.**~~ **Fait**, et l'écart est nommé à l'écran plutôt que laissé à
  deviner : sans cette ligne l'arithmétique ne tomberait visiblement pas juste
  sur tout historique antérieur à `0004`.
- **`readDayPlan` fait trois lectures là où deux suffiraient** quand la
  surcharge répond : les trois candidats sont lus avant d'appeler la fonction
  pure, pour que la règle de préséance vive à un seul endroit au lieu d'être
  réécrite en chaîne de retours anticipés. Deux lectures sur clé primaire de
  plus, sur une base locale synchrone. Non mesuré, parce qu'il n'y a rien à
  mesurer.
- **`useDay` accroche le Journal à `off_suspended_until`.** `setting` est dans
  sa liste de tables pour le pointeur par défaut, et le limiteur y écrit à
  chaque 429 : scanner en magasin invalidera le Journal. Coût réel, le rejeu de
  quelques lectures sur index. Nommé plutôt que découvert.
- ~~**Le générateur de jeu de démonstration ne crée aucun modèle.**~~ **Fait en
  tranche 7, exactement pour le motif prévu** : sans objectifs le bandeau reste
  muet et l'adhérence a un dénominateur vide, donc la moitié de la tranche était
  invisible sur l'appareil. Un seul modèle, par défaut, et **seulement s'il n'en
  existe aucun** — le bouton promet de n'effacer rien. Sa collation n'a pas
  d'objectif, délibérément : une journée partiellement ciblée est le cas que les
  statistiques doivent traiter correctement.
- ~~**Deux piles natives déclarent les mêmes options d'en-tête.**~~ **Fermé en
  tranche 8** : l'onglet Stats en ajoute une troisième pour l'historique des
  pesées, et c'est le troisième utilisateur que ce point attendait.
  `core/ui/stack-header.ts` porte les quatre options communes ; le style de
  titre reste chez chaque pile, parce que le Nunito extra-gras du Journal est
  une décision et non un mécanisme.

## Points ouverts après la tranche 4
- ~~**Vérification iPhone en attente.**~~ **Faite, scan compris.** Reste non
  exercé ce qui demande de provoquer une panne : hors ligne, réponse illisible,
  429, et la bascule vers le formulaire pré-rempli.
- **Ce qu'aucun test ne couvre, par construction** : l'API réelle. Le client est
  exercé contre un `fetch` injecté, donc ce qui est vérifié est la *taxonomie*
  des réponses, pas qu'Open Food Facts les produise encore. Les sept constats
  du 13/09/2026 sont datés pour cette raison — le §13.8 des specs prévoyait que
  les limites bougent ; ce sont les points d'entrée eux-mêmes qui ont bougé.
- **Hypothèse signalée : la fréquence réelle des produits sans `energy-kcal`.**
  Un seul produit observé en manquait, et la consultation par code-barres la
  fournissait. Si le formulaire pré-rempli s'ouvre trop souvent à l'usage, la
  conversion kJ → kcal est le remède et tient en une ligne — mais elle diverge
  du §5.1, donc elle passera par un amendement et non par un correctif.
- **Le délai d'attente vaut 5 s et la suspension par défaut 5 min.** Deux
  nombres choisis, pas mesurés. La façon de savoir qu'ils sont faux est
  d'utiliser l'application dans un magasin.
- ~~**Aucune purge du cache n'est appelée.**~~ **Branchée en tranche 7**, mais
  **pas** dans la séquence de démarrage comme prévu : celle-ci est normative à
  cinq étapes et tourne dans le budget de 1,5 s, et `core/db` aurait dû importer
  `features/nutrition` pour l'atteindre. Un effet monté après la première
  peinture ne coûte rien au budget et garde le DELETE dans son domaine.
- **`food.barcode` n'a pas de règle de validation à l'import.** Une archive
  réparée à la main pourrait y poser une chaîne vide, qui prendrait la place
  dans `ux_food_barcode` et refuserait tout autre aliment sans code-barres. Le
  chemin d'écriture s'en protège (vide → `NULL`) ; l'import non. Ce serait un
  type de règle de plus (`non_empty`) dans le catalogue. Non fait : le
  catalogue assume que ses règles peuvent être incomplètes, ce qui ne rend la
  validation que plus faible, jamais fausse.
- **La bibliothèque n'interroge pas Open Food Facts**, seul l'écran d'ajout le
  fait. Tranché ainsi : la bibliothèque est « ma base », et y verser un
  catalogue mondial en ferait autre chose. À rouvrir si chercher un produit
  pour le corriger, sans l'ajouter, devient un besoin.
- **Aucune action « mettre à jour depuis Open Food Facts »** sur la fiche d'un
  aliment `source = 'off'`. Elle se défendrait — un acte explicite, jamais une
  suggestion sur le parcours de saisie — mais le §7 ne la mentionne pas.
- **Les portions d'un produit distant ne sont jamais devinées.** Les tailles de
  portion d'Open Food Facts sont du texte libre et les huit noms du §6.1 une
  liste fermée. Elles s'ajoutent à la main après coup.
- ~~**L'instrumentation des quatre transitions du parcours critique (D16)
  n'existe toujours pas.**~~ **Faite en tranche 7**, en `core/perf/`, inerte hors
  développement, lue dans une section des Réglages dev. Reste non instrumenté le
  parcours du **scan** : ses cinq secondes partent de la caméra et non d'un
  toucher, donc c'est une cinquième mesure et pas une des quatre de D16.

## Points ouverts après la tranche 3
- ~~Vérification iPhone en cours.~~ **Faite pour l'interface.** L'application
  démarre, la migration `0002` s'applique, et tout ce qui se touche a été repris
  à l'usage. ~~Restent à confirmer : la recherche sans accent et l'aller-retour
  export / import avec les nouvelles tables.~~ **L'aller-retour est vérifié
  (13/09/2026).** La recherche sans accent a désormais un porteur : une section
  de diagnostic dans les Réglages dev dit quel chemin de pliage s'exécute.
- ~~**L'écran de quantité n'a plus de champ de saisie.**~~ **Rouvert et réglé en
  tranche 4**, exactement comme la réserve le prévoyait : toucher la ligne
  « Quantité » la transforme en champ numérique. Les molettes restent l'unique
  source de vérité — ce qui est tapé atterrit dessus — et gardent les fractions
  de portion.
- **La quantité de référence d'un aliment n'est plus saisissable** : 100 g ou
  100 ml. Une étiquette donnant ses valeurs pour 30 g se convertit à la main.
  `display_ref_qty` reste en base et vaut 100, donc le champ peut revenir sans
  migration.
- ~~**Hypothèse signalée** : `String.prototype.normalize` sur Hermes.~~
  **Levée : la recherche sans accent est vérifiée sur l'appareil (13/09/2026).**
  La tranche 4 avait rendu la question observable — Réglages dev, section
  « Recherche sans accent » — et corrigé la sonde au passage : elle demandait
  `typeof`, ce qui ne voit qu'une des trois façons d'échouer (absente, inerte,
  ou levant). Elle appelle désormais la fonction dans un `try`.
  **Le diagnostic reste en place**, et c'est délibéré : il dit lequel des deux
  chemins s'exécute, ce qu'aucun test ne peut dire depuis Node. Le témoin
  décisif est « Phở » — la table de repli ne le connaît pas, donc lire « pho »
  prouve que le moteur décompose. À relire à chaque montée de SDK, le pliage
  hors du français en dépendant entièrement.
- ~~Depuis l'écran d'ajout, « Saisie libre » fait un `router.replace ».~~
  **Résolu.** C'est une étape en place, comme celle de la quantité : le retour
  revient à la liste d'aliments et le parcours « ajouter quelque chose » tient
  dans un seul écran.
- `kind` et `base_unit` dupliquent encore leur ensemble de valeurs entre le
  type TypeScript et le tableau `one_of` du catalogue. `PORTION_NAMES` montre
  la forme correcte — données d'abord, type dérivé. Non corrigé : ce serait
  toucher du code livré sans autre motif que la cohérence.
- ~~**Hors périmètre, décidé** : les repas récents du §8.4a.~~ **Livrés en
  tranche 5**, où un repas a effectivement un sens. Restent hors périmètre :
  ~~le seuil « au-delà de 900 kcal pour 100 g »~~ **livré en tranche 4**, et
  ~~`barcode` avec son index unique partiel~~ **livrés par `0003`, en un ALTER
  TABLE et un CREATE INDEX — le report a tenu exactement ce qu'il promettait.**
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
- ~~L'heure de bascule de la journée n'est **pas lue**.~~ **Faite en tranche 7**,
  et `currentLocalDate` a perdu son défaut au passage : sans ça, un site qui
  oublie le réglage répond minuit en silence, c'est-à-dire le mauvais jour.
- ~~Pas d'anneau de progression : il réclame `react-native-svg`.~~ **Livré en
  tranche 5, dessiné en vues.** Le raisonnement tenait sauf sur un point : svg
  est **natif**, et le premier écran qui le monterait est le Journal — donc
  l'application cesserait de s'ouvrir jusqu'à un cycle CI. Voir
  `progress-ring.tsx`. **Toujours pas réécrit après la tranche 7**, et c'est un
  renversement consigné : svg y est entré pour les graphiques, mais le porter
  sur l'anneau remettrait le natif sur l'écran d'accueil. Tranche 8.
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
- ~~Où vit le sélecteur segmenté de l'onglet Entraînement.~~ **Résolu, puis
  RENVERSÉ le 19/09/2026 — il y en a deux, et le §7 avait raison.** La
  tranche 10 avait refusé « un segmenté dans un segmenté » et fait de Routines
  et Exercices deux sections d'une même page (`specs §14.20` n° 2). L'objection
  n'a pas survécu au catalogue : avec cinq cents exercices, deux sections d'une
  page veut dire défiler par-dessus les routines pour atteindre un champ de
  recherche, à chaque fois. **Dès qu'une section est assez longue pour qu'on ne
  voie jamais l'autre, c'était déjà un onglet.** Musculation porte donc
  Exercices / Routines / Séances (`specs §14.35`), et seul le panneau choisi est
  monté — donc lit. L'onglet garde son propre `Stack`.
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
