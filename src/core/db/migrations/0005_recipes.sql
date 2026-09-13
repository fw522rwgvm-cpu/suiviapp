CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prep_minutes` integer,
	`yield_type` text NOT NULL,
	`yield_value` real NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT "ck_recipe_yield_type" CHECK("recipe"."yield_type" IN ('portions', 'weight')),
	CONSTRAINT "ck_recipe_yield_value" CHECK("recipe"."yield_value" > 0),
	CONSTRAINT "ck_recipe_favorite" CHECK("recipe"."is_favorite" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`food_id` text,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`frozen_name` text,
	`frozen_base_unit` text,
	`frozen_protein_100` real,
	`frozen_carbs_100` real,
	`frozen_fat_100` real,
	`frozen_kcal_100` real,
	`frozen_at` integer,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_ingredient_unit" CHECK("recipe_ingredient"."unit" IN ('g', 'ml')),
	CONSTRAINT "ck_ingredient_frozen_base_unit" CHECK("recipe_ingredient"."frozen_base_unit" IS NULL OR "recipe_ingredient"."frozen_base_unit" IN ('g', 'ml')),
	CONSTRAINT "ck_ingredient_quantity" CHECK("recipe_ingredient"."quantity" > 0),
	CONSTRAINT "ck_ingredient_link" CHECK("recipe_ingredient"."food_id" IS NOT NULL OR "recipe_ingredient"."frozen_kcal_100" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `ix_ingredient_food` ON `recipe_ingredient` (`food_id`);--> statement-breakpoint
CREATE TABLE `recipe_step` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_tag` (
	`recipe_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
