import { describe, expect, it } from 'vitest';
import seed from '../../data/seed.json';
import { parseDataset } from './dataset';
import { reportSheets, sprintReport } from './sprintReport';
import { viewOf } from './testing';

const parsed = parseDataset(seed);
if (!parsed.ok) throw new Error('seed не разобран');
const ds = parsed.data;
const view = viewOf(ds, 'p1');
const sprint = (id: string) => {
  const found = view.sprints.find((s) => s.id === id);
  if (!found) throw new Error(`нет спринта ${id}`);
  return found;
};
const keys = new Map(ds.issues.map((i) => [i.id, `DEMO-${i.number}`]));
const authors = new Map(ds.people.map((p) => [p.id, p.name]));

describe('отчёт спринта', () => {
  it('закрытый спринт: выполнено и перенесённое дают объём, velocity = выполнено', () => {
    const r = sprintReport(view, sprint('s1'), ds.history, '2026-11-01');
    expect(r.total.count).toBe(r.done.length + r.carried.length);
    expect(r.total.done + r.total.carried).toBe(r.total.points);
    expect(r.velocity).toBe(r.total.done);
    expect(r.done.every((i) => i.status === 'Done')).toBe(true);
    expect(r.carried.every((i) => i.status !== 'Done')).toBe(true);
    expect(r.retro.length).toBe(4);
    expect(r.people.reduce((a, p) => a + p.points, 0)).toBe(r.total.points);
  });

  it('ёмкость идущего спринта учитывает доступность и закрытые спринты до него', () => {
    const r = sprintReport(view, sprint('s3'), ds.history, '2026-11-01');
    // в seed отпуск Марии и больничный Игоря попадают на Спринт 3
    const a = r.capacity.availability;
    expect(a.ratio).toBeLessThan(1);
    expect(r.capacity.base).not.toBeNull();
    expect(r.capacity.value).toBeCloseTo((r.capacity.base ?? 0) * a.ratio, 1);
  });

  it('листы Excel: пять листов, строки заголовков и данные согласованы с отчётом', () => {
    const r = sprintReport(view, sprint('s1'), ds.history, '2026-11-01');
    const sheets = reportSheets(r, { authors, issueKeys: keys });
    expect(sheets.map((s) => s.name)).toEqual([
      'Сводка',
      'Задачи',
      'Люди',
      'Burndown',
      'Ретроспектива',
    ]);
    expect(sheets[1]?.rows.length).toBe(1 + r.total.count);
    expect(sheets[4]?.rows.length).toBe(1 + r.retro.length);
    expect(sheets[0]?.rows.find((row) => row[0] === 'Velocity, sp')?.[1]).toBe(r.velocity);
    for (const sheet of sheets) {
      const width = sheet.rows[0]?.length ?? 0;
      expect(sheet.rows.every((row) => row.length === width)).toBe(true);
    }
  });
});
