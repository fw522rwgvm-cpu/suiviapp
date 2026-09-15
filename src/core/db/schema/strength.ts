import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { EntityId } from '@/core/id';

/**
 * Exercises and routines (schema 2.6, specs 6.3, 10.1, 10.2).
 *
 * Its own module, on the precedent weight.ts and notifications.ts set: a domain
 * with its own vocabulary gets its own schema file. Nothing here imports
 * another schema module and nothing imports this one — V3 is a domain of its
 * own, joined to nutrition by nothing at all.
 *
 * THE RULE THAT DECIDED WHAT SHIPS IN 0008, inherited from slice 3: a migration
 * carries what cannot be added later and defers what can. SQLite does ALTER
 * TABLE ADD COLUMN and CREATE/DROP INDEX freely; it cannot add a CHECK or a
 * foreign key without rebuilding the table. Everything irreversible in this
 * slice is in this file — six tables, their NOT NULL columns, their five
 * foreign keys and their CHECKs. The two indexes are not irreversible and are
 * explained where they sit.
 *
 * ## WHAT IS DELIBERATELY NOT HERE, AND WHY DEFERRING COSTS NOTHING
 *
 * Section 2.6 describes the whole of V3 in one block: `session`,
 * `session_segment`, `session_block`, `session_set` and `exercise_note` are all
 * in it, and none of them is here. Section 2.6 groups by VERSION; section 7
 * orders by SLICE, and it puts the live session in slice 11. They do not
 * contradict each other.
 *
 * The test that matters is the DIRECTION OF THE FOREIGN KEYS, and it is
 * favourable. session_set.exercise_id references exercise, and a foreign key is
 * declared in the CHILD: 0009 creates session_set whole, pointing at an
 * `exercise` that has existed since 0008. Same for exercise_note.exercise_id,
 * same for the three indexes those tables carry. Nothing is rebuilt, nothing is
 * ALTERed, and the only case that would have cost something — a table HERE
 * referencing `session` — does not exist.
 *
 * This is notification_setting's argument, verbatim, one slice on: not a table
 * held back despite a risk, but a table with no risk to hold back. Creating it
 * now would be a layer built "for later", which section 7 rules out and which
 * schema/index.ts restates in as many words.
 *
 * ## exercise_note IS SPECIFIED, AND IT IS SLICE 11's
 *
 * Worth stating because the table looks orphaned from here: specs 6.3 defines
 * it ("Note d'exercice — rattachée à un exercice, destinée à la prochaine
 * séance le comportant") and specs 10.3 places it in the live session ("Note
 * d'exercice pour la prochaine séance"). Its `consumed_at` column says the same
 * thing: something consumes it, and that something is a session.
 *
 * And the rule the whole schema obeys: EVERY COLUMN MUST MAP TO A JSON SCALAR.
 * The exporter reads columns straight off these objects and throws on anything
 * that is not a string, a finite number or null, so Drizzle's mode mappings are
 * excluded here as everywhere else — is_favorite and progression_enabled are
 * integers typed 0 | 1, never mode: 'boolean'.
 */

export type ExerciseId = EntityId<'exercise'>;
export type RoutineId = EntityId<'routine'>;
export type RoutineWarmupStepId = EntityId<'routine_warmup_step'>;
export type RoutineBlockId = EntityId<'routine_block'>;
export type RoutineLineId = EntityId<'routine_line'>;

