import { epicProgress, type EpicProgress } from './progress';
import { fillOf, sprintCapacity, type Capacity, type Fill } from './planning';
import { burndown } from './reports';
import {
  STATUSES,
  type History,
  type Issue,
  type Link,
  type Person,
  type Project,
  type Sprint,
  type Status,
} from './schema';
import { sprintSnapshots, summarize } from './totals';

// «Портфель» (ADR-016): сводка по проекту — активный спринт, выполнение, заполнение, просрочки,
// блокировки, прогресс эпиков и признаки риска. Ничего не хранится: всё считается из данных проекта.

export type RiskKind = 'overload' | 'ended' | 'overdue' | 'blocked';

export const RISK_LABELS: Record<RiskKind, string> = {
  overload: 'перегруз',
  ended: 'спринт закончился',
  overdue: 'просрочки',
  blocked: 'блокировки',
};

/** Вес признака при сортировке по риску: перегруз и законченный спринт тяжелее. */
const RISK_WEIGHT: Record<RiskKind, number> = { overload: 3, ended: 3, overdue: 2, blocked: 2 };

export interface BlockedIssue {
  issue: Issue;
  /** Незавершённые задачи, которые её блокируют. */
  by: Issue[];
}

export interface ProjectOverview {
  project: Project;
  owner: Person | null;
  /** Активный спринт; null — активного нет. */
  sprint: Sprint | null;
  /** Дней до конца спринта (0 — последний день; меньше нуля — спринт закончился). */
  daysLeft: number | null;
  /** Объём спринта в story points. */
  scope: number;
  done: number;
  /** Доля выполненного, целые проценты. */
  percent: number;
  /** Остаток по дням (для мини-burndown) и идеальная линия; null, если спринта нет. */
  burndown: { remaining: number[]; ideal: number[] } | null;
  /** Задачи спринта (кроме Epic) по статусам. */
  byStatus: Record<Status, number>;
  capacity: Capacity;
  fill: Fill | null;
  overdue: Issue[];
  blocked: BlockedIssue[];
  /** Незавершённые эпики с прогрессом, крупные первыми. */
  epics: { epic: Issue; progress: EpicProgress }[];
  risks: RiskKind[];
  /** Сумма весов признаков риска. */
  riskScore: number;
}

export interface OverviewInput {
  project: Project;
  owner: Person | null;
  sprints: Sprint[];
  issues: Issue[];
  links: Link[];
  history: History[];
  /** Сегодня, ГГГГ-ММ-ДД. */
  today: string;
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export function projectOverview(input: OverviewInput): ProjectOverview {
  const { project, owner, sprints, issues, links, history, today } = input;
  const sprint = sprints.find((s) => s.state === 'active') ?? null;
  const capacity = sprintCapacity(sprints, issues, history);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  let scope = 0;
  let done = 0;
  let chart: ProjectOverview['burndown'] = null;
  if (sprint) {
    const snaps = sprintSnapshots(sprint, issues, history);
    const total = summarize(snaps, []).total;
    scope = total.points;
    done = total.done;
    for (const s of snaps) if (s.issue.type !== 'Epic') byStatus[s.status] += 1;
    const days = burndown(sprint, issues, history, today).filter((d) => d.remaining !== null);
    if (days.length > 1) {
      chart = {
        remaining: days.map((d) => d.remaining ?? 0),
        ideal: days.map((d) => d.ideal),
      };
    }
  }

  const overdue = issues
    .filter(
      (i) => i.type !== 'Epic' && i.status !== 'Done' && i.dueDate !== null && i.dueDate < today,
    )
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.number - b.number);

  const byId = new Map(issues.map((i) => [i.id, i]));
  const blockers = new Map<string, Issue[]>();
  for (const l of links) {
    if (l.type !== 'blocks') continue;
    const from = byId.get(l.fromId);
    const to = byId.get(l.toId);
    if (!from || !to || from.status === 'Done' || to.status === 'Done') continue;
    blockers.set(to.id, [...(blockers.get(to.id) ?? []), from]);
  }
  const blocked: BlockedIssue[] = [...blockers.entries()]
    .map(([id, by]) => ({ issue: byId.get(id) as Issue, by }))
    .sort((a, b) => a.issue.number - b.issue.number);

  const epics = issues
    .filter((i) => i.type === 'Epic' && i.status !== 'Done')
    .map((epic) => ({ epic, progress: epicProgress(issues, epic.id) }))
    .filter((e) => e.progress.count > 0 && e.progress.percent < 100)
    .sort((a, b) => b.progress.total - a.progress.total || a.epic.number - b.epic.number);

  const fill = sprint ? fillOf(scope, capacity.value) : null;
  const daysLeft = sprint ? dayNumber(sprint.end) - dayNumber(today) : null;
  const risks: RiskKind[] = [];
  if (fill?.level === 'over') risks.push('overload');
  if (daysLeft !== null && daysLeft < 0) risks.push('ended');
  if (overdue.length > 0) risks.push('overdue');
  if (blocked.length > 0) risks.push('blocked');

  return {
    project,
    owner,
    sprint,
    daysLeft,
    scope,
    done,
    percent: scope === 0 ? 0 : Math.round((done / scope) * 100),
    burndown: chart,
    byStatus,
    capacity,
    fill,
    overdue,
    blocked,
    epics,
    risks,
    riskScore: risks.reduce((sum, r) => sum + RISK_WEIGHT[r], 0),
  };
}

export type PortfolioSort = 'risk' | 'project';

/** Порядок проектов: по риску (больше риска выше, при равенстве по ключу) или по ключу. */
export function sortOverviews(list: ProjectOverview[], sort: PortfolioSort): ProjectOverview[] {
  return [...list].sort((a, b) =>
    sort === 'risk'
      ? b.riskScore - a.riskScore || a.project.key.localeCompare(b.project.key)
      : a.project.key.localeCompare(b.project.key),
  );
}

export function riskText(o: ProjectOverview): string {
  return o.risks.map((r) => RISK_LABELS[r]).join(', ');
}
