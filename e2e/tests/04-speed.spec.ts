import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Скорость работы (часть 4 доработок, ADR-017): палитра Ctrl+K, Markdown и чек-листы, шаблоны задач,
// массовые действия, WIP-лимиты. Идёт после 01-flow, 02-projects и 03-a11y: администратор уже есть.

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

test('палитра: Ctrl+K находит задачу по ключу и открывает её', async () => {
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: /Поиск задач/ });
  await expect(box).toBeFocused();
  await box.fill('DEMO-5');
  await audit('палитра');
  await expect(page.getByRole('option').first()).toContainText('DEMO-5');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/projects/DEMO/issues/5');
  await expect(page.getByRole('heading', { name: 'Описание' })).toBeVisible();
});

test('палитра: «/» открывает окно, экран выбирается по названию, Esc закрывает', async () => {
  await page.keyboard.press('/');
  const box = page.getByRole('combobox', { name: /Поиск задач/ });
  await box.fill('Прошлые');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/projects/DEMO/history');
  await page.keyboard.press('Control+k');
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
});

test('Markdown: разметка показывается, HTML не выполняется, пункты критериев отмечаются', async () => {
  await page.goto('/projects/DEMO/issues/5');
  await page.getByRole('button', { name: /Изменить название и описание/ }).click();
  await page
    .getByRole('textbox', { name: 'Описание' })
    .fill('**Важно** и <script>window.__xss = 1</script>');
  await page.getByRole('textbox', { name: 'Критерии приёмки' }).fill('- [ ] первый\n- [ ] второй');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.md strong', { hasText: 'Важно' })).toBeVisible();
  await expect(page.locator('.md', { hasText: '<script>' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();

  await expect(page.getByRole('heading', { name: /выполнено 0 из 2/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /первый/ }).click();
  await expect(page.getByRole('heading', { name: /выполнено 1 из 2/ })).toBeVisible();
  await audit('карточка с Markdown');
});

test('шаблон «Баг» подставляет тип и текст при создании задачи', async () => {
  await page.goto('/projects/DEMO/backlog');
  await page.getByRole('button', { name: '+ Создать задачу' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Шаблон').selectOption({ label: 'Баг (Bug)' });
  await expect(dialog.getByLabel('Тип')).toHaveValue('Bug');
  await expect(dialog.getByRole('textbox', { name: 'Описание' })).toHaveValue(
    /Шаги воспроизведения/,
  );
  await dialog.getByRole('button', { name: 'Предпросмотр' }).first().click();
  await expect(dialog.locator('.md-preview h4').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('массовые действия в планировании: приоритет и метка одним сохранением', async () => {
  await page.goto('/projects/DEMO/backlog');
  await page
    .getByRole('checkbox', { name: /Выбрать DEMO-/ })
    .nth(0)
    .check();
  await page
    .getByRole('checkbox', { name: /Выбрать DEMO-/ })
    .nth(1)
    .check();
  const bar = page.getByRole('region', { name: 'Массовые действия' });
  await expect(bar).toContainText('Выбрано 2');
  await bar.getByRole('combobox', { name: 'Приоритет' }).selectOption('High');
  await bar.getByRole('textbox', { name: 'Добавить метку' }).fill('массово');
  await bar.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText('Изменено задач: 2')).toBeVisible();
  await expect(bar).toBeHidden();
});

test('WIP-лимит: после включения превышение отмечено на колонке', async () => {
  // готовим доску: две задачи из бэклога — в ближайший спринт, в статус To Do
  await page.goto('/projects/DEMO/backlog');
  const backlog = page.getByRole('region', { name: 'Общий бэклог' });
  await backlog
    .getByRole('checkbox', { name: /Выбрать DEMO-/ })
    .nth(0)
    .check();
  await backlog
    .getByRole('checkbox', { name: /Выбрать DEMO-/ })
    .nth(1)
    .check();
  const bar = page.getByRole('region', { name: 'Массовые действия' });
  await bar.getByRole('combobox', { name: 'Статус' }).selectOption('To Do');
  await bar
    .getByRole('combobox', { name: 'Спринт', exact: true })
    .selectOption({ label: 'Спринт 3' });
  await bar.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText('Изменено задач: 2')).toBeVisible();

  await page.goto('/projects/DEMO/settings');
  await page.getByLabel('Включить WIP-лимиты').check();
  await page.getByLabel('Лимит: To Do').fill('1');
  await page.getByRole('button', { name: 'Сохранить' }).nth(1).click();
  await expect(page.getByText('WIP-лимиты сохранены')).toBeVisible();
  await page.goto('/projects/DEMO/board?projects=DEMO');
  await expect(page.getByText(/⚠ WIP \d+ из 1/)).toBeVisible();
  await audit('доска с WIP');

  await page.goto('/projects/DEMO/settings');
  await page.getByLabel('Включить WIP-лимиты').uncheck();
  await page.getByRole('button', { name: 'Сохранить' }).nth(1).click();
  await page.goto('/projects/DEMO/board?projects=DEMO');
  await expect(page.getByText(/⚠ WIP/)).toBeHidden();
});

test('шаблоны проекта: новый шаблон появляется в списке', async () => {
  await page.goto('/projects/DEMO/settings');
  await page.getByRole('button', { name: '+ Новый шаблон' }).click();
  await page.getByLabel('Название шаблона').fill('Исследование');
  await page.getByRole('button', { name: 'Сохранить шаблон' }).click();
  await expect(page.getByText('Исследование')).toBeVisible();
  await audit('настройки с шаблонами');
});
