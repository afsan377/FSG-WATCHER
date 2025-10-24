// deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('gstart')
    .setDescription('Start a giveaway')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Example: 10s, 1m, 1h, 1d')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('prize')
        .setDescription('Giveaway prize')
        .setRequired(true)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const guild = process.env.GUILD_ID; // faster registration
    if (guild) {
      console.log(`Registering commands to guild ${guild}...`);
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild), { body: commands });
      console.log('✅ Commands registered for guild!');
    } else {
      console.log('Registering global commands (can take up to 1 hour)...');
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅ Global commands registered!');
    }
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
