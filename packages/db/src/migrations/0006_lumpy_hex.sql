CREATE TABLE `device_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code_hash` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_authorization_device_code_hash_unique` ON `device_authorization` (`device_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_authorization_user_code_hash_unique` ON `device_authorization` (`user_code_hash`);--> statement-breakpoint
CREATE INDEX `device_authorization_expiry_idx` ON `device_authorization` (`expires_at`);