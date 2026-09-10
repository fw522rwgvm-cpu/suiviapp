# Spécifications fonctionnelles — Application personnelle de suivi nutrition / entraînements / mesures

**Version du document :** 2.2
**Date :** 10/09/2026
**Statut :** complet, aligné sur le document d'architecture technique v1.0
**Remplace :** specs v2.1

> **Ce qui change depuis la v2.1.** Aucune évolution du périmètre fonctionnel. Cette version intègre les **treize modifications** rendues nécessaires par la session de définition d'architecture : des trous de spécification comblés, des règles de calcul rendues non ambiguës, et deux fonctions dont l'implémentation s'est révélée impossible telle que décrite. Chaque modification est repérée par la mention **[v2.2]** et récapitulée au §14.3.

---

## 1. Contexte et objectif

Application iOS personnelle, **mono-utilisateur**, sans compte, sans backend, destinée au suivi quotidien de :

1. L'alimentation (macronutriments)
2. Les mesures corporelles (poids)
3. Les entraînements sportifs (musculation, endurance)

L'application n'a pas vocation à être distribuée. Elle est conçue pour un seul utilisateur, sur un seul appareil, sans authentification ni synchronisation de comptes.

---

## 2. Contraintes et cadre de livraison

| Contrainte | Valeur retenue |
| --- | --- |
| Plateforme | iOS uniquement |
| Version minimale | iOS 18 |
| Appareils | iPhone seul |
| Framework | Expo (React Native) |
| Langue de l'interface | Français uniquement |
| Poste de développement | **Pas de Mac** |
| Compte Apple | Compte gratuit, adhésion payante exclue |
| Installation | **SideStore** (sideloading) |
| Stockage | 100 % local sur l'appareil |
| Réseau | Requis pour Open Food Facts et, en V4, intervals.icu |

### 2.1 Résultats des tests de faisabilité

Tests exécutés le 09/09/2026 sur iPhone 15, iOS 26.6.1.

**Test A — chaîne de production : VALIDÉ.**
Compilation sur runner macOS GitHub Actions, production d'une IPA non signée via `CODE_SIGNING_ALLOWED=NO`, signature et installation par SideStore. L'application se lance et fonctionne.

**Test B — HealthKit sur compte gratuit : ÉCHEC.**
Le fichier `.entitlements` généré par la CI contient bien `com.apple.developer.healthkit`, et `NSHealthShareUsageDescription` est présente dans l'`Info.plist`. Malgré cela, l'appel à `requestAuthorization` retourne :

```
Error Domain=com.apple.healthkit Code=4
"Missing com.apple.developer.healthkit entitlement."
```

**Conclusion : SideStore retire l'entitlement HealthKit à la signature, un compte Apple gratuit ne pouvant pas le porter.** L'accès à HealthKit est définitivement hors de portée dans ce cadre de distribution.

### 2.2 Chaîne de production de l'application

Un compte Apple gratuit n'ouvre pas l'accès au portail de provisioning : ni EAS Build ni Xcode Cloud ne peuvent signer pour un appareil physique dans ce cadre.

**Chaîne validée :** compilation sur un runner macOS GitHub Actions produisant une **IPA non signée**, puis signature sur l'appareil par SideStore avec l'Apple ID gratuit.

Conséquences à assumer :

