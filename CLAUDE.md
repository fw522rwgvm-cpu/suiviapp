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