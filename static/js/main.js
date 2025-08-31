
(function(){
  // Theme toggle
  const k='zc-theme';
  const btn = document.getElementById('toggleTheme');
  const root = document.documentElement;
  function apply(t){ if(t==='dark'){ root.classList.add('dark'); } else { root.classList.remove('dark'); } }
  apply(localStorage.getItem(k));
  if(btn){ btn.addEventListener('click',()=>{ const t = root.classList.contains('dark')?'light':'dark'; localStorage.setItem(k,t); apply(t); }); }

  const form = document.getElementById('convertForm');
  const fileInput = document.getElementById('file') || document.querySelector('input[type="file"]');
  const drop = document.querySelector('.panel.converter');

  // Drag & drop + paste
  if(drop && fileInput){
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('is-drag'); }));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('is-drag'); }));
    drop.addEventListener('drop', e=>{ if(e.dataTransfer?.files?.length){ fileInput.files = e.dataTransfer.files; } });
    window.addEventListener('paste', e=>{ const items = e.clipboardData?.files; if(items && items.length){ fileInput.files = items; } });
  }

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
      const nf = new File([blob], f.name.replace(/\.[^.]+$/, tgt==='webp'?'.webp':'.jpg'), {type: mime});
      const nfd = new FormData();
      for(const [k,v] of fd.entries()){ if(k!=='file' && k!=='files') nfd.append(k,v); }
      nfd.append('file', nf);
      return nfd;
    }catch(e){ return fd; }
  }

  if(form){
    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      const bar = document.getElementById('progressBar');
      let fd = new FormData(form);
      fd = await maybePrecompress(fd);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action, true);
      xhr.responseType = 'blob';
      xhr.upload.onprogress = function(e){ if(e.lengthComputable){ const p = Math.max(5, Math.floor((e.loaded / e.total) * 100)); bar.style.width = p + '%'; } };
      xhr.onload = function(){
        if(xhr.status === 200){
          const disposition = xhr.getResponseHeader('Content-Disposition') || 'attachment; filename="output"';
          const fname = /filename="([^"]+)"/.exec(disposition);
          const fileName = fname ? fname[1] : 'resultado.bin';
          const url = window.URL.createObjectURL(xhr.response);
          const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click();
          setTimeout(()=>{ window.URL.revokeObjectURL(url); a.remove(); bar.style.width='0%'; }, 200);
        } else { alert('Error en la conversión'); bar.style.width='0%'; }
      };
      xhr.onerror = function(){ alert('Fallo de red'); bar.style.width='0%'; };
      xhr.send(fd);
    });
  }
})();

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
  const root          = document.documentElement;
  const dropZone      = $('#dropZone');
  const fileInput     = $('#fileInput');
  const queueWrap     = $('#fileQueue');
  const btnAdd        = $('#btnAdd');
  const btnClear      = $('#btnClear');
  const btnConvertAll = $('#btnConvertAll');
  const overallBar    = $('#overallBar');
  const globalTarget  = $('#globalTarget');

  // datasets
  const ALL_TARGETS   = JSON.parse(document.getElementById('targets-json')?.textContent || '[]');
  const TARGET_TO_SLUG= JSON.parse(document.getElementById('map-json')?.textContent || '{}');

  if (!dropZone || !queueWrap) return;

  // ---------- Redirección al cambiar formato global ----------
  (function setupFormatRedirect(){
    if (!globalTarget) return;
    const currentSlug = globalTarget.getAttribute('data-current-slug');
    const routeTpl    = globalTarget.getAttribute('data-route-template');
    globalTarget.addEventListener('change', function(){
      const opt  = this.options[this.selectedIndex];
      const slug = opt.getAttribute('data-slug');
      if (slug && slug !== currentSlug) {
        const next = routeTpl.replace('__SLUG__', slug);
        window.location.href = next;
      }
    });
  })();

  // ---------- Estado de la cola ----------
  const LIMIT = 5;
  const state = {
    items: [] // {id, file, size, name, targetOverride, progress(0-1), status: 'idle'|'uploading'|'done'|'error', blobUrl, xhr}
  };
  let idSeq = 1;

  function recomputeOverall(){
    if (!state.items.length){ overallBar.style.width = '0%'; return; }
    const wSum = state.items.reduce((acc, it)=> acc + it.size, 0) || 1;
    const p = Math.round(state.items.reduce((acc, it)=> acc + (it.progress * it.size), 0) / wSum * 100);
    overallBar.style.width = Math.max(5, p) + '%';
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
          // target override (opcional)
          (function(){
            const sel = el('select', {class:'select qi-select', 'data-id': it.id, title:'Formato por archivo'});
            el('option', {value:''}, sel).textContent = 'Heredar global';
            ALL_TARGETS.forEach(t=>{
              const o = el('option', {value: t}, document.createTextNode(t.toUpperCase()));
              sel.appendChild(o);
            });
            sel.value = it.targetOverride || '';
            sel.addEventListener('change', e=>{
              it.targetOverride = sel.value || null;
            });
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
      state.items.push({
        id: idSeq++,
        file: f,
        size: f.size,
        name: f.name,
        targetOverride: null,
        progress: 0,
        status: 'idle',
        blobUrl: null,
        downloadName: ''
      });
    }
    render(); recomputeOverall();
  }

  // ---------- Drag & Drop / Click ----------
  ['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev, e=>{
    e.preventDefault(); dropZone.classList.add('is-drag');
  }));
  ['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev, e=>{
    e.preventDefault(); if (ev==='drop'){} dropZone.classList.remove('is-drag');
  }));
  dropZone.addEventListener('click', ()=> fileInput.click());
  dropZone.addEventListener('drop', e=>{
    if (e.dataTransfer?.files?.length) pushFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', e=> pushFiles(e.target.files));
  btnAdd?.addEventListener('click', e=> { e.preventDefault(); fileInput.click(); });
  btnClear?.addEventListener('click', e=>{
    e.preventDefault();
    state.items.forEach(it=> it.blobUrl && URL.revokeObjectURL(it.blobUrl));
    state.items = []; render(); recomputeOverall();
  });

  // ---------- Conversión ----------
  function effectiveTarget(it){
    return (it.targetOverride || globalTarget?.value || '').toLowerCase();
  }

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

    // progreso inteligente (upload)
    xhr.upload.onprogress = function(e){
      if (e.lengthComputable){
        it.progress = Math.min(0.95, e.loaded / e.total); // 95% hasta que el server responda
        render(); recomputeOverall();
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
        render(); recomputeOverall();
      }else{
        it.status = 'error';
        render(); recomputeOverall();
        alert('Error convirtiendo '+ it.name);
      }
    };

    xhr.onerror = function(){
      it.status = 'error';
      render(); recomputeOverall();
      alert('Fallo de red en '+ it.name);
    };

    xhr.send(fd);
  }

  // convertir todo (concurrencia 2)
  btnConvertAll?.addEventListener('click', async e=>{
    e.preventDefault();
    const pending = state.items.filter(it=> it.status==='idle' || it.status==='error');
    const pool = 2;
    let idx = 0;
    async function runOne(){
      if (idx >= pending.length) return;
      const it = pending[idx++]; convertOne(it);
      // espera a que termine este antes de lanzar otro
      await new Promise(res=>{
        const timer = setInterval(()=>{
          if (it.status==='done' || it.status==='error'){ clearInterval(timer); res(); }
        }, 100);
      });
      await runOne();
    }
    await Promise.all(Array.from({length: Math.min(pool, pending.length)}, runOne));
  });

})();
