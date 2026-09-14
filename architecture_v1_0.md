# Architecture technique — Application personnelle de suivi nutrition / entraînements / mesures

**Version du document :** 1.0
**Date :** 10/09/2026
**Specs de référence :** `specs_v2_2.md`
**Statut :** normatif — fait autorité pour toute la durée du développement

---

## 0. Mode d'emploi

Ce document est la référence d'architecture du projet. Il est destiné à être joint aux futures conversations de développement, avec les specs fonctionnelles v2.2.

**Ce qu'il contient :** les seize décisions d'architecture avec leur justification et les alternatives écartées, le schéma de données normatif, l'arborescence du projet, les conventions de code, les dépendances justifiées, les points ouverts assumés, et l'ordre de développement recommandé.

**Ce qu'il ne contient pas :** de code applicatif. Les extraits SQL sont là pour fixer une structure, pas pour être copiés tels quels.

**Le fil conducteur.** Trois contraintes commandent presque toutes les décisions ci-dessous, et il est utile de les avoir en tête pour comprendre pourquoi certaines options évidentes ont été écartées :

1. **Aucune compilation locale.** Toute dépendance native est un point de panne diagnosticable uniquement à travers un cycle CI de quinze minutes. Le projet minimise donc systématiquement la surface native, même au prix d'un peu plus de code écrit à la main.
2. **Aucune sauvegarde automatique.** Toute donnée perdue est perdue. Les décisions irréversibles ont été traitées en premier, et chaque opération destructive est protégée.
3. **Un seul utilisateur, sur un seul appareil, sans réseau structurant.** Beaucoup d'outils standards de l'écosystème mobile résolvent des problèmes de synchronisation et de latence réseau qui n'existent pas ici. Les adopter par réflexe aurait coûté de la complexité sans contrepartie.

---

## 1. Décisions d'architecture

### D1 — Boucle de développement : build de développement, Expo Go écarté

**Décision.** Développement sur un **build de développement** (`expo-dev-client`) compilé en CI et sideloadé, avec rechargement JavaScript par Metro. Expo Go n'est pas utilisé.

**Deux identifiants d'application distincts, donc deux installations :**

| Installation | Identifiant | Usage |
| --- | --- | --- |
| Développement | `…app.dev` | Base jetable, migrations régénérables librement |
| Quotidienne | `…app` | Vraies données, migrations en ajout seul |

**Le projet natif iOS n'est pas versionné** : il est régénéré par la CI à chaque build. La configuration Expo est l'**unique source de vérité** pour `Info.plist` et les entitlements. Aucun fichier natif n'est jamais modifié à la main.

**Pourquoi.** Expo Go impose une liste blanche de modules natifs : c'est l'outil de développement qui aurait arbitré le choix du moteur de stockage — une décision irréversible. Surtout, les données de test y vivent dans le bac à sable d'Expo Go : on validerait la persistance dans le mauvais conteneur, précisément le sujet où l'erreur n'est pas rattrapable. Enfin, les vraies inconnues du projet — survie du conteneur au rafraîchissement hebdomadaire, feuille de partage, trousseau — ne sont observables que dans une installation réelle.

**Alternatives écartées.** *Expo Go pour la V1* : contraint les dépendances, teste le mauvais environnement, et repousse la découverte du pipeline au moment où il devient critique. *Les deux en parallèle* : deux environnements qui divergent silencieusement.

**Coût assumé.** Toute dépendance native ajoutée coûte un cycle CI. Les ajouts natifs doivent être groupés.

---

### D2 — Persistance : SQLite via `expo-sqlite`, accès par Drizzle

**Décision.** SQLite, module `expo-sqlite`, accès et migrations par Drizzle ORM.

**Réglages normatifs :**

| Réglage | Valeur | Raison |
| --- | --- | --- |
| `journal_mode` | `WAL` | Les lectures ne bloquent pas les écritures ; une transaction validée survit à l'arrêt du processus |
| `synchronous` | `NORMAL` | En WAL, ne perd des transactions validées qu'en cas de crash **système**, pas d'arrêt forcé de l'app. La menace ici est l'arrêt forcé |
| `foreign_keys` | `ON` | Les règles de figeage reposent sur des liens vrais ou explicitement rompus |
| Connexion | Une seule en écriture | Évite toute concurrence d'écriture |

Toute opération touchant plusieurs lignes s'exécute **dans une transaction explicite**.

**Le dossier de données est exposé dans l'app Fichiers.** Un bouton « préparer une copie » consolide la base (checkpoint WAL) avant toute copie manuelle, sans quoi la copie serait incomplète.

**Pourquoi.** Le modèle est relationnel et les écrans sont des agrégations par plage de dates : c'est exactement la question à laquelle SQL répond. La persistance continue de la séance en direct (§10.3) est une insertion de ligne, pas une réécriture de document. Et `expo-sqlite` est maintenu par Expo, ce qui compte quand on ne peut pas déboguer une compilation native.

Drizzle apporte trois choses décisives : des migrations SQL générées, versionnées et relisibles ; une intégration directe avec `expo-sqlite` ; et **aucune surface native** — il ne peut donc pas casser une compilation.

**Alternatives écartées.** *Clé-valeur + documents JSON* : aucune transaction, aucune requête par plage, chargement complet en mémoire pour agréger, et une écriture interrompue laisse un document tronqué. *WatermelonDB* : conçu pour la synchronisation et les très gros volumes, ni l'un ni l'autre ici. *Realm* : abandonné par son éditeur. *`op-sqlite`* : plus rapide, mais dépendance tierce pour un gain invisible à ces volumes.

---

### D3 — Dates : la date civile est la clé métier

**Décision.** Une journée est une **date civile locale**, stockée en `TEXT` au format `AAAA-MM-JJ`. Les instants UTC (millisecondes epoch) sont réservés aux traces techniques — création, modification — et aux durées réelles.

> **Règle absolue.** Un instant UTC ne sert **jamais**, dans aucun cas, à recalculer l'appartenance d'une donnée à une journée.

**Corollaires normatifs :**

- Aucune date civile ne transite par le constructeur `Date` natif. `new Date("2026-09-10")` est interprété comme minuit **UTC** et donne le 9 septembre dans tout fuseau à l'ouest de Greenwich. Un module de dates civiles dédié, en fonctions pures, est le seul point d'entrée autorisé.
- La semaine commence le **lundi**.
- Une séance à cheval sur minuit appartient à sa **date de début** ; sa durée se calcule sur des instants, jamais sur des heures civiles.
- Naviguer entre les jours ne matérialise jamais une journée.
- En V4, une activité prend la **date locale fournie par la source**.
- L'heure de bascule de la journée est réglable (0h–6h, défaut minuit) et ne détermine que la **date proposée par défaut**. Une **fonction unique** de journée courante sert toute l'application, y compris les conditions de notification.

**Pourquoi `TEXT` plutôt qu'un entier.** Le format se trie alphabétiquement dans l'ordre chronologique, s'indexe, se compare par plage en SQL — et reste **lisible à l'œil nu dans un export JSON**. Le jour où le filet de sécurité doit être inspecté à la main, on ne veut pas y lire `20342`.

**Alternative écartée.** *Stocker un instant et dériver la date locale* : l'appartenance d'un repas à une journée deviendrait fonction du fuseau courant. Un voyage réécrirait rétroactivement l'historique — exactement ce que le principe de figeage interdit. Rien ne planterait ; rien ne se verrait.

---

### D4 — Identifiants, nombres, normalisation

**Identifiants : textuels, triables par date de création** (ULID ou UUID v7), générés par l'application, jamais par la base.
*Pourquoi :* les identifiants voyagent dans l'export. Avec des entiers attribués par la base, toute fusion ultérieure produit des collisions silencieuses, et l'option est fermée d'avance. C'est de l'optionalité gratuite sur une décision irréversible. Générateurs en JavaScript pur, aucune dépendance native.

**Nombres : flottants double précision partout**, arrondis uniquement à l'affichage.
*Pourquoi :* un domaine qui tolère 10 % d'écart sur les kcal (§5.1) n'a aucun besoin d'arithmétique exacte au centième. Des entiers mis à l'échelle coûteraient une conversion à chaque lecture et chaque écriture — donc une classe de bugs permanente — pour corriger une erreur d'accumulation à la treizième décimale.

**Macros : forme canonique pour 100 unités de base.**
La quantité de référence saisie par l'utilisateur est conservée comme **préférence d'affichage**, sans valeur normative.
*Pourquoi :* tout calcul devient une multiplication unique ; les données Open Food Facts se rangent sans conversion ; le dédoublonnage par code-barres compare deux fiches directement.
*Coût assumé :* la valeur réaffichée est un aller-retour, pas la saisie littérale. Invisible avec un affichage à une décimale.

---

### D5 — Figeage : quatre règles normatives

**R1 — Une entrée de journal fige la référence, pas le total.**
Elle porte : nom, marque, unité de base, **macros pour 100 unités**, quantité, unité, et la portion utilisée le cas échéant. Le total consommé n'est jamais stocké : il se déduit.
*Pourquoi :* c'est ce qui rend l'édition sans limite de temps (§5.3) réellement tenable. Une entrée devient une capsule close qui ne consulte plus jamais la base d'aliments — donc « les entrées passées demeurent intactes » vaut aussi en écriture, pas seulement en lecture.

**R2 — Seules les feuilles portent des macros.**
Une entrée de type recette est un parent **vide** — nom, quantité consommée, état replié — et des lignes d'ingrédient qui portent tout. Toute somme est une somme de feuilles.
*Pourquoi :* si parent et enfants portaient des macros, une agrégation qui oublie une clause de filtrage compterait le repas en double. Le double comptage devient **structurellement impossible** plutôt que conditionnellement évité.
*Astuce d'uniformisation :* une saisie libre est modélisée comme 100 unités d'un aliment virtuel dont les macros pour 100 sont les valeurs saisies. Aucun cas particulier dans les agrégations.

**R3 — Le figeage à la suppression est atomique.**
Chaque ligne d'ingrédient porte en permanence des colonnes de gel vides et un lien vers l'aliment. La suppression d'un aliment remplit ces colonnes et rompt le lien **dans une transaction unique**. Un arrêt forcé au milieu laisse la base dans l'état d'avant.
*Distinction voulue :* **modifier** un aliment met à jour les recettes (objet vivant, §8.6) ; seule la **suppression** gèle.

**R4 — Journée et séance sont des snapshots ; l'exercice fait exception.**
Une journée copie les repas du modèle avec leurs objectifs ; les objectifs du jour sont la **somme**, jamais stockée. Une séance copie les blocs et lignes de la routine.
**Mais une séance conserve un lien vivant vers l'exercice** — sans quoi les graphiques, records et règles de progression (§10.1, §10.4) ne pourraient plus recoudre des séances étalées sur des années. C'est la seule exception au figeage, et elle impose l'avertissement de suppression du §5.3.

---

### D6 — Migrations : quatre garde-fous

**Décision.** Migrations SQL générées par `drizzle-kit`, versionnées dans le dépôt, appliquées au démarrage.

**Le mécanisme doit être opérationnel dans le tout premier build installé**, l'application portant de vraies données dès la deuxième semaine.

**G1 — Sauvegarde automatique avant toute migration.** Si des migrations sont en attente, l'application consolide la base et copie le fichier dans le dossier `Documents` — celui qui est visible dans l'app Fichiers. Rotation sur les deux ou trois dernières copies. C'est la mesure la plus rentable de toute l'architecture.

**G2 — Une migration livrée ne se modifie plus jamais.** Sur l'installation de développement, écraser et régénérer librement. **Le jour où la première donnée réelle est saisie sur l'installation quotidienne, la migration initiale est gelée.** Ensuite : ajout seul.

**G3 — Refus de démarrer sur une base plus récente que le binaire.** Un retour à un build antérieur — ce qui arrivera — ferait écrire un binaire de V1 dans des tables de V2. L'application détecte et refuse, avec un message qui **nomme le fichier de sauvegarde et indique où le récupérer**.

**G4 — Les migrations se testent en CI, sans iPhone.** Un travail qui rejoue toutes les migrations sur une base peuplée puis applique la nouvelle attrape l'essentiel des erreurs en trente secondes au lieu de quinze minutes plus un cycle de sideloading.

**Précisions.** Chaque migration embarque son remplissage de données dans la même transaction. Les contraintes de clés étrangères sont désactivées pendant les reconstructions de table, procédure que SQLite impose pour toute modification de colonne.

