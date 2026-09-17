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
weight_measure(                       -- 0006, tranche 8
  date TEXT PRIMARY KEY,              -- une mesure au plus par date (§6.2)
  value_kg REAL NOT NULL,
  created_at INTEGER, updated_at INTEGER,
  CHECK (value_kg > 0)                -- ck_weight_value
)
-- Aucun index : `date` EST la clé primaire, donc SQLite l'indexe déjà et les
-- balayages BETWEEN s'en servent. Aucune clé étrangère non plus, et surtout
-- pas vers day(date) : une journée n'existe qu'une fois matérialisée, donc la
-- clé forcerait à en créer une pour y peser (§8.2).

weight_goal(                          -- 0006, tranche 8
  id TEXT PK, target_kg REAL NOT NULL,
  mode TEXT NOT NULL,                 -- 'target_date' | 'rate'
  target_date TEXT, rate_kg_per_week REAL,
  defined_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  CHECK (mode IN ('target_date','rate')),                        -- ck_weight_goal_mode
  CHECK ((mode = 'target_date' AND target_date IS NOT NULL
                               AND rate_kg_per_week IS NULL)
      OR (mode = 'rate'        AND rate_kg_per_week IS NOT NULL
                               AND target_date IS NULL)),        -- ck_weight_goal_terms
  CHECK (target_kg > 0),                                         -- ck_weight_goal_target
  CHECK (is_active IN (0,1))                                     -- ck_weight_goal_active
)
CREATE UNIQUE INDEX ux_weight_goal_active
  ON weight_goal(is_active) WHERE is_active = 1;   -- un seul objectif actif
-- Aucune CHECK sur rate_kg_per_week : il est SIGNÉ, et zéro veut dire maintien.
-- ck_weight_goal_terms porte l'exclusivité des deux termes, qui est D9 rendu
-- structurel — l'un des deux se dérive de l'autre (§6.2), donc aucun des deux
-- ne peut coexister avec l'autre sans ambiguïté. Voir §9.9 n° 2.

notification_setting(                 -- 0007, tranche 9 — LIVRÉE
  kind TEXT PRIMARY KEY,              -- 'weigh_in'|'empty_journal'|'daily_summary'|'export_reminder'
  enabled INTEGER NOT NULL DEFAULT 0,
  hour INTEGER, minute INTEGER,
  CHECK (enabled IN (0,1))            -- ck_notification_enabled
)
-- Rangée ici parce que cette section classe par VERSION ; le §7 ordonne par
-- TRANCHE et place les notifications en 9. Différer n'a rien coûté : la table ne
-- porte aucune clé étrangère dans un sens ni dans l'autre, donc 0007 l'a créée
-- entière sans rien reconstruire (§9.9 n° 1).
--
-- UNE SEULE CHECK, et les deux qui manquent sont des refus (§9.13 n° 2 et 3).
-- Aucune sur `kind` : élargir ne casse aucun calcul, la lecture itère sur les
-- quatre sortes du CODE en interrogeant la table par clé — donc une sorte
-- inconnue est inerte — et la tranche 11 en ajoutera une, où une CHECK forcerait
-- une reconstruction. La barrière est la règle `one_of` du catalogue d'export.
-- Aucune sur `hour`/`minute` : une valeur de réglage aberrante se BORNE, à
-- l'aller comme au retour, jamais ne fait échouer un import.
-- Aucun index : `kind` EST la clé primaire. Aucune ligne semée : une ligne
-- absente et `enabled = 0` disent la même chose.
-- Et rien n'enregistre ce qu'iOS tient en attente : c'est dérivable (D9), et
-- iOS est la source de vérité de sa propre file.
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
| `expo-notifications` | Notifications locales | §9.3, minuteur de repos (D14). **[tranche 9] Installée**, et son greffon de configuration est **neutralisé** par `plugins/with-no-aps-environment.js` — il écrit `aps-environment` dans les entitlements, inconditionnellement et sans option, or c'est la capacité Push qu'un compte Apple gratuit n'a pas et que SideStore ne peut pas signer. Une notification **locale** n'en a aucun besoin : `registerForRemoteNotifications` ne vit que dans `PushTokenModule`, atteint seulement par `getDevicePushTokenAsync`, que rien n'appelle ici. **Et un greffon de paquet s'applique tout seul sur le SDK 57** — ne pas le déclarer ne suffit donc pas, contrairement à ce que la tranche 2 avait inscrit (§9.13 n° 8) | oui |
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
| 3 | ~~**Carte corporelle** : ressource graphique et cartographie vers les groupes musculaires~~ | **[tranche 10] Clos.** Regions de `melihcolpan/MuscleMap`, licence MIT, aucune dependance ajoutee — D13 nommait deja cet usage et `react-native-svg` est dans le binaire depuis la tranche 7. Cartographie dans `features/strength/body-map/`, exhaustivite tenue par un test (§9.15 n° 6) |
| 4 | **Heures par défaut des quatre notifications** | **[tranche 9] Proposées et toujours ouvertes** : pesée 7h30, journal vide 20h30, bilan 21h30, export 19h00. Choisies, pas mesurées ; ce sont des réglages pour que la supposition se corrige sans migration (`specs §14.18` n° 7) |
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
**[livrée]** Avec trois amendements à D14 : aucun déclencheur répétitif, le bilan ne planifie que le jour courant, et le rappel d'export calcule ses occurrences à l'avance. Voir §9.13.

### Tranche 10 — Exercices et routines
Base d'exercices, recherche filtrée, blocs, supersets, carte corporelle.
**[livrée]** Avec neuf amendements, dont trois qui comptent : `0008` ne porte que six des onze tables du §2.6, aucune CHECK ne tient les vocabulaires — qu'aucun document ne donnait —, et la carte corporelle clôt le point ouvert n° 3. Voir §9.15.

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
| 5 | §3 | La bibliotheque passe de `app/library/` a `app/(tabs)/(journal)/library/` | A la racine elle recouvrirait la barre d'onglets ; le §7 la decrit comme un endroit ou le Journal mene. Regle qui en sort : consulter est un empilement, ajouter est une modale. **RENVERSE LE 17/09/2026, voir §9.19 n° 3** : elle revient a `app/library/`, ou le §3 la dessinait, et recouvre la barre — ce qui etait le cout devient l'intention. La regle qui en est sortie, elle, tient |
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
| 9 | D13, §3 | `core/charts/` gagne `use-scrub.ts`, `chart-tooltip.tsx` et `barPath`, tous a leur **deuxieme utilisateur reel** | La regle, appliquee a l'heure. Deux graphiques d'un meme ecran repondant differemment a un toucher serait le genre d'ecart que personne ne remarque avant de s'en plaindre. `barPath` existe parce que `rx` sur un `Rect` arrondit les QUATRE coins : sur une barre en deux segments, les coins bas du segment superieur laissent voir celui du dessous, et le recouvrement que ca imposait rendait la barre **impossible a attenuer** -- 35 % de rouge a travers 35 % de vert invente une troisieme couleur |
| 10 | D13 | **`ChartFrame` accepte un SECOND axe, a droite**, sans lignes d'horizon propres | Premiere des « series de natures differentes sur des axes differents » que D13 donne comme la raison meme de faire les graphiques a la main. L'axe de gauche garde les lignes, celui de droite n'etiquette que ses graduations, teinte de la couleur de sa serie pour qu'il ne soit jamais a deviner lequel sert qui. `plotWidthFor` est exporte parce que l'appelant a besoin du meme nombre -- poser ses bandes, borner une infobulle -- et qu'une formule ecrite a deux endroits est libre de diverger le jour ou une gouttiere change |

