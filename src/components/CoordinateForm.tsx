import type { State } from "../logic/jarvis";
import type { useJarvis } from "../hooks/useJarvis";
import { request } from "../lib/api";
import { Arrow } from "./Icons";
export default function CoordinateForm({
  panel,
}: {
  panel: ReturnType<typeof useJarvis>;
}) {
  const {
    dirty,
    busy,
    valid,
    run,
    save,
    setNotice,
    form,
    markDirty,
    setForm,
    settings,
    setSettings,
    dirtyRef,
    setDirty,
    refresh,
  } = panel;
  return (
    <section className="form-panel">
      <div className="section-heading">
        <h1>Расчёт</h1>
        <span>{dirty ? "Не сохранён" : "Общая сессия"}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await save();
            setNotice("Координаты применены для Discord и веб-панели.");
          });
        }}
      >
        {(
          [
            ["Орудие", "ax", "ay"],
            ["Цель", "tx", "ty"],
          ] as const
        ).map(([label, x, y]) => (
          <fieldset key={label}>
            <legend>
              <span
                className={`position-dot ${label === "Цель" ? "target" : ""}`}
              />
              {label}
            </legend>
            <div className="xy">
              {([x, y] as const).map((key, i) => (
                <label key={key}>
                  {i === 0 ? "X" : "Y"}
                  <input
                    aria-label={`${label} ${i === 0 ? "X" : "Y"}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="—"
                    value={form[key]}
                    onChange={(e) => {
                      markDirty();
                      setForm({ ...form, [key]: e.target.value });
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="field-label" htmlFor="weapon">
          Оружие
        </label>
        <select
          id="weapon"
          value={settings.weaponId}
          onChange={(e) => {
            markDirty();
            setSettings({
              ...settings,
              weaponId: e.target.value as State["weaponId"],
            });
          }}
        >
          <option value="mortar">Миномёт</option>
          <option value="spg">САУ · SPH-2</option>
        </select>
        <div className="trajectory">
          <span className="field-label">Траектория</span>
          <div className="segmented">
            {(["high", "low"] as const).map((arc) => (
              <button
                key={arc}
                type="button"
                aria-pressed={settings.arc === arc}
                disabled={settings.weaponId === "mortar"}
                className={settings.arc === arc ? "selected" : ""}
                onClick={() => {
                  markDirty();
                  setSettings({ ...settings, arc });
                }}
              >
                {arc === "high" ? "Высокая" : "Низкая"}
              </button>
            ))}
          </div>
          <small>
            {settings.weaponId === "mortar"
              ? "У миномёта одна траектория"
              : "Траектории из исходной игровой таблицы"}
          </small>
        </div>
        <div className="form-actions">
          <button className="primary" disabled={!dirty || busy || !valid}>
            Применить <Arrow />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await request("command", { text: "сброс" });
                dirtyRef.current = false;
                setDirty(false);
                await refresh();
                setNotice("Координаты сброшены.");
              })
            }
          >
            Сбросить
          </button>
        </div>
        {dirty ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              dirtyRef.current = false;
              setDirty(false);
              void refresh();
            }}
          >
            Отменить изменения
          </button>
        ) : null}
      </form>
    </section>
  );
}
