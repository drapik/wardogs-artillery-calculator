import type { State } from "../logic/jarvis";
export default function CoordinatePlot({ state }: { state: State }) {
  const points = [state.artillery, state.target].filter((p) => p !== null);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const left = points.length ? Math.min(...xs) : 0,
    right = points.length ? Math.max(...xs) : 8;
  const bottom = points.length ? Math.min(...ys) : 0,
    top = points.length ? Math.max(...ys) : 8;
  // Equal pixels per coordinate unit keeps the plotted direction true to the azimuth.
  const scale = Math.min(
    460 / Math.max(8, right - left),
    160 / Math.max(8, top - bottom),
  );
  const spanX = 560 / scale,
    spanY = 230 / scale;
  const minX = (left + right - spanX) / 2,
    minY = (bottom + top - spanY) / 2;
  const px = (x: number) => 55 + (x - minX) * scale,
    py = (y: number) => 275 - (y - minY) * scale;
  const a = state.artillery,
    t = state.target;
  return (
    <div className="plot">
      <svg
        viewBox="0 0 670 320"
        role="img"
        aria-label="Координаты орудия и цели. Север сверху, восток справа."
      >
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <path
              d={`M ${55 + i * 70} 35 V 275 M 55 ${45 + i * 28.75} H 615`}
              stroke="var(--grid)"
            />
            <text x={55 + i * 70} y="301" textAnchor="middle">
              {(minX + (spanX * i) / 8).toFixed(1)}
            </text>
            {i % 2 === 0 ? (
              <text x="42" y={279 - i * 28.75} textAnchor="end">
                {(minY + (spanY * i) / 8).toFixed(1)}
              </text>
            ) : null}
          </g>
        ))}
        <text x="628" y="301">
          X
        </text>
        <text x="33" y="25">
          Y / С
        </text>
        {a && t ? (
          <path
            d={`M ${px(a.x)} ${py(a.y)} L ${px(t.x)} ${py(t.y)}`}
            stroke="var(--accent)"
            strokeWidth="1.7"
            strokeDasharray="5 5"
          />
        ) : null}
        {a ? (
          <g>
            <circle
              cx={px(a.x)}
              cy={py(a.y)}
              r="8"
              fill="var(--accent)"
              fillOpacity=".15"
              stroke="var(--accent)"
            />
            <circle cx={px(a.x)} cy={py(a.y)} r="3" fill="var(--accent)" />
            <text className="plot-label" x={px(a.x) + 14} y={py(a.y) + 22}>
              Орудие
            </text>
          </g>
        ) : null}
        {t ? (
          <g>
            <circle cx={px(t.x)} cy={py(t.y)} r="5" fill="var(--text)" />
            <text
              className="plot-label"
              x={px(t.x) - 12}
              y={py(t.y) - 14}
              textAnchor="end"
            >
              Цель
            </text>
          </g>
        ) : null}
        {!points.length ? (
          <text x="335" y="160" textAnchor="middle" className="plot-empty">
            Задай координаты — здесь появится направление
          </text>
        ) : null}
      </svg>
    </div>
  );
}
