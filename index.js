const http = require("http");
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

// Página simples para o Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Tiopatinhas E-sports Bot está online!");
});

server.listen(process.env.PORT || 3000, "0.0.0.0");

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
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log("Comandos registrados!");
}

client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("🏓 Pong! Bot funcionando!");
  }

  if (interaction.commandName === "info") {
    await interaction.reply(
      "🤖 **Tiopatinhas E-sports**\nBot oficial da organização."
    );
  }
});

if (!TOKEN || !CLIENT_ID) {
  console.error("DISCORD_TOKEN ou CLIENT_ID não configurado.");
  process.exit(1);
}

registrarComandos()
  .then(() => client.login(TOKEN))
  .catch(console.error);
