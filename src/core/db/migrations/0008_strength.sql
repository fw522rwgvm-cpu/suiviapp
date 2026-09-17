CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_muscle` text NOT NULL,
	`equipment` text,
	`media_uri` text,
	`note_execution` text,
	`note_setup` text,
	`note_breathing` text,
	`note_mistakes` text,
	`increment_kg` real NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT "ck_exercise_favorite" CHECK("exercise"."is_favorite" IN (0, 1)),
	CONSTRAINT "ck_exercise_increment" CHECK("exercise"."increment_kg" > 0)
);
--> statement-breakpoint
CREATE INDEX `ix_exercise_name` ON `exercise` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `exercise_secondary_muscle` (
	`exercise_id` text NOT NULL,
	`muscle` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `muscle`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routine` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `routine_block` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`position` integer NOT NULL,
	`rest_seconds` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_block_rest" CHECK("routine_block"."rest_seconds" IS NULL OR "routine_block"."rest_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE `routine_line` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text NOT NULL,
	`reps_min` integer,
	`reps_max` integer,
	`target_load_kg` real,
	`target_rir` real,
	`rest_seconds` integer,
	`progression_enabled` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`block_id`) REFERENCES `routine_block`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_line_progression" CHECK("routine_line"."progression_enabled" IN (0, 1)),
	CONSTRAINT "ck_line_reps" CHECK("routine_line"."reps_min" IS NULL OR "routine_line"."reps_max" IS NULL OR "routine_line"."reps_min" <= "routine_line"."reps_max"),
	CONSTRAINT "ck_line_reps_min" CHECK("routine_line"."reps_min" IS NULL OR "routine_line"."reps_min" > 0),
	CONSTRAINT "ck_line_load" CHECK("routine_line"."target_load_kg" IS NULL OR "routine_line"."target_load_kg" >= 0),
	CONSTRAINT "ck_line_rir" CHECK("routine_line"."target_rir" IS NULL OR "routine_line"."target_rir" >= 0),
	CONSTRAINT "ck_line_rest" CHECK("routine_line"."rest_seconds" IS NULL OR "routine_line"."rest_seconds" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ix_routine_line_exercise` ON `routine_line` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `routine_warmup_step` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE cascade
);
