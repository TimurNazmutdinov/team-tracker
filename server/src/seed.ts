import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { parseDataset } from '../../src/domain/dataset';
import type { Dataset } from '../../src/domain/schema';
import { schema, type Db } from './db';

const t = schema;

/** Загружает набор данных в пустую базу: демо-проект, люди (без учёток), спринты и задачи. */
export async function importDataset(db: Db, ds: Dataset): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.projects);
    if (count > 0) throw new Error('База не пуста: загрузка данных отменена');
    // Порядок — по внешним ключам; задачи вставляются одним запросом, поэтому parentId допустим
    if (ds.projects.length) await tx.insert(t.projects).values(ds.projects);
    if (ds.people.length) await tx.insert(t.people).values(ds.people);
    if (ds.sprints.length) await tx.insert(t.sprints).values(ds.sprints);
    if (ds.issues.length) await tx.insert(t.issues).values(ds.issues);
    if (ds.links.length) await tx.insert(t.links).values(ds.links);
    if (ds.comments.length) await tx.insert(t.comments).values(ds.comments);
    if (ds.history.length) await tx.insert(t.history).values(ds.history);
  });
}

export function readSeedFile(path: string): Dataset {
  const parsed = parseDataset(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.ok) throw new Error(`${path}: ${parsed.errors.join('; ')}`);
  return parsed.data;
}
