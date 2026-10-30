import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Справка по «?» и повторный запуск мастера (часть 7 доработок, ADR-020). Идёт после 01–06; сам мастер
// проходит 01-flow сразу после первого входа.

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

test('мастер уже пройден и после входа не открывается', async () => {
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('«?» открывает справку: клавиши, правила и права по ролям', async () => {
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Справка' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Ctrl+K')).toBeVisible();
  await audit('справка: клавиши');
  await help.getByRole('button', { name: 'Правила' }).click();
  await expect(help.getByText('Definition of Done')).toBeVisible();
  await audit('справка: правила');
  await help.getByRole('button', { name: 'Кто что может' }).click();
  await expect(help.getByRole('row', { name: /Отпуска и больничные/ })).toBeVisible();
  await audit('справка: права');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});

test('кнопка «?» в шапке открывает справку, мастер запускается заново и пропускается', async () => {
  await page.getByRole('button', { name: 'Справка' }).click();
  const help = page.getByRole('dialog', { name: 'Справка' });
  await help.getByRole('button', { name: 'Запустить мастер первого запуска' }).click();
  const wizard = page.getByRole('dialog', { name: /Добро пожаловать/ });
  await expect(wizard).toBeVisible();
  await wizard.getByRole('button', { name: 'Пропустить мастер' }).click();
  await expect(wizard).toBeHidden();
  await page.reload();
  await expect(page.locator('.board-nav')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('палитра: клавиши в полях ввода не открывают справку', async () => {
  await page.goto('/projects/DEMO/backlog?projects=DEMO');
  await page.getByRole('searchbox', { name: 'Поиск' }).fill('что?');
  await expect(page.getByRole('dialog')).toBeHidden();
});
