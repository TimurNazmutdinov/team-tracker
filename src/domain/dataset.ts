import { checkIntegrity } from './integrity';
import { datasetSchema, type Dataset } from './schema';

export type ParseResult = { ok: true; data: Dataset } | { ok: false; errors: string[] };

const MAX_ERRORS = 20;

/** Проверяет набор данных: структуру (Zod) и целостность (ссылки, иерархия, спринты). */
export function parseDataset(raw: unknown): ParseResult {
  const parsed = datasetSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .slice(0, MAX_ERRORS)
      .map((i) => `${i.path.join('.') || '(корень)'}: ${i.message}`);
    return { ok: false, errors };
  }
  const errors = checkIntegrity(parsed.data);
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  return { ok: true, data: parsed.data };
}
