CREATE TABLE "issue_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"acceptance" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "wip_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "wip_limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_templates_project_idx" ON "issue_templates" USING btree ("project_id");--> statement-breakpoint
-- Проекты, созданные до этой версии, получают шаблоны по умолчанию (как у новых проектов, ADR-017)
INSERT INTO "issue_templates" ("id", "project_id", "name", "type", "description", "acceptance")
SELECT p."id" || '-tpl-bug', p."id", $tpl$Баг$tpl$, 'Bug',
  $tpl$## Шаги воспроизведения
1. Шаг первый

## Ожидалось
Опишите, что должно было произойти

## Получилось
Опишите, что произошло на самом деле

## Окружение
Браузер и версия: …
Роль пользователя: …$tpl$,
  $tpl$- [ ] Ошибка не воспроизводится по шагам
- [ ] Добавлен тест на этот случай$tpl$
FROM "projects" p;
--> statement-breakpoint
INSERT INTO "issue_templates" ("id", "project_id", "name", "type", "description", "acceptance")
SELECT p."id" || '-tpl-story', p."id", $tpl$Story$tpl$, 'Story',
  $tpl$## Контекст
Почему это нужно

## Цель
Как … я хочу …, чтобы …$tpl$,
  $tpl$- [ ] Первый критерий приёмки
- [ ] Второй критерий приёмки$tpl$
FROM "projects" p;
--> statement-breakpoint
INSERT INTO "issue_templates" ("id", "project_id", "name", "type", "description", "acceptance")
SELECT p."id" || '-tpl-task', p."id", $tpl$Задача$tpl$, 'Task',
  $tpl$## Что нужно сделать
Коротко опишите работу$tpl$,
  $tpl$- [ ] Работа выполнена$tpl$
FROM "projects" p;
