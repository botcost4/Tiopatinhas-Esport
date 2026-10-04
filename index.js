const http = require("http");
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

// ===============================
// CONFIGURAÇÃO
// ===============================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ DISCORD_TOKEN ou CLIENT_ID não configurado.");
  process.exit(1);
}

// ===============================
// SERVIDOR PARA O RAILWAY
// ===============================

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Tiopatinhas E-sports Bot está online!");
});

server.listen(process.env.PORT || 3000, "0.0.0.0");

// ===============================
// CLIENT DISCORD
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

// ===============================
// BANCO LOCAL
// ===============================

const DB_FILE = "./data.json";

let db = {
  players: {},
  queues: {},
  matches: {},
  tickets: {},
  mediatorRequests: {},
  config: {
    mediatorRoleId: null,
    logChannelId: null,
    ticketCategoryId: null,
    mediatorChannelId: null
  },
  invites: {}
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (err) {
    console.log("Erro ao carregar banco:", err);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.log("Erro ao salvar banco:", err);
  }
}

loadDB();

// ===============================
// DADOS DOS JOGADORES
// ===============================

function getPlayer(id) {
  if (!db.players[id]) {
    db.players[id] = {
      balance: 1000,
      wins: 0,
      losses: 0,
      matches: 0,
      points: 0,
      invites: 0
    };

    saveDB();
  }

  return db.players[id];
}

// ===============================
// MODOS E TAMANHOS
// ===============================

const MODES = {
  emulador: "🎮 EMULADOR",
  tatico: "🎯 TÁTICO",
  misto: "🌀 MISTO"
};

const SIZES = {
  "1v1": "1V1",
  "2v2": "2V2",
  "3v3": "3V3",
  "4v4": "4V4"
};

function queueKey(mode, size) {
  return `${mode}_${size}`;
}

function getQueue(mode, size) {
  const key = queueKey(mode, size);

  if (!db.queues[key]) {
    db.queues[key] = {
      mode,
      size,
      value: 10,
      puxador: null,
      puxadorStake: 0,
      adversario: null,
      adversarioStake: 0,
      channelId: null,
      panelMessageId: null
    };
  }

  return db.queues[key];
}

// ===============================
// PERMISSÕES
// ===============================

function isStaff(interaction) {
  return interaction.memberPermissions?.has(
    PermissionsBitField.Flags.ManageGuild
  );
}

function isMediator(interaction) {
  if (isStaff(interaction)) return true;

  const roleId = db.config.mediatorRoleId;

  if (!roleId) return false;

  return interaction.member?.roles?.cache?.has(roleId);
}

// ===============================
// USUÁRIO
// ===============================

async function getUser(id) {
  try {
    return await client.users.fetch(id);
  } catch {
    return null;
  }
}

// ===============================
// LOG
// ===============================

async function sendLog(guild, message) {
  try {
    if (!db.config.logChannelId) return;

    const channel = guild.channels.cache.get(db.config.logChannelId);

    if (channel) {
      await channel.send(`📋 ${message}`);
    }
  } catch {}
}

// ===============================
// EMBED DO PAINEL AP
// ===============================

