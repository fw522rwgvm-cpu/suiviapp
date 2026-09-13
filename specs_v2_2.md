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
- Origine : `perso` | `off` — **[v2.3]** aligné sur le schéma normatif (architecture §2.2), qui fait autorité sur les valeurs stockées ; cette section est conceptuelle. L'écran affiche « Perso » et « Open Food Facts », le jeton n'est jamais montré.
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

**Écran d'ajout au journal : [v2.3]** fenêtre ouverte **par-dessus** le Journal, qui reste visible derrière. Ajouter au journal, corriger une ligne et choisir une date se font *sur* la journée et non à sa place ; un écran opaque dirait qu'on l'a quittée.

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
2. **Liste des repas**, repliés par défaut, avec sous-total et objectif propre. **[v2.3] Une entrée porte son nom, puis une ligne grise « quantité · P · G · L », et ses calories à droite avec l'unité** — `132 kcal` et non `132`. Les macros s'écrivent exactement comme dans la liste temporaire du §8.4 : la ligne sur le point d'être ajoutée et la même une fois ajoutée doivent se lire à l'identique.
3. **Bouton d'ajout** accessible depuis chaque repas.
4. **Navigation entre les jours** : **balayage horizontal** et accès direct à une date. **[v2.3]** La barre supérieure porte le jour affiché à gauche — « Hier », « Aujourd'hui », « Demain », sinon `mar. 15/09` — et deux boutons icônes à droite : calendrier et bibliothèque. Les boutons précédent / suivant sont **supprimés** : le balayage était déjà le geste principal et les chevrons le doublaient. *Réserve inscrite : un balayage n'a pas d'équivalent VoiceOver, là où un bouton en a un ; à rouvrir si l'accessibilité devient un sujet.*
5. **[v2.3] Accès direct à une date** : le bouton calendrier **devient** l'écran de calendrier, par la transition zoom native d'iOS — le contrôle se transforme en la vue qu'il présente, et le renvoi interactif le ramène dedans. L'écran porte deux boutons Liquid Glass, « Aujourd'hui » et « Fermer ».
6. **Édition et suppression** : toucher une entrée ouvre l'écran d'ajustement ; **balayer vers la gauche** découvre le bouton « Supprimer ». **[v2.3] La suppression demande deux gestes, jamais un** : le premier balayage ne fait que découvrir, quelle que soit sa force ; ce qui supprime est ensuite un appui sur le bouton, ou un second balayage.
7. **Poids du jour** (V2), affiché et saisissable sous la liste des repas.
8. **[v2.3] Journée pas encore chargée** : trois points animés. Le cas est rare — la base est locale et synchrone, et les deux journées voisines sont préchargées — mais une journée vide et une journée pas encore lue se ressemblent trop pour qu'on les dessine pareil.

**Modification de la journée en cours :** ajout, renommage et suppression de repas libres, sans impact sur le modèle source, avec recalcul des objectifs.

### 8.4 Ajout au journal

**a) Accès rapide** — écran affiché par défaut :
- **Aliments** : favoris d'abord, puis récents
- **[v2.4] Toute ligne d'aliment personnel — favori, récent ou résultat de recherche — porte la quantité qu'un ajout direct enregistrerait, ses calories, et un bouton « + » qui l'ajoute au panier en un toucher.** C'est la même valeur que celle sur laquelle l'écran de quantité s'ouvrirait (pré-remplissage du §8.4) : la ligne ne peut donc pas promettre autre chose que ce que son bouton fait. Toucher la ligne ouvre toujours l'écran de quantité, donc changer la quantité coûte exactement ce qu'il coûtait.
- **[v2.4] Ce que porte la ligne.** Le nom en gras ; en dessous, la marque et la quantité séparées par une virgule, l'une ou l'autre pouvant manquer. Une quantité exprimée en portion montre entre parenthèses ce à quoi elle revient — « 2 tranches (50 g) ». Les calories de la quantité s'affichent à gauche du bouton, dans la même voix que la marque et la quantité : elles appartiennent à l'action, c'est le prix du toucher.
- **[v2.4] Un seul chiffre de calories par ligne, toujours à droite**, et ce qu'il veut dire dépend de l'écran : à l'ajout, les calories de la quantité que le bouton enregistrerait ; dans la bibliothèque, celles pour 100, à gauche du bouton favori. La ligne qui les énonçait sous le nom disparaît des deux écrans.
- **[v2.4] L'en-tête de l'écran ne défile pas.** Les deux boutons et le champ de recherche restent visibles ; seules les listes défilent. Atteindre le scanner ne doit jamais coûter un retour vers le haut, et un champ placé au-dessus d'une zone qui défile se lit comme le filtre de cette zone.
- **[v2.4] Pour un aliment jamais consommé**, le pré-remplissage retombe sur sa quantité de référence puis sur 100, comme il l'a toujours fait. La ligne n'affirme pas que cette quantité a déjà été mangée : elle énonce ce que le bouton ajoutera.
- **Repas** : récents. Sélectionner un repas récent ajoute d'un coup toutes ses entrées au repas visé.
- **Recettes** : favorites d'abord, puis récentes

