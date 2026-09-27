import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config, requireConfig } from './config.js';
import { Recorder } from './recorder.js';
import { createMinutes } from './minutes.js';
import { splitDiscordMessages } from './messages.js';

requireConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const sessions = new Map();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'start') {
      await handleStart(interaction);
      return;
    }

    if (interaction.commandName === 'stop') {
      await handleStop(interaction);
    }
  } catch (error) {
    console.error(error);
    const content = `エラーが発生しました: ${error.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
});

async function handleStart(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: '先に録音したいVCへ参加してください。', ephemeral: true });
    return;
  }

  if (sessions.has(interaction.guildId)) {
    await interaction.reply({ content: 'このサーバーでは既に録音中です。`/stop`で終了できます。', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const textChannel = await getMinutesChannel(interaction);
  const recorder = new Recorder({
    guild: interaction.guild,
    voiceChannel,
    textChannel,
    startedBy: interaction.user
  });

  await recorder.start();
  sessions.set(interaction.guildId, recorder);

  await interaction.editReply(`録音を開始しました: ${voiceChannel.name}`);
  await textChannel.send('🔴 この通話は議事録作成のため録音・文字起こしされます。終了するには `/stop` を実行してください。');
}

async function handleStop(interaction) {
  const recorder = sessions.get(interaction.guildId);

  if (!recorder) {
    await interaction.reply({ content: '現在録音中のVCはありません。', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  sessions.delete(interaction.guildId);

  const result = await recorder.stop();
  await interaction.editReply('録音を停止しました。文字起こしと議事録を作成しています。');

  const minutes = await createMinutes(result);
  const targetChannel = recorder.textChannel;
  for (const message of splitDiscordMessages(minutes)) {
    await targetChannel.send(message);
  }

  await interaction.followUp('議事録を投稿しました。');
}

async function getMinutesChannel(interaction) {
  if (config.minutesChannelId) {
    const channel = await interaction.guild.channels.fetch(config.minutesChannelId);
    if (!channel?.isTextBased()) {
      throw new Error('MINUTES_CHANNEL_ID がテキストチャンネルではありません。');
    }
    return channel;
  }

  return interaction.channel;
}

client.login(config.token);