**Alternatives écartées.** *Runner écrit à la main* : contrôle total, mais on écrit soi-même les reconstructions de table en douze étapes. *Recréer la base et réimporter un export* : fait dépendre la survie d'un fichier produit avant la mise à jour, donc d'un geste manuel.

---

### D7 — Export / import

**Format : plat, un tableau par entité**, calqué sur les tables. En-tête portant version de format, version de schéma, version applicative et horodatage. **Non compressé et indenté.** Nom de fichier daté et triable.
*Pourquoi plat :* la restauration devient mécanique. Au moment où l'on importe, on est déjà en situation de perte : on ne veut pas d'un algorithme de reconstruction, on veut une boucle bête qui ne peut pas se tromper.
*Pourquoi non compressé :* un filet de sécurité qu'on ne peut pas ouvrir dans un éditeur de texte pour le réparer à la main n'en est pas tout à fait un.

**Mécanique d'import : construire à côté, valider, basculer à la fin.**
Jamais d'effacement préalable. Une base neuve est construite dans un fichier temporaire, validée intégralement, et seule la bascule finale remplace la base courante. Un arrêt forcé ne laisse qu'un fichier temporaire à nettoyer au démarrage suivant.

**Trois barrières de validation, toutes avant la bascule :** version de format incompatible refusée ; validation structurelle complète de la charge utile ; vérification d'intégrité référentielle.

**Remplacement total uniquement.** Aucune fusion. Les identifiants globalement uniques (D4) laissent l'option ouverte sans changer les données.

**Versions découplées.** La version de format d'export est distincte de la version interne de schéma : renommer une colonne ne doit pas invalider les archives. Une table de correspondance explicite relie les deux.

**Exclusions.** Le cache Open Food Facts (reconstructible). Les médias d'exercices (fichiers, non données) — couverts uniquement par la copie manuelle du dossier de données. **Un média absent affiche un substitut ; l'application ne plante jamais pour cette raison.**

---

### D8 — État et couche d'accès

**Décision.** **TanStack Query** comme couche de requête unique — locale et réseau — avec **invalidation pilotée par la base**, jamais écrite à la main.

Un abonnement unique aux changements de tables, écrit une fois, traduit « table modifiée » en « clés de requête invalidées », avec un léger regroupement temporel. Aucune liste d'invalidation n'est maintenue manuellement.

**Pourquoi ce compromis plutôt que des requêtes vives pures.** Une requête vive se rejoue **inconditionnellement** dès que sa table change : pendant une séance de musculation, où une ligne est écrite à chaque série, un tableau de bord ouvert ailleurs se recalculerait des dizaines de fois. TanStack apporte les leviers qui manquent — durée de fraîcheur, conservation de la valeur précédente pendant un recalcul, contrôle du moment où une agrégation lourde se réévalue. C'est ce qui rend la stratégie de D9 tenable.

**Pourquoi pas un cache à invalidation manuelle.** Une quarantaine d'écritures, chacune devant énumérer les requêtes à rafraîchir. Un oubli ne casse rien : un écran affiche simplement une valeur d'hier. Dans une application de suivi, douter des chiffres, c'est arrêter de s'en servir.

**Pourquoi pas de magasin global miroir.** Deux vérités à tenir d'accord, et un magasin volatilisé au premier arrêt forcé — c'est-à-dire toutes les semaines. Conséquence heureuse : le bandeau persistant de séance (§10.3) est une simple requête, donc **juste après un arrêt forcé**.

**Couche d'accès : fine, découpée par domaine, à deux faces.**
Les **lectures** sont des hooks. Les **écritures** sont des fonctions transactionnelles portant les règles métier.

*Ce à quoi elle ne sert pas :* à pouvoir changer de base de données. Personne ne change de base de données.
*Ce à quoi elle sert :* à rendre les invariants incontournables. Matérialisation d'une journée, figeage, transaction de suppression — si un écran peut écrire directement dans les tables, un jour il le fera et oubliera une règle. Bénéfice secondaire réel : ces fonctions se testent dans Node, sans iPhone et sans CI.

---

### D9 — Stocké contre recalculé

> **Règle : rien de dérivable n'est stocké.**

**Figé n'est pas dérivé.** Une donnée figée est une **entrée capturée** à un instant ; elle est stockée, et c'est légitime. Une donnée dérivée est une fonction de l'état courant ; elle ne l'est jamais.

**Systématiquement recalculés :** objectifs du jour, restants, totaux de journée, kcal théorique et son écart de 10 %, poids lissé, rythme réel, taux d'adhérence, volume, 1RM d'Epley, records personnels, suggestion de double progression, allure d'une activité, durée d'une séance.

**Où vivent les calculs — trois niveaux, et rien entre les deux :**

| Niveau | Contenu |
| --- | --- |
| **SQL** | Sommes, comptages, regroupements par plage de dates |
| **Fonctions pures TypeScript** | Epley, moyenne mobile, régression, adhérence, double progression, arrondis. Ne connaissent ni la base ni React |
| **Composants** | **Rien.** Aucun calcul métier dans le rendu |

**Performance des longs historiques : recalculer et mettre en cache le résultat, pas le stocker.**
Si une vue dépasse deux ou trois dixièmes de seconde, la parade est une table de résumé quotidien maintenue par la couche d'accès. **Elle n'est pas écrite maintenant** : c'est de la donnée dérivée, donc reconstructible à tout moment. Contrairement à tout le reste, ce report ne coûte rien.

**Règles d'agrégation normatives :**
- Toute valeur quotidienne s'agrège **par moyenne**. La somme n'est licite que pour les compteurs.
- Regroupement par **semaine au-delà de 90 jours**, par **mois au-delà d'un an**.

---

### D10 — Structure du projet et navigation

**Routage : expo-router.** Voie par défaut d'Expo, maintenue et documentée. Barre à quatre onglets fixes et modale plein écran y sont des cas de première classe.

**Organisation : par domaine.** Nutrition, poids, musculation, activités, sauvegarde, réglages — chacun refermant ses écrans, ses composants, ses règles et ses accès aux données.
*Pourquoi :* par type, la V3 fait ajouter des fichiers dans huit dossiers et mélange les règles de musculation à celles de nutrition. Par domaine, la V3 est un dossier neuf.

> **Règle qui rend les deux compatibles :** le dossier de routes ne contient **que du câblage**. Un fichier de route déclare son titre, ses options d'écran, et affiche un composant importé du domaine. Jamais de logique, jamais de requête.

> **Règle du noyau partagé :** un composant ne migre vers le noyau qu'à son **deuxième utilisateur réel**, jamais par anticipation.

**Sous-sections de l'Entraînement : sélecteur segmenté** dans un écran unique, pas de navigateur imbriqué. Évite un état de navigation à deux niveaux.

**Interface : aucune bibliothèque de composants.**
Les écrans les plus importants sont tous sur mesure — anneau de progression, rangée de RIR, balayage pour supprimer, bandeau de séance. Une bibliothèque n'en offre aucun mais impose son apparence, son système de thème et sa cadence de mises à jour.
**NativeWind est également écarté**, plus douloureusement : il ajoute une étape dans Metro et Babel, donc un point de panne dans une chaîne de compilation qu'on ne peut pas déboguer localement.
À la place : styles natifs et une petite couche de **jetons** — couleurs, espacements, typographies — dérivée du thème clair/sombre/système.

**Aucune bibliothèque d'internationalisation.** L'interface est en français uniquement. Les chaînes restent dans le domaine qui les utilise.

---

### D11 — Client Open Food Facts

**Contrainte externe constatée au 10/09/2026 :** 15 requêtes/minute et par adresse IP pour les consultations de produit, 10/minute pour les recherches, en-tête d'identification personnalisé obligatoire, et proscription explicite de la recherche au fil de la frappe.

**Recherche à déclenchement explicite.** Les résultats personnels s'affichent instantanément à chaque frappe ; la requête distante ne part qu'à la validation, et ses résultats s'ajoutent en dessous — ce qui respecte l'ordre imposé par le §8.4.
*L'asymétrie est la clé :* la base locale peut répondre à chaque frappe, la source distante non. Les deux ne sont pas interrogées au même rythme, alors même que leurs résultats partagent une liste.

**Le scan n'est pas concerné :** consultation de produit, plafonnée à quinze par minute, jamais deux d'affilée. La cible des cinq secondes tient.

**Cache.** Table dédiée dans la même base — même transaction, même sauvegarde, même migration — mais **exclue de l'export**. Seules les consultations par code-barres sont mises en cache durablement, 30 jours, rafraîchissement opportuniste. Les recherches textuelles ne sont cachées qu'en mémoire. **Chaque requête restreint explicitement les champs demandés.**

**Échecs.** Délai d'attente court, une seule nouvelle tentative, repli silencieux sur le local avec bandeau discret. **Exception : un dépassement de quota n'est pas une panne réseau.** Il suspend les appels distants plusieurs minutes avec un message explicite, sous peine de bannissement par adresse IP.

**[tranche 4] Ce que l'API fait réellement, constaté le 13/09/2026 et non lu.** Huit requêtes à l'API publique. Sept constats, dont quatre ont changé la conception :

| № | Constat | Conséquence |
| --- | --- | --- |
| 1 | Une consultation répond **HTTP 200** que le produit existe ou non ; « introuvable » est `status: 0` dans le corps | Le 404 n'est pas le signal |
| 2 | `fields=` restreint jusqu'au nutriment individuel, sur la consultation | D11 « restreint explicitement » est tenable au niveau fin |
| 3 | **`nutriments_estimated` revient qu'on le demande ou non**, volumineux, et il est rempli précisément quand les nutriments déclarés manquent | Champ le plus dangereux de la réponse : il comblerait exactement les trous censés faire basculer vers le formulaire. Il n'est pas dans le schéma, donc il ne peut pas être lu par accident |
| 4 | `brands` est une **chaîne** en consultation, un **tableau** en recherche | La normalisation absorbe les deux |
| 5 | Un résultat de recherche peut ne porter que **`energy-kj_100g`** là où la consultation fournit `energy-kcal_100g`, calculé côté serveur | **Un résultat de recherche ne suffit pas à construire un aliment** : le choisir déclenche une consultation par code-barres |
| 6 | `cgi/search.pl` et `/api/v2/search` répondent par une **page HTML** d'indisponibilité sous un 200 ; seul `search.openfoodfacts.org/search?q=` fait une vraie recherche texte | **Deux hôtes.** Et une réponse illisible est un cas réel, pas théorique |
| 7 | **Aucun en-tête de quota** n'est renvoyé | Le quota restant est inconnaissable : le limiteur est aveugle et le 429 est l'unique signal |

**[tranche 4] Le limiteur est en deux morceaux, et un seul est persisté.** La fenêtre glissante d'une minute vit en mémoire — elle expire en soixante secondes, et la persister coûterait une écriture SQLite par requête réseau. La suspension consécutive à un 429 va dans `setting`, clé `off_suspended_until` : c'est le seul état dont la perte a un coût hors du téléphone, et le §2.2 exige de survivre à un arrêt forcé à tout moment. Une échéance plus lointaine qu'une heure est lue comme expirée, parce qu'une horloge reculée suspendrait sinon l'application indéfiniment.

**[tranche 4] La retry unique n'est pas dépensée sur un délai d'attente.** Un timeout a déjà reçu toutes les millisecondes qu'on était prêt à attendre ; réessayer double une attente déjà jugée trop longue, sur un parcours budgété à cinq secondes. Un refus immédiat, lui, n'a rien coûté et est la panne la plus probablement passagère.

**Qualité des données.** Champs manquants signalés ; écart kcal supérieur à 10 % signalé ; valeurs physiquement impossibles marquées. **L'absence d'un seul des quatre macros** fait basculer sur la création d'un aliment personnel **pré-rempli** de tout ce qui a été fourni.

---

### D12 — Séance en direct

**Granularité d'écriture — deux rythmes.**
Écriture **immédiate et synchrone** à la validation d'une série (saisie du RIR). Écriture **différée d'une fraction de seconde** pour les champs en cours de frappe.

> **Point non négociable :** toute écriture différée est **vidée au passage en arrière-plan**. C'est le moment précis où iOS peut tuer l'application sans préavis.

