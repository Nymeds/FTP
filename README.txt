# Servidor FTP com Interface Web
Este projeto implementa um servidor FTP completo com uma interface web para gerenciamento de arquivos diretamente pelo navegador.
![Texto alternativo](prints/img.png)
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

NECESSARIO TER NODE E PYTHON PARA EXECUTAR

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


##  Comandos FTP: por que não usamos `CD`, `DIR`, `GET`, `PUT`?

Embora comandos como `CD`, `DIR`, `GET` e `PUT` sejam comuns em clientes FTP (como terminal ou FileZilla), **eles não fazem parte do protocolo FTP oficial**.

Esses comandos são apenas **atalhos (aliases)** criados por clientes para facilitar o uso humano.

O protocolo FTP real (definido na RFC 959) utiliza comandos diferentes, mais específicos e padronizados.

---

##  Diferença fundamental

| Tipo                          | Quem usa           | Exemplo               |
| ----------------------------- | ------------------ | --------------------- |
| Comando de cliente (atalho)   | Usuário humano     | `cd`, `dir`, `get`    |
| Comando real do protocolo FTP | Cliente ↔ Servidor | `CWD`, `LIST`, `RETR` |

 Ou seja:

```
cd pasta   → vira → CWD pasta
dir        → vira → LIST
get file   → vira → RETR file
put file   → vira → STOR file
```

---

##  Por que no código aparecem outros nomes?

Neste projeto:

* O servidor Python usa `pyftpdlib`
* O backend Node usa `basic-ftp`

Essas bibliotecas **não usam os atalhos**, elas trabalham diretamente com os comandos reais do protocolo FTP.

Isso acontece porque:

* Operam em nível mais próximo da rede
* Seguem o padrão oficial
* Evitam ambiguidades

---

##  Tabela de equivalência dos comandos

| Comando "popular"          | Comando FTP real                 | Função                  |
| -------------------------- | -------------------------------- | ----------------------- |
| `cd`                       | `CWD` (Change Working Directory) | Mudar de diretório      |
| `dir` / `ls`               | `LIST`                           | Listar arquivos         |
| `get`                      | `RETR` (Retrieve)                | Baixar arquivo          |
| `put`                      | `STOR` (Store)                   | Enviar arquivo          |
| `mkdir`                    | `MKD`                            | Criar diretório         |
| `rmdir`                    | `RMD`                            | Remover diretório       |
| `delete`                   | `DELE`                           | Apagar arquivo          |
| `rename`                   | `RNFR` + `RNTO`                  | Renomear arquivo        |
| `pwd`                      | `PWD`                            | Mostrar diretório atual |
| `binary` (`bin`)           | `TYPE I`                         | Modo binário            |
| `ascii`                    | `TYPE A`                         | Modo texto              |
| *(sem equivalente direto)* | `USER`                           | Informar usuário        |
| *(sem equivalente direto)* | `PASS`                           | Informar senha          |
| *(sem equivalente direto)* | `PASV`                           | Modo passivo            |
| *(sem equivalente direto)* | `PORT`                           | Modo ativo              |

---

##  Exemplos reais capturados no servidor

Com o sistema de logs implementado, é possível visualizar os comandos reais trafegando:

```
USER admin
PASS ***
CWD /arquivos
LIST
PASV
RETR arquivo.txt
STOR upload.txt
```

Isso mostra que:

* O cliente pode usar `get`, mas o servidor recebe `RETR`
* O cliente pode usar `put`, mas o servidor recebe `STOR`

---

##  Sobre `BIN` e `HASH`

Alguns comandos vistos em clientes FTP não fazem parte diretamente do protocolo:

| Comando          | Equivalente real                                     |
| ---------------- | ---------------------------------------------------- |
| `bin` / `binary` | `TYPE I`                                             |
| `hash`           | Não existe no protocolo (apenas visual de progresso) |

 O comando `HASH` não é enviado ao servidor — ele é apenas um recurso visual do cliente.

---

##  Conclusão

O projeto utiliza os comandos reais do protocolo FTP porque:

* Segue o padrão oficial
* Utiliza bibliotecas que operam em nível de protocolo
* Garante compatibilidade com qualquer cliente FTP

Os comandos como `cd`, `get`, `put` são apenas abstrações criadas para facilitar o uso humano, mas não fazem parte da comunicação real entre cliente e servidor.
