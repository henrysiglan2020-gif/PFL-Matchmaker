async function fetchAccount() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch('/api/account', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível consultar a conta.');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const accountRequest = fetchAccount();

document.querySelectorAll('[data-account-menu]').forEach(menu => {
  const trigger = menu.querySelector('.account-trigger');
  const actions = menu.querySelector('.account-actions');
  const avatar = menu.querySelector('[data-account-avatar]');
  const fallback = menu.querySelector('[data-account-fallback]');
  const name = menu.querySelector('[data-account-name]');
  const serverLink = menu.querySelector('[data-account-server]');
  const message = menu.querySelector('[data-account-message]');

  accountRequest.then(account => {
    if (!account.authenticated) return;
    menu.hidden = false;
    name.textContent = account.discord.globalName || account.discord.username || 'Conta Discord';
    serverLink.href = account.guildUrl;
    fallback.textContent = [...name.textContent][0]?.toUpperCase() || 'P';
    if (account.discord.avatarUrl) {
      avatar.src = account.discord.avatarUrl;
      avatar.hidden = false;
      fallback.hidden = true;
      avatar.addEventListener('error', () => {
        avatar.hidden = true;
        fallback.hidden = false;
      }, { once: true });
    }
  }).catch(() => {
    menu.hidden = true;
  });

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!expanded));
    actions.hidden = expanded;
  });

  menu.querySelectorAll('[data-account-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const switching = button.dataset.accountAction === 'switch';
      button.disabled = true;
      message.textContent = switching ? 'Preparando troca de conta...' : 'Saindo...';
      try {
        const response = await fetch('/api/logout', {
          method: 'POST',
          headers: { 'X-Switch-Account': String(switching) },
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('Não foi possível encerrar a sessão.');
        const result = await response.json();
        location.assign(result.redirect);
      } catch {
        message.textContent = 'Não foi possível concluir. Tente novamente.';
        button.disabled = false;
      }
    });
  });

  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) {
      actions.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      actions.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
});

const form = document.querySelector('#staff-form');

if (form) {
  const status = document.querySelector('#form-status');
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = 'Enviando sua inscrição...';
    status.classList.remove('error');
    submitButton.disabled = true;

    const values = new FormData(form);
    const payload = Object.fromEntries(values.entries());
    payload.acceptedRules = values.get('acceptedRules') === 'on';

    try {
      const response = await fetch('/api/staff-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      status.textContent = result.message || result.error || 'Não foi possível enviar sua inscrição.';
      if (!response.ok || response.status === 202) status.classList.add('error');
      if (response.ok) form.reset();
    } catch {
      status.textContent = 'Não foi possível conectar ao site. Tente novamente em instantes.';
      status.classList.add('error');
    } finally {
      submitButton.disabled = false;
    }
  });
}

const verifyStatus = document.querySelector('#verify-status');

if (verifyStatus) {
  const retryButton = document.querySelector('#verify-retry');
  const resultMessages = {
    'oauth-not-configured': 'A verificação ainda não está configurada. A administração precisa adicionar as credenciais OAuth e publicar o site em HTTPS. Veja os passos abaixo.',
    'oauth-state-invalid': 'A tentativa de autorização expirou ou não pôde ser confirmada. Comece novamente.',
    'discord-cancelled': 'A conexão Discord foi cancelada.',
    'discord-verification-failed': 'Não foi possível confirmar a conta Discord. Tente novamente.',
    'discord-server-unavailable': 'Não foi possível confirmar sua participação no servidor. Tente novamente mais tarde.',
    'join-server': 'Entre no servidor oficial da PFL com essa conta Discord e tente novamente.',
    'connect-discord-first': 'Conecte sua conta Discord primeiro.',
    'discord-connected': 'Discord conectado! Agora você pode autorizar o Roblox.',
    'roblox-cancelled': 'A conexão Roblox foi cancelada.',
    'roblox-verification-failed': 'Não foi possível confirmar a conta Roblox. Tente novamente.',
    'roblox-already-linked': 'Essa conta Roblox já está vinculada a outra conta Discord.',
    'roblox-linked': 'Contas vinculadas! A verificação foi concluída. ✅',
    'roblox-linked-role-failed': 'As contas foram vinculadas, mas o bot não conseguiu adicionar o cargo. Avise a administração.',
  };
  const result = new URLSearchParams(location.search).get('result');
  if (result && resultMessages[result]) verifyStatus.textContent = resultMessages[result];
  document.querySelector('#oauth-setup-help').hidden = result !== 'oauth-not-configured';

  const showAccount = account => {
    retryButton.hidden = true;
    document.querySelector('#discord-connect').hidden = account.authenticated;
    const retryRole = result === 'roblox-linked-role-failed';
    document.querySelector('#roblox-connect').hidden = !account.authenticated || (account.robloxLinked && !retryRole);
    document.querySelector('#roblox-connected').hidden = !account.robloxLinked;
    if (account.authenticated) {
      document.querySelector('#discord-account').textContent = `Discord conectado • ID ${account.discordUserId}`;
      if (!resultMessages[result]) {
        verifyStatus.textContent = 'Discord conectado. Autorize o Roblox para concluir a verificação.';
      }
    } else if (!resultMessages[result]) {
      verifyStatus.textContent = 'Conecte sua conta Discord para começar.';
    }
    if (account.robloxLinked) {
      const discordName = account.discord.globalName || account.discord.username || account.discordUserId;
      const robloxName = account.roblox.displayName || account.roblox.username;
      document.querySelector('#verified-accounts').textContent =
        `${discordName} • ${robloxName} (Roblox: ${account.roblox.username})`;
      verifyStatus.textContent = resultMessages[result] || 'Suas contas já estão vinculadas. ✅';
      if (retryRole) document.querySelector('#roblox-button').textContent = '🔄 Tentar adicionar cargo novamente';
    }
  };
  const checkAccount = () => {
    verifyStatus.classList.remove('error');
    verifyStatus.textContent = 'Consultando o status da sua conta (máximo de 7 segundos)...';
    retryButton.hidden = true;
    return fetchAccount()
      .then(showAccount)
      .catch(error => {
        verifyStatus.textContent = error.name === 'AbortError'
          ? 'A consulta demorou mais de 7 segundos. Confira sua conexão e tente novamente.'
          : 'Não foi possível carregar o status da verificação. Confira sua conexão e tente novamente.';
        verifyStatus.classList.add('error');
        retryButton.hidden = false;
      });
  };
  retryButton.addEventListener('click', checkAccount);
  accountRequest.then(showAccount).catch(error => {
    verifyStatus.textContent = error.name === 'AbortError'
      ? 'A consulta demorou mais de 7 segundos. Confira sua conexão e tente novamente.'
      : 'Não foi possível carregar o status da verificação. Confira sua conexão e tente novamente.';
    verifyStatus.classList.add('error');
    retryButton.hidden = false;
  });
}
