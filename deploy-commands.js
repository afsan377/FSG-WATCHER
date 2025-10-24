const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('gstart').setDescription('Start a giveaway (staff only)')
    .addStringOption(o => o.setName('duration').setDescription('10s/1m/1h/1d').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true))
    .addStringOption(o => o.setName('prize').setDescription('Prize text').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user (admin only)')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addStringOption(o => o.setName('reason')),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user (admin only)')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addStringOption(o => o.setName('reason')),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user (staff+)')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addStringOption(o => o.setName('duration'))
    .addStringOption(o => o.setName('reason')),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user (staff+)')
    .addUserOption(o => o.setName('user').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a user (mod+)')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addStringOption(o => o.setName('reason')),
  new SlashCommandBuilder().setName('infractions').setDescription('Show user infractions')
    .addUserOption(o => o.setName('user')),
  new SlashCommandBuilder().setName('clear').setDescription('Bulk delete messages (mod+)')
    .addIntegerOption(o => o.setName('amount').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Guild slash commands registered!');
  } catch (error) {
    console.error(error);
  }
})();
