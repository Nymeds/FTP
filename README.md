# FTP Lab Manager

Projeto academico com servidor FTP/FTPS em Python, API em Node.js e interface React para gerenciamento de arquivos.

## O que foi implementado

- autenticacao por usuario e senha
- listagem de arquivos e diretorios
- upload e download
- criacao, renomeacao e exclusao de itens
- interface web estilo gerenciador de arquivos
- criptografia com **FTPS explicito (TLS)**
- configuracao centralizada por `.env`

## Estrutura

```text
FTP/
|- backend/
|  |- arquivos/
|  |- uploads/
|  |- certs/                  # certificado FTPS gerado automaticamente
|  |- server.py               # servidor Python
|  |- web.js                  # backend em node
|  |- load_env.py             # charger envs
|  |- loadEnv.js
|- frontend/
|  |- src/
|  |- dist/
|  |- index.html
|  |- vite.config.mjs
|- .env
|- .env.example
|- package.json
```

## Configuracao por .env

```env
FTP_HOST=127.0.0.1
FTP_PORT=21
FTP_ADMIN_NAME=admin
FTP_ADMIN_PASSWORD=123
FTPS_ENABLED=true
FTP_PASSIVE_START=30000
FTP_PASSIVE_END=30010
WEB_PORT=3000
```

Campos principais:

- `FTP_ADMIN_NAME`: usuario administrador do sistema
- `FTP_ADMIN_PASSWORD`: senha do administrador
- `FTP_PORT`: porta do servidor FTP/FTPS
- `FTPS_ENABLED`: ativa a criptografia TLS

Os arquivos [`.env`](/c:/Users/morai/Downloads/FTP/.env) e [`.env.example`](/c:/Users/morai/Downloads/FTP/.env.example) agora ficaram enxutos, contendo apenas as variaveis de configuracao.

## Como o .env funciona

O `.env` centraliza as configuracoes do projeto. Tanto o backend Node em [backend/web.js](/c:/Users/morai/Downloads/FTP/backend/web.js) quanto o servidor Python em [backend/server.py](/c:/Users/morai/Downloads/FTP/backend/server.py) leem essas variaveis na inicializacao, evitando alterar valores direto no codigo.

Fluxo pratico:

- o React envia requisicoes HTTP para a API Node
- a API Node usa os dados do `.env` como padrao de conexao
- o servidor Python sobe o servico FTP/FTPS com essas mesmas configuracoes
- se voce mudar usuario, senha, porta ou FTPS, precisa reiniciar `npm run start:ftp` e `npm start`

Variaveis principais:

- `FTP_HOST`: endereco do servidor FTP/FTPS
- `FTP_PORT`: porta do servidor, neste projeto configurada para `21`
- `FTP_ADMIN_NAME`: usuario administrador padrao
- `FTP_ADMIN_PASSWORD`: senha do administrador
- `FTPS_ENABLED`: ativa ou desativa criptografia TLS
- `FTP_PASSIVE_START` e `FTP_PASSIVE_END`: faixa de portas usada no modo passivo
- `WEB_PORT`: porta da interface web/API

## Fluxo da aplicacao

Arquitetura geral:

- Frontend React: interface visual usada pelo usuario
- Backend Node: API HTTP e cliente FTP/FTPS
- Backend Python: servidor FTP/FTPS real
- `backend/arquivos/`: diretorio base onde os arquivos ficam armazenados

Fluxo de uma acao:

1. o usuario clica em uma acao no frontend
2. o frontend chama uma rota HTTP do Node
3. o Node valida sessao e dados recebidos
4. o Node abre uma conexao FTP/FTPS com o Python
5. o Python executa a operacao no sistema de arquivos
6. o resultado volta para o Node e depois para o navegador

## Por que cada rota faz openFtpClient(...)

Trecho importante em [backend/web.js](/c:/Users/morai/Downloads/FTP/backend/web.js):

```js
client = await openFtpClient(req.ftpSession.config);
```

Isso acontece em cada rota protegida porque o navegador nao fala FTP direto, ele fala HTTP com o Node. Como HTTP e stateless, cada requisicao chega separada. O Node salva apenas a configuracao da sessao em `req.ftpSession.config` e, quando uma operacao precisa acontecer, abre uma nova conexao FTP/FTPS para aquela acao.

