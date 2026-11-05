
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const dns = require('node:dns/promises');
const http = require('node:http');
const https = require('node:https');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const Database = require('better-sqlite3');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ApplicationCommandType,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder
} = require('discord.js');
const {
  centralPanel,
  handleStatisticsInteraction
} = require('./match-statistics');
const { handleMatchAnnouncementInteraction } = require('./match-announcements');

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
  market INTEGER NOT NULL DEFAULT 150000,
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
  division INTEGER NOT NULL DEFAULT 1,
  claimed_by TEXT UNIQUE,
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
  category TEXT,
  competition_crest TEXT,
  crest_a TEXT,
  crest_b TEXT,
  scheduled_at INTEGER,
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
  resolved_by TEXT,
  team_name TEXT,
  team_acronym TEXT,
  description TEXT,
  roblox_username TEXT,
  server_url TEXT,
  scheduled_at INTEGER
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

CREATE TABLE IF NOT EXISTS message_progress (
  user_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  last_message_id TEXT
);

CREATE TABLE IF NOT EXISTS national_presidents (
  team_id INTEGER PRIMARY KEY,
  president_id TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS national_roster (
  team_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  callup_id INTEGER NOT NULL UNIQUE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, player_id)
);

CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  team_id INTEGER,
  role TEXT NOT NULL,
  value INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created INTEGER NOT NULL,
  resolved_at INTEGER,
  transfer_message_id TEXT,
  registry_message_id TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_statistics_market_updates (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS command_blocks (
  guild_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, command_name)
);

CREATE TABLE IF NOT EXISTS tournament_brackets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  category TEXT NOT NULL,
  teams_json TEXT NOT NULL,
  winners_json TEXT NOT NULL DEFAULT '{}',
  channel_id TEXT NOT NULL,
  message_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_cooldowns (
  user_id TEXT PRIMARY KEY,
  last_used INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS free_agency_cooldowns (
  user_id TEXT PRIMARY KEY,
  last_used INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_updates (
  user_id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_publications (
  user_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  published_at INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS profile_users_insert
AFTER INSERT ON users
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_users_update
AFTER UPDATE OF balance, market, salary_due ON users
WHEN OLD.balance IS NOT NEW.balance
  OR OLD.market IS NOT NEW.market
  OR OLD.salary_due IS NOT NEW.salary_due
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_player_values_insert
AFTER INSERT ON player_values
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_player_values_update
AFTER UPDATE OF value ON player_values
WHEN OLD.value IS NOT NEW.value
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_player_values_delete
AFTER DELETE ON player_values
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_members_insert
AFTER INSERT ON members
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_members_update
AFTER UPDATE OF user_id, team_id, kind ON members
WHEN OLD.user_id IS NOT NEW.user_id
  OR OLD.team_id IS NOT NEW.team_id
  OR OLD.kind IS NOT NEW.kind
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_members_delete
AFTER DELETE ON members
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.user_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_national_roster_insert
AFTER INSERT ON national_roster
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.player_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_national_roster_update
AFTER UPDATE OF player_id, team_id ON national_roster
WHEN OLD.player_id IS NOT NEW.player_id OR OLD.team_id IS NOT NEW.team_id
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.player_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.player_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_national_roster_delete
AFTER DELETE ON national_roster
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.player_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_national_presidents_insert
AFTER INSERT ON national_presidents
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.president_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_national_presidents_update
AFTER UPDATE OF president_id ON national_presidents
WHEN OLD.president_id IS NOT NEW.president_id
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.president_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (NEW.president_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_national_presidents_delete
AFTER DELETE ON national_presidents
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  VALUES (OLD.president_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TABLE IF NOT EXISTS cups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created INTEGER NOT NULL,
  champion_team_id INTEGER
);

CREATE TABLE IF NOT EXISTS cup_games (
  cup_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  game_number INTEGER NOT NULL,
  team_a INTEGER NOT NULL,
  team_b INTEGER NOT NULL,
  match_id INTEGER NOT NULL UNIQUE,
  winner INTEGER,
  PRIMARY KEY (cup_id, round, game_number)
);
`);
db.prepare(
  'UPDATE users SET market = 150000 WHERE market = 10000 AND id NOT IN (SELECT user_id FROM player_values)'
).run();
if (!db.prepare('SELECT 1 FROM app_settings WHERE key = ?').get('salary_schedule_10_days')) {
  const nextSalaryAt = Date.now() + 10 * 24 * 60 * 60 * 1000;
  db.transaction(() => {
    db.prepare('UPDATE users SET salary_due = ? WHERE salary_due > 0')
      .run(nextSalaryAt);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('salary_schedule_10_days', String(nextSalaryAt));
  })();
}

const messageProgressColumns = db.prepare(
  'PRAGMA table_info(message_progress)'
).all();
if (!messageProgressColumns.some(column => column.name === 'last_message_id')) {
  db.exec('ALTER TABLE message_progress ADD COLUMN last_message_id TEXT');
}

const matchColumns = db.prepare('PRAGMA table_info(matches)').all();
for (const [column, type] of [
  ['score_a', 'INTEGER'],
  ['score_b', 'INTEGER'],
  ['penalties_a', 'INTEGER'],
  ['penalties_b', 'INTEGER'],
  ['competition', 'TEXT'],
  ['category', 'TEXT'],
  ['competition_crest', 'TEXT'],
  ['crest_a', 'TEXT'],
  ['crest_b', 'TEXT'],
  ['referee_id', 'TEXT'],
  ['national_a', 'TEXT'],
  ['national_b', 'TEXT'],
  ['champions_a', 'TEXT'],
  ['champions_b', 'TEXT'],
  ['scheduled_at', 'INTEGER']
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
  ['resolved_by', 'TEXT'],
  ['team_name', 'TEXT'],
  ['team_acronym', 'TEXT'],
  ['team_url', 'TEXT'],
  ['target_role', "TEXT NOT NULL DEFAULT 'player'"],
  ['description', 'TEXT'],
  ['roblox_username', 'TEXT'],
  ['server_url', 'TEXT'],
  ['scheduled_at', 'INTEGER']
]) {
  if (!offerColumns.some(existing => existing.name === column)) {
    db.exec(`ALTER TABLE offers ADD COLUMN ${column} ${type}`);
  }
}

const teamColumns = db.prepare('PRAGMA table_info(teams)').all();
if (!teamColumns.some(column => column.name === 'claimed_by')) {
  db.exec('ALTER TABLE teams ADD COLUMN claimed_by TEXT');
}
if (!teamColumns.some(column => column.name === 'division')) {
  db.exec('ALTER TABLE teams ADD COLUMN division INTEGER NOT NULL DEFAULT 1');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS teams_claimed_by_unique ON teams(claimed_by) WHERE claimed_by IS NOT NULL');

db.exec(`
CREATE TRIGGER IF NOT EXISTS profile_teams_update
AFTER UPDATE OF owner, claimed_by, name, acronym ON teams
WHEN OLD.owner IS NOT NEW.owner
  OR OLD.claimed_by IS NOT NEW.claimed_by
  OR OLD.name IS NOT NEW.name
  OR OLD.acronym IS NOT NEW.acronym
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT NEW.owner, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE NEW.owner NOT LIKE 'national:%'
    AND NEW.owner NOT LIKE 'champions:%'
    AND NEW.owner NOT LIKE 'brazil:%'
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT NEW.claimed_by, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE NEW.claimed_by IS NOT NULL
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT OLD.owner, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE OLD.owner NOT LIKE 'national:%'
    AND OLD.owner NOT LIKE 'champions:%'
    AND OLD.owner NOT LIKE 'brazil:%'
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT OLD.claimed_by, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE OLD.claimed_by IS NOT NULL
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_teams_insert
AFTER INSERT ON teams
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT NEW.owner, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE NEW.owner NOT LIKE 'national:%'
    AND NEW.owner NOT LIKE 'champions:%'
    AND NEW.owner NOT LIKE 'brazil:%'
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT NEW.claimed_by, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE NEW.claimed_by IS NOT NULL
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS profile_teams_delete
AFTER DELETE ON teams
BEGIN
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT OLD.owner, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE OLD.owner NOT LIKE 'national:%'
    AND OLD.owner NOT LIKE 'champions:%'
    AND OLD.owner NOT LIKE 'brazil:%'
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
  INSERT INTO profile_updates (user_id, updated_at)
  SELECT OLD.claimed_by, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE OLD.claimed_by IS NOT NULL
  ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at;
END;
`);

const marketListingColumns = db.prepare('PRAGMA table_info(market_listings)').all();
for (const [column, type] of [
  ['transfer_message_id', 'TEXT'],
  ['registry_message_id', 'TEXT'],
  ['description', 'TEXT'],
  ['roblox_username', 'TEXT'],
  ['position', 'TEXT']
]) {
  if (!marketListingColumns.some(existing => existing.name === column)) {
    db.exec(`ALTER TABLE market_listings ADD COLUMN ${column} ${type}`);
  }
}

const ch = {
  friendly: '1565519866180542495',
  create: '1565519866180542495',
  national: '1561015666801119334',
  transfer: '1565844155647787170',
  logs: '1565735982609727608',
  freeAgency: '1565733568322211920',
  profile: '1565821879736860732',
  registry: '1565521276057952346'
};
const ownTeamRoleId = '1565823989799198750';

const stadiumOptions = [
  { tier: 1, name: 'Estádio 1', price: 350000 },
  { tier: 2, name: 'Estádio 2', price: 700000 },
  { tier: 3, name: 'Estádio 3', price: 1000000 },
  { tier: 4, name: 'Estádio 4', price: 3500000 },
  { tier: 5, name: 'Estádio 5', price: 5000000 },
  { tier: 6, name: 'Estádio 6', price: 7500000 },
  { tier: 7, name: 'Estádio 7', price: 10000000 }
];

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS market_listings_one_active_user
ON market_listings(user_id) WHERE status = 'available';
`);

const messageRewardChannels = new Set([
  '1561098037332549804',
  '1561099578177093682',
  '1561099516516503754',
  '1561099792971472926',
  '1561100186720403516',
  '1561100384234377306',
  '1561099657742913567',
  '1561099721458720798',
  '1561099992838709318',
  '1561100258505662494',
  '1561100319679582308',
  '1561099856020250764',
  '1561099927830925352',
  '1561100048903708702'
]);

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

const championsClubs = [
  ['Real Madrid', 'RMA', '🇪🇸'],
  ['Barcelona', 'FCB', '🇪🇸'],
  ['Bayern de Munique', 'BAY', '🇩🇪'],
  ['Liverpool', 'LIV', '🏴'],
  ['Manchester City', 'MCI', '🏴'],
  ['Paris Saint-Germain', 'PSG', '🇫🇷'],
  ['Arsenal', 'ARS', '🏴'],
  ['Inter de Milão', 'INM', '🇮🇹'],
  ['AC Milan', 'MIL', '🇮🇹'],
  ['Juventus', 'JUV', '🇮🇹'],
  ['Borussia Dortmund', 'BVB', '🇩🇪'],
  ['Atlético de Madrid', 'ATM', '🇪🇸'],
  ['Chelsea', 'CHE', '🏴'],
  ['Manchester United', 'MUN', '🏴'],
  ['Benfica', 'BEN', '🇵🇹'],
  ['Ajax', 'AJA', '🇳🇱']
];

const championsAcronyms = Object.fromEntries(
  championsClubs.map(([name, acronym]) => [name, acronym])
);

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

const seedBrazilianTeams = db.prepare(
  'INSERT OR IGNORE INTO teams (name, acronym, description, invite, owner, created, club) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
for (const club of clubs) {
  seedBrazilianTeams.run(
    club,
    acr[club],
    `Clube brasileiro: ${club}`,
    'https://discord.com',
    `brazil:${acr[club].toLowerCase()}`,
    Date.now(),
    club
  );
}

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
  ['Uruguai', 'URU'],
  ['Bélgica', 'BEL'],
  ['Croácia', 'CRO'],
  ['Marrocos', 'MAR'],
  ['Colômbia', 'COL'],
  ['Japão', 'JPN'],
  ['Estados Unidos', 'USA']
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

const seedChampionsClubs = db.prepare(
  'INSERT OR IGNORE INTO teams (name, acronym, description, invite, owner, created, club) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
for (const [name, acronym] of championsClubs) {
  seedChampionsClubs.run(
    name,
    acronym,
    `Clube da Champions League: ${name}`,
    'https://discord.com',
    `champions:${acronym.toLowerCase()}`,
    Date.now(),
    `champions:${name}`
  );
}
const seedSecondDivisionTeam = db.prepare(
  'INSERT OR IGNORE INTO teams (name, acronym, description, invite, owner, created, club, division) VALUES (?, ?, ?, ?, ?, ?, ?, 2)'
);
for (const club of clubs) {
  seedSecondDivisionTeam.run(
    club,
    `${acr[club]}2`,
    `Clube brasileiro: ${club} (2ª Divisão)`,
    'https://discord.com',
    `brazil:${acr[club].toLowerCase()}2`,
    Date.now(),
    `${club}:division2`
  );
}
for (const [name, acronym] of championsClubs) {
  seedSecondDivisionTeam.run(
    name,
    `${acronym}2`,
    `Clube da Champions League: ${name} (2ª Divisão)`,
    'https://discord.com',
    `champions:${acronym.toLowerCase()}2`,
    Date.now(),
    `champions:${name}:division2`
  );
}

const n = () => Date.now();

const bracketRepository = {
  getTeams(guildId, category) {
    const ownerPattern = {
      selecao: 'national:%',
      champions: 'champions:%',
      brasileirao: 'brazil:%',
      libertadores: 'libertadores:%'
    }[category];
    if (!ownerPattern) throw new Error(`Unknown bracket category: ${category}`);
    return db.prepare(
      'SELECT id, name, acronym, crest FROM teams WHERE owner LIKE ? AND division = 1 ORDER BY name COLLATE NOCASE'
    ).all(ownerPattern);
  },
  list(guildId) {
    return db.prepare(
      'SELECT id, category, updated_at FROM tournament_brackets WHERE guild_id = ? ORDER BY updated_at DESC LIMIT 25'
    ).all(guildId);
  },
  get(id, guildId) {
    const row = db.prepare(
      'SELECT id, guild_id, category, teams_json, winners_json, channel_id, message_id, created_by FROM tournament_brackets WHERE id = ? AND guild_id = ?'
    ).get(id, guildId);
    if (!row) return null;
    const teams = JSON.parse(row.teams_json);
    const winners = JSON.parse(row.winners_json);
    if (!Array.isArray(teams) || teams.length !== 16 ||
        new Set(teams.map(team => String(team.id))).size !== 16 ||
        !winners || typeof winners !== 'object' || Array.isArray(winners)) {
      throw new Error(`Stored bracket ${id} is malformed.`);
    }
    return {
      id: row.id,
      guildId: row.guild_id,
      category: row.category,
      teams,
      winners,
      channelId: row.channel_id,
      messageId: row.message_id,
      createdBy: row.created_by
    };
  },
  create(record) {
    const now = n();
    const result = db.prepare(
      'INSERT INTO tournament_brackets (guild_id, category, teams_json, winners_json, channel_id, message_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      record.guildId,
      record.category,
      JSON.stringify(record.teams),
      JSON.stringify(record.winners),
      record.channelId,
      record.messageId,
      record.createdBy,
      now,
      now
    );
    return Number(result.lastInsertRowid);
  },
  updateWinners(id, guildId, winners, expectedWinners) {
    const result = db.prepare(
      'UPDATE tournament_brackets SET winners_json = ?, updated_at = ? WHERE id = ? AND guild_id = ? AND winners_json = ?'
    ).run(JSON.stringify(winners), n(), id, guildId, JSON.stringify(expectedWinners));
    if (result.changes !== 1) throw new Error(`Bracket ${id} was not updated because its results changed concurrently.`);
  }
};

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
const OFC_PARTICIPATION_REWARD = 2_000_000;
const MESSAGE_REWARD_INTERVAL = 150;
const MESSAGE_REWARD_AMOUNT = 500;

function parseScaledMoney(amount, scale) {
  const multiplier = {
    k: 1e3,
    m: 1e6,
    b: 1e9,
    t: 1e12
  }[scale];
  if (!Number.isFinite(amount) || amount < 0 || !multiplier) return null;
  const scaled = Math.round(amount * multiplier);
  return Number.isSafeInteger(scaled) ? scaled : null;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

const proposalLocks = new Set();

const ADMIN_ONLY_SLASH_COMMANDS = new Set([
  'excluir-team',
  'resultado-ofc',
  'ver-team',
  'salarios',
  'selecionar_juiz'
]);

const admin = i =>
  i.memberPermissions?.has('Administrator') ||
  (
    process.env.ADMIN_ROLE_ID &&
    i.member?.roles?.cache?.has(process.env.ADMIN_ROLE_ID)
  );

const canConvocar = (userId, presidentId, isAdministrator) =>
  Boolean(isAdministrator || presidentId === userId);

const refereeRoleId = '1561544461715247247';

const nationalSelections = [
  ['Brasil', '🇧🇷'],
  ['Argentina', '🇦🇷'],
  ['França', '🇫🇷'],
  ['Espanha', '🇪🇸'],
  ['Inglaterra', '🏴'],
  ['Portugal', '🇵🇹'],
  ['Alemanha', '🇩🇪'],
  ['Itália', '🇮🇹'],
  ['Países Baixos', '🇳🇱'],
  ['Bélgica', '🇧🇪'],
  ['Uruguai', '🇺🇾'],
  ['Croácia', '🇭🇷'],
  ['Marrocos', '🇲🇦'],
  ['Colômbia', '🇨🇴'],
  ['Japão', '🇯🇵'],
  ['Estados Unidos', '🇺🇸']
];

const nationalFlags = {
  BRA: '🇧🇷',
  ARG: '🇦🇷',
  FRA: '🇫🇷',
  ESP: '🇪🇸',
  ENG: '🏴',
  POR: '🇵🇹',
  GER: '🇩🇪',
  ITA: '🇮🇹',
  NED: '🇳🇱',
  BEL: '🇧🇪',
  URU: '🇺🇾',
  CRO: '🇭🇷',
  MAR: '🇲🇦',
  COL: '🇨🇴',
  JPN: '🇯🇵',
  USA: '🇺🇸'
};

const nationalDisplayNames = { NED: 'Países Baixos' };

const championsSelections = championsClubs.map(([name, , flag]) => [name, flag]);

const pendingMatchInteractions = new Map();
const matchListInteractions = new Map();

function activeMatch(matchId) {
  return db.prepare(
    "SELECT * FROM matches WHERE id = ? AND type = 'ofc' AND status = 'pending'"
  ).get(matchId);
}

function orientMatchResult(match, input) {
  if (match.a === input.b.id) {
    return {
      teamA: input.b,
      teamB: input.a,
      scoreA: input.scoreB,
      scoreB: input.scoreA,
      penaltiesA: input.penaltiesB,
      penaltiesB: input.penaltiesA,
      crestA: input.crestB,
      crestB: input.crestA
    };
  }

  return {
    teamA: input.a,
    teamB: input.b,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    penaltiesA: input.penaltiesA,
    penaltiesB: input.penaltiesB,
    crestA: input.crestA,
    crestB: input.crestB
  };
}

function matchSelectionEmbed({ title, description, matchId, side }) {
  const embed = new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle(title)
    .setDescription(description)
    .addFields({ name: 'Partida OFC', value: `#${matchId}`, inline: true })
    .setFooter({ text: 'PFL Matchmaker • Central de partidas' })
    .setTimestamp();
  if (side) {
    embed.addFields({
      name: 'Lado',
      value: side === 'a' ? 'Time A' : 'Time B',
      inline: true
    });
  }
  return embed;
}

function matchSelectionRow(nonce, values) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`match-select:${nonce}`)
      .setPlaceholder('Escolha uma opção')
      .addOptions(values.map(([name, emoji]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(name)
          .setValue(name)
          .setEmoji(emoji)
      ))
  );
}

function matchConfirmationRow(nonce) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`match-confirm:${nonce}`)
      .setLabel('Confirmar seleção')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`match-cancel:${nonce}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );
}

function judgesPageEmbed(members, page) {
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(members.length / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const entries = members.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  return {
    page: currentPage,
    pageCount,
    embed: new EmbedBuilder()
      .setColor(0x1f8b4c)
      .setTitle('⚖️ Arbitragem • PFL Matchmaker')
      .setDescription(
        entries.length
          ? entries.map((member, index) =>
            `**${currentPage * pageSize + index + 1}.** ${member}`
          ).join('\n')
          : 'Nenhum membro possui o cargo de juiz neste servidor.'
      )
      .setFooter({ text: `Página ${currentPage + 1}/${pageCount} • ${members.length} juiz(es)` })
      .setTimestamp()
  };
}

function judgesPageRow(page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`judges-page:${page - 1}`)
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`judges-page:${page + 1}`)
      .setLabel('Próxima')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1)
  );
}

function matchesPageRow(nonce, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`matches-page:${nonce}:${page - 1}`)
      .setLabel('Partidas anteriores')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`matches-page:${nonce}:${page + 1}`)
      .setLabel('Mais partidas')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1)
  );
}

function standingsPageRow(nonce, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`standings-page:${nonce}:${page - 1}`)
      .setLabel('Página anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`standings-page:${nonce}:${page + 1}`)
      .setLabel('Próxima página')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1)
  );
}

function rosterPageRow(teamId, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roster-page:${teamId}:${page - 1}`)
      .setLabel('Jogadores anteriores')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`roster-page:${teamId}:${page + 1}`)
      .setLabel('Mais jogadores')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1)
  );
}

function cleanExpiredMatchViews() {
  for (const [nonce, state] of matchListInteractions) {
    if (state.expiresAt <= n()) matchListInteractions.delete(nonce);
  }
}

function matchCategoryPredicate(category, matchAlias = 'm') {
  if (category === 'champions') {
    return {
      sql: `(${matchAlias}.category = 'champions'
        OR ${matchAlias}.competition = 'Champions League' COLLATE NOCASE
        OR (${matchAlias}.category IS NULL
          AND EXISTS (
            SELECT 1 FROM teams category_a
            WHERE category_a.id = ${matchAlias}.a
              AND (category_a.club LIKE 'champions:%' OR category_a.owner LIKE 'champions:%')
          )
          AND EXISTS (
            SELECT 1 FROM teams category_b
            WHERE category_b.id = ${matchAlias}.b
              AND (category_b.club LIKE 'champions:%' OR category_b.owner LIKE 'champions:%')
          )))`,
      params: []
    };
  }
  if (category === 'brasileirao') {
    const clubPlaceholders = clubs.map(() => '?').join(', ');
    const teamCondition = alias =>
      `(${alias}.owner LIKE 'brazil:%' OR ${alias}.club IN (${clubPlaceholders}))`;
    return {
      sql: `(${matchAlias}.category = 'brasileirao'
        OR ${matchAlias}.competition = 'Brasileirão' COLLATE NOCASE
        OR (${matchAlias}.category IS NULL
          AND EXISTS (
            SELECT 1 FROM teams category_a
            WHERE category_a.id = ${matchAlias}.a
              AND ${teamCondition('category_a')}
          )
          AND EXISTS (
            SELECT 1 FROM teams category_b
            WHERE category_b.id = ${matchAlias}.b
              AND ${teamCondition('category_b')}
          )))`,
      params: [...clubs, ...clubs]
    };
  }
  if (category === 'copa-do-mundo') {
    return {
      sql: `(${matchAlias}.ref LIKE 'cup:%'
        OR ${matchAlias}.competition = 'Copa do Mundo' COLLATE NOCASE
        OR (${matchAlias}.category IS NULL
          AND ${matchAlias}.competition = 'Copa' COLLATE NOCASE
          AND EXISTS (
            SELECT 1 FROM teams category_a
            WHERE category_a.id = ${matchAlias}.a
              AND category_a.owner LIKE 'national:%'
          )
          AND EXISTS (
            SELECT 1 FROM teams category_b
            WHERE category_b.id = ${matchAlias}.b
              AND category_b.owner LIKE 'national:%'
          )))`,
      params: []
    };
  }
  throw new Error(`UNKNOWN_MATCH_CATEGORY:${category}`);
}

function queryMatches({ status, category, competition, page, pageSize = 8 }) {
  const categoryFilter = matchCategoryPredicate(category);
  const clauses = [categoryFilter.sql];
  const params = [...categoryFilter.params];
  if (status && status !== 'all') {
    clauses.push('m.status = ?');
    params.push(status);
  }
  if (competition) {
    clauses.push('m.competition = ? COLLATE NOCASE');
    params.push(competition);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.prepare(
    `SELECT COUNT(*) AS total FROM matches m ${where}`
  ).get(...params).total;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const rows = db.prepare(
    `SELECT m.id, m.type, m.a, m.b, m.score_a, m.score_b, m.competition, m.status, m.created, m.scheduled_at, m.referee_id, m.national_a, m.national_b, m.champions_a, m.champions_b, COALESCE(a.name, 'Time removido') AS team_a_name, COALESCE(a.acronym, '---') AS team_a_acronym, COALESCE(b.name, 'Time removido') AS team_b_name, COALESCE(b.acronym, '---') AS team_b_acronym FROM matches m LEFT JOIN teams a ON a.id = m.a LEFT JOIN teams b ON b.id = m.b ${where} ORDER BY m.created DESC, m.id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, currentPage * pageSize);
  return { rows, total, page: currentPage, pageCount };
}

function findPendingMatch({ a, b, competition, category, selectedMatchId }) {
  const pendingMatches = db.prepare(
    "SELECT id, a, b, competition, category FROM matches WHERE type = 'ofc' AND status = 'pending' AND ((a = ? AND b = ?) OR (a = ? AND b = ?)) ORDER BY created DESC"
  ).all(a.id, b.id, b.id, a.id);
  const normalizedCompetition = normalizeSearch(competition);

  if (selectedMatchId) {
    const pending = db.prepare(
      "SELECT id, a, b, competition, category FROM matches WHERE id = ? AND type = 'ofc' AND status = 'pending'"
    ).get(selectedMatchId);
    if (!pending) throw new Error('MATCH_ID_NOT_PENDING');
    if (!((pending.a === a.id && pending.b === b.id) ||
        (pending.a === b.id && pending.b === a.id))) {
      throw new Error('MATCH_TEAMS_MISMATCH');
    }
    if (normalizeSearch(pending.competition) !== normalizedCompetition) {
      throw new Error('MATCH_COMPETITION_MISMATCH');
    }
    if (pending.category && pending.category !== category) {
      throw new Error('MATCH_CATEGORY_MISMATCH');
    }
    return pending;
  }

  const competitionMatches = pendingMatches.filter(
    match => normalizeSearch(match.competition) === normalizedCompetition &&
      (!match.category || match.category === category)
  );
  if (competitionMatches.length > 1) throw new Error('MATCH_ID_REQUIRED');
  if (competitionMatches.length === 1) return competitionMatches[0];
  if (pendingMatches.some(
    match => normalizeSearch(match.competition) === normalizedCompetition
  )) {
    throw new Error('MATCH_CATEGORY_MISMATCH');
  }
  if (pendingMatches.length > 0) throw new Error('MATCH_COMPETITION_MISMATCH');
  const completedMatches = db.prepare(
    "SELECT id, competition FROM matches WHERE type = 'ofc' AND status = 'completed' AND ((a = ? AND b = ?) OR (a = ? AND b = ?)) ORDER BY created DESC"
  ).all(a.id, b.id, b.id, a.id);
  const completed = completedMatches.find(
    match => normalizeSearch(match.competition) === normalizedCompetition
  );
  if (completed) throw new Error('MATCH_ALREADY_RECORDED');
  return null;
}

function matchesPageEmbed({ rows, total, page, pageCount, status, category, competition }) {
  const categoryLabels = {
    brasileirao: 'Brasileirão',
    'copa-do-mundo': 'Copa do Mundo',
    champions: 'Champions League'
  };
  const statusLabel = {
    pending: 'Pendentes',
    completed: 'Finalizadas',
    all: 'Todas'
  }[status] || 'Todas';
  const embed = new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle('📅 Central de partidas')
    .setFooter({
      text: `${total} partida(s) • Página ${page + 1}/${pageCount}`
    })
    .setTimestamp();
  if (!rows.length) {
    embed.setDescription('Nenhuma partida encontrada com esses filtros.');
  } else {
    embed.setDescription(rows.map(match => {
      const score = match.score_a === null || match.score_a === undefined
        ? 'vs'
        : `${match.score_a} x ${match.score_b}`;
      const kind = match.type === 'ofc' ? 'OFC' : 'Amistoso';
      const competitionLabel = category === 'copa-do-mundo' &&
        normalizeSearch(match.competition) === 'copa'
        ? 'Copa do Mundo'
        : match.competition || 'Sem competição';
      const extra = [];
      if (match.national_a) {
        const flag = nationalSelections.find(([name]) =>
          name === match.national_a
        )?.[1] || '🌍';
        extra.push(`Time A: ${flag} ${match.national_a}`);
      }
      if (match.champions_a) extra.push(`Time A Champions: ${match.champions_a}`);
      if (match.national_b) {
        const flag = nationalSelections.find(([name]) =>
          name === match.national_b
        )?.[1] || '🌍';
        extra.push(`Time B: ${flag} ${match.national_b}`);
      }
      if (match.champions_b) extra.push(`Time B Champions: ${match.champions_b}`);
      if (match.referee_id) extra.push(`Juiz: <@${match.referee_id}>`);
      if (match.scheduled_at) {
        extra.push(`Horário: ${formatBrasiliaSchedule(match.scheduled_at)} (Brasília)`);
      }
      return [
        `**#${match.id} · ${kind} · ${competitionLabel}**`,
        `**${match.team_a_name} (${match.team_a_acronym}) ${score} ${match.team_b_name} (${match.team_b_acronym})**`,
        `Estado: ${match.status === 'pending' ? '🟡 Pendente' : '✅ Finalizada'}${extra.length ? `\n${extra.join(' · ')}` : ''}`
      ].join('\n');
    }).join('\n\n'));
  }
  embed.addFields(
    { name: 'Categoria', value: categoryLabels[category] || 'Todas', inline: true },
    { name: 'Filtro', value: statusLabel, inline: true },
    { name: 'Competição', value: competition || 'Todas', inline: true }
  );
  return embed;
}

function competitionStandings(competition) {
  const games = db.prepare(
    "SELECT a, b, winner, score_a, score_b FROM matches WHERE status = 'completed' AND competition = ? COLLATE NOCASE AND score_a IS NOT NULL AND score_b IS NOT NULL"
  ).all(competition);
  const standings = new Map();
  const ensureStanding = teamId => {
    if (!standings.has(teamId)) {
      const currentTeam = db.prepare(
        'SELECT name, acronym FROM teams WHERE id = ?'
      ).get(teamId);
      standings.set(teamId, {
        teamId,
        name: currentTeam?.name || 'Time removido',
        acronym: currentTeam?.acronym || '---',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0
      });
    }
    return standings.get(teamId);
  };

  for (const game of games) {
    const home = ensureStanding(game.a);
    const away = ensureStanding(game.b);
    home.played++;
    away.played++;
    home.goalsFor += game.score_a;
    home.goalsAgainst += game.score_b;
    away.goalsFor += game.score_b;
    away.goalsAgainst += game.score_a;

    if (game.score_a === game.score_b) {
      home.draws++;
      away.draws++;
      home.points++;
      away.points++;
    } else if (game.winner === game.a) {
      home.wins++;
      away.losses++;
      home.points += 3;
    } else {
      away.wins++;
      home.losses++;
      away.points += 3;
    }
  }

  return [...standings.values()].sort((left, right) =>
    right.points - left.points ||
    (right.goalsFor - right.goalsAgainst) - (left.goalsFor - left.goalsAgainst) ||
    right.goalsFor - left.goalsFor ||
    left.name.localeCompare(right.name, 'pt-BR')
  );
}

function standingsPageEmbed(competition, standings, page) {
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(standings.length / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const rows = standings.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const lines = rows.map((entry, index) => {
    const position = currentPage * pageSize + index + 1;
    const goalDifference = entry.goalsFor - entry.goalsAgainst;
    return `**${position}. ${entry.name} (${entry.acronym})** — **${entry.points} pts** · ${entry.played}J ${entry.wins}V ${entry.draws}E ${entry.losses}D · ${entry.goalsFor}:${entry.goalsAgainst} (${goalDifference > 0 ? '+' : ''}${goalDifference})`;
  });
  return {
    page: currentPage,
    pageCount,
    embed: new EmbedBuilder()
      .setColor(0x1f8b4c)
      .setTitle(`🏆 Tabela • ${competition}`)
      .setDescription(lines.length ? lines.join('\n') : 'Ainda não há resultados finalizados com placar nesta competição.')
      .setFooter({ text: `${standings.length} time(s) • Página ${currentPage + 1}/${pageCount} • Critérios: pontos, saldo e gols pró` })
      .setTimestamp()
  };
}

function rosterPageEmbed(selection, page) {
  const president = db.prepare(
    'SELECT np.president_id FROM national_presidents np JOIN teams t ON t.id = np.team_id WHERE np.team_id = ? AND t.claimed_by = np.president_id'
  ).get(selection.id);
  const roster = db.prepare(
    'SELECT player_id, joined_at FROM national_roster WHERE team_id = ? ORDER BY joined_at, player_id'
  ).all(selection.id);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(roster.length / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const pagePlayers = roster.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const flag = nationalFlags[selection.acronym] || '🌍';
  const description = pagePlayers.length
    ? pagePlayers.map((player, index) =>
      `**${currentPage * pageSize + index + 1}.** <@${player.player_id}>`
    ).join('\n')
    : 'Nenhum jogador aceitou uma convocação para esta seleção ainda.';
  const embed = new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle(`${flag} Elenco • ${teamDisplayName(selection)}`)
    .setDescription(description)
    .addFields(
      { name: 'Presidente', value: president ? `<@${president.president_id}>` : 'Não configurado', inline: true },
      { name: 'Jogadores', value: String(roster.length), inline: true }
    )
    .setFooter({ text: `Página ${currentPage + 1}/${pageCount}` })
    .setTimestamp();
  return { page: currentPage, pageCount, embed };
}

function judgePickerComponents(nonce, members, page) {
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(members.length / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const pageMembers = members.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`match-select:${nonce}`)
    .setPlaceholder('Selecione um juiz elegível')
    .addOptions(pageMembers.map(member =>
      new StringSelectMenuOptionBuilder()
        .setLabel(member.displayName.slice(0, 100))
        .setDescription(`@${member.user.username}`.slice(0, 100))
        .setValue(member.id)
    ));
  const components = [new ActionRowBuilder().addComponents(menu)];

  if (pageCount > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`judge-list-page:${nonce}:${currentPage - 1}`)
        .setLabel('Juízes anteriores')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 0),
      new ButtonBuilder()
        .setCustomId(`judge-list-page:${nonce}:${currentPage + 1}`)
        .setLabel('Mais juízes')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= pageCount - 1)
    ));
  }

  return { components, page: currentPage, pageCount };
}

async function fetchJudges(guild) {
  const members = await guild.members.fetch();
  return [...members.values()]
    .filter(member => member.roles.cache.has(refereeRoleId))
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, 'pt-BR')
    );
}

function getPendingRefereeMatches() {
  return db.prepare(`
    SELECT m.id, m.competition, a.name AS team_a_name, b.name AS team_b_name
    FROM matches m
    JOIN teams a ON a.id = m.a
    JOIN teams b ON b.id = m.b
    WHERE m.type = 'ofc' AND m.status = 'pending'
    ORDER BY m.created DESC, m.id DESC
  `).all();
}

async function startRefereeAssignment(i, matchId) {
  if (!activeMatch(matchId)) {
    return i.update({
      content: 'Essa partida não está mais pendente.',
      embeds: [],
      components: []
    });
  }
  const judges = await fetchJudges(i.guild);
  if (judges.length === 0) {
    return i.update({
      content: 'Não há membros com o cargo de juiz neste servidor.',
      embeds: [],
      components: []
    });
  }

  for (const [nonce, pending] of pendingMatchInteractions) {
    if (pending.expiresAt <= n()) pendingMatchInteractions.delete(nonce);
  }
  const nonce = i.id;
  pendingMatchInteractions.set(nonce, {
    kind: 'referee',
    matchId,
    side: null,
    requesterId: i.user.id,
    guildId: i.guildId,
    channelId: i.channelId,
    expiresAt: n() + 15 * 60 * 1000
  });
  const picker = judgePickerComponents(nonce, judges, 0);
  return i.update({
    content: '',
    embeds: [
      matchSelectionEmbed({
        title: '⚖️ Designar juiz',
        description: `Selecione um juiz elegível para a partida OFC **#${matchId}**. O cargo será conferido novamente antes de salvar.`,
        matchId
      })
    ],
    components: picker.components
  });
}

const team = s =>
  db.prepare('SELECT * FROM teams WHERE acronym = ?')
    .get(String(s || '').trim().toUpperCase()) || resolveTeamInput(s);

function resolveTeamInput(value) {
  const input = normalizeSearch(value);
  if (!input) return null;

  const allTeams = db.prepare('SELECT * FROM teams').all();
  if (input.includes('|')) {
    const [rawAcronym, ...rawNameParts] = input.split('|');
    const selectedAcronym = allTeams.find(
      candidate => normalizeSearch(candidate.acronym) === rawAcronym.trim()
    );
    const selectedName = rawNameParts.join('|').trim();
    if (
      selectedAcronym &&
      (
        normalizeSearch(selectedAcronym.name) === selectedName ||
        normalizeSearch(nationalDisplayNames[selectedAcronym.acronym]) === selectedName
      )
    ) {
      return selectedAcronym;
    }
    return null;
  }

  const acronymMatch = allTeams.find(
    candidate => normalizeSearch(candidate.acronym) === input
  );
  if (acronymMatch) return acronymMatch;

  const nameMatches = allTeams.filter(candidate =>
    normalizeSearch(candidate.name) === input ||
    normalizeSearch(nationalDisplayNames[candidate.acronym]) === input
  );
  if (nameMatches.length === 1) return nameMatches[0];
  if (nameMatches.length > 1) return null;
  return null;
}

function teamDisplayName(currentTeam) {
  const name = currentTeam.owner?.startsWith('national:')
    ? nationalDisplayNames[currentTeam.acronym] || currentTeam.name
    : currentTeam.name;
  if (teamCategory(currentTeam) && teamCategory(currentTeam) !== 'selecao') {
    return `${name} — ${currentTeam.division === 2 ? '2°' : '1°'} Div`;
  }
  return name;
}

