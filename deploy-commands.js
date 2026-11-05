require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const adminOnly = command =>
  command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const addMoneyOptions = (command, amountName, description) => command
  .addNumberOption(option =>
    option.setName(amountName).setDescription(description).setRequired(true).setMinValue(0)
  )
  .addStringOption(option =>
    option.setName('escala')
      .setDescription('Unidade do valor')
      .setRequired(true)
      .addChoices(
        { name: 'K — mil', value: 'k' },
        { name: 'M — milhão', value: 'm' },
        { name: 'B — bilhão', value: 'b' },
        { name: 'T — trilhão', value: 't' }
      )
  );

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Ver todos os comandos e o que cada um faz'),
  new SlashCommandBuilder()
    .setName('central')
    .setDescription('Abrir a Central administrativa ou doar para seu time'),
  new SlashCommandBuilder()
    .setName('ver_juizes')
    .setDescription('Listar os juízes do servidor'),
  new SlashCommandBuilder()
    .setName('convocar')
    .setDescription('Convocar um jogador para uma seleção nacional')
    .addUserOption(option =>
      option.setName('jogador').setDescription('Jogador que receberá a convocação por DM').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('selecao').setDescription('Seleção nacional').setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('elenco_selecao')
    .setDescription('Ver o dono atual e os jogadores convocados de uma seleção')
    .addStringOption(option =>
      option.setName('selecao').setDescription('Seleção nacional').setRequired(true).setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('ownar-team')
    .setDescription('Criar um time personalizado')
    .addStringOption(option =>
      option.setName('nome').setDescription('Nome').setRequired(true).setMaxLength(50)
    )
    .addStringOption(option =>
      option.setName('sigla').setDescription('Sigla de 3 letras').setRequired(true).setMinLength(3).setMaxLength(3)
    )
    .addStringOption(option =>
      option.setName('descricao').setDescription('Descrição').setRequired(true).setMaxLength(300)
    )
    .addStringOption(option =>
      option.setName('convite').setDescription('Link de convite Discord').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('escudo').setDescription('URL do escudo').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('selecionar-team')
    .setDescription('Assumir um clube brasileiro disponível')
    .addStringOption(option =>
      option.setName('clube').setDescription('Clube brasileiro').setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('selecionar-team-champions')
    .setDescription('Assumir um clube europeu disponível')
    .addStringOption(option =>
      option.setName('clube').setDescription('Clube da Champions').setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('selecionar-selecao')
    .setDescription('Assumir uma seleção nacional disponível')
    .addStringOption(option =>
      option.setName('selecao').setDescription('Seleção nacional').setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('sair-team')
    .setDescription('Sair de um time ou seleção')
    .addStringOption(option =>
      option.setName('equipe').setDescription('Time ou seleção que você quer deixar').setRequired(true).setAutocomplete(true)
    )
    .setDMPermission(false),
  adminOnly(
    new SlashCommandBuilder()
      .setName('excluir-team')
      .setDescription('Excluir time (admin)')
      .addStringOption(option =>
        option.setName('sigla').setDescription('Sigla').setRequired(true).setAutocomplete(true)
      )
  ),
  new SlashCommandBuilder()
    .setName('ver-saldo')
    .setDescription('Consultar saldo')
    .addUserOption(option =>
      option.setName('usuario').setDescription('Usuário').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('sigla').setDescription('Sigla do time').setRequired(false).setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('amistoso')
    .setDescription('Convidar outro time para um amistoso')
    .addStringOption(option =>
      option.setName('time_a').setDescription('Seu time ou o time que você gerencia').setRequired(true).setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('time_b').setDescription('Time que receberá o convite').setRequired(true).setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('usuario_roblox').setDescription('Seu nome de usuário no Roblox').setRequired(true).setMaxLength(20)
    )
    .addStringOption(option =>
      option.setName('link_servidor').setDescription('Link do servidor do Roblox').setRequired(true).setMaxLength(500)
    )
    .addStringOption(option =>
      option.setName('horario').setDescription('Brasília UTC-3: AAAA-MM-DD HH:mm; vazio para agora').setRequired(false).setMaxLength(16)
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('resultado-amistoso')
    .setDescription('Registrar o resultado de um amistoso aceito')
    .addIntegerOption(option =>
      option.setName('partida').setDescription('ID da partida em /partidas').setRequired(true).setMinValue(1)
    )
    .addIntegerOption(option =>
      option.setName('gols_a').setDescription('Gols do time A').setRequired(true).setMinValue(0)
    )
    .addIntegerOption(option =>
      option.setName('gols_b').setDescription('Gols do time B').setRequired(true).setMinValue(0)
    )
    .addIntegerOption(option =>
      option.setName('penaltis_a').setDescription('Gols nos pênaltis do time A (opcional)').setRequired(false).setMinValue(0)
    )
    .addIntegerOption(option =>
      option.setName('penaltis_b').setDescription('Gols nos pênaltis do time B (opcional)').setRequired(false).setMinValue(0)
    ),
  adminOnly(
    new SlashCommandBuilder()
      .setName('resultado-ofc')
      .setDescription('Registrar o placar de uma partida OFC (admin)')
      .addStringOption(option =>
        option.setName('categoria').setDescription('Categoria dos times').setRequired(true).addChoices(
          { name: 'Seleções', value: 'selecao' },
          { name: 'Brasileirão', value: 'brasileirao' },
          { name: 'Champions League', value: 'champions' }
        )
      )
      .addStringOption(option =>
        option.setName('competicao').setDescription('Nome do campeonato').setRequired(true).setMaxLength(80)
      )
      .addStringOption(option =>
        option.setName('time_a').setDescription('Time A').setRequired(true).setAutocomplete(true)
      )
      .addStringOption(option =>
        option.setName('time_b').setDescription('Time B').setRequired(true).setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option.setName('gols_a').setDescription('Gols do time A').setRequired(true).setMinValue(0)
      )
      .addIntegerOption(option =>
        option.setName('gols_b').setDescription('Gols do time B').setRequired(true).setMinValue(0)
      )
      .addIntegerOption(option =>
        option.setName('partida').setDescription('ID da partida OFC pendente (recomendado)').setRequired(false).setMinValue(1)
      )
      .addStringOption(option =>
        option.setName('imagem_competicao').setDescription('URL da imagem do campeonato (opcional)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('escudo_a').setDescription('URL do escudo do time A (opcional)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('escudo_b').setDescription('URL do escudo do time B (opcional)').setRequired(false)
      )
      .addIntegerOption(option =>
        option.setName('penaltis_a').setDescription('Gols nos pênaltis do time A (opcional)').setRequired(false).setMinValue(0)
      )
      .addIntegerOption(option =>
        option.setName('penaltis_b').setDescription('Gols nos pênaltis do time B (opcional)').setRequired(false).setMinValue(0)
      )
      .setDMPermission(false)
  ),
  addMoneyOptions(
    new SlashCommandBuilder()
      .setName('proposta')
      .setDescription('Enviar uma proposta de transferência por DM')
      .addStringOption(option =>
        option.setName('jogador').setDescription('Jogador que receberá a proposta').setRequired(true).setAutocomplete(true)
      )
      .addStringOption(option =>
        option.setName('funcao').setDescription('Cargo que o jogador receberá se aceitar').setRequired(true).addChoices(
          { name: 'Jogador', value: 'player' },
          { name: 'Gerente', value: 'manager' }
        )
      )
      .addStringOption(option =>
        option.setName('descricao').setDescription('Descrição da proposta').setRequired(true).setMaxLength(500)
      )
      .addStringOption(option =>
        option.setName('sigla').setDescription('Time que enviará a proposta').setRequired(true).setAutocomplete(true)
      ),
    'valor',
    'Valor da proposta; selecione a escala separadamente (ex.: 2.5)'
  ),
  new SlashCommandBuilder()
    .setName('vender')
    .setDescription('Liberar jogador ou gerente e anunciar como agente livre')
    .addUserOption(option =>
      option.setName('membro').setDescription('Jogador ou gerente do seu time').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('funcao').setDescription('Função que será liberada').setRequired(true).addChoices(
        { name: 'Jogador', value: 'player' },
        { name: 'Gerente', value: 'manager' }
      )
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('free-agency')
    .setDescription('Criar ou atualizar seu anúncio na janela de transferências')
    .addStringOption(option =>
      option.setName('descricao').setDescription('Apresentação para os times').setRequired(true).setMaxLength(500)
    )
    .addStringOption(option =>
      option.setName('nick_roblox').setDescription('Seu nick no Roblox').setRequired(true).setMaxLength(20)
    )
    .addStringOption(option =>
      option.setName('funcao').setDescription('Escolha jogador ou gerente').setRequired(true).addChoices(
        { name: 'Jogador', value: 'player' },
        { name: 'Gerente', value: 'manager' }
      )
    )
    .addStringOption(option =>
      option.setName('posicao').setDescription('Obrigatória para jogador; não permitida para gerente').setRequired(false).addChoices(
        { name: 'GK', value: 'GK' },
        { name: 'MC', value: 'MC' },
        { name: 'ATK', value: 'ATK' },
        { name: 'CB', value: 'CB' }
      )
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Ver perfil, saldo e valor de mercado')
    .addUserOption(option =>
      option.setName('usuario').setDescription('Usuário (padrão: você)').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('elenco-time')
    .setDescription('Ver jogadores e gerente de um time')
    .addStringOption(option =>
      option.setName('time').setDescription('Time para consultar').setRequired(true).setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('extrato')
    .setDescription('Ver o histórico recente do seu saldo')
    .addIntegerOption(option =>
      option.setName('limite').setDescription('Quantidade de movimentações (máximo 20)').setRequired(false).setMinValue(1).setMaxValue(20)
    ),
  addMoneyOptions(
    new SlashCommandBuilder()
      .setName('transferir-saldo')
      .setDescription('Transferir saldo para outro usuário')
      .addUserOption(option =>
        option.setName('usuario').setDescription('Quem receberá o saldo').setRequired(true)
      ),
    'valor',
    'Valor a transferir (ex.: 2.5)'
  ),
  new SlashCommandBuilder()
    .setName('cancelar-proposta')
    .setDescription('Cancelar sua proposta enviada por DM')
    .addUserOption(option =>
      option.setName('jogador').setDescription('Jogador para quem você enviou a proposta').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('descricao').setDescription('Motivo do cancelamento, enviado ao jogador por DM').setRequired(true).setMaxLength(500)
    )
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('estadio')
    .setDescription('Comprar um estádio para seu time')
    .addStringOption(option =>
      option.setName('sigla').setDescription('Seu time').setRequired(true).setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('preco').setDescription('Estádio e preço').setRequired(true).addChoices(
        { name: 'Estádio 1 — 350K', value: 350000 },
        { name: 'Estádio 2 — 700K', value: 700000 },
        { name: 'Estádio 3 — 1M', value: 1000000 },
        { name: 'Estádio 4 — 3,5M', value: 3500000 },
        { name: 'Estádio 5 — 5M', value: 5000000 },
        { name: 'Estádio 6 — 7,5M', value: 7500000 },
        { name: 'Estádio 7 — 10M', value: 10000000 }
      )
    ),
  adminOnly(
    new SlashCommandBuilder()
      .setName('ver-team')
      .setDescription('Ver informações de um time (admin)')
      .addStringOption(option =>
        option.setName('categoria').setDescription('Categoria do time').setRequired(true).addChoices(
          { name: 'Brasileirão', value: 'brasileirao' },
          { name: 'Copa do Mundo', value: 'copa-do-mundo' },
          { name: 'Champions League', value: 'champions' }
        )
      )
      .addStringOption(option =>
        option.setName('time').setDescription('Time da categoria selecionada').setRequired(true).setAutocomplete(true)
      )
  ),
  adminOnly(
    new SlashCommandBuilder()
      .setName('salarios')
      .setDescription('Pagar salário no valor integral do jogador (admin)')
      .addUserOption(option =>
        option.setName('jogador').setDescription('Pagar o salário deste jogador').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('time').setDescription('Pagar o salário de todos os jogadores deste time').setRequired(false).setAutocomplete(true)
      )
      .addBooleanOption(option =>
        option.setName('everyone').setDescription('Pagar o salário de todos os jogadores cadastrados').setRequired(false)
      )
  )
];

async function registerCommands({
  token = process.env.DISCORD_TOKEN,
  clientId = process.env.CLIENT_ID,
  guildId = process.env.GUILD_ID
} = {}) {
  const commandDefinitions = commands.map(command => command.toJSON());
  const commandNames = commandDefinitions.map(command => command.name);
  if (new Set(commandNames).size !== commandNames.length) {
    throw new Error('Há nomes de comandos duplicados na lista de registro.');
  }
  if (!token || !clientId || !guildId) {
    throw new Error('Preencha DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas Secrets.');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const currentFriendlyCommand = commandDefinitions.find(command => command.name === 'amistoso');
  const globalCommands = await rest.get(Routes.applicationCommands(clientId));
  const removedGlobalCommandNames = new Set([
    'partidas',
    'tabela',
    'criar',
    'gerenciar-time',
    'money',
    'ofc',
    'playercusto',
    'valordoplayer',
    'doar-time',
    'home-away',
    'copa',
    'shouts',
    'fixtures'
  ]);
  const obsoleteGlobalCommands = globalCommands.filter(command =>
    removedGlobalCommandNames.has(command.name) ||
    (command.name === 'amistoso' &&
      (command.options?.length || 0) < (currentFriendlyCommand?.options.length || 0))
  );
  for (const command of obsoleteGlobalCommands) {
    await rest.delete(Routes.applicationCommand(clientId, command.id));
    console.log(`Removido comando global antigo /${command.name}.`);
  }

  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commandDefinitions }
  );
  return { count: commandDefinitions.length, names: commandNames };
}

module.exports = { commands, registerCommands };

if (require.main === module) {
  registerCommands()
    .then(({ count, names }) => {
      console.log(
        `Registrados ${count} comandos no servidor ${process.env.GUILD_ID}: ${names.join(', ')}`
      );
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