- **Le certificat expire tous les 7 jours.** SideStore le renouvelle automatiquement, mais l'application doit tolérer un arrêt forcé à tout moment sans jamais perdre d'état non enregistré. Cette contrainte justifie à elle seule la persistance continue de la séance de musculation en direct (§10.3).
- **Trois applications sideloadées au maximum** et dix App IDs par période de 7 jours. **[v2.2]** Deux de ces emplacements sont désormais réservés : une installation de développement et une installation quotidienne portant les vraies données, avec des identifiants d'application distincts. SideStore occupe généralement le troisième.
- **Pas de compilation locale.** Chaque build natif passe par la CI, avec cinq à quinze minutes de latence par itération. **[v2.2]** Expo Go est écarté : le développement se fait sur un build de développement sideloadé (voir document d'architecture, décision 1).
- **Le risque de perte de données n'est pas l'expiration du certificat** — SideStore rafraîchit sans réinstaller et le conteneur survit. **[v2.2]** Le risque réel est la **réinstallation** : rotation d'App ID, changement d'identifiant d'application, restauration de l'iPhone. Elle vide le conteneur sans avertissement.
- **Dépendance à la version d'iOS.** Le mécanisme de rafraîchissement de SideStore a déjà été cassé par des mises à jour d'iOS. Les mises à jour automatiques doivent rester désactivées, et la version validée notée.

### 2.3 Capacités iOS disponibles et exclues

**Disponibles et utilisées :** notifications locales, accès caméra, Data protection, Keychain.

**Exclues :** HealthKit *(échec constaté au test B)*, iCloud sous toutes ses formes, notifications push distantes, App Attest, domaines associés.

**[v2.2] Les tâches d'exécution en arrière-plan sont écartées.** Elles ne sont pas nécessaires : toutes les conditions des notifications sont réévaluables au moment où l'application tourne (§9.3).

**[v2.2] iOS interdit à l'application d'écrire hors de son bac à sable sans action explicite de l'utilisateur.** Aucun export automatique vers iCloud Drive ou un dossier externe n'est possible. Cette contrainte est structurante pour §5.4.

---

## 3. Périmètre par version

### 3.1 V1 — Nutrition

- Objectifs de macros et modèles de journée
- Journal alimentaire quotidien
- Base d'aliments personnelle + Open Food Facts
- Scan de code-barres
- Recettes
- Thèmes
- Tableau de bord statistiques (volet nutrition)
- Export / import JSON
- Les quatre onglets de navigation sont en place, ceux non pourvus affichant un état vide explicite

### 3.2 V2 — Poids et notifications

- Saisie manuelle du poids et historique
- Objectif de poids, courbe lissée, écart au rythme visé
- Notifications locales
- Tableau de bord : volet poids

### 3.3 V3 — Musculation

- Base d'exercices, routines, séances en direct, progression, statistiques par exercice
- Tableau de bord : volet musculation

### 3.4 V4 — intervals.icu

- Tirage des activités d'endurance depuis intervals.icu — **unique source de ces données**
- Écran de consultation des activités
- Éventuel tirage du poids, sous réserve de vérification (§13)

---

## 4. Utilisateur et cas d'usage

**Profil :** sportif pratiquant la musculation et un sport d'endurance, suivant sa nutrition, équipé d'une montre COROS.

**Cas d'usage par ordre de fréquence :**

1. **Logger un repas** — plusieurs fois par jour, souvent en cuisine ou à l'extérieur, en moins de 15 secondes. *C'est le cas d'usage dimensionnant toute l'ergonomie.*
2. **Consulter le restant des macros** — plusieurs fois par jour, en un coup d'œil.
3. **Saisir et consulter son poids** — une fois par jour, au réveil.
4. **Enregistrer une séance de musculation** — plusieurs fois par semaine.
5. **Créer / modifier un aliment ou une recette** — occasionnel, tolère plus de friction.
6. **Créer / modifier une routine de musculation** — occasionnel.
7. **Consulter la tendance de poids** — hebdomadaire.
8. **Consulter les statistiques musculation et activités** — occasionnel.

---

## 5. Principes transverses

Ces règles s'appliquent à toute l'application et priment sur les spécifications d'écran.

### 5.1 Règles de calcul nutritionnel

- **Macros suivies :** protéines, glucides, lipides, kcal. **Aucun micronutriment**, aucune fibre, aucun sucre, aucun sel. Ce périmètre est volontairement fermé.
- **Cohérence des kcal :** la valeur calorique d'une source est **conservée telle quelle**. L'application calcule en parallèle la valeur théorique `4 × P + 4 × G + 9 × L` et **affiche un avertissement non bloquant si l'écart dépasse 10 %**. Cette valeur théorique n'est jamais stockée.
- **Unités de base :** `g` et `ml`, **étanches**. Aucune conversion, aucune densité.
- **Arrondis à l'affichage :** protéines, glucides et lipides à **une décimale** ; kcal en **entier**. Les calculs internes se font en pleine précision.
- **Poids des aliments :** toujours exprimé **cru et non préparé**. Aucun coefficient de cuisson. L'écart est absorbé par le rendement des recettes.

### 5.2 Principe de figeage

L'historique n'est jamais réécrit rétroactivement :

- Les macros d'une **entrée de journal** sont figées au moment de l'enregistrement.
- Une **journée** est un snapshot du modèle appliqué.
- Une **séance de musculation** est un snapshot de la routine au démarrage.

**[v2.2] Précision normative.** Une entrée de journal fige les **macros de référence pour 100 unités de base**, accompagnées de la quantité et de l'unité — et non le seul total consommé. C'est cette forme qui rend l'édition sans limite de temps (§5.3) réellement possible : une entrée reste modifiable indéfiniment sans jamais consulter la base d'aliments.

### 5.3 Intégrité des données

- **Supprimer un aliment consommé** est autorisé. Les entrées passées demeurent intactes.
- **Supprimer un aliment utilisé comme ingrédient** est autorisé. La ligne d'ingrédient est conservée sous forme **figée** : nom et macros gelés, plus de lien vers la base.
- **Aucune limite temporelle d'édition.**
- Aucune suppression n'est bloquée ; aucune notion d'archivage n'existe.

**[v2.2] Une exception d'interface, sans blocage.** Supprimer un **exercice** possédant des séances affiche un avertissement nommant explicitement ce qui sera perdu : graphiques de progression, records personnels, historique de l'exercice. Les séances passées conservent le nom figé de l'exercice, mais la continuité statistique est rompue définitivement. C'est la seule suppression de l'application qui détruise réellement quelque chose. La suppression reste autorisée après confirmation.

**[v2.2] Distinction entre modification et suppression.** Modifier un aliment **met bien à jour** les recettes qui l'utilisent : une recette est un objet vivant, pas de l'historique (§8.6). Seule la suppression gèle.

### 5.4 Export et import

- **Export JSON complet**, couvrant l'intégralité des données locales.
- **Import JSON** restaurant un export antérieur.
- Déclenchés manuellement depuis les Réglages, partagés via la feuille de partage iOS.
- L'export porte un **numéro de version de format**, afin qu'un import détecte et refuse un format incompatible. **[v2.2]** Ce numéro est **distinct** de la version interne du schéma de base : une évolution interne ne doit pas invalider les archives antérieures.
- C'est l'unique mécanisme de sauvegarde. **Sa criticité augmente en v2.1** : le poids n'existe plus nulle part ailleurs qu'en local. Une perte de l'appareil sans export récent est une perte sèche.

**[v2.2] Quatre précisions.**

1. **L'import remplace intégralement la base.** Aucune fusion n'est proposée. L'opération est atomique : la base courante reste intacte jusqu'à la bascule finale.
2. **Le cache Open Food Facts n'est pas exporté**, étant intégralement reconstructible.
3. **Les médias d'illustration d'exercices ne sont pas exportés** (§6.3). Ce sont des fichiers, pas des données. Les Réglages doivent le dire explicitement. Après un import, un média absent affiche un substitut ; l'application ne doit jamais planter pour cette raison.
4. **Un second filet de sécurité existe** : le dossier de données de l'application est visible dans l'app Fichiers, et un bouton « préparer une copie » consolide la base pour permettre une copie manuelle du fichier. Ce chemin, lui, emporte les médias.

**[v2.2] Indicateur d'ancienneté.** Les Réglages affichent dès la V1 la date du dernier export, mise en évidence au-delà d'un délai. Une quatrième notification locale prend le relais à partir de la V2 (§9.3).

---

## 6. Modèle de données fonctionnel

Description conceptuelle, non normative. Le schéma normatif figure dans le document d'architecture.

### 6.1 Nutrition

**Aliment**
- Nom, marque (optionnel), code-barres (optionnel)
- Origine : `perso` | `openfoodfacts`
- Macros de référence : protéines, glucides, lipides, kcal
- Unité de base : `g` | `ml`
- **[v2.2]** Les macros sont **stockées sous forme canonique, pour 100 unités de base**. La quantité de référence choisie par l'utilisateur est conservée comme **préférence de saisie et d'affichage**, sans valeur normative.
- Liste de **portions** nommées, le nom étant choisi parmi : tranche, portion, cuillère à soupe, cuillère à café, morceau, entier, bol, verre
- **[v2.2]** Chaque portion porte obligatoirement une **quantité en unité de base** (une tranche = 25 g). Sans elle, une portion n'est pas calculable. **Le nom d'une portion est unique par aliment.**
- Favori : oui / non
- Dates de création et de modification

**Recette**
- Nom, tags, étapes de préparation, temps de préparation
- Liste d'**ingrédients** : référence à un Aliment + quantité + unité
- **Rendement** en portions ou en poids total, ce dernier **saisi manuellement**
- Macros **toujours calculées** depuis les ingrédients
- Favori : oui / non

**Modèle de journée**
- Nom
- Liste ordonnée de **repas types**, chacun portant ses propres objectifs de macros
- Objectifs du jour : **somme des objectifs des repas**, jamais saisis directement ni stockés

**Planning**
- Association `jour de la semaine → modèle de journée`
- Surcharges ponctuelles `date → modèle de journée`, prioritaires sur la récurrence
- **Modèle par défaut** pour tout jour non affecté

**Journée**
- Date
- Snapshot du modèle appliqué, copié à la matérialisation
- Liste des repas, librement modifiable

**Entrée de journal**
- Rattachée à un repas d'une journée
- Type : `aliment` | `recette` | `saisie libre`
- Quantité + unité, ou portion choisie
- **Macros de référence figées à l'enregistrement** (§5.2)
- Si type `recette` : bloc groupé conservant les ingrédients et quantités ajustées. **[v2.2]** Seules les lignes d'ingrédient portent des macros ; le bloc parent n'en porte aucune, afin de rendre tout double comptage structurellement impossible.

### 6.2 Poids

**Mesure de poids** *(saisie manuelle)*
- Date
- Valeur en kg
- Une mesure au plus par date ; une nouvelle saisie sur une date existante écrase la précédente

**Objectif de poids**
- Poids cible
- Défini au choix par **date cible** (le rythme en kg/semaine est calculé) ou par **rythme visé** (la date d'atteinte est estimée)
- Date de définition
- Optionnel, modifiable, désactivable, supprimable

### 6.3 Musculation

**Exercice**
- Nom
- Groupes musculaires primaire et secondaires
- Équipement
- Média d'illustration — **[v2.2]** média personnel autorisé, **non couvert par l'export JSON** (§5.4)
- Notes : exécution, réglage, respiration, erreurs fréquentes
- **Incrément de progression** en kg, propre à l'exercice, initialisé depuis la valeur globale des Réglages
- Favori : oui / non

**Routine**
- Nom
- Échauffement : liste ordonnée de lignes de texte
- Liste ordonnée de **blocs**, un bloc étant un exercice seul ou un superset

**Ligne de routine**
- Exercice, index de la série
- Temps de repos (au niveau du bloc pour un superset)
- Répétitions, fixes ou en plage
- Charge cible, RIR cible, note
- Règle de progression : active ou non
- Type de série : `échauffement` | `travail` (défaut) | `drop set` | `série longue / échec`

**Séance**
- Date, routine source (snapshot au démarrage)
- **[v2.2] Segments d'activité** : la séance enregistre des intervalles de travail effectif. La durée totale s'en déduit (§10.3).
- Notes
- État : `en cours` | `terminée`

**Série réalisée**
- Exercice, index, répétitions, charge, RIR ressenti
- Marqueur validée / passée

**Note d'exercice**
- Rattachée à un exercice, destinée à la prochaine séance le comportant

### 6.4 Activité d'endurance

**Alimentée exclusivement par intervals.icu, à partir de la V4.** Aucune activité n'est disponible avant cette version.

- Date, type de séance : `course à pied` | `course tapis` | `vélo` | `tennis` | `sport de rame` | `randonnée` | `autre`
- Distance
- Durée en mouvement et durée totale
- Allure (si applicable), calculée depuis distance et durée, jamais stockée
- Dénivelé, cadence
- Fréquence cardiaque, calories

**[v2.2]** La date d'une activité est la **date locale fournie par la source**, jamais une conversion de son instant UTC.

---

## 7. Navigation et structure des écrans

**Barre d'onglets à quatre entrées, identique de la V1 à la V4 :**

| Onglet | Contenu |
| --- | --- |
| **Journal** | Écran d'accueil. Journal alimentaire du jour, saisie du poids (V2). Accès à la bibliothèque par une icône en en-tête. |
| **Entraînement** | Deux sections : **Musculation** (Routines · Exercices · Historique) et **Activités**. |
| **Stats** | Tableau de bord unique, transversal à tous les modules. |
| **Réglages** | Configuration de l'application. |

Les onglets non pourvus dans une version donnée sont **présents et affichent un état vide explicite**.

**[v2.2]** Les sous-sections de l'onglet Entraînement sont présentées par un **sélecteur segmenté au sein d'un écran unique**, et non par une navigation imbriquée.

**Bibliothèque d'aliments et de recettes :** accessible par une icône dédiée en en-tête de l'écran Journal.

**Écran d'ajout au journal :** modale plein écran.

**Statistiques :** centralisées dans l'onglet Stats, à l'exception de celles attachées à un objet précis — la page d'un exercice affiche ses propres graphiques et records.

**[v2.2] Ouverture de l'application.** Le Journal se positionne **toujours sur la journée courante**, jamais sur la dernière date consultée.

---

## 8. Spécifications fonctionnelles — V1

### 8.1 Objectifs et modèles de journée

- Création d'un nombre illimité de modèles de journée
- Chaque **repas type** porte ses propres objectifs de macros
- Les objectifs du **modèle** sont la somme de ceux de ses repas, en lecture seule
- **Affectation à une date** : récurrence hebdomadaire, avec possibilité de **surcharger ponctuellement** une date sans casser la récurrence
- Un **modèle par défaut** s'applique à tout jour de la semaine sans affectation
- La modification d'un modèle **n'affecte pas rétroactivement** les journées matérialisées
- **[v2.2]** La semaine commence le **lundi**.

### 8.2 Cycle de vie d'une journée

- Une journée est **matérialisée à la première action de l'utilisateur la concernant** : ajout d'une entrée, renommage d'un repas, ajout ou suppression d'un repas. Le snapshot du modèle est pris à cet instant.
- Tant qu'aucune action n'a eu lieu, la journée est **virtuelle** : ses objectifs sont déduits du planning **en vigueur au moment de la consultation**.
- **[v2.2] Naviguer entre les jours ne matérialise jamais une journée.** Balayer trois mois d'historique ne crée aucune donnée.
- **La navigation et la saisie sur des dates futures sont autorisées sans limite.** Une journée future renseignée est matérialisée et devient insensible aux changements de planning ultérieurs.

**[v2.2] Définition de la journée courante.** Une journée est une **date civile locale**, jamais un instant. L'heure à laquelle « aujourd'hui » bascule vers le jour suivant est **réglable** (§8.8), avec minuit pour valeur par défaut, bornée entre 0h et 6h. Ce réglage ne détermine que la **date proposée par défaut** : il n'affecte aucune donnée stockée, et une date erronée se corrige en un geste.

### 8.3 Écran Journal

1. **Bandeau de restant** : anneau de progression pour les calories, barres pour les autres macros. Le restant de calories **doit être lisible sans aucune interaction**.
2. **Liste des repas**, repliés par défaut, avec sous-total et objectif propre.
3. **Bouton d'ajout** accessible depuis chaque repas.
4. **Navigation entre les jours** : boutons précédent / suivant, accès direct à une date, **balayage horizontal**.
5. **Édition et suppression** : toucher une entrée ouvre l'écran d'ajustement ; **balayer vers la gauche** supprime.
6. **Poids du jour** (V2), affiché et saisissable sous la liste des repas.

**Modification de la journée en cours :** ajout, renommage et suppression de repas libres, sans impact sur le modèle source, avec recalcul des objectifs.

### 8.4 Ajout au journal

**a) Accès rapide** — écran affiché par défaut :
- **Aliments** : favoris d'abord, puis récents
- **Repas** : récents. Sélectionner un repas récent ajoute d'un coup toutes ses entrées au repas visé.
- **Recettes** : favorites d'abord, puis récentes

**b) Recherche** — unifiée sur base personnelle et Open Food Facts, **les résultats personnels toujours en premier**, visuellement distingués.

