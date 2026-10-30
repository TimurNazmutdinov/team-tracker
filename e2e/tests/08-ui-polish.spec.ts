import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Доработки по замечаниям (ADR-021): шапка на «Портфеле», переключатель проектов, иерархия и рамки
// в планировании, настраиваемые роли, подсказки. Идёт после 01–07.

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

test('на «Портфеле» и «Аналитике» видны вкладки проекта', async () => {
  for (const url of ['/portfolio', '/analytics?projects=all']) {
    await page.goto(url);
    const tabs = page.getByRole('navigation', { name: 'Разделы проекта' });
    await expect(tabs.getByRole('link', { name: 'Бэклог' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Настройки' })).toBeVisible();
  }
});

test('чип проекта — переключатель: выбор другого проекта сохраняет вкладку', async () => {
  await page.goto('/projects/DEMO/people');
  await page.getByRole('button', { name: /DEMO ▾/ }).click();
  const menu = page.getByRole('menu', { name: 'Проекты' });
  await expect(menu.getByRole('menuitem', { name: /Все проекты/ })).toBeVisible();
  await audit('переключатель проектов');
  await menu.getByRole('menuitem', { name: /SHOP/ }).click();
  await page.waitForURL('**/projects/SHOP/people');
});

test('планирование: спринт и его задачи в общей рамке, эпик с вложенными задачами сворачивается', async () => {
  await page.goto('/projects/DEMO/backlog?projects=DEMO');
  const sprint = page.getByRole('region', { name: 'Спринт 3', exact: true });
  await expect(sprint).toBeVisible();
  const frame = await sprint.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(parseFloat(frame)).toBeGreaterThanOrEqual(1);

  const nested = page.locator('.planning-row.child');
  await expect(nested.first()).toBeVisible();
  const before = await nested.count();
  await page
    .getByRole('button', { name: /Свернуть эпик DEMO-1/ })
    .first()
    .click();
  await expect(nested).toHaveCount(0);
  await page
    .getByRole('button', { name: /Развернуть эпик DEMO-1/ })
    .first()
    .click();
  await expect(nested).toHaveCount(before);
  await audit('планирование с иерархией');
});

test('у вкладок, чипов и полей есть подсказки при наведении', async () => {
  await page.goto('/projects/DEMO/backlog?projects=DEMO');
  await expect(page.getByRole('link', { name: 'Аналитика' })).toHaveAttribute('title', /Поток/);
  await expect(page.getByRole('link', { name: 'Доска' }).first()).toHaveAttribute('title', /Доска/);
  await expect(page.getByRole('button', { name: 'Справка' })).toHaveAttribute('title', /Справка/);
  await expect(page.locator('.planning-row select[title]').first()).toBeVisible();
});

test('роли: таблица с галочками, новая роль сохраняется и удаляется', async () => {
  await page.goto('/projects/DEMO/settings');
  const roles = page.getByRole('region', { name: 'Роли и права' });
  await expect(roles).toBeVisible();
  // роль «Администратор» защищена
  const adminName = roles.getByRole('textbox', { name: /Название роли: Администратор/ });
  await expect(adminName).toBeDisabled();
  await expect(
    roles.getByRole('checkbox', { name: 'Администратор: Создавать задачи' }),
  ).toBeDisabled();

  await roles.getByRole('button', { name: '+ Новая роль' }).click();
  const name = roles.getByRole('textbox', { name: /Название роли: Новая роль/ });
  await name.fill('Наблюдатель');
  await roles
    .getByRole('checkbox', { name: 'Наблюдатель: Комментировать и вести ретроспективу' })
    .click();
  await roles.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Роли и права сохранены')).toBeVisible();
  await expect(
    roles.getByRole('checkbox', { name: 'Наблюдатель: Комментировать и вести ретроспективу' }),
  ).toBeChecked();
  await audit('роли и права');

  // роль появилась в списке ролей при создании участника
  await page.goto('/projects/DEMO/people');
  await expect(page.locator('#new-account-role option', { hasText: 'Наблюдатель' })).toHaveCount(1);

  await page.goto('/projects/DEMO/settings');
  await roles.getByRole('button', { name: 'Удалить роль Наблюдатель' }).click();
  await roles.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Роли и права сохранены').last()).toBeVisible();
  await expect(roles.getByRole('textbox', { name: /Название роли: Наблюдатель/ })).toBeHidden();
});

test('настройки: каждая настройка в своей рамке, шаблоны — список и редактор', async () => {
  await page.goto('/projects/DEMO/settings');
  for (const title of ['Спринты', 'WIP-лимиты', 'Definition of Done', 'Шаблоны задач']) {
    const card = page.getByRole('heading', { name: title, exact: true });
    await expect(card).toBeVisible();
    const border = await card.evaluate((h) => {
      const parent = h.closest('.settings-card');
      return parent ? getComputedStyle(parent).borderTopWidth : '0px';
    });
    expect(parseFloat(border)).toBeGreaterThan(0);
  }
  const templates = page.getByRole('navigation', { name: 'Шаблоны' });
  await expect(templates.getByRole('button', { name: /Баг/ })).toBeVisible();
  await templates.getByRole('button', { name: /Story/ }).click();
  await expect(page.getByLabel('Название шаблона')).toHaveValue('Story');
  await audit('настройки в рамках');
});
