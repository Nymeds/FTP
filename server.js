const FtpSrv = require("ftp-srv");
const path = require("path");
const fs = require("fs");

const HOST = "127.0.0.1";
const PORT = 2121;
const ROOT_DIR = path.join(__dirname, "arquivos");

if (!fs.existsSync(ROOT_DIR)) {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}


const LOG_FILE = path.join(__dirname, "ftp-server.log");

function timestamp() {
  return new Date().toISOString();
}

function log(level, msg, extra = "") {
  const icons = { INFO: "ℹ️ ", WARN: "⚠️ ", ERROR: "❌", OK: "✅", EVENT: "📡" };
  const line = `[${timestamp()}] [${level}] ${msg}${extra ? " | " + extra : ""}`;
  console.log(`${icons[level] || "  "} ${line}`);
  fs.appendFileSync(LOG_FILE, line + "\n");
}


log("INFO", `Pasta raiz FTP: ${ROOT_DIR}`);

const ftpServer = new FtpSrv({
  url: `ftp://${HOST}:${PORT}`,
  anonymous: false,

});



ftpServer.on("login", ({ connection, username, password }, resolve, reject) => {
  const ip = connection?.ip || "unknown";
  log("EVENT", `Tentativa de login`, `user="${username}" ip=${ip}`);

  if (username === "admin" && password === "123") {
    log("OK", `Login aprovado`, `user="${username}" ip=${ip}`);

    // Hooks de comandos FTP para logar operações de arquivo
    connection.on("RETR", (error, filePath) => {
      if (error) log("ERROR", `Download falhou`, `file="${filePath}" err=${error.message}`);
      else       log("OK",    `Download`,         `file="${filePath}" user="${username}"`);
    });

    connection.on("STOR", (error, filePath) => {
      if (error) log("ERROR", `Upload falhou`,   `file="${filePath}" err=${error.message}`);
      else       log("OK",    `Upload`,           `file="${filePath}" user="${username}"`);
    });

    connection.on("DELE", (error, filePath) => {
      if (error) log("ERROR", `Delete falhou`,   `file="${filePath}" err=${error.message}`);
      else       log("OK",    `Arquivo deletado`, `file="${filePath}" user="${username}"`);
    });

    connection.on("MKD", (error, dirPath) => {
      if (error) log("ERROR", `Mkdir falhou`,       `dir="${dirPath}" err=${error.message}`);
      else       log("OK",    `Pasta criada (MKD)`, `dir="${dirPath}" user="${username}"`);
    });

    connection.on("RMD", (error, dirPath) => {
      if (error) log("ERROR", `Rmdir falhou`,       `dir="${dirPath}" err=${error.message}`);
      else       log("OK",    `Pasta removida`,      `dir="${dirPath}" user="${username}"`);
    });

    connection.on("RNTO", (error, filePath) => {
      if (error) log("ERROR", `Rename falhou`,   `dest="${filePath}" err=${error.message}`);
      else       log("OK",    `Arquivo renomeado`, `dest="${filePath}" user="${username}"`);
    });

    connection.on("LIST", (error, dirPath) => {
      if (!error) log("INFO", `Listagem de pasta`, `dir="${dirPath}" user="${username}"`);
    });

    connection.on("CWD", (error, dirPath) => {
      if (!error) log("INFO", `Mudança de diretório`, `dir="${dirPath}" user="${username}"`);
    });

    connection.on("QUIT", () => {
      log("EVENT", `Sessão encerrada`, `user="${username}" ip=${ip}`);
    });

    resolve({ root: ROOT_DIR });
  } else {
    log("WARN", `Login recusado`, `user="${username}" ip=${ip}`);
    reject(new Error("Login inválido"));
  }
});

ftpServer.on("connection", (connection) => {
  const ip = connection?.ip || "unknown";
  log("EVENT", `Cliente conectado`, `ip=${ip}`);
});

ftpServer.on("client-error", ({ context, error }) => {
  log("ERROR", `Erro de cliente`, `ctx="${context}" err=${error?.message || error}`);
});

ftpServer.listen().then(() => {
  log("OK",    `Servidor FTP iniciado`, `ftp://${HOST}:${PORT}`);
  log("INFO",  `Usuário: admin`);
  log("INFO",  `Log salvo em: ${LOG_FILE}`);
});