import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { parseDataset } from '../../src/domain/dataset';
import type { Dataset } from '../../src/domain/schema';
import { insertChunks } from './bulk';
import { schema, type Db } from './db';

const t = schema;

/** Загружает набор данных в пустую базу: демо-проект, люди (без учёток), спринты и задачи. */
export async function importDataset(db: Db, ds: Dataset): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.projects);
    if (count > 0) throw new Error('База не пуста: загрузка данных отменена');
    // Порядок — по внешним ключам; вставка порциями
    await insertChunks((r) => tx.insert(t.projects).values(r), ds.projects);
    await insertChunks((r) => tx.insert(t.people).values(r), ds.people);
    await insertChunks((r) => tx.insert(t.projectMembers).values(r), ds.members);
    await insertChunks((r) => tx.insert(t.issueTemplates).values(r), ds.templates);
    // миграция уже создала роли по умолчанию: набор данных заменяет их своими
    await tx.delete(t.roles);
    await insertChunks((r) => tx.insert(t.roles).values(r), ds.roles);
    await insertChunks((r) => tx.insert(t.absences).values(r), ds.absences);
    await insertChunks((r) => tx.insert(t.sprints).values(r), ds.sprints);
    await insertChunks((r) => tx.insert(t.issues).values(r), ds.issues);
    await insertChunks((r) => tx.insert(t.retroItems).values(r), ds.retroItems);
    await insertChunks((r) => tx.insert(t.links).values(r), ds.links);
    await insertChunks((r) => tx.insert(t.comments).values(r), ds.comments);
    await insertChunks((r) => tx.insert(t.history).values(r), ds.history);
  });
}

export function readSeedFile(path: string): Dataset {
  const parsed = parseDataset(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.ok) throw new Error(`${path}: ${parsed.errors.join('; ')}`);
  return parsed.data;
}
