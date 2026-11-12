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
netlify/functions/lead.mjs  старая функция для Netlify (не используется, заявки принимает server.mjs)
netlify.toml             настройки Netlify (не используются)
server.mjs               сервер на Amvera: сайт + приём заявок → файл /data и Telegram
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

Через `python3 -m http.server` форма не работает (нет `/api/lead`), для проверки формы запускайте `node server.mjs`, см. ниже. Если поставить `form.demoMode: true`, форма ничего не отправляет и сразу показывает экран успеха — на сайте так не оставлять.

## Как поменять цены, тексты, контакты

Всё в `site/site.config.js`. Например:

- цены (в рублях) — `tariffs[].price` (первый поток), цена следующего потока — `tariffs[].nextPrice`;
- строка «со следующего потока — … ₽» — `flags.showStrikePrice` (`false` — скрыть);
- тарифы «С носителем» — `flags.showNative`. Если носителя к запуску нет, поставьте `false` — обе карточки скроются;
- блок встречи — `flags.showMeetup: true` и заполнить `meetup.date` и `meetup.place`;
- блок преподавателей — `flags.showTeacher: true`, данные карточек в массиве `teachers`. Поля: `name`, `role`, `language`, `groups` (направления), `experience`, `photo`; `highlight` — акцент на фото, `credential` — образование или ключевая квалификация. Поля `about` и `advice` открываются в боковой панели по кнопке «О преподавателе». Фото положить в `site/assets/img/teachers/` и указать путь вроде `assets/img/teachers/shuo.jpg` в `photo`. Пустые фото, опыт и направления показывают заглушки;
- QR из WeChat — положить картинку в `site/assets/img/wechat-qr.png` и вписать путь в `contacts.wechatQr`;
- Яндекс Метрика — вписать номер счётчика в `metrikaId`. Цели, которые отправляет сайт: `click_manager` (кнопки «Связаться с менеджером»), `form_open`, `submit_form`, `click_telegram`, `click_wechat`, `view_tariffs`. Их нужно создать в Метрике как цели типа «JavaScript-событие» с такими же идентификаторами.

**Если добавили новый иероглиф** (в конфиг или в HTML) — пересоберите шрифты, иначе он отобразится системным шрифтом:

```
pip3 install fonttools brotli
python3 tools/subset_fonts.py
```

## Где работает сайт и заявки в Telegram

Сайт https://henhaoschool.ru размещён на Amvera и обновляется сам после каждого push в ветку `main` (подробно в `HOSTING.md`).

- Заявки формы принимает `server.mjs` по адресу `/api/lead`, сохраняет копию каждой заявки в файл `/data/leads.jsonl` на Amvera (раздел «Данные» проекта) и пересылает в Telegram.
- Токен бота и chat id заданы в Amvera → «Переменные» (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), в репозиторий их не добавлять.
- В `site/site.config.js` у формы должно оставаться `demoMode: false` и `endpoint: "/api/lead"`.
- Не удалять `server.mjs`, `package.json`, `amvera.yml`. Папка `netlify/` и `netlify.toml` не используются.
- Локально форму можно проверить так: `PORT=8080 LEADS_FILE=/tmp/leads.jsonl node server.mjs` и открыть http://localhost:8080 (без переменных Telegram заявка только запишется в файл).

## Проверка перед запуском

- из Китая: https://www.itdog.cn/http/ и https://www.17ce.com, плюс живая проверка в Гуанчжоу без VPN (Safari/Chrome, браузер Telegram, браузер WeChat);
- из России: https://check-host.net;
- вкладка Network в браузере: ни одного запроса к Google и внешним CDN;
- превью ссылки в Telegram;
- весь китайский текст проверяет преподаватель. Сейчас на сайте: 你好, 谢谢, 朋友, 学习, 广州, 鹅, 住 zhù, 搬家 bānjiā, 合作 hézuò, 奶茶, 地铁, 招牌, 发消息, 女 + 子 = 好 (с объяснением), 套餐一/二/三/四 (tàocān yī/èr/sān/sì), 快递单, 广州塔, 莫斯科.

## Заглушки, которые нужно заменить

Telegram (@naidenovaann), WeChat (henhaoschool, QR), e-mail hellohenhaoschool@gmail.com и домен henhaoschool.ru уже настоящие. Осталось проверить текст политики конфиденциальности (`site/privacy.html`). Описания уровней HSK1–3 в трекинге (`track` в конфиге) — ориентировочные, проверить у преподавателя.
