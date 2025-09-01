(function(){
  // ==========================
  // 1) Theme toggle (simple)
  // ==========================
  const THEME_KEY = 'zc-theme';
  const btn = document.getElementById('toggleTheme');
  const root = document.documentElement;
  function applyTheme(t){
    if(t==='dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }
  applyTheme(localStorage.getItem(THEME_KEY));
  if(btn){
    btn.addEventListener('click',()=>{
      const t = root.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, t);
      applyTheme(t);
    });
  }

  // ==============================================
  // 2) Single-form converter (#convertForm) setup
  //    - Handles: DnD/Paste, optional precompress, XHR with progress
  //    - Redirects if #target option points to otro slug
  // ==============================================
  const form = document.getElementById('convertForm');
  const fileInput = document.getElementById('file') || document.querySelector('input[type="file"]');
  const dropPanel = document.querySelector('.panel.converter');

  // --- Redirección por cambio de formato en <select id="target"> ---
  (function setupTargetRedirect(){
    const sel = document.getElementById('target');
    if(!sel) return;
    const routeTpl    = sel.getAttribute('data-route-template'); // ej: "/r/__SLUG__"
    const currentSlug = sel.getAttribute('data-current-slug');
    sel.addEventListener('change', () => {
      const opt  = sel.options[sel.selectedIndex];
      const slug = opt?.getAttribute('data-slug');
      if (slug && slug !== currentSlug) {
        window.location.href = routeTpl.replace('__SLUG__', slug);
      }
      // Si no cambia el slug, el form actual soporta ese target -> submit normal (lo maneja el listener del form)
    });
  })();

  // --- Drag & drop + paste hacia #file ---
  if(dropPanel && fileInput){
    ['dragenter','dragover'].forEach(ev=>dropPanel.addEventListener(ev, e=>{ e.preventDefault(); dropPanel.classList.add('is-drag'); }));
    ['dragleave','drop'].forEach(ev=>dropPanel.addEventListener(ev, e=>{ e.preventDefault(); dropPanel.classList.remove('is-drag'); }));
    dropPanel.addEventListener('drop', e=>{ if(e.dataTransfer?.files?.length){ fileInput.files = e.dataTransfer.files; } });
    window.addEventListener('paste', e=>{ const items = e.clipboardData?.files; if(items && items.length){ fileInput.files = items; } });
  }

  // --- Compresión previa opcional para JPG/WEBP (checkbox #precompress) ---
  async function maybePrecompress(fd){
    try{
      const pre = document.getElementById('precompress');
      const tgt = (fd.get('target')||'').toString().toLowerCase();
      if(!pre || !pre.checked) return fd;
      if(!(tgt==='jpg' || tgt==='webp')) return fd;

      const f = fd.get('file') || fd.get('files');
      if(!(f instanceof File)) return fd;

      const img = await createImageBitmap(f);
      const canvas = document.createElement('canvas');
      const max = 3000; let {width, height} = img;
      if(width>max || height>max){ const r = Math.min(max/width, max/height); width=Math.round(width*r); height=Math.round(height*r); }
      canvas.width=width; canvas.height=height;
      const ctx = canvas.getContext('2d', {alpha:false}); ctx.drawImage(img,0,0,width,height);
      const mime = tgt==='webp' ? 'image/webp' : 'image/jpeg';
      const blob = await new Promise(res=>canvas.toBlob(res, mime, 0.85));
      if(!blob) return fd;
      const nf = new File([blob], f.name.replace(/\.[^.]+$/, tgt==='webp'?'.webp':'.jpg'), {type: mime});
      const nfd = new FormData();
      for(const [k,v] of fd.entries()){ if(k!=='file' && k!=='files') nfd.append(k,v); }
      nfd.append('file', nf);
      return nfd;
    }catch{ return fd; }
  }

  // --- Submit con XHR + barra de progreso (#progressBar) ---
  if(form){
    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      const bar = document.getElementById('progressBar');
      if(!bar){ form.submit(); return; }

      let fd = new FormData(form);
      fd = await maybePrecompress(fd);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action, true);
      xhr.responseType = 'blob';

      xhr.upload.onprogress = function(e){
        if(e.lengthComputable){
          const p = Math.max(5, Math.floor((e.loaded / e.total) * 100));
          bar.style.width = p + '%';
        }
      };

      xhr.onload = function(){
        if(xhr.status === 200){
          const disp = xhr.getResponseHeader('Content-Disposition') || 'attachment; filename="output"';
          const m = /filename="([^"]+)"/.exec(disp);
          const fname = m ? m[1] : 'resultado.bin';
          const url = URL.createObjectURL(xhr.response);
          const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click();
          setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); bar.style.width='0%'; }, 200);
        } else {
          alert('Error en la conversión');
          bar.style.width='0%';
        }
      };

      xhr.onerror = function(){ alert('Fallo de red'); bar.style.width='0%'; };
      xhr.send(fd);
    });
  }
})();