### 9.9 Tranche 8 (15/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.5 | **`0006` cree `weight_measure` et `weight_goal`, et PAS `notification_setting`** | Le §2.5 range les trois sous « Poids (V2) » parce qu'il classe par VERSION ; le §7 ordonne par TRANCHE et met les notifications en tranche 9. Ils ne se contredisent pas. Et differer ne coute rien, ce qui est le test qui compte : `notification_setting` ne porte aucune cle etrangere dans un sens ni dans l'autre, donc `0007` la creera entiere. Ce n'est pas une table retenue malgre un risque — il n'y a aucun risque a retenir |
| 2 | §2.5 | **`weight_goal` porte deux CHECK que le §2.5 ne declare pas** : `mode IN ('target_date','rate')` et l'exclusivite stricte de ses deux termes | Le mode PILOTE LE CALCUL : il decide quelle colonne est lue et quel chiffre en est derive, donc un troisieme mode tombe a travers chaque branche et produit un rythme plausible et faux. Meme classe que `ck_entry_kind` et `ck_recipe_yield_type` ; a l'oppose de `food_portion.name`, dont elargir le vocabulaire ne casse rien. **L'exclusivite est la decision de cette migration** : le §6.2 fait de l'un des deux termes une valeur DERIVEE de l'autre, or D9 interdit de stocker ce qui se derive — une ligne portant les deux serait soit une entorse a D9, soit une ambiguite sans reponse. La CHECK rend cet etat inexprimable, ce qui vaut mieux qu'une regle que la couche d'ecriture doit se souvenir d'appliquer. Et son autre moitie compte autant : un objectif en mode `rate` sans rythme est un objectif que personne ne peut lire |
| 3 | §2.5, D9 | **`ck_weight_value > 0`**, la ou la tranche 3 avait ecarte toute CHECK sur les macros | Le motif de la tranche 3 ne s'applique pas : il tenait a ce que le §8.5 exige des valeurs Open Food Facts **signalees et jamais refusees**, et a ce que la tranche 4 copie automatiquement en base tout produit logue. Ici il n'y a ni source externe, ni copie automatique, ni chemin ou une valeur arrive sans avoir ete tapee. Un poids nul n'est pas une valeur douteuse a corriger, c'est une valeur impossible — et `value_kg` est le seul contenu de la table. Precedents dans le schema livre : `ck_portion_quantity` et `ck_recipe_yield_value`. Aucune borne haute : ce serait legiferer sur ce qu'un corps peut peser |
| 4 | §2.5 | **Aucune cle etrangere, et `weight_measure.date` ne reference surtout pas `day.date`** | La forme tentante, et elle est fausse : une journee n'existe qu'une fois MATERIALISEE, donc la cle forcerait a creer une journee pour y peser — de la donnee creee par consultation, que le §8.2 interdit. Se peser un jour ou l'on n'a rien logue est parfaitement ordinaire. Un test l'exerce des deux cotes plutot que de le laisser au commentaire |
| 5 | §2.5 | **`ux_weight_goal_active`, index unique partiel sur `is_active = 1`** | Tout l'aval suppose un seul objectif. Sur `day_meal` la tranche 5 avait refuse le meme outil pour une raison qui ne s'applique pas ici : une base en service porte deja les lignes qui le violeraient, alors que **cette table est neuve** — aucune ligne n'existe nulle part, donc l'index se construit toujours. Et il reste la seule partie d'une migration qui s'annule sans rien reconstruire |
| 6 | §3, D9, D13 | **`core/db/date-bucket.ts`** porte `Grain`, `bucketOf`, `nextBucket` et l'expression SQL de regroupement | C'est ici que la regle d'agregation de D9 trouve enfin un client : la plage la plus longue du §8.7 vaut exactement 90, et « au-dela de 90 » n'inclut pas 90, donc la tranche 7 n'y a jamais touche. Le module vit dans `core/db` et non dans une feature parce que **deux features groupent sur les memes seaux** — la courbe groupe `weight_measure`, le graphique croise du §9.4 groupe `journal_entry` — et deux series d'un meme graphique tombant sur des seaux distants de six jours est exactement le defaut que le partage evite. Chaque grain rend une DATE CIVILE, jamais un libelle de periode, pour que rien en aval n'ait a savoir quel grain il regarde |
| 7 | D9, D13 | **Le lundi d'une semaine a deux implementations, tenues par un test** | `date(d, 'weekday 0', '-6 days')` en SQL et `startOfWeek` en TypeScript. Deux implementations d'une meme question sont ce que ce projet retrouve dans ses propres bugs — la fonction de fenetre de la tranche 4 est tenue a `readLastEntryForFood` par la meme forme de test. Comparees date par date sur seize cents dates consecutives : les cas qui casseraient sont les bords d'annee et le dimanche qui ne doit PAS avancer d'une semaine, et aucun des deux ne s'ecrit a la main |
| 8 | D13 | **`scale.ts` gagne `linearScale`, a cote de `verticalScale` et sans la remplacer** | Une barre encode une quantite par sa LONGUEUR, donc son axe doit partir de zero ou l'image ment — et ment dans le sens flatteur. Une ligne encode le changement par sa PENTE : rien en elle n'invite a comparer 78 kg a zero, et sur un domaine de 0 a 80 une perte de trois kilos sur un trimestre occupe quatre pour cent du trace. **Deux fonctions plutot qu'une avec un drapeau** : la version a drapeau est la facon dont un graphique a barres finit par gagner une base non nulle parce que quelqu'un a passe le mauvais argument. Le rembourrage est une PART de l'etendue, jamais un nombre d'unites, et une serie plate retombe sur une bande fixe — sinon d3 rend NaN, que `react-native-svg` dessine comme rien du tout plutot que comme une erreur |
| 9 | D13 | **`ChartFrame` gagne `baseline`, `formatTick` et `formatRightTick`** | La ligne renforcee du pied dit « c'est ici que les barres se tiennent » ; sur une echelle qui ne contient pas zero ce serait un trait epais a une valeur arbitraire, disant ca avec insistance. Le format des graduations etait l'entier en dur, juste pour des kilocalories et FAUX des que les graduations tombent entre deux entiers — sur 76,2 a 76,8, d3 choisit 76,2 / 76,4 / 76,6 et l'arrondi imprimerait « 76 » trois fois, ce qui se lit comme un defaut de rendu. Et l'axe de droite a le SIEN : le propos d'un second axe est qu'il porte une serie d'une autre NATURE, donc un format partage ecrirait « 2 450,0 » a cote de kilos a une decimale |
| 10 | §3 | **L'onglet Stats gagne une pile native**, et `core/ui/stack-header.ts` nait avec elle | Troisieme utilisateur des memes options d'en-tete, ce que `settings/_layout.tsx` avait lui-meme annonce en tranche 5 : « deux piles aux memes options ne sont pas encore un composant, la suivante tranchera ». Elle tranche. Le style de TITRE reste chez chaque pile : le Nunito extra-gras du Journal est une decision, pas un mecanisme que trois piles ont en commun. L'ecran Stats garde `headerShown: false` et son grand titre a lui — une pile ajoutee dessous est du cablage, pas un changement visuel que personne n'a demande. Point ouvert de la tranche 5 ferme |
| 11 | §9.5 n° 11, §9.8 n° 2 | **`progress-ring.tsx` n'est PAS reecrit sur svg, et le report devient definitif** | Renversement consigne plutot qu'oubli. Quatre raisons, et aucune n'est le gout : il marche et **sa geometrie est verifiee sur l'appareil** ; le premier ecran qui le monte est le Journal, donc le reecrire met un risque sur l'ecran d'accueil pour un gain fonctionnel nul ; ses tests portent sur l'arithmetique des deux rotations et sur la distance des pastilles a 37°, arithmetique qui **disparait** avec svg, alors que le rendu d'un graphique n'est teste nulle part — on echangerait du code teste et observe contre du code qui ne l'est ni l'un ni l'autre ; et les seuls gains reels, moins de vues et l'animation, ne sont demandes nulle part |
| 12 | D9, §9.2 | **La regression charge vingt jours pour n'en mesurer que quatorze** | Mesure, pas devinee. Chaque point lisse est une moyenne glissante a sept jours, donc le plus ancien point de la fenetre a besoin des six jours qui le precedent. Charger exactement quatorze ne plante pas : les six premiers points se calculent contre des fenetres courtes, qui sur une serie descendante tombent trop bas, et les ajuster **aplatit la droite**. Sur une perte parfaitement reguliere de 0,7 kg/semaine : `-0,5438` charge a 14 contre `-0,7000` charge a 20, soit **22,3 % trop lent**. Personne ne l'aurait vu — « vous perdez 0,54 kg par semaine » est une phrase parfaitement croyable |
| 13 | D15 | **Le generateur de demonstration pese, et ne PEUT PAS ecraser une pesee reelle** | Sans poids seme, courbes, rythme, ecart et graphique croise sont vides : la moitie de la tranche serait invisible sur l'appareil, exactement ce que la tranche 7 a rencontre avec les modeles. Et un defaut reel, trouve en ecrivant le test : la moitie « journal » du generateur tient gratuitement la promesse du bouton — elle AJOUTE des entrees — la ou `setWeight` est un upsert sur une cle primaire, donc un second appui remplacait chaque pesee reelle de la plage par une valeur inventee. Chaque date est desormais lue avant d'etre ecrite. Le rythme vise seme est deliberement plus raide que la derive semee : un objectif collant a la tendance afficherait un ecart de zero, la seule valeur qui a la meme tete que le calcul marche ou non |

**Reserve inscrite.** Aucune dependance n'entre en tranche 8 : `react-native-svg`, `d3-scale` et `d3-shape` sont dans le binaire depuis `dev-b19`. Donc **aucun cycle CI n'est necessaire**, et le piege du lockfile ne peut pas se presenter, n'y ayant aucune installation. `0006` arrive par Metro comme tout le reste du JavaScript.

**Consequence a connaitre.** Une fois `0006` appliquee, la base de developpement devient plus recente que le binaire quotidien, qui reste a `0005` : un export dev importe dans la quotidienne sera refuse par G3. C'est le comportement voulu, et c'est aussi la raison pour laquelle l'aller-retour export / import merite d'etre refait sur l'appareil — il ne l'a pas ete depuis `0005`, et `0006` porte le total a **six tables non verifiees** dans l'unique filet.

### 9.10 Retours sur le poids (15/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §3, D9 | **`features/weight/domain/weight-prefill.ts`** porte la chaine de reprise, le pas de 0,1 kg et la regle du futur | Trois regles d'affichage et d'ecriture, toutes pures, toutes testables en Node. Elles vivent ensemble parce qu'elles repondent a une seule question — « que propose cette date, et que fait un toucher dessus » — et qu'un ecran qui en implementerait une seule serait celui qui diverge |
| 2 | D9, §9.1 | **La carte, les deux boutons et la fenetre lisent UNE fonction, une seule fois** | Le motif de la tranche 4, applique tel quel : trois chemins vers « la valeur courante » s'accorderaient presque toujours, et le jour ou ils divergeraient **la rangee mentirait sur ce que fait son propre bouton** — les deux nombres etant plausibles, rien ne le signalerait. Chaque test l'assert contre `weightPrefill` et `stepWeight`, jamais contre un litteral |
| 3 | §9.1 | **`WeightPrefill` est un type somme a TROIS cas, pas un nombre nullable** | `measured`, `carried`, `none`. Un `number \| null` aurait suffi a afficher un chiffre et aurait rendu indiscernables **un poids mesure et un poids propose** — la carte n'aurait eu aucun moyen de dire lequel des deux elle montre. C'est la meme distinction que `undefined` contre `null` ailleurs, et elle se paie au meme endroit : un chiffre faux et plausible que personne ne remarque |
| 4 | §9.1 | **`stepWeight` arrondit au dixieme, et ce n'est pas de la cosmetique** | `78.4 - 0.1` vaut `78.30000000000001` en virgule flottante binaire. Stocke tel quel, ce serait un poids a quatorze decimales en base, **exporte tel quel dans l'archive**, et affiche « 78,3 » — donc le chiffre a l'ecran et le chiffre dans le fichier cesseraient d'etre le meme nombre des le premier toucher. Un test le fixe sur douze touchers d'affilee |
| 5 | §2.5, §9.1 | **`stepWeight` est borne par le bas a 0,1 kg** | `ck_weight_value` refuse zero, et une violation de CHECK est une exception SQLite levee — pas un bouton grise. Personne ne descendra depuis 0,1 kg, mais « personne ne le fera » n'est pas une raison de laisser un plantage atteignable, et la borne coute une comparaison |
| 6 | D8 | **`readWeightPrefill` est UNE lecture, pas deux hooks joints dans le composant** | La forme evidente est un hook pour la mesure et un pour la precedente. Elle donnerait a la carte **deux etats `undefined` a reconcilier**, et replier « pas encore » sur « aucune » est le defaut que la tranche 4 a paye deux fois — les molettes de quantite et la liste de portions. Une lecture, un etat d'attente, une reponse |
| 7 | §9.1 | **La regle du futur ne peut pas etre une CHECK, et vit donc a deux endroits** | La carte et l'ecran de saisie la portent tous les deux, et ce n'est pas une redite : l'ecran est une **route**, sa date arrive en parametre de chaine, et le schema d'URL est enregistre — un lien profond peut demander n'importe quelle date. Le troisieme endroit ou elle n'est PAS est la base, deliberement : « dans le futur » change tout seul pendant la nuit, donc une CHECK evaluee a l'ecriture serait silencieusement fausse pour toute mesure qui vieillit |
| 8 | §9.1 | **Une mesure future deja enregistree reste visible partout, y compris sur sa page de Journal** | Corollaire du n° 7, corrige avant livraison : la premiere version masquait tout sur une date future, donc une pesee venue d'une archive disparaissait du Journal tout en restant dans la courbe et dans l'historique. Le Journal aurait ete le seul ecran a faire comme si elle n'existait pas. Elle s'affiche, en lecture seule |
| 9 | §3 | **`today` descend du Journal jusqu'a la carte**, au lieu d'etre relu dedans | Trois pages du carrousel sont montees a la fois : lire `useToday` dans chacune serait trois abonnements a une reponse que l'ecran tient deja. Une source, et le reglage d'heure de bascule deplace les trois ensemble |
| 10 | §9.1, D16 | **Trois cibles tactiles freres, jamais imbriquees** : « − », le chiffre, « + » | Un `Pressable` dans un `Pressable` est le piege que ce projet a deja paye une fois, et il n'y a aucune raison de tester si l'interieur gagne. Le chiffre porte le toucher qui ouvre la fenetre, les deux boutons sont a cote. La boite du chiffre a une **largeur minimale fixe** : un controle qui change de largeur sous un doigt qui le tape en rafale est la seule chose que ces boutons ne doivent pas faire |

