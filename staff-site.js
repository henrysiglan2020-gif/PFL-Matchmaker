const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const publicDirectory = path.join(__dirname, 'public');
const allowedAreas = new Set(['Moderacao', 'Suporte', 'Organizacao']);
const maxBodyBytes = 16 * 1024;
const rateLimitWindowMs = 15 * 60 * 1000;
const rateLimitMaxApplications = 3;
const rateLimits = new Map();
const applicationChannelId = process.env.STAFF_APPLICATION_CHANNEL_ID || '1568361610957820085';
const staffRoles = {
  Moderacao: process.env.STAFF_MODERATION_ROLE_ID || '1568360029650952342',
  Organizacao: process.env.STAFF_EVENTS_ROLE_ID || '1568360436657815822',
  Suporte: process.env.STAFF_SUPPORT_ROLE_ID || '1568361187937099897'
};

const pages = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/staff', ['staff.html', 'text/html; charset=utf-8']],
  ['/staff.html', ['staff.html', 'text/html; charset=utf-8']],
  ['/rules', ['rules.html', 'text/html; charset=utf-8']],
  ['/rules.html', ['rules.html', 'text/html; charset=utf-8']],
  ['/verify', ['verify.html', 'text/html; charset=utf-8']],
  ['/verify.html', ['verify.html', 'text/html; charset=utf-8']],
  ['/verificar.html', ['verify.html', 'text/html; charset=utf-8']],
  ['/assets/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/assets/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error('Corpo da solicitação muito grande.'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      body += chunk;
    });

    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Envie os dados do formulário em JSON.'), { statusCode: 400 }));
      }
    });

    request.on('error', reject);
  });
}

function field(value, label, maxLength, { optional = false } = {}) {
  if (typeof value !== 'string') {
    if (optional && (value === undefined || value === null)) return '';
    throw Object.assign(new Error(`Preencha o campo ${label}.`), { statusCode: 400 });
  }

  const cleaned = value.trim();
  if (!optional && !cleaned) {
    throw Object.assign(new Error(`Preencha o campo ${label}.`), { statusCode: 400 });
  }
  if (cleaned.length > maxLength) {
    throw Object.assign(new Error(`O campo ${label} excede o limite permitido.`), { statusCode: 400 });
  }
  return cleaned;
}

function validateApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Os dados do formulário são inválidos.'), { statusCode: 400 });
  }

  if (body.website) return null;

  const application = {
    applicantName: field(body.applicantName, 'nome/apelido', 80),
    discordUserId: field(body.discordUserId, 'ID do Discord', 20),
    area: field(body.area, 'área de interesse', 32),
    availability: field(body.availability, 'disponibilidade', 500),
    experience: field(body.experience, 'experiência', 1000, { optional: true }),
    motivation: field(body.motivation, 'motivação', 1000),
    acceptedRules: body.acceptedRules === true
  };

  if (!allowedAreas.has(application.area)) {
    throw Object.assign(new Error('Escolha uma área válida.'), { statusCode: 400 });
  }
  if (!/^\d{17,20}$/.test(application.discordUserId)) {
    throw Object.assign(new Error('Informe um ID de usuário Discord válido, com 17 a 20 números.'), { statusCode: 400 });
  }
  if (!application.acceptedRules) {
    throw Object.assign(new Error('Confirme que leu as regras antes de enviar.'), { statusCode: 400 });
  }
  return application;
}

function getRateLimit(ip, now) {
  for (const [key, state] of rateLimits) {
    if (state.resetAt <= now) rateLimits.delete(key);
  }

  let state = rateLimits.get(ip);
  if (!state || state.resetAt <= now) {
    if (rateLimits.size >= 5000 && !state) return null;
    state = { count: 0, resetAt: now + rateLimitWindowMs };
    rateLimits.set(ip, state);
  }

  if (state.count >= rateLimitMaxApplications) return false;
  state.count += 1;
  return true;
}

