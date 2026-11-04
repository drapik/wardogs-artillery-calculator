import { spawn } from "node:child_process";
const asr = process.env.ASR_URL || "http://host.docker.internal:8765";
const tts = process.env.TTS_URL || "http://piper:8000";
export async function synthesize(text: string): Promise<Buffer> {
  const response = await fetch(`${tts}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 1400) }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("Синтезатор речи недоступен.");
  return Buffer.from(await response.arrayBuffer());
}
export async function transcribe(pcm: Buffer): Promise<string> {
  const wav = await new Promise<Buffer>((resolve, reject) => {
    const p = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-i",
        "pipe:0",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "wav",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => p.kill("SIGKILL"), 10000);
    p.stdout.on("data", (b) => chunks.push(b));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error("Конвертация звука не удалась."));
    });
    p.stdin.on("error", () => {});
    p.stdin.end(pcm);
  });
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    "speech.wav",
  );
  form.append("model", "gigaam-v3-e2e-rnnt");
  form.append("language", "ru");
  const r = await fetch(`${asr}/v1/audio/transcriptions`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Распознавание недоступно (${r.status}).`);
  const result = (await r.json()) as { text?: string };
  return result.text ?? "";
}
export async function speechHealth() {
  const [a, t] = await Promise.allSettled([
    fetch(`${asr}/health/ready`, { signal: AbortSignal.timeout(3000) }),
    fetch(`${tts}/health`, { signal: AbortSignal.timeout(3000) }),
  ]);
  return {
    asr: a.status === "fulfilled" && a.value.ok,
    tts: t.status === "fulfilled" && t.value.ok,
  };
}
