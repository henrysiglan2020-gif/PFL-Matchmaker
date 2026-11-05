const { randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');

const sessions = new Map();
const SESSION_TTL = 14 * 60 * 1000;
const BUILTIN_EMOJIS = [
  ['Futebol', '⚽'],
  ['Bola', '🥅'],
  ['Escudo', '🛡️'],
  ['Azul', '🔵'],
  ['Vermelho', '🔴'],
  ['Verde', '🟢'],
  ['Amarelo', '🟡'],
  ['Preto', '⚫'],
  ['Branco', '⚪']
];
const SHIELD_CATEGORIES = [
  { value: 'selecao', label: 'Seleções / WC', description: 'Escudos das seleções da Copa do Mundo' },
  { value: 'brasileirao', label: 'Brasileirão', description: 'Escudos dos times do Brasileirão' },
  { value: 'champions', label: 'Times Champions', description: 'Escudos dos times da Champions League' },
  { value: 'libertadores', label: 'Times Libertadores', description: 'Escudos dos times da Libertadores' }
];
const SHIELD_EMOJI_ALIASES = {
  selecao: {
    ARG: ['arg', 'argentina'],
    BEL: ['bel', 'belgica', 'belgium'],
    BRA: ['bra', 'brasil', 'brazil'],
    COL: ['col', 'colombia'],
    CRO: ['cro', 'croacia', 'croatia'],
    ENG: ['eng', 'inglaterra', 'england'],
    ESP: ['esp', 'espanha', 'spain'],
    FRA: ['fra', 'franca', 'france'],
    GER: ['ger', 'alemanha', 'germany', 'deutschland'],
    ITA: ['ita', 'italia', 'italy'],
    JPN: ['jpn', 'japao', 'japan'],
    MAR: ['mar', 'marrocos', 'morocco'],
    NED: ['ned', 'holanda', 'netherlands'],
    POR: ['por', 'portugal'],
    URU: ['uru', 'uruguai', 'uruguay'],
    USA: ['usa', 'estadosunidos', 'unitedstates']
  },
  champions: {
    AJA: ['aja', 'ajax'],
    ARS: ['ars', 'arsenal'],
    ATM: ['atm', 'atleticodemadrid', 'atletico', 'atletidemadrid'],
    BAY: ['bay', 'bayerndemunique', 'bayern', 'bayernmunich'],
    BEN: ['ben', 'benfica'],
    BVB: ['bvb', 'borussiadortmund', 'dortmund'],
    CHE: ['che', 'chelsea'],
    FCB: ['fcb', 'fcbarcelona', 'barcelona'],
    INM: ['inm', 'interdemilao', 'intermilan', 'inter'],
    JUV: ['juv', 'juventus'],
    LIV: ['liv', 'liverpool'],
    MCI: ['mci', 'manchestercity', 'mancity'],
    MIL: ['mil', 'acmilan', 'milan'],
    MUN: ['mun', 'manchesterunited', 'manutd'],
    PSG: ['psg', 'parissaintgermain'],
    RMA: ['rma', 'realmadrid']
  },
  brasileirao: {
    BAH: ['bah', 'bahia'],
    BOT: ['bot', 'botafogo'],
    CAM: ['cam', 'galo', 'atleticomineiro', 'atleticomg', 'atletico'],
    CAP: ['cap', 'athleticoparanaense'],
    COR: ['cor', 'corinthians'],
    CRU: ['cru', 'cruzeiro'],
    FLA: ['fla', 'flamengo'],
    FLU: ['flu', 'fluminense'],
    FOR: ['for', 'fortaleza'],
    GRE: ['gre', 'gremio'],
    INT: ['int', 'internacional'],
    PAL: ['pal', 'palmeiras'],
    SAN: ['san', 'santos'],
    SAO: ['sao', 'saopaulo'],
    SPT: ['spt', 'sportrecife'],
    VAS: ['vas', 'vasco'],
    REM: ['rem', 'remo']
  },
  libertadores: {
    BAR: ['bar', 'barcelonasc', 'barcelonaecuador'],
    BOL: ['bol', 'bolivar'],
    BOC: ['boc', 'bocajuniors', 'boca'],
    CAR: ['car', 'riverplate', 'river'],
    CER: ['cer', 'cerroporteno'],
    COL: ['col', 'colo-colo', 'colocolo'],
    EME: ['eme', 'emelec'],
    EST: ['est', 'estudiantes'],
    FLA: ['fla', 'flamengo'],
    FLU: ['flu', 'fluminense'],
    FOR: ['for', 'fortaleza'],
    GRE: ['gre', 'gremio'],
    INT: ['int', 'internacional'],
    LDU: ['ldu', 'ligadequito'],
    PAL: ['pal', 'palmeiras'],
    PEN: ['pen', 'penarol'],
    RAC: ['rac', 'racing'],
    REM: ['rem', 'remo'],
    SAN: ['san', 'santos'],
    SAO: ['sao', 'saopaulo'],
    TOL: ['tol', 'deportivotolima'],
    VEL: ['vel', 'velezsarsfield']
  }
};
const BRACKET_CATEGORIES = [
  { value: 'selecao', label: 'Seleções / Copa do Mundo' },
  { value: 'champions', label: 'Champions League' },
  { value: 'brasileirao', label: 'Brasileirão' },
  { value: 'libertadores', label: 'Libertadores' }
];
const AWARD_TYPES = [
  { value: 'ballon-or', label: 'Bola de Ouro', emoji: '🏆' },
  { value: 'golden-glove', label: 'Luva de Ouro', emoji: '🧤' },
  { value: 'puskas', label: 'Prêmio Puskás', emoji: '🚀' },
  { value: 'top-scorer', label: 'Artilheiro', emoji: '⚽' },
  { value: 'best-player', label: 'Melhor Jogador', emoji: '🌟' },
  { value: 'best-young-player', label: 'Melhor Jovem', emoji: '✨' },
  { value: 'best-defender', label: 'Melhor Defensor', emoji: '🛡️' },
  { value: 'best-midfielder', label: 'Melhor Meio-campista', emoji: '🎯' },
  { value: 'best-coach', label: 'Melhor Treinador', emoji: '🧠' },
  { value: 'custom', label: 'Outro prêmio', emoji: '🏅' }
];
const MATCH_EVENTS = [
  { value: 'goal', label: 'Gol', emoji: '⚽', marketDelta: 250000 },
  { value: 'assist', label: 'Assistência', emoji: '🎯', marketDelta: 100000 },
  { value: 'yellow', label: 'Cartão amarelo', emoji: '🟨', marketDelta: -95000 },
  { value: 'red', label: 'Cartão vermelho', emoji: '🟥', marketDelta: -250000 },
  { value: 'screamer', label: 'Golaço', emoji: '🚀', marketDelta: 350000 },
  { value: 'save', label: 'Defesa', emoji: '🧤', marketDelta: 150000 },
  { value: 'dribble', label: 'Drible', emoji: '🌀', marketDelta: 150000 }
];
const EMOJI_ALIASES = {
  gol: '⚽',
  goal: '⚽',
  assist: '🎯',
  assistencia: '🎯',
  cartao_amarelo: '🟨',
  amarelo: '🟨',
  cartao_vermelho: '🟥',
  vermelho: '🟥',
  expulcao: '🟥',
  expulsao: '🟥',
  golaco: '🚀',
  screamer: '🚀',
  defesa: '🧤',
  save: '🧤',
  drible: '🌀',
  dribble: '🌀',
  subs: '🔁',
  substituicao: '🔁',
  downgrade: '⬇️',
  upgrade: '⬆️',
  crown: '👑',
  motm: '👑',
  medalha1: '🥇',
  medalha2: '🥈',
  medalha3: '🥉'
};

const expireTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}, 10 * 60 * 1000);
expireTimer.unref();

function button(id, label, style = ButtonStyle.Secondary, disabled = false, emoji = null) {
  const builder = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
  if (emoji) builder.setEmoji(emoji);
  return builder;
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function componentId(id, action) {
  return `stats:${id}:${action}`;
}

function createSession(userId, guildId) {
  const id = randomUUID().replaceAll('-', '').slice(0, 16);
  const session = {
    id,
    ownerId: userId,
    guildId,
    expiresAt: Date.now() + SESSION_TTL,
    category: '',
    season: '',
    stage: '',
    stadium: '',
    categoryEmoji: '1566234185956593714',
    score: [0, 0],
    penaltiesEnabled: false,
    penaltyScore: [0, 0],
    teams: [
      { name: '', emoji: '⚽' },
      { name: '', emoji: '⚽' }
    ],
    emojiPages: [0, 0, 0],
    shieldCategory: null,
    eventEmojiPage: 0,
    structured: {
      rosters: [Array(7).fill(null), Array(7).fill(null)],
      goalkeepers: [null, null],
      substitutions: [[], []],
      events: [[], []],
      eventEmojis: {
        goal: ':gol:',
        assist: ':assist:',
        yellow: ':cartao_amarelo:',
        red: ':cartao_vermelho:',
        screamer: ':golaco:',
        save: ':defesa:',
        dribble: ':drible:',
        subs: ':subs:',
        substitutionOut: ':downgrade:',
        substitutionIn: ':upgrade:'
      },
      highlights: {
        motm: null,
        medal1: null,
        medal2: null,
        medal3: null
      },
      officials: [],
      pendingHighlight: null,
      pendingSubstitution: null,
      pendingEvent: null,
      pendingEmoji: null,
      refereePage: 0,
      refereeIds: []
    },
    channelId: null,
    dashboardMessage: null
  };
  sessions.set(id, session);
  return { id, session };
}

function getSession(id, guildId, userId) {
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  if (session.guildId !== guildId || session.ownerId !== userId) return null;
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

function resolveEmojiShortcodes(text, guild) {
  const emojis = availableEmojis(guild);
  return text.replace(/:([a-zA-Z0-9_]{2,32}):(?!\d+>)/g, (source, name) => {
    const emoji = emojis.find(
      emoji => emoji.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US')
    );
    return emoji?.toString() || EMOJI_ALIASES[name.toLocaleLowerCase('en-US')] || source;
  });
}

function availableEmojis(guild) {
  const serverEmojis = [...guild.emojis.cache.values()];
  const applicationEmojis = [
    ...(guild.client.application?.emojis?.cache?.values?.() || [])
  ];
  return [...new Map(
    [...serverEmojis, ...applicationEmojis].map(emoji => [emoji.id, emoji])
  ).values()];
}

async function fetchAvailableEmojis(guild) {
  const manager = guild.client.application?.emojis;
  if (!manager) {
    throw new Error('Application emoji manager is unavailable.');
  }
  await Promise.all([
    guild.emojis.fetch(),
    manager.fetch()
  ]);
}

function renderGuildEmoji(emojiId, guild, fallback) {
  const emoji = guild.emojis.cache.get(emojiId) ||
    guild.client.application?.emojis?.cache?.get(emojiId);
  return emoji?.toString() || fallback;
}

function renderTeamEmoji(value, guild) {
  const customEmoji = /^<a?:[a-zA-Z0-9_]+:(\d+)>$/.exec(value || '');
  const emojiId = customEmoji?.[1] || (/^\d{17,20}$/.test(value || '') ? value : null);
  if (!emojiId) return value || '⚽';

  return renderGuildEmoji(emojiId, guild, '⚽');
}

function emojisMatch(left, right) {
  if (left === right) return true;
  const leftId = /^<a?:[a-zA-Z0-9_]+:(\d+)>$/.exec(left || '')?.[1] ||
    (/^\d{17,20}$/.test(left || '') ? left : null);
  const rightId = /^<a?:[a-zA-Z0-9_]+:(\d+)>$/.exec(right || '')?.[1] ||
    (/^\d{17,20}$/.test(right || '') ? right : null);
  return Boolean(leftId && rightId && leftId === rightId);
}

function renderConfiguredEmoji(value, guild) {
  const customEmoji = /^<a?:[a-zA-Z0-9_]+:(\d+)>$/.exec(value || '');
  if (customEmoji) {
    return renderGuildEmoji(customEmoji[1], guild, '⚽');
  }
  return resolveEmojiShortcodes(value || '⚽', guild);
}

function numberEmoji(value) {
  const digits = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  return String(value).split('').map(digit => digits[Number(digit)]).join('');
}

function renderText(session, guild) {
  return resolveEmojiShortcodes(renderStructuredText(session, guild), guild);
}

function renderStructuredText(session, guild) {
  const pflEmoji = renderGuildEmoji('1566234185956593714', guild, '⚽');
  const eventEmojis = Object.fromEntries(
    Object.entries(session.structured.eventEmojis).map(([type, emoji]) => [
      type,
      renderConfiguredEmoji(emoji, guild)
    ])
  );
  const lines = [];
  const teamEmojis = session.teams.map(team => renderTeamEmoji(team.emoji, guild));
  if (session.stadium) lines.push(`-# 🏟️ | ${session.stadium}`, '');
  const penaltyScore = session.penaltiesEnabled
    ? `(${numberEmoji(session.penaltyScore[0])}) `
    : '';
  const awayPenaltyScore = session.penaltiesEnabled
    ? ` (${numberEmoji(session.penaltyScore[1])})`
    : '';
  lines.push(
    `${penaltyScore}${teamEmojis[0]} ${numberEmoji(session.score[0])} - ${numberEmoji(session.score[1])} ${teamEmojis[1]}${awayPenaltyScore}`,
    '',
    '**STATISTICS**'
  );
  for (const side of session.teams.keys()) {
    if (side > 0) lines.push('');
    const roster = session.structured.rosters[side];
    const userIds = [
      ...roster.filter(Boolean),
      ...session.structured.events[side].map(event => event.userId),
      ...session.structured.substitutions[side].flatMap(sub => [sub.outId, sub.inId])
    ];
    for (const userId of [...new Set(userIds)]) {
      const goalkeeper = userId && userId === session.structured.goalkeepers[side]
        ? ' **(GK)**'
        : '';
      const events = session.structured.events[side]
        .filter(event => event.userId === userId)
        .map(event => ` ${eventEmojis[event.type] || '⚽'} ${event.minute}'`)
        .join('');
      const substitutions = session.structured.substitutions[side]
        .flatMap(sub => [
          ...(sub.outId === userId ? [` ${eventEmojis.substitutionOut} ${sub.minute}'`] : []),
          ...(sub.inId === userId ? [` ${eventEmojis.substitutionIn} ${sub.minute}'`] : [])
        ])
        .join('');
      lines.push(`${teamEmojis[side]} | <@${userId}>${goalkeeper}${events}${substitutions}`);
    }
  }
  if (session.structured.substitutions.some(substitutions => substitutions.length)) {
    lines.push('', '**SUBS**');
  }
  for (const [side, substitutions] of session.structured.substitutions.entries()) {
    for (const sub of substitutions) {
      lines.push(
        `${teamEmojis[side]} | <@${sub.outId}> ${eventEmojis.subs || '🔁'} <@${sub.inId}> ${sub.minute}'`
      );
    }
  }
  const highlightEntries = [
    ['motm', '👑'],
    ['medal1', '🥇'],
    ['medal2', '🥈'],
    ['medal3', '🥉']
  ].filter(([key]) => session.structured.highlights[key]);
  if (highlightEntries.length) lines.push('', '**MOTM & MENTIONS**');
  for (const [key, emoji] of highlightEntries) {
    const userId = session.structured.highlights[key];
    const side = session.structured.rosters.findIndex(roster => roster.includes(userId));
    const teamEmoji = side >= 0 ? teamEmojis[side] : pflEmoji;
    lines.push(`${teamEmoji} | <@${userId}> ${emoji}`);
  }
  if (session.structured.officials.length) {
    lines.push('', `**OFFICIALS** ${pflEmoji}`);
    for (const userId of session.structured.officials) {
      lines.push(`${pflEmoji} | <@${userId}>`);
    }
  }
  return lines.join('\n');
}

function statisticsMarketChanges(session) {
  const changes = new Map();
  for (const events of session.structured.events) {
    for (const event of events) {
      const marketDelta = MATCH_EVENTS.find(candidate => candidate.value === event.type)?.marketDelta;
      if (marketDelta === undefined) continue;
      changes.set(event.userId, (changes.get(event.userId) || 0) + marketDelta);
    }
  }
  return [...changes].map(([userId, delta]) => ({ userId, delta }));
}

function renderEmbed(session, guild) {
  const categoryEmoji = renderTeamEmoji(session.categoryEmoji, guild);
  const heading = `# ${categoryEmoji} | ${session.category || 'Categoria'} | ${session.stage || `S${session.season || '1'}`}`;
  const text = `${heading}\n${renderText(session, guild)}`;
  if (text.length > 4096) {
    return { error: 'A prévia passou do limite de 4.096 caracteres da embed. Reduza o texto e tente novamente.' };
  }
  return { embed: new EmbedBuilder().setDescription(text) };
}

function structuredPayload(id, session, guild, notice = '') {
  const rendered = renderEmbed(session, guild);
  return {
    content: [
      notice || 'Escolha uma posição e selecione a pessoa no menu de membros do servidor. A prévia atualiza sozinha.',
      `**Canal:** ${session.channelId ? `<#${session.channelId}>` : 'não escolhido'}`,
      rendered.error || ''
    ].filter(Boolean).join('\n'),
    embeds: rendered.embed ? [rendered.embed] : [],
    components: [
      row(
        button(componentId(id, 'structured-roster:0'), 'Elenco time 1'),
        button(componentId(id, 'structured-roster:1'), 'Elenco time 2'),
        button(componentId(id, 'structured-gk:0'), 'GK time 1'),
        button(componentId(id, 'structured-gk:1'), 'GK time 2'),
        button(componentId(id, 'score'), 'Placar / estádio', ButtonStyle.Primary)
      ),
      row(
        button(componentId(id, 'structured-subs:0'), 'Subs time 1'),
        button(componentId(id, 'structured-subs:1'), 'Subs time 2'),
        button(componentId(id, 'structured-events:0'), 'Eventos time 1'),
        button(componentId(id, 'structured-events:1'), 'Eventos time 2'),
        button(componentId(id, 'structured-highlights'), 'MOTM / medalhas')
      ),
      row(
        button(componentId(id, 'metadata'), 'Categoria, temporada e times'),
        button(componentId(id, 'structured-emojis'), 'Escudos dos times'),
        button(componentId(id, 'structured-officials'), 'Oficiais'),
        button(componentId(id, 'structured-event-emojis'), 'Emojis de eventos'),
        button(
          componentId(id, 'penalties'),
          session.penaltiesEnabled ? 'Pênaltis: ativados' : 'Ativar pênaltis',
          session.penaltiesEnabled ? ButtonStyle.Success : ButtonStyle.Secondary
        )
      ),
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId(componentId(id, 'channel'))
          .setPlaceholder('Escolha o canal para publicar')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1)
      ),
      row(button(componentId(id, 'publish'), 'Publicar', ButtonStyle.Success))
    ]
  };
}

