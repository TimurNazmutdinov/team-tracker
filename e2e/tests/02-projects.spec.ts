import { expect, test, type Page } from '@playwright/test';

// Проекты, фильтр по проектам, «Портфель» и участники проекта (часть 3 доработок, ADR-016).
// Идёт после 01-flow: администратор уже зарегистрирован.

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/projects/DEMO/board');
  await page.getByLabel('Почта').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('password-1');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.board-nav')).toBeVisible();
});
test.afterAll(async () => {
  await page.close();
});

test('второй проект со своим идущим спринтом и задачей', async () => {
  await page.goto('/projects');
  await page.getByRole('button', { name: '+ Новый проект' }).click();
  await page.getByLabel('Ключ').fill('SHOP');
  await page.getByLabel('Название').fill('Интернет-магазин');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/projects/SHOP/backlog');

  await page.goto('/projects/SHOP/sprints');
  await page.getByRole('button', { name: '+ Новый спринт' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Создать|Сохранить/ })
    .click();
  await page.getByRole('button', { name: 'Запустить спринт' }).click();
  await expect(page.getByRole('button', { name: 'Закрыть спринт' })).toBeVisible();

  await page.goto('/projects/SHOP/backlog');
  await page.getByRole('button', { name: '+ Создать задачу' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill('Корзина покупок');
  await dialog.getByLabel('Спринт').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: /^Создать/ }).click();
  await expect(
    page.getByRole('region', { name: 'Спринт 1' }).getByText('Корзина покупок'),
  ).toBeVisible();
});

test('фильтр по проектам: «Все» открывает доску с дорожками-проектами', async () => {
  await page.goto('/projects/SHOP/board');
  // выбор по умолчанию — проект из адреса
  await expect(page.locator('.filter-button')).toContainText('SHOP');
  await page.locator('.filter-button').click();
  await page.getByRole('dialog', { name: 'Выбор проектов' }).getByLabel('Все проекты').click();
  await expect(page).toHaveURL(/projects=all/);
  await expect(page.locator('.lane')).toHaveCount(2);
  await expect(page.locator('.board-nav')).toContainText('Текущие спринты проектов: 2');
  // задача нового проекта в статусе Backlog скрыта: переводим её в To Do, и появляется карточка с меткой проекта
  await page.getByRole('button', { name: 'Перевести в To Do' }).click();
  await expect(page.locator('.board-card .project-tag').first()).toBeVisible();
});

test('выбор проектов запоминается в профиле и переживает перезагрузку без параметра', async () => {
  await page.goto('/projects/DEMO/backlog'); // без ?projects: действует сохранённый выбор «Все»
  await expect(page.locator('.filter-button')).toContainText('Все (2)');
  await expect(page.locator('.project-planning')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.filter-button')).toContainText('Все (2)');
});

test('«Портфель»: карточки проектов, риск и сортировка', async () => {
  await page.goto('/portfolio?projects=all');
  await expect(page.getByRole('heading', { name: 'Портфель' })).toBeVisible();
  await expect(page.locator('.overview-card')).toHaveCount(2);
  // в DEMO спринт закрыт сквозным тестом, в SHOP идёт Спринт 1
  await expect(page.getByRole('article', { name: 'Проект DEMO' })).toContainText(
    'Нет активного спринта',
  );
  const shop = page.getByRole('article', { name: 'Проект SHOP' });
  await expect(shop).toContainText('Спринт 1');
  await expect(shop).toContainText('Просрочено: 0');
  await page.getByLabel('Сортировка').selectOption('project');
  await expect(page.locator('.overview-card').first()).toContainText('DEMO');
  await page.getByRole('link', { name: 'Планирование →' }).first().click();
  await expect(page).toHaveURL(/\/backlog\?projects=/);
});

test('участники проекта: администратор добавляет и убирает участника', async () => {
  await page.goto('/projects/DEMO/settings?projects=DEMO');
  const table = page.getByRole('table', { name: 'Участники и роли в проекте' });
  await expect(table).toContainText('Игорь Смирнов');
  await table.getByRole('button', { name: 'Убрать' }).first().click();
  await page.getByLabel('Человек').selectOption({ label: 'Игорь Смирнов' });
  await page.getByRole('button', { name: '+ Добавить' }).click();
  await expect(table).toContainText('Игорь Смирнов');
});
