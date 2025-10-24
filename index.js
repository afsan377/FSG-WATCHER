// index.js - FSG WATCHER
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const ms = require('ms');
const express = require('express');

// ---------- CONFIG from your provided IDs ----------
const OWNER_ROLE_ID = '1419721244051247176';
const ADMIN_ROLE_ID = '1418432923148881971';
const MOD_ROLE_ID = '1418432447535644722';
const STAFF_ROLE_ID = '1418434416660713593';
const MEMBER_ROLE_ID = '1418435425772507177';
const MUTE_ROLE_ID = '1430358490551029770';

const BANLOG_CHANNEL = '1431142672399204432';
const MESSAGELOG_CHANNEL = '1430361387846336594';
const GIVEAWAY_CHANNELS = (process.env.GIVEAWAY_CHANNELS || '1418444534496624671,1418444684644188401,1418444830031216710,1418444921656053791,1418445296517644309').split(',').map(s=>s.trim());

const PREFIX = process.env.PREFIX || '!';

// persistence folder
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const jread = (name) => {
  const p = path.join(DATA_DIR, name + '.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8') || '{}'); } catch(e){ return {}; }
};
const jwrite = (name, obj) => {
  const p = path.join(DATA_DIR, name + '.json');
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
};
['warnings','giveaways','tickets','reactionroles','feedback'].forEach(f => {
  const p = path.join(DATA_DIR, f + '.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, '{}');
});

// Keep-alive server for Render & uptime pings
const app = express();
app.get('/', (req, res) => res.send('FSG WATCHER alive'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// role checks
function isOwner(member){ return !!member && member.roles.cache.has(OWNER_ROLE_ID); }
function isAdmin(member){ return !!member && (member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.has(ADMIN_ROLE_ID)); }
function isMod(member){ return !!member && (isAdmin(member) || member.roles.cache.has(MOD_ROLE_ID)); }
function isStaff(member){ return !!member && (isMod(member) || member.roles.cache.has(STAFF_ROLE_ID)); }

// logging helper
async function logTo(channelId, content){
  try { const ch = await client.channels.fetch(channelId).catch(()=>null); if (ch) ch.send(content).catch(()=>{}); } catch(e){}
}

// helper for winners
function pickWinners(entries, count){
  const winners = []; const pool = Array.from(entries);
  while (winners.length < count && pool.length > 0){
    const i = Math.floor(Math.random()*pool.length);
    winners.push(pool.splice(i,1)[0]);
  }
  return winners;
}

// Register slash commands (guild if GUILD_ID set else global)
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
    new SlashCommandBuilder().setName('gstart').setDescription('Start a giveaway (staff only)')
      .addStringOption(o=>o.setName('duration').setDescription('10s/1m/1h/1d').setRequired(true))
      .addIntegerOption(o=>o.setName('winners').setDescription('Number of winners').setRequired(true))
      .addStringOption(o=>o.setName('prize').setDescription('Prize text').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Ban a user (admin only)')
      .addUserOption(o=>o.setName('user').setRequired(true)).addStringOption(o=>o.setName('reason')),
    new SlashCommandBuilder().setName('kick').setDescription('Kick a user (admin only)')
      .addUserOption(o=>o.setName('user').setRequired(true)).addStringOption(o=>o.setName('reason')),
    new SlashCommandBuilder().setName('mute').setDescription('Mute a user (staff+)')
      .addUserOption(o=>o.setName('user').setRequired(true)).addStringOption(o=>o.setName('duration')).addStringOption(o=>o.setName('reason')),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user (staff+)').addUserOption(o=>o.setName('user').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('Warn a user (mod+)').addUserOption(o=>o.setName('user').setRequired(true)).addStringOption(o=>o.setName('reason')),
    new SlashCommandBuilder().setName('infractions').setDescription('Show user infractions').addUserOption(o=>o.setName('user')),
    new SlashCommandBuilder().setName('clear').setDescription('Bulk delete messages (mod+)').addIntegerOption(o=>o.setName('amount').setRequired(true))
  ].map(c=>c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const GUILD = process.env.GUILD_ID;
    if (GUILD) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD), { body: commands });
      console.log('Registered guild slash commands');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('Registered global slash commands (may take up to 1 hour)');
    }
  } catch (e) { console.error('Failed to register slash commands', e); }
}

