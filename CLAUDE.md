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
Tranches 0 à 5 livrées. **La tranche 5 n'a pas encore tourné sur l'appareil** :
code complet, typé, 671 tests verts sous les trois fuseaux, bundle produit —
mais rien de son interface n'a été touché sur l'iPhone. À lire comme tel.

**Elle ne demande aucun cycle CI.** Aucune dépendance native n'entre, donc tout
se vérifie par Metro sur le binaire dev existant — l'inverse exact de la
tranche 4, où le scan imposait de reconstruire.

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
`0003_barcode_off_cache` et `0004_templates_planning`.
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
- **`autoFocus` + `selectTextOnFocus` fonctionnent ici**, là où la tranche 3
  avait constaté qu'ils ne sélectionnaient rien. La différence est la seule qui
  compte : la valeur vient de l'état local et existe **avant** le champ, donc
  on retombe dans le cas où la paire marche — focaliser un champ déjà rempli.

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

~~**Deux seuils de 10 % qui n'ont rien à voir.**~~ **Un seul désormais.**
`KCAL_OVERSHOOT_THRESHOLD` a été supprimé : la règle est passée à « une jauge
pleine est rouge », et la bande ambre entre l'objectif et 10 % au-delà n'avait
plus où vivre. `KCAL_DISCREPANCY_THRESHOLD`, qui vérifie la cohérence interne
d'un aliment (§5.1), reste — et le fait d'avoir refusé de les confondre est ce
qui a permis d'en retirer un sans toucher l'autre.

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

**Une jauge pleine est rouge, et la couleur change au moment où la forme se
ferme.** Un événement, dit deux fois, des deux façons dont un anneau peut dire
quoi que ce soit. Conséquence à connaître : l'anneau vire au rouge à **100 %
pile**, c'est-à-dire à l'objectif *atteint* et non manqué. Ça se lit « il ne
reste rien ». Si un jour ça se lit comme une erreur, le changement est une
comparaison — rouge juste *après* l'objectif plutôt qu'à l'objectif.

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
- **Le thème clair porte un accent à 2,13:1, et c'est une décision prise en
  connaissance de cause.** Chevrons, « Enregistrer », le glyphe du bouton
  d'ajout et la jauge y sont pâles. Rien ne casse ; tout est moins lisible. La
  sortie, si ça gêne, est une surface plus sombre derrière l'accent — jamais un
  vert plus sombre, qui est précisément ce qui a été refusé.
- **`carrot.fill`, `cup.and.saucer.fill`, `fork.knife` et `wineglass.fill` ne
  sont pas vérifiés sur l'appareil.** Tous sont des SF Symbols standards sous
  iOS 17, mais un nom absent rend un carré vide, pas une erreur.

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
- **Le taux d'adhérence de la tranche 7 devra exclure les journées sans
  objectif**, comme il exclut déjà celles sans entrée. Toute journée
  matérialisée avant `0004` est dans ce cas, définitivement, sauf action
  explicite de l'utilisateur.
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
- **Le générateur de jeu de démonstration ne crée aucun modèle.** Il produit des
  journées matérialisées sans objectif, donc le bandeau reste muet dessus. À
  rouvrir si la tranche 7 a besoin de données avec objectifs pour éprouver
  l'adhérence.
- **Deux piles natives déclarent les mêmes options d'en-tête**, celle du Journal
  et celle des Réglages. C'est le deuxième utilisateur, donc la règle du
  deuxième utilisateur est atteinte de justesse — mais le partage ferait un
  composant de quatre lignes d'options. Laissé tel quel ; le troisième tranchera.

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
- **Aucune purge du cache n'est appelée.** `sweepCache` existe, est testée, et
  n'a pas de site d'appel : il n'y a rien à balayer sur un téléphone qui ne
  sert pas, et la faire tourner pendant un scan dépenserait des millisecondes
  promises ailleurs. À brancher quand la table aura une taille observable —
  probablement au démarrage, après la migration.
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
- **L'instrumentation des quatre transitions du parcours critique (D16) n'existe
  toujours pas.** La cible des 5 s du scan est donc un vœu, pas une mesure —
  c'est le bon moment pour que ça cesse, la tranche 4 étant la première à faire
  du réseau sur le chemin critique.

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
- L'heure de bascule de la journée n'est **pas lue** : `currentLocalDate()`
  utilise le défaut de minuit. Son réglage et sa lecture arrivent tranche 7.
- ~~Pas d'anneau de progression : il réclame `react-native-svg`.~~ **Livré en
  tranche 5, dessiné en vues.** Le raisonnement tenait sauf sur un point : svg
  est **natif**, et le premier écran qui le monterait est le Journal — donc
  l'application cesserait de s'ouvrir jusqu'à un cycle CI. Voir
  `progress-ring.tsx`, à réécrire sur svg en tranche 7 derrière les mêmes props.
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
