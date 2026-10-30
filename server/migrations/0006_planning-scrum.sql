CREATE TABLE "absences" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retro_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sprint_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" text NOT NULL,
	"issue_id" text
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "dod" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "retro_items" ADD CONSTRAINT "retro_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absences_person_idx" ON "absences" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "retro_items_project_idx" ON "retro_items" USING btree ("project_id");