// Принимает заявку с сайта и отправляет её в Telegram.
// Переменные окружения (Netlify → Site configuration → Environment variables):
//   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
//   TELEGRAM_CHAT_ID   — id чата, куда слать заявки
const MODES = { test: "тест на уровень", preorder: "предзапись на интенсив" };

const clean = (v, max = 300) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let d;
  try { d = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  // ловушка для ботов и слишком быстрое заполнение — молча отвечаем «ок»
  if (d.website || Number(d.elapsed) < 3) return Response.json({ ok: true });
  if (!clean(d.name) || !clean(d.contact)) return new Response("Bad Request", { status: 400 });

  const sentAt = new Date(d.sent_at || Date.now());
  const cnTime = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Shanghai", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(sentAt).replace(",", "");

  const utm = ["source", "medium", "campaign", "content"]
    .filter((k) => d["utm_" + k])
    .map((k) => `${k}=${clean(d["utm_" + k], 100)}`)
    .join(" / ");

  const lines = [
    `Новая заявка: ${MODES[d.mode] || MODES.test}`,
    `Имя: ${clean(d.name, 100)}`,
    `Связь: ${clean(d.contact, 120)}`,
    `Уровень: ${clean(d.level)}`,
    d.tariff && `Тариф: ${clean(d.tariff)}`,
    `Время: ${(Array.isArray(d.time) ? d.time : [d.time]).map((t) => clean(t, 60)).join("; ")}`,
    `Часовой пояс: ${clean(d.timezone)}${d.browser_tz ? ` (браузер: ${clean(d.browser_tz, 60)})` : ""}`,
    `Цель: ${clean(d.goal)}`,
    d.source && `Откуда: ${clean(d.source)}`,
    utm && `UTM: ${utm}`,
    `Кнопка: ${clean(d.cta_source, 60)}`,
    `Время заявки: ${cnTime} (Китай)`
  ].filter(Boolean);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  console.log("lead", JSON.stringify(lines)); // копия в логах функции на случай сбоя бота
  if (!token || !chat) return new Response("Bot is not configured", { status: 500 });

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: lines.join("\n"), disable_web_page_preview: true })
  });
  if (!r.ok) return new Response("Telegram error", { status: 502 });
  return Response.json({ ok: true });
};
