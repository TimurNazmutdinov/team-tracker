import type {
  Comment,
  History,
  Issue,
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
  sprints?: Sprint[];
  issues?: Issue[];
  links?: Link[];
  deleteLinkIds?: string[];
  comments?: Comment[];
  history?: History[];
}
