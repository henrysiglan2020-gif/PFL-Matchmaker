require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const choices = ['Flamengo','Palmeiras','Corinthians','São Paulo','Santos','Vasco','Fluminense','Botafogo','Grêmio','Internacional','Atlético Mineiro','Cruzeiro','Bahia','Fortaleza','Athletico Paranaense','Sport Recife'];
const commands = [
new SlashCommandBuilder().setName('ownar-team').setDescription('Criar um time personalizado')
.addStringOption(o=>o.setName('nome').setDescription('Nome').setRequired(true).setMaxLength(50))
.addStringOption(o=>o.setName('sigla').setDescription('Sigla de 3 letras').setRequired(true).setMinLength(3).setMaxLength(3))
.addStringOption(o=>o.setName('descricao').setDescription('Descrição').setRequired(true).setMaxLength(300))
.addStringOption(o=>o.setName('convite').setDescription('Link de convite Discord').setRequired(true))
.addStringOption(o=>o.setName('escudo').setDescription('URL do escudo').setRequired(false)),
new SlashCommandBuilder().setName('selecionar-team').setDescription('Assumir um clube disponível').addStringOption(o=>o.setName('clube').setDescription('Clube').setRequired(true).addChoices(...choices.map(c=>({name:c,value:c})))),
new SlashCommandBuilder().setName('excluir-team').setDescription('Excluir time (admin)').addStringOption(o=>o.setName('sigla').setDescription('Sigla').setRequired(true)),
new SlashCommandBuilder().setName('moneyvalue').setDescription('Ver seu saldo'),
new SlashCommandBuilder().setName('ver-saldo').setDescription('Consultar saldo').addUserOption(o=>o.setName('usuario').setDescription('Usuário').setRequired(false)).addStringOption(o=>o.setName('sigla').setDescription('Sigla do time').setRequired(false)),
new SlashCommandBuilder().setName('money').setDescription('Ajustar saldo (admin)').addStringOption(o=>o.setName('alvo').setDescription('ID de usuário ou sigla do time').setRequired(true)).addIntegerOption(o=>o.setName('quantia').setDescription('Quantia').setRequired(true).setMinValue(1)).addStringOption(o=>o.setName('acao').setDescription('Ação').setRequired(true).addChoices({name:'Adicionar',value:'add'},{name:'Retirar',value:'remove'})),
new SlashCommandBuilder().setName('amistoso').setDescription('Registrar resultado de amistoso')
.addStringOption(o=>o.setName('time_a').setDescription('Time A').setRequired(true).setAutocomplete(true))
.addStringOption(o=>o.setName('time_b').setDescription('Time B').setRequired(true).setAutocomplete(true))
.addIntegerOption(o=>o.setName('gols_a').setDescription('Gols do time A').setRequired(true).setMinValue(0))
.addIntegerOption(o=>o.setName('gols_b').setDescription('Gols do time B').setRequired(true).setMinValue(0))
.addIntegerOption(o=>o.setName('penaltis_a').setDescription('Gols nos pênaltis do time A (opcional)').setRequired(false).setMinValue(0))
.addIntegerOption(o=>o.setName('penaltis_b').setDescription('Gols nos pênaltis do time B (opcional)').setRequired(false).setMinValue(0))
.addStringOption(o=>o.setName('competicao').setDescription('Nome da competição').setRequired(false).setMaxLength(80))
.addStringOption(o=>o.setName('simbolo_competicao').setDescription('URL do símbolo da competição').setRequired(false))
.addStringOption(o=>o.setName('escudo_a').setDescription('URL do símbolo do time A').setRequired(false))
.addStringOption(o=>o.setName('escudo_b').setDescription('URL do símbolo do time B').setRequired(false)),
new SlashCommandBuilder().setName('ofc').setDescription('Criar partida OFC (admin)')
.addStringOption(o=>o.setName('time_a').setDescription('Time ou seleção A').setRequired(true).setAutocomplete(true))
.addStringOption(o=>o.setName('time_b').setDescription('Time ou seleção B').setRequired(true).setAutocomplete(true))
.addStringOption(o=>o.setName('competicao').setDescription('Nome da competição').setRequired(true).setMaxLength(80))
.addStringOption(o=>o.setName('simbolo_competicao').setDescription('URL do símbolo da competição').setRequired(false))
.addStringOption(o=>o.setName('escudo_a').setDescription('URL do símbolo do time/seleção A').setRequired(false))
.addStringOption(o=>o.setName('escudo_b').setDescription('URL do símbolo do time/seleção B').setRequired(false)),
new SlashCommandBuilder().setName('resultado-ofc').setDescription('Registrar o resultado da OFC (admin)')
.addIntegerOption(o=>o.setName('id').setDescription('ID da partida').setRequired(true).setMinValue(1))
.addIntegerOption(o=>o.setName('gols_a').setDescription('Gols do time A').setRequired(true).setMinValue(0))
.addIntegerOption(o=>o.setName('gols_b').setDescription('Gols do time B').setRequired(true).setMinValue(0))
.addIntegerOption(o=>o.setName('penaltis_a').setDescription('Gols nos pênaltis do time A (opcional)').setRequired(false).setMinValue(0))
.addIntegerOption(o=>o.setName('penaltis_b').setDescription('Gols nos pênaltis do time B (opcional)').setRequired(false).setMinValue(0)),
new SlashCommandBuilder().setName('valordoplayer').setDescription('Ver valor do jogador').addUserOption(o=>o.setName('jogador').setDescription('Jogador').setRequired(true)),
new SlashCommandBuilder().setName('playercusto').setDescription('Definir valor do jogador (admin)').addUserOption(o=>o.setName('jogador').setDescription('Jogador').setRequired(true)).addIntegerOption(o=>o.setName('valor').setDescription('Valor').setRequired(true).setMinValue(0)),
new SlashCommandBuilder().setName('oferta').setDescription('Criar oferta de transferência').addStringOption(o=>o.setName('time_destino').setDescription('Escolha o time comprador').setRequired(true).setAutocomplete(true)).addUserOption(o=>o.setName('jogador').setDescription('Jogador').setRequired(true)).addIntegerOption(o=>o.setName('preco').setDescription('Preço').setRequired(true).setMinValue(0)),
new SlashCommandBuilder().setName('estadio').setDescription('Comprar estádio').addStringOption(o=>o.setName('sigla').setDescription('Seu time').setRequired(true)).addIntegerOption(o=>o.setName('preco').setDescription('Preço').setRequired(true).addChoices({name:'350K',value:350000},{name:'700K',value:700000},{name:'1M',value:1000000},{name:'3.5M',value:3500000})),
new SlashCommandBuilder().setName('salarios').setDescription('Pagar salários vencidos (admin)'),
new SlashCommandBuilder().setName('copa').setDescription('Ver estado da copa')
];
(async()=>{if(!process.env.DISCORD_TOKEN||!process.env.CLIENT_ID||!process.env.GUILD_ID)throw Error('Preencha DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas Secrets');const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body:commands.map(c=>c.toJSON())});console.log(`Registrados ${commands.length} comandos.`)})().catch(e=>{console.error(e);process.exit(1)});
