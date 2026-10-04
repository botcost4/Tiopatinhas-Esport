const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Testa se o bot está funcionando"),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Mostra informações do bot")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registrarComandos() {
  try {
    console.log("Registrando comandos...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("Comandos registrados!");
  } catch (error) {
    console.error(error);
  }
}

client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("🏓 Pong! O bot está funcionando!");
  }

  if (interaction.commandName === "info") {
    await interaction.reply(
      "🤖 **Tiopatinhas E-sports**\nBot oficial da organização."
    );
  }
});

if (!TOKEN || !CLIENT_ID) {
  console.error("Configure DISCORD_TOKEN e CLIENT_ID.");
  process.exit(1);
}

registrarComandos();
client.login(TOKEN);