**Minuteurs : aucun compteur n'est stocké.** On stocke l'instant de départ, la durée se déduit. Seule forme qui survive à un arrêt forcé, à une mise en arrière-plan et à un changement d'heure.
Le minuteur de repos ne pouvant pas sonner sans exécution en arrière-plan, il est réalisé par une **notification locale unique**, annulée à la validation de la série suivante.

**Séance unique : invariant porté par la base**, via un index unique partiel — pas par une vérification applicative, qu'un écran distrait ou une condition de course peut contourner.

**Durée : temps actif par segments.** Un segment se ferme après 30 minutes sans écriture. **Les segments sont stockés, la durée s'en déduit** — conforme à D9, et le seuil reste ajustable sans réécrire l'historique. Aucune question supplémentaire n'est posée à la reprise, celle-ci étant déjà proposée par le §10.3.

---

### D13 — Rendu graphique

**Décision.** Composants maison sur `react-native-svg`, échelles et tracés calculés avec `d3-scale` et `d3-shape`.

**Le vrai enjeu est en amont.** L'écran fait 390 points de large : afficher trois ans de poids, c'est dessiner mille valeurs sur quatre cents pixels. **Le nombre de points arrivant au graphique se règle en SQL**, par agrégation (D9), pas dans la bibliothèque de rendu. Aucun graphique ne dépasse alors deux cents points, et le choix de la bibliothèque cesse d'être une question de performance.

**Pourquoi maison.** Trois écrans clés superposent des séries de natures différentes sur des axes différents (§9.2, §9.4, §10.6) — exactement là où les bibliothèques génériques se battent contre vous. **Zéro surface native**, cohérent avec le fil conducteur du projet. Et le même outil sert la **carte corporelle**, qui est un SVG dont on colore les tracés : un seul outil graphique dans tout le projet.

*Coût assumé :* axes, graduations et légendes écrits à la main. Une journée pour le premier graphique, une heure pour chaque suivant. **Décision réversible**, contrairement à presque tout le reste.

**Alternatives écartées.** *victory-native sur Skia* : soigné et rapide, mais grosse dépendance native. *Bibliothèque JavaScript clés en main* : les graphiques les plus importants sont hors de sa zone de confort.

**Interactions.** Pas de zoom ni de déplacement au doigt — doublon avec les sélecteurs de plage. Une seule interaction : **toucher un point affiche sa valeur et sa date**.

---

### D14 — Notifications locales

**Contrainte structurante.** iOS déclenche les notifications **sans exécuter le code de l'application**. Les conditions du §9.3 ne peuvent donc pas être évaluées au déclenchement.

**Décision : replanification permanente.** L'application programme les prochaines occurrences uniquement si la condition est encore non satisfaite, et **annule** dès qu'elle le devient.

*Pourquoi c'est fiable ici :* quand l'utilisateur saisit son poids, **l'application tourne**. Elle peut donc annuler. Il n'existe aucune source extérieure susceptible de satisfaire une condition dans le dos de l'application.

**Mécanique :**
- Planification anticipée sur **7 jours**, reprogrammée à chaque passage au premier plan.
- Les rappels **s'épuisent d'eux-mêmes** si l'application n'est pas ouverte sept jours — durée qui coïncide avec celle du certificat SideStore.
- Le **bilan de fin de journée est reprogrammé à chaque écriture concernant la date du jour**, de façon groupée, faute de quoi ses chiffres seraient ceux du matin. Une écriture sur une date passée ne le reprogramme pas.
- **Plafond iOS de 64 notifications en attente** : déclencheurs répétitifs préférés partout où c'est possible.
- Autorisation demandée **à l'activation dans les Réglages**, jamais au premier lancement — un refus au démarrage est définitif.

**Alternatives écartées.** *Tâches d'arrière-plan* : iOS décide seul quand, parfois jamais ; et après l'échec du test B, miser sur une capacité que la signature pourrait raboter serait imprudent. *Notifications inconditionnelles* : c'est renoncer à ce que les specs demandent.

---

### D15 — Stratégie de test

> **Critère de tri : un bug qui se voit à l'écran ne mérite pas de test.** L'application est ouverte plusieurs fois par jour. Ce qui mérite des tests, c'est ce qui produit un résultat **plausible mais faux**.

**Par valeur décroissante :**

1. **L'aller-retour export puis import.** Peupler, exporter, importer dans une base vide, vérifier l'égalité. Protège à lui seul l'unique filet de sécurité. **Si un seul test est écrit dans tout le projet, c'est celui-là.**
2. **Les migrations** (G4 de D6).
3. **Le module de dates civiles, sous plusieurs fuseaux** — dont un à l'ouest de Greenwich et un au-delà de +12. Seul moyen de faire apparaître une classe de bugs invisible depuis Paris en hiver.
4. **Les fonctions pures de calcul.** Rapides à écrire, et leurs sorties ne se vérifient pas à l'œil.
5. **Les invariants de la couche d'accès**, contre un vrai fichier SQLite dans Node.

**Explicitement hors périmètre :** les composants d'interface (coûteux, fragiles, redondants avec l'usage quotidien) et les tests de bout en bout — **Detox réclame un simulateur, donc un Mac. Ce n'est pas un arbitrage, c'est une impossibilité.**

**Ce qui remplace des tests à moindre coût :** TypeScript strict avec **types marqués** pour la date civile et les identifiants, de sorte qu'une date civile ne puisse jamais être passée là où on attend un instant. Et **validation stricte aux deux frontières d'entrée** : import JSON et réponses Open Food Facts.

**Outil à écrire en tranche 1 : un générateur de jeu de données de démonstration.** Il sert quatre fois — tester les migrations, vérifier les performances sur historiques longs, peupler l'installation de développement, reproduire un bug sans exposer les vraies données.

**Dépôt public.** Le code ne contient aucun secret : la clé intervals.icu vit dans le trousseau, jamais dans le dépôt. Cela supprime la contrainte de minutes de CI, autrement la plus pénible du projet. Deux règles : **aucun export réel ne rejoint jamais le dépôt**, et le jeu de données de développement est **généré**, jamais copié.

---

### D16 — Performance

**Décomposition de la cible des 15 secondes :**

| Étape | Budget |
| --- | --- |
| Démarrage à froid jusqu'au restant lisible | 1,5 s |
| Ouverture de la modale d'ajout | 0,3 s |
| Sélection d'un aliment → écran de quantité | 0,2 s |
| Validation → retour au Journal à jour | 0,3 s |
| **Total technique** | **≈ 2,5 s** |

> Les douze secondes et demie restantes sont humaines. **La cible ne se tient pas en optimisant du code, elle se tient en supprimant des gestes.** Le facteur limitant est le nombre de touchers, jamais la base de données.

**Règles :**
- Rien de lourd au lancement : ouverture de la base, vérification de version, affichage. Repas repliés par défaut. Bandeau de restant servi par **une requête agrégée unique**, pas par le chargement de toutes les entrées.
- **Listes natives standard**, pas de bibliothèque de liste spécialisée : quelques centaines de lignes au maximum.
- **Recherche locale par index simple**, sans moteur plein texte. Le plein texte est une option de repli, à activer **sur mesure, pas sur intuition**.
- **Index normatifs** sur tout ce qui est interrogé par plage de dates (voir §2).
- **Instrumentation en développement** des quatre transitions du parcours critique. Sans mesure, une cible de performance n'est qu'un vœu.

**Le levier principal, inscrit aux specs :** quantité **pré-remplie** avec la dernière consommée pour cet aliment, clavier numérique ouvert, valeur sélectionnée. Un aliment habituel se logue en deux touchers.

---

## 2. Schéma de données normatif

Conventions : identifiants `TEXT` (ULID), dates civiles `TEXT AAAA-MM-JJ`, instants `INTEGER` (ms epoch), montants `REAL`, booléens `INTEGER 0/1`. Colonnes en `snake_case`.

Toutes les tables portent `created_at` et `updated_at` sauf mention contraire.

### 2.1 Noyau

```sql
-- Réglages : clé-valeur, pour éviter une migration par préférence ajoutée
setting(key TEXT PRIMARY KEY, value TEXT NOT NULL)
-- clés : theme, day_cutoff_hour, adherence_tolerance_pct, default_template_id,
--        last_export_at, progression_increment_default_kg,
--        intervals_sync_frequency, export_reminder_days
```

### 2.2 Nutrition (V1)

```sql
-- [tranche 3] Livré par 0002_food. `barcode` et ux_food_barcode ont été DIFFÉRÉS
-- en tranche 4, avec le scan : une migration porte ce qui ne peut pas être
-- ajouté plus tard, et diffère ce qui le peut. SQLite sait ALTER TABLE ADD
-- COLUMN (nullable, ou NOT NULL avec défaut) et CREATE/DROP INDEX ; il ne sait
-- pas ajouter une CHECK ni une FK sans reconstruire la table. `source` est donc
-- là trois tranches avant son premier utilisateur, `barcode` non.
-- [tranche 4] Le pari est encaissé : 0003 est un ALTER TABLE et un CREATE INDEX
-- sur une table qui porte de vraies données, sans rien reconstruire.
food(
  id TEXT PK,
  name TEXT NOT NULL,
  source TEXT NOT NULL,            -- CHECK ck_food_source : 'perso' | 'off'
  base_unit TEXT NOT NULL,         -- CHECK ck_food_base_unit : 'g' | 'ml'
  brand TEXT,
  barcode TEXT,                    -- [tranche 4] nullable, SANS CHECK
  protein_100 REAL NOT NULL,       -- forme canonique, pour 100 unités de base
  carbs_100   REAL NOT NULL,
  fat_100     REAL NOT NULL,
  kcal_100    REAL NOT NULL,       -- valeur source, jamais recalculée
  display_ref_qty REAL NOT NULL DEFAULT 100,  -- préférence d'affichage
  is_favorite INTEGER NOT NULL DEFAULT 0,     -- CHECK ck_food_favorite : 0 | 1
  created_at INTEGER, updated_at INTEGER
)
-- NOCASE, sinon 'abricot' se classe après toutes les majuscules. Sert le
-- ORDER BY et NON la recherche : LIKE '%x%' n'utilise aucun index, et même en
-- préfixe celui-ci serait ignoré, la collation ne correspondant pas au réglage
-- case_sensitive_like. La recherche est une fonction pure sur une liste en
-- cache — seul moyen d'ignorer les accents sans stocker une colonne repliée.
CREATE INDEX ix_food_name ON food(name COLLATE NOCASE);

-- [tranche 4] Un aliment par code-barres : c'est ce qui fait du dédoublonnage
-- du §8.5 une garantie de la base plutôt qu'une discipline d'écran. PARTIEL, et
-- la clause est de la documentation plus que de la mécanique — SQLite traite
-- déjà les NULL comme distincts, donc tout aliment sans code-barres coexiste de
-- toute façon ; elle dit l'intention et limite l'index aux lignes concernées.
--
-- Ce qu'un unique réintroduit, et comment on y répond : c'est la première chose
-- de cette table qui puisse faire échouer un INSERT, alors que la tranche 3
-- avait écarté toute CHECK sur les macros pour que la copie automatique ne
-- puisse jamais échouer. Deux produits peuvent partager un EAN, et le même
-- produit logué deux fois entrerait en collision avec lui-même. La réponse
-- n'est pas de renoncer à l'index : le chemin de copie lit par code-barres et
-- réutilise, dans sa transaction, au lieu d'insérer à l'aveugle.
CREATE UNIQUE INDEX ux_food_barcode ON food(barcode) WHERE barcode IS NOT NULL;

-- AUCUNE CHECK sur les macros, et c'est un refus : le §8.5 exige que les
-- valeurs Open Food Facts soient signalées et éditables, jamais refusées, et la
-- tranche 4 copie automatiquement dans cette table. Une contrainte y
-- transformerait une anomalie signalable en échec d'INSERT.

food_portion(
  id TEXT PK,
  food_id TEXT NOT NULL REFERENCES food(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- liste fermée (§6.1), SANS CHECK — voir ci-dessous
  quantity REAL NOT NULL,          -- CHECK ck_portion_quantity : > 0
  position INTEGER NOT NULL
)
CREATE UNIQUE INDEX ux_portion_food_name ON food_portion(food_id, name);

-- [tranche 3] Où l'on pose une CHECK, et où l'on refuse d'en poser une. La
-- ligne n'est pas la probabilité qu'un ensemble bouge, c'est ce qu'un
-- élargissement casserait. Élargir `kind` casse l'invariant d'agrégation ;
-- élargir `base_unit` casse l'étanchéité du §5.1 ; élargir le vocabulaire des
-- portions ne casse rien. La liste fermée des huit noms est donc tenue par une
-- règle `one_of` du catalogue d'export, appliquée avant la première insertion,
-- qui nomme table, ligne et colonne au lieu de citer une contrainte — la
-- barrière forte, D7 voulant un fichier réparable à la main.

recipe(
  id TEXT PK, name TEXT NOT NULL, prep_minutes INTEGER,
  yield_type TEXT NOT NULL,        -- 'portions' | 'weight'
  yield_value REAL NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER, updated_at INTEGER
)

recipe_tag(recipe_id TEXT, tag TEXT, PRIMARY KEY(recipe_id, tag))
recipe_step(id TEXT PK, recipe_id TEXT NOT NULL, position INTEGER, text TEXT)

recipe_ingredient(
  id TEXT PK,
  recipe_id TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  food_id TEXT REFERENCES food(id),   -- NULL une fois gelé
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  -- colonnes de gel : vides tant que le lien existe (D5/R3)
  frozen_name TEXT, frozen_base_unit TEXT,
  frozen_protein_100 REAL, frozen_carbs_100 REAL,
  frozen_fat_100 REAL, frozen_kcal_100 REAL,
  frozen_at INTEGER
)
CREATE INDEX ix_ingredient_food ON recipe_ingredient(food_id);
```