**Reserve inscrite, a regarder sur l'appareil.** Un appui sur « − » ou « + » ecrit, le bus invalide, et la requete se relit — le tout en local et synchrone, donc en dizaines de millisecondes. Sur un appui maintenu en rafale, rien ne garantit que l'affichage suive sans battement. Aucun etat optimiste n'a ete pose : ce serait une seconde source de verite pour la meme valeur, exactement ce que le n° 2 ci-dessus existe pour eviter. Si ca bat a l'usage, c'est un retour d'appareil et la reponse sera un regroupement, pas un second chiffre.

### 9.11 Plages du poids et saisie decimale (15/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §9.2, D9 | **`readRangeFor` separe ce qui est LU de ce qui est DESSINE** | Une plage affichee de sept jours se lit sur treize. La rampe de six jours est ce qui donne au premier point dessine une fenetre de lissage pleine ; sans elle il est calcule sur une fenetre courte et tombe trop bas — le biais mesure a 22 % sur le rythme (§9.9 n° 12). Les deux plages sont des valeurs distinctes plutot qu'un drapeau, pour que les jours de rampe ne puissent pas atteindre un axe : le panneau lisse sur la lue, puis coupe a la dessinee |
| 2 | §9.2 | **La rampe vaut zero au-dessus du grain jour** | Un seau hebdomadaire est deja une moyenne de ses jours : il n'y a aucune fenetre glissante a remplir (§9.2 n° 3). `smoothingLead` rend donc 6 ou 0, et jamais un nombre choisi par plage |
| 3 | §9.2, §3 | **`readFirstWeightDate` et `useFirstWeightDate` sont supprimes** | « Tout » etait leur unique appelant, et la plage disparait (specs 14.17). Supprimes plutot que gardes : du code sans appelant est un piege pour qui le rebranchera en le croyant utilise, et le jour ou une plage « tout » revient, c'est six lignes |
| 4 | D9 | **Le grain `month` n'a plus aucun appelant, et la branche reste** | D9 est normative — « par mois au-dela d'un an » — et le calcul doit deja etre juste le jour ou une plage plus longue revient. Mais aucune plage offerte ne depasse 365, donc rien ne l'atteint. Un test le dit explicitement, pour qu'un lecteur ne le deduise pas lui-meme et qu'une suppression « de code mort » soit un acte delibere |
| 5 | **§3, §4** | **`core/ui/decimal-input.tsx`** — un champ numerique dont l'etat est le TEXTE tape | **Defaut livre, reproduit puis corrige en cinq endroits.** Lier un champ a un nombre — `String(valeur)` a l'affichage, `parseDecimal` a la frappe — ne perd pas seulement le separateur, il DEPLACE LES CHIFFRES : taper « 1,2 » laisse « 1 » apres la virgule, puis « 12 ». Un virgule deux gramme devient douze. Plausible, faux, invisible. Atteignable sur les quatre macros d'un aliment, la quantite d'une portion, celle d'un ingredient, le rendement d'une recette et une ligne ajustee |
| 6 | §4 | **L'etat se corrige PENDANT le rendu, jamais dans un effet** | `DecimalInput` doit suivre une valeur qui change de l'exterieur — un aliment qui se charge, des lignes qui se re-echelonnent — sans ecraser ce qui est en train d'etre tape. Il compare la valeur entrante a ce que son propre texte PARSE : apres « 1, » les deux valent 1, donc rien n'est touche. La correction se fait pendant le rendu, qui est la reponse de React a exactement ca et la regle que ce projet a apprise deux fois — un effet tourne apres que son rendu a ete peint, donc le champ montrerait le texte perime une image puis vacillerait |
| 7 | §3 | **`MacroFieldRow` n'a PAS bouge ; c'est son appelant qui a ete corrige** | Le fichier nommait deja le fautif : « the editor as numbers on a draft, free entry as the strings that were typed — **and the string is the one that can be shared** ». La saisie libre tenait du texte et etait juste ; l'editeur d'aliment tenait des nombres et etait faux. Il tient desormais quatre chaines a cote du brouillon, ecrites ensemble dans `setMacro` pour qu'elles ne puissent pas deriver. Zero changement sur une rangee partagee et verifiee sur l'appareil |

**Audit consigne.** Tout champ decimal restant tient deja du texte — saisie libre, quantite, objectifs de repas et de modele, poids, objectif de poids. `recipe.prepMinutes` reste lie a un nombre et n'est pas concerne : son clavier est `number-pad`, qui ne porte aucun separateur, donc le defaut n'y est pas atteignable.

### 9.12 Un formulaire ne se fige plus sur une valeur perimee (15/09/2026)

Signale a l'usage : modifier un aliment de la bibliotheque, l'enregistrer, puis
le rouvrir affichait les valeurs d'AVANT la modification. Sortir et revenir une
seconde fois donnait les bonnes.

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | D8, §3 | **`core/query/use-settled.ts`** — la premiere valeur d'une requete sur laquelle un formulaire a le droit de se figer | Trois pieces, dont aucune n'est fausse seule : enregistrer navigue en arriere dans le `onSuccess` de la mutation, **donc l'ecran est demonte tout de suite** ; le bus regroupe a 60 ms, donc il invalide APRES, sur une requete devenue **inactive** — React Query la marque perimee et ne la relit pas, personne ne la regardant ; a la reouverture il sert d'abord la valeur EN CACHE et lance une relecture derriere. Le formulaire se figeait sur cette premiere valeur, et ignorait la fraiche arrivee un instant plus tard |
| 2 | D8 | **Ce n'est pas un defaut d'affichage** | Un formulaire ouvert sur une valeur perimee puis ENREGISTRE la reecrit par-dessus la valeur courante. Corriger le nom d'un aliment aujourd'hui, le rouvrir pour corriger sa marque, et ses macros repartent a ce qu'elles etaient ce matin. Rien ne le dit, et l'export emporte le resultat. C'est ce qui fait que ca se corrige et ne se signale pas seulement |
| 3 | D8 | **`isStale` est la bonne question ICI, et c'est un couplage a dire** | Le client pose `staleTime: Infinity` — delibere, « il n'y a pas de serveur, pas d'autre ecrivain, pas de synchronisation ». Donc `isStale` ne veut pas dire « vieux » : il veut dire EXACTEMENT « le bus a signale un changement sur une table que cette requete lit, et elle n'a pas ete relue depuis ». Avec un `staleTime` fini, tout serait perime tot ou tard et aucun formulaire ne se remplirait jamais — raison pour laquelle le hook vit a cote du client qui le rend vrai |
| 4 | §4 | **L'etat est ajuste PENDANT le rendu, jamais dans un effet** | Un effet tourne apres que son rendu a ete peint : le formulaire serait vide une image puis se remplirait. Meme regle que le `key` du carrousel et les molettes de la tranche 4 |
| 5 | D8 | **Il ne change jamais d'avis** | Une fois une valeur fraiche rendue, c'est celle-la pour la vie de l'ecran. Sinon une ecriture faite depuis ce formulaire lui reviendrait et ecraserait ce qui est en train d'etre tape — exactement ce que les drapeaux `loaded` protegeaient |
| 6 | §3 | **Sept ecrans corriges, pas un** | Le patron « drapeau `loaded` + effet qui capte la premiere donnee » etait partout : editeur d'aliment (rapporte), saisie libre, editeur de recette, editeur de modele, editeur de repas, ecran de quantite, saisie du poids. Tous rouvrables apres edition, tous capables de reecrire l'ancienne valeur |
| 7 | §3 | **`meal-editor` et `quantity` prennent la valeur figee a un seul endroit** | Le premier derive son repas d'une requete de journee qui sert aussi a decider quels TYPES sont encore libres : la faire attendre offrirait brievement les quatre, ce qui est un vacillement la ou la valeur perimee etait inoffensive. Le second initialise ses molettes depuis `initial` dans un initialiseur d'etat — ce qui les a empechees de tourner en s'ouvrant en tranche 4 — donc ce qu'il recoit au montage est ce qu'il garde |

**Ce que le test peut et ne peut pas dire.** Le hook ne se rend pas depuis Node. Ce
qui est fixe est la DECISION, sortie en fonction pure : une valeur signalee par
le bus est refusee, une valeur fraiche est acceptee, `undefined` n'est jamais
une reponse et `null` en est une. La sequence des trois rendus d'un ecran
rouvert est jouee telle quelle. Ce qu'il faudra regarder sur l'appareil est le
battement : le formulaire attend desormais la relecture, ce qui sur SQLite local
se compte en dizaines de millisecondes — et c'est deja ce que chaque ecran fait
a froid.

---