**b) Recherche** — unifiée sur base personnelle et Open Food Facts, **les résultats personnels toujours en premier**, visuellement distingués.

**[v2.2] La recherche distante est à déclenchement explicite.** Open Food Facts limite les recherches à dix requêtes par minute et par adresse IP, et proscrit explicitement la recherche au fil de la frappe. En conséquence : les résultats personnels s'affichent instantanément à chaque frappe ; les résultats distants ne sont demandés qu'à la validation explicite, et viennent s'ajouter en dessous.

**c) Scan de code-barres** — voir §8.5.

**d) Saisie libre** — P / G / L / kcal directement, sans création en base. **Accessible en un seul toucher.**

**[v2.3] Un repas s'assemble, puis se valide.** Choisir un aliment ou saisir une entrée libre ajoute une ligne à une **liste temporaire** et ramène à l'écran d'accès rapide ; rien n'est écrit avant « Confirmer ». Un repas de quatre choses est alors quatre choix, et non quatre allers-retours par le Journal.

- L'écran d'accès rapide porte **« Confirmer »** en bas, absent tant que la liste est vide.
- Un bouton de tête, portant le **nombre de lignes en attente**, ouvre la liste ; une ligne s'en retire par un **balayage vers la gauche en deux temps**, comme une entrée du Journal (§8.3) et comme un fichier dans l'app Fichiers. **[v2.3] Toucher une ligne rouvre le choix qui l'a faite** : la quantité pour un aliment, les quatre chiffres pour une saisie libre. La ligne corrigée remplace la précédente et l'on revient à la liste.
- Une ligne dit ce qu'elle apporte : **nom et quantité** sur une ligne, les trois macros dessous, les kcal à droite. La quantité est le **nom de la portion** quand une portion a été choisie — « 2 tranches » est ce qui a été décidé, « 50 g » ce à quoi cela revient, et les deux ensemble disent le même fait deux fois. Si le nom ne tient pas à côté, **c'est la quantité qui disparaît** : une moitié de nom n'identifie rien.
- **L'écriture est atomique** : la liste entière part en une transaction. L'application peut être arrêtée à tout moment (§2.2), et un demi-repas est pire qu'aucun — aucun se voit manquer, un demi non.
- La liste est **abandonnée avec l'écran**. Une intention abandonnée ne se conserve pas : il faudrait sinon expliquer, des jours plus tard, pourquoi un repas que personne n'a validé attend encore.

**Saisie de la quantité :** en unité de base ou via une **portion prédéfinie**, avec bascule sans quitter l'écran.

**[v2.2] Pré-remplissage de la quantité.** L'écran de quantité s'ouvre pré-rempli avec la **dernière quantité consommée pour cet aliment**. Un aliment habituel se logue alors en deux touchers, sans clavier. C'est le levier principal de la cible des 15 secondes (§4).

**[v2.4] Le clavier revient, en exception plutôt qu'en règle.** Toucher la ligne « Quantité » la transforme en champ numérique : on y saisit le nombre exact, dans l'unité que les molettes comptent, et à la validation **les molettes s'y placent**. Elles restent la façon dont une quantité se *choisit* ; le clavier est la façon dont une quantité exacte se *dit*. Une décimale que les huit fractions ne portent pas est ramenée à la plus proche, visiblement.

**[v2.3] La quantité se choisit à la molette, plus au clavier.** Trois rouleaux solidaires : un nombre entier à partir de 0, une fraction (—, 1/8, 1/4, 1/3, 1/2, 2/3, 3/4, 7/8) et l'unité — `g` ou `ml` selon l'aliment, suivie de ses portions. Ils s'ouvrent sur la dernière quantité consommée, à défaut sur 100 g. Les macros de la quantité choisie s'affichent **au-dessus** et bougent avec elle. *Le clavier disparaît de cet écran : « valeur sélectionnée, clavier ouvert » n'a plus d'objet, et les deux touchers sont tenus autrement.*

### 8.5 Base d'aliments, Open Food Facts et scan

**Base personnelle**
- Création, modification, suppression d'aliments
- Gestion des portions nommées, avec leur quantité en unité de base
- Marquage favori. **[v2.3] Il agit immediatement, jamais a l'enregistrement**, et par le meme bouton etoile depuis la liste et depuis la fiche de l'aliment. Corollaire : enregistrer une fiche **ne reecrit pas** le favori, le formulaire pouvant avoir ete ouvert avant le marquage.
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
- **[v2.4] « Validation » veut dire la ligne posée au panier, pas l'écriture au journal.** Cette phrase a été écrite avant le panier du §8.4 v2.3, qui interpose un « Confirmer » entre le choix et l'écriture. La cible des 5 secondes se mesure donc du scan jusqu'à la ligne en attente ; confirmer un repas est un geste de plus, partagé par toutes les façons d'ajouter.
- **[v2.4] La recherche personnelle est vraiment première, et elle suffit le plus souvent.** Un produit déjà scanné a été copié en base par la confirmation qui l'a logué : le scan suivant coûte une lecture indexée et aucune requête. C'est l'essentiel de la façon dont la cible est tenue.
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

