const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// TOKEN DO BOT E LINK DA SUA IMAGEM DA ORG
const TOKEN = 'SEU_TOKEN_AQUI';
const URL_DA_IMAGEM = 'https://i.imgur.com/SEU_LINK_AQUI.png'; // Substitua pelo link direto da imagem fornecida

client.once('ready', () => {
    console.log(`🔥 Bot Tio Patinhas E-Sports online como ${client.user.tag}!`);
});

// Comando para enviar o painel de atendimento (Apenas admins)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!ticket-painel') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Você não tem permissão para usar este comando.');
        }

        const embed = new EmbedBuilder()
            .setTitle('👑 TIOPATINHAS E-SPORTS | CENTRAL DE ATENDIMENTO')
            .setDescription(
                '**A MELHOR ORG DE AP!** 🚀\n\n' +
                'Precisa de suporte, tirar dúvidas ou tratar sobre campeonatos?\n' +
                'Clique no botão abaixo para abrir um Ticket individual com nossa equipe.'
            )
            .setColor('#0066FF') // Azul elétrico combinando com a logo
            .setImage(URL_DA_IMAGEM)
            .setFooter({ text: 'Tio Patinhas E-Sports • Free Fire', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('abrir_ticket')
                .setLabel('Abrir Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👑')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }
});

// Gerenciador de interações (Cliques nos botões)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // ABRIR TICKET
    if (interaction.customId === 'abrir_ticket') {
        const canalExistente = interaction.guild.channels.cache.find(
            c => c.name === `ticket-${interaction.user.username.toLowerCase()}`
        );

        if (canalExistente) {
            return interaction.reply({
                content: `⚠️ Você já possui um ticket aberto em ${canalExistente}!`,
                ephemeral: true
            });
        }

        // Criar canal de atendimento privado
        const canal = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
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
                        PermissionsBitField.Flags.AttachFiles
                    ]
                }
            ]
        });

        const embedBoasVindas = new EmbedBuilder()
            .setTitle('👑 ATENDIMENTO TIOPATINHAS E-SPORTS')
            .setDescription(`Olá ${interaction.user}, bem-vindo ao suporte da **Tio Patinhas E-Sports**!\n\nDescreva detalhadamente o motivo do seu contato. Nossa equipe responderá em breve.`)
            .setColor('#0066FF')
            .setThumbnail(URL_DA_IMAGEM);

        const botaoFechar = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fechar_ticket')
                .setLabel('Fechar Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        await canal.send({ embeds: [embedBoasVindas], components: [botaoFechar] });

        await interaction.reply({
            content: `✅ Seu ticket foi criado com sucesso: ${canal}`,
            ephemeral: true
        });
    }

    // FECHAR TICKET
    if (interaction.customId === 'fechar_ticket') {
        await interaction.reply('🔒 Este ticket será encerrado em 5 segundos...');
        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 5000);
    }
});

client.login(TOKEN);