function structuredEmojiPayload(id, session, guild, notice = '') {
  const choices = session.shieldCategory
    ? shieldEmojiChoices(guild, session.shieldCategory)
    : [];
  const pageCount = Math.max(1, Math.ceil(choices.length / 25));
  const rendered = renderEmbed(session, guild);
  const category = SHIELD_CATEGORIES.find(
    candidate => candidate.value === session.shieldCategory
  );
  const explanation = !session.shieldCategory
    ? 'Selecione uma categoria para ver os escudos disponíveis.'
    : choices.length
      ? `Categoria: **${category.label}**. Os menus mostram apenas escudos disponíveis do bot/servidor.`
      : `Ainda não encontrei emojis de escudos para **${category.label}**. Os emojis de Libertadores podem ser adicionados depois; escolha outra categoria ou volte.`;
  return {
    content: [
      notice || explanation,
      rendered.error || ''
    ].filter(Boolean).join('\n'),
    embeds: rendered.embed ? [rendered.embed] : [],
    components: [
      row(shieldCategorySelect(id, session)),
      ...(choices.length
        ? [
            row(emojiSelect(id, 0, session, guild, choices)),
            row(emojiSelect(id, 1, session, guild, choices)),
            ...(pageCount > 1
              ? [row(
                  button(componentId(id, 'emoji-page:-1'), 'Escudos anteriores', ButtonStyle.Secondary, session.emojiPages[0] === 0),
                  button(componentId(id, 'emoji-page:1'), `Próximos escudos (${session.emojiPages[0] + 1}/${pageCount})`, ButtonStyle.Secondary, session.emojiPages[0] >= pageCount - 1)
                )]
              : [])
          ]
        : []),
      row(button(componentId(id, 'structured-home'), 'Voltar ao editor'))
    ]
  };
}

function structuredSubpanel(id, session, guild, prompt, components) {
  const rendered = renderEmbed(session, guild);
  return {
    content: prompt,
    embeds: rendered.embed ? [rendered.embed] : [],
    components: [
      ...components,
      row(button(componentId(id, 'structured-home'), 'Voltar ao editor estruturado'))
    ]
  };
}

function rosterPicker(id, session, guild, side) {
  const roster = session.structured.rosters[side];
  const buttons = Array.from({ length: 7 }, (_, index) => {
    const userId = roster[index];
    const member = userId ? guild.members.cache.get(userId) : null;
    return button(
      componentId(id, `structured-roster-slot:${side}:${index}`),
      `${index + 1}. ${(member?.displayName || (userId ? 'Selecionado' : 'Escolher')).slice(0, 76)}`,
      userId ? ButtonStyle.Success : ButtonStyle.Secondary
    );
  });
  return structuredSubpanel(
    id,
    session,
    guild,
    `**Elenco ${session.teams[side].name || `Time ${side + 1}`}**\nClique no botão da posição que deseja preencher ou alterar.`,
    [row(...buttons.slice(0, 4)), row(...buttons.slice(4))]
  );
}

function rosterSlotPicker(id, session, guild, side, slot) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(componentId(id, `structured-roster-user:${side}:${slot}`))
    .setPlaceholder('Pesquisar qualquer membro deste servidor')
    .setMinValues(1)
    .setMaxValues(1);
  return structuredSubpanel(
    id,
    session,
    guild,
    `Escolha a pessoa para a posição **${slot + 1}** do time **${session.teams[side].name || `Time ${side + 1}`}**. Use a busca do menu para encontrar membros do servidor, mesmo que não estejam neste canal.`,
    [
      row(select),
      row(
        button(componentId(id, `structured-roster-clear:${side}:${slot}`), 'Limpar esta posição', ButtonStyle.Danger),
        button(componentId(id, `structured-roster:${side}`), 'Voltar às posições')
      )
    ]
  );
}

function goalkeeperPicker(id, session, guild, side) {
  const roster = session.structured.rosters[side].filter(Boolean);
  if (roster.length === 0) {
    return structuredPayload(id, session, guild, `Selecione o elenco do time ${side + 1} antes de escolher o GK.`);
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(componentId(id, `structured-gk-pick:${side}`))
    .setPlaceholder(`Escolha o GK do time ${side + 1}`)
    .addOptions(
      ...roster.map(userId => new StringSelectMenuOptionBuilder()
        .setLabel(guild.members.cache.get(userId)?.displayName || userId)
        .setValue(userId)),
      new StringSelectMenuOptionBuilder()
        .setLabel('Remover GK')
        .setValue('none')
    );
  return structuredSubpanel(
    id,
    session,
    guild,
    `Selecione o goleiro do **${session.teams[side].name || `Time ${side + 1}`}**.`,
    [row(select)]
  );
}

function substitutionOutPicker(id, session, guild, side) {
  const roster = session.structured.rosters[side].filter(Boolean);
  if (roster.length === 0) {
    return structuredPayload(id, session, guild, `Selecione o elenco do time ${side + 1} antes de registrar substituições.`);
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(componentId(id, `structured-sub-out:${side}`))
    .setPlaceholder('Escolha quem vai sair')
    .addOptions(roster.map(userId => new StringSelectMenuOptionBuilder()
      .setLabel(guild.members.cache.get(userId)?.displayName || userId)
      .setValue(userId)));
  return structuredSubpanel(
    id,
    session,
    guild,
    `Nova substituição ${session.structured.substitutions[side].length + 1} do time ${side + 1}: escolha quem vai sair. Depois escolha quem entra e informe o minuto. Cada clique em Subs adiciona outra linha.`,
    [row(select)]
  );
}

function substitutionInPicker(id, session, guild, side) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(componentId(id, `structured-sub-in:${side}`))
    .setPlaceholder('Escolha o jogador que vai entrar')
    .setMinValues(1)
    .setMaxValues(1);
  return structuredSubpanel(
    id,
    session,
    guild,
    'Escolha o jogador que entra. Ele pode ser qualquer membro do servidor.',
    [row(select)]
  );
}

function eventPicker(id, session, guild, side) {
  const controls = [];
  for (let index = 0; index < MATCH_EVENTS.length; index += 4) {
    controls.push(row(...MATCH_EVENTS.slice(index, index + 4).map(event =>
      button(
        componentId(id, `structured-event-type:${side}:${event.value}`),
        `${event.label} ${event.marketDelta > 0 ? '+' : '−'}${Math.abs(event.marketDelta) / 1000}K`,
        ButtonStyle.Primary,
        false,
        event.emoji
      )
    )));
  }
  const events = session.structured.events[side];
  if (events.length) {
    controls.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, `structured-event-remove:${side}`))
      .setPlaceholder('Remover um evento registrado')
      .addOptions(events.map((event, index) => {
        const memberName = guild.members.cache.get(event.userId)?.displayName || event.userId;
        const eventLabel = MATCH_EVENTS.find(candidate => candidate.value === event.type)?.label || event.type;
        const label = `${eventLabel} ${event.minute}' • ${memberName}`.slice(0, 100);
        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(String(index));
      }))));
  }
  return structuredSubpanel(
    id,
    session,
    guild,
    `Escolha um evento para **${session.teams[side].name || `Time ${side + 1}`}**. O jogador será selecionado somente entre os membros do elenco deste time; o valor de mercado muda ao publicar.`,
    controls
  );
}

function eventUserPicker(id, session, guild, side, type) {
  const event = MATCH_EVENTS.find(candidate => candidate.value === type);
  const players = eventEligiblePlayers(session, side);
  if (players.length === 0) {
    return structuredPayload(id, session, guild, `Selecione o elenco do time ${side + 1} antes de registrar eventos.`);
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(componentId(id, `structured-event-user:${side}:${type}`))
    .setPlaceholder(`Escolha do elenco ou das substituições do time ${side + 1}`)
    .addOptions(players.map(userId => new StringSelectMenuOptionBuilder()
      .setLabel(guild.members.cache.get(userId)?.displayName || userId)
      .setValue(userId)));
  return structuredSubpanel(
    id,
    session,
    guild,
    `Selecione quem registrou ${event?.label.toLocaleLowerCase('pt-BR') || 'o evento'} entre os jogadores do elenco ou quem entrou em uma substituição do time ${side + 1}. Depois informe o minuto.`,
    [row(select)]
  );
}

function eventEligiblePlayers(session, side) {
  return [...new Set([
    ...session.structured.rosters[side].filter(Boolean),
    ...session.structured.substitutions[side].map(substitution => substitution.inId)
  ])];
}

function highlightPicker(id, session, guild) {
  return structuredSubpanel(
    id,
    session,
    guild,
    'Escolha qual destaque você quer preencher. Depois selecione o membro no menu.',
    [
      row(
        button(componentId(id, 'structured-highlight:motm'), 'MOTM', ButtonStyle.Primary),
        button(componentId(id, 'structured-highlight:medal1'), 'Medalha 1'),
        button(componentId(id, 'structured-highlight:medal2'), 'Medalha 2'),
        button(componentId(id, 'structured-highlight:medal3'), 'Medalha 3')
      )
    ]
  );
}

function highlightUserPicker(id, session, guild) {
  const key = session.structured.pendingHighlight;
  const select = new UserSelectMenuBuilder()
    .setCustomId(componentId(id, 'structured-highlight-pick'))
    .setPlaceholder('Pesquisar qualquer membro do servidor')
    .setMinValues(1)
    .setMaxValues(1);
  return structuredSubpanel(
    id,
    session,
    guild,
    `Selecione a pessoa para ${key === 'motm' ? 'MOTM' : key?.replace('medal', 'medalha ')}.`,
    [row(select)]
  );
}

function refereePicker(id, session, guild) {
  const choices = session.structured.refereeIds
    .filter(userId => !session.structured.officials.includes(userId));
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  session.structured.refereePage = Math.min(session.structured.refereePage, pageCount - 1);
  const options = choices
    .slice(session.structured.refereePage * pageSize, (session.structured.refereePage + 1) * pageSize)
    .map(userId => new StringSelectMenuOptionBuilder()
      .setLabel(guild.members.cache.get(userId)?.displayName || userId)
      .setValue(userId));
  const controls = [];
  if (options.length) {
    controls.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'structured-official-pick'))
      .setPlaceholder('Selecione somente um juiz')
      .addOptions(options)));
  }
  if (session.structured.officials.length) {
    controls.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'structured-official-remove'))
      .setPlaceholder('Remover um juiz selecionado')
      .addOptions(session.structured.officials.slice(0, 25).map(userId =>
        new StringSelectMenuOptionBuilder()
          .setLabel(guild.members.cache.get(userId)?.displayName || userId)
          .setValue(userId)
      ))));
  }
  if (pageCount > 1) {
    controls.push(row(
      button(
        componentId(id, 'structured-official-page:-1'),
        'Juízes anteriores',
        ButtonStyle.Secondary,
        session.structured.refereePage === 0
      ),
      button(
        componentId(id, 'structured-official-page:1'),
        `Próximos juízes (${session.structured.refereePage + 1}/${pageCount})`,
        ButtonStyle.Secondary,
        session.structured.refereePage >= pageCount - 1
      )
    ));
  }
  return structuredSubpanel(
    id,
    session,
    guild,
    options.length
      ? 'A lista contém somente membros com o cargo de juiz.'
      : 'Todos os juízes disponíveis já foram adicionados.',
    controls
  );
}

