import { initialState } from "../logic/jarvis";
import type { useJarvis } from "../hooks/useJarvis";
import CoordinatePlot from "./CoordinatePlot";
import { Speaker } from "./Icons";
const format = (n: number, digits = 0) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
export default function SolutionPanel({
  panel,
}: {
  panel: ReturnType<typeof useJarvis>;
}) {
  const {
    dirty,
    solution,
    elevation,
    valid,
    draft,
    voiceBusy,
    busy,
    speak,
    connected,
    settings,
    markDirty,
    setSettings,
  } = panel;
  return (
    <section className="solution-panel">
      <div className="section-heading">
        <h2>Решение</h2>
        <span>{dirty ? "Предпросмотр" : "Синхронизировано"}</span>
      </div>
      <div className="metrics">
        <div>
          <span>Дальность</span>
          <strong>
            {solution ? format(solution.distanceMeters) : "—"}
            <em> м</em>
          </strong>
        </div>
        <div>
          <span>Азимут</span>
          <strong>
            {solution ? format(solution.azimuthDegrees, 2) : "—"}
            <em>°</em>
          </strong>
        </div>
      </div>
      <div
        className={`elevation ${solution && !elevation ? "out-of-range" : ""}`}
      >
        <span>
          {!valid ? (
            "Проверь координаты"
          ) : !solution ? (
            "Задай позицию орудия и цель"
          ) : elevation ? (
            <>
              Прицел <b>{elevation.mil}</b> мил
            </>
          ) : (
            "Вне дальности оружия / траектории"
          )}
        </span>
        {solution ? (
          <small>
            ΔX {format(solution.deltaX, 2)} · ΔY {format(solution.deltaY, 2)}
          </small>
        ) : null}
      </div>
      <CoordinatePlot state={valid ? draft : initialState()} />
      <div className="playback">
        <button
          disabled={!solution || voiceBusy || busy}
          onClick={() => void speak()}
        >
          <Speaker />
          {voiceBusy ? "Готовлю голос…" : "Озвучить"}
        </button>
        <button
          disabled={!connected || !solution || voiceBusy || busy}
          onClick={() => void speak(true)}
        >
          Сказать в Discord
        </button>
        <label>
          Громкость
          <input
            aria-label="Громкость"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.volume}
            onChange={(e) => {
              markDirty();
              setSettings({
                ...settings,
                volume: Number(e.target.value),
              });
            }}
          />
        </label>
      </div>
    </section>
  );
}
