CREATE TABLE `day_template` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `day_template_meal` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`target_protein` real,
	`target_carbs` real,
	`target_fat` real,
	`target_kcal` real,
	FOREIGN KEY (`template_id`) REFERENCES `day_template`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planning_override` (
	`date` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `day_template`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planning_weekday` (
	`weekday` integer PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `day_template`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_planning_weekday" CHECK("planning_weekday"."weekday" BETWEEN 1 AND 7)
);
