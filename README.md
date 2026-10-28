# team-tracker

Трекер задач и спринтов для команд разработки: проекты с ключами задач, бэклог, доски, спринты, story points, burndown и velocity.

**Статус: в разработке.** Готовы документы, макеты, каркас, задачи с бэклогом, доска и спринты (этапы 0–6). Стек утверждён: React + TypeScript + Vite, позже Node.js + Fastify + PostgreSQL ([ADR-002](docs/adr/002-stack.md)).

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

Состояние: готовы каркас (этап 3), задачи с бэклогом (этап 4), доска (этап 5) и спринты (этап 6): создание, запуск, закрытие с переносом, итоги по людям, настройки спринтов проекта. Отчёты и люди пока заглушки.

## Документы

- [docs/features.md](docs/features.md) — возможности для пользователей
- [docs/vision.md](docs/vision.md) — видение, функции MVP и этапы
- [docs/quality.md](docs/quality.md) — нефункциональные требования
- [docs/architecture.md](docs/architecture.md) — подробная архитектура, схемы, потоки, развёртывание
- [docs/capabilities.md](docs/capabilities.md) — возможности и бизнес-правила по модулям
- [docs/wireframes.md](docs/wireframes.md) — макеты экранов
- [docs/data-model.md](docs/data-model.md) — сущности и ER-диаграмма
- [docs/adr/](docs/adr/) — архитектурные решения ([шаблон](docs/adr/0000-template.md), [ADR-001](docs/adr/001-storage-module.md), [ADR-002: стек](docs/adr/002-stack.md), [ADR-003: бизнес-правила](docs/adr/003-business-rules.md), [ADR-004: решения по макетам](docs/adr/004-screen-decisions.md), [ADR-005: Pages](docs/adr/005-pages-routing.md), [ADR-006: демо-режим](docs/adr/006-demo-author-and-order.md), [ADR-007: доска](docs/adr/007-board.md), [ADR-008: спринты](docs/adr/008-sprints.md))

## PDF

- [docs/pdf/architecture.pdf](docs/pdf/architecture.pdf) — архитектура
- [docs/pdf/capabilities.pdf](docs/pdf/capabilities.pdf) — возможности
- [docs/pdf/wireframes.pdf](docs/pdf/wireframes.pdf) — макеты экранов

Пересборка: `python3 scripts/build_diagrams.py`, `python3 scripts/build_wireframes.py`, `node scripts/svg_to_png.cjs`, `python3 scripts/build_pdf.py` (нужны reportlab и шрифт DejaVu Sans).

## Структура

- `src/app` — точка входа, маршруты, подключение хранилища
- `src/domain` — типы, схемы Zod, правила (чистый TypeScript)
- `src/storage` — интерфейс `TrackerStorage` и адаптер `seed-local`
- `src/modules` — экраны по областям, `src/ui` — общие компоненты и стили, `src/state` — запросы и состояние интерфейса
- `data/seed.json` — демо-данные, `scripts/` — проверка seed, сборка схем и PDF

## Данные

- [data/seed.json](data/seed.json) — демонстрационные данные (проект DEMO); проверка правил: `python3 scripts/check_seed.py`