/**
 * The muscle groups an exercise can name (specs 10.1, 10.2).
 *
 * ## THIS LIST IS A SPECIFICATION GAP THIS SLICE FILLS, AND IT IS FLAGGED
 *
 * Neither document gives it. "Muscle" appears five times in the specs — 10.1
 * three times, 10.2 and 10.6 once each — and never as a list; section 2.6
 * stores primary_muscle as bare TEXT. Yet 10.1 makes filtering BY muscle a
 * feature and 10.2 wants a body map lit on the right ones, so the vocabulary
 * has to exist somewhere. It exists here, chosen, not derived from anything.
 *
 * Fifteen groups, at the granularity someone labels an exercise with: the
 * drawing carves the body far finer — six separate abdominal blocks, three
 * quadriceps heads — and the body map regroups those. The mapping from one to
 * the other lives in features/strength, not here: the schema's job is the
 * vocabulary, not the picture.
 *
 * Stored in English like every other identifier in this schema; the French
 * labels live in features/strength/domain, the way day_meal.name's French does
 * NOT — that one is stored verbatim because it is frozen verbatim into a day.
 * Nothing freezes a muscle.
 *
 * ## NO CHECK, AND IT IS THE food_portion.name ARGUMENT WITH MORE FORCE
 *
 * The line slice 3 drew is not how likely a set is to move, it is WHAT
 * WIDENING IT WOULD BREAK. journal_entry.kind carries one because widening it
 * breaks the clause-free macro SUM; weight_goal.mode carries one because it
 * decides which column is read, so a third mode produces a plausible, wrong
 * rate.
 *
 * Widening this one breaks a PICTURE, not a calculation: a muscle with no
 * region simply fails to light. And a CHECK would not prevent that — it stops
 * the value being written, not the region being forgotten. What actually
 * prevents it is this list being closed in code (the editor offers nothing
 * else) plus a test requiring every entry to own at least one region of the
 * drawing.
 *
 * Then the point that settles it: slice 3 refused a CHECK on food_portion.name
 * for eight French words THE SPECS THEMSELVES GAVE. This list is invented here,
 * has never met a real exercise, and is the likeliest thing in the whole schema
 * to move. Refusing is a fortiori.
 *
 * The barrier is the export catalogue's one_of rule, which runs BEFORE the
 * first insert and names table, row and column instead of citing a constraint —
 * what D7 wants from a file repaired by hand, and the STRONGER form here.
 */
export const MUSCLES = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lats',
  'traps',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
] as const;

export type Muscle = (typeof MUSCLES)[number];

/**
 * What an exercise is performed with (specs 10.1, "filtrage par muscle et
 * matériel").
 *
 * Same specification gap as MUSCLES and the same answer. No CHECK, for a reason
 * that is weaker still than the muscles': equipment decides no calculation and
 * lights no region — it narrows a list. Widening it breaks nothing whatsoever.
 *
 * `bodyweight` is a value rather than an absence, so that "poids du corps" can
 * be FILTERED FOR. The column stays nullable, as section 2.6 declares it, and
 * NULL then means "not stated" — which the editor never writes, since it
 * requires a choice. An old archive may hold NULL; a filter simply does not
 * match it, which is the honest answer rather than a guess.
 */
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'other',
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

/**
 * The kind of a routine line (schema 2.6, specs 6.3).
 *
 * ## NO CHECK, AND SPECS 10.1 IS WHAT DECIDES IT
 *
 * > Définition du volume : charge × répétitions, sur les séries de travail
 * > validées uniquement.
 *
 * That is a POSITIVE clause — WHERE set_type = 'work' AND status = 'done' —
 * and the difference from journal_entry.kind is the whole answer. The macro SUM
 * has no clause at all: it is correct only because the set of kinds is closed,
 * so widening that one silently produces a wrong total. Here a fifth kind is
 * simply not counted, which is the right default for a kind nobody has defined
 * a volume rule for yet. Nothing becomes plausible and wrong.
 *
 * Specs 10.4 has the same shape, naming `travail` explicitly for the double
 * progression. Both calculations say what they want; neither relies on the set
 * being closed.
 *
 * And widening is FORESEEABLE: these are training variants, the most mobile
 * vocabulary in the domain, where a CHECK would mean rebuilding the table every
 * routine line hangs off.
 *
 * NO SQL DEFAULT EITHER, though specs 6.3 calls `travail` the default. That
 * default belongs to the FORM, not to the table: a default here would be a
 * second place the answer lives, free to disagree with the draft's — the defect
 * shape this project chased out of quantity prefill, where two paths to "the
 * last quantity" agreed almost always. NOT NULL with no default is what forces
 * the single path: a line cannot be inserted without the decision having been
 * taken.
 */
export const SET_TYPES = ['warmup', 'work', 'dropset', 'long'] as const;

export type SetType = (typeof SET_TYPES)[number];

