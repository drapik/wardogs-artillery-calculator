import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JarvisBot } from "../server/discord.ts";
import { Store } from "../server/store.ts";
import { execute, initialState } from "../src/logic/jarvis.ts";

test("help is delivered as text with a short spoken acknowledgment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-help-"));
  const bot = new JarvisBot(new Store(dir), () => "");
  const spoken: string[] = [];
  const posted: string[] = [];
  bot.say = async (text) => {
    spoken.push(text);
  };
  try {
    await bot.effect(
      execute(initialState(), "Джарвис, помощь"),
      async (text) => {
        posted.push(text);
      },
    );
    assert.equal(posted.length, 1);
    assert.match(posted[0], /Орудие/);
    assert.match(posted[0], /САУ/);
    assert.match(posted[0], /Веб-панель/);
    assert.ok(posted[0].length <= 2000, "Discord message length limit");
    assert.deepEqual(spoken, ["Команды отправил в чат."]);
  } finally {
    await bot.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed text delivery never reads the command list or claims success", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-help-"));
  const bot = new JarvisBot(new Store(dir), () => "");
  const spoken: string[] = [];
  bot.say = async (text) => {
    spoken.push(text);
  };
  try {
    await bot.effect(execute(initialState(), "команды"), async () => {
      throw new Error("Missing permissions");
    });
    assert.deepEqual(spoken, ["Не могу написать в чат. Проверьте мои права."]);
    assert.match(bot.status.lastError ?? "", /текстовый чат/);
  } finally {
    await bot.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
