
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

if (!process.env.DISCORD_TOKEN) {
  console.error('Configure DISCORD_TOKEN nas Secrets.');
  process.exit(1);
}

const dbPath = process.env.DATABASE_PATH || './data/pfl.sqlite';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  market INTEGER NOT NULL DEFAULT 10000,
  salary_due INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  acronym TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  invite TEXT NOT NULL,
  crest TEXT,
  owner TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  club TEXT UNIQUE,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  team_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  team_id INTEGER,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT UNIQUE,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  type TEXT NOT NULL,
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  winner INTEGER,
  score_a INTEGER,
  score_b INTEGER,
  penalties_a INTEGER,
  penalties_b INTEGER,
  competition TEXT,
  competition_crest TEXT,
  crest_a TEXT,
  crest_b TEXT,
  status TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  src INTEGER,
  dst INTEGER,
  player TEXT,
  price INTEGER,
  kind TEXT NOT NULL DEFAULT 'club',
  created_by TEXT,
  admin_override INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER,
  resolved_at INTEGER,
  resolved_by TEXT
);

CREATE TABLE IF NOT EXISTS player_values (
  user_id TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stadiums (
  team_id INTEGER,
  tier INTEGER,
  price INTEGER,
  PRIMARY KEY (team_id, tier)
);
`);

const matchColumns = db.prepare('PRAGMA table_info(matches)').all();
for (const [column, type] of [
  ['score_a', 'INTEGER'],
  ['score_b', 'INTEGER'],
  ['penalties_a', 'INTEGER'],
  ['penalties_b', 'INTEGER'],
  ['competition', 'TEXT'],
  ['competition_crest', 'TEXT'],
  ['crest_a', 'TEXT'],
  ['crest_b', 'TEXT']
]) {
  if (!matchColumns.some(existing => existing.name === column)) {
    db.exec(`ALTER TABLE matches ADD COLUMN ${column} ${type}`);
  }
}

const offerColumns = db.prepare('PRAGMA table_info(offers)').all();
for (const [column, type] of [
  ['kind', "TEXT NOT NULL DEFAULT 'club'"],
  ['created_by', 'TEXT'],
  ['admin_override', 'INTEGER NOT NULL DEFAULT 0'],
  ['expires', 'INTEGER'],
  ['resolved_at', 'INTEGER'],
  ['resolved_by', 'TEXT']
]) {
  if (!offerColumns.some(existing => existing.name === column)) {
    db.exec(`ALTER TABLE offers ADD COLUMN ${column} ${type}`);
  }
}

const ch = {
  friendly: '1561014652681461953',
  create: '1561015501680021626',
  national: '1561015666801119334',
  transfer: '1561015785210519655',
  logs: '1560829407105523850'
};

const clubs = [
  'Flamengo',
  'Palmeiras',
  'Corinthians',
  'São Paulo',
  'Santos',
  'Vasco',
  'Fluminense',
  'Botafogo',
  'Grêmio',
  'Internacional',
  'Atlético Mineiro',
  'Cruzeiro',
  'Bahia',
  'Fortaleza',
  'Athletico Paranaense',
  'Sport Recife'
];

const acr = {
  'Flamengo': 'FLA',
  'Palmeiras': 'PAL',
  'Corinthians': 'COR',
  'São Paulo': 'SAO',
  'Santos': 'SAN',
  'Vasco': 'VAS',
  'Fluminense': 'FLU',
  'Botafogo': 'BOT',
  'Grêmio': 'GRE',
  'Internacional': 'INT',
  'Atlético Mineiro': 'CAM',
  'Cruzeiro': 'CRU',
  'Bahia': 'BAH',
  'Fortaleza': 'FOR',
  'Athletico Paranaense': 'CAP',
  'Sport Recife': 'SPT'
};

const nationalTeams = [
  ['Brasil', 'BRA'],
  ['Argentina', 'ARG'],
  ['França', 'FRA'],
  ['Espanha', 'ESP'],
  ['Inglaterra', 'ENG'],
  ['Portugal', 'POR'],
  ['Alemanha', 'GER'],
  ['Itália', 'ITA'],
  ['Holanda', 'NED'],
  ['Uruguai', 'URU']
];

const seedNationalTeams = db.prepare(
  'INSERT OR IGNORE INTO teams (name, acronym, description, invite, owner, created) VALUES (?, ?, ?, ?, ?, ?)'
);
for (const [name, acronym] of nationalTeams) {
  seedNationalTeams.run(
    name,
    acronym,
    `Seleção ${name}`,
    'https://discord.com',
    `national:${acronym.toLowerCase()}`,
    Date.now()
  );
}

const n = () => Date.now();

const fmt = x => {
  x = Number(x || 0);

  for (const [v, s] of [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K']
  ]) {
    if (Math.abs(x) >= v) {
      return (x / v).toFixed(2).replace(/\.00$/, '') + s;
    }
  }

  return Math.round(x).toLocaleString('pt-BR');
};

const cash = x => '🪙 ' + fmt(x);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const admin = i =>
  i.memberPermissions?.has('Administrator') ||
  (
    process.env.ADMIN_ROLE_ID &&
    i.member?.roles?.cache?.has(process.env.ADMIN_ROLE_ID)
  );

const team = s =>
  db.prepare('SELECT * FROM teams WHERE acronym = ?')
    .get((s || '').toUpperCase());

const normalizeSearch = value =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

const clubOwnerCache = new Map();

async function clubOwnerStatus(guild, refresh = false) {
  if (!guild) throw new Error('GUILD_REQUIRED');

  const cached = clubOwnerCache.get(guild.id);
  if (!refresh && cached && cached.expires > n()) {
    return cached.promise;
  }

  const promise = (async () => {
    await guild.roles.fetch();
    await guild.members.fetch();
    return new Map(clubs.map(club => {
      const role = guild.roles.cache.find(
        candidate => candidate.name === `${acr[club]} | Dono`
      );
      return [club, Boolean(role && role.members.size > 0)];
    }));
  })();
  clubOwnerCache.set(guild.id, { promise, expires: n() + 60000 });

  try {
    return await promise;
  } catch (error) {
    clubOwnerCache.delete(guild.id);
    throw error;
  }
}

async function teamAutocomplete(i, focused) {
  const search = normalizeSearch(focused.value);

  if (i.commandName === 'selecionar-team') {
    const owners = await clubOwnerStatus(i.guild);
    const acronymRows = db.prepare(
      'SELECT acronym, club FROM teams'
    ).all();

    return clubs
      .filter(club => !owners.get(club))
      .filter(club => acronymRows.every(row =>
        row.acronym !== acr[club] || row.club === club
      ))
      .filter(club =>
        normalizeSearch(club).includes(search) ||
        acr[club].toLowerCase().includes(search)
      )
      .slice(0, 25)
      .map(club => ({ name: `${acr[club]} | ${club}`, value: club }));
  }

  const includeNational = ['ofc', 'resultado-ofc'].includes(i.commandName);
  const available = db.prepare(
    includeNational
      ? 'SELECT name, acronym FROM teams'
      : "SELECT name, acronym FROM teams WHERE owner NOT LIKE 'national:%'"
  ).all();

  const matches = available
    .filter(t =>
      normalizeSearch(t.name).includes(search) ||
      normalizeSearch(t.acronym).includes(search)
    );

  let preferred = null;
  if (i.user?.id && i.commandName === 'estadio') {
    preferred = db.prepare(
      'SELECT acronym FROM teams WHERE owner = ? LIMIT 1'
    ).get(i.user.id)?.acronym;
  } else if (i.user?.id && i.commandName === 'ofertaplayer') {
    preferred = db.prepare(
      "SELECT t.acronym FROM teams t LEFT JOIN members m ON m.team_id = t.id AND m.user_id = ? AND m.kind = 'manager' WHERE t.owner = ? OR m.user_id IS NOT NULL LIMIT 1"
    ).get(i.user.id, i.user.id)?.acronym
  }
  matches.sort((left, right) => {
    const leftStarts = normalizeSearch(left.name).startsWith(search) ||
      normalizeSearch(left.acronym).startsWith(search);
    const rightStarts = normalizeSearch(right.name).startsWith(search) ||
      normalizeSearch(right.acronym).startsWith(search);
    return Number(rightStarts) - Number(leftStarts) ||
      Number(right.acronym === preferred) - Number(left.acronym === preferred);
  });

  const choices = matches
    .slice(0, 25)
    .map(t => ({ name: `${t.acronym} | ${t.name}`, value: t.acronym }));

  if (i.commandName === 'money' && /^\d{3,}$/.test(search) && choices.length < 25) {
    const users = [...(i.guild?.members?.cache?.values() || [])]
      .filter(member => member.id.includes(search))
      .slice(0, 25 - choices.length)
      .map(member => ({
        name: `${member.user.tag} | ${member.id}`.slice(0, 100),
        value: member.id
      }));
    choices.push(...users);
  }

  return choices;
}

const isHttpUrl = value => {
  if (!value) return true;

  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

function matchEmbed({
  title,
  competitionCrest,
  a,
  b,
  scoreA,
  scoreB,
  penaltiesA,
  penaltiesB,
  crestA,
  crestB
}) {
  const score = scoreA === null || scoreA === undefined
    ? 'vs'
    : `${scoreA} x ${scoreB}`;
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(title)
    .setDescription(
      `**${a.name} (${a.acronym})**  ${score}  **${b.name} (${b.acronym})**` +
      (penaltiesA !== null && penaltiesA !== undefined
        ? `\nPênaltis: **${penaltiesA} x ${penaltiesB}**`
        : '')
    )
    .setTimestamp();

  if (competitionCrest) {
    embed.setAuthor({ name: title, iconURL: competitionCrest });
  }
  if (crestA) embed.setThumbnail(crestA);
  if (crestB) embed.setImage(crestB);

  return embed;
}

const owner = id =>
  db.prepare('SELECT * FROM teams WHERE owner = ?').get(id);

function ensure(id) {
  db.prepare(
    'INSERT OR IGNORE INTO users (id, salary_due) VALUES (?, ?)'
  ).run(id, n() + 604800000);
}

function log(g, msg) {
  const c = g.channels.cache.get(ch.logs);

  if (c?.isTextBased()) {
    c.send(msg).catch(() => {});
  }
}

function err(i, s) {
  return i.reply({
    content: '❌ ' + s,
    ephemeral: true
  });
}

async function teamRoles(g, t) {
  const specs = [
    ['owner_role', 'Dono'],
    ['manager_role', 'Gerente'],
    ['player_role', 'Jogador']
  ];

  for (const [key, label] of specs) {
    let r = g.roles.cache.find(
      x => x.name === `${t.acronym} | ${label}`
    );

    if (!r) {
      r = await g.roles.create({
        name: `${t.acronym} | ${label}`,
        permissions: [],
        reason: 'Cargos automáticos PFL'
      });
    }

    const m = await g.members.fetch(t.owner).catch(() => null);

    if (key === 'owner_role' && m) {
      await m.roles.add(r).catch(() => {});
    }
  }
}

function resolvePlayerOffer(i, offer, action) {
  if (i.user.id !== offer.player) {
    return err(i, 'Somente o jogador que recebeu esta DM pode responder.');
  }

  if (offer.expires <= n()) {
    db.prepare(
      "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    return i.update({
      content: 'Esta oferta expirou.',
      embeds: [],
      components: []
    });
  }

  if (action === 'no') {
    const declined = db.prepare(
      "UPDATE offers SET status = 'declined', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    if (declined.changes === 0) {
      return err(i, 'Esta oferta já foi respondida.');
    }
    return i.update({
      content: 'Oferta recusada. Nenhum saldo foi movimentado.',
      embeds: [],
      components: []
    });
  }

  if (action !== 'yes') {
    return err(i, 'Ação de oferta inválida.');
  }

  try {
    const transfer = db.transaction(() => {
      const current = db.prepare(
        "SELECT * FROM offers WHERE id = ? AND kind = 'player' AND status = 'pending'"
      ).get(offer.id);
      if (!current || current.expires <= n()) {
        throw new Error('OFFER_EXPIRED_OR_RESOLVED');
      }
      if (current.price < 150000) {
        throw new Error('OFFER_BELOW_MINIMUM');
      }

      const currentTeam = db.prepare(
        "SELECT team_id FROM members WHERE user_id = ? AND kind = 'player' LIMIT 1"
      ).get(current.player);
      if ((current.src === null && currentTeam) ||
          (current.src !== null && currentTeam?.team_id !== current.src)) {
        throw new Error('PLAYER_TEAM_CHANGED');
      }

      const accepted = db.prepare(
        "UPDATE offers SET status = 'accepted', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending' AND expires > ?"
      ).run(n(), i.user.id, current.id, n());
      if (accepted.changes === 0) {
        throw new Error('OFFER_EXPIRED_OR_RESOLVED');
      }

      const debit = db.prepare(
        'UPDATE teams SET balance = balance - ? WHERE id = ? AND balance >= ?'
      ).run(current.price, current.dst, current.price);
      if (debit.changes === 0) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      ensure(current.player);
      db.prepare(
        'UPDATE users SET balance = balance + ? WHERE id = ?'
      ).run(current.price, current.player);

      db.prepare(
        "DELETE FROM members WHERE user_id = ? AND kind = 'player'"
      ).run(current.player);
      db.prepare(
        "INSERT INTO members (team_id, user_id, kind) VALUES (?, ?, 'player')"
      ).run(current.dst, current.player);

      db.prepare(
        'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
      ).run(
        current.dst,
        -current.price,
        `Compra do jogador ${current.player}`,
        `player-offer:${current.id}:out`,
        n()
      );
      db.prepare(
        'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
      ).run(
        current.player,
        current.price,
        'Recebimento por transferência',
        `player-offer:${current.id}:in`,
        n()
      );

      return db.prepare('SELECT name, acronym FROM teams WHERE id = ?')
        .get(current.dst);
    });

    const buyer = transfer();
    return i.update({
      content: `Transferência concluída: você agora faz parte de **${buyer.name} (${buyer.acronym})** e recebeu ${cash(offer.price)}.`,
      embeds: [],
      components: []
    });
  } catch (error) {
    if (['INSUFFICIENT_FUNDS', 'PLAYER_TEAM_CHANGED', 'OFFER_BELOW_MINIMUM'].includes(error.message)) {
      db.prepare(
        "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, offer.id);
      const messages = {
        INSUFFICIENT_FUNDS: 'A oferta foi cancelada: o time comprador não tem mais saldo suficiente.',
        PLAYER_TEAM_CHANGED: 'A oferta foi cancelada: sua equipe mudou desde o envio.',
        OFFER_BELOW_MINIMUM: 'A oferta foi cancelada: o valor está abaixo do mínimo permitido.'
      };
      return i.update({ content: messages[error.message], embeds: [], components: [] });
    }
    if (error.message === 'OFFER_EXPIRED_OR_RESOLVED') {
      db.prepare(
        "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, offer.id);
      return i.update({ content: 'Esta oferta expirou ou já foi respondida.', embeds: [], components: [] });
    }
    throw error;
  }
}

client.once(Events.ClientReady, c => {
  console.log('Bot conectado: ' + c.user.tag);
});

client.on(Events.GuildMemberUpdate, (_before, after) => {
  clubOwnerCache.delete(after.guild.id);
});

client.on(Events.GuildMemberRemove, member => {
  clubOwnerCache.delete(member.guild.id);
});

client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isAutocomplete()) {
      const focused = i.options.getFocused(true);
      try {
        return i.respond(await teamAutocomplete(i, focused));
      } catch (error) {
        console.error('Falha ao consultar times para autocomplete:', error);
        return i.respond([]);
      }
    }

    if (i.isButton()) {
      if (i.customId.startsWith('playeroffer:')) {
        const [, offerId, action] = i.customId.split(':');
        const offer = db.prepare(
          "SELECT * FROM offers WHERE id = ? AND kind = 'player'"
        ).get(Number(offerId));

        if (!offer || offer.status !== 'pending') {
          return err(i, 'Esta oferta já foi respondida, cancelada ou expirou.');
        }

        return resolvePlayerOffer(i, offer, action);
      }

      const [, id, act] = i.customId.split(':');

      const o = db.prepare(
        "SELECT * FROM offers WHERE id = ? AND kind = 'club'"
      ).get(Number(id));

      if (!o || o.status !== 'pending') {
        return err(i, 'Oferta já resolvida.');
      }

      const dst = db.prepare(
        'SELECT * FROM teams WHERE id = ?'
      ).get(o.dst);

      if (!dst) {
        return err(i, 'Time comprador não encontrado.');
      }

      const manager = db.prepare(
        "SELECT 1 FROM members WHERE team_id = ? AND user_id = ? AND kind = 'manager'"
      ).get(dst.id, i.user.id);

      if (dst.owner !== i.user.id && !manager) {
        return err(
          i,
          'Só dono ou gerente do time comprador pode responder.'
        );
      }

      if (act === 'no') {
        db.prepare(
          "UPDATE offers SET status = 'declined' WHERE id = ? AND status = 'pending'"
        ).run(o.id);

        return i.update({
          content: 'Oferta recusada.',
          embeds: [],
          components: []
        });
      }

      const src = db.prepare(
        'SELECT * FROM teams WHERE id = ?'
      ).get(o.src);

      if (!src) {
        return err(i, 'Time vendedor não encontrado.');
      }

      if (dst.balance < o.price) {
        return err(i, 'O time comprador não tem saldo suficiente.');
      }

      const transfer = db.transaction(() => {
        const result = db.prepare(
          "UPDATE offers SET status = 'accepted' WHERE id = ? AND status = 'pending'"
        ).run(o.id);

        if (result.changes === 0) {
          throw new Error('OFFER_ALREADY_RESOLVED');
        }

        db.prepare(
          'UPDATE teams SET balance = balance - ? WHERE id = ?'
        ).run(o.price, dst.id);

        db.prepare(
          'UPDATE teams SET balance = balance + ? WHERE id = ?'
        ).run(o.price, src.id);

        db.prepare(
          'DELETE FROM members WHERE team_id = ? AND user_id = ?'
        ).run(src.id, o.player);

        db.prepare(
          "INSERT OR REPLACE INTO members (team_id, user_id, kind) VALUES (?, ?, 'player')"
        ).run(dst.id, o.player);

        db.prepare(
          'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
        ).run(
          dst.id,
          -o.price,
          'Transferência saída',
          `offer:${o.id}:out`,
          n()
        );

        db.prepare(
          'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
        ).run(
          src.id,
          o.price,
          'Transferência entrada',
          `offer:${o.id}:in`,
          n()
        );
      });

      try {
        transfer();
      } catch (e) {
        if (e.message === 'OFFER_ALREADY_RESOLVED') {
          return err(i, 'Oferta já resolvida.');
        }

        throw e;
      }

      return i.update({
        content: `Transferência concluída: <@${o.player}> agora está em **${dst.name}**.`,
        embeds: [],
        components: []
      });
    }

    if (!i.isChatInputCommand()) return;

    const c = i.commandName;

    if (c === 'ownar-team') {
      if (i.channelId !== ch.create) {
        return err(i, `Use no canal <#${ch.create}>.`);
      }

      const name = i.options.getString('nome').trim();
      const a = i.options.getString('sigla').toUpperCase();
      const desc = i.options.getString('descricao');
      const invite = i.options.getString('convite');
      const crest = i.options.getString('escudo');

      if (!/^[A-Z]{3}$/.test(a)) {
        return err(i, 'Sigla precisa ter 3 letras.');
      }

      // Validação corrigida do link de convite.
      if (!/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(invite)) {
        return err(i, 'Link de convite Discord inválido.');
      }

      if (owner(i.user.id)) {
        return err(i, 'Você já é dono de um time.');
      }

      try {
        const x = db.prepare(
          'INSERT INTO teams (name, acronym, description, invite, crest, owner, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(name, a, desc, invite, crest, i.user.id, n());

        const t = db.prepare(
          'SELECT * FROM teams WHERE id = ?'
        ).get(Number(x.lastInsertRowid));

        await teamRoles(i.guild, t);

        const e = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('⚽ Time criado')
          .setDescription(
            `**${name} (${a})**\n` +
            `${desc}\n` +
            `Dono: ${i.user}\n` +
            `Saldo: ${cash(0)}\n` +
            `[Convite](${invite})`
          )
          .setTimestamp();

        if (crest) e.setThumbnail(crest);

        await i.reply({ embeds: [e] });

        log(
          i.guild,
          `Time criado ${name} (${a}), dono ${i.user}.`
        );
      } catch (e) {
        console.error(e);
        return err(i, 'Sigla já usada ou erro ao criar time.');
      }
    }

    else if (c === 'selecionar-team') {
      if (owner(i.user.id)) {
        return err(i, 'Você já é dono de um time.');
      }

      const club = i.options.getString('clube');

      if (!clubs.includes(club) || !acr[club]) {
        return err(i, 'Clube inválido.');
      }

      let owners;
      try {
        owners = await clubOwnerStatus(i.guild, true);
      } catch (error) {
        console.error('Não foi possível verificar os cargos de dono:', error);
        return err(i, 'Não consegui confirmar se o clube está livre. Tente novamente.');
      }

      if (owners.get(club)) {
        return err(i, 'Esse clube já tem pelo menos um membro com o cargo de dono.');
      }

      const existing = db.prepare(
        'SELECT * FROM teams WHERE club = ?'
      ).get(club);
      const acronymConflict = db.prepare(
        'SELECT id FROM teams WHERE acronym = ? AND (club IS NULL OR club <> ?)'
      ).get(acr[club], club);

      if (acronymConflict) {
        return err(i, `A sigla ${acr[club]} já está em uso por outro time.`);
      }

      const teamId = db.transaction(() => {
        if (existing) {
          db.prepare(
            'UPDATE teams SET owner = ? WHERE id = ? AND club = ?'
          ).run(i.user.id, existing.id, club);
          return existing.id;
        }

        const inserted = db.prepare(
          'INSERT INTO teams (name, acronym, description, invite, owner, created, club) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          club,
          acr[club],
          `Clube ${club}`,
          'https://discord.com',
          i.user.id,
          n(),
          club
        );
        return Number(inserted.lastInsertRowid);
      })();

      const t = db.prepare(
        'SELECT * FROM teams WHERE id = ?'
      ).get(teamId);

      await teamRoles(i.guild, t);
      clubOwnerCache.delete(i.guild.id);

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🏆 Clube escolhido')
            .setDescription(
              `Você agora é dono de **${club} (${acr[club]})**.`
            )
        ]
      });
    }

    else if (c === 'excluir-team') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const t = team(i.options.getString('sigla'));

      if (!t) return err(i, 'Time não encontrado.');

      db.prepare('DELETE FROM teams WHERE id = ?').run(t.id);

      return i.reply({
        content: `Time ${t.name} removido. Histórico de transações mantido.`,
        ephemeral: true
      });
    }

    else if (c === 'moneyvalue' || c === 'ver-saldo') {
      const u = i.options.getUser('usuario') || i.user;
      const s = i.options.getString('sigla');

      if (s) {
        const t = team(s);

        if (!t) return err(i, 'Time não encontrado.');

        return i.reply({
          content: `Saldo de ${t.name}: **${cash(t.balance)}**`,
          ephemeral: true
        });
      }

      ensure(u.id);

      const row = db.prepare(
        'SELECT balance FROM users WHERE id = ?'
      ).get(u.id);

      return i.reply({
        content: `Saldo de ${u}: **${cash(row.balance)}**`,
        ephemeral: true
      });
    }

    else if (c === 'money') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const target = i.options.getString('alvo');
      const action = i.options.getString('acao');
      const amount = i.options.getInteger('quantia') *
        (action === 'add' ? 1 : -1);

      const t = team(target);

      try {
        if (t) {
          if (t.balance + amount < 0) {
            return err(i, 'Saldo insuficiente.');
          }

          db.prepare(
            'UPDATE teams SET balance = balance + ? WHERE id = ?'
          ).run(amount, t.id);

          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, created) VALUES (?, ?, ?, ?)'
          ).run(t.id, amount, 'Ajuste admin', n());
        } else {
          if (!/^\d{17,20}$/.test(target)) {
            return err(i, 'Use sigla do time ou ID do usuário.');
          }

          ensure(target);

          const user = db.prepare(
            'SELECT balance FROM users WHERE id = ?'
          ).get(target);

          if (user.balance + amount < 0) {
            return err(i, 'Saldo insuficiente.');
          }

          db.prepare(
            'UPDATE users SET balance = balance + ? WHERE id = ?'
          ).run(amount, target);

          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, created) VALUES (?, ?, ?, ?)'
          ).run(target, amount, 'Ajuste admin', n());
        }

        return i.reply({
          content: `Saldo atualizado: ${cash(Math.abs(amount))}.`,
          ephemeral: true
        });
      } catch (e) {
        console.error(e);
        return err(i, 'Não foi possível atualizar o saldo.');
      }
    }

    else if (c === 'amistoso') {
      if (i.channelId !== ch.friendly) {
        return err(i, `Use no canal <#${ch.friendly}>.`);
      }

      const a = team(i.options.getString('time_a'));
      const b = team(i.options.getString('time_b'));
      const scoreA = i.options.getInteger('gols_a');
      const scoreB = i.options.getInteger('gols_b');
      const penaltiesA = i.options.getInteger('penaltis_a');
      const penaltiesB = i.options.getInteger('penaltis_b');
      const competition = i.options.getString('competicao') || 'Amistoso';
      const competitionCrest = i.options.getString('simbolo_competicao');
      const crestA = i.options.getString('escudo_a') || a?.crest;
      const crestB = i.options.getString('escudo_b') || b?.crest;

      if (!a || !b || a.id === b.id) {
        return err(i, 'Informe duas siglas válidas e diferentes.');
      }

      if ((penaltiesA === null) !== (penaltiesB === null)) {
        return err(i, 'Informe os pênaltis dos dois times ou deixe os dois vazios.');
      }

      if (penaltiesA !== null && (scoreA !== scoreB || penaltiesA === penaltiesB)) {
        return err(i, 'Pênaltis só podem ser informados em empate e precisam desempatar.');
      }

      if (![competitionCrest, crestA, crestB].every(isHttpUrl)) {
        return err(i, 'As URLs dos símbolos devem começar com http:// ou https://.');
      }

      const ref = 'friendly:' + i.id;
      const winner = scoreA === scoreB
        ? (penaltiesA === null ? null : (penaltiesA > penaltiesB ? a.id : b.id))
        : (scoreA > scoreB ? a.id : b.id);

      const tx = db.transaction(() => {
        db.prepare(
          'INSERT INTO matches (ref, type, a, b, winner, score_a, score_b, penalties_a, penalties_b, competition, competition_crest, crest_a, crest_b, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          ref,
          'friendly',
          a.id,
          b.id,
          winner,
          scoreA,
          scoreB,
          penaltiesA,
          penaltiesB,
          competition,
          competitionCrest,
          crestA,
          crestB,
          'completed',
          n()
        );

        for (const t of [a, b]) {
          db.prepare(
            'UPDATE teams SET balance = balance + 10000 WHERE id = ?'
          ).run(t.id);

          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(
            t.id,
            10000,
            'Prêmio amistoso',
            ref + ':' + t.id,
            n()
          );
        }
      });

      tx();

      const e = matchEmbed({
        title: competition,
        competitionCrest,
        a,
        b,
        scoreA,
        scoreB,
        penaltiesA,
        penaltiesB,
        crestA,
        crestB
      }).setFooter({ text: `Cada time recebeu ${cash(10000)} pelo amistoso.` });

      await i.reply({ embeds: [e] });

      log(
        i.guild,
        `Amistoso ${a.acronym} x ${b.acronym}; +10K cada.`
      );
    }

    else if (c === 'ofc') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const a = team(i.options.getString('time_a'));
      const b = team(i.options.getString('time_b'));
      const competition = i.options.getString('competicao');
      const competitionCrest = i.options.getString('simbolo_competicao');
      const crestA = i.options.getString('escudo_a') || a?.crest;
      const crestB = i.options.getString('escudo_b') || b?.crest;

      if (!a || !b || a.id === b.id) {
        return err(i, 'Duas siglas válidas e diferentes.');
      }

      if (![competitionCrest, crestA, crestB].every(isHttpUrl)) {
        return err(i, 'As URLs dos símbolos devem começar com http:// ou https://.');
      }

      const ref = 'ofc:' + i.id;

      const tx = db.transaction(() => {
        const x = db.prepare(
          'INSERT INTO matches (ref, type, a, b, competition, competition_crest, crest_a, crest_b, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          ref,
          'ofc',
          a.id,
          b.id,
          competition,
          competitionCrest,
          crestA,
          crestB,
          'pending',
          n()
        );

        for (const tm of [a, b]) {
          db.prepare(
            'UPDATE teams SET balance = balance + 50000 WHERE id = ?'
          ).run(tm.id);

          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(
            tm.id,
            50000,
            'Participação OFC',
            ref + ':' + tm.id,
            n()
          );
        }

        return Number(x.lastInsertRowid);
      });

      const id = tx();

      return i.reply({
        embeds: [
          matchEmbed({
            title: `🏆 ${competition} | OFC #${id}`,
            competitionCrest,
            a,
            b,
            scoreA: null,
            scoreB: null,
            penaltiesA: null,
            penaltiesB: null,
            crestA,
            crestB
          }).setFooter({ text: `Cada time recebeu ${cash(50000)}. Registre o placar com /resultado-ofc.` })
        ]
      });
    }

    else if (c === 'resultado-ofc') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const competition = i.options.getString('competicao').trim();
      const competitionCrest = i.options.getString('imagem_competicao');
      const a = team(i.options.getString('time_a'));
      const b = team(i.options.getString('time_b'));
      const crestA = i.options.getString('escudo_a');
      const crestB = i.options.getString('escudo_b');
      const scoreA = i.options.getInteger('gols_a');
      const scoreB = i.options.getInteger('gols_b');
      const penaltiesA = i.options.getInteger('penaltis_a');
      const penaltiesB = i.options.getInteger('penaltis_b');

      if (!a || !b || a.id === b.id) {
        return err(i, 'Escolha dois times diferentes que estejam cadastrados.');
      }

      if (![competitionCrest, crestA, crestB].every(isHttpUrl)) {
        return err(i, 'As URLs das imagens devem começar com http:// ou https://.');
      }

      if ((penaltiesA === null) !== (penaltiesB === null)) {
        return err(i, 'Informe os pênaltis dos dois times ou deixe os dois vazios.');
      }

      if (penaltiesA !== null && (scoreA !== scoreB || penaltiesA === penaltiesB)) {
        return err(i, 'Pênaltis só podem ser informados em empate e precisam desempatar.');
      }

      const winnerId = scoreA === scoreB
        ? (penaltiesA === null ? null : (penaltiesA > penaltiesB ? a.id : b.id))
        : (scoreA > scoreB ? a.id : b.id);

      const tx = db.transaction(() => {
        const pending = db.prepare(
          "SELECT id FROM matches WHERE type = 'ofc' AND status = 'pending' AND competition = ? AND ((a = ? AND b = ?) OR (a = ? AND b = ?)) ORDER BY created DESC LIMIT 1"
        ).get(competition, a.id, b.id, b.id, a.id);

        let matchId;
        if (pending) {
          matchId = pending.id;
          db.prepare(
            "UPDATE matches SET status = 'completed', winner = ?, score_a = ?, score_b = ?, penalties_a = ?, penalties_b = ?, competition_crest = ?, crest_a = ?, crest_b = ? WHERE id = ? AND status = 'pending'"
          ).run(winnerId, scoreA, scoreB, penaltiesA, penaltiesB, competitionCrest, crestA, crestB, matchId);
        } else {
          const inserted = db.prepare(
            "INSERT INTO matches (ref, type, a, b, winner, score_a, score_b, penalties_a, penalties_b, competition, competition_crest, crest_a, crest_b, status, created) VALUES (?, 'ofc', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)"
          ).run(
            `ofc-result:${i.id}`,
            a.id,
            b.id,
            winnerId,
            scoreA,
            scoreB,
            penaltiesA,
            penaltiesB,
            competition,
            competitionCrest,
            crestA,
            crestB,
            n()
          );
          matchId = Number(inserted.lastInsertRowid);

          for (const currentTeam of [a, b]) {
            db.prepare(
              'UPDATE teams SET balance = balance + 50000 WHERE id = ?'
            ).run(currentTeam.id);
            db.prepare(
              'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
            ).run(
              currentTeam.id,
              50000,
              'Participação OFC',
              `ofc-result:${i.id}:entry:${currentTeam.id}`,
              n()
            );
          }
        }

        if (winnerId !== null) {
          db.prepare(
            'UPDATE teams SET balance = balance + 350000 WHERE id = ?'
          ).run(winnerId);
          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(
            winnerId,
            350000,
            `Vitória OFC ${competition}`,
            `ofc-result:${i.id}:win`,
            n()
          );
        }

        return matchId;
      });

      tx();

      const competitionEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(competition)
        .setImage(competitionCrest);

      const resultEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Resultado')
        .setThumbnail(crestA)
        .addFields(
          { name: '\u200b', value: `[Escudo](${crestA})\n**${a.name}**`, inline: true },
          {
            name: 'PLACAR',
            value: `**${scoreA} x ${scoreB}**` +
              (penaltiesA === null ? '' : `\nPênaltis: **${penaltiesA} x ${penaltiesB}**`),
            inline: true
          },
          { name: '\u200b', value: `[Escudo](${crestB})\n**${b.name}**`, inline: true }
        )
        .setFooter({
          text: winnerId === null
            ? 'Empate'
            : `${db.prepare('SELECT name FROM teams WHERE id = ?').get(winnerId).name} venceu e recebeu ${cash(350000)}.`,
          iconURL: crestB
        })
        .setTimestamp();

      return i.reply({
        embeds: [competitionEmbed, resultEmbed]
      });
    }

    else if (c === 'oferta') {
      if (i.channelId !== ch.transfer) {
        return err(i, `Use no canal <#${ch.transfer}>.`);
      }

      const src = owner(i.user.id);
      const dst = team(i.options.getString('time_destino'));
      const player = i.options.getUser('jogador');
      const price = i.options.getInteger('preco');

      if (!src) {
        return err(i, 'Você precisa ser dono de um time.');
      }

      if (!dst || dst.owner.startsWith('national:') || src.id === dst.id) {
        return err(i, 'Time destino inválido.');
      }

      if (!db.prepare(
        "SELECT 1 FROM members WHERE team_id = ? AND user_id = ? AND kind = 'player'"
      ).get(src.id, player.id)) {
        return err(
          i,
          'Esse usuário não está registrado como jogador do seu time.'
        );
      }

      if (dst.balance < price) {
        return err(i, 'O time comprador não tem saldo suficiente.');
      }

      const x = db.prepare(
        'INSERT INTO offers (ref, src, dst, player, price, status, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'offer:' + i.id,
        src.id,
        dst.id,
        player.id,
        price,
        'pending',
        n()
      );

      const row = Number(x.lastInsertRowid);

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`offer:${row}:yes`)
          .setLabel('Aceitar')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`offer:${row}:no`)
          .setLabel('Recusar')
          .setStyle(ButtonStyle.Danger)
      );

      return i.reply({
        content:
          `🔁 **Oferta #${row}**\n` +
          `${src.name} oferece <@${player.id}> para ${dst.name} por ${cash(price)}.`,
        components: [buttons]
      });
    }

    else if (c === 'ofertaplayer') {
      const player = i.options.getUser('jogador');
      const buyer = team(i.options.getString('sigla'));
      const price = i.options.getInteger('preco');
      const isAdmin = Boolean(admin(i));

      if (!Number.isSafeInteger(price) || price < 150000) {
        return err(i, 'O preço mínimo da oferta é 150.000.');
      }

      if (!player?.id || player.id === i.user.id) {
        return err(i, 'Escolha outro usuário para receber a oferta.');
      }

      if (!buyer || buyer.owner.startsWith('national:')) {
        return err(i, 'A sigla precisa corresponder a um time cadastrado.');
      }

      if (player.bot) {
        return err(i, 'Não é possível oferecer transferência a um bot.');
      }

      const manager = db.prepare(
        "SELECT 1 FROM members WHERE team_id = ? AND user_id = ? AND kind = 'manager'"
      ).get(buyer.id, i.user.id);
      const authorized = buyer.owner === i.user.id || Boolean(manager);
      const adminOverride = isAdmin && !authorized;

      if (!authorized && !isAdmin) {
        return err(i, 'Somente o dono ou manager deste time pode fazer a oferta.');
      }

      if (buyer.balance < price) {
        return err(i, 'O time comprador não tem saldo suficiente.');
      }

      db.prepare(
        "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = 'system' WHERE kind = 'player' AND status = 'pending' AND expires <= ?"
      ).run(n(), n());

      const currentTeam = db.prepare(
        "SELECT team_id FROM members WHERE user_id = ? AND kind = 'player' LIMIT 1"
      ).get(player.id);

      if (currentTeam?.team_id === buyer.id) {
        return err(i, 'Esse jogador já pertence ao time comprador.');
      }

      const expires = n() + 7 * 24 * 60 * 60 * 1000;
      const insert = db.prepare(
        "INSERT INTO offers (ref, src, dst, player, price, kind, created_by, admin_override, status, created, expires) VALUES (?, ?, ?, ?, ?, 'player', ?, ?, 'pending', ?, ?)"
      ).run(
        `player-offer:${i.id}`,
        currentTeam?.team_id ?? null,
        buyer.id,
        player.id,
        price,
        i.user.id,
        adminOverride ? 1 : 0,
        n(),
        expires
      );
      const offerId = Number(insert.lastInsertRowid);

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`playeroffer:${offerId}:yes`)
          .setLabel('Aceitar oferta')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`playeroffer:${offerId}:no`)
          .setLabel('Recusar oferta')
          .setStyle(ButtonStyle.Danger)
      );
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Oferta de transferência')
        .setDescription(
          `**${buyer.name} (${buyer.acronym})** quer contar com você.\n` +
          `Valor: **${cash(price)}**\n` +
          `Oferta válida por 7 dias.`
        )
        .setTimestamp();

      await i.deferReply({ ephemeral: true });
      try {
        await player.send({ embeds: [embed], components: [buttons] });
      } catch {
        db.prepare(
          "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = 'system' WHERE id = ? AND status = 'pending'"
        ).run(n(), offerId);
        return i.editReply('Não consegui enviar a DM ao jogador. A oferta foi cancelada sem movimentar saldo.');
      }

      const audit = adminOverride
        ? ' Registrada com exceção administrativa.'
        : '';
      if (adminOverride) {
        log(
          i.guild,
          `Oferta player #${offerId} criada com exceção administrativa por ${i.user} (${i.user.id}); comprador ${buyer.acronym}, jogador ${player.id}, valor ${price}.`
        );
      }
      return i.editReply(`Oferta #${offerId} enviada por DM para ${player}.${audit}`);
    }

    else if (c === 'valordoplayer') {
      const u = i.options.getUser('jogador');

      ensure(u.id);

      const saved = db.prepare(
        'SELECT value FROM player_values WHERE user_id = ?'
      ).get(u.id);

      const user = db.prepare(
        'SELECT market FROM users WHERE id = ?'
      ).get(u.id);

      const v = saved?.value ?? user.market;

      return i.reply({
        content: `Valor de ${u}: **${cash(v)}**`,
        ephemeral: true
      });
    }

    else if (c === 'playercusto') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const u = i.options.getUser('jogador');
      const v = i.options.getInteger('valor');

      ensure(u.id);

      db.prepare(
        'INSERT INTO player_values (user_id, value) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET value = excluded.value'
      ).run(u.id, v);

      db.prepare(
        'UPDATE users SET market = ? WHERE id = ?'
      ).run(v, u.id);

      return i.reply({
        content: `Valor de ${u} definido para ${cash(v)}.`,
        ephemeral: true
      });
    }

    else if (c === 'estadio') {
      const t = team(i.options.getString('sigla'));
      const price = i.options.getInteger('preco');

      if (!t || t.owner !== i.user.id) {
        return err(
          i,
          'Somente o dono de um time pode comprar para esse time.'
        );
      }

      const tier = [350000, 700000, 1000000, 3500000].indexOf(price) + 1;

      if (tier === 0) {
        return err(i, 'Preço de estádio inválido.');
      }

      if (db.prepare(
        'SELECT 1 FROM stadiums WHERE team_id = ? AND tier = ?'
      ).get(t.id, tier)) {
        return err(i, 'Esse nível já foi comprado.');
      }

      const tx = db.transaction(() => {
        const result = db.prepare(
          'UPDATE teams SET balance = balance - ? WHERE id = ? AND balance >= ?'
        ).run(price, t.id, price);

        if (result.changes === 0) {
          throw new Error('BALANCE');
        }

        db.prepare(
          'INSERT INTO stadiums (team_id, tier, price) VALUES (?, ?, ?)'
        ).run(t.id, tier, price);

        db.prepare(
          'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
        ).run(
          t.id,
          -price,
          'Compra estádio',
          `stadium:${t.id}:${tier}`,
          n()
        );
      });

      try {
        tx();
      } catch {
        return err(i, 'Saldo insuficiente ou estádio já comprado.');
      }

      return i.reply({
        content: `🏟️ Estádio nível ${tier} comprado por ${cash(price)}.`
      });
    }

    else if (c === 'salarios') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const users = db.prepare(
        'SELECT * FROM users WHERE salary_due <= ?'
      ).all(n());

      const tx = db.transaction(() => {
        for (const u of users) {
          const saved = db.prepare(
            'SELECT value FROM player_values WHERE user_id = ?'
          ).get(u.id);

          const v = saved?.value ?? u.market;
          const salary = Math.max(1000, Math.floor(v * 0.05));
          const ref = `salary:${u.id}:${u.salary_due}`;

          if (!db.prepare(
            'SELECT id FROM transactions WHERE ref = ?'
          ).get(ref)) {
            db.prepare(
              'UPDATE users SET balance = balance + ?, salary_due = ? WHERE id = ?'
            ).run(salary, n() + 604800000, u.id);

            db.prepare(
              'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
            ).run(
              u.id,
              salary,
              'Salário semanal',
              ref,
              n()
            );
          }
        }
      });

      tx();

      return i.reply({
        content:
          `Salários vencidos processados: ${users.length}. ` +
          'Fórmula: 5% do valor de mercado, mínimo 1K, a cada 7 dias.',
        ephemeral: true
      });
    }

    else if (c === 'copa') {
      return i.reply({
        content:
          '🏆 A copa completa com chave de 16 times precisa ser configurada; este comando está reservado para a próxima etapa.'
      });
    }

  } catch (e) {
    console.error(e);

    if (i.isRepliable() && !i.replied && !i.deferred) {
      await i.reply({
        content: 'Erro interno. Veja o Console e nunca compartilhe seu token.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
