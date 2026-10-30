import { z } from 'zod';
import type { Changes } from '../../src/domain/changes';
import {
  commentSchema,
  historySchema,
  issueSchema,
  linkSchema,
  memberSchema,
  templateSchema,
  absenceSchema,
  retroItemSchema,
  personSchema,
  projectSchema,
  sprintSchema,
} from '../../src/domain/schema';

/** Тело запроса commit: та же форма, что у Changes в логике приложения. */
export const changesSchema: z.ZodType<Changes> = z.strictObject({
  projects: z.array(projectSchema).optional(),
  people: z.array(personSchema).optional(),
  members: z.array(memberSchema).optional(),
  deleteMemberIds: z.array(z.string().min(1)).optional(),
  absences: z.array(absenceSchema).optional(),
  deleteAbsenceIds: z.array(z.string().min(1)).optional(),
  retroItems: z.array(retroItemSchema).optional(),
  deleteRetroItemIds: z.array(z.string().min(1)).optional(),
  templates: z.array(templateSchema).optional(),
  deleteTemplateIds: z.array(z.string().min(1)).optional(),
  sprints: z.array(sprintSchema).optional(),
  issues: z.array(issueSchema).optional(),
  links: z.array(linkSchema).optional(),
  deleteLinkIds: z.array(z.string().min(1)).optional(),
  comments: z.array(commentSchema).optional(),
  history: z.array(historySchema).optional(),
});
