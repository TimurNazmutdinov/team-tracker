# Team Tracker — инструкция для Claude Code

Трекер задач и спринтов для команд: проекты, эпики и задачи, планирование, доска, спринты, отчёты,
роли, резервные копии. Работает на одном компьютере (встроенная база PGlite) или на сервере с
PostgreSQL; демо — на GitHub Pages. Интерфейс и документы — на русском. Владелец — Тимур
(GitHub `TimurNazmutdinov`), репозиторий `TimurNazmutdinov/team-tracker`.

**Начни с [docs/handover.md](docs/handover.md):** что сделано, что дальше, решения владельца.
План переработки и оставшиеся части — [docs/rework.md](docs/rework.md), разделы 6–7.

## Правила владельца (обязательны)

1. **Отвечай по-русски**, коротко и по делу. Весь текст интерфейса — на русском.
2. **Сначала эскиз, потом код.** Любое изменение интерфейса: эскиз в `docs/wireframes.md`
   (картинки: `python3 scripts/build_wireframes.py`, затем `node scripts/svg_to_png.cjs`) →
   показать владельцу → дождаться согласия → только потом код. Код без согласованного эскиза
   владелец считает грубым нарушением. Исключение — владелец прямо сказал «делай всё сразу».
3. **«Больше ничего не ломай».** Перед каждым коммитом — все проверки CI и e2e (см. «Команды»).
   Проверяй прежние сценарии, а не только новые: регрессия хуже незаконченной функции.
4. **Каждая часть работы — своя ветка и свой pull request в `main`.** К следующей части — только
   когда CI предыдущей зелёный. PR сливает владелец; без его прямой просьбы не сливай.
5. **Всегда давай команду обновления у владельца** — одной строкой, с переходом в папку проекта,
   без лишних кавычек. Владелец работает на Windows, проект — `C:\Projects\team-tracker`.
   У него работает именно такая последовательность:
   - после слияния в `main`:
     `cd C:\Projects\team-tracker && git checkout main && git pull origin main && npm run build && npm run start`
   - проверить ветку до слияния:
     `cd C:\Projects\team-tracker && git fetch origin && git checkout <ветка> && git pull origin <ветка> && npm run build && npm run start`
   - если менялся `package-lock.json`, перед `npm run build` добавь `npm ci &&`.
6. Не делать (решение владельца): импорт из Teams, мобильную версию.
7. Story points обозначаются «sp». Типа Story нет: Эпик → Под-эпик → Задача или Баг → Подзадача.
8. Подсказка при наведении (`title`) — у всех кнопок, вкладок, чипов и полей.
9. Иерархия (эпик › под-эпик › задача › подзадача) и связи задач видны везде, где показаны задачи.
10. Цвета: фон приложения — самый светлый, панели и окна — чуть темнее (ADR-013,
    `src/ui/tokens.css`).
11. Решения записывай: архитектурные — ADR в `docs/adr/` (шаблон `0000-template.md`; следующий
    номер — 024, код на него уже ссылается, файла пока нет); возможности — `docs/capabilities.md`
    (F-xx); доработки по обратной связи — `docs/feedback-bibigul.md` (D-xx); сущности —
    `docs/data-model.md`; пользовательское описание — `docs/features.md`.
12. Ветку `docs/feedback-bibigul` не сливать: в ней видео встречи.

## Команды

Node.js 22 (`.nvmrc`). Зависимости — только `npm ci` (`npm install` переписывает `package-lock.json`).

