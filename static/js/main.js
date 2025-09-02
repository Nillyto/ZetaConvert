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
// 3) Vista "cola" (multi-archivos) usando los IDs del HTML actual
// =====================================================================
(function(){
  // ---------- Utilidades ----------
  const $ = sel => document.querySelector(sel);
  const el = (tag, attrs={}, ...children) => {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    children.forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };
  const fmtBytes = b => (b>=1e6? (b/1e6).toFixed(1)+' MB' : (b/1e3).toFixed(1)+' KB');

  // ---------- Elementos (IDs reales del HTML) ----------
  const dropZone      = $('#dz');
  const fileInput     = $('#fileInput');
  const queueWrap     = $('#queue');
  const btnAdd        = $('#btnAdd');          // (si lo eliminaste abajo, puede ser null)
  const btnClear      = $('#btnClear');        // (si lo eliminaste abajo, puede ser null)
  const btnConvertAll = $('#btnConvertAll');   // del panel general (arriba a la derecha)
  const btnDownloadAll= $('#btnDownloadAll');  // del panel general (arriba a la derecha)
  const globalTarget  = $('#targetGlobal');    // tu select global
  const routeHidden   = document.querySelector('input[name="route"]'); // agregado en el HTML

  // Si no existe la UI de cola, no continuar.
  if (!dropZone || !fileInput || !queueWrap) return;

  // ---------- Redirección al cambiar formato global ----------
  (function setupFormatRedirect(){
    if (!globalTarget) return;
    const currentSlug = globalTarget.getAttribute('data-current-slug');
    const routeTpl    = globalTarget.getAttribute('data-route-template'); // "/r/__SLUG__"
    globalTarget.addEventListener('change', function(){
      const opt  = this.options[this.selectedIndex];
      const slug = opt?.getAttribute('data-slug');
      if (slug && slug !== currentSlug) {
        window.location.href = routeTpl.replace('__SLUG__', slug);
      }
    });
  })();

  // ---------- Estado de la cola ----------
  const LIMIT = 25; // definí el que quieras
  const state = { items: [] }; // {id,file,size,name,targetOverride,progress,status,blobUrl,downloadName,xhr}
  let idSeq = 1;

  function allDone(){ return state.items.length>0 && state.items.every(it=>it.status==='done'); }
  function updateDownloadAll(){
    if (!btnDownloadAll) return;
    btnDownloadAll.disabled = !allDone();
  }

  function render(){
    queueWrap.innerHTML = '';
    state.items.forEach(it => {
      const row = el('div', {class:'queue-item'});
      const head = el('div', {class:'qi-head'},
        el('div', {class:'qi-meta'},
          el('div', {class:'qi-name'}, it.name),
          el('div', {class:'qi-size muted'}, fmtBytes(it.size))
        ),
        el('div', {class:'qi-target'},
          (function(){
            const sel = el('select', {class:'select qi-select', 'data-id': it.id, title:'Formato por archivo', style:'text-transform:uppercase'});
            const inherit = el('option', {value:''}, 'Heredar global'); sel.appendChild(inherit);
            if (globalTarget){
              Array.from(globalTarget.options).forEach(opt=>{
                const o = el('option', {value: opt.value}, (opt.textContent || '').toUpperCase());
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
        el('button', {class:'btn compact', onclick:()=>convertOne(it)}, it.status==='done'?'Reconvertir':'Convertir'),
        el('a', {
          class:'btn compact',
          href: it.blobUrl || '#',
          download: it.downloadName || '',
          style: it.status==='done' ? '' : 'pointer-events:none; opacity:.5'
        }, 'Descargar')
      );

      row.appendChild(head);
      row.appendChild(bar);
      row.appendChild(actions);
      queueWrap.appendChild(row);
    });
    updateDownloadAll();
  }

  function removeItem(id){
    const i = state.items.findIndex(x=>x.id===id);
    if (i>=0){
      const it = state.items[i];
      if (it.xhr && it.status==='uploading') it.xhr.abort();
      if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
      state.items.splice(i,1);
      render();
    }
  }

  function pushFiles(files){
    const list = Array.from(files||[]);
    for (const f of list){
      if (state.items.length >= LIMIT){ alert(`Máximo ${LIMIT} archivos.`); break; }
      state.items.push({
        id:idSeq++,
        file:f,
        size:f.size,
        name:f.name,
        targetOverride:null,
        progress:0,
        status:'idle',
        blobUrl:null,
        downloadName:'',
        xhr:null
      });
    }
    render();
  }

  // ---------- Drag & Drop / Click ----------
  ['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('click', ()=> fileInput?.click());
  dropZone.addEventListener('drop', e=>{ if (e.dataTransfer?.files?.length) pushFiles(e.dataTransfer.files); });
  fileInput?.addEventListener('change', e=> pushFiles(e.target.files));
  btnAdd?.addEventListener('click', e=> { e.preventDefault(); fileInput?.click(); });
  btnClear?.addEventListener('click', e=>{
    e.preventDefault();
    state.items.forEach(it=> it.blobUrl && URL.revokeObjectURL(it.blobUrl));
    state.items = []; render();
  });

  // ---------- Helpers ----------
  function effectiveTarget(it){
    return (it.targetOverride || globalTarget?.value || '').toLowerCase();
  }

  // ---------- Conversión (uno) ----------
  function convertOne(it){
    if (!it || it.status==='uploading') return;
    const tgt = effectiveTarget(it);
    if (!tgt){ alert('Elegí un formato de salida.'); return; }
    if (!routeHidden){ alert('Falta input[name="route"] en el HTML.'); return; }

    const fd = new FormData();
    fd.append('target', tgt);
    fd.append('route', routeHidden.value || '');
    fd.append('file', it.file);

    const xhr = new XMLHttpRequest();
    it.xhr = xhr;
    xhr.open('POST', '/api/convert', true);
    xhr.responseType = 'blob';

    it.status = 'uploading'; it.progress = 0; render();

    xhr.upload.onprogress = function(e){
      if (e.lengthComputable){
        it.progress = Math.min(0.95, e.loaded / e.total);
        render();
      }
    };

    xhr.onload = function(){
      if (xhr.status === 200){
        const dispo = xhr.getResponseHeader('Content-Disposition') || 'attachment; filename="output"';
        const m = /filename="([^"]+)"/.exec(dispo);
        const fname = m ? m[1] : (it.name.replace(/\.[^.]+$/, '') + '.' + tgt);
        const url = URL.createObjectURL(xhr.response);
        it.status = 'done';
        it.progress = 1;
        it.downloadName = fname;
        if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
        it.blobUrl = url;
        render();
      } else {
        it.status = 'error'; render(); alert('Error convirtiendo '+ it.name);
      }
    };

    xhr.onerror = function(){ it.status = 'error'; render(); alert('Fallo de red en '+ it.name); };
    xhr.send(fd);
  }

  // ---------- Convertir todo (concurrencia 2) ----------
  btnConvertAll?.addEventListener('click', async e=>{
    e.preventDefault();
    const pend = state.items.filter(it=> it.status==='idle' || it.status==='error');
    const pool = 2; let idx = 0;
    async function runOne(){
      if (idx >= pend.length) return;
      const it = pend[idx++]; convertOne(it);
      await new Promise(res=>{
        const t = setInterval(()=>{
          if (it.status==='done' || it.status==='error'){ clearInterval(t); res(); }
        }, 120);
      });
      await runOne();
    }
    await Promise.all(Array.from({length: Math.min(pool, pend.length)}, runOne));
  });

  // ---------- Descargar todo (dispara cada ítem listo) ----------
  btnDownloadAll?.addEventListener('click', e=>{
    e.preventDefault();
    if (!allDone()) return;
    state.items.forEach(it=>{
      if (it.status==='done' && it.blobUrl){
        const a = document.createElement('a');
        a.href = it.blobUrl;
        a.download = it.downloadName || it.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    });
  });
})();

// =====================================================================
// 4) Filtrado algorítmico de formatos según formats.map.json + formats.status.json
//     - Aplica a <select id="target"> (form de ruta)
//     - Aplica a <select id="globalTarget"> (vista cola, si existe)
//     - Sólo publica opciones habilitadas y válidas según el mapa de targets
// =====================================================================
(function(){
  // Ejecuta sólo si hay al menos uno de los selects objetivo
  const targetSel = document.getElementById('target');
  const globalSel = document.getElementById('globalTarget');
  if (!targetSel && !globalSel) return;

  // Utilidades
  async function getJSON(url){
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error(url+': '+r.status);
    return r.json();
  }
  function readRouteArray(id){
    try{ return JSON.parse(document.getElementById(id)?.textContent || '[]'); }catch{ return []; }
  }

  // Lee datasets de la página (si están presentes)
  const ROUTE_FROM = readRouteArray('route-from-json'); // ej. ["jpg","png"]
  const ROUTE_TO   = readRouteArray('route-to-json');   // ej. ["webp","pdf"]

  // Arma estructura desde formats.map.json + formats.status.json
  (async function init(){
    let extToId = {}, idToFmt = {}, enabled = new Set();
    try{
      const [mapJson, stJson] = await Promise.all([
        getJSON('/static/formats.map.json'),
        getJSON('/static/formats.status.json')
      ]);
      Object.values(mapJson?.categories || {}).forEach(arr => {
        arr.forEach(f => {
          if (f?.ext && f?.id) extToId[f.ext.toLowerCase()] = f.id;
          if (f?.id) idToFmt[f.id] = f;
        });
      });
      (stJson?.status || []).forEach(s => { if (s?.id && s.enabled === true) enabled.add(s.id); });
    }catch(e){
      // Si falla, no filtramos; mantenemos selects como están
      return;
    }

    const isEnabledExt = (ext)=>{ const id = extToId[ext?.toLowerCase?.()||'']; return !!(id && enabled.has(id)); };
    const enabledTargetsForExt = (ext)=>{
      const id = extToId[ext?.toLowerCase?.()||''];
      const fmt = id && idToFmt[id];
      if (!fmt) return [];
      const outs = [];
      (fmt.targets||[]).forEach(tid=>{ if (enabled.has(tid)){ const tf = idToFmt[tid]; if (tf?.ext) outs.push(tf.ext.toLowerCase()); } });
      return outs;
    };

    function computeAllowed(routeFrom, routeTo, presentValues){
      const allowedSet = new Set();
      const hasFrom = Array.isArray(routeFrom) && routeFrom.length>0;
      const hasTo   = Array.isArray(routeTo)   && routeTo.length>0;

      if (hasFrom){
        routeFrom.forEach(ext=>{ if (isEnabledExt(ext)) enabledTargetsForExt(ext).forEach(t=>allowedSet.add(t)); });
      }
      let allowed = Array.from(allowedSet);

      if (hasTo){
        const declared = new Set(routeTo.map(x=>x.toLowerCase()));
        allowed = (allowed.length? allowed : Array.from(declared))
                    .filter(t=>!allowed.length || allowedSet.has(t));
      }

      // Si no hubo info de from/to, filtramos por enabled global (entre los que ya están presentes en el select)
      if (!hasFrom && !hasTo){
        return presentValues.filter(isEnabledExt);
      }

      // Siempre filtrar por enabled + que exista en el select
      const present = new Set(presentValues.map(v=>v.toLowerCase()));
      return allowed.filter(t=> present.has(t) && isEnabledExt(t));
    }

    function rebuildSelect(sel){
      if (!sel) return;
      // Capturamos opciones actuales (para preservar data-slug y labels)
      const opts = Array.from(sel.options).map(o=>({
        value: o.value.toLowerCase(),
        text:  o.textContent,
        slug:  o.getAttribute('data-slug')||''
      }));
      const presentValues = opts.map(o=>o.value);

      // Si el select es el de la ruta (#target), usamos ROUTE_FROM/ROUTE_TO; si es global, sólo enabled
      const allowed = sel.id === 'target'
        ? computeAllowed(ROUTE_FROM, ROUTE_TO, presentValues)
        : presentValues.filter(isEnabledExt);

      if (!allowed.length) return; // no tocamos si quedaría vacío

      const prev = sel.value && sel.value.toLowerCase();
      sel.innerHTML = '';
      allowed.forEach(v=>{
        const src = opts.find(o=>o.value===v);
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = (src?.text || v.toUpperCase());
        if (src?.slug) opt.setAttribute('data-slug', src.slug);
        sel.appendChild(opt);
      });
      sel.value = allowed.includes(prev) ? prev : allowed[0];
    }

    rebuildSelect(targetSel);
    rebuildSelect(globalSel);
  })();
})();