**[v2.2] La recherche distante est à déclenchement explicite.** Open Food Facts limite les recherches à dix requêtes par minute et par adresse IP, et proscrit explicitement la recherche au fil de la frappe. En conséquence : les résultats personnels s'affichent instantanément à chaque frappe ; les résultats distants ne sont demandés qu'à la validation explicite, et viennent s'ajouter en dessous.

**c) Scan de code-barres** — voir §8.5.

**d) Saisie libre** — P / G / L / kcal directement, sans création en base. **Accessible en un seul toucher.**

**Saisie de la quantité :** en unité de base ou via une **portion prédéfinie**, avec bascule sans quitter l'écran.

**[v2.2] Pré-remplissage de la quantité.** L'écran de quantité s'ouvre pré-rempli avec la **dernière quantité consommée pour cet aliment**, valeur sélectionnée et clavier numérique déjà ouvert. Un aliment habituel se logue alors en deux touchers, sans clavier. C'est le levier principal de la cible des 15 secondes (§4).

### 8.5 Base d'aliments, Open Food Facts et scan

**Base personnelle**
- Création, modification, suppression d'aliments
- Gestion des portions nommées, avec leur quantité en unité de base
- Marquage favori
- Un aliment issu d'Open Food Facts est **librement corrigeable** une fois copié : c'est le mécanisme principal de compensation de la qualité inégale de la source