function getOAuthRedirectUri(provider) {
  const configured = process.env.SITE_BASE_URL;
  if (!configured) return null;

  let base;
  try {
    base = new URL(configured);
  } catch {
    return null;
  }
  if (
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  ) return null;

  const envKey = provider === 'discord' ? 'DISCORD_OAUTH_REDIRECT_URI' : 'ROBLOX_OAUTH_REDIRECT_URI';
  const callbackPath = `/oauth/${provider}/callback`;
  const redirectUri = process.env[envKey] || new URL(callbackPath, base).toString();
  try {
    const redirect = new URL(redirectUri);
    if (redirect.origin !== base.origin || redirect.pathname !== callbackPath || redirect.search || redirect.hash) return null;
  } catch {
    return null;
  }
  return redirectUri;
}

function oauthCookie(name, value, maxAge, secure) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function secureCookies() {
  return process.env.SITE_BASE_URL?.startsWith('https://') || false;
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  for (const part of (request.headers.cookie || '').split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) return cookie.slice(prefix.length);
  }
  return '';
}

function validOAuthState(request, name, providedState) {
  const savedState = readCookie(request, name);
  if (!/^[\da-f]{64}$/.test(savedState) || !/^[\da-f]{64}$/.test(providedState || '')) return false;
  return timingSafeEqual(Buffer.from(savedState, 'hex'), Buffer.from(providedState, 'hex'));
}

function redirectToVerify(response, result, cookies = []) {
  response.writeHead(303, {
    Location: `/verify.html?result=${encodeURIComponent(result)}`,
    'Cache-Control': 'no-store',
    'Set-Cookie': cookies
  });
  response.end();
}

async function oauthJson(url, options, provider, operation) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`${provider}_${operation}_FAILED_${response.status}`);
  }
  return response.json();
}

function sessionDiscordUser(db, request) {
  const sessionId = readCookie(request, 'pfl_site_session');
  if (!/^[\da-f]{64}$/.test(sessionId)) return null;
  const sessionHash = createHash('sha256').update(sessionId).digest('hex');
  const session = db.prepare(`
    SELECT discord_user_id FROM account_link_sessions
    WHERE session_hash = ? AND expires_at > ?
  `).get(sessionHash, Date.now());
  return session?.discord_user_id || null;
}

async function fetchGuildMember(client, discordUserId) {
  if (!process.env.GUILD_ID || !client?.isReady()) {
    throw new Error('Discord bot is offline or GUILD_ID is not configured.');
  }
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  return guild.members.fetch(discordUserId);
}

function applicationEmbed(application, status = 'Pendente de análise') {
  const colors = {
    'Pendente de análise': 0x3498db,
    Aceita: 0x2ecc71,
    Recusada: 0xe74c3c
  };
  const embed = new EmbedBuilder()
    .setColor(colors[status] || 0x3498db)
    .setTitle('📝 Candidatura para Staff')
    .setDescription(`Inscrição **#${application.id}** • **${status}**`)
    .addFields(
      { name: 'Discord informado', value: application.discord_user_id ? `<@${application.discord_user_id}> (${application.discord_user_id})` : application.discord_contact, inline: true },
      { name: 'Nome / apelido', value: application.applicant_name, inline: true },
      { name: 'Área', value: application.area, inline: true },
      { name: 'Disponibilidade', value: application.availability, inline: false },
      { name: 'Experiência', value: application.experience || 'Não informada', inline: false },
      { name: 'Motivação', value: application.motivation, inline: false }
    )
    .setTimestamp(new Date(application.created_at));
  if (application.reviewer_id) {
    embed.addFields({ name: 'Analisada por', value: `<@${application.reviewer_id}>`, inline: true });
  }
  return embed;
}

