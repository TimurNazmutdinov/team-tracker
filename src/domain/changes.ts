import type {
  Absence,
  RoleDef,
  StatusDef,
  RetroItem,
  Comment,
  History,
  Issue,
  IssueTemplate,
  Link,
  Person,
  Project,
  ProjectMember,
  Sprint,
} from './schema';

/**
 * Набор изменений, который логика отдаёт хранилищу. Записи projects, people, members, sprints, issues и
 * links добавляются или заменяются по id; comments и history только добавляются.
 */
export interface Changes {
  projects?: Project[];
  people?: Person[];
  members?: ProjectMember[];
  deleteMemberIds?: string[];
  deleteProjectIds?: string[];
  roles?: RoleDef[];
  /** Колонки досок (ADR-024): добавляются и меняются по id; удаление — отметкой archived. */
  statuses?: StatusDef[];
  deleteRoleIds?: string[];
  absences?: Absence[];
  deleteAbsenceIds?: string[];
  retroItems?: RetroItem[];
  deleteRetroItemIds?: string[];
  templates?: IssueTemplate[];
  deleteTemplateIds?: string[];
  sprints?: Sprint[];
  issues?: Issue[];
  links?: Link[];
  deleteLinkIds?: string[];
  comments?: Comment[];
  history?: History[];
}
