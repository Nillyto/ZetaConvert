// ====== Config ======
const BACKEND_URL = "https://zetaconvert-backend.onrender.com";

// ====== Tabs ======
const tabs = document.querySelectorAll(".tab");
const panels = {
  "t-imagenes": document.getElementById("tab-imagenes"),
  "t-texto": document.getElementById("tab-texto"),
  "t-extras": document.getElementById("tab-extras"),
  "t-3d": document.getElementById("tab-3d"),
};
tabs.forEach((t) => {
  t.addEventListener("click", () => {
    tabs.forEach((x) => x.setAttribute("aria-selected", x === t ? "true" : "false"));
    Object.values(panels).forEach((p) => (p.hidden = true));
    panels[t.id].hidden = false;
    const st = document.getElementById("status");
    if (st) st.textContent = "Esperando archivo…";
  });
});

// ====== Imágenes ======
const SUGGESTIONS = {
  ".jpg": ["png", "webp", "bmp", "tiff"],
  ".jpeg": ["png", "webp", "bmp", "tiff"],
  ".png": ["jpg", "webp", "bmp", "tiff"],
  ".webp": ["jpg", "png", "bmp", "tiff"],
  ".bmp": ["jpg", "png", "webp", "tiff"],
  ".tif": ["jpg", "png", "webp", "bmp"],
  ".tiff": ["jpg", "png", "webp", "bmp"],
  ".gif": ["png", "webp", "jpg"],
};
const ALL = ["png", "jpg", "webp", "bmp", "tiff"];

const $ = (s) => document.querySelector(s);
const fileInput = $("#file");
const fileInfo = $("#fileInfo");
const targetSel = $("#target");
const removeBg = $("#removeBg");
const tolerance = $("#tolerance");
const tolVal = $("#tolVal");
const modeSel = $("#mode");
const colorInp = $("#color");
const convertBtn = $("#convertBtn");
const downloadBtn = $("#downloadBtn");
const bar = $("#bar");
const statusEl = $("#status");
const canvas = $("#preview");
const ctx = canvas.getContext("2d");
document.getElementById("year").textContent = new Date().getFullYear();

let lastBlobUrl = null;
let outName = "convertido.png";
let imgObj = null;

function extOf(n) {
  n = (n || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i) : "";
}
function setProgress(p, t) {
  bar.style.width = Math.max(0, Math.min(100, p)) + "%";
  if (t) statusEl.textContent = t;
}
function drawPreview(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxW = canvas.clientWidth || 720;
    const scale = Math.min(maxW / img.width, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    imgObj = img;
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
canvas.addEventListener("click", (e) => {
  if (!imgObj) return;
  if (modeSel.value !== "color") return;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) * (canvas.width / r.width));
  const y = Math.floor((e.clientY - r.top) * (canvas.height / r.height));
  const d = ctx.getImageData(x, y, 1, 1).data;
  const hex = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  colorInp.value = hex;
});

tolerance.addEventListener("input", () => (tolVal.textContent = tolerance.value));

fileInput.addEventListener("change", () => {
  downloadBtn.disabled = true;
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }
  const f = fileInput.files[0];
  if (!f) {
    fileInfo.textContent = "No hay archivo";
    targetSel.disabled = true;
    targetSel.innerHTML = `<option value="">Elegí un formato…</option>`;
    convertBtn.disabled = true;
    removeBg.disabled = true;
    removeBg.checked = false;
    tolerance.disabled = true;
    modeSel.disabled = true;
    colorInp.disabled = true;
    setProgress(0, "Esperando archivo…");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    imgObj = null;
    return;
  }
  drawPreview(f);
  fileInfo.textContent = `${f.name} · ${(f.size / 1024 / 1024).toFixed(2)} MB · ${f.type || "sin mimetype"}`;
  const opts = SUGGESTIONS[extOf(f.name)] || ALL;
  targetSel.innerHTML =
    `<option value="">Elegí un formato…</option>` + opts.map((o) => `<option value="${o}">${o.toUpperCase()}</option>`).join("");
  targetSel.disabled = false;
  convertBtn.disabled = true;
  removeBg.disabled = true;
  removeBg.checked = false;
  tolerance.disabled = true;
  modeSel.disabled = true;
  colorInp.disabled = true;
  setProgress(0, "Formato destino pendiente…");
});

targetSel.addEventListener("change", () => {
  const f = fileInput.files[0];
  const tgt = targetSel.value;
  const png = tgt === "png";
  removeBg.disabled = !png;
  tolerance.disabled = !png;
  modeSel.disabled = !png;
  colorInp.disabled = !png || modeSel.value !== "color";
  if (!png) removeBg.checked = false;
  convertBtn.disabled = !(f && tgt);
  if (!convertBtn.disabled) setProgress(0, "Listo para convertir");
});
modeSel.addEventListener("change", () => {
  colorInp.disabled = modeSel.value !== "color" || removeBg.disabled || !removeBg.checked;
});
removeBg.addEventListener("change", () => {
  const on = removeBg.checked && targetSel.value === "png";
  tolerance.disabled = !on;
  modeSel.disabled = !on;
  colorInp.disabled = !on || modeSel.value !== "color";
});

convertBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const f = fileInput.files[0];
  const target = targetSel.value;
  if (!f || !target) return;

  downloadBtn.disabled = true;
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }

  const base = f.name.includes(".") ? f.name.slice(0, f.name.lastIndexOf(".")) : "convertido";
  outName = `${base}.${target}`;

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BACKEND_URL}/convert`);
  xhr.responseType = "blob";

  // Progreso de subida (0–60%)
  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) {
      const pct = Math.round((ev.loaded / ev.total) * 60);
      setProgress(pct, `Subiendo… ${pct}%`);
    } else setProgress(20, "Subiendo…");
  };
  // Progreso de descarga (60–100%)
  xhr.onprogress = (ev) => {
    if (ev.lengthComputable) {
      const pct = 60 + Math.round((ev.loaded / ev.total) * 40);
      setProgress(pct, `Descargando… ${pct}%`);
    } else setProgress(90, "Descargando…");
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      setProgress(100, "Listo ✔️");
      lastBlobUrl = URL.createObjectURL(xhr.response);
      downloadBtn.disabled = false;
    } else {
      const r = new FileReader();
      r.onload = () => alert(`Error ${xhr.status}: ${r.result}`);
      r.readAsText(xhr.response);
      setProgress(0, "Error");
      downloadBtn.disabled = true;
    }
  };
  xhr.onerror = () => {
    setProgress(0, "Error de red");
    alert("No se pudo conectar al servidor.");
  };

  const fd = new FormData();
  fd.append("file", f);
  fd.append("target", target);
  if (target === "png" && removeBg.checked) {
    fd.append("remove_bg", "1");
    fd.append("tolerance", String(tolerance.value));
    fd.append("remove_bg_mode", modeSel.value);
    if (modeSel.value === "color") fd.append("ref_color", colorInp.value);
  }

  setProgress(5, "Preparando…");
  xhr.send(fd);
});

// Footer year
// (ya set arriba)

// Clic color en preview
canvas.addEventListener("click", (e) => {
  if (!imgObj || modeSel.value !== "color") return;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) * (canvas.width / r.width));
  const y = Math.floor((e.clientY - r.top) * (canvas.height / r.height));
  const d = ctx.getImageData(x, y, 1, 1).data;
  const hex = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  colorInp.value = hex;
});

// Descarga
document.getElementById("downloadBtn").addEventListener("click", () => {
  if (!lastBlobUrl) return;
  const a = document.createElement("a");
  a.href = lastBlobUrl;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
});