function applicationButtons(applicationId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`staff-application:accept:${applicationId}`)
        .setLabel('Aceitar candidatura')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`staff-application:decline:${applicationId}`)
        .setLabel('Recusar candidatura')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function notifyApplicationReview(client, application) {
  const results = [];
  const components = applicationButtons(application.id);

  try {
    const channel = await client.channels.fetch(applicationChannelId);
    if (!channel?.isTextBased() || !channel.guild) {
      throw new Error(`O canal de inscrições ${applicationChannelId} não está disponível ou não é um canal de texto do servidor.`);
    }
    const message = await channel.send({
      embeds: [applicationEmbed(application)],
      components,
      allowedMentions: { parse: [] }
    });
    results.push({ destination: 'channel', messageId: message.id });
  } catch (error) {
    console.error(`Falha ao publicar a inscrição #${application.id} no canal de staff:`, error);
    results.push({ destination: 'channel', error });
  }

  try {
    const guild = process.env.GUILD_ID ? await client.guilds.fetch(process.env.GUILD_ID) : null;
    const reviewerId = /^\d{17,20}$/.test(process.env.STAFF_FORM_ADMIN_ID || '')
      ? process.env.STAFF_FORM_ADMIN_ID
      : guild?.ownerId;
    if (!reviewerId) throw new Error('Configure STAFF_FORM_ADMIN_ID ou defina GUILD_ID para usar o dono do servidor como revisor.');
    const reviewer = await client.users.fetch(reviewerId);
    const message = await reviewer.send({
      embeds: [applicationEmbed(application)],
      components,
      allowedMentions: { parse: [] }
    });
    results.push({ destination: 'dm', messageId: message.id });
  } catch (error) {
    console.error(`Falha ao enviar a inscrição #${application.id} por DM para a administração:`, error);
    results.push({ destination: 'dm', error });
  }

  return results;
}

async function handleStaffApplicationInteraction(i, { db, admin }) {
  const match = /^staff-application:(accept|decline):(\d+)$/.exec(i.customId || '');
  if (!match) return false;

  const configuredReviewer = /^\d{17,20}$/.test(process.env.STAFF_FORM_ADMIN_ID || '')
    ? process.env.STAFF_FORM_ADMIN_ID
    : '';
  const isConfiguredReviewer = Boolean(configuredReviewer && i.user.id === configuredReviewer);
  const isServerReviewer = Boolean(
    i.guildId &&
    i.guildId === process.env.GUILD_ID &&
    admin(i)
  );
  let isGuildOwnerReviewer = false;
  if (!i.guildId && process.env.GUILD_ID && !configuredReviewer) {
    const guild = await i.client.guilds.fetch(process.env.GUILD_ID).catch(error => {
      console.error('Falha ao confirmar o dono do servidor para revisar candidatura por DM:', error);
      return null;
    });
    isGuildOwnerReviewer = guild?.ownerId === i.user.id;
  }
  if (!isConfiguredReviewer && !isServerReviewer && !isGuildOwnerReviewer) {
    await i.reply({ content: 'Apenas a administração do servidor pode analisar candidaturas.', ephemeral: true });
    return true;
  }

  const applicationId = Number(match[2]);
  const application = db.prepare('SELECT * FROM staff_applications WHERE id = ?').get(applicationId);
  if (!application) {
    await i.reply({ content: 'Essa candidatura não foi encontrada.', ephemeral: true });
    return true;
  }
  if (application.status !== 'pending') {
    await i.reply({ content: `Essa candidatura já foi ${application.status === 'accepted' ? 'aceita' : 'recusada'}.`, ephemeral: true });
    return true;
  }

  if (match[1] === 'decline') {
    const result = db.prepare(`
      UPDATE staff_applications SET status = 'declined', reviewer_id = ?, reviewed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(i.user.id, new Date().toISOString(), applicationId);
    if (!result.changes) {
      await i.reply({ content: 'Essa candidatura já foi analisada por outra pessoa.', ephemeral: true });
      return true;
    }
    const updated = db.prepare('SELECT * FROM staff_applications WHERE id = ?').get(applicationId);
    await i.update({ embeds: [applicationEmbed(updated, 'Recusada')], components: [] });
    try {
      const applicant = await i.client.users.fetch(application.discord_user_id);
      await applicant.send('Sua candidatura para a staff da PFL não foi aceita desta vez. Obrigado por se inscrever.');
    } catch (error) {
      console.error(`Falha ao notificar o candidato da inscrição #${applicationId} por DM:`, error);
    }
    return true;
  }

  const roleId = staffRoles[application.area];
  if (!roleId) {
    await i.reply({ content: 'Não há cargo configurado para a categoria desta candidatura.', ephemeral: true });
    return true;
  }

  const reserved = db.prepare(`
    UPDATE staff_applications SET status = 'reviewing', reviewer_id = ?
    WHERE id = ? AND status = 'pending'
  `).run(i.user.id, applicationId);
  if (!reserved.changes) {
    await i.reply({ content: 'Essa candidatura já está sendo analisada por outra pessoa.', ephemeral: true });
    return true;
  }

  let member;
  try {
    const guild = await i.client.guilds.fetch(process.env.GUILD_ID);
    member = await guild.members.fetch(application.discord_user_id);
    const role = await guild.roles.fetch(roleId);
    if (!role) throw new Error(`O cargo ${roleId} não existe no servidor.`);
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, `Staff application #${applicationId} accepted by ${i.user.id}`);
    }
  } catch (error) {
    db.prepare(`
      UPDATE staff_applications SET status = 'pending', reviewer_id = NULL
      WHERE id = ? AND status = 'reviewing'
    `).run(applicationId);
    console.error(`Falha ao conceder cargo para a inscrição #${applicationId}:`, error);
    await i.reply({
      content: 'Não consegui conceder o cargo. Confira se o bot tem Manage Roles e se o cargo do bot está acima do cargo de staff; a candidatura continua pendente.',
      ephemeral: true
    });
    return true;
  }

  db.prepare(`
    UPDATE staff_applications SET status = 'accepted', reviewed_at = ?
    WHERE id = ? AND status = 'reviewing'
  `).run(new Date().toISOString(), applicationId);
  const updated = db.prepare('SELECT * FROM staff_applications WHERE id = ?').get(applicationId);
  await i.update({ embeds: [applicationEmbed(updated, 'Aceita')], components: [] });
  try {
    const applicant = await i.client.users.fetch(application.discord_user_id);
    await applicant.send('Sua candidatura para a staff da PFL foi aceita! Você recebeu o cargo da categoria escolhida. 🎉');
  } catch (error) {
    console.error(`Falha ao notificar o candidato da inscrição #${applicationId} por DM:`, error);
  }
  return true;
}

