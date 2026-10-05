# REST API

Префикс `/api/v1`. Интерактивный Swagger доступен на `/api/docs` в development, OpenAPI JSON — `/api/docs-json`. В production Swagger отключён.

Все приватные запросы: `Authorization: Bearer <accessToken>`. Изменения: `Origin: <FRONTEND_URL>` и `X-CSRF: 1`. Регистрация/вход/refresh возвращают `{ accessToken, user }`, refresh-cookie устанавливается сервером. DTO и строгие схемы — `packages/validation/src/index.ts`, типы — `packages/contracts/src/index.ts`.

| Группа | Маршруты |
|---|---|
| Авторизация | POST `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/resend-verification`; GET `/auth/me` |
| Аккаунт | GET/PATCH `/profile`; POST `/profile/change-password`; GET/DELETE `/sessions`; DELETE `/sessions/:id` |
| Автомобили | GET/POST `/cars`; GET/PATCH/DELETE `/cars/:id`; POST `/cars/:id/restore`; GET `/cars/:id/summary`; GET `/dashboard` |
| История | GET `/cars/:id/history`; POST `/cars/:id/events`; GET/PATCH/DELETE `/events/:id`; GET/POST `/cars/:id/maintenance`; GET/PATCH/DELETE `/maintenance/:id` |
| Разделы | GET/POST `/cars/:id/expenses`, `/mileage`, `/accidents`, `/documents`; PATCH/DELETE `/<раздел>/:id`; GET `/cars/:id/parts`, `/expenses/stats` |
| Файлы | POST multipart `/files` (`carId`, `file`, `photo`); GET `/files/:id/download`; PATCH/DELETE `/files/:id` |
| Напоминания | GET/POST `/cars/:id/reminders`; PATCH/DELETE `/reminders/:id`; GET `/notifications`; PATCH `/notifications/:id/read` |
| Отчёты | GET/POST `/cars/:id/public-reports`; POST `/cars/:id/public-reports/preview`; PATCH/DELETE `/public-reports/:id`; POST `/public-reports/:id/publish`; GET `/public/reports/:token`, `/public/reports/:token/files/:id` |
| Передача | GET/POST `/cars/:id/ownership-invitations`; DELETE `/ownership-invitations/:id`; POST `/ownership-invitations/accept` |
| Прочее | GET `/search?q=...`, `/cars/:id/audit`; GET/POST `/service-centers`; PATCH `/service-centers/:id`; GET `/health/live`, `/health/ready` |

У списков истории, расходов, пробега, деталей, напоминаний, уведомлений и аудита: `{ items, nextCursor }`; `limit=1..100`, следующий запрос с `cursor`. Справочники и настройки отчётов ограничены 100 элементами. В dashboard выдаётся пять последних событий; показатели считаются по всей доступной БД.

Пример создания обслуживания (`Idempotency-Key` обязателен на клиенте для повторяемого запроса):

```json
{
  "kind": "maintenance",
  "title": "Замена масла",
  "date": "2026-10-04",
  "odometerKm": 140421,
  "currency": "KGS",
  "laborCost": "1500",
  "extraCost": "0",
  "parts": [
    {"name":"Масло","quantity":"6","unit":"л","unitPrice":"1400"},
    {"name":"Фильтр","quantity":"1","unitPrice":"1800"}
  ],
  "nextKm": 10000,
  "nextMonths": 12
}
```

Изменение использует полное тело плюс `version`. Удаление события: `DELETE /events/:id?version=2`. Связанные расход и пробег редактируются через исходное событие; специализированные PATCH не позволяют рассогласовать ТО.

Статистика возвращает decimal-строки в `totals` и строки по месяцу/валюте/категории в `rows`. Фильтры `from`, `to`, `currency`, `category`. Отрицательные расходы не поддерживаются.

Ошибка: `{ code, message, fieldErrors?, requestId }`. Основные коды: `AUTH_REQUIRED`, `VALIDATION_ERROR`, `NOT_FOUND`, `RECORD_CONFLICT`, `MILEAGE_CONFIRMATION_REQUIRED`, `IDEMPOTENCY_CONFLICT`, `CSRF_REJECTED`, `RATE_LIMIT`. Для чужой сущности — 404. Создание — 201; изменение/удаление — 200 с JSON-результатом. Последнее сознательно отличается от необязательного варианта 204 из ТЗ.