function minuteModal(id, side) {
  return new ModalBuilder()
    .setCustomId(componentId(id, `structured-sub-minute:${side}`))
    .setTitle('Tempo da substituição')
    .addComponents(row(
      new TextInputBuilder()
        .setCustomId('minute')
        .setLabel('Minuto (ex.: 36 ou 90+2)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(12)
    ));
}

function eventMinuteModal(id, side, type) {
  return new ModalBuilder()
    .setCustomId(componentId(id, `structured-event-minute:${side}:${type}`))
    .setTitle('Minuto do evento')
    .addComponents(row(
      new TextInputBuilder()
        .setCustomId('minute')
        .setLabel('Minuto (ex.: 8 ou 90+2)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(12)
    ));
}

function scoreModal(id, session) {
  const modal = new ModalBuilder()
    .setCustomId(componentId(id, 'score-modal'))
    .setTitle('Placar e estádio');
  for (const [index, label] of [
    `Gols — ${session.teams[0].name || 'Time 1'}`,
    `Gols — ${session.teams[1].name || 'Time 2'}`
  ].entries()) {
    modal.addComponents(row(
      new TextInputBuilder()
        .setCustomId(`score${index}`)
        .setLabel(label.slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(4)
        .setValue(String(session.score[index]))
    ));
  }
  const stadiumInput = new TextInputBuilder()
    .setCustomId('stadium')
    .setLabel('Estádio (opcional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);
  if (session.stadium) stadiumInput.setValue(session.stadium);
  modal.addComponents(row(stadiumInput));
  return modal;
}

function penaltiesModal(id, session) {
  const modal = new ModalBuilder()
    .setCustomId(componentId(id, 'penalties-modal'))
    .setTitle('Placar dos pênaltis');
  for (const [index, label] of [
    `Pênaltis — ${session.teams[0].name || 'Time 1'}`,
    `Pênaltis — ${session.teams[1].name || 'Time 2'}`
  ].entries()) {
    modal.addComponents(row(
      new TextInputBuilder()
        .setCustomId(`penalty${index}`)
        .setLabel(label.slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(4)
        .setValue(String(session.penaltyScore[index]))
    ));
  }
  return modal;
}

function eventEmojiPanel(id, session, guild, notice = '') {
  const eventTypes = [
    ...MATCH_EVENTS.map(({ value, label }) => [value, label]),
    ['substitutionOut', 'Jogador que sai'],
    ['substitutionIn', 'Jogador que entra']
  ];
  const choices = emojiChoices(guild);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  session.eventEmojiPage = Math.min(session.eventEmojiPage, pageCount - 1);
  const components = [
    row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'event-emoji-type'))
      .setPlaceholder('Escolha qual emoji configurar')
      .addOptions(eventTypes.map(([value, label]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(value)
          .setDefault(value === session.structured.pendingEmoji)
      )))
  ];
  if (session.structured.pendingEmoji) {
    const currentEmoji = session.structured.eventEmojis[session.structured.pendingEmoji];
    const options = choices
      .slice(session.eventEmojiPage * pageSize, (session.eventEmojiPage + 1) * pageSize)
      .map(choice =>
        new StringSelectMenuOptionBuilder()
          .setLabel(choice.label.slice(0, 100))
          .setValue(choice.value)
          .setDescription(choice.description)
          .setEmoji(choice.value)
          .setDefault(choice.value === currentEmoji)
      );
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'event-emoji-value'))
      .setPlaceholder('Escolha o emoji')
      .addOptions(options.slice(0, 25))));
  }
  if (pageCount > 1) {
    components.push(row(
      button(componentId(id, 'event-emoji-page:-1'), 'Emojis anteriores', ButtonStyle.Secondary, session.eventEmojiPage === 0),
      button(componentId(id, 'event-emoji-page:1'), `Próximos emojis (${session.eventEmojiPage + 1}/${pageCount})`, ButtonStyle.Secondary, session.eventEmojiPage >= pageCount - 1)
    ));
  }
  components.push(row(
    button(componentId(id, 'event-emoji-refresh'), 'Atualizar', ButtonStyle.Primary, false, '🔄'),
    button(componentId(id, 'structured-home'), 'Voltar ao editor')
  ));
  const rendered = renderEmbed(session, guild);
  return {
    content: [notice || 'Selecione o tipo de evento e depois o emoji. A prévia acompanha as alterações.', rendered.error || ''].filter(Boolean).join('\n'),
    embeds: rendered.embed ? [rendered.embed] : [],
    components
  };
}

function emojiChoices(guild) {
  const choices = new Map(
    BUILTIN_EMOJIS.map(([label, value]) => [value, { label, value }])
  );
  for (const emoji of availableEmojis(guild)) {
    const value = emoji.toString();
    choices.set(value, {
      label: emoji.name,
      value,
      description: 'Emoji do servidor'
    });
  }
  return [...choices.values()].map(choice => ({
    ...choice,
    description: choice.description || 'Emoji Unicode'
  }));
}

function normalizeEmojiName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]/g, '');
}

function shieldEmojiChoices(guild, category) {
  const aliasesByTeam = SHIELD_EMOJI_ALIASES[category];
  if (!aliasesByTeam) return [];
  const aliases = new Set(
    Object.values(aliasesByTeam).flatMap(names => names.map(normalizeEmojiName))
  );
  return availableEmojis(guild)
    .filter(emoji => {
      const name = normalizeEmojiName(emoji.name);
      const candidates = [
        name,
        name.replace(/^(?:flag|escudo|logo|team|club)/, ''),
        name.replace(/(?:flag|escudo|logo|team|club)$/, ''),
        name.replace(/2$/, '')
      ];
      return candidates.some(candidate => aliases.has(candidate));
    })
    .map(emoji => ({
      label: emoji.name,
      value: emoji.toString(),
      description: 'Escudo do servidor'
    }));
}

function shieldCategorySelect(id, session) {
  return new StringSelectMenuBuilder()
    .setCustomId(componentId(id, 'shield-category'))
    .setPlaceholder('Escolha Seleções/WC, Champions ou Libertadores')
    .addOptions(SHIELD_CATEGORIES.map(category =>
      new StringSelectMenuOptionBuilder()
        .setLabel(category.label)
        .setDescription(category.description)
        .setValue(category.value)
        .setDefault(category.value === session.shieldCategory)
    ));
}

function emojiSelect(id, side, session, guild, choices) {
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  const page = Math.min(session.emojiPages[side], pageCount - 1);
  session.emojiPages[side] = page;
  const selectedEmoji = session.teams[side].emoji;
  const options = choices.slice(page * pageSize, (page + 1) * pageSize).map(choice =>
    new StringSelectMenuOptionBuilder()
      .setLabel(choice.label.slice(0, 100))
      .setValue(choice.value)
      .setDescription(choice.description)
      .setEmoji(choice.value)
      .setDefault(emojisMatch(choice.value, session.teams[side].emoji))
  );
  return new StringSelectMenuBuilder()
    .setCustomId(componentId(id, `emoji:${side}`))
    .setPlaceholder(`Escudo do time ${side + 1} • ${page + 1}/${pageCount}`)
    .addOptions(options);
}

function metadataModal(id, session) {
  const modal = new ModalBuilder()
    .setCustomId(componentId(id, 'metadata-modal'))
    .setTitle('Dados da partida');
  for (const field of [
    { id: 'category', label: 'Categoria', value: session.category, required: true, maxLength: 80 },
    { id: 'season', label: 'Número da season', value: session.season, required: true, maxLength: 12 },
    { id: 'team1', label: 'Nome do time 1', value: session.teams[0].name, required: true, maxLength: 80 },
    { id: 'team2', label: 'Nome do time 2', value: session.teams[1].name, required: true, maxLength: 80 },
    { id: 'stage', label: 'Fase/leg (opcional)', value: session.stage, required: false, maxLength: 40 }
  ]) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required)
      .setMaxLength(field.maxLength);
    if (field.value) input.setValue(field.value);
    modal.addComponents(row(input));
  }
  return modal;
}

function centralPanel(section = 'home', notice = '') {
  const back = row(button('central:home', '← Voltar à Central'));
  if (section === 'rosters') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('👥 Elencos')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            'Adicione ou remova jogadores e gerentes dos times usando os controles abaixo.'
          )
      ],
      components: [
        row(button('central:roster-manage', 'Gerenciar membros do time', ButtonStyle.Primary)),
        back
      ],
      ephemeral: true
    };
  }
  if (section === 'matches') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('🏟️ Partidas')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            '**Criar partida:** registre uma partida OFC e configure os times, competição e horário.\n\n' +
            '**Registrar resultado:** informe o ID de uma partida pendente e o placar.\n\n' +
            '**Limpar partidas:** escolha a categoria, depois jogo ou chaveamento, selecione um item e confirme a remoção.'
          )
      ],
      components: [
        row(
          button('central:match-create', 'Criar partida', ButtonStyle.Success),
          button('central:match-result', 'Registrar resultado', ButtonStyle.Primary),
          button('central:match-clear', 'Limpar partidas', ButtonStyle.Danger)
        ),
        row(
          button('central:match-list', 'Consultar partidas'),
          button('central:cup', 'Copa do Mundo', ButtonStyle.Success),
          button('central:home-away', 'Sortear Home/Away', ButtonStyle.Secondary)
        ),
        back
      ],
      ephemeral: true
    };
  }
  if (section === 'players') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('👤 Jogadores')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            'Consulte dados de um jogador ou defina seu valor de mercado. A consulta pública do valor continua disponível fora deste painel.'
          )
      ],
      components: [
        row(
          button('central:player-view', 'Consultar jogador', ButtonStyle.Primary),
          button('central:player-value', 'Definir valor de mercado', ButtonStyle.Success)
        ),
        back
      ],
      ephemeral: true
    };
  }
  if (section === 'money') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('💰 Dinheiro')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            'Ajuste saldos de jogadores ou times e pague salários individuais, por time ou para todos os jogadores cadastrados.'
          )
      ],
      components: [
        row(
          button('central:money-adjust', 'Ajustar saldo', ButtonStyle.Primary),
          button('central:money-payroll', 'Pagar salários', ButtonStyle.Success)
        ),
        row(button('central:money-donate', 'Doar para meu time', ButtonStyle.Secondary)),
        back
      ],
      ephemeral: true
    };
  }
  if (section === 'teams') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('🛡️ Times')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            'Gerencie membros, consulte informações do time ou remova o cadastro de um time; o histórico financeiro permanece.'
          )
      ],
      components: [
        row(
          button('central:team-manage', 'Membros e cargos', ButtonStyle.Primary),
          button('central:team-view', 'Consultar time'),
          button('central:team-delete', 'Excluir time', ButtonStyle.Danger)
        ),
        back
      ],
      ephemeral: true
    };
  }
  if (section === 'tools') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('🧰 Ferramentas administrativas')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            '**Auditoria financeira:** consulte saldo e movimentações de uma pessoa ou time.\n' +
            '**Propostas pendentes:** liste e cancele propostas de transferência.\n' +
            '**Agentes livres:** consulte e encerre anúncios ativos.\n' +
            '**Comunicado oficial:** publique um aviso em um canal de texto.\n' +
            '**Auditoria de elencos:** encontre divergências entre cadastros e cargos.\n' +
            '**Convocações pendentes:** consulte e cancele convocações nacionais.'
          )
      ],
      components: [
        row(
          button('central:finance-audit', 'Auditoria financeira'),
          button('central:proposal-audit', 'Propostas pendentes'),
          button('central:free-agents', 'Agentes livres')
        ),
        row(
          button('central:announcement', 'Comunicado oficial'),
          button('central:roster-audit', 'Auditoria de elencos'),
          button('central:callup-audit', 'Convocações pendentes')
        ),
        back
      ],
      ephemeral: true
    };
  }
  if (section === 'referees') {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('⚖️ Arbitragem')
          .setDescription(
            `${notice ? `${notice}\n\n` : ''}` +
            'Escolha uma ação abaixo:\n\n' +
            '**Ver juízes:** mostra os membros que já têm o cargo.\n' +
            '**Dar cargo de juiz:** escolha uma pessoa do servidor para receber o cargo.\n' +
            '**Remover cargo de juiz:** escolha uma pessoa para retirar o cargo.\n' +
            '**Designar para partida:** escolha uma partida OFC pendente e depois o juiz responsável.'
          )
      ],
      components: [
        row(
          button('central:judges-view', 'Ver juízes', ButtonStyle.Primary),
          button('central:judge-grant', 'Dar cargo de juiz', ButtonStyle.Success),
          button('central:judge-revoke', 'Remover cargo de juiz', ButtonStyle.Danger),
          button('central:judge-assign', 'Designar para partida')
        ),
        back
      ],
      ephemeral: true
    };
  }

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Central PFL')
        .setDescription(
          'Painel administrativo do servidor. Veja o que cada ferramenta faz e escolha uma opção abaixo.'
        )
        .addFields(
          {
            name: '📊 Estatísticas',
            value: 'Monte a embed da partida com elencos, gols, assistências, cartões, golaços, defesas, dribles, substituições, destaques e oficiais.'
          },
          {
            name: '🏆 Tabela',
            value: 'Monte um chaveamento de 16 times, registre os classificados por fase e atualize a publicação até o campeão.'
          },
          {
            name: '🪪 Cartão de jogador',
            value: 'Crie um cartão visual com perfil, time, valor de mercado e uma apresentação personalizada.'
          },
          {
            name: '🏅 Premiações',
            value: 'Monte uma publicação com vários prêmios e vencedores, como Bola de Ouro, Luva de Ouro e Puskás.'
          },
          {
            name: '👥 Elencos',
            value: 'Adicione e remova jogadores e gerentes dos times.'
          },
          {
            name: '⚖️ Arbitragem',
            value: 'Consulte os juízes, gerencie o cargo de juiz e designe arbitragem para partidas OFC.'
          },
          {
            name: '🏟️ Partidas',
            value: 'Crie partidas, registre resultados, consulte jogos, inicie a Copa e sorteie Home/Away.'
          },
          {
            name: '📣 Anúncios de partidas',
            value: 'Monte publicações de Shouts e Fixtures com prévia e escolha do canal.'
          },
          {
            name: '👤 Jogadores',
            value: 'Consulte dados e defina valores de mercado.'
          },
          {
            name: '💰 Dinheiro',
            value: 'Ajuste saldos, pague salários e contribua para o caixa do seu time.'
          },
          {
            name: '🛡️ Times',
            value: 'Gerencie membros, consulte dados e exclua times.'
          },
          {
            name: '🧰 Ferramentas administrativas',
            value: 'Audite finanças e elencos, gerencie propostas, agentes livres e convocações, e publique comunicados.'
          },
          {
            name: '🚫 Bloquear comandos',
            value: 'Desative slash commands para os membros e configure uma mensagem opcional exibida ao tentar usá-los.'
          }
        )
    ],
    components: [
      row(
        button('central:table', 'Tabela', ButtonStyle.Success),
        button('central:statistics', 'Estatísticas', ButtonStyle.Primary),
        button('central:rosters', 'Elencos'),
        button('central:referees', 'Arbitragem')
      ),
      row(
        button('central:player-card', 'Cartão de jogador', ButtonStyle.Primary),
        button('central:awards', 'Premiações', ButtonStyle.Secondary, false, '🟨')
      ),
      row(
        button('central:matches', 'Partidas'),
        button('central:players', 'Jogadores'),
        button('central:money', 'Dinheiro'),
        button('central:teams', 'Times'),
        button('central:tools', 'Ferramentas')
      ),
      row(
        button('central:command-blocks', 'Bloquear comandos', ButtonStyle.Danger)
      ),
      row(
        button('central:shouts', 'Shouts', ButtonStyle.Success),
        button('central:fixtures', 'Fixtures', ButtonStyle.Danger)
      )
    ],
    ephemeral: true
  };
}

function bracketCategoryLabel(category) {
  return BRACKET_CATEGORIES.find(item => item.value === category)?.label || 'Competição';
}

function bracketTeamEmoji(team, guild, category) {
  if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(team.crest || '')) {
    return renderTeamEmoji(team.crest, guild);
  }
  const aliases = SHIELD_EMOJI_ALIASES[category] || {};
  const acronym = String(team.acronym || '').replace(/2$/, '').toUpperCase();
  const names = aliases[acronym] || [];
  const aliasSet = new Set(names.map(normalizeEmojiName));
  const match = availableEmojis(guild).find(emoji => {
    const name = normalizeEmojiName(emoji.name);
    return aliasSet.has(name) ||
      aliasSet.has(name.replace(/^(?:flag|escudo|logo|team|club)/, '')) ||
      aliasSet.has(name.replace(/(?:flag|escudo|logo|team|club)$/, '')) ||
      aliasSet.has(name.replace(/2$/, ''));
  });
  return match?.toString() || '⚽';
}

function bracketTeamName(team) {
  return String(team?.name || 'A definir').replace(/@/g, '＠').slice(0, 40);
}

function bracketTeamText(team, guild, category) {
  return team ? `${bracketTeamEmoji(team, guild, category)} ${bracketTeamName(team)}` : 'A definir';
}

function bracketWinner(record, key) {
  const id = record.winners?.[key];
  return id === undefined ? null : record.teams.find(team => String(team.id) === String(id)) || null;
}

