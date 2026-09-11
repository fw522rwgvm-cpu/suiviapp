CREATE TABLE `food` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`source` text NOT NULL,
	`base_unit` text NOT NULL,
	`protein_100` real NOT NULL,
	`carbs_100` real NOT NULL,
	`fat_100` real NOT NULL,
	`kcal_100` real NOT NULL,
	`display_ref_qty` real DEFAULT 100 NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT "ck_food_source" CHECK("food"."source" IN ('perso', 'off')),
	CONSTRAINT "ck_food_base_unit" CHECK("food"."base_unit" IN ('g', 'ml')),
	CONSTRAINT "ck_food_favorite" CHECK("food"."is_favorite" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `ix_food_name` ON `food` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `food_portion` (
	`id` text PRIMARY KEY NOT NULL,
	`food_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_portion_quantity" CHECK("food_portion"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_portion_food_name` ON `food_portion` (`food_id`,`name`);