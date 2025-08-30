
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