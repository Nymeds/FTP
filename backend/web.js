const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const ftp = require("basic-ftp");
const multer = require("multer");
const path = require("path");
const stream = require("stream");

const { loadEnvFile } = require("./loadEnv");

loadEnvFile(path.join(__dirname, "..", ".env"));

const app = express();

const APP_PORT = Number(process.env.WEB_PORT || 3000);
const DIST_DIR = path.join(__dirname, "..", "frontend", "dist");
const UPLOAD_TEMP_DIR = path.join(__dirname, "uploads");
const LOG_FILE = path.join(__dirname, "web.log");
const SESSION_COOKIE = "ftp_session";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const FTP_TIMEOUT_MS = 15000;

const FTP_DEFAULTS = {
  host: process.env.FTP_HOST || "127.0.0.1",
  port: Number(process.env.FTP_PORT || 21),
  user: process.env.FTP_ADMIN_NAME || process.env.FTP_USER || "admin",
  password: process.env.FTP_ADMIN_PASSWORD || process.env.FTP_PASSWORD || "123",
  secure: String(process.env.FTPS_ENABLED || "true").toLowerCase() === "true",
};

const SERVER_DETAILS = {
  ftpHost: FTP_DEFAULTS.host,
  ftpPort: FTP_DEFAULTS.port,
  secureMode: FTP_DEFAULTS.secure ? "FTPS explicito (TLS)" : "FTP sem TLS",
  passiveRange: `${process.env.FTP_PASSIVE_START || 30000}-${process.env.FTP_PASSIVE_END || 30010}`,
  rootDirectory: "./backend/arquivos",
  notes: [
    "Cliente web com autenticacao FTP por usuario e senha.",
    "Listagem, upload, download, renomeacao, exclusao e criacao de pastas.",
    FTP_DEFAULTS.secure
      ? "Canal protegido com FTPS explicito e certificado local autoassinado."
      : "Criptografia FTPS desativada no ambiente atual.",
  ],
};

const sessions = new Map();

fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_TEMP_DIR,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(DIST_DIR, { index: false }));

function log(level, message, extra = "") {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${extra ? ` | ${extra}` : ""}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch (error) {
    console.error("Failed to write log:", error.message);
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function createSession(res, config) {
  clearExpiredSessions();
  const id = crypto.randomBytes(24).toString("hex");
  sessions.set(id, {
    config,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) {
    sessions.delete(sessionId);
  }

  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

function getSession(req) {
  clearExpiredSessions();
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "Sessao FTP nao encontrada. Conecte-se novamente.",
    });
  }

  req.ftpSession = session;
  return next();
}

function sanitizeConnectionPayload(body = {}) {
  return {
    host: String(body.host || "").trim(),
    port: Number(body.port || 0),
    user: String(body.user || "").trim(),
    password: String(body.password || ""),
    secure: body.secure === undefined ? FTP_DEFAULTS.secure : body.secure === true || body.secure === "true",
  };
}

function normalizeRemoteDir(dir = "/") {
  const base = String(dir || "/").replace(/\\/g, "/");
  const normalized = path.posix.normalize(base.startsWith("/") ? base : `/${base}`);
  if (!normalized || normalized === ".") {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function sanitizeRemoteName(name) {
  const value = String(name || "").trim();
  if (!value || value.includes("/") || value.includes("\\")) {
    return null;
  }
  return value;
}

function buildRemotePath(dir, name) {
  return path.posix.join(normalizeRemoteDir(dir), name);
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "";
  }
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function toClientEntry(item, dir) {
  const type = item.isDirectory ? "directory" : "file";
  return {
    name: item.name,
    type,
    isDirectory: item.isDirectory,
    size: item.size || 0,
    sizeLabel: item.isDirectory ? "--" : formatBytes(item.size || 0),
    modifiedAt: item.modifiedAt ? item.modifiedAt.toISOString() : null,
    path: buildRemotePath(dir, item.name),
    extension: item.isDirectory ? "" : path.extname(item.name).replace(".", "").toLowerCase(),
  };
}

async function openFtpClient(config) {
  const client = new ftp.Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;

  await client.access({
    host: config.host,
    port: Number(config.port),
    user: config.user,
    password: config.password,
    secure: config.secure ? true : false,
    secureOptions: config.secure
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
  });

  return client;
}

async function collectTextFromRemoteFile(client, fileName) {
  let data = "";
  const writable = new stream.Writable({
    write(chunk, encoding, callback) {
      data += chunk.toString("utf8");
      callback();
    },
  });

  await client.downloadTo(writable, fileName);
  return data;
}

function inferMimeType(fileName) {
  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    json: "application/json; charset=utf-8",
    pdf: "application/pdf",
  };
  return map[extension] || "application/octet-stream";
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
  });
}