### 2.3 Objectifs, planning, journal (V1)

```sql
day_template(id TEXT PK, name TEXT NOT NULL, created_at, updated_at)

day_template_meal(
  id TEXT PK, template_id TEXT NOT NULL REFERENCES day_template(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, name TEXT NOT NULL,
  target_protein REAL, target_carbs REAL, target_fat REAL, target_kcal REAL
)

planning_weekday(weekday INTEGER PK, template_id TEXT NOT NULL)  -- 1 = lundi
planning_override(date TEXT PK, template_id TEXT NOT NULL)

-- Une journée n'existe que matérialisée (§8.2)
day(
  date TEXT PK,                       -- date civile
  template_id_snapshot TEXT,          -- informatif, sans lien vivant
  template_name_snapshot TEXT,
  materialized_at INTEGER NOT NULL
)

day_meal(
  id TEXT PK, date TEXT NOT NULL REFERENCES day(date) ON DELETE CASCADE,
  position INTEGER NOT NULL, name TEXT NOT NULL,
  target_protein REAL, target_carbs REAL, target_fat REAL, target_kcal REAL
)
CREATE INDEX ix_day_meal_date ON day_meal(date);

journal_entry(
  id TEXT PK,
  day_meal_id TEXT NOT NULL REFERENCES day_meal(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                 -- dénormalisé : immuable, rend les stats index-only
  parent_entry_id TEXT REFERENCES journal_entry(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,                 -- CHECK ck_entry_kind [tranche 1]
  -- Informatif, SANS LIEN VIVANT, et sans clé étrangère possible : un cascade
  -- détruirait l'historique et un restrict bloquerait une suppression que le
  -- §5.3 dit n'être jamais bloquée — et la table est gelée depuis 0001, or
  -- SQLite n'a pas d'ALTER TABLE ADD CONSTRAINT. Conséquence actée : la
  -- vérification d'intégrité de l'import ne verra jamais une entrée pointant
  -- vers un aliment supprimé. C'est la spécification, pas un trou.
  source_food_id TEXT,
  source_recipe_id TEXT,
  -- capsule figée (D5/R1) — NULL sur un parent 'recipe' (D5/R2)
  name TEXT NOT NULL, brand TEXT,
  base_unit TEXT, quantity REAL,      -- CHECK ck_entry_base_unit [tranche 1]
  portion_name TEXT, portion_quantity REAL,
  protein_100 REAL, carbs_100 REAL, fat_100 REAL, kcal_100 REAL,
  created_at INTEGER, updated_at INTEGER
)
CREATE INDEX ix_entry_date ON journal_entry(date);
CREATE INDEX ix_entry_meal ON journal_entry(day_meal_id);
CREATE INDEX ix_entry_parent ON journal_entry(parent_entry_id);
CREATE INDEX ix_entry_source_food ON journal_entry(source_food_id, created_at);
```

> **Invariant d'agrégation :** toute somme de macros porte sur les lignes **sans enfant**. Un parent `recipe` a ses colonnes de macros à `NULL`. Une saisie libre est modélisée en `quantity = 100`, `base_unit = 'g'`, macros pour 100 = valeurs saisies.

### 2.4 Cache Open Food Facts (V1, hors export)

```sql
off_cache(
  barcode TEXT PRIMARY KEY,           -- [tranche 4] le code DEMANDÉ, pas celui renvoyé
  payload TEXT NOT NULL,              -- réponse normalisée, champs restreints
  fetched_at INTEGER NOT NULL
)
-- [tranche 4] Aucun index : la purge balaie quelques centaines de lignes, et un
-- index est la seule chose d'une migration qui puisse encore être ajoutée après.
-- Aucune CHECK non plus : rien ici n'a d'ensemble fermé à contraindre.
```

**[tranche 4] Trois précisions constatées à l'écriture.**

1. **La clé est le code-barres demandé, jamais celui que l'API renvoie.** Elle normalise ce qu'on lui donne — une consultation de `0000000000017` répond `code: "00000017"` — donc indexer sur l'écho rangerait les lignes sous un code que le scanner ne produit jamais.
2. **`payload` porte NOTRE forme normalisée, pas la réponse brute.** La réponse traîne `nutriments_estimated`, un bloc volumineux de valeurs estimées depuis la liste d'ingrédients, qui arrive qu'on le demande ou non. Le stocker ferait entrer dans la base des chiffres que personne n'a déclarés. Corollaire : la lecture valide aussi bien que l'écriture — cette colonne survit à une montée de binaire, donc c'est une frontière dans le temps — et une ligne devenue illisible est traitée comme absente.
3. **Seuls les produits TROUVÉS y entrent.** Mettre en cache un « code inconnu » pendant trente jours masquerait un produit ajouté entre-temps chez Open Food Facts, et ne pas le cacher coûte une requête, plafonnée par le limiteur.

**[tranche 4] Le rafraîchissement opportuniste n'écrit QUE dans cette table.** Il ne touche jamais `food`. C'est la réponse entière à « que devient une correction au rafraîchissement » : rien, parce qu'aucun chemin de code ne va d'ici à cette table. Le §8.5 place le rafraîchissement sous *Open Food Facts* et la libre correction d'un aliment copié sous *Base personnelle* ; les deux rubriques ne se rencontrent pas.

### 2.5 Poids (V2)

```sql
weight_measure(
  date TEXT PRIMARY KEY,              -- une mesure au plus par date (§6.2)
  value_kg REAL NOT NULL,
  created_at INTEGER, updated_at INTEGER
)

weight_goal(
  id TEXT PK, target_kg REAL NOT NULL,
  mode TEXT NOT NULL,                 -- 'target_date' | 'rate'
  target_date TEXT, rate_kg_per_week REAL,
  defined_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
)

notification_setting(
  kind TEXT PRIMARY KEY,              -- 'weigh_in'|'empty_journal'|'daily_summary'|'export_reminder'
  enabled INTEGER NOT NULL DEFAULT 0,
  hour INTEGER, minute INTEGER
)
```

### 2.6 Musculation (V3)

```sql
exercise(
  id TEXT PK, name TEXT NOT NULL,
  primary_muscle TEXT NOT NULL, equipment TEXT,
  media_uri TEXT,                     -- fichier local, hors export (D7)
  note_execution TEXT, note_setup TEXT, note_breathing TEXT, note_mistakes TEXT,
  increment_kg REAL NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at, updated_at
)
exercise_secondary_muscle(exercise_id TEXT, muscle TEXT, PRIMARY KEY(exercise_id, muscle))

routine(id TEXT PK, name TEXT NOT NULL, created_at, updated_at)
routine_warmup_step(id TEXT PK, routine_id TEXT NOT NULL, position INTEGER, text TEXT)

routine_block(
  id TEXT PK, routine_id TEXT NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  rest_seconds INTEGER                -- au niveau du bloc pour un superset (§10.2)
)

routine_line(
  id TEXT PK, block_id TEXT NOT NULL REFERENCES routine_block(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  position INTEGER NOT NULL, set_index INTEGER NOT NULL,
  set_type TEXT NOT NULL,             -- 'warmup'|'work'|'dropset'|'long'
  reps_min INTEGER, reps_max INTEGER,
  target_load_kg REAL, target_rir REAL,
  rest_seconds INTEGER, progression_enabled INTEGER NOT NULL DEFAULT 0,
  note TEXT
)

session(
  id TEXT PK,
  date TEXT NOT NULL,                 -- date civile de début (D3)
  routine_id TEXT, routine_name_snapshot TEXT,
  status TEXT NOT NULL,               -- 'in_progress' | 'done'
  started_at INTEGER NOT NULL, ended_at INTEGER,
  notes TEXT, created_at, updated_at
)
-- invariant « une seule séance en cours », porté par la base (D12)
CREATE UNIQUE INDEX ux_session_active ON session(status) WHERE status = 'in_progress';
CREATE INDEX ix_session_date ON session(date);

-- durée = somme des segments ; la durée n'est jamais stockée (D9, D12)
session_segment(
  id TEXT PK, session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL, ended_at INTEGER
)

session_block(
  id TEXT PK, session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, rest_seconds INTEGER
)

-- une ligne = une série : cible figée + réalisé
session_set(
  id TEXT PK, session_block_id TEXT NOT NULL REFERENCES session_block(id) ON DELETE CASCADE,
  exercise_id TEXT REFERENCES exercise(id),   -- lien VIVANT, exception D5/R4
  exercise_name_frozen TEXT NOT NULL,         -- survit à la suppression de l'exercice
  position INTEGER NOT NULL, set_index INTEGER NOT NULL,
  set_type TEXT NOT NULL,
  target_reps_min INTEGER, target_reps_max INTEGER,
  target_load_kg REAL, target_rir REAL,
  rest_seconds INTEGER, progression_enabled INTEGER NOT NULL DEFAULT 0,
  actual_reps INTEGER, actual_load_kg REAL, actual_rir REAL,
  status TEXT NOT NULL,               -- 'pending' | 'done' | 'skipped'
  completed_at INTEGER
)
CREATE INDEX ix_set_exercise ON session_set(exercise_id, completed_at);

exercise_note(
  id TEXT PK, exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  text TEXT NOT NULL, created_at INTEGER, consumed_at INTEGER
)
```

### 2.7 Activités (V4)

```sql
activity(
  id TEXT PK,
  external_id TEXT UNIQUE,            -- identifiant intervals.icu : met à jour, ne duplique pas
  date TEXT NOT NULL,                 -- date locale fournie par la source (D3)
  type TEXT NOT NULL,
  distance_m REAL, moving_seconds INTEGER, elapsed_seconds INTEGER,
  elevation_m REAL, cadence REAL, avg_hr REAL, kcal REAL,
  synced_at INTEGER, created_at, updated_at
)
CREATE INDEX ix_activity_date ON activity(date);
```

**Hors base :** la clé API intervals.icu réside dans le trousseau iOS (`expo-secure-store`), jamais dans SQLite ni dans l'export.

---

## 3. Arborescence du projet

