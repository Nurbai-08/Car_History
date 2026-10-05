# CarHistory

CarHistory — полнофункциональное приложение для ведения истории автомобиля и обслуживания. В проекте есть фронтенд на React/Vite, API на NestJS, PostgreSQL, фоновые задачи Redis/BullMQ, приватное S3-совместимое хранилище, подтверждение почты, восстановление пароля, напоминания, отчёты и передача владения автомобилем.

## Локальный запуск без Docker

Нужны Node.js 24 с Corepack и [Homebrew](https://brew.sh). Docker Desktop не требуется.

```bash
brew install postgresql@18 redis mailpit
corepack enable
pnpm install --frozen-lockfile
pnpm dev:up
```

При первом запуске `pnpm dev:up` создаст `.env` с новым JWT-секретом, запустит локальный приватный кластер PostgreSQL, Redis, S3-совместимое хранилище, Mailpit, API, фоновый воркер и фронтенд. Скрипт также применит миграции и добавит демонстрационные данные.

Для своей конфигурации скопируй `.env.example` в `.env` до запуска. По умолчанию данные и журналы хранятся в `../work`; для другой директории задай `CARHISTORY_WORK_DIR`.

Повторный запуск после остановки:

```bash
pnpm dev:up
```

Открой:

- Приложение: http://localhost:8080
- Проверка API: http://localhost:3001/api/v1/health/ready
- Локальный почтовый ящик: http://localhost:8025
- Локальное приватное S3-совместимое хранилище: http://localhost:9000

Демонстрационная учётная запись: `owner@carhistory.test` / `CarHistory2026!`.

Остановить приложение:

```bash
pnpm dev:down
```

Локальные данные сохраняются в рабочей директории. Для запуска тестов, линтера, проверки типов и production-сборки:

```bash
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
```

## Архитектура для production

Фронтенд разворачивается на Vercel. API и постоянно работающий воркер BullMQ размещаются отдельными сервисами Railway. В Railway также нужны PostgreSQL, Redis, S3-совместимое Storage Bucket и приватный сервис ClamAV. Для писем подтверждения и восстановления пароля необходим реальный SMTP-провайдер.

Vercel проксирует `/api/*` на Railway. Поэтому refresh-cookie остаются на домене фронтенда и не блокируются браузером как сторонние. В Vercel укажи `BACKEND_URL`: публичный адрес Railway API без `/api` и без слеша в конце.

### Сервисы Railway

Создай из того же GitHub-репозитория:

1. `api` — установи зависимости, выполни `pnpm --filter @carhistory/validation build` и `pnpm --filter @carhistory/api build`. Перед запуском выполни миграции `pnpm --filter @carhistory/api db:migrate` и инициализацию хранилища `pnpm --filter @carhistory/api storage:init`; затем запусти `node apps/api/dist/main.js`. Для API нужен публичный домен и проверка работоспособности `/api/v1/health/ready`.
2. `worker` — собери так же, как API, и запусти `node apps/api/dist/worker.js`. Публичный домен не нужен.
3. PostgreSQL и Redis — шаблоны баз данных Railway.
4. Storage Bucket — оставь приватным и передай его переменные S3 в `api` и `worker`.
5. `ClamAV` — контейнер ClamAV в приватной сети Railway с внутренним портом `3310`.

Примени значения из [deploy/production.env.template](deploy/production.env.template) к `api` и `worker`. Значение `FRONTEND_URL` должно в точности совпадать с production-адресом Vercel. Выполни Prisma-миграции и проверку хранилища перед запуском API.

### Vercel

Импортируй этот же GitHub-репозиторий. Корневой [vercel.ts](vercel.ts) собирает только веб-приложение, настраивает маршруты SPA и обратный прокси к API. Укажи:

```text
BACKEND_URL=https://your-api.up.railway.app
```

После первого развёртывания Vercel скопируй его production-адрес в Railway как `FRONTEND_URL`, перезапусти `api` и `worker`, затем сделай повторное развёртывание Vercel. Не добавляй слеш в конце адреса.

## Обязательные production-секреты

Никогда не отправляй `.env` в Git. Для production нужны:

- `DATABASE_URL`, `REDIS_URL` — ссылки на сервисы Railway.
- `JWT_ACCESS_SECRET` — новый случайный секрет длиной минимум 32 символа.
- `FRONTEND_URL` — точный production-адрес Vercel.
- `STORAGE_*` — учётные данные и адреса приватного S3-совместимого хранилища.
- `SMTP_*`, `MAIL_FROM` — SMTP-учётная запись с подтверждённым адресом отправителя.
- `CLAMAV_HOST`, `CLAMAV_PORT` — приватный сервис антивирусной проверки.

Полный список и безопасные шаблоны находятся в [deploy/production.env.template](deploy/production.env.template).