### 9.13 Tranche 9 (15/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | §2.5 | **`0007` cree `notification_setting` seule**, avec UNE seule CHECK : `enabled IN (0,1)` | Le report de la tranche 8 a tenu exactement ce qu'il promettait (§9.9 n° 1) : aucune cle etrangere dans un sens ni dans l'autre, donc la table est creee entiere sans rien reconstruire. Aucun index — `kind` EST la cle primaire. Aucune ligne semee — une ligne absente et `enabled = 0` disent la meme chose, et le lecteur rend le defaut pour les deux, donc une installation qui n'ouvre jamais l'ecran garde la table vide et n'emporte rien dans son export |
| 2 | **§2.5** | **AUCUNE CHECK sur `kind`**, contrairement a `journal_entry.kind` et `weight_goal.mode` | Le critere de la tranche 3 applique honnetement : la ligne n'est pas la probabilite qu'un ensemble bouge, c'est CE QU'UN ELARGISSEMENT CASSERAIT. `journal_entry.kind` en porte une parce qu'elargir casse l'invariant d'agregation ; `weight_goal.mode` parce qu'il decide quelle colonne est lue et produit sinon un rythme plausible et faux. Ni l'un ni l'autre ici : rien n'est somme, rien n'est derive. **Et la lecture ITERE SUR LES QUATRE SORTES DU CODE en interrogeant la table par cle**, donc une ligne de sorte inconnue est une ligne que rien ne lit — inerte structurellement, pas par soin. Ecrite dans l'autre sens, le schema aurait DU porter une CHECK. Enfin l'elargissement est PREVU : la tranche 11 met le minuteur de repos sur une notification locale, ou une CHECK forcerait une reconstruction de table pour une valeur d'enumeration. La barriere est la regle `one_of` du catalogue d'export, qui s'execute avant la premiere insertion et nomme table, ligne et colonne — la barriere FORTE au sens de `food_portion.name` |
| 3 | §2.5 | **Aucune CHECK sur `hour` ni `minute`**, la ou SQLite en permettrait une | `setting` ne pouvait pas en porter, etant cle/valeur TEXT ; ici c'est possible, et la possibilite ne change pas le critere. Ce projet repond partout a une valeur de reglage aberrante en la BORNANT, a l'aller comme au retour — `normalizeCutoffHour`, `normalizeAdherenceTolerance` — et une archive reparee a la main portant 25 h doit s'importer et se relire a 23, jamais echouer sur une contrainte. L'heure et la minute retombent chacune de son cote : faire retomber les deux sur le defaut jetterait une heure vraiment choisie |
| 4 | **D14** | **Aucun declencheur repetitif**, alors que D14 les dit « preferes partout ou c'est possible » | **Contradiction interne a D14, tranchee.** Le meme paragraphe demande l'annulation immediate des que la condition est satisfaite. Un declencheur repetitif est UNE entree en file : l'occurrence de demain ne s'annule pas sans tuer toutes les suivantes. Le plafond de 64 qui motivait la preference n'est pas approche — quatre sortes sur sept jours font vingt-huit. La question se reposera en tranche 11, ou le minuteur de repos ajoute une cinquieme sorte |
| 5 | **D14** | **Le bilan de fin de journee ne planifie que l'occurrence du jour** | D14 enonce « planification anticipee sur 7 jours » comme si les quatre sortes anticipaient pareil. Le bilan ne le peut pas : son texte EST les chiffres du jour, et ceux de demain n'existent pas. Le rappel d'export, lui, anticipe MIEUX que les autres et seul a le pouvoir — `last_export_at` ne bouge que si l'application tourne, donc les jours en retard sont connus d'avance et les autres ne sont jamais programmes. Voir `specs §14.18` n° 1 et 6 |
| 6 | **D8, D14** | **Le bilan est reprogramme par la VALEUR de ses chiffres, jamais par un filtre de date** | Le point le plus delicat de la tranche. D14 veut une reprogrammation a chaque ecriture concernant la journee courante et surtout pas sur une date passee ; le bus invalide par predicat de table et ne dit rien de la date (D8) ; et ecrire une invalidation a la main est un interdit absolu. La discrimination n'est donc pas faite a l'ecriture : la requete compose les chiffres du jour, le bus l'invalide sur tout changement de `journal_entry`, elle se relit — une ecriture sur aujourd'hui donne un autre texte et le diff reprogramme, une ecriture sur une date passee donne le meme texte et le diff ne trouve rien a faire. La regle de D14 est obtenue comme consequence de la donnee qui n'a pas bouge. Cout : un rafraichissement pour rien, celui que le bus assume deja par ecrit |
| 7 | D14 | **Personne n'annule jamais une notification** : elle est annulee en n'etant plus dans le plan | `applyPlan` est un diff entre le plan voulu et ce qu'iOS tient, sur des identifiants `<sorte>:<date>` stables. L'alternative — un `cancel` au site d'ecriture du poids — serait un second endroit qui connait les regles, libre de diverger de `buildPlan`, et le desaccord se lirait comme un rappel qui sonne apres qu'on s'est pese. **Le diff ne touche qu'aux identifiants dont le prefixe est une de nos quatre sortes** : sans cette clause il annulait tout ce qui etait en attente et non desire, minuteur de repos de la tranche 11 compris, au milieu d'une seance et sans que rien le signale |
| 8 | **§5, D14** | **`expo-notifications` installee, et son greffon NEUTRALISE par un greffon local** | **La croyance de la tranche 2 est fausse, et le pre-vol l'a attrapee.** La tranche 2 avait ecrit que le greffon d'`expo-sharing` ne s'execute pas parce qu'il n'est pas declare dans `plugins`. Il s'execute : sur le SDK 57 un config plugin de paquet est AUTO-APPLIQUE, et si `expo-sharing` n'a jamais ajoute sa cible c'est que `withShareExtension` est inerte sans `props.ios.enabled`, qui vaut false par defaut. L'effet etait vrai, la cause etait fausse. Mesure : `expo prebuild` avec rien de declare ecrit `aps-environment: development` dans `Suivi.entitlements` — la capacite Push, qu'un compte gratuit n'a pas et que SideStore ne peut pas signer, la forme exacte de l'echec du test B. D'ou `plugins/with-no-aps-environment.js`, declare EN DERNIER pour s'executer apres ce qu'il defait. Verifie : dict vide, et `NSCameraUsageDescription` survit |
| 9 | §5 | **Une notification LOCALE ne demande aucun entitlement**, seulement une autorisation a l'execution | Lu dans la source du paquet, pas de memoire. `registerForRemoteNotifications` ne vit que dans `PushTokenModule.swift`, atteint seulement par `getDevicePushTokenAsync` ; le subscriber AppDelegate autolinke n'implemente que des rappels passifs ; et l'effet d'auto-enregistrement importe avec le paquet sort immediatement faute d'information stockee. Rien ici n'appelle ces chemins, donc APNs n'est jamais touche |
| 10 | §5 | **La justification d'`expo-camera` inscrite en tranche 4 etait fausse**, et sa declaration reste juste | Mesure en retirant sa declaration puis en relancant le pre-vol : `NSCameraUsageDescription` est ecrite quand meme, avec le texte anglais par defaut du paquet. Il n'y avait pas de plantage a eviter. Ce que la declaration achete est le TEXTE francais, ce qui suffit — mais la raison inscrite etait la mauvaise, et c'est la meme qui a failli livrer un entitlement trois tranches plus tard. Corrigee sur place |
| 11 | D3, D14 | **Le declencheur est CALENDAR, jamais DATE** | Lu dans `TriggerRecords.swift` : `DateTriggerRecord` construit `UNTimeIntervalNotificationTrigger` depuis `timeIntervalSinceNow` — un delai en secondes fige a la planification, qui derive au changement d'heure et leve si l'instant est passe. Seul CALENDAR produit un vrai `UNCalendarNotificationTrigger`, apparie sur des composantes murales. Une occurrence porte donc `year/month/day/hour/minute` et pas seulement son instant : c'est D3 a la frontiere native, et la raison pour laquelle `addDays` existe |
| 12 | §3, D14 | **`features/notifications/native/` est la seule porte vers iOS**, et un test de conventions le tient | `expo-notifications` ne s'importe que de la. Meme dispositif que la frontiere zod, pour un probleme plus tranchant : zod au mauvais endroit coute une seconde declaration du schema ; une dependance NATIVE au mauvais endroit coute UN CYCLE CI pour etre diagnostiquee, le bundle JS restant vert pendant que l'ecran plante. C'est aussi ce qui a permis d'ecrire et de verifier sur Metro les etapes 1 a 6 sur le binaire deja installe, et de ne payer qu'un seul cycle |
| 13 | D15 | **La moitie de cette tranche n'est pas testable, et c'est dit plutot que laisse croire** | Testable : les conditions contre un vrai fichier SQLite, la selection des occurrences et leurs dates sous trois fuseaux, le texte du bilan, qu'une ecriture sur une date passee ne le change pas, le diff et son idempotence, le compte d'occurrences sous 64, la normalisation des heures, la presence du greffon de retrait. **Non testable** : qu'iOS declenche quoi que ce soit, que l'autorisation arrive au bon moment, que le plafond se comporte comme documente, que l'annulation atteigne la file, que le texte tienne dans la banniere. Le planificateur est exerce contre un hote factice, ce qui fixe la TAXONOMIE de ce qu'on demande a iOS et non qu'iOS l'honore — exactement la limite du client Open Food Facts contre un `fetch` injecte |

**Reserve levee le 15/09/2026 :** une notification locale programmee par l'application a ete **recue sur l'appareil**. Le greffon neutralise a donc passe le build CI et la signature SideStore — ce que le pre-vol ne pouvait pas dire, `expo prebuild` ne produisant qu'un fichier. Ce qui reste non exerce sont les **conditions** (annulation quand on s'est pese, chiffres du soir dans le bilan), c'est-a-dire la moitie capable de produire un resultat faux et plausible.

**Reserve inscrite.** `expo-notifications` est la premiere dependance native ajoutee depuis `expo-camera`, et elle porte la meme consequence : **le binaire de developpement doit etre reconstruit**. Le bundle JS ne contient pas son module natif, donc `npm run bundle:ios` reste vert pendant que l'ecran planterait sur l'appareil. Tout le reste de la tranche — la migration `0007`, la table, l'ecran de reglages, les conditions, le texte du bilan, l'export — est verifiable par Metro **sans** reconstruire, ce qui est precisement pourquoi le natif est la derniere etape : un seul cycle CI au lieu de plusieurs.

**Le piege du lockfile a mordu une SIXIEME fois**, a l'installation d'`expo-notifications` : zero liaison rolldown dans le lockfile au lieu de quinze. Reconstruit par `rm -rf node_modules package-lock.json && npm install --ignore-scripts`, puis verifie par le seul controle qui vaille, celui que fait la CI : `rm -rf node_modules && npm ci --ignore-scripts`.