function bracketMatchups(record) {
  const winners = record.winners || {};
  const winningTeam = key => {
    const teamId = winners[key];
    return teamId === undefined
      ? null
      : record.teams.find(team => String(team.id) === String(teamId)) || null;
  };
  const fixtures = [];
  for (let index = 0; index < 8; index += 1) {
    fixtures.push({
      key: `r16:${index}`,
      stage: 'Oitavas',
      index,
      teams: [record.teams[index * 2], record.teams[index * 2 + 1]],
      winner: winningTeam(`r16:${index}`)
    });
  }
  for (let index = 0; index < 4; index += 1) {
    fixtures.push({
      key: `qf:${index}`,
      stage: 'Quartas',
      index,
      teams: [winningTeam(`r16:${index * 2}`), winningTeam(`r16:${index * 2 + 1}`)],
      winner: winningTeam(`qf:${index}`)
    });
  }
  for (let index = 0; index < 2; index += 1) {
    fixtures.push({
      key: `sf:${index}`,
      stage: 'Semifinais',
      index,
      teams: [winningTeam(`qf:${index * 2}`), winningTeam(`qf:${index * 2 + 1}`)],
      winner: winningTeam(`sf:${index}`)
    });
  }
  fixtures.push({
    key: 'f:0',
    stage: 'Final',
    index: 0,
    teams: [winningTeam('sf:0'), winningTeam('sf:1')],
    winner: winningTeam('f:0')
  });
  return fixtures;
}

function downstreamBracketMatches(key) {
  const [stage, rawIndex] = key.split(':');
  const index = Number(rawIndex);
  if (stage === 'r16') {
    return [`qf:${Math.floor(index / 2)}`, `sf:${Math.floor(index / 4)}`, 'f:0'];
  }
  if (stage === 'qf') {
    return [`sf:${Math.floor(index / 2)}`, 'f:0'];
  }
  if (stage === 'sf') return ['f:0'];
  return [];
}

function bracketEmbeds(record, guild) {
  const fixtures = bracketMatchups(record);
  const fixtureText = match => {
    const teams = match.teams.map(team => {
      const text = bracketTeamText(team, guild, record.category);
      return match.winner && team && String(team.id) === String(match.winner.id)
        ? `**${text}**`
        : text;
    });
    return `\`${String(match.index + 1).padStart(2, '0')}\` ${teams[0]}  ×  ${teams[1]}`;
  };
  const roundOf16Text = (matches, firstQuarter) => [
    matches[0] && fixtureText(matches[0]),
    '  ├──┐',
    matches[1] && fixtureText(matches[1]),
    `  └──┴──→ Quartas ${firstQuarter}`,
    matches[2] && fixtureText(matches[2]),
    '  ├──┐',
    matches[3] && fixtureText(matches[3]),
    `  └──┴──→ Quartas ${firstQuarter + 1}`
  ].filter(Boolean).join('\n');
  const finalRoundText = (quarterMatches, semifinal, side) => [
    fixtureText(quarterMatches[0]),
    '  ├──┐',
    fixtureText(quarterMatches[1]),
    `  └──┴──→ ${fixtureText(semifinal)}`,
    '          │',
    '          └──→ FINAL'
  ].join('\n');
  const title = `🏆 Tabela • ${bracketCategoryLabel(record.category)}`;
  const rounds = new EmbedBuilder()
    .setTitle(`${title} • Oitavas`)
    .addFields(
      { name: 'Tier A', value: roundOf16Text(fixtures.slice(0, 4), 1), inline: true },
      { name: 'Tier B', value: roundOf16Text(fixtures.slice(4, 8), 3), inline: true }
    );
  const finals = new EmbedBuilder()
    .setTitle(`${title} • Fases finais`)
    .addFields(
      {
        name: 'Tier A',
        value: finalRoundText(fixtures.slice(8, 10), fixtures[12]),
        inline: true
      },
      {
        name: 'Tier B',
        value: finalRoundText(fixtures.slice(10, 12), fixtures[13]),
        inline: true
      }
    );
  const champion = bracketWinner(record, 'f:0');
  finals.setDescription(
    `**FINAL**\n${fixtureText(fixtures[14])}\n\n↑ **CAMPEÃO**\n${champion ? bracketTeamText(champion, guild, record.category) : 'A definir'}`
  );
  const footer = { text: `Chaveamento #${record.id || 'novo'} • 16 times` };
  rounds.setFooter(footer);
  finals.setFooter(footer);
  return [rounds, finals];
}

function bracketCategoryPayload() {
  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId('central:table-category')
    .setPlaceholder('Escolha a competição dos 16 times')
    .addOptions(BRACKET_CATEGORIES.map(category =>
      new StringSelectMenuOptionBuilder()
        .setLabel(category.label)
        .setValue(category.value)
    ));
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🏆 Criar tabela')
        .setDescription('Escolha uma competição para carregar seus times. Depois, preencha os 16 confrontos das oitavas, selecione o canal e publique a embed.')
    ],
    components: [
      row(categorySelect),
      row(
        button('central:standings', 'Classificação por competição', ButtonStyle.Primary),
        button('central:table-existing', 'Abrir chaveamento existente'),
        button('central:home', '← Voltar à Central')
      )
    ],
    ephemeral: true
  };
}

function bracketExistingPayload(records) {
  if (!records.length) {
    return {
      embeds: [new EmbedBuilder().setTitle('🏆 Chaveamentos').setDescription('Ainda não há chaveamentos salvos neste servidor.')],
      components: [row(button('central:table', 'Criar uma tabela', ButtonStyle.Primary), button('central:home', '← Voltar à Central'))],
      ephemeral: true
    };
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('central:table-existing-select')
    .setPlaceholder('Escolha um chaveamento para continuar')
    .addOptions(records.slice(0, 25).map(record =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`#${record.id} • ${bracketCategoryLabel(record.category)}`.slice(0, 100))
        .setDescription(new Date(record.updated_at).toLocaleDateString('pt-BR'))
        .setValue(String(record.id))
    ));
  return {
    embeds: [new EmbedBuilder().setTitle('🏆 Chaveamentos salvos').setDescription('Selecione uma tabela para registrar os próximos classificados. A embed publicada será atualizada automaticamente.')],
    components: [row(select), row(button('central:table', 'Criar outra tabela'), button('central:home', '← Voltar à Central'))],
    ephemeral: true
  };
}

function bracketSetupPayload(id, bracket, guild, notice = '') {
  const selectedTeamIds = new Set(
    bracket.slots.filter(Boolean).map(team => String(team.id))
  );
  const currentTeam = bracket.slots[bracket.selectedSlot];
  const teamOptions = bracket.teams
    .filter(team => !selectedTeamIds.has(String(team.id)) || String(team.id) === String(currentTeam?.id))
    .map(team => new StringSelectMenuOptionBuilder()
      .setLabel(bracketTeamName(team))
      .setDescription(String(team.acronym || 'Time').slice(0, 100))
      .setValue(String(team.id)));
  teamOptions.push(new StringSelectMenuOptionBuilder().setLabel('Limpar posição').setValue('clear'));

  const slotSelect = new StringSelectMenuBuilder()
    .setCustomId(componentId(id, 'bracket-slot'))
    .setPlaceholder('Escolha uma posição do chaveamento')
    .addOptions(Array.from({ length: 16 }, (_, index) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${index < 8 ? 'Tier A' : 'Tier B'} • Posição ${index % 8 + 1}`)
        .setDescription(bracket.slots[index] ? bracketTeamName(bracket.slots[index]) : 'Vaga vazia')
        .setValue(String(index))
        .setDefault(index === bracket.selectedSlot)
    ));
  const teamSelect = new StringSelectMenuBuilder()
    .setCustomId(componentId(id, 'bracket-team'))
    .setPlaceholder(currentTeam ? `Time na posição ${bracket.selectedSlot + 1}` : 'Escolha o time para a posição selecionada')
    .addOptions(teamOptions);
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(componentId(id, 'bracket-channel'))
    .setPlaceholder(bracket.channelId ? 'Canal escolhido — selecione para trocar' : 'Escolha o canal para publicar')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (bracket.channelId) channelSelect.setDefaultChannels(bracket.channelId);

  const slotLines = bracket.slots.map((team, index) =>
    `${String(index % 8 + 1).padStart(2, '0')}. ${team ? `${bracketTeamEmoji(team, guild, bracket.category)} ${bracketTeamName(team)}` : '—'}`
  );
  const description = [
    notice,
    `**${bracketCategoryLabel(bracket.category)}** • escolha uma posição e depois um time. Cada time só pode ocupar uma vaga.`
  ].filter(Boolean).join('\n\n');
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🏆 Montar chaveamento de 16 times')
        .setDescription(description)
        .addFields(
          { name: 'Tier A', value: slotLines.slice(0, 8).join('\n'), inline: true },
          { name: 'Tier B', value: slotLines.slice(8).join('\n'), inline: true }
        )
    ],
    components: [
      row(slotSelect),
      row(teamSelect),
      row(channelSelect),
      row(
        button(componentId(id, 'bracket-publish'), 'Publicar tabela', ButtonStyle.Success, bracket.slots.some(team => !team) || !bracket.channelId),
        button('central:table', 'Cancelar')
      )
    ],
    ephemeral: true
  };
}

function bracketManagerPayload(id, bracket, guild, notice = '') {
  const fixtures = bracketMatchups(bracket);
  const available = fixtures.filter(match =>
    match.teams.every(Boolean) && !match.winner
  );
  const selectable = fixtures.filter(match => match.teams.every(Boolean));
  const selectedMatch = selectable.find(match => match.key === bracket.selectedMatch);
  const components = [];
  if (selectable.length) {
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'bracket-match'))
      .setPlaceholder('Escolha uma partida para registrar ou corrigir')
      .addOptions(selectable.map(match =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${match.winner ? 'Corrigir • ' : ''}${match.stage} ${match.index + 1}: ${bracketTeamName(match.teams[0])} × ${bracketTeamName(match.teams[1])}`.slice(0, 100))
          .setDescription(match.winner ? `Classificado atual: ${bracketTeamName(match.winner)}` : 'Ainda sem resultado')
          .setValue(match.key)
          .setDefault(match.key === bracket.selectedMatch)
      ))));
  }
  if (selectedMatch) {
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'bracket-winner'))
      .setPlaceholder('Selecione o time classificado')
      .addOptions(selectedMatch.teams.map(team =>
        new StringSelectMenuOptionBuilder()
          .setLabel(bracketTeamName(team))
          .setDescription(String(team.acronym || 'Time').slice(0, 100))
          .setValue(String(team.id))
      ))));
  }
  components.push(row(
    button(componentId(id, 'bracket-refresh'), 'Atualizar'),
    button('central:table', 'Nova tabela'),
    button('central:home', '← Central')
  ));
  return {
    embeds: bracketEmbeds(bracket, guild),
    content: [
      notice,
      available.length
        ? 'Selecione uma partida e depois indique quem passou. Você também pode corrigir resultados; ao corrigir, os resultados posteriores daquele caminho serão apagados.'
        : bracketWinner(bracket, 'f:0')
          ? 'Chaveamento concluído! O campeão também está em destaque na embed publicada.'
          : 'Aguardando os resultados necessários para liberar o próximo confronto. Você ainda pode corrigir os resultados já registrados.'
    ].filter(Boolean).join('\n'),
    components,
    ephemeral: true
  };
}

function flowChannelSelect(id, action, placeholder) {
  return new ChannelSelectMenuBuilder()
    .setCustomId(componentId(id, action))
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
}

function playerCardEmbed(card) {
  if (!card.player) {
    return new EmbedBuilder()
      .setTitle('🪪 Cartão de jogador')
      .setDescription('Selecione um membro do servidor para montar o cartão.');
  }
  const player = card.player;
  const embed = new EmbedBuilder()
    .setTitle(card.title || `🪪 ${player.displayName}`)
    .setDescription([
      `<@${player.id}>`,
      card.description || ''
    ].filter(Boolean).join('\n\n'))
    .addFields(
      { name: '🏟️ Time / seleção', value: player.teams?.slice(0, 3).join('\n') || 'Agente livre', inline: true },
      { name: '⭐ Valor de mercado', value: player.marketValue || 'Não disponível', inline: true },
      { name: '🏆 Divisão', value: player.division || 'Não definida', inline: true },
      { name: '⚽ Posição', value: card.position || 'Não informada', inline: true }
    )
    .setFooter({ text: 'PFL Matchmaker • Cartão de jogador' });
  if (player.avatarUrl) embed.setThumbnail(player.avatarUrl);
  return embed;
}

function playerCardPayload(id, card, notice = '') {
  const playerSelect = new UserSelectMenuBuilder()
    .setCustomId(componentId(id, 'player-card-user'))
    .setPlaceholder(card.player ? `Jogador: ${card.player.displayName}` : 'Pesquise e selecione o jogador')
    .setMinValues(1)
    .setMaxValues(1);
  return {
    content: notice,
    embeds: [playerCardEmbed(card)],
    components: [
      row(playerSelect),
      row(button(componentId(id, 'player-card-settings'), 'Editar apresentação')),
      row(flowChannelSelect(
        id,
        'player-card-channel',
        card.channelId ? 'Canal escolhido — selecione para trocar' : 'Escolha o canal para publicar'
      )),
      row(
        button(componentId(id, 'player-card-publish'), card.published ? 'Cartão publicado' : 'Publicar cartão', ButtonStyle.Success, !card.player || !card.channelId || card.published),
        button('central:home', 'Cancelar')
      )
    ]
  };
}

function playerCardModal(id, card) {
  const modal = new ModalBuilder()
    .setCustomId(componentId(id, 'player-card-modal'))
    .setTitle('Personalizar cartão');
  for (const field of [
    { id: 'title', label: 'Título', value: card.title, required: false, maxLength: 100 },
    { id: 'position', label: 'Posição (opcional)', value: card.position, required: false, maxLength: 40 },
    { id: 'description', label: 'Apresentação (opcional)', value: card.description, required: false, maxLength: 500, paragraph: true }
  ]) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required)
      .setMaxLength(field.maxLength);
    if (field.value) input.setValue(field.value);
    modal.addComponents(row(input));
  }
  return modal;
}

function awardTitle(award) {
  const type = AWARD_TYPES.find(item => item.value === award.type);
  return `${award.emoji || type?.emoji || '🏅'} ${award.title || type?.label || 'Prêmio'}`;
}

function awardRankEmoji(place, guild) {
  const medal = {
    1: '👑',
    2: ':medalha1:',
    3: ':medalha2:',
    4: ':medalha3:',
    5: ':medalha3:'
  }[place] || ':medalha3:';
  return resolveEmojiShortcodes(medal, guild);
}

function awardWinnerLine(award, guild) {
  if (award.type === 'ballon-or' && award.place) {
    const ordinal = `${award.place}º lugar`;
    return `${awardRankEmoji(award.place, guild)} **${ordinal}** — ||<@${award.userId}>||`;
  }
  return `**${awardTitle(award)}** — ||<@${award.userId}>||`;
}

function awardsAnnouncement(awardsState) {
  const users = [...new Set(awardsState.awards.map(award => award.userId))];
  return users.length
    ? `# 🏆 Parabéns aos vencedores: ${users.map(userId => `||<@${userId}>||`).join(' • ')}`
    : '';
}