```
/
├── app/                          # routes expo-router — CÂBLAGE UNIQUEMENT
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx           # 4 onglets fixes dès la V1
│   │   ├── (journal)/            # groupe sans segment : donne un Stack natif
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx         # Journal
│   │   │   └── library/          # bibliothèque aliments & recettes
│   │   │       ├── index.tsx
│   │   │       └── food/[id].tsx
│   │   ├── training.tsx
│   │   ├── stats.tsx
│   │   └── settings.tsx
│   ├── exercise/[id].tsx
│   ├── routine/[id].tsx
│   ├── session/live.tsx
│   └── (modals)/
│       ├── add-entry.tsx         # modale plein écran (§8.4)
│       └── quantity.tsx
│
├── src/
│   ├── core/
│   │   ├── db/
│   │   │   ├── client.ts         # ouverture, PRAGMA, transactions
│   │   │   ├── schema/           # définitions Drizzle, une par domaine
│   │   │   ├── migrations/       # SQL généré — JAMAIS modifié après livraison
│   │   │   ├── backup.ts         # sauvegarde pré-migration, « préparer une copie »
│   │   │   └── change-bus.ts     # table modifiée → clés invalidées (D8)
│   │   ├── date/                 # LocalDate : type marqué + fonctions pures (D3)
│   │   ├── format/               # arrondis, unités, français
│   │   ├── theme/                # jetons, clair/sombre/système
│   │   ├── ui/                   # composants génériques (règle du 2e utilisateur)
│   │   └── charts/               # primitives SVG : axes, échelles, tracés (D13)
│   │
│   ├── features/
│   │   ├── nutrition/
│   │   │   ├── screens/  components/  hooks/
│   │   │   ├── data/             # lectures (hooks) + écritures (transactions)
│   │   │   ├── domain/           # fonctions pures : macros, adhérence, objectifs
│   │   │   └── off/              # client Open Food Facts, cache, limiteur (D11)
│   │   ├── weight/               # V2 — lissage, régression, objectif
│   │   ├── strength/             # V3 — routines, séance en direct, progression
│   │   ├── activities/           # V4 — intervals.icu
│   │   ├── notifications/        # V2 — planification, annulation (D14)
│   │   ├── backup/               # export / import (D7)
│   │   ├── stats/                # tableau de bord transversal
│   │   └── settings/
│   │
│   └── dev/
│       └── seed/                 # générateur de jeu de données (D15)
│
├── .github/workflows/
│   ├── build-dev.yml             # build de développement
│   ├── build-app.yml             # build quotidien
│   └── checks.yml                # types, tests, rejeu des migrations (D6/G4)
│
└── drizzle.config.ts
```

**Non versionné :** `ios/`, `android/`, tout export réel, tout jeu de données issu des vraies données.

---

## 4. Conventions de code

**Types**
- TypeScript en mode strict, sans exception.
- **Types marqués obligatoires** pour `LocalDate` et les identifiants d'entité. Une date civile ne doit jamais pouvoir être passée là où un instant est attendu.
- Aucun `any`. Les données extérieures (import JSON, Open Food Facts) sont validées à la frontière, jamais typées par affirmation.

**Dates**
- `new Date()` sur une chaîne `AAAA-MM-JJ` est **interdit**. Point d'entrée unique : le module `core/date`.
- Une **fonction unique** détermine la journée courante, seuil de bascule compris, et sert aussi les notifications.

**Base de données**
- Colonnes en `snake_case`, identifiants TypeScript en `camelCase`.
- Aucune écriture depuis un composant. Les écritures passent par les fonctions du domaine, qui sont transactionnelles.
- Toute opération multi-lignes est explicitement transactionnelle.
- Aucune invalidation de cache écrite à la main : elle passe par le bus de changements.

**Structure**
- Le dossier `app/` ne contient que du câblage.
- Aucun calcul métier dans un composant.
- Un composant ne migre vers `core/ui` qu'à son deuxième utilisateur réel.
- Fichiers en `kebab-case`, composants React en `PascalCase`.

**Langue**
- Code, schéma et commentaires en anglais sans accents.
- Français réservé aux chaînes affichées, colocalisées dans leur domaine.

**Erreurs**
- Une erreur attendue (produit introuvable, réseau absent, quota dépassé) est une valeur de retour, pas une exception.
- Aucun message bloquant sur le parcours critique, à l'exception du dépassement de quota Open Food Facts.

---

## 5. Dépendances

| Dépendance | Rôle | Justification | Natif |
| --- | --- | --- | --- |
| `expo`, `expo-router` | Socle et routage | Voie par défaut, maintenue (D1, D10) | oui |
| `expo-dev-client` | Build de développement | Remplace Expo Go (D1) | oui |
| `expo-sqlite` | Persistance | Officiel Expo, transactionnel, WAL (D2) | oui |
| `drizzle-orm` | Requêtes et schéma | Intégration `expo-sqlite`, **zéro surface native** (D2) | non |
| `drizzle-kit` | Migrations générées | Migrations SQL versionnées et relisibles (D6) | dev |
| `@tanstack/react-query` | Couche de requête | Locale et réseau, invalidation par le bus (D8) | non |
| `expo-camera` | Scan de code-barres | §8.5. **[tranche 4] Installée**, et son greffon de configuration est **déclaré** — contrairement à `expo-sharing`, laissé à l'autolinking — parce qu'il écrit `NSCameraUsageDescription` dans l'`Info.plist`, ce que l'autolinking ne fait pas. Sans elle, iOS tue l'application à l'ouverture de l'appareil photo : l'alternative n'est pas une chaîne manquante, c'est un plantage que le bundle JS ne sait pas reproduire | oui |
| `expo-notifications` | Notifications locales | §9.3, minuteur de repos (D14) | oui |
| `expo-file-system` | Fichiers, sauvegardes | Export, copies pré-migration (D6, D7) | oui |
| `expo-sharing` | Feuille de partage | Export (§5.4) | oui |
| `expo-secure-store` | Trousseau | Clé intervals.icu, V4 (§11.1) | oui |
| `react-native-svg` | Graphiques, carte corporelle | Un seul outil graphique (D13) | oui |
| `d3-scale`, `d3-shape` | Échelles et tracés | JavaScript pur, quelques kilo-octets (D13) | non |
| `zod` | Validation aux frontières | **[tranche 4] En service, et à UNE seule frontière.** L'import JSON ne l'utilise pas et ne l'utilisera pas : sa charge utile est déjà décrite par les objets Drizzle, un schéma zod en serait une seconde déclaration libre de diverger. Celle d'Open Food Facts est vraiment étrangère. Un test refuse tout import de `zod` hors de `features/nutrition/off/` | non |
| `ulid` | Identifiants triables | JavaScript pur (D4) | non |
| `date-fns` | Formatage français | Sous le module `core/date`, jamais appelé directement | non |
| `@react-native-picker/picker` | Molette de quantité | **[tranche 3]** `UIPickerView` réel pour le §8.4 : rien dans React Native n'y donne accès, et trois listes aimantées en restaient une imitation sans la courbure ni le son du système. Ajout **demandé et validé explicitement** | oui |
| `react-native-gesture-handler` | Balayages | §8.3, §10.2 — déjà requis par expo-router | oui |
| `react-native-reanimated` | Animations | Déjà requis par la navigation | oui |
| `vitest` + `better-sqlite3` | Tests hors appareil | Fonctions pures, invariants, migrations (D15) | dev |

**[tranche 2] `expo-document-picker` retiré de cette table.** `File.pickFileAsync` d'`expo-file-system` 57 ouvre le même sélecteur iOS et rend une copie temporaire : une dépendance native de moins, pour toujours.

**Explicitement écartées :** toute bibliothèque de composants d'interface, NativeWind, toute bibliothèque d'internationalisation, `victory-native` / Skia, `op-sqlite`, WatermelonDB, Realm, toute bibliothèque de liste virtualisée spécialisée, Detox.

**Règle d'ajout.** Toute nouvelle dépendance **native** exige une justification écrite dans ce document. Ce qu'elle coûte, une fois pour mémoire : `@react-native-picker/picker` a été la première ajoutée après la tranche 0, et elle oblige à **reconstruire le binaire** — le bundle JS seul ne contient pas son module natif, donc rien ne marche sur l'appareil avant un passage par GitHub Actions. Une dépendance JavaScript pure ne peut pas casser une compilation ; une dépendance native, si — et le diagnostic coûte un cycle CI.

---

## 6. Points ouverts assumés

| № | Point | Statut |
| --- | --- | --- |
| 1 | ~~intervals.icu expose-t-il le poids COROS ?~~ | **Clos, négativement.** Double saisie définitive ; §11.2 abandonné ; l'export reste l'unique protection du poids |
| 2 | **Le trousseau survit-il à la re-signature hebdomadaire ?** | À tester avant la V4 ; sinon, clé à ressaisir chaque semaine |
| 3 | **Carte corporelle** : ressource graphique et cartographie vers les groupes musculaires | Ouvert, V3 |
| 4 | **Heures par défaut des quatre notifications** | À définir à l'usage, V2 |
| 5 | **Table de résumé quotidien** si une vue dépasse ~250 ms | Volontairement non écrite : donnée dérivée, reconstructible (D9) |
| 6 | **Fusion à l'import** | Rendue possible par D4, non implémentée, non prévue |
| 7 | **Limites de débit Open Food Facts** | Constatées au 10/09/2026, susceptibles d'évoluer |
| 8 | **Médias d'exercices hors filet JSON** | Assumé ; couverts uniquement par la copie manuelle du dossier |
| 9 | **Minuteur de repos silencieux** en mode silencieux iOS | Limite structurelle, sans contournement gratuit |

---

## 7. Ordre de développement — tranches verticales

Chaque tranche produit quelque chose d'**installé et utilisable**. Aucune tranche horizontale, aucune couche construite « pour plus tard ».

### Tranche 0 — Socle *(rien d'utilisable, mais tout le reste en dépend)*
Dépôt public, CI produisant les deux builds, dev client et app quotidienne installés. SQLite + Drizzle + première migration + **sauvegarde pré-migration + refus de démarrer sur base plus récente**. Module `core/date` avec ses tests multi-fuseaux. Jetons de thème. Quatre onglets vides.
**Critère de sortie :** une application installée sur l'iPhone, qui ouvre une base et affiche quatre onglets vides.

### Tranche 1 — Journal en saisie libre *(premier usage réel)*
Matérialisation d'une journée, repas, saisie libre, bandeau de restant, navigation entre les jours. Générateur de jeu de données de démonstration.
**Critère de sortie :** vous pouvez loguer un repas. **À partir d'ici, les migrations sont en ajout seul.**

### Tranche 2 — Export / import *(le filet, avant d'accumuler)*
Export complet, import par construction-puis-bascule, validation, indicateur d'ancienneté, bouton « préparer une copie ». Le test d'aller-retour.
*Placée délibérément avant toute autre fonctionnalité :* de vraies données s'accumulent depuis la tranche 1, et rien ne les protège encore.

### Tranche 3 — Base d'aliments personnelle
Création, édition, portions avec quantités, favoris, recherche locale, accès rapide (favoris et récents), **quantité pré-remplie**.

### Tranche 4 — Open Food Facts et scan
Client, limiteur, cache 30 jours, recherche explicite, dédoublonnage par code-barres, copie automatique, scan, bascule création manuelle pré-remplie, bandeau hors ligne.

### Tranche 5 — Modèles de journée et planning
Modèles, repas types, objectifs, récurrence hebdomadaire, surcharges, modèle par défaut. Le bandeau de restant devient enfin significatif.

### Tranche 6 — Recettes
Ingrédients, rendement, macros calculées, ajustement à l'occurrence, bloc groupé, figeage à la suppression.

### Tranche 7 — Statistiques nutrition et réglages → **fin de V1**
Primitives graphiques SVG, volet nutrition, taux d'adhérence avec dénominateur, agrégations, thème, seuil de bascule, écran À propos.

### Tranche 8 — Poids
Saisie, historique corrigeable, objectif, lissage, régression, courbes, volet poids du tableau de bord.

### Tranche 9 — Notifications → **fin de V2**
Quatre notifications, planification à 7 jours, annulation conditionnelle, reprogrammation du bilan chiffré.

### Tranche 10 — Exercices et routines
Base d'exercices, recherche filtrée, blocs, supersets, carte corporelle.

### Tranche 11 — Séance en direct
Persistance continue, deux rythmes d'écriture, vidage en arrière-plan, segments d'activité, bandeau persistant, minuteur de repos par notification, reprise.

### Tranche 12 — Historique, progression, statistiques → **fin de V3**
Historique, double progression, records, 1RM, volet musculation, graphique croisé.

### Tranche 13 — intervals.icu → **V4**
Clé au trousseau, tirage, identifiant d'origine, écran Activités. Puis arbitrage du tirage de poids selon le point ouvert n° 1.

---

## 8. Récapitulatif des décisions

