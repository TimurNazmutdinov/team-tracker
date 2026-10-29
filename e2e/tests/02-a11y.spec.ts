import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Проверка доступности ключевых экранов (axe, WCAG 2.1 A и AA) в светлой и тёмной версиях гаммы.
// Идёт после сквозного теста (01-flow): администратор уже зарегистрирован.

const SCREENS: [string, string][] = [
  ['доска', '/projects/DEMO/board'],
  ['планирование будущих спринтов', '/projects/DEMO/backlog'],
  ['прошлые спринты', '/projects/DEMO/history'],
  ['спринты', '/projects/DEMO/sprints'],
  ['карточка задачи', '/projects/DEMO/issues/5'],
  ['отчёты', '/projects/DEMO/reports'],
  ['люди', '/projects/DEMO/people'],
  ['настройки', '/projects/DEMO/settings'],
  ['о программе', '/about'],
];

async function audit(page: Page, name: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = result.violations.map(
    (v) =>
      `${name}: ${v.id} (${v.impact}) — ${v.help}\n` +
      v.nodes
        .slice(0, 3)
        .map((n) => `   ${n.target.join(' ')}`)
        .join('\n'),
  );
  expect(report, report.join('\n')).toEqual([]);
}

test('экран входа', async ({ page }) => {
  await page.goto('/projects/DEMO/board');
  await expect(page.getByRole('tab', { name: 'Вход' })).toBeVisible();
  await audit(page, 'вход');
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`доступность, ${scheme === 'light' ? 'светлая' : 'тёмная'} версия`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await page.goto('/projects/DEMO/board');
      await page.getByLabel('Почта').fill('admin@example.com');
      await page.getByLabel('Пароль').fill('password-1');
      await page.locator('form button[type=submit]').click();
      await expect(page.locator('.board-nav')).toBeVisible();
    });

    for (const [name, url] of SCREENS) {
      test(name, async ({ page }) => {
        await page.goto(url);
        await expect(page.locator('main h1').first()).toBeVisible();
        await audit(page, name);
      });
    }
  });
}
