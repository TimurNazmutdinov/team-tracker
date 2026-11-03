CREATE TABLE "statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"order" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
-- Колонки по умолчанию (ADR-024): id совпадают с прежними названиями статусов, поэтому задачи и история
-- остаются как есть, а откат на прежнюю версию программы безопасен.
INSERT INTO "statuses" ("id", "name", "category", "order", "archived") VALUES
  ('Backlog', 'Backlog', 'backlog', 0, false),
  ('To Do', 'To Do', 'todo', 1, false),
  ('In Progress', 'In Progress', 'progress', 2, false),
  ('Review', 'Review', 'progress', 3, false),
  ('Done', 'Done', 'done', 4, false);
--> statement-breakpoint
-- Право «Колонки досок» (board.columns) получает тимлид; у администратора все права всегда (ADR-021)
UPDATE "roles" SET "permissions" = "permissions" || '["board.columns"]'::jsonb
  WHERE "id" = 'lead' AND NOT ("permissions" @> '["board.columns"]'::jsonb);