function awardsEmbed(awardsState, guild) {
  const lines = [];
  const ballonOrAwards = awardsState.awards
    .filter(award => award.type === 'ballon-or')
    .sort((left, right) => left.place - right.place);
  if (ballonOrAwards.length || awardsState.pendingAward?.type === 'ballon-or') {
    lines.push('**🏆 BOLA DE OURO**');
    for (let place = 1; place <= 5; place += 1) {
      const winner = ballonOrAwards.find(award => award.place === place);
      if (winner) {
        lines.push(awardWinnerLine(winner, guild));
      } else if (awardsState.pendingAward?.type === 'ballon-or' &&
          awardsState.pendingAward.place === place) {
        lines.push(`${awardRankEmoji(place, guild)} **${place}º lugar** — *Escolha o vencedor abaixo…*`);
        break;
      }
    }
    lines.push('');
  }
  lines.push(...awardsState.awards
    .filter(award => award.type !== 'ballon-or')
    .map(award => awardWinnerLine(award, guild)));
  if (awardsState.pendingAward) {
    if (awardsState.pendingAward.type !== 'ballon-or') {
      lines.push(`**${awardTitle(awardsState.pendingAward)}** — *Escolha o vencedor abaixo…*`);
    }
  }
  if (!awardsState.awards.length && !awardsState.pendingAward) {
    lines.push('Nenhum prêmio adicionado ainda.');
  }
  if (awardsState.awards.length) {
    lines.push('', awardsAnnouncement(awardsState));
  }
  return new EmbedBuilder()
    .setTitle(awardsState.title || '🏅 Premiações')
    .setDescription([
      awardsState.edition ? `*${awardsState.edition}*` : '',
      '',
      ...lines
    ].join('\n'))
    .setFooter({
      text: `PFL Matchmaker • ${awardsState.awards.length} prêmio(s)${awardsState.pendingAward ? ' • 1 em edição' : ''}`
    });
}

function awardsPayload(id, state, guild, notice = '') {
  const components = [
    row(
      button(componentId(id, 'awards-add'), 'Adicionar prêmio', ButtonStyle.Primary, state.awards.length >= 12),
      button(componentId(id, 'awards-settings'), 'Título / temporada')
    )
  ];
  if (state.awards.length) {
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId(componentId(id, 'awards-remove'))
      .setPlaceholder('Remover um prêmio')
      .addOptions(state.awards.map((award, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${awardTitle(award)} • ${award.displayName}`.slice(0, 100))
          .setValue(String(index))
      ))));
  }
  components.push(row(
    new ChannelSelectMenuBuilder()
      .setCustomId(componentId(id, 'awards-channel'))
      .setPlaceholder(state.channelId ? 'Canal escolhido — selecione para trocar' : 'Escolha o canal para publicar')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1)
  ));
  components.push(row(
    button(componentId(id, 'awards-publish'), state.published ? 'Premiações publicadas' : 'Publicar premiações', ButtonStyle.Success, !state.awards.length || !state.channelId || state.published),
    button('central:home', 'Cancelar')
  ));
  return {
    content: notice,
    allowedMentions: { parse: [] },
    embeds: [awardsEmbed(state, guild)],
    components
  };
}

function awardTypePayload(id, state, guild) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(componentId(id, 'awards-type'))
    .setPlaceholder('Escolha o prêmio que vai adicionar')
    .addOptions(AWARD_TYPES.map(award =>
      new StringSelectMenuOptionBuilder()
        .setLabel(award.label)
        .setValue(award.value)
    ));
  return {
    embeds: [awardsEmbed(state, guild)],
    components: [
      row(select),
      row(button(componentId(id, 'awards-home'), 'Voltar às premiações'))
    ]
  };
}

function awardWinnerPayload(id, state, guild, notice = '') {
  const select = new UserSelectMenuBuilder()
    .setCustomId(componentId(id, 'awards-user'))
    .setPlaceholder(state.pendingAward.type === 'ballon-or'
      ? `Selecione o ${state.pendingAward.place}º lugar da Bola de Ouro`
      : `Selecione quem ganhou ${awardTitle(state.pendingAward)}`)
    .setMinValues(1)
    .setMaxValues(1);
  return {
    content: [notice, awardsAnnouncement(state)].filter(Boolean).join('\n'),
    allowedMentions: { parse: [] },
    embeds: [awardsEmbed(state, guild)],
    components: [
      row(select),
      row(button(componentId(id, 'awards-home'), 'Cancelar e voltar'))
    ]
  };
}

function awardCustomModal(id) {
  return new ModalBuilder()
    .setCustomId(componentId(id, 'awards-custom-modal'))
    .setTitle('Outro prêmio')
    .addComponents(row(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Nome do prêmio')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(60)
    ));
}

function awardsSettingsModal(id, state) {
  const modal = new ModalBuilder()
    .setCustomId(componentId(id, 'awards-settings-modal'))
    .setTitle('Título e temporada');
  for (const field of [
    { id: 'title', label: 'Título da embed', value: state.title, maxLength: 100 },
    { id: 'edition', label: 'Temporada / competição', value: state.edition, maxLength: 80 }
  ]) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(field.maxLength);
    if (field.value) input.setValue(field.value);
    modal.addComponents(row(input));
  }
  return modal;
}

async function handleVisualFlow(i, id, action, session, getPlayerCardData) {
  const updatePlayerCard = notice => i.update(playerCardPayload(id, session.playerCard, notice));
  const updateAwards = notice => i.update(awardsPayload(id, session.awards, i.guild, notice));
  const card = session.playerCard;
  const awardsState = session.awards;

  if (card && action.startsWith('player-card-')) {
    if (i.isUserSelectMenu() && action === 'player-card-user') {
      if (typeof getPlayerCardData !== 'function') {
        await i.reply({ content: 'Os dados de perfil não estão disponíveis agora.', ephemeral: true });
        return true;
      }
      try {
        const player = await getPlayerCardData(i.guild, i.values[0]);
        if (!player || player.isBot) {
          await i.reply({ content: 'Selecione um membro válido que não seja um bot.', ephemeral: true });
          return true;
        }
        card.player = player;
        card.published = false;
        await updatePlayerCard('Jogador selecionado. Confira a prévia e escolha o canal.');
      } catch (error) {
        console.error(`Falha ao carregar os dados do cartão de jogador ${i.values[0]}:`, error);
        await i.reply({ content: 'Não foi possível carregar os dados desse jogador. Tente novamente.', ephemeral: true });
      }
      return true;
    }
    if (i.isButton() && action === 'player-card-settings') {
      await i.showModal(playerCardModal(id, card));
      return true;
    }
    if (i.isModalSubmit() && action === 'player-card-modal') {
      card.title = i.fields.getTextInputValue('title').trim();
      card.position = i.fields.getTextInputValue('position').trim();
      card.description = i.fields.getTextInputValue('description').trim();
      card.published = false;
      await updatePlayerCard('Apresentação atualizada.');
      return true;
    }
    if (i.isChannelSelectMenu() && action === 'player-card-channel') {
      card.channelId = i.values[0];
      await updatePlayerCard('Canal de publicação definido.');
      return true;
    }
    if (i.isButton() && action === 'player-card-publish') {
      if (!card.player || !card.channelId || card.published) {
        await i.reply({ content: 'Selecione um jogador e um canal antes de publicar.', ephemeral: true });
        return true;
      }
      try {
        const channel = await i.guild.channels.fetch(card.channelId);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') {
          await updatePlayerCard('O canal escolhido não aceita mensagens. Selecione um canal de texto.');
          return true;
        }
        const message = await channel.send({
          embeds: [playerCardEmbed(card)],
          allowedMentions: { parse: [] }
        });
        card.published = true;
        await updatePlayerCard(`Cartão publicado em <#${channel.id}> ([abrir mensagem](${message.url})).`);
      } catch (error) {
        console.error('Falha ao publicar cartão de jogador:', error);
        await updatePlayerCard('Não foi possível publicar. Confira as permissões do bot no canal e tente novamente.');
      }
      return true;
    }
  }

  if (awardsState && action.startsWith('awards-')) {
    if (i.isButton() && action === 'awards-add') {
      if (awardsState.awards.length >= 12) {
        await i.reply({ content: 'O limite é de 12 prêmios por publicação.', ephemeral: true });
        return true;
      }
      await i.update(awardTypePayload(id, awardsState, i.guild));
      return true;
    }
    if (i.isButton() && action === 'awards-settings') {
      await i.showModal(awardsSettingsModal(id, awardsState));
      return true;
    }
    if (i.isModalSubmit() && action === 'awards-settings-modal') {
      awardsState.title = i.fields.getTextInputValue('title').trim() || '🏅 Premiações';
      awardsState.edition = i.fields.getTextInputValue('edition').trim();
      awardsState.published = false;
      await updateAwards('Título e temporada atualizados.');
      return true;
    }
    if (i.isModalSubmit() && action === 'awards-custom-modal') {
      const title = i.fields.getTextInputValue('title').trim();
      if (!title) {
        await i.reply({ content: 'Informe um nome para o prêmio personalizado.', ephemeral: true });
        return true;
      }
      awardsState.pendingAward = { type: 'custom', title, emoji: '🏅' };
      await i.update(awardWinnerPayload(id, awardsState, i.guild));
      return true;
    }
    if (i.isStringSelectMenu() && action === 'awards-type') {
      const award = AWARD_TYPES.find(item => item.value === i.values[0]);
      if (!award) {
        await i.reply({ content: 'Prêmio inválido. Escolha um tipo disponível.', ephemeral: true });
        return true;
      }
      if (award.value === 'custom') {
        await i.showModal(awardCustomModal(id));
        return true;
      }
      if (award.value === 'ballon-or' && awardsState.awards.length + 5 > 12) {
        await i.reply({ content: 'A Bola de Ouro ocupa cinco posições. Remova prêmios para deixar espaço para todos os lugares.', ephemeral: true });
        return true;
      }
      awardsState.pendingAward = {
        type: award.value,
        title: award.label,
        emoji: award.emoji,
        ...(award.value === 'ballon-or' ? { place: 1 } : {})
      };
      await i.update(awardWinnerPayload(id, awardsState, i.guild));
      return true;
    }
    if (i.isUserSelectMenu() && action === 'awards-user') {
      const pendingAward = awardsState.pendingAward;
      if (!pendingAward || awardsState.awards.length >= 12) {
        await i.reply({ content: 'Não há um prêmio aguardando vencedor ou o limite já foi atingido.', ephemeral: true });
        return true;
      }
      const userId = i.values[0];
      let member;
      try {
        member = await i.guild.members.fetch(userId);
      } catch (error) {
        console.error(`Falha ao carregar vencedor do prêmio ${userId}:`, error);
        await i.reply({ content: 'Não foi possível carregar esse membro. Tente novamente.', ephemeral: true });
        return true;
      }
      if (!member || member.user.bot) {
        await i.reply({ content: 'Os vencedores precisam ser membros humanos deste servidor.', ephemeral: true });
        return true;
      }
      awardsState.awards.push({
        ...pendingAward,
        userId,
        displayName: member.displayName
      });
      if (pendingAward.type === 'ballon-or' && pendingAward.place < 5) {
        awardsState.pendingAward = {
          ...pendingAward,
          place: pendingAward.place + 1
        };
      } else {
        awardsState.pendingAward = null;
      }
      awardsState.published = false;
      const notice = pendingAward.type === 'ballon-or' && pendingAward.place < 5
        ? `${pendingAward.place}º lugar adicionado para ${member.displayName}. Agora escolha o ${pendingAward.place + 1}º lugar.`
        : `${pendingAward.type === 'ballon-or' ? `${pendingAward.place}º lugar da Bola de Ouro` : awardTitle(pendingAward)} adicionado para ${member.displayName}.`;
      if (awardsState.pendingAward) {
        await i.update(awardWinnerPayload(id, awardsState, i.guild, notice));
      } else {
        await updateAwards(notice);
      }
      return true;
    }
    if (i.isStringSelectMenu() && action === 'awards-remove') {
      const index = Number(i.values[0]);
      if (!Number.isInteger(index) || index < 0 || index >= awardsState.awards.length) {
        await i.reply({ content: 'Prêmio inválido. Atualize a prévia e tente novamente.', ephemeral: true });
        return true;
      }
      const [removed] = awardsState.awards.splice(index, 1);
      awardsState.published = false;
      await updateAwards(`${awardTitle(removed)} foi removido.`);
      return true;
    }
    if (i.isChannelSelectMenu() && action === 'awards-channel') {
      awardsState.channelId = i.values[0];
      await updateAwards('Canal de publicação definido.');
      return true;
    }
    if (i.isButton() && action === 'awards-home') {
      await updateAwards();
      return true;
    }
    if (i.isButton() && action === 'awards-publish') {
      if (!awardsState.awards.length || !awardsState.channelId || awardsState.published) {
        await i.reply({ content: 'Adicione ao menos um prêmio e selecione um canal antes de publicar.', ephemeral: true });
        return true;
      }
      try {
        const channel = await i.guild.channels.fetch(awardsState.channelId);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') {
          await updateAwards('O canal escolhido não aceita mensagens. Selecione um canal de texto.');
          return true;
        }
        const message = await channel.send({
          embeds: [awardsEmbed(awardsState, i.guild)],
          allowedMentions: { parse: [] }
        });
        awardsState.published = true;
        await updateAwards(`Premiações publicadas em <#${channel.id}> ([abrir mensagem](${message.url})).`);
      } catch (error) {
        console.error('Falha ao publicar premiações:', error);
        await updateAwards('Não foi possível publicar. Confira as permissões do bot no canal e tente novamente.');
      }
      return true;
    }
  }

  return false;
}

function mentionOptions(text) {
  const users = [...text.matchAll(/<@!?(\d{17,20})>/g)].map(match => match[1]);
  return {
    users: [...new Set(users)],
    parse: []
  };
}

async function updatePublishedBracket(i, record) {
  const channel = await i.guild.channels.fetch(record.channelId);
  if (!channel?.isTextBased() || !channel.messages) {
    throw new Error('O canal da publicação não está disponível.');
  }
  const message = await channel.messages.fetch(record.messageId);
  await message.edit({
    embeds: bracketEmbeds(record, i.guild),
    allowedMentions: { parse: [] }
  });
}

function bracketSessionFromRecord(record) {
  return {
    category: record.category,
    teams: record.teams,
    slots: record.teams,
    winners: record.winners || {},
    channelId: record.channelId,
    tableId: record.id,
    selectedMatch: null
  };
}

