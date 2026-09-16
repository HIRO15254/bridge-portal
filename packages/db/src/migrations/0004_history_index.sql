ALTER TABLE `board_attempt` ADD `source_status` text;
--> statement-breakpoint
ALTER TABLE `board_attempt` ADD `history_metadata` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE `history_index` (
	`id` text PRIMARY KEY NOT NULL,
	`import_revision_id` text NOT NULL,
	`user_id` text NOT NULL,
	`family` text NOT NULL,
	`captured_at` integer NOT NULL,
	`capture_mode` text NOT NULL,
	`locale` text NOT NULL,
	`coverage` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`import_revision_id`) REFERENCES `import_revision`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `history_index_import_revision_id_unique` ON `history_index` (`import_revision_id`);
--> statement-breakpoint
CREATE INDEX `history_index_user_family_idx` ON `history_index` (`user_id`,`family`);
--> statement-breakpoint
CREATE TABLE `history_index_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`history_index_id` text NOT NULL,
	`source_tournament_id` text NOT NULL,
	`title` text NOT NULL,
	`played_at` integer,
	`registered_player_count` integer NOT NULL,
	`in_progress` integer NOT NULL,
	`rank` integer,
	`score` real,
	`score_type` text,
	`board_count` integer,
	`played_board_count` integer,
	`metadata` text NOT NULL,
	FOREIGN KEY (`history_index_id`) REFERENCES `history_index`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `history_index_entry_source_idx` ON `history_index_entry` (`source_tournament_id`);
