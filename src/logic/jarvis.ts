import {
  calculateArtillery,
  validateCoordinates,
  type Coordinates,
  type WeaponId,
} from "./calculator/ArtilleryCalculator";

export type Arc = "high" | "low";
export type State = {
  artillery: Coordinates | null;
  target: Coordinates | null;
  weaponId: WeaponId;
  arc: Arc;
  volume: number;
};
export const initialState = (): State => ({
  artillery: null,
  target: null,
  weaponId: "mortar",
  arc: "high",
  volume: 0.8,
});
export type Outcome = {
  state: State;
  reply: string;
  action?: "leave" | "stop" | "speak" | "help";
  pending?: "artillery" | "target";
};
export const help = [
  "**Прапорщик Джарвис — команды WARDOGS**",
  "",
  "**Вызов:** `/jarvis` или `/джарвис` в чате, когда ты в голосовом канале.",
  "**Голос:** начни фразу со слова «Джарвис».",
  "",
  "• **Орудие:** «Джарвис, орудие икс 45 игрек 32»",
  "• **Цель:** «Джарвис, цель икс 48 игрек 36»",
  "• **Оружие:** «Джарвис, миномёт» / «Джарвис, САУ»",
  "• **Траектория САУ:** «Джарвис, высокая траектория» / «низкая траектория»",
  "• **Результат:** «Джарвис, рассчитай» / «повтори»",
  "• **Очистить координаты:** «Джарвис, сброс»",
  "• **Громкость:** «Джарвис, тише» / «громче»",
  "• **Прервать речь:** «Джарвис, стоп»",
  "• **Выйти из канала:** «Джарвис, уходи»",
  "• **Эта памятка:** «Джарвис, помощь» / «команды»",
  "",
  "**Без микрофона:** `/jarvis команда: цель икс 48 игрек 36`.",
  "**Веб-панель:** `/jarvis команда: панель` — личная ссылка придёт только тебе.",
  "",
  "Можно сказать «Джарвис», дождаться ответа и назвать команду в течение 15 секунд. Орудие и цель можно передать одной фразой.",
].join("\n");
export function solutionFor(state: State) {
  if (!state.artillery || !state.target) return null;
  return calculateArtillery(state.artillery, state.target, state.weaponId);
}
export function describe(state: State): string {
  const s = solutionFor(state);
  if (!s) return "Назови координаты орудия и цели: икс, затем игрек.";
  const elevation = s.elevationSolutions.find(
    (v) => v.arc === "single" || v.arc === state.arc,
  );
  const direction = s.azimuthDegrees.toFixed(1).replace(".", ",");
  return `Дальность ${Math.round(s.distanceMeters)} метров. Азимут ${direction} градусов. ${elevation ? `Прицел ${elevation.mil} мил.${elevation.arc !== "single" ? ` ${state.arc === "high" ? "Высокая" : "Низкая"} траектория.` : ""}` : "Цель вне дальности выбранного оружия или траектории."}`;
}
const numberWords: Record<string, number> = {
  ноль: 0,
  нуль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,
};
export function parseNumber(raw: string): number | null {
  let value = raw
    .trim()
    .replace(/^(?:равно|равен|координата)\s+/, "")
    .replace(/[.!?;:]$/, "")
    .trim();
  if (/^-?\d+(?:[.,]\d+)?$/.test(value)) return Number(value.replace(",", "."));
  const decimal = value.split(/\s+(?:точка|запятая|целых|целая)\s+/);
  if (decimal.length === 2) {
    const integer = parseNumber(decimal[0]);
    const fractionTokens = decimal[1].trim().split(/\s+/);
    const fraction = fractionTokens.every(
      (t) => numberWords[t] !== undefined && numberWords[t] < 10,
    )
      ? fractionTokens.map((t) => numberWords[t]).join("")
      : String(parseNumber(decimal[1]) ?? "");
    if (integer === null || !/^\d+$/.test(fraction)) return null;
    return Number(`${integer}.${fraction}`);
  }
  let total = 0,
    part = 0,
    previous = Infinity,
    found = false;
  for (const word of value.split(/\s+/)) {
    if (["тысяча", "тысячи", "тысяч"].includes(word)) {
      total += (part || 1) * 1000;
      part = 0;
      previous = Infinity;
      found = true;
      continue;
    }
    const n = numberWords[word];
    if (
      n === undefined ||
      (found &&
        Number.isFinite(previous) &&
        (n >= previous ||
          (previous >= 100 && n >= 100) ||
          (previous < 100 && previous >= 20 && n >= 10) ||
          previous < 20))
    )
      return null;
    part += n;
    previous = n;
    found = true;
  }
  return found ? total + part : null;
}
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/[—–]/g, " ")
    .replace(/[«»"!?]/g, "")
    .trim();
}
// GigaAM may render spoken «игрек» as X or g. Repair only complete numeric
// axis pairs in ASR output; typed commands keep strict, unambiguous axes.
export function normalizeTranscript(raw: string): string {
  return normalize(raw).replace(
    /([xх]\s*-?\d+(?:[.,]\d+)?)\s+[xхg]\s*(-?\d+(?:[.,]\d+)?)/gu,
    "$1 y$2",
  );
}
export function removeWake(text: string): string | null {
  const match = normalize(text).match(
    /^(?:эй\s+)?(?:джарвис|джервис|джарвиз|jarvis)(?:[\s,.:;-]+|$)(.*)$/u,
  );
  return match ? match[1].trim() : null;
}
function pair(text: string): Coordinates | null {
  const axes = text
    .trim()
    .match(
      /^(?:координаты\s+)?(?:x|х|икс)\s*[:=]?\s*(.+?)\s*[,;]?\s*(?:y|у|игрек|игрик)\s*[:=]?\s*(.+?)\s*[.,;]?$/u,
    );
  let x: number | null, y: number | null;
  if (axes) {
    x = parseNumber(axes[1]);
    y = parseNumber(axes[2]);
  } else {
    const plain = text
      .trim()
      .match(/^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s*[.;]?$/);
    if (!plain) return null;
    x = parseNumber(plain[1]);
    y = parseNumber(plain[2]);
  }
  return x === null || y === null || validateCoordinates({ x, y })
    ? null
    : { x, y };
}
export function execute(
  state: State,
  raw: string,
  pending?: "artillery" | "target",
): Outcome {
  const text = (removeWake(raw) ?? normalize(raw))
    .replace(/[.,;]+$/, "")
    .trim();
  const out = (reply: string, extra: Partial<Outcome> = {}): Outcome => ({
    state,
    reply,
    ...extra,
  });
  if (!text) return out("Слушаю. Назови команду.");
  if (/^(?:помощь|команды|help|что ты умеешь)$/.test(text))
    return out(help, { action: "help" });
  if (/^(?:уходи|отключись|выйди|пока|leave)$/.test(text))
    return out("Отключаюсь. До связи.", { action: "leave" });
  if (/^(?:стоп|замолчи|тишина|stop)$/.test(text))
    return out("Озвучка остановлена. Слушаю «Джарвис».", { action: "stop" });
  if (/^(?:сброс|сбрось|сбросить|очисти|reset)$/.test(text))
    return out("Координаты сброшены.", {
      state: { ...state, artillery: null, target: null },
    });
  if (
    /^(?:рассчитай|расчет|рассчитать|считай|результат|повтори|повтор|озвучь|прочитай|calculate|result|read)$/.test(
      text,
    )
  )
    return out(describe(state), { action: "speak" });
  if (/^(?:тише|громче)$/.test(text)) {
    const next = {
      ...state,
      volume: Math.max(
        0.1,
        Math.min(1, state.volume + (text === "тише" ? -0.1 : 0.1)),
      ),
    };
    return out(`Громкость ${Math.round(next.volume * 100)} процентов.`, {
      state: next,
    });
  }
  const weapon = text.match(
    /^(?:(?:выбери|оружие|переключи на)\s+)?(миномет|mortar|сау|spg|sph[- ]?2|эс пэ аш два)$/,
  );
  if (weapon) {
    const next: State = {
      ...state,
      weaponId: /миномет|mortar/.test(weapon[1]) ? "mortar" : "spg",
    };
    return out(
      `${next.weaponId === "mortar" ? "Миномёт" : "САУ SPH-2"}. ${describe(next)}`,
      { state: next },
    );
  }
  const arc = text.match(
    /^(?:(?:выбери|траектория)\s+)?(высокая|низкая|высокую|низкую|high|low)(?:\s+траектори[яю])?$/,
  );
  if (arc) {
    const next: State = {
      ...state,
      arc: /высок|high/.test(arc[1]) ? "high" : "low",
    };
    return out(
      `${next.arc === "high" ? "Высокая" : "Низкая"} траектория. ${state.weaponId === "mortar" ? "У миномёта одна траектория." : describe(next)}`,
      { state: next },
    );
  }
  const subject =
    /(?:^|[\s,;])(?<subject>орудие|артиллерия|пушка|миномет|цель|target|artillery|gun)(?=[\s,:;]|$)[\s,:;]*/gu;
  const matches = [...text.matchAll(subject)];
  if (matches.length) {
    if (matches.length > 2 || text.slice(0, matches[0].index).trim())
      return out("Не понял команду. Скажи «помощь» для примеров.");
    let next = { ...state };
    let seen = new Set<string>();
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const key = /цель|target/.test(m.groups!.subject)
        ? "target"
        : "artillery";
      if (seen.has(key))
        return out("Укажи одну пару координат для каждой позиции.");
      seen.add(key);
      const part = text
        .slice(m.index! + m[0].length, matches[i + 1]?.index ?? text.length)
        .replace(/[\s,;]+$/, "");
      if (!part && matches.length === 1)
        return out(
          `Назови икс и игрек ${key === "target" ? "цели" : "орудия"}.`,
          { pending: key },
        );
      const coordinates = pair(part);
      if (!coordinates)
        return out(
          "Нужна полная пара координат от 0 до 10000: икс 45, игрек 32. Ничего не изменено.",
        );
      next = { ...next, [key]: coordinates };
    }
    return out(describe(next), { state: next });
  }
  const coordinates = pair(text);
  if (coordinates) {
    const next = { ...state, [pending ?? "target"]: coordinates };
    return out(describe(next), { state: next });
  }
  return out(
    "Не понял команду. Скажи «Джарвис, помощь» или укажи икс и игрек.",
  );
}
