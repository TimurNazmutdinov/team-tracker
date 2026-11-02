import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Создание проектов и управление созданными на вкладке «Портфель» (ADR-023). Идёт после 01–08.

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

test('«+ Новый проект» на «Портфеле» создаёт проект', async () => {
  await page.goto('/portfolio?projects=all');
  await page.getByRole('button', { name: '+ Новый проект' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый проект' });
  await audit('новый проект');
  await dialog.getByLabel('Ключ задач').fill('ops');
  await dialog.getByLabel('Название').fill('Операции');
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByText('Проект OPS создан')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Проект OPS' })).toBeVisible();
});

test('ключ проверяется: занятый ключ не принимается', async () => {
  await page.getByRole('button', { name: '+ Новый проект' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый проект' });
  await dialog.getByLabel('Ключ задач').fill('OPS');
  await dialog.getByLabel('Название').fill('Ещё');
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(dialog.getByText(/уже занят/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
});

test('меню проекта: смена названия и ключа с предупреждением', async () => {
  const card = page.getByRole('article', { name: 'Проект OPS' });
  await card.getByRole('button', { name: 'Управление проектом OPS' }).click();
  await expect(card.getByRole('menuitem', { name: 'Настройки проекта' })).toBeVisible();
  await card.getByRole('menuitem', { name: /Изменить название и ключ/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Изменить проект OPS' });
  await dialog.getByLabel('Ключ задач').fill('OPSX');
  await expect(dialog.getByText(/старые ссылки/)).toBeVisible();
  await audit('изменение проекта');
  await dialog.getByLabel('Название').fill('Операции и поддержка');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Проект сохранён')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Проект OPSX' })).toBeVisible();
});

test('архив: проект исчезает из списка и фильтра, возвращается кнопкой «Вернуть»', async () => {
  page.once('dialog', (d) => void d.accept());
  const card = page.getByRole('article', { name: 'Проект OPSX' });
  await card.getByRole('button', { name: 'Управление проектом OPSX' }).click();
  await card.getByRole('menuitem', { name: /Архивировать/ }).click();
  await expect(page.getByText('Проект OPSX в архиве')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Проект OPSX' })).toBeHidden();
  const archive = page.getByRole('region', { name: /Архив проектов/ });
  await expect(archive).toContainText('OPSX');
  await audit('архив проектов');

  await page.locator('main .project-filter button').first().click();
  const pop = page.getByRole('dialog', { name: 'Выбор проектов' });
  await expect(pop.getByLabel(/OPSX/)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await archive.getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.getByText('Проект OPSX возвращён')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Проект OPSX' })).toBeVisible();
});

test('удаление: проект с задачами недоступен, пустой удаляется', async () => {
  // у DEMO есть задачи: пункт удаления отключён
  const demo = page.getByRole('article', { name: 'Проект DEMO' });
  await demo.getByRole('button', { name: 'Управление проектом DEMO' }).click();
  await expect(demo.getByRole('menuitem', { name: /Удалить/ })).toBeDisabled();
  await page.keyboard.press('Escape');

  page.once('dialog', (d) => void d.accept());
  const card = page.getByRole('article', { name: 'Проект OPSX' });
  await card.getByRole('button', { name: 'Управление проектом OPSX' }).click();
  await card.getByRole('menuitem', { name: /Удалить/ }).click();
  await expect(page.getByText('Проект OPSX удалён')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Проект OPSX' })).toBeHidden();
});
