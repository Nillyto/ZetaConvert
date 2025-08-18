/* ZetaConvert · i18n.js
   Diccionarios ES/EN y aplicación por data-i18n. */

   const KEY = "zc_lang";

   const DICT = {
     es: {
       nav_home: "Inicio",
       theme_auto: "Auto",
       theme_light: "Claro",
       theme_dark: "Oscuro",
       status_wait: "Esperando archivo…",
       status_ready: "Listo para convertir",
       status_uploading: "Subiendo…",
       status_downloading: "Descargando…",
       done: "Listo ✔️",
       error: "Error",
       network_error: "Error de red"
     },
     en: {
       nav_home: "Home",
       theme_auto: "Auto",
       theme_light: "Light",
       theme_dark: "Dark",
       status_wait: "Waiting for file…",
       status_ready: "Ready to convert",
       status_uploading: "Uploading…",
       status_downloading: "Downloading…",
       done: "Done ✔️",
       error: "Error",
       network_error: "Network error"
     }
   };
   
   export function detectLang() {
     return localStorage.getItem(KEY) || (navigator.language || "es").slice(0, 2) || "es";
   }
   
   export function setLang(lang) {
     const l = ["es", "en"].includes(lang) ? lang : "es";
     localStorage.setItem(KEY, l);
     applyI18n(l);
   }
   
   export function t(key) {
     const lang = detectLang();
     return (DICT[lang] && DICT[lang][key]) || (DICT.es && DICT.es[key]) || key;
   }
   
   export function applyI18n(lang) {
     const l = ["es", "en"].includes(lang) ? lang : "es";
     document.documentElement.lang = l;
     document.querySelectorAll("[data-i18n]").forEach((el) => {
       const key = el.getAttribute("data-i18n");
       if (!key) return;
       const val = (DICT[l] && DICT[l][key]) || (DICT.es && DICT.es[key]);
       if (typeof val === "string") el.innerHTML = val;
     });
   
     // Sincroniza selects si existen
     const langSel = document.getElementById("lang");
     if (langSel) langSel.value = l;
   
     // Actualiza meta description básico (opcional)
     const metaDesc = document.querySelector('meta[name="description"]');
     if (metaDesc && !metaDesc.dataset.locked) {
       metaDesc.setAttribute(
         "content",
         l === "en"
           ? "Convert images, documents and 3D models online. Fast, clear, professional."
           : "Convierte imágenes, documentos y modelos 3D online. Rápido, claro y profesional."
       );
     }
   
     // Listeners (una sola vez)
     bindOnceLangTheme();
   }
   
   let _bound = false;
   function bindOnceLangTheme() {
     if (_bound) return;
     _bound = true;
   
     const langSel = document.getElementById("lang");
     if (langSel) {
       langSel.addEventListener("change", (e) => setLang(e.target.value));
     }
   
     const themeSel = document.getElementById("theme");
     if (themeSel) {
       // theme.js escucha el cambio; aquí sólo garantizamos valor
       const current = localStorage.getItem("zc_theme") || "auto";
       themeSel.value = current;
     }
   }
   