| № | Sujet | Décision | Réversible ? |
| --- | --- | --- | --- |
| D1 | Boucle de développement | Build de développement, deux identifiants d'app, natif régénéré en CI | oui |
| D2 | Persistance | SQLite / `expo-sqlite` / Drizzle, WAL, `synchronous=NORMAL` | non |
| D3 | Dates | Date civile `TEXT` comme clé métier, instants réservés aux traces | **non** |
| D4 | Identifiants et nombres | ULID textuels, flottants, macros canoniques pour 100 | **non** |
| D5 | Figeage | Référence et non total ; feuilles porteuses ; gel atomique ; exercice en lien vivant | **non** |
| D6 | Migrations | Générées, sauvegarde préalable, gel après livraison, refus de rétrogradation | **non** |
| D7 | Export / import | Plat, indenté, construction-puis-bascule, remplacement total, versions découplées | partiellement |
| D8 | État et accès | TanStack Query + invalidation par la base, couche fine par domaine | oui |
| D9 | Calculs | Rien de dérivable n'est stocké ; SQL / fonctions pures / rien dans les composants | oui |
| D10 | Structure | expo-router, organisation par domaine, aucune bibliothèque d'interface | oui |
| D11 | Open Food Facts | Recherche explicite, cache 30 j, limiteur, bascule si incomplet | oui |
| D12 | Séance en direct | Deux rythmes d'écriture, segments d'activité, invariant en base | oui |
| D13 | Graphiques | Maison sur `react-native-svg`, agrégation en amont, pas de zoom | oui |
| D14 | Notifications | Replanification permanente, fenêtre de 7 jours, bilan reprogrammé | oui |
| D15 | Tests | Export/import, migrations, dates multi-fuseaux, fonctions pures ; pas d'interface, pas de bout en bout | oui |
| D16 | Performance | Cible tenue en supprimant des gestes, pas en optimisant du code | oui |

---

## 9. Amendements

Le document est normatif, donc il est tenu a jour : une demande qui diverge de
ce qui est ecrit ici modifie ce qui est ecrit ici, plutot que de laisser une
divergence vivre dans le code.

### 9.1 Tranche 1 (11/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.3 | `journal_entry.kind` et `base_unit` portent de vraies contraintes `CHECK`, la ou le schema les donnait en commentaires | SQLite ne permet pas d'ajouter une CHECK sans reconstruire la table, et la tranche 2 importe du JSON arbitraire dedans |

### 9.2 Tranche 2 (12/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §5 | `expo-document-picker` **retire** des dependances | `File.pickFileAsync` d'`expo-file-system` 57 ouvre le meme selecteur : une dependance native de moins |
| 2 | §3 | `core/db/staging.ts` et `core/db/database-files.ts` ajoutes hors arborescence initiale | L'import par construction-puis-bascule a besoin d'un porteur, et le nettoyage d'un nom de fichier isole |

### 9.3 Tranche 3 (12/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.2 | `barcode` et `ux_food_barcode` **differes** en tranche 4 | Une migration porte ce qui ne peut pas etre ajoute plus tard et differe ce qui le peut ; une colonne nullable sans CHECK peut arriver par ALTER TABLE |
| 2 | §2.2 | `display_ref_qty` gagne `DEFAULT 100` ; `ck_food_favorite` et `ck_portion_quantity` ajoutees | 100 est la forme canonique, donc le defaut est l'identite ; un booleen et une quantite de portion ne peuvent jamais s'elargir |
| 3 | §2.2 | `ix_food_name` en `COLLATE NOCASE` ; **aucune CHECK** sur les macros ni sur `food_portion.name` | Sinon 'abricot' se classe apres les majuscules. Les macros : le §8.5 veut des valeurs Open Food Facts signalees, jamais refusees. Les portions : elargir le vocabulaire ne casse aucun invariant |
| 4 | §2.3 | `journal_entry.source_food_id` **restera sans cle etrangere** | Un cascade detruirait l'historique, un restrict bloquerait une suppression que le §5.3 dit n'etre jamais bloquee — et la table est gelee depuis 0001 |
| 5 | §3 | La bibliotheque passe de `app/library/` a `app/(tabs)/(journal)/library/` | A la racine elle recouvrirait la barre d'onglets ; le §7 la decrit comme un endroit ou le Journal mene. Regle qui en sort : consulter est un empilement, ajouter est une modale |
| 6 | §3 | S'ajoutent hors arborescence initiale : `core/db/version-guard.ts`, `database-gate.tsx`, `database.ts`, `app-database.ts`, `core/id/`, `core/format/`, `core/query/` | G3 exige un refus de demarrage avec message, il lui faut un porteur |

### 9.4 Tranche 4 (13/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.2 | `barcode TEXT` et `ux_food_barcode`, index unique **partiel**, ajoutes par `0003` | Le report de la tranche 3 est encaisse : un ALTER TABLE et un CREATE INDEX sur une table qui porte de vraies donnees, sans rien reconstruire. La clause WHERE dit l'intention, SQLite traitant deja les NULL comme distincts |
| 2 | §2.2 | La copie automatique lit par code-barres et **reutilise**, elle n'insere jamais a l'aveugle | Un index unique est la premiere chose de cette table qui puisse faire echouer un INSERT, alors que la tranche 3 avait ecarte toute CHECK sur les macros pour que ce chemin ne puisse jamais echouer |
| 3 | §2.4 | La cle est le code-barres **demande** ; `payload` porte la forme normalisee maison ; seuls les produits trouves y entrent ; aucun index, aucune CHECK | L'API normalise ce qu'on lui donne, et sa reponse brute traine des valeurs estimees depuis les ingredients |
| 4 | §2.1 | Cle `off_suspended_until` ajoutee aux reglages connus | C'est le seul etat du limiteur dont la perte a un cout hors du telephone |
| 5 | D11 | Sept constats sur l'API reelle, dont : **deux hotes** (la recherche texte vit sur `search.openfoodfacts.org`), le 404 n'est pas le signal, et `nutriments_estimated` arrive non demande | Constate le 13/09/2026 par huit requetes, non lu dans une documentation |
| 6 | D11 | La retry unique n'est **pas** depensee sur un delai d'attente, seulement sur un refus immediat | Un timeout a deja recu tout le temps qu'on avait ; reessayer double une attente jugee trop longue sur un parcours budgete a cinq secondes |
| 7 | D11 | Le limiteur est en deux morceaux : fenetre glissante en memoire, suspension persistee | Une minute d'expiration ne justifie pas une ecriture SQLite par requete ; un 429 oublie apres un arret force fait bannir |
| 8 | §5 | `zod` **en service**, restreint par un test a `features/nutrition/off/` ; `expo-camera` **installee**, greffon declare | L'import JSON garde sa validation derivee du schema (decision de la tranche 2) ; le greffon ecrit une cle d'Info.plist que l'autolinking ne produit pas |
| 9 | §3 | `features/nutrition/off/` peuple : `off-parse`, `off-product`, `off-client`, `off-gateway`, `rate-limit`, `off-cache`, `off-lookup`, `off-dedupe`, `off-draft`, `off-queries`, `scan-screen` | Le §3 prevoyait le dossier sans en detailler le decoupage ; il suit celui de `core/db` — pur d'un cote, natif de l'autre, `off-gateway` etant le seul a nommer une vraie dependance |
| 10 | §5.1 | Un produit Open Food Facts a **toujours** `base_unit = 'g'`, sans heuristique | L'API publie des valeurs `_100g` pour tout ce qu'elle contient, liquides compris. Les lire comme « pour 100 ml » serait appliquer une densite de 1, que le §5.1 exclut. Qui veut des millilitres corrige l'aliment |
| 11 | §5.1 | Les **kilojoules ne sont pas convertis** en kcal | « La valeur calorique d'une source est conservee telle quelle ». La consultation par code-barres fournit les kcal de toute facon, calculees cote serveur. Reserve : si le formulaire s'ouvre trop souvent a l'usage, la conversion est le premier remede et tient en une ligne |

### 9.5 Tranche 5 (13/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.3 | `planning_weekday.template_id` et `planning_override.template_id` portent une **cle etrangere `ON DELETE CASCADE`**, la ou le schema n'en declarait aucune | C'est la seule decision irreversible de la tranche : SQLite n'a pas d'ALTER TABLE ADD CONSTRAINT. L'asymetrie qui tranche est deja ecrite au §2.3 par ailleurs — `day.template_id_snapshot` est « informatif, sans lien vivant » et ne porte aucune cle, parce qu'un cascade y detruirait l'historique. Le planning est l'inverse : de la configuration vivante, ou une ligne designant un modele disparu ne s'affiche ni ne se resout. RESTRICT etait exclu par le §5.3, qui ne bloque aucune suppression ; CASCADE ne bloque rien non plus. Et sans cle declaree, `foreign_key_check` — barriere 3 de l'import — ne distinguerait plus une archive saine d'une archive dont le planning pointe dans le vide |
| 2 | §2.3 | `ck_planning_weekday` : `weekday BETWEEN 1 AND 7`, la ou le schema posait `1 = lundi` en commentaire | Meme motif que `ck_food_favorite` : une semaine n'aura jamais huit jours, donc contraindre ne coute rien, jamais. Et c'est la seule barriere disponible — la regle `one_of` du catalogue d'export prend des chaines, la ou la colonne est un entier. Absente de `0004`, elle serait absente pour toujours |
| 3 | §2.3 | **Aucun index sur `day_template_meal.template_id`**, la ou `day_meal` en a un sur `date` | `day_meal` grossit sans borne, une ligne par repas par journee materialisee, pour toujours ; `day_template_meal` est borne par le nombre de modeles que l'utilisateur cree. A cette echelle un index n'achete rien de mesurable, et un index reste la seule chose d'une migration qui puisse encore etre ajoutee sans rien reconstruire |
| 4 | §2.1 | Cle `default_template_id` ajoutee aux reglages en service | **Le seul pointeur de l'application qu'aucune contrainte ne peut proteger** : `setting` est une table cle/valeur en TEXT. Traite des deux cotes — supprimer un modele l'efface dans la meme transaction (la regle), et la lecture verifie que le modele existe encore (la garantie). Seule la seconde survit a une archive ecrite par un autre binaire ou a une ligne reparee a la main |
| 5 | §2.3 | `day.template_id_snapshot` marque `DayTemplateId` ; `day.template_name_snapshot` desormais ecrit | Les deux colonnes ont ete livrees nullables en tranche 1 et sont restees NULL quatre tranches ; `0004` leur donne des modeles a designer et n'a coute aucun changement de schema, exactement comme predit. Elles restent NULL pour toute journee materialisee avant `0004` : c'est le releve veridique, aucun modele n'existait alors |
| 6 | §3 | `features/nutrition/` gagne `data/planning-reads.ts`, `planning-writes.ts`, `planning-queries.ts`, `domain/planning.ts`, `domain/template-draft.ts`, `screens/templates-screen.tsx`, `template-editor-screen.tsx`, `planning-screen.tsx`, `components/day-plan-row.tsx`, `recent-meals-section.tsx` ; `core/db/schema/planning.ts` | Le decoupage suit celui deja pose : pur d'un cote, base de l'autre, hooks par-dessus. Le schema du planning a son propre module sur le precedent d'`off.ts` — un sous-domaine de la nutrition avec son propre vocabulaire |
| 7 | §3 | Les Reglages passent de `app/(tabs)/settings.tsx` a **`app/(tabs)/settings/`**, dossier reel et non groupe parenthese, avec son `_layout.tsx` | Une route feuille ne pousse rien, et le §8.8 range modeles et planning dans les Reglages. Mais un groupe `(settings)` aurait fait reclamer « / » une deuxieme fois par son `index.tsx`, a cote de celui du Journal : `(journal)` porte des parentheses precisement parce qu'il DOIT rester l'index du groupe d'onglets, ce que les Reglages ne sont pas |
| 8 | D8 | `useDay` declare les cinq tables du planning en plus des siennes, alors qu'une journee materialisee ne les lit jamais | La requete ne peut pas savoir quelle branche elle prendra avant de tourner. Cout nomme : `setting` etant dans la liste, le limiteur Open Food Facts y ecrivant `off_suspended_until`, scanner en magasin invalide le Journal. Ce que ca coute reellement est le rejeu de quelques lectures sur cle primaire — le bus assume deja « un rafraichissement pour rien, jamais un chiffre faux » |
| 9 | D7 | Quatre tables entrent au catalogue d'export, `introducedIn: '0004_templates_planning'`, inserees **entre `setting` et `food`** | L'ordre se lit alors comme configuration, puis donnees de reference, puis journal ; `day_template` ouvre le bloc, les trois autres le referencant. `planning_weekday.weekday` ne porte aucune regle de valeur : la CHECK SQL fait le travail, la regle `one_of` ne prenant que des chaines |
| 10 | §5 | **Aucune dependance ajoutee pour le planning.** Le nom d'un repas se choisit sur des lignes du formulaire, avec une coche sur celle en vigueur | Deux controles natifs ont ete essayes avant : un `UIPickerView` coute un defilement pour ce qui pouvait etre un toucher et mange cent cinquante points du panneau, et une feuille d'action pose une seconde question — Annuler — pour un choix qui n'a rien a annuler, la valeur en ayant deja une. En lignes, l'ensemble se lit sans rien toucher, ce qui rend « seulement ces quatre » visible au lieu de seulement vrai |
| 11 | D13, §7 | **L'anneau de progression arrive en tranche 5, dessine en vues**, et non avec `react-native-svg` que le §7 place en tranche 7 | Retour d'appareil. `react-native-svg` est au §5 et D13 en fait l'outil graphique unique, donc l'utiliser n'aurait rien enfreint — mais il est NATIF, et le premier ecran qui le monterait est le Journal. L'application cesserait de s'ouvrir jusqu'a un cycle CI et une reinstallation, rendant intestable tout ce qui est livre a cote. La tranche 7 amene svg pour les graphiques et la carte corporelle ; `progress-ring.tsx` se reecrit alors derriere les memes props, sans qu'un appelant bouge. Cinquante lignes, reversible — ce qui est exactement ce que D13 dit de lui-meme |
| 12 | §8.3 | **Trois etats de couleur pour les calories** : sous l'objectif, au-dessus, au-dela de 10 %. `KCAL_OVERSHOOT_THRESHOLD` est **distinct** de `KCAL_DISCREPANCY_THRESHOLD` | Le second verifie la coherence interne d'un aliment au §5.1 ; le premier dit qu'on a mange plus que prevu. Deux questions sans rapport qui partagent le nombre 10 : les confondre lierait une regle d'affichage a une regle nutritionnelle pour toujours |
| 13 | §8.3 | **Les barres de macros ne rougissent jamais**, journee comme repas, quel que soit leur remplissage | Depasser en glucides n'est pas le meme genre d'evenement que depasser sur la journee. Les calories sont le chiffre que le §8.3 rend lisible sans interaction : le seul qui ait le droit d'elever la voix |
| 14 | §5 | **`expo-font` ajoutee aux dependances**, et **Nunito** embarquee en trois fontes statiques sous licence OFL | Demande explicite. Elle ne coute AUCUN cycle CI : expo-font est une dependance directe d'expo, autolinkee, donc son module natif est deja dans le client installe et les fontes se chargent a l'execution. Declaree quand meme plutot que laissee transitive — une montee mineure d'expo pourrait la retirer. Trois fichiers statiques et non la fonte variable : fontWeight ne pilote pas un axe variable a travers React Native, iOS enregistrerait l'instance par defaut et synthetiserait le gras |
| 15 | §3, D10 | `core/ui/text.tsx` : tout l'affichage passe par lui au lieu du `Text` de react-native | React Native n'a pas de police globale, et `Text.defaultProps` est mort avec React 19. La contourner demanderait une affirmation de type sur un composant, interdite par le §4, pour ecrire un champ que React ne lit plus. Trente-cinq fichiers ont change d'import une fois ; le prochain changement de police en changera un. Il remet aussi `fontWeight` a normal, la fonte portant deja la graisse — sans quoi iOS synthetise un gras par-dessus un gras |

