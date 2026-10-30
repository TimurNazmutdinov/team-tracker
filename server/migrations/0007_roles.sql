CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
-- Четыре роли по умолчанию: существующие учётки сохраняют свои роли (ADR-021)
INSERT INTO "roles" ("id", "name", "permissions", "system") VALUES
  ('developer', $r$Разработчик$r$, '["issue.create", "issue.edit", "issue.comment", "status.own"]'::jsonb, false),
  ('product', $r$Продакт$r$, '["issue.create", "issue.edit", "issue.comment", "status.own", "status.other", "backlog.rank", "sprint.items", "project.members"]'::jsonb, false),
  ('lead', $r$Тимлид / scrum-мастер$r$, '["issue.create", "issue.edit", "issue.comment", "status.own", "status.other", "backlog.rank", "sprint.items", "sprint.manage", "project.templates", "people.availability"]'::jsonb, false),
  ('admin', $r$Администратор$r$, '["issue.create", "issue.edit", "issue.comment", "status.own", "status.other", "backlog.rank", "sprint.items", "sprint.manage", "project.templates", "people.availability", "project.create", "project.members", "users.manage", "backups.manage", "system.diagnose"]'::jsonb, true);
