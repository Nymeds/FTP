import os
from datetime import datetime
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer
from pyftpdlib.authorizers import DummyAuthorizer

HOST = "127.0.0.1"
PORT = 21
ROOT_DIR = os.path.join(os.path.dirname(__file__), "arquivos")
LOG_FILE = os.path.join(os.path.dirname(__file__), "ftp-server.log")


os.makedirs(ROOT_DIR, exist_ok=True)

def timestamp():
    return datetime.now().isoformat()

def log(level, msg, extra=""):
    icons = {"INFO": "ℹ️", "WARN": "⚠️", "ERROR": "❌", "OK": "✅", "EVENT": "📡"}
    line = f"[{timestamp()}] [{level}] {msg}{' | ' + extra if extra else ''}"
    print(f"{icons.get(level,'')} {line}")
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

log("INFO", f"Pasta raiz FTP: {ROOT_DIR}")

#  Custom Handler 
class CustomFTPHandler(FTPHandler):

    def on_connect(self):
        log("EVENT", "Cliente conectado", f"ip={self.remote_ip}")

    def on_disconnect(self):
        log("EVENT", "Cliente desconectado", f"ip={self.remote_ip}")

    def on_login(self, username):
        log("OK", "Login aprovado", f"user={username} ip={self.remote_ip}")

    def on_login_failed(self, username, password):
        log("WARN", "Login recusado", f"user={username} ip={self.remote_ip}")

    def on_file_sent(self, file):
        log("OK", "Download", f"file={file}")

    def on_file_received(self, file):
        log("OK", "Upload", f"file={file}")

    def on_incomplete_file_sent(self, file):
        log("ERROR", "Download falhou", f"file={file}")

    def on_incomplete_file_received(self, file):
        log("ERROR", "Upload falhou", f"file={file}")

    def on_file_removed(self, file):
        log("OK", "Arquivo deletado", f"file={file}")

    def on_mkd(self, path):
        log("OK", "Pasta criada", f"dir={path}")

    def on_rmd(self, path):
        log("OK", "Pasta removida", f"dir={path}")

    def on_rename(self, fromname, toname):
        log("OK", "Arquivo renomeado", f"{fromname} -> {toname}")

    def on_cwd(self, path):
        log("INFO", "Mudança de diretório", f"dir={path}")

    def on_list(self, path):
        log("INFO", "Listagem de pasta", f"dir={path}")

    #  interceptar comandos (ACTIVE ou PASSIVE)
    def ftp_PORT(self, line):
        parts = line.split(",")
        port = int(parts[4]) * 256 + int(parts[5])
        log("EVENT", "Modo ACTIVE solicitado", f"porta_cliente={port}")
        return super().ftp_PORT(line)

    def ftp_PASV(self, line):
        log("EVENT", "Modo PASSIVE solicitado")
        return super().ftp_PASV(line)



authorizer = DummyAuthorizer()
authorizer.add_user("admin", "123", ROOT_DIR, perm="elradfmw")

handler = CustomFTPHandler
handler.authorizer = authorizer

# PASSIVE range 
handler.passive_ports = range(3000, 3010)

server = FTPServer((HOST, PORT), handler)

log("OK", f"Servidor FTP iniciado", f"ftp://{HOST}:{PORT}")
log("INFO", "Usuário: admin")
log("INFO", f"Log salvo em: {LOG_FILE}")

server.serve_forever()