**Consequence a connaitre.** Une fois `0007` appliquee, la base de developpement devient plus recente que le binaire quotidien, qui reste a `0006` : un export dev importe dans la quotidienne sera refuse par G3. C'est le comportement voulu. Et l'aller-retour export / import n'a toujours pas ete refait sur l'appareil depuis `0005` — `0007` porte le total a **sept tables non verifiees** dans l'unique filet.

---

### 9.14 Retours sur les Reglages (15/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **§3, §12** | **Une route par categorie de reglage** sous `app/(tabs)/settings/`, et `notifications/` devient un dossier avec son index et sa route `[kind]` | Demande explicite. Le §3 dessine `settings.tsx` en fichier unique et cette arborescence a deja diverge en tranche 5 ; elle diverge de nouveau, dans le meme sens et pour la meme raison — consulter est un empilement. Le dossier avec index suit le precedent de `settings/templates/` : les quatre sortes se poussent par-dessus la liste, et une route feuille ne pousse rien |
| 2 | **D16, D10** | **`core/ui/settings-list.tsx`** porte `SettingsPage`, `SettingsSection`, `SettingsCard`, `SettingsNote`, `ChoiceRow` et `LinkRow` | La regle du second utilisateur, appliquee : ces pieces etaient privees a `settings-screen.tsx` depuis la tranche 7, ce qui etait juste tant qu'un seul ecran s'en servait. Le decoupage leur donne six utilisateurs reels dans DEUX features — chaque sous-page et les deux ecrans de notification. Sorties telles quelles plutot que redessinees : leur espacement est celui de `DataSection`, ecrit avant elles et que ces pages cotoient ; un « rangement » au passage aurait fait cohabiter deux groupes espaces differemment sur une meme page |
| 3 | **§5.4** | **`describeAge` descend de `data-section.tsx` vers `features/backup/domain/export-age.ts`** | Meme regle, meme motif : la rangee Donnees de l'index enonce l'anciennete et la page derriere la redit en entier. Deux orthographes d'un meme chiffre seraient libres de diverger, et celle qui derive est celle qu'on lit d'un coup d'oeil. Le domaine est deja pur et teste, donc c'est l'endroit |
| 4 | **DEFAUT CONSTATE SUR L'APPAREIL** | **Une molette pilotee par une valeur qui fait l'aller-retour en base revient a sa position puis tourne toute seule** | Constate a l'usage, diagnostique dans le code. La premiere version alimentait le `Picker` directement depuis la requete : `value` venait de `notification_setting`, `onChange` y ecrivait. Tourner la molette faisait alors ceci — elle bouge, `onChange` ecrit, et React rend de nouveau avec l'ANCIENNE valeur, l'ecriture devant traverser SQLite et le bus groupant 60 ms avant d'invalider. React Native commande consciencieusement le picker a la valeur qu'on lui a donnee. Un instant plus tard la nouvelle arrive et la molette traverse toute seule jusqu'a elle. **Un `UIPickerView` n'est pas un champ de texte : il ANIME vers le `selectedValue` qu'on lui tend**, donc une valeur controlee qui passe par une base ne peut pas en piloter un. C'est la regle de la tranche 4 — « les molettes restent l'unique source de verite, ce qui est tape atterrit DESSUS » — arrivant par l'autre bout : la molette possede la valeur tant que l'ecran est ouvert, et la base est ecrite en consequence. La valeur de depart est prise UNE fois, **pendant le rendu** qui l'a en premier, jamais dans un effet — un effet tourne apres que son rendu a ete peint, et c'est exactement ainsi que les molettes de quantite s'etaient mises a tourner en s'ouvrant |
| 5 | §9.3 | **Une page par sorte de notification**, ce qui retire la molette de la liste | Demande explicite d'un second defaut d'affichage, et le remede est structurel plutot qu'un reglage. Une molette est un controle natif de 180 points ; depliee au milieu d'une liste qui defile, elle n'a ni la place ni le voisinage qu'il lui faut. Sur une page a elle, elle est simplement un element de la disposition — rien en dessous a bousculer, rien au-dessus qui la fasse passer sous un en-tete transparent. **Reserve inscrite** : le defaut d'affichage a ete rapporte et non observe ici, donc ce qui est certain est que cette disposition supprime la cause la plus probable (un picker qui deborde de sa rangee sur la rangee suivante) ; la confirmation appartient a l'appareil |

---

### 9.15 Tranche 10 (16/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **§2.6** | **`0008` porte six tables sur onze** : `exercise`, `exercise_secondary_muscle`, `routine`, `routine_warmup_step`, `routine_block`, `routine_line`. `session`, `session_segment`, `session_block`, `session_set` et `exercise_note` attendent `0009` | Le §2.6 decrit toute la V3 d'un bloc ; le §7 ordonne par tranche et interdit une couche batie « pour plus tard ». **Differer ne coute rien, et le test est la DIRECTION des cles etrangeres** : `session_set.exercise_id` est declaree dans `session_set`, que `0009` creera entiere contre un `exercise` deja la. Idem `exercise_note.exercise_id` et les trois index que ces tables portent. Le seul cas qui aurait coute est l'inverse — une table de `0008` referencant `session` — et il n'existe pas. C'est l'argument de `notification_setting` differee de `0006` a `0007`, mot pour mot |
| 2 | **§2.6** | **Aucune CHECK sur `set_type`, `primary_muscle`, `muscle` ni `equipment`** | Le critere de la tranche 3 n'est pas la mobilite d'un ensemble mais **ce qu'un elargissement casserait**. Le volume du §10.1 porte une clause POSITIVE — « sur les séries de travail validées uniquement », donc `WHERE set_type = 'work'` — la ou le `SUM` de `journal_entry.kind` n'a aucune clause et n'est juste que parce que l'ensemble est ferme. Un cinquieme type de serie est simplement exclu d'un total dont la definition l'exclut ; rien ne devient plausible et faux. Et les vocabulaires de muscles et de materiel ne sont donnes par **aucun document** : ils sont inventes en tranche 10, n'ont jamais rencontre un exercice reel, et sont le candidat le plus probable au changement de tout le schema. La tranche 3 avait refuse une CHECK sur `food_portion.name` pour huit mots que les specs DONNAIENT ; refuser ici est a fortiori. La barriere est la regle `one_of` du catalogue d'export, qui tourne avant la premiere insertion et nomme table, ligne et colonne |
| 3 | **§2.6** | **`routine_line.exercise_id` est en `ON DELETE NO ACTION`**, et la suppression d'un exercice est portee par une transaction explicite | Le §2.6 ne donnait aucune action, donc le defaut SQLite — qui **bloque** la suppression, ce que le §5.3 interdit. Precedent exact : `recipe_ingredient.food_id`, ou `deleteFood` fige puis supprime. **La cle etrangere est le filet, la transaction est la politique.** Ce qui decide contre le CASCADE est la phrase d'a cote du §5.3 : « un avertissement nommant explicitement ce qui sera perdu ». Pour nommer, il faut compter d'abord ; un cascade ferait le travail en silence et l'avertissement devrait deviner. **Consequence nettoyee dans la meme transaction** : retirer la derniere ligne d'un bloc laisse un bloc vide, que la page afficherait comme une rangee inexplicable |
| 4 | **§2.6** | **Deux cles etrangeres ajoutees a ce que le §2.6 ecrit** : `exercise_secondary_muscle.exercise_id` et `routine_warmup_step.routine_id`, toutes deux en CASCADE. Et `routine_warmup_step.position` et `.text` deviennent `NOT NULL` | Rigueur inegale du §2.6, corrigee plutot que suivie : ses tables soeurs `routine_block` et `routine_line` portent une cle, celles-la non, et `recipe_step` porte les `NOT NULL` que `routine_warmup_step` omet. Le cout n'est pas symetrique — sans la cle, supprimer un exercice laisse des lignes qu'aucune barriere ne verrait, et la barriere 3 de l'import fait tourner `foreign_key_check`. Meme famille que `day_meal` sans unicite face a `food_portion` avec |
| 5 | **§3** | **`app/exercise/[id].tsx` et `app/routine/[id].tsx` vivent sous `app/(tabs)/training/`**, dossier simple et non groupe | Le §3 les dessine a la racine. Poussees de la, elles seraient soeurs de `(tabs)` et **recouvriraient la barre d'onglets**, emportant la minimisation iOS 26 — l'erreur exacte que la tranche 3 a corrigee en deplacant la bibliotheque de `app/library/` vers `app/(tabs)/(journal)/library/`. Quatrieme application du motif qui a produit `(journal)`, `settings/` et `stats/` : NativeTabs ne fournit pas d'en-tete et une route feuille ne pousse rien |
| 6 | **D13, §6 n° 3** | **Point ouvert clos : la carte corporelle est sourcee** sous MIT, et son viewBox est une CONSTANTE mesuree a l'extraction | D13 nommait deja cet usage — « le meme outil sert la carte corporelle, qui est un SVG dont on colore les traces » — et `react-native-svg` est dans le binaire depuis la tranche 7 : **aucune dependance, aucun cycle CI**. On prend les donnees d'un SDK SwiftUI, pas son code. **Le viewBox ne se calcule pas a l'execution**, et c'est la donnee qui l'a impose : une region porte `a2.05 2.05 0 1.92-2.71`, un arc reclamant sept nombres la ou il en offre cinq, ses deux drapeaux d'un chiffre colles a ce qui suit de facon indecidable. Les deux lectures placent le bord droit de la figure de face a 150 unites d'ecart, et la plus large chevauche la figure de dos |
| 7 | **§3** | **`core/search/fold.ts`** et **`core/ui/swipe-to-delete-row.tsx`** (avec `swipe-settle.ts`) rejoignent `core` | La regle du second utilisateur reel, appliquee a deux pieces qui l'avaient deja franchie. `SwipeToDeleteRow` l'avait franchie en **tranche 8**, quand `weight-history-screen.tsx` l'a importe depuis `features/nutrition/components/` — import inter-domaines ecrit, livre, et consigne nulle part. Le pliage la franchit maintenant : un exercice se cherche par son nom comme un aliment. **Ce qui ne part PAS est le bareme** : `scoreFood` reste dans la nutrition, parce qu'un classement appartient a ce qu'il classe — « danone » cherche une marque, « poulie » un materiel |
| 8 | **§4** | **Aucun test de conventions n'interdit les imports inter-domaines**, et c'est une decision | Il serait faux. `stats` est transversal par definition, `notifications` lit ses conditions dans la nutrition et le poids, `backup` lit `settings`, et tout le monde lit `settings`. Ce qui etait anormal dans le cas `SwipeToDeleteRow` n'etait pas l'import mais qu'un composant d'interface **generique** vive dans un domaine — et cette distinction n'est pas decidable mecaniquement : `WeightCard` sur la page du Journal est un import inter-domaines parfaitement sain. Une liste d'exceptions qui commence a un element est un test qui dit « sauf quand non » |
| 9 | **D9** | **`set_index` est derive de l'ordre du tableau a l'ecriture**, jamais porte par le brouillon | Une ligne deplacee ou retiree renumerote tout ce qui suit, et une copie stockee devrait etre mise a jour en quatre endroits. Meme raison pour `position` : un tableau porte deja un ordre, et deux sources pour un ordre est la facon dont une liste finit par se contredire. Dans un superset A/B a trois series, les lignes sont groupees par exercice et les index valent 1,2,3,1,2,3 — la routine est une liste a LIRE, c'est la seance de la tranche 11 qui decidera de l'ordre d'execution. **RENVERSE LE 17/09/2026, voir §9.18 n° 1** : la derivation de `set_index` et de `position` depuis le tableau reste ; ce qui tombe est le groupement par exercice |