Essa decisao foi mantida por alguns motivos tecnicos:

- evita reaproveitar um socket FTP unico entre varias rotas diferentes
- reduz problemas com conexoes antigas, expirada ou quebradas
- combina melhor com o modelo de requisicoes independentes do HTTP
- facilita tratar erro por operacao, como falha de upload ou de listagem
- funciona melhor com a biblioteca `basic-ftp`, que trabalha bem com conexoes curtas e controladas

Comportamento padrao:

- o login valida credenciais abrindo uma conexao FTP/FTPS
- se a autenticacao funcionar, a configuracao fica salva na sessao HTTP
- cada rota reabre uma conexao usando essa configuracao salva
- ao final, `client.close()` encerra a conexao da operacao atual

## Pontos importantes para o relatorio

Sobre o protocolo FTP:

- FTP significa `File Transfer Protocol`
- ele foi criado para transferencia de arquivos em rede
- usa dois canais: controle para comandos e autenticacao, e dados para listagens e arquivos

Sobre o modo passivo:

- no modo passivo, o servidor informa uma porta de dados para a transferencia
- esse modo costuma funcionar melhor com firewall e NAT
- por isso o projeto define `FTP_PASSIVE_START` e `FTP_PASSIVE_END`

Sobre seguranca:

- FTP puro nao criptografa usuario, senha nem conteudo trafegado
- isso torna o protocolo inseguro em cenarios reais
- por isso o projeto implementa FTPS, que adiciona TLS ao FTP

Diferenca entre FTP, FTPS e SFTP:

- FTP: protocolo tradicional sem criptografia nativa
- FTPS: FTP com TLS/SSL
- SFTP: protocolo diferente, baseado em SSH

Papel de cada camada no projeto:

- Python: servidor FTP/FTPS
- Node: API web e cliente FTP/FTPS
- React: interface de gerenciamento de arquivos

Justificativa tecnica da arquitetura:

- separar frontend, API e servidor FTP facilita manutencao e organizacao
- usar `.env` permite trocar credenciais e portas sem alterar o codigo
- usar FTPS melhora a seguranca em relacao ao FTP puro
- reabrir conexao FTP em cada rota deixa o backend mais estavel

## Guia de acoes e metodos

Tabela pensada para facilitar 

| Acao | Node: rota | Node: funcao/fluxo principal | Node: chamada da lib FTP | Python: funcao/handler que recebe | O que acontece no Python | Onde olhar em caso de erro |
| --- | --- | --- | --- | --- | --- | --- |
| Login no servidor | `POST /api/session/connect` | `sanitizeConnectionPayload` -> `openFtpClient` -> `createSession` | `client.access(...)` | `on_connect`, `on_login`, `on_login_failed` em `CustomFTPHandler` / `CustomTLSFTPHandler` | aceita ou recusa a autenticacao e registra no log | `sendApiError`, `log("ERROR", "Falha ao conectar no FTP", ...)`, credenciais no `.env`, FTPS/TLS |
| Encerrar sessao | `DELETE /api/session` | `destroySession` | sem comando FTP direto | `on_disconnect` | fecha a conexao do cliente | cookie/sessao em `destroySession` e `getSession` |
| Listar arquivos e diretorios | `GET /api/files` | `requireSession` -> `normalizeRemoteDir` -> `openFtpClient` | `client.cd(dir)` + `client.list()` + `client.pwd()` | `on_cwd`, `on_list` | muda para o diretorio e faz a listagem | `Falha na listagem FTP`, caminho invalido, sessao expirada |
| Criar pasta | `POST /api/files/folder` | `sanitizeRemoteName` -> `buildRemotePath` | `client.ensureDir(targetPath)` | `on_mkd` | cria o diretorio remoto | `Falha ao criar pasta`, nome invalido ou permissao |
| Renomear item | `PATCH /api/files/rename` | `sanitizeRemoteName` -> `buildRemotePath` | `client.rename(oldPath, newPath)` | `on_rename` | renomeia arquivo ou pasta | `Falha ao renomear item`, nome repetido ou caminho invalido |
| Excluir arquivo | `DELETE /api/files/item?type=file` | `sanitizeRemoteName` -> `buildRemotePath` | `client.remove(targetPath)` | `on_file_removed` | remove o arquivo remoto | `Falha ao remover item`, arquivo inexistente ou permissao |
| Excluir pasta | `DELETE /api/files/item?type=directory` | `sanitizeRemoteName` -> `buildRemotePath` | `client.removeDir(targetPath)` | `on_rmd` | remove o diretorio remoto | `Falha ao remover item`, pasta nao vazia ou permissao |
| Enviar imagem/arquivo | `POST /api/files/upload` | `upload.array("files")` -> `openFtpClient` | `client.cd(dir)` + `client.uploadFrom(file.path, file.originalname)` | `on_file_received`, `on_incomplete_file_received` | recebe o arquivo e salva na pasta FTP | limite do `multer`, `Falha no upload`, arquivo temporario em `backend/uploads/` |
| Baixar arquivo | `GET /api/files/download` | `sanitizeRemoteName` -> `inferMimeType` | `client.cd(dir)` + `client.downloadTo(res, name)` | `on_file_sent`, `on_incomplete_file_sent` | envia o arquivo para o Node, que repassa ao navegador | `Falha no download`, nome invalido, arquivo inexistente |
| Preview de imagem | `GET /api/files/preview` | `sanitizeRemoteName` -> `inferMimeType` | `client.cd(dir)` + `client.downloadTo(res, name)` | `on_file_sent`, `on_incomplete_file_sent` | envia o arquivo para visualizacao no navegador | `Falha no preview`, nome invalido ou arquivo inexistente |
| Preview de texto | `GET /api/files/text` | `sanitizeRemoteName` -> `collectTextFromRemoteFile` | `client.cd(dir)` + `client.downloadTo(writable, name)` | `on_file_sent`, `on_incomplete_file_sent` | baixa o conteudo do arquivo e o Node devolve como texto | `Falha ao ler arquivo de texto`, encoding ou arquivo nao encontrado |

