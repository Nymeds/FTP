# 📡 Servidor FTP com Interface Web

Projeto de um servidor FTP funcional desenvolvido em Node.js, com uma interface web para gerenciar arquivos pelo navegador — sem precisar de um cliente FTP externo como FileZilla.

---

## 🧠 Como o projeto funciona

O projeto tem duas partes que rodam ao mesmo tempo:

**`server.js`** — é o servidor FTP de verdade. Ele fica escutando conexões na porta `2121` e aceita comandos do protocolo FTP (upload, download, listar arquivos, criar pasta, etc). Os arquivos ficam salvos na pasta `/arquivos`.

**`web.js`** — é uma interface web feita com Express. O usuário acessa pelo navegador, clica nos botões, e o `web.js` traduz essas ações em comandos FTP reais, usando o `basic-ftp` para se comunicar com o `server.js`.

```
Navegador → (HTTP) → web.js → (FTP) → server.js → /arquivos
```

O navegador não fala FTP — então o `web.js` age como intermediário entre o usuário e o servidor FTP.

---

## 🗂️ Estrutura

```
FTP/
├── server.js       # Servidor FTP
├── web.js          # Interface web
├── arquivos/       # Onde os arquivos ficam armazenados
├── uploads/        # Pasta temporária do multer (deletada após upload)
├── web.log         # Log das operações
└── package.json
```

---

## ▶️ Como rodar

```bash
npm install
```

Abra dois terminais:

```bash
# Terminal 1 — servidor FTP
node server.js

# Terminal 2 — interface web
node web.js
```

Acesse **http://localhost:3000** no navegador.

---

## 🔐 Login

```
Host:    127.0.0.1
Porta:   2121
Usuário: admin
Senha:   123
```

---

## ✨ Funcionalidades

- **Upload** de arquivos com barra de progresso
- **Download** de qualquer arquivo
- **Visualizar** imagens e arquivos de texto direto no navegador (sem baixar)
- **Deletar** arquivos
- **Renomear** arquivos e pastas
- **Criar pastas**
- **Navegar** entre diretórios com breadcrumb
- **Logs** de todas as operações no console e em arquivo

---

## 🔄 Fluxo de cada operação

### Upload
1. Usuário seleciona o arquivo no navegador
2. O `web.js` recebe o arquivo via HTTP (multer salva temporariamente em `/uploads`)
3. O `web.js` conecta no servidor FTP e executa o comando `STOR`
4. O arquivo é enviado para `/arquivos` no servidor FTP
5. O arquivo temporário é deletado

### Download
1. Usuário clica em Download
2. O `web.js` conecta no FTP e executa o comando `RETR`
3. O arquivo é transmitido em stream direto para o navegador (sem salvar no disco no meio)

### Delete
1. Usuário clica em Delete e confirma
2. O `web.js` conecta no FTP e executa o comando `DELE`
3. Arquivo removido do servidor

### Rename
1. Usuário abre o modal e digita o novo nome
2. O `web.js` executa dois comandos FTP em sequência: `RNFR` (nome antigo) + `RNTO` (nome novo)

### Criar pasta
1. Usuário digita o nome no modal
2. O `web.js` executa o comando `MKD` no servidor FTP

### Listar arquivos
1. Toda vez que uma pasta é aberta, o `web.js` executa o comando `LIST` no FTP
2. O servidor retorna os metadados (nome, tamanho, data)
3. O `web.js` renderiza o grid de arquivos em HTML

---

## 📦 Dependências

| Pacote | Função |
|--------|--------|
| `ftp-srv` | Cria o servidor FTP (`server.js`) |
| `basic-ftp` | Cliente FTP usado pelo `web.js` para se conectar ao servidor |
| `express` | Servidor HTTP da interface web |
| `multer` | Recebe o arquivo do navegador antes de enviar pro FTP |

---

## 📝 Logs

Todas as operações são registradas no console e no arquivo `web.log`:

```
✅ Upload concluído   | file="foto.jpg" tamanho=1.2 MB dir="/"
✅ Download concluído | file="doc.pdf" dir="/"
✅ Arquivo deletado   | file="old.txt" dir="/"
✅ Arquivo renomeado  | de="a.txt" para="b.txt" dir="/"
✅ Pasta criada       | name="fotos" dir="/"
ℹ️  Listagem de pasta  | dir="/fotos" itens=12
❌ Erro no upload     | file="x.zip" err=connection reset
```

---

## ⚠️ Observações

- O servidor roda localmente (`127.0.0.1`) — não é acessível pela internet sem configuração extra
- Credenciais fixas no código (`admin` / `123`) — adequado apenas para uso local/acadêmico
- O `web.js` guarda a sessão FTP em memória — reiniciar o servidor pede login novamente