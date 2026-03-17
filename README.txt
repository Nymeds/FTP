# Servidor FTP com Interface Web

Este projeto implementa um servidor FTP completo com uma interface web para gerenciamento de arquivos diretamente pelo navegador.

A aplicação foi separada em duas partes independentes que se comunicam entre si:

* Um servidor FTP real (Python + pyftpdlib)
* Uma interface web (Node.js + Express)

A interface web atua como intermediária, traduzindo ações do usuário em comandos FTP.

---

## Como funciona

O fluxo da aplicação é o seguinte:

Navegador → HTTP → web.js → FTP → servidor Python → arquivos no disco

O navegador não entende FTP. Por isso, o backend em Node.js recebe requisições HTTP e executa operações FTP usando a biblioteca `basic-ftp`.

---

## Estrutura do projeto

```
FTP/
├── web.js              # Interface web (Node.js)
├── server.py           # Servidor FTP (Python)
├── arquivos/           # Diretório raiz dos arquivos
├── uploads/            # Arquivos temporários de upload
├── web.log             # Log da interface web
├── ftp-server.log      # Log do servidor FTP
└── package.json
```

---

## Como executar

### 1. Instalar dependências do Node

```bash
npm install
```

### 2. Instalar dependências do Python

```bash
pip install pyftpdlib
```

### 3. Executar o servidor FTP

```bash
python server.py
```

### 4. Executar a interface web

```bash
node web.js
```

### 5. Acessar no navegador

```
http://localhost:3000
```

---

## Credenciais padrão

```
Host:    127.0.0.1
Porta:   21
Usuário: admin
Senha:   123
```

---

## Funcionalidades

* Upload de arquivos com barra de progresso
* Download de arquivos
* Visualização de imagens no navegador
* Visualização de arquivos de texto
* Criação de pastas
* Renomeação de arquivos e diretórios
* Exclusão de arquivos
* Navegação entre pastas
* Logs detalhados de todas as operações

---

## Comportamento das operações

### Upload

O arquivo é enviado via HTTP, salvo temporariamente e depois transferido para o servidor FTP.

### Download

O arquivo é transmitido diretamente do servidor FTP para o navegador via stream.

### Listagem

Cada acesso a uma pasta executa um comando LIST no servidor FTP.

### Renomeação

Utiliza os comandos FTP RNFR e RNTO.

### Exclusão

Executa o comando DELE no servidor FTP.

---

## Logs

### Interface web

Arquivo: `web.log`

Registra ações como:

* Upload
* Download
* Erros
* Navegação

### Servidor FTP

Arquivo: `ftp-server.log`

Registra:

* Conexões
* Logins
* Transferências
* Erros

---

## Observações importantes

* O sistema é voltado para uso local
* Não há autenticação segura (não usar em produção)
* A sessão FTP não é persistente
* O servidor FTP utiliza modo passivo nas portas 3000 a 3010

---

## Melhorias implementadas

* Interface com Tailwind mais organizada
* Modal para ações (renomear, criar pasta)
* Barra de progresso no upload
* Preview de arquivos
* Tratamento de erros mais claro

---

## Possíveis melhorias futuras

* Autenticação real com sessão
* Upload múltiplo
* Drag and drop
* Suporte a HTTPS
* Controle de permissões por usuário

---

## Licença

Uso livre para fins acadêmicos e estudo
