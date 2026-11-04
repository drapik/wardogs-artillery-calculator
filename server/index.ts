import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { Store, validState } from "./store.ts";
import { JarvisBot } from "./discord.ts";
import { describe, help, solutionFor } from "../src/logic/jarvis.ts";
import { speechHealth, synthesize } from "./speech.ts";
const port = Number(process.env.PORT || 3000),
  publicUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
const secret = process.env.PANEL_TOKEN;
if (!secret || secret.length < 32)
  throw new Error(
    "Set PANEL_TOKEN to a random secret of at least 32 characters.",
  );
const digest = (s: string) => createHash("sha256").update(s).digest();
const cookieValue = digest(`jarvis-session:${secret}`).toString("hex");
const matches = (a: unknown, b: string) =>
  typeof a === "string" && timingSafeEqual(digest(a), digest(b));
const store = new Store(process.env.DATA_DIR || "./data");
const bot = new JarvisBot(
  store,
  () => `${publicUrl}/#token=${encodeURIComponent(secret)}`,
);
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});
app.use(express.json({ limit: "8kb" }), cookieParser());
app.get("/healthz", (_req, res) =>
  res.json({
    status: "ok",
    discord: bot.status.ready
      ? "ready"
      : bot.status.configured
        ? "connecting"
        : "not_configured",
  }),
);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
// The reverse proxy does not forward the real client IP. These are deliberately global limits.
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: () => "global",
    validate: { keyGeneratorIpFallback: false },
  }),
);
app.use("/api", (req, res, next) => {
  if (
    req.method !== "GET" &&
    (req.headers["sec-fetch-site"] === "cross-site" ||
      (req.headers.origin && req.headers.origin !== new URL(publicUrl).origin))
  ) {
    res.status(403).json({ error: "Недопустимый источник запроса." });
    return;
  }
  next();
});
app.post(
  "/api/login",
  rateLimit({
    windowMs: 60000,
    limit: 15,
    keyGenerator: () => "login",
    validate: { keyGeneratorIpFallback: false },
  }),
  (req, res) => {
    if (!matches(req.body?.token, secret)) {
      res.status(401).json({ error: "Неверный код доступа." });
      return;
    }
    res
      .cookie("jarvis", cookieValue, {
        httpOnly: true,
        secure: publicUrl.startsWith("https:"),
        sameSite: "strict",
        maxAge: 30 * 86400000,
        path: "/api",
      })
      .json({ ok: true });
  },
);
app.use("/api", (req, res, next) => {
  if (!matches(req.cookies?.jarvis, cookieValue)) {
    res
      .status(401)
      .json({
        error: "Открой ссылку из команды /jarvis панель или введи код доступа.",
      });
    return;
  }
  next();
});
app.get("/api/state", (_req, res) =>
  res.json({
    state: store.state,
    version: store.version,
    solution: solutionFor(store.state),
    history: store.history,
    discord: bot.status,
    help,
  }),
);
app.get("/api/speech-health", async (_req, res) =>
  res.json(await speechHealth()),
);
app.put("/api/state", (req, res) => {
  if (req.body?.version !== store.version) {
    res
      .status(409)
      .json({ error: "Расчёт уже изменился в Discord. Обнови значения." });
    return;
  }
  if (!validState(req.body?.state)) {
    res
      .status(400)
      .json({ error: "Проверь координаты: допустимы числа от 0 до 10000." });
    return;
  }
  store.save(req.body.state);
  res.json({ state: store.state, version: store.version });
});
app.post("/api/command", async (req, res) => {
  if (typeof req.body?.text !== "string" || req.body.text.length > 400) {
    res
      .status(400)
      .json({ error: "Команда должна содержать до 400 символов." });
    return;
  }
  const result = store.command(req.body.text, "Веб");
  // Web commands update the shared room; speaking is explicit to avoid interrupting a call.
  if (result.action === "leave") bot.leave();
  if (result.action === "stop") bot.stop();
  res.json({ reply: result.reply, state: store.state, version: store.version });
});
app.post("/api/speak", async (req, res) => {
  const text = describe(store.state);
  if (req.body?.discord === true) {
    if (!bot.status.listening) {
      res.status(409).json({ error: "Сначала позови Джарвиса в Discord." });
      return;
    }
    void bot.say(text);
    res.json({ ok: true });
    return;
  }
  try {
    const wav = await synthesize(text);
    res.type("audio/wav").send(wav);
  } catch {
    res
      .status(503)
      .json({ error: "Голос временно недоступен. Расчёт работает." });
  }
});
app.post("/api/leave", (_req, res) => {
  bot.leave();
  res.json({ ok: true });
});
app.post("/api/logout", (_req, res) =>
  res.clearCookie("jarvis", { path: "/api" }).json({ ok: true }),
);
app.use(express.static(resolve("dist"), { index: "index.html", maxAge: "1h" }));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      "Request failed:",
      error instanceof Error ? error.name : "unknown",
    );
    res.status(400).json({ error: "Запрос не выполнен." });
  },
);
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Jarvis listening on ${port}`),
);
void bot.start();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close();
    void bot.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