client.once('ready', async () => {
  console.log('✅ Logged in as', client.user.tag);
  client.user.setActivity('FSG WATCHER', { type: 2 });
  await registerCommands().catch(()=>{});
});

// Slash handling
client.on('interactionCreate', async inter => {
  if (!inter.isChatInputCommand()) return;
  const cmd = inter.commandName;

  if (cmd === 'ping') return inter.reply(`🏓 Pong! ${client.ws.ping}ms`);

  if (cmd === 'gstart') {
    if (!isStaff(inter.member)) return inter.reply({ content: '❌ Only staff can start giveaways', ephemeral: true });
    const duration = inter.options.getString('duration');
    const winners = inter.options.getInteger('winners');
    const prize = inter.options.getString('prize');
    const msDur = ms(duration);
    if (!msDur) return inter.reply({ content: 'Invalid duration', ephemeral: true });

    const chId = GIVEAWAY_CHANNELS[0] || inter.channelId;
    const ch = await client.channels.fetch(chId).catch(()=>null);
    if (!ch) return inter.reply({ content: 'Giveaway channel not found', ephemeral: true });

    const embed = new EmbedBuilder().setTitle('🎉 New Giveaway!').setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\nReact with 🎉 to enter!`).setColor('Gold').setFooter({ text: `Hosted by ${inter.user.tag}` }).setTimestamp(Date.now()+msDur);
    const msg = await ch.send({ embeds: [embed] });
    await msg.react('🎉');

    const store = jread('giveaways'); store[msg.id] = { channel: ch.id, prize, winners, ends: Date.now()+msDur, host: inter.user.id }; jwrite('giveaways', store);

    setTimeout(async () => {
      try {
        const fetched = await ch.messages.fetch(msg.id);
        const reaction = fetched.reactions.cache.get('🎉');
        const users = reaction ? await reaction.users.fetch() : null;
        const entries = users ? users.filter(u=>!u.bot).map(u=>u.id) : [];
        if (entries.length === 0) { ch.send('No valid entries.'); const g=jread('giveaways'); delete g[msg.id]; jwrite('giveaways', g); return; }
        const winnersIds = pickWinners(entries, winners);
        const winnersText = winnersIds.map(id=>`<@${id}>`).join(', ');
        ch.send({ embeds: [ new EmbedBuilder().setTitle('🎉 Giveaway Ended').setDescription(`Prize: ${prize}\nWinners: ${winnersText}`).setColor('Green') ]});
        const g2 = jread('giveaways'); delete g2[msg.id]; jwrite('giveaways', g2);
      } catch(e){}
    }, msDur);

    return inter.reply({ content: `🎉 Giveaway started in ${ch}`, ephemeral: true });
  }

  if (cmd === 'ban') {
    if (!isAdmin(inter.member)) return inter.reply({ content: '❌ Admins only', ephemeral: true });
    const user = inter.options.getUser('user'); const reason = inter.options.getString('reason') || 'No reason';
    const member = inter.guild.members.cache.get(user.id);
    if (!member) return inter.reply({ content: 'Member not found', ephemeral: true });
    await member.ban({ reason }).catch(e=>inter.reply({ content: 'Failed: '+e.message, ephemeral:true }));
    await inter.reply({ content: `✅ Banned ${user.tag}` });
    logTo(BANLOG_CHANNEL, `🔨 ${inter.user.tag} banned ${user.tag} • ${reason}`);
  }

  if (cmd === 'kick') {
    if (!isAdmin(inter.member)) return inter.reply({ content: '❌ Admins only', ephemeral: true });
    const user = inter.options.getUser('user'); const reason = inter.options.getString('reason') || 'No reason';
    const member = inter.guild.members.cache.get(user.id);
    if (!member) return inter.reply({ content: 'Member not found', ephemeral: true });
    await member.kick(reason).catch(e=>inter.reply({ content: 'Failed: '+e.message, ephemeral:true }));
    await inter.reply({ content: `✅ Kicked ${user.tag}` });
    logTo(BANLOG_CHANNEL, `👢 ${inter.user.tag} kicked ${user.tag} • ${reason}`);
  }

  if (cmd === 'mute') {
    if (!isStaff(inter.member)) return inter.reply({ content: '❌ Staff or higher only', ephemeral: true });
    const user = inter.options.getUser('user'); const dur = inter.options.getString('duration'); const reason = inter.options.getString('reason') || 'No reason';
    const member = inter.guild.members.cache.get(user.id);
    if (!member) return inter.reply({ content: 'Member not found', ephemeral: true });
    const muteRole = inter.guild.roles.cache.get(MUTE_ROLE_ID);
    if (!muteRole) return inter.reply({ content: `Mute role not found (expected ID ${MUTE_ROLE_ID})`, ephemeral: true });
    await member.roles.add(muteRole).catch(e=>inter.reply({ content: 'Failed to mute: '+e.message, ephemeral:true }));
    if (dur) { const msDur = ms(dur); if (!msDur) return inter.reply({ content: 'Invalid duration', ephemeral:true }); setTimeout(()=>{ member.roles.remove(muteRole).catch(()=>{}); }, msDur); }
    await inter.reply({ content: `🔇 Muted ${user.tag} • ${reason}` });
    logTo(MESSAGELOG_CHANNEL, `🔇 ${inter.user.tag} muted ${user.tag} • ${reason}`);
  }

  if (cmd === 'unmute') {
    if (!isStaff(inter.member)) return inter.reply({ content: '❌ Staff or higher only', ephemeral: true });
    const user = inter.options.getUser('user'); const member = inter.guild.members.cache.get(user.id);
    if (!member) return inter.reply({ content: 'Member not found', ephemeral:true });
    const muteRole = inter.guild.roles.cache.get(MUTE_ROLE_ID); if (!muteRole) return inter.reply({ content: 'Mute role not found', ephemeral:true });
    await member.roles.remove(muteRole).catch(()=>{});
    await inter.reply({ content: `🔊 Unmuted ${user.tag}` });
  }

  if (cmd === 'warn') {
    if (!isMod(inter.member)) return inter.reply({ content: '❌ Mods or higher only', ephemeral: true });
    const user = inter.options.getUser('user'); const reason = inter.options.getString('reason') || 'No reason';
    const warnings = jread('warnings'); warnings[user.id] = warnings[user.id] || []; warnings[user.id].push({ by: inter.user.id, reason, at: Date.now() }); jwrite('warnings', warnings);
    await inter.reply({ content: `⚠️ Warned ${user.tag}`, ephemeral: true });
    logTo(MESSAGELOG_CHANNEL, `⚠️ ${inter.user.tag} warned ${user.tag} • ${reason}`);
  }

  if (cmd === 'infractions') {
    const user = inter.options.getUser('user') || inter.user; const list = jread('warnings')[user.id] || [];
    if (list.length === 0) return inter.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
    const embed = new EmbedBuilder().setTitle(`${user.tag} — Warnings`).setColor('Orange').setDescription(list.map((w,i)=>`${i+1}. <@${w.by}> • ${w.reason} • <t:${Math.floor(w.at/1000)}:R>`).join('\n'));
    return inter.reply({ embeds: [embed], ephemeral: true });
  }

  if (cmd === 'clear') {
    if (!isMod(inter.member)) return inter.reply({ content: '❌ Mods or higher only', ephemeral: true });
    const amount = inter.options.getInteger('amount') || 10; await inter.channel.bulkDelete(Math.min(100, amount), true).catch(e=>inter.reply({ content: 'Failed: '+e.message, ephemeral:true })); return inter.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
  }
});

// Prefix fallback (same commands)
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/g);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'ping') return message.reply(`🏓 Pong! ${client.ws.ping}ms`);

  // gstart (prefix)
  if (cmd === 'gstart') {
    if (!isStaff(message.member)) return message.reply('❌ Only staff can start giveaways.');
    const duration = args.shift(); const winners = parseInt(args.shift() || '1'); const prize = args.join(' ');
    if (!duration || !prize) return message.reply('Usage: !gstart <duration> <winners> <prize>');
    const msDur = ms(duration); if (!msDur) return message.reply('Invalid duration format.');
    const chId = GIVEAWAY_CHANNELS[0] || message.channel.id; const ch = await client.channels.fetch(chId).catch(()=>null);
    if (!ch) return message.reply('Giveaway channel not found.');
    const embed = new EmbedBuilder().setTitle('🎉 New Giveaway!').setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\nReact with 🎉 to enter!`).setColor('Gold').setFooter({ text: `Hosted by ${message.author.tag}` }).setTimestamp(Date.now()+msDur);
    const msg = await ch.send({ embeds: [embed] }); await msg.react('🎉');
    const store = jread('giveaways'); store[msg.id] = { channel: ch.id, prize, winners, ends: Date.now()+msDur, host: message.author.id }; jwrite('giveaways', store);
    setTimeout(async ()=> {
      try {
        const fetched = await ch.messages.fetch(msg.id);
        const reaction = fetched.reactions.cache.get('🎉');
        const users = reaction ? await reaction.users.fetch() : null;
        const entries = users ? users.filter(u=>!u.bot).map(u=>u.id) : [];
        if (entries.length === 0) { ch.send('No valid entries.'); const g=jread('giveaways'); delete g[msg.id]; jwrite('giveaways', g); return; }
        const winnersIds = pickWinners(entries, winners); const winnersText = winnersIds.map(id=>`<@${id}>`).join(', ');
        ch.send({ embeds: [ new EmbedBuilder().setTitle('🎉 Giveaway Ended').setDescription(`Prize: ${prize}\nWinners: ${winnersText}`).setColor('Green') ]});
        const g = jread('giveaways'); delete g[msg.id]; jwrite('giveaways', g);
      } catch(e){}
    }, msDur);
    return message.reply('🎁 Giveaway started!');
  }

  // admin ban
  if (cmd === 'ban') {
    if (!isAdmin(message.member)) return message.reply('❌ Admins only'); const user = message.mentions.users.first(); const reason = args.slice(1).join(' ') || 'No reason';
    if (!user) return message.reply('Usage: !ban @user [reason]'); const member = message.guild.members.cache.get(user.id); if (!member) return message.reply('User not found.'); await member.ban({ reason }).catch(e=>message.reply('Failed: '+e.message));
    message.reply(`✅ Banned ${user.tag}`); logTo(BANLOG_CHANNEL, `🔨 ${message.author.tag} banned ${user.tag} • ${reason}`); return;
  }

  // admin kick
  if (cmd === 'kick') {
    if (!isAdmin(message.member)) return message.reply('❌ Admins only'); const user = message.mentions.users.first(); const reason = args.slice(1).join(' ') || 'No reason';
    if (!user) return message.reply('Usage: !kick @user [reason]'); const member = message.guild.members.cache.get(user.id); if (!member) return message.reply('User not found.'); await member.kick(reason).catch(e=>message.reply('Failed: '+e.message));
    message.reply(`✅ Kicked ${user.tag}`); logTo(BANLOG_CHANNEL, `👢 ${message.author.tag} kicked ${user.tag} • ${reason}`); return;
  }

  // mute/unmute/warn/infractions/clear handled above in slash
  if (cmd === 'userinfo') {
    const user = message.mentions.users.first() || message.author; const member = message.guild.members.cache.get(user.id);
    const embed = new EmbedBuilder().setTitle(user.tag).setThumbnail(user.displayAvatarURL({ dynamic:true })).addFields({ name:'ID', value:user.id, inline:true }, { name:'Joined', value:member ? `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` : 'N/A', inline:true });
    return message.channel.send({ embeds: [embed] });
  }
});

client.on('messageDelete', async msg => {
  if (!msg.guild) return;
  const log = await client.channels.fetch(MESSAGELOG_CHANNEL).catch(()=>null);
  if (!log) return;
  const embed = new EmbedBuilder().setTitle('Message deleted').addFields({ name:'Author', value: `${msg.author?.tag || 'Unknown'}`, inline:true }, { name:'Channel', value: `${msg.channel?.toString()}`, inline:true }, { name:'Content', value: msg.content ? (msg.content.length>1024? msg.content.slice(0,1000)+'...': msg.content) : 'None' }).setTimestamp();
  log.send({ embeds: [embed] }).catch(()=>{});
});

client.login(process.env.DISCORD_TOKEN);