### 14.4 Modifications issues de la tranche 3 (12/09/2026)

Ces modifications ont ete demandees en cours de realisation et appliquees au
document plutot que laissees en divergence. La regle de travail est desormais :
une demande qui diverge des specs modifie les specs.

| No | Section | Modification | Motif |
| --- | --- | --- | --- |
| 1 | §8.3 | Boutons **precedent / suivant supprimes** de la barre du Journal ; le jour s'affiche a gauche, deux boutons icones a droite (calendrier, bibliotheque) | Le balayage etait deja le geste principal et les chevrons le doublaient. Reserve : pas d'equivalent VoiceOver a un balayage |
| 2 | §8.3 | Acces direct a une date par la **transition zoom native d'iOS** : le bouton calendrier devient l'ecran de calendrier. Ses deux actions sont des boutons **Liquid Glass** portant des mots, « Aujourd'hui » et « Fermer » | L'effet natif existe et est expose par expo-router ; une morphose ecrite a la main en restait une imitation. Aucun glyphe ne dit « revenir a aujourd'hui » sans avoir ete appris |
| 3 | §8.3 | **Trois points animes** quand la journee n'est pas encore chargee, tenus au moins une demi-seconde | Une journee vide et une journee pas encore lue se ressemblent trop ; et un indicateur qui clignote se lit comme un defaut |
| 4 | §8.5 | Le marquage favori de la bibliotheque est un bouton **Liquid Glass**, etoile pleine ou vide | Meme materiau que les boutons natifs de l'en-tete de cet ecran |
| 5 | §7, §8.3, §8.4 | L'ecran d'ajout, l'edition d'une entree et le choix d'une date s'ouvrent en **fenetre par-dessus** le Journal, et non en modale plein ecran. Leur action de sortie est « Annuler », a droite | Aucune de ces trois choses n'est un endroit : elles se font sur la journee. Un ecran opaque dit qu'on l'a quittee |
| 6 | §8.3 | Une journee atteinte par balayage s'affiche **defilement en haut** | On la lit a nouveau depuis ses chiffres |
| 7 | §8.4 | Un repas s'assemble dans une **liste temporaire** puis se valide par « Confirmer », en une seule transaction | Quatre choses a loguer ne devraient pas etre quatre allers-retours par le Journal. Et un demi-repas est pire qu'aucun : aucun se voit manquer |
| 8 | §6.1 | Origine alignee sur `perso` \| `off` | Le §6 se declare non normatif sur le modele de donnees ; le schema de l'architecture fait autorite |
| 9 | §8.3, §8.4 | Le **balayage vers la gauche** remplace la croix pour retirer une ligne de la liste temporaire, et il **suit le doigt** dans les deux listes | Une croix sur chaque ligne est une cible permanente pour une action rare. Et une rangee qui ne decide qu'au relachement se lit comme un bouton, pas comme une feuille qu'on tire. Reserve : reconstruction du comportement d'UIKit, pas le controle lui-meme (voir ci-dessous) |
| 10 | §8.4 | Une ligne en attente porte **nom, quantite, macros et kcal** ; la quantite est le **nom de la portion** s'il y en a une, et **s'efface** si le nom devait etre tronque | La portion est la decision, les grammes son resultat : les deux disent le meme fait dans un espace prevu pour un. Les grammes restent sur la ligne du Journal, ou une entree se lit face a un total |
| 11 | §8.4 | Un retour aux etapes internes de l'ajout (quantite, saisie libre, liste) se fait par **glissement depuis le bord gauche**, les deux couches se deplacant ensemble ; le bouton de retour ne porte qu'un chevron | Ces etapes sont un etat et non des routes (D16 : 0,2 s), donc aucun geste systeme ne vient avec elles. Meme reserve qu'en 9 |

| 12 | §8.3, §8.4 | **Supprimer par balayage demande deux gestes.** Le premier decouvre le bouton sans jamais supprimer, si loin et si fort qu'il soit lance ; le second balayage, ou un appui sur le bouton, supprime | Un balayage long qui supprime place une action irreversible au bout du mouvement qui sert aussi a defiler, parcourir et revenir, et il part d'un geste dont personne n'a encore vu la consequence — le bouton n'est decouvert qu'au moment ou on le traverse. Un geste de plus coute un instant et achete la vue de ce qui va arriver |

| 13 | §8.4 | **Une ligne en attente se corrige en la touchant** : quantite pour un aliment, quatre chiffres pour une saisie libre. L'ecran de quantite s'ouvre alors sur la quantite choisie et non sur le pre-remplissage du §8.4 | Une ligne pas encore ecrite est une decision en cours ; la reprendre ne devrait pas vouloir dire la retirer et recommencer. Et le pre-remplissage repond a « combien en prends-tu d'habitude », question a laquelle cette ligne a deja repondu |

