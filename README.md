# PFL Matchmaker — Node.js

## Instalar no Replit
1. Envie os arquivos deste projeto para um Repl Node.js.
2. Em **Secrets / Environment variables**, configure `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_ID` (opcional) e `DATABASE_PATH=./data/pfl.sqlite`.
3. Rode `npm install`.
4. Rode `npm run register` uma vez para publicar os slash commands no servidor definido em `GUILD_ID`.
5. Rode `npm start`.

No Discord Developer Portal, habilite `bot` e `applications.commands`. Dê ao bot Manage Roles, Send Messages, Embed Links e Use Application Commands. O cargo do bot deve ficar acima dos cargos gerenciados.

## Ofertas de jogadores
Use `/ofertaplayer` com o jogador, a sigla do time comprador e o preço (mínimo 150.000). O dono ou manager registrado daquele time pode enviar a oferta; administradores do servidor e membros do cargo definido em `ADMIN_ROLE_ID` também podem usar a exceção administrativa, que fica registrada no histórico. O jogador recebe uma DM e tem 7 dias para aceitar ou recusar. Ao aceitar, o saldo do time é debitado e o saldo oficial do jogador é creditado na mesma transação do banco SQLite; a equipe do jogador também é atualizada. Uma DM que não puder ser entregue cancela a oferta sem movimentar saldo.

O autocomplete de times consulta os times cadastrados. Em `/selecionar-team`, somente clubes brasileiros sem dono são sugeridos. `/oferta` continua sendo a oferta entre clubes existente, separada de `/ofertaplayer`.

Canais configurados:
- Amistosos: 1560773367726874754
- Criação de times: 1560784886359658556
- Amistosos de seleções: 1560779635258826752
- Transferências: 1560777756500037692
- Logs: 1560829407105523850

**Aviso:** o banco SQLite começa vazio. Se seu projeto antigo usa outro banco SQL, faça backup e migração antes de substituir. Não existe como garantir funcionamento real sem configurar o token, permissões e testar no seu servidor.
