CREATE TRIGGER `system_version_prevent_update`
BEFORE UPDATE ON `system_version`
BEGIN
  SELECT RAISE(ABORT, 'published system versions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `system_version_prevent_delete`
BEFORE DELETE ON `system_version`
BEGIN
  SELECT RAISE(ABORT, 'published system versions are immutable');
END;