function startStaffSite({ client, db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_name TEXT NOT NULL,
      discord_contact TEXT NOT NULL,
      roblox_username TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL,
      availability TEXT NOT NULL,
      experience TEXT NOT NULL DEFAULT '',
      motivation TEXT NOT NULL,
      accepted_rules INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      discord_user_id TEXT,
      discord_username TEXT NOT NULL DEFAULT '',
      discord_global_name TEXT NOT NULL DEFAULT '',
      roblox_user_id TEXT,
      roblox_display_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer_id TEXT,
      reviewed_at TEXT,
      channel_message_id TEXT,
      dm_message_id TEXT
    )
  `);
  const applicationColumns = new Set(
    db.prepare('PRAGMA table_info(staff_applications)').all().map(column => column.name)
  );
  for (const [name, definition] of [
    ['discord_user_id', 'TEXT'],
    ['discord_username', "TEXT NOT NULL DEFAULT ''"],
    ['discord_global_name', "TEXT NOT NULL DEFAULT ''"],
    ['roblox_user_id', 'TEXT'],
    ['roblox_display_name', "TEXT NOT NULL DEFAULT ''"],
    ['status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['reviewer_id', 'TEXT'],
    ['reviewed_at', 'TEXT'],
    ['channel_message_id', 'TEXT'],
    ['dm_message_id', 'TEXT']
  ]) {
    if (!applicationColumns.has(name)) {
      db.exec(`ALTER TABLE staff_applications ADD COLUMN ${name} ${definition}`);
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_link_sessions (
      session_hash TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS roblox_account_links (
      discord_user_id TEXT PRIMARY KEY,
      roblox_user_id TEXT NOT NULL UNIQUE,
      roblox_username TEXT NOT NULL,
      roblox_display_name TEXT NOT NULL DEFAULT '',
      discord_username TEXT NOT NULL DEFAULT '',
      discord_global_name TEXT NOT NULL DEFAULT '',
      linked_at TEXT NOT NULL
    )
  `);
  const accountColumns = new Set(
    db.prepare('PRAGMA table_info(roblox_account_links)').all().map(column => column.name)
  );
  for (const [name, definition] of [
    ['roblox_display_name', "TEXT NOT NULL DEFAULT ''"],
    ['discord_username', "TEXT NOT NULL DEFAULT ''"],
    ['discord_global_name', "TEXT NOT NULL DEFAULT ''"],
    ['discord_avatar_url', "TEXT NOT NULL DEFAULT ''"]
  ]) {
    if (!accountColumns.has(name)) {
      db.exec(`ALTER TABLE roblox_account_links ADD COLUMN ${name} ${definition}`);
    }
  }
  const sessionColumns = new Set(
    db.prepare('PRAGMA table_info(account_link_sessions)').all().map(column => column.name)
  );
  for (const [name, definition] of [
    ['discord_username', "TEXT NOT NULL DEFAULT ''"],
    ['discord_global_name', "TEXT NOT NULL DEFAULT ''"],
    ['discord_avatar_url', "TEXT NOT NULL DEFAULT ''"]
  ]) {
    if (!sessionColumns.has(name)) {
      db.exec(`ALTER TABLE account_link_sessions ADD COLUMN ${name} ${definition}`);
    }
  }

  const insertApplication = db.prepare(`
    INSERT INTO staff_applications (
      applicant_name, discord_contact, roblox_username, area,
      availability, experience, motivation, accepted_rules, created_at, discord_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    );

    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/staff/' || url.pathname === '/rules/') {
      response.writeHead(308, { Location: url.pathname.slice(0, -1) });
      response.end();
      return;
    }

    if (url.pathname === '/api/account') {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' });
        response.end();
        return;
      }

      const discordUserId = sessionDiscordUser(db, request);
      if (!discordUserId) {
        sendJson(response, 200, { authenticated: false, robloxLinked: false });
        return;
      }
      const sessionProfile = db.prepare(`
        SELECT discord_username, discord_global_name, discord_avatar_url
        FROM account_link_sessions
        WHERE discord_user_id = ? AND expires_at > ?
        ORDER BY expires_at DESC LIMIT 1
      `).get(discordUserId, Date.now());
      const link = db.prepare(`
        SELECT roblox_user_id, roblox_username, roblox_display_name,
          discord_username, discord_global_name, discord_avatar_url, linked_at
        FROM roblox_account_links WHERE discord_user_id = ?
      `).get(discordUserId);
      if (link) {
        link.discord_username ||= sessionProfile?.discord_username || '';
        link.discord_global_name ||= sessionProfile?.discord_global_name || '';
        link.discord_avatar_url ||= sessionProfile?.discord_avatar_url || '';
      }
      const guildId = process.env.GUILD_ID || '';
      sendJson(response, 200, {
        authenticated: true,
        discordUserId,
        discord: {
          username: link?.discord_username || sessionProfile?.discord_username || '',
          globalName: link?.discord_global_name || sessionProfile?.discord_global_name || '',
          avatarUrl: link?.discord_avatar_url || sessionProfile?.discord_avatar_url || ''
        },
        guildUrl: guildId ? `https://discord.com/channels/${guildId}` : 'https://discord.com/channels/@me',
        robloxLinked: Boolean(link),
        verified: Boolean(link),
        roblox: link ? {
          id: link.roblox_user_id,
          username: link.roblox_username,
          displayName: link.roblox_display_name,
          linkedAt: link.linked_at
        } : null
      });
      return;
    }

    if (url.pathname === '/api/logout') {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' });
        response.end();
        return;
      }
      const sessionId = readCookie(request, 'pfl_site_session');
      if (/^[\da-f]{64}$/.test(sessionId)) {
        db.prepare('DELETE FROM account_link_sessions WHERE session_hash = ?')
          .run(createHash('sha256').update(sessionId).digest('hex'));
      }
      response.setHeader('Set-Cookie', oauthCookie('pfl_site_session', '', 0, secureCookies()));
      sendJson(response, 200, {
        redirect: request.headers['x-switch-account'] === 'true'
          ? '/oauth/discord?switch=1'
          : '/verify.html'
      });
      return;
    }

    if (url.pathname === '/oauth/discord' || url.pathname === '/oauth/roblox') {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' });
        response.end();
        return;
      }

      const provider = url.pathname.endsWith('/discord') ? 'discord' : 'roblox';
      const clientId = process.env[provider === 'discord' ? 'DISCORD_OAUTH_CLIENT_ID' : 'ROBLOX_OAUTH_CLIENT_ID'] ||
        (provider === 'discord' ? process.env.CLIENT_ID : '');
      const redirectUri = getOAuthRedirectUri(provider);
      const discordUserId = provider === 'roblox' ? sessionDiscordUser(db, request) : null;
      if (!clientId || !process.env[provider === 'discord' ? 'DISCORD_OAUTH_CLIENT_SECRET' : 'ROBLOX_OAUTH_CLIENT_SECRET'] || !redirectUri) {
        redirectToVerify(response, 'oauth-not-configured');
        return;
      }
      if (provider === 'roblox' && !discordUserId) {
        redirectToVerify(response, 'connect-discord-first');
        return;
      }

      const state = randomBytes(32).toString('hex');
      const base = new URL(process.env.SITE_BASE_URL);
      const secure = base.protocol === 'https:';
      const stateCookie = oauthCookie(`${provider}_oauth_state`, state, 600, secure);
      const authorization = new URL(
        provider === 'discord'
          ? 'https://discord.com/oauth2/authorize'
          : 'https://apis.roblox.com/oauth/v1/authorize'
      );
      authorization.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: provider === 'discord' ? 'identify' : 'openid profile',
        state,
        ...(provider === 'discord' && url.searchParams.get('switch') === '1' ? { prompt: 'consent' } : {})
      }).toString();
      response.writeHead(302, {
        Location: authorization.toString(),
        'Cache-Control': 'no-store',
        'Set-Cookie': stateCookie
      });
      response.end();
      return;
    }

    if (url.pathname === '/oauth/discord/callback') {
      const stateCookie = oauthCookie('discord_oauth_state', '', 0, secureCookies());
      const state = url.searchParams.get('state');
      if (!validOAuthState(request, 'discord_oauth_state', state)) {
        redirectToVerify(response, 'oauth-state-invalid', [stateCookie]);
        return;
      }
      if (url.searchParams.has('error')) {
        redirectToVerify(response, 'discord-cancelled', [stateCookie]);
        return;
      }
      const code = url.searchParams.get('code');
      const clientId = process.env.DISCORD_OAUTH_CLIENT_ID || process.env.CLIENT_ID;
      const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
      const redirectUri = getOAuthRedirectUri('discord');
      if (!code || !clientId || !clientSecret || !redirectUri) {
        redirectToVerify(response, 'oauth-not-configured', [stateCookie]);
        return;
      }

      try {
        const tokenData = await oauthJson('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
          })
        }, 'discord', 'token');
        const discordUser = await oauthJson('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        }, 'discord', 'identity');
        if (!/^\d{17,20}$/.test(discordUser.id || '')) throw new Error('DISCORD_IDENTITY_INVALID');
        try {
          await fetchGuildMember(client, discordUser.id);
        } catch (error) {
          console.error('Discord login succeeded, but the server membership check failed:', error.message);
          redirectToVerify(response, String(error.code) === '10007' ? 'join-server' : 'discord-server-unavailable', [stateCookie]);
          return;
        }

        const sessionId = randomBytes(32).toString('hex');
        const now = Date.now();
        db.prepare('DELETE FROM account_link_sessions WHERE expires_at <= ?').run(now);
        db.prepare(`
          INSERT INTO account_link_sessions (
            session_hash, discord_user_id, expires_at, discord_username, discord_global_name, discord_avatar_url
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          createHash('sha256').update(sessionId).digest('hex'),
          discordUser.id,
          now + 7 * 24 * 60 * 60 * 1000,
          String(discordUser.username || '').slice(0, 100),
          String(discordUser.global_name || '').slice(0, 100),
          discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${discordUser.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
            : ''
        );
        const base = new URL(process.env.SITE_BASE_URL);
        response.writeHead(303, {
          Location: '/verify.html?result=discord-connected',
          'Cache-Control': 'no-store',
          'Set-Cookie': [
            stateCookie,
            oauthCookie('pfl_site_session', sessionId, 7 * 24 * 60 * 60, base.protocol === 'https:')
          ]
        });
        response.end();
      } catch (error) {
        console.error('Discord OAuth verification failed:', error.message);
        redirectToVerify(response, 'discord-verification-failed', [stateCookie]);
      }
      return;
    }

    if (url.pathname === '/oauth/roblox/callback') {
      const stateCookie = oauthCookie('roblox_oauth_state', '', 0, secureCookies());
      const state = url.searchParams.get('state');
      if (!validOAuthState(request, 'roblox_oauth_state', state)) {
        redirectToVerify(response, 'oauth-state-invalid', [stateCookie]);
        return;
      }
      if (url.searchParams.has('error')) {
        redirectToVerify(response, 'roblox-cancelled', [stateCookie]);
        return;
      }
      const code = url.searchParams.get('code');
      const discordUserId = sessionDiscordUser(db, request);
      const clientId = process.env.ROBLOX_OAUTH_CLIENT_ID;
      const clientSecret = process.env.ROBLOX_OAUTH_CLIENT_SECRET;
      const redirectUri = getOAuthRedirectUri('roblox');
      if (!code || !discordUserId || !clientId || !clientSecret || !redirectUri) {
        redirectToVerify(response, discordUserId ? 'oauth-not-configured' : 'connect-discord-first', [stateCookie]);
        return;
      }

      try {
        const tokenData = await oauthJson('https://apis.roblox.com/oauth/v1/token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
          })
        }, 'roblox', 'token');
        const robloxUser = await oauthJson('https://apis.roblox.com/oauth/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        }, 'roblox', 'identity');
        if (!/^\d{1,20}$/.test(String(robloxUser.sub || ''))) throw new Error('ROBLOX_IDENTITY_INVALID');
        const username = String(robloxUser.preferred_username || robloxUser.nickname || 'Roblox user').slice(0, 100);
        const displayName = String(robloxUser.name || robloxUser.nickname || username).slice(0, 100);
        const discordProfile = db.prepare(`
          SELECT discord_username, discord_global_name, discord_avatar_url
          FROM account_link_sessions
          WHERE discord_user_id = ? AND expires_at > ?
          ORDER BY expires_at DESC LIMIT 1
        `).get(discordUserId, Date.now());
        if (!discordProfile) throw new Error('DISCORD_SESSION_EXPIRED');
        db.prepare(`
          INSERT INTO roblox_account_links (
            discord_user_id, roblox_user_id, roblox_username, roblox_display_name,
            discord_username, discord_global_name, discord_avatar_url, linked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(discord_user_id) DO UPDATE SET
            roblox_user_id = excluded.roblox_user_id,
            roblox_username = excluded.roblox_username,
            roblox_display_name = excluded.roblox_display_name,
            discord_username = excluded.discord_username,
            discord_global_name = excluded.discord_global_name,
            discord_avatar_url = excluded.discord_avatar_url,
            linked_at = excluded.linked_at
        `).run(
          discordUserId,
          String(robloxUser.sub),
          username,
          displayName,
          discordProfile.discord_username,
          discordProfile.discord_global_name,
          discordProfile.discord_avatar_url,
          new Date().toISOString()
        );

        let roleGranted = false;
        const roleId = process.env.ROBLOX_VERIFIED_ROLE_ID;
        if (roleId) {
          try {
            const member = await fetchGuildMember(client, discordUserId);
            const role = await member.guild.roles.fetch(roleId);
            if (!role) throw new Error('Configured verification role does not exist in the guild.');
            if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'Discord and Roblox accounts linked through website OAuth');
            roleGranted = true;
          } catch (error) {
            console.error('Accounts were linked, but the verified role could not be granted:', error.message);
          }
        }

        redirectToVerify(response, roleId && !roleGranted ? 'roblox-linked-role-failed' : 'roblox-linked', [stateCookie]);
      } catch (error) {
        console.error('Roblox OAuth verification failed:', error.message);
        const result = /UNIQUE constraint failed: roblox_account_links\.roblox_user_id/.test(error.message)
          ? 'roblox-already-linked'
          : 'roblox-verification-failed';
        redirectToVerify(response, result, [stateCookie]);
      }
      return;
    }

    if (url.pathname === '/api/staff-applications') {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' });
        response.end('Método não permitido.');
        return;
      }
      if (!process.env.GUILD_ID) {
        sendJson(response, 503, { error: 'O site precisa ter o servidor Discord configurado.' });
        return;
      }
      if (!client?.isReady()) {
        sendJson(response, 503, { error: 'O bot está offline. Tente novamente em instantes.' });
        return;
      }
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        sendJson(response, 415, { error: 'Tipo de conteúdo não permitido.' });
        return;
      }

      const ip = request.socket.remoteAddress || 'unknown';
      const rateLimit = getRateLimit(ip, Date.now());
      if (rateLimit === false) {
        sendJson(response, 429, { error: 'Você atingiu o limite de inscrições. Tente novamente mais tarde.' });
        return;
      }
      if (rateLimit === null) {
        sendJson(response, 503, { error: 'O formulário está ocupado. Tente novamente mais tarde.' });
        return;
      }

      try {
        const application = validateApplication(await readJsonBody(request));
        if (!application) {
          sendJson(response, 200, { message: 'Formulário recebido.' });
          return;
        }
        const discordUserId = application.discordUserId;
        try {
          await fetchGuildMember(client, discordUserId);
        } catch (error) {
          console.error('Não foi possível confirmar se o ID informado participa do servidor:', error.message);
          sendJson(response, 403, { error: 'Esse ID não foi encontrado no servidor da PFL. Confira o ID e tente novamente.' });
          return;
        }

        const result = insertApplication.run(
          application.applicantName,
          `<@${discordUserId}>`,
          '',
          application.area,
          application.availability,
          application.experience,
          application.motivation,
          1,
          new Date().toISOString(),
          discordUserId
        );
        const savedApplication = db.prepare('SELECT * FROM staff_applications WHERE id = ?').get(result.lastInsertRowid);
        const deliveries = await notifyApplicationReview(client, savedApplication);
        const channelMessage = deliveries.find(delivery => delivery.destination === 'channel' && delivery.messageId);
        const dmMessage = deliveries.find(delivery => delivery.destination === 'dm' && delivery.messageId);
        db.prepare(`
          UPDATE staff_applications SET channel_message_id = ?, dm_message_id = ?
          WHERE id = ?
        `).run(channelMessage?.messageId || null, dmMessage?.messageId || null, result.lastInsertRowid);
        if (!channelMessage && !dmMessage) {
          sendJson(response, 202, {
            message: 'Sua inscrição foi salva, mas o bot não conseguiu avisar a administração. A equipe poderá consultá-la no banco de dados.'
          });
          return;
        }
        sendJson(response, 201, {
          message: channelMessage && dmMessage
            ? 'Inscrição enviada ao canal da equipe e à DM da administração! ✅'
            : channelMessage
              ? 'Inscrição enviada ao canal da equipe. A DM da administração falhou; a equipe ainda poderá analisá-la pelo canal. ✅'
              : 'Inscrição enviada à DM da administração. O canal da equipe não recebeu a mensagem.'
        });
      } catch (error) {
        if (error.statusCode) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }
        console.error('Falha ao processar inscrição de staff:', error);
        sendJson(response, 500, { error: 'Não foi possível processar sua inscrição. Tente novamente.' });
      }
      return;
    }

    const page = pages.get(url.pathname) || staticPage(url.pathname);
    if (!page || request.method !== 'GET') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Página não encontrada.');
      return;
    }

    try {
      const content = fs.readFileSync(path.join(publicDirectory, page[0]));
      response.writeHead(200, {
        'Content-Type': page[1],
        'Cache-Control': 'no-cache'
      });
      response.end(content);
    } catch (error) {
      console.error(`Falha ao carregar página do site (${page[0]}):`, error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Não foi possível carregar esta página.');
    }
  });

  server.on('error', error => {
    console.error('Falha no servidor do site de staff:', error);
  });

  const port = Number(process.env.WEB_PORT || process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('WEB_PORT/PORT precisa ser um número entre 1 e 65535.');
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Site PFL disponível na porta ${port} (/staff.html, /rules.html e /verify.html).`);
  });

  return server;
}

function staticPage(pathname) {
  const filename = pathname.startsWith('/public/')
    ? pathname.slice('/public/'.length)
    : pathname.slice(1);
  if (!filename || filename.includes('\\') || filename.split('/').some(part => part === '..')) return null;

  const resolvedPath = path.resolve(publicDirectory, filename);
  if (!resolvedPath.startsWith(publicDirectory + path.sep)) return null;
  try {
    if (!fs.statSync(resolvedPath).isFile()) return null;
  } catch {
    return null;
  }

  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }[path.extname(resolvedPath).toLowerCase()];
  return contentType ? [filename, contentType] : null;
}

module.exports = { startStaffSite, handleStaffApplicationInteraction };