### 9.6 Tranche 6 (13/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.2 | `recipe_ingredient.food_id` **garde son absence de clause `ON DELETE`**, donc `NO ACTION`, et c'est une decision plutot qu'une reprise | Lue seule, elle contredit le §5.3 : supprimer un aliment ingredient echouerait, alors qu'aucune suppression n'est bloquee. Elle cesse de le contredire des que D5/R3 est obei — le gel remplit la capsule et rompt le lien dans une transaction unique, donc au moment du DELETE plus rien ne reference l'aliment. Ce n'est donc pas un danger : c'est la seule chose qui PROUVE que le gel a tourne. `ON DELETE SET NULL` etait le candidat tentant et il est refuse pour la raison meme qui fait exister R3 — il rompt le lien SANS remplir la capsule, laissant un ingredient sans nom et sans macros la ou le §5.3 promet les deux |
| 2 | §2.2 | `recipe_tag.recipe_id` et `recipe_step.recipe_id` portent une **cle etrangere `ON DELETE CASCADE`**, la ou le schema n'en declarait aucune | Meme asymetrie qu'au §9.5 n° 1 : un tag ou une etape n'est pas de l'historique, c'est une propriete d'un objet vivant, et une ligne designant une recette disparue ne s'affiche ni ne se resout. RESTRICT est exclu par le §5.3, CASCADE ne bloque rien. Et sans cle declaree, `foreign_key_check` — barriere 3 de l'import — ne distinguerait plus une archive saine d'une archive dont les etapes pendent dans le vide |
| 3 | §2.2 | `recipe_step.position` et `recipe_step.text` passent **`NOT NULL`**, la ou le schema les laissait nullables | Une etape sans texte n'est pas une etape, et une etape sans position n'a pas de place dans une liste ordonnee — les deux colonnes sont tout ce qu'est cette table. Toutes les tables comparables sont deja `NOT NULL` sur leur position. Et une colonne `NOT NULL` sans defaut est exactement ce que SQLite ne sait PAS ajouter plus tard |
| 4 | §2.2 | `ck_recipe_yield_type` et `ck_ingredient_unit`, la ou le §2.2 posait ses ensembles en commentaires | Critere de la tranche 3 : ce n'est pas la probabilite qu'un ensemble bouge, c'est ce qu'un elargissement casserait. Un troisieme `yield_type` tomberait a travers `recipe-macros.ts` et produirait un chiffre faux et plausible plutot qu'une etiquette inconnue — meme classe que `journal_entry.kind`. Un `unit` elargi casserait l'etancheite du §5.1, comme `base_unit` |
| 5 | §2.2 | `ck_recipe_yield_value` : `yield_value > 0` | Meme classe que `ck_portion_quantity`, pour un motif plus fort : un zero rend toute macro derivee infinie, et l'infini ne s'arrete pas a l'ecran — loguer la recette le figerait dans `journal_entry.quantity`, colonne exportee, sur laquelle `toExportValue` **leve**. Un seul zero casserait l'export, c'est-a-dire l'unique filet |
| 6 | §2.2 | `ck_ingredient_link` : `food_id IS NOT NULL OR frozen_kcal_100 IS NOT NULL` | Une ligne qui n'a ni l'un ni l'autre porte des macros NULL, et NULL est ce que `SUM` IGNORE : l'ingredient ne compterait pour rien pendant que le total garderait l'air d'un nombre. Prix nomme plutot que cache — les regles du catalogue sont par colonne, donc une archive reparee a la main y recevrait une erreur SQLite au lieu d'une phrase. C'est le reproche que la tranche 3 faisait aux CHECK ; ce qui tranche ici est qu'une etiquette de portion inconnue se voit et qu'un ingredient saute ne se voit pas |
| 7 | §2.2 | **`recipe_ingredient.unit` vaut `'g' \| 'ml'`**, et la quantite est toujours en unite de base — un ingredient ne se saisit jamais « 2 tranches » | Le §6.1 laisse l'unite ouverte et cette table n'a pas la paire `portion_name` / `portion_quantity` de `journal_entry`. Une portion ne pourrait donc s'exprimer qu'en faisant de `unit` un nom de portion et de `quantity` un compte, ce qui casse la regle de la tranche 3 dont depend le `SUM` sans clause. Consequence assumee : l'editeur peut proposer les portions d'un aliment comme commodite de saisie, ce qui atterrit en base est toujours g ou ml |
| 8 | §2.2 | **`yield_type = 'weight'` veut toujours dire des grammes**, sans colonne d'unite | Une recette melange les deux unites de base par nature — 300 g de tomates et 200 ml de bouillon — donc aucune unite ne peut sommer les deux et le rendement ne peut pas se deriver des ingredients. Un plat fini se pese. Le §5.1 le dit par l'autre bout : le poids d'un aliment est cru et non prepare, « l'ecart est absorbe par le rendement des recettes », et cet ecart est de l'eau |
| 9 | §2.3 | `journal_entry.source_recipe_id` marque `RecipeId` ; **restera sans cle etrangere** | Troisieme tour du meme motif, apres `source_food_id` en tranche 3 et `template_id_snapshot` en tranche 5 : un changement TypeScript sans SQL dedans. Un cascade detruirait l'historique, un restrict bloquerait une suppression que le §5.3 dit n'etre jamais bloquee — et la table est gelee depuis `0001`, or SQLite n'a pas d'`ALTER TABLE ADD CONSTRAINT` |
| 10 | §2.3 | **Le `quantity` d'un parent `recipe` n'est PAS en unites de base** : il dit combien de la recette a ete mange. Portions dans `portion_name`, grammes dans `base_unit`, `portion_quantity` toujours `NULL` | C'est l'ombre de l'invariant d'agregation, pas une entorse : le parent ne porte aucune macro (D5/R2), donc `SUM(quantity * NULL)` vaut NULL quelle que soit la quantite. Rien d'autre ne peut porter cette information — une recette est un objet vivant et peut avoir change de rendement depuis. Rendu falsifiable par un test qui mute la quantite d'un parent et exige qu'aucun total ne bouge, exactement la parade posee sur `display_ref_qty` en tranche 3 |
| 11 | D9 | **La somme d'une recette est calculee DEUX FOIS par construction**, en SQL pour la bibliotheque et en TypeScript pour l'ecran d'une recette, et les deux sont tenues d'accord par un test sur une bibliotheque generee | Une lecture par recette serait impayable sur un chemin que D16 budgete en dixiemes de seconde ; un ecran qui tient deja tous ses ingredients n'a aucune raison de redemander a SQL de les sommer. Les deux sont justes et aucune n'est retirable, donc ce qui les tient egales ne peut pas etre le soin. Le partage est net : SQL multiplie et somme, `recipe-macros` divise et rien d'autre |
| 12 | D7 | **Quatre tables entrent au catalogue d'export**, `introducedIn: '0005_recipes'`, inserees **entre `food_portion` et `day`** | Seule position que les dependances autorisent : `recipe_ingredient.food_id` porte une vraie cle etrangere vers `food`, et rien du journal ne reference une recette par cle. Le catalogue a du apprendre a lire une **cle primaire composite** : Drizzle laisse `column.primary` a `false` sur chaque colonne d'une PK de table, donc `recipe_tag` paraissait sans cle — echec bruyant du test de couverture, et perte silencieuse de son `ORDER BY`, donc deux exports des memes donnees cessant d'etre le meme fichier |
| 13 | §3 | `features/nutrition/` gagne `data/recipe-reads.ts`, `recipe-writes.ts`, `recipe-queries.ts`, `domain/recipe-macros.ts`, `recipe-draft.ts`, `recipe-occurrence.ts`, `screens/recipe-editor-screen.tsx`, `recipe-occurrence-screen.tsx`, `components/recipe-row.tsx`, `recipe-block-row.tsx`, `recipe-text.ts`, `recipe-problem-text.ts`, `ingredient-editor.tsx`, `step-editor.tsx`, `tag-filter.tsx`, `yield-toggle.tsx`, `recipes-section.tsx` ; `core/db/schema/recipes.ts` ; `app/(tabs)/(journal)/library/recipe/[id].tsx` | Le decoupage suit celui deja pose : pur d'un cote, base de l'autre, hooks par-dessus, et le schema des recettes dans son propre module sur le precedent d'`off.ts` et de `planning.ts` |
| 14 | §5 | **Aucune dependance ajoutee.** Aucun cycle CI pour cette tranche | Tout ce dont les recettes ont besoin existe : formulaires groupes, gestes, panneaux, verre. Le seul point de vigilance etait un cycle d'import **type-only** entre `nutrition.ts` et `recipes.ts` — efface avant le bundler, verifie par `npm run bundle:ios` plutot que suppose |

