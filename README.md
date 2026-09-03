# Leads Service

Невеликий backend-сервіс для прийому та обробки заявок клієнтів (leads).
Побудований на **NestJS + Prisma + PostgreSQL**.

## Стек

- **NestJS 11** — фреймворк, модульна архітектура (Controller → Service → Prisma)
- **Prisma ORM** + **PostgreSQL 15** — зберігання даних
- **class-validator / class-transformer** — валідація вхідних DTO (body та query)
- **Docker Compose** — підняття локальної БД

## Архітектура

```
src/
├── leads/
│   ├── leads.controller.ts   # HTTP-шар: POST/GET/PATCH/DELETE /leads
│   ├── leads.service.ts      # бізнес-логіка: дублікати, статус, webhook
│   └── leads.module.ts
├── dto/
│   ├── create-lead.dto.ts    # валідація тіла POST /leads
│   ├── find-leads.dto.ts     # валідація query-параметрів GET /leads
│   └── update-lead.dto.ts    # PartialType від CreateLeadDto
├── prisma/
│   ├── prisma.service.ts     # обгортка над PrismaClient (connect/disconnect)
│   └── prisma.module.ts
├── app.module.ts             # кореневий модуль, підключає ConfigModule/Prisma/Leads
└── main.ts                   # bootstrap, глобальний ValidationPipe
```

Логіка розділена на три шари:
- **Controller** — тільки маршрутизація та парсинг body/query через DTO, без бізнес-правил;
- **Service** — уся бізнес-логіка (перевірка дубля, визначення статусу, виклик вебхука);
- **Prisma layer** — доступ до БД, ізольований в окремому модулі, щоб його можна було замінити/мокати в тестах.

Глобально в `main.ts` підключено `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — відсікає зайві поля, валідує і body, і query-параметри (наприклад, некоректний `sortBy` у `GET /leads` поверне 400, а не впаде на рівні Prisma).

## Структура БД

Модель `Lead` (`prisma/schema.prisma`):

| Поле        | Тип      | Опис                                   |
|-------------|----------|-----------------------------------------|
| id          | String   | UUID, первинний ключ                    |
| name        | String   | Ім'я клієнта                            |
| email       | String   | Email клієнта                           |
| country     | String   | Країна                                  |
| serviceType | String   | Тип послуги                             |
| budget      | Float    | Бюджет                                  |
| comment     | String?  | Коментар (необов'язково)                |
| status      | String   | `new` \| `priority`, визначається сервером |
| createdAt   | DateTime | Дата створення (за замовчуванням `now()`) |

Індекс `[email, createdAt]` — під запит перевірки дубля заявки за email протягом 24 годин.

## API

### `POST /leads`
Створює заявку.
- Валідує обов'язкові поля (`name`, `email`, `country`, `serviceType`, `budget`) через `CreateLeadDto`.
- Відхиляє запит (400), якщо заявка з таким email вже була створена за останні 24 години.
- Автоматично визначає статус: `budget >= 10000` → `priority`, інакше → `new`.
- Якщо статус `priority` — асинхронно (fire-and-forget) відправляє заявку на `WEBHOOK_URL`. Помилка вебхука **не** впливає на збереження заявки — вона логується і йде окремо від основного потоку.

### `GET /leads`
Повертає список заявок, параметри валідуються через `FindLeadsDto`:
- `search` — пошук за іменем або email (`contains`, без урахування регістру);
- `status`, `country` — точна фільтрація;
- `sortBy` (`budget` | `createdAt`), `sortOrder` (`asc` | `desc`) — сортування, за замовчуванням `createdAt desc`. Будь-яке інше значення відхиляється валідацією (400).

### `GET /leads/:id`, `PATCH /leads/:id`, `DELETE /leads/:id`
Додано понад мінімальні вимоги ТЗ — для зручного керування окремою заявкою (перегляд, редагування, видалення). Кидають 404, якщо заявки з таким id немає.

## Обробка помилок

- **Валідація вхідних даних** — глобальний `ValidationPipe`: некоректні, відсутні або зайві поля (і в body, і в query) відхиляються з 400 ще до контролера.
- **Дублікат заявки** — `BadRequestException` (400) з описом причини.
- **Заявку не знайдено** — `NotFoundException` (404) у `findOne`, яким також користуються `update`/`remove`.
- **Недоступність зовнішнього вебхука** — не кидає виняток користувачу: `fetch` не await-иться в основному потоці, помилка ловиться в `.catch()` і логується в консоль. Заявка вже збережена в БД до виклику вебхука, тому вона гарантовано зберігається незалежно від стану зовнішнього сервісу.

## Запуск проєкту

1. Підняти БД:
   ```bash
   docker compose up -d
   ```
2. Скопіювати `.env.example` в `.env` і за потреби підставити свій `WEBHOOK_URL` (наприклад, з webhook.site):
   ```bash
   cp .env.example .env
   ```
3. Встановити залежності і застосувати міграції:
   ```bash
   npm install
   npm run db:migrate
   ```
4. Запустити сервіс:
   ```bash
   npm run start:dev
   ```

### Змінні середовища

| Змінна        | Опис                                              | Приклад |
|---------------|----------------------------------------------------|---------|
| DATABASE_URL  | Рядок підключення до Postgres                       | `postgresql://root:rootpassword@localhost:5432/leads_db?schema=public` |
| PORT          | Порт застосунку (необов'язково, за замовчуванням 3000) | `3000` |
| WEBHOOK_URL   | Куди відправляти `priority`-заявки                  | `https://webhook.site/...` |

## Що зроблено за допомогою AI

Заявку допомагав розробляти Claude: прискорення написання шаблонного Nest/Prisma-коду (DTO, контролер, сервіс), а також повторний рев'ю коду на відповідність ТЗ.

## Відомі обмеження

- Перевірка дубля email за 24 години робиться як окремий SELECT перед INSERT (не в транзакції) — за високого паралелізму теоретично можливий race condition (дві одночасні заявки з одним email пройдуть перевірку одночасно). Для продакшн-версії варто винести це в транзакцію з серіалізованим рівнем ізоляції або додати часткове унікальне обмеження на рівні БД.
- Юніт/e2e-тестів на `/leads` наразі немає — покриті лише дефолтний `AppController` (успадкований зі стартового шаблону Nest).
