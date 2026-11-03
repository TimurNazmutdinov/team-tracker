-- Тип Story убран (ADR-024): задачи и шаблоны Story становятся Task. Старая версия программы Task понимает,
-- поэтому откат на неё после этой миграции безопасен.
UPDATE "issues" SET "type" = 'Task' WHERE "type" = 'Story';
--> statement-breakpoint
UPDATE "issue_templates" SET "type" = 'Task' WHERE "type" = 'Story';
