CREATE TABLE `weight_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`target_kg` real NOT NULL,
	`mode` text NOT NULL,
	`target_date` text,
	`rate_kg_per_week` real,
	`defined_at` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_weight_goal_mode" CHECK("weight_goal"."mode" IN ('target_date', 'rate')),
	CONSTRAINT "ck_weight_goal_terms" CHECK(("weight_goal"."mode" = 'target_date' AND "weight_goal"."target_date" IS NOT NULL AND "weight_goal"."rate_kg_per_week" IS NULL)
       OR ("weight_goal"."mode" = 'rate' AND "weight_goal"."rate_kg_per_week" IS NOT NULL AND "weight_goal"."target_date" IS NULL)),
	CONSTRAINT "ck_weight_goal_target" CHECK("weight_goal"."target_kg" > 0),
	CONSTRAINT "ck_weight_goal_active" CHECK("weight_goal"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_weight_goal_active` ON `weight_goal` (`is_active`) WHERE "weight_goal"."is_active" = 1;--> statement-breakpoint
CREATE TABLE `weight_measure` (
	`date` text PRIMARY KEY NOT NULL,
	`value_kg` real NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT "ck_weight_value" CHECK("weight_measure"."value_kg" > 0)
);
