# Event Logger MVP

Минимальное веб-приложение для логирования событий (A/B CTA клики, heartbeat) в Google Sheets через Google Apps Script.

## Структура проекта

| Файл | Назначение |
|------|-----------|
| `index.html` | UI: поле ввода URL, кнопки событий, статус |
| `app.js` | Логика: localStorage, fetch-запросы, обработчики |
| `Code.gs` | Серверная часть для Google Apps Script |

## Быстрый старт

### 1. Настройка Google Apps Script

1. Создайте Google Таблицу.
2. Откройте **Расширения → Apps Script**.
3. Замените содержимое файла `Код.gs` на код из `Code.gs` этого проекта.
4. Убедитесь, что `doPost` — функция верхнего уровня (не вложена в другую функцию).
5. Нажмите **Начать развертывание → Новое развертывание**.
6. Тип: **Веб-приложение**.
7. Выполнять как: **Я**.
8. Доступ: **Все**.
9. Скопируйте полученный URL (заканчивается на `/exec`).

### 2. Запуск веб-приложения

1. Откройте `index.html` в браузере (или разместите на GitHub Pages).
2. Вставьте скопированный URL в поле ввода.
3. Нажмите **Save URL**.
4. Нажимайте кнопки **CTA A**, **CTA B**, **Heartbeat** — события будут записываться в таблицу.

## Формат данных в таблице

Лист `logs` создаётся автоматически. Столбцы:

| Столбец | Описание |
|---------|----------|
| `ts_iso` | Временная метка в формате ISO 8601 |
| `event` | Тип события: `cta_click` или `heartbeat` |
| `variant` | Вариант CTA: `A`, `B` или пусто |
| `userId` | Псевдоанонимный UUID из localStorage |
| `meta` | JSON-строка: `page`, `ua` (user agent) |

## Как это работает

- **CORS**: запросы отправляются как `application/x-www-form-urlencoded` без кастомных заголовков — это "simple request", не требующий preflight.
- **User ID**: генерируется через `crypto.randomUUID()` при первом визите и хранится в `localStorage` под ключом `uid`.
- **GAS URL**: сохраняется в `localStorage` под ключом `gas_url`.

## Деплой на GitHub Pages

1. Загрузите `index.html` и `app.js` в репозиторий GitHub.
2. Включите GitHub Pages в настройках репозитория (Settings → Pages → Source: main branch).
3. `Code.gs` на GitHub Pages не нужен — он используется только в Google Apps Script.

## Ограничения

- Нет аутентификации — любой с URL может отправлять события.
- Google Apps Script имеет лимиты: ~20 000 запросов в день для бесплатных аккаунтов.
- `crypto.randomUUID()` требует HTTPS или localhost.
- При изменении кода в Apps Script нужно создавать **новое** развертывание и обновлять URL.

---

# Sentiment Analyzer

Клиентское веб-приложение для анализа тональности текстовых отзывов. Работает полностью в браузере, без сервера.

## Структура

| Файл | Назначение |
|------|-----------|
| `sentiment/index.html` | UI: переключатель режимов, кнопка анализа, результат |
| `sentiment/app.js` | Логика: загрузка отзывов, инференс, API-вызовы |
| `sentiment/reviews_test.tsv` | Тестовые отзывы (TSV, колонка `text`) |

## Два режима работы

### Local Model (Transformers.js)
- Модель `Xenova/distilbert-base-uncased-finetuned-sst-2-english` (~67 МБ) загружается и работает в браузере
- Первая загрузка: 30-60 секунд, далее кешируется браузером
- API-ключ не нужен
- Возвращает POSITIVE / NEGATIVE с точным confidence score

### OpenRouter API
- Использует модель `google/gemini-3-flash-preview` через OpenRouter
- Требует API-ключ (получить на [openrouter.ai](https://openrouter.ai))
- Ключ хранится в `localStorage` под ключом `openrouter_key`
- Быстрый ответ, не нужно скачивать модель
- Возвращает POSITIVE / NEGATIVE / NEUTRAL с confidence score

## Быстрый старт

1. Запустите локальный HTTP-сервер (ES-модули не работают через `file://`):
   ```bash
   cd c:\Users\Alex\InternalD\nndl2
   python -m http.server 8000
   ```
2. Откройте `http://localhost:8000/sentiment/index.html`
3. **Local Model**: подождите загрузки модели, нажмите "Analyze Random Review"
4. **OpenRouter API**: переключите радио-кнопку, вставьте API-ключ, нажмите Save Key, затем Analyze

## Формат отзывов (reviews_test.tsv)

TSV-файл с заголовком `text`. Каждая строка — один отзыв. Пример:

```
text
This product exceeded all my expectations.
Terrible experience. The item broke after two days.
```

## Используемые CDN

| Библиотека | Версия | Назначение |
|-----------|--------|-----------|
| [Transformers.js](https://huggingface.co/docs/transformers.js) | 3.7.6 | ML-инференс в браузере |
| [Papa Parse](https://www.papaparse.com) | 5.4.1 | Парсинг TSV |
| [Font Awesome](https://fontawesome.com) | 6.4.0 | Иконки результатов |

## Ограничения

- ES-модули требуют HTTP-сервер (не работает через `file://`)
- Первая загрузка локальной модели медленная (~67 МБ)
- OpenRouter API-ключ хранится в localStorage (не подходит для продакшена с чужими пользователями)
- Модель DistilBERT выдаёт только POSITIVE/NEGATIVE (без NEUTRAL); NEUTRAL возможен только через API