### 9.7 Tranche 7 (14/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.1, D6 | **Aucune migration. Premiere tranche sans decision de schema irreversible** | `theme`, `day_cutoff_hour` et `adherence_tolerance_pct` sont des lignes de `setting`, table cle/valeur livree par `0000` — ce pour quoi elle existe. Aucune table, aucune colonne `NOT NULL` sans defaut, aucune CHECK, aucune FK, et **pas meme un index** : `ix_entry_date` et `ix_day_meal_date` servent deja exactement les deux balayages de plage des statistiques. Le catalogue d'export ne bouge pas non plus, de nouvelles cles de `setting` etant des lignes et non du schema |
| 2 | D13, §7 | **`progress-ring.tsx` n'est PAS reecrit sur svg. RENVERSE le §9.5 n° 11**, qui l'annoncait pour cette tranche | Le n° 11 avait raison sur le danger et se trompait sur la date. L'anneau est monte par le **Journal** : y mettre le natif ferait cesser l'application de s'ouvrir jusqu'au cycle CI, emportant tout ce qui est livre a cote — exactement le piege que ce n° 11 avait ete ecrit pour eviter. La version en vues a ete vue sur l'appareil en tranche 5 et ne montre aucun defaut. Reporte en tranche 8, ou svg aura tourne et ou les courbes de poids le montent de toute facon |
| 3 | §5 | **`react-native-svg` installee** (15.15.4, par `expo install`), plus `d3-scale`, `d3-shape` et **`@types/d3-scale`, `@types/d3-shape`**, absents du §5 et indispensables au mode strict | Les trois etaient deja au §5 par D13 et jamais installes. Les types sont une consequence mecanique : d3 ne les embarque pas, et le §4 interdit l'affirmation de type. Ce que d3-scale achete n'est pas la multiplication lineaire mais `nice()` et `ticks()` — choisir des nombres ronds pour un axe est un petit probleme deja resolu, et la version ecrite a la main gradue a 1 837 |
| 4 | §5, D1 | **Le cycle CI est du a svg seul, et il est place en DERNIERE etape** | Meme forme que le scan en tranche 4 : tout le reste de la tranche se verifie par Metro sur le binaire installe. Deux verifications faites plutot que supposees — d3-scale et d3-shape sont ESM pur, donc leur resolution est passee par vitest **et** par un bundle reel avant qu'une ligne ne soit ecrite dessus (5,3 → 5,9 Mo) ; et l'autolinking de svg est confirme en executant la commande exacte du Podfile, pas en lisant une documentation |
| 5 | D3, §4 | **`currentLocalDate` perd son parametre par defaut** | Il en avait un — minuit — parce que rien ne lisait le reglage. Des qu'il se lit, le defaut devient le danger : un site qui l'oublie repond minuit **en silence**, c'est-a-dire le mauvais jour, plausiblement, sur l'ecran dont tout le role est de s'ouvrir sur le bon. Requis, c'est `tsc` qui nomme les appelants, et un nouveau ne peut pas s'ecrire sans decider d'ou vient son seuil |
| 6 | §3, D10 | **`ThemeProvider` descend SOUS `DatabaseGate` et `QueryProvider`** | Il enveloppait tout, ce qui etait juste tant qu'il ne suivait que le systeme. La preference stockee est une ligne de `setting` : rien au-dessus de la porte ne peut la lire, et un provider place la aurait demarre sur un defaut puis se serait corrige — un eclair du mauvais theme a chaque demarrage a froid. Prix nomme : les trois ecrans de la porte n'ont plus ni theme ni Nunito. Ce sont ceux qu'on voit quand l'application ne peut pas tourner |
| 7 | D8 | **Une preference se lit par `useQuery` + `initialData`**, jamais par un magasin a part | Un `useQuery` ordinaire rend `undefined` au rendu qui le monte, si synchrone soit sa fonction — et le Journal **gele sa date dans son etat initial**, donc un seuil arrivant un tick plus tard arriverait apres la decision qu'il devait prendre. C'est le defaut des molettes de la tranche 4 et du `key` du carrousel de la tranche 3. `initialData` est honnete plutot qu'optimiste : la base est locale, synchrone et connue ouverte. Le bus garde l'invalidation, et `staleTime: Infinity` fait qu'aucun refetch ne suit |
| 8 | §5 | **`Appearance.setColorScheme` est appele a chaque changement de theme**, et ce n'est pas decoratif | `app.config.ts` pose `userInterfaceStyle: 'automatic'`, donc sans lui le reglage ne peint que la moitie de l'ecran : barre d'onglets, en-tetes natifs, `UIPickerView`, `ActionSheetIOS`, alertes et clavier restent sur le theme de l'OS. Constate en **lisant `RCTAppearance.mm`**, qui pose `overrideUserInterfaceStyle` sur chaque fenetre de chaque scene — ce que sa propre documentation dit l'inverse de faire. `'unspecified'` rend la main a l'OS |
| 9 | D9 | **L'objectif d'une journee est desormais calcule DEUX FOIS par construction**, et les deux sont tenues d'accord par un test | Troisieme tour du motif du §9.6 n° 11. Une lecture par jour est juste pour un jour et impayable pour quatre-vingt-dix ; une lecture groupee ne peut pas servir un ecran qui tient deja les repas d'une journee. Le cas qui decide n'est pas theorique : `readTargets` exige **les quatre** colonnes non nulles, la ou `sum(target_protein)` ignore les NULL des trois autres et rend un objectif que personne n'a pose. Aucune ecriture de l'application ne produit une telle ligne, une archive reparee a la main si, et `day_meal` n'a pas de CHECK pour l'en empecher (§14.6 n° 16). Mutation verifiee : sans les clauses, le test rougit |
| 10 | D11, §3 | **`sweepCache` est appele par un effet monte dans `app/_layout.tsx`**, et non dans `prepareDatabase` | La tranche 4 pariait sur « au demarrage, apres la migration ». Deux raisons de ne pas y aller : cette sequence est **normative a cinq etapes** et tourne dans le budget de 1,5 s du demarrage a froid, et `core/db` devrait importer `features/nutrition` pour l'atteindre. Un effet apres la premiere peinture ne coute rien au budget et garde le DELETE dans le domaine qui possede la table |
| 11 | D16 | **L'instrumentation des quatre transitions existe**, en `core/perf/`, inerte hors developpement | Elle etait promise depuis la tranche 0 et la cible etait un voeu depuis autant. Elle ne peut pas etre un test : chaque chiffre porte sur un telephone, et le simulateur qui en mesurerait une partie demande un Mac. Deux pieges evites : le demarrage a froid est **amorce au chargement du module et consomme** comme les trois autres — lu depuis une constante il aurait ete re-mesure depuis la naissance du bundle a chaque passage par le Journal — et seule la page **active** du carrousel rapporte, les deux voisines n'ayant rien attendu |
| 12 | D10, §4 | **Un module que la suite Node atteint ne doit jamais importer le baril `@/core/theme`** | Il reexporte `ThemeProvider`, qui importe `react-native`, dont l'`index.js` est du Flow que rolldown refuse de parser. Dix-sept fichiers de test ont rougi d'un coup. `core/theme/tokens` est pur — « des valeurs, pas des composants » — et c'est lui que la couche de donnees vise. Panne bruyante, donc aucun test ne la garde : le build la trouve en une execution |
| 13 | §3 | S'ajoutent : `core/perf/marks.ts`, `core/charts/scale.ts`, `chart-frame.tsx`, `core/ui/keypad-accessory.tsx` ; `features/settings/domain/preferences.ts`, `data/settings-queries.ts`, `components/perf-section.tsx`, `screens/about-screen.tsx` ; `features/stats/domain/` (`stat-range`, `adherence`, `series`, `panel`, `stats-text`), `data/` (`stats-reads`, `stats-queries`), `components/` (`stat-card`, `calories-card`, `calories-chart`, `split-card`, `adherence-card`) ; `app/(tabs)/settings/about.tsx` | Le decoupage suit celui deja pose : pur d'un cote, base de l'autre, hooks par-dessus. `core/charts/` et `features/stats/` etaient prevus au §3 sans etre detailles |
| 14 | §3, D10 | **La barre « OK » au-dessus d'un pave numerique monte dans `core/ui`**, a son deuxieme utilisateur reel | La regle, appliquee a l'heure pour une fois. Les paves numeriques d'iOS n'ont pas de touche retour, donc un champ qui en ouvre un n'a aucune facon de dire qu'il a fini ; un seul champ, donc pas de chevrons, qui seraient deux controles morts (tranche 4). Elle sert la quantite et la tolerance d'adherence |

### 9.8 Verification de la tranche 7 (14/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | D13, §10.6 | **Un glissement deplace la valeur lue sur un graphique.** Assouplit « une seule interaction » | Glisser ne zoome ni ne deplace : la fenetre ne bouge jamais, donc c'est la MEME interaction lue en continu. Ce que la regle protegeait — le zoom et le deplacement, doublons des selecteurs de plage — est intact. Le prix technique est nomme : un `Pan` remplace un `Pressable`, avec `activeOffsetX` pour que le glissement vertical reste a la `ScrollView`, faute de quoi l'ecran Stats cesserait de defiler au-dessus de son propre trace |
| 2 | D11, §8.5 | **Le detour vers le formulaire pre-rempli couvre les quatre echecs**, pas seulement le code-barres inconnu | D11 repondait a un echec de requete par un bandeau et rien d'autre. La consequence n'etait visible qu'a l'usage : l'utilisateur reste sur la liste avec un code-barres qui n'a servi a rien. La decision sort de l'ecran dans `off-detour.ts`, pure : quatre facons pour un code-barres de ne pas devenir un produit est une taxonomie, et une taxonomie se teste |
| 3 | D11 | **Le message de quota n'est plus un bandeau seul** : il devient la premiere ligne du formulaire vers lequel le scan derive | D11 en fait le seul message qui interrompt. Le bandeau ne vit que sur la liste, donc deriver sans lui aurait fait disparaitre exactement ce qui devait interrompre. Deplacement, pas suppression — et il gagne en visibilite |
| 4 | §2.2 | **`food.barcode` devient saisissable**, et l'unicite est dite par l'ecran avant d'etre imposee par l'index | `requireFreeBarcode` LEVE, ce qui etait « le bon filet et la mauvaise premiere ligne de defense » : une erreur SQLite nommant une contrainte, jetee depuis une transaction de panier. L'ecran lit l'index a la frappe et nomme l'aliment qui detient le code. Ce n'est pas un `FoodProblem` — `validateFoodDraft` est pur et ne connait aucune base — mais contrairement a l'ecart kcal et a l'energie impossible, celui-la BLOQUE l'enregistrement |
| 5 | §3, D13 | `core/charts/chart-frame.tsx` exporte `FRAME_TOP` a cote de `GUTTER_LEFT` et `GUTTER_BOTTOM` ; `features/nutrition/off/off-detour.ts` s'ajoute | Deux 16 voulant dire deux choses differentes — l'air au-dessus du trace et la place des dates sous la ligne de base — est la facon dont ils finissent par diverger. Ce qui se dessine PAR-DESSUS un graphique a besoin du premier, en coordonnees de trace |
| 6 | D13, §8.7 | **L'objectif quotidien est un volume, pas une serie** : chaque barre est la taille de l'objectif, remplie par le consomme, et une encoche remet l'objectif en place quand le remplissage le recouvre | La ligne en escalier etait juste et illisible : elle superposait une SERIE a des barres, la ou l'objectif n'est pas une serie mais la borne de chaque barre. Consequence technique : `curveStepAfter` disparait, la seule courbe restante etant la moyenne glissante. Et une journee sans entree ne dessine **ni** remplissage **ni** recipient -- un recipient vide se lirait « n'a rien mange » la ou la verite est « n'a rien note », distinction sur laquelle repose tout le §8.7 |
| 7 | §8.3, §8.7 | **Deux seuils differents pour « depasse », et c'est delibere** : la jauge du Journal garde sa marge de 50 kcal (§14.6 n° 21), le graphique rougit des le premier kilocalorie au-dessus | Divergence assumee plutot que subie, parce que les deux ecrans posent deux questions. La marge existe pour qu'un chiffre VIVANT ne clignote pas a +5 kcal ; un historique n'a pas ce probleme, et y appliquer la marge rendrait invisible la seule chose que le graphique sert a voir. `KCAL_OVERSHOOT_KCAL` reste donc au Journal et n'est pas importe ici -- les partager aurait lie les deux pour toujours, ce que l'amendement 9.5 n° 12 interdit deja pour les deux autres « 10 » |
| 8 | D9, §8.7 | **`Adherence` gagne `byMacro`**, quatre taux sur le meme denominateur que le taux global | Additif : le chiffre de tete reste la proportion de jours du §8.7. Ce que les quatre achetent est ce qu'un seul ne peut pas dire, et l'invariant qui les lie -- le global ne peut exceder le plus faible des quatre, un jour ne comptant globalement que s'il comptait sur chacun -- est teste a quatre tolerances plutot que suppose |