async function handleBracketInteraction(i, id, action, session, repository) {
  if (!action.startsWith('bracket-')) return false;
  const bracket = session.bracket;
  if (!bracket) {
    await i.reply({ content: 'Esta sessão de tabela expirou. Abra `/central` → **Tabela** novamente.', ephemeral: true });
    return true;
  }
  const updateSetup = notice => i.update(bracketSetupPayload(id, bracket, i.guild, notice));
  const updateManager = notice => i.update(bracketManagerPayload(id, bracket, i.guild, notice));

  if (action === 'bracket-slot' && i.isStringSelectMenu()) {
    const slot = Number(i.values[0]);
    if (!Number.isInteger(slot) || slot < 0 || slot >= 16 || !bracket.slots) {
      await i.reply({ content: 'Posição inválida. Escolha uma das 16 vagas.', ephemeral: true });
      return true;
    }
    bracket.selectedSlot = slot;
    await updateSetup();
    return true;
  }

  if (action === 'bracket-team' && i.isStringSelectMenu()) {
    if (!bracket.slots || !Array.isArray(bracket.teams)) {
      await i.reply({ content: 'A seleção de times não está disponível nesta tabela.', ephemeral: true });
      return true;
    }
    const value = i.values[0];
    if (value === 'clear') {
      bracket.slots[bracket.selectedSlot] = null;
      await updateSetup('Posição limpa.');
      return true;
    }
    const team = bracket.teams.find(candidate => String(candidate.id) === value);
    const duplicate = bracket.slots.some((candidate, index) =>
      index !== bracket.selectedSlot && String(candidate?.id) === value
    );
    if (!team || duplicate) {
      await i.reply({ content: 'Time inválido ou já usado em outra posição. Escolha um time disponível.', ephemeral: true });
      return true;
    }
    bracket.slots[bracket.selectedSlot] = {
      id: team.id,
      name: team.name,
      acronym: team.acronym,
      crest: team.crest || null
    };
    await updateSetup(`**${bracketTeamName(team)}** foi colocado na posição ${bracket.selectedSlot + 1}.`);
    return true;
  }

  if (action === 'bracket-channel' && i.isChannelSelectMenu()) {
    bracket.channelId = i.values[0];
    await updateSetup('Canal de publicação definido.');
    return true;
  }

  if (action === 'bracket-publish' && i.isButton()) {
    const teamIds = bracket.slots?.map(team => String(team?.id));
    if (!teamIds || teamIds.length !== 16 || teamIds.some(id => id === 'undefined') ||
        new Set(teamIds).size !== 16 || !bracket.channelId) {
      await updateSetup('Preencha as 16 posições com times diferentes e escolha o canal antes de publicar.');
      return true;
    }
    if (typeof repository?.create !== 'function') {
      await updateSetup('O armazenamento de chaveamentos não está disponível agora.');
      return true;
    }
    let message;
    let saved = false;
    try {
      const channel = await i.guild.channels.fetch(bracket.channelId);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        await updateSetup('O canal escolhido não aceita mensagens. Escolha um canal de texto.');
        return true;
      }
      const record = {
        guildId: i.guildId,
        category: bracket.category,
        teams: bracket.slots,
        winners: {},
        channelId: channel.id,
        createdBy: i.user.id
      };
      message = await channel.send({
        embeds: bracketEmbeds(record, i.guild),
        allowedMentions: { parse: [] }
      });
      record.messageId = message.id;
      record.id = await repository.create(record);
      saved = true;
      bracket.tableId = record.id;
      bracket.teams = bracket.slots;
      bracket.winners = {};
      bracket.selectedMatch = null;
      await i.update(bracketManagerPayload(id, bracket, i.guild, `Tabela publicada em <#${channel.id}>.`));
    } catch (error) {
      console.error('Falha ao publicar ou salvar o chaveamento:', error);
      if (message && !saved) {
        try {
          await message.delete();
        } catch (deleteError) {
          console.error('Falha ao remover uma publicação de chaveamento sem registro:', deleteError);
        }
      }
      await updateSetup('Não foi possível publicar a tabela. Confira se o bot pode enviar embeds no canal e tente novamente.');
    }
    return true;
  }

  if (action === 'bracket-refresh' && i.isButton()) {
    if (!bracket.tableId || typeof repository?.get !== 'function') {
      await updateManager('Este chaveamento ainda não foi publicado.');
      return true;
    }
    try {
      const record = await repository.get(bracket.tableId, i.guildId);
      if (!record) {
        await updateManager('Este chaveamento não foi encontrado.');
        return true;
      }
      Object.assign(bracket, bracketSessionFromRecord(record));
      try {
        await updatePublishedBracket(i, record);
      } catch (error) {
        console.error(`Falha ao sincronizar a publicação do chaveamento #${record.id}:`, error);
        await updateManager('Dados carregados, mas não foi possível sincronizar a embed publicada. Confira as permissões do bot.');
        return true;
      }
      await updateManager('Tabela atualizada com os dados salvos.');
    } catch (error) {
      console.error('Falha ao atualizar o chaveamento salvo:', error);
      await updateManager('Não foi possível atualizar a tabela. Tente novamente.');
    }
    return true;
  }

  if (action === 'bracket-match' && i.isStringSelectMenu()) {
    const selectable = bracketMatchups(bracket).filter(match =>
      match.teams.every(Boolean)
    );
    const selected = selectable.find(match => match.key === i.values[0]);
    if (!selected) {
      await i.reply({ content: 'Essa partida ainda não está liberada. Atualize a tabela e escolha um confronto disponível.', ephemeral: true });
      return true;
    }
    bracket.selectedMatch = selected.key;
    await updateManager();
    return true;
  }

  if (action === 'bracket-winner' && i.isStringSelectMenu()) {
    if (!bracket.tableId || typeof repository?.get !== 'function' ||
        typeof repository?.updateWinners !== 'function') {
      await i.reply({ content: 'O chaveamento salvo não está disponível para atualização.', ephemeral: true });
      return true;
    }
    let record;
    try {
      record = await repository.get(bracket.tableId, i.guildId);
    } catch (error) {
      console.error('Falha ao carregar o chaveamento antes de registrar o classificado:', error);
      await updateManager('Não foi possível carregar os dados salvos. Tente novamente.');
      return true;
    }
    if (!record) {
      await updateManager('Este chaveamento não foi encontrado.');
      return true;
    }
    const match = bracketMatchups(record).find(candidate =>
      candidate.key === bracket.selectedMatch &&
      candidate.teams.every(Boolean)
    );
    if (!match || !match.teams.some(team => String(team.id) === i.values[0])) {
      await i.reply({ content: 'Classificado inválido. Escolha um dos dois times desta partida.', ephemeral: true });
      return true;
    }
    const changedWinner = String(match.winner?.id) !== i.values[0];
    const winners = { ...record.winners, [match.key]: i.values[0] };
    if (changedWinner) {
      for (const downstreamKey of downstreamBracketMatches(match.key)) {
        delete winners[downstreamKey];
      }
    }
    try {
      await repository.updateWinners(record.id, i.guildId, winners, record.winners);
    } catch (error) {
      console.error('Falha ao salvar o classificado do chaveamento:', error);
      await updateManager('Não foi possível salvar o classificado. Tente novamente.');
      return true;
    }
    const updatedRecord = { ...record, winners };
    Object.assign(bracket, bracketSessionFromRecord(updatedRecord));
    try {
      await updatePublishedBracket(i, updatedRecord);
    } catch (error) {
      console.error(`Falha ao atualizar a embed publicada do chaveamento #${record.id}:`, error);
      await updateManager(`Resultado salvo, mas não foi possível editar a publicação no canal. Verifique as permissões e tente **Atualizar**.`);
      return true;
    }
    const correctionNotice = match.winner && changedWinner
      ? ' Os resultados posteriores desse caminho foram limpos; registre-os novamente.'
      : '';
    await updateManager(`${bracketTeamName(match.teams.find(team => String(team.id) === i.values[0]))} avançou para a próxima fase.${correctionNotice}`);
    return true;
  }

  return true;
}