async function createQueueEmbed(queue) {
  const modeName = MODES[queue.mode];
  const sizeName = SIZES[queue.size];

  let puxadorText = "Ninguém puxou ainda.";
  let avatar = null;

  if (queue.puxador) {
    const user = await getUser(queue.puxador);

    if (user) {
      puxadorText = `👤 **${user.username}**`;
      avatar = user.displayAvatarURL({
        extension: "png",
        size: 128
      });
    }
  }

  let adversarioText = "Aguardando adversário...";

  if (queue.adversario) {
    const user = await getUser(queue.adversario);

    if (user) {
      adversarioText = `⚔️ **${user.username}**`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${modeName} • AP ${sizeName}`)
    .setDescription(
      "🎯 **PAINEL DE PUXAR AP**\n\n" +
      `💰 Valor: **${queue.value} pontos**\n\n` +
      `👤 **Puxador:** ${puxadorText}\n` +
      `${adversarioText}\n\n` +
      "Clique em **🟢 PUXAR AP** para criar sua partida."
    )
    .setFooter({
      text: "Tiopatinhas E-sports • AP Virtual"
    });

  if (avatar) {
    embed.setThumbnail(avatar);
  }

  return embed;
}

// ===============================
// ATUALIZAR PAINEL AP
// ===============================

async function refreshQueuePanel(guild, mode, size) {
  const queue = getQueue(mode, size);

  if (!queue.channelId) return;

  const channel = guild.channels.cache.get(queue.channelId);

  if (!channel) return;

  const embed = await createQueueEmbed(queue);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`puxar:${mode}:${size}`)
      .setLabel("PUXAR AP")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success)
  );

  try {
    let message = null;

    if (queue.panelMessageId) {
      try {
        message = await channel.messages.fetch(queue.panelMessageId);
      } catch {}
    }

    if (message) {
      await message.edit({
        embeds: [embed],
        components: [row]
      });
    } else {
      const newMessage = await channel.send({
        embeds: [embed],
        components: [row]
      });

      queue.panelMessageId = newMessage.id;
      saveDB();
    }
  } catch (err) {
    console.log("Erro painel:", err);
  }
}

// ===============================
// FILA
// ===============================

let waitingQueue = [];

function userInAP(userId) {
  for (const key of Object.keys(db.queues)) {
    const q = db.queues[key];

    if (
      q.puxador === userId ||
      q.adversario === userId
    ) {
      return true;
    }
  }

  return false;
}

function userInWaitingQueue(userId) {
  return waitingQueue.includes(userId);
}

// ===============================
// CRIAR PARTIDA
// ===============================

async function createMatch(guild, queue) {
  const matchId =
    "AP-" +
    Math.floor(100000 + Math.random() * 900000);

  const match = {
    id: matchId,
    mode: queue.mode,
    size: queue.size,
    channelId: queue.channelId,
    player1: queue.puxador,
    player2: queue.adversario,
    stake1: queue.puxadorStake,
    stake2: queue.adversarioStake,
    pot: queue.puxadorStake + queue.adversarioStake,
    mediator: null,
    createdAt: Date.now()
  };

  db.matches[matchId] = match;

  queue.puxador = null;
  queue.adversario = null;
  queue.puxadorStake = 0;
  queue.adversarioStake = 0;

  saveDB();

  const channel = guild.channels.cache.get(queue.channelId);

  if (channel) {
    const user1 = await getUser(match.player1);
    const user2 = await getUser(match.player2);

    const embed = new EmbedBuilder()
      .setTitle("🔥 AP ENCONTRADA!")
      .setDescription(
        `## ⚔️ ${SIZES[match.size]}\n\n` +
        `🎮 **Modo:** ${MODES[match.mode]}\n\n` +
        `👤 **Jogador 1:** ${user1 ? user1.username : match.player1}\n` +
        `👤 **Jogador 2:** ${user2 ? user2.username : match.player2}\n\n` +
        `💰 **Pote:** ${match.pot} pontos\n` +
        `🆔 **Código:** \`${match.id}\`\n\n` +
        "Quando precisar, solicite um mediador abaixo."
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mediador:${match.id}`)
        .setLabel("Solicitar Mediador")
        .setEmoji("🧑‍⚖️")
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      content: `<@${match.player1}> <@${match.player2}>`,
      embeds: [embed],
      components: [row]
    });
  }

  await sendLog(
    guild,
    `AP criada: ${match.id} — <@${match.player1}> x <@${match.player2}>`
  );

  await refreshQueuePanel(
    guild,
    queue.mode,
    queue.size
  );
}

// ===============================
// PAINEL DA FILA
// ===============================

async function createWaitingQueuePanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("📋 FILA DE AP")
    .setDescription(
      "Entre na fila para encontrar jogadores.\n\n" +
      "🟢 **Entrar na fila**\n" +
      "🔴 **Sair da fila**\n\n" +
      `👥 Jogadores na fila: **${waitingQueue.length}**`
    )
    .setFooter({
      text: "Tiopatinhas E-sports"
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("fila:entrar")
      .setLabel("ENTRAR NA FILA")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("fila:sair")
      .setLabel("SAIR DA FILA")
      .setEmoji("🔴")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    embeds: [embed],
    components: [row]
  });
}

// ===============================
// ATUALIZAR FILA
// ===============================

async function updateWaitingPanels(guild) {
  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type === ChannelType.GuildText &&
      channel.name === "fila-ap"
    ) {
      try {
        const messages = await channel.messages.fetch({
          limit: 20
        });

        const message = messages.find(
          m => m.author.id === client.user.id
        );

        if (!message) continue;

        const embed = new EmbedBuilder()
          .setTitle("📋 FILA DE AP")
          .setDescription(
            "Entre na fila para encontrar jogadores.\n\n" +
            "🟢 **Entrar na fila**\n" +
            "🔴 **Sair da fila**\n\n" +
            `👥 Jogadores na fila: **${waitingQueue.length}**`
          )
          .setFooter({
            text: "Tiopatinhas E-sports"
          });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("fila:entrar")
            .setLabel("ENTRAR NA FILA")
            .setEmoji("🟢")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("fila:sair")
            .setLabel("SAIR DA FILA")
            .setEmoji("🔴")
            .setStyle(ButtonStyle.Danger)
        );

        await message.edit({
          embeds: [embed],
          components: [row]
        });
      } catch {}
    }
  }
}

// ===============================
// TICKETS
// ===============================

async function createTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle("🎫 SUPORTE")
    .setDescription(
      "Precisa de ajuda?\n\n" +
      "Clique no botão abaixo para abrir seu ticket privado com a equipe."
    )
    .setFooter({
      text: "Tiopatinhas E-sports"
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:abrir")
      .setLabel("Abrir Ticket")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    embeds: [embed],
    components: [row]
  });
}

// ===============================
// COMANDOS
// ===============================

const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Verifica se o bot está online."),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Cria toda a estrutura da Tiopatinhas E-sports."),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Envia o painel de tickets."),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Mostra o ranking."),

  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Mostra o perfil de um jogador.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Jogador")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("saldo")
    .setDescription("Mostra seu saldo virtual."),

  new SlashCommandBuilder()
    .setName("convite")
    .setDescription("Cria seu convite."),

  new SlashCommandBuilder()
    .setName("convites")
    .setDescription("Mostra quantos convites você possui."),

  new SlashCommandBuilder()
    .setName("configap")
    .setDescription("Configura o valor de uma AP.")
    .addStringOption(option =>
      option
        .setName("modo")
        .setDescription("Modo")
        .setRequired(true)
        .addChoices(
          { name: "🎮 Emulador", value: "emulador" },
          { name: "🎯 Tático", value: "tatico" },
          { name: "🌀 Misto", value: "misto" }
        )
    )
    .addStringOption(option =>
      option
        .setName("tamanho")
        .setDescription("Tamanho")
        .setRequired(true)
        .addChoices(
          { name: "1V1", value: "1v1" },
          { name: "2V2", value: "2v2" },
          { name: "3V3", value: "3v3" },
          { name: "4V4", value: "4v4" }
        )
    )
    .addIntegerOption(option =>
      option
        .setName("valor")
        .setDescription("Valor em pontos virtuais")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("adicionar-saldo")
    .setDescription("Adiciona pontos virtuais.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Jogador")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("valor")
        .setDescription("Quantidade")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("remover-saldo")
    .setDescription("Remove pontos virtuais.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Jogador")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("valor")
        .setDescription("Quantidade")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("mediador")
    .setDescription("Solicita um mediador para uma AP.")
    .addStringOption(option =>
      option
        .setName("codigo")
        .setDescription("Código da AP")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("assumir-mediador")
    .setDescription("Assume uma AP como mediador.")
    .addStringOption(option =>
      option
        .setName("codigo")
        .setDescription("Código da AP")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("resultado")
    .setDescription("Registra o vencedor de uma AP.")
    .addStringOption(option =>
      option
        .setName("codigo")
        .setDescription("Código da AP")
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName("vencedor")
        .setDescription("Vencedor")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("cancelar-ap")
    .setDescription("Cancela uma AP e devolve os pontos.")
    .addStringOption(option =>
      option
        .setName("codigo")
        .setDescription("Código da AP")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("configmediador")
    .setDescription("Define o cargo de mediador.")
    .addRoleOption(option =>
      option
        .setName("cargo")
        .setDescription("Cargo dos mediadores")
        .setRequired(true)
    )

].map(command => command.toJSON());

// ===============================
// REGISTRAR COMANDOS
// ===============================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log("🔄 Registrando comandos...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Comandos registrados.");
  } catch (err) {
    console.error("❌ Erro nos comandos:", err);
  }
}

// ===============================
// BOT ONLINE
// ===============================

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  await registerCommands();

  for (const guild of client.guilds.cache.values()) {
    getQueue("emulador", "1v1");
    getQueue("emulador", "2v2");
    getQueue("emulador", "3v3");
    getQueue("emulador", "4v4");

    getQueue("tatico", "1v1");
    getQueue("tatico", "2v2");
    getQueue("tatico", "3v3");
    getQueue("tatico", "4v4");

    getQueue("misto", "1v1");
    getQueue("misto", "2v2");
    getQueue("misto", "3v3");
    getQueue("misto", "4v4");
  }

  saveDB();
});

// ===============================
// INTERAÇÕES
// ===============================

client.on("interactionCreate", async interaction => {

  // =============================
  // COMANDOS
  // =============================

  if (interaction.isChatInputCommand()) {

    // PING
    if (interaction.commandName === "ping") {
      return interaction.reply("🏓 Pong! Bot online.");
    }

    // SETUP
    if (interaction.commandName === "setup") {

      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você precisa ser staff.",
          ephemeral: true
        });
      }

      await interaction.deferReply({
        ephemeral: true
      });

      const guild = interaction.guild;

      // CATEGORIAS
      const categories = {};

      for (const [mode, name] of Object.entries(MODES)) {

        let category = guild.channels.cache.find(
          c =>
            c.type === ChannelType.GuildCategory &&
            c.name === name
        );

        if (!category) {
          category = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory
          });
        }

        categories[mode] = category;
      }

      // CRIAR 12 PAINÉIS
      for (const mode of Object.keys(MODES)) {

        for (const size of Object.keys(SIZES)) {

          const q = getQueue(mode, size);

          let channel = guild.channels.cache.find(
            c =>
              c.type === ChannelType.GuildText &&
              c.parentId === categories[mode].id &&
              c.name === `ap-${size.toLowerCase()}`
          );

          if (!channel) {
            channel = await guild.channels.create({
              name: `ap-${size.toLowerCase()}`,
              type: ChannelType.GuildText,
              parent: categories[mode].id
            });
          }

          q.channelId = channel.id;

          await refreshQueuePanel(
            guild,
            mode,
            size
          );
        }
      }

      // CATEGORIA TICKET
      let ticketCategory = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildCategory &&
          c.name === "🎫 TICKETS"
      );

      if (!ticketCategory) {
        ticketCategory = await guild.channels.create({
          name: "🎫 TICKETS",
          type: ChannelType.GuildCategory
        });
      }

      db.config.ticketCategoryId =
        ticketCategory.id;

      // CATEGORIA MEDIADOR
      let mediatorCategory = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildCategory &&
          c.name === "🧑‍⚖️ MEDIADOR"
      );

      if (!mediatorCategory) {
        mediatorCategory = await guild.channels.create({
          name: "🧑‍⚖️ MEDIADOR",
          type: ChannelType.GuildCategory
        });
      }

      let mediatorChannel = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          c.parentId === mediatorCategory.id &&
          c.name === "fila-mediador"
      );

      if (!mediatorChannel) {
        mediatorChannel = await guild.channels.create({
          name: "fila-mediador",
          type: ChannelType.GuildText,
          parent: mediatorCategory.id
        });
      }

      db.config.mediatorChannelId =
        mediatorChannel.id;

      // FILA
      let filaCategory = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildCategory &&
          c.name === "📋 FILAS"
      );

      if (!filaCategory) {
        filaCategory = await guild.channels.create({
          name: "📋 FILAS",
          type: ChannelType.GuildCategory
        });
      }

      let filaChannel = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          c.parentId === filaCategory.id &&
          c.name === "fila-ap"
      );

      if (!filaChannel) {
        filaChannel = await guild.channels.create({
          name: "fila-ap",
          type: ChannelType.GuildText,
          parent: filaCategory.id
        });

        await createWaitingQueuePanel(filaChannel);
      }

      // LOG
      let logChannel = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          c.name === "logs"
      );

      if (!logChannel) {
        logChannel = await guild.channels.create({
          name: "logs",
          type: ChannelType.GuildText
        });
      }

      db.config.logChannelId =
        logChannel.id;

      saveDB();

      await interaction.editReply(
        "✅ **Sistema criado!**\n\n" +
        "🎮 4 painéis Emulador\n" +
        "🎯 4 painéis Tático\n" +
        "🌀 4 painéis Misto\n" +
        "📋 Fila de AP\n" +
        "🎫 Sistema de tickets\n" +
        "🧑‍⚖️ Fila de mediador\n" +
        "📜 Logs\n\n" +
        "Agora configure os valores com `/configap`."
      );

      return;
    }

    // TICKET
    if (interaction.commandName === "ticket") {

      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você precisa ser staff.",
          ephemeral: true
        });
      }

      await createTicketPanel(interaction.channel);

      return interaction.reply({
        content: "✅ Painel de ticket enviado.",
        ephemeral: true
      });
    }

    // PERFIL
    if (interaction.commandName === "perfil") {

      const target =
        interaction.options.getUser("usuario") ||
        interaction.user;

      const p = getPlayer(target.id);

      const embed = new EmbedBuilder()
        .setTitle(`👤 Perfil de ${target.username}`)
        .setThumbnail(
          target.displayAvatarURL({
            extension: "png",
            size: 256
          })
        )
        .addFields(
          {
            name: "💰 Saldo",
            value: `${p.balance} pontos`,
            inline: true
          },
          {
            name: "🏆 Vitórias",
            value: `${p.wins}`,
            inline: true
          },
          {
            name: "❌ Derrotas",
            value: `${p.losses}`,
            inline: true
          },
          {
            name: "🎮 Partidas",
            value: `${p.matches}`,
            inline: true
          },
          {
            name: "⭐ Pontos de ranking",
            value: `${p.points}`,
            inline: true
          },
          {
            name: "🎟️ Convites",
            value: `${p.invites}`,
            inline: true
          }
        );

      return interaction.reply({
        embeds: [embed]
      });
    }

    // SALDO
    if (interaction.commandName === "saldo") {

      const p = getPlayer(interaction.user.id);

      return interaction.reply(
        `💰 Seu saldo é **${p.balance} pontos virtuais**.`
      );
    }

    // RANK
    if (interaction.commandName === "rank") {

      const ranking = Object.entries(db.players)
        .sort((a, b) =>
          (b[1].points || 0) -
          (a[1].points || 0)
        )
        .slice(0, 10);

      if (!ranking.length) {
        return interaction.reply(
          "🏆 Ainda não existem jogadores no ranking."
        );
      }

      let text = "";

      for (let i = 0; i < ranking.length; i++) {

        const [id, p] = ranking[i];

        let user;

        try {
          user = await client.users.fetch(id);
        } catch {}

        text +=
          `**${i + 1}.** ${user ? user.username : id} — ` +
          `⭐ ${p.points || 0} pts | ` +
          `🏆 ${p.wins || 0} vitórias\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("🏆 RANKING — TIOPATINHAS E-SPORTS")
        .setDescription(text);

      return interaction.reply({
        embeds: [embed]
      });
    }

    // CONVITE
    if (interaction.commandName === "convite") {

      try {

        const invite =
          await interaction.channel.createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: true,
            reason:
              `Convite criado por ${interaction.user.tag}`
          });

        return interaction.reply(
          `🎟️ **Seu convite:** ${invite.url}\n\n` +
          "Convite permanente criado."
        );

      } catch {
        return interaction.reply({
          content:
            "❌ Não consegui criar o convite. " +
            "Preciso da permissão **Criar Convite**.",
          ephemeral: true
        });
      }
    }

    // CONVITES
    if (interaction.commandName === "convites") {

      const p = getPlayer(interaction.user.id);

      return interaction.reply(
        `🎟️ Você trouxe **${p.invites} pessoas**.`
      );
    }

    // CONFIG AP
    if (interaction.commandName === "configap") {

      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você precisa ser staff.",
          ephemeral: true
        });
      }

      const mode =
        interaction.options.getString("modo");

      const size =
        interaction.options.getString("tamanho");

      const value =
        interaction.options.getInteger("valor");

      const q = getQueue(mode, size);

      q.value = value;

      saveDB();

      await refreshQueuePanel(
        interaction.guild,
        mode,
        size
      );

      return interaction.reply(
        `✅ AP **${MODES[mode]} ${size.toUpperCase()}** configurada para **${value} pontos**.`
      );
    }

    // ADICIONAR SALDO
    if (interaction.commandName === "adicionar-saldo") {

      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você precisa ser staff.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("usuario");

      const value =
        interaction.options.getInteger("valor");

      const p = getPlayer(user.id);

      p.balance += value;

      saveDB();

      return interaction.reply(
        `✅ Adicionado **${value} pontos** para ${user}.`
      );
    }

    // REMOVER SALDO
    if (interaction.commandName === "remover-saldo") {

      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você precisa ser staff.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("usuario");

      const value =
        interaction.options.getInteger("valor");

      const p = getPlayer(user.id);

      p.balance =
        Math.max(0, p.balance - value);

      saveDB();

      return interaction.reply(
        `✅ Removido **${value} pontos** de ${user}.`
      );
    }

    // MEDIADOR
    if (interaction.commandName === "mediador") {

      const code =
        interaction.options.getString("codigo");

      const match = db.matches[code];

      if (!match) {
        return interaction.reply({
          content: "❌ AP não encontrada.",
          ephemeral: true
        });
      }

      if (
        interaction.user.id !== match.player1 &&
        interaction.user.id !== match.player2
      ) {
        return interaction.reply({
          content:
            "❌ Somente jogadores dessa AP podem solicitar mediador.",
          ephemeral: true
        });
      }

      db.mediatorRequests[code] = {
        userId: interaction.user.id,
        createdAt: Date.now()
      };

      saveDB();

      const channel =
        interaction.guild.channels.cache.get(
          db.config.mediatorChannelId
        );

      if (channel) {

        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`assumir:${code}`)
              .setLabel("ASSUMIR MEDIADOR")
              .setEmoji("🧑‍⚖️")
              .setStyle(ButtonStyle.Primary)
          );

        await channel.send({
          content:
            `🚨 **NOVO PEDIDO DE MEDIADOR**\n\n` +
            `🆔 AP: \`${code}\`\n` +
            `👤 Solicitado por: <@${interaction.user.id}>`,
          components: [row]
        });
      }

      return interaction.reply(
        `🧑‍⚖️ Mediador solicitado para a AP **${code}**.`
      );
    }

    // ASSUMIR MEDIADOR
    if (interaction.commandName === "assumir-mediador") {

      if (!isMediator(interaction)) {
        return interaction.reply({
          content:
            "❌ Você não é mediador.",
          ephemeral: true
        });
      }

      const code =
        interaction.options.getString("codigo");

      const match = db.matches[code];

      if (!match) {
        return interaction.reply({
          content: "❌ AP não encontrada.",
          ephemeral: true
        });
      }

      match.mediator =
        interaction.user.id;

      saveDB();

      return interaction.reply(
        `🧑‍⚖️ Você assumiu a mediação da AP **${code}**.`
      );
    }

    // RESULTADO
    if (interaction.commandName === "resultado") {

      if (!isMediator(interaction)) {
        return interaction.reply({
          content:
            "❌ Apenas staff ou mediadores podem registrar resultado.",
          ephemeral: true
        });
      }

      const code =
        interaction.options.getString("codigo");

      const winner =
        interaction.options.getUser("vencedor");

      const match = db.matches[code];

      if (!match) {
        return interaction.reply({
          content: "❌ AP não encontrada.",
          ephemeral: true
        });
      }

      if (
        winner.id !== match.player1 &&
        winner.id !== match.player2
      ) {
        return interaction.reply({
          content:
            "❌ Esse jogador não participa dessa AP.",
          ephemeral: true
        });
      }

      const loserId =
        winner.id === match.player1
          ? match.player2
          : match.player1;

      const winnerData =
        getPlayer(winner.id);

      const loserData =
        getPlayer(loserId);

      winnerData.balance += match.pot;

      winnerData.wins++;
      winnerData.matches++;
      winnerData.points += 3;

      loserData.losses++;
      loserData.matches++;
      loserData.points =
        Math.max(0, loserData.points - 1);

      delete db.matches[code];
      delete db.mediatorRequests[code];

      saveDB();

      await sendLog(
        interaction.guild,
        `Resultado ${code}: vencedor ${winner}`
      );

      return interaction.reply(
        `🏆 **RESULTADO REGISTRADO!**\n\n` +
        `🥇 Vencedor: ${winner}\n` +
        `💰 Prêmio: **${match.pot} pontos**\n` +
        `🆔 AP: \`${code}\``
      );
    }

    // CANCELAR AP
    if (interaction.commandName === "cancelar-ap") {

      if (!isMediator(interaction)) {
        return interaction.reply({
          content: "❌ Apenas staff/mediador.",
          ephemeral: true
        });
      }

      const code =
        interaction.options.getString("codigo");

      const match = db.matches[code];

      if (!match) {
        return interaction.reply({
          content: "❌ AP não encontrada.",
          ephemeral: true
        });
      }

      getPlayer(match.player1).balance +=
        match.stake1;

      getPlayer(match.player2).balance +=
        match.stake2;

      delete db.matches[code];
      delete db.mediatorRequests[code];

      saveDB();

      return interaction.reply(
        `♻️ AP **${code}** cancelada.\n` +
        `Os pontos foram devolvidos aos jogadores.`
      );
    }

    // CONFIG MEDIADOR
    if (interaction.commandName === "configmediador") {

      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você precisa ser staff.",
          ephemeral: true
        });
      }

      const role =
        interaction.options.getRole("cargo");

      db.config.mediatorRoleId =
        role.id;

      saveDB();

      return interaction.reply(
        `✅ Cargo de mediador definido como ${role}.`
      );
    }
  }

  // =============================
  // BOTÕES
  // =============================

  if (interaction.isButton()) {

    // ===========================
    // PUXAR AP
    // ===========================

    if (
      interaction.customId.startsWith("puxar:")
    ) {

      const [, mode, size] =
        interaction.customId.split(":");

      const queue =
        getQueue(mode, size);

      const player =
        getPlayer(interaction.user.id);

      if (userInAP(interaction.user.id)) {
        return interaction.reply({
          content:
            "❌ Você já está em uma AP.",
          ephemeral: true
        });
      }

      if (queue.puxador) {

        if (queue.adversario) {
          return interaction.reply({
            content:
              "❌ Essa AP já está completa.",
            ephemeral: true
          });
        }

        if (
          queue.puxador ===
          interaction.user.id
        ) {
          return interaction.reply({
            content:
              "❌ Você já puxou essa AP.",
            ephemeral: true
          });
        }

        if (player.balance < queue.value) {
          return interaction.reply({
            content:
              `❌ Você precisa de **${queue.value} pontos** para entrar.`,
            ephemeral: true
          });
        }

        player.balance -= queue.value;

        queue.adversario =
          interaction.user.id;

        queue.adversarioStake =
          queue.value;

        saveDB();

        await interaction.reply(
          "🔥 **Você entrou na AP!**\n" +
          "A partida foi encontrada."
        );

        await createMatch(
          interaction.guild,
          queue
        );

        return;
      }

      if (player.balance < queue.value) {
        return interaction.reply({
          content:
            `❌ Você precisa de **${queue.value} pontos** para puxar essa AP.`,
          ephemeral: true
        });
      }

      player.balance -= queue.value;

      queue.puxador =
        interaction.user.id;

      queue.puxadorStake =
        queue.value;

      saveDB();

      await refreshQueuePanel(
        interaction.guild,
        mode,
        size
      );

      return interaction.reply({
        content:
          `🟢 **AP puxada!**\n\n` +
          `Você está aguardando um adversário na **${size.toUpperCase()} ${MODES[mode]}**.`,
        ephemeral: true
      });
    }

    // ===========================
    // ENTRAR FILA
    // ===========================

    if (
      interaction.customId ===
      "fila:entrar"
    ) {

      if (
        userInWaitingQueue(
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "❌ Você já está na fila.",
          ephemeral: true
        });
      }

      waitingQueue.push(
        interaction.user.id
      );

      saveDB();

      await updateWaitingPanels(
        interaction.guild
      );

      return interaction.reply({
        content:
          "🟢 Você entrou na fila de AP!",
        ephemeral: true
      });
    }

    // ===========================
    // SAIR FILA
    // ===========================

    if (
      interaction.customId ===
      "fila:sair"
    ) {

      const index =
        waitingQueue.indexOf(
          interaction.user.id
        );

      if (index === -1) {
        return interaction.reply({
          content:
            "❌ Você não está na fila.",
          ephemeral: true
        });
      }

      waitingQueue.splice(index, 1);

      await updateWaitingPanels(
        interaction.guild
      );

      return interaction.reply({
        content:
          "🔴 Você saiu da fila.",
        ephemeral: true
      });
    }

    // ===========================
    // SOLICITAR MEDIADOR
    // ===========================

    if (
      interaction.customId.startsWith(
        "mediador:"
      )
    ) {

      const code =
        interaction.customId.split(":")[1];

      const match =
        db.matches[code];

      if (!match) {
        return interaction.reply({
          content:
            "❌ Essa AP não está mais ativa.",
          ephemeral: true
        });
      }

      if (
        interaction.user.id !==
          match.player1 &&
        interaction.user.id !==
          match.player2
      ) {
        return interaction.reply({
          content:
            "❌ Você não participa dessa AP.",
          ephemeral: true
        });
      }

      db.mediatorRequests[code] = {
        userId: interaction.user.id,
        createdAt: Date.now()
      };

      saveDB();

      const channel =
        interaction.guild.channels.cache.get(
          db.config.mediatorChannelId
        );

      if (channel) {

        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`assumir:${code}`)
              .setLabel("ASSUMIR MEDIADOR")
              .setEmoji("🧑‍⚖️")
              .setStyle(ButtonStyle.Primary)
          );

        await channel.send({
          content:
            `🚨 **PEDIDO DE MEDIADOR**\n` +
            `🆔 AP: \`${code}\`\n` +
            `👤 Pedido por: ${interaction.user}`,
          components: [row]
        });
      }

      return interaction.reply({
        content:
          "🧑‍⚖️ Pedido enviado para a fila de mediadores.",
        ephemeral: true
      });
    }

    // ===========================
    // ASSUMIR MEDIADOR
    // ===========================

    if (
      interaction.customId.startsWith(
        "assumir:"
      )
    ) {

      if (!isMediator(interaction)) {
        return interaction.reply({
          content:
            "❌ Você não é mediador.",
          ephemeral: true
        });
      }

      const code =
        interaction.customId.split(":")[1];

      const match =
        db.matches[code];

      if (!match) {
        return interaction.reply({
          content:
            "❌ AP não encontrada.",
          ephemeral: true
        });
      }

      match.mediator =
        interaction.user.id;

      saveDB();

      return interaction.reply(
        `🧑‍⚖️ ${interaction.user} assumiu a mediação da AP **${code}**.`
      );
    }

    // ===========================
    // ABRIR TICKET
    // ===========================

    if (
      interaction.customId ===
      "ticket:abrir"
    ) {

      const existing =
        db.tickets[interaction.user.id];

      if (existing) {

        const oldChannel =
          interaction.guild.channels.cache.get(
            existing
          );

        if (oldChannel) {
          return interaction.reply({
            content:
              `❌ Você já possui um ticket: ${oldChannel}`,
            ephemeral: true
          });
        }

        delete db.tickets[
          interaction.user.id
        ];
      }

      const channel =
        await interaction.guild.channels.create({
          name:
            `ticket-${interaction.user.username
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .slice(0, 15)}`,
          type: ChannelType.GuildText,
          parent:
            db.config.ticketCategoryId || null,
          permissionOverwrites: [
            {
              id:
                interaction.guild.roles
                  .everyone.id,
              deny: [
                PermissionsBitField.Flags.ViewChannel
              ]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            },
            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
              ]
            }
          ]
        });

      db.tickets[
        interaction.user.id
      ] = channel.id;

      saveDB();

      const embed =
        new EmbedBuilder()
          .setTitle("🎫 Ticket aberto")
          .setDescription(
            `Olá ${interaction.user}!\n\n` +
            "Explique seu problema e aguarde a equipe."
          );

      const row =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket:fechar")
            .setLabel("Fechar Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [row]
      });

      return interaction.reply({
        content:
          `🎫 Ticket criado: ${channel}`,
        ephemeral: true
      });
    }

    // ===========================
    // FECHAR TICKET
    // ===========================

    if (
      interaction.customId ===
      "ticket:fechar"
    ) {

      const ownerId =
        Object.keys(db.tickets).find(
          id =>
            db.tickets[id] ===
            interaction.channel.id
        );

      if (
        !ownerId &&
        !isStaff(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ Não consegui identificar o dono.",
          ephemeral: true
        });
      }

      if (
        ownerId !== interaction.user.id &&
        !isStaff(interaction)
      ) {
        return interaction.reply({
          content:
            "❌ Somente o dono ou a staff pode fechar.",
          ephemeral: true
        });
      }

      if (ownerId) {
        delete db.tickets[ownerId];
        saveDB();
      }

      await interaction.reply(
        "🔒 Ticket será fechado..."
      );

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 2000);

      return;
    }
  }
});

// ===============================
// INVITES
// ===============================

client.on("guildMemberAdd", async member => {

  try {

    const invites =
      await member.guild.invites.fetch();

    const old =
      db.invites[member.guild.id] || {};

    let usedInvite = null;

    for (const invite of invites.values()) {

      const oldUses =
        old[invite.code] || 0;

      if (
        invite.uses >
        oldUses
      ) {
        usedInvite = invite;
        break;
      }
    }

    const newCache = {};

    for (const invite of invites.values()) {
      newCache[invite.code] =
        invite.uses || 0;
    }

    db.invites[
      member.guild.id
    ] = newCache;

    if (
      usedInvite &&
      usedInvite.inviter
    ) {

      const inviter =
        getPlayer(
          usedInvite.inviter.id
        );

      inviter.invites++;

      saveDB();

      await sendLog(
        member.guild,
        `${member.user} entrou pelo convite de ${usedInvite.inviter}.`
      );
    }

  } catch {}
});

// ===============================
// LOGIN
// ===============================

client.login(TOKEN);
