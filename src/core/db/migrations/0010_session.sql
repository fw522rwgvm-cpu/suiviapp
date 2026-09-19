CREATE TABLE `exercise_note` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer,
	`consumed_at` integer,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_note_exercise` ON `exercise_note` (`exercise_id`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`routine_id` text,
	`routine_name_snapshot` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`notes` text,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT "ck_session_status" CHECK("session"."status" IN ('in_progress', 'done')),
	CONSTRAINT "ck_session_order" CHECK("session"."ended_at" IS NULL OR "session"."ended_at" >= "session"."started_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_session_active` ON `session` (`status`) WHERE "session"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX `ix_session_date` ON `session` (`date`);--> statement-breakpoint
CREATE TABLE `session_block` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`rest_seconds` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_session_block_rest" CHECK("session_block"."rest_seconds" IS NULL OR "session_block"."rest_seconds" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ix_session_block_session` ON `session_block` (`session_id`);--> statement-breakpoint
CREATE TABLE `session_segment` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_segment_order" CHECK("session_segment"."ended_at" IS NULL OR "session_segment"."ended_at" >= "session_segment"."started_at")
);
--> statement-breakpoint
CREATE INDEX `ix_segment_session` ON `session_segment` (`session_id`);--> statement-breakpoint
CREATE TABLE `session_set` (
	`id` text PRIMARY KEY NOT NULL,
	`session_block_id` text NOT NULL,
	`exercise_id` text,
	`exercise_name_frozen` text NOT NULL,
	`position` integer NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text NOT NULL,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`target_load_kg` real,
	`target_rir` real,
	`target_duration_seconds` integer,
	`rest_seconds` integer,
	`progression_enabled` integer DEFAULT 0 NOT NULL,
	`actual_reps` integer,
	`actual_load_kg` real,
	`actual_rir` real,
	`actual_duration_seconds` integer,
	`status` text NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`session_block_id`) REFERENCES `session_block`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_set_progression" CHECK("session_set"."progression_enabled" IN (0, 1)),
	CONSTRAINT "ck_set_target_reps" CHECK("session_set"."target_reps_min" IS NULL OR "session_set"."target_reps_max" IS NULL OR "session_set"."target_reps_min" <= "session_set"."target_reps_max"),
	CONSTRAINT "ck_set_actual_reps" CHECK("session_set"."actual_reps" IS NULL OR "session_set"."actual_reps" >= 0),
	CONSTRAINT "ck_set_actual_load" CHECK("session_set"."actual_load_kg" IS NULL OR "session_set"."actual_load_kg" >= 0),
	CONSTRAINT "ck_set_actual_rir" CHECK("session_set"."actual_rir" IS NULL OR "session_set"."actual_rir" >= 0),
	CONSTRAINT "ck_set_rest" CHECK("session_set"."rest_seconds" IS NULL OR "session_set"."rest_seconds" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ix_set_exercise` ON `session_set` (`exercise_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `ix_set_block` ON `session_set` (`session_block_id`);