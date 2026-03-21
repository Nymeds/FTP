import os
from datetime import datetime, timedelta

from OpenSSL import crypto
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler, TLS_FTPHandler
from pyftpdlib.servers import FTPServer

from load_env import load_env


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR_PROJECT = os.path.dirname(BASE_DIR)
load_env(os.path.join(ROOT_DIR_PROJECT, ".env"))

HOST = os.getenv("FTP_HOST", "127.0.0.1")
PORT = int(os.getenv("FTP_PORT", "21"))
ADMIN_NAME = os.getenv("FTP_ADMIN_NAME", os.getenv("FTP_USER", "admin"))
ADMIN_PASSWORD = os.getenv("FTP_ADMIN_PASSWORD", os.getenv("FTP_PASSWORD", "123"))
ROOT_DIR = os.getenv("FTP_ROOT_DIR", os.path.join(BASE_DIR, "arquivos"))
LOG_FILE = os.getenv("FTP_LOG_FILE", os.path.join(BASE_DIR, "ftp-server.log"))
FALLBACK_LOG_FILE = os.path.join(BASE_DIR, "ftp-server-runtime.log")
PASSIVE_START = int(os.getenv("FTP_PASSIVE_START", "30000"))
PASSIVE_END = int(os.getenv("FTP_PASSIVE_END", "30010"))
FTPS_ENABLED = os.getenv("FTPS_ENABLED", "true").lower() == "true"
FTPS_CERT_FILE = os.getenv("FTPS_CERT_FILE", os.path.join(BASE_DIR, "certs", "ftp-cert.pem"))
FTPS_KEY_FILE = os.getenv("FTPS_KEY_FILE", os.path.join(BASE_DIR, "certs", "ftp-key.pem"))
ACTIVE_LOG_FILE = LOG_FILE


os.makedirs(ROOT_DIR, exist_ok=True)
os.makedirs(os.path.dirname(FTPS_CERT_FILE), exist_ok=True)


def timestamp():
    return datetime.now().isoformat(timespec="seconds")


def log(level, message, extra=""):
    global ACTIVE_LOG_FILE
    line = f"[{timestamp()}] [{level}] {message}"
    if extra:
        line = f"{line} | {extra}"

    print(line)
    for target in (ACTIVE_LOG_FILE, FALLBACK_LOG_FILE):
        try:
            with open(target, "a", encoding="utf-8") as handle:
                handle.write(f"{line}\n")
            ACTIVE_LOG_FILE = target
            break
        except OSError:
            continue


def ensure_self_signed_certificate():
    if os.path.exists(FTPS_CERT_FILE) and os.path.exists(FTPS_KEY_FILE):
        return

    key = crypto.PKey()
    key.generate_key(crypto.TYPE_RSA, 2048)

    certificate = crypto.X509()
    certificate.get_subject().C = "BR"
    certificate.get_subject().ST = "Local"
    certificate.get_subject().L = "Local"
    certificate.get_subject().O = "FTP Lab Manager"
    certificate.get_subject().OU = "Academic Project"
    certificate.get_subject().CN = HOST
    certificate.set_serial_number(int(datetime.now().timestamp()))
    certificate.gmtime_adj_notBefore(0)
    certificate.gmtime_adj_notAfter(int(timedelta(days=3650).total_seconds()))
    certificate.set_issuer(certificate.get_subject())
    certificate.set_pubkey(key)
    certificate.sign(key, "sha256")

    with open(FTPS_CERT_FILE, "wb") as cert_file:
        cert_file.write(crypto.dump_certificate(crypto.FILETYPE_PEM, certificate))

    with open(FTPS_KEY_FILE, "wb") as key_file:
        key_file.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, key))

    log("OK", "Self-signed FTPS certificate generated", FTPS_CERT_FILE)


class CustomFTPHandler(FTPHandler):
    banner = "FTP Lab Server ready."

    def on_connect(self):
        log("EVENT", "Client connected", f"ip={self.remote_ip}")

    def on_disconnect(self):
        log("EVENT", "Client disconnected", f"ip={self.remote_ip}")

    def on_login(self, username):
        log("OK", "Login accepted", f"user={username} ip={self.remote_ip}")

    def on_login_failed(self, username, password):
        log("WARN", "Login rejected", f"user={username} ip={self.remote_ip}")

    def on_file_sent(self, file):
        log("OK", "Download completed", f"file={file}")

    def on_file_received(self, file):
        log("OK", "Upload completed", f"file={file}")

    def on_incomplete_file_sent(self, file):
        log("ERROR", "Download failed", f"file={file}")

    def on_incomplete_file_received(self, file):
        log("ERROR", "Upload failed", f"file={file}")

    def on_file_removed(self, file):
        log("OK", "File removed", f"file={file}")

    def on_mkd(self, path):
        log("OK", "Directory created", f"path={path}")

    def on_rmd(self, path):
        log("OK", "Directory removed", f"path={path}")

    def on_rename(self, fromname, toname):
        log("OK", "Item renamed", f"from={fromname} to={toname}")

    def on_cwd(self, path):
        log("INFO", "Directory changed", f"path={path}")

    def on_list(self, path):
        log("INFO", "Directory listing requested", f"path={path}")

    def ftp_PORT(self, line):
        parts = line.split(",")
        if len(parts) >= 6:
            port = int(parts[4]) * 256 + int(parts[5])
            log("EVENT", "Active mode requested", f"client_port={port}")
        return super().ftp_PORT(line)

    def ftp_PASV(self, line):
        log("EVENT", "Passive mode requested")
        return super().ftp_PASV(line)


class CustomTLSFTPHandler(TLS_FTPHandler, CustomFTPHandler):
    certfile = FTPS_CERT_FILE
    keyfile = FTPS_KEY_FILE
    tls_control_required = True
    tls_data_required = True

    def on_login(self, username):
        log("OK", "Secure login accepted", f"user={username} ip={self.remote_ip}")


def build_server():
    authorizer = DummyAuthorizer()
    authorizer.add_user(ADMIN_NAME, ADMIN_PASSWORD, ROOT_DIR, perm="elradfmw")

    handler = CustomTLSFTPHandler if FTPS_ENABLED else CustomFTPHandler
    handler.authorizer = authorizer
    handler.passive_ports = range(PASSIVE_START, PASSIVE_END + 1)

    return FTPServer((HOST, PORT), handler)


if __name__ == "__main__":
    if FTPS_ENABLED:
        ensure_self_signed_certificate()

    protocol_label = "ftps" if FTPS_ENABLED else "ftp"
    log("INFO", "FTP root directory ready", ROOT_DIR)
    log("INFO", "Preferred FTP log file", LOG_FILE)
    log("INFO", "Fallback FTP log file", FALLBACK_LOG_FILE)
    log("INFO", "Passive port range", f"{PASSIVE_START}-{PASSIVE_END}")
    log("INFO", "Secure transport", "FTPS explicit TLS enabled" if FTPS_ENABLED else "Disabled")
    if FTPS_ENABLED:
        log("INFO", "FTPS certificate", FTPS_CERT_FILE)
        log("INFO", "FTPS private key", FTPS_KEY_FILE)
    log("OK", "FTP server started", f"{protocol_label}://{HOST}:{PORT}")
    log("INFO", "Configured administrator", f"user={ADMIN_NAME}")

    server = build_server()
    server.serve_forever()
