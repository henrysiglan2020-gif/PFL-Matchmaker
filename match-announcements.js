const { randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { SHIELD_CATEGORIES, shieldEmojiChoices } = require('./match-statistics');

const sessions = new Map();
const SESSION_TTL = 14 * 60 * 1000;
const BUILTIN_EMOJIS = [
  ['Futebol', '⚽'],
  ['Bola', '🥅'],
  ['Troféu', '🏆'],
  ['Escudo', '🛡️'],
  ['Brasil', '🇧🇷'],
  ['Argentina', '🇦🇷'],
  ['Azul', '🔵'],
  ['Vermelho', '🔴'],
  ['Verde', '🟢'],
  ['Amarelo', '🟡'],
  ['Preto', '⚫'],
  ['Branco', '⚪'],
  ['Estrela', '⭐'],
  ['Raio', '⚡'],
  ['Fogo', '🔥'],
  ['Lua', '🌕']
];
const SHOUT_FIELDS = [
  { key: 'competitionName', label: 'Nome da categoria/competição', maxLength: 80, required: true },
  { key: 'homeName', label: 'Nome do time da casa', maxLength: 80, required: true },
  { key: 'awayName', label: 'Nome do time visitante', maxLength: 80, required: true },
  { key: 'round', label: 'Fase', maxLength: 60, required: true },
  { key: 'leg', label: 'Jogo/leg', maxLength: 40, required: true },
  { key: 'server', label: 'Link do servidor Roblox', maxLength: 300, required: true },
  { key: 'robloxUser', label: 'Usuário Roblox', maxLength: 40, required: true },
  { key: 'stadiumName', label: 'Nome do estádio (opcional)', maxLength: 80, required: false },
  { key: 'stadiumLevel', label: 'Número do estádio (1 a 7)', maxLength: 1, required: true },
  { key: 'roles', label: 'Menções de cargos (opcional)', maxLength: 200, required: false }
];
const FIXTURE_FIELDS = {
  postpone: [
    { key: 'competitionName', label: 'Nome da categoria/competição', maxLength: 80, required: true },
    { key: 'homeName', label: 'Nome do time da casa', maxLength: 80, required: true },
    { key: 'awayName', label: 'Nome do time visitante', maxLength: 80, required: true },
    { key: 'dateDay', label: 'Dia/mês (ex.: 1/12)', maxLength: 5, required: true },
    { key: 'time', label: 'Horário (ex.: 12 horas ou 17:30)', maxLength: 30, required: true },
    { key: 'mentions', label: 'Menções (opcional)', maxLength: 200, required: false }
  ],
  prediction: [
    { key: 'question', label: 'Pergunta', maxLength: 150, required: true },
    { key: 'homeName', label: 'Nome do time da casa', maxLength: 80, required: true },
    { key: 'awayName', label: 'Nome do time visitante', maxLength: 80, required: true },
    { key: 'mentions', label: 'Menções (opcional)', maxLength: 200, required: false }
  ]
};

const expireTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}, 10 * 60 * 1000);
expireTimer.unref();

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(id, label, style, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function componentId(id, action) {
  return `announcement:${id}:${action}`;
}

function createSession(userId, guildId, type) {
  const id = randomUUID().replaceAll('-', '').slice(0, 16);
  sessions.set(id, {
    id,
    ownerId: userId,
    guildId,
    type,
    mode: null,
    fields: {},
    emojis: { competition: '', home: '', away: '' },
    emojiTarget: 'home',
    emojiPage: 0,
    shieldCategory: 'all',
    period: 'Night',
    drafts: [],
    channelId: null,
    expiresAt: Date.now() + SESSION_TTL
  });
  return sessions.get(id);
}

function sessionFields(session) {
  return session.type === 'shouts'
    ? SHOUT_FIELDS
    : FIXTURE_FIELDS[session.mode] || [];
}

function renderAnnouncement(session) {
  const value = key => session.fields[key] || '';
  const team = side => `${session.emojis[side] || ''} ${value(`${side}Name`) || `[${side === 'home' ? 'time da casa' : 'time visitante'}]`}`.trim();
  const competition = `${session.emojis.competition || ''} ${value('competitionName') || '[competição]'}`.trim();
  if (session.type === 'fixtures' && !session.mode) {
    return 'Escolha POSTPONE ou Prediction para começar a montar o anúncio.';
  }
  if (session.type === 'shouts') {
    const header = `# ${competition} | ${team('home')} ⚔️ ${team('away')} | ${value('round') || '[fase]'} | ${value('leg') || '[jogo/leg]'}`;
    const lines = [
      header,
      value('server') || '[link do servidor Roblox]',
      value('robloxUser') || '[usuário Roblox]',
      '',
      `🏟️ | ${value('stadiumName') || `Estádio ${value('stadiumLevel') || '[número]'}`}${value('stadiumName') ? ` (Estádio ${value('stadiumLevel') || '[número]'})` : ''}`,
      `${session.period === 'Day' ? '☀️' : '🌕'} | ${session.period}`
    ];
    if (value('roles')) lines.push('', `-# ${value('roles')}`);
    return lines.join('\n');
  }

  if (session.mode === 'postpone') {
    return [
      '# POSTPONE',
      `${competition} | ${team('home')} ⚔️ ${team('away')} | ${value('dateDay') || '[dia/mês]'} ⚪ ${value('time') || '[horário]'}`,
      value('mentions') || ''
    ].filter(Boolean).join('\n');
  }

  return [
    '# Prediction',
    `-# ${value('question') || 'quem vocês acham que ganha?'}`,
    '',
    `${team('home')} ⚔️ ${team('away')}`,
    '',
    value('mentions') ? `|| ${value('mentions')} ||` : ''
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n');
}

function availableEmojis(guild, session) {
  const custom = [
    ...(guild?.emojis?.cache?.values?.() || []),
    ...(guild?.client?.application?.emojis?.cache?.values?.() || [])
  ];
  const uniqueCustom = [...new Map(custom.map(emoji => [emoji.id, emoji])).values()]
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  if (session.emojiTarget !== 'competition') {
    if (session.shieldCategory === 'all') {
      return uniqueCustom.map(emoji => ({ label: `:${emoji.name}:`, value: emoji.toString() }));
    }
    return shieldEmojiChoices(guild, session.shieldCategory);
  }
  return [
    ...BUILTIN_EMOJIS.map(([label, value]) => ({ label, value })),
    ...uniqueCustom.map(emoji => ({ label: `:${emoji.name}:`, value: emoji.toString() }))
  ];
}

function announcementPayload(session, guild, notice = '') {
  const isShouts = session.type === 'shouts';
  const title = isShouts ? 'Editor de Shouts' : 'Editor de Fixtures';
  const embed = new EmbedBuilder()
    .setColor(isShouts ? 0x2ecc71 : 0xe74c3c)
    .setTitle(title)
    .setDescription(renderAnnouncement(session))
    .setFooter({ text: `Canal: ${session.channelId ? `<#${session.channelId}>` : 'não escolhido'} • sessão expira em 14 minutos` });
  const components = [];

  if (!isShouts && !session.mode) {
    components.push(row(
      button(componentId(session.id, 'mode:postpone'), 'POSTPONE', ButtonStyle.Danger),
      button(componentId(session.id, 'mode:prediction'), 'Prediction', ButtonStyle.Primary)
    ));
    components.push(row(button(componentId(session.id, 'cancel'), 'Cancelar', ButtonStyle.Secondary)));
  } else {
    const fields = sessionFields(session);
    const fieldOptions = fields.map(field =>
        new StringSelectMenuOptionBuilder()
          .setLabel(field.label)
          .setValue(field.key)
          .setDescription(session.fields[field.key] ? 'Editar valor atual' : 'Preencher este campo')
      );
    if (isShouts) {
      fieldOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('☀️ Período: Dia')
          .setValue('period:Day')
          .setDescription(session.period === 'Day' ? 'Selecionado' : 'Selecionar Dia')
          .setDefault(session.period === 'Day'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🌕 Período: Noite')
          .setValue('period:Night')
          .setDescription(session.period === 'Night' ? 'Selecionado' : 'Selecionar Noite')
          .setDefault(session.period === 'Night')
      );
    }
    fieldOptions.push(
      ...SHIELD_CATEGORIES.map(category =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`📂 Escudos: ${category.label}`)
          .setValue(`shield-category:${category.value}`)
          .setDescription('Filtrar os escudos disponíveis por categoria')
      ),
      new StringSelectMenuOptionBuilder()
        .setLabel('📂 Escudos: Todos do servidor')
        .setValue('shield-category:all')
        .setDescription('Mostrar todos os emojis personalizados do servidor'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🏆 Aplicar emoji na competição')
        .setValue('emoji-target:competition')
        .setDescription('O próximo emoji escolhido será o da competição'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🏠 Aplicar escudo no time da casa')
        .setValue('emoji-target:home')
        .setDescription('O próximo escudo escolhido será do time da casa'),
      new StringSelectMenuOptionBuilder()
        .setLabel('✈️ Aplicar escudo no time visitante')
        .setValue('emoji-target:away')
        .setDescription('O próximo escudo escolhido será do time visitante')
    );
    const fieldSelect = new StringSelectMenuBuilder()
      .setCustomId(componentId(session.id, 'field'))
      .setPlaceholder('Editar campos, categoria dos escudos ou destino do emoji')
      .addOptions(fieldOptions);
    components.push(row(fieldSelect));
    const emojiChoices = availableEmojis(guild, session);
    const pageSize = 23;
    const pageCount = Math.max(1, Math.ceil(emojiChoices.length / pageSize));
    session.emojiPage = Math.min(session.emojiPage, pageCount - 1);
    const options = emojiChoices.length
      ? emojiChoices
      .slice(session.emojiPage * pageSize, (session.emojiPage + 1) * pageSize)
      .map((choice, index) => new StringSelectMenuOptionBuilder()
        .setLabel(choice.label.slice(0, 100))
        .setValue(String(session.emojiPage * pageSize + index))
        .setEmoji(choice.value || '❌')
        .setDefault(choice.value === session.emojis[session.emojiTarget]))
      : [new StringSelectMenuOptionBuilder()
        .setLabel('Nenhum escudo encontrado nesta categoria')
        .setValue('no-results')
        .setEmoji('⚠️')];
    if (session.emojiPage > 0) {
      options.unshift(new StringSelectMenuOptionBuilder()
        .setLabel('← Emojis anteriores')
        .setValue('page:previous')
        .setEmoji('⬅️'));
    }
    if (session.emojiPage < pageCount - 1) {
      options.push(new StringSelectMenuOptionBuilder()
        .setLabel('Próximos emojis →')
        .setValue('page:next')
        .setEmoji('➡️'));
    }
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(session.id, 'emoji-pick'))
      .setPlaceholder(`${session.emojiTarget === 'competition' ? 'Emoji da competição' : `Escudo • ${session.emojiTarget === 'home' ? 'time da casa' : 'time visitante'}`} • ${session.shieldCategory === 'all' ? 'todos' : SHIELD_CATEGORIES.find(category => category.value === session.shieldCategory)?.label || 'categoria'} • ${session.emojiPage + 1}/${pageCount}`)
      .addOptions(options)));
    components.push(row(
      new ChannelSelectMenuBuilder()
        .setCustomId(componentId(session.id, 'channel'))
        .setPlaceholder('Escolha o canal para publicar')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    ));
    components.push(row(
      button(componentId(session.id, 'queue-add'), 'Adicionar à fila', ButtonStyle.Primary),
      button(componentId(session.id, 'queue-undo'), 'Desfazer último', ButtonStyle.Secondary, session.drafts.length === 0),
      button(componentId(session.id, 'publish'), 'Publicar fila', isShouts ? ButtonStyle.Success : ButtonStyle.Danger),
      ...(session.type === 'fixtures'
        ? [button(componentId(session.id, 'mode:change'), 'Trocar modelo', ButtonStyle.Secondary)]
        : []),
      button(componentId(session.id, 'cancel'), 'Cancelar', ButtonStyle.Secondary)
    ));
  }
  const queueInfo = session.drafts.length
    ? `Fila: **${session.drafts.length}** anúncio(s) pronto(s). Adicione outros ou publique a fila.`
    : 'A fila está vazia. Preencha este anúncio e clique em **Adicionar à fila** para montar vários antes de publicar.';
  const queuePreview = session.drafts.slice(0, 8).map((draft, index) => {
    const home = `${draft.emojis.home} ${draft.fields.homeName}`.trim();
    const away = `${draft.emojis.away} ${draft.fields.awayName}`.trim();
    const when = draft.fields.dateDay
      ? ` • ${draft.fields.dateDay} ⚪ ${draft.fields.time}`
      : '';
    const mode = draft.mode === 'postpone' ? 'POSTPONE' : draft.mode === 'prediction' ? 'Prediction' : 'Shouts';
    const period = draft.type === 'shouts'
      ? ` • ${draft.fields.stadiumName ? `${draft.fields.stadiumName} (Estádio ${draft.fields.stadiumLevel})` : `Estádio ${draft.fields.stadiumLevel}`} • ${draft.period === 'Day' ? 'Dia' : 'Noite'}`
      : '';
    return `${index + 1}. **${mode}** ${home} ⚔️ ${away}${when}${period}`.slice(0, 180);
  });
  if (session.drafts.length > queuePreview.length) {
    queuePreview.push(`…e mais ${session.drafts.length - queuePreview.length} anúncio(s).`);
  }
  return {
    content: [
      notice,
      queueInfo,
      ...queuePreview,
      `Escudos: **${session.shieldCategory === 'all' ? 'todos do servidor' : SHIELD_CATEGORIES.find(category => category.value === session.shieldCategory)?.label || 'categoria'}** • destino do próximo emoji: **${session.emojiTarget === 'competition' ? 'competição' : session.emojiTarget === 'home' ? 'time da casa' : 'time visitante'}**.`,
      'Escolha o destino, filtre pela categoria e selecione o escudo visualmente. Confira a prévia antes de adicionar à fila.'
    ]
      .filter(Boolean).join('\n'),
    embeds: [embed],
    components,
    ephemeral: true,
    allowedMentions: { parse: [] }
  };
}

function editModal(session, field) {
  const modal = new ModalBuilder()
    .setCustomId(componentId(session.id, `edit:${field.key}`))
    .setTitle(`Editar ${field.label}`.slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(field.label.slice(0, 45))
    .setStyle(field.maxLength > 120 ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(field.maxLength);
  const currentValue = session.fields[field.key];
  if (currentValue) input.setValue(currentValue);
  modal.addComponents(row(input));
  return modal;
}

function mentionsFor(content, allowEveryone = false) {
  const roles = [...content.matchAll(/<@&(\d+)>/g)].map(match => match[1]);
  return {
    parse: allowEveryone && /@(everyone|here)\b/.test(content) ? ['everyone'] : [],
    users: [],
    roles: [...new Set(roles)]
  };
}

function validateAnnouncement(session) {
  const missing = sessionFields(session)
    .filter(field => field.required && !session.fields[field.key]?.trim())
    .map(field => field.label);
  if (missing.length) {
    return `Preencha estes campos antes de publicar: ${missing.join(', ')}.`;
  }
  if (session.type === 'shouts') {
    if (!/^[1-7]$/.test(session.fields.stadiumLevel || '')) {
      return 'O número do estádio é obrigatório e deve ser de 1 a 7.';
    }
    try {
      const url = new URL(session.fields.server);
      if (url.protocol !== 'https:' || !/(^|\.)roblox\.com$/i.test(url.hostname)) {
        return 'O link do servidor precisa ser uma URL HTTPS de roblox.com.';
      }
    } catch {
      return 'Informe um link válido do servidor Roblox.';
    }
  }
  if (!session.emojis.home || !session.emojis.away ||
      ((session.type === 'shouts' || session.mode === 'postpone') && !session.emojis.competition)) {
    return 'Escolha o emoji da competição e os escudos dos dois times antes de adicionar à fila ou publicar.';
  }
  if (session.type === 'fixtures' && session.mode === 'postpone') {
    const dateMatch = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])$/.exec(session.fields.dateDay || '');
    if (!dateMatch) {
      return 'Informe o dia e o mês no formato D/M, por exemplo `1/12`.';
    }
    const [, dayText, monthText] = dateMatch;
    const day = Number(dayText);
    const month = Number(monthText);
    const daysInMonth = new Date(Date.UTC(2024, month, 0)).getUTCDate();
    if (day > daysInMonth) {
      return 'Esse dia não existe no mês informado. Confira o campo dia/mês.';
    }
    const time = (session.fields.time || '').trim();
    const timeMatch = /^(2[0-3]|[01]?\d)(?::([0-5]\d))?(?:\s*(?:h|horas?))?$/i.exec(time);
    if (!timeMatch) {
      return 'Informe um horário válido, como `12 horas`, `12h` ou `17:30`.';
    }
    session.fields.time = timeMatch[2]
      ? `${timeMatch[1]}:${timeMatch[2]}`
      : `${timeMatch[1]} horas`;
  }
  if (renderAnnouncement(session).length > 2000) {
    return 'O anúncio excede o limite de 2.000 caracteres do Discord.';
  }
  return null;
}

async function handleMatchAnnouncementInteraction(i, { admin }) {
  const centralCommand = ['central:shouts', 'central:fixtures'].includes(i.customId);
  if (centralCommand) {
    if (!i.inGuild()) {
      await i.reply({ content: 'Use este comando dentro do servidor.', ephemeral: true });
      return true;
    }
    if (!admin(i)) {
      await i.reply({ content: 'Apenas administradores podem publicar estes anúncios.', ephemeral: true });
      return true;
    }
    const emojiErrors = [];
    const emojiFetches = [
      ['do servidor', () => i.guild.emojis.fetch()],
      ['da aplicação', () => i.client.application?.emojis?.fetch()]
    ];
    await Promise.all(emojiFetches.map(async ([source, fetch]) => {
      try {
        await fetch();
      } catch (error) {
        console.error(`Falha ao carregar emojis ${source} para a Central no servidor ${i.guildId}:`, error);
        emojiErrors.push(source);
      }
    }));
    const emojiNotice = emojiErrors.length
      ? `Não foi possível carregar os emojis ${emojiErrors.join(' e ')}; os demais emojis disponíveis continuam na lista.`
      : '';
    const type = i.customId.slice('central:'.length);
    const session = createSession(i.user.id, i.guildId, type);
    await i.update(announcementPayload(session, i.guild, emojiNotice));
    return true;
  }

  const customId = i.customId;
  if (!customId?.startsWith('announcement:')) return false;
  if (!i.inGuild()) {
    await i.reply({ content: 'Use esta ferramenta dentro do servidor.', ephemeral: true });
    return true;
  }
  if (!admin(i)) {
    await i.reply({ content: 'Apenas administradores podem publicar estes anúncios.', ephemeral: true });
    return true;
  }

  const [, id, action, detail] = customId.split(':');
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now() ||
      session.guildId !== i.guildId || session.ownerId !== i.user.id) {
    sessions.delete(id);
    await i.reply({
      content: 'Esta sessão expirou ou pertence a outra pessoa. Abra Shouts ou Fixtures novamente pela Central.',
      ephemeral: true
    });
    return true;
  }

  if (i.isButton() && action === 'mode' && detail === 'change') {
    session.mode = null;
    session.fields = {};
    session.emojis = { competition: '', home: '', away: '' };
    await i.update(announcementPayload(session, i.guild, 'Escolha o modelo do próximo anúncio. A fila atual será mantida.'));
    return true;
  }

  if (i.isButton() && action === 'mode') {
    if (!Object.hasOwn(FIXTURE_FIELDS, detail)) {
      await i.reply({ content: 'Escolha um modelo válido para Fixtures.', ephemeral: true });
      return true;
    }
    session.mode = detail;
    session.fields = detail === 'postpone'
      ? {}
      : { question: 'quem vocês acham que ganha?' };
    await i.update(announcementPayload(session, i.guild));
    return true;
  }

  if (i.isStringSelectMenu() && action === 'field') {
    if (i.values[0] === 'period:Day' || i.values[0] === 'period:Night') {
      session.period = i.values[0].slice('period:'.length);
      await i.update(announcementPayload(session, i.guild, `Período atualizado para ${session.period === 'Day' ? 'Dia' : 'Noite'}.`));
      return true;
    }
    if (i.values[0].startsWith('shield-category:')) {
      const category = i.values[0].slice('shield-category:'.length);
      if (category !== 'all' && !SHIELD_CATEGORIES.some(candidate => candidate.value === category)) {
        await i.reply({ content: 'Escolha uma categoria válida para filtrar os escudos.', ephemeral: true });
        return true;
      }
      session.shieldCategory = category;
      session.emojiPage = 0;
      await i.update(announcementPayload(session, i.guild, 'Filtro de categoria atualizado. Confira o destino antes de escolher o escudo.'));
      return true;
    }
    if (i.values[0].startsWith('emoji-target:')) {
      const target = i.values[0].slice('emoji-target:'.length);
      if (!['competition', 'home', 'away'].includes(target)) {
        await i.reply({ content: 'Escolha um destino válido para o emoji.', ephemeral: true });
        return true;
      }
      session.emojiTarget = target;
      session.emojiPage = 0;
      await i.update(announcementPayload(session, i.guild, `Destino atualizado: ${target === 'competition' ? 'competição' : target === 'home' ? 'time da casa' : 'time visitante'}.`));
      return true;
    }
    const field = sessionFields(session).find(candidate => candidate.key === i.values[0]);
    if (!field) {
      await i.reply({ content: 'Esse campo não faz parte deste anúncio.', ephemeral: true });
      return true;
    }
    await i.showModal(editModal(session, field));
    return true;
  }

  if (i.isStringSelectMenu() && action === 'emoji-target') {
    const target = i.values[0];
    if (!['competition', 'home', 'away'].includes(target)) {
      await i.reply({ content: 'Escolha uma posição válida para o emoji.', ephemeral: true });
      return true;
    }
    session.emojiTarget = target;
    session.emojiPage = 0;
    await i.update(announcementPayload(session, i.guild, `Escolha o emoji para ${target === 'competition' ? 'a competição' : target === 'home' ? 'o time da casa' : 'o time visitante'}.`));
    return true;
  }

  if (i.isStringSelectMenu() && action === 'emoji-pick') {
    const selected = i.values[0];
    if (selected === 'no-results') {
      await i.update(announcementPayload(
        session,
        i.guild,
        'Nenhum escudo foi identificado nessa categoria. Troque o filtro para **Todos do servidor** ou escolha outra categoria.'
      ));
      return true;
    }
    if (selected === 'page:previous' || selected === 'page:next') {
      const choices = availableEmojis(i.guild, session);
      const pageCount = Math.max(1, Math.ceil(choices.length / 23));
      session.emojiPage = Math.max(0, Math.min(
        pageCount - 1,
        session.emojiPage + (selected === 'page:next' ? 1 : -1)
      ));
      await i.update(announcementPayload(session, i.guild));
      return true;
    }
    const choice = availableEmojis(i.guild, session)[Number(selected)];
    if (!choice || !['competition', 'home', 'away'].includes(session.emojiTarget)) {
      await i.reply({ content: 'Esse emoji não está disponível. Escolha outro da lista.', ephemeral: true });
      return true;
    }
    session.emojis[session.emojiTarget] = choice.value;
    await i.update(announcementPayload(session, i.guild, 'Emoji atualizado.'));
    return true;
  }

  if (i.isModalSubmit() && action === 'edit') {
    const field = sessionFields(session).find(candidate => candidate.key === detail);
    if (!field) {
      await i.reply({ content: 'Esse campo não faz parte deste anúncio.', ephemeral: true });
      return true;
    }
    session.fields[field.key] = i.fields.getTextInputValue('value').trim();
    await i.update(announcementPayload(session, i.guild, 'Campo atualizado.'));
    return true;
  }

  if (i.isChannelSelectMenu() && action === 'channel') {
    session.channelId = i.values[0];
    await i.update(announcementPayload(session, i.guild, 'Canal de publicação selecionado.'));
    return true;
  }

  if (i.isButton() && action === 'queue-add') {
    const validationError = validateAnnouncement(session);
    if (validationError) {
      await i.update(announcementPayload(session, i.guild, validationError));
      return true;
    }
    session.drafts.push({
      type: session.type,
      mode: session.mode,
      fields: { ...session.fields },
      emojis: { ...session.emojis },
      period: session.period
    });
    session.fields = {};
    session.emojis = { competition: '', home: '', away: '' };
    session.emojiPage = 0;
    session.period = 'Night';
    await i.update(announcementPayload(session, i.guild, 'Anúncio adicionado à fila. Você pode montar o próximo.'));
    return true;
  }

  if (i.isButton() && action === 'queue-undo') {
    if (!session.drafts.length) {
      await i.reply({ content: 'A fila ainda está vazia.', ephemeral: true });
      return true;
    }
    session.drafts.pop();
    await i.update(announcementPayload(session, i.guild, 'Último anúncio removido da fila.'));
    return true;
  }

  if (i.isButton() && action === 'cancel') {
    sessions.delete(id);
    await i.update({ content: 'Criação do anúncio cancelada.', embeds: [], components: [] });
    return true;
  }

  if (i.isButton() && action === 'publish') {
    if (!session.channelId) {
      await i.update(announcementPayload(session, i.guild, 'Escolha um canal antes de publicar.'));
      return true;
    }

    if (session.drafts.length === 0) {
      const validationError = validateAnnouncement(session);
      if (validationError) {
        await i.update(announcementPayload(session, i.guild, validationError));
        return true;
      }
      session.drafts.push({
        type: session.type,
        mode: session.mode,
        fields: { ...session.fields },
        emojis: { ...session.emojis },
        period: session.period
      });
      session.fields = {};
      session.emojis = { competition: '', home: '', away: '' };
      session.period = 'Night';
    }

    let publishedCount = 0;
    try {
      const channel = await i.guild.channels.fetch(session.channelId);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        await i.update(announcementPayload(session, i.guild, 'O canal selecionado não está disponível para mensagens.'));
        return true;
      }
      while (session.drafts.length) {
        const draft = session.drafts[0];
        await channel.send({
          content: renderAnnouncement(draft),
          allowedMentions: mentionsFor(
            draft.type === 'shouts' ? draft.fields.roles || '' : draft.fields.mentions || '',
            draft.type === 'fixtures'
          )
        });
        session.drafts.shift();
        publishedCount++;
      }
    } catch (error) {
      console.error(`Falha ao publicar ${session.type} no canal ${session.channelId}:`, error);
      await i.update(announcementPayload(
        session,
        i.guild,
        `Falha ao publicar. ${publishedCount} anúncio(s) já foram enviados; ${session.drafts.length} permanecem na fila. Verifique as permissões do bot e tente novamente.`
      ));
      return true;
    }

    sessions.delete(id);
    await i.update({
      content: `${publishedCount} anúncio(s) publicado(s) em <#${session.channelId}>.`,
      embeds: [],
      components: []
    });
    return true;
  }

  await i.reply({ content: 'Esta ação não está disponível para o anúncio.', ephemeral: true });
  return true;
}

module.exports = { handleMatchAnnouncementInteraction };
