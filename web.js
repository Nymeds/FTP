const express = require("express");
const ftp = require("basic-ftp");
const multer = require("multer");
const stream = require("stream");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.urlencoded({ extended: true }));

let ftpConfig = null;


function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + sizes[i];
}

function safe(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

async function connectFTP() {
  if (!ftpConfig) throw new Error("Faça login primeiro.");
  const client = new ftp.Client();
  client.ftp.verbose = false;
  await client.access({
    host: ftpConfig.host,
    port: Number(ftpConfig.port),
    user: ftpConfig.user,
    password: ftpConfig.password,
    secure: false,
  });
  return client;
}

function breadcrumb(dir) {
  const parts = dir.split("/").filter(Boolean);
  let acc = "";
  let html = `<a class="text-cyan-300" href="/files?dir=/">root</a>`;
  parts.forEach((p) => {
    acc += "/" + p;
    html += ` <span class="mx-2 text-slate-400">/</span> <a class="text-cyan-300" href="/files?dir=${encodeURIComponent(acc)}">${safe(p)}</a>`;
  });
  return html;
}

function fileKind(ext) {
  const map = {
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
    txt: "text", md: "text", json: "text", log: "text",
    js: "code", html: "code", css: "code",
    pdf: "pdf",
    zip: "archive", rar: "archive", "7z": "archive",
  };
  return map[ext] || "file";
}


function page(contentHtml, note = "") {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<title>FTP Manager</title>
<style>
.thumb { width:100%; height:120px; object-fit:cover; border-radius:8px; background:#0b1220; display:block; }
.card { transition: transform .08s ease, box-shadow .08s ease; }
.card:hover{ transform: translateY(-6px); box-shadow: 0 12px 30px rgba(2,6,23,0.6); }
pre.code{ background:#071026; color:#dff0ff; padding:12px; border-radius:8px; max-height:520px; overflow:auto; }
</style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen">
  <div class="max-w-6xl mx-auto p-6">
    <header class="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-cyan-400">FTP Manager</h1>
        <p class="text-sm text-slate-400">Conecte ao servidor e gerencie arquivos — interface limpa para apresentação</p>
      </div>
      <div class="text-sm text-right">
        ${ftpConfig ? `<div class="text-slate-300">Server: ${safe(ftpConfig.host)}:${safe(ftpConfig.port)}</div><div class="text-slate-400">User: ${safe(ftpConfig.user)}</div>` : `<div class="text-slate-400">Não conectado</div>`}
      </div>
    </header>

    ${note ? `<div class="mb-4 p-3 rounded bg-amber-500 text-black">${safe(note)}</div>` : ""}

    ${contentHtml}

  </div>

  <!-- modal -->
  <div id="modal" class="hidden fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
    <div class="bg-slate-800 w-full max-w-3xl rounded-lg overflow-auto">
      <div class="flex justify-between items-center p-4 border-b border-slate-700">
        <div id="modalTitle" class="font-semibold"></div>
        <div>
          <button onclick="closeModal()" class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">Fechar</button>
        </div>
      </div>
      <div id="modalBody" class="p-4"></div>
    </div>
  </div>

<script>
function openModal(title, innerHTML){
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalBody').innerHTML = innerHTML;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal(){
  document.getElementById('modalTitle').innerText = '';
  document.getElementById('modalBody').innerHTML = '';
  document.getElementById('modal').classList.add('hidden');
}
async function showImage(name,dir){
  openModal(name, '<img src="/preview?file='+encodeURIComponent(name)+'&dir='+encodeURIComponent(dir)+'" class="w-full h-auto rounded" />');
}
async function showText(name,dir){
  openModal(name, '<div class="text-sm text-slate-300">Carregando...</div>');
  try{
    const res = await fetch('/raw?file='+encodeURIComponent(name)+'&dir='+encodeURIComponent(dir));
    if(!res.ok) throw new Error('Erro');
    const txt = await res.text();
    document.getElementById('modalBody').innerHTML = '<pre class="code">'+txt.replace(/</g,'&lt;')+'</pre>';
  }catch(e){
    document.getElementById('modalBody').innerHTML = '<div class="text-red-400">Erro ao carregar</div>';
  }
}
function confirmDelete(file, dir){
  if(!confirm('Deletar \"'+file+'\" ?')) return;
  const form = document.createElement('form');
  form.method='POST';
  form.action='/delete';
  form.innerHTML = '<input type="hidden" name="dir" value="'+dir+'"><input type="hidden" name="file" value="'+file+'">';
  document.body.appendChild(form);
  form.submit();
}
function openRename(oldName, dir){
  const html = '<form method="POST" action="/rename" class="space-y-2">'+
    '<input type="hidden" name="dir" value="'+dir+'">'+
    '<input type="hidden" name="oldName" value="'+oldName+'">'+
    '<input name="newName" placeholder="Novo nome" class="w-full p-2 rounded bg-slate-700" />'+
    '<div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="px-3 py-1 rounded bg-slate-700">Cancelar</button><button class="px-3 py-1 rounded bg-yellow-500">Renomear</button></div>'+
    '</form>';
  openModal('Renomear: '+oldName, html);
}
function openMkdir(dir){
  const html = '<form method="POST" action="/mkdir" class="space-y-2">'+
    '<input type="hidden" name="dir" value="'+dir+'">'+
    '<input name="name" placeholder="Nome da pasta" class="w-full p-2 rounded bg-slate-700" />'+
    '<div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="px-3 py-1 rounded bg-slate-700">Cancelar</button><button class="px-3 py-1 rounded bg-cyan-500">Criar</button></div>'+
    '</form>';
  openModal('Criar Pasta', html);
}

/* AJAX upload with progress */
async function ajaxUpload(dir){
  const input = document.getElementById('fileInput');
  if(!input.files.length){ alert('Selecione um arquivo'); return; }
  const f = input.files[0];
  const form = new FormData();
  form.append('file', f);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/upload?dir='+encodeURIComponent(dir));
  const progressBar = document.getElementById('uploadBar');
  progressBar.style.width = '0%';
  progressBar.parentElement.classList.remove('hidden');
  xhr.upload.onprogress = function(e){
    if(e.lengthComputable){
      const p = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = p + '%';
    }
  };
  xhr.onload = function(){
    progressBar.parentElement.classList.add('hidden');
    if(xhr.status >=200 && xhr.status <300){
      location.reload();
    } else {
      alert('Erro no upload');
    }
  };
  xhr.onerror = function(){ progressBar.parentElement.classList.add('hidden'); alert('Erro no upload'); };
  xhr.send(form);
}
</script>

</body>
</html>`;
}



app.get("/", (req, res) => {
  const loginCard = `
    <div class="bg-slate-800 p-6 rounded max-w-md">
      <form method="POST" action="/login" class="space-y-3">
        <div>
          <label class="text-sm text-slate-300">Host</label>
          <input name="host" value="127.0.0.1" class="w-full mt-1 p-2 rounded bg-slate-700" />
        </div>
        <div>
          <label class="text-sm text-slate-300">Porta</label>
          <input name="port" value="2121" class="w-full mt-1 p-2 rounded bg-slate-700" />
        </div>
        <div>
          <label class="text-sm text-slate-300">Usuário</label>
          <input name="user" class="w-full mt-1 p-2 rounded bg-slate-700" />
        </div>
        <div>
          <label class="text-sm text-slate-300">Senha</label>
          <input type="password" name="password" class="w-full mt-1 p-2 rounded bg-slate-700" />
        </div>
        <div class="pt-2">
          <button class="w-full bg-cyan-500 hover:bg-cyan-600 p-2 rounded font-semibold">Conectar</button>
        </div>
      </form>
    </div>
  `;
  res.send(page(loginCard));
});

app.post("/login", (req, res) => {
  ftpConfig = req.body;
  res.redirect("/files?dir=/");
});

app.get("/files", async (req, res) => {
  if (!ftpConfig) return res.redirect("/");
  const dir = req.query.dir || "/";
  let client;
  try {
    client = await connectFTP();
    await client.cd(dir);
    const list = await client.list();

    let content = `<div class="mb-4 text-sm text-slate-400">Navegação: ${breadcrumb(dir)}</div>`;

    // top actions
    content += `
      <div class="flex gap-3 items-center mb-4">
        <button onclick="openMkdir('${dir}')" class="px-3 py-2 bg-slate-700 rounded">Nova pasta</button>

        <div class="flex items-center gap-2 bg-slate-800 p-2 rounded">
          <input id="fileInput" type="file" class="text-sm" />
          <button onclick="ajaxUpload('${dir}')" class="px-3 py-2 bg-green-500 rounded">Upload</button>
        </div>

        <div class="flex-1">
          <div id="uploadWrap" class="hidden bg-slate-800 rounded overflow-hidden mt-2">
            <div class="h-2 bg-slate-700"><div id="uploadBar" style="width:0%; height:100%; background:#06b6d4;"></div></div>
          </div>
        </div>
      </div>
    `;

    // grid
    content += `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">`;

    for (const f of list) {
      if (f.isDirectory) {
        content += `
          <div class="card p-3 bg-slate-800 rounded">
            <div class="text-3xl text-slate-300 mb-3">📁</div>
            <div class="font-medium break-all">${safe(f.name)}</div>
            <div class="mt-3 flex gap-2">
              <a href="/files?dir=${encodeURIComponent((dir === '/' ? '' : dir) + '/' + f.name)}" class="px-3 py-1 bg-cyan-600 rounded text-sm">Abrir</a>
              <button onclick="openRename('${f.name}','${dir}')" class="px-3 py-1 bg-yellow-500 rounded text-sm">Renomear</button>
            </div>
          </div>
        `;
      } else {
        const ext = (f.name.split(".").pop() || "").toLowerCase();
        const kind = fileKind(ext);
        const isImage = ["png","jpg","jpeg","gif","webp"].includes(ext);
        content += `
          <div class="card p-3 bg-slate-800 rounded flex flex-col">
            <div class="mb-3 ${isImage ? '' : 'text-4xl text-slate-300'}">
              ${isImage ? `<img class="thumb" src="/preview?file=${encodeURIComponent(f.name)}&dir=${encodeURIComponent(dir)}" />` : (kind === 'code' ? '<div class="text-slate-300">&lt;/&gt;</div>' : (kind==='text' ? '<div class="text-slate-300">📄</div>' : '<div class="text-slate-300">📦</div>'))}
            </div>
            <div class="flex-1">
              <div class="text-sm font-medium break-all">${safe(f.name)}</div>
              <div class="text-xs text-slate-400">${f.size ? formatBytes(f.size) : ''} ${f.date ? (' • ' + new Date(f.rawModifiedAt || f.date || Date.now()).toLocaleString()) : ''}</div>
            </div>
            <div class="mt-3 flex gap-2">
              ${isImage ? `<button onclick="showImage('${f.name}','${dir}')" class="flex-1 px-2 py-1 bg-cyan-500 rounded text-sm">Preview</button>` : `<button onclick="showText('${f.name}','${dir}')" class="flex-1 px-2 py-1 bg-cyan-500 rounded text-sm">Abrir</button>`}
              <a class="px-3 py-1 bg-slate-700 rounded text-sm" href="/download?file=${encodeURIComponent(f.name)}&dir=${encodeURIComponent(dir)}">Download</a>
            </div>

            <div class="mt-2">
              <form method="POST" action="/delete" onsubmit="return confirm('Deletar ${f.name}?')">
                <input type="hidden" name="dir" value="${safe(dir)}" />
                <input type="hidden" name="file" value="${safe(f.name)}" />
                <button class="w-full mt-1 px-2 py-1 bg-red-600 rounded text-xs">Delete</button>
              </form>
            </div>

            <div class="mt-2">
              <button onclick="openRename('${f.name}','${dir}')" class="w-full mt-1 px-2 py-1 bg-yellow-500 rounded text-xs">Renomear</button>
            </div>
          </div>
        `;
      }
    }

    content += `</div>`; // grid

    res.send(page(content));
  } catch (err) {
    res.send(page("", "Erro: " + (err.message || err.toString())));
  } finally {
    if (client) client.close();
  }
});


app.get("/preview", async (req, res) => {
  if (!ftpConfig) return res.status(400).send("not connected");
  const file = req.query.file;
  const dir = req.query.dir || "/";
  const client = await connectFTP();
  try {
    await client.cd(dir);
    const ext = (file.split(".").pop() || "").toLowerCase();
    const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
    res.setHeader("Content-Type", types[ext] || "application/octet-stream");
    await client.downloadTo(res, file);
  } catch (err) {
    res.status(500).send("Erro: " + err.message);
  } finally {
    client.close();
  }
});

app.get("/raw", async (req, res) => {
  if (!ftpConfig) return res.status(400).send("not connected");
  const file = req.query.file;
  const dir = req.query.dir || "/";
  const client = await connectFTP();
  try {
    await client.cd(dir);
    let data = "";
    const writable = new stream.Writable({
      write(chunk, enc, cb) {
        data += chunk.toString();
        cb();
      },
    });
    await client.downloadTo(writable, file);
    res.type("text/plain").send(data);
  } catch (err) {
    res.status(500).send("Erro: " + err.message);
  } finally {
    client.close();
  }
});


app.get("/download", async (req, res) => {
  if (!ftpConfig) return res.status(400).send("not connected");
  const file = req.query.file;
  const dir = req.query.dir || "/";
  const client = await connectFTP();
  try {
    await client.cd(dir);
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    await client.downloadTo(res, file);
  } catch (err) {
    res.status(500).send("Erro: " + err.message);
  } finally {
    client.close();
  }
});


app.post("/mkdir", async (req, res) => {
  const name = req.body.name;
  const dir = req.body.dir || "/";
  try {
    const client = await connectFTP();
    await client.cd(dir);
    await client.ensureDir(name);
    client.close();
    res.redirect("/files?dir=" + encodeURIComponent(dir));
  } catch (err) {
    res.send(page("", "Erro mkdir: " + err.message));
  }
});


app.post("/rename", async (req, res) => {
  const { oldName, newName, dir } = req.body;
  try {
    const client = await connectFTP();
    await client.cd(dir);
    await client.rename(oldName, newName);
    client.close();
    res.redirect("/files?dir=" + encodeURIComponent(dir));
  } catch (err) {
    res.send(page("", "Erro rename: " + err.message));
  }
});


app.post("/delete", async (req, res) => {
  const { file, dir } = req.body;
  try {
    const client = await connectFTP();
    await client.cd(dir);
    await client.remove(file);
    client.close();
    res.redirect("/files?dir=" + encodeURIComponent(dir));
  } catch (err) {
    res.send(page("", "Erro delete: " + err.message));
  }
});


app.post("/upload", upload.single("file"), async (req, res) => {
  const dir = req.query.dir || "/";
  if (!req.file) return res.send(page("", "Nenhum arquivo enviado"));
  try {
    const client = await connectFTP();
    await client.cd(dir);
    await client.uploadFrom(req.file.path, req.file.originalname);
    client.close();
    fs.unlinkSync(req.file.path);
    res.redirect("/files?dir=" + encodeURIComponent(dir));
  } catch (err) {
    res.send(page("", "Erro upload: " + err.message));
  }
});


app.listen(3000, () => {
  console.log("Web UI: http://localhost:3000");
});