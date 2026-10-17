# PFL Matchmaker — Node.js

## Instalar no Replit
1. Envie os arquivos deste projeto para um Repl Node.js.
2. Em **Secrets / Environment variables**, configure `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_ID` (opcional) e `DATABASE_PATH=./data/pfl.sqlite`.
3. Rode `npm install`.
4. Rode `npm run register` uma vez para publicar os slash commands no servidor definido em `GUILD_ID`.
5. Rode `npm start`.

No Discord Developer Portal, habilite `bot` e `applications.commands`. Dê ao bot Manage Roles, Send Messages, Embed Links e Use Application Commands. O cargo do bot deve ficar acima dos cargos gerenciados.

Canais configurados:
- Amistosos: 1560773367726874754
- Criação de times: 1560784886359658556
- Amistosos de seleções: 1560779635258826752
- Transferências: 1560777756500037692
- Logs: 1560829407105523850

**Aviso:** o banco SQLite começa vazio. Se seu projeto antigo usa outro banco SQL, faça backup e migração antes de substituir. Não existe como garantir funcionamento real sem configurar o token, permissões e testar no seu servidor.
