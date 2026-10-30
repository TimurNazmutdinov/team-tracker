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

test('фильтр проектов в шапке на всех вкладках и метка проекта в заголовке', async () => {
  for (const url of [
    '/portfolio',
    '/analytics?projects=all',
    '/projects/DEMO/board',
    '/projects/DEMO/people',
    '/projects/DEMO/settings',
    '/projects/DEMO/sprints',
    '/projects/DEMO/reports',
  ]) {
    await page.goto(url);
    await expect(page.locator('.app-bar').getByRole('button', { name: /Проекты:/ })).toBeVisible();
    await expect(page.locator('main .page-header .project-tags')).toBeVisible();
  }
  // чипа проекта в шапке больше нет
  await expect(page.locator('.app-bar .project-chip')).toHaveCount(0);
});

test('на экране одного проекта выбор другого проекта в фильтре переводит в него', async () => {
  await page.goto('/projects/DEMO/people?projects=all');
  await page
    .locator('.app-bar')
    .getByRole('button', { name: /Проекты:/ })
    .click();
  const pop = page.getByRole('dialog', { name: 'Выбор проектов' });
  await pop.getByLabel(/DEMO/).click();
  await page.waitForURL('**/projects/SHOP/people**');
  await expect(page.locator('main .project-tags')).toContainText('SHOP');
  await audit('фильтр проектов в шапке');
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

test('иерархия: состав спринта и карточка задачи показывают вложенность', async () => {
  await page.goto('/projects/DEMO/sprints/s1');
  const rows = page.getByRole('list', { name: 'Состав спринта' }).locator('.tree-row');
  await expect(rows.first()).toBeVisible();
  const depths = await rows.evaluateAll((els) =>
    els.map((e) => Number(e.getAttribute('data-depth'))),
  );
  expect(Math.max(...depths)).toBeGreaterThanOrEqual(1);

  await page.goto('/projects/DEMO/issues/9');
  const trail = page.getByRole('navigation', { name: 'Путь' });
  await expect(trail.getByRole('link').nth(1)).toBeVisible();
  await audit('карточка с путём');
});

test('иерархия: эпик в портфеле раскрывается до задач, в поиске виден путь', async () => {
  await page.goto('/portfolio?projects=DEMO');
  await page
    .getByRole('button', { name: /Развернуть эпик/ })
    .first()
    .click();
  await expect(page.locator('.epic-family li').first()).toBeVisible();

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Поиск задач/ }).fill('Форма смены');
  await expect(page.locator('.palette-sub').first()).toContainText('Личный кабинет клиента');
  await page.keyboard.press('Escape');
});