**Open Food Facts**
- API publique : recherche texte et lookup par code-barres
- **Périmètre mondial**
- Aucune copie locale du dump complet
- Mise en cache locale des produits consultés — **[v2.2]** durée de validité **30 jours**, rafraîchissement opportuniste si le réseau est disponible, jamais bloquant
- Données traitées comme **peu fiables par défaut** : macros visibles et éditables avant validation
- **[v2.2] Contrôles à l'entrée** : champs manquants signalés, écart kcal supérieur à 10 % signalé selon §5.1, valeurs physiquement impossibles (au-delà de 900 kcal pour 100 g) marquées avant validation
- **[v2.2] Limitation de débit** : 15 requêtes/minute pour les consultations de produit, 10/minute pour les recherches. Un dépassement signalé par le serveur suspend les appels distants plusieurs minutes, avec un **message explicite** — seul cas où le message n'est pas discret. Un en-tête d'identification personnalisé est obligatoire.

**Copie automatique en base personnelle**
- **Tout produit ajouté au journal est systématiquement copié en base personnelle**, code-barres et origine conservés.
- Corollaire obligatoire : la recherche unifiée **dédoublonne par code-barres**.

**Comportement hors ligne**
- Résultats de la base personnelle et du cache, avec **bandeau discret « hors ligne »**
- Aucun message bloquant, aucune interruption du parcours

