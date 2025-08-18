/* ZetaConvert · forms.js
   Validaciones, drag&drop, preview en canvas y helpers de estado. */

   import { t } from "./i18n.js";

   export const MAX_MB = 10;
   
   export function bindDragAndDrop(inputEl, dropZoneEl = null) {
     const dz = dropZoneEl || inputEl.closest("form") || document.body;
   
     ["dragenter", "dragover"].forEach((evt) =>
       dz.addEventListener(evt, (e) => {
         e.preventDefault();
         e.stopPropagation();
         dz.classList.add("is-dragover");
       })
     );
     ["dragleave", "drop"].forEach((evt) =>
       dz.addEventListener(evt, (e) => {
         e.preventDefault();
         e.stopPropagation();
         if (evt === "drop") {
           const file = e.dataTransfer.files && e.dataTransfer.files[0];
           if (file) inputEl.files = e.dataTransfer.files;
           inputEl.dispatchEvent(new Event("change"));
         }
         dz.classList.remove("is-dragover");
       })
     );
   }
   
   export function validateFileSize(file) {
     if (!file) return { ok: false, msg: t("status_wait") };
     const mb = file.size / 1024 / 1024;
     if (mb > MAX_MB) return { ok: false, msg: `Máximo ${MAX_MB} MB` };
     return { ok: true, msg: `${file.name} · ${mb.toFixed(2)} MB` };
   }
   
   export function drawPreviewToCanvas(file, canvas) {
     if (!file || !canvas) return;
     const url = URL.createObjectURL(file);
     const img = new Image();
     img.onload = () => {
       const maxW = canvas.clientWidth || 720;
       const scale = Math.min(maxW / img.width, 1);
       canvas.width = Math.round(img.width * scale);
       canvas.height = Math.round(img.height * scale);
       const ctx = canvas.getContext("2d");
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
       URL.revokeObjectURL(url);
     };
     img.src = url;
   }
   
   export function enableCanvasColorPicker(canvas, colorInput, modeSelect) {
     if (!canvas || !colorInput) return;
     const ctx = canvas.getContext("2d");
     canvas.addEventListener("click", (e) => {
       if (modeSelect && modeSelect.value !== "color") return;
       const r = canvas.getBoundingClientRect();
       const x = Math.floor((e.clientX - r.left) * (canvas.width / r.width));
       const y = Math.floor((e.clientY - r.top) * (canvas.height / r.height));
       const d = ctx.getImageData(x, y, 1, 1).data;
       const hex = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
       colorInput.value = hex;
       colorInput.dispatchEvent(new Event("input"));
     });
   }
   
   export function setProgress(barEl, wrapEl, pct, labelEl, labelText) {
     if (wrapEl) wrapEl.hidden = false;
     if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
     if (labelEl && labelText) labelEl.textContent = labelText;
   }
   
   export function resetDownload(urlHolder) {
     if (urlHolder.current) URL.revokeObjectURL(urlHolder.current);
     urlHolder.current = null;
   }
   