// =====================================================================
// 3) Vista "cola" (multi-archivos) con #globalTarget y redirección similar
// =====================================================================
(function(){
  // ---------- Utilidades ----------
  const $ = sel => document.querySelector(sel);
  const el = (tag, attrs={}, ...children) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };
  const fmtBytes = b => (b>=1e6? (b/1e6).toFixed(1)+' MB' : (b/1e3).toFixed(1)+' KB');

  // ---------- Elementos ----------
  const dropZone      = $('#dropZone');
  const fileInput     = $('#fileInput');
  const queueWrap     = $('#fileQueue');
  const btnAdd        = $('#btnAdd');
  const btnClear      = $('#btnClear');
  const btnConvertAll = $('#btnConvertAll');
  const overallBar    = $('#overallBar');
  const globalTarget  = $('#globalTarget'); // <select> ya renderizado por el template (con data-slug por <option>)

  // Si no existe la UI de cola, no continuar.
  if (!dropZone || !queueWrap) return;

  // ---------- Redirección al cambiar formato global ----------
  (function setupFormatRedirect(){
    if (!globalTarget) return;
    const currentSlug = globalTarget.getAttribute('data-current-slug');
    const routeTpl    = globalTarget.getAttribute('data-route-template'); // "/r/__SLUG__"
    globalTarget.addEventListener('change', function(){
      const opt  = this.options[this.selectedIndex];
      const slug = opt?.getAttribute('data-slug');
      if (slug && slug !== currentSlug) {
        const next = routeTpl.replace('__SLUG__', slug);
        window.location.href = next;
      }
    });
  })();

  // ---------- Estado de la cola ----------
  const LIMIT = 5;
  const state = { items: [] }; // {id, file, size, name, targetOverride, progress, status, blobUrl, downloadName, xhr}
  let idSeq = 1;

  function recomputeOverall(){
    if (!state.items.length){ overallBar && (overallBar.style.width = '0%'); return; }
    const wSum = state.items.reduce((acc, it)=> acc + it.size, 0) || 1;
    const p = Math.round(state.items.reduce((acc, it)=> acc + (it.progress * it.size), 0) / wSum * 100);
    if (overallBar) overallBar.style.width = Math.max(5, p) + '%';
  }

  function render(){
    queueWrap.innerHTML = '';
    state.items.forEach(it => {
      const row = el('div', {class:'queue-item card'});
      const head = el('div', {class:'qi-head'},
        el('div', {class:'qi-meta'},
          el('div', {class:'qi-name'}, it.name),
          el('div', {class:'qi-size muted'}, fmtBytes(it.size))
        ),
        el('div', {class:'qi-target'},
          (function(){
            // Crea un select por-archivo con las mismas opciones que #globalTarget, si existe.
            const sel = el('select', {class:'select qi-select', 'data-id': it.id, title:'Formato por archivo'});
            const inherit = el('option', {value:''}); inherit.textContent = 'Heredar global'; sel.appendChild(inherit);
            if (globalTarget){
              Array.from(globalTarget.options).forEach(opt=>{
                const o = el('option', {value: opt.value});
                o.textContent = (opt.textContent || '').toUpperCase();
                sel.appendChild(o);
              });
            }
            sel.value = it.targetOverride || '';
            sel.addEventListener('change', ()=>{ it.targetOverride = sel.value || null; });
            return sel;
          })()
        )
      );

      const bar = el('div', {class:'progress mt-1'},
        el('div', {class:'bar', style:`width:${Math.round(it.progress*100)}%`})
      );

      const actions = el('div', {class:'qi-actions mt-1'},
        el('button', {class:'btn compact', onclick:()=>removeItem(it.id)}, 'Quitar'),
        el('button', {class:'btn compact', onclick:()=>convertOne(it)}, 'Convertir'),
        el('a', {class:'btn compact', href: it.blobUrl || '#', download: it.downloadName || '', style: it.status==='done'?'':'pointer-events:none; opacity:.5'}, 'Descargar')
      );

      row.appendChild(head);
      row.appendChild(bar);
      row.appendChild(actions);
      queueWrap.appendChild(row);
    });
  }

  function removeItem(id){
    const i = state.items.findIndex(x=>x.id===id);
    if (i>=0){
      const it = state.items[i];
      if (it.xhr && it.status==='uploading') it.xhr.abort();
      if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
      state.items.splice(i,1);
      render(); recomputeOverall();
    }
  }

  function pushFiles(files){
    const list = Array.from(files||[]);
    for (const f of list){
      if (state.items.length >= LIMIT){ alert('Máximo 5 archivos.'); break; }
      state.items.push({ id:idSeq++, file:f, size:f.size, name:f.name, targetOverride:null, progress:0, status:'idle', blobUrl:null, downloadName:'', xhr:null });
    }
    render(); recomputeOverall();
  }

  // ---------- Drag & Drop / Click ----------
  ['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.add('is-drag'); }));
  ['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.remove('is-drag'); }));
  dropZone.addEventListener('click', ()=> fileInput?.click());
  dropZone.addEventListener('drop', e=>{ if (e.dataTransfer?.files?.length) pushFiles(e.dataTransfer.files); });
  fileInput?.addEventListener('change', e=> pushFiles(e.target.files));
  btnAdd?.addEventListener('click', e=> { e.preventDefault(); fileInput?.click(); });
  btnClear?.addEventListener('click', e=>{ e.preventDefault(); state.items.forEach(it=> it.blobUrl && URL.revokeObjectURL(it.blobUrl)); state.items = []; render(); recomputeOverall(); });

  // ---------- Helpers ----------
  function effectiveTarget(it){ return (it.targetOverride || globalTarget?.value || '').toLowerCase(); }

  // ---------- Conversión (uno) ----------
  function convertOne(it){
    if (!it || it.status==='uploading') return;
    const tgt = effectiveTarget(it) || (globalTarget?.value||'');
    if (!tgt){ alert('Elegí un formato de salida.'); return; }

    const fd = new FormData();
    fd.append('target', tgt);
    fd.append('route', document.querySelector('input[name="route"]')?.value || '');
    fd.append('file', it.file);

    const xhr = new XMLHttpRequest();
    it.xhr = xhr;
    xhr.open('POST', '/api/convert', true);
    xhr.responseType = 'blob';

    it.status = 'uploading'; it.progress = 0; render(); recomputeOverall();

    xhr.upload.onprogress = function(e){
      if (e.lengthComputable){ it.progress = Math.min(0.95, e.loaded / e.total); render(); recomputeOverall(); }
    };

    xhr.onload = function(){
      if (xhr.status === 200){
        const dispo = xhr.getResponseHeader('Content-Disposition') || 'attachment; filename="output"';
        const m = /filename="([^"]+)"/.exec(dispo);
        const fname = m ? m[1] : (it.name.replace(/\.[^.]+$/, '') + '.' + tgt);
        const url = URL.createObjectURL(xhr.response);
        it.status = 'done'; it.progress = 1; it.downloadName = fname;
        if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
        it.blobUrl = url;
        render(); recomputeOverall();
      } else {
        it.status = 'error'; render(); recomputeOverall(); alert('Error convirtiendo '+ it.name);
      }
    };

    xhr.onerror = function(){ it.status = 'error'; render(); recomputeOverall(); alert('Fallo de red en '+ it.name); };
    xhr.send(fd);
  }

  // ---------- Convertir todo (concurrencia 2) ----------
  btnConvertAll?.addEventListener('click', async e=>{
    e.preventDefault();
    const pending = state.items.filter(it=> it.status==='idle' || it.status==='error');
    const pool = 2; let idx = 0;
    async function runOne(){
      if (idx >= pending.length) return;
      const it = pending[idx++]; convertOne(it);
      await new Promise(res=>{ const t = setInterval(()=>{ if (it.status==='done' || it.status==='error'){ clearInterval(t); res(); } }, 100); });
      await runOne();
    }
    await Promise.all(Array.from({length: Math.min(pool, pending.length)}, runOne));
  });
})();