| 14 | §8.3 | Une entree du Journal affiche **quantite et macros** sur sa ligne grise, et ses calories **avec l'unite** | Le §8.3 ne disait pas ce que porte une entree. Les macros y manquaient : une ligne loguee repond a deux questions, combien et ce que ca coute. Et un nombre nu au milieu de grammes se calcule au lieu de se lire |

| 15 | §8.3, §8.4 | **Une couleur par nutriment, calories comprises**, portee en petit cercle plein a cote du nom. Sur l'ecran de quantite, les quatre s'affichent en une rangee : nom au-dessus, valeur en dessous | Quatre teintes aussi eloignees que quatre peuvent l'etre une fois l'accent et le rouge destructif exclus. Les quatre chiffres se lisent par comparaison, et une phrase doit etre analysee avant d'etre comparee. La bannière de restant (§8.3.1) et l'anneau de la tranche 7 porteront les memes |

| 16 | §8.5 | Le **favori agit immediatement**, par un bouton etoile identique depuis la liste et depuis la fiche ; il quitte le formulaire, et un enregistrement ne le reecrit plus | Un drapeau qu'un seul toucher change ailleurs ne devrait pas demander ici un formulaire soumis. Et un formulaire ouvert avant le marquage porte l'ancienne valeur : la reecrire annulerait en silence un geste que personne ne compte comme une modification |

| 17 | §6.1, §8.5 | La quantite de reference n'est plus saisissable : l'editeur propose **100 g ou 100 ml**, et les calories quittent la ligne des trois macros pour une rangee a elles | Demande explicite. Cout assume et consigne : une etiquette donnant ses valeurs pour autre chose que 100 doit desormais etre convertie a la main. `display_ref_qty` reste en base et vaut 100, donc rien n'est a migrer et le champ peut revenir. Les calories ne sont pas une quatrieme macro : elles sont ce a quoi les trois autres reviennent, et le §5.1 les verifie l'une contre les autres |

| 18 | §8.4 | La quantite se choisit a la **molette a trois rouleaux** (entier, fraction, unite ou portion) et non plus au clavier ; les **macros passent au-dessus** de la question. La saisie libre prend son titre en haut de fenetre | Demande explicite. Une fraction de portion se dit « un tiers », pas « 0,333 ». Reserve consignee : un vrai rouleau est un UIPickerView, qu'aucune bibliotheque du §5 n'expose — ce sont des listes qui s'aimantent, sans la courbure ni le son du systeme |

**Reserve sur les gestes 9 et 11, enoncee une fois pour toutes.** Les deux
reproduisent un comportement d'UIKit sans etre ce comportement. React Native
n'expose ni `UISwipeActionsConfiguration` ni le retour interactif d'un
`UINavigationController` pour une vue qui n'est pas un controleur ; les egaler
exactement demanderait un module natif et toutes les listes reconstruites sur
une collection view. Ce qui est copie est la forme et les proportions : suivi
du doigt, resistance passee la position de repos, sortie complete au-dela d'un
seuil, ressort au relachement, parallaxe d'un tiers sur la couche qui arrive.
L'ecart restant est un ecart de rendu, non de comportement, et il est assume.

### 14.5 Modifications issues de la tranche 4 (13/09/2026)

Meme regle qu'en 14.4 : une demande ou un constat qui diverge des specs modifie
les specs, de facon signalee.

