import type { Comment, History, Issue, Link, Person, Project, Sprint } from './schema';

/**
 * Набор изменений, который логика отдаёт хранилищу. Записи projects, people, sprints, issues и
 * links добавляются или заменяются по id; comments и history только добавляются.
 */
export interface Changes {
  projects?: Project[];
  people?: Person[];
  sprints?: Sprint[];
  issues?: Issue[];
  links?: Link[];
  deleteLinkIds?: string[];
  comments?: Comment[];
  history?: History[];
}
