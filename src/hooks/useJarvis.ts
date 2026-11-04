import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, solutionFor, type State } from "../logic/jarvis";

type Snapshot = {
  state: State;
  version: number;
  history: { at: string; source: string; command: string; reply: string }[];
  discord: {
    configured: boolean;
    ready: boolean;
    channel: string | null;
    listening: boolean;
    lastError: string | null;
  };
};
type Form = { ax: string; ay: string; tx: string; ty: string };
const toForm = (s: State): Form => ({
  ax: s.artillery?.x.toString() ?? "",
  ay: s.artillery?.y.toString() ?? "",
  tx: s.target?.x.toString() ?? "",
  ty: s.target?.y.toString() ?? "",
});
const num = (s: string) =>
  s.trim() === "" ? NaN : Number(s.replace(",", "."));
import { request } from "../lib/api";
export function useJarvis() {
  const [snap, setSnap] = useState<Snapshot | null>(null),
    [auth, setAuth] = useState<"loading" | "login" | "ready">("loading");
  const [token, setToken] = useState(""),
    [form, setForm] = useState<Form>(toForm(initialState())),
    [settings, setSettings] = useState(initialState());
  const [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false),
    version = useRef(0);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [command, setCommand] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false),
    audio = useRef<HTMLAudioElement | null>(null),
    audioUrl = useRef("");
  const [health, setHealth] = useState<{ asr: boolean; tts: boolean } | null>(
    null,
  );
  const refresh = useCallback(async () => {
    try {
      const data = await request<Snapshot>("state");
      setSnap(data);
      setAuth("ready");
      if (!dirtyRef.current) {
        setForm(toForm(data.state));
        setSettings(data.state);
        version.current = data.version;
      }
    } catch (e) {
      if ((e as { status?: number }).status === 401) setAuth("login");
      else
        setNotice("Связь с сервером потеряна. Изменения пока не отправлены.");
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fragment = new URLSearchParams(location.hash.slice(1)),
        key = fragment.get("token");
      if (key) {
        history.replaceState(null, "", location.pathname);
        try {
          await request("login", { token: key });
        } catch (e) {
          setNotice((e as Error).message);
        }
      }
      if (!cancelled) await refresh();
    })();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (auth === "ready")
      void request<{ asr: boolean; tts: boolean }>("speech-health")
        .then(setHealth)
        .catch(() => setHealth(null));
  }, [auth]);
  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    setNotice("");
  }
  const coords = (x: string, y: string) =>
    x.trim() === "" && y.trim() === "" ? null : { x: num(x), y: num(y) };
  const draft: State = {
    ...settings,
    artillery: coords(form.ax, form.ay),
    target: coords(form.tx, form.ty),
  };
  const valid = [draft.artillery, draft.target].every(
    (p) =>
      p === null ||
      [p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 10000),
  );
  const solution = valid ? solutionFor(draft) : null;
  const elevation = solution?.elevationSolutions.find(
    (e) => e.arc === "single" || e.arc === draft.arc,
  );
  async function save() {
    if (!valid)
      throw new Error(
        "Заполни обе координаты каждой позиции числами от 0 до 10000.",
      );
    if (!dirtyRef.current) return;
    const r = await request<{ version: number }>(
      "state",
      { state: draft, version: version.current },
      "PUT",
    );
    version.current = r.version;
    dirtyRef.current = false;
    setDirty(false);
    await refresh();
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function speak(discord = false) {
    setVoiceBusy(true);
    try {
      await save();
      if (discord) {
        await request("speak", { discord: true });
        setNotice("Результат отправлен в голосовой канал.");
        return;
      }
      audio.current?.pause();
      const r = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error("Голос временно недоступен.");
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(await r.blob());
      const player = new Audio(audioUrl.current);
      player.volume = settings.volume;
      audio.current = player;
      await player.play();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  }
  const connected = snap?.discord.listening;
  return {
    snap,
    setSnap,
    auth,
    setAuth,
    token,
    setToken,
    form,
    setForm,
    settings,
    setSettings,
    dirty,
    setDirty,
    dirtyRef,
    busy,
    notice,
    setNotice,
    command,
    setCommand,
    voiceBusy,
    health,
    refresh,
    markDirty,
    draft,
    valid,
    solution,
    elevation,
    save,
    run,
    speak,
    connected,
  };
}
