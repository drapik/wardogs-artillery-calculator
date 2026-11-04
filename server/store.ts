import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  execute,
  initialState,
  type State,
  type Outcome,
} from "../src/logic/jarvis.ts";
import { validateCoordinates } from "../src/logic/calculator/ArtilleryCalculator.ts";
export function validState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const s = value as State;
  const coords = (v: unknown) =>
    v === null ||
    (!!v &&
      typeof v === "object" &&
      typeof (v as any).x === "number" &&
      typeof (v as any).y === "number" &&
      !validateCoordinates(v as any));
  return (
    coords(s.artillery) &&
    coords(s.target) &&
    ["mortar", "spg"].includes(s.weaponId) &&
    ["high", "low"].includes(s.arc) &&
    Number.isFinite(s.volume) &&
    s.volume >= 0 &&
    s.volume <= 1
  );
}
export class Store {
  state = initialState();
  version = 0;
  history: { at: string; source: string; command: string; reply: string }[] =
    [];
  private file: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "state.json");
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      if (validState(saved)) this.state = saved;
    } catch {
      /* first run */
    }
  }
  save(next: State) {
    if (!validState(next))
      throw new Error("Некорректные координаты или настройки.");
    writeFileSync(this.file + ".tmp", JSON.stringify(next), { mode: 0o600 });
    renameSync(this.file + ".tmp", this.file);
    this.state = next;
    this.version++;
  }
  command(
    text: string,
    source: string,
    pending?: "artillery" | "target",
  ): Outcome {
    const result = execute(this.state, text, pending);
    if (result.state !== this.state) this.save(result.state);
    this.history.unshift({
      at: new Date().toISOString(),
      source,
      command: text,
      reply: result.reply,
    });
    this.history = this.history.slice(0, 20);
    return result;
  }
}