## Funcoes-chave para procurar no codigo

### Node (`backend/web.js`)

- `openFtpClient`: abre a conexao FTPS/FTP com o servidor Python
- `requireSession`: bloqueia rotas sem login
- `sanitizeConnectionPayload`: normaliza credenciais recebidas
- `normalizeRemoteDir`: padroniza diretorios remotos
- `sanitizeRemoteName`: valida nomes de arquivo e pasta
- `buildRemotePath`: monta caminhos remotos
- `collectTextFromRemoteFile`: usado no preview de texto
- `sendApiError`: resposta padrao de erro da API
- `upload.array("files")`: middleware que recebe os uploads HTTP

### Python (`backend/server.py`)

- `ensure_self_signed_certificate`: gera o certificado FTPS
- `build_server`: cria o servidor FTP/FTPS e registra o usuario admin
- `CustomFTPHandler`: eventos gerais do FTP
- `CustomTLSFTPHandler`: versao com criptografia FTPS
- `on_connect`: conexao iniciada
- `on_login` / `on_login_failed`: autenticacao
- `on_list`: listagem de diretorio
- `on_file_received`: upload recebido
- `on_file_sent`: download/preview enviado
- `on_mkd`: criacao de pasta
- `on_rename`: renomeacao
- `on_file_removed` / `on_rmd`: exclusao

## Criptografia

O servidor usa  **FTPS explicito (TLS)**:

- canal de controle protegido
- canal de dados protegido
- certificado autoassinado gerado automaticamente em `backend/certs/`

## Porta 21

O servidor esta configurado para rodar na porta `21` via `.env`.

Se o sistema operacional exigir permissao elevada para essa porta, execute o terminal com privilegio de administrador. Ou alterne para a porta comum da lib 2121

## Instalacao
- Necessario Node.js
- Necessario Python

### 1. Instalar dependencias Node.js

```bash
npm install
```

### 2. Instalar dependencias Python

```bash
python -m pip install pyftpdlib pyOpenSSL
```

### 3. Buildar o frontend

```bash
npm run build
```

## Execucao

### Iniciar o servidor FTP/FTPS

```bash
npm run start:ftp
```

### Iniciar a API e interface web

```bash
npm start
```

### Abrir no navegador

```text
http://localhost:3000
```

## Credenciais padrao

```text
Usuario: admin
Senha:   123
Porta:   21
```

## Observacao final

Se alterar o frontend:

```bash
npm run build
```

Se alterar usuario, senha ou porta:

- edite o `.env`
- reinicie `npm run start:ftp`
- reinicie `npm start`