---

### 9.16 Retours sur les routines (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **§2.6** | **`0009` ajoute `exercise.tracks_duration` et `routine_line.duration_seconds`** | Demande explicite (specs §14.21 n° 1). `0009` et non une fusion dans `0008`, et l'asymetrie decide seule : les deux formes — NOT NULL avec defaut, et nullable — sont exactement ce qu'`ALTER TABLE ADD COLUMN` accepte, donc differer coute une entree de journal. Reecrire `0008` changerait son horodatage, et une installation qui l'aurait deja appliquee verrait une migration en attente, tenterait de recreer six tables et echouerait au demarrage |
| 2 | **D6/G2** | **La regle de la tranche 3 coupe dans les DEUX sens, et ca s'est verifie ici** | Une CHECK `duration_seconds > 0` avait ete ecrite. La generation a montre pourquoi elle ne peut pas partir : SQLite ne sait pas ajouter une CHECK, donc drizzle-kit est retombe sur une RECONSTRUCTION de `routine_line` — et la reconstruction produite etait cassee, son `INSERT ... SELECT` lisant `duration_seconds` depuis l'ancienne table qui ne l'a pas encore. « Une migration porte ce qui ne peut pas s'ajouter plus tard » veut donc dire aussi : le moment de poser une CHECK etait `0008`, et il est passe. La valeur est tenue par `validateRoutineDraft`, ou vivent deja le `non_empty` de `food.barcode` et la positivite de `weight_measure.value_kg` |
| 3 | **§2.6** | **`routine_line.rest_seconds` n'est plus ecrite**, le bloc portant le repos dans toutes les formes | La colonne reste : elle est au §2.6, figee depuis `0008`, et une archive ecrite par la premiere version de la tranche en porte une. `restForBlock` la lit en repli — les lignes que cette application n'a pas ecrites sont affichees, jamais corrigees |
| 4 | **D9, D13** | **`features/strength/domain/muscle-volume.ts`** porte la ponderation et les paliers | Le comptage est une regle d'entrainement, pas de stockage : un `GROUP BY` qui pondere primaires et secondaires differemment appartient a une fonction pure testable sans base. Deux requetes rendent les lignes, la somme se fait en memoire. **Le piege que le test de base attrape** : une ligne de muscle secondaire existe une fois par EXERCICE, donc une jointure qui ne passe pas par `routine_line` compte trois developpes couches comme une seule serie indirecte |
| 5 | **§4 (jetons)** | **`muscleLight` et `muscleMid`** rejoignent la palette, dans les deux themes | Les paliers intermediaires de la carte. Ce sont l'accent DESATURE VERS LA SURFACE, pas trois couleurs sans rapport : la carte nuance une quantite, donc ses paliers doivent se lire comme une echelle, et un changement de teinte dirait que les muscles different en nature plutot qu'en quantite. En sombre ils vont vers la surface et non vers le blanc — sinon le muscle le moins travaille serait le plus lumineux de la figure |

---

### 9.17 Retours sur l'edition d'une routine (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **DEFAUT CONSTATE** | **`pointerEvents="box-only"` empechait tout champ d'une rangee balayable de prendre le focus** | Rapporte a l'usage — « les inputs ne marchent pas » — et diagnostique dans le code. `box-only` veut dire : la couche prend le toucher et RIEN a l'interieur n'en recoit jamais. C'etait juste tant que chaque appelant confiait du TEXTE a `SwipeToDeleteRow` et laissait `onPress` porter la pression ; ca a cesse de l'etre quand un appelant y a mis des CHAMPS. La couche n'avale donc le toucher que lorsqu'elle a de quoi faire : une rangee ouverte, ou une rangee a qui on a donne un `onPress`. **Reserve inscrite** : un champ peut encore prendre le focus au relachement d'un balayage, son responder n'etant pas arbitre contre le pan — supportable la ou un `Pressable` ne l'etait pas, focaliser un champ ne detruisant rien |
| 2 | **DEFAUT CONSTATE** | **Un champ numerique lie au brouillon perd son separateur decimal** | Meme cause que le defaut du champ de poids en tranche 8, et le commentaire de `set-table.tsx` decrivait le remede sans l'appliquer. « 6, » se parse en 6, se rend « 6 », et la virgule disparait sous le curseur. Le texte est desormais un etat local, ajuste PENDANT le rendu quand une valeur entrante dit autre chose que lui — jamais dans un effet, qui tourne apres que son rendu a ete peint |
| 3 | **§3, D10** | **`features/strength/components/routine-body.tsx`** porte les blocs d'une routine, lus ou edites | Consequence du §14.22 n° 1 : une page en deux etats demande UN composant, sinon les deux etats derivent. Il porte aussi le nom et l'echauffement — chaque partie d'une routine n'est dessinee qu'une fois. `routine-editor-screen.tsx` ne sert plus qu'a la CREATION |

---

### 9.18 Retours sur la page d'une seance (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **D9, §9.15 n° 9 RENVERSE** | **`routine_line.position` est l'ordre d'EXECUTION**, donc un superset est stocke entrelace, et `set_index` est le numero de TOUR | Demande explicite (specs §14.23 n° 1). Ce que le §9.15 n° 9 gardait reste vrai : rien n'est stocke dans le brouillon, un tableau porte deja un ordre, et deux sources pour un ordre est la facon dont une liste se contredit. Ce qui tombe est le groupement par exercice, et l'argument qui le portait se refutait lui-meme — un superset n'a pas d'autre ordre d'execution que l'alternance. **Les tours sont DERIVES** : le tour d'une ligne est son rang pour son propre exercice, ce que `setIndexOf` calcule deja depuis le tableau, et l'ordre a l'interieur d'un tour est l'ordre d'apparition des exercices dans le bloc. **Consequence gratuite, et c'est elle qui evite une migration** : une routine stockee groupee par exercice se lit en tours corrects telle quelle, et se reecrit entrelacee a la prochaine sauvegarde |
| 2 | **DEFAUT CONSTATE** | **`routine_line.duration_seconds` etait relue partout et ecrite nulle part** | Trouve en touchant la table de projection de `writeContents`, pas par un ecran en echec. La colonne ajoutee par `0009` n'a jamais figure dans l'`INSERT` : les 45 s d'un gainage etaient acceptees par le tableau, enregistrees, et perdues. **Rien d'autre ne pouvait l'attraper** — la lecture rendait fidelement le `null` qu'elle avait elle-meme ecrit, donc l'aller-retour etait coherent et faux. Un test le fixe desormais par la valeur, pas par la symetrie |
| 3 | **§10.4, D9** | **La regle de progression est ECRITE au bloc et STOCKEE a la ligne** | Demande explicite de retirer la fleche qui la portait (specs §14.23 n° 2). `blockProgression` est une lecture derivee — vrai si **toutes** les series de travail du bloc la portent — et non une colonne de plus : le §10.4 definit la regle par ligne, la tranche 12 la lira par ligne, et stocker un second etat au bloc serait la valeur derivee que D9 refuse. Les echauffements et les drop sets sont exclus de l'ecriture : un echauffement qui monterait de 2,5 kg par semaine a cesse d'en etre un |
| 4 | **D16, §3** | **Le nom d'un exercice est cliquable dans les DEUX etats de la page**, et un superset porte un nom par exercice | Le retrait pendant l'edition protegeait un brouillon qui n'etait pas menace : un `push` laisse l'ecran precedent **monte** — c'est la raison d'etre des evenements de focus d'un navigateur — donc l'etat `Mode` survit a la visite. Consequence de disposition : le titre du bloc devient une liste de noms, chacun prefixe de la lettre que ses lignes portent |
| 5 | **D10, D16** | **La page d'une seance prend la forme de Hevy**, et ce qu'on lui emprunte s'arrete a la disposition | Demande explicite (specs §14.23 n° 4). Rien de natif n'est en cause et aucune bibliotheque n'entre : ce sont des `View` et des `Text` du projet, avec les jetons du projet. **Aucun jeton de couleur ajoute** — la pastille d'un numero de serie prend le fond de la PAGE, qui la creuse dans la carte, plutot qu'une sixieme couleur que la palette devrait justifier |
| 6 | **§3** | **`blockTitle` est supprimee de `routine-text.ts`** | Plus aucun appelant : le titre d'un bloc est desormais la liste de ses exercices, dessinee par `routine-body.tsx`, chacun etant sa propre destination. Une fonction morte avec un test qui la garde est pire qu'aucune des deux — le test ferait croire qu'elle est en service |

---

