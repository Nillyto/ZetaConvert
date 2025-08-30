# ZetaConvert · Background Upgrade

## Qué cambia
- Fondo con **capas sutiles** (gradientes radiales + grilla suave + viñeta) que da profundidad sin distraer.
- **Sin imágenes pesadas**: todo con CSS puro → rápido y limpio.
- Modo oscuro con tonos acordes (no “lavado”), y contraste cuidado.
- Clase `.section-accent` para destacar bloques (por ejemplo, las FAQs o “¿Por qué ZetaConvert?”).

## Cómo instalar
1. Copiá estos archivos encima de los actuales:
   - `static/css/styles.css`
   - `static/css/theme.css`
2. (Opcional) En tus templates, envolvé alguna sección con `<section class="panel section-accent"> ... </section>` para cortar monotonía con un bloque acentuado.
3. Asegurate de tener el toggle de tema (o la clase `.dark` en `<html>`).

## Tips
- Usá `.space-xl` para separar secciones cuando metas `.section-accent` seguidas.
- Los gradientes se renderizan en GPU y no penalizan; si quisieras aún menos carga, reducí `--bg-grid-size`.
