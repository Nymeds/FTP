const FtpSrv = require("ftp-srv");
const path = require("path");
const fs = require("fs");

const HOST = "127.0.0.1";
const PORT = 2121;

const ROOT_DIR = path.join(__dirname, "arquivos");

if (!fs.existsSync(ROOT_DIR)) {
fs.mkdirSync(ROOT_DIR, { recursive: true });
}

console.log("📂 Pasta FTP:", ROOT_DIR);

const ftpServer = new FtpSrv({
url: `ftp://${HOST}:${PORT}`,
anonymous: false
});

ftpServer.on("login", ({ username, password }, resolve, reject) => {

console.log("🔐 Tentativa login:", username);

if (username === "admin" && password === "123") {

console.log("✅ Login aprovado");

resolve({ root: ROOT_DIR });

} else {

console.log("❌ Login recusado");

reject(new Error("Login inválido"));

}

});

ftpServer.on("connection", () => {
console.log("🔌 Cliente conectado");
});

ftpServer.listen().then(() => {

console.log("🚀 Servidor FTP rodando");
console.log(`ftp://${HOST}:${PORT}`);
console.log("👤 user: admin");
console.log("🔑 senha: 123");

});