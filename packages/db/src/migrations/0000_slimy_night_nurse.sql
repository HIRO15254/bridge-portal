CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `auction_call` (
	`id` text PRIMARY KEY NOT NULL,
	`board_attempt_id` text NOT NULL,
	`call_index` integer NOT NULL,
	`seat` text NOT NULL,
	`call` text NOT NULL,
	`alert` text,
	FOREIGN KEY (`board_attempt_id`) REFERENCES `board_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auction_call_order_uq` ON `auction_call` (`board_attempt_id`,`call_index`);--> statement-breakpoint
CREATE TABLE `board_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_revision_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`board_number` integer NOT NULL,
	`hero_seat` text,
	`contract` text,
	`declarer` text,
	`result` integer,
	`system_version_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_revision_id`) REFERENCES `tournament_revision`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deal_id`) REFERENCES `deal`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`system_version_id`) REFERENCES `system_version`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_attempt_number_uq` ON `board_attempt` (`tournament_revision_id`,`board_number`);--> statement-breakpoint
CREATE TABLE `board_score` (
	`id` text PRIMARY KEY NOT NULL,
	`board_attempt_id` text NOT NULL,
	`type` text NOT NULL,
	`value` real,
	`contract_made` integer,
	FOREIGN KEY (`board_attempt_id`) REFERENCES `board_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_score_board_attempt_id_unique` ON `board_score` (`board_attempt_id`);--> statement-breakpoint
CREATE TABLE `bridge_system` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bridge_system_user_id_idx` ON `bridge_system` (`user_id`);--> statement-breakpoint
CREATE TABLE `deal` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_hash` text NOT NULL,
	`dealer` text NOT NULL,
	`vulnerability` text NOT NULL,
	`pbn_deal` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_deal_hash_unique` ON `deal` (`deal_hash`);--> statement-breakpoint
CREATE TABLE `double_dummy_result` (
	`id` text PRIMARY KEY NOT NULL,
	`board_attempt_id` text NOT NULL,
	`deal_hash` text NOT NULL,
	`solver_version` text NOT NULL,
	`dd_table` text NOT NULL,
	`par` text NOT NULL,
	`actual_contract_max_tricks` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`board_attempt_id`) REFERENCES `board_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `double_dummy_version_uq` ON `double_dummy_result` (`board_attempt_id`,`solver_version`);--> statement-breakpoint
CREATE TABLE `evaluation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`board_attempt_id` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`rule_engine_version` text NOT NULL,
	`system_version_id` text,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`board_attempt_id`) REFERENCES `board_attempt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`system_version_id`) REFERENCES `system_version`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `evaluation_run_board_idx` ON `evaluation_run` (`board_attempt_id`);--> statement-breakpoint
CREATE TABLE `import_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tournament_id` text,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`status` text NOT NULL,
	`warnings` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournament`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_revision_hash_uq` ON `import_revision` (`user_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `play_action` (
	`id` text PRIMARY KEY NOT NULL,
	`board_attempt_id` text NOT NULL,
	`action_index` integer NOT NULL,
	`trick_number` integer NOT NULL,
	`seat` text NOT NULL,
	`card` text NOT NULL,
	FOREIGN KEY (`board_attempt_id`) REFERENCES `board_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_action_order_uq` ON `play_action` (`board_attempt_id`,`action_index`);--> statement-breakpoint
CREATE TABLE `rule_evaluation` (
	`id` text PRIMARY KEY NOT NULL,
	`evaluation_run_id` text NOT NULL,
	`rule_version_id` text NOT NULL,
	`evaluation_key` text NOT NULL,
	`automatic_verdict` text NOT NULL,
	`reason_code` text NOT NULL,
	`action_index` integer,
	`facts` text NOT NULL,
	FOREIGN KEY (`evaluation_run_id`) REFERENCES `evaluation_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_evaluation_key_uq` ON `rule_evaluation` (`evaluation_run_id`,`rule_version_id`,`evaluation_key`);--> statement-breakpoint
CREATE TABLE `rule_evaluation_override` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_evaluation_id` text NOT NULL,
	`verdict` text NOT NULL,
	`reason` text NOT NULL,
	`corrected_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`rule_evaluation_id`) REFERENCES `rule_evaluation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`corrected_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_evaluation_override_rule_evaluation_id_unique` ON `rule_evaluation_override` (`rule_evaluation_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `system_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`system_id` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`adopted_official_item_ids` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`system_id`) REFERENCES `bridge_system`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_draft_system_id_unique` ON `system_draft` (`system_id`);--> statement-breakpoint
CREATE TABLE `system_version` (
	`id` text PRIMARY KEY NOT NULL,
	`system_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`name` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`adopted_official_item_ids` text NOT NULL,
	`settings` text NOT NULL,
	`published_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`system_id`) REFERENCES `bridge_system`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_version_number_uq` ON `system_version` (`system_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `tournament` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`external_id` text NOT NULL,
	`family` text NOT NULL,
	`name` text NOT NULL,
	`active_revision_id` text,
	`default_system_version_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_system_version_id`) REFERENCES `system_version`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_external_uq` ON `tournament` (`user_id`,`family`,`external_id`);--> statement-breakpoint
CREATE TABLE `tournament_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`import_revision_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`played_at` integer,
	`completion` text NOT NULL,
	`board_count` integer NOT NULL,
	`score_type` text NOT NULL,
	`tournament_score` real,
	`rank` integer,
	`participant_count` integer,
	`family_metadata` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournament`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_revision_id`) REFERENCES `import_revision`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_revision_import_revision_id_unique` ON `tournament_revision` (`import_revision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_revision_number_uq` ON `tournament_revision` (`tournament_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`funbridge_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_funbridge_id_unique` ON `user` (`funbridge_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);