| No | Section | Modification | Motif |
| --- | --- | --- | --- |
| 1 | §8.5 | La **copie automatique a lieu a « Confirmer »**, dans la transaction qui ecrit les entrees, jamais a la selection | Un produit choisi puis abandonne ne doit rien laisser. Scanner trois choses en rayon, en retirer une du panier et fermer laisserait sinon des aliments que personne n'a valides — de la donnee creee par consultation, ce que le §8.2 interdit deja pour les journees. Regle commune : ce qu'on enregistre explicitement s'ecrit, ce qu'on se contente de choisir non |
| 2 | §8.5 | Le dedoublonnage **masque**, sans fusionner ni proposer de choix — y compris quand les macros distantes different desormais des locales | La correction locale est « le mecanisme principal de compensation de la qualite inegale de la source ». Reafficher a cote la version non corrigee reproposerait a chaque recherche ce que l'utilisateur a delibere de remplacer ; et un ecran de comparaison sur ce parcours aurait toujours la meme reponse |
| 3 | §8.5 | Le **bandeau hors ligne apparait sur l'echec d'une requete**, jamais sur l'absence de reseau, et seulement sur la fenetre d'ajout | Detecter l'absence de reseau demanderait une dependance hors du §5 ; la reponse serait fausse derriere un portail captif ; et D11 range deja le bandeau dans son paragraphe « Echecs ». Consequence assumee : rien ne s'affiche tant que rien n'a ete demande |
| 4 | §8.5 | **Deux registres distincts** : hors ligne et reponse illisible sont discrets, un quota signale par le SERVEUR interrompt. Notre propre fenetre preventive reste discrete | D11 reserve le message explicite au depassement signale par le serveur. Une reponse illisible n'est jamais formulee « hors ligne » : le telephone est demontrablement connecte |
| 5 | §8.5 | **L'absence de nom fait basculer** vers le formulaire pre-rempli, comme l'absence d'une macro | `food.name` est NOT NULL : un produit sans nom ne peut pas etre ecrit. Le §8.5 dit deja « seuls les champs manquants sont a completer », et un nom est un champ |
| 6 | §8.5 | Un **code-barres inconnu** ouvre le meme formulaire, pre-rempli du seul code-barres | Ce n'est pas rien : c'est ce qui fera se dedoublonner l'aliment le jour ou le produit sera ajoute chez Open Food Facts. Un formulaire au code-barres vide laisserait ce rayon inscannable pour toujours |
| 7 | §8.5, §6.1 | Un produit Open Food Facts a **toujours `g`** comme unite de base | L'API publie des valeurs pour 100 g y compris pour les liquides. Les lire comme « pour 100 ml » appliquerait une densite de 1, que le §5.1 exclut. La libre correction du §8.5 couvre le cas |
| 8 | §8.5 | Les **kilojoules ne sont pas convertis** : un produit sans `energy-kcal` est incomplet et bascule | Le §5.1 conserve la valeur d'une source telle quelle. Reserve consignee : la consultation par code-barres fournit les kcal dans les cas observes, mais si le formulaire s'ouvre trop souvent a l'usage, la conversion est le premier remede |
| 9 | §8.4b | La recherche distante part sur une **validation du champ**, sans anti-rebond | Un anti-rebond serait une facon de chercher au fil d'une frappe lente : il respecterait la limite de dix par minute sans respecter l'interdiction, qui porte sur l'intention |
| 10 | §8.5 | Le seuil des **900 kcal pour 100** est un avertissement affiche a cote du champ, strictement au-dessus de 900, et un seul seuil pour les deux unites | En faire un blocage contredirait « signalees et editables, jamais refusees ». La graisse pure vaut 900 pile : un avertissement qui se declenche sur l'huile d'olive ne se lit pas deux fois |
| 11 | §13.8 | Les points d'entree ont change : **la recherche texte vit sur `search.openfoodfacts.org`**, `cgi/search.pl` et `/api/v2/search` repondant par une page HTML | Constate le 13/09/2026. Le point ouvert n° 8 prevoyait que les limites evoluent ; ce sont les points d'entree eux-memes qui ont bouge |
| 12 | §8.4a | **Toute ligne d'aliment personnel** — favori, recent, resultat de recherche — affiche la quantite qu'un ajout direct enregistrerait, ses calories, et porte un bouton **« + »** qui l'ajoute au panier en un toucher | Demande explicite, et le seul genre d'optimisation que D16 reconnaisse : « la cible ne se tient pas en optimisant du code, elle se tient en supprimant des gestes ». Le pre-remplissage avait deja ramene un aliment habituel a deux touchers ; celui-ci le ramene a un, pour le cas ou la reponse a « combien » est la meme que la derniere fois — c'est-a-dire le cas courant d'une liste de recents. La valeur affichee et celle ajoutee sont **une seule valeur**, produite par la meme fonction que le pre-remplissage, jamais recalculee. Et c'est sans danger parce que le panier existe : rien n'est ecrit avant « Confirmer », une ligne ajoutee par erreur se retire d'un balayage, et le compteur de l'en-tete change aussitot pour dire que le toucher a porte. Un ajout direct au journal aurait demande une confirmation ; une ligne au panier n'en demande aucune |
| 13 | §8.4a | La quantite se place **apres la marque**, separee par une virgule, et une portion montre **entre parentheses** ce a quoi elle revient : « 2 tranches (50 g) ». Les calories de la quantite vont **a gauche du bouton** | Demande explicite. Sur la ligne du nom, le nom et la quantite se disputaient la largeur et l'un devait ceder ; sur celle de la marque, non — les deux sont courts. Les parentheses parce que la ligne du dessous enonce toujours « kcal / 100 g » et qu'une portion sans grammes a cote ne s'y compare pas. Les calories pres du bouton parce qu'elles appartiennent a l'action : c'est le prix du toucher, pas une propriete de l'aliment |
| 14 | §8.4a | Pour un aliment **jamais consomme**, la chaine retombe sur sa quantite de reference puis sur 100, et le bouton reste offert | La ligne n'affirme pas que cette quantite a deja ete mangee : elle enonce ce que le bouton ajoutera, ce qui est vrai a chaque etape de la chaine. Retirer le bouton aurait fait de la liste des favoris deux listes selon un critere invisible |
| 15 | §8.4a | Le **nom en gras**, les calories de la quantite dans la meme voix que la marque, et **les calories pour 100 retirees** des lignes qui portent un bouton d'ajout | Demande explicite. Deux nombres de calories sur une carte et aucun n'est manifestement celui qu'on lit. Consequence assumee et consignee : ces listes cessent d'etre comparables entre elles — chaque ligne est desormais enoncee contre sa propre quantite — et c'est correct pour un ecran ou l'on logue plutot qu'on ne compare. La bibliotheque, elle, garde le chiffre pour 100, qui est ce qui la rend comparable |
| 16 | §8.4a | **L'en-tete ne defile pas** : les deux boutons et le champ de recherche restent a l'ecran, seules les listes defilent | Demande explicite. Atteindre le scanner ne doit jamais couter un retour vers le haut, sur un parcours budgete a cinq secondes, en magasin, a une main. Et un champ place au-dessus d'une zone qui defile se lit comme le filtre de cette zone, ce qu'il est — dedans, il se lisait comme le premier element d'une liste |
| 17 | §8.4a, §8.5 | Dans la **bibliotheque** aussi, les calories pour 100 quittent leur ligne et passent **a gauche du bouton favori** | Demande explicite, et ca unifie : un seul chiffre par rangee, toujours au meme endroit, dont le sens appartient a l'ecran. La bibliotheque garde le chiffre pour 100 parce que c'est ce qui rend SES listes comparables — a l'ajout, chaque rangee est enoncee contre sa propre quantite |
| 18 | §8.3, §8.4 | **Un balayage qui se termine sur la rangee ne declenche plus son appui.** Le press appartient desormais au composant de balayage, ou il est en course avec le glissement | Defaut trouve a l'usage sur l'appareil : decouvrir « Retirer » sur une ligne du panier ouvrait l'ecran de quantite. Le systeme de responder de React Native et gesture-handler n'arbitrent pas entre eux ; un Tap et un Pan du meme detecteur, si. Le Journal avait le meme defaut |
| 19 | §8.4 | **L'ecran de quantite s'affiche deja pose sur sa valeur** : les molettes ne se montent qu'une fois la quantite connue | Defaut trouve a l'usage : elles se montaient sur 100 et un effet les deplacait, ce qui se voit tourner. Un effet s'execute apres que son rendu a ete peint, donc la valeur doit exister avant les molettes |
| 20 | §8.4 | **Le clavier revient sur l'ecran de quantite**, en exception : toucher la ligne « Quantite » la transforme en champ numerique, et la valeur saisie repositionne les molettes | Demande explicite, et c'est la reserve du §14.4 n° 18 qui se depense — elle disait « taper 137 g demande de faire tourner une roue ; a rouvrir si une quantite precise devient penible ». Les molettes restent la facon dont une quantite se CHOISIT et gardent les fractions de portion ; le clavier est la facon dont une quantite exacte se DIT. Elles restent l'unique source de verite : ce qui est tape atterrit dessus, et une decimale qu'elles ne portent pas est ramenee a la plus proche, visiblement. Le nombre seul est saisi — l'unite ne change pas, puisque ce qu'on retape est le 2 de « 2 tranches » |

