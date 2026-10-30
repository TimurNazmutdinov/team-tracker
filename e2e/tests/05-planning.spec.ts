import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Планирование и Scrum-ритуалы (часть 5 доработок, ADR-018): доступность людей, Definition of Done,
// ретроспектива, отчёт спринта. Идёт после 01–04: администратор уже есть, спринты 1–3 из seed.

test.describe.configure({ mode: 'serial' });

let page: Page;

async function audit(name: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = result.violations.map((v) => `${name}: ${v.id} (${v.impact}) — ${v.help}`);
  expect(report, report.join('\n')).toEqual([]);
}

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  await page.goto('/projects/DEMO/board');
  await page.getByLabel('Почта').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('password-1');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.board-nav')).toBeVisible();
});
test.afterAll(async () => {
  await page.close();
});

test('доступность: отсутствия из seed уменьшают ёмкость Спринта 3', async () => {
  await page.goto('/projects/DEMO/backlog?projects=DEMO');
  const sprint = page.getByRole('region', { name: 'Спринт 3' });
  await expect(sprint.getByText(/× доступность \d+ %/)).toBeVisible();
  await expect(sprint.getByText(/Отсутствуют:.*Мария Орлова.*отпуск/)).toBeVisible();
});

test('люди: добавление и удаление отсутствия', async () => {
  await page.goto('/projects/DEMO/people');
  await page.getByLabel('С', { exact: true }).fill('2026-12-07');
  await page.getByLabel('По', { exact: true }).fill('2026-12-11');
  await page.getByRole('button', { name: '+ Добавить отсутствие' }).click();
  await expect(page.getByText('Отсутствие добавлено')).toBeVisible();
  const row = page.locator('.absences tbody tr', { hasText: '07.12.2026' });
  await expect(row).toContainText('5');
  await audit('люди с отсутствиями');
  await row.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.locator('.absences tbody tr', { hasText: '07.12.2026' })).toBeHidden();
});

test('Definition of Done: перевод в Done требует отметить все пункты', async () => {
  await page.goto('/projects/DEMO/settings');
  await page
    .getByRole('textbox', { name: 'Список пунктов' })
    .fill('- [ ] Тесты проходят\n- [ ] Ревью сделано');
  await page
    .locator('form[aria-labelledby=dod-title]')
    .getByRole('button', { name: 'Сохранить' })
    .click();
  await expect(page.getByText('Definition of Done сохранён')).toBeVisible();

  await page.goto('/projects/DEMO/issues/11');
  const status = page.getByLabel('Статус', { exact: true });
  await status.selectOption('Done');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeDisabled();
  await audit('окно Definition of Done');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(status).not.toHaveValue('Done');

  await status.selectOption('Done');
  await dialog.getByRole('checkbox', { name: 'Тесты проходят' }).click();
  await dialog.getByRole('checkbox', { name: 'Ревью сделано' }).click();
  await dialog.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(status).toHaveValue('Done');
});

test('ретроспектива: запись добавляется, действие превращается в задачу', async () => {
  await page.goto('/projects/DEMO/sprints/s1');
  const retro = page.getByRole('region', { name: 'Ретроспектива' });
  await expect(retro.getByText('Быстро закрыли блокирующий баг')).toBeVisible();
  await retro.getByLabel('Действия: новая запись').fill('Проверить сквозной сценарий');
  await retro.getByRole('button', { name: '+ Добавить' }).nth(2).click();
  const item = retro.locator('.retro-item', { hasText: 'Проверить сквозной сценарий' });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: '→ в задачу' }).click();
  await expect(page.getByText(/Создана задача DEMO-\d+/).first()).toBeVisible();
  await expect(item.getByRole('link', { name: /DEMO-\d+/ })).toBeVisible();
  await audit('спринт с ретроспективой');
});

test('прошлые спринты показывают ретроспективу только для чтения', async () => {
  await page.goto('/projects/DEMO/history?projects=DEMO');
  const sprint = page.getByRole('region', { name: 'Спринт 1' });
  await sprint.getByRole('button', { name: /Спринт 1/ }).click();
  await expect(sprint.getByText('Демо прошло без замечаний')).toBeVisible();
  await expect(sprint.getByRole('button', { name: '+ Добавить' })).toBeHidden();
});

test('отчёт спринта: сводка, Excel и печать', async () => {
  await page.goto('/projects/DEMO/sprints/s1/report');
  await expect(page.getByRole('heading', { name: 'Отчёт: Спринт 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ретроспектива' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Печать / PDF' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^report-DEMO-.*\.xlsx$/);
  await audit('отчёт спринта');
});
