import { useJarvis } from "./hooks/useJarvis";
import { request } from "./lib/api";
import { Arrow } from "./components/Icons";
import CoordinateForm from "./components/CoordinateForm";
import SolutionPanel from "./components/SolutionPanel";
import Help from "./components/Help";
export default function App() {
  const panel = useJarvis();
  const {
    connected,
    snap,
    auth,
    token,
    busy,
    notice,
    run,
    setToken,
    setNotice,
    refresh,
    command,
    save,
    setCommand,
    health,
    setSnap,
    setAuth,
  } = panel;
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/">
          Джарвис<span>WARDOGS</span>
        </a>
        <div className={`connection ${connected ? "online" : ""}`}>
          <i />
          {connected
            ? `В канале ${snap?.discord.channel}`
            : snap?.discord.ready
              ? "Discord · на связи"
              : "Discord не подключён"}
        </div>
      </header>
      {auth === "loading" ? (
        <main className="login">
          <h1>Подключаюсь к панели…</h1>
        </main>
      ) : auth === "login" ? (
        <main className="login">
          <p className="intro">Расчёт по голосу. Или в пару кликов.</p>
          <h1>Джарвис на связи.</h1>
          <p>
            Открой личную ссылку из команды <code>/jarvis команда: панель</code>{" "}
            в Discord или введи код доступа.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request("login", { token });
                setToken("");
                setNotice("");
                await refresh();
              });
            }}
          >
            <label htmlFor="token">Код доступа</label>
            <input
              id="token"
              type="password"
              value={token}
              autoComplete="current-password"
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <button className="primary" disabled={busy}>
              Открыть панель <Arrow />
            </button>
          </form>
          <p className="notice" role="status">
            {notice}
          </p>
        </main>
      ) : (
        <main>
          <div className="workspace">
            <CoordinateForm panel={panel} />
            <SolutionPanel panel={panel} />
          </div>
          <section className="command-panel">
            <label htmlFor="command">Команда Джарвису</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await save();
                  const result = await request<{ reply: string }>("command", {
                    text: command,
                  });
                  setNotice(result.reply);
                  setCommand("");
                  await refresh();
                });
              }}
            >
              <input
                id="command"
                value={command}
                maxLength={400}
                placeholder="Цель икс 48 игрек 36"
                onChange={(e) => setCommand(e.target.value)}
              />
              <button className="primary" disabled={busy || !command.trim()}>
                Отправить <Arrow />
              </button>
            </form>
            <p>
              «Джарвис, орудие икс 45 игрек 32»<span>«Джарвис, рассчитай»</span>
            </p>
          </section>
          <div className="notice" role="status">
            {notice}
          </div>
          {snap?.discord.lastError ? (
            <p className="error">{snap.discord.lastError}</p>
          ) : null}
          <Help />
          {snap?.history.length ? (
            <section className="history">
              <h2>Последние команды</h2>
              {snap.history.slice(0, 5).map((item, i) => (
                <div key={`${item.at}-${i}`}>
                  <time>
                    {new Date(item.at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="history-source">{item.source}</span>
                  <div>
                    <p>{item.command || "Джарвис"}</p>
                    <small>{item.reply}</small>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          <footer>
            <span>
              {health
                ? `Распознавание ${health.asr ? "готово" : "недоступно"} · Голос ${health.tts ? "готов" : "недоступен"}`
                : "Проверка голосовых сервисов…"}
            </span>
            <div>
              {connected ? (
                <button
                  className="text-button"
                  onClick={() =>
                    void run(async () => {
                      await request("leave", {});
                      await refresh();
                    })
                  }
                >
                  Отключить от канала
                </button>
              ) : null}
              <a
                href="https://stiffi136.github.io/wardogs-artillery-calculator/"
                target="_blank"
                rel="noreferrer"
              >
                Исходный калькулятор
              </a>
              <button
                className="text-button"
                onClick={() =>
                  void run(async () => {
                    await request("logout", {});
                    setSnap(null);
                    setAuth("login");
                  })
                }
              >
                Выйти
              </button>
            </div>
          </footer>
        </main>
      )}
    </div>
  );
}
