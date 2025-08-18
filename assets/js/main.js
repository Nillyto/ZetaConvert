/* ZetaConvert · main.js
   Boot común: header/footer, tema, i18n y mejoras de accesibilidad. */

   import { renderHeader, renderFooter } from "./ui.js";
   import { initTheme } from "./theme.js";
   import { applyI18n, detectLang } from "./i18n.js";
   
   (function () {
     // Accesibilidad: mover foco al main con tecla "m"
     document.addEventListener("keydown", (e) => {
       if (e.key.toLowerCase() === "m") {
         const main = document.querySelector("main");
         if (main) main.focus();
       }
     });
   
     // Render UI común
     renderHeader();
     renderFooter();
   
     // Tema + i18n
     initTheme();
     applyI18n(detectLang());
   
     // Año en footer
     const y = document.getElementById("year");
     if (y) y.textContent = new Date().getFullYear();
   })();
   