function sendApiError(res, error, fallbackMessage, statusCode = 500) {
  const message = error && error.message ? error.message : fallbackMessage;
  return res.status(statusCode).json({
    ok: false,
    error: message || fallbackMessage,
  });
}

app.get("/api/meta", (req, res) => {
  res.json({
    ok: true,
    data: {
      appName: "FTP Lab Manager",
      defaults: {
        host: FTP_DEFAULTS.host,
        port: FTP_DEFAULTS.port,
        user: FTP_DEFAULTS.user,
        password: FTP_DEFAULTS.password,
        secure: FTP_DEFAULTS.secure,
      },
      server: SERVER_DETAILS,
    },
  });
});

app.get("/api/session", (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.json({
      ok: true,
      data: {
        connected: false,
        connection: null,
      },
    });
  }

  return res.json({
    ok: true,
    data: {
      connected: true,
        connection: {
          host: session.config.host,
          port: session.config.port,
          user: session.config.user,
          secure: session.config.secure,
        },
    },
  });
});

app.post("/api/session/connect", async (req, res) => {
  const config = sanitizeConnectionPayload(req.body);

  if (!config.host || !config.user || !config.password || !config.port) {
    return res.status(400).json({
      ok: false,
      error: "Informe host, porta, usuario e senha para conectar.",
    });
  }

  let client;
  try {
    client = await openFtpClient(config);
    const currentDir = await client.pwd();

    createSession(res, config);

    log("OK", "Conexao FTP estabelecida", `user=${config.user} server=${config.host}:${config.port} secure=${config.secure}`);

    return res.status(201).json({
      ok: true,
      data: {
        connection: {
          host: config.host,
          port: config.port,
          user: config.user,
          secure: config.secure,
        },
        currentDir,
      },
    });
  } catch (error) {
    log("ERROR", "Falha ao conectar no FTP", error.message);
    return sendApiError(res, error, "Nao foi possivel conectar ao servidor FTP.", 401);
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.delete("/api/session", (req, res) => {
  destroySession(req, res);
  log("INFO", "Sessao FTP encerrada");
  res.json({
    ok: true,
    data: {
      connected: false,
    },
  });
});

app.get("/api/files", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.query.dir || "/");
  let client;

  try {
    client = await openFtpClient(req.ftpSession.config);
    await client.cd(dir);
    const currentDir = await client.pwd();
    const entries = sortEntries((await client.list()).map((item) => toClientEntry(item, currentDir)));

    log("INFO", "Listagem carregada", `dir=${currentDir} items=${entries.length}`);

    return res.json({
      ok: true,
      data: {
        currentDir,
        entries,
      },
    });
  } catch (error) {
    log("ERROR", "Falha na listagem FTP", `dir=${dir} err=${error.message}`);
    return sendApiError(res, error, "Nao foi possivel listar os arquivos.");
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.post("/api/files/folder", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.body.dir || "/");
  const name = sanitizeRemoteName(req.body.name);

  if (!name) {
    return res.status(400).json({
      ok: false,
      error: "Informe um nome de pasta valido.",
    });
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    const targetPath = buildRemotePath(dir, name);
    await client.ensureDir(targetPath);

    log("OK", "Pasta criada", `path=${targetPath}`);

    return res.status(201).json({
      ok: true,
      data: {
        path: targetPath,
      },
    });
  } catch (error) {
    log("ERROR", "Falha ao criar pasta", `dir=${dir} err=${error.message}`);
    return sendApiError(res, error, "Nao foi possivel criar a pasta.");
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.patch("/api/files/rename", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.body.dir || "/");
  const oldName = sanitizeRemoteName(req.body.oldName);
  const newName = sanitizeRemoteName(req.body.newName);

  if (!oldName || !newName) {
    return res.status(400).json({
      ok: false,
      error: "Informe um nome atual e um novo nome validos.",
    });
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    const oldPath = buildRemotePath(dir, oldName);
    const newPath = buildRemotePath(dir, newName);
    await client.rename(oldPath, newPath);

    log("OK", "Item renomeado", `from=${oldPath} to=${newPath}`);

    return res.json({
      ok: true,
      data: {
        oldPath,
        newPath,
      },
    });
  } catch (error) {
    log("ERROR", "Falha ao renomear item", `dir=${dir} err=${error.message}`);
    return sendApiError(res, error, "Nao foi possivel renomear o item.");
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.delete("/api/files/item", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.query.dir || req.body.dir || "/");
  const name = sanitizeRemoteName(req.query.name || req.body.name);
  const type = String(req.query.type || req.body.type || "file");

  if (!name) {
    return res.status(400).json({
      ok: false,
      error: "Informe um nome valido para exclusao.",
    });
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    const targetPath = buildRemotePath(dir, name);

    if (type === "directory") {
      await client.removeDir(targetPath);
    } else {
      await client.remove(targetPath);
    }

    log("OK", "Item removido", `path=${targetPath} type=${type}`);

    return res.json({
      ok: true,
      data: {
        path: targetPath,
      },
    });
  } catch (error) {
    log("ERROR", "Falha ao remover item", `dir=${dir} err=${error.message}`);
    return sendApiError(res, error, "Nao foi possivel remover o item.");
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.post("/api/files/upload", requireSession, upload.array("files"), async (req, res) => {
  const dir = normalizeRemoteDir(req.query.dir || req.body.dir || "/");
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    return res.status(400).json({
      ok: false,
      error: "Nenhum arquivo foi enviado.",
    });
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    await client.cd(dir);

    const uploaded = [];

    for (const file of files) {
      await client.uploadFrom(file.path, file.originalname);
      uploaded.push({
        name: file.originalname,
        size: file.size,
        sizeLabel: formatBytes(file.size),
      });
    }

    log("OK", "Upload concluido", `dir=${dir} count=${uploaded.length}`);

    return res.status(201).json({
      ok: true,
      data: {
        uploaded,
      },
    });
  } catch (error) {
    log("ERROR", "Falha no upload", `dir=${dir} err=${error.message}`);
    return sendApiError(res, error, "Nao foi possivel concluir o upload.");
  } finally {
    for (const file of files) {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        log("WARN", "Falha ao limpar arquivo temporario", error.message);
      }
    }

    if (client) {
      client.close();
    }
  }
});

app.get("/api/files/text", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.query.dir || "/");
  const name = sanitizeRemoteName(req.query.name);
  if (!name) {
    return res.status(400).json({
      ok: false,
      error: "Arquivo invalido.",
    });
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    await client.cd(dir);
    const content = await collectTextFromRemoteFile(client, name);

    log("INFO", "Arquivo de texto carregado", `dir=${dir} file=${name}`);

    return res.json({
      ok: true,
      data: {
        name,
        dir,
        content,
      },
    });
  } catch (error) {
    log("ERROR", "Falha ao ler arquivo de texto", `dir=${dir} file=${name} err=${error.message}`);
    return sendApiError(res, error, "Nao foi possivel abrir o arquivo.");
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.get("/api/files/download", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.query.dir || "/");
  const name = sanitizeRemoteName(req.query.name);
  if (!name) {
    return res.status(400).send("Arquivo invalido.");
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    await client.cd(dir);
    res.setHeader("Content-Type", inferMimeType(name));
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    await client.downloadTo(res, name);
    log("OK", "Download concluido", `dir=${dir} file=${name}`);
  } catch (error) {
    log("ERROR", "Falha no download", `dir=${dir} file=${name} err=${error.message}`);
    if (!res.headersSent) {
      res.status(500).send(error.message || "Erro no download.");
    }
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.get("/api/files/preview", requireSession, async (req, res) => {
  const dir = normalizeRemoteDir(req.query.dir || "/");
  const name = sanitizeRemoteName(req.query.name);
  if (!name) {
    return res.status(400).send("Arquivo invalido.");
  }

  let client;
  try {
    client = await openFtpClient(req.ftpSession.config);
    await client.cd(dir);
    res.setHeader("Content-Type", inferMimeType(name));
    await client.downloadTo(res, name);
    log("INFO", "Preview carregado", `dir=${dir} file=${name}`);
  } catch (error) {
    log("ERROR", "Falha no preview", `dir=${dir} file=${name} err=${error.message}`);
    if (!res.headersSent) {
      res.status(500).send(error.message || "Erro no preview.");
    }
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    data: {
      status: "online",
      webPort: APP_PORT,
      frontendBuilt: fs.existsSync(path.join(DIST_DIR, "index.html")),
    },
  });
});

app.get(/^\/(?!api).*/, (req, res) => {
  const indexFile = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexFile)) {
    return res.status(503).send("Frontend nao encontrado. Execute `npm run build` antes de iniciar a aplicacao.");
  }

  return res.sendFile(indexFile);
});

app.listen(APP_PORT, () => {
  log("OK", "FTP Lab Manager iniciado", `http://localhost:${APP_PORT}`);
  log("INFO", "Servidor web pronto para servir a interface React");
});
