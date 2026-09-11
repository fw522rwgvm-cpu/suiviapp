CREATE TABLE `day` (
	`date` text PRIMARY KEY NOT NULL,
	`template_id_snapshot` text,
	`template_name_snapshot` text,
	`materialized_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `day_meal` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`target_protein` real,
	`target_carbs` real,
	`target_fat` real,
	`target_kcal` real,
	FOREIGN KEY (`date`) REFERENCES `day`(`date`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_day_meal_date` ON `day_meal` (`date`);--> statement-breakpoint
CREATE TABLE `journal_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`day_meal_id` text NOT NULL,
	`date` text NOT NULL,
	`parent_entry_id` text,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`source_food_id` text,
	`source_recipe_id` text,
	`name` text NOT NULL,
	`brand` text,
	`base_unit` text,
	`quantity` real,
	`portion_name` text,
	`portion_quantity` real,
	`protein_100` real,
	`carbs_100` real,
	`fat_100` real,
	`kcal_100` real,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`day_meal_id`) REFERENCES `day_meal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_entry_kind" CHECK("journal_entry"."kind" IN ('food', 'recipe', 'recipe_item', 'free')),
	CONSTRAINT "ck_entry_base_unit" CHECK("journal_entry"."base_unit" IS NULL OR "journal_entry"."base_unit" IN ('g', 'ml'))
);
--> statement-breakpoint
CREATE INDEX `ix_entry_date` ON `journal_entry` (`date`);--> statement-breakpoint
CREATE INDEX `ix_entry_meal` ON `journal_entry` (`day_meal_id`);--> statement-breakpoint
CREATE INDEX `ix_entry_parent` ON `journal_entry` (`parent_entry_id`);--> statement-breakpoint
CREATE INDEX `ix_entry_source_food` ON `journal_entry` (`source_food_id`,`created_at`);