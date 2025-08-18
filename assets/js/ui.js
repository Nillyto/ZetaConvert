/* ZetaConvert · ui.js
   Header/Footer unificados + helpers UI. */

   const PREFIX = (() => {
    // Profundidad: páginas en subcarpetas (converters/, text/, three/, legal/)
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? "../" : "./";
  })();
  
  const L = (slug) => `${PREFIX}${slug}`;
  
  export function renderHeader() {
    const mount = document.getElementById("header");
    if (!mount) return;
    mount.innerHTML = `
      <header class="header">
        <nav class="nav" aria-label="Principal">
          <a class="brand" href="${L("")}">
            <img src="${L("assets/img/logo.svg")}" alt="ZetaConvert logo" width="28" height="28" />
            <span class="brand-name">ZetaConvert</span>
          </a>
          <ul class="nav-links" role="menubar">
            <li role="none"><a role="menuitem" href="${L("")}" data-i18n="nav_home">Inicio</a></li>
            <li role="none"><a role="menuitem" href="${L("converters/jpg-to-png.html")}">JPG→PNG</a></li>
            <li role="none"><a role="menuitem" href="${L("converters/png-to-jpg.html")}">PNG→JPG</a></li>
            <li role="none"><a role="menuitem" href="${L("converters/webp-to-jpg.html")}">WEBP→JPG</a></li>
            <li role="none"><a role="menuitem" href="${L("converters/bmp-to-png.html")}">BMP→PNG</a></li>
            <li role="none"><a role="menuitem" href="${L("text/")}">Texto</a></li>
            <li role="none"><a role="menuitem" href="${L("three/")}">3D</a></li>
            <li role="none"><a role="menuitem" href="${L("legal/privacy.html")}">Privacidad</a></li>
            <li role="none"><a role="menuitem" href="${L("legal/terms.html")}">Términos</a></li>
          </ul>
          <div class="actions">
            <label class="visually-hidden" for="lang">Idioma</label>
            <select id="lang" aria-label="Idioma / Language" class="compact">
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
            <label class="visually-hidden" for="theme">Tema</label>
            <select id="theme" aria-label="Tema" class="compact">
              <option value="auto" data-i18n="theme_auto">Auto</option>
              <option value="light" data-i18n="theme_light">Claro</option>
              <option value="dark" data-i18n="theme_dark">Oscuro</option>
            </select>
          </div>
        </nav>
      </header>
    `;
  }
  
  export function renderFooter() {
    const mount = document.getElementById("footer");
    if (!mount) return;
    mount.innerHTML = `
      <footer class="footer">
        <div class="foot">
          <span class="mono">© <span id="year"></span> ZetaConvert</span>
          <nav aria-label="Legal">
            <a href="${L("legal/terms.html")}">Términos</a> ·
            <a href="${L("legal/privacy.html")}">Privacidad</a> ·
            <a href="mailto:hola@zetaconvert.online">Contacto</a>
          </nav>
        </div>
      </footer>
    `;
  }
  