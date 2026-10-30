// Массовая вставка (загрузка демо-данных, восстановление копии): строки вставляются порциями, иначе
// один запрос превышает предел параметров PostgreSQL и стек (десятки тысяч записей истории).

export const CHUNK = 500;

export async function insertChunks<T extends object>(
  insert: (rows: T[]) => PromiseLike<unknown>,
  rows: T[],
  size = CHUNK,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}
