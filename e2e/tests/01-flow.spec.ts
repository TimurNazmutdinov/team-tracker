import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Главный путь пользователя от входа до резервной копии. Тесты идут по порядку и делят состояние:
// каждый следующий опирается на результат предыдущего.

test.describe.configure({ mode: 'serial' });

const TITLE = 'Сквозной тест: экспорт заказов';
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await page.close();
});

test('вход: первая зарегистрированная учётка становится администратором', async () => {
  await page.goto('/projects/DEMO/board');
  await page.getByRole('tab', { name: 'Регистрация' }).click();
  await page.getByLabel('Имя').fill('Админ Тестов');
  await page.getByLabel('Почта').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('password-1');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.board-nav')).toBeVisible();

  // мастер первого запуска открывается администратору сразу после входа (ADR-020)
  const wizard = page.getByRole('dialog', { name: /Добро пожаловать/ });
  await expect(wizard).toBeVisible();
  await expect(wizard.getByRole('heading', { name: 'Проект', exact: true })).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await wizard.getByRole('button', { name: 'Далее →' }).click();
  await wizard.getByRole('combobox', { name: 'Владелец' }).selectOption({ label: 'Админ Тестов' });
  await expect(page.getByText('Владелец проекта сохранён')).toBeVisible();
  await wizard.getByRole('button', { name: 'Далее →' }).click();
  await expect(wizard.getByRole('heading', { name: 'Люди' })).toBeVisible();
  await wizard.getByRole('button', { name: 'Далее →' }).click();
  await expect(wizard.getByRole('radio', { name: /Бежевая/ })).toBeVisible();
  await wizard.getByRole('button', { name: 'Готово' }).click();
  await expect(wizard).toBeHidden();

  await page.getByRole('button', { name: /Админ Тестов/ }).click();
  await expect(page.getByText('Администратор')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('создание задачи попадает в общий бэклог', async () => {
  await page.goto('/projects/DEMO/backlog');
  await expect(page.getByRole('heading', { name: 'Планирование спринтов' })).toBeVisible();
  await page.getByRole('button', { name: '+ Создать задачу' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill(TITLE);
  await dialog.getByRole('button', { name: /^Создать/ }).click();
  const backlog = page.getByRole('region', { name: 'Общий бэклог' });
  await expect(backlog.getByText(TITLE)).toBeVisible();
});

test('планирование: задача переносится в идущий спринт пакетным переносом', async () => {
  const row = page.locator('.planning-row', { hasText: TITLE });
  await row.getByRole('checkbox').check();
  await page
    .getByRole('combobox', { name: 'Спринт', exact: true })
    .selectOption({ label: 'Спринт 2' });
  await page.getByRole('button', { name: 'Применить' }).click();
  const sprint = page.getByRole('region', { name: 'Спринт 2' });
  await expect(sprint.getByText(TITLE)).toBeVisible();
  // заполнение спринта показывается с ёмкостью по закрытому спринту
  await expect(sprint.locator('.fill')).toContainText('Ёмкость');
});

test('доска: смена статуса карточки', async () => {
  await page.goto('/projects/DEMO/board');
  // задача в спринте со статусом Backlog на доске скрыта: предупреждение предлагает перевести её в To Do
  await page.getByRole('button', { name: 'Перевести в To Do' }).click();
  const card = page.locator('.board-card', { hasText: TITLE });
  await expect(card).toBeVisible();
  await card.getByLabel(/^Статус/).selectOption('Done');
  await expect(card.getByLabel(/^Статус/)).toHaveValue('Done');
});

test('закрытие спринта с переносом незавершённого в бэклог', async () => {
  await page.goto('/projects/DEMO/sprints');
  await page.getByRole('button', { name: 'Закрыть спринт' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/бэклог/i).check();
  await dialog
    .getByRole('button', { name: /Закрыть/ })
    .last()
    .click();
  await expect(page.getByText('закрыт').first()).toBeVisible();
});

test('прошлые спринты показывают закрытый спринт и выполненную задачу', async () => {
  await page.goto('/projects/DEMO/history');
  await expect(page.getByRole('heading', { name: 'Прошлые спринты' })).toBeVisible();
  const sprint = page.getByRole('region', { name: 'Спринт 2' });
  await expect(sprint).toBeVisible();
  await expect(sprint.getByText(TITLE)).toBeVisible();
});

test('отчёт спринта открывается с графиками', async () => {
  await page.goto('/projects/DEMO/reports');
  await expect(page.getByRole('heading', { name: 'Отчёты' })).toBeVisible();
  await expect(page.locator('svg[role=img]').first()).toBeVisible();
});

test('резервная копия: ручная копия создаётся и проверяется', async () => {
  await page.goto('/projects/DEMO/settings');
  await page.getByRole('button', { name: 'Сделать копию сейчас' }).click();
  await expect(page.getByText('проверена').first()).toBeVisible();
});

test('«О программе»: версия и журнал ошибок для администратора', async () => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: /Team Tracker/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Собрать диагностику' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Собрать диагностику' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^diagnostics-\d{4}-\d{2}-\d{2}\.zip$/);
});