/**
 * One exercise in the personal database (specs 6.3, 10.1).
 *
 * ## increment_kg IS NOT NULL WITH NO DEFAULT, AND THAT IS THE DECISION
 *
 * Specs 6.3 and 10.4 say the same thing twice: the increment is "propre à
 * l'exercice, initialisé depuis la valeur globale des Réglages". So the setting
 * is an INITIAL VALUE read once at creation and copied here — not a fallback
 * read on every access, which would make changing the setting rewrite every
 * exercise retroactively, and "propre à l'exercice" rules that out. It is a
 * captured input, which D9 declares legitimate, exactly like display_ref_qty.
 *
 * A SQL DEFAULT would be a SECOND source for that initial value, free to drift
 * from progression_increment_default_kg — and drift silently, both numbers
 * being plausible. NOT NULL with no default forces the one path through
 * TypeScript. The price is that the column is irreversible, which is why it is
 * in 0008 rather than deferred.
 *
 * ## media_uri HOLDS A RELATIVE NAME, NEVER AN ABSOLUTE URI
 *
 * Specs 6.3 puts media outside the JSON export and architecture point 8 accepts
 * it. But the column itself travels — the catalogue excludes TABLES, never
 * columns, and inventing per-column exclusion inside the one safety net there
 * is would be the worst possible place for a new mechanism.
 *
 * So what travels must be worth travelling. An absolute iOS path would not be:
 * an application's container is named by a UUID that CHANGES ON REINSTALL, so
 * the path dies without any export being involved — every SideStore cycle is a
 * chance. A name relative to a known folder survives that, and comes back alive
 * the moment the folder is restored, which is precisely what specs 5.4 no 4
 * describes of the manual copy that "emporte les médias".
 *
 * NOTHING WRITES IT IN THIS SLICE. Choosing a file needs expo-image-picker,
 * outside section 5. The column is created because it is free and because
 * forgetting it would cost a migration; specs 5.4 no 3 already requires a
 * missing medium to show a substitute and never crash.
 */
export const exercise = sqliteTable(
  'exercise',
  {
    id: text('id').$type<ExerciseId>().primaryKey(),
    name: text('name').notNull(),
    primaryMuscle: text('primary_muscle').$type<Muscle>().notNull(),
    /** NULL means "not stated": the editor always writes one. */
    equipment: text('equipment').$type<Equipment>(),
    /** Relative file name, never an absolute URI. Unwritten in slice 10. */
    mediaUri: text('media_uri'),
    noteExecution: text('note_execution'),
    noteSetup: text('note_setup'),
    noteBreathing: text('note_breathing'),
    noteMistakes: text('note_mistakes'),
    incrementKg: real('increment_kg').notNull(),
    /** 0 or 1, never a boolean: every column must map to a JSON scalar. */
    isFavorite: integer('is_favorite').$type<0 | 1>().notNull().default(0),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (table) => [
    /**
     * ck_recipe_favorite, verbatim: a boolean can never widen, so constraining
     * it costs nothing, ever.
     */
    check('ck_exercise_favorite', sql`${table.isFavorite} IN (0, 1)`),
    /**
     * An increment of zero or less breaks the double progression of specs 10.4,
     * and "no progression" is already said by progression_enabled = 0. The
     * precedent is ck_weight_value.
     *
     * Safe where slice 3 refused every CHECK on macros: that refusal existed
     * because specs 8.5 requires Open Food Facts values to be flagged and
     * editable, never refused, and slice 4 copies them automatically. There is
     * no foreign source here — an increment comes from a form.
     */
    check('ck_exercise_increment', sql`${table.incrementKg} > 0`),
    /**
     * For the ORDER BY, not for the search — ix_food_name's lesson, restated
     * because this index's name promises more than it delivers.
     *
     * LIKE '%x%' uses no index, ever, and even a prefix match would skip this
     * one: SQLite applies its LIKE optimisation only when the index collation
     * matches case_sensitive_like, which is off by default. The search is a
     * pure function over the cached list, as it is for foods, and for the same
     * reason — accent-insensitive matching is unreachable from SQL, whose
     * NOCASE and lower() are ASCII-only.
     *
     * NOCASE so that "arraché" does not sort after every capital letter.
     */
    index('ix_exercise_name').on(sql`${table.name} COLLATE NOCASE`),
  ],
);

/**
 * The secondary muscles of an exercise (specs 6.3).
 *
 * A composite primary key, the second in this schema after recipe_tag, and the
 * catalogue already handles the shape: Drizzle states a single-column key on
 * the column and a composite one on the TABLE, leaving column.primary false
 * throughout, which is what once made recipe_tag look keyless.
 *
 * ## THE FOREIGN KEY IS A DIVERGENCE FROM SECTION 2.6, AND IT IS FLAGGED
 *
 * Section 2.6 writes this table with no REFERENCES at all —
 * `exercise_secondary_muscle(exercise_id TEXT, muscle TEXT, PRIMARY KEY(...))`
 * — while its siblings routine_block and routine_line both carry one. The same
 * uneven rigour as day_meal lacking a uniqueness constraint where food_portion
 * has one, and the same choice made the other way here, because the cost is not
 * symmetric: without it, deleting an exercise leaves rows no barrier would ever
 * see, and barrier 3 of the import runs foreign_key_check.
 *
 * CASCADE, on the recipe_tag precedent: a secondary muscle has no existence
 * apart from its exercise.
 */
export const exerciseSecondaryMuscle = sqliteTable(
  'exercise_secondary_muscle',
  {
    exerciseId: text('exercise_id')
      .$type<ExerciseId>()
      .notNull()
      .references(() => exercise.id, { onDelete: 'cascade' }),
    muscle: text('muscle').$type<Muscle>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.exerciseId, table.muscle] })],
);

