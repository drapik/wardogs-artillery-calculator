import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type SendableChannels,
} from "discord.js";
import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  type VoiceConnection,
} from "@discordjs/voice";
import prism from "prism-media";
import { Readable } from "node:stream";
import {
  removeWake,
  normalizeTranscript,
  type Outcome,
} from "../src/logic/jarvis.ts";
import { Store } from "./store.ts";
import { synthesize, transcribe } from "./speech.ts";
export class JarvisBot {
  client: Client;
  connection: VoiceConnection | null = null;
  status = {
    configured: false,
    ready: false,
    channel: null as string | null,
    listening: false,
    lastError: null as string | null,
  };
  player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
  });
  private wake = new Map<
    string,
    { until: number; pending?: "artillery" | "target" }
  >();
  private audioQueue: Promise<void> = Promise.resolve();
  private queuedAudio = 0;
  private generation = 0;
  private asrQueue: Promise<void> = Promise.resolve();
  private queuedAsr = 0;
  private epoch = 0;
  private streams = new Set<{ destroy: () => unknown }>();
  private replyChannel: SendableChannels | null = null;
  private guildId = process.env.DISCORD_GUILD_ID ?? "";
  constructor(
    private store: Store,
    private panelLink: () => string,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        ...(process.env.DISCORD_MESSAGE_CONTENT === "true"
          ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
          : []),
      ],
    });
    this.player.on("error", () => {
      this.status.lastError = "Ошибка воспроизведения голоса.";
    });
    this.client.on(Events.Error, () => {
      this.status.lastError = "Ошибка соединения Discord.";
    });
    this.client.on(Events.ShardDisconnect, () => {
      this.status.ready = false;
    });
    this.client.on(Events.ShardResume, () => {
      this.status.ready = true;
    });
    this.client.once(Events.ClientReady, async () => {
      this.status.ready = true;
      try {
        const guild = await this.client.guilds.fetch(this.guildId);
        const commands = ["jarvis", "джарвис"].map((name) =>
          new SlashCommandBuilder()
            .setName(name)
            .setDescription("Позвать Джарвиса или выполнить команду")
            .addStringOption((o) =>
              o
                .setName("команда")
                .setDescription(
                  "Цель икс 48 игрек 36 · помощь · панель · уходи",
                ),
            )
            .toJSON(),
        );
        // Upsert only our commands: an existing bot may have unrelated commands.
        await Promise.all(
          commands.map((command) => guild.commands.create(command)),
        );
      } catch {
        this.status.lastError =
          "Не удалось зарегистрировать команды на разрешённом сервере.";
      }
    });
    this.client.on(Events.InteractionCreate, async (i) => {
      if (
        !i.isChatInputCommand() ||
        !["jarvis", "джарвис"].includes(i.commandName)
      )
        return;
      try {
        await i.deferReply({ flags: 64 });
        if (i.guildId !== this.guildId)
          throw new Error("Этот сервер не разрешён.");
        const command = i.options.getString("команда")?.trim() ?? "";
        if (/^(?:панель|panel|web)$/i.test(command)) {
          await i.editReply(
            `Личная ссылка на общую панель (не публикуй её): ${this.panelLink()}`,
          );
          return;
        }
        const member = await i.guild!.members.fetch(i.user.id);
        if (!command || removeWake(command) === "") {
          await this.join(
            member.voice.channel,
            i.channel?.isSendable() ? i.channel : null,
          );
          await i.editReply(
            "Я в голосовом канале. Скажи «Джарвис». Аудио обрабатывается на вашем сервере, записи не сохраняются.",
          );
          return;
        }
        this.checkChannel(member.voice.channelId);
        const result = this.run(command, i.user.id, "Discord");
        await this.effect(result, (text) => i.editReply(text));
        if (result.action !== "help") await i.editReply(result.reply);
      } catch (e) {
        await i
          .editReply(
            e instanceof Error ? e.message : "Не удалось выполнить команду.",
          )
          .catch(() => {});
      }
    });
    this.client.on(Events.MessageCreate, async (m) => {
      if (m.author.bot || m.guildId !== this.guildId) return;
      const text = removeWake(m.content);
      if (text === null) return;
      try {
        const member = await m.guild!.members.fetch(m.author.id);
        if (!this.connection) await this.join(member.voice.channel, m.channel);
        this.checkChannel(member.voice.channelId);
        const result = this.run(text, m.author.id, "Discord");
        const reply = (text: string) =>
          m.reply({
            content: text,
            allowedMentions: { parse: [], repliedUser: false },
          });
        await this.effect(result, reply);
        if (result.action !== "help") await reply(result.reply);
      } catch (e) {
        await m
          .reply({
            content: e instanceof Error ? e.message : "Ошибка команды.",
            allowedMentions: { parse: [], repliedUser: false },
          })
          .catch(() => {});
      }
    });
    this.client.on(Events.VoiceStateUpdate, (_old, next) => {
      if (next.guild.id !== this.guildId || !this.connection) return;
      const channel = next.guild.channels.cache.get(
        this.connection.joinConfig.channelId ?? "",
      );
      if (channel?.isVoiceBased() && !channel.members.some((m) => !m.user.bot))
        this.leave();
    });
  }
  private checkChannel(channelId: string | null) {
    if (this.connection && this.connection.joinConfig.channelId !== channelId)
      throw new Error("Для управления войди в голосовой канал Джарвиса.");
  }
  async start() {
    const token = process.env.DISCORD_TOKEN;
    this.status.configured = Boolean(token && this.guildId);
    if (!this.status.configured) return;
    try {
      await this.client.login(token);
    } catch {
      this.status.lastError =
        "Не удалось авторизовать Discord-бота. Проверь токен и intents.";
    }
  }
  async join(channel: any, replyChannel: SendableChannels | null = null) {
    if (!channel || channel.type !== ChannelType.GuildVoice)
      throw new Error("Сначала войди в обычный голосовой канал.");
    if (channel.guild.id !== this.guildId)
      throw new Error("Этот сервер не разрешён.");
    if (this.connection) {
      if (this.connection.joinConfig.channelId !== channel.id)
        throw new Error("Я уже в другом канале. Сначала отключи меня там.");
      if (replyChannel) this.replyChannel = replyChannel;
      return;
    }
    const me = channel.guild.members.me;
    if (
      !channel
        .permissionsFor(me)
        ?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ])
    )
      throw new Error("Мне нужны права видеть канал, подключаться и говорить.");
    const conn = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    this.connection = conn;
    const epoch = ++this.epoch;
    conn.on("error", () => {
      this.status.lastError = "Ошибка голосового соединения Discord.";
    });
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        if (this.connection === conn) this.leave();
      }
    });
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 20000);
    } catch {
      this.leave();
      throw new Error("Discord не установил голосовое соединение.");
    }
    conn.subscribe(this.player);
    this.replyChannel = replyChannel;
    this.status.channel = channel.name;
    this.status.listening = true;
    this.status.lastError = null;
    conn.receiver.speaking.on("start", (userId) => {
      if (
        epoch !== this.epoch ||
        channel.members.get(userId)?.user.bot ||
        this.queuedAsr >= 3 ||
        this.streams.size >= 8
      )
        return;
      if (conn.receiver.subscriptions.has(userId)) return;
      const opus = conn.receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 650 },
      });
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });
      this.streams.add(opus);
      this.streams.add(decoder);
      let chunks: Buffer[] = [],
        size = 0,
        truncated = false;
      const cutoff = setTimeout(() => {
        truncated = true;
        opus.destroy();
        decoder.destroy();
      }, 16000);
      const cleanup = () => {
        clearTimeout(cutoff);
        this.streams.delete(opus);
        this.streams.delete(decoder);
      };
      decoder.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 48000 * 4 * 15) {
          truncated = true;
          opus.destroy();
          decoder.destroy();
        } else chunks.push(chunk);
      });
      decoder.on("error", () => {
        cleanup();
        opus.destroy();
        this.status.lastError = "Не удалось декодировать входящий голос.";
      });
      opus.on("error", () => {
        cleanup();
        decoder.destroy();
        this.status.lastError = "Ошибка приёма голоса Discord.";
      });
      opus.on("close", cleanup);
      decoder.on("close", cleanup);
      decoder.on("end", () => {
        cleanup();
        if (truncated || epoch !== this.epoch || size < 48000 * 4 * 0.25) {
          chunks = [];
          return;
        }
        const pcm = Buffer.concat(chunks);
        chunks = [];
        this.queuedAsr++;
        this.asrQueue = this.asrQueue
          .then(async () => {
            if (epoch !== this.epoch) return;
            try {
              const transcript = normalizeTranscript(await transcribe(pcm));
              if (epoch !== this.epoch) return;
              const addressed = removeWake(transcript),
                context = this.wake.get(userId);
              if (
                addressed === null &&
                (!context || context.until < Date.now())
              )
                return;
              const result = this.run(addressed ?? transcript, userId, "Голос");
              // Keep ASR responsive while speech is playing, so «стоп» can interrupt it.
              void this.effect(result).catch(() => {
                this.status.lastError =
                  "Не удалось выполнить голосовую команду.";
              });
            } catch (e) {
              this.status.lastError =
                e instanceof Error ? e.message : "Ошибка распознавания.";
            }
          })
          .finally(() => {
            this.queuedAsr--;
          });
      });
      opus.pipe(decoder);
    });
    await this.say("Джарвис на связи. Назовите моё имя, затем команду.");
  }
  private run(text: string, userId: string, source: string): Outcome {
    const old = this.wake.get(userId);
    const active = old && old.until > Date.now();
    const result = this.store.command(
      text,
      source,
      active ? old.pending : undefined,
    );
    this.wake.delete(userId);
    if (!text.trim() || result.pending)
      this.wake.set(userId, {
        until: Date.now() + 15000,
        pending: result.pending,
      });
    return result;
  }
  stop() {
    this.generation++;
    this.player.stop(true);
  }
  leave() {
    this.stop();
    this.epoch++;
    for (const stream of this.streams) stream.destroy();
    this.streams.clear();
    this.connection?.destroy();
    this.connection = null;
    this.replyChannel = null;
    this.wake.clear();
    this.status.channel = null;
    this.status.listening = false;
  }
  async effect(
    result: Outcome,
    helpReply?: (text: string) => Promise<unknown>,
  ) {
    if (result.action === "help") {
      this.stop();
      const channel = this.replyChannel;
      const reply =
        helpReply ??
        (channel
          ? (text: string) =>
              channel.send({
                content: text,
                allowedMentions: { parse: [] },
              })
          : undefined);
      if (!reply) {
        await this.say("Список команд доступен в веб-панели.");
        return;
      }
      try {
        await reply(result.reply);
      } catch {
        this.status.lastError = "Не удалось отправить команды в текстовый чат.";
        await this.say("Не могу написать в чат. Проверьте мои права.");
        return;
      }
      await this.say("Команды отправил в чат.");
      return;
    }
    if (result.action === "stop") {
      this.stop();
      return;
    }
    if (result.action === "leave") {
      await this.say(result.reply);
      this.leave();
      return;
    }
    await this.say(result.reply);
  }
  async say(text: string): Promise<void> {
    if (!this.connection || this.queuedAudio >= 4) return;
    const gen = this.generation;
    this.queuedAudio++;
    const next = this.audioQueue
      .then(async () => {
        if (gen !== this.generation || !this.connection) return;
        try {
          const wav = await synthesize(text);
          if (gen !== this.generation || !this.connection) return;
          const resource = createAudioResource(Readable.from(wav), {
            inlineVolume: true,
          });
          resource.volume?.setVolume(this.store.state.volume);
          this.player.play(resource);
          await entersState(this.player, AudioPlayerStatus.Playing, 5000);
          await entersState(this.player, AudioPlayerStatus.Idle, 45000);
        } catch {
          this.status.lastError =
            "Не удалось озвучить ответ. Текст доступен в панели.";
        }
      })
      .finally(() => {
        this.queuedAudio--;
      });
    this.audioQueue = next;
    return next;
  }
  async close() {
    this.leave();
    await this.client.destroy();
  }
}
