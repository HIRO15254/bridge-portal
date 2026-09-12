ALTER TABLE `user` ADD `singleton_key` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `user_singleton_uq` ON `user` (`singleton_key`);