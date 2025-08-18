/* ZetaConvert · converter.js
   Conversión vía XHR/Fetch hacia backend (/api), con progreso y descarga. */

   import { t } from "./i18n.js";
   import {
     bindDragAndDrop,
     validateFileSize,
     drawPreviewToCanvas,
     enableCanvasColorPicker,
     setProgress,
     resetDownload
   } from "./forms.js";
   
   const BACKEND_URL = "/api";
   
   /** Inicializa una página de conversión “simple” (un input file y un botón).
    * @param {{
    *  inputSelector?: string,
    *  formSelector?: string,
    *  progressSelector?: string,
    *  barSelector?: string,
    *  resultSelector?: string,
    *  downloadSelector?: string,
    *  statusSelector?: string,
    *  canvasSelector?: string,
    *  accept?: string,
    *  outputName?: string,
    *  endpoint?: string,
    *  fixedTarget?: string, // ej: "png", "jpg"
    *  removeBgSelectors?: { checkboxId?: string, tolId?: string, modeId?: string, colorId?: string }
    * }} cfg
    */
   export function initConverterPage(cfg = {}) {
     const input = document.querySelector(cfg.inputSelector || "#file-upload");
     const form = document.querySelector(cfg.formSelector || "#converter-form");
     const progressWrap = document.querySelector(cfg.progressSelector || "#progress");
     const bar = document.querySelector(cfg.barSelector || "#bar");
     const result = document.querySelector(cfg.resultSelector || "#result");
     const downloadLink = document.querySelector(cfg.downloadSelector || "#download-link");
     const statusEl = document.querySelector(cfg.statusSelector || "#status");
     const canvas = document.querySelector(cfg.canvasSelector || "#preview");
   
     if (!input || !form) return;
   
     if (cfg.accept) input.setAttribute("accept", cfg.accept);
   
     const dlUrl = { current: null };
     const fixedTarget = cfg.fixedTarget || "png";
     const endpoint = cfg.endpoint || `${BACKEND_URL}/convert`;
   
     // Opciones “eliminar fondo” (si existen en el DOM)
     const rb = cfg.removeBgSelectors || {};
     const removeBg = rb.checkboxId ? document.getElementById(rb.checkboxId) : null;
     const tol = rb.tolId ? document.getElementById(rb.tolId) : null;
     const mode = rb.modeId ? document.getElementById(rb.modeId) : null;
     const color = rb.colorId ? document.getElementById(rb.colorId) : null;
   
     // Drag & Drop + Preview
     bindDragAndDrop(input, form);
     input.addEventListener("change", () => {
       const f = input.files[0];
       const v = validateFileSize(f);
       if (statusEl) statusEl.textContent = v.msg;
       if (!v.ok) {
         input.value = "";
         return;
       }
       if (canvas) drawPreviewToCanvas(f, canvas);
     });
     if (canvas && color && mode) enableCanvasColorPicker(canvas, color, mode);
   
     // Submit
     form.addEventListener("submit", (e) => {
       e.preventDefault();
       const file = input.files[0];
       if (!file) return;
   
       resetDownload(dlUrl);
       result && (result.hidden = true);
       setProgress(bar, progressWrap, 5, statusEl, t("status_uploading"));
   
       const fd = new FormData();
       fd.append("file", file);
   
       // Si endpoint es el genérico /convert, agregamos target (y flags si aplica)
       if (endpoint.endsWith("/convert")) {
         fd.append("target", fixedTarget);
         if (fixedTarget === "png" && removeBg && removeBg.checked) {
           fd.append("remove_bg", "1");
           if (tol) fd.append("tolerance", String(tol.value || 35));
           if (mode) fd.append("remove_bg_mode", mode.value || "auto");
           if (mode && mode.value === "color" && color) fd.append("ref_color", color.value);
         }
       }
   
       // XHR para medir progreso
       const xhr = new XMLHttpRequest();
       xhr.open("POST", endpoint);
       xhr.responseType = "blob";
   
       xhr.upload.onprogress = (ev) => {
         if (ev.lengthComputable) {
           const pct = Math.round((ev.loaded / ev.total) * 60);
           setProgress(bar, progressWrap, pct, statusEl, `${t("status_uploading")} ${pct}%`);
         } else setProgress(bar, progressWrap, 25, statusEl, t("status_uploading"));
       };
       xhr.onprogress = (ev) => {
         if (ev.lengthComputable) {
           const pct = 60 + Math.round((ev.loaded / ev.total) * 40);
           setProgress(bar, progressWrap, pct, statusEl, `${t("status_downloading")} ${pct}%`);
         } else setProgress(bar, progressWrap, 90, statusEl, t("status_downloading"));
       };
   
       xhr.onload = () => {
         if (xhr.status >= 200 && xhr.status < 300) {
           setProgress(bar, progressWrap, 100, statusEl, t("done"));
           dlUrl.current = URL.createObjectURL(xhr.response);
           if (downloadLink) {
             const base = (file.name.includes(".") ? file.name.slice(0, file.name.lastIndexOf(".")) : "convertido");
             const outExt = cfg.outputName || fixedTarget;
             downloadLink.href = dlUrl.current;
             downloadLink.download = `${base}.${outExt}`;
           }
           result && (result.hidden = false);
         } else {
           showXHRError(xhr, statusEl);
         }
       };
   
       xhr.onerror = () => {
         setProgress(bar, progressWrap, 0, statusEl, t("network_error"));
         alert(t("network_error"));
       };
   
       xhr.send(fd);
     });
   
     // Descarga manual (si el botón está fuera del onload)
     if (downloadLink) {
       downloadLink.addEventListener("click", () => {
         if (!dlUrl.current) return;
         // el atributo download ya dispara la descarga
       });
     }
   }
   
   function showXHRError(xhr, statusEl) {
     try {
       const r = new FileReader();
       r.onload = () => {
         const msg = typeof r.result === "string" ? r.result : t("error");
         alert(`Error ${xhr.status}: ${msg}`);
       };
       r.readAsText(xhr.response);
     } catch {
       alert(t("error"));
     } finally {
       if (statusEl) statusEl.textContent = t("error");
     }
   }
   