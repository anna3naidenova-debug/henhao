# Сайт школы китайского Hěn hǎo

Одностраничный сайт на чистом HTML/CSS/JS. Без сборки, без внешних CDN и без Google: сайт должен открываться из Китая без VPN.

## Что где лежит

```
site/                    ← это и есть сайт (папка для публикации)
  index.html             главная страница
  site.config.js         ★ ВСЕ цены, флаги, контакты, слова, FAQ, варианты формы
  404.html, privacy.html служебные страницы
  assets/css/style.css   стили
  assets/js/main.js      логика: кинетика, тарифы, форма, QR, часы
  assets/js/qrcode.js    генератор QR (MIT, лежит локально)
  assets/fonts/          шрифты-сабсеты woff2
  assets/img/            гуси, логотип, OG-картинка, фавиконы
netlify/functions/lead.mjs  серверная функция: заявка → Telegram
netlify.toml             настройки Netlify
tools/subset_fonts.py    пересборка шрифтов
tools/fonts-src/         исходные шрифты (на сайт не попадают)
tools/cutouts/           PNG-вырезки гусей и логотипа
```

## Как посмотреть локально

Самое простое — открыть `site/index.html` двойным кликом.
Надёжнее (как на хостинге) — запустить мини-сервер в терминале:

```
cd site
python3 -m http.server 8000
```

и открыть http://localhost:8000

Пока в `site.config.js` стоит `form.demoMode: true`, форма никуда не отправляет заявки и сразу показывает экран успеха.

## Как поменять цены, тексты, контакты

Всё в `site/site.config.js`. Например:

- цены (в рублях) — `tariffs[].price` (первый поток), цена следующего потока — `tariffs[].nextPrice`;
- строка «со следующего потока — … ₽» — `flags.showStrikePrice` (`false` — скрыть);
- тарифы «С носителем» — `flags.showNative`. Если носителя к запуску нет, поставьте `false` — обе карточки скроются;
- блок встречи — `flags.showMeetup: true` и заполнить `meetup.date` и `meetup.place`;
- блок преподавателя — `flags.showTeacher: true`, положить фото в `site/assets/img/teacher.jpg` и заполнить `teacher`;
- QR из WeChat — положить картинку в `site/assets/img/wechat-qr.png` и вписать путь в `contacts.wechatQr`;
- Яндекс Метрика — вписать номер счётчика в `metrikaId`. Цели, которые отправляет сайт: `click_manager` (кнопки «Связаться с менеджером»), `form_open`, `submit_form`, `click_telegram`, `click_wechat`, `view_tariffs`. Их нужно создать в Метрике как цели типа «JavaScript-событие» с такими же идентификаторами.

**Если добавили новый иероглиф** (в конфиг или в HTML) — пересоберите шрифты, иначе он отобразится системным шрифтом:

```
pip3 install fonttools brotli
python3 tools/subset_fonts.py
```

## Публикация на Netlify и заявки в Telegram

1. Создать бота у @BotFather в Telegram и получить токен.
2. Написать боту любое сообщение, открыть `https://api.telegram.org/bot<ТОКЕН>/getUpdates` и найти там `"chat":{"id": …}` — это `chat_id`. Для группового чата: добавить бота в группу и сделать то же самое.
3. Залить проект на Netlify (через GitHub или перетащив папку проекта целиком: нужен и `site/`, и `netlify/`, и `netlify.toml`).
4. В Netlify: Site configuration → Environment variables. Добавить `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
5. В `site/site.config.js` поставить `form.demoMode: false` и задеплоить ещё раз.
6. Подключить свой домен: `*.netlify.app` в Китае часто не открывается. Затем заменить `example.com` в `site/robots.txt` и `site/sitemap.xml`, а в `index.html` сделать ссылку на `og:image` абсолютной (`https://домен/assets/img/og.png`), чтобы Telegram гарантированно показал превью.

Каждая заявка также пишется в логи функции (Netlify → Logs → Functions). Это запасная копия на случай сбоя бота.

## Проверка перед запуском

- из Китая: https://www.itdog.cn/http/ и https://www.17ce.com, плюс живая проверка в Гуанчжоу без VPN (Safari/Chrome, браузер Telegram, браузер WeChat);
- из России: https://check-host.net;
- вкладка Network в браузере: ни одного запроса к Google и внешним CDN;
- превью ссылки в Telegram;
- весь китайский текст проверяет преподаватель. Сейчас на сайте: 你好, 谢谢, 朋友, 学习, 广州, 鹅, 住 zhù, 搬家 bānjiā, 合作 hézuò, 奶茶, 地铁, 招牌, 发消息, 女 + 子 = 好 (с объяснением), 套餐一/二/三/四 (tàocān yī/èr/sān/sì), 快递单, 广州塔, 莫斯科.

## Заглушки, которые нужно заменить

Контакты (Telegram, WeChat, e-mail), текст политики конфиденциальности, домен. Описания уровней HSK1–3 в трекинге (`track` в конфиге) — ориентировочные, проверить у преподавателя.