/** A routine: a name, warm-up steps, and an ordered list of blocks (specs 10.2). */
export const routine = sqliteTable('routine', {
  id: text('id').$type<RoutineId>().primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
});

/**
 * One line of the warm-up, as typed (specs 10.2, "une étape par ligne saisie").
 *
 * Section 2.6 writes `position INTEGER, text TEXT` without NOT NULL, where
 * recipe_step — the same table in every respect — carries both. Taken as the
 * uneven rigour it is and corrected: a step with no text is a row nothing can
 * display, and a step with no position is a row nothing can order.
 *
 * The foreign key is the same divergence as exercise_secondary_muscle's, with
 * the same answer and the same precedent, recipe_step.
 */
export const routineWarmupStep = sqliteTable('routine_warmup_step', {
  id: text('id').$type<RoutineWarmupStepId>().primaryKey(),
  routineId: text('routine_id')
    .$type<RoutineId>()
    .notNull()
    .references(() => routine.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
});

/**
 * A block: one exercise, or several as a superset (specs 10.2).
 *
 * ## rest_seconds LIVES HERE *AND* ON THE LINE, AND THAT IS THE SUPERSET RULE
 *
 * > Superset : plusieurs exercices dans un bloc, chacun avec ses propres
 * > paramètres, le temps de repos étant défini au niveau du superset.
 *
 * So a block holding one exercise leaves this NULL and each line carries its
 * own rest; a superset sets it here and the lines' own values stop applying.
 * Two columns for one idea looks like duplication and is not: they answer
 * different questions, and which one is read is decided by the block's shape,
 * not by their values. The rule lives in features/strength, where it can be
 * tested, rather than in a CHECK spanning two tables — which SQLite could not
 * express anyway.
 *
 * NO UNIQUENESS ON (routine_id, position). The same unevenness day_meal and
 * food_portion already carry, followed as it stands rather than corrected in
 * one place out of three.
 */
export const routineBlock = sqliteTable(
  'routine_block',
  {
    id: text('id').$type<RoutineBlockId>().primaryKey(),
    routineId: text('routine_id')
      .$type<RoutineId>()
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** Set only for a superset; NULL leaves each line its own rest. */
    restSeconds: integer('rest_seconds'),
  },
  (table) => [
    check('ck_block_rest', sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`),
  ],
);

/**
 * One line of a routine — that is, one set (schema 2.6, specs 6.3, 10.2).
 *
 * ## exercise_id IS NO ACTION, AND SPECS 5.3 IS WHY IT IS NOT CASCADE
 *
 * Section 2.6 gives no ON DELETE action, so the SQLite default applies —
 * NO ACTION, which BLOCKS deleting an exercise a routine uses. Specs 5.3 is
 * flatly the other way: "Aucune suppression n'est bloquée". A contradiction to
 * resolve, and this project has resolved the same one before.
 *
 * The precedent is recipe_ingredient.food_id, also NO ACTION, with deleteFood()
 * freezing the ingredients and then deleting, in one transaction. The foreign
 * key is the NET; the policy is in the transaction. deleteExercise() does the
 * same: it removes the routine lines, and the blocks left empty by removing
 * them, before deleting the exercise.
 *
 * And specs 5.3 asks for more than permission, which is what settles it against
 * CASCADE:
 *
 * > Supprimer un exercice possédant des séances affiche un avertissement
 * > nommant explicitement ce qui sera perdu.
 *
 * To name it, the application has to count it first. Having counted, it can
 * delete what it announced. A CASCADE would do the same work silently and leave
 * the warning guessing — and the warning is the point of that paragraph.
 *
 * Nothing is frozen on the way out, unlike an ingredient: a routine is a living
 * object, and a line without its exercise says nothing at all. What DOES freeze
 * is session_set.exercise_name_frozen, in slice 11, which is where history
 * starts.
 *
 * ## position AND set_index ARE NOT THE SAME NUMBER
 *
 * `position` orders the lines within the block, as displayed. `set_index` is
 * the rank of the set FOR ITS EXERCISE in that block. A superset of A and B at
 * three sets each holds six lines at positions 0..5, with set_index 1,2,3,1,2,3
 * — lines grouped by exercise, because a routine is a list to be read, and it
 * is the session (slice 11) that decides the order they are performed in.
 * Stated here because nothing in section 2.6 says it and both readings work.
 */
export const routineLine = sqliteTable(
  'routine_line',
  {
    id: text('id').$type<RoutineLineId>().primaryKey(),
    blockId: text('block_id')
      .$type<RoutineBlockId>()
      .notNull()
      .references(() => routineBlock.id, { onDelete: 'cascade' }),
    /** NO ACTION: the net. deleteExercise() carries the policy. */
    exerciseId: text('exercise_id')
      .$type<ExerciseId>()
      .notNull()
      .references(() => exercise.id),
    position: integer('position').notNull(),
    setIndex: integer('set_index').notNull(),
    setType: text('set_type').$type<SetType>().notNull(),
    repsMin: integer('reps_min'),
    repsMax: integer('reps_max'),
    targetLoadKg: real('target_load_kg'),
    targetRir: real('target_rir'),
    restSeconds: integer('rest_seconds'),
    /** 0 or 1, never a boolean: every column must map to a JSON scalar. */
    progressionEnabled: integer('progression_enabled').$type<0 | 1>().notNull().default(0),
    note: text('note'),
  },
  (table) => [
    check('ck_line_progression', sql`${table.progressionEnabled} IN (0, 1)`),
    /**
     * An inverted range puts the "haut de la plage" of specs 10.4 BELOW its
     * bottom, so the progression suggestion fires when it should not —
     * plausible and wrong, which is the bar a CHECK has to clear.
     *
     * A cross-column constraint, on the ck_ingredient_link and
     * ck_weight_goal_terms precedent: rules are per-column and this one spans
     * two, so SQL is the only place it can live.
     */
    check(
      'ck_line_reps',
      sql`${table.repsMin} IS NULL OR ${table.repsMax} IS NULL OR ${table.repsMin} <= ${table.repsMax}`,
    ),
    check('ck_line_reps_min', sql`${table.repsMin} IS NULL OR ${table.repsMin} > 0`),
    /** Zero is legitimate — a bodyweight movement has no load to state. */
    check('ck_line_load', sql`${table.targetLoadKg} IS NULL OR ${table.targetLoadKg} >= 0`),
    check('ck_line_rir', sql`${table.targetRir} IS NULL OR ${table.targetRir} >= 0`),
    check('ck_line_rest', sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`),
    /**
     * Answers "which routines use this exercise?", which is the question
     * deleteExercise() asks before it deletes and the warning of specs 5.3
     * needs answered. The precedent is ix_ingredient_food, for the same
     * question about a food.
     *
     * Not irreversible — an index never is (slice 3's corollary) — and it has a
     * caller from day one.
     */
    index('ix_routine_line_exercise').on(table.exerciseId),
  ],
);

export type ExerciseRow = typeof exercise.$inferSelect;
export type ExerciseSecondaryMuscleRow = typeof exerciseSecondaryMuscle.$inferSelect;
export type RoutineRow = typeof routine.$inferSelect;
export type RoutineWarmupStepRow = typeof routineWarmupStep.$inferSelect;
export type RoutineBlockRow = typeof routineBlock.$inferSelect;
export type RoutineLineRow = typeof routineLine.$inferSelect;
