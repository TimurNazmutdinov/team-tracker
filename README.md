# team-tracker

Трекер задач и спринтов для команд разработки: проекты с ключами задач, бэклог, доски, спринты, story points, burndown и velocity.

**Статус: в разработке.** Готовы документы, макеты, приложение на демо-данных (этапы 0–7) и рабочая база: сервер Node.js + Fastify + PostgreSQL со входом и ролями (этап 8, локально). Стек: React + TypeScript + Vite на клиенте ([ADR-002](docs/adr/002-stack.md), [ADR-010](docs/adr/010-server-auth-roles.md)).

![Схема архитектуры](docs/architecture.svg)

## Демо и запуск

**Демо:** https://timurnazmutdinov.github.io/team-tracker/ (публикуется из ветки `main`; данные берутся из `data/seed.json`, изменения хранятся в вашем браузере).

Локальный запуск (нужен Node.js 22):

```bash
npm install
npm run dev
```

Приложение откроется на http://localhost:5173/. Кнопка «Меню → Сбросить данные» возвращает демо-данные к исходным.

Команды: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`; проверка seed — `python3 scripts/check_seed.py`. Все они же выполняются в CI (GitHub Actions) для каждого pull request и push в `main`.

Состояние: готовы каркас (этап 3), задачи с бэклогом (этап 4), доска (этап 5), спринты (этап 6), отчёты (этап 7) и рабочая база с входом и ролями (этап 8). Публикация на внешнем сервере пока не настроена.

## Рабочая база (сервер, вход и роли)

Приложение с общей базой, входом по учётке и четырьмя ролями (Разработчик, Продакт, Тимлид, Администратор; [ADR-010](docs/adr/010-server-auth-roles.md)).

**Docker Compose** (PostgreSQL + приложение):

```bash
docker compose up -d --build
```

Откройте http://localhost:3000 и зарегистрируйтесь: **первая созданная учётка становится администратором**, остальные — разработчиками (роли меняет администратор на экране «Люди»). Демо-данные в пустую базу:

```bash
docker compose run --rm app npm run db:seed
```

**Без Docker** (встроенная база PGlite в `.data/pglite`, Node.js 22):

```bash
npm install
VITE_STORAGE=api npm run build
npm run server
```

Для разработки: `npm run server:dev` (сервер, порт 3000) и `VITE_STORAGE=api npm run dev` (интерфейс на порту 5173, запросы `/api` проксируются на сервер). С внешней PostgreSQL задайте `DATABASE_URL`. Переменные: `PORT`, `COOKIE_SECURE=true` (за HTTPS), `POSTGRES_PASSWORD`, `APP_PORT`.

**Резервные копии:** `scripts/backup.sh` (сжатый дамп в `backups/`, хранятся 14 последних) и `scripts/restore.sh backups/файл.sql.gz`.

## Документы

- [docs/features.md](docs/features.md) — возможности для пользователей
- [docs/vision.md](docs/vision.md) — видение, функции MVP и этапы
- [docs/quality.md](docs/quality.md) — нефункциональные требования
- [docs/architecture.md](docs/architecture.md) — подробная архитектура, схемы, потоки, развёртывание
- [docs/capabilities.md](docs/capabilities.md) — возможности и бизнес-правила по модулям
- [docs/wireframes.md](docs/wireframes.md) — макеты экранов
- [docs/data-model.md](docs/data-model.md) — сущности и ER-диаграмма
- [docs/adr/](docs/adr/) — архитектурные решения ([шаблон](docs/adr/0000-template.md), [ADR-001](docs/adr/001-storage-module.md), [ADR-002: стек](docs/adr/002-stack.md), [ADR-003: бизнес-правила](docs/adr/003-business-rules.md), [ADR-004: решения по макетам](docs/adr/004-screen-decisions.md), [ADR-005: Pages](docs/adr/005-pages-routing.md), [ADR-006: демо-режим](docs/adr/006-demo-author-and-order.md), [ADR-007: доска](docs/adr/007-board.md), [ADR-008: спринты](docs/adr/008-sprints.md), [ADR-009: отчёты](docs/adr/009-reports.md), [ADR-010: сервер, вход и роли](docs/adr/010-server-auth-roles.md))

## PDF

- [docs/pdf/architecture.pdf](docs/pdf/architecture.pdf) — архитектура
- [docs/pdf/capabilities.pdf](docs/pdf/capabilities.pdf) — возможности
- [docs/pdf/wireframes.pdf](docs/pdf/wireframes.pdf) — макеты экранов

Пересборка: `python3 scripts/build_diagrams.py`, `python3 scripts/build_wireframes.py`, `node scripts/svg_to_png.cjs`, `python3 scripts/build_pdf.py` (нужны reportlab и шрифт DejaVu Sans).

## Структура

- `src/app` — точка входа, маршруты, подключение хранилища
- `src/domain` — типы, схемы Zod, правила (чистый TypeScript)
- `src/storage` — интерфейс `TrackerStorage` и адаптеры `seed-local` (демо) и `api` (сервер)
- `server` — API на Fastify: вход, права, запись, миграции Drizzle; `Dockerfile`, `docker-compose.yml`
- `src/modules` — экраны по областям, `src/ui` — общие компоненты и стили, `src/state` — запросы и состояние интерфейса
- `data/seed.json` — демо-данные, `scripts/` — проверка seed, сборка схем и PDF

## Данные

- [data/seed.json](data/seed.json) — демонстрационные данные (проект DEMO); проверка правил: `python3 scripts/check_seed.py`