function teamCategory(currentTeam) {
  if (currentTeam.owner?.startsWith('national:')) return 'selecao';
  if (currentTeam.club?.startsWith('champions:') ||
      currentTeam.owner?.startsWith('champions:')) return 'champions';
  if (clubs.includes(currentTeam.club) ||
      currentTeam.club?.endsWith(':division2') ||
      currentTeam.owner?.startsWith('brazil:')) return 'brasileirao';
  return null;
}

const TEAM_STARTING_BALANCE = 1_500_000_000;
const DIVISION_MARKET_THRESHOLD = 650_000_000;

function marketDivision(value) {
  return Number(value) >= DIVISION_MARKET_THRESHOLD ? 1 : 2;
}

function divisionLabel(division) {
  return division === 1 ? '1° Div' : '2° Div';
}

function divisionRoleName(division) {
  return divisionLabel(division);
}

function teamDivisionAcronym(acronym, division) {
  return division === 2 ? `${acronym}2` : acronym;
}

function divisionClubKey(category, name, division) {
  if (category === 'champions') {
    return division === 2
      ? `champions:${name}:division2`
      : `champions:${name}`;
  }
  return division === 2 ? `${name}:division2` : name;
}

function teamOwnerId(currentTeam) {
  if (currentTeam.claimed_by) return currentTeam.claimed_by;
  if (/^(?:national|champions|brazil):/.test(currentTeam.owner || '')) return null;
  return currentTeam.owner || null;
}

function grantTeamStartingBalance(teamId) {
  return db.transaction(() => {
    const currentTeam = db.prepare(
      'SELECT owner, claimed_by FROM teams WHERE id = ?'
    ).get(teamId);
    if (!currentTeam || !teamOwnerId(currentTeam)) {
      throw new Error('TEAM_STARTING_BALANCE_OWNER_MISSING');
    }

    const grant = db.prepare(
      'INSERT OR IGNORE INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
    ).run(
      teamId,
      TEAM_STARTING_BALANCE,
      'Saldo inicial do cofre',
      `team-starting-balance:${teamId}`,
      n()
    );
    if (grant.changes > 0) {
      db.prepare(
        'UPDATE teams SET balance = balance + ? WHERE id = ?'
      ).run(TEAM_STARTING_BALANCE, teamId);
    }
    return true;
  })();
}

function payOFCParticipation(currentTeam, reference) {
  if (!teamOwnerId(currentTeam)) throw new Error('OFC_TEAM_OWNER_MISSING');
  db.prepare(
    'UPDATE teams SET balance = balance + ? WHERE id = ?'
  ).run(OFC_PARTICIPATION_REWARD, currentTeam.id);
  db.prepare(
    'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
  ).run(
    currentTeam.id,
    OFC_PARTICIPATION_REWARD,
    'Participação OFC',
    `${reference}:${currentTeam.id}`,
    n()
  );
}

function createCupFixture(cupId, round, gameNumber, teamAId, teamBId) {
  const teamA = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamAId);
  const teamB = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamBId);
  if (!teamA || !teamB) throw new Error('CUP_TEAM_MISSING');
  const reference = `cup:${cupId}:round:${round}:game:${gameNumber}`;
  const inserted = db.prepare(
    "INSERT INTO matches (ref, type, a, b, competition, category, status, created) VALUES (?, 'ofc', ?, ?, 'Copa do Mundo', 'selecao', 'pending', ?)"
  ).run(reference, teamA.id, teamB.id, n());
  const matchId = Number(inserted.lastInsertRowid);
  if (teamOwnerId(teamA)) payOFCParticipation(teamA, reference);
  if (teamOwnerId(teamB)) payOFCParticipation(teamB, reference);
  db.prepare(
    'INSERT INTO cup_games (cup_id, round, game_number, team_a, team_b, match_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(cupId, round, gameNumber, teamA.id, teamB.id, matchId);
  return matchId;
}

function advanceCupResult(matchId, winnerId) {
  const current = db.prepare(
    'SELECT * FROM cup_games WHERE match_id = ?'
  ).get(matchId);
  if (!current) return;
  db.prepare(
    'UPDATE cup_games SET winner = ? WHERE cup_id = ? AND round = ? AND game_number = ?'
  ).run(winnerId, current.cup_id, current.round, current.game_number);
  if (current.round === 4) {
    db.prepare(
      "UPDATE cups SET status = 'completed', champion_team_id = ? WHERE id = ? AND status = 'active'"
    ).run(winnerId, current.cup_id);
    return;
  }

  const siblingNumber = current.game_number % 2 === 1
    ? current.game_number + 1
    : current.game_number - 1;
  const sibling = db.prepare(
    'SELECT * FROM cup_games WHERE cup_id = ? AND round = ? AND game_number = ?'
  ).get(current.cup_id, current.round, siblingNumber);
  if (!sibling?.winner) return;
  const currentIsFirst = current.game_number % 2 === 1;
  const teamA = currentIsFirst ? winnerId : sibling.winner;
  const teamB = currentIsFirst ? sibling.winner : winnerId;
  const nextRound = current.round + 1;
  const nextGameNumber = Math.ceil(current.game_number / 2);
  const exists = db.prepare(
    'SELECT 1 FROM cup_games WHERE cup_id = ? AND round = ? AND game_number = ?'
  ).get(current.cup_id, nextRound, nextGameNumber);
  if (!exists) {
    createCupFixture(
      current.cup_id,
      nextRound,
      nextGameNumber,
      teamA,
      teamB
    );
  }
}

function createNationalCup(createdBy) {
  if (db.prepare("SELECT 1 FROM cups WHERE status = 'active' LIMIT 1").get()) {
    throw new Error('CUP_ALREADY_ACTIVE');
  }
  const participants = db.prepare(
    "SELECT id, name, acronym FROM teams WHERE owner LIKE 'national:%' AND claimed_by IS NOT NULL"
  ).all();
  const participantAcronyms = new Set(participants.map(currentTeam => currentTeam.acronym));
  if (participants.length !== nationalTeams.length ||
      nationalTeams.some(([, acronym]) => !participantAcronyms.has(acronym))) {
    throw new Error('CUP_REQUIRES_16_OWNED_SELECTIONS');
  }
  const seededAcronyms = ['POR', 'BRA', 'ARG', 'FRA'];
  const seededTeams = seededAcronyms.map(acronym =>
    participants.find(currentTeam => currentTeam.acronym === acronym)
  );
  if (seededTeams.some(currentTeam => !currentTeam)) {
    throw new Error('CUP_SEEDS_MUST_BE_OWNED');
  }
  const seededIds = new Set(seededTeams.map(currentTeam => currentTeam.id));
  const shuffle = values => {
    for (let index = values.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  };
  const unseeded = shuffle(
    participants.filter(currentTeam => !seededIds.has(currentTeam.id))
  );
  const slots = Array(16);
  const seedQuadrantSlots = shuffle([0, 4, 8, 12]);
  shuffle(seededTeams).forEach((currentTeam, index) => {
    slots[seedQuadrantSlots[index]] = currentTeam;
  });
  const remainingSlots = slots
    .map((currentTeam, index) => currentTeam ? null : index)
    .filter(index => index !== null);
  shuffle(remainingSlots);
  remainingSlots.forEach((slot, index) => { slots[slot] = unseeded[index]; });

  const cupId = Number(db.prepare(
    "INSERT INTO cups (status, created_by, created) VALUES ('active', ?, ?)"
  ).run(createdBy, n()).lastInsertRowid);
  for (let index = 0; index < 8; index++) {
    createCupFixture(
      cupId,
      1,
      index + 1,
      slots[index * 2].id,
      slots[index * 2 + 1].id
    );
  }
  return cupId;
}

function cupBracketEmbed(cupId) {
  const cup = db.prepare('SELECT * FROM cups WHERE id = ?').get(cupId);
  const games = db.prepare(
    'SELECT g.round, g.game_number, g.team_a, g.team_b, g.winner, g.match_id, m.score_a, m.score_b, m.status, a.name AS name_a, a.acronym AS acronym_a, b.name AS name_b, b.acronym AS acronym_b FROM cup_games g JOIN matches m ON m.id = g.match_id JOIN teams a ON a.id = g.team_a JOIN teams b ON b.id = g.team_b WHERE g.cup_id = ? ORDER BY g.round, g.game_number'
  ).all(cupId);
  const roundNames = ['Oitavas de final', 'Quartas de final', 'Semifinais', 'Final'];
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 Copa do Mundo OFC')
    .setDescription(
      cup.status === 'completed'
        ? `✅ Copa finalizada • Edição #${cup.id}`
        : `🎲 Chave oficial sorteada • Edição #${cup.id}\nPortugal, Brasil, Argentina e França ficam em quadrantes distintos e só podem se enfrentar nas semifinais ou na final.`
    )
    .setFooter({
      text: 'Use /resultado-ofc com categoria Seleções, competição Copa do Mundo e o ID (#) de cada partida.'
    })
    .setTimestamp();
  for (let round = 1; round <= 4; round++) {
    const entries = games.filter(game => game.round === round);
    if (!entries.length) continue;
    const lines = entries.map(game => {
      const flagA = nationalFlags[game.acronym_a] || '🌍';
      const flagB = nationalFlags[game.acronym_b] || '🌍';
      const result = game.status === 'completed'
        ? ` — **${game.score_a} x ${game.score_b}**`
        : '';
      return `**#${game.match_id}** ${flagA} ${game.name_a} × ${flagB} ${game.name_b}${result}`;
    });
    embed.addFields({
      name: roundNames[round - 1],
      value: lines.join('\n')
    });
  }
  if (cup.champion_team_id) {
    const champion = db.prepare(
      'SELECT name, acronym FROM teams WHERE id = ?'
    ).get(cup.champion_team_id);
    if (champion) {
      embed.addFields({
        name: '🥇 Campeã',
        value: `**${champion.name} (${champion.acronym})**`
      });
    }
  }
  return embed;
}

const normalizeSearch = value =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

const divisionAutocompleteCache = new Map();

function invalidateDivisionAutocompleteCache(guildId) {
  divisionAutocompleteCache.delete(guildId);
}

async function clubOwnerStatus(guild, category = 'brazil', division = 1) {
  if (!guild) throw new Error('GUILD_REQUIRED');

  const entries = category === 'champions'
    ? championsClubs.map(([name]) => [
      name,
      divisionClubKey('champions', name, division)
    ])
    : clubs.map(club => [
      club,
      divisionClubKey('brazil', club, division)
    ]);
  return new Map(entries.map(([name, clubKey]) => {
    const saved = db.prepare(
      'SELECT owner, claimed_by FROM teams WHERE club = ?'
    ).get(clubKey);
    return [name, Boolean(saved && teamOwnerId(saved))];
  }));
}

async function nationalOwnerStatus(guild) {
  if (!guild) throw new Error('GUILD_REQUIRED');
  return new Map(nationalTeams.map(([, acronym]) => {
    const saved = db.prepare(
      "SELECT claimed_by FROM teams WHERE acronym = ? AND owner LIKE 'national:%'"
    ).get(acronym);
    return [acronym, Boolean(saved?.claimed_by)];
  }));
}

async function teamAutocomplete(i, focused) {
  const search = normalizeSearch(focused.value);

  if (i.commandName === 'proposta' && focused.name === 'jogador') {
    if (!i.guild) return [];
    let cached = divisionAutocompleteCache.get(i.guild.id);
    if (!cached) {
      const promise = (async () => {
        const members = i.guild.members.cache.size >= i.guild.memberCount
          ? i.guild.members.cache
          : await i.guild.members.fetch();
        const marketValues = new Map(
          db.prepare('SELECT id, market FROM users').all()
            .map(user => [user.id, user.market])
        );
        for (const player of db.prepare('SELECT user_id, value FROM player_values').all()) {
          marketValues.set(player.user_id, player.value);
        }
        return [...members.values()]
          .filter(member => !member.user.bot)
          .map(member => ({
            id: member.id,
            displayName: member.displayName,
            username: member.user.username,
            division: marketDivision(marketValues.get(member.id) ?? 150000)
          }));
      })();
      cached = { promise };
      divisionAutocompleteCache.set(i.guild.id, cached);
      promise.then(members => {
        if (divisionAutocompleteCache.get(i.guild.id) === cached) {
          cached.members = members;
          delete cached.promise;
        }
      }, () => {
        if (divisionAutocompleteCache.get(i.guild.id) === cached) {
          divisionAutocompleteCache.delete(i.guild.id);
        }
      });
    }
    const members = cached.members || await cached.promise;
    return members
      .filter(member => normalizeSearch(
        `${member.displayName} ${member.username} ${member.id}`
      ).includes(search))
      .slice(0, 25)
      .map(member => ({
        name: `${member.displayName} • ${divisionLabel(member.division)}`.slice(0, 100),
        value: member.id
      }));
  }

  if (['partidas', 'tabela'].includes(i.commandName) &&
      focused.name === 'competicao') {
    let competitions;
    if (i.commandName === 'partidas') {
      const category = i.options.getString('categoria');
      if (!['champions', 'brasileirao', 'copa-do-mundo'].includes(category)) {
        return [];
      }
      const filter = matchCategoryPredicate(category);
      competitions = db.prepare(
        `SELECT DISTINCT m.competition FROM matches m
         WHERE ${filter.sql} AND m.competition IS NOT NULL
         ORDER BY m.competition COLLATE NOCASE`
      ).all(...filter.params);
    } else {
      competitions = db.prepare(
        "SELECT DISTINCT competition FROM matches WHERE status = 'completed' AND score_a IS NOT NULL AND competition IS NOT NULL ORDER BY competition COLLATE NOCASE"
      ).all();
    }
    competitions = competitions
      .map(row => row.competition)
      .filter(competition => normalizeSearch(competition).includes(search))
      .slice(0, 25);
    return competitions.map(competition => ({
      name: i.commandName === 'partidas' &&
        i.options.getString('categoria') === 'copa-do-mundo' &&
        normalizeSearch(competition) === 'copa'
        ? 'Copa (registro antigo da Copa do Mundo)'
        : competition.slice(0, 100),
      value: competition.slice(0, 100)
    }));
  }

  if (['ofc', 'resultado-ofc'].includes(i.commandName) &&
      ['time_a', 'time_b'].includes(focused.name)) {
    const category = i.options.getString('categoria');
    if (!['selecao', 'brasileirao', 'champions'].includes(category)) return [];
    return db.prepare('SELECT * FROM teams')
      .all()
      .filter(currentTeam => teamCategory(currentTeam) === category)
      .filter(currentTeam => {
        const displayName = teamDisplayName(currentTeam);
        return normalizeSearch(displayName).includes(search) ||
          normalizeSearch(currentTeam.acronym).includes(search);
      })
      .slice(0, 25)
      .map(currentTeam => ({
        name: `${currentTeam.acronym} | ${teamDisplayName(currentTeam)}`.slice(0, 100),
        value: currentTeam.acronym
      }));
  }

  if (i.commandName === 'selecionar-team') {
    const division = marketDivision(playerValue(i.user.id));
    const owners = await clubOwnerStatus(i.guild, false, 'brazil', division);

    return clubs
      .filter(club =>
        normalizeSearch(club).includes(search) ||
        acr[club].toLowerCase().includes(search)
      )
      .slice(0, 25)
      .map(club => ({
        name: `${teamDivisionAcronym(acr[club], division)} | ${club} — ${divisionLabel(division)}${owners.get(club) ? ' (Ocupado)' : ' (Livre)'}`,
        value: club
      }));
  }

  if (i.commandName === 'selecionar-team-champions') {
    const division = marketDivision(playerValue(i.user.id));
    const owners = await clubOwnerStatus(i.guild, false, 'champions', division);
    return championsClubs
      .filter(([name, acronym]) =>
        normalizeSearch(name).includes(search) ||
        acronym.toLowerCase().includes(search)
      )
      .slice(0, 25)
      .map(([name, acronym, flag]) => ({
        name: `${flag} ${teamDivisionAcronym(acronym, division)} | ${name} — ${divisionLabel(division)}${owners.get(name) ? ' (Ocupado)' : ' (Livre)'}`.slice(0, 100),
        value: name
      }));
  }

  if (i.commandName === 'selecionar-selecao') {
    const ownerStatus = await nationalOwnerStatus(i.guild);
    return nationalTeams
      .map(([name, acronym]) => ({
        name: nationalDisplayNames[acronym] || name,
        acronym,
        flag: nationalFlags[acronym] || '🌍',
        occupied: ownerStatus.get(acronym)
      }))
      .filter(selection =>
        normalizeSearch(selection.name).includes(search) ||
        selection.acronym.toLowerCase().includes(search)
      )
      .slice(0, 25)
      .map(selection => ({
        name: `${selection.flag} ${selection.name} — ${selection.occupied ? 'Ocupada' : 'Livre'}`.slice(0, 100),
        value: selection.acronym
      }));
  }

  if (i.commandName === 'sair-team') {
    const memberRoles = i.member?.roles?.cache;
    const teams = db.prepare('SELECT * FROM teams').all();
    const choices = [];
    for (const currentTeam of teams) {
      const roleLabels = ['Dono', 'Gerente', 'Jogador', 'Convocado'];
      const heldRoles = roleLabels.filter(label => memberRoles?.some(
        role => role.name === `${currentTeam.acronym} | ${label}`
      ));
      const ownsInDatabase = currentTeam.owner === i.user.id ||
        currentTeam.claimed_by === i.user.id;
      if (ownsInDatabase && !heldRoles.includes('Dono')) {
        heldRoles.unshift('Dono');
      }
      if (!heldRoles.length) continue;
      const displayName = `${currentTeam.acronym} | ${teamDisplayName(currentTeam)}`;
      if (!normalizeSearch(`${displayName} ${heldRoles.join(' ')}`).includes(search)) {
        continue;
      }
      for (const label of heldRoles) {
        const kind = label === 'Dono'
          ? 'owner'
          : label === 'Gerente'
            ? 'manager'
            : label === 'Convocado'
              ? 'roster'
              : 'player';
        choices.push({
          name: `${displayName} — ${label}`.slice(0, 100),
          value: `${currentTeam.id}:${kind}`
        });
      }
    }
    return choices.slice(0, 25);
  }

  const nationalOnly = i.commandName === 'convocar';
  const allClubCategories = ['elenco-time', 'gerenciar-time'].includes(i.commandName);
  const includeNational = nationalOnly ||
    ['ofc', 'resultado-ofc', 'ver-team'].includes(i.commandName);
  const available = db.prepare(
    i.commandName === 'ver-team'
      ? 'SELECT * FROM teams'
      : nationalOnly
      ? "SELECT * FROM teams WHERE owner LIKE 'national:%' AND claimed_by IS NOT NULL AND EXISTS (SELECT 1 FROM national_presidents np WHERE np.team_id = teams.id AND np.president_id = teams.claimed_by)"
      : includeNational
        ? 'SELECT * FROM teams'
        : allClubCategories
          ? "SELECT * FROM teams WHERE owner NOT LIKE 'national:%'"
          : "SELECT * FROM teams WHERE owner NOT LIKE 'national:%' AND owner NOT LIKE 'champions:%' AND owner NOT LIKE 'brazil:%'"
  ).all();

  const matches = available
    .filter(t => {
      if (i.commandName === 'ver-team') {
        const selectedCategory = i.options.getString('categoria');
        const category = selectedCategory === 'copa-do-mundo'
          ? 'selecao'
          : selectedCategory;
        if (!category || teamCategory(t) !== category) return false;
      }
      const displayName = teamDisplayName(t);
      return normalizeSearch(t.name).includes(search) ||
        normalizeSearch(displayName).includes(search) ||
        normalizeSearch(t.acronym).includes(search);
    });

  let preferred = null;
  if (i.user?.id && i.commandName === 'estadio') {
    preferred = db.prepare(
      'SELECT acronym FROM teams WHERE owner = ? LIMIT 1'
    ).get(i.user.id)?.acronym;
  }
  matches.sort((left, right) => {
    const leftStarts = normalizeSearch(teamDisplayName(left)).startsWith(search) ||
      normalizeSearch(left.name).startsWith(search) ||
      normalizeSearch(left.acronym).startsWith(search);
    const rightStarts = normalizeSearch(teamDisplayName(right)).startsWith(search) ||
      normalizeSearch(right.name).startsWith(search) ||
      normalizeSearch(right.acronym).startsWith(search);
    return Number(rightStarts) - Number(leftStarts) ||
      Number(right.acronym === preferred) - Number(left.acronym === preferred);
  });

  const choices = matches
    .slice(0, 25)
    .map(t => ({
      name: `${t.acronym} | ${teamDisplayName(t)}`,
      value: t.acronym
    }));

  if (i.commandName === 'money') {
    const users = [...(i.guild?.members?.cache?.values() || [])]
      .filter(member => {
        const searchable = normalizeSearch(
          `${member.user.username} ${member.displayName} ${member.id}`
        );
        return searchable.includes(search);
      })
      .map(member => ({
        name: `${member.displayName} | ${member.id}`.slice(0, 100),
        value: member.id
      }));
    return (search ? [...users, ...choices] : [...choices, ...users]).slice(0, 25);
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

function parseBrasiliaSchedule(value) {
  if (!value) return { scheduledAt: null };
  const match = String(value).trim().match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/
  );
  if (!match) return { error: 'Use AAAA-MM-DD HH:mm no horário de Brasília.' };

  const [, year, month, day, hour, minute] = match.map(Number);
  const utcMillis = Date.UTC(year, month - 1, day, hour + 3, minute);
  const brasiliaDate = new Date(utcMillis - 3 * 60 * 60 * 1000);
  if (
    brasiliaDate.getUTCFullYear() !== year ||
    brasiliaDate.getUTCMonth() !== month - 1 ||
    brasiliaDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return { error: 'A data ou o horário informado não existe.' };
  }
  if (utcMillis <= n()) {
    return { error: 'O horário agendado precisa estar no futuro.' };
  }
  return { scheduledAt: utcMillis };
}

function formatBrasiliaSchedule(timestamp) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

function isPublicIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const value = parts.reduce((result, part) => result * 256 + part, 0);
  const blockedRanges = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
  ];
  return !blockedRanges.some(([range, prefix]) => {
    const base = range.split('.').map(Number).reduce((result, part) => result * 256 + part, 0);
    return Math.floor(value / 2 ** (32 - prefix)) === Math.floor(base / 2 ** (32 - prefix));
  });
}

async function fetchMatchCrest(imageUrl, redirects = 0) {
  const url = new URL(imageUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))
  ) {
    throw new Error('Os escudos precisam usar uma URL HTTP(S) pública.');
  }

  const addresses = await dns.lookup(url.hostname, { all: true, family: 4 });
  const address = addresses.find(result => isPublicIPv4(result.address));
  if (!address) throw new Error('A URL do escudo não aponta para um endereço público.');

  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url, {
      headers: { accept: 'image/*,*/*;q=0.8' },
      lookup: (_hostname, _options, callback) => callback(null, address.address, 4)
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 3 || !response.headers.location) {
          reject(new Error('A URL do escudo redirecionou muitas vezes.'));
          return;
        }
        fetchMatchCrest(new URL(response.headers.location, url).href, redirects + 1)
          .then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`O servidor da imagem respondeu com HTTP ${response.statusCode}.`));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) {
          request.destroy(new Error('O arquivo do escudo excede o limite de 5 MB.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(8000, () => request.destroy(new Error('A URL do escudo demorou demais para responder.')));
    request.on('error', reject);
  });
}

async function matchupAttachment(a, b, crestA, crestB) {
  if (!crestA && !crestB) return null;

  const [bufferA, bufferB] = await Promise.all([
    crestA ? fetchMatchCrest(crestA) : null,
    crestB ? fetchMatchCrest(crestB) : null
  ]);
  const [imageA, imageB] = await Promise.all([
    bufferA ? loadImage(bufferA) : null,
    bufferB ? loadImage(bufferB) : null
  ]);
  const canvas = createCanvas(1000, 430);
  const context = canvas.getContext('2d');
  context.fillStyle = '#173b6c';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const [image, team, x] of [[imageA, a, 55], [imageB, b, 555]]) {
    context.fillStyle = '#ffffff';
    context.fillRect(x, 40, 390, 350);
    if (image) {
      const scale = Math.min(330 / image.width, 330 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, x + (390 - width) / 2, 50 + (330 - height) / 2, width, height);
    } else {
      context.fillStyle = '#173b6c';
      context.font = 'bold 80px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(team.acronym, x + 195, 215, 340);
    }
  }

  context.fillStyle = '#ffffff';
  context.font = 'bold 86px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('×', 500, 215);

  return new AttachmentBuilder(await canvas.encode('png'), { name: 'ofc-confronto.png' });
}

function ofcMatchEmbeds({ embed, matchup }) {
  const embeds = [];
  if (matchup) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0x173b6c)
        .setImage(`attachment://${matchup.name}`)
    );
  }
  embeds.push(embed);
  return { embeds, files: matchup ? [matchup] : [] };
}

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

function ofcMatchEmbed({
  matchId,
  category,
  competition,
  scheduledAt,
  a,
  b,
  competitionCrest,
  matchup
}) {
  const categoryLabels = {
    selecao: 'Seleções',
    brasileirao: 'Brasileirão',
    champions: 'Champions League'
  };
  const scheduledValue = scheduledAt
    ? `<t:${Math.floor(scheduledAt / 1000)}:F>\n${formatBrasiliaSchedule(scheduledAt)} (Brasília, UTC-3)`
    : 'Horário a combinar';
  const embed = new EmbedBuilder()
    .setColor(0x173b6c)
    .setTitle(`🏆 ${competition}`)
    .setDescription(`**PARTIDA OFICIAL • OFC #${matchId}**`)
    .addFields(
      {
        name: '🔵 TIME A',
        value: `**${a.name}**\n\`${a.acronym}\``,
        inline: true
      },
      { name: '⚔️ CONFRONTO', value: '**VS**', inline: true },
      {
        name: '🔴 TIME B',
        value: `**${b.name}**\n\`${b.acronym}\``,
        inline: true
      },
      { name: '📂 CATEGORIA', value: categoryLabels[category] || category, inline: true },
      { name: '🕒 HORÁRIO', value: scheduledValue, inline: true },
      { name: '💰 PREMIAÇÃO', value: `${cash(OFC_PARTICIPATION_REWARD)} para cada time`, inline: true }
    )
    .setFooter({ text: 'PFL Matchmaker • Registre o placar com /resultado-ofc' })
    .setTimestamp();
  if (competitionCrest) embed.setAuthor({ name: 'PFL Matchmaker • OFC', iconURL: competitionCrest });
  else embed.setAuthor({ name: 'PFL Matchmaker • OFC' });
  return ofcMatchEmbeds({ embed, matchup });
}

const owner = id =>
  db.prepare('SELECT * FROM teams WHERE owner = ? OR claimed_by = ?').get(id, id);

function canManageTeam(member, currentTeam) {
  if (!member || !currentTeam) return false;
  if (currentTeam.owner === member.id || currentTeam.claimed_by === member.id) {
    return true;
  }
  if (db.prepare(
    "SELECT 1 FROM members WHERE team_id = ? AND user_id = ? AND kind = 'manager'"
  ).get(currentTeam.id, member.id)) {
    return true;
  }
  return member.roles.cache.some(role =>
    role.name === `${currentTeam.acronym} | Gerente`
  );
}

function ensure(id) {
  const due = n() + 10 * 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT OR IGNORE INTO users (id, salary_due) VALUES (?, ?)'
  ).run(id, due);
  db.prepare(
    'UPDATE users SET salary_due = ? WHERE id = ? AND salary_due <= 0'
  ).run(due, id);
}

function playerValue(id) {
  const saved = db.prepare(
    'SELECT value FROM player_values WHERE user_id = ?'
  ).get(id);
  const user = db.prepare(
    'SELECT market FROM users WHERE id = ?'
  ).get(id);
  return saved?.value ?? user?.market ?? 150000;
}

async function applyStatisticsMarketChanges(guild, messageId, changes) {
  if (typeof messageId !== 'string' || !messageId ||
      !Array.isArray(changes) || !guild?.id) {
    throw new Error('INVALID_STATISTICS_MARKET_UPDATE');
  }
  const totals = new Map();
  for (const change of changes) {
    if (typeof change?.userId !== 'string' || !change.userId ||
        !Number.isSafeInteger(change.delta)) {
      throw new Error('INVALID_STATISTICS_MARKET_CHANGE');
    }
    totals.set(change.userId, (totals.get(change.userId) || 0) + change.delta);
  }

  const updates = db.transaction(() => {
    const applied = [];
    for (const [userId, delta] of totals) {
      if (!Number.isSafeInteger(delta)) throw new Error('UNSAFE_STATISTICS_MARKET_DELTA');
      if (delta === 0) continue;
      const recorded = db.prepare(
        'INSERT OR IGNORE INTO match_statistics_market_updates (message_id, user_id, delta) VALUES (?, ?, ?)'
      ).run(messageId, userId, delta);
      if (!recorded.changes) continue;

      ensure(userId);
      const currentValue = playerValue(userId);
      const nextValue = Math.max(0, currentValue + delta);
      if (!Number.isSafeInteger(nextValue)) {
        throw new Error(`UNSAFE_MARKET_VALUE_FOR_${userId}`);
      }
      if (nextValue === currentValue) continue;

      db.prepare(
        'INSERT INTO player_values (user_id, value) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET value = excluded.value'
      ).run(userId, nextValue);
      db.prepare('UPDATE users SET market = ? WHERE id = ?').run(nextValue, userId);
      applied.push({ userId, value: nextValue });
    }
    return applied;
  })();

  if (updates.length) invalidateDivisionAutocompleteCache(guild.id);
  const roleSyncFailures = [];
  for (const update of updates) {
    try {
      await syncDivisionRole(guild, update.userId, update.value);
    } catch (error) {
      console.error(`Valor de mercado de ${update.userId} atualizado, mas falhou a sincronização da divisão:`, error);
      roleSyncFailures.push(update.userId);
    }
  }
  return { updated: updates, roleSyncFailures };
}

function profileEmbed(user, guildMember = null) {
  ensure(user.id);
  const account = db.prepare(
    'SELECT balance, salary_due FROM users WHERE id = ?'
  ).get(user.id);
  const playerMemberships = db.prepare(
    `SELECT t.name, t.acronym, t.division, m.kind FROM members m
     JOIN teams t ON t.id = m.team_id WHERE m.user_id = ?
     ORDER BY CASE m.kind WHEN 'manager' THEN 0 ELSE 1 END`
  ).all(user.id);
  const nationalMemberships = db.prepare(
    `SELECT t.name, t.acronym FROM national_roster r
     JOIN teams t ON t.id = r.team_id WHERE r.player_id = ?
     ORDER BY t.name COLLATE NOCASE`
  ).all(user.id);
  const ownedTeams = db.prepare(
    `SELECT * FROM teams
     WHERE owner = ? OR claimed_by = ? ORDER BY name COLLATE NOCASE`
  ).all(user.id, user.id);
  const nationalPresidencies = db.prepare(
    `SELECT t.* FROM national_presidents p
     JOIN teams t ON t.id = p.team_id
     WHERE p.president_id = ? AND t.claimed_by = p.president_id
     ORDER BY t.name COLLATE NOCASE`
  ).all(user.id);
  const verifiedOwnedTeams = guildMember
    ? ownedTeams.filter(current =>
      teamOwnerId(current) === user.id &&
      guildMember.roles.cache.some(role =>
        role.name === `${current.acronym} | Dono`
      )
    )
    : [];
  const verifiedPresidencies = guildMember
    ? nationalPresidencies.filter(current =>
      guildMember.roles.cache.some(role =>
        role.name === `${current.acronym} | Dono`
      )
    )
    : [];
  const teamNames = [
    ...verifiedOwnedTeams.map(current =>
      `${current.name} (${current.acronym}) — Dono (${divisionLabel(current.division)})`
    ),
    ...verifiedPresidencies.map(current =>
      `${teamDisplayName(current)} (${current.acronym}) — Presidente`
    ),
    ...playerMemberships.map(current =>
      `${current.name} (${current.acronym}) — ${current.kind === 'manager' ? 'Gerente' : 'Jogador'} (${divisionLabel(current.division)})`
    ),
    ...nationalMemberships.map(current =>
      `${teamDisplayName(current)} (${current.acronym}) — Seleção`
    )
  ];
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`👤 Perfil de ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: '💰 Saldo', value: cash(account.balance), inline: true },
      { name: '⭐ Valor de mercado', value: cash(playerValue(user.id)), inline: true },
      { name: '🏆 Divisão', value: divisionLabel(marketDivision(playerValue(user.id))), inline: true },
      { name: '💵 Próximo salário', value: `<t:${Math.floor(account.salary_due / 1000)}:R>`, inline: true },
      { name: '🏟️ Vínculos', value: teamNames.length ? teamNames.join('\n').slice(0, 1024) : 'Sem time ou seleção', inline: false }
    )
    .setTimestamp();
}

let profileUpdateInProgress = false;

async function publishProfileUpdates() {
  if (profileUpdateInProgress) return;
  profileUpdateInProgress = true;
  try {
    const updates = db.prepare(
      'SELECT user_id, updated_at FROM profile_updates ORDER BY updated_at LIMIT 20'
    ).all();
    if (updates.length === 0) return;

    const channel = await client.channels.fetch(ch.profile);
    if (!channel?.isTextBased() || !channel.guild) {
      throw new Error(`Canal de perfil ${ch.profile} não é um canal de texto do servidor.`);
    }

    for (const update of updates) {
      try {
        const user = await client.users.fetch(update.user_id);
        if (user.bot) {
          db.prepare(
            'DELETE FROM profile_updates WHERE user_id = ? AND updated_at = ?'
          ).run(update.user_id, update.updated_at);
          continue;
        }
        let guildMember = null;
        try {
          guildMember = await channel.guild.members.fetch(user.id);
        } catch (error) {
          if (error.code !== 10007) throw error;
        }
        const embed = profileEmbed(user, guildMember);
        const embedSnapshot = embed.toJSON();
        delete embedSnapshot.timestamp;
        const fingerprint = createHash('sha256')
          .update(JSON.stringify(embedSnapshot))
          .digest('hex');
        const previous = db.prepare(
          'SELECT fingerprint FROM profile_publications WHERE user_id = ?'
        ).get(user.id);
        if (previous?.fingerprint !== fingerprint) {
          await channel.send({ embeds: [embed] });
          db.prepare(
            `INSERT INTO profile_publications (user_id, fingerprint, published_at)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               fingerprint = excluded.fingerprint,
               published_at = excluded.published_at`
          ).run(user.id, fingerprint, n());
        }
        db.prepare(
          'DELETE FROM profile_updates WHERE user_id = ? AND updated_at = ?'
        ).run(update.user_id, update.updated_at);
      } catch (error) {
        console.error(`Falha ao publicar atualização do perfil ${update.user_id}:`, error);
      }
    }
  } catch (error) {
    console.error('Falha ao acessar o canal de atualizações de perfil:', error);
  } finally {
    profileUpdateInProgress = false;
  }
}

function createMarketListing(userId, teamId, role, value) {
  const existing = db.prepare(
    "SELECT * FROM market_listings WHERE user_id = ? AND status = 'available'"
  ).get(userId);
  if (existing) return { listing: existing, created: false };

  const result = db.prepare(
    'INSERT INTO market_listings (user_id, team_id, role, value, status, created) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, teamId, role, value, 'available', n());
  return {
    listing: db.prepare('SELECT * FROM market_listings WHERE id = ?')
      .get(Number(result.lastInsertRowid)),
    created: true
  };
}

function saveFreeAgencyListing(userId, role, value, details) {
  return db.transaction(() => {
    const existing = db.prepare(
      "SELECT * FROM market_listings WHERE user_id = ? AND status = 'available'"
    ).get(userId);
    if (existing) {
      db.prepare(
        'UPDATE market_listings SET role = ?, value = ?, description = ?, roblox_username = ?, position = ? WHERE id = ? AND status = \'available\''
      ).run(
        role,
        value,
        details.description,
        details.robloxUsername,
        details.position,
        existing.id
      );
      return {
        listing: db.prepare('SELECT * FROM market_listings WHERE id = ?')
          .get(existing.id),
        created: false
      };
    }

    const result = db.prepare(
      `INSERT INTO market_listings
       (user_id, team_id, role, value, status, created, description, roblox_username, position)
       VALUES (?, NULL, ?, ?, 'available', ?, ?, ?, ?)`
    ).run(
      userId,
      role,
      value,
      n(),
      details.description,
      details.robloxUsername,
      details.position
    );
    return {
      listing: db.prepare('SELECT * FROM market_listings WHERE id = ?')
        .get(Number(result.lastInsertRowid)),
      created: true
    };
  })();
}

function marketListingEmbed(listing, lastTeam = null, avatarURL = null) {
  const roleName = listing.role === 'manager' ? 'Gerente' : 'Jogador';
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🪟 Janela de transferências — agente livre')
    .setDescription(
      `<@${listing.user_id}> está disponível e **não tem time**.\n` +
      `Função disponível: **${roleName}**.`
    )
    .addFields(
      { name: '💰 Valor de mercado', value: cash(listing.value), inline: true },
      { name: '🕒 Disponível desde', value: `<t:${Math.floor(listing.created / 1000)}:F>`, inline: true },
      { name: 'Último time', value: lastTeam ? `${lastTeam.name} (${lastTeam.acronym})` : 'Sem time anterior', inline: true }
    );
  if (listing.roblox_username) {
    embed.addFields({ name: 'Nick do Roblox', value: `\`${listing.roblox_username}\``, inline: true });
  }
  if (listing.position) {
    embed.addFields({ name: 'Posição', value: listing.position, inline: true });
  }
  if (listing.description) {
    embed.addFields({ name: 'Apresentação', value: listing.description.slice(0, 1024), inline: false });
  }
  embed
    .setFooter({ text: `Agente livre #${listing.id} • PFL Matchmaker` })
    .setTimestamp(listing.created);
  if (avatarURL) embed.setThumbnail(avatarURL);
  return embed;
}

