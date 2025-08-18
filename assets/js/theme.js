/* ZetaConvert · theme.js
   Manejo de tema claro/oscuro con 'auto' + prefers-color-scheme. */

   const KEY = "zc_theme";

   export function initTheme() {
     const current = localStorage.getItem(KEY) || "auto";
     applyTheme(current);
   
     // Reactivo al select si existe
     const themeSel = document.getElementById("theme");
     if (themeSel) {
       themeSel.value = current;
       themeSel.addEventListener("change", (e) => setTheme(e.target.value));
     }
   
     // Listener al sistema (fallback addListener)
     if (window.matchMedia) {
       const mql = window.matchMedia("(prefers-color-scheme: dark)");
       const handler = () => {
         const mode = localStorage.getItem(KEY) || "auto";
         if (mode === "auto") applyTheme("auto");
       };
       if (mql.addEventListener) mql.addEventListener("change", handler);
       else if (mql.addListener) mql.addListener(handler);
     }
   }
   
   export function setTheme(mode) {
     const m = ["auto", "light", "dark"].includes(mode) ? mode : "auto";
     localStorage.setItem(KEY, m);
     applyTheme(m);
   }
   
   export function applyTheme(mode) {
     const m = mode || "auto";
     document.body.dataset.theme = m;
     const isDark = m === "dark" || (m === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
     document.documentElement.classList.toggle("dark", !!isDark);
   }
   