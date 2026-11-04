import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calculateArtillery } from "../src/logic/calculator/ArtilleryCalculator.ts";
import {
  execute,
  initialState,
  removeWake,
  parseNumber,
  normalizeTranscript,
  describe,
} from "../src/logic/jarvis.ts";
import { Store, validState } from "../server/store.ts";

test("original distance, north/east azimuth and table interpolation are preserved", () => {
  const s = calculateArtillery({ x: 45, y: 32 }, { x: 48, y: 36 });
  assert.equal(s.distanceMeters, 500);
  assert.ok(Math.abs(s.azimuthDegrees - 36.869897645844) < 1e-8);
  assert.deepEqual(s.elevationSolutions, [{ arc: "single", mil: 461 }]);
  assert.equal(
    calculateArtillery({ x: 0, y: 0 }, { x: 0, y: 3 }).azimuthDegrees,
    0,
  );
  assert.equal(
    calculateArtillery({ x: 0, y: 0 }, { x: 3, y: 0 }).azimuthDegrees,
    90,
  );
  assert.equal(
    calculateArtillery({ x: 1, y: 1 }, { x: 1, y: 1 }).azimuthDegrees,
    0,
  );
});
test("Russian coordinates, decimals, explicit axes and combined position command", () => {
  const s = execute(
    initialState(),
    "Джарвис, орудие икс сорок пять игрек тридцать два, цель икс 48 игрек 36",
  ).state;
  assert.deepEqual(s.artillery, { x: 45, y: 32 });
  assert.deepEqual(s.target, { x: 48, y: 36 });
  assert.deepEqual(execute(s, "Цель x 45,2 y 33.7").state.target, {
    x: 45.2,
    y: 33.7,
  });
  assert.deepEqual(
    execute(s, "цель икс сорок пять точка ноль два игрек тридцать три").state
      .target,
    { x: 45.02, y: 33 },
  );
  assert.deepEqual(execute(s, "икс 42 игрек 30", "artillery").state.artillery, {
    x: 42,
    y: 30,
  });
});
test("partial, out of range, ambiguous and duplicate commands never mutate coordinates", () => {
  const s = execute(initialState(), "орудие 45 32 цель 48 36").state;
  for (const text of [
    "цель икс 65",
    "цель икс 10001 игрек 20",
    "цель икс -1 игрек 20",
    "орудие x 1 y 2 цель x 3",
    "цель x 1 y 2 цель x 3 y 4",
    "цель икс сорок пять шесть игрек два",
    "рассчитай цель x 2 y 3",
  ])
    assert.equal(execute(s, text).state, s, text);
  assert.equal(execute(s, "цель").pending, "target");
});
test("wake word is required at the start and supports a standalone invocation", () => {
  assert.equal(removeWake("Джарвис."), "");
  assert.equal(removeWake("Джарвис, цель 45 32"), "цель 45 32");
  assert.equal(removeWake("эй джарвис рассчитай"), "рассчитай");
  assert.equal(removeWake("я думаю Джарвис ошибся"), null);
  assert.equal(removeWake("джарвисов"), null);
});
test("weapons, arcs, results, reset, stop, leave, volume and help", () => {
  let s = execute(initialState(), "орудие 0 0 цель 20 0").state;
  s = execute(s, "САУ").state;
  assert.equal(s.weaponId, "spg");
  s = execute(s, "низкая траектория").state;
  assert.equal(s.arc, "low");
  assert.match(describe(s), /Прицел/);
  assert.match(describe(execute(s, "цель 50 50").state), /вне дальности/);
  assert.equal(execute(s, "повтори").action, "speak");
  assert.equal(execute(s, "стоп").action, "stop");
  assert.equal(execute(s, "уходи").action, "leave");
  assert.equal(execute(s, "сброс").state.artillery, null);
  assert.equal(execute(s, "сброс").state.target, null);
  assert.ok(execute(s, "громче").state.volume > s.volume);
  assert.match(execute(s, "помощь").reply, /САУ/);
});
test("Russian numbers reject malformed input", () => {
  assert.equal(parseNumber("девять тысяч девятьсот девяносто девять"), 9999);
  assert.equal(parseNumber("десять тысяч"), 10000);
  assert.equal(parseNumber("сорок пять точка три"), 45.3);
  assert.equal(parseNumber("пятьдесят сорок"), null);
  assert.equal(parseNumber("NaN"), null);
});
test("room state is persisted; conversation history is bounded and transient", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-test-"));
  try {
    const store = new Store(dir);
    store.command("орудие 45 32 цель 48 36", "test");
    for (let i = 0; i < 25; i++) store.command("рассчитай", "test");
    assert.equal(store.history.length, 20);
    assert.deepEqual(new Store(dir).state, store.state);
    assert.equal(new Store(dir).history.length, 0);
    assert.equal(store.version, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("API validation rejects non-finite numbers, bad states and incomplete coordinates", () => {
  assert.equal(validState(initialState()), true);
  for (const value of [
    null,
    {},
    { ...initialState(), artillery: {} },
    { ...initialState(), target: { x: null, y: 3 } },
    { ...initialState(), target: { x: Infinity, y: 3 } },
    { ...initialState(), volume: 2 },
    { ...initialState(), weaponId: "unknown" },
  ])
    assert.equal(validState(value), false);
});

test("real GigaAM punctuation and axis substitutions are repaired only for ASR", () => {
  const transcript = "Джарвис — орудие X45 X32. Цель X48 g36.";
  const s = execute(initialState(), normalizeTranscript(transcript)).state;
  assert.deepEqual(s.artillery, { x: 45, y: 32 });
  assert.deepEqual(s.target, { x: 48, y: 36 });
  const clean = initialState();
  assert.equal(execute(clean, "цель x45 x32").state, clean);
  assert.equal(
    execute(clean, normalizeTranscript("Джарвис цель X45")).state,
    clean,
  );
});
