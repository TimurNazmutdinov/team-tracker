import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildReportXlsx } from './reportXlsx';

describe('Excel отчёта', () => {
  it('создаёт книгу с листами и данными', async () => {
    const blob = await buildReportXlsx([
      {
        name: 'Сводка',
        rows: [
          ['Параметр', 'Значение'],
          ['Velocity, sp', 18],
          ['Цель', null],
        ],
      },
      { name: 'Задачи', rows: [['Задача'], ['DEMO-1']] },
    ]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const book = strFromU8(files['xl/workbook.xml'] ?? new Uint8Array());
    expect(book).toContain('Сводка');
    expect(book).toContain('Задачи');
    const strings = strFromU8(files['xl/sharedStrings.xml'] ?? new Uint8Array());
    expect(strings).toContain('Velocity, sp');
    expect(strings).toContain('DEMO-1');
  });
});
