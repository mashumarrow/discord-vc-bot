import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { EndBehaviorType, entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import prism from 'prism-media';

export class Recorder {
  constructor({ guild, voiceChannel, textChannel, startedBy }) {
    this.guild = guild;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    this.startedBy = startedBy;
    this.startedAt = Date.now();
    this.connection = null;
    this.sessionDir = null;
    this.segments = [];
    this.activeUsers = new Set();
    this.pending = new Set();
  }

  async start() {
    this.sessionDir = path.resolve('recordings', new Date(this.startedAt).toISOString().replace(/[:.]/g, '-'));
    await fs.promises.mkdir(this.sessionDir, { recursive: true });

    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: false
    });

    await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);

    this.connection.receiver.speaking.on('start', (userId) => {
      if (userId === this.guild.members.me?.id) return;
      void this.recordUserUtterance(userId);
    });
  }

  async stop() {
    const connection = getVoiceConnection(this.guild.id);
    connection?.destroy();

    await Promise.allSettled([...this.pending]);

    this.segments.sort((a, b) => a.offsetMs - b.offsetMs);
    return {
      guildName: this.guild.name,
      channelName: this.voiceChannel.name,
      startedAt: new Date(this.startedAt),
      endedAt: new Date(),
      sessionDir: this.sessionDir,
      segments: this.segments
    };
  }

  recordUserUtterance(userId) {
    if (this.activeUsers.has(userId)) return;

    const task = this.captureSegment(userId)
      .catch((error) => console.error(`Failed to record ${userId}:`, error))
      .finally(() => {
        this.activeUsers.delete(userId);
        this.pending.delete(task);
      });

    this.activeUsers.add(userId);
    this.pending.add(task);
  }

  async captureSegment(userId) {
    const member = await this.guild.members.fetch(userId).catch(() => null);
    const displayName = member?.displayName ?? userId;
    const offsetMs = Date.now() - this.startedAt;
    const safeName = displayName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 40);
    const baseName = `${String(this.segments.length + 1).padStart(4, '0')}-${offsetMs}-${userId}-${safeName}`;
    const wavPath = path.join(this.sessionDir, `${baseName}.wav`);

    const opusStream = this.connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1_000
      }
    });

    const decoder = new prism.opus.Decoder({
      frameSize: 960,
      channels: 2,
      rate: 48_000
    });

    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-i',
      'pipe:0',
      '-ac',
      '1',
      '-ar',
      '16000',
      wavPath
    ], { stdio: ['pipe', 'ignore', 'pipe'] });

    let ffmpegError = '';
    ffmpeg.stderr.on('data', (chunk) => {
      ffmpegError += chunk.toString();
    });

    const ffmpegDone = new Promise((resolve, reject) => {
      ffmpeg.once('error', (error) => {
        reject(new Error(`ffmpegを起動できませんでした。FFmpegをインストールしてPATHへ追加してください: ${error.message}`));
      });
      ffmpeg.once('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ffmpeg exited with code ${code}: ${ffmpegError}`));
      });
    });

    await pipeline(opusStream, decoder, ffmpeg.stdin);
    await ffmpegDone;

    const stats = await fs.promises.stat(wavPath);
    if (stats.size <= 44) return;

    this.segments.push({
      userId,
      displayName,
      offsetMs,
      wavPath
    });
  }
}