**Scan de code-barres**
- Enchaînement : scan → recherche (personnelle, puis cache, puis Open Food Facts) → écran de quantité → validation. **Cible : moins de 5 secondes.**
- **Code-barres inconnu** : proposition de créer un aliment personnel pré-rempli
- **[v2.2] Produit trouvé mais incomplet** : l'absence d'un seul des quatre — protéines, glucides, lipides, kcal — **fait sortir du parcours rapide** et bascule sur la création d'un aliment personnel, **pré-rempli** de tout ce qu'Open Food Facts a fourni (nom, marque, code-barres, macros présentes). Seuls les champs manquants sont à compléter. Ce chemin sort assumément de la cible des 5 secondes : l'aliment étant ensuite copié en base personnelle, le coût n'est payé qu'une fois.

### 8.6 Recettes

- Nom, tags, étapes, durée, ingrédients
- Macros **calculées** depuis les ingrédients
- Rendement en portions ou en poids total saisi manuellement
- Recherche, filtrage par tag, favori, accès rapide

**Ajout au journal :**
1. Quantité consommée, en portions ou en poids
2. **Écran d'ajustement des ingrédients**, éditable pour cette occurrence uniquement
3. **La recette enregistrée n'est jamais modifiée**
4. L'entrée apparaît comme un **bloc groupé, repliable et ré-éditable**

### 8.7 Tableau de bord — volet nutrition

Plages : **7 / 30 / 90 jours**.

- Calories par jour, comparées à l'objectif
- Répartition P / G / L, en grammes et en pourcentage
- Moyennes hebdomadaires glissantes
- **Taux d'adhérence** : proportion de jours dans la cible, avec seuil de tolérance **réglable**, exprimé en pourcentage et appliqué aux quatre macros

**[v2.2] Trois précisions de calcul.**

1. **Les journées jamais renseignées sont exclues du taux d'adhérence.** Une journée sans aucune entrée n'est pas un échec, c'est une absence de mesure.
2. **Corollaire obligatoire : le pourcentage est toujours affiché avec son dénominateur** — « 92 % sur 18 jours renseignés / 30 ». Sans cela, la statistique récompense l'abandon du journal.
3. **Règle d'agrégation.** Toute valeur quotidienne — calories par jour, poids — s'agrège **par moyenne**. La somme n'est licite que pour les compteurs : volume soulevé, nombre de séances, nombre de répétitions.

### 8.8 Réglages — V1

- Thème : clair / sombre / système
- **[v2.2]** Heure de bascule de la journée (défaut minuit, bornée 0h–6h)
- Modèles de journée, planning hebdomadaire, modèle par défaut
- Seuil de tolérance du taux d'adhérence
- Unités et préférences d'affichage
- Export et import JSON, **[v2.2]** indicateur d'ancienneté du dernier export, bouton « préparer une copie »
- **[v2.2]** Version applicative et version de schéma affichées

---

## 9. Spécifications fonctionnelles — V2

> **Section entièrement révisée en v2.1.** HealthKit étant inaccessible, le poids redevient une donnée saisie et détenue par l'application seule.

### 9.1 Saisie du poids

- **Champ de saisie sous la liste des repas** de l'écran Journal, sur la date consultée.
- Une mesure au plus par date. Une nouvelle saisie sur une date déjà renseignée **écrase** la précédente, après confirmation.
- Saisie possible sur n'importe quelle date, passée comme future, sans limite.
- **Historique consultable et corrigeable** : liste chronologique, édition et suppression de n'importe quelle mesure.
- Aucune synchronisation avec une source externe avant la V4.

**[v2.2] Point tranché — la double saisie est définitive.** La vérification du §13.1 a été menée : **intervals.icu n'expose pas le poids remonté par COROS.** La saisie manuelle du poids dans cette application est donc la seule source, sans échappatoire technique, et pour toutes les versions. Cela renforce encore la criticité de l'export (§5.4) : le poids n'existe qu'ici.

### 9.2 Suivi et objectif

- **Graphique d'évolution** superposant série brute, série lissée et objectif, sur 30 jours / 90 jours / 1 an / tout.
- **Lissage : moyenne mobile sur 7 jours.** Les jours sans mesure sont ignorés, sans interpolation ; la moyenne porte sur les mesures disponibles dans la fenêtre.
- **Objectif de poids** : poids cible, défini au choix par date cible (rythme calculé) ou par rythme visé en kg/semaine (date estimée). Modifiable et désactivable depuis les Réglages.
- **Écart au rythme visé** : rythme réel calculé par régression sur la série lissée des **14 derniers jours**, comparé au rythme visé.