async function publishMarketListing(listing, destinations = [
  ['janela de transferências', ch.transfer, 'transfer_message_id'],
  ['registros', ch.logs, 'registry_message_id']
]) {
  const currentListing = db.prepare(
    "SELECT * FROM market_listings WHERE id = ? AND status = 'available'"
  ).get(listing.id);
  if (!currentListing) return [];
  listing = currentListing;
  const lastTeam = listing.team_id
    ? db.prepare('SELECT name, acronym FROM teams WHERE id = ?').get(listing.team_id)
    : null;
  let avatarURL = null;
  try {
    const user = await client.users.fetch(listing.user_id);
    avatarURL = user.displayAvatarURL({ size: 512 });
  } catch (error) {
    console.error(`Não foi possível carregar a foto de perfil do agente livre ${listing.user_id}:`, error);
  }
  const payload = {
    embeds: [marketListingEmbed(listing, lastTeam, avatarURL)],
    allowedMentions: { users: [listing.user_id] }
  };
  const outcomes = [];
  for (const [label, channelId, column] of destinations) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        throw new Error(`Canal ${channelId} não encontrado ou não é textual.`);
      }
      let message;
      if (listing[column]) {
        try {
          message = await channel.messages.fetch(listing[column]);
          await message.edit(payload);
        } catch (error) {
          if (error.code !== 10008) throw error;
          message = await channel.send(payload);
          db.prepare(`UPDATE market_listings SET ${column} = ? WHERE id = ?`)
            .run(message.id, listing.id);
        }
      } else {
        message = await channel.send(payload);
        db.prepare(`UPDATE market_listings SET ${column} = ? WHERE id = ?`)
          .run(message.id, listing.id);
      }
      const latest = db.prepare(
        'SELECT * FROM market_listings WHERE id = ?'
      ).get(listing.id);
      if (latest.status !== 'available') {
        await message.edit({
          embeds: [marketListingClosedEmbed(latest)],
          allowedMentions: { users: [latest.user_id] }
        });
      }
      outcomes.push({ label, sent: true });
    } catch (error) {
      console.error(`Não foi possível publicar o agente livre #${listing.id} no canal de ${label}:`, error);
      outcomes.push({ label, sent: false });
    }
  }
  return outcomes;
}

function marketListingClosedEmbed(listing, currentTeam = null) {
  const roleName = listing.role === 'manager' ? 'Gerente' : 'Jogador';
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅ Agente livre contratado')
    .setDescription(
      `<@${listing.user_id}> não está mais disponível na janela de transferências.\n` +
      `Função: **${roleName}**${currentTeam ? ` • Novo time: **${currentTeam.name} (${currentTeam.acronym})**` : ''}`
    )
    .addFields(
      { name: '💰 Valor', value: cash(listing.value), inline: true },
      { name: '🕒 Atualizado', value: `<t:${Math.floor((listing.resolved_at || n()) / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: `Agente livre #${listing.id} • PFL Matchmaker` })
    .setTimestamp(listing.resolved_at || n());
}

async function closeMarketListing(listingId, currentTeam) {
  if (!listingId) return [];
  const listing = db.prepare(
    "SELECT * FROM market_listings WHERE id = ? AND status = 'signed'"
  ).get(listingId);
  if (!listing) return [];
  const outcomes = [];
  for (const [label, channelId, messageId] of [
    ['janela de transferências', ch.transfer, listing.transfer_message_id],
    ['registros', ch.logs, listing.registry_message_id]
  ]) {
    if (!messageId) continue;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        throw new Error(`Canal ${channelId} não encontrado ou não é textual.`);
      }
      const message = await channel.messages.fetch(messageId);
      await message.edit({
        embeds: [marketListingClosedEmbed(listing, currentTeam)],
        allowedMentions: { users: [listing.user_id] }
      });
      outcomes.push({ label, updated: true });
    } catch (error) {
      console.error(`Não foi possível atualizar o agente livre #${listing.id} no canal de ${label}:`, error);
      outcomes.push({ label, updated: false });
    }
  }
  return outcomes;
}

function hasGenericPlayerRole(member) {
  return member.roles.cache.some(role =>
    ['player', 'jogador'].includes(role.name.trim().toLocaleLowerCase('pt-BR'))
  );
}

async function announceNewFreeAgent(member) {
  if (!member || member.guild.id !== process.env.GUILD_ID ||
      !hasGenericPlayerRole(member)) return;
  const hasTeamRole = member.roles.cache.some(role => {
    const match = role.name.match(/^([A-Z]{3,4}) \| (Dono|Gerente|Jogador)$/i);
    const currentTeam = match ? team(match[1]) : null;
    return currentTeam && !currentTeam.owner.startsWith('national:');
  });
  const registered = db.prepare(
    'SELECT 1 FROM members WHERE user_id = ? LIMIT 1'
  ).get(member.id);
  if (hasTeamRole || registered) return;

  ensure(member.id);
  const value = playerValue(member.id);
  const { listing, created } = createMarketListing(member.id, null, 'player', value);
  if (created) await publishMarketListing(listing);
}

const salaryInterval = 10 * 24 * 60 * 60 * 1000;

function initializeEligibleSalaryDue(now = n()) {
  const schedule = db.prepare(
    'SELECT value FROM app_settings WHERE key = ?'
  ).get('salary_schedule_10_days');
  const anchor = Number(schedule?.value);
  if (!Number.isSafeInteger(anchor) || anchor <= 0) {
    throw new Error('Horário inicial do cronograma de salários inválido.');
  }
  const periods = Math.max(0, Math.ceil((now - anchor) / salaryInterval));
  const nextDue = anchor + periods * salaryInterval;
  if (!Number.isSafeInteger(nextDue)) {
    throw new Error('Próximo vencimento de salário excede o limite seguro.');
  }

  const eligible = db.prepare(`
    SELECT user_id AS id FROM members WHERE kind = 'player'
    UNION
    SELECT player_id AS id FROM national_roster
  `).all();
  const initialize = db.transaction(() => {
    const insertAccount = db.prepare(
      'INSERT OR IGNORE INTO users (id, salary_due) VALUES (?, ?)'
    );
    const setInitialDue = db.prepare(
      'UPDATE users SET salary_due = ? WHERE id = ? AND salary_due <= 0'
    );
    let initialized = 0;
    for (const { id } of eligible) {
      insertAccount.run(id, nextDue);
      initialized += setInitialDue.run(nextDue, id).changes;
    }
    return initialized;
  });
  return initialize();
}

function runAutomaticSalaries() {
  const initialized = initializeEligibleSalaryDue();
  if (initialized > 0) {
    console.log(`Cronograma inicializado para ${initialized} jogador(es) elegível(is).`);
  }
  const eligible = db.prepare(`
    SELECT user_id AS id FROM members WHERE kind = 'player'
    UNION
    SELECT player_id AS id FROM national_roster
  `).all();
  let count = 0;
  const now = n();
  for (const { id } of eligible) {
    try {
      const paid = db.transaction(() => {
        ensure(id);
        const account = db.prepare(
          'SELECT balance, salary_due FROM users WHERE id = ?'
        ).get(id);
        if (account.salary_due > now) return false;

        const periods = Math.floor((now - account.salary_due) / salaryInterval) + 1;
        const salary = playerValue(id);
        const amount = salary * periods;
        if (!Number.isSafeInteger(amount) ||
            !Number.isSafeInteger(account.balance + amount)) {
          throw new Error(`AUTO_SALARY_OVERFLOW:${id}`);
        }
        const nextDue = account.salary_due + periods * salaryInterval;
        const updated = db.prepare(
          'UPDATE users SET balance = balance + ?, salary_due = ? WHERE id = ? AND salary_due = ?'
        ).run(amount, nextDue, id, account.salary_due);
        if (updated.changes === 0) return false;
        db.prepare(
          'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
        ).run(
          id,
          amount,
          periods === 1 ? 'Salário automático' : `Salário automático (${periods} períodos)`,
          `salary:auto:${id}:${account.salary_due}`,
          now
        );
        return true;
      })();
      if (paid) count++;
    } catch (error) {
      console.error(`Falha ao creditar o salário automático de ${id}:`, error);
    }
  }
  return count;
}

function log(g, msg) {
  const c = g.channels.cache.get(ch.logs);

  if (c?.isTextBased()) {
    c.send(msg).catch(error =>
      console.error(`Falha ao registrar mensagem no canal ${ch.logs}:`, error)
    );
  }
}

function teamOwnershipEmbed(currentTeam, ownerId) {
  const memberCounts = db.prepare(
    'SELECT kind, COUNT(*) AS count FROM members WHERE team_id = ? GROUP BY kind'
  ).all(currentTeam.id);
  const counts = Object.fromEntries(
    memberCounts.map(row => [row.kind, row.count])
  );
  const playerCount = currentTeam.owner.startsWith('national:')
    ? db.prepare('SELECT COUNT(*) AS count FROM national_roster WHERE team_id = ?')
      .get(currentTeam.id).count
    : counts.player || 0;
  const managerCount = counts.manager || 0;
  const president = currentTeam.owner.startsWith('national:');
  const categoryLabel = {
    selecao: 'Seleção',
    brasileirao: 'Brasileirão',
    champions: 'Champions League'
  }[teamCategory(currentTeam)] || 'Time';
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(president ? '🌍 Registro de presidente' : '👑 Registro de dono')
    .setDescription(
      `<@${ownerId}> agora é ${president ? 'presidente da seleção' : 'dono do time'} **${teamDisplayName(currentTeam)} (${currentTeam.acronym})**.`
    )
    .addFields(
      { name: 'Categoria', value: categoryLabel, inline: true },
      { name: 'Jogadores', value: String(playerCount), inline: true },
      { name: 'Gerentes', value: String(managerCount), inline: true }
    )
    .setFooter({ text: `Registro de propriedade • ${currentTeam.acronym}` })
    .setTimestamp();
  if (currentTeam.crest) embed.setThumbnail(currentTeam.crest);
  return embed;
}

async function publishTeamOwnershipRegistration(currentTeam, ownerId) {
  const channel = await client.channels.fetch(ch.registry);
  if (!channel?.isTextBased() || channel.guildId !== process.env.GUILD_ID) {
    throw new Error(`Canal de registros ${ch.registry} não encontrado ou não é textual no servidor.`);
  }
  return channel.send({
    embeds: [teamOwnershipEmbed(currentTeam, ownerId)],
    allowedMentions: { users: [ownerId] }
  });
}

async function publishFriendlyRegistration(matchId, invitingTeam, invitedTeam, invite) {
  const channel = await client.channels.fetch(ch.registry);
  if (!channel?.isTextBased() || channel.guildId !== process.env.GUILD_ID) {
    throw new Error(`Canal de registros ${ch.registry} não encontrado ou não é textual no servidor.`);
  }
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('⚽ Amistoso registrado')
    .setDescription(
      `**${teamDisplayName(invitingTeam)} (${invitingTeam.acronym}) x ${teamDisplayName(invitedTeam)} (${invitedTeam.acronym})**`
    )
    .addFields(
      { name: 'Partida', value: `#${matchId}`, inline: true },
      { name: 'Horário', value: invite.scheduled_at ? formatBrasiliaSchedule(invite.scheduled_at) : 'Agora', inline: true },
      { name: 'Divisão', value: `Divisão ${Math.min(invitingTeam.division, invitedTeam.division)}`, inline: true },
      { name: 'Usuário Roblox', value: `\`${invite.roblox_username}\``, inline: true },
      { name: 'Servidor', value: invite.server_url, inline: false }
    )
    .setFooter({ text: `PFL Matchmaker • Amistoso #${matchId}` })
    .setTimestamp();
  if (invitingTeam.crest && invitedTeam.crest) {
    embed.setThumbnail(invitingTeam.crest).setImage(invitedTeam.crest);
  } else if (invitingTeam.crest || invitedTeam.crest) {
    embed.setThumbnail(invitingTeam.crest || invitedTeam.crest);
  }
  return channel.send({ embeds: [embed] });
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

  await g.roles.fetch();
  for (const [, label] of specs) {
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

    if (label !== 'Dono') continue;
    const ownerId = t.claimed_by || t.owner;
    if (/^(?:national|champions):/.test(ownerId)) continue;
    const member = await g.members.fetch(ownerId);
    await member.roles.add(r);
  }
  if (teamCategory(t) && teamCategory(t) !== 'selecao') {
    const ownerId = t.claimed_by || t.owner;
    if (!/^(?:national|champions|brazil):/.test(ownerId)) {
      await syncDivisionRole(g, ownerId, playerValue(ownerId));
    }
  }
}

async function syncDivisionRole(guild, userId, value, rolesFetched = false) {
  const division = marketDivision(value);
  if (!rolesFetched) await guild.roles.fetch();
  let targetRole = guild.roles.cache.find(
    role => role.name === divisionRoleName(division)
  );
  if (!targetRole) {
    targetRole = await guild.roles.create({
      name: divisionRoleName(division),
      permissions: [],
      reason: 'Cargo automático de divisão PFL'
    });
  }
  let otherRole = guild.roles.cache.find(
    role => role.name === divisionRoleName(division === 1 ? 2 : 1)
  );
  if (!otherRole) {
    otherRole = await guild.roles.create({
      name: divisionRoleName(division === 1 ? 2 : 1),
      permissions: [],
      reason: 'Cargo automático de divisão PFL'
    });
  }
  const member = await guild.members.fetch(userId);
  let changed = false;
  if (member.roles.cache.has(otherRole.id)) {
    await member.roles.remove(otherRole);
    changed = true;
  }
  if (!member.roles.cache.has(targetRole.id)) {
    await member.roles.add(targetRole);
    changed = true;
  }
  if (changed) invalidateDivisionAutocompleteCache(guild.id);
  return division;
}

async function syncGuildDivisionRoles(guild) {
  if (!guild) throw new Error('GUILD_REQUIRED_FOR_DIVISION_SYNC');
  await guild.roles.fetch();
  const members = await guild.members.fetch();
  for (const member of members.values()) {
    if (member.user.bot) continue;
    try {
      await syncDivisionRole(guild, member.id, playerValue(member.id), true);
    } catch (error) {
      console.error(`Falha ao atribuir cargo de divisão a ${member.id}:`, error);
    }
  }
}