async function handleStatisticsInteraction(i, {
  admin,
  refereeRoleId,
  startRefereeAssignment,
  getPendingRefereeMatches,
  handleCentralAdminInteraction,
  bracketRepository,
  getPlayerCardData,
  applyStatisticsMarketChanges
}) {
  const customId = i.customId;
  if (!customId || (!customId.startsWith('stats:') && !customId.startsWith('central:'))) {
    return false;
  }
  if (!i.inGuild()) {
    await i.reply({ content: 'Use esta ferramenta dentro do servidor.', ephemeral: true });
    return true;
  }
  const isPublicDonationAction = [
    'central:money-donate',
    'central:submit:team-donate'
  ].includes(customId);
  if (!admin(i) && !isPublicDonationAction) {
    await i.reply({ content: 'Apenas administradores podem usar a Central PFL.', ephemeral: true });
    return true;
  }
  if (customId.startsWith('central:')) {
    if (handleCentralAdminInteraction && await handleCentralAdminInteraction(i)) {
      return true;
    }

    if (customId === 'central:table' && i.isButton()) {
      await i.update(bracketCategoryPayload());
      return true;
    }

    if (customId === 'central:player-card' && i.isButton()) {
      const { id, session } = createSession(i.user.id, i.guildId);
      session.playerCard = {
        player: null,
        title: '',
        position: '',
        description: '',
        channelId: null,
        published: false
      };
      await i.update(playerCardPayload(id, session.playerCard));
      return true;
    }

    if (customId === 'central:awards' && i.isButton()) {
      const { id, session } = createSession(i.user.id, i.guildId);
      session.awards = {
        title: '🏅 Premiações',
        edition: '',
        awards: [],
        pendingAward: null,
        channelId: null,
        published: false
      };
      await i.update(awardsPayload(id, session.awards, i.guild));
      return true;
    }

    if (customId === 'central:table-category' && i.isStringSelectMenu()) {
      const category = i.values[0];
      if (!BRACKET_CATEGORIES.some(candidate => candidate.value === category)) {
        await i.reply({ content: 'Competição inválida. Escolha uma categoria da lista.', ephemeral: true });
        return true;
      }
      if (typeof bracketRepository?.getTeams !== 'function') {
        await i.update(bracketCategoryPayload());
        await i.followUp({ content: 'O catálogo de times não está disponível agora.', ephemeral: true });
        return true;
      }
      try {
        await fetchAvailableEmojis(i.guild);
        const teams = await bracketRepository.getTeams(i.guildId, category);
        if (teams.length !== 16) {
          await i.update(bracketCategoryPayload());
          await i.followUp({
            content: `A categoria **${bracketCategoryLabel(category)}** precisa ter exatamente 16 times cadastrados; encontrei ${teams.length}.`,
            ephemeral: true
          });
          return true;
        }
        const { id, session } = createSession(i.user.id, i.guildId);
        session.bracket = {
          category,
          teams,
          slots: Array(16).fill(null),
          selectedSlot: 0,
          channelId: null,
          tableId: null,
          winners: {},
          selectedMatch: null
        };
        await i.update(bracketSetupPayload(id, session.bracket, i.guild));
      } catch (error) {
        console.error(`Falha ao carregar times para a categoria ${category}:`, error);
        await i.update(bracketCategoryPayload());
        await i.followUp({ content: 'Não foi possível carregar os times ou emojis desta categoria. Tente novamente.', ephemeral: true });
      }
      return true;
    }

    if (customId === 'central:table-existing' && i.isButton()) {
      if (typeof bracketRepository?.list !== 'function') {
        await i.reply({ content: 'A lista de chaveamentos não está disponível agora.', ephemeral: true });
        return true;
      }
      try {
        await i.update(bracketExistingPayload(await bracketRepository.list(i.guildId)));
      } catch (error) {
        console.error('Falha ao listar chaveamentos salvos:', error);
        await i.reply({ content: 'Não foi possível carregar os chaveamentos salvos. Tente novamente.', ephemeral: true });
      }
      return true;
    }

    if (customId === 'central:table-existing-select' && i.isStringSelectMenu()) {
      const tableId = Number(i.values[0]);
      if (!Number.isSafeInteger(tableId) || tableId < 1 ||
          typeof bracketRepository?.get !== 'function') {
        await i.reply({ content: 'Chaveamento inválido. Escolha uma tabela da lista.', ephemeral: true });
        return true;
      }
      try {
        await fetchAvailableEmojis(i.guild);
        const record = await bracketRepository.get(tableId, i.guildId);
        if (!record) {
          await i.reply({ content: 'Esse chaveamento não existe mais neste servidor.', ephemeral: true });
          return true;
        }
        const { id, session } = createSession(i.user.id, i.guildId);
        session.bracket = bracketSessionFromRecord(record);
        await i.update(bracketManagerPayload(id, session.bracket, i.guild));
      } catch (error) {
        console.error(`Falha ao abrir chaveamento #${tableId}:`, error);
        await i.reply({ content: 'Não foi possível abrir esse chaveamento. Tente novamente.', ephemeral: true });
      }
      return true;
    }

    if (i.isUserSelectMenu()) {
      const action = customId.slice('central:'.length);
      if (!['judge-grant-member', 'judge-revoke-member'].includes(action)) return true;
      if (!refereeRoleId) {
        await i.update(centralPanel('referees', 'O cargo de juiz não está configurado.'));
        return true;
      }
      let role;
      let member;
      try {
        [role, member] = await Promise.all([
          i.guild.roles.fetch(refereeRoleId),
          i.guild.members.fetch(i.values[0])
        ]);
      } catch (error) {
        console.error('Falha ao carregar o cargo ou o membro da arbitragem:', error);
        await i.update(centralPanel('referees', 'Não foi possível carregar o cargo ou o membro. Tente novamente.'));
        return true;
      }
      if (!role) {
        await i.update(centralPanel('referees', 'O cargo de juiz não foi encontrado neste servidor.'));
        return true;
      }
      if (!member || member.user.bot) {
        await i.update(centralPanel('referees', 'Escolha um membro humano deste servidor.'));
        return true;
      }
      const shouldHaveRole = action === 'judge-grant-member';
      if (member.roles.cache.has(role.id) === shouldHaveRole) {
        await i.update(centralPanel(
          'referees',
          shouldHaveRole
            ? `${member.displayName} já possui o cargo de juiz.`
            : `${member.displayName} não possui o cargo de juiz.`
        ));
        return true;
      }
      if (role.managed || !role.editable) {
        await i.update(centralPanel('referees', 'Não consigo gerenciar esse cargo. Confira a permissão Gerenciar cargos e a hierarquia dos cargos do bot.'));
        return true;
      }
      try {
        await member.roles[shouldHaveRole ? 'add' : 'remove'](role);
      } catch (error) {
        console.error(`Falha ao ${shouldHaveRole ? 'dar' : 'remover'} o cargo de juiz de ${member.id}:`, error);
        await i.update(centralPanel('referees', 'Falha ao atualizar o cargo. Confira a permissão Gerenciar cargos e a hierarquia dos cargos do bot.'));
        return true;
      }
      await i.update(centralPanel(
        'referees',
        `${shouldHaveRole ? 'Cargo de juiz dado para' : 'Cargo de juiz removido de'} ${member.displayName}.`
      ));
      return true;
    }

    if (i.isStringSelectMenu()) {
      if (!customId.startsWith('central:assign-match-select:')) return true;
      const matchId = Number(i.values[0]);
      if (!Number.isSafeInteger(matchId) || matchId < 1) {
        await i.update(centralPanel('referees', 'Partida inválida. Escolha uma partida OFC pendente.'));
        return true;
      }
      if (typeof startRefereeAssignment !== 'function') {
        await i.update(centralPanel('referees', 'A designação de juiz não está disponível agora.'));
        return true;
      }
      await startRefereeAssignment(i, matchId);
      return true;
    }

    if (!i.isButton()) return true;
    if (customId === 'central:rosters') {
      await i.update(centralPanel('rosters'));
      return true;
    }
    if (customId === 'central:matches') {
      await i.update(centralPanel('matches'));
      return true;
    }
    if (customId === 'central:players') {
      await i.update(centralPanel('players'));
      return true;
    }
    if (customId === 'central:money') {
      await i.update(centralPanel('money'));
      return true;
    }
    if (customId === 'central:teams') {
      await i.update(centralPanel('teams'));
      return true;
    }
    if (customId === 'central:tools') {
      await i.update(centralPanel('tools'));
      return true;
    }
    if (customId === 'central:referees') {
      await i.update(centralPanel('referees'));
      return true;
    }
    if (customId === 'central:home') {
      await i.update(centralPanel());
      return true;
    }
    if (customId === 'central:judges-view' || customId.startsWith('central:judges-page:')) {
      const page = customId === 'central:judges-view'
        ? 0
        : Number(customId.slice('central:judges-page:'.length));
      if (!Number.isInteger(page) || page < 0) {
        await i.update(centralPanel('referees', 'Página inválida.'));
        return true;
      }
      if (!refereeRoleId) {
        await i.update(centralPanel('referees', 'O cargo de juiz não está configurado.'));
        return true;
      }
      try {
        await i.guild.members.fetch();
        const role = await i.guild.roles.fetch(refereeRoleId);
        if (!role) {
          await i.update(centralPanel('referees', 'O cargo de juiz não foi encontrado neste servidor.'));
          return true;
        }
        const judges = [...role.members.values()].sort((left, right) =>
          left.displayName.localeCompare(right.displayName, 'pt-BR')
        );
        const pageSize = 15;
        const pageCount = Math.max(1, Math.ceil(judges.length / pageSize));
        const currentPage = Math.min(page, pageCount - 1);
        const entries = judges.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
        const embed = new EmbedBuilder()
          .setTitle('⚖️ Juízes da PFL')
          .setDescription(entries.length
            ? entries.map((member, index) => `**${currentPage * pageSize + index + 1}.** ${member}`).join('\n')
            : 'Nenhum membro possui o cargo de juiz.')
          .setFooter({ text: `Página ${currentPage + 1}/${pageCount} • ${judges.length} juiz(es)` });
        const components = [];
        if (pageCount > 1) {
          components.push(row(
            button(`central:judges-page:${currentPage - 1}`, 'Anterior', ButtonStyle.Secondary, currentPage === 0),
            button(`central:judges-page:${currentPage + 1}`, 'Próxima', ButtonStyle.Secondary, currentPage >= pageCount - 1)
          ));
        }
        components.push(row(button('central:referees', '← Voltar à Arbitragem')));
        await i.update({ embeds: [embed], components });
      } catch (error) {
        console.error('Falha ao listar os juízes pela Central:', error);
        await i.update(centralPanel('referees', 'Não foi possível carregar a lista de juízes. Tente novamente.'));
      }
      return true;
    }
    if (customId === 'central:judge-grant' || customId === 'central:judge-revoke') {
      const select = new UserSelectMenuBuilder()
        .setCustomId(`central:${customId === 'central:judge-grant' ? 'judge-grant-member' : 'judge-revoke-member'}`)
        .setPlaceholder('Pesquise qualquer membro deste servidor')
        .setMinValues(1)
        .setMaxValues(1);
      await i.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(customId === 'central:judge-grant' ? '⚖️ Dar cargo de juiz' : '⚖️ Remover cargo de juiz')
            .setDescription('Pesquise e selecione um membro do servidor no menu abaixo.')
        ],
        components: [
          row(select),
          row(button('central:referees', 'Cancelar e voltar'))
        ]
      });
      return true;
    }
    if (customId === 'central:judge-assign') {
      if (typeof getPendingRefereeMatches !== 'function') {
        await i.update(centralPanel('referees', 'A lista de partidas não está disponível agora.'));
        return true;
      }
      try {
        const matches = await getPendingRefereeMatches();
        if (matches.length === 0) {
          await i.update(centralPanel('referees', 'Não há partidas OFC pendentes para designar um juiz.'));
          return true;
        }
        const page = 0;
        const pageSize = 25;
        const options = matches.slice(0, pageSize).map(match =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`#${match.id} • ${match.team_a_name} x ${match.team_b_name}`.slice(0, 100))
            .setDescription(String(match.competition || 'Partida OFC').slice(0, 100))
            .setValue(String(match.id))
        );
        const components = [row(new StringSelectMenuBuilder()
          .setCustomId(`central:assign-match-select:${page}`)
          .setPlaceholder('Escolha uma partida OFC pendente')
          .addOptions(options))];
        if (matches.length > pageSize) {
          components.push(row(
            button('central:assign-match-page:1', 'Próximas partidas', ButtonStyle.Secondary)
          ));
        }
        components.push(row(button('central:referees', 'Cancelar e voltar')));
        await i.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('⚖️ Designar juiz para partida')
              .setDescription('Selecione uma partida OFC pendente. Depois, escolha o juiz responsável.')
          ],
          components
        });
      } catch (error) {
        console.error('Falha ao carregar partidas OFC pendentes pela Central:', error);
        await i.update(centralPanel('referees', 'Não foi possível carregar as partidas pendentes.'));
      }
      return true;
    }
    if (customId.startsWith('central:assign-match-page:')) {
      const page = Number(customId.slice('central:assign-match-page:'.length));
      if (!Number.isInteger(page) || page < 0 || typeof getPendingRefereeMatches !== 'function') {
        await i.update(centralPanel('referees', 'Página inválida ou lista de partidas indisponível.'));
        return true;
      }
      try {
        const matches = await getPendingRefereeMatches();
        const pageSize = 25;
        const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
        const currentPage = Math.min(page, pageCount - 1);
        const options = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(match =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`#${match.id} • ${match.team_a_name} x ${match.team_b_name}`.slice(0, 100))
            .setDescription(String(match.competition || 'Partida OFC').slice(0, 100))
            .setValue(String(match.id))
        );
        const components = [row(new StringSelectMenuBuilder()
          .setCustomId(`central:assign-match-select:${currentPage}`)
          .setPlaceholder('Escolha uma partida OFC pendente')
          .addOptions(options))];
        components.push(row(
          button(`central:assign-match-page:${currentPage - 1}`, 'Anteriores', ButtonStyle.Secondary, currentPage === 0),
          button(`central:assign-match-page:${currentPage + 1}`, 'Próximas', ButtonStyle.Secondary, currentPage >= pageCount - 1)
        ));
        components.push(row(button('central:referees', 'Cancelar e voltar')));
        await i.update({ embeds: [new EmbedBuilder().setTitle('⚖️ Designar juiz para partida').setDescription('Selecione uma partida OFC pendente.')], components });
      } catch (error) {
        console.error('Falha ao paginar partidas OFC pendentes pela Central:', error);
        await i.update(centralPanel('referees', 'Não foi possível carregar as partidas pendentes.'));
      }
      return true;
    }
    if (customId !== 'central:statistics') {
      await i.reply({ content: 'Esta opção da Central não está disponível.', ephemeral: true });
      return true;
    }
    const { id, session } = createSession(i.user.id, i.guildId);
    await i.deferUpdate();
    session.dashboardMessage = await i.editReply(structuredPayload(
      id,
      session,
      i.guild,
      'Editor de estatísticas: clique em uma posição e escolha qualquer membro do servidor pelo menu de busca.'
    ));
    return true;
  }

  const [, id, action, ...detailParts] = customId.split(':');
  const detail = detailParts.join(':');
  const session = getSession(id, i.guildId, i.user.id);
  if (!session) {
    await i.reply({
      content: 'Esta sessão expirou ou pertence a outra pessoa. Execute `/central` e abra Estatísticas novamente.',
      ephemeral: true
    });
    return true;
  }

  if (session.bracket) {
    return handleBracketInteraction(i, id, action, session, bracketRepository);
  }
  if (session.playerCard || session.awards) {
    return handleVisualFlow(i, id, action, session, getPlayerCardData);
  }

  if (i.isModalSubmit()) {
    if (action === 'score-modal') {
      const score = [0, 1].map(side =>
        i.fields.getTextInputValue(`score${side}`).trim()
      );
      const stadium = i.fields.getTextInputValue('stadium').trim();
      if (score.some(value => !/^\d{1,4}$/.test(value))) {
        await i.reply({ content: 'Informe um placar numérico entre 0 e 9999 para cada time.', ephemeral: true });
        return true;
      }
      const previous = { score: session.score, stadium: session.stadium };
      session.score = score.map(Number);
      session.stadium = stadium;
      const rendered = renderEmbed(session, i.guild);
      if (rendered.error) {
        session.score = previous.score;
        session.stadium = previous.stadium;
        await i.reply({ content: rendered.error, ephemeral: true });
        return true;
      }
      await i.update(structuredPayload(id, session, i.guild, 'Placar e estádio atualizados.'));
      return true;
    }
    if (action === 'penalties-modal') {
      const penaltyScore = [0, 1].map(side =>
        i.fields.getTextInputValue(`penalty${side}`).trim()
      );
      if (penaltyScore.some(value => !/^\d{1,4}$/.test(value))) {
        await i.reply({ content: 'Informe um placar numérico de pênaltis entre 0 e 9999 para cada time.', ephemeral: true });
        return true;
      }
      const previous = session.penaltyScore;
      session.penaltyScore = penaltyScore.map(Number);
      session.penaltiesEnabled = true;
      const rendered = renderEmbed(session, i.guild);
      if (rendered.error) {
        session.penaltyScore = previous;
        session.penaltiesEnabled = false;
        await i.reply({ content: rendered.error, ephemeral: true });
        return true;
      }
      await i.update(structuredPayload(id, session, i.guild, 'Placar dos pênaltis ativado.'));
      return true;
    }
    if (action === 'structured-event-minute') {
      const [side, type] = detail.split(':');
      const minute = i.fields.getTextInputValue('minute').trim();
      const pending = session.structured.pendingEvent;
      if (!['0', '1'].includes(side) ||
          !MATCH_EVENTS.some(event => event.value === type) ||
          !pending || pending.side !== Number(side) || pending.type !== type ||
          !/^\d+(?:\+\d+)?$/.test(minute)) {
        await i.reply({
          content: 'Evento inválido ou minuto fora do formato. Use, por exemplo, 8 ou 90+2.',
          ephemeral: true
        });
        return true;
      }
      if (session.structured.events[Number(side)].length >= 25) {
        session.structured.pendingEvent = null;
        await i.reply({ content: 'O limite do Discord é 25 eventos por time nesta embed.', ephemeral: true });
        return true;
      }
      session.structured.events[Number(side)].push({
        userId: pending.userId,
        type,
        minute
      });
      session.structured.pendingEvent = null;
      await i.update(eventPicker(id, session, i.guild, Number(side)));
      return true;
    }
    if (action === 'structured-sub-minute') {
      const side = Number(detail);
      const minute = i.fields.getTextInputValue('minute').trim();
      const pending = session.structured.pendingSubstitution;
      if (![0, 1].includes(side) || !pending || pending.side !== side ||
          !/^\d+(?:\+\d+)?$/.test(minute)) {
        await i.reply({
          content: 'Substituição inválida ou minuto fora do formato. Use, por exemplo, 36 ou 90+2.',
          ephemeral: true
        });
        return true;
      }
      session.structured.substitutions[side].push({
        outId: pending.outId,
        inId: pending.inId,
        minute
      });
      session.structured.pendingSubstitution = null;
      await i.update(structuredPayload(id, session, i.guild, `Substituição do time ${side + 1} adicionada.`));
      return true;
    }
    if (action === 'metadata-modal') {
      const category = i.fields.getTextInputValue('category').trim();
      const season = i.fields.getTextInputValue('season').trim().replace(/^s/i, '');
      const team1 = i.fields.getTextInputValue('team1').trim();
      const team2 = i.fields.getTextInputValue('team2').trim();
      const stage = i.fields.getTextInputValue('stage').trim();
      if (!category || !/^\d{1,12}$/.test(season) || !team1 || !team2) {
        await i.reply({ content: 'Informe a categoria, os nomes dos times e uma season numérica válida.', ephemeral: true });
        return true;
      }
      const previous = {
        category: session.category,
        season: session.season,
        team1: session.teams[0].name,
        team2: session.teams[1].name,
        stage: session.stage
      };
      session.category = category;
      session.season = season;
      session.teams[0].name = team1;
      session.teams[1].name = team2;
      session.stage = stage;
      const rendered = renderEmbed(session, i.guild);
      if (rendered.error) {
        session.category = previous.category;
        session.season = previous.season;
        session.teams[0].name = previous.team1;
        session.teams[1].name = previous.team2;
        session.stage = previous.stage;
        await i.reply({ content: rendered.error, ephemeral: true });
        return true;
      }
      await i.update(structuredPayload(id, session, i.guild));
      return true;
    }
    await i.reply({ content: 'Este formulário não é mais válido.', ephemeral: true });
    return true;
  }

  if (i.isStringSelectMenu() && action === 'emoji') {
    const side = Number(detail);
    if (![0, 1].includes(side) ||
        !session.shieldCategory ||
        !shieldEmojiChoices(i.guild, session.shieldCategory)
          .some(({ value }) => value === i.values[0])) {
      await i.reply({ content: 'Emoji inválido. Escolha um dos emojis disponíveis.', ephemeral: true });
      return true;
    }
    session.teams[side].emoji = i.values[0];
    await i.update(structuredPayload(
      id,
      session,
      i.guild,
      `Escudo do time ${side + 1} atualizado.`
    ));
    return true;
  }

  if (i.isStringSelectMenu() && action === 'shield-category') {
    const category = i.values[0];
    if (!SHIELD_CATEGORIES.some(candidate => candidate.value === category)) {
      await i.reply({ content: 'Categoria de escudos inválida.', ephemeral: true });
      return true;
    }
    session.shieldCategory = category;
    session.emojiPages = [0, 0, 0];
    await i.update(structuredEmojiPayload(id, session, i.guild));
    return true;
  }

  if (i.isStringSelectMenu() && action === 'event-emoji-type') {
    const emojiType = i.values[0];
    if (!Object.hasOwn(session.structured.eventEmojis, emojiType)) {
      await i.reply({ content: 'Tipo de emoji inválido.', ephemeral: true });
      return true;
    }
    session.structured.pendingEmoji = emojiType;
    await i.update(eventEmojiPanel(id, session, i.guild));
    return true;
  }
  if (i.isStringSelectMenu() && action === 'event-emoji-value') {
    const emojiType = session.structured.pendingEmoji;
    if (!emojiType || !Object.hasOwn(session.structured.eventEmojis, emojiType) ||
        !emojiChoices(i.guild).some(({ value }) => value === i.values[0])) {
      await i.reply({ content: 'Emoji inválido. Escolha um dos emojis disponíveis.', ephemeral: true });
      return true;
    }
    session.structured.eventEmojis[emojiType] = i.values[0];
    await i.update(eventEmojiPanel(id, session, i.guild, 'Emoji atualizado.'));
    return true;
  }

  if (i.isStringSelectMenu() && action === 'structured-gk-pick') {
    const side = Number(detail);
    if (![0, 1].includes(side) ||
        (i.values[0] !== 'none' && !session.structured.rosters[side].includes(i.values[0]))) {
      await i.reply({ content: 'O GK precisa estar no elenco escolhido para aquele time.', ephemeral: true });
      return true;
    }
    session.structured.goalkeepers[side] = i.values[0] === 'none' ? null : i.values[0];
    await i.update(structuredPayload(id, session, i.guild, `GK do time ${side + 1} atualizado.`));
    return true;
  }
  if (i.isStringSelectMenu() && action === 'structured-sub-out') {
    const side = Number(detail);
    if (![0, 1].includes(side) || !session.structured.rosters[side].includes(i.values[0])) {
      await i.reply({ content: 'Escolha um titular válido para sair.', ephemeral: true });
      return true;
    }
    session.structured.pendingSubstitution = { side, outId: i.values[0], inId: null };
    await i.update(substitutionInPicker(id, session, i.guild, side));
    return true;
  }
  if (i.isStringSelectMenu() && action === 'structured-official-pick') {
    const userId = i.values[0];
    if (session.structured.officials.length >= 25) {
      await i.reply({ content: 'O limite do Discord é 25 oficiais nesta embed.', ephemeral: true });
      return true;
    }
    if (!session.structured.refereeIds.includes(userId) ||
        session.structured.officials.includes(userId)) {
      await i.reply({ content: 'Selecione um juiz elegível que ainda não foi adicionado.', ephemeral: true });
      return true;
    }
    session.structured.officials.push(userId);
    session.structured.refereePage = 0;
    await i.update(structuredPayload(id, session, i.guild, 'Juiz adicionado aos oficiais.'));
    return true;
  }
  if (i.isStringSelectMenu() && action === 'structured-official-remove') {
    if (!session.structured.officials.includes(i.values[0])) {
      await i.reply({ content: 'Esse juiz não está mais na lista de oficiais.', ephemeral: true });
      return true;
    }
    session.structured.officials = session.structured.officials.filter(
      userId => userId !== i.values[0]
    );
    await i.update(refereePicker(id, session, i.guild));
    return true;
  }
  if (i.isStringSelectMenu() && action === 'structured-event-remove') {
    const side = Number(detail);
    const eventIndex = Number(i.values[0]);
    if (![0, 1].includes(side) || !Number.isInteger(eventIndex) ||
        !session.structured.events[side][eventIndex]) {
      await i.reply({ content: 'Esse evento não está mais disponível para remoção.', ephemeral: true });
      return true;
    }
    session.structured.events[side].splice(eventIndex, 1);
    await i.update(eventPicker(id, session, i.guild, side));
    return true;
  }

  if (i.isUserSelectMenu() && action === 'structured-roster-user') {
    const [side, slot] = detail.split(':').map(Number);
    if (![0, 1].includes(side) || !Number.isInteger(slot) || slot < 0 || slot > 6 || i.values.length !== 1) {
      await i.reply({ content: 'Posição inválida. Abra novamente a seleção do elenco.', ephemeral: true });
      return true;
    }
    let member;
    try {
      member = await i.guild.members.fetch(i.values[0]);
    } catch (error) {
      console.error('Falha ao confirmar o membro escolhido para o elenco:', error);
      await i.reply({ content: 'Não consegui confirmar esse membro no servidor. Tente escolher novamente.', ephemeral: true });
      return true;
    }
    if (!member) {
      await i.reply({ content: 'Esse membro não foi encontrado neste servidor.', ephemeral: true });
      return true;
    }
    const duplicate = session.structured.rosters.some((roster, rosterSide) =>
      roster.some((userId, rosterSlot) =>
        userId === member.id && (rosterSide !== side || rosterSlot !== slot)
      )
    );
    if (duplicate) {
      await i.reply({ content: 'Essa pessoa já está em outra posição do elenco.', ephemeral: true });
      return true;
    }
    session.structured.rosters[side][slot] = member.id;
    await i.update(rosterPicker(id, session, i.guild, side));
    return true;
  }
  if (i.isStringSelectMenu() && action === 'structured-event-user') {
    const [sideValue, type] = detail.split(':');
    const side = Number(sideValue);
    const players = ['0', '1'].includes(sideValue)
      ? eventEligiblePlayers(session, side)
      : [];
    if (!['0', '1'].includes(sideValue) ||
        !MATCH_EVENTS.some(event => event.value === type) ||
        i.values.length !== 1 ||
        !players.includes(i.values[0])) {
      await i.reply({ content: 'Seleção de evento inválida. Tente novamente.', ephemeral: true });
      return true;
    }
    if (session.structured.events[side].length >= 25) {
      await i.reply({ content: 'O limite do Discord é 25 eventos por time nesta embed.', ephemeral: true });
      return true;
    }
    let member;
    try {
      member = await i.guild.members.fetch(i.values[0]);
    } catch (error) {
      console.error('Falha ao confirmar o membro escolhido para o evento:', error);
      await i.reply({ content: 'Não consegui confirmar esse membro no servidor. Tente escolher novamente.', ephemeral: true });
      return true;
    }
    if (!member) {
      await i.reply({ content: 'Esse membro não foi encontrado neste servidor.', ephemeral: true });
      return true;
    }
    session.structured.pendingEvent = { side, type, userId: member.id };
    await i.showModal(eventMinuteModal(id, side, type));
    return true;
  }
  if (i.isUserSelectMenu() && action === 'structured-sub-in') {
    const side = Number(detail);
    const pending = session.structured.pendingSubstitution;
    if (![0, 1].includes(side) || !pending || pending.side !== side ||
        pending.outId === i.values[0]) {
      await i.reply({ content: 'O jogador que entra precisa ser diferente do jogador que sai.', ephemeral: true });
      return true;
    }
    pending.inId = i.values[0];
    await i.showModal(minuteModal(id, side));
    return true;
  }
  if (i.isUserSelectMenu() && action === 'structured-highlight-pick') {
    const highlight = session.structured.pendingHighlight;
    if (!['motm', 'medal1', 'medal2', 'medal3'].includes(highlight)) {
      await i.reply({ content: 'Escolha primeiro qual destaque deseja configurar.', ephemeral: true });
      return true;
    }
    session.structured.highlights[highlight] = i.values[0];
    session.structured.pendingHighlight = null;
    await i.update(structuredPayload(id, session, i.guild, 'Destaque adicionado à embed.'));
    return true;
  }

  if (i.isChannelSelectMenu() && action === 'channel') {
    const channelId = i.values[0];
    const channel = await i.guild.channels.fetch(channelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      await i.reply({ content: 'Escolha um canal de texto deste servidor.', ephemeral: true });
      return true;
    }
    session.channelId = channel.id;
    await i.update(structuredPayload(id, session, i.guild, 'Canal de publicação selecionado.'));
    return true;
  }

  if (i.isButton()) {
    if (action === 'structured-home') {
      await i.update(structuredPayload(id, session, i.guild));
      return true;
    }
    if (action === 'structured-roster-slot' || action === 'structured-roster-clear') {
      const [side, slot] = detail.split(':').map(Number);
      if (![0, 1].includes(side) || !Number.isInteger(slot) || slot < 0 || slot > 6) {
        await i.reply({ content: 'Posição inválida.', ephemeral: true });
        return true;
      }
      if (action === 'structured-roster-clear') {
        const previousUserId = session.structured.rosters[side][slot];
        session.structured.rosters[side][slot] = null;
        if (session.structured.goalkeepers[side] === previousUserId) {
          session.structured.goalkeepers[side] = null;
        }
        await i.update(rosterPicker(id, session, i.guild, side));
        return true;
      }
      await i.update(rosterSlotPicker(id, session, i.guild, side, slot));
      return true;
    }
    if (action === 'structured-emojis') {
      await i.deferUpdate();
      try {
        await fetchAvailableEmojis(i.guild);
        await i.editReply(structuredEmojiPayload(id, session, i.guild));
      } catch (error) {
        console.error('Falha ao carregar os emojis do servidor e da aplicação para os escudos:', error);
        await i.editReply(structuredEmojiPayload(
          id,
          session,
          i.guild,
          'Não consegui buscar os emojis do servidor e da aplicação do bot. Confira o acesso à API e tente novamente.'
        ));
      }
      return true;
    }
    if (action === 'structured-event-emojis') {
      session.structured.pendingEmoji = null;
      await i.deferUpdate();
      try {
        await fetchAvailableEmojis(i.guild);
        await i.editReply(eventEmojiPanel(id, session, i.guild));
      } catch (error) {
        console.error('Falha ao carregar os emojis do servidor e da aplicação para os eventos:', error);
        await i.editReply(eventEmojiPanel(
          id,
          session,
          i.guild,
          'Não consegui buscar os emojis do servidor e da aplicação do bot. Confira o acesso à API e tente novamente.'
        ));
      }
      return true;
    }
    if (action === 'event-emoji-refresh') {
      await i.deferUpdate();
      try {
        await fetchAvailableEmojis(i.guild);
        const count = emojiChoices(i.guild).length;
        await i.editReply(eventEmojiPanel(
          id,
          session,
          i.guild,
          `Lista atualizada: ${count} emojis disponíveis.`
        ));
      } catch (error) {
        console.error('Falha ao atualizar os emojis disponíveis para os eventos:', error);
        await i.editReply(eventEmojiPanel(
          id,
          session,
          i.guild,
          'Não consegui atualizar os emojis. Confira o acesso do bot e tente novamente.'
        ));
      }
      return true;
    }
    if (action === 'event-emoji-page') {
      const direction = Number(detail);
      const pageCount = Math.max(1, Math.ceil(emojiChoices(i.guild).length / 25));
      if (![-1, 1].includes(direction)) {
        await i.reply({ content: 'Página de emojis inválida.', ephemeral: true });
        return true;
      }
      session.eventEmojiPage = Math.max(0, Math.min(pageCount - 1, session.eventEmojiPage + direction));
      await i.update(eventEmojiPanel(id, session, i.guild));
      return true;
    }
    if (action === 'structured-roster') {
      const side = Number(detail);
      if (![0, 1].includes(side)) {
        await i.reply({ content: 'Time inválido.', ephemeral: true });
        return true;
      }
      await i.update(rosterPicker(id, session, i.guild, side));
      return true;
    }
    if (action === 'structured-gk') {
      const side = Number(detail);
      if (![0, 1].includes(side)) {
        await i.reply({ content: 'Time inválido.', ephemeral: true });
        return true;
      }
      await i.update(goalkeeperPicker(id, session, i.guild, side));
      return true;
    }
    if (action === 'structured-subs') {
      const side = Number(detail);
      if (![0, 1].includes(side)) {
        await i.reply({ content: 'Time inválido.', ephemeral: true });
        return true;
      }
      await i.update(substitutionOutPicker(id, session, i.guild, side));
      return true;
    }
    if (action === 'structured-events') {
      const side = Number(detail);
      if (![0, 1].includes(side)) {
        await i.reply({ content: 'Time inválido para registrar eventos.', ephemeral: true });
        return true;
      }
      await i.update(eventPicker(id, session, i.guild, side));
      return true;
    }
    if (action === 'structured-event-type') {
      const [sideValue, type] = detail.split(':');
      const side = Number(sideValue);
      if (!['0', '1'].includes(sideValue) ||
          !MATCH_EVENTS.some(event => event.value === type)) {
        await i.reply({ content: 'Tipo de evento inválido.', ephemeral: true });
        return true;
      }
      if (session.structured.events[side].length >= 25) {
        await i.reply({ content: 'O limite do Discord é 25 eventos por time nesta embed.', ephemeral: true });
        return true;
      }
      await i.update(eventUserPicker(id, session, i.guild, side, type));
      return true;
    }
    if (action === 'structured-highlights') {
      await i.update(highlightPicker(id, session, i.guild));
      return true;
    }
    if (action === 'structured-highlight') {
      if (!['motm', 'medal1', 'medal2', 'medal3'].includes(detail)) {
        await i.reply({ content: 'Destaque inválido.', ephemeral: true });
        return true;
      }
      session.structured.pendingHighlight = detail;
      await i.update(highlightUserPicker(id, session, i.guild));
      return true;
    }
    if (action === 'structured-officials') {
      if (!refereeRoleId) {
        await i.reply({ content: 'O cargo de juízes não está configurado.', ephemeral: true });
        return true;
      }
      await i.deferUpdate();
      try {
        await i.guild.members.fetch();
        const role = await i.guild.roles.fetch(refereeRoleId);
        if (!role) {
          await i.editReply(structuredPayload(id, session, i.guild, 'O cargo de juízes não foi encontrado neste servidor.'));
          return true;
        }
        session.structured.refereeIds = [...role.members.keys()];
        session.structured.refereePage = 0;
        await i.editReply(refereePicker(id, session, i.guild));
      } catch (error) {
        console.error('Falha ao carregar os juízes para as estatísticas:', error);
        await i.editReply(structuredPayload(id, session, i.guild, 'Não foi possível carregar os juízes. Tente novamente.'));
      }
      return true;
    }
    if (action === 'structured-official-page') {
      const direction = Number(detail);
      if (![-1, 1].includes(direction)) {
        await i.reply({ content: 'Página de juízes inválida.', ephemeral: true });
        return true;
      }
      const available = session.structured.refereeIds.filter(
        userId => !session.structured.officials.includes(userId)
      );
      const pages = Math.max(1, Math.ceil(available.length / 25));
      session.structured.refereePage = Math.max(
        0,
        Math.min(pages - 1, session.structured.refereePage + direction)
      );
      await i.update(refereePicker(id, session, i.guild));
      return true;
    }
    if (action === 'metadata') {
      await i.showModal(metadataModal(id, session));
      return true;
    }
    if (action === 'score') {
      await i.showModal(scoreModal(id, session));
      return true;
    }
    if (action === 'penalties') {
      if (session.penaltiesEnabled) {
        session.penaltiesEnabled = false;
        await i.update(structuredPayload(id, session, i.guild, 'Exibição do placar dos pênaltis desativada.'));
      } else {
        await i.showModal(penaltiesModal(id, session));
      }
      return true;
    }
    if (action === 'emoji-page') {
      const direction = Number(detail);
      if (![-1, 1].includes(direction)) {
        await i.reply({ content: 'Página de emojis inválida.', ephemeral: true });
        return true;
      }
      const choices = session.shieldCategory
        ? shieldEmojiChoices(i.guild, session.shieldCategory)
        : [];
      const pageCount = Math.max(1, Math.ceil(choices.length / 25));
      const page = Math.max(0, Math.min(pageCount - 1, session.emojiPages[0] + direction));
      session.emojiPages = [page, page, page];
      await i.update(structuredEmojiPayload(id, session, i.guild));
      return true;
    }
    if (action === 'publish') {
      if (!session.category || !session.season || !session.teams[0].name || !session.teams[1].name) {
        await i.update(structuredPayload(id, session, i.guild, 'Preencha categoria, temporada e nomes dos dois times antes de publicar.'));
        return true;
      }
      if (!session.channelId) {
        await i.update(structuredPayload(id, session, i.guild, 'Escolha o canal de publicação no seletor abaixo.'));
        return true;
      }
      const rendered = renderEmbed(session, i.guild);
      if (rendered.error) {
        await i.update(structuredPayload(id, session, i.guild, rendered.error));
        return true;
      }
      const channel = await i.guild.channels.fetch(session.channelId);
      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        session.channelId = null;
        await i.update(structuredPayload(id, session, i.guild, 'O canal selecionado não está mais disponível. Escolha outro.'));
        return true;
      }
      const permissions = i.guild.members.me
        ? channel.permissionsFor(i.guild.members.me)
        : null;
      const requiredPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ];
      if (!permissions?.has(requiredPermissions)) {
        await i.update(structuredPayload(id, session, i.guild, 'O bot precisa de Ver canal, Enviar mensagens e Incorporar links no canal escolhido.'));
        return true;
      }
      if (session.structured.officials.length) {
        const role = refereeRoleId
          ? await i.guild.roles.fetch(refereeRoleId)
          : null;
        if (!role) {
          await i.update(structuredPayload(id, session, i.guild, 'O cargo de juízes não está disponível. Revise os oficiais antes de publicar.'));
          return true;
        }
        const officials = await Promise.all(
          session.structured.officials.map(userId => i.guild.members.fetch(userId))
        );
        if (officials.some(member => !member.roles.cache.has(role.id))) {
          await i.update(structuredPayload(id, session, i.guild, 'Um dos oficiais selecionados não tem mais o cargo de juiz. Remova-o ou escolha outro antes de publicar.'));
          return true;
        }
      }
      const text = renderText(session, i.guild);
      const marketChanges = statisticsMarketChanges(session);
      if (marketChanges.length && typeof applyStatisticsMarketChanges !== 'function') {
        await i.update(structuredPayload(
          id,
          session,
          i.guild,
          'A atualização automática dos valores de mercado não está disponível. Avise um administrador antes de publicar.'
        ));
        return true;
      }
      const message = await channel.send({
        embeds: [rendered.embed],
        allowedMentions: mentionOptions(text)
      });
      let notice = `Embed publicada em <#${channel.id}>.`;
      if (marketChanges.length) {
        try {
          const result = await applyStatisticsMarketChanges(i.guild, message.id, marketChanges);
          notice += ` Valor de mercado atualizado para ${result.updated.length} jogador(es).`;
          if (result.roleSyncFailures.length) {
            notice += ` Não consegui atualizar o cargo de divisão de ${result.roleSyncFailures.length} jogador(es); confira as permissões do bot.`;
          }
        } catch (error) {
          console.error(`Embed de estatísticas ${message.id} publicada, mas falhou a atualização do valor de mercado:`, error);
          notice += ' Não consegui atualizar os valores de mercado; avise um administrador.';
        }
      }
      sessions.delete(id);
      await i.update({
        content: notice,
        embeds: [],
        components: []
      });
      return true;
    }
    await i.reply({ content: 'Este botão não está mais disponível.', ephemeral: true });
    return true;
  }

  await i.reply({ content: 'Esta interação não é válida para as estatísticas.', ephemeral: true });
  return true;
}

module.exports = {
  centralPanel,
  handleStatisticsInteraction,
  SHIELD_CATEGORIES,
  shieldEmojiChoices
};