**[v2.2] Trois précisions de calcul, sans lesquelles la fonction est ambiguë.**

1. **Un point lissé n'existe que pour une date effectivement pesée.** La courbe lissée est trouée les jours sans mesure ; elle n'est jamais prolongée artificiellement.
2. **Le rythme réel exige au moins 7 mesures sur les 14 derniers jours.** En deçà, l'application affiche « données insuffisantes » **en disant pourquoi**, et non un chiffre. Une régression sur trois points produit une pente spectaculaire et fausse.
3. **Au-delà de 90 jours de plage, la courbe brute disparaît.** Agrégées par semaine ou par mois, série brute et série lissée se confondent visuellement. Ne subsistent alors que la série lissée agrégée et l'objectif. Agrégation par **semaine au-delà de 90 jours**, par **mois au-delà d'un an**.

### 9.3 Notifications

**[v2.2] Quatre notifications locales**, chacune activable, désactivable, à heure réglable.

| Notification | Déclenchement |
| --- | --- |
| **Rappel de pesée** | Le matin, si **aucune mesure n'a été saisie** pour la date du jour |
| **Journal vide** | En soirée, si aucune entrée n'a été saisie pour la date du jour |
| **Bilan de fin de journée** | À heure fixe, avec l'état des macros — consommé et restant |
| **[v2.2] Rappel d'export** | Périodique, si le dernier export date de plus d'un délai réglable |

**[v2.2] Mécanique de planification.** iOS déclenche les notifications **sans exécuter le code de l'application**. Les conditions ne peuvent donc pas être évaluées au moment du déclenchement. La mécanique retenue :

- **Planification anticipée sur 7 jours**, reprogrammée à chaque passage au premier plan.
- **Annulation immédiate** dès que la condition devient satisfaite — saisir son poids annule le rappel du jour. Cette annulation est fiable : les données ne changent jamais sans que l'application tourne.
- **Les rappels s'épuisent d'eux-mêmes** si l'application n'est pas ouverte pendant sept jours. C'est également la durée de vie du certificat SideStore.
- **Le bilan de fin de journée est reprogrammé à chaque écriture concernant la date du jour**, de façon groupée, afin que ses chiffres soient justes. Une écriture sur une date passée ne le reprogramme pas.
- Autorisation demandée **à l'activation dans les Réglages**, jamais au premier lancement.

**[v2.2] Notification de minuteur de repos (V3).** Le minuteur de repos ne peut pas sonner sans exécution en arrière-plan. Il est réalisé par une **notification locale unique**, programmée à la validation d'une série et annulée à la validation de la suivante. Limite assumée : téléphone en mode silencieux, pas de son.

### 9.4 Tableau de bord — volet poids

- Courbe de poids lissée, avec objectif
- Rythme réel comparé au rythme visé
- **Graphique croisé** : poids lissé superposé à la moyenne mobile des calories consommées

---

## 10. Spécifications fonctionnelles — V3

### 10.1 Exercices

**Recherche d'exercice**
- Par nom, muscle, matériel ; filtrage par muscle et matériel
- Favoris en tête
- Chaque résultat affiche vignette, nom, muscle, matériel
- Bouton de création

**Page d'un exercice**
- Nom, muscles travaillés, matériel, média
- Notes : exécution, réglage, respiration, erreurs fréquentes
- **Graphiques** sur 3 mois / 1 an / tout : charge maximale, 1RM estimé, meilleur volume de série, volume de séance, total de répétitions
- **Records personnels** : charge maximale, meilleur 1RM estimé, meilleur volume de série, meilleur volume de séance
- Historique complet
- Incrément de progression propre à l'exercice
- Exercice éditable

**Formule de 1RM : Epley**, soit `charge × (1 + répétitions / 30)`, calculée uniquement sur les séries de **12 répétitions ou moins**.

**Définition du volume :** `charge × répétitions`, sur les **séries de travail validées uniquement**.

### 10.2 Routines

**Liste des routines** — une ligne par routine avec démarrage direct, bouton de création, accès à la page.

**Création d'une routine**
- Nom ; échauffement, une étape par ligne saisie
- Liste des blocs, boutons d'ajout d'exercice et de bloc en pied d'écran
- L'ajout d'un exercice ouvre la recherche filtrée ; l'exercice s'ajoute avec une série unique
- Par série : type, règle de progression, charge cible, répétitions (fixes ou en plage), RIR, temps de repos
- **Balayer une série vers la gauche** la supprime
- **Superset** : plusieurs exercices dans un bloc, chacun avec ses propres paramètres, le **temps de repos étant défini au niveau du superset**

**Page d'une routine**
- Présentation identique à la création, non éditable
- Toucher un exercice ouvre sa page
- **Carte corporelle** des muscles travaillés
- Boutons de démarrage, d'édition, de suppression

### 10.3 Séance en direct

- Bandeau supérieur : durée écoulée, séries effectuées sur le total
- Par série : charge réelle, répétitions, RIR ressenti, état
- Les champs portent en **texte indicatif** les valeurs attendues de la routine ; pour une plage, la plage complète
- **La saisie du RIR valide automatiquement la série**
- RIR saisi via une rangée sur une ligne : 0 · 1 · 1,5 · 2 · 2,5 · 3 · 3,5 · 4+
- **Le minuteur de repos démarre automatiquement à la validation d'une série**
- Ajout d'exercice ou de bloc en direct, suppression, balayage pour supprimer une série
- Note d'exercice pour la prochaine séance