async function resolvePlayerOffer(i, offer, action) {
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
      if (current.price < playerValue(current.player)) {
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
      const marketListing = db.prepare(
        "SELECT id FROM market_listings WHERE user_id = ? AND status = 'available'"
      ).get(current.player);
      if (marketListing) {
        db.prepare(
          "UPDATE market_listings SET status = 'signed', resolved_at = ? WHERE id = ? AND status = 'available'"
        ).run(n(), marketListing.id);
      }

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

      return {
        buyer: db.prepare('SELECT * FROM teams WHERE id = ?')
          .get(current.dst),
        marketListingId: marketListing?.id ?? null
      };
    });

    const result = transfer();
    const buyer = result.buyer;
    await i.update({
      content: `Transferência concluída: você agora faz parte de **${teamDisplayName(buyer)} (${buyer.acronym})** e recebeu ${cash(offer.price)}.`,
      embeds: [],
      components: []
    });
    if (result.marketListingId) {
      await closeMarketListing(result.marketListingId, buyer);
    }
    return;
  } catch (error) {
    if (['INSUFFICIENT_FUNDS', 'PLAYER_TEAM_CHANGED', 'OFFER_BELOW_MINIMUM'].includes(error.message)) {
      db.prepare(
        "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, offer.id);
      const messages = {
        INSUFFICIENT_FUNDS: 'A oferta foi cancelada: o time comprador não tem mais saldo suficiente.',
        PLAYER_TEAM_CHANGED: 'A oferta foi cancelada: sua equipe mudou desde o envio.',
        OFFER_BELOW_MINIMUM: 'A oferta foi cancelada: o valor está abaixo do valor de mercado atual do jogador.'
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

async function resolveCallup(i, offer, action) {
  if (i.user.id !== offer.player) {
    return err(i, 'Somente o jogador convocado pode responder.');
  }

  if (offer.expires <= n()) {
    db.prepare(
      "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    return i.update({
      content: 'Esta convocação expirou.',
      embeds: [],
      components: []
    });
  }

  if (action === 'no') {
    const declined = db.prepare(
      "UPDATE offers SET status = 'declined', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    if (declined.changes === 0) {
      return err(i, 'Esta convocação já foi respondida.');
    }
    return i.update({
      content: 'Convocação recusada. Nenhuma alteração foi feita no elenco.',
      embeds: [],
      components: []
    });
  }

  if (action !== 'yes') return err(i, 'Ação de convocação inválida.');

  const currentOffer = db.prepare(
    "SELECT * FROM offers WHERE id = ? AND kind = 'callup' AND status = 'pending' AND expires > ?"
  ).get(offer.id, n());
  if (!currentOffer) {
    db.prepare(
      "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    return i.update({
      content: 'Esta convocação expirou ou já foi respondida.',
      embeds: [],
      components: []
    });
  }

  const nationalTeam = db.prepare(
    "SELECT * FROM teams WHERE id = ? AND owner LIKE 'national:%'"
  ).get(currentOffer.dst);
  if (!nationalTeam) {
    db.prepare(
      "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    return i.update({
      content: 'A seleção desta convocação não está mais cadastrada.',
      embeds: [],
      components: []
    });
  }
  if (db.prepare(
    'SELECT 1 FROM national_roster WHERE team_id = ? AND player_id = ?'
  ).get(currentOffer.dst, currentOffer.player)) {
    db.prepare(
      "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    return i.update({
      content: 'Você já faz parte do elenco desta seleção.',
      embeds: [],
      components: []
    });
  }

  let guild;
  let member;
  let callupRole;
  let hadCallupRole = false;
  try {
    guild = await client.guilds.fetch(process.env.GUILD_ID);
    member = await guild.members.fetch(i.user.id);
    await teamRoles(guild, nationalTeam);
    await guild.roles.fetch();
    const roleName = `${nationalTeam.acronym} | Jogador`;
    callupRole = guild.roles.cache.find(role => role.name === roleName);
    if (!callupRole) {
      callupRole = await guild.roles.create({
        name: roleName,
        permissions: [],
        reason: 'Cargo atribuído após aceite de convocação PFL'
      });
    }
    hadCallupRole = member.roles.cache.has(callupRole.id);
    await member.roles.add(callupRole);
  } catch (error) {
    console.error(`Não consegui preparar os cargos da convocação #${offer.id}:`, error);
    return i.update({
      content: 'Não consegui preparar seu cargo de convocado. A convocação continua pendente; avise um administrador para conferir Manage Roles e a posição do cargo do bot.',
      embeds: [],
      components: []
    });
  }

  const result = db.transaction(() => {
    const current = db.prepare(
      "SELECT * FROM offers WHERE id = ? AND kind = 'callup' AND status = 'pending' AND expires > ?"
    ).get(offer.id, n());
    if (!current) return { error: 'expired' };
    const alreadyCalledNow = db.prepare(
      'SELECT 1 FROM national_roster WHERE team_id = ? AND player_id = ?'
    ).get(current.dst, current.player);
    if (alreadyCalledNow) {
      db.prepare(
        "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, current.id);
      return { error: 'already_called' };
    }

    const accepted = db.prepare(
      "UPDATE offers SET status = 'accepted', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending' AND expires > ?"
    ).run(n(), i.user.id, current.id, n());
    if (accepted.changes === 0) return { error: 'expired' };

    db.prepare(
      'INSERT INTO national_roster (team_id, player_id, callup_id, joined_at) VALUES (?, ?, ?, ?)'
    ).run(current.dst, current.player, current.id, n());
    return { nationalTeam };
  })();

  if (result.error) {
    if (!hadCallupRole) {
      await member.roles.remove(callupRole).catch(error =>
        console.error('Falha ao reverter o cargo de convocado após erro no registro:', error)
      );
    }
    if (result.error === 'expired') {
      db.prepare(
        "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, offer.id);
      return i.update({
        content: 'Esta convocação expirou ou já foi respondida.',
        embeds: [],
        components: []
      });
    }
    return i.update({
      content: 'Você já faz parte do elenco desta seleção.',
      embeds: [],
      components: []
    });
  }

  let registrationSent = true;
  try {
    const registrationChannel = await client.channels.fetch(ch.logs);
    if (!registrationChannel?.isTextBased()) {
      throw new Error(`Canal de registros ${ch.logs} não encontrado ou não é textual.`);
    }
    const registration = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle('📜 Convocação oficial confirmada')
      .setDescription(
        `Uma nova convocação foi aceita e registrada no elenco oficial de **${result.nationalTeam.name}**.`
      )
      .addFields(
        { name: '🌍 Seleção', value: `${result.nationalTeam.name} (${result.nationalTeam.acronym})`, inline: true },
        { name: '⚽ Convocado', value: `<@${currentOffer.player}>`, inline: true },
        { name: '👑 Presidente', value: `<@${currentOffer.created_by}>`, inline: true },
        { name: '🪪 Cargo', value: `\`${result.nationalTeam.acronym} | Jogador\``, inline: true },
        { name: '📋 Registro', value: `Convocação #${currentOffer.id}`, inline: true }
      )
      .setFooter({ text: 'PFL Matchmaker • Registro oficial de convocações' })
      .setTimestamp();
    await registrationChannel.send({
      embeds: [registration],
      allowedMentions: { users: [currentOffer.player, currentOffer.created_by] }
    });
  } catch (error) {
    registrationSent = false;
    console.error(`Convocação #${currentOffer.id} aceita, mas o registro no canal falhou:`, error);
  }
  return i.update({
    content: registrationSent
      ? `✅ Convocação aceita! Você recebeu o cargo **${result.nationalTeam.acronym} | Jogador** e já faz parte do elenco oficial de **${result.nationalTeam.name}**. O registro especial foi publicado no canal de registros.`
      : `✅ Convocação aceita e cargo **${result.nationalTeam.acronym} | Jogador** atribuído. O registro do elenco foi salvo, mas não consegui publicar no canal de registros; avise um administrador.`,
    embeds: [],
    components: []
  });
}

async function playerTeamFromRoles(guild, userId) {
  await guild.roles.fetch();
  const member = await guild.members.fetch(userId);
  const matchingTeams = new Map();
  for (const role of member.roles.cache.values()) {
    const match = role.name.match(/^([A-Z]{3,4}) \| Jogador$/i);
    const currentTeam = match ? team(match[1]) : null;
    if (currentTeam && !currentTeam.owner.startsWith('national:')) {
      matchingTeams.set(currentTeam.id, currentTeam);
    }
  }
  if (matchingTeams.size > 1) throw new Error('PLAYER_MULTIPLE_TEAM_ROLES');
  return matchingTeams.values().next().value ?? null;
}

async function syncProposalRole(userId, teamAcronym, kind) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.roles.fetch();
  const member = await guild.members.fetch(userId);
  const roleLabel = kind === 'manager' ? 'Gerente' : 'Jogador';
  const targetRole = guild.roles.cache.find(
    role => role.name === `${teamAcronym} | ${roleLabel}`
  );
  if (!targetRole) throw new Error('PROPOSAL_ROLE_MISSING');

  const oldRoles = member.roles.cache.filter(role => {
    const match = role.name.match(/^[A-Z]{3,4} \| (Gerente|Jogador)$/i);
    const oldTeam = match ? team(role.name.split(' | ')[0]) : null;
    return match && match[1].toLowerCase() === roleLabel.toLowerCase() &&
      oldTeam && !oldTeam.owner.startsWith('national:');
  });
  const state = {
    member,
    oldRoles: [...oldRoles.values()],
    targetRole,
    roleLabel
  };

  try {
    if (oldRoles.size) await member.roles.remove(oldRoles);
    await member.roles.add(targetRole);
    return state;
  } catch (error) {
    await restoreProposalPlayerRoles(state).catch(() => {});
    throw error;
  }
}

async function restoreProposalPlayerRoles(state) {
  const current = state.member.roles.cache.filter(role =>
    role.name.endsWith(` | ${state.roleLabel}`)
  );
  if (current.size) await state.member.roles.remove(current);
  if (state.oldRoles.length) await state.member.roles.add(state.oldRoles);
}

async function teamHasManager(guild, currentTeam, exceptUserId = null) {
  const registered = db.prepare(
    "SELECT 1 FROM members WHERE team_id = ? AND kind = 'manager' AND user_id != ? LIMIT 1"
  ).get(currentTeam.id, exceptUserId || '');
  if (registered) return true;

  await guild.roles.fetch();
  await guild.members.fetch();
  const role = guild.roles.cache.find(
    candidate => candidate.name === `${currentTeam.acronym} | Gerente`
  );
  return Boolean(role && [...role.members.keys()].some(id => id !== exceptUserId));
}

async function resolveProposal(i, offer, action) {
  if (i.user.id !== offer.player) {
    return err(i, 'Somente o jogador que recebeu esta proposta pode responder.');
  }

  if (offer.expires <= n()) {
    db.prepare(
      "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    return i.update({ content: 'Esta proposta expirou.', embeds: [], components: [] });
  }

  if (action === 'no') {
    const declined = db.prepare(
      "UPDATE offers SET status = 'declined', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
    ).run(n(), i.user.id, offer.id);
    if (declined.changes === 0) return err(i, 'Esta proposta já foi respondida.');
    return i.update({ content: 'Proposta recusada. Nenhum saldo foi movimentado.', embeds: [], components: [] });
  }

  if (action !== 'yes') return err(i, 'Ação de proposta inválida.');

  if (proposalLocks.has(offer.id)) {
    return err(i, 'Esta proposta já está sendo processada.');
  }

  proposalLocks.add(offer.id);
  const update = payload => i.editReply(payload);
  let roleState;
  try {
    await i.deferUpdate();
    const beforeTransfer = db.prepare(
      "SELECT * FROM offers WHERE id = ? AND kind = 'proposal' AND status = 'pending'"
    ).get(offer.id);
    if (!beforeTransfer || beforeTransfer.expires <= n()) throw new Error('PROPOSAL_EXPIRED');
    if (beforeTransfer.price < playerValue(beforeTransfer.player)) throw new Error('PLAYER_VALUE_CHANGED');

    const playerGuild = await client.guilds.fetch(process.env.GUILD_ID);
    const targetRoleKind = beforeTransfer.target_role === 'manager' ? 'manager' : 'player';
    const roleTeam = targetRoleKind === 'player'
      ? await playerTeamFromRoles(playerGuild, beforeTransfer.player)
      : null;
    const targetTeam = db.prepare(
      'SELECT * FROM teams WHERE id = ?'
    ).get(beforeTransfer.dst);
    if (!targetTeam) throw new Error('PROPOSAL_TEAM_MISSING');

    const currentTeam = db.prepare(
      "SELECT team_id FROM members WHERE user_id = ? AND kind = ? LIMIT 1"
    ).get(beforeTransfer.player, targetRoleKind);
    const effectiveTeamId = roleTeam?.id ?? null;
    if (targetRoleKind === 'player' && effectiveTeamId !== beforeTransfer.src) {
      throw new Error('PLAYER_TEAM_CHANGED');
    }
    if ((targetRoleKind === 'player' && effectiveTeamId === beforeTransfer.dst) ||
        (targetRoleKind === 'manager' && currentTeam?.team_id === beforeTransfer.dst)) {
      throw new Error('PLAYER_ALREADY_ON_TEAM');
    }
    if (targetRoleKind === 'manager' &&
        await teamHasManager(playerGuild, targetTeam, beforeTransfer.player)) {
      throw new Error('TEAM_ALREADY_HAS_MANAGER');
    }
    const databaseTeamId = currentTeam?.team_id ?? null;

    try {
      roleState = await syncProposalRole(i.user.id, targetTeam.acronym, targetRoleKind);
    } catch (error) {
      console.error('Falha ao atualizar cargos na proposta:', error);
      return update({
        content: 'Não consegui atualizar seus cargos do time. A proposta continua sem movimentar saldo; confira se você está no servidor e tente novamente.'
      });
    }

    const complete = db.transaction(() => {
      const current = db.prepare(
        "SELECT * FROM offers WHERE id = ? AND kind = 'proposal' AND status = 'pending'"
      ).get(offer.id);
      if (!current || current.expires <= n()) throw new Error('PROPOSAL_EXPIRED');
      if (current.price < playerValue(current.player)) throw new Error('PLAYER_VALUE_CHANGED');

      const currentPlayerTeam = db.prepare(
        "SELECT team_id FROM members WHERE user_id = ? AND kind = ? LIMIT 1"
      ).get(current.player, targetRoleKind);
      if ((currentPlayerTeam?.team_id ?? null) !== databaseTeamId) {
        throw new Error('PLAYER_TEAM_CHANGED');
      }
      if (targetRoleKind === 'manager' &&
          db.prepare(
            "SELECT 1 FROM members WHERE team_id = ? AND kind = 'manager' AND user_id != ? LIMIT 1"
          ).get(current.dst, current.player)) {
        throw new Error('TEAM_ALREADY_HAS_MANAGER');
      }

      ensure(current.created_by);
      ensure(current.player);
      const accepted = db.prepare(
        "UPDATE offers SET status = 'accepted', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending' AND expires > ?"
      ).run(n(), i.user.id, current.id, n());
      if (accepted.changes === 0) throw new Error('PROPOSAL_EXPIRED');

      const debit = db.prepare(
        'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?'
      ).run(current.price, current.created_by, current.price);
      if (debit.changes === 0) throw new Error('INSUFFICIENT_FUNDS');

      db.prepare(
        'UPDATE users SET balance = balance + ? WHERE id = ?'
      ).run(current.price, current.player);
      if (targetRoleKind === 'player') {
        db.prepare(
          "DELETE FROM members WHERE user_id = ? AND kind = 'player'"
        ).run(current.player);
      } else {
        db.prepare(
          "DELETE FROM members WHERE user_id = ? AND kind = 'manager'"
        ).run(current.player);
      }
      db.prepare(
        'INSERT INTO members (team_id, user_id, kind) VALUES (?, ?, ?)'
      ).run(current.dst, current.player, targetRoleKind);
      const marketListing = db.prepare(
        "SELECT id FROM market_listings WHERE user_id = ? AND status = 'available'"
      ).get(current.player);
      if (marketListing) {
        db.prepare(
          "UPDATE market_listings SET status = 'signed', resolved_at = ? WHERE id = ? AND status = 'available'"
        ).run(n(), marketListing.id);
      }
      db.prepare(
        'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
      ).run(current.created_by, -current.price, `Proposta aceita por ${current.player}`, `proposal:${current.id}:out`, n());
      db.prepare(
        'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
      ).run(current.player, current.price, 'Recebimento de proposta', `proposal:${current.id}:in`, n());

      return {
        ...db.prepare('SELECT name, acronym FROM teams WHERE id = ?').get(current.dst),
        targetRoleKind,
        marketListingId: marketListing?.id ?? null
      };
    });

    const acceptedTeam = complete();
    roleState = null;
    if (acceptedTeam.marketListingId) {
      await closeMarketListing(acceptedTeam.marketListingId, acceptedTeam);
    }
    try {
      const registrationChannel = await client.channels.fetch(ch.logs);
      if (!registrationChannel?.isTextBased()) {
        throw new Error(`Canal de registros ${ch.logs} não encontrado ou não é textual.`);
      }
      const registration = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('Transferência registrada')
        .setDescription(
          `<@${offer.player}> foi contratado como ${acceptedTeam.targetRoleKind === 'manager' ? 'gerente' : 'jogador'} por **${acceptedTeam.name} (${acceptedTeam.acronym})** por **${cash(offer.price)}**.`
        )
        .addFields(
          { name: 'Contratado', value: `<@${offer.player}>`, inline: true },
          { name: 'Time', value: `${acceptedTeam.name} (${acceptedTeam.acronym})`, inline: true },
          { name: 'Função', value: acceptedTeam.targetRoleKind === 'manager' ? 'Gerente' : 'Jogador', inline: true },
          { name: 'Valor', value: cash(offer.price), inline: true }
        )
        .setTimestamp();
      await registrationChannel.send({ embeds: [registration] });
    } catch (error) {
      console.error('Não foi possível publicar o registro da transferência:', error);
    }
    return update({
      content: `Proposta aceita. Você recebeu ${cash(offer.price)} e agora está no time **${acceptedTeam.name} (${acceptedTeam.acronym})** como ${acceptedTeam.targetRoleKind === 'manager' ? 'gerente' : 'jogador'}.`,
      embeds: [],
      components: []
    });
  } catch (error) {
    const failures = {
      INSUFFICIENT_FUNDS: 'Proposta cancelada: quem enviou não tem mais saldo suficiente.',
      PLAYER_VALUE_CHANGED: 'Proposta cancelada: o valor mínimo atual do jogador aumentou.',
      PLAYER_TEAM_CHANGED: 'Proposta cancelada: a equipe do jogador mudou desde o envio.',
      PLAYER_ALREADY_ON_TEAM: 'Proposta cancelada: o jogador já pertence a esse time.',
      TEAM_ALREADY_HAS_MANAGER: 'Proposta cancelada: esse time já tem gerente. O dono pode liberar a vaga com `/vender` e enviar uma nova proposta.',
      PROPOSAL_TEAM_MISSING: 'Proposta cancelada: o time informado não existe mais.',
      PLAYER_MULTIPLE_TEAM_ROLES: 'Proposta cancelada: você tem cargos de jogador de mais de um time. Corrija seus cargos e solicite uma nova proposta.'
    };
    if (failures[error.message]) {
      if (roleState) await restoreProposalPlayerRoles(roleState).catch(console.error);
      db.prepare(
        "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, offer.id);
      return update({ content: failures[error.message], embeds: [], components: [] });
    }
    if (error.message === 'PROPOSAL_EXPIRED') {
      if (roleState) await restoreProposalPlayerRoles(roleState).catch(console.error);
      db.prepare(
        "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
      ).run(n(), i.user.id, offer.id);
      return update({ content: 'Esta proposta expirou ou já foi respondida.', embeds: [], components: [] });
    }
    if (roleState) await restoreProposalPlayerRoles(roleState).catch(console.error);
    throw error;
  } finally {
    proposalLocks.delete(offer.id);
  }
}

client.once(Events.ClientReady, c => {
  console.log('Bot conectado: ' + c.user.tag);
  syncGuildDivisionRoles(c.guilds.cache.get(process.env.GUILD_ID))
    .catch(error => console.error('Falha ao sincronizar os cargos de divisão do servidor:', error));
  publishProfileUpdates().catch(error =>
    console.error('Falha ao publicar atualizações de perfil pendentes:', error)
  );
  const profileUpdateTimer = setInterval(() => {
    publishProfileUpdates().catch(error =>
      console.error('Falha ao publicar atualizações de perfil pendentes:', error)
    );
  }, 10_000);
  profileUpdateTimer.unref();
  try {
    const count = runAutomaticSalaries();
    if (count > 0) console.log(`Salários automáticos pagos para ${count} jogador(es).`);
  } catch (error) {
    console.error('Falha ao processar salários automáticos:', error);
  }
  const salaryTimer = setInterval(() => {
    try {
      const count = runAutomaticSalaries();
      if (count > 0) console.log(`Salários automáticos pagos para ${count} jogador(es).`);
    } catch (error) {
      console.error('Falha ao processar salários automáticos:', error);
    }
  }, 60_000);
  salaryTimer.unref();
});

client.on(Events.GuildMemberUpdate, (_before, after) => {
  invalidateDivisionAutocompleteCache(after.guild.id);
  if (!hasGenericPlayerRole(_before) && hasGenericPlayerRole(after)) {
    announceNewFreeAgent(after).catch(error =>
      console.error(`Falha ao anunciar o jogador recém-registrado ${after.id}:`, error)
    );
  }
});

client.on(Events.GuildMemberRemove, member => {
  invalidateDivisionAutocompleteCache(member.guild.id);
  try {
    db.transaction(() => {
      const ownedTeams = db.prepare(
        'SELECT * FROM teams WHERE owner = ? OR claimed_by = ?'
      ).all(member.id, member.id).filter(currentTeam => teamCategory(currentTeam));
      for (const currentTeam of ownedTeams) {
        if (currentTeam.owner.startsWith('national:')) {
          db.prepare(
            'UPDATE teams SET claimed_by = NULL WHERE id = ? AND claimed_by = ?'
          ).run(currentTeam.id, member.id);
          db.prepare(
            'DELETE FROM national_presidents WHERE team_id = ?'
          ).run(currentTeam.id);
          db.prepare(
            'DELETE FROM national_roster WHERE team_id = ?'
          ).run(currentTeam.id);
          db.prepare(
            "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = 'system' WHERE kind = 'callup' AND dst = ? AND status = 'pending'"
          ).run(n(), currentTeam.id);
        } else {
          const placeholder = teamCategory(currentTeam) === 'champions'
            ? `champions:${currentTeam.acronym.toLowerCase()}`
            : `brazil:${currentTeam.acronym.toLowerCase()}`;
          db.prepare(
            'UPDATE teams SET owner = ? WHERE id = ? AND owner = ?'
          ).run(placeholder, currentTeam.id, member.id);
        }
      }
      db.prepare('DELETE FROM members WHERE user_id = ?').run(member.id);
      db.prepare('DELETE FROM national_roster WHERE player_id = ?').run(member.id);
    })();
  } catch (error) {
    console.error(`Falha ao remover os vínculos do membro que saiu ${member.id}:`, error);
  }
});

client.on(Events.GuildMemberAdd, member => {
  if (member.guild.id !== process.env.GUILD_ID) return;
  invalidateDivisionAutocompleteCache(member.guild.id);
  ensure(member.id);
  syncDivisionRole(member.guild, member.id, playerValue(member.id)).catch(error =>
    console.error(`Falha ao atribuir cargo de divisão ao novo membro ${member.id}:`, error)
  );
  announceNewFreeAgent(member).catch(error =>
    console.error(`Falha ao anunciar o novo jogador ${member.id}:`, error)
  );
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  try {
    db.transaction(() => {
      ensure(message.author.id);
      db.prepare(
        'INSERT OR IGNORE INTO message_progress (user_id) VALUES (?)'
      ).run(message.author.id);
      const progress = db.prepare(
        'SELECT count, last_message_id FROM message_progress WHERE user_id = ?'
      ).get(message.author.id);
      if (progress.last_message_id &&
          BigInt(message.id) <= BigInt(progress.last_message_id)) return;

      let amount = 0;
      let reason;

      if (messageRewardChannels.has(message.channelId)) {
        amount = 1000;
        reason = 'Recompensa por mensagem em canal de atividade';
      } else {
        const count = progress.count + 1;
        if (count >= MESSAGE_REWARD_INTERVAL) {
          amount = MESSAGE_REWARD_AMOUNT;
          reason = `Recompensa por ${MESSAGE_REWARD_INTERVAL} mensagens no servidor`;
        }
        db.prepare(
          'UPDATE message_progress SET count = ?, last_message_id = ? WHERE user_id = ?'
        ).run(
          count >= MESSAGE_REWARD_INTERVAL
            ? count - MESSAGE_REWARD_INTERVAL
            : count,
          message.id,
          message.author.id
        );
      }

      if (messageRewardChannels.has(message.channelId)) {
        db.prepare(
          'UPDATE message_progress SET last_message_id = ? WHERE user_id = ?'
        ).run(message.id, message.author.id);
      }

      if (amount > 0) {
        db.prepare(
          'UPDATE users SET balance = balance + ? WHERE id = ?'
        ).run(amount, message.author.id);
        db.prepare(
          'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
        ).run(
          message.author.id,
          amount,
          reason,
          `message-reward:${message.id}`,
          n()
        );
      }
    })();
  } catch (error) {
    console.error(`Falha ao processar recompensa da mensagem ${message.id}:`, error);
  }
});

function centralAdminModal(action, title, fields) {
  const modal = new ModalBuilder()
    .setCustomId(`central:submit:${action}`)
    .setTitle(title);
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false)
      .setMaxLength(field.maxLength || 100);
    if (field.placeholder) input.setPlaceholder(field.placeholder);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function centralValue(i, id) {
  return i.fields.getTextInputValue(id).trim();
}

function centralUserId(value) {
  return String(value || '').trim().match(/^<@!?(\d{17,20})>$/)?.[1] ||
    (/^\d{17,20}$/.test(String(value || '').trim())
      ? String(value).trim()
      : null);
}

function parseCentralMoney(value) {
  const match = String(value || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*([kmbt]?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  if (!match[2]) return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  return parseScaledMoney(amount, match[2].toLowerCase());
}

function centralSelectPayload(title, description, customId, options) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Selecione um registro')
    .addOptions(options.slice(0, 25));
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(title)
        .setDescription(description)
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  };
}

function centralTeamEmbed(currentTeam) {
  const ownerId = teamOwnerId(currentTeam) ||
    db.prepare('SELECT president_id FROM national_presidents WHERE team_id = ?')
      .get(currentTeam.id)?.president_id;
  const manager = db.prepare(
    "SELECT user_id FROM members WHERE team_id = ? AND kind = 'manager' LIMIT 1"
  ).get(currentTeam.id);
  const playerCount = db.prepare(
    "SELECT COUNT(*) AS count FROM members WHERE team_id = ? AND kind = 'player'"
  ).get(currentTeam.id).count;
  const nationalPlayerCount = db.prepare(
    'SELECT COUNT(*) AS count FROM national_roster WHERE team_id = ?'
  ).get(currentTeam.id).count;
  const stadiums = db.prepare(
    'SELECT tier, price FROM stadiums WHERE team_id = ? ORDER BY tier'
  ).all(currentTeam.id);
  const stadiumDescription = stadiums.length
    ? stadiums.map(stadium => {
      const option = stadiumOptions.find(item => item.tier === stadium.tier);
      return `${option?.name || `Estádio ${stadium.tier}`} — ${cash(stadium.price)}`;
    }).join('\n')
    : 'Nenhum';
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🏟️ ${teamDisplayName(currentTeam)} (${currentTeam.acronym})`)
    .addFields(
      { name: '👑 Dono/Presidente', value: ownerId ? `<@${ownerId}>` : 'Não definido', inline: true },
      { name: '🧭 Gerente', value: manager ? `<@${manager.user_id}>` : 'Nenhum', inline: true },
      { name: '💰 Caixa do time', value: cash(currentTeam.balance), inline: true },
      { name: '⚽ Jogadores', value: String(playerCount + nationalPlayerCount), inline: true },
      { name: '🏟️ Estádio', value: stadiumDescription.slice(0, 1024), inline: false },
      { name: '📝 Descrição', value: currentTeam.description?.slice(0, 1024) || 'Sem descrição', inline: false }
    )
    .setTimestamp(currentTeam.created);
  if (currentTeam.crest) embed.setThumbnail(currentTeam.crest);
  return embed;
}

async function handleCentralAdminInteraction(i) {
  const id = i.customId || '';
  const commandBlockPage = async page => {
    try {
      const registered = await i.guild.commands.fetch();
      const commands = [...registered.values()]
        .filter(command =>
          command.type === ApplicationCommandType.ChatInput &&
          !ADMIN_ONLY_SLASH_COMMANDS.has(command.name)
        )
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      const pageSize = 25;
      const pageCount = Math.max(1, Math.ceil(commands.length / pageSize));
      const currentPage = Math.max(0, Math.min(page, pageCount - 1));
      const pageCommands = commands.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
      const options = pageCommands.map(command => {
        const block = db.prepare(
          'SELECT 1 FROM command_blocks WHERE guild_id = ? AND command_name = ?'
        ).get(i.guildId, command.name);
        return new StringSelectMenuOptionBuilder()
          .setLabel(`/${command.name}${block ? ' • bloqueado' : ''}`.slice(0, 100))
          .setValue(command.name)
          .setDescription(block ? 'Bloqueado — selecione para editar ou desbloquear.' : 'Disponível — selecione para bloquear.');
      });
      const components = [];
      if (options.length) {
        components.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`central:command-block-select:${currentPage}`)
            .setPlaceholder('Selecione um comando')
            .addOptions(options)
        ));
      }
      if (pageCount > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`central:command-block-page:${currentPage - 1}`)
            .setLabel('Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId(`central:command-block-page:${currentPage + 1}`)
            .setLabel('Próxima')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= pageCount - 1)
        ));
      }
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('central:home')
          .setLabel('Voltar à Central')
          .setStyle(ButtonStyle.Secondary)
      ));
      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🚫 Bloquear comandos')
          .setDescription(
            commands.length
              ? `Selecione um slash command para bloquear, editar a mensagem ou desbloquear. Comandos exclusivos de administrador não aparecem nesta lista.\n\nPágina ${currentPage + 1}/${pageCount}.`
              : 'Não há slash commands públicos registrados neste servidor.'
          )],
        components
      });
    } catch (error) {
      console.error('Falha ao carregar os comandos da Central:', error);
      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🚫 Bloquear comandos')
          .setDescription('Não consegui carregar os slash commands do servidor. Confira as permissões do bot e tente novamente.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('central:home')
            .setLabel('Voltar à Central')
            .setStyle(ButtonStyle.Secondary)
        )]
      });
    }
  };

  if (id === 'central:command-blocks' && i.isButton()) {
    await commandBlockPage(0);
    return true;
  }

  if (id.startsWith('central:command-block-page:') && i.isButton()) {
    const page = Number(id.slice('central:command-block-page:'.length));
    if (!Number.isInteger(page) || page < 0) {
      await i.reply({ content: 'Página inválida.', ephemeral: true });
      return true;
    }
    await commandBlockPage(page);
    return true;
  }

  if (id.startsWith('central:command-block-select:') && i.isStringSelectMenu()) {
    const commandName = i.values[0];
    if (!commandName || ADMIN_ONLY_SLASH_COMMANDS.has(commandName)) {
      await i.reply({ content: 'Esse comando não pode ser bloqueado.', ephemeral: true });
      return true;
    }
    let command;
    try {
      const commands = await i.guild.commands.fetch();
      command = commands.find(candidate =>
        candidate.name === commandName &&
        candidate.type === ApplicationCommandType.ChatInput
      );
    } catch (error) {
      console.error('Falha ao validar o comando selecionado para bloqueio:', error);
      await i.reply({ content: 'Não consegui validar esse comando. Tente novamente.', ephemeral: true });
      return true;
    }
    if (!command) {
      await i.reply({ content: 'Esse slash command não está mais registrado no servidor.', ephemeral: true });
      return true;
    }
    const block = db.prepare(
      'SELECT description FROM command_blocks WHERE guild_id = ? AND command_name = ?'
    ).get(i.guildId, commandName);
    const description = block?.description
      ? `**Mensagem exibida:**\n${block.description}`
      : 'Nenhuma mensagem personalizada foi configurada.';
    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(block ? 0xe74c3c : 0x3498db)
        .setTitle(`/${commandName}`)
        .setDescription(`Status: **${block ? 'bloqueado' : 'disponível'}**\n\n${description}`)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`central:command-block-edit:${commandName}`)
            .setLabel(block ? 'Bloquear / editar mensagem' : 'Bloquear comando')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`central:command-block-unlock:${commandName}`)
            .setLabel('Desbloquear')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!block)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('central:command-blocks')
            .setLabel('Voltar aos comandos')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
    return true;
  }

  if (id.startsWith('central:command-block-edit:') && i.isButton()) {
    const commandName = id.slice('central:command-block-edit:'.length);
    if (ADMIN_ONLY_SLASH_COMMANDS.has(commandName)) {
      await i.reply({ content: 'Comandos exclusivos de administrador não podem ser bloqueados.', ephemeral: true });
      return true;
    }
    const commands = await i.guild.commands.fetch().catch(error => {
      console.error('Falha ao validar comando antes do bloqueio:', error);
      return null;
    });
    if (!commands?.some(command =>
      command.name === commandName &&
      command.type === ApplicationCommandType.ChatInput
    )) {
      await i.reply({ content: 'Esse slash command não está mais registrado no servidor.', ephemeral: true });
      return true;
    }
    await i.showModal(centralAdminModal(`command-block-save:${commandName}`, 'Bloquear comando', [
      {
        id: 'description',
        label: 'Mensagem opcional para os membros',
        placeholder: 'Deixe vazio para usar a mensagem padrão',
        paragraph: true,
        required: false,
        maxLength: 1000
      }
    ]));
    return true;
  }

  if (id.startsWith('central:command-block-unlock:') && i.isButton()) {
    const commandName = id.slice('central:command-block-unlock:'.length);
    if (ADMIN_ONLY_SLASH_COMMANDS.has(commandName)) {
      await i.reply({ content: 'Comandos exclusivos de administrador não podem ser bloqueados.', ephemeral: true });
      return true;
    }
    const removed = db.prepare(
      'DELETE FROM command_blocks WHERE guild_id = ? AND command_name = ?'
    ).run(i.guildId, commandName);
    if (!removed.changes) {
      await i.reply({ content: `/${commandName} já estava desbloqueado.`, ephemeral: true });
      return true;
    }
    await i.update({
      embeds: [new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('Comando desbloqueado')
        .setDescription(`/${commandName} está disponível novamente para os membros.`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('central:command-blocks')
          .setLabel('Voltar aos comandos')
          .setStyle(ButtonStyle.Secondary)
      )]
    });
    return true;
  }

  if (id.startsWith('central:submit:command-block-save:') && i.isModalSubmit()) {
    const commandName = id.slice('central:submit:command-block-save:'.length);
    const description = i.fields.getTextInputValue('description').trim();
    if (ADMIN_ONLY_SLASH_COMMANDS.has(commandName)) {
      await i.reply({ content: 'Comandos exclusivos de administrador não podem ser bloqueados.', ephemeral: true });
      return true;
    }
    let commands;
    try {
      commands = await i.guild.commands.fetch();
    } catch (error) {
      console.error('Falha ao validar comando durante bloqueio:', error);
      await i.reply({ content: 'Não consegui validar o slash command. Nenhuma alteração foi feita.', ephemeral: true });
      return true;
    }
    if (!commands.some(command =>
      command.name === commandName &&
      command.type === ApplicationCommandType.ChatInput
    )) {
      await i.reply({ content: 'Esse slash command não está mais registrado. Nenhuma alteração foi feita.', ephemeral: true });
      return true;
    }
    db.prepare(`
      INSERT INTO command_blocks (guild_id, command_name, description, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, command_name) DO UPDATE SET
        description = excluded.description,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(i.guildId, commandName, description, i.user.id, n());
    await i.reply({
      content: `✅ /${commandName} foi bloqueado.${description ? ' A mensagem personalizada será exibida aos membros.' : ' Os membros verão a mensagem padrão.'}`,
      ephemeral: true
    });
    return true;
  }

  const prompt = (title, description, components) => ({
    embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(title).setDescription(description)],
    components
  });
  const makeUserPicker = (customId, placeholder = 'Pesquise e selecione um membro') =>
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(1)
    );
  const teamSelectPayload = (action, category = 'all', page = 0, teamA = 'none') => {
    const teams = db.prepare('SELECT * FROM teams ORDER BY name COLLATE NOCASE')
      .all()
      .filter(currentTeam =>
        (category === 'all' || teamCategory(currentTeam) === category) &&
        (!['roster', 'money-team', 'payroll-team'].includes(action) ||
          !currentTeam.owner.startsWith('national:'))
      );
    const pageSize = 25;
    const pageCount = Math.max(1, Math.ceil(teams.length / pageSize));
    const currentPage = Math.max(0, Math.min(page, pageCount - 1));
    const options = teams.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
      .map(currentTeam => new StringSelectMenuOptionBuilder()
        .setLabel(`${currentTeam.acronym} | ${teamDisplayName(currentTeam)}`.slice(0, 100))
        .setValue(String(currentTeam.id)));
    const components = [];
    if (options.length) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`central:pick:team:${action}:${category}:${teamA}:${currentPage}`)
          .setPlaceholder('Selecione um time')
          .addOptions(options)
      ));
    }
    if (pageCount > 1) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`central:page:team:${action}:${category}:${teamA}:${currentPage - 1}`)
          .setLabel('Anterior')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`central:page:team:${action}:${category}:${teamA}:${currentPage + 1}`)
          .setLabel('Próxima')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage >= pageCount - 1)
      ));
    }
    return {
      ...prompt('Selecione um time', 'Use o menu abaixo; a lista é navegável quando há mais de 25 times.', components)
    };
  };
  const matchResultPayload = page => {
    const total = db.prepare(
      "SELECT COUNT(*) AS count FROM matches WHERE type = 'ofc' AND status = 'pending'"
    ).get().count;
    const pageSize = 25;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.max(0, Math.min(page, pageCount - 1));
    const matches = db.prepare(`
      SELECT m.id, m.competition, a.name AS name_a, b.name AS name_b
      FROM matches m JOIN teams a ON a.id = m.a JOIN teams b ON b.id = m.b
      WHERE m.type = 'ofc' AND m.status = 'pending'
      ORDER BY m.created DESC, m.id DESC LIMIT ? OFFSET ?
    `).all(pageSize, currentPage * pageSize);
    const components = [];
    if (matches.length) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('central:pick:match-result')
          .setPlaceholder('Selecione uma partida pendente')
          .addOptions(matches.map(match => new StringSelectMenuOptionBuilder()
            .setLabel(`#${match.id} • ${match.name_a} x ${match.name_b}`.slice(0, 100))
            .setDescription(String(match.competition || 'Partida OFC').slice(0, 100))
            .setValue(String(match.id))))
      ));
    }
    if (pageCount > 1) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`central:page:match-result:${currentPage - 1}`)
          .setLabel('Anterior')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`central:page:match-result:${currentPage + 1}`)
          .setLabel('Próxima')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage >= pageCount - 1)
      ));
    }
    return prompt(
      'Registrar resultado OFC',
      total
        ? `Selecione uma partida pendente. Página ${currentPage + 1}/${pageCount}.`
        : 'Não há partidas OFC pendentes.',
      components
    );
  };
  const chooseEntityPayload = (title, action) => ({
    ...prompt(title, 'Escolha o tipo de destino para continuar.', [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`central:pick:entity:${action}`)
          .setPlaceholder('Escolha jogador ou time')
          .addOptions(
            { label: 'Jogador', value: 'user' },
            { label: 'Time', value: 'team' }
          )
      )
    ])
  });
  const textChoicePayload = (title, description, customId, options) => ({
    ...prompt(title, description, [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Selecione uma opção').addOptions(options)
      )
    ])
  });
  const clearCategoryLabel = category => ({
    brasileirao: 'Brasileirão',
    champions: 'Champions League',
    'copa-do-mundo': 'Copa do Mundo / Seleções',
    libertadores: 'Libertadores'
  }[category] || category);
  const clearTypePayload = category => textChoicePayload(
    `Limpar • ${clearCategoryLabel(category)}`,
    'Escolha o que deseja remover. Depois selecione um jogo ou chaveamento específico.',
    `central:pick:match-clear-type:${category}`,
    [
      { label: 'Jogo / partida', value: 'match' },
      { label: 'Chaveamento', value: 'bracket' }
    ]
  );
  const clearItemsPayload = (category, itemKind, page = 0) => {
    const pageSize = 25;
    const components = [];
    let rows = [];
    let total = 0;
    let currentPage = 0;
    let pageCount = 1;
    const bracketCategory = category === 'copa-do-mundo' ? 'selecao' : category;
    if (itemKind === 'match') {
      if (category !== 'libertadores') {
        const filter = matchCategoryPredicate(category);
        total = db.prepare(
          `SELECT COUNT(*) AS count FROM matches m WHERE ${filter.sql}`
        ).get(...filter.params).count;
        pageCount = Math.max(1, Math.ceil(total / pageSize));
        currentPage = Math.min(Math.max(0, page), pageCount - 1);
        rows = db.prepare(
          `SELECT m.id, m.competition, m.status, a.name AS team_a_name, b.name AS team_b_name
           FROM matches m
           LEFT JOIN teams a ON a.id = m.a
           LEFT JOIN teams b ON b.id = m.b
           WHERE ${filter.sql}
           ORDER BY m.created DESC, m.id DESC
           LIMIT ? OFFSET ?`
        ).all(...filter.params, pageSize, currentPage * pageSize);
      }
      if (rows.length) {
        components.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`central:pick:match-clear-item:${category}:match:${currentPage}`)
            .setPlaceholder('Selecione o jogo que deseja limpar')
            .addOptions(rows.map(match => new StringSelectMenuOptionBuilder()
              .setLabel(`#${match.id} • ${match.team_a_name || 'Time removido'} x ${match.team_b_name || 'Time removido'}`.slice(0, 100))
              .setDescription(`${match.competition || 'Partida'} • ${match.status || 'sem status'}`.slice(0, 100))
              .setValue(String(match.id))))
        ));
      }
      if (pageCount > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`central:page:match-clear-item:${category}:match:${currentPage - 1}`)
            .setLabel('Jogos anteriores')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId(`central:page:match-clear-item:${category}:match:${currentPage + 1}`)
            .setLabel('Mais jogos')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= pageCount - 1)
        ));
      }
    } else if (itemKind === 'bracket') {
      if (!['selecao', 'champions', 'brasileirao', 'libertadores'].includes(bracketCategory)) {
        return prompt('Categoria inválida', 'Escolha uma categoria disponível na Central.', []);
      }
      total = db.prepare(
        'SELECT COUNT(*) AS count FROM tournament_brackets WHERE guild_id = ? AND category = ?'
      ).get(i.guildId, bracketCategory).count;
      pageCount = Math.max(1, Math.ceil(total / pageSize));
      currentPage = Math.min(Math.max(0, page), pageCount - 1);
      rows = db.prepare(
        'SELECT id, updated_at, winners_json FROM tournament_brackets WHERE guild_id = ? AND category = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      ).all(i.guildId, bracketCategory, pageSize, currentPage * pageSize);
      if (rows.length) {
        components.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`central:pick:match-clear-item:${category}:bracket:${currentPage}`)
            .setPlaceholder('Selecione o chaveamento que deseja limpar')
            .addOptions(rows.map(bracket => new StringSelectMenuOptionBuilder()
              .setLabel(`#${bracket.id} • atualizado ${new Date(bracket.updated_at).toLocaleDateString('pt-BR')}`.slice(0, 100))
              .setDescription(`${Object.keys(JSON.parse(bracket.winners_json)).length} resultado(s) registrado(s)`)
              .setValue(String(bracket.id))))
        ));
      }
      if (pageCount > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`central:page:match-clear-item:${category}:bracket:${currentPage - 1}`)
            .setLabel('Chaveamentos anteriores')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId(`central:page:match-clear-item:${category}:bracket:${currentPage + 1}`)
            .setLabel('Mais chaveamentos')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= pageCount - 1)
        ));
      }
    } else {
      return prompt('Tipo inválido', 'Escolha jogo ou chaveamento e tente novamente.', []);
    }

    if (!total) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`central:pick:match-clear-type:${category}`)
          .setLabel('← Escolher jogo ou chaveamento')
          .setStyle(ButtonStyle.Secondary)
      ));
      return prompt(
        `Limpar • ${clearCategoryLabel(category)}`,
        itemKind === 'match'
          ? 'Não há jogos cadastrados nesta categoria.'
          : 'Não há chaveamentos salvos nesta categoria.',
        components
      );
    }
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`central:pick:match-clear-type:${category}`)
        .setLabel('← Escolher jogo ou chaveamento')
        .setStyle(ButtonStyle.Secondary)
    ));
    return prompt(
      `Limpar ${itemKind === 'match' ? 'jogo' : 'chaveamento'} • ${clearCategoryLabel(category)}`,
      itemKind === 'match'
        ? `Selecione uma partida para remover. ${total} jogo(s) nesta categoria${total > pageSize ? ` • Página ${currentPage + 1}/${Math.ceil(total / pageSize)}` : ''}.`
        : `Selecione um chaveamento. A embed publicada também será removida.${total > pageSize ? ` • Página ${currentPage + 1}/${Math.ceil(total / pageSize)}` : ''}`,
      components
    );
  };
  const financialAudit = async (targetKind, targetId) => {
    const currentTeam = targetKind === 'team'
      ? db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(targetId))
      : null;
    const userId = targetKind === 'user' ? targetId : null;
    if (!currentTeam && !userId) {
      await i.reply({ content: 'Não encontrei esse jogador ou time.', ephemeral: true });
      return;
    }
    if (userId) ensure(userId);
    const balance = currentTeam
      ? currentTeam.balance
      : db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)?.balance;
    const entries = currentTeam
      ? db.prepare('SELECT amount, reason, created FROM transactions WHERE team_id = ? ORDER BY created DESC, id DESC LIMIT 15').all(currentTeam.id)
      : db.prepare('SELECT amount, reason, created FROM transactions WHERE user_id = ? ORDER BY created DESC, id DESC LIMIT 15').all(userId);
    const description = entries.length
      ? entries.map(entry => `• <t:${Math.floor(entry.created / 1000)}:d> ${entry.amount >= 0 ? '+' : '−'}${cash(Math.abs(entry.amount))} — ${entry.reason}`).join('\n').slice(0, 3900)
      : 'Nenhuma movimentação registrada.';
    const label = currentTeam ? `${currentTeam.name} (${currentTeam.acronym})` : `<@${userId}>`;
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`🧾 Auditoria financeira — ${label}`)
        .setDescription(`**Saldo atual:** ${cash(balance)}\n\n${description}`)
        .setFooter({ text: 'Últimas 15 movimentações' })],
      ephemeral: true
    });
  };
  const showPayrollConfirmation = async target => {
    const label = target === 'all'
      ? 'todos os jogadores cadastrados'
      : target.startsWith('user:')
        ? `<@${target.slice('user:'.length)}>`
        : `jogadores de ${teamDisplayName(db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(target.slice('team:'.length))) || { name: 'time removido', acronym: '—' })}`;
    await i.update({
      ...prompt('Confirmar pagamento de salários', `Esta ação creditará o valor de mercado como salário para ${label}. Confirma?`, [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`central:payroll-confirm:${target}`).setLabel('Confirmar pagamento').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('central:home').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        )
      ])
    });
  };

  if (i.isButton() && id.startsWith('central:page:team:')) {
    const [, , , action, category, teamA, rawPage] = id.split(':');
    const page = Number(rawPage);
    if (!Number.isInteger(page) || page < 0) {
      await i.update(prompt('Seleção inválida', 'Não consegui abrir essa página.', []));
      return true;
    }
    await i.update(teamSelectPayload(action, category, page, teamA));
    return true;
  }

  if (i.isButton() && id.startsWith('central:page:match-result:')) {
    const page = Number(id.slice('central:page:match-result:'.length));
    if (!Number.isInteger(page) || page < 0) {
      await i.update(prompt('Seleção inválida', 'Não consegui abrir essa página.', []));
      return true;
    }
    await i.update(matchResultPayload(page));
    return true;
  }

  if (i.isButton() && id.startsWith('central:page:match-clear-item:')) {
    const [, , , category, itemKind, rawPage] = id.split(':');
    const page = Number(rawPage);
    if (!['champions', 'brasileirao', 'copa-do-mundo', 'libertadores'].includes(category) ||
        !['match', 'bracket'].includes(itemKind) || !Number.isInteger(page) || page < 0) {
      await i.reply({ content: 'Página inválida. Reabra Limpar partidas e tente novamente.', ephemeral: true });
      return true;
    }
    await i.update(clearItemsPayload(category, itemKind, page));
    return true;
  }

  if (i.isButton() && id.startsWith('central:payroll-confirm:')) {
    const target = id.slice('central:payroll-confirm:'.length);
    let users;
    let description;
    if (target === 'all') {
      users = db.prepare("SELECT DISTINCT user_id AS id FROM members WHERE kind = 'player'").all();
      description = 'todos os jogadores cadastrados';
    } else if (target.startsWith('team:')) {
      const currentTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(target.slice(5)));
      if (!currentTeam || currentTeam.owner.startsWith('national:')) {
        await i.reply({ content: 'Esse time não está mais disponível para pagamento.', ephemeral: true });
        return true;
      }
      users = db.prepare("SELECT user_id AS id FROM members WHERE team_id = ? AND kind = 'player'").all(currentTeam.id);
      description = `jogadores de ${currentTeam.name}`;
    } else if (target.startsWith('user:')) {
      const userId = target.slice(5);
      const member = await i.guild.members.fetch(userId).catch(() => null);
      if (!member || member.user.bot) {
        await i.reply({ content: 'Esse membro não está mais disponível.', ephemeral: true });
        return true;
      }
      users = [{ id: userId }];
      description = `jogador ${member}`;
    } else {
      await i.reply({ content: 'Destino de pagamento inválido.', ephemeral: true });
      return true;
    }
    if (!users.length) {
      await i.reply({ content: 'Não há jogadores para pagar nessa seleção.', ephemeral: true });
      return true;
    }
    const payroll = db.transaction(() => {
      let totalPaid = 0;
      for (const { id: userId } of users) {
        ensure(userId);
        const salary = playerValue(userId);
        const account = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
        if (!Number.isSafeInteger(salary) || !Number.isSafeInteger(account.balance + salary) ||
            !Number.isSafeInteger(totalPaid + salary)) throw new Error(`SALARY_OVERFLOW:${userId}`);
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(salary, userId);
        db.prepare('INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)')
          .run(userId, salary, 'Salário no valor do jogador', `central-salary:${i.id}:${userId}`, n());
        totalPaid += salary;
      }
      return totalPaid;
    });
    try {
      const total = payroll();
      await i.update({
        content: `✅ Salários pagos para ${description}: **${cash(total)}** no total, para ${users.length} jogador(es).`,
        embeds: [],
        components: []
      });
    } catch (error) {
      if (!error.message.startsWith('SALARY_OVERFLOW:')) throw error;
      await i.update({
        content: `Pagamento cancelado: saldo ou salário de <@${error.message.slice('SALARY_OVERFLOW:'.length)}> excede o limite seguro.`,
        embeds: [],
        components: []
      });
    }
    return true;
  };

  if (i.isButton() && id === 'central:standings') {
    const competitions = db.prepare(
      "SELECT DISTINCT competition FROM matches WHERE status = 'completed' AND score_a IS NOT NULL AND competition IS NOT NULL ORDER BY competition COLLATE NOCASE LIMIT 25"
    ).all().map(row => row.competition);
    if (!competitions.length) {
      await i.update({
        embeds: [new EmbedBuilder().setTitle('📊 Classificação').setDescription('Ainda não há resultados finalizados para calcular uma classificação.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('central:table').setLabel('Voltar à Tabela').setStyle(ButtonStyle.Secondary)
        )]
      });
      return true;
    }
    await i.update(textChoicePayload(
      '📊 Classificação por competição',
      'Selecione uma competição com resultados registrados.',
      'central:pick:standings',
      competitions.map(competition => ({ label: competition.slice(0, 100), value: competition.slice(0, 100) }))
    ));
    return true;
  }

  if (i.isButton() && id === 'central:home-away') {
    const side = Math.random() < 0.5 ? 'Home' : 'Away';
    await i.update(centralPanel('matches', `🏟️ **${side} começa!**`));
    return true;
  }

  if (i.isButton() && id === 'central:cup') {
    const activeCup = db.prepare(
      "SELECT id FROM cups WHERE status = 'active' ORDER BY created DESC LIMIT 1"
    ).get();
    if (activeCup) {
      await i.update({ embeds: [cupBracketEmbed(activeCup.id)], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('central:matches').setLabel('Voltar a Partidas').setStyle(ButtonStyle.Secondary)
        )
      ] });
      return true;
    }

    await i.deferUpdate();
    let ownerStatus;
    try {
      ownerStatus = await nationalOwnerStatus(i.guild);
    } catch (error) {
      console.error('Não foi possível confirmar os donos das seleções para iniciar a Copa pela Central:', error);
      await i.editReply(centralPanel('matches', 'Não consegui verificar os donos das seleções. Tente novamente.'));
      return true;
    }
    if (nationalTeams.some(([, acronym]) => !ownerStatus.get(acronym))) {
      await i.editReply(centralPanel('matches', 'A Copa exige que todas as 16 seleções estejam assumidas por donos.'));
      return true;
    }

    let cupId;
    try {
      cupId = db.transaction(() => createNationalCup(i.user.id))();
    } catch (error) {
      if (error.message === 'CUP_REQUIRES_16_OWNED_SELECTIONS') {
        await i.editReply(centralPanel('matches', 'A Copa exige que as 16 seleções estejam assumidas.'));
        return true;
      }
      if (error.message === 'CUP_SEEDS_MUST_BE_OWNED') {
        await i.editReply(centralPanel('matches', 'Portugal, Brasil, Argentina e França precisam estar assumidos antes de iniciar a Copa.'));
        return true;
      }
      if (error.message === 'CUP_ALREADY_ACTIVE') {
        const active = db.prepare(
          "SELECT id FROM cups WHERE status = 'active' ORDER BY created DESC LIMIT 1"
        ).get();
        await i.editReply(active
          ? { embeds: [cupBracketEmbed(active.id)] }
          : centralPanel('matches', 'Já existe uma Copa ativa.'));
        return true;
      }
      throw error;
    }
    log(i.guild, `Copa do Mundo OFC #${cupId} iniciada pela Central por ${i.user}.`);
    await i.editReply({ embeds: [cupBracketEmbed(cupId)] });
    return true;
  }

  if (i.isButton() && [
    'central:roster-manage', 'central:team-manage',
    'central:match-create', 'central:match-result', 'central:match-clear', 'central:match-list',
    'central:player-view', 'central:player-value',
    'central:money-adjust', 'central:money-payroll', 'central:money-donate',
    'central:team-view', 'central:team-delete',
    'central:finance-audit', 'central:announcement'
  ].includes(id)) {
    if (id === 'central:roster-manage' || id === 'central:team-manage') {
      await i.update(teamSelectPayload('roster', 'all'));
    } else if (id === 'central:match-create') {
      await i.update(textChoicePayload('Criar partida OFC', 'Primeiro, escolha a categoria da partida.', 'central:pick:match-category', [
        { label: 'Brasileirão', value: 'brasileirao' },
        { label: 'Champions League', value: 'champions' },
        { label: 'Seleções', value: 'selecao' }
      ]));
    } else if (id === 'central:match-result') {
      await i.update(matchResultPayload(0));
    } else if (id === 'central:match-clear') {
      await i.update(textChoicePayload('Limpar partidas', 'Escolha a categoria e depois selecione um jogo ou chaveamento específico para remover.', 'central:pick:match-clear', [
        { label: 'Brasileirão', value: 'brasileirao' },
        { label: 'Champions League', value: 'champions' },
        { label: 'Copa do Mundo / Seleções', value: 'copa-do-mundo' },
        { label: 'Libertadores', value: 'libertadores' }
      ]));
    } else if (id === 'central:match-list') {
      await i.update(textChoicePayload('Consultar partidas', 'Escolha a categoria das partidas que deseja consultar.', 'central:pick:match-list-category', [
        { label: 'Brasileirão', value: 'brasileirao' },
        { label: 'Champions League', value: 'champions' },
        { label: 'Copa do Mundo / Seleções', value: 'copa-do-mundo' }
      ]));
    } else if (id === 'central:player-view' || id === 'central:player-value') {
      await i.update({
        ...prompt(id.endsWith('player-view') ? 'Consultar jogador' : 'Definir valor de mercado', 'Pesquise e selecione um membro do servidor.', [
          makeUserPicker(`central:pick:user:${id.endsWith('player-view') ? 'player-view' : 'player-value'}`)
        ])
      });
    } else if (id === 'central:money-adjust') {
      await i.update(chooseEntityPayload('Ajustar saldo', 'money-adjust'));
    } else if (id === 'central:money-donate') {
      await i.showModal(centralAdminModal('team-donate', 'Doar para meu time', [
        { id: 'amount', label: 'Valor (ex.: 10K ou 1.2M)' }
      ]));
    } else if (id === 'central:money-payroll') {
      await i.update(textChoicePayload('Pagar salários', 'Escolha se deseja pagar um jogador, todos do clube ou todos os jogadores cadastrados.', 'central:pick:payroll-mode', [
        { label: 'Um jogador', value: 'user' },
        { label: 'Um time', value: 'team' },
        { label: 'Todos os jogadores', value: 'all' }
      ]));
    } else if (id === 'central:team-view' || id === 'central:team-delete') {
      await i.update(teamSelectPayload(id.endsWith('team-view') ? 'team-view' : 'team-delete'));
    } else if (id === 'central:finance-audit') {
      await i.update(chooseEntityPayload('Auditoria financeira', 'finance-audit'));
    } else if (id === 'central:announcement') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('central:pick:announcement')
        .setPlaceholder('Selecione um canal deste servidor')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);
      await i.update(prompt('Publicar comunicado oficial', 'Selecione o canal de texto ou anúncios onde o comunicado será publicado.', [
        new ActionRowBuilder().addComponents(channelSelect)
      ]));
    }
    return true;
  }

  if (i.isStringSelectMenu() && id.startsWith('central:pick:')) {
    const [, , kind, ...params] = id.split(':');
    if (kind === 'standings') {
      const competition = i.values[0];
      const exists = db.prepare(
        "SELECT 1 FROM matches WHERE status = 'completed' AND score_a IS NOT NULL AND competition = ? COLLATE NOCASE LIMIT 1"
      ).get(competition);
      if (!exists) {
        await i.reply({ content: 'Essa competição não tem resultados disponíveis. Reabra Tabela e escolha outra.', ephemeral: true });
        return true;
      }
      cleanExpiredMatchViews();
      const standings = competitionStandings(competition);
      const result = standingsPageEmbed(competition, standings, 0);
      const nonce = i.id;
      if (result.pageCount > 1) {
        matchListInteractions.set(nonce, {
          kind: 'standings',
          competition,
          requesterId: i.user.id,
          expiresAt: n() + 15 * 60 * 1000
        });
      }
      await i.update({
        embeds: [result.embed],
        components: result.pageCount > 1 ? [standingsPageRow(nonce, result.page, result.pageCount)] : []
      });
      return true;
    }
    if (kind === 'match-list-category') {
      const category = i.values[0];
      if (!['champions', 'brasileirao', 'copa-do-mundo'].includes(category)) {
        await i.reply({ content: 'Categoria inválida. Escolha uma categoria da lista.', ephemeral: true });
        return true;
      }
      await i.update(textChoicePayload(
        'Consultar partidas • Filtro',
        'Escolha o estado das partidas.',
        `central:pick:match-list-status:${category}`,
        [
          { label: 'Pendentes', value: 'pending' },
          { label: 'Finalizadas', value: 'completed' },
          { label: 'Todas', value: 'all' }
        ]
      ));
      return true;
    }
    if (kind === 'match-list-status') {
      const [category] = params;
      const status = i.values[0];
      if (!['champions', 'brasileirao', 'copa-do-mundo'].includes(category) ||
          !['pending', 'completed', 'all'].includes(status)) {
        await i.reply({ content: 'Filtro inválido. Reabra a consulta de partidas e tente novamente.', ephemeral: true });
        return true;
      }
      cleanExpiredMatchViews();
      const result = queryMatches({ status, category, competition: null, page: 0 });
      const nonce = i.id;
      if (result.pageCount > 1) {
        matchListInteractions.set(nonce, {
          kind: 'matches',
          status,
          category,
          competition: null,
          visibility: 'privado',
          requesterId: i.user.id,
          expiresAt: n() + 15 * 60 * 1000
        });
      }
      await i.update({
        embeds: [matchesPageEmbed({ ...result, status, category, competition: null })],
        components: result.pageCount > 1 ? [matchesPageRow(nonce, result.page, result.pageCount)] : []
      });
      return true;
    }
    if (kind === 'entity') {
      const [action] = params;
      if (action === 'money-adjust' && i.values[0] === 'user') {
        await i.update(prompt('Ajustar saldo de jogador', 'Pesquise o membro cujo saldo será alterado.', [
          makeUserPicker('central:pick:user:money-adjust')
        ]));
      } else if (action === 'money-adjust') {
        await i.update(teamSelectPayload('money-team'));
      } else if (action === 'finance-audit' && i.values[0] === 'user') {
        await i.update(prompt('Auditoria financeira de jogador', 'Pesquise o membro para consultar saldo e extrato.', [
          makeUserPicker('central:pick:user:finance-audit')
        ]));
      } else if (action === 'finance-audit') {
        await i.update(teamSelectPayload('finance-audit-team'));
      }
      return true;
    }
    if (kind === 'match-category') {
      await i.update(teamSelectPayload('match-team-a', i.values[0]));
      return true;
    }
    if (kind === 'match-clear') {
      const category = i.values[0];
      if (!['champions', 'brasileirao', 'copa-do-mundo', 'libertadores'].includes(category)) {
        await i.reply({ content: 'Categoria inválida. Escolha uma categoria da lista.', ephemeral: true });
        return true;
      }
      await i.update(clearTypePayload(category));
      return true;
    }
    if (kind === 'match-clear-type') {
      const [category] = params;
      if (!['champions', 'brasileirao', 'copa-do-mundo', 'libertadores'].includes(category) ||
          !['match', 'bracket'].includes(i.values[0])) {
        await i.reply({ content: 'Categoria ou tipo inválido. Reabra Limpar partidas e tente novamente.', ephemeral: true });
        return true;
      }
      await i.update(clearItemsPayload(category, i.values[0]));
      return true;
    }
    if (kind === 'match-clear-item') {
      const [category, itemKind] = params;
      const itemId = Number(i.values[0]);
      if (!['champions', 'brasileirao', 'copa-do-mundo', 'libertadores'].includes(category) ||
          !['match', 'bracket'].includes(itemKind) ||
          !Number.isSafeInteger(itemId) || itemId < 1) {
        await i.reply({ content: 'Seleção inválida. Reabra Limpar partidas e tente novamente.', ephemeral: true });
        return true;
      }
      if (itemKind === 'match') {
        if (category === 'libertadores') {
          await i.update(clearItemsPayload(category, itemKind));
          return true;
        }
        const filter = matchCategoryPredicate(category);
        const match = db.prepare(
          `SELECT m.id, a.name AS team_a_name, b.name AS team_b_name, m.competition
           FROM matches m
           LEFT JOIN teams a ON a.id = m.a
           LEFT JOIN teams b ON b.id = m.b
           WHERE m.id = ? AND ${filter.sql}`
        ).get(itemId, ...filter.params);
        if (!match) {
          await i.update(clearItemsPayload(category, itemKind));
          return true;
        }
        await i.showModal(centralAdminModal(
          `match-clear-one:${category}:match:${match.id}`,
          `Limpar jogo #${match.id}`,
          [{ id: 'confirm', label: 'Digite LIMPAR para confirmar' }]
        ));
        return true;
      }
      const bracketCategory = category === 'copa-do-mundo' ? 'selecao' : category;
      const bracket = db.prepare(
        'SELECT id FROM tournament_brackets WHERE id = ? AND guild_id = ? AND category = ?'
      ).get(itemId, i.guildId, bracketCategory);
      if (!bracket) {
        await i.update(clearItemsPayload(category, itemKind));
        return true;
      }
      await i.showModal(centralAdminModal(
        `match-clear-one:${category}:bracket:${bracket.id}`,
        `Limpar tabela #${bracket.id}`,
        [{ id: 'confirm', label: 'Digite LIMPAR para confirmar' }]
      ));
      return true;
    }
    if (kind === 'match-result') {
      const matchId = Number(i.values[0]);
      const match = activeMatch(matchId);
      if (!match) {
        await i.update(prompt('Partida indisponível', 'Essa partida não está mais pendente. Abra a lista novamente.', []));
        return true;
      }
      await i.showModal(centralAdminModal(`match-result:${matchId}`, `Resultado #${matchId}`, [
        { id: 'score_a', label: 'Gols do primeiro time' },
        { id: 'score_b', label: 'Gols do segundo time' },
        { id: 'penalties_a', label: 'Pênaltis do primeiro (opcional)', required: false },
        { id: 'penalties_b', label: 'Pênaltis do segundo (opcional)', required: false }
      ]));
      return true;
    }
    if (kind === 'payroll-mode') {
      const mode = i.values[0];
      if (mode === 'all') {
        await showPayrollConfirmation('all');
      } else if (mode === 'user') {
        await i.update(prompt('Pagar salário de jogador', 'Pesquise e selecione o jogador que receberá o salário.', [
          makeUserPicker('central:pick:user:payroll')
        ]));
      } else {
        await i.update(teamSelectPayload('payroll-team'));
      }
      return true;
    }
    if (kind === 'team') {
      const [action, category, teamA] = params;
      const selectedTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(i.values[0]));
      if (!selectedTeam) {
        await i.update(prompt('Time indisponível', 'Esse time não está mais cadastrado.', []));
        return true;
      }
      if (action === 'roster') {
        await i.update(prompt('Gerenciar membros e cargos', `Time selecionado: **${selectedTeam.name} (${selectedTeam.acronym})**. Agora pesquise o membro.`, [
          makeUserPicker(`central:pick:user:roster:${selectedTeam.id}`)
        ]));
      } else if (action === 'team-view') {
        await i.update({ embeds: [centralTeamEmbed(selectedTeam)], components: [] });
      } else if (action === 'team-delete') {
        await i.showModal(centralAdminModal(`team-delete:${selectedTeam.id}`, 'Confirmar exclusão', [
          { id: 'confirm', label: `Digite ${selectedTeam.acronym} para confirmar` }
        ]));
      } else if (action === 'finance-audit-team') {
        await financialAudit('team', selectedTeam.id);
      } else if (action === 'money-team') {
        await i.showModal(centralAdminModal(`money-adjust:team:${selectedTeam.id}`, 'Ajustar saldo do time', [
          { id: 'action', label: 'Ação: adicionar ou retirar' },
          { id: 'amount', label: 'Quantia (ex.: 10K ou 2.5M)' }
        ]));
      } else if (action === 'payroll-team') {
        await showPayrollConfirmation(`team:${selectedTeam.id}`);
      } else if (action === 'match-team-a') {
        await i.update(teamSelectPayload('match-team-b', category, 0, selectedTeam.id));
      } else if (action === 'match-team-b') {
        if (String(selectedTeam.id) === teamA) {
          await i.update(prompt('Escolha outro time', 'O time B precisa ser diferente do time A.', [
            new ActionRowBuilder().addComponents(new ButtonBuilder()
              .setCustomId(`central:page:team:match-team-b:${category}:${teamA}:0`)
              .setLabel('Voltar à seleção de times')
              .setStyle(ButtonStyle.Secondary))
          ]));
        } else {
          await i.showModal(centralAdminModal(`match-create:${category}:${teamA}:${selectedTeam.id}`, 'Detalhes da partida', [
            { id: 'competition', label: 'Competição (opcional)', required: false },
            { id: 'schedule', label: 'Horário opcional (Brasília)', placeholder: 'AAAA-MM-DD HH:mm', required: false }
          ]));
        }
      }
      return true;
    }
  }

  if (i.isUserSelectMenu() && id.startsWith('central:pick:user:')) {
    const [, , , action, ...params] = id.split(':');
    const userId = i.values[0];
    if (action === 'player-view') {
      const user = await client.users.fetch(userId);
      const member = await i.guild.members.fetch(userId).catch(() => null);
      await i.update({ embeds: [profileEmbed(user, member)], components: [] });
    } else if (action === 'player-value') {
      await i.showModal(centralAdminModal(`player-value:${userId}`, 'Definir valor de mercado', [
        { id: 'value', label: 'Valor (ex.: 150000, 750M ou 1.2B)' }
      ]));
    } else if (action === 'roster') {
      await i.showModal(centralAdminModal(`roster:${params[0]}:${userId}`, 'Gerenciar membro do time', [
        { id: 'action', label: 'Ação: adicionar ou remover' },
        { id: 'kind', label: 'Cargo: jogador ou gerente' }
      ]));
    } else if (action === 'money-adjust') {
      await i.showModal(centralAdminModal(`money-adjust:user:${userId}`, 'Ajustar saldo do jogador', [
        { id: 'action', label: 'Ação: adicionar ou retirar' },
        { id: 'amount', label: 'Quantia (ex.: 10K ou 2.5M)' }
      ]));
    } else if (action === 'finance-audit') {
      await financialAudit('user', userId);
    } else if (action === 'payroll') {
      await showPayrollConfirmation(`user:${userId}`);
    } else {
      await i.reply({ content: 'Essa seleção não está mais disponível.', ephemeral: true });
    }
    return true;
  }

  if (i.isChannelSelectMenu() && id === 'central:pick:announcement') {
    const channelId = i.values[0];
    await i.showModal(centralAdminModal(`announcement:${channelId}`, 'Publicar comunicado oficial', [
      { id: 'message', label: 'Texto do comunicado', paragraph: true, maxLength: 2000 }
    ]));
    return true;
  }

  if (id.startsWith('central:submit:') && i.isModalSubmit()) {
    const [, , action, ...context] = id.split(':');
    const reply = (content, embeds = []) => i.reply({
      content,
      embeds,
      ephemeral: true,
      allowedMentions: { parse: [] }
    });

    if (action === 'team-donate') {
      const currentTeam = owner(i.user.id);
      if (!currentTeam) {
        return reply('Você precisa ser dono de um time ou seleção para contribuir com o caixa.');
      }
      const amount = parseCentralMoney(centralValue(i, 'amount'));
      if (!Number.isSafeInteger(amount) || amount < 1) {
        return reply('Informe um valor maior que zero e seguro (ex.: 250000, 10K ou 1.2M).');
      }
      ensure(i.user.id);
      try {
        db.transaction(() => {
          const debit = db.prepare(
            'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?'
          ).run(amount, i.user.id, amount);
          if (!debit.changes) throw new Error('INSUFFICIENT_BALANCE');
          const credit = db.prepare(
            'UPDATE teams SET balance = balance + ? WHERE id = ? AND balance <= ?'
          ).run(amount, currentTeam.id, Number.MAX_SAFE_INTEGER - amount);
          if (!credit.changes) throw new Error('TEAM_BALANCE_OVERFLOW');
          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(i.user.id, -amount, `Contribuição para ${currentTeam.name}`, `central-team-donation:${i.id}:user`, n());
          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(currentTeam.id, amount, 'Contribuição do dono pelo Central', `central-team-donation:${i.id}:team`, n());
        })();
      } catch (error) {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(i.user.id).balance;
          return reply(`Saldo insuficiente. Seu saldo é ${cash(balance)}.`);
        }
        if (error.message === 'TEAM_BALANCE_OVERFLOW') {
          return reply('A contribuição excede o limite seguro do caixa do time.');
        }
        throw error;
      }
      return reply(`✅ ${cash(amount)} foram transferidos para o caixa de **${currentTeam.name}**.`);
    }

    if (action === 'roster' || action === 'team-manage') {
      const currentTeam = db.prepare('SELECT * FROM teams WHERE id = ?')
        .get(Number(context[0]));
      const userId = context[1];
      const operation = normalizeSearch(centralValue(i, 'action'));
      const kindText = normalizeSearch(centralValue(i, 'kind'));
      const kind = ['jogador', 'player'].includes(kindText)
        ? 'player'
        : ['gerente', 'manager'].includes(kindText) ? 'manager' : null;
      const add = ['adicionar', 'add'].includes(operation);
      const remove = ['remover', 'remove'].includes(operation);
      if (!currentTeam || currentTeam.owner.startsWith('national:')) {
        return reply('Escolha um clube cadastrado; o fluxo de seleções não usa cargos de clube.');
      }
      if (!userId || !kind || (!add && !remove)) {
        return reply('Confira a ação (adicionar/remover) e o cargo (jogador/gerente).');
      }
      const member = await i.guild.members.fetch(userId).catch(() => null);
      if (!member || member.user.bot || member.id === i.user.id) {
        return reply('Escolha outro membro válido deste servidor; bots não podem entrar no elenco.');
      }
      try {
        await teamRoles(i.guild, currentTeam);
        const roleLabel = kind === 'manager' ? 'Gerente' : 'Jogador';
        const targetRole = i.guild.roles.cache.find(
          role => role.name === `${currentTeam.acronym} | ${roleLabel}`
        );
        if (!targetRole) return reply('Não encontrei o cargo correspondente do time.');
        const membership = db.prepare(
          'SELECT kind FROM members WHERE team_id = ? AND user_id = ?'
        ).get(currentTeam.id, userId);
        if (add) {
          if (kind === 'manager' && membership?.kind !== 'manager' &&
              await teamHasManager(i.guild, currentTeam, userId)) {
            return reply(`**${currentTeam.name}** já tem gerente. Remova o gerente atual antes de adicionar outro.`);
          }
          const freeAgentListing = db.prepare(
            "SELECT id FROM market_listings WHERE user_id = ? AND status = 'available'"
          ).get(userId);
          await member.roles.add(targetRole);
          const conflictingRoles = member.roles.cache.filter(role => {
            if (role.id === targetRole.id) return false;
            const match = role.name.match(/^([A-Z]{3,4}) \| (Gerente|Jogador)$/i);
            if (!match) return false;
            const oldTeam = team(match[1]);
            if (!oldTeam || oldTeam.owner.startsWith('national:')) return false;
            if (kind === 'player') {
              return match[2].toLowerCase() === 'jogador' ||
                (oldTeam.id === currentTeam.id && match[2].toLowerCase() === 'gerente');
            }
            return match[2].toLowerCase() === 'gerente' ||
              (oldTeam.id === currentTeam.id && match[2].toLowerCase() === 'jogador');
          });
          if (conflictingRoles.size) await member.roles.remove(conflictingRoles);
          db.transaction(() => {
            db.prepare('DELETE FROM members WHERE user_id = ? AND kind = ?')
              .run(userId, kind);
            db.prepare(
              'INSERT INTO members (team_id, user_id, kind) VALUES (?, ?, ?) ON CONFLICT(team_id, user_id) DO UPDATE SET kind = excluded.kind'
            ).run(currentTeam.id, userId, kind);
            db.prepare(
              "UPDATE market_listings SET status = 'signed', resolved_at = ? WHERE user_id = ? AND status = 'available'"
            ).run(n(), userId);
          })();
          if (freeAgentListing) {
            closeMarketListing(freeAgentListing.id, currentTeam).catch(error =>
              console.error(`Falha ao atualizar o anúncio do agente livre ${userId}:`, error)
            );
          }
          return reply(`✅ <@${userId}> agora está cadastrado como **${roleLabel}** de **${currentTeam.name}**.`);
        }
        if (!membership || membership.kind !== kind) {
          return reply(`Esse usuário não está cadastrado como ${kind === 'manager' ? 'gerente' : 'jogador'} desse time.`);
        }
        await member.roles.remove(targetRole);
        db.prepare(
          'DELETE FROM members WHERE team_id = ? AND user_id = ? AND kind = ?'
        ).run(currentTeam.id, userId, kind);
        return reply(`✅ <@${userId}> foi removido do elenco de **${currentTeam.name}**.`);
      } catch (error) {
        console.error(`Falha na gestão de elenco do Central (${currentTeam.acronym}):`, error);
        return reply('Não consegui atualizar os cargos. Confira Manage Roles e a posição dos cargos do bot.');
      }
    }

    if (action === 'match-create') {
      const category = context[0];
      const a = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(context[1]));
      const b = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(context[2]));
      const competitionNames = {
        selecao: 'Seleções',
        brasileirao: 'Brasileirão',
        champions: 'Champions League'
      };
      const competition = centralValue(i, 'competition') || competitionNames[category];
      const schedule = parseBrasiliaSchedule(centralValue(i, 'schedule'));
      if (!category || !a || !b || a.id === b.id ||
          teamCategory(a) !== category || teamCategory(b) !== category) {
        return reply('Escolha dois times diferentes e cadastrados na categoria informada.');
      }
      if (!teamOwnerId(a) || !teamOwnerId(b) || teamOwnerId(a) === teamOwnerId(b)) {
        return reply('Os dois times precisam ter donos diferentes para receber o prêmio OFC.');
      }
      if (schedule.error) return reply(schedule.error);
      const ref = `central-ofc:${i.id}`;
      const create = db.transaction(() => {
        const inserted = db.prepare(
          "INSERT INTO matches (ref, type, a, b, competition, category, scheduled_at, status, created) VALUES (?, 'ofc', ?, ?, ?, ?, ?, 'pending', ?)"
        ).run(ref, a.id, b.id, competition.slice(0, 100), category, schedule.scheduledAt, n());
        payOFCParticipation(a, ref);
        payOFCParticipation(b, ref);
        return Number(inserted.lastInsertRowid);
      });
      const matchId = create();
      log(i.guild, `Partida OFC #${matchId} criada pelo Central: ${a.acronym} x ${b.acronym} (${competition}).`);
      return reply(`✅ Partida OFC **#${matchId}** criada: **${teamDisplayName(a)} × ${teamDisplayName(b)}** em **${competition}**. Cada time recebeu ${cash(OFC_PARTICIPATION_REWARD)}.`);
    }

    if (action === 'match-result') {
      const matchId = Number(context[0]);
      const scoreA = Number(centralValue(i, 'score_a'));
      const scoreB = Number(centralValue(i, 'score_b'));
      const rawPenaltiesA = centralValue(i, 'penalties_a');
      const rawPenaltiesB = centralValue(i, 'penalties_b');
      const penaltiesA = rawPenaltiesA === '' ? null : Number(rawPenaltiesA);
      const penaltiesB = rawPenaltiesB === '' ? null : Number(rawPenaltiesB);
      if (!Number.isSafeInteger(matchId) || !Number.isSafeInteger(scoreA) ||
          !Number.isSafeInteger(scoreB) || scoreA < 0 || scoreB < 0 ||
          scoreA > 99 || scoreB > 99 ||
          (rawPenaltiesA === '') !== (rawPenaltiesB === '') ||
          (penaltiesA !== null && (!Number.isSafeInteger(penaltiesA) ||
            !Number.isSafeInteger(penaltiesB) || penaltiesA < 0 || penaltiesB < 0 ||
            scoreA !== scoreB || penaltiesA === penaltiesB))) {
        return reply('Informe um ID e placares válidos. Pênaltis devem ser preenchidos em par e desempatar um empate.');
      }
      const match = activeMatch(matchId);
      if (!match) return reply('Não encontrei uma partida OFC pendente com esse ID.');
      const a = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.a);
      const b = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.b);
      if (!a || !b) return reply('Um dos times da partida não está mais cadastrado.');
      const winnerId = scoreA === scoreB
        ? (penaltiesA === null ? null : penaltiesA > penaltiesB ? a.id : b.id)
        : scoreA > scoreB ? a.id : b.id;
      const result = db.transaction(() => {
        if (db.prepare('SELECT 1 FROM cup_games WHERE match_id = ?').get(match.id) &&
            winnerId === null) throw new Error('CUP_MATCH_REQUIRES_WINNER');
        const updated = db.prepare(
          "UPDATE matches SET winner = ?, score_a = ?, score_b = ?, penalties_a = ?, penalties_b = ?, status = 'completed' WHERE id = ? AND status = 'pending'"
        ).run(winnerId, scoreA, scoreB, penaltiesA, penaltiesB, match.id);
        if (!updated.changes) throw new Error('MATCH_ALREADY_COMPLETED');
        if (winnerId !== null) {
          db.prepare('UPDATE teams SET balance = balance + 350000 WHERE id = ?')
            .run(winnerId);
          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(winnerId, 350000, `Vitória OFC ${match.competition}`, `central-result:${i.id}:win`, n());
        }
        advanceCupResult(match.id, winnerId);
      });
      try {
        result();
      } catch (error) {
        if (error.message === 'CUP_MATCH_REQUIRES_WINNER') {
          return reply('Partidas da Copa não podem terminar empatadas; informe pênaltis que definam o vencedor.');
        }
        if (error.message === 'MATCH_ALREADY_COMPLETED') {
          return reply('Essa partida acabou de ser finalizada por outra pessoa.');
        }
        throw error;
      }
      const winner = winnerId
        ? db.prepare('SELECT name FROM teams WHERE id = ?').get(winnerId)?.name
        : null;
      log(i.guild, `Resultado OFC #${match.id}: ${a.acronym} ${scoreA} x ${scoreB} ${b.acronym}${winner ? `; venceu ${winner} (+350K)` : ''}.`);
      return reply(`✅ Resultado OFC **#${match.id}** registrado: **${a.name} ${scoreA} x ${scoreB} ${b.name}**${penaltiesA === null ? '' : ` (pênaltis ${penaltiesA} x ${penaltiesB})`}${winner ? `\n**${winner}** recebeu ${cash(350000)}.` : ''}`);
    }

    if (action === 'match-clear-one') {
      const [category, itemKind, rawItemId] = context;
      const itemId = Number(rawItemId);
      const confirmed = normalizeSearch(centralValue(i, 'confirm')) === 'limpar';
      if (!['champions', 'brasileirao', 'copa-do-mundo', 'libertadores'].includes(category) ||
          !['match', 'bracket'].includes(itemKind) ||
          (itemKind === 'match' && category === 'libertadores') ||
          !Number.isSafeInteger(itemId) || itemId < 1) {
        return reply('Seleção inválida. Reabra Limpar partidas e escolha um item da lista.');
      }
      if (!confirmed) return reply('Limpeza cancelada. Digite LIMPAR para confirmar a remoção.');
      if (itemKind === 'match') {
        const filter = matchCategoryPredicate(category);
        const removeMatch = db.transaction(() => {
          const exists = db.prepare(
            `SELECT m.id FROM matches m WHERE m.id = ? AND ${filter.sql}`
          ).get(itemId, ...filter.params);
          if (!exists) return 0;
          const cupIds = db.prepare(
            'SELECT cup_id FROM cup_games WHERE match_id = ?'
          ).all(itemId).map(row => row.cup_id);
          db.prepare('DELETE FROM cup_games WHERE match_id = ?').run(itemId);
          const removed = db.prepare(
            `DELETE FROM matches AS m WHERE m.id = ? AND ${filter.sql}`
          ).run(itemId, ...filter.params).changes;
          if (removed) {
            for (const cupId of cupIds) {
              db.prepare(
                'DELETE FROM cups WHERE id = ? AND NOT EXISTS (SELECT 1 FROM cup_games WHERE cup_id = ?)'
              ).run(cupId, cupId);
            }
          }
          return removed;
        });
        const removed = removeMatch();
        if (!removed) return reply('Esse jogo não existe mais nessa categoria. Nenhuma partida foi removida.');
        for (const [nonce, state] of matchListInteractions) {
          if (state.category === category) matchListInteractions.delete(nonce);
        }
        log(i.guild, `${i.user} limpou a partida #${itemId} da categoria ${category} pelo Central.`);
        return reply(`✅ Jogo **#${itemId}** removido de **${clearCategoryLabel(category)}**.`);
      }

      const bracketCategory = category === 'copa-do-mundo' ? 'selecao' : category;
      const bracket = db.prepare(
        'SELECT id, channel_id, message_id FROM tournament_brackets WHERE id = ? AND guild_id = ? AND category = ?'
      ).get(itemId, i.guildId, bracketCategory);
      if (!bracket) return reply('Esse chaveamento não existe mais nessa categoria.');

      if (bracket.message_id) {
        try {
          const channel = await i.guild.channels.fetch(bracket.channel_id);
          if (channel && (!channel.isTextBased() || !channel.messages)) {
            return reply('O canal da publicação não é mais um canal de texto; o chaveamento continua salvo.');
          }
          if (channel) {
            try {
              const message = await channel.messages.fetch(bracket.message_id);
              await message.delete();
            } catch (error) {
              if (error.code !== 10008) throw error;
            }
          }
        } catch (error) {
          if (error.code !== 10003) {
            console.error(`Falha ao remover a publicação do chaveamento #${itemId}:`, error);
            return reply('Não consegui remover a embed publicada. Confira as permissões do bot e tente novamente; o chaveamento continua salvo.');
          }
        }
      }
      const removed = db.prepare(
        'DELETE FROM tournament_brackets WHERE id = ? AND guild_id = ? AND category = ?'
      ).run(itemId, i.guildId, bracketCategory).changes;
      if (!removed) return reply('Esse chaveamento já foi removido.');
      log(i.guild, `${i.user} removeu o chaveamento #${itemId} da categoria ${category} pelo Central.`);
      return reply(`✅ Chaveamento **#${itemId}** e sua publicação removidos de **${clearCategoryLabel(category)}**.`);
    }

    if (action === 'player-view') {
      const userId = context[0];
      if (!userId) return reply('Selecione um membro do servidor.');
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user || user.bot) return reply('Não encontrei um jogador válido com esse ID.');
      const member = await i.guild.members.fetch(userId).catch(() => null);
      return i.reply({ embeds: [profileEmbed(user, member)], ephemeral: true });
    }

    if (action === 'player-value') {
      const userId = context[0];
      const value = parseCentralMoney(centralValue(i, 'value'));
      if (!userId || !Number.isSafeInteger(value)) {
        return reply('Selecione um jogador e informe um valor positivo seguro (ex.: 150000, 750M ou 1.2B).');
      }
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user || user.bot) return reply('Não encontrei um jogador válido com esse ID.');
      ensure(userId);
      db.prepare(
        'INSERT INTO player_values (user_id, value) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET value = excluded.value'
      ).run(userId, value);
      db.prepare('UPDATE users SET market = ? WHERE id = ?').run(value, userId);
      invalidateDivisionAutocompleteCache(i.guild.id);
      try {
        await syncDivisionRole(i.guild, userId, value);
      } catch (error) {
        console.error(`Valor de mercado atualizado pelo Central, mas falhou sincronização de ${userId}:`, error);
        return reply(`Valor definido para ${cash(value)}, mas não consegui sincronizar o cargo de divisão. Confira Manage Roles.`);
      }
      return reply(`Valor de mercado de <@${userId}> definido para **${cash(value)}**.`);
    }

    if (action === 'money-adjust') {
      const operation = normalizeSearch(centralValue(i, 'action'));
      const requestedAmount = parseCentralMoney(centralValue(i, 'amount'));
      const add = ['adicionar', 'add'].includes(operation);
      const remove = ['retirar', 'remover', 'remove'].includes(operation);
      if ((!add && !remove) || !Number.isSafeInteger(requestedAmount) || requestedAmount < 1) {
        return reply('Informe ação adicionar/retirar e uma quantia maior que zero (ex.: 10K).');
      }
      const targetKind = context[0];
      const targetId = context[1];
      const currentTeam = targetKind === 'team'
        ? db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(targetId))
        : null;
      const userId = targetKind === 'user' ? targetId : null;
      if ((!currentTeam && !userId) || (targetKind === 'team' && !currentTeam)) {
        return reply('Não encontrei esse jogador ou time.');
      }
      if (userId) ensure(userId);
      const adjust = db.transaction(() => {
        const balance = currentTeam
          ? db.prepare('SELECT balance FROM teams WHERE id = ?').get(currentTeam.id)?.balance
          : db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)?.balance;
        if (!Number.isSafeInteger(balance)) throw new Error('BALANCE_TARGET_NOT_FOUND');
        const adjusted = remove ? Math.min(balance, requestedAmount) : requestedAmount;
        const signed = add ? adjusted : -adjusted;
        if (!Number.isSafeInteger(balance + signed)) throw new Error('BALANCE_OVERFLOW');
        if (adjusted) {
          if (currentTeam) {
            db.prepare('UPDATE teams SET balance = balance + ? WHERE id = ?').run(signed, currentTeam.id);
            db.prepare(
              'INSERT INTO transactions (team_id, amount, reason, created) VALUES (?, ?, ?, ?)'
            ).run(currentTeam.id, signed, 'Ajuste admin pelo Central', n());
          } else {
            db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(signed, userId);
            db.prepare(
              'INSERT INTO transactions (user_id, amount, reason, created) VALUES (?, ?, ?, ?)'
            ).run(userId, signed, 'Ajuste admin pelo Central', n());
          }
        }
        return adjusted;
      });
      try {
        const adjusted = adjust();
        return reply(adjusted === 0
          ? 'Esse saldo já está zerado; nenhum valor foi retirado.'
          : `Saldo atualizado: ${add ? 'adicionado' : 'retirado'} ${cash(adjusted)}.`);
      } catch (error) {
        if (error.message === 'BALANCE_TARGET_NOT_FOUND') return reply('Não encontrei o saldo desse jogador ou time.');
        if (error.message === 'BALANCE_OVERFLOW') return reply('Esse ajuste excede o limite seguro de saldo.');
        throw error;
      }
    }

    if (action === 'money-payroll') {
      const target = context[0];
      let users;
      let description;
      if (normalizeSearch(target) === 'todos') {
        users = db.prepare("SELECT DISTINCT user_id AS id FROM members WHERE kind = 'player'").all();
        description = 'todos os jogadores cadastrados';
      } else if (normalizeSearch(target).startsWith('time:')) {
        const currentTeam = team(target.slice(target.indexOf(':') + 1));
        if (!currentTeam || currentTeam.owner.startsWith('national:')) return reply('Informe um clube válido como time:SIGLA.');
        users = db.prepare(
          "SELECT user_id AS id FROM members WHERE team_id = ? AND kind = 'player'"
        ).all(currentTeam.id);
        description = `jogadores de ${currentTeam.name} (${currentTeam.acronym})`;
      } else {
        const userId = centralUserId(target);
        const member = userId ? await i.guild.members.fetch(userId).catch(() => null) : null;
        if (!member || member.user.bot) return reply('Informe ID de jogador, time:SIGLA ou todos.');
        users = [{ id: userId }];
        description = `jogador <@${userId}>`;
      }
      if (!users.length) return reply('Não há jogadores para pagar nessa seleção.');
      const payroll = db.transaction(() => {
        let totalPaid = 0;
        for (const { id: userId } of users) {
          ensure(userId);
          const salary = playerValue(userId);
          const account = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
          if (!Number.isSafeInteger(salary) || !Number.isSafeInteger(account.balance + salary) ||
              !Number.isSafeInteger(totalPaid + salary)) throw new Error(`SALARY_OVERFLOW:${userId}`);
          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(salary, userId);
          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(userId, salary, 'Salário no valor do jogador', `central-salary:${i.id}:${userId}`, n());
          totalPaid += salary;
        }
        return totalPaid;
      });
      try {
        const total = payroll();
        return reply(`✅ Salários pagos para ${description}: **${cash(total)}** no total, para ${users.length} jogador(es).`);
      } catch (error) {
        if (error.message.startsWith('SALARY_OVERFLOW:')) {
          return reply(`Pagamento cancelado: saldo ou salário de <@${error.message.slice('SALARY_OVERFLOW:'.length)}> excede o limite seguro.`);
        }
        throw error;
      }
    }

    if (action === 'team-view') {
      const currentTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(context[0]));
      if (!currentTeam) return reply('Não encontrei esse time.');
      return i.reply({ embeds: [centralTeamEmbed(currentTeam)], ephemeral: true });
    }

    if (action === 'team-delete') {
      const currentTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(context[0]));
      if (!currentTeam) return reply('Não encontrei esse time.');
      if (centralValue(i, 'confirm').toUpperCase() !== currentTeam.acronym) {
        return reply(`Exclusão cancelada. Para confirmar, digite exatamente **${currentTeam.acronym}**.`);
      }
      db.prepare('DELETE FROM teams WHERE id = ?').run(currentTeam.id);
      log(i.guild, `Time ${currentTeam.name} (${currentTeam.acronym}) removido pelo Central; histórico financeiro mantido.`);
      return reply(`Time **${currentTeam.name} (${currentTeam.acronym})** removido. Histórico de transações mantido.`);
    }

    if (action === 'finance-audit') {
      const targetKind = context[0];
      const targetId = context[1];
      const currentTeam = targetKind === 'team'
        ? db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(targetId))
        : null;
      const userId = targetKind === 'user' ? targetId : null;
      if ((!currentTeam && !userId) || (targetKind === 'team' && !currentTeam)) {
        return reply('Não encontrei esse jogador ou time.');
      }
      if (userId) ensure(userId);
      const balance = currentTeam
        ? db.prepare('SELECT balance FROM teams WHERE id = ?').get(currentTeam.id)?.balance
        : db.prepare('SELECT balance FROM users WHERE id = ?').get(userId)?.balance;
      const entries = currentTeam
        ? db.prepare('SELECT amount, reason, created FROM transactions WHERE team_id = ? ORDER BY created DESC, id DESC LIMIT 15').all(currentTeam.id)
        : db.prepare('SELECT amount, reason, created FROM transactions WHERE user_id = ? ORDER BY created DESC, id DESC LIMIT 15').all(userId);
      const description = entries.length
        ? entries.map(entry => `• <t:${Math.floor(entry.created / 1000)}:d> ${entry.amount >= 0 ? '+' : '−'}${cash(Math.abs(entry.amount))} — ${entry.reason}`).join('\n').slice(0, 3900)
        : 'Nenhuma movimentação registrada.';
      const label = currentTeam ? `${currentTeam.name} (${currentTeam.acronym})` : `<@${userId}>`;
      return i.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`🧾 Auditoria financeira — ${label}`)
          .setDescription(`**Saldo atual:** ${cash(balance)}\n\n${description}`)
          .setFooter({ text: 'Últimas 15 movimentações' })],
        ephemeral: true
      });
    }

    if (action === 'announcement') {
      const channelId = context[0];
      const message = centralValue(i, 'message');
      if (!/^\d{17,20}$/.test(channelId) || !message) {
        return reply('Selecione um canal deste servidor e informe o comunicado.');
      }
      const channel = await i.guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.guildId !== i.guildId ||
          typeof channel.send !== 'function') {
        return reply('O canal precisa ser um canal de texto deste servidor.');
      }
      try {
        await channel.send({
          content: message,
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        console.error('Falha ao publicar comunicado pelo Central:', error);
        return reply('Não consegui publicar no canal escolhido. Confira as permissões de enviar mensagens.');
      }
      log(i.guild, `Comunicado oficial publicado por ${i.user} no canal ${channel}.`);
      return reply(`✅ Comunicado publicado em ${channel}.`);
    }

    return false;
  }

  if (id === 'central:tools' && i.isButton()) return false;
  if (id === 'central:roster-audit' && i.isButton()) {
    await i.deferReply({ ephemeral: true });
    try {
      await i.guild.roles.fetch();
      await i.guild.members.fetch();
      const registered = db.prepare(
        'SELECT m.team_id, m.user_id, m.kind, t.acronym FROM members m JOIN teams t ON t.id = m.team_id WHERE t.owner NOT LIKE \'national:%\' ORDER BY t.acronym, m.kind, m.user_id'
      ).all();
      const issues = [];
      const expected = new Set();
      for (const entry of registered) {
        const role = i.guild.roles.cache.find(
          candidate => candidate.name === `${entry.acronym} | ${entry.kind === 'manager' ? 'Gerente' : 'Jogador'}`
        );
        expected.add(`${entry.team_id}:${entry.user_id}:${entry.kind}`);
        const member = i.guild.members.cache.get(entry.user_id);
        if (!member) {
          issues.push(`• <@${entry.user_id}> — ${entry.acronym}: membro ausente do servidor.`);
        } else if (!role || !member.roles.cache.has(role.id)) {
          issues.push(`• <@${entry.user_id}> — ${entry.acronym}: falta o cargo de ${entry.kind === 'manager' ? 'gerente' : 'jogador'}.`);
        }
      }
      const extras = [];
      for (const role of i.guild.roles.cache.values()) {
        const match = role.name.match(/^([A-Z]{3,4}) \| (Gerente|Jogador)$/i);
        if (!match) continue;
        const currentTeam = team(match[1]);
        if (!currentTeam || currentTeam.owner.startsWith('national:')) continue;
        const kind = match[2].toLowerCase() === 'gerente' ? 'manager' : 'player';
        for (const userId of role.members.keys()) {
          if (!expected.has(`${currentTeam.id}:${userId}:${kind}`)) {
            extras.push(`• <@${userId}> — ${currentTeam.acronym}: cargo sem cadastro correspondente.`);
          }
        }
      }
      const lines = [...issues, ...extras];
      const output = lines.length ? lines.slice(0, 70).join('\n').slice(0, 3900) : 'Nenhuma divergência encontrada entre os cadastros de clube e os cargos do servidor.';
      await i.editReply({
        embeds: [new EmbedBuilder()
          .setColor(lines.length ? 0xe67e22 : 0x2ecc71)
          .setTitle(`🔎 Auditoria de elencos — ${lines.length} divergência(s)`)
          .setDescription(output)]
      });
    } catch (error) {
      console.error('Falha na auditoria de elencos do Central:', error);
      await i.editReply('Não consegui concluir a auditoria. Confira as permissões de leitura de membros e cargos do bot.');
    }
    return true;
  }

  if (id === 'central:proposal-audit' && i.isButton()) {
    const pending = db.prepare(
      "SELECT id, player, created_by, dst, price, expires FROM offers WHERE kind = 'proposal' AND status = 'pending' AND (expires IS NULL OR expires > ?) ORDER BY created DESC LIMIT 25"
    ).all(n());
    if (!pending.length) {
      await i.reply({ content: 'Não há propostas pendentes.', ephemeral: true });
      return true;
    }
    const options = pending.map(offer => {
      const target = db.prepare('SELECT acronym FROM teams WHERE id = ?').get(offer.dst);
      return new StringSelectMenuOptionBuilder()
        .setLabel(`#${offer.id} • ${target?.acronym || 'time removido'} • ${cash(offer.price)}`.slice(0, 100))
        .setDescription(`Jogador ${offer.player} • expira <t:${Math.floor(offer.expires / 1000)}:R>`.slice(0, 100))
        .setValue(String(offer.id));
    });
    await i.reply(centralSelectPayload(
      '📨 Propostas pendentes',
      'Selecione uma proposta para cancelá-la. Somente os primeiros 25 registros são exibidos.',
      'central:select:proposal-cancel',
      options
    ));
    return true;
  }

  if (id === 'central:free-agents' && i.isButton()) {
    const listings = db.prepare(
      "SELECT l.id, l.user_id, l.value, l.role, l.created FROM market_listings l WHERE l.status = 'available' ORDER BY l.created DESC LIMIT 25"
    ).all();
    if (!listings.length) {
      await i.reply({ content: 'Não há anúncios de agentes livres ativos.', ephemeral: true });
      return true;
    }
    const options = listings.map(listing =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`#${listing.id} • ${listing.role === 'manager' ? 'Gerente' : 'Jogador'} • ${cash(listing.value)}`.slice(0, 100))
        .setDescription(`Usuário ${listing.user_id} • desde <t:${Math.floor(listing.created / 1000)}:R>`.slice(0, 100))
        .setValue(String(listing.id))
    );
    await i.reply(centralSelectPayload(
      '🪟 Agentes livres ativos',
      'Selecione um anúncio para encerrá-lo.',
      'central:select:free-agent-cancel',
      options
    ));
    return true;
  }

  if (id === 'central:callup-audit' && i.isButton()) {
    const callups = db.prepare(
      "SELECT o.id, o.player, o.expires, t.acronym FROM offers o LEFT JOIN teams t ON t.id = o.dst WHERE o.kind = 'callup' AND o.status = 'pending' AND o.expires > ? ORDER BY o.created DESC LIMIT 25"
    ).all(n());
    if (!callups.length) {
      await i.reply({ content: 'Não há convocações nacionais pendentes.', ephemeral: true });
      return true;
    }
    const options = callups.map(callup =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`#${callup.id} • ${callup.acronym || 'seleção removida'} • ${callup.player}`.slice(0, 100))
        .setDescription(`Expira <t:${Math.floor(callup.expires / 1000)}:R>`.slice(0, 100))
        .setValue(String(callup.id))
    );
    await i.reply(centralSelectPayload(
      '🇧🇷 Convocações pendentes',
      'Selecione uma convocação para cancelá-la.',
      'central:select:callup-cancel',
      options
    ));
    return true;
  }

  if (i.isStringSelectMenu() &&
      ['central:select:proposal-cancel', 'central:select:free-agent-cancel', 'central:select:callup-cancel'].includes(id)) {
    const selectedId = Number(i.values[0]);
    if (!Number.isSafeInteger(selectedId)) {
      await i.reply({ content: 'Seleção inválida.', ephemeral: true });
      return true;
    }
    if (id === 'central:select:proposal-cancel') {
      const update = db.prepare(
        "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND kind = 'proposal' AND status = 'pending'"
      ).run(n(), i.user.id, selectedId);
      await i.reply({
        content: update.changes ? `Proposta **#${selectedId}** cancelada.` : 'A proposta já não está pendente.',
        ephemeral: true
      });
      return true;
    }
    if (id === 'central:select:callup-cancel') {
      const update = db.prepare(
        "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND kind = 'callup' AND status = 'pending'"
      ).run(n(), i.user.id, selectedId);
      await i.reply({
        content: update.changes ? `Convocação **#${selectedId}** cancelada.` : 'A convocação já não está pendente.',
        ephemeral: true
      });
      return true;
    }
    const listing = db.prepare(
      "SELECT * FROM market_listings WHERE id = ? AND status = 'available'"
    ).get(selectedId);
    if (!listing) {
      await i.reply({ content: 'Esse anúncio já não está ativo.', ephemeral: true });
      return true;
    }
    const update = db.prepare(
      "UPDATE market_listings SET status = 'cancelled', resolved_at = ? WHERE id = ? AND status = 'available'"
    ).run(n(), selectedId);
    if (update.changes) {
      const closed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('Anúncio de agente livre encerrado')
        .setDescription(`<@${listing.user_id}> não está mais disponível na janela de transferências.`)
        .addFields({
          name: '🕒 Encerrado',
          value: `<t:${Math.floor(n() / 1000)}:F>`,
          inline: true
        })
        .setFooter({ text: `Agente livre #${listing.id} • PFL Matchmaker` });
      for (const [channelId, messageId] of [
        [ch.transfer, listing.transfer_message_id],
        [ch.registry, listing.registry_message_id]
      ]) {
        if (!messageId) continue;
        client.channels.fetch(channelId)
          .then(channel => channel?.isTextBased() ? channel.messages.fetch(messageId) : null)
          .then(message => message?.edit({ embeds: [closed], allowedMentions: { parse: [] } }))
          .catch(error => console.error(`Falha ao encerrar anúncio ${listing.id} publicado:`, error));
      }
    }
    await i.reply({
      content: update.changes ? `Anúncio de agente livre **#${selectedId}** encerrado.` : 'Esse anúncio já não está ativo.',
      ephemeral: true
    });
    return true;
  }

  return false;
}

