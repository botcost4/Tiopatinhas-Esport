const http = require("http");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Servidor necessário para o Railway
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Tiopatinhas E-sports Bot está online!");
});

server.listen(process.env.PORT || 3000, "0.0.0.0");

// Comandos
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Testa se o bot está funcionando"),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Mostra informações do bot"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Envia o painel para abrir ticket")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// Registrar comandos
async function registrarComandos() {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log("Comandos registrados!");
}

// Bot conectado
client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

// Interações
client.on("interactionCreate", async interaction => {

  // Comandos
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "ping") {
      await interaction.reply("🏓 Pong! Bot funcionando!");
    }

    if (interaction.commandName === "info") {
      await interaction.reply(
        "🤖 **Tiopatinhas E-sports**\nBot oficial da organização."
      );
    }

    if (interaction.commandName === "ticket") {

      const botao = new ButtonBuilder()
        .setCustomId("abrir_ticket")
        .setLabel("Abrir Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary);

      const linha = new ActionRowBuilder()
        .addComponents(botao);

      await interaction.reply({
        content: "🎫 **Suporte Tiopatinhas E-sports**\nClique no botão abaixo para abrir um ticket.",
        components: [linha]
      });
    }
  }

  // Botão Abrir Ticket
  if (interaction.isButton() && interaction.customId === "abrir_ticket") {

    const nomeCanal = `ticket-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 20);

    // Evita criar vários tickets iguais
    const canalExistente = interaction.guild.channels.cache.find(
      channel => channel.name === nomeCanal
    );

    if (canalExistente) {
      return interaction.reply({
        content: `🎫 Você já possui um ticket aberto: ${canalExistente}`,
        ephemeral: true
      });
    }

    const canal = await interaction.guild.channels.create({
      name: nomeCanal,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
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

    await canal.send(
      `🎫 **Ticket aberto!**\n\nOlá ${interaction.user}, explique aqui o que você precisa.\n\nA equipe da **Tiopatinhas E-sports** irá atender você.`
    );

    await interaction.reply({
      content: `✅ Seu ticket foi criado: ${canal}`,
      ephemeral: true
    });
  }
});

// Verificar configurações
if (!TOKEN || !CLIENT_ID) {
  console.error("DISCORD_TOKEN ou CLIENT_ID não configurado.");
  process.exit(1);
}

// Iniciar
registrarComandos()
  .then(() => client.login(TOKEN))
  .catch(console.error);