### 14.6 Modifications issues de la tranche 5 (13/09/2026)

Meme regle qu'en 14.4 et 14.5 : une demande ou un constat qui diverge des specs
modifie les specs, de facon signalee.

| No | Section | Modification | Motif |
| --- | --- | --- | --- |
| 1 | §8.1, §8.2 | **L'absence de modele par defaut est un etat decrit.** Tant qu'aucun modele par defaut n'est designe, une journee sans affectation applique la liste de repas de repli — Petit-dejeuner, Dejeuner, Diner, Collation — sans objectif | Le §8.1 suppose qu'un modele par defaut existe toujours et ne decrit jamais son absence. C'est pourtant l'etat d'une base neuve, et celui de toute base dont le dernier modele vient d'etre supprime. La tranche 1 avait bouche le trou en silence, dans le code ; il est desormais ecrit. Aucune graine n'est posee en migration : elle serait une seconde source de noms de repas sans supprimer la premiere, et le repli reste necessaire de toute facon |
| 2 | §8.3 | **Une journee deja materialisee sans objectif propose d'appliquer ceux du planning**, par une action explicite portee par le bandeau. Elle ne change que les quatre colonnes d'objectif, appariees par position — jamais un nom de repas, jamais le nombre de repas, jamais une entree | Sans elle le bandeau resterait muet le jour meme ou le premier modele est defini : aujourd'hui est materialisee des le petit-dejeuner logue, et une journee materialisee ne consulte jamais le planning. Ce n'est pas du retroactif — le §8.2 fait de l'action de l'utilisateur l'acte qui definit une journee, et rien ici ne se declenche seul. Le repli refuse etait de faire retomber une journee sans objectif sur le planning a la lecture : editer un modele bougerait alors le bandeau de journees vieilles de trois mois |
| 3 | §8.3 | **Le Journal enonce le modele de la journee affichee.** Virtuelle, il nomme celui que le planning resout maintenant et se touche pour surcharger cette date ; materialisee, il enonce le snapshot sans etre touchable | C'est la seule chose a l'ecran qui reponde a « j'ai modifie mon modele, pourquoi mon jeudi n'a pas bouge ». Le §8.2 rend ce comportement correct et ne l'explique nulle part a l'utilisateur |
| 4 | §8.1, §12 | **La surcharge ponctuelle se pose depuis le Journal**, sur la journee concernee ; sa liste vit dans les Reglages, ou elle se retire | Une surcharge porte sur la date qu'on a sous les yeux, et le §12 ne rangeait que le planning dans les Reglages. La poser depuis les Reglages demanderait de quitter la journee, de la retrouver dans un calendrier et de revenir. Mais une surcharge posee il y a trois semaines sur une date future est introuvable depuis le Journal tant qu'on n'a pas balaye jusqu'a elle — d'ou la liste |
| 5 | §8.4a | **Un « repas recent » est un repas passe concret** — nom, date, nombre de lignes, calories — et non un regroupement de repas partageant un nom | Le §8.4a ne donne ni fenetre, ni identite, ni regle de dedoublonnage. Regrouper par nom en exigerait une : decider quand deux « Dejeuner » sont le meme repas est une question que personne n'a posee, et toute reponse serait devinee. Seuls les repas portant au moins une entree apparaissent, et l'ordre est celui de l'ecriture des lignes, pas celui des journees — la regle deja retenue en tranche 3 pour les aliments |
| 6 | §8.4a, §5.2 | **Rejouer un repas recent rejoue les CHOIX, pas les chiffres figes** : la quantite et la portion viennent de l'ancienne entree, les macros de l'aliment tel qu'il se lit aujourd'hui | Ajouter un repas aujourd'hui est un ajout d'aujourd'hui. Le §8.5 fait de la correction d'un produit copie « le mecanisme principal de compensation de la qualite inegale de la source » : rejouer la capsule reimporterait en silence l'erreur qu'on vient de corriger, sur le chemin construit pour repeter une habitude. La quantite, elle, reste figee — meme arbitrage qu'au §14.4 pour le pre-remplissage, la taille de portion figee gagne |
| 7 | §8.4a, §5.3 | **Trois lignes repartent de leur capsule** : une saisie libre, un aliment supprime depuis, et un aliment dont l'unite de base a change | Une saisie libre n'a jamais eu d'aliment a relire, ses macros SONT le choix. Un aliment supprime ne se lit pas, et le §5.3 dit que sa suppression laisse les entrees passees intactes : faire perdre la ligne ferait payer une suppression que les specs declarent gratuite. Une unite de base changee apparierait des macros pour 100 ml avec une quantite comptee en grammes — un chiffre faux et parfaitement plausible |
| 8 | §8.4, §8.4a | **Choisir un repas recent ecrit et ferme**, la ou choisir un aliment remplit le panier | Tension entre le §8.4 v2.3, qui dit que rien n'est ecrit avant « Confirmer », et le §8.4a, qui dit que choisir un repas recent « ajoute d'un coup ». La regle du panier nomme les deux choses qu'elle regit — choisir un aliment, saisir une entree libre — et un repas recent n'est ni l'un ni l'autre : c'est un repas entier en un geste, ce qui est toute sa raison d'etre. Il se defait comme n'importe quelle ligne, par un balayage |
| 9 | §8.1 | **Supprimer un modele affiche un avertissement nommant les affectations perdues** — jours de la semaine, dates surchargees, modele par defaut — et dit que les journees enregistrees gardent tout. Jamais un blocage | Le §5.3 ne bloque aucune suppression et reserve l'avertissement nomme a l'exercice ; le meme motif s'applique ici, a moindre enjeu. L'avertissement ne compte que les affectations, jamais les journees materialisees : les mentionner effraierait pour une operation qui ne coute rien |
| 10 | §8.1 | **Un repas type sans objectif est permis** : les quatre objectifs vont ensemble ou pas du tout | Le §8.1 donne des objectifs aux repas, il n'en exige pas — une collation sans cible est un repas, pas un repas incomplet. Trois chiffres sur quatre est en revanche refuse a l'enregistrement : un objectif partiel serait un objectif que personne ne peut lire |
| 14 | §8.1, §8.3, §6.1 | **Les noms de repas sont une liste fermee** : Petit-dejeuner, Dejeuner, Diner, Collation. Un seul de chacun des trois premiers par journee et par modele ; les collations se repetent | Demande explicite. Le §8.3 laissait « ajout, renommage et suppression de repas libres » sans borner le nom, et le §6.1 decrivait un modele comme « une liste ordonnee de repas types » sans dire lesquels. Consequence : une journee copiant ses repas de son modele, la liste doit atteindre les modeles, sinon la regle tiendrait partout sauf a l'endroit qui decide de quoi une journee a l'air |
| 15 | §8.3 | **Le numero d'une collation est DERIVE, jamais stocke** : « Collation » seule, « Collation 1 » et « Collation 2 » des qu'il y en a plusieurs | D9 interdit de stocker ce qui se derive, et c'est le cas qui montre pourquoi : stockee, « Collation 2 » survivrait a la suppression de « Collation 1 » et nommerait un rang disparu. `DayMealView` porte donc `name` (stocke, adresse par les ecritures) et `label` (affiche), le libelle vivant sur la vue parce qu'il depend de la journee entiere et non d'un repas |
| 16 | §2.3 | **Aucune contrainte SQL sur `day_meal.name`**, ni CHECK ni index unique partiel | `day_meal` est gelee depuis 0001, donc une CHECK demanderait de reconstruire la table dont pend tout le journal. L'index unique partiel serait ajoutable et reste refuse : une base en service porte deja des repas nommes librement, une archive aussi, donc il echouerait a se construire sur exactement les donnees qu'il protege. La regle vit a la frontiere d'ecriture, ou elle nomme ce qu'elle refuse — meme arbitrage que `food_portion.name` en tranche 3 |
| 17 | §8.3 | **Un repas ajoute a une journee peut porter ses objectifs**, et ceux d'un repas existant se modifient | Demande explicite. Sans ca, un repas ajoute a une journee qui a un plan serait le seul a n'avoir rien a viser, et le bandeau sommerait une journee dont les parties ne l'additionnent plus — les objectifs du jour etant la somme de ceux des repas (§8.1). Ca touche la journee et jamais le modele : une journee est un snapshot, l'editer edite le snapshot |
| 18 | §8.3 | **Chaque repas porte une icone**, gardee meme sans objectif ; l'anneau, lui, disparait | Demande explicite. Les trois repas fixes se distinguent par l'heure — lever, midi, nuit — et non par la nourriture : une fourchette dirait « repas » sur les quatre. L'anneau est une proportion, et une proportion de rien n'est pas un anneau a zero mais une forme qui a l'air cassee |
| 19 | §5.1, §8.3 | **Les macros d'une JOURNEE et d'un REPAS s'affichent a l'entier**, la ou le §5.1 demande une decimale sur P, G et L. Une entree individuelle garde sa decimale | Demande explicite. Un dixieme de gramme est une vraie distinction sur un aliment, ou c'est ce qui a ete mesure ; sur une somme de douze entrees c'est du bruit arithmetique habille en precision, et il est lu a cote d'un objectif lui-meme saisi en nombre rond. Le calcul interne reste en pleine precision : c'est un arrondi au point d'affichage, comme tous les autres du module. Un test pose `formatMacro` et `formatMacroWhole` cote a cote pour qu'on ne les fusionne pas par megarde |
| 20 | §8.3 | **Chaque repas a sa propre couleur d'icone**, accordee a ce que le glyphe represente : rose d'aube, or de midi, bleu de nuit, orange de carotte | Demande explicite. Elles voisinent les teintes des macros sans que ca coute rien : un repas s'identifie par la FORME de son glyphe et une barre de macro par l'etiquette ecrite dessus, donc aucun des deux n'est jamais decode par la couleur. Chacune passe 3:1 sur sa surface — le seuil d'un objet graphique, ce qu'est un glyphe, et non le 4,5:1 d'un texte |
| 21 | §8.3 | **Deux etats pour la jauge de calories** : couleur ordinaire jusqu'a l'objectif ET au-dela tant que le depassement tient dans une marge de **50 kcal**, rouge ensuite. Remplace le seuil « au-dela de 10 % » du n° 12 | Demande explicite, apres trois essais. La marge est ABSOLUE : 10 % accorde 260 kcal de tolerance a une journee a 2 600 et 140 a une journee a 1 400, donc le mou est maximal la ou l'objectif est le plus dur a tenir. Et une jauge PLEINE ne change pas de couleur : atteindre l'objectif veut dire qu'il ne reste rien, ce qui est le but atteint. Une bande ambre y a ete essayee et retiree — elle posait un avertissement sur l'instant de la reussite, puis un second juste apres |
| 22 | §8.3 | **Le cercle de calories d'un repas fait la taille du bouton d'ajout**, et **l'etiquette d'un bouton vert est blanche** | Demande explicite. Les deux cercles sont aux deux bouts d'une meme rangee et l'oeil lit une paire avant de lire l'un ou l'autre. Pour l'etiquette : le quasi-noir etait lisible (8,98:1) et a ete refuse a vue — il se lisait comme une etiquette noire sur un bouton vif plutot que comme un controle plein. Le blanc coute 2,13:1, exactement ce que l'accent coute deja contre une carte blanche : un seul compromis, applique partout pareil |
| 23 | §8.3 | **Deux titres de section sur le Journal**, « Resume » avant le bandeau et « Alimentation » avant les repas, ferres a gauche et en gras. **Retires** : la ligne « Journee creee avec X » et l'indication « Appui long sur un repas... » | Demande explicite. Des cartes empilees se lisent comme une seule liste tant que rien ne les nomme. Consequence consignee du premier retrait : plus rien a l'ecran ne repond a « j'ai modifie mon modele, pourquoi cette journee n'a pas bouge », que le §8.2 rend pourtant correct |