### 9.19 Retours sur la navigation et le schema corporel (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **§8.7, §9.2** | **Les deux volets de Stats ouvrent sur 7 jours**, et la valeur est epinglee par un test qui passe par la rampe de lissage | Demande explicite (specs §14.24 n° 1). Le test n'assert pas la constante seule : ce qui rend une semaine honnete cote poids est que la LECTURE soit plus large que le DESSIN, faute de quoi six de ses sept points lisses viendraient de fenetres courtes — le biais de 22 % mesure en tranche 8. Epingler la constante sans epingler ca laisserait le defaut revenir par `smoothingLead` |
| 2 | **DECISION RENVERSEE** | **Le decalage de defilement survit a un changement de volet**, et `scrollTo` disparait de l'ecran Stats | Demande explicite (specs §14.24 n° 2). Le retour en haut etait defendu par un vrai risque — atterrir a un decalage que le panneau qui arrive ne peut pas remplir — et le risque etait plus petit que le cout : iOS borne un tel decalage au bas du nouveau contenu, donc la page est defilee et non fausse. Ce qui disparait avec lui est la seule raison pour laquelle cet ecran tenait une `ref` sur sa `ScrollView` |
| 3 | **§3, §9.3 n° 5 RENVERSE** | **`app/library/` remonte a la racine**, avec sa propre pile, et recouvre la barre d'onglets | Demande explicite (specs §14.24 n° 4). Le §3 la dessinait la depuis le debut ; la tranche 3 l'avait descendue dans la pile du Journal en nommant exactement la consequence — soeur de `(tabs)`, elle recouvre la barre et emporte la minimisation iOS 26. **Ce qui change est le signe de cette consequence** : la bibliotheque n'est pas une page du Journal, c'est ou vivent les fiches, et chacun de ses ecrans est une tache ; couvrir la barre est ce qui le dit. Une pile a elle plutot que trois ecrans declares a la racine, sur le precedent de `settings/`, `stats/` et `training/` : la pile racine ne montre aucun en-tete et ces trois ecrans portent chacun un titre et un retour. `headerBackButtonDisplayMode: 'minimal'`, l'ecran precedent etant le groupe d'onglets, qui n'a pas de titre a ecrire sur un bouton retour |
| 4 | **§7, D8** | **L'onglet Journal ramene a aujourd'hui par `RequestedDateProvider`**, qui monte au-dessus des onglets | Demande explicite (specs §14.24 n° 3). Pas une seconde facon de dire au Journal quel jour montrer : le carrousel garde la date, la demande est consommee une fois, rien ne persiste. Le fournisseur remonte parce qu'un declencheur d'onglet est declare dans la disposition des onglets, au-dessus de la pile du Journal. **L'horloge est lue AU MOMENT DE L'APPUI** et non par `useToday`, qui est gele contre l'horloge a dessein : c'est l'arbitrage du planificateur de la tranche 9 — un acte vise le jour qu'il est, un libelle garde le jour qu'il avait |
| 5 | **RESERVE INSCRITE** | **L'ecoute est posee sur CHAQUE appui de l'onglet, pas seulement quand il est deja actif** | La forme restreinte est l'idiome iOS et collerait a la demande au mot pres. Elle repose sur `navigation.isFocused()` a l'interieur d'`unstable-native-tabs`, qu'aucun test en Node ne peut exercer et qu'aucun appareil n'est disponible pour essayer — et son mode de panne est le **silence**, une fonctionnalite qui n'arrive simplement jamais. Consequence assumee et ecrite : revenir d'un autre onglet atterrit aussi sur aujourd'hui |
| 6 | **DEFAUT CONSTATE** | **`(modals)/exercise-edit` et `(modals)/routine-edit` n'etaient pas declarees dans la pile racine** | Le piege de la tranche 5, troisieme occurrence, trouve en ouvrant ce fichier pour y declarer la bibliotheque. Une route non declaree sous `(modals)/` prend le defaut de la pile — une carte opaque poussee par la DROITE — sans erreur ni avertissement, pendant qu'`OverlayPanel` la leve correctement sans que personne puisse le voir. Les deux fenetres de la tranche 10 glissaient donc lateralement la ou les cinq autres montent du bas |
| 7 | **§10.1, D9** | **`muscleRoles` vit dans `exercise-draft.ts`**, et `BodyMapView` gagne un second mode de nuance | Demande explicite (specs §14.24 n° 5). Le role est une lecture d'un brouillon, donc du domaine — le §4 garde le calcul hors des composants. Deux modes plutot qu'un detournement du volume : `volume` repond « combien de travail », `roles` repond « quelle part », et un appelant donne l'un ou l'autre. Faire passer un principal pour dix series pondérées aurait nuance correctement et fait dire « 10 series » a l'infobulle |
| 8 | **§10.6** | **La region touchee est cernee**, epaisseur en unites de viewBox | Demande explicite (specs §14.24 n° 6). Le trait est de 12 **unites** et non de points : les figures font environ 1 270 unites de haut et c'est la hauteur en points qui contraint l'echelle, donc une unite vaut `height/1270` de point et douze valent pres de deux points a toutes les tailles ou cette carte est dessinee. De l'arithmetique, parce que rien ici ne peut etre regarde. Couleur du TEXTE et non de l'accent : le remplissage est deja une nuance d'accent, et un contour de la meme teinte par-dessus n'est pas un contour |

---

### 9.20 Retours sur le clavier et le defilement (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **DEFAUT CONSTATE** | **Ne pas defiler ne suffit pas a garder sa place : il faut la remettre** | Le §9.19 n° 2 avait retire le `scrollTo` et cru la question close. Elle ne l'etait pas, et le cas manquant est la premiere visite d'une plage : un volet en chargement rend un indicateur, la page raccourcit, iOS borne le decalage — ce qui est correct et **irreversible**, personne ne se souvenant d'ou elle etait. `onContentSizeChange` est l'evenement qui dit « la page vient de faire cette hauteur », donc exactement la question posee ; un delai devine ne l'aurait jamais ete |
| 2 | **DEFAUT INTRODUIT PAR §9.19 n° 3** | **La racine d'une pile ne dessine aucun bouton retour**, et la bibliotheque en avait besoin d'un | Dans sa propre pile il n'y a rien derriere elle ; le parent qui a le groupe d'onglets derriere lui montre `headerShown: false`. Une pile imbriquee etait le premier reflexe, sur le precedent de `settings/`, `stats/` et `training/` — et ces trois-la sont dans un ONGLET, ou aucun retour n'est attendu de leur ecran d'accueil. Les trois ecrans de la bibliotheque sont donc declares a plat sur la pile racine. `headerBackTitle: 'Journal'` parce que l'ecran precedent est le groupe d'onglets, qui n'a pas de titre a preter |
| 3 | **DIRECTION iOS 26** | **Le bouton de retour demande « en verre » est celui du systeme**, et c'est la regle prise du bon cote cette fois | La demande disait « style liquid glass ios26 ». Un `GlassButton` dans un en-tete est du verre dans du verre, ce que la direction iOS 26 nomme deja et que la tranche 3 a pris du mauvais cote une fois. Un bouton de barre natif EST un `UIBarButtonItem`, et c'est a ses propres controles qu'UIKit applique le materiau : le demander revient a ne rien dessiner soi-meme |
| 4 | **§3, D10** | **`core/ui/reveal.ts`** porte l'arithmetique du defilement, et `useFormScroll` la cable | Un `.tsx` qui importe react-native est hors de portee de la suite Node — l'index du framework est du Flow que rolldown refuse — donc un calcul laisse dans un composant est un calcul que **rien** ne verifie, et rien ne dessine un clavier en Node. Le §4 le demandait deja ; ici c'est en plus le seul moyen que ces nombres soient jamais controles. Neuf tests, dont celui qui compte : un champ deja degage rend **zero**, ce qui est ce qui rend l'appel sur le focus ET a l'arrivee du clavier non conflictuel |
| 5 | **§4, D16** | **Un champ numerique selectionne son contenu au focus, un champ de texte non**, et le clavier decide | Demande explicite (specs §14.25 n° 5). Le critere n'est pas le formulaire mais l'acte : un nombre est remplace, un mot est corrige. Pose dans `FormInput`, donc aucune rangee n'a a le declarer et aucune ne peut l'oublier ; un appelant peut toujours dire le contraire |
| 6 | **DEFAUT CONSTATE** | **`autoFocus` + `selectTextOnFocus` ne selectionnaient pas la quantite pre-remplie**, contrairement a ce que la tranche 4 avait inscrit | Rapporte a l'usage. Le raisonnement de la tranche 4 — « la valeur existe avant le champ, donc c'est le cas ou la paire marche » — a un trou : iOS applique `selectTextOnFocus` au debut de l'edition, et une valeur **controlee** est ecrite dans le champ apres, ce qui pousse le curseur a la fin. Lequel des deux atterrit en dernier ne nous appartient pas. La selection est donc ENONCEE a la frame suivante, ce qui est exactement le remede que la tranche 3 avait trouve pour ce meme champ |
| 7 | **§4** | **`FormRow` devient pressable, sauf en `flush`** | Demande explicite (specs §14.25 n° 6). Toujours une `Pressable`, jamais une seulement quand un champ s'est inscrit : un champ s'inscrit depuis un effet, donc le type d'element changerait apres le premier rendu, React demonterait le sous-arbre et emporterait le texte en cours de frappe. **L'exception `flush` n'est pas un contournement** : ce marqueur veut deja dire « un controle a besoin de toute cette rangee », et celui qui le demande est un `UIPickerView` avec ses propres reconnaisseurs — une `Pressable` JavaScript autour d'un controle natif qui defile est la seule imbrication sans contrepartie ici |

---