client.on(Events.InteractionCreate, async i => {
  try {
    if ((i.customId?.startsWith('announcement:') ||
         ['central:shouts', 'central:fixtures'].includes(i.customId)) &&
        await handleMatchAnnouncementInteraction(i, { admin })) {
      return;
    }
    if (await handleStatisticsInteraction(i, {
      admin,
      refereeRoleId,
      startRefereeAssignment,
      getPendingRefereeMatches,
      handleCentralAdminInteraction,
      bracketRepository,
      applyStatisticsMarketChanges,
      getPlayerCardData: async (guild, userId) => {
        const member = await guild.members.fetch(userId);
        if (member.user.bot) return { isBot: true };
        const value = playerValue(userId);
        const clubMemberships = db.prepare(
          `SELECT t.name, t.acronym, t.division, m.kind FROM members m
           JOIN teams t ON t.id = m.team_id WHERE m.user_id = ?
           ORDER BY CASE m.kind WHEN 'manager' THEN 0 ELSE 1 END`
        ).all(userId);
        const nationalMemberships = db.prepare(
          `SELECT t.name, t.acronym FROM national_roster r
           JOIN teams t ON t.id = r.team_id WHERE r.player_id = ?
           ORDER BY t.name COLLATE NOCASE`
        ).all(userId);
        const ownedTeams = db.prepare(
          'SELECT * FROM teams WHERE owner = ? OR claimed_by = ? ORDER BY name COLLATE NOCASE'
        ).all(userId, userId);
        const teams = [
          ...ownedTeams.map(current => `${teamDisplayName(current)} — Dono`),
          ...clubMemberships.map(current =>
            `${current.name} (${current.acronym}) — ${current.kind === 'manager' ? 'Gerente' : 'Jogador'} (${divisionLabel(current.division)})`
          ),
          ...nationalMemberships.map(current =>
            `${current.name} (${current.acronym}) — Seleção`
          )
        ];
        return {
          id: userId,
          displayName: member.displayName,
          avatarUrl: member.displayAvatarURL({ size: 256 }),
          teams: [...new Set(teams)],
          marketValue: cash(value),
          division: divisionLabel(marketDivision(value))
        };
      }
    })) return;

    if (i.isAutocomplete()) {
      const focused = i.options.getFocused(true);
      try {
        return i.respond(await teamAutocomplete(i, focused));
      } catch (error) {
        console.error('Falha ao consultar times para autocomplete:', error);
        return i.respond([]);
      }
    }

    if (i.isUserSelectMenu() || i.isStringSelectMenu()) {
      if (!i.customId.startsWith('match-select:')) return;
      const nonce = i.customId.slice('match-select:'.length);
      const pending = pendingMatchInteractions.get(nonce);
      if (!pending || pending.expiresAt <= n()) {
        pendingMatchInteractions.delete(nonce);
        return err(i, 'Esta seleção expirou. Execute o comando novamente.');
      }
      if (i.user.id !== pending.requesterId || i.guildId !== pending.guildId) {
        return err(i, 'Somente quem iniciou esta seleção pode continuar.');
      }
      if (!admin(i)) {
        pendingMatchInteractions.delete(nonce);
        return err(i, 'Apenas administradores podem alterar partidas.');
      }
      if (!activeMatch(pending.matchId)) {
        pendingMatchInteractions.delete(nonce);
        return err(i, 'A partida não existe mais ou já foi encerrada.');
      }

      if (pending.kind === 'referee') {
        const userId = i.values[0];
        const member = await i.guild.members.fetch(userId).catch(() => null);
        if (!member || !member.roles.cache.has(refereeRoleId)) {
          pendingMatchInteractions.delete(nonce);
          return i.update({
            content: '❌ O usuário escolhido não é mais um juiz elegível. Execute o comando novamente.',
            embeds: [],
            components: []
          });
        }
        pending.value = member.id;
        return i.update({
          content: '',
          embeds: [
            matchSelectionEmbed({
              title: '⚖️ Confirme o juiz da partida',
              description: `Juiz escolhido: ${member}\nPartida OFC **#${pending.matchId}**.`,
              matchId: pending.matchId
            })
          ],
          components: [matchConfirmationRow(nonce)]
        });
      }

      if (!i.isStringSelectMenu()) {
        return err(i, 'Esta opção não corresponde ao tipo de seleção solicitado.');
      }

      const selected = i.values[0];
      const validOptions = pending.kind === 'national'
        ? nationalSelections
        : championsSelections;
      if (!validOptions.some(([name]) => name === selected)) {
        pendingMatchInteractions.delete(nonce);
        return i.update({
          content: '❌ A seleção escolhida é inválida. Execute o comando novamente.',
          embeds: [],
          components: []
        });
      }
      pending.value = selected;
      const flag = validOptions.find(([name]) => name === selected)[1];
      return i.update({
        content: '',
        embeds: [
          matchSelectionEmbed({
            title: '⚽ Confirme sua escolha',
            description: `${flag} **${selected}** será associado ao **Time ${pending.side.toUpperCase()}**.`,
            matchId: pending.matchId,
            side: pending.side
          })
        ],
        components: [matchConfirmationRow(nonce)]
      });
    }

    if (i.isButton()) {
      if (i.customId.startsWith('matches-page:')) {
        const [, nonce, rawPage] = i.customId.split(':');
        const state = matchListInteractions.get(nonce);
        const requestedPage = Number(rawPage);
        if (!state || state.kind !== 'matches' || state.expiresAt <= n()) {
          matchListInteractions.delete(nonce);
          return err(i, 'Esta lista expirou. Execute /partidas novamente.');
        }
        if (state.visibility === 'privado' && state.requesterId !== i.user.id) {
          return err(i, 'Somente quem abriu esta lista pode navegar pelas páginas.');
        }
        if (!Number.isInteger(requestedPage) || requestedPage < 0) {
          return err(i, 'Página inválida.');
        }
        const result = queryMatches({
          status: state.status,
          category: state.category,
          competition: state.competition,
          page: requestedPage
        });
        const components = result.pageCount > 1
          ? [matchesPageRow(nonce, result.page, result.pageCount)]
          : [];
        if (components.length === 0) matchListInteractions.delete(nonce);
        return i.update({
          embeds: [matchesPageEmbed({
            ...result,
            status: state.status,
            category: state.category,
            competition: state.competition
          })],
          components
        });
      }

      if (i.customId.startsWith('standings-page:')) {
        const [, nonce, rawPage] = i.customId.split(':');
        const state = matchListInteractions.get(nonce);
        const requestedPage = Number(rawPage);
        if (!state || state.kind !== 'standings' || state.expiresAt <= n()) {
          matchListInteractions.delete(nonce);
          return err(i, 'Esta tabela expirou. Execute /tabela novamente.');
        }
        if (state.requesterId !== i.user.id) {
          return err(i, 'Somente quem abriu esta tabela pode navegar pelas páginas.');
        }
        if (!Number.isInteger(requestedPage) || requestedPage < 0) {
          return err(i, 'Página inválida.');
        }
        const result = standingsPageEmbed(
          state.competition,
          competitionStandings(state.competition),
          requestedPage
        );
        const components = result.pageCount > 1
          ? [standingsPageRow(nonce, result.page, result.pageCount)]
          : [];
        if (components.length === 0) matchListInteractions.delete(nonce);
        return i.update({
          embeds: [result.embed],
          components
        });
      }

      if (i.customId.startsWith('roster-page:')) {
        const [, rawTeamId, rawPage] = i.customId.split(':');
        const teamId = Number(rawTeamId);
        const page = Number(rawPage);
        if (!Number.isSafeInteger(teamId) || !Number.isInteger(page) || page < 0) {
          return err(i, 'Página ou seleção inválida.');
        }
        const selection = db.prepare(
          "SELECT * FROM teams WHERE id = ? AND owner LIKE 'national:%'"
        ).get(teamId);
        if (!selection) return err(i, 'A seleção consultada não está mais cadastrada.');
        const result = rosterPageEmbed(selection, page);
        return i.update({
          embeds: [result.embed],
          components: result.pageCount > 1
            ? [rosterPageRow(teamId, result.page, result.pageCount)]
            : []
        });
      }

      if (i.customId.startsWith('callup:')) {
        const [, callupId, action] = i.customId.split(':');
        const callup = db.prepare(
          "SELECT * FROM offers WHERE id = ? AND kind = 'callup'"
        ).get(Number(callupId));
        if (!callup || callup.status !== 'pending') {
          return err(i, 'Esta convocação já foi respondida, cancelada ou expirou.');
        }
        return resolveCallup(i, callup, action);
      }

      if (i.customId.startsWith('friendly-invite:')) {
        const [, rawInviteId, action] = i.customId.split(':');
        const inviteId = Number(rawInviteId);
        const invite = db.prepare(
          "SELECT * FROM offers WHERE id = ? AND kind = 'friendly'"
        ).get(inviteId);
        if (!invite || invite.status !== 'pending') {
          return err(i, 'Este convite já foi respondido ou não está mais disponível.');
        }
        if (invite.expires && invite.expires <= n()) {
          db.prepare(
            "UPDATE offers SET status = 'expired', resolved_at = ?, resolved_by = 'system' WHERE id = ? AND status = 'pending'"
          ).run(n(), inviteId);
          return i.update({
            content: '⌛ O convite para amistoso expirou.',
            embeds: [],
            components: []
          });
        }

        const invitingTeam = db.prepare(
          'SELECT * FROM teams WHERE id = ?'
        ).get(invite.src);
        const invitedTeam = db.prepare(
          'SELECT * FROM teams WHERE id = ?'
        ).get(invite.dst);
        if (!invitingTeam || !invitedTeam) {
          return err(i, 'Um dos times do convite não está mais cadastrado.');
        }
        if (!canManageTeam(i.member, invitedTeam)) {
          return err(i, 'Somente o dono ou gerente do time convidado pode responder.');
        }
        if (action === 'no') {
          const declined = db.prepare(
            "UPDATE offers SET status = 'declined', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
          ).run(n(), i.user.id, inviteId);
          if (!declined.changes) {
            return err(i, 'Este convite já foi respondido por outra pessoa.');
          }
          return i.update({
            content: '',
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('Convite de amistoso recusado')
                .setDescription(
                  `**${invitedTeam.name} (${invitedTeam.acronym})** recusou o convite.\n` +
                  `Os dados do Roblox e do servidor não foram divulgados.`
                )
                .setTimestamp()
            ],
            components: []
          });
        }
        if (action !== 'yes') return err(i, 'Resposta inválida para este convite.');

        let matchId;
        try {
          matchId = db.transaction(() => {
            const accepted = db.prepare(
              "UPDATE offers SET status = 'accepted', resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'"
            ).run(n(), i.user.id, inviteId);
            if (!accepted.changes) throw new Error('FRIENDLY_INVITE_ALREADY_RESOLVED');
            const inserted = db.prepare(
              "INSERT INTO matches (ref, type, a, b, competition, scheduled_at, status, created) VALUES (?, 'friendly', ?, ?, 'Amistoso', ?, 'pending', ?)"
            ).run(
              `friendly-invite:${inviteId}`,
              invitingTeam.id,
              invitedTeam.id,
              invite.scheduled_at,
              n()
            );
            return Number(inserted.lastInsertRowid);
          })();
        } catch (error) {
          if (error.message === 'FRIENDLY_INVITE_ALREADY_RESOLVED') {
            return err(i, 'Este convite já foi respondido por outra pessoa.');
          }
          throw error;
        }

        const scheduleText = invite.scheduled_at
          ? `**Horário:** ${formatBrasiliaSchedule(invite.scheduled_at)} (Brasília, UTC-3)\n`
          : '**Horário:** agora\n';
        const acceptedEmbed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ Amistoso aceito')
          .setDescription(
            `**${invitingTeam.name} (${invitingTeam.acronym}) x ${invitedTeam.name} (${invitedTeam.acronym})**\n\n` +
            `Aceito por ${i.user} em nome de **${invitedTeam.name}**.\n` +
            `${scheduleText}` +
            `Partida registrada como **#${matchId}**.`
          )
          .addFields(
            { name: 'Usuário Roblox', value: `\`${invite.roblox_username}\``, inline: true },
            { name: 'Servidor', value: invite.server_url, inline: true }
          )
          .setTimestamp();
        let registrationNotice = '';
        if (invitingTeam.division === 1 || invitedTeam.division === 1) {
          try {
            await publishFriendlyRegistration(
              matchId,
              invitingTeam,
              invitedTeam,
              invite
            );
          } catch (error) {
            console.error(`Amistoso #${matchId} aceito, mas falhou seu registro no canal ${ch.registry}:`, error);
            registrationNotice = ' Não consegui publicar o registro no canal configurado; avise um administrador.';
          }
        }
        return i.update({
          content: `✅ O amistoso foi aceito por ${i.user}.${registrationNotice}`,
          embeds: [acceptedEmbed],
          components: []
        });
      }

      if (i.customId.startsWith('judge-list-page:')) {
        const [, nonce, rawPage] = i.customId.split(':');
        const pending = pendingMatchInteractions.get(nonce);
        const page = Number(rawPage);
        if (!pending || pending.kind !== 'referee' ||
            pending.expiresAt <= n() || i.user.id !== pending.requesterId) {
          return err(i, 'Esta seleção expirou ou pertence a outro usuário.');
        }
        if (!admin(i)) {
          pendingMatchInteractions.delete(nonce);
          return err(i, 'Apenas administradores podem alterar partidas.');
        }
        if (!Number.isInteger(page) || page < 0) {
          return err(i, 'Página inválida.');
        }
        const members = await fetchJudges(i.guild);
        const picker = judgePickerComponents(nonce, members, page);
        return i.update({
          embeds: [
            matchSelectionEmbed({
              title: '⚖️ Designar juiz',
              description: `Selecione um dos juízes elegíveis (página ${picker.page + 1}/${picker.pageCount}). A elegibilidade será confirmada novamente antes de salvar.`,
              matchId: pending.matchId
            })
          ],
          components: picker.components
        });
      }

      if (i.customId.startsWith('judges-page:')) {
        if (!i.guild) return err(i, 'A lista só pode ser consultada dentro do servidor.');
        const page = Number(i.customId.slice('judges-page:'.length));
        if (!Number.isInteger(page) || page < 0) {
          return err(i, 'Página inválida.');
        }
        const members = await fetchJudges(i.guild);
        const result = judgesPageEmbed(members, page);
        return i.update({
          embeds: [result.embed],
          components: result.pageCount > 1
            ? [judgesPageRow(result.page, result.pageCount)]
            : []
        });
      }

      if (i.customId.startsWith('match-cancel:')) {
        const nonce = i.customId.slice('match-cancel:'.length);
        const pending = pendingMatchInteractions.get(nonce);
        if (!pending || i.user.id !== pending.requesterId) {
          return err(i, 'Esta seleção expirou ou pertence a outro usuário.');
        }
        pendingMatchInteractions.delete(nonce);
        return i.update({
          content: 'Seleção cancelada. Nenhuma alteração foi salva.',
          embeds: [],
          components: []
        });
      }

      if (i.customId.startsWith('match-confirm:')) {
        const nonce = i.customId.slice('match-confirm:'.length);
        const pending = pendingMatchInteractions.get(nonce);
        if (!pending || pending.expiresAt <= n()) {
          pendingMatchInteractions.delete(nonce);
          return err(i, 'Esta seleção expirou. Execute o comando novamente.');
        }
        if (i.user.id !== pending.requesterId || i.guildId !== pending.guildId) {
          return err(i, 'Somente quem iniciou esta seleção pode confirmá-la.');
        }
        if (!admin(i)) {
          pendingMatchInteractions.delete(nonce);
          return err(i, 'Apenas administradores podem alterar partidas.');
        }
        if (!pending.value) {
          return err(i, 'Escolha uma opção antes de confirmar.');
        }

        const match = activeMatch(pending.matchId);
        if (!match) {
          pendingMatchInteractions.delete(nonce);
          return err(i, 'A partida não existe mais ou já foi encerrada.');
        }

        if (pending.kind === 'referee') {
          const member = await i.guild.members.fetch(pending.value).catch(() => null);
          if (!member || !member.roles.cache.has(refereeRoleId)) {
            pendingMatchInteractions.delete(nonce);
            return i.update({
              content: '❌ O juiz perdeu o cargo antes da confirmação. Nenhuma alteração foi salva.',
              embeds: [],
              components: []
            });
          }

          const channel = await client.channels.fetch(pending.channelId);
          if (!channel?.isTextBased() || typeof channel.send !== 'function') {
            return err(i, 'Não encontrei um canal de texto válido para publicar o juiz.');
          }

          const saved = db.prepare(
            "UPDATE matches SET referee_id = ? WHERE id = ? AND status = 'pending'"
          ).run(member.id, pending.matchId);
          if (saved.changes === 0) {
            pendingMatchInteractions.delete(nonce);
            return err(i, 'A partida não existe mais ou já foi encerrada.');
          }

          pendingMatchInteractions.delete(nonce);
          try {
            await channel.send({
              content:
                `**⚖️ JUIZ SELECIONADO**\n\n` +
                `👨‍⚖️ Juiz responsável: <@${member.id}>\n\n` +
                `O usuário selecionado será responsável por apitar esta partida **#${pending.matchId}**.\n\n` +
                `<@&${refereeRoleId}> — atenção, equipe de arbitragem! O juiz selecionado vai apitar este jogo.`,
              allowedMentions: {
                users: [member.id],
                roles: [refereeRoleId]
              }
            });
          } catch (error) {
            console.error('Falha ao publicar o juiz selecionado:', error);
            return i.update({
              content: `O juiz foi salvo na partida **#${pending.matchId}**, mas não consegui publicar a mensagem neste canal. Verifique as permissões de envio e menção do bot.`,
              embeds: [],
              components: []
            });
          }
          return i.update({
            content: `✅ ${member} foi salvo como juiz responsável pela partida **#${pending.matchId}** e a mensagem foi publicada.`,
            embeds: [],
            components: []
          });
        }

        const column = `${pending.kind === 'national' ? 'national' : 'champions'}_${pending.side}`;
        const saved = db.prepare(
          `UPDATE matches SET ${column} = ? WHERE id = ? AND status = 'pending'`
        ).run(pending.value, pending.matchId);
        if (saved.changes === 0) {
          pendingMatchInteractions.delete(nonce);
          return err(i, 'A partida não existe mais ou já foi encerrada.');
        }

        pendingMatchInteractions.delete(nonce);
        const values = pending.kind === 'national'
          ? nationalSelections
          : championsSelections;
        const flag = values.find(([name]) => name === pending.value)?.[1] || '';
        return i.update({
          content: '',
          embeds: [
            matchSelectionEmbed({
              title: '✅ Seleção confirmada',
              description: `${flag} **${pending.value}** foi associado ao **Time ${pending.side.toUpperCase()}** da partida.`,
              matchId: pending.matchId,
              side: pending.side
            })
          ],
          components: []
        });
      }

      if (i.customId.startsWith('proposal:')) {
        const [, proposalId, action] = i.customId.split(':');
        const proposal = db.prepare(
          "SELECT * FROM offers WHERE id = ? AND kind = 'proposal'"
        ).get(Number(proposalId));

        if (!proposal || proposal.status !== 'pending') {
          return err(i, 'Esta proposta já foi respondida, cancelada ou expirou.');
        }

        return resolveProposal(i, proposal, action);
      }

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
        const marketListing = db.prepare(
          "SELECT id FROM market_listings WHERE user_id = ? AND status = 'available'"
        ).get(o.player);
        if (marketListing) {
          db.prepare(
            "UPDATE market_listings SET status = 'signed', resolved_at = ? WHERE id = ? AND status = 'available'"
          ).run(n(), marketListing.id);
        }

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
        return marketListing?.id ?? null;
      });

      let marketListingId;
      try {
        marketListingId = transfer();
      } catch (e) {
        if (e.message === 'OFFER_ALREADY_RESOLVED') {
          return err(i, 'Oferta já resolvida.');
        }

        throw e;
      }
      await i.update({
        content: `Transferência concluída: <@${o.player}> agora está em **${dst.name}**.`,
        embeds: [],
        components: []
      });
      if (marketListingId) await closeMarketListing(marketListingId, dst);
      return;
    }

    if (!i.isChatInputCommand()) return;

    const c = i.commandName;
    if (i.inGuild() && !ADMIN_ONLY_SLASH_COMMANDS.has(c)) {
      const block = db.prepare(
        'SELECT description FROM command_blocks WHERE guild_id = ? AND command_name = ?'
      ).get(i.guildId, c);
      if (block) {
        return i.reply({
          content: block.description || `O comando **/${c}** está temporariamente bloqueado.`,
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }
    }

    if (await handleMatchAnnouncementInteraction(i, { admin })) return;

    if (c === 'central') {
      if (!i.inGuild()) return err(i, 'Use `/central` dentro do servidor.');
      if (!admin(i)) {
        return i.reply({
          content: 'A Central administrativa é exclusiva para administradores. Como dono de um time, você pode contribuir com o caixa por aqui:',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('central:money-donate')
                .setLabel('Doar para meu time')
                .setStyle(ButtonStyle.Success)
            )
          ],
          ephemeral: true
        });
      }
      return i.reply(centralPanel());
    }

    if (c === 'panel') {
      if (!i.inGuild()) return err(i, 'Use `/panel` dentro do servidor.');
      await i.deferReply({ ephemeral: true });
      let commands;
      try {
        commands = await i.guild.commands.fetch();
      } catch (error) {
        console.error('Falha ao carregar os comandos para /panel:', error);
        return i.editReply('Não consegui carregar a lista de comandos. Verifique as permissões do bot e tente novamente.');
      }
      const entries = [...commands.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map(command => `**/${command.name}** — ${command.description || 'Sem descrição.'}`);
      if (entries.length === 0) {
        return i.editReply('Nenhum comando slash foi encontrado neste servidor. Publique-os com `npm run register`.');
      }
      const pages = [];
      let page = '';
      for (const entry of entries) {
        if (page && `${page}\n${entry}`.length > 3500) {
          pages.push(page);
          page = '';
        }
        page = page ? `${page}\n${entry}` : entry;
      }
      if (page) pages.push(page);
      return i.editReply({
        embeds: pages.map((description, index) =>
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`📚 Painel de comandos${pages.length > 1 ? ` • ${index + 1}/${pages.length}` : ''}`)
            .setDescription(description)
            .setFooter({ text: `${entries.length} comandos disponíveis` })
        )
      });
    }

    else if (c === 'free-agency') {
      if (!i.inGuild()) return err(i, 'Use `/free-agency` dentro do servidor.');
      const description = i.options.getString('descricao').trim();
      const robloxUsername = i.options.getString('nick_roblox').trim();
      const role = i.options.getString('funcao');
      const position = i.options.getString('posicao');
      const isAdmin = Boolean(admin(i));
      if (!description) return err(i, 'Informe uma descrição para o anúncio.');
      if (!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)) {
        return err(i, 'Informe um nick Roblox válido (3 a 20 letras, números ou _).');
      }
      if (!['player', 'manager'].includes(role)) {
        return err(i, 'A função precisa ser jogador ou gerente.');
      }
      if (role === 'manager' && position) {
        return err(i, 'Gerentes não podem informar posição. Remova a posição e tente novamente.');
      }
      if (role === 'player' && !position) {
        return err(i, 'A posição é obrigatória para jogador. Escolha GK, MC, ATK ou CB.');
      }
      if (position && !['GK', 'MC', 'ATK', 'CB'].includes(position)) {
        return err(i, 'A posição precisa ser GK, MC, ATK ou CB.');
      }

      const cooldownDuration = 30 * 60 * 1000;
      let cooldownClaim = null;
      if (!isAdmin) {
        const attemptedAt = Date.now();
        const claim = db.transaction(() => {
          const previous = db.prepare(
            'SELECT last_used FROM free_agency_cooldowns WHERE user_id = ?'
          ).get(i.user.id);
          const remaining = previous
            ? cooldownDuration - (attemptedAt - previous.last_used)
            : 0;
          if (remaining > 0) return { remaining };

          db.prepare(
            `INSERT INTO free_agency_cooldowns (user_id, last_used) VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET last_used = excluded.last_used`
          ).run(i.user.id, attemptedAt);
          return {
            claimedAt: attemptedAt,
            previousLastUsed: previous?.last_used ?? null
          };
        })();
        if (claim.remaining) {
          const minutes = Math.floor(claim.remaining / 60_000);
          const seconds = Math.ceil((claim.remaining % 60_000) / 1000);
          return err(i, `Você poderá publicar outro anúncio em ${minutes}min ${seconds}s. O intervalo é de 30 minutos.`);
        }
        cooldownClaim = claim;
      }

      const marketValue = playerValue(i.user.id);
      await i.deferReply({ ephemeral: true });
      const { listing, created } = saveFreeAgencyListing(i.user.id, role, marketValue, {
        description,
        robloxUsername,
        position
      });
      const outcomes = await publishMarketListing(listing, [
        ['agentes livres', ch.freeAgency, 'registry_message_id']
      ]);
      const freeAgencyPublished = outcomes[0]?.sent;
      const result = created ? 'publicado' : 'atualizado';
      let response = `✅ Seu anúncio foi ${result} no canal de agentes livres.`;
      if (freeAgencyPublished) {
        response += ` Ele está em <#${ch.freeAgency}>.`;
      } else {
        response = 'O anúncio foi salvo no sistema, mas não consegui publicar/atualizar a mensagem no canal de agentes livres. Avise um administrador.';
      }
      return i.editReply(response);
    }

    else if (c === 'ver_juizes') {
      if (!i.inGuild()) return err(i, 'Use este comando dentro do servidor.');
      const members = await fetchJudges(i.guild);
      const result = judgesPageEmbed(members, 0);
      return i.reply({
        embeds: [result.embed],
        components: result.pageCount > 1
          ? [judgesPageRow(result.page, result.pageCount)]
          : []
      });
    }

    else if (c === 'partidas') {
      const category = i.options.getString('categoria');
      const status = i.options.getString('status') || 'pending';
      const competition = i.options.getString('competicao');
      const visibility = i.options.getString('visibilidade');
      if (!['champions', 'brasileirao', 'copa-do-mundo'].includes(category)) {
        return err(i, 'Escolha Brasileirão, Copa do Mundo ou Champions League.');
      }
      if (!['publico', 'privado'].includes(visibility)) {
        return err(i, 'Escolha a visibilidade pública ou privada.');
      }
      if (visibility === 'privado' && !admin(i)) {
        return err(i, 'A visibilidade privada está disponível somente para administradores.');
      }
      cleanExpiredMatchViews();
      const result = queryMatches({ status, category, competition, page: 0 });
      const nonce = i.id;
      if (result.pageCount > 1) {
        matchListInteractions.set(nonce, {
          kind: 'matches',
          status,
          category,
          competition,
          visibility,
          requesterId: i.user.id,
          expiresAt: n() + 15 * 60 * 1000
        });
      }
      return i.reply({
        ephemeral: visibility === 'privado',
        embeds: [matchesPageEmbed({
          ...result,
          status,
          category,
          competition
        })],
        components: result.pageCount > 1
          ? [matchesPageRow(nonce, result.page, result.pageCount)]
          : []
      });
    }

    else if (c === 'tabela') {
      const competition = i.options.getString('competicao');
      if (!competition?.trim()) {
        return err(i, 'Escolha uma competição registrada no autocomplete.');
      }
      cleanExpiredMatchViews();
      const standings = competitionStandings(competition.trim());
      const result = standingsPageEmbed(competition.trim(), standings, 0);
      const nonce = i.id;
      if (result.pageCount > 1) {
        matchListInteractions.set(nonce, {
          kind: 'standings',
          competition: competition.trim(),
          requesterId: i.user.id,
          expiresAt: n() + 15 * 60 * 1000
        });
      }
      return i.reply({
        embeds: [result.embed],
        components: result.pageCount > 1
          ? [standingsPageRow(nonce, result.page, result.pageCount)]
          : []
      });
    }

    else if (c === 'elenco_selecao') {
      const selection = team(i.options.getString('selecao'));
      if (!selection || !selection.owner.startsWith('national:')) {
        return err(i, 'Escolha uma seleção nacional cadastrada.');
      }
      const result = rosterPageEmbed(selection, 0);
      return i.reply({
        embeds: [result.embed],
        components: result.pageCount > 1
          ? [rosterPageRow(selection.id, result.page, result.pageCount)]
          : []
      });
    }

    else if (c === 'selecionar_selecao' ||
        c === 'selecionar_champions_team') {
      if (!i.inGuild()) return err(i, 'Use este comando dentro do servidor.');
      if (!admin(i)) return err(i, 'Apenas administradores podem alterar partidas.');

      const matchId = i.options.getInteger('partida');
      const match = activeMatch(matchId);
      if (!match) {
        return err(i, `Não encontrei uma partida OFC pendente com o ID **#${matchId}**.`);
      }

      for (const [nonce, pending] of pendingMatchInteractions) {
        if (pending.expiresAt <= n()) pendingMatchInteractions.delete(nonce);
      }

      const nonce = i.id;
      const pending = {
        kind: c === 'selecionar_selecao' ? 'national' : 'champions',
        matchId,
        side: i.options.getString('lado'),
        requesterId: i.user.id,
        guildId: i.guildId,
        channelId: i.channelId,
        expiresAt: n() + 15 * 60 * 1000
      };
      pendingMatchInteractions.set(nonce, pending);

      const side = pending.side;
      const choices = pending.kind === 'national'
        ? nationalSelections
        : championsSelections;
      const title = pending.kind === 'national'
        ? '🌍 Seleção nacional da partida'
        : '🏆 Clube da Champions League';
      return i.reply({
        ephemeral: true,
        embeds: [
          matchSelectionEmbed({
            title,
            description: `Selecione o clube ou seleção que será associado ao **Time ${side.toUpperCase()}**.`,
            matchId,
            side
          })
        ],
        components: [matchSelectionRow(nonce, choices)]
      });
    }

    else if (c === 'convocar') {
      if (!i.inGuild()) {
        return err(i, 'Use /convocar dentro do servidor. A convocação será enviada por DM ao jogador.');
      }
      const player = i.options.getUser('jogador');
      const selection = team(i.options.getString('selecao'));
      if (!player || player.bot || player.id === i.user.id) {
        return err(i, 'Escolha outro usuário válido para receber a convocação.');
      }
      if (!selection || !selection.owner.startsWith('national:')) {
        return err(i, 'Escolha uma seleção nacional cadastrada.');
      }

      const isAdmin = Boolean(admin(i));
      const president = db.prepare(
        'SELECT president_id FROM national_presidents WHERE team_id = ?'
      ).get(selection.id);
      if (!selection.claimed_by ||
          president?.president_id !== selection.claimed_by) {
        return err(
          i,
          `${selection.name} ainda não tem um dono/presidente vinculado. Só é possível convocar jogadores para uma seleção assumida.`
        );
      }
      if (!canConvocar(i.user.id, president?.president_id, isAdmin)) {
        return err(
          i,
          `Você não está autorizado a convocar jogadores para ${selection.name}. Somente o presidente vinculado a essa seleção ou um administrador pode usar este comando.`
        );
      }

      let guildMember;
      try {
        guildMember = await i.guild.members.fetch(player.id);
      } catch (error) {
        if (error.code === 10007) {
          return err(i, 'O jogador precisa ser membro deste servidor para receber a convocação.');
        }
        console.error('Falha ao consultar o jogador convocado:', error);
        return err(i, 'Não consegui consultar o jogador. Verifique as permissões do bot.');
      }

      const alreadyCalled = db.prepare(
        'SELECT 1 FROM national_roster WHERE team_id = ? AND player_id = ?'
      ).get(selection.id, player.id);
      if (alreadyCalled) {
        return err(i, `Esse jogador já faz parte do elenco de ${selection.name}.`);
      }
      const activeCallup = db.prepare(
        "SELECT 1 FROM offers WHERE kind = 'callup' AND dst = ? AND player = ? AND status = 'pending' AND expires > ?"
      ).get(selection.id, player.id, n());
      if (activeCallup) {
        return err(i, `Já existe uma convocação pendente para esse jogador em ${selection.name}.`);
      }

      const presidentName = i.user.username;
      const created = n();
      const expires = created + 7 * 24 * 60 * 60 * 1000;
      const inserted = db.prepare(
        "INSERT INTO offers (ref, dst, player, price, kind, created_by, status, created, expires, team_name, team_acronym) VALUES (?, ?, ?, 0, 'callup', ?, 'pending', ?, ?, ?, ?)"
      ).run(
        `callup:${i.id}`,
        selection.id,
        player.id,
        i.user.id,
        created,
        expires,
        selection.name,
        selection.acronym
      );
      const callupId = Number(inserted.lastInsertRowid);
      const adminOverride = isAdmin && president?.president_id !== i.user.id;
      const responsibleLabel = adminOverride
        ? 'Administrador responsável'
        : 'Presidente responsável';
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`callup:${callupId}:yes`)
          .setLabel('Aceitar convocação')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`callup:${callupId}:no`)
          .setLabel('Recusar convocação')
          .setStyle(ButtonStyle.Danger)
      );
      const embed = new EmbedBuilder()
        .setColor(0x1f8b4c)
        .setTitle('Convocação para a Seleção')
        .setAuthor({
          name: `Convocação enviada por ${presidentName}`,
          iconURL: i.user.displayAvatarURL()
        })
        .setDescription(
          `${nationalFlags[selection.acronym] || '🌍'} **${selection.name}** convoca você para representar a seleção.\n\n` +
          `👑 ${responsibleLabel}: ${i.user}\n` +
          `⚽ Jogador convocado: <@${player.id}>\n\n` +
          `Ao aceitar, você entrará no elenco registrado da seleção. Esta convocação vale por 7 dias.`
        )
        .setFooter({ text: `Convocação #${callupId}` })
        .setTimestamp();

      await i.deferReply({ ephemeral: true });
      try {
        await player.send({
          content: `<@${player.id}>`,
          embeds: [embed],
          components: [buttons],
          allowedMentions: { users: [player.id] }
        });
      } catch (error) {
        console.error(`Falha ao enviar a convocação #${callupId} por DM:`, error);
        db.prepare(
          "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = 'system' WHERE id = ? AND status = 'pending'"
        ).run(n(), callupId);
        return i.editReply('Não consegui enviar a DM ao jogador. A convocação foi cancelada sem alterar o elenco.');
      }

      if (adminOverride) {
        log(
          i.guild,
          `Convocação #${callupId} enviada por administrador ${i.user} (${i.user.id}) para ${selection.acronym}; jogador ${player.id}.`
        );
      }
      return i.editReply(
        `Convocação #${callupId} enviada por DM para ${player} em nome de ${selection.name}. Nenhuma alteração no elenco ocorre até o aceite.`
      );
    }

    else if (c === 'home-away') {
      const side = Math.random() < 0.5 ? 'Home' : 'Away';
      return i.reply(`🏟️ **${side} começa!**`);
    }

    else if (c === 'ownar-team' || c === 'criar') {
      if (c === 'criar' && i.options.getSubcommand() !== 'team') {
        return err(i, 'Use `/criar team` para registrar seu time.');
      }
      if (!i.inGuild()) return err(i, 'Use este comando dentro do servidor.');
      if (i.channelId !== ch.create) {
        return err(i, `Use no canal <#${ch.create}>.`);
      }
      if (!i.member.roles.cache.has(ownTeamRoleId)) {
        return err(i, `Somente quem tem o cargo <@&${ownTeamRoleId}> pode criar um time.`);
      }

      const name = i.options.getString('nome').trim();
      const a = i.options.getString('sigla').toUpperCase();
      const desc = i.options.getString('descricao');
      const invite = i.options.getString('convite');
      const crest = i.options.getString('escudo');

      if (!/^[A-Z]{3}$/.test(a)) {
        return err(i, 'Sigla precisa ter 3 letras.');
      }
      if (crest && !isHttpUrl(crest)) {
        return err(i, 'Informe uma URL HTTP ou HTTPS válida para o escudo.');
      }

      // Validação corrigida do link de convite.
      if (!/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(invite)) {
        return err(i, 'Link de convite Discord inválido.');
      }

      if (owner(i.user.id)) {
        return err(i, 'Você já é dono de um time.');
      }

      let teamId;
      try {
        const x = db.prepare(
          'INSERT INTO teams (name, acronym, description, invite, crest, owner, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(name, a, desc, invite, crest, i.user.id, n());
        teamId = Number(x.lastInsertRowid);
      } catch (e) {
        console.error(e);
        return err(i, 'Não consegui criar o time. Verifique se a sigla já está sendo usada.');
      }

      const t = db.prepare(
        'SELECT * FROM teams WHERE id = ?'
      ).get(teamId);
      try {
        await teamRoles(i.guild, t);
      } catch (error) {
        console.error(`Falha ao criar cargos para ${a}:`, error);
        db.prepare('DELETE FROM teams WHERE id = ? AND owner = ?')
          .run(teamId, i.user.id);
        return err(i, 'Não consegui criar ou entregar os cargos do time. Confira a permissão Manage Roles e a posição do cargo do bot; o cadastro foi desfeito.');
      }

      let startingBalanceGranted = false;
      try {
        startingBalanceGranted = grantTeamStartingBalance(teamId);
      } catch (error) {
        console.error(`Falha ao conceder saldo inicial ao cofre de ${a}:`, error);
      }

      const e = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('⚽ Time criado')
        .setDescription(
          `**${name} (${a})**\n` +
          `${desc}\n` +
          `Dono: ${i.user}\n` +
          `Saldo: ${cash(startingBalanceGranted ? TEAM_STARTING_BALANCE : 0)}\n` +
          `[Convite](${invite})`
        )
        .setTimestamp();

      if (crest) e.setThumbnail(crest);
      let registrationPublished = false;
      try {
        await publishTeamOwnershipRegistration(t, i.user.id);
        registrationPublished = true;
      } catch (error) {
        console.error(`Time ${a} criado, mas falhou seu registro no canal ${ch.registry}:`, error);
      }
      await i.reply({ embeds: [e] });
      log(i.guild, `Time criado ${name} (${a}), dono ${i.user}.`);
      const setupWarnings = [];
      if (!startingBalanceGranted) {
        setupWarnings.push('Não consegui creditar o saldo inicial de 1,5 bilhão no cofre; avise um administrador.');
      }
      if (!registrationPublished) {
        setupWarnings.push('O time foi criado, mas não consegui publicar o registro no canal configurado. Avise um administrador.');
      }
      if (setupWarnings.length > 0) {
        return i.followUp({
          content: setupWarnings.join('\n'),
          ephemeral: true
        });
      }
    }

    else if (
      c === 'selecionar-team' ||
      c === 'selecionar-team-champions' ||
      c === 'selecionar-selecao'
    ) {
      if (!i.inGuild()) return err(i, 'Use este comando dentro do servidor.');
      const isNational = c === 'selecionar-selecao';
      const isChampions = c === 'selecionar-team-champions';
      const division = isNational ? 1 : marketDivision(playerValue(i.user.id));
      const selection = isNational
        ? nationalTeams.find(([, acronym]) =>
          acronym === i.options.getString('selecao')
        )
        : isChampions
          ? championsClubs.find(([name]) =>
            name === i.options.getString('clube')
          )
          : clubs.includes(i.options.getString('clube'))
            ? [i.options.getString('clube'), acr[i.options.getString('clube')]]
            : null;
      if (!selection) return err(i, 'Essa opção não corresponde a um time disponível.');

      const [rawSelectedName, rawSelectedAcronym] = selection;
      const selectedAcronym = isNational
        ? rawSelectedAcronym
        : teamDivisionAcronym(rawSelectedAcronym, division);
      const selectedName = isNational
        ? nationalDisplayNames[selectedAcronym] || rawSelectedName
        : rawSelectedName;
      let nationalOwners = null;
      if (isNational) {
        try {
          nationalOwners = await nationalOwnerStatus(i.guild);
        } catch (error) {
          console.error('Não foi possível consultar os cargos de dono das seleções:', error);
          return err(i, 'Não consegui confirmar quais seleções estão livres. Tente novamente.');
        }
      }
      if (owner(i.user.id)) {
        return err(i, 'Você já é dono de um time ou seleção.');
      }

      let owners = null;
      if (!isNational) {
        try {
          owners = await clubOwnerStatus(
            i.guild,
            isChampions ? 'champions' : 'brazil',
            division
          );
        } catch (error) {
          console.error('Não foi possível verificar os cargos de dono:', error);
          return err(i, 'Não consegui confirmar se o clube está livre. Tente novamente.');
        }
        if (owners.get(selectedName)) {
          return err(i, 'Esse time já tem dono ou alguém com o cargo de Dono.');
        }
      }

      const clubKey = isNational
        ? null
        : divisionClubKey(isChampions ? 'champions' : 'brazil', selectedName, division);
      const existing = isNational
        ? db.prepare(
          "SELECT * FROM teams WHERE acronym = ? AND owner LIKE 'national:%'"
        ).get(selectedAcronym)
        : db.prepare('SELECT * FROM teams WHERE club = ?').get(clubKey);
      if (!existing && isNational) {
        return err(i, 'A seleção escolhida não está cadastrada.');
      }
      if (isNational && nationalOwners.get(selectedAcronym)) {
        return err(i, 'Essa seleção já tem alguém com o cargo de Dono.');
      }
      if (isNational && existing.claimed_by) {
        return err(i, 'Essa seleção já tem dono.');
      }
      const previousPresident = isNational
        ? db.prepare(
          'SELECT president_id, updated_by, updated_at FROM national_presidents WHERE team_id = ?'
        ).get(existing.id)
        : null;

      if (!isNational && !isChampions) {
        const acronymConflict = db.prepare(
          'SELECT id FROM teams WHERE acronym = ? AND (club IS NULL OR club <> ?)'
        ).get(selectedAcronym, clubKey);
        if (acronymConflict) {
          return err(i, `A sigla ${selectedAcronym} já está em uso por outro time.`);
        }
      }

      let teamId;
      try {
        teamId = db.transaction(() => {
          if (owner(i.user.id)) throw new Error('TEAM_OWNER_EXISTS');
          if (isNational) {
            const updated = db.prepare(
              'UPDATE teams SET claimed_by = ? WHERE id = ? AND claimed_by IS NULL'
            ).run(i.user.id, existing.id);
            if (updated.changes === 0) throw new Error('TEAM_ALREADY_CLAIMED');
            db.prepare(
              'INSERT INTO national_presidents (team_id, president_id, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(team_id) DO UPDATE SET president_id = excluded.president_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at'
            ).run(existing.id, i.user.id, i.user.id, n());
            return existing.id;
          }
          if (existing) {
            const placeholder = isChampions ? 'champions:%' : 'brazil:%';
            const updated = db.prepare(
              'UPDATE teams SET owner = ? WHERE id = ? AND owner LIKE ?'
            ).run(i.user.id, existing.id, placeholder);
            if (updated.changes === 0) throw new Error('TEAM_ALREADY_CLAIMED');
            return existing.id;
          }
          const inserted = db.prepare(
            'INSERT INTO teams (name, acronym, description, invite, owner, created, club, division) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(
            selectedName,
            selectedAcronym,
            `Clube ${selectedName}`,
            'https://discord.com',
            i.user.id,
            n(),
            clubKey,
            division
          );
          return Number(inserted.lastInsertRowid);
        })();
      } catch (error) {
        if (error.message === 'TEAM_OWNER_EXISTS') {
          return err(i, 'Você já é dono de um time.');
        }
        if (error.message === 'TEAM_ALREADY_CLAIMED' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return err(i, 'Esse time acabou de ser escolhido por outra pessoa.');
        }
        throw error;
      }

      const selectedTeam = db.prepare(
        'SELECT * FROM teams WHERE id = ?'
      ).get(teamId);
      try {
        await teamRoles(i.guild, selectedTeam);
      } catch (error) {
        console.error(`Falha ao criar ou conceder os cargos de ${selectedAcronym}:`, error);
        db.transaction(() => {
          if (isNational) {
            db.prepare(
              'UPDATE teams SET claimed_by = NULL WHERE id = ? AND claimed_by = ?'
            ).run(teamId, i.user.id);
            if (previousPresident) {
              db.prepare(
                'INSERT INTO national_presidents (team_id, president_id, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(team_id) DO UPDATE SET president_id = excluded.president_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at'
              ).run(
                teamId,
                previousPresident.president_id,
                previousPresident.updated_by,
                previousPresident.updated_at
              );
            } else {
              db.prepare(
                'DELETE FROM national_presidents WHERE team_id = ?'
              ).run(teamId);
            }
          } else if (isChampions) {
            db.prepare(
              'UPDATE teams SET owner = ? WHERE id = ? AND owner = ?'
            ).run(`champions:${selectedAcronym.toLowerCase()}`, teamId, i.user.id);
          } else {
            db.prepare(
              'UPDATE teams SET owner = ? WHERE id = ? AND owner = ?'
            ).run(`brazil:${selectedAcronym.toLowerCase()}`, teamId, i.user.id);
          }
        })();
        return err(i, 'Não consegui criar ou entregar os cargos do time. Confira a permissão Manage Roles e a posição do cargo do bot; a escolha foi desfeita.');
      }

      let startingBalanceGranted = false;
      try {
        startingBalanceGranted = grantTeamStartingBalance(teamId);
      } catch (error) {
        console.error(`Falha ao conceder saldo inicial ao cofre de ${selectedAcronym}:`, error);
      }

      let registrationPublished = true;
      try {
        await publishTeamOwnershipRegistration(selectedTeam, i.user.id);
      } catch (error) {
        registrationPublished = false;
        console.error(`Dono de ${selectedAcronym} definido, mas falhou seu registro no canal ${ch.registry}:`, error);
      }
      const ownerRole = i.guild.roles.cache.find(
        role => role.name === `${selectedAcronym} | Dono`
      );
      const roleNames = [
        `${selectedAcronym} | Dono`,
        `${selectedAcronym} | Gerente`,
        `${selectedAcronym} | Jogador`
      ];
      const setupWarnings = [];
      if (!startingBalanceGranted) {
        setupWarnings.push('Não consegui creditar o saldo inicial de 1,5 bilhão no cofre; avise um administrador.');
      }
      if (!registrationPublished) {
        setupWarnings.push('Não consegui publicar o registro no canal configurado; avise um administrador.');
      }
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(isNational ? '🌍 Seleção escolhida' : '🏆 Clube escolhido')
            .setDescription(
              `Você agora é dono de **${selectedName} (${selectedAcronym})**${ownerRole ? ` e recebeu <@&${ownerRole.id}>` : ''}${isNational ? '' : ` e o cargo **${divisionLabel(division)}**`}.\n\n` +
              `Saldo inicial do cofre: ${cash(startingBalanceGranted ? TEAM_STARTING_BALANCE : 0)}.\n` +
              `Cargos disponíveis para o elenco: ${roleNames.slice(1).map(name => `\`${name}\``).join(' e ')}.\n` +
              `Para clubes, use \`/proposta\` nos fluxos de transferência. Para seleções, use \`/convocar\` para chamar jogadores. A gestão de cargos é feita por administradores com \`/gerenciar-time\`.` +
              `${setupWarnings.length > 0 ? `\n\n⚠️ ${setupWarnings.join('\n⚠️ ')}` : ''}`
            )
        ],
        ephemeral: true
      });
    }

    else if (c === 'gerenciar-time') {
      if (!i.inGuild()) return err(i, 'Use este comando dentro do servidor.');
      if (!admin(i)) {
        return err(i, 'Somente administradores podem usar `/gerenciar-time`. Donos de clubes usam `/proposta`; donos de seleções usam `/convocar`.');
      }
      const currentTeam = team(i.options.getString('time'));
      if (!currentTeam || currentTeam.owner.startsWith('national:')) {
        return err(i, 'Escolha um clube cadastrado para gerenciar.');
      }

      const targetUser = i.options.getUser('usuario');
      const action = i.options.getString('acao');
      const kind = i.options.getString('cargo');
      if (!targetUser || targetUser.bot || targetUser.id === i.user.id) {
        return err(i, 'Escolha outro membro válido do servidor.');
      }
      const targetMember = await i.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) return err(i, 'Esse usuário não é membro deste servidor.');

      try {
        await teamRoles(i.guild, currentTeam);
      } catch (error) {
        console.error(`Falha ao verificar cargos de ${currentTeam.acronym}:`, error);
        return err(i, 'Não consegui preparar os cargos do time. Confira a permissão Manage Roles e a posição do cargo do bot.');
      }
      const roleLabel = kind === 'manager' ? 'Gerente' : 'Jogador';
      const targetRole = i.guild.roles.cache.find(
        role => role.name === `${currentTeam.acronym} | ${roleLabel}`
      );
      if (!targetRole) {
        return err(i, `O cargo \`${currentTeam.acronym} | ${roleLabel}\` não foi encontrado.`);
      }

      const membership = db.prepare(
        'SELECT kind FROM members WHERE team_id = ? AND user_id = ?'
      ).get(currentTeam.id, targetUser.id);
      const freeAgentListing = action === 'adicionar'
        ? db.prepare(
          "SELECT id FROM market_listings WHERE user_id = ? AND status = 'available'"
        ).get(targetUser.id)
        : null;
      try {
        if (action === 'adicionar') {
          if (kind === 'manager' && membership?.kind !== 'manager' &&
              await teamHasManager(i.guild, currentTeam, targetUser.id)) {
            return err(i, `**${currentTeam.name}** já tem gerente. Remova o gerente atual antes de adicionar outro.`);
          }
          await targetMember.roles.add(targetRole);
          const conflictingRoles = targetMember.roles.cache.filter(role => {
            if (role.id === targetRole.id) return false;
            const match = role.name.match(/^([A-Z]{3,4}) \| (Gerente|Jogador)$/i);
            if (!match) return false;
            const oldTeam = team(match[1]);
            if (!oldTeam || oldTeam.owner.startsWith('national:')) return false;
            if (kind === 'player') {
              return match[2].toLowerCase() === 'jogador' ||
                (oldTeam.id === currentTeam.id &&
                  match[2].toLowerCase() === 'gerente');
            }
            return match[2].toLowerCase() === 'gerente' ||
              (oldTeam.id === currentTeam.id &&
                match[2].toLowerCase() === 'jogador');
          });
          if (conflictingRoles.size) {
            await targetMember.roles.remove(conflictingRoles);
          }
          db.transaction(() => {
            if (kind === 'player') {
              db.prepare(
                "DELETE FROM members WHERE user_id = ? AND kind = 'player'"
              ).run(targetUser.id);
            }
            if (kind === 'manager') {
              db.prepare(
                "DELETE FROM members WHERE user_id = ? AND kind = 'manager'"
              ).run(targetUser.id);
            }
            db.prepare(
              'INSERT INTO members (team_id, user_id, kind) VALUES (?, ?, ?) ON CONFLICT(team_id, user_id) DO UPDATE SET kind = excluded.kind'
            ).run(currentTeam.id, targetUser.id, kind);
            db.prepare(
              "UPDATE market_listings SET status = 'signed', resolved_at = ? WHERE user_id = ? AND status = 'available'"
            ).run(n(), targetUser.id);
          })();
          if (freeAgentListing) {
            closeMarketListing(freeAgentListing.id, currentTeam).catch(error =>
              console.error(`Falha ao atualizar a janela após adicionar ${targetUser.id}:`, error)
            );
          }
          return i.reply({
            content: `✅ ${targetUser} agora tem o cargo **${currentTeam.acronym} | ${roleLabel}**.`,
            ephemeral: true
          });
        }

        if (!membership || membership.kind !== kind) {
          return err(i, `Esse usuário não está cadastrado como ${roleLabel.toLowerCase()} do seu time.`);
        }
        await targetMember.roles.remove(targetRole);
        db.prepare(
          'DELETE FROM members WHERE team_id = ? AND user_id = ? AND kind = ?'
        ).run(currentTeam.id, targetUser.id, kind);
        return i.reply({
          content: `✅ ${targetUser} foi removido do elenco de **${currentTeam.name}**.`,
          ephemeral: true
        });
      } catch (error) {
        console.error(`Falha ao atualizar o cargo ${currentTeam.acronym} | ${roleLabel}:`, error);
        return err(i, 'Não consegui atualizar o cargo. Confira a permissão Manage Roles e se o cargo do bot está acima do cargo do time.');
      }
    }

    else if (c === 'sair-team') {
      if (!i.inGuild()) return err(i, 'Use este comando dentro do servidor.');
      const [rawTeamId, selectedKind] = i.options.getString('equipe').split(':');
      const teamId = Number(rawTeamId);
      if (!Number.isSafeInteger(teamId) ||
          !['owner', 'manager', 'player', 'roster'].includes(selectedKind)) {
        return err(i, 'Selecione o time e o cargo que deseja deixar no autocomplete.');
      }
      const currentTeam = db.prepare(
        'SELECT * FROM teams WHERE id = ?'
      ).get(teamId);
      if (!currentTeam) return err(i, 'Esse time ou seleção não está mais cadastrado.');
      const registeredOwnerId = teamOwnerId(currentTeam);
      const ownerRole = i.member.roles.cache.find(
        currentRole => currentRole.name === `${currentTeam.acronym} | Dono`
      );
      const hasOwnerRole = Boolean(ownerRole);
      const isCurrentOwner = registeredOwnerId === i.user.id || hasOwnerRole;
      if (hasOwnerRole && registeredOwnerId && registeredOwnerId !== i.user.id) {
        return err(i, 'O cadastro deste time pertence a outro dono. Peça a um administrador para corrigir os cargos.');
      }
      if (selectedKind === 'owner' && !isCurrentOwner) {
        return err(i, 'Você não é o dono cadastrado deste time. Atualize o menu e selecione um dos seus cargos.');
      }
      const leavingAsOwner = selectedKind === 'owner' && isCurrentOwner;
      if (leavingAsOwner && !teamCategory(currentTeam)) {
        return err(i, 'A saída de times personalizados ainda precisa ser feita por um administrador.');
      }

      const roleLabel = selectedKind === 'owner'
        ? 'Dono'
        : selectedKind === 'manager'
          ? 'Gerente'
          : selectedKind === 'roster'
            ? 'Convocado'
            : 'Jogador';
      if (!roleLabel) {
        return err(i, 'Você não possui mais um cargo deste time. Atualize o menu e tente novamente.');
      }
      const roleLabels = leavingAsOwner
        ? ['Dono', 'Gerente', 'Jogador', 'Convocado']
        : [roleLabel];

      await i.deferReply({ ephemeral: true });
      try {
        await i.guild.roles.fetch();
        if (leavingAsOwner) {
          await i.guild.members.fetch();
          const teamRoles = roleLabels
            .map(label => i.guild.roles.cache.find(
              currentRole => currentRole.name === `${currentTeam.acronym} | ${label}`
            ))
            .filter(Boolean);
          for (const teamRole of teamRoles) {
            for (const member of teamRole.members.values()) {
              await member.roles.remove(
                teamRole,
                `Saída do dono de ${currentTeam.acronym}; liberação do time`
              );
            }
          }

          db.transaction(() => {
            if (currentTeam.owner.startsWith('national:')) {
              db.prepare(
                'UPDATE teams SET claimed_by = NULL WHERE id = ? AND claimed_by = ?'
              ).run(currentTeam.id, i.user.id);
              db.prepare(
                'DELETE FROM national_presidents WHERE team_id = ?'
              ).run(currentTeam.id);
              db.prepare(
                'DELETE FROM national_roster WHERE team_id = ?'
              ).run(currentTeam.id);
              db.prepare(
                "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = 'system' WHERE kind = 'callup' AND dst = ? AND status = 'pending'"
              ).run(n(), currentTeam.id);
            } else if (registeredOwnerId === i.user.id) {
              const placeholder = teamCategory(currentTeam) === 'champions'
                ? `champions:${currentTeam.acronym.toLowerCase()}`
                : `brazil:${currentTeam.acronym.toLowerCase()}`;
              db.prepare(
                'UPDATE teams SET owner = ? WHERE id = ? AND owner = ?'
              ).run(placeholder, currentTeam.id, i.user.id);
            }
            db.prepare(
              'DELETE FROM members WHERE team_id = ?'
            ).run(currentTeam.id);
          })();
          return i.editReply(
            `✅ Você saiu de **${teamDisplayName(currentTeam)} (${currentTeam.acronym})**. Os cargos de dono, gerente, jogador e convocado foram removidos de todos os membros, e o time está disponível para ser escolhido novamente.`
          );
        }

        const role = i.guild.roles.cache.find(
          currentRole => currentRole.name === `${currentTeam.acronym} | ${roleLabel}`
        );
        if (!role || !i.member.roles.cache.has(role.id)) {
          return i.editReply('❌ Você não possui mais esse cargo. Atualize o menu e tente novamente.');
        }
        await i.member.roles.remove(role);
        if (currentTeam.owner.startsWith('national:') &&
            ['Jogador', 'Convocado'].includes(roleLabel)) {
          db.prepare(
            'DELETE FROM national_roster WHERE team_id = ? AND player_id = ?'
          ).run(currentTeam.id, i.user.id);
        } else {
          const kind = roleLabel === 'Gerente' ? 'manager' : 'player';
          db.prepare(
            'DELETE FROM members WHERE team_id = ? AND user_id = ? AND kind = ?'
          ).run(currentTeam.id, i.user.id, kind);
        }
        return i.editReply(`✅ Você removeu o cargo **${currentTeam.acronym} | ${roleLabel}**.`);
      } catch (error) {
        console.error(`Falha ao sair de ${currentTeam.acronym} como ${roleLabel}:`, error);
        return i.editReply('❌ Não consegui concluir sua saída. Confira as permissões Manage Roles e a posição do cargo do bot; a equipe continua vinculada ao dono até a remoção dos cargos ser concluída.');
      }
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

    else if (c === 'ver-saldo') {
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

    else if (c === 'perfil') {
      const user = i.options.getUser('usuario') || i.user;
      if (user.bot) return err(i, 'Perfis de bots não estão disponíveis.');
      let profileMember = null;
      if (i.inGuild()) {
        try {
          profileMember = await i.guild.members.fetch(user.id);
        } catch (error) {
          if (error.code !== 10007) {
            console.error(`Falha ao verificar os cargos de ${user.id} durante /perfil:`, error);
            return err(i, 'Não consegui verificar os cargos desse usuário. Tente novamente.');
          }
        }
        if (profileMember) {
          try {
            await syncDivisionRole(i.guild, user.id, playerValue(user.id));
            profileMember = await i.guild.members.fetch(user.id);
          } catch (error) {
            console.error(`Falha ao sincronizar a divisão de ${user.id} durante /perfil:`, error);
            return err(i, 'Não consegui atualizar o cargo de divisão desse usuário. Confira as permissões Manage Roles e a posição dos cargos do bot.');
          }
        }
      }
      const now = Date.now();
      const previousUse = db.prepare(
        'SELECT last_used FROM profile_cooldowns WHERE user_id = ?'
      ).get(i.user.id);
      const remaining = 15_000 - (now - (previousUse?.last_used ?? 0));
      if (remaining > 0) {
        return err(
          i,
          `Aguarde ${Math.ceil(remaining / 1000)}s para usar /perfil novamente. Spam de perfil pode gerar kick.`
        );
      }

      db.prepare(
        `INSERT INTO profile_cooldowns (user_id, last_used) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET last_used = excluded.last_used`
      ).run(i.user.id, now);
      await i.reply({ embeds: [profileEmbed(user, profileMember)] });
      const deleteTimer = setTimeout(() => {
        i.deleteReply().catch(error =>
          console.error(`Falha ao apagar a resposta pública de /perfil (${i.id}):`, error)
        );
      }, 30_000);
      deleteTimer.unref();
      return;
    }

    else if (c === 'elenco-time') {
      const currentTeam = team(i.options.getString('time'));
      if (!currentTeam || currentTeam.owner.startsWith('national:')) {
        return err(i, 'Escolha um clube cadastrado no menu de times.');
      }
      const manager = db.prepare(
        "SELECT user_id FROM members WHERE team_id = ? AND kind = 'manager' LIMIT 1"
      ).get(currentTeam.id);
      const players = db.prepare(
        "SELECT user_id FROM members WHERE team_id = ? AND kind = 'player' ORDER BY user_id"
      ).all(currentTeam.id);
      const ownerId = teamOwnerId(currentTeam);
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📋 Elenco — ${teamDisplayName(currentTeam)} (${currentTeam.acronym})`)
        .addFields(
          { name: '👑 Dono', value: ownerId ? `<@${ownerId}>` : 'Sem dono', inline: true },
          { name: '🧭 Gerente', value: manager ? `<@${manager.user_id}>` : 'Sem gerente', inline: true },
          {
            name: `⚽ Jogadores (${players.length})`,
            value: players.length
              ? players.map((player, index) => `${index + 1}. <@${player.user_id}>`).join('\n').slice(0, 1024)
              : 'Nenhum jogador cadastrado.',
            inline: false
          }
        )
        .setTimestamp();
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    else if (c === 'ver-team') {
      if (!admin(i)) return err(i, 'Apenas administradores.');
      const selectedCategory = i.options.getString('categoria');
      const category = selectedCategory === 'copa-do-mundo'
        ? 'selecao'
        : selectedCategory;
      const currentTeam = team(i.options.getString('time'));
      if (!currentTeam) return err(i, 'Time não encontrado.');
      if (!['brasileirao', 'selecao', 'champions'].includes(category) ||
          teamCategory(currentTeam) !== category) {
        return err(i, 'O time selecionado não pertence à categoria escolhida.');
      }

      const ownerId = teamOwnerId(currentTeam) ||
        db.prepare(
          'SELECT president_id FROM national_presidents WHERE team_id = ?'
        ).get(currentTeam.id)?.president_id;
      const manager = db.prepare(
        "SELECT user_id FROM members WHERE team_id = ? AND kind = 'manager' LIMIT 1"
      ).get(currentTeam.id);
      const playerCount = db.prepare(
        "SELECT COUNT(*) AS count FROM members WHERE team_id = ? AND kind = 'player'"
      ).get(currentTeam.id).count;
      const nationalPlayerCount = db.prepare(
        'SELECT COUNT(*) AS count FROM national_roster WHERE team_id = ?'
      ).get(currentTeam.id).count;
      const stadiums = db.prepare(
        'SELECT tier, price FROM stadiums WHERE team_id = ? ORDER BY tier'
      ).all(currentTeam.id);
      const stadiumDescription = stadiums.length
        ? stadiums.map(stadium => {
          const option = stadiumOptions.find(item => item.tier === stadium.tier);
          return `${option?.name || `Estádio ${stadium.tier}`} — ${cash(stadium.price)}`;
        }).join('\n')
        : 'Nenhum';
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`🏟️ ${teamDisplayName(currentTeam)} (${currentTeam.acronym})`)
        .addFields(
          { name: '👑 Dono/Presidente', value: ownerId ? `<@${ownerId}>` : 'Não definido', inline: true },
          { name: '🧭 Gerente', value: manager ? `<@${manager.user_id}>` : 'Nenhum', inline: true },
          { name: '💰 Caixa do time', value: cash(currentTeam.balance), inline: true },
          { name: '⚽ Jogadores', value: String(playerCount + nationalPlayerCount), inline: true },
          { name: '🏟️ Estádio', value: stadiumDescription.slice(0, 1024), inline: false },
          { name: '📝 Descrição', value: currentTeam.description?.slice(0, 1024) || 'Sem descrição', inline: false }
        )
        .setTimestamp(currentTeam.created);
      if (currentTeam.crest) embed.setThumbnail(currentTeam.crest);
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    else if (c === 'extrato') {
      const limit = i.options.getInteger('limite') || 10;
      const transactions = db.prepare(
        'SELECT amount, reason, created FROM transactions WHERE user_id = ? ORDER BY created DESC, id DESC LIMIT ?'
      ).all(i.user.id, limit);
      const description = transactions.length
        ? transactions.map(entry =>
          `• <t:${Math.floor(entry.created / 1000)}:d> — ${entry.amount >= 0 ? '+' : '−'}${cash(Math.abs(entry.amount))} — ${entry.reason}`
        ).join('\n').slice(0, 4000)
        : 'Nenhuma movimentação pessoal registrada.';
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`🧾 Extrato de ${i.user.username}`)
            .setDescription(description)
            .setFooter({ text: `Exibindo até ${limit} movimentações` })
        ],
        ephemeral: true
      });
    }

    else if (c === 'transferir-saldo') {
      const recipient = i.options.getUser('usuario');
      const amount = parseScaledMoney(
        i.options.getNumber('valor'),
        i.options.getString('escala')
      );
      if (!recipient || recipient.bot || recipient.id === i.user.id) {
        return err(i, 'Escolha outra pessoa, que não seja bot, para receber o saldo.');
      }
      if (!Number.isSafeInteger(amount) || amount < 1) {
        return err(i, 'Informe um valor maior que zero que caiba no limite seguro.');
      }
      ensure(i.user.id);
      ensure(recipient.id);
      try {
        db.transaction(() => {
          const debit = db.prepare(
            'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?'
          ).run(amount, i.user.id, amount);
          if (!debit.changes) throw new Error('INSUFFICIENT_BALANCE');
          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?')
            .run(amount, recipient.id);
          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(i.user.id, -amount, `Transferência enviada para ${recipient.id}`, `user-transfer:${i.id}:out`, n());
          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(recipient.id, amount, `Transferência recebida de ${i.user.id}`, `user-transfer:${i.id}:in`, n());
        })();
      } catch (error) {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(i.user.id).balance;
          return err(i, `Saldo insuficiente. Seu saldo é ${cash(balance)}.`);
        }
        console.error('Falha ao transferir saldo entre usuários:', error);
        return err(i, 'Não consegui concluir a transferência. Nenhum saldo foi movimentado.');
      }
      return i.reply(`✅ Você transferiu ${cash(amount)} para ${recipient}.`);
    }

    else if (c === 'doar-time') {
      const currentTeam = owner(i.user.id);
      if (!currentTeam) {
        return err(i, 'Você precisa ser dono de um time ou seleção para contribuir com o caixa.');
      }
      const amount = parseScaledMoney(
        i.options.getNumber('valor'),
        i.options.getString('escala')
      );
      if (!Number.isSafeInteger(amount) || amount < 1) {
        return err(i, 'Informe um valor maior que zero que caiba no limite seguro.');
      }
      ensure(i.user.id);
      try {
        db.transaction(() => {
          const debit = db.prepare(
            'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?'
          ).run(amount, i.user.id, amount);
          if (!debit.changes) throw new Error('INSUFFICIENT_BALANCE');
          db.prepare('UPDATE teams SET balance = balance + ? WHERE id = ?')
            .run(amount, currentTeam.id);
          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(i.user.id, -amount, `Contribuição para ${currentTeam.name}`, `team-donation:${i.id}:user`, n());
          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(currentTeam.id, amount, 'Contribuição do dono', `team-donation:${i.id}:team`, n());
        })();
      } catch (error) {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(i.user.id).balance;
          return err(i, `Saldo insuficiente. Seu saldo é ${cash(balance)}.`);
        }
        console.error('Falha ao contribuir para o caixa do time:', error);
        return err(i, 'Não consegui concluir a contribuição. Nenhum saldo foi movimentado.');
      }
      return i.reply(`✅ ${cash(amount)} foram transferidos para o caixa de **${currentTeam.name}**.`);
    }

    else if (c === 'money') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const target = i.options.getString('alvo');
      const action = i.options.getString('acao');
      const requestedAmount = parseScaledMoney(
        i.options.getNumber('quantia'),
        i.options.getString('escala')
      );
      if (!['add', 'remove'].includes(action)) {
        return err(i, 'Ação inválida. Escolha adicionar ou retirar.');
      }
      if (!Number.isSafeInteger(requestedAmount) || requestedAmount < 1) {
        return err(i, 'Informe uma quantia válida maior que zero. O total convertido precisa caber no limite seguro de valores.');
      }

      const t = team(target);

      try {
        let adjustedAmount = 0;
        if (!t) {
          if (!/^\d{17,20}$/.test(target)) {
            return err(i, 'Use sigla do time ou ID do usuário.');
          }
          ensure(target);
        }

        const adjustBalance = db.transaction(() => {
          const currentBalance = t
            ? db.prepare('SELECT balance FROM teams WHERE id = ?').get(t.id)?.balance
            : db.prepare('SELECT balance FROM users WHERE id = ?').get(target)?.balance;
          if (!Number.isSafeInteger(currentBalance)) {
            throw new Error('BALANCE_TARGET_NOT_FOUND');
          }

          adjustedAmount = action === 'remove'
            ? Math.min(requestedAmount, currentBalance)
            : requestedAmount;
          const signedAmount = action === 'add'
            ? adjustedAmount
            : -adjustedAmount;
          if (!Number.isSafeInteger(currentBalance + signedAmount)) {
            throw new Error('BALANCE_OVERFLOW');
          }
          if (adjustedAmount === 0) return;

          if (t) {
            db.prepare(
              'UPDATE teams SET balance = balance + ? WHERE id = ?'
            ).run(signedAmount, t.id);
            db.prepare(
              'INSERT INTO transactions (team_id, amount, reason, created) VALUES (?, ?, ?, ?)'
            ).run(t.id, signedAmount, 'Ajuste admin', n());
          } else {
            db.prepare(
              'UPDATE users SET balance = balance + ? WHERE id = ?'
            ).run(signedAmount, target);
            db.prepare(
              'INSERT INTO transactions (user_id, amount, reason, created) VALUES (?, ?, ?, ?)'
            ).run(target, signedAmount, 'Ajuste admin', n());
          }
        });

        adjustBalance();
        return i.reply({
          content: adjustedAmount === 0
            ? 'Esse saldo já está zerado; nenhum dinheiro foi retirado.'
            : `Saldo atualizado: ${action === 'remove' ? 'retirado' : 'adicionado'} ${cash(adjustedAmount)}${action === 'remove' && requestedAmount > adjustedAmount ? ' (todo o saldo disponível)' : ''}.`,
          ephemeral: true
        });
      } catch (e) {
        if (e.message === 'BALANCE_TARGET_NOT_FOUND') {
          return err(i, 'Não encontrei o saldo desse jogador ou time.');
        }
        if (e.message === 'BALANCE_OVERFLOW') {
          return err(i, 'Esse ajuste excede o limite seguro de saldo.');
        }
        console.error('Falha ao ajustar saldo com /money:', e);
        return err(i, 'Não foi possível atualizar o saldo.');
      }
    }

    else if (c === 'amistoso') {
      if (i.channelId !== ch.friendly) {
        return err(i, `Use no canal <#${ch.friendly}>.`);
      }

      const a = team(i.options.getString('time_a'));
      const b = team(i.options.getString('time_b'));
      if (!a || !b || a.id === b.id) {
        return err(i, 'Escolha dois times cadastrados e diferentes.');
      }
      if (a.owner.startsWith('national:') || b.owner.startsWith('national:') ||
          a.owner.startsWith('champions:') || b.owner.startsWith('champions:')) {
        return err(i, 'Só é possível convidar times que já tenham dono.');
      }

      const managesA = canManageTeam(i.member, a);
      const managesB = canManageTeam(i.member, b);
      if (managesA === managesB) {
        return err(i, managesA
          ? 'Escolha exatamente um time seu e um time adversário.'
          : 'Você precisa ser dono ou gerente de um dos dois times.');
      }

      const inviting = managesA ? a : b;
      const invited = managesA ? b : a;
      const robloxUsername = i.options.getString('usuario_roblox').trim();
      const serverUrl = i.options.getString('link_servidor').trim();
      const schedule = parseBrasiliaSchedule(i.options.getString('horario'));
      if (!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)) {
        return err(i, 'Informe um nome de usuário Roblox válido (3 a 20 letras, números ou _).');
      }
      if (!serverUrl || !isHttpUrl(serverUrl)) {
        return err(i, 'Informe um link válido do servidor Roblox começando com http:// ou https://.');
      }
      if (schedule.error) return err(i, schedule.error);

      const created = n();
      const expires = created + 7 * 24 * 60 * 60 * 1000;
      const insert = db.prepare(
        "INSERT INTO offers (ref, src, dst, kind, created_by, status, created, expires, team_name, team_acronym, description, roblox_username, server_url, scheduled_at) VALUES (?, ?, ?, 'friendly', ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        `friendly-invite:${i.id}`,
        inviting.id,
        invited.id,
        i.user.id,
        created,
        expires,
        invited.name,
        invited.acronym,
        inviting.name,
        robloxUsername,
        serverUrl,
        schedule.scheduledAt
      );
      const inviteId = Number(insert.lastInsertRowid);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`friendly-invite:${inviteId}:yes`)
          .setLabel('Aceitar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`friendly-invite:${inviteId}:no`)
          .setLabel('Recusar')
          .setStyle(ButtonStyle.Danger)
      );
      const timeDescription = schedule.scheduledAt
        ? `Agendado para **${formatBrasiliaSchedule(schedule.scheduledAt)}** (horário de Brasília).`
        : 'Convite para jogar **agora**.';
      const inviteEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('⚽ Convite para amistoso')
        .setDescription(
          `**${inviting.name} (${inviting.acronym})** convida **${invited.name} (${invited.acronym})** para um amistoso.\n\n` +
          `${timeDescription}\n` +
          `O convite expira em 7 dias. Aceitar revela o usuário Roblox e o link do servidor.`
        )
        .setAuthor({
          name: `Convite enviado por ${i.user.username}`,
          iconURL: i.user.displayAvatarURL()
        })
        .setFooter({ text: `Convite #${inviteId}` })
        .setTimestamp();
      return i.reply({
        embeds: [inviteEmbed],
        components: [buttons]
      });
    }

    else if (c === 'resultado-amistoso') {
      const matchId = i.options.getInteger('partida');
      const match = db.prepare(
        "SELECT * FROM matches WHERE id = ? AND type = 'friendly' AND status = 'pending'"
      ).get(matchId);
      if (!match) return err(i, 'Não encontrei um amistoso aceito e pendente com esse ID.');
      const a = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.a);
      const b = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.b);
      if (!a || !b) return err(i, 'Um dos times desta partida não está mais cadastrado.');
      if (!admin(i) && !canManageTeam(i.member, a) &&
          !canManageTeam(i.member, b)) {
        return err(i, 'Somente os donos/gerentes dos times ou um administrador podem registrar o resultado.');
      }

      const scoreA = i.options.getInteger('gols_a');
      const scoreB = i.options.getInteger('gols_b');
      const penaltiesA = i.options.getInteger('penaltis_a');
      const penaltiesB = i.options.getInteger('penaltis_b');
      if ((penaltiesA === null) !== (penaltiesB === null)) {
        return err(i, 'Informe os pênaltis dos dois times ou deixe os dois vazios.');
      }
      if (penaltiesA !== null && (scoreA !== scoreB || penaltiesA === penaltiesB)) {
        return err(i, 'Pênaltis só podem ser informados em empate e precisam desempatar.');
      }
      const winner = scoreA === scoreB
        ? (penaltiesA === null ? null : penaltiesA > penaltiesB ? match.a : match.b)
        : scoreA > scoreB ? match.a : match.b;
      const ref = `friendly-result:${match.id}`;
      const result = db.transaction(() => {
        const updated = db.prepare(
          "UPDATE matches SET winner = ?, score_a = ?, score_b = ?, penalties_a = ?, penalties_b = ?, status = 'completed' WHERE id = ? AND status = 'pending'"
        ).run(winner, scoreA, scoreB, penaltiesA, penaltiesB, match.id);
        if (!updated.changes) throw new Error('FRIENDLY_ALREADY_COMPLETED');
        for (const teamId of [match.a, match.b]) {
          db.prepare(
            'UPDATE teams SET balance = balance + 10000 WHERE id = ?'
          ).run(teamId);
          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(teamId, 10000, 'Prêmio amistoso', `${ref}:${teamId}`, n());
        }
      });
      try {
        result();
      } catch (error) {
        if (error.message === 'FRIENDLY_ALREADY_COMPLETED') {
          return err(i, 'Esse amistoso acabou de ser finalizado por outra pessoa.');
        }
        throw error;
      }

      const embed = matchEmbed({
        title: 'Resultado do amistoso',
        a,
        b,
        scoreA,
        scoreB,
        penaltiesA,
        penaltiesB,
        crestA: a.crest,
        crestB: b.crest
      }).setFooter({ text: `Cada time recebeu ${cash(10000)}.` });
      log(i.guild, `Amistoso #${match.id} ${a.acronym} x ${b.acronym} finalizado; +10K cada.`);
      return i.reply({ embeds: [embed] });
    }

    else if (c === 'ofc') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const category = i.options.getString('categoria');
      const a = team(i.options.getString('time_a'));
      const b = team(i.options.getString('time_b'));
      const competitionNames = {
        selecao: 'Seleções',
        brasileirao: 'Brasileirão',
        champions: 'Champions League'
      };
      const competition = i.options.getString('competicao')?.trim() ||
        competitionNames[category];
      const competitionCrest = i.options.getString('simbolo_competicao');
      const crestA = i.options.getString('escudo_a') || a?.crest;
      const crestB = i.options.getString('escudo_b') || b?.crest;
      const schedule = parseBrasiliaSchedule(i.options.getString('horario'));

      if (!a || !b || a.id === b.id) {
        return err(i, 'Escolha dois times diferentes que pertençam à categoria selecionada.');
      }
      if (!competitionNames[category] ||
          teamCategory(a) !== category || teamCategory(b) !== category) {
        return err(i, 'Os dois times precisam pertencer à categoria selecionada.');
      }
      if (schedule.error) return err(i, schedule.error);

      const ownerA = teamOwnerId(a);
      const ownerB = teamOwnerId(b);
      if (!ownerA || !ownerB) {
        return err(i, 'Os dois times precisam ter um dono cadastrado para receber o prêmio OFC.');
      }
      if (ownerA === ownerB) {
        return err(i, 'Cada time precisa ter um dono diferente para disputar o OFC.');
      }

      if (![competitionCrest, crestA, crestB].every(isHttpUrl)) {
        return err(i, 'As URLs dos símbolos devem começar com http:// ou https://.');
      }

      if (crestA || crestB) await i.deferReply();
      let matchup;
      try {
        matchup = await matchupAttachment(a, b, crestA, crestB);
      } catch (error) {
        console.error('Não foi possível montar a imagem do confronto OFC:', error);
        return i.deferred
          ? i.editReply(`❌ Falha ao carregar os escudos: ${error.message}`)
          : err(i, `Falha ao carregar os escudos: ${error.message}`);
      }
      const ref = 'ofc:' + i.id;

      const tx = db.transaction(() => {
        const x = db.prepare(
          'INSERT INTO matches (ref, type, a, b, competition, category, competition_crest, crest_a, crest_b, scheduled_at, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          ref,
          'ofc',
          a.id,
          b.id,
          competition,
          category,
          competitionCrest,
          crestA,
          crestB,
          schedule.scheduledAt,
          'pending',
          n()
        );

        for (const tm of [a, b]) {
          db.prepare(
            'UPDATE teams SET balance = balance + ? WHERE id = ?'
          ).run(OFC_PARTICIPATION_REWARD, tm.id);

          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(
            tm.id,
            OFC_PARTICIPATION_REWARD,
            'Participação OFC',
            ref + ':' + tm.id,
            n()
          );
        }

        return Number(x.lastInsertRowid);
      });

      const id = tx();

      const response = ofcMatchEmbed({
        matchId: id,
        category,
        competition,
        scheduledAt: schedule.scheduledAt,
        a,
        b,
        competitionCrest,
        matchup
      });
      return i.deferred ? i.editReply(response) : i.reply(response);
    }

    else if (c === 'resultado-ofc') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const category = i.options.getString('categoria');
      const competition = i.options.getString('competicao').trim();
      const selectedMatchId = i.options.getInteger('partida');
      const competitionCrest = i.options.getString('imagem_competicao');
      const a = resolveTeamInput(i.options.getString('time_a'));
      const b = resolveTeamInput(i.options.getString('time_b'));
      const crestA = i.options.getString('escudo_a') || a?.crest;
      const crestB = i.options.getString('escudo_b') || b?.crest;
      const scoreA = i.options.getInteger('gols_a');
      const scoreB = i.options.getInteger('gols_b');
      const penaltiesA = i.options.getInteger('penaltis_a');
      const penaltiesB = i.options.getInteger('penaltis_b');

      if (!competition) {
        return err(i, 'Informe o nome da competição.');
      }

      if (!a || !b || a.id === b.id) {
        return err(
          i,
          'Escolha dois times diferentes cadastrados. Você pode selecionar pelo autocomplete, informar a sigla ou digitar o nome exato do time.'
        );
      }

      if (teamCategory(a) !== category || teamCategory(b) !== category) {
        return err(i, 'Os dois times precisam pertencer à categoria informada.');
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
        const pending = findPendingMatch({
          a,
          b,
          competition,
          category,
          selectedMatchId
        });

        let matchId;
        let oriented = {
          teamA: a,
          teamB: b,
          scoreA,
          scoreB,
          penaltiesA,
          penaltiesB,
          crestA,
          crestB
        };
        if (pending) {
          matchId = pending.id;
          const cupGame = db.prepare(
            'SELECT 1 FROM cup_games WHERE match_id = ?'
          ).get(matchId);
          if (cupGame && winnerId === null) {
            throw new Error('CUP_MATCH_REQUIRES_WINNER');
          }
          oriented = orientMatchResult(pending, {
            a,
            b,
            scoreA,
            scoreB,
            penaltiesA,
            penaltiesB,
            crestA,
            crestB
          });
          const updated = db.prepare(
            "UPDATE matches SET status = 'completed', category = COALESCE(category, ?), winner = ?, score_a = ?, score_b = ?, penalties_a = ?, penalties_b = ?, competition_crest = ?, crest_a = ?, crest_b = ? WHERE id = ? AND status = 'pending'"
          ).run(
            category,
            winnerId,
            oriented.scoreA,
            oriented.scoreB,
            oriented.penaltiesA,
            oriented.penaltiesB,
            competitionCrest,
            oriented.crestA,
            oriented.crestB,
            matchId
          );
          if (updated.changes === 0) {
            throw new Error('MATCH_ALREADY_COMPLETED');
          }
        } else {
          const inserted = db.prepare(
            "INSERT INTO matches (ref, type, a, b, winner, score_a, score_b, penalties_a, penalties_b, competition, category, competition_crest, crest_a, crest_b, status, created) VALUES (?, 'ofc', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)"
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
            category,
            competitionCrest,
            crestA,
            crestB,
            n()
          );
          matchId = Number(inserted.lastInsertRowid);

          for (const currentTeam of [a, b]) {
            if (!teamOwnerId(currentTeam)) {
              throw new Error('OFC_TEAM_OWNER_MISSING');
            }
            payOFCParticipation(currentTeam, `ofc-result:${i.id}:entry`);
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
        if (matchId) advanceCupResult(matchId, winnerId);

        return {
          matchId,
          resultA: oriented.teamA,
          resultB: oriented.teamB,
          resultScoreA: oriented.scoreA,
          resultScoreB: oriented.scoreB,
          resultPenaltiesA: oriented.penaltiesA,
          resultPenaltiesB: oriented.penaltiesB,
          resultCrestA: oriented.crestA,
          resultCrestB: oriented.crestB
        };
      });

      let result;
      try {
        result = tx();
      } catch (error) {
        const messages = {
          MATCH_ALREADY_COMPLETED: 'Esta partida acabou de ser registrada por outra execução. Atualize o placar antes de tentar novamente.',
          MATCH_ID_NOT_PENDING: 'O ID informado não corresponde a uma partida OFC pendente.',
          MATCH_TEAMS_MISMATCH: 'Os times informados não correspondem à partida OFC escolhida.',
          MATCH_CATEGORY_MISMATCH: 'A categoria escolhida não corresponde à partida OFC.',
          MATCH_COMPETITION_MISMATCH: 'Há uma partida pendente entre esses times, mas o nome da competição não corresponde. Confira a competição ou use o ID exibido em /partidas.',
          MATCH_ID_REQUIRED: 'Há mais de uma partida pendente igual nesta competição. Use /partidas e informe o ID da partida no campo partida.',
          MATCH_ALREADY_RECORDED: 'Já existe um resultado OFC finalizado entre esses times nesta competição. Para registrar uma nova partida, crie primeiro uma partida pendente com /ofc.',
          CUP_MATCH_REQUIRES_WINNER: 'Partidas da copa não podem terminar empatadas. Informe os gols de pênalti para definir quem avança.',
          OFC_TEAM_OWNER_MISSING: 'Os dois times precisam ter donos cadastrados para receber a premiação.'
        };
        if (messages[error.message]) {
          return err(i, messages[error.message]);
        }
        throw error;
      }

      const competitionEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(competition)
        .setDescription(`🏆 Partida OFC **#${result.matchId}**`);
      if (competitionCrest) competitionEmbed.setImage(competitionCrest);

      const resultEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Resultado')
        .setAuthor({
          name: result.resultA.name,
          ...(result.resultCrestA ? { iconURL: result.resultCrestA } : {})
        })
        .addFields(
          {
            name: '\u200b',
            value: `${result.resultCrestA ? `[Escudo](${result.resultCrestA})\n` : ''}**${result.resultA.name}**`,
            inline: true
          },
          {
            name: 'PLACAR',
            value: `**${result.resultScoreA} x ${result.resultScoreB}**` +
              (result.resultPenaltiesA === null ? '' : `\nPênaltis: **${result.resultPenaltiesA} x ${result.resultPenaltiesB}**`),
            inline: true
          },
          {
            name: '\u200b',
            value: `${result.resultCrestB ? `[Escudo](${result.resultCrestB})\n` : ''}**${result.resultB.name}**`,
            inline: true
          }
        )
        .setFooter({
          text: winnerId === null
            ? 'Empate'
            : `${db.prepare('SELECT name FROM teams WHERE id = ?').get(winnerId).name} venceu e recebeu ${cash(350000)}.`
        })
        .setTimestamp();
      if (result.resultCrestB) resultEmbed.setThumbnail(result.resultCrestB);

      return i.reply({
        embeds: [competitionEmbed, resultEmbed]
      });
    }

    else if (c === 'vender') {
      if (!i.inGuild()) return err(i, 'Use `/vender` dentro do servidor.');
      const currentTeam = owner(i.user.id);
      if (!currentTeam || currentTeam.owner.startsWith('national:')) {
        return err(i, 'Somente o dono de um clube pode vender jogadores ou gerentes do próprio time.');
      }
      const memberUser = i.options.getUser('membro');
      const roleKind = i.options.getString('funcao');
      if (!memberUser || memberUser.bot || memberUser.id === i.user.id ||
          !['player', 'manager'].includes(roleKind)) {
        return err(i, 'Escolha um membro válido e a função correta para liberar.');
      }
      let targetMember;
      let targetRole;
      try {
        targetMember = await i.guild.members.fetch(memberUser.id);
        await i.guild.roles.fetch();
        const roleLabel = roleKind === 'manager' ? 'Gerente' : 'Jogador';
        targetRole = i.guild.roles.cache.find(
          role => role.name === `${currentTeam.acronym} | ${roleLabel}`
        );
      } catch (error) {
        console.error('Falha ao consultar o membro ou os cargos para a venda:', error);
        return err(i, 'Não consegui consultar o membro e os cargos do time. Verifique as permissões do bot.');
      }
      const membership = db.prepare(
        'SELECT kind FROM members WHERE team_id = ? AND user_id = ?'
      ).get(currentTeam.id, memberUser.id);
      const hasRole = Boolean(targetRole && targetMember.roles.cache.has(targetRole.id));
      if (membership && membership.kind !== roleKind) {
        return err(i, 'O cadastro desse membro não corresponde ao cargo selecionado. Peça a um administrador para corrigir o elenco antes de vender.');
      }
      if (!membership && !hasRole) {
        return err(i, `Esse usuário não é ${roleKind === 'manager' ? 'gerente' : 'jogador'} de **${currentTeam.name}**.`);
      }
      if (db.prepare(
        "SELECT 1 FROM market_listings WHERE user_id = ? AND status = 'available'"
      ).get(memberUser.id)) {
        return err(i, 'Esse membro já está listado como agente livre.');
      }
      const value = playerValue(memberUser.id);
      await i.deferReply({ ephemeral: true });

      let listing;
      try {
        if (hasRole) {
          await targetMember.roles.remove(
            targetRole,
            `Venda de ${memberUser.id} por ${currentTeam.acronym}`
          );
        }
        listing = db.transaction(() => {
          const alreadyListed = db.prepare(
            "SELECT 1 FROM market_listings WHERE user_id = ? AND status = 'available'"
          ).get(memberUser.id);
          if (alreadyListed) throw new Error('ALREADY_LISTED');

          db.prepare(
            'DELETE FROM members WHERE team_id = ? AND user_id = ? AND kind = ?'
          ).run(currentTeam.id, memberUser.id, roleKind);
          const created = db.prepare(
            "INSERT INTO market_listings (user_id, team_id, role, value, status, created) VALUES (?, ?, ?, ?, 'available', ?)"
          ).run(memberUser.id, currentTeam.id, roleKind, value, n());
          const listingId = Number(created.lastInsertRowid);
          db.prepare(
            'UPDATE teams SET balance = balance + ? WHERE id = ?'
          ).run(value, currentTeam.id);
          db.prepare(
            'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(
            currentTeam.id,
            value,
            `Venda de ${roleKind === 'manager' ? 'gerente' : 'jogador'} ${memberUser.id}`,
            `market-sale:${listingId}:in`,
            n()
          );
          return db.prepare('SELECT * FROM market_listings WHERE id = ?')
            .get(listingId);
        })();
      } catch (error) {
        const listedNow = db.prepare(
          "SELECT 1 FROM market_listings WHERE user_id = ? AND status = 'available'"
        ).get(memberUser.id);
        if (error.message === 'ALREADY_LISTED' || listedNow) {
          return i.editReply('Esse membro já está listado como agente livre. Nenhum saldo foi movimentado.');
        }
        if (hasRole && targetRole && !targetMember.roles.cache.has(targetRole.id)) {
          await targetMember.roles.add(targetRole).catch(restoreError =>
            console.error('Falha ao restaurar o cargo após erro em /vender:', restoreError)
          );
        }
        console.error('Falha ao registrar a venda:', error);
        return i.editReply('Não consegui concluir a venda. O saldo e o registro não foram alterados; confira os logs do bot.');
      }

      const announcementResults = await publishMarketListing(listing);
      let registrySent = false;
      try {
        const registrationChannel = await client.channels.fetch(ch.logs);
        if (!registrationChannel?.isTextBased()) {
          throw new Error(`Canal de registros ${ch.logs} não encontrado ou não é textual.`);
        }
        await registrationChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle('✅ Venda registrada — agente livre')
              .setDescription(
                `<@${memberUser.id}> foi liberado de **${currentTeam.name} (${currentTeam.acronym})** e está disponível na janela de transferências.`
              )
              .addFields(
                { name: 'Função', value: roleKind === 'manager' ? 'Gerente' : 'Jogador', inline: true },
                { name: 'Valor creditado ao caixa do time', value: cash(value), inline: true },
                { name: 'Horário', value: `<t:${Math.floor(listing.created / 1000)}:F>`, inline: true }
              )
              .setFooter({ text: `Registro de venda #${listing.id}` })
              .setTimestamp(listing.created)
          ],
          allowedMentions: { users: [memberUser.id] }
        });
        registrySent = true;
      } catch (error) {
        console.error(`Venda #${listing.id} concluída, mas o registro detalhado falhou:`, error);
      }
      const windowSent = announcementResults.find(
        result => result.label === 'janela de transferências'
      )?.sent;
      return i.editReply(
        `✅ ${memberUser} foi liberado como agente livre. ${cash(value)} foram creditados ao caixa de **${currentTeam.name}**.` +
        `${windowSent ? ' O anúncio foi publicado na janela de transferências.' : ' Não consegui publicar na janela; avise um administrador.'}` +
        `${registrySent ? ' O registro detalhado foi publicado.' : ' Não consegui publicar o registro detalhado.'}`
      );
    }

    else if (c === 'proposta') {
      if (!i.inGuild()) {
        return err(i, 'Use /proposta dentro do servidor. A proposta será enviada por DM ao jogador marcado.');
      }

      const playerId = i.options.getString('jogador');
      let playerMember;
      try {
        playerMember = await i.guild.members.fetch(playerId);
      } catch (error) {
        console.error(`Falha ao localizar o destinatário ${playerId} de /proposta:`, error);
        return err(i, 'Não encontrei esse usuário no servidor. Escolha alguém da lista de jogadores.');
      }
      const player = playerMember.user;
      const targetRoleKind = i.options.getString('funcao');
      const description = i.options.getString('descricao').trim();
      const teamAcronym = i.options.getString('sigla').trim();
      const price = parseScaledMoney(
        i.options.getNumber('valor'),
        i.options.getString('escala')
      );
      const buyer = team(teamAcronym);

      if (!player?.id || player.bot || player.id === i.user.id) {
        return err(i, 'Escolha outro usuário válido para receber a proposta.');
      }
      if (!['player', 'manager'].includes(targetRoleKind)) {
        return err(i, 'Escolha se a proposta é para jogador ou gerente.');
      }

      if (!buyer || buyer.owner.startsWith('national:')) {
        return err(i, 'Escolha a sigla de um clube cadastrado.');
      }

      const manager = db.prepare(
        "SELECT 1 FROM members WHERE team_id = ? AND user_id = ? AND kind = 'manager'"
      ).get(buyer.id, i.user.id);
      const hasTeamRole = [...(i.member?.roles?.cache?.values() || [])].some(role =>
        role.name.toLowerCase() === `${buyer.acronym.toLowerCase()} | dono` ||
        role.name.toLowerCase() === `${buyer.acronym.toLowerCase()} | gerente` ||
        role.name.toLowerCase() === `${buyer.acronym.toLowerCase()} | manager`
      );
      if (buyer.owner !== i.user.id && !manager && !hasTeamRole) {
        return err(i, 'Somente o dono ou manager do time escolhido pode enviar essa proposta.');
      }

      const playerMarket = playerValue(player.id);
      const playerDivision = marketDivision(playerMarket);
      const buyerDivision = marketDivision(playerValue(i.user.id));
      try {
        await syncDivisionRole(i.guild, player.id, playerMarket);
        await syncDivisionRole(i.guild, i.user.id, playerValue(i.user.id));
      } catch (error) {
        console.error('Falha ao sincronizar cargos de divisão durante /proposta:', error);
        return err(i, 'Não consegui verificar os cargos de divisão. Confira as permissões Manage Roles e tente novamente.');
      }
      const minimum = playerValue(player.id);
      const proposalMinimum = buyerDivision === 1 && playerDivision === 2
        ? Math.max(minimum, DIVISION_MARKET_THRESHOLD)
        : minimum;
      if (!Number.isSafeInteger(price)) {
        return err(i, 'O valor informado é inválido ou excede o limite seguro após aplicar a escala.');
      }
      if (price < proposalMinimum) {
        return err(i, `O valor mínimo para ${player} é ${cash(proposalMinimum)}.`);
      }

      let roleTeam = null;
      if (targetRoleKind === 'player') {
        try {
          roleTeam = await playerTeamFromRoles(i.guild, player.id);
        } catch (error) {
          if (error.message === 'PLAYER_MULTIPLE_TEAM_ROLES') {
            return err(i, 'Esse jogador tem cargos de jogador de mais de um time. Corrija os cargos antes de enviar a proposta.');
          }
          console.error('Falha ao verificar o cargo atual do jogador:', error);
          return err(i, 'Não consegui verificar os cargos do jogador. Confira se ele está no servidor e tente novamente.');
        }
      } else {
        const existingManager = db.prepare(
          "SELECT team_id FROM members WHERE user_id = ? AND kind = 'manager' LIMIT 1"
        ).get(player.id);
        if (existingManager?.team_id === buyer.id) {
          return err(i, 'Esse usuário já é gerente do time escolhido.');
        }
        try {
          if (await teamHasManager(i.guild, buyer, player.id)) {
            return err(i, 'Esse time já tem um gerente. Para substituir, o dono deve liberar a vaga com `/vender` antes de enviar outra proposta.');
          }
        } catch (error) {
          console.error('Falha ao conferir o cargo de gerente do time:', error);
          return err(i, 'Não consegui confirmar se o time já tem gerente. Tente novamente ou peça a um administrador para verificar os cargos.');
        }
      }

      const currentTeamId = roleTeam?.id ?? null;
      if (targetRoleKind === 'player' && currentTeamId === buyer.id) {
        return err(i, 'Esse jogador já pertence ao time escolhido.');
      }

      ensure(i.user.id);
      const author = db.prepare(
        'SELECT balance FROM users WHERE id = ?'
      ).get(i.user.id);
      if (author.balance < price) {
        return err(i, `Saldo insuficiente. Seu saldo é ${cash(author.balance)}.`);
      }

      const created = n();
      const expires = created + 7 * 24 * 60 * 60 * 1000;
      const inserted = db.prepare(
        "INSERT INTO offers (ref, src, dst, player, price, kind, created_by, admin_override, status, created, expires, team_name, team_acronym, team_url, target_role, description) VALUES (?, ?, ?, ?, ?, 'proposal', ?, 0, 'pending', ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        `proposal:${i.id}`,
        currentTeamId,
        buyer.id,
        player.id,
        price,
        i.user.id,
        created,
        expires,
        buyer.name,
        buyer.acronym,
        teamUrl,
        targetRoleKind,
        description
      );
      const proposalId = Number(inserted.lastInsertRowid);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`proposal:${proposalId}:yes`)
          .setLabel('Aceitar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`proposal:${proposalId}:no`)
          .setLabel('Recusar')
          .setStyle(ButtonStyle.Danger)
      );
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`Proposta de ${buyer.name} (${buyer.acronym})`)
        .setAuthor({
          name: `Enviada por ${i.user.username}`,
          iconURL: i.user.displayAvatarURL()
        })
        .setDescription(
          `${description}\n\nAo aceitar, você receberá o cargo **${buyer.acronym} | ${targetRoleKind === 'manager' ? 'Gerente' : 'Jogador'}**. **${cash(price)}** será debitado de quem enviou e creditado a você.`
        )
        .addFields(
          { name: 'Pessoa', value: `<@${player.id}>`, inline: true },
          { name: 'Função', value: targetRoleKind === 'manager' ? 'Gerente' : 'Jogador', inline: true },
          { name: 'Cargo do time', value: `\`${buyer.acronym} | ${targetRoleKind === 'manager' ? 'Gerente' : 'Jogador'}\``, inline: true },
          { name: 'Valor da compra', value: cash(price), inline: true }
        )
        .setFooter({ text: `Válida por 7 dias. Proposta #${proposalId}.` })
        .setTimestamp();
      await i.deferReply({ ephemeral: true });
      try {
        await player.send({ content: `<@${player.id}>`, embeds: [embed], components: [buttons] });
      } catch {
        db.prepare(
          "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = 'system' WHERE id = ? AND status = 'pending'"
        ).run(n(), proposalId);
        return i.editReply('Não consegui enviar a DM. A proposta foi cancelada sem movimentar saldo.');
      }

      if (buyerDivision === 1 && playerDivision === 2) {
        ensure(player.id);
        db.prepare(
          'UPDATE users SET market = ? WHERE id = ?'
        ).run(DIVISION_MARKET_THRESHOLD, player.id);
        db.prepare(
          'INSERT INTO player_values (user_id, value) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET value = excluded.value'
        ).run(player.id, DIVISION_MARKET_THRESHOLD);
        invalidateDivisionAutocompleteCache(i.guild.id);
        try {
          await syncDivisionRole(i.guild, player.id, DIVISION_MARKET_THRESHOLD);
        } catch (error) {
          console.error(`Proposta #${proposalId} enviada, mas falhou a promoção de divisão de ${player.id}:`, error);
          return i.editReply(`Proposta #${proposalId} enviada por DM, mas não consegui atualizar o cargo de divisão de ${player}. Avise um administrador.`);
        }
      }

      return i.editReply(`Proposta #${proposalId} enviada por DM para ${player}. Nenhum saldo foi movimentado ainda.`);
    }

    else if (c === 'cancelar-proposta') {
      if (!i.inGuild()) {
        return err(i, 'Use `/cancelar-proposta` dentro do servidor.');
      }
      const player = i.options.getUser('jogador');
      const reason = i.options.getString('descricao').trim();
      if (!player || player.bot || player.id === i.user.id) {
        return err(i, 'Marque o jogador que recebeu a sua proposta.');
      }
      if (!reason) {
        return err(i, 'Informe o motivo do cancelamento.');
      }

      const now = n();
      const pendingProposals = db.prepare(
        "SELECT id, team_name, team_acronym, price FROM offers WHERE kind = 'proposal' AND created_by = ? AND player = ? AND status = 'pending' AND expires > ? ORDER BY created DESC"
      ).all(i.user.id, player.id, now);
      if (!pendingProposals.length) {
        return err(i, `Não encontrei nenhuma proposta sua pendente enviada por DM para ${player}. Nenhuma proposta foi alterada.`);
      }

      await i.deferReply({ ephemeral: true });
      const cancelAt = n();
      const cancel = db.transaction(() => {
        const cancelledIds = [];
        for (const proposal of pendingProposals) {
          const update = db.prepare(
            "UPDATE offers SET status = 'cancelled', resolved_at = ?, resolved_by = ? WHERE id = ? AND created_by = ? AND player = ? AND kind = 'proposal' AND status = 'pending' AND expires > ?"
          ).run(
            cancelAt,
            i.user.id,
            proposal.id,
            i.user.id,
            player.id,
            cancelAt
          );
          if (update.changes) cancelledIds.push(proposal.id);
        }
        return cancelledIds;
      });
      const cancelledIds = cancel();
      const cancelledCount = cancelledIds.length;
      if (!cancelledCount) {
        return i.editReply(`Não há mais uma proposta sua pendente para ${player}; ela pode ter sido aceita, recusada ou expirada enquanto você preenchia o comando.`);
      }

      const cancelledProposals = pendingProposals
        .filter(proposal => cancelledIds.includes(proposal.id));
      const proposalLines = cancelledProposals
        .slice(0, 10)
        .map(proposal =>
          `• **#${proposal.id}** — ${proposal.team_name || 'Time'} (${proposal.team_acronym || '—'}), ${cash(proposal.price)}`
        );
      if (cancelledCount > proposalLines.length) {
        proposalLines.push(`• e mais ${cancelledCount - proposalLines.length} proposta(s) cancelada(s)`);
      }
      const cancellationEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('❌ Proposta de transferência cancelada')
        .setAuthor({
          name: `Cancelada por ${i.user.username}`,
          iconURL: i.user.displayAvatarURL()
        })
        .setDescription(
          `O remetente cancelou a(s) proposta(s) que tinha enviado para você.\n\n**Motivo:** ${reason}`
        )
        .addFields(
          { name: 'Proposta(s)', value: proposalLines.join('\n').slice(0, 1024) },
          { name: 'Remetente', value: `<@${i.user.id}>`, inline: true }
        )
        .setFooter({ text: 'As propostas canceladas não podem mais ser aceitas.' })
        .setTimestamp();
      try {
        await player.send({
          content: `<@${player.id}>`,
          embeds: [cancellationEmbed],
          allowedMentions: { users: [player.id, i.user.id] }
        });
      } catch (error) {
        console.error(`Proposta(s) cancelada(s) para ${player.id}, mas não foi possível enviar o aviso por DM:`, error);
        log(
          i.guild,
          `Falha ao notificar por DM o cancelamento de ${cancelledCount} proposta(s) de ${i.user.id} para ${player.id}.`
        );
        return i.editReply(
          `✅ ${cancelledCount} proposta(s) sua(s) para ${player} foi/foram cancelada(s), mas não consegui enviar o embed de aviso por DM. Peça para a pessoa liberar mensagens diretas do servidor.`
        );
      }

      log(
        i.guild,
        `${cancelledCount} proposta(s) cancelada(s) por ${i.user} para ${player} (#${cancelledIds.join(', ')}).`
      );
      return i.editReply(
        `✅ ${cancelledCount} proposta(s) pendente(s) cancelada(s). Enviei o motivo para ${player} por DM.`
      );
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
      const v = parseScaledMoney(
        i.options.getNumber('valor'),
        i.options.getString('escala')
      );
      if (!Number.isSafeInteger(v)) {
        return err(i, 'O valor informado é inválido ou excede o limite seguro após aplicar a escala.');
      }

      ensure(u.id);

      db.prepare(
        'INSERT INTO player_values (user_id, value) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET value = excluded.value'
      ).run(u.id, v);

      db.prepare(
        'UPDATE users SET market = ? WHERE id = ?'
      ).run(v, u.id);
      invalidateDivisionAutocompleteCache(i.guild.id);

      if (i.inGuild()) {
        try {
          await syncDivisionRole(i.guild, u.id, v);
        } catch (error) {
          console.error(`Valor de mercado de ${u.id} atualizado, mas falhou a sincronização da divisão:`, error);
          return err(i, `Valor de ${u} atualizado para ${cash(v)}, mas não consegui atualizar o cargo de divisão. Confira as permissões Manage Roles.`);
        }
      }

      return i.reply({
        content: `Valor de ${u} definido para ${cash(v)}.`,
        ephemeral: true
      });
    }

    else if (c === 'estadio') {
      const t = team(i.options.getString('sigla'));
      const price = i.options.getInteger('preco');
      const selectedStadium = stadiumOptions.find(option => option.price === price);

      if (!t || teamOwnerId(t) !== i.user.id) {
        return err(
          i,
          'Somente o dono de um time pode comprar para esse time.'
        );
      }

      if (!selectedStadium) {
        return err(i, 'Preço de estádio inválido.');
      }

      const tx = db.transaction(() => {
        if (db.prepare(
          'SELECT 1 FROM stadiums WHERE team_id = ? LIMIT 1'
        ).get(t.id)) {
          throw new Error('STADIUM_ALREADY_OWNED');
        }

        const result = db.prepare(
          'UPDATE teams SET balance = balance - ? WHERE id = ? AND balance >= ?'
        ).run(price, t.id, price);

        if (result.changes === 0) {
          throw new Error('BALANCE');
        }

        db.prepare(
          'INSERT INTO stadiums (team_id, tier, price) VALUES (?, ?, ?)'
        ).run(t.id, selectedStadium.tier, price);

        db.prepare(
          'INSERT INTO transactions (team_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
        ).run(
          t.id,
          -price,
          `Compra ${selectedStadium.name}`,
          `stadium:${t.id}`,
          n()
        );
      });

      try {
        tx();
      } catch (error) {
        if (error.message === 'STADIUM_ALREADY_OWNED') {
          return err(i, 'Seu time já possui um estádio. Cada time pode comprar apenas um.');
        }
        if (error.message === 'BALANCE') {
          return err(i, 'O caixa do time não tem saldo suficiente para esse estádio.');
        }
        throw error;
      }

      return i.reply({
        content: `🏟️ **${selectedStadium.name}** comprado para ${t.name} por ${cash(price)}.`
      });
    }

    else if (c === 'salarios') {
      if (!admin(i)) return err(i, 'Apenas administradores.');

      const selectedPlayer = i.options.getUser('jogador');
      const selectedTeam = i.options.getString('time');
      const everyone = i.options.getBoolean('everyone') === true;
      const selectedTargets = Number(Boolean(selectedPlayer)) +
        Number(Boolean(selectedTeam)) + Number(everyone);

      if (selectedTargets !== 1) {
        return err(i, 'Escolha apenas uma opção: jogador, time ou everyone.');
      }

      let users;
      let description;
      if (selectedPlayer) {
        if (selectedPlayer.bot) {
          return err(i, 'Não é possível pagar salário para um bot.');
        }
        users = [{ id: selectedPlayer.id }];
        description = `jogador ${selectedPlayer}`;
      } else if (selectedTeam) {
        const selected = team(selectedTeam);
        if (!selected || selected.owner.startsWith('national:')) {
          return err(i, 'Time inválido.');
        }
        users = db.prepare(
          "SELECT user_id AS id FROM members WHERE team_id = ? AND kind = 'player'"
        ).all(selected.id);
        description = `jogadores do time ${selected.name} (${selected.acronym})`;
      } else {
        users = db.prepare(
          "SELECT DISTINCT user_id AS id FROM members WHERE kind = 'player'"
        ).all();
        description = 'todos os jogadores cadastrados';
      }

      if (users.length === 0) {
        return err(i, 'Não há jogadores para pagar nessa seleção.');
      }

      const payroll = db.transaction(() => {
        const payments = [];
        let totalPaid = 0;
        for (const user of users) {
          ensure(user.id);
          const salary = playerValue(user.id);
          const account = db.prepare(
            'SELECT balance FROM users WHERE id = ?'
          ).get(user.id);
          if (!Number.isSafeInteger(salary) ||
              !Number.isSafeInteger(account.balance + salary) ||
              !Number.isSafeInteger(totalPaid + salary)) {
            throw new Error(`SALARY_OVERFLOW:${user.id}`);
          }
          db.prepare(
            'UPDATE users SET balance = balance + ? WHERE id = ?'
          ).run(salary, user.id);
          db.prepare(
            'INSERT INTO transactions (user_id, amount, reason, ref, created) VALUES (?, ?, ?, ?, ?)'
          ).run(
            user.id,
            salary,
            'Salário no valor do jogador',
            `salary:${i.id}:${user.id}`,
            n()
          );
          payments.push({
            id: user.id,
            salary,
            balance: account.balance + salary
          });
          totalPaid += salary;
        }
        return { payments, totalPaid };
      });

      let result;
      try {
        result = payroll();
      } catch (error) {
        if (error.message.startsWith('SALARY_OVERFLOW:')) {
          return err(i, `O pagamento foi cancelado: o saldo ou salário de <@${error.message.slice('SALARY_OVERFLOW:'.length)}> excede o limite seguro.`);
        }
        throw error;
      }

      const paymentDetails = result.payments.length === 1
        ? `\n<@${result.payments[0].id}> recebeu **${cash(result.payments[0].salary)}**. Novo saldo: **${cash(result.payments[0].balance)}**.`
        : `\nTotal creditado: **${cash(result.totalPaid)}** para ${result.payments.length} jogador(es).`;

      return i.reply({
        content: `Salários pagos para ${description}; cada jogador recebeu o próprio valor de mercado.${paymentDetails}`,
        allowedMentions: { users: result.payments.map(payment => payment.id) },
        ephemeral: true
      });
    }

    else if (c === 'copa') {
      const activeCup = db.prepare(
        "SELECT id FROM cups WHERE status = 'active' ORDER BY created DESC LIMIT 1"
      ).get();
      if (activeCup) {
        return i.reply({ embeds: [cupBracketEmbed(activeCup.id)] });
      }
      if (!admin(i)) {
        return err(i, 'Ainda não há uma copa ativa. Peça a um administrador para iniciar `/copa` depois que as 16 seleções tiverem donos.');
      }

      await i.deferReply();
      let ownerStatus;
      try {
        ownerStatus = await nationalOwnerStatus(i.guild, true);
      } catch (error) {
        console.error('Não foi possível confirmar os donos das seleções para iniciar a copa:', error);
        return i.editReply('❌ Não consegui verificar os cargos de dono das seleções. Tente novamente.');
      }
      if (nationalTeams.some(([, acronym]) => !ownerStatus.get(acronym))) {
        return i.editReply('❌ A copa exige que todas as 16 seleções tenham alguém com o cargo `SIGLA | Dono`.');
      }

      let cupId;
      try {
        cupId = db.transaction(() => createNationalCup(i.user.id))();
      } catch (error) {
        if (error.message === 'CUP_REQUIRES_16_OWNED_SELECTIONS') {
          return i.editReply('❌ A copa exige que as 16 seleções nacionais estejam assumidas por donos. Use `/selecionar-selecao` para ocupar as vagas.');
        }
        if (error.message === 'CUP_SEEDS_MUST_BE_OWNED') {
          return i.editReply('❌ Portugal, Brasil, Argentina e França precisam estar assumidos antes de iniciar a copa.');
        }
        if (error.message === 'CUP_ALREADY_ACTIVE') {
          const active = db.prepare(
            "SELECT id FROM cups WHERE status = 'active' ORDER BY created DESC LIMIT 1"
          ).get();
          return active
            ? i.editReply({ embeds: [cupBracketEmbed(active.id)] })
            : i.editReply('❌ Já existe uma copa ativa.');
        }
        throw error;
      }
      log(i.guild, `Copa do Mundo OFC #${cupId} iniciada por ${i.user}.`);
      return i.editReply({ embeds: [cupBracketEmbed(cupId)] });
    }

  } catch (e) {
    console.error(e);

    if (i.isRepliable() && !i.replied) {
      const response = {
        content: 'Ocorreu um erro ao processar essa ação. Tente novamente; se continuar, avise um administrador.',
        ephemeral: true
      };
      try {
        if (i.deferred) {
          await i.editReply(response);
        } else {
          await i.reply(response);
        }
      } catch (replyError) {
        console.error('Falha ao enviar a resposta de erro da interação:', replyError);
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