**Règles de session :**
- **Une seule séance en cours à la fois** — **[v2.2]** invariant garanti par la base de données, non par une vérification applicative
- **Bandeau persistant** dans toute l'application, ramenant à la séance
- **Persistance continue** : chaque saisie enregistrée immédiatement. Une séance interrompue — arrêt forcé, expiration du certificat SideStore — est intégralement restaurée, et sa **reprise proposée à la réouverture, sans limite de temps**
- **[v2.2]** Écriture **immédiate et synchrone** à la validation d'une série ; écriture **différée d'une fraction de seconde** pour les champs en cours de frappe, **vidée systématiquement au passage en arrière-plan**.
- Une séance terminée reste éditable et supprimable

**[v2.2] Durée d'une séance : temps actif, non temps écoulé.** Une reprise sans limite de temps combinée à une durée de bout en bout produirait des séances de 72 heures, polluant durablement les statistiques du §10.6. La séance enregistre donc des **segments d'activité** : un segment se ferme après **30 minutes sans aucune écriture**. La durée totale est la somme des segments ; les segments seuls sont stockés, la durée s'en déduit. Aucune question supplémentaire n'est posée à la reprise.

### 10.4 Règle de progression

**Double progression.**

- **Condition :** sur la séance la plus récente comportant cet exercice, toutes les séries de travail ont atteint le **haut de la plage de répétitions** à la charge cible. Le RIR n'entre pas dans la condition.
- **Effet :** l'application **affiche une suggestion à la séance suivante**. **Elle ne modifie jamais la routine ni la charge cible automatiquement.**
- **Incrément :** défini **par exercice**, initialisé depuis une valeur globale des Réglages.
- Ne s'applique qu'aux lignes où la règle est activée, et aux séries de type `travail`.

### 10.5 Historique des séances

Liste chronologique des séances terminées, avec détail, édition et suppression.

### 10.6 Tableau de bord — volet musculation

Plages : **3 mois / 1 an / tout**.

- Calendrier des séances
- Durée des séances — **[v2.2]** temps actif (§10.3)
- Volume total par séance
- Répétitions par séance
- Carte corporelle des muscles travaillés
- **Graphique croisé** : volume de musculation et poids lissé

**[v2.2] Interaction des graphiques.** Aucun zoom ni déplacement au doigt : les sélecteurs de plage y pourvoient déjà. Une seule interaction, commune à tous les graphiques de l'application : **toucher un point affiche sa valeur et sa date**.

---

## 11. Spécifications fonctionnelles — V4

> **Statut modifié en v2.1.** intervals.icu n'est plus un complément mais **l'unique source d'activités d'endurance**.

### 11.1 Synchronisation intervals.icu

**Réglages**
- Clé API intervals.icu, stockée dans le trousseau
- Fréquence de synchronisation

**Sens : tirage uniquement.** Aucune écriture vers intervals.icu.

**Écran Activités** — liste affichant, par activité : date, type, distance, durées en mouvement et totale, allure, dénivelé, cadence, fréquence cardiaque, calories. Édition et suppression possibles.

Aucun dédoublonnage n'est nécessaire, HealthKit ayant disparu du périmètre : intervals.icu est seul en source.

**[v2.2]** Chaque activité conserve son **identifiant d'origine**, afin qu'une synchronisation répétée mette à jour plutôt que dupliquer.

### 11.2 Tirage du poids — abandonné

**[v2.2] Vérification effectuée : intervals.icu n'expose pas le poids remonté par COROS.** Cette piste est close. La V4 ne tire que des activités d'endurance. Le poids reste une saisie manuelle exclusive (§9.1), et l'application n'a plus aucune source de poids automatisable dans son cadre de distribution.

---

## 12. Réglages — vue consolidée

| Section | Contenu | Version |
| --- | --- | --- |
| Apparence | Thème clair / sombre / système | V1 |
| Affichage | **[v2.2]** Heure de bascule de la journée | V1 |
| Affichage | Unités et préférences | V1 |
| Nutrition | Modèles de journée, planning, modèle par défaut | V1 |
| Nutrition | Seuil de tolérance du taux d'adhérence | V1 |
| Données | Export et import JSON | V1 |
| Données | **[v2.2]** Ancienneté du dernier export, « préparer une copie » | V1 |
| À propos | **[v2.2]** Version applicative et version de schéma | V1 |
| Poids | Objectif : définition, modification, désactivation | V2 |
| Notifications | Activation et heure des **[v2.2]** quatre notifications | V2 |
| Musculation | Incrément de progression global par défaut | V3 |
| intervals.icu | Clé API, fréquence de synchronisation | V4 |

---

## 13. Points ouverts

1. ~~intervals.icu expose-t-il le poids remonté par COROS ?~~ **[v2.2] Résolu — négativement.** intervals.icu n'expose pas le poids COROS. La double saisie du §9.1 est définitive, §11.2 est abandonné, et l'export JSON reste l'unique protection du poids.
2. ~~Durée de validité du cache Open Food Facts.~~ **[v2.2] Résolu :** 30 jours, rafraîchissement opportuniste (§8.5).
3. **Origine de la carte corporelle** : ressource graphique à produire ou à sourcer, avec sa cartographie vers les groupes musculaires du modèle. *Reste ouvert.*
4. **Heures par défaut des quatre notifications**, à définir à l'usage. *Reste ouvert.*
5. ~~Stratégie de migration du schéma local.~~ **[v2.2] Résolu :** migrations versionnées, sauvegarde automatique du fichier de base avant chaque migration, refus de démarrer sur une base plus récente que le binaire. Voir document d'architecture, décision 6.
6. ~~Rappel d'export.~~ **[v2.2] Résolu :** indicateur d'ancienneté dès la V1, notification à partir de la V2 (§5.4, §9.3).
7. **[v2.2] Le trousseau iOS survit-il à la re-signature hebdomadaire par SideStore ?** À vérifier avant la V4 : dans le cas contraire, la clé intervals.icu serait à ressaisir chaque semaine.
8. **[v2.2] Les limites de débit d'Open Food Facts peuvent évoluer.** Les valeurs du §8.5 sont celles constatées au 10/09/2026.

