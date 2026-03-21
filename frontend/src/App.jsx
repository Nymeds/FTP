import { useDeferredValue, useEffect, useRef, useState } from "react";

const TEXT_EXTENSIONS = ["txt", "md", "json", "csv", "log", "js", "py", "html", "css", "xml"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

function cls(...values) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value) {
  if (!value) {
    return "Sem data";
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatFileSize(bytes) {
  if (typeof bytes !== "number") {
    return "--";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function buildBreadcrumbs(dir) {
  const normalized = dir && dir !== "." ? dir : "/";
  const parts = normalized.split("/").filter(Boolean);
  const breadcrumbs = [{ label: "root", value: "/" }];
  let current = "";

  for (const part of parts) {
    current += `/${part}`;
    breadcrumbs.push({
      label: part,
      value: current,
    });
  }

  return breadcrumbs;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Nao foi possivel concluir a operacao.");
    }
    return payload.data;
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return null;
}

function canPreview(entry) {
  return IMAGE_EXTENSIONS.includes(entry.extension) || TEXT_EXTENSIONS.includes(entry.extension);
}

function isImageEntry(entry) {
  return IMAGE_EXTENSIONS.includes(entry.extension);
}

function entryIcon(entry) {
  if (entry.isDirectory) {
    return "folder";
  }

  if (IMAGE_EXTENSIONS.includes(entry.extension)) {
    return "image";
  }

  if (TEXT_EXTENSIONS.includes(entry.extension)) {
    return "text";
  }

  return "file";
}

function StatusBadge({ connected }) {
  return (
    <span className={cls("status-badge", connected ? "online" : "offline")}>
      <span className="status-dot" />
      {connected ? "Conectado" : "Desconectado"}
    </span>
  );
}

function MetricItem({ label, value }) {
  return (
    <div className="metric-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoginScreen({ busy, connectionForm, meta, onChange, onSubmit }) {
  return (
    <div className="login-shell">
      <section className="login-copy-panel">
        <p className="section-tag">FTP Manager</p>
        <h1>Gerencie seu servidor como um explorador de arquivos.</h1>
        <p className="lead">
          Entre com as credenciais do servidor FTP para abrir um painel limpo, intuitivo e pronto para upload, download e navegacao de diretorios.
        </p>

        <div className="login-points">
          <div className="point-card">
            <strong>Login e autenticacao</strong>
            <span>Conexao validada antes de liberar a area de controle.</span>
          </div>
          <div className="point-card">
            <strong>Operacoes basicas</strong>
            <span>Listagem, upload, download, renomeacao e criacao de pastas.</span>
          </div>
          <div className="point-card">
            <strong>Visual amigavel</strong>
            <span>Layout mais proximo de um gerenciador de arquivos tradicional.</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-head">
          <div>
            <p className="section-tag">Acesso</p>
            <h2>Entrar no servidor FTP</h2>
          </div>
          <StatusBadge connected={false} />
        </div>

        <form className="form-stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Host</span>
            <input value={connectionForm.host} onChange={(event) => onChange("host", event.target.value)} placeholder="127.0.0.1" />
          </label>

          <div className="field-pair">
            <label className="field">
              <span>Porta</span>
              <input value={connectionForm.port} onChange={(event) => onChange("port", event.target.value)} placeholder="21" />
            </label>

            <label className="field">
              <span>Usuario</span>
              <input value={connectionForm.user} onChange={(event) => onChange("user", event.target.value)} placeholder="admin" />
            </label>
          </div>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              value={connectionForm.password}
              onChange={(event) => onChange("password", event.target.value)}
              placeholder="123"
            />
          </label>

          <button className="primary-button submit-button" type="submit" disabled={busy}>
            {busy ? "Conectando..." : "Entrar"}
          </button>
        </form>

        <div className="login-hint-grid">
          <MetricItem label="Host padrao" value={meta?.defaults?.host || "--"} />
          <MetricItem label="Porta" value={String(meta?.defaults?.port || "--")} />
          <MetricItem label="Usuario" value={meta?.defaults?.user || "--"} />
          <MetricItem label="Passivo" value={meta?.server?.passiveRange || "--"} />
          <MetricItem label="Seguranca" value={meta?.server?.secureMode || "--"} />
        </div>
      </section>
    </div>
  );
}

function Sidebar({
  busyMessage,
  currentDir,
  onDisconnect,
  onOpenFilePicker,
  onQueueFiles,
  onUpload,
  pendingFiles,
  session,
  uploadProgress,
  stats,
  fileInputRef,
}) {
  return (
    <aside className="sidebar">
      <section className="panel sidebar-section">
        <div className="sidebar-head">
          <div>
            <p className="section-tag">Sessao</p>
            <h2>Conexao ativa</h2>
          </div>
          <StatusBadge connected />
        </div>

        <div className="session-card">
          <strong>{session.host}:{session.port}</strong>
          <span>Usuario {session.user}</span>
          <span>{session.secure ? "FTPS/TLS ativo" : "Sem criptografia"}</span>
          <span>Diretorio atual {currentDir}</span>
        </div>

        <div className="metric-grid">
          <MetricItem label="Pastas" value={String(stats.directories)} />
          <MetricItem label="Arquivos" value={String(stats.files)} />
          <MetricItem label="Filtrados" value={String(stats.filtered)} />
          <MetricItem label="Fila upload" value={String(pendingFiles.length)} />
        </div>

        <button className="danger-button full-width" type="button" onClick={onDisconnect}>
          Desconectar
        </button>
      </section>

      <section className="panel sidebar-section">
        <div className="sidebar-head">
          <div>
            <p className="section-tag">Upload</p>
            <h2>Transferencia</h2>
          </div>
        </div>

        <div className="upload-drop">
          <strong>Diretorio de destino</strong>
          <span>{currentDir}</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden-input"
          multiple
          onChange={(event) => {
            onQueueFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="action-column">
          <button className="ghost-button full-width" type="button" onClick={onOpenFilePicker}>
            Selecionar arquivos
          </button>
          <button className="primary-button full-width" type="button" onClick={onUpload} disabled={!pendingFiles.length}>
            Enviar arquivos
          </button>
        </div>

        <div className="queue-list">
          {pendingFiles.length ? (
            pendingFiles.map((file) => (
              <div className="queue-item" key={`${file.name}-${file.size}`}>
                <span>{file.name}</span>
                <small>{formatFileSize(file.size)}</small>
              </div>
            ))
          ) : (
            <span className="muted-line">Nenhum arquivo selecionado.</span>
          )}
        </div>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
        </div>

        {busyMessage ? <div className="helper-banner">{busyMessage}</div> : null}
      </section>
    </aside>
  );
}

function Explorer({
  busyMessage,
  currentDir,
  entries,
  onCreateFolder,
  onDelete,
  onNavigate,
  onPreview,
  onRefresh,
  onRename,
  onSearch,
  search,
}) {
  return (
    <section className="panel explorer">
      <div className="explorer-topbar">
        <div>
          <p className="section-tag">Arquivos</p>
          <h2>Gerenciador remoto</h2>
        </div>

        <div className="toolbar-actions">
          <button className="ghost-button" type="button" onClick={onRefresh}>
            Atualizar
          </button>
          <button className="ghost-button" type="button" onClick={onCreateFolder}>
            Nova pasta
          </button>
        </div>
      </div>

      <div className="explorer-toolbar">
        <div className="breadcrumb-bar">
          {buildBreadcrumbs(currentDir).map((crumb) => (
            <button key={crumb.value} className="breadcrumb-chip" type="button" onClick={() => onNavigate(crumb.value)}>
              {crumb.label}
            </button>
          ))}
        </div>

        <label className="search-field">
          <span>Buscar</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Nome do arquivo ou pasta" />
        </label>
      </div>

      {busyMessage ? <div className="helper-banner subtle">{busyMessage}</div> : null}

      <div className="table-shell">
        <div className="table-head">
          <span>Nome</span>
          <span>Tipo</span>
          <span>Tamanho</span>
          <span>Modificado</span>
          <span>Acoes</span>
        </div>

        {entries.length ? (
          <div className="table-body">
            {entries.map((entry) => (
              <FileRow
                key={entry.path}
                currentDir={currentDir}
                entry={entry}
                onDelete={onDelete}
                onNavigate={onNavigate}
                onPreview={onPreview}
                onRename={onRename}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">FTP</div>
            <strong>Esse diretorio esta vazio.</strong>
            <span>Use "Nova pasta" ou envie arquivos para comecar.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function FileRow({ currentDir, entry, onDelete, onNavigate, onPreview, onRename }) {
  const kind = entry.isDirectory ? "Pasta" : "Arquivo";
  const icon = entryIcon(entry);
  const previewUrl = `/api/files/preview?dir=${encodeURIComponent(currentDir)}&name=${encodeURIComponent(entry.name)}`;

  return (
    <div className="table-row">
      <div className="name-cell">
        <span className={cls("file-icon", icon)}>
          {isImageEntry(entry) ? (
            <img className="file-thumb" src={previewUrl} alt={entry.name} loading="lazy" />
          ) : icon === "folder" ? (
            <span className="file-mark" aria-hidden="true">
              {"\u{1F4C1}"}
            </span>
          ) : icon === "text" ? (
            <span className="file-mark" aria-hidden="true">
              {"\u{1F4C4}"}
            </span>
          ) : (
            <span className="file-mark" aria-hidden="true">
              {"\u{1F4E6}"}
            </span>
          )}
        </span>
        <button className="name-button" type="button" onClick={() => (entry.isDirectory ? onNavigate(entry.path) : canPreview(entry) ? onPreview(entry) : null)}>
          {entry.name}
        </button>
      </div>

      <span className="cell-muted">{kind}</span>
      <span className="cell-muted">{entry.isDirectory ? "--" : entry.sizeLabel}</span>
      <span className="cell-muted">{formatDate(entry.modifiedAt)}</span>

      <div className="row-actions">
        {entry.isDirectory ? (
          <button className="row-action primary" type="button" onClick={() => onNavigate(entry.path)}>
            Abrir
          </button>
        ) : (
          <>
            {canPreview(entry) ? (
              <button className="row-action" type="button" onClick={() => onPreview(entry)}>
                Preview
              </button>
            ) : null}
            <a className="row-action" href={`/api/files/download?dir=${encodeURIComponent(currentDir)}&name=${encodeURIComponent(entry.name)}`}>
              Download
            </a>
          </>
        )}

        <button className="row-action" type="button" onClick={() => onRename(entry)}>
          Renomear
        </button>
        <button className="row-action danger" type="button" onClick={() => onDelete(entry)}>
          Excluir
        </button>
      </div>
    </div>
  );
}

function ModalOverlay({ children, onClose }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-shell" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function BaseModal({ title, subtitle, children, onClose }) {
  return (
    <div className="modal-card">
      <div className="modal-header">
        <div>
          <p className="section-tag">{subtitle}</p>
          <h3>{title}</h3>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      {children}
    </div>
  );
}

function FolderModal({ onCancel, onConfirm }) {
  const [name, setName] = useState("");

  return (
    <BaseModal title="Criar pasta" subtitle="Diretorio remoto" onClose={onCancel}>
      <label className="field">
        <span>Nome da pasta</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ex: trabalhos" autoFocus />
      </label>
      <div className="modal-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary-button" type="button" onClick={() => onConfirm(name)}>
          Criar
        </button>
      </div>
    </BaseModal>
  );
}

function RenameModal({ entry, onCancel, onConfirm }) {
  const [name, setName] = useState(entry.name);

  return (
    <BaseModal title="Renomear item" subtitle={entry.name} onClose={onCancel}>
      <label className="field">
        <span>Novo nome</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <div className="modal-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary-button" type="button" onClick={() => onConfirm(name)}>
          Salvar
        </button>
      </div>
    </BaseModal>
  );
}

function DeleteModal({ entry, onCancel, onConfirm }) {
  return (
    <BaseModal title="Excluir item" subtitle={entry.name} onClose={onCancel}>
      <p className="modal-text">
        Essa acao remove {entry.isDirectory ? "a pasta e o conteudo interno" : "o arquivo"} do servidor FTP.
      </p>
      <div className="modal-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="danger-button" type="button" onClick={onConfirm}>
          Confirmar exclusao
        </button>
      </div>
    </BaseModal>
  );
}

function PreviewModal({ content, currentDir, entry, loading, onClose }) {
  const isImage = IMAGE_EXTENSIONS.includes(entry.extension);

  return (
    <BaseModal title="Preview" subtitle={entry.name} onClose={onClose}>
      {loading ? (
        <div className="preview-loading">Carregando conteudo...</div>
      ) : isImage ? (
        <img
          className="preview-image"
          src={`/api/files/preview?dir=${encodeURIComponent(currentDir)}&name=${encodeURIComponent(entry.name)}`}
          alt={entry.name}
        />
      ) : (
        <pre className="preview-text">{content}</pre>
      )}
    </BaseModal>
  );
}

function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={cls("toast-card", toast.type)}>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.description}</p>
          </div>
          <button type="button" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function FloatingUploadButton({ count, onClick }) {
  return (
    <button className="floating-upload-button" type="button" onClick={onClick} aria-label="Adicionar arquivos">
      <span className="floating-upload-plus">+</span>
      {count ? <span className="floating-upload-count">{count}</span> : null}
    </button>
  );
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [connectionForm, setConnectionForm] = useState({
    host: "127.0.0.1",
    port: "21",
    user: "admin",
    password: "123",
    secure: true,
  });
  const [session, setSession] = useState(null);
  const [currentDir, setCurrentDir] = useState("/");
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [busyMessage, setBusyMessage] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastCounter = useRef(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [metaData, sessionData] = await Promise.all([requestJson("/api/meta"), requestJson("/api/session")]);
        if (!active) {
          return;
        }

        setMeta(metaData);
        setConnectionForm({
          host: String(metaData.defaults.host || ""),
          port: String(metaData.defaults.port || ""),
          user: String(metaData.defaults.user || ""),
          password: String(metaData.defaults.password || ""),
          secure: Boolean(metaData.defaults.secure),
        });

        if (sessionData.connected) {
          setSession(sessionData.connection);
          await loadDirectory("/", true);
        }
      } catch (error) {
        if (active) {
          pushToast("error", "Falha na inicializacao", error.message);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toasts.length) {
      return undefined;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.type === "error" ? 7000 : 4500),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  function pushToast(type, title, description) {
    const id = `${Date.now()}-${toastCounter.current}`;
    toastCounter.current += 1;
    setToasts((current) => [...current, { id, type, title, description }]);
  }

  async function loadDirectory(dir, silent = false) {
    if (!silent) {
      setBusyMessage("Carregando arquivos...");
    }

    try {
      const data = await requestJson(`/api/files?dir=${encodeURIComponent(dir)}`);
      setCurrentDir(data.currentDir);
      setEntries(data.entries);
    } catch (error) {
      if (String(error.message || "").toLowerCase().includes("sessao ftp")) {
        setSession(null);
        setEntries([]);
      }
      pushToast("error", "Falha ao listar arquivos", error.message);
    } finally {
      setBusyMessage("");
    }
  }

  async function handleConnect(event) {
    event.preventDefault();
    setBusyMessage("Validando credenciais...");

    try {
      const data = await requestJson("/api/session/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(connectionForm),
      });

      setSession(data.connection);
      pushToast("success", "Login realizado", `Conectado em ${data.connection.host}:${data.connection.port}.`);
      await loadDirectory(data.currentDir || "/", true);
    } catch (error) {
      pushToast("error", "Falha na autenticacao", error.message);
    } finally {
      setBusyMessage("");
    }
  }

  async function handleDisconnect() {
    setBusyMessage("Encerrando sessao...");
    try {
      await requestJson("/api/session", {
        method: "DELETE",
      });

      setSession(null);
      setEntries([]);
      setCurrentDir("/");
      setPendingFiles([]);
      setModal(null);
      pushToast("success", "Sessao encerrada", "A conexao FTP foi desconectada.");
    } catch (error) {
      pushToast("error", "Falha ao desconectar", error.message);
    } finally {
      setBusyMessage("");
    }
  }

  async function handleCreateFolder(name) {
    setBusyMessage("Criando pasta...");
    try {
      await requestJson("/api/files/folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dir: currentDir,
          name,
        }),
      });

      setModal(null);
      pushToast("success", "Pasta criada", `A pasta "${name}" foi criada com sucesso.`);
      await loadDirectory(currentDir, true);
    } catch (error) {
      pushToast("error", "Falha ao criar pasta", error.message);
    } finally {
      setBusyMessage("");
    }
  }

  async function handleRename(entry, newName) {
    setBusyMessage("Renomeando item...");
    try {
      await requestJson("/api/files/rename", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dir: currentDir,
          oldName: entry.name,
          newName,
        }),
      });

      setModal(null);
      pushToast("success", "Item renomeado", `"${entry.name}" agora se chama "${newName}".`);
      await loadDirectory(currentDir, true);
    } catch (error) {
      pushToast("error", "Falha ao renomear", error.message);
    } finally {
      setBusyMessage("");
    }
  }

  async function handleDelete(entry) {
    setBusyMessage("Removendo item...");
    try {
      await requestJson(`/api/files/item?dir=${encodeURIComponent(currentDir)}&name=${encodeURIComponent(entry.name)}&type=${encodeURIComponent(entry.type)}`, {
        method: "DELETE",
      });

      setModal(null);
      pushToast("success", "Item removido", `"${entry.name}" foi removido do servidor.`);
      await loadDirectory(currentDir, true);
    } catch (error) {
      pushToast("error", "Falha ao remover item", error.message);
    } finally {
      setBusyMessage("");
    }
  }

  async function openPreview(entry) {
    if (IMAGE_EXTENSIONS.includes(entry.extension)) {
      setModal({ type: "preview", entry, loading: false, content: "" });
      return;
    }

    if (!TEXT_EXTENSIONS.includes(entry.extension)) {
      pushToast("info", "Preview indisponivel", "Esse tipo de arquivo nao possui visualizacao rapida.");
      return;
    }

    setModal({ type: "preview", entry, loading: true, content: "" });

    try {
      const data = await requestJson(`/api/files/text?dir=${encodeURIComponent(currentDir)}&name=${encodeURIComponent(entry.name)}`);
      setModal({ type: "preview", entry, loading: false, content: data.content });
    } catch (error) {
      setModal(null);
      pushToast("error", "Falha ao carregar preview", error.message);
    }
  }

  function queueFiles(fileList) {
    const normalized = Array.from(fileList || []);
    if (!normalized.length) {
      return;
    }

    setPendingFiles(normalized);
    pushToast("info", "Arquivos selecionados", `${normalized.length} arquivo(s) pronto(s) para upload.`);
  }

  async function uploadPendingFiles() {
    if (!pendingFiles.length) {
      pushToast("info", "Sem arquivos", "Selecione pelo menos um arquivo.");
      return;
    }

    setBusyMessage("Enviando arquivos...");
    setUploadProgress(0);

    const formData = new FormData();
    pendingFiles.forEach((file) => formData.append("files", file));

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/files/upload?dir=${encodeURIComponent(currentDir)}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }

          try {
            const payload = JSON.parse(xhr.responseText);
            reject(new Error(payload.error || "Falha no upload."));
          } catch {
            reject(new Error("Falha no upload."));
          }
        };

        xhr.onerror = () => reject(new Error("Falha de rede durante o upload."));
        xhr.send(formData);
      });

      pushToast("success", "Upload concluido", `${pendingFiles.length} arquivo(s) enviado(s) com sucesso.`);
      setPendingFiles([]);
      setUploadProgress(100);
      await loadDirectory(currentDir, true);
    } catch (error) {
      pushToast("error", "Erro no upload", error.message);
    } finally {
      setBusyMessage("");
      window.setTimeout(() => setUploadProgress(0), 500);
    }
  }

  const filteredEntries = entries.filter((entry) => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return entry.name.toLowerCase().includes(query);
  });

  const stats = {
    directories: entries.filter((entry) => entry.isDirectory).length,
    files: entries.filter((entry) => !entry.isDirectory).length,
    filtered: filteredEntries.length,
  };

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  return (
    <div className="page-shell">
      <div className="page-glow page-glow-left" />
      <div className="page-glow page-glow-right" />

      {!session ? (
        <LoginScreen
          busy={Boolean(busyMessage)}
          connectionForm={connectionForm}
          meta={meta}
          onChange={(field, value) => setConnectionForm((current) => ({ ...current, [field]: value }))}
          onSubmit={handleConnect}
        />
      ) : (
        <div className="dashboard-shell">
          <header className="app-header">
            <div>
              <p className="section-tag">Painel FTP</p>
              <h1>Gerenciador de arquivos</h1>
              <p className="lead compact">Visual limpo, navegacao direta e acoes principais sempre acessiveis.</p>
            </div>
            <div className="header-info">
              <StatusBadge connected />
              <div className="header-lines">
                <span>{session.host}:{session.port}</span>
                <span>{session.secure ? `FTPS ativo · ${session.user}` : `FTP simples · ${session.user}`}</span>
              </div>
            </div>
          </header>

          <div className="workspace-grid">
            <Sidebar
              busyMessage={busyMessage}
              currentDir={currentDir}
              onDisconnect={handleDisconnect}
              onOpenFilePicker={openFilePicker}
              onQueueFiles={queueFiles}
              onUpload={uploadPendingFiles}
              pendingFiles={pendingFiles}
              session={session}
              stats={stats}
              uploadProgress={uploadProgress}
              fileInputRef={fileInputRef}
            />

            <Explorer
              busyMessage={busyMessage}
              currentDir={currentDir}
              entries={filteredEntries}
              onCreateFolder={() => setModal({ type: "folder" })}
              onDelete={(entry) => setModal({ type: "delete", entry })}
              onNavigate={(dir) => loadDirectory(dir)}
              onPreview={openPreview}
              onRefresh={() => loadDirectory(currentDir)}
              onRename={(entry) => setModal({ type: "rename", entry })}
              onSearch={setSearch}
              search={search}
            />
          </div>

          <FloatingUploadButton count={pendingFiles.length} onClick={openFilePicker} />
        </div>
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      {modal ? (
        <ModalOverlay onClose={() => setModal(null)}>
          {modal.type === "folder" ? <FolderModal onCancel={() => setModal(null)} onConfirm={handleCreateFolder} /> : null}
          {modal.type === "rename" ? <RenameModal entry={modal.entry} onCancel={() => setModal(null)} onConfirm={(newName) => handleRename(modal.entry, newName)} /> : null}
          {modal.type === "delete" ? <DeleteModal entry={modal.entry} onCancel={() => setModal(null)} onConfirm={() => handleDelete(modal.entry)} /> : null}
          {modal.type === "preview" ? (
            <PreviewModal
              content={modal.content}
              currentDir={currentDir}
              entry={modal.entry}
              loading={modal.loading}
              onClose={() => setModal(null)}
            />
          ) : null}
        </ModalOverlay>
      ) : null}
    </div>
  );
}
