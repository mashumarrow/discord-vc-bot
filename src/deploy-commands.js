import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config, requireConfig } from './config.js';

requireConfig();

const commands = [
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('VCの録音と議事録作成を開始します'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('VC録音を停止し、文字起こしと議事録を投稿します')
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

await rest.put(
  Routes.applicationGuildCommands(config.clientId, config.guildId),
  { body: commands }
);

console.log('Registered /start and /stop guild commands.');
