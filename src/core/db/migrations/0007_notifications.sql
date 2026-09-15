CREATE TABLE `notification_setting` (
	`kind` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`hour` integer,
	`minute` integer,
	CONSTRAINT "ck_notification_enabled" CHECK("notification_setting"."enabled" IN (0, 1))
);