### 9.21 Retours sur le chargement, l'abandon et le clavier (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **D16** | **`PANEL_LOADING_MS` = 500**, et `useMinimumVisible` gagne son deuxieme appelant | Demande explicite (specs §14.26 n° 1). Le nombre est un choix, pas une mesure, donc il vit dans un module du domaine avec son motif a cote — comme les seuils de la carte corporelle. **Ce qui rend l'ajout gratuit** est la propriete que la tranche 3 avait ecrite dans ce hook : le plancher n'est impose qu'une fois l'attente COMMENCEE, donc une plage deja en cache s'affiche a la premiere image sans indicateur du tout |
| 2 | **DEFAUT CONSTATE** | **Un indicateur qui dure moins qu'un battement est pire que pas d'indicateur** | Deuxieme occurrence du meme defaut, et la premiere etait le carrousel de la tranche 3. La regle generale se degage : **tout ecran dont le contenu est remplace par une requete a ce probleme**, et il ne se voit qu'a la visite ou rien n'est en cache — c'est-a-dire jamais pendant qu'on developpe, ou tout a deja ete lu |
| 3 | **§8.4a, D10** | **`OverlayPanel` prend `onRequestClose`**, et `useRequestClose` devient distinct de `useDismiss` | Demande explicite (specs §14.26 n° 2). La distinction n'est pas une commodite : `useDismiss` est ce qu'un ecran appelle quand il a **fini** — routine creee, quantite confirmee, aliment enregistre — et le brancher sur le garde demanderait d'abandonner les lignes qu'on vient d'ecrire. Le garde couvre les deux **sorties** et aucune **arrivee**. Sans garde, les deux hooks sont le meme, ce qui est pourquoi rien n'avait eu a les distinguer jusqu'ici |
| 4 | **§8.4a** | **Garde, un glissement de fermeture REMET la fenetre avant de demander** | Pas « fermer puis annuler » : il n'y a rien a annuler une fois la fenetre repliee, et une fenetre qui part et revient est une plus mauvaise reponse qu'une qui n'est jamais partie. Le drapeau est une **valeur partagee** et non la prop lue dans le worklet : le geste tourne sur le fil d'interface et ne voit d'une prop que ce qui a ete capture a sa construction, or un panier qui se remplit pendant que la fenetre est ouverte doit armer le garde |
| 5 | **DIRECTION iOS 26, §3** | **`core/ui/keyboard-bar.tsx`** porte la barre, avec deux utilisateurs reels le premier jour | Demande explicite (specs §14.26 n° 4). Le pave numerique et la navigation de formulaire dessinaient chacun la leur ; elles doivent etre la meme barre, donc elles le sont. Aucune dependance n'entre : `GlassView` est au §5 depuis la tranche 3. **`GlassContainer` a ete essaye et repart** — le conteneur est la bonne piece pour un GROUPE de controles de verre, et une barre d'accessoire n'en est pas un : c'est une capsule unique dont les controles sont le contenu |
| 6 | **RESERVE INSCRITE** | **Une barre d'accessoire reste une reconstruction**, meme batie avec les bons composants | iOS n'en expose aucune a demander — ni par React Native, ni par UIKit hors d'une vue web, d'ou vient celle de Safari. Ce qui se partage avec le systeme est desormais le **materiau et sa composition** ; la disposition, les libelles et les proportions sont dessines ici. Dit plutot que laisse croire, comme la tranche 3 l'a fait pour le balayage de suppression et le retour par glissement. **`GlassButton` a gagne un `disabled`, l'a perdu avec les capsules, et le reprend avec elles** — une API sans appelant etait un piege, elle a un appelant maintenant |
| 7 | **§14.25 n° 1 CORRIGE** | **On empeche la page de retrecir plutot que de restaurer le decalage apres coup** | Le premier remede marchait et se VOYAIT (specs §14.26 n° 5). Celui-ci ne bouge rien : pendant qu'un volet recharge, le conteneur garde une hauteur minimale egale a celle qu'il avait, donc iOS n'a jamais rien a borner. **Le volet dit quand relacher** — `onReady`, appele a la fin du plancher de son propre indicateur — parce qu'il est le seul a savoir s'il attend, et qu'un delai devine serait un troisieme nombre a maintenir. La hauteur n'est mesuree que hors plancher : mesuree sous lui, elle enregistrerait le plancher et le tiendrait pour toujours |
| 8 | **DEFAUT CONSTATE, D13** | **Le carrousel du Journal montrait un jour voisin, et parfois la couture entre deux** | Rapporte deux fois, et la premiere correction n'a pas suffi — ce qui en fait la lecon. Deux mouvements devaient s'annuler dans le meme instant : trois pages commises par React, et un decalage porte par une valeur partagee vers le fil d'interface. **Les deux canaux ne sont pas ordonnes l'un par rapport a l'autre**, donc le faire dans un effet de disposition etait faux, le faire pendant le rendu etait moins faux, et aucun des deux n'etait juste |
| 9 | **D13** | **Un carrousel ne recentre pas sa bande : il compte ses pas** | La sortie est de retirer le mouvement cote fil d'interface plutot que de tenter de le synchroniser. Le decalage est CUMULATIF — il ne revient jamais a zero — et un compte de pas en **etat React** le compense, donc la liste des pages et le decalage qui la place sont poses par le meme `setState` et voyagent dans le meme commit. Au moment du pas, la valeur partagee ne bouge pas du tout : il n'y a plus rien a desaccorder. Prix : un geste part de la ou la bande se trouve, `event.translationX` comptant depuis le doigt. Gratuit : sauter a une date ne touche ni l'un ni l'autre, donc ce chemin ne peut pas clignoter non plus |
| 10 | **D13** | **`useAnimatedStyle` livre par le canal de Reanimated meme quand sa dependance vient de React** | Le trou de la correction precedente du carrousel, et il n'est ecrit nulle part dans la documentation de la bibliotheque. Mettre le compte de pas en etat React ne suffit pas : l'etat voyage dans le commit, le style calcule a partir de lui voyage ailleurs. **La seule facon de faire voyager une transformation avec les enfants est d'en faire une prop de style ordinaire sur une vue ordinaire.** D'ou deux vues : l'exterieure porte le pas en style React, l'interieure porte le geste en valeur partagee, et les transformations se composent. Au moment du pas, on ne demande plus rien au fil d'interface |
| 11 | **DIRECTION iOS 26** | **Une capture d'ecran a tranche ce que quatre conjectures n'avaient pas tranche** | La demande disait « comme les barres natives iOS 26 », puis « recherche comment elles sont faites ». Les deux ont produit des reponses defendables et fausses, parce que la question portait sur une FORME et qu'aucune source textuelle ne la donne. **Trois details qu'aucune description ne contenait** : pas de bouton de verre dans la capsule (verre dans du verre, un cran plus bas que la regle de l'en-tete), des glyphes dans la couleur du texte et non de l'accent, et une coche plutot que le mot « OK ». Regle qui en sort : sur une question de forme, demander l'image avant de deviner quatre fois |
| 12 | **DEFAUT CONSTATE, DIRECTION iOS 26** | **`InputAccessoryView` peint un fond que rien dans l'arbre React ne peut atteindre** | Le fond uni derriere la capsule n'etait pas dessine par l'application. Lu dans la source de React Native plutot que devine : le composant prend une prop `backgroundColor` et la passe telle quelle a `RCTInputAccessoryComponentView`, qui en peint sa vue de contenu — et rien dans la documentation du composant n'annonce qu'une barre a un fond par defaut. **Corollaire general** : un conteneur natif peut peindre sous ce qu'on lui confie, donc « aucun fond dans mon style » ne veut pas dire « aucun fond ». La valeur est exportee par `keyboard-bar.tsx`, parce qu'elle fait partie de ce a quoi cette barre ressemble et non du cablage de chaque accessoire |
| 13 | **DEFAUT CONSTATE** | **Peindre la vue qui DEFILE et non celle qui est rembourree laisse la fenetre a nu sous le clavier** | Le fond blanc derriere la barre du clavier, cherche trois fois au mauvais endroit — dans la barre, puis dans l'accessoire natif, puis dans le conteneur de RN. Il n'etait dans aucun des trois : `behavior="padding"` garde la `KeyboardAvoidingView` a pleine hauteur et remonte le contenu par sa propre marge, donc la `ScrollView` se retrecit et la bande du clavier n'est plus peinte par personne. **La fenetre n'a aucun fond pose** — constat de la tranche 5, autour de la fenetre du calendrier, ou il paraissait ne se corriger que nativement au prix d'un cycle CI. Vu par en dessous il se corrige en JavaScript : on peint la vue rembourree, pas celle qui se retrecit. Cinq ecrans portaient la meme construction |

---

### 9.22 Retours sur les pages d'exercice (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **§3, D10** | **`features/strength/components/exercise-body.tsx`** porte un exercice, lu ou edite | Demande explicite (specs §14.27 n° 1). Meme forme que `routine-body.tsx` et pour la meme raison : une page en deux etats demande UN composant, sinon les deux etats derivent. `exercise-editor-screen.tsx` ne sert plus qu'a la CREATION, comme son jumeau des routines |
| 2 | **§4, D9** | **`sameExerciseDraft` et `sameRoutineDraft`** decident s'il y a quelque chose a perdre | Demande explicite (specs §14.27 n° 3). Ecrites **champ par champ** plutot que par une egalite profonde : la question est « y a-t-il quelque chose a perdre », et une comparaison generique y repondrait sur des champs que personne n'a choisi de garder — y compris celui qu'on ajoutera ensuite. Le test nomme donc chaque champ du brouillon, parce que le defaut qu'il garde est un champ ajoute et oublie ici, que rien d'autre n'attraperait. **Deux details qui ne se devinent pas** : `incrementKg` se compare comme la CHAINE qu'elle est — « 2,5 » et « 2.5 » se parsent pareil et ne sont pas la meme chose a retaper — et `exerciseName` est deliberement absent, etant porte pour l'affichage et venant de l'exercice |
| 3 | **§10.1, D16** | **L'edition coupe le retour natif et le balayage** | Plutot que d'intercepter `beforeRemove` pour contredire un geste deja commence — ce que la pile native fait mal, et ce qui produit une fenetre qui part et revient. Ne pas offrir la sortie est plus simple que la reprendre, et laisse exactement les deux fins honnetes d'une edition |
| 4 | **RESERVE INSCRITE** | **Les deux fenetres de CREATION ne demandent rien** | Un brouillon neuf abandonne par un balayage vers le bas est perdu sans question, la ou une modification en pose une. Assume plutot qu'oublie : la demande portait sur « si je modifie », et `OverlayPanel` a deja le garde qu'il faudrait (`onRequestClose`, ecrit pour le panier) le jour ou ca se sentira |

---

### 9.23 Retours sur les notes (17/09/2026)

| No | Section | Amendement | Motif |
| --- | --- | --- | --- |
| 1 | **§4** | **`FormInput` traite `multiline` comme un changement de nature, pas comme une option** | Demande explicite (specs §14.28 n° 1). Alignement a gauche, taille de texte de paragraphe, une hauteur minimale de deux lignes et **aucune hauteur fixe** — c'est l'absence de hauteur qui laisse le champ grandir. Et surtout **jamais `flex`** : dans une colonne il s'etirerait jusqu'au parent au lieu de son propre contenu, ce qui est exactement le contraire du but |
| 2 | **§3, D9** | **Les quatre notes montent sur `ExerciseListItem`** | Demande explicite (specs §14.28 n° 2). Meme motif que `tracks_duration` en tranche 10, et il faut le redire parce qu'il est le seul qui autorise ca : elles viennent de la **meme ligne et de la meme requete**, donc les porter ne coute rien, et la page d'une routine les montre pour chaque bloc qu'elle dessine. Lire un exercice par bloc serait le cout par rangee que la tranche 4 a rencontre quand l'ajout rapide est passe aux quelques centaines de lignes de la bibliotheque. `ExerciseView` les perd de sa propre declaration : elle etend l'element de liste |
| 3 | **§10.2** | **Les notes sont affichees et jamais editables depuis la routine** | Une note appartient a l'exercice : la modifier depuis une routine la modifierait pour toutes celles qui l'utilisent, depuis un ecran qui n'en dit rien. Le chemin vers elles existe deja et il est nomme — toucher le nom de l'exercice ouvre sa page (specs §14.23 n° 3) |
