import { expect, test, type Page } from '@playwright/test';

// Аналитика (часть 6 доработок, ADR-019): CFD, время цикла, нагрузка, дорожная карта эпиков.
// Идёт после 01–05: администратор есть, проектов два (DEMO и SHOP).

test.describe.configure({ mode: 'serial' });

let page: Page;

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

test('аналитика открывается из шапки: поток показывает диаграмму и таблицу данных', async () => {
  await page.goto('/portfolio');
  await page.getByRole('link', { name: 'Аналитика' }).click();
  await page.waitForURL('**/analytics*');
  await page.goto('/analytics?projects=all');
  await expect(page.getByRole('heading', { name: 'Кумулятивная диаграмма потока' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Диаграмма потока/ })).toBeVisible();
  await page.getByText('Таблица данных').click();
  await expect(page.locator('details table tbody tr').first()).toBeVisible();
});

test('период и вкладка хранятся в адресе', async () => {
  await page.goto('/analytics?projects=all');
  await page.getByLabel('Период').selectOption('90');
  await expect(page).toHaveURL(/days=90/);
  await page.getByRole('button', { name: 'Время цикла' }).click();
  await expect(page).toHaveURL(/tab=time/);
  await expect(page.getByRole('heading', { name: 'Время цикла и время выполнения' })).toBeVisible();
});

test('нагрузка: незавершённые задачи идущих спринтов по людям', async () => {
  await page.goto('/analytics?projects=all&tab=load');
  await expect(page.getByRole('heading', { name: 'Нагрузка по людям' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Нагрузка по людям' })).toContainText('Не назначено');
});

test('дорожная карта: эпики по проектам с прогрессом', async () => {
  await page.goto('/analytics?projects=all&tab=roadmap&months=12');
  const epic = page.locator('.roadmap-row', { hasText: 'Личный кабинет клиента' });
  await expect(epic).toBeVisible();
  await expect(epic).toContainText('DEMO');
});
