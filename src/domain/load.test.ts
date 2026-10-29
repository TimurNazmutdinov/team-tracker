import { beforeAll, describe, expect, it } from 'vitest';
import { containerItems, type View } from './actions';
import { boardCards, columnStats, filterCards, groupLanes, NO_BOARD_FILTERS } from './board';
import { parseDataset } from './dataset';
import { generateLoadData, LOAD_DEFAULTS } from './loadgen';
import { closedSprints, sprintCapacity } from './planning';
import { burndown, velocity } from './reports';
import type { Dataset } from './schema';
import { replayErrors, viewOf } from './testing';
import { sprintSnapshots, summarize } from './totals';

// Нагрузочные данные: 10 проектов, 50 спринтов, 10 000 задач. Цель — открывать экраны быстрее секунды
// (ADR-015); пределы заданы с большим запасом на медленные машины CI.

const BUDGET_MS = 1000;

let ds: Dataset;
beforeAll(() => {
  ds = generateLoadData();
});

function elapsed(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe('генератор нагрузочных данных', () => {
  it('создаёт заданный объём, проходит проверку и воспроизводится по истории', () => {
    expect(ds.projects).toHaveLength(LOAD_DEFAULTS.projects);
    expect(ds.sprints).toHaveLength(LOAD_DEFAULTS.sprints);
    expect(ds.issues).toHaveLength(LOAD_DEFAULTS.issues);
    expect(ds.history.length).toBeGreaterThan(ds.issues.length * 3);
    const parsed = parseDataset(ds);
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    expect(replayErrors(ds)).toEqual([]);
  });

  it('детерминирован', () => {
    expect(generateLoadData({ issues: 200, projects: 2, sprints: 6 })).toEqual(
      generateLoadData({ issues: 200, projects: 2, sprints: 6 }),
    );
  });
});

describe('скорость расчётов на 10 000 задач', () => {
  const projectView = (): View => viewOf(ds, 'p1');
  const allView = (): View => ({
    projectId: 'p1',
    project: ds.projects[0] as View['project'],
    people: ds.people,
    members: ds.members,
    sprints: ds.sprints,
    issues: ds.issues,
    links: ds.links,
  });

  it('доска всех проектов сразу', () => {
    const ms = elapsed(() => {
      for (const sprint of ds.sprints.filter((s) => s.state === 'active')) {
        const cards = boardCards(ds.issues, sprint.id);
        groupLanes(filterCards(cards, NO_BOARD_FILTERS), 'assignee', {
          people: ds.people,
          issues: ds.issues,
          projectKey: 'PA',
        });
        columnStats(cards);
      }
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('планирование: списки спринтов и бэклога, ёмкость', () => {
    const v = allView();
    const ms = elapsed(() => {
      for (const s of ds.sprints) containerItems(v, s.id);
      containerItems(v, null);
      sprintCapacity(ds.sprints, ds.issues, ds.history);
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('прошлые спринты проекта и всех проектов', () => {
    const v = projectView();
    const history = ds.history.filter((h) => v.issues.some((i) => i.id === h.issueId));
    expect(elapsed(() => closedSprints(v.sprints, v.issues, history))).toBeLessThan(BUDGET_MS);
    expect(elapsed(() => closedSprints(ds.sprints, ds.issues, ds.history))).toBeLessThan(BUDGET_MS);
  });

  it('отчёты: velocity по всем проектам, burndown и итоги спринта', () => {
    expect(elapsed(() => velocity(ds.sprints, ds.issues, ds.history))).toBeLessThan(BUDGET_MS);
    const v = projectView();
    const active = v.sprints.find((s) => s.state === 'active');
    if (!active) throw new Error('нет идущего спринта');
    const history = ds.history.filter((h) => v.issues.some((i) => i.id === h.issueId));
    const ms = elapsed(() => {
      burndown(active, v.issues, history, active.end);
      summarize(sprintSnapshots(active, v.issues, history), v.people);
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