---

## 14. Journal des décisions

### 14.1 Décisions issues des tests (09/09/2026)

| Sujet | Décision |
| --- | --- |
| Chaîne de production | Validée : CI macOS → IPA non signée → SideStore |
| HealthKit | **Abandonné** : entitlement retiré à la signature sur compte gratuit |
| Poids | Saisie manuelle dans l'application, historique corrigeable |
| Activités | Plus aucune source avant la V4 ; intervals.icu devient seule source |
| Données quotidiennes | Pas, calories actives, FC repos : **hors périmètre** |
| Dédoublonnage d'activités | Sans objet, une seule source subsiste |
| Export JSON | Criticité renforcée : seul filet de sécurité du poids |

### 14.2 Décisions de cadrage (08/09/2026)

| Sujet | Décision |
| --- | --- |
| Appareils | iPhone seul |
| Sauvegarde | Export / import JSON manuel |
| kcal | Valeur source conservée, alerte au-delà de 10 % d'écart |
| Micronutriments | Hors périmètre, définitivement |
| Unités | g et ml étanches, aucune conversion |
| Arrondis | P / G / L à une décimale, kcal en entier |
| Cuisson | Ignorée, tout est saisi cru |
| Journée | Matérialisée à la première action ; virtuelle avant cela |
| Planning | Modèle par défaut pour les jours non affectés |
| Dates futures | Navigation et saisie autorisées sans limite |
| Navigation | Quatre onglets fixes dès la V1 |
| Bibliothèque | Accessible par une icône en en-tête du Journal |
| Écran d'ajout | Modale plein écran |
| Open Food Facts | Périmètre mondial ; copie systématique en base perso ; dédoublonnage par code-barres |
| Hors ligne | Base personnelle et cache, avec bandeau discret |
| Suppressions | Toujours autorisées, historique jamais altéré |
| Édition | Aucune limite temporelle |
| Lissage du poids | Moyenne mobile sur 7 jours |
| Objectif de poids | Par date cible ou par rythme, au choix |
| Rythme réel | Calculé sur les 14 derniers jours |
| Progression | Double progression, suggestion seule |
| Incrément | Par exercice, avec valeur globale par défaut |
| 1RM | Epley, limitée aux séries de 12 répétitions ou moins |
| Minuteur de repos | Démarrage automatique à la validation d'une série |
| Séance interrompue | Reprise proposée sans limite de temps |
| Statistiques | Tableau de bord 7 / 30 / 90 jours ; musculation 3 mois / 1 an / tout |
| Adhérence | Seuil de tolérance réglable |
| Plateforme | iOS 18 et plus, français uniquement, distribution par SideStore |

### 14.3 Modifications issues de la session d'architecture (10/09/2026)

| № | Section | Modification | Motif |
| --- | --- | --- | --- |
| 1 | §6.1 | Une portion porte une **quantité en unité de base**, nom unique par aliment | Une portion sans quantité n'est pas calculable |
| 2 | §8.2, §8.8, §12 | Réglage d'**heure de bascule de la journée** | Les specs ne définissaient pas quand « aujourd'hui » change |
| 3 | §5.3 | **Avertissement** à la suppression d'un exercice ayant un historique | Seule suppression qui détruise réellement des données |
| 4 | §8.7 | Journées non renseignées **exclues** de l'adhérence, **dénominateur affiché** | Sinon la statistique récompense l'abandon du journal |
| 5 | §9.2 | Point lissé uniquement les jours pesés ; **7 mesures minimum** pour le rythme réel ; courbe brute masquée au-delà de 90 jours | Régression sur 3 points = pente fausse ; courbes redondantes une fois agrégées |
| 6 | §8.4, §8.5 | Recherche distante à **déclenchement explicite** ; produit incomplet → création manuelle pré-remplie ; cache 30 jours | Limites de débit d'Open Food Facts |
| 7 | §5.4, §9.3 | **Quatrième notification** (rappel d'export) ; bilan chiffré reprogrammé ; rappels s'épuisant à 7 jours | Le contenu d'une notification est figé à la planification |
| 8 | §10.3, §10.6 | Durée de séance = **temps actif** par segments, seuil 30 minutes | Une reprise à J+3 afficherait 72 heures |
| 9 | §5.4, §6.3 | Médias d'exercices **hors export JSON** ; copie manuelle du dossier de données comme second filet | iOS interdit l'écriture hors bac à sable |
| 10 | §8.7, §9.2, §10.6 | Agrégation **par moyenne** pour les valeurs quotidiennes, par somme pour les compteurs ; semaine au-delà de 90 j, mois au-delà d'1 an | Sommer des calories quotidiennes produit des chiffres absurdes |
| 11 | §8.4 | Quantité **pré-remplie** avec la dernière consommée, clavier ouvert, valeur sélectionnée | Seul levier réel sur la cible des 15 secondes |
| 12 | §5.2, §6.1 | Macros **canoniques pour 100 unités** ; entrée de journal figeant la référence, pas le total | Rend l'édition sans limite de temps réellement possible |
| 13 | §7, §10.6 | Sélecteur segmenté au lieu d'une navigation imbriquée ; pas de zoom sur les graphiques | Simplicité de l'état de navigation ; doublon avec les sélecteurs de plage |
