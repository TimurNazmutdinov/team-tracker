import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { projectOverview, riskText, sortOverviews, type OverviewInput } from './portfolio';
import type { Dataset, Issue, Link } from './schema';

const ds = seed as unknown as Dataset;

function input(patch: Partial<OverviewInput> = {}): OverviewInput {
  const project = ds.projects[0];
  if (!project) throw new Error('нет проекта');
  return {
    project,
    owner: ds.people.find((p) => p.id === project.ownerId) ?? null,
    sprints: ds.sprints,
    issues: ds.issues,
    links: ds.links,
    history: ds.history,
    today: '2026-10-29',
    ...patch,
  };
}

describe('projectOverview', () => {
  it('активный спринт, выполнение, дни до конца и владелец', () => {
    const o = projectOverview(input());
    expect(o.sprint?.id).toBe('s2');
    expect(o.owner?.id).toBe('u1');
    expect(o.daysLeft).toBe(8); // конец спринта 2026-11-06
    expect(o.scope).toBeGreaterThan(0);
    expect(o.percent).toBe(Math.round((o.done / o.scope) * 100));
    expect(Object.values(o.byStatus).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(o.burndown?.remaining.length).toBe(o.burndown?.ideal.length);
  });

  it('без активного спринта сводка пуста и без признаков спринтового риска', () => {
    const o = projectOverview(
      input({ sprints: ds.sprints.filter((s) => s.state !== 'active'), links: [] }),
    );
    expect(o.sprint).toBeNull();
    expect(o.daysLeft).toBeNull();
    expect(o.fill).toBeNull();
    expect(o.burndown).toBeNull();
    expect(o.risks).toEqual([]);
  });

  it('перегруз: объём спринта больше ёмкости', () => {
    const o = projectOverview(input());
    expect(o.capacity.value).toBeGreaterThan(0);
    const overloaded = projectOverview(
      input({
        issues: ds.issues.map((i) =>
          i.sprintId === 's2' && i.points !== null ? { ...i, points: i.points * 5 } : i,
        ),
      }),
    );
    expect(overloaded.fill?.level).toBe('over');
    expect(overloaded.risks).toContain('overload');
    expect(riskText(overloaded)).toContain('перегруз');
  });

  it('просроченные: не завершённые задачи со сроком в прошлом', () => {
    const issues: Issue[] = ds.issues.map((i) =>
      i.number === 4
        ? { ...i, dueDate: '2026-10-01' }
        : i.number === 2
          ? { ...i, dueDate: '2026-10-01' }
          : i,
    );
    const o = projectOverview(input({ issues }));
    // DEMO-2 завершена, DEMO-4 нет
    expect(o.overdue.map((i) => i.number)).toEqual([4]);
    expect(o.risks).toContain('overdue');
    expect(projectOverview(input({ today: '2026-09-01', issues })).overdue).toEqual([]);
  });

  it('блокировки: только не завершённые блокирующие и заблокированные задачи', () => {
    const byNumber = (n: number) => ds.issues.find((i) => i.number === n) as Issue;
    const blocks = (from: number, to: number): Link => ({
      id: `l-${from}-${to}`,
      fromId: byNumber(from).id,
      toId: byNumber(to).id,
      type: 'blocks',
    });
    // DEMO-4 (In Progress) блокирует DEMO-5; DEMO-2 (Done) блокирует DEMO-8: не считается
    const o = projectOverview(input({ links: [blocks(4, 5), blocks(2, 8)] }));
    expect(o.blocked.map((b) => [b.issue.number, b.by.map((i) => i.number)])).toEqual([[5, [4]]]);
    expect(o.risks).toContain('blocked');
  });

  it('спринт, который закончился, но не закрыт, — признак риска', () => {
    const o = projectOverview(input({ today: '2026-11-10' }));
    expect(o.daysLeft).toBe(-4);
    expect(o.risks).toContain('ended');
  });

  it('эпики: незавершённые с прогрессом, крупные первыми', () => {
    const o = projectOverview(input());
    expect(o.epics.length).toBeGreaterThan(0);
    expect(o.epics[0]?.progress.count).toBeGreaterThan(0);
    for (const e of o.epics) expect(e.progress.percent).toBeLessThan(100);
  });
});

describe('sortOverviews', () => {
  it('по риску: больше риска выше, при равенстве по ключу; по проекту — по ключу', () => {
    const base = projectOverview(input());
    const make = (key: string, score: number) => ({
      ...base,
      riskScore: score,
      project: { ...base.project, key },
    });
    const list = [make('BBB', 2), make('AAA', 0), make('CCC', 5), make('AAB', 2)];
    expect(sortOverviews(list, 'risk').map((o) => o.project.key)).toEqual([
      'CCC',
      'AAB',
      'BBB',
      'AAA',
    ]);
    expect(sortOverviews(list, 'project').map((o) => o.project.key)).toEqual([
      'AAA',
      'AAB',
      'BBB',
      'CCC',
    ]);
  });
});
