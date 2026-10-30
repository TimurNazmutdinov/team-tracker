import type { ReportSheet } from '../domain/sprintReport';

/** Excel-файл отчёта: закреплённая первая строка, ширина колонок по содержимому. Библиотека грузится только по кнопке. */
export async function buildReportXlsx(sheets: ReportSheet[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const widthOf = (rows: ReportSheet['rows'], col: number) =>
    Math.min(60, Math.max(10, ...rows.map((r) => String(r[col] ?? '').length)) + 2);
  return writeXlsxFile(
    sheets.map((s) => ({
      sheet: s.name,
      stickyRowsCount: 1,
      columns: (s.rows[0] ?? []).map((_, n) => ({ width: widthOf(s.rows, n) })),
      data: s.rows.map((row, r) =>
        row.map((v) =>
          v === null || v === ''
            ? null
            : typeof v === 'number'
              ? { value: v, type: Number }
              : {
                  value: v,
                  type: String,
                  wrap: true,
                  alignVertical: 'top' as const,
                  ...(r === 0 ? { fontWeight: 'bold' as const, backgroundColor: '#dbeafe' } : {}),
                },
        ),
      ),
    })),
  ).toBlob();
}

/** Сохраняет Blob как файл через временную ссылку. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