| Что | Команда |
|---|---|
| Демо-режим (данные в браузере из `data/seed.json`), http://localhost:5173 | `npm run dev` |
| Сервер и интерфейс, http://localhost:3000, база в `./local-data` | `npm run start` |
| Разработка с сервером | `npm run server:dev` и `VITE_STORAGE=api npm run dev` |
| Проверки CI (job `check`) | `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, `python3 scripts/check_seed.py` |
| E2E (job `e2e`) | `cd e2e && npm ci && npx playwright test` |
| Форматирование | `npm run format` |
| Первый администратор | `npm run admin:create` |
| Демо-данные в пустую базу | `npm run db:seed` |
| Копия и восстановление (трекер остановлен) | `npm run backup`, `npm run restore backups\<папка>` |

`npm run start` сам ставит зависимости, если изменился `package-lock.json`, и пересобирает
интерфейс в режиме API (`VITE_STORAGE=api`), если исходники новее сборки. E2E поднимают свой
сервер на порту 3100 с временной базой и демо-данными. На новом компьютере браузер для них
ставится один раз: `cd e2e && npx playwright install chromium`.

CI (`.github/workflows/ci.yml`) на каждый PR и push в `main`: `check` и `e2e`; после push в
`main` — `deploy` демо на GitHub Pages.

## Карта кода

| Папка | Что внутри |
|---|---|
| `src/domain` | Схема данных (Zod, `schema.ts`) и бизнес-правила — чистые функции, возвращают изменения (`changes.ts`); тест `*.test.ts` рядом с каждым модулем |
| `src/storage` | Интерфейс `TrackerStorage`, адаптеры `seed-local` (демо, браузер) и `api` (сервер) |
| `src/state` | Запросы React Query (`queries.ts`), действия (`actions.ts`: `makeActions` → `run` → `loadView`), сторы Zustand |
| `src/modules` | Экраны: `portfolio`, `backlog` (Планирование), `board`, `sprints`, `reports`, `analytics`, `people`, `projects`, `tasks` (окно «Создать», карточка задачи) и др. |
| `src/ui` | Общие компоненты, меню из 7 пунктов (`AppBar.tsx`), подвкладки (`SectionTabs.tsx`), `tokens.css`, `styles.css` |
| `server/src` | Fastify: `app.ts` (маршруты, права), `repo.ts` (запись изменений), `db/` (Drizzle; PGlite или PostgreSQL; миграции при запуске), `backups/` (JSON, Excel, копия базы), `*-cli.ts` |
| `server/migrations` | SQL-миграции Drizzle и служебные файлы `meta/` |
| `data/seed.json` | Демо-данные с полем `version` |
| `e2e/tests` | Сценарии Playwright `NN-*.spec.ts` |
| `docs/` | Документы, ADR, эскизы (`wireframes.md`, картинки в `docs/diagrams/`), PDF (`docs/pdf/`) |

## Как здесь принято

- Каждое изменение задачи пишет событие истории (ADR-003). Бизнес-правила — только в
  `src/domain`, с тестами.
- **Новое поле или сущность в данных** — это всё сразу: Zod (`src/domain/schema.ts`), таблица
  (`server/src/db/schema.ts`) и миграция, сервер (`repo.ts`, `changes-schema.ts`, `app.ts`),
  резервные копии (`server/src/backups/*`: JSON, Excel и значения по умолчанию для старых копий),
  демо-данные (`data/seed.json` с новой `version`, `scripts/check_seed.py`, `server/src/seed.ts`),
  `docs/data-model.md`.
- **Миграция:** `cd server && npx drizzle-kit generate --config drizzle.config.ts --name <имя>`
  (своя SQL — с `--custom`; пути в конфиге заданы относительно `server/`), затем
  `npx prettier --write migrations/meta`, иначе CI падает на `format:check`.
- Перед новыми миграциями сервер на PGlite сам сохраняет архив базы
  `local-data-before-update-ГГГГММДД-ЧЧММ.tar.gz` рядом с папкой данных. Откат данных: распаковать
  архив в пустую папку данных (`tar -xzf <архив> -C local-data`).
- **Колонки досок — данные:** таблица `statuses`, общая для всех проектов; `issue.status` хранит id
  колонки. Id колонок по умолчанию — прежние имена (`Backlog`, `To Do`, `In Progress`, `Review`,
  `Done`); их не меняй, на этом держится откат на старую версию. Логику завязывай на категорию
  колонки (`backlog`, `todo`, `progress`, `done`), а не на имя. Право на правку колонок — `board.columns`.
- Тип Story в старых данных превращается в Task (`LEGACY_TYPES` в `schema.ts`, миграция 0009).
- Поиск по основе слова — только в названии задачи (иначе описание перебивает палитру Ctrl+K).
- Фильтры доски — в адресе страницы: `type`, `prio`, `q=mine,blocked,unassigned`, `labels=a|b`, `lm=all`.
- Не запускай `npm run build` или `vite build` во время e2e: сервер тестов сам собирает `dist`.
- Не используй `pkill -f` с шаблоном, который совпадает с твоей же командой: так убивается своя
  оболочка.
