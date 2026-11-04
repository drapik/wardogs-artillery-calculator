import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("authenticated HTTP flow, origin protection, validation, conflicts and isolation from speech", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-http-"));
  const token = "a-local-test-secret-that-is-never-used-in-deployment";
  const port = 31980 + Math.floor(Math.random() * 100),
    base = `http://localhost:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        PUBLIC_URL: base,
        PANEL_TOKEN: token,
        DATA_DIR: dir,
        DISCORD_TOKEN: "",
        DISCORD_GUILD_ID: "",
      },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(base + "/healthz")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready, "server is ready");
    assert.equal((await fetch(base + "/api/state")).status, 401);
    const post = (path: string, body: unknown, cookie = "") =>
      fetch(base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: base,
        },
        body: JSON.stringify(body),
      });
    assert.equal((await post("/api/login", { token: "wrong" })).status, 401);
    const login = await post("/api/login", { token });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: base,
    };
    const before = await (await fetch(base + "/api/state", { headers })).json();
    assert.equal(before.version, 0);
    assert.equal(
      (
        await fetch(base + "/api/command", {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.example" },
          body: JSON.stringify({ text: "цель 5 6" }),
        })
      ).status,
      403,
    );
    const reply = await (
      await post("/api/command", { text: "орудие 45 32 цель 48 36" }, cookie)
    ).json();
    assert.equal(reply.state.target.x, 48);
    assert.match(reply.reply, /500 метров/);
    assert.equal(
      (
        await fetch(base + "/api/state", {
          method: "PUT",
          headers,
          body: JSON.stringify({ state: reply.state, version: 0 }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(base + "/api/state", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            state: { ...reply.state, target: { x: null, y: 1 } },
            version: reply.version,
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (await post("/api/speak", { discord: true }, cookie)).status,
      409,
    );
    assert.equal(
      (await post("/api/command", { text: "цель икс 7" }, cookie)).status,
      200,
    );
    const after = await (await fetch(base + "/api/state", { headers })).json();
    assert.deepEqual(after.state.target, { x: 48, y: 36 });
    assert.equal(after.discord.configured, false);
    await post("/api/logout", {}, cookie);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
