CREATE TABLE `off_cache` (
	`barcode` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `food` ADD `barcode` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_food_barcode` ON `food` (`barcode`) WHERE "food"."barcode" IS NOT NULL;