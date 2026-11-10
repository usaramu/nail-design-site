const ND = (() => {
  const cfg = window.ND_CONFIG || {};
  const categories = ['ジェル', 'ツール', 'パーツ', '基本用品'];
  // 色タグ・質感タグ（シートの colortag / texture 列にカンマ区切りで入る）
  const colorTags = ['赤系', 'ピンク系', 'オレンジ系', 'ベージュ系', 'ブラウン系', '白系', '黒系', '青系', '紫系', '緑系', '黄系', 'ゴールド系', 'シルバー系', 'クリア', 'マルチ'];
  const textureTags = ['ツヤ', 'マット', 'シアー', 'ラメ', 'フラッシュ', 'マグネット', 'パール', 'メタリック', 'ホロ'];
  // パーツの種類（シートの parttype 列。1つだけ）
  const partTypes = ['シール', 'パーツ', 'ホログラム', 'パール・ビーズ', 'ストーン', 'その他'];
  const tagsOf = s => String(s || '').split(/[,、]\s*/).map(t => t.trim()).filter(Boolean);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const configured = () => !!cfg.API_URL;
  const norm = r => ({ ...r, id: String(r.id), low: r.low === true || r.low === 'TRUE' });

  // sheet を省略すると「items」（持ち物）。'prompts' を指定すると指示プロンプト
  async function list(sheet) {
    const url = cfg.API_URL + (sheet ? '?sheet=' + encodeURIComponent(sheet) : '');
    const r = await fetch(url, { cache: 'no-store' });
    return (await r.json()).map(norm);
  }

  // すぐ表示するための控え（この端末に保存）。まず控えを出し、裏で最新を取ってきて差し替える
  let dirty = false; // 変更を送った直後は古い控えを出さない
  const cacheKey = sheet => 'nd_cache_' + (sheet || 'items');
  async function listFast(sheet, onData) {
    let shown = null;
    if (!dirty) {
      try {
        shown = localStorage.getItem(cacheKey(sheet));
        if (shown) onData(JSON.parse(shown).map(norm));
      } catch (e) { shown = null; }
    }
    const url = cfg.API_URL + (sheet ? '?sheet=' + encodeURIComponent(sheet) : '');
    const r = await fetch(url, { cache: 'no-store' });
    const text = await r.text();
    dirty = false;
    try { localStorage.setItem(cacheKey(sheet), text); } catch (e) { /* 容量オーバーなどは無視 */ }
    if (text !== shown) onData(JSON.parse(text).map(norm));
  }

  // 文字列をクリップボードにコピー（非対応の端末でも動くように予備の方法を用意）
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // 合言葉はリポジトリに書かず、このブラウザに一度入力して保存する
  function getToken() {
    let t = localStorage.getItem('nd_token');
    if (!t) {
      t = prompt('合言葉を入力してください');
      if (!t) throw new Error('合言葉が入力されていません');
      localStorage.setItem('nd_token', t.trim());
    }
    return localStorage.getItem('nd_token');
  }

  async function send(action, body = {}) {
    const r = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: getToken(), action, ...body })
    });
    const j = await r.json();
    if (j.error === 'unauthorized') {
      localStorage.removeItem('nd_token');
      throw new Error('合言葉が違います。もう一度操作すると入力し直せます');
    }
    if (j.error) throw new Error(j.error);
    dirty = true;
    return j;
  }

  // 画面は先に変えて、送信は裏で順番に行う。全部送り終わったら最新を取り直す。
  // 失敗したときは知らせて、スプレッドシートの内容に戻す
  let queue = Promise.resolve();
  let pending = 0;
  function later(task, refresh) {
    pending++;
    queue = queue.then(task).then(
      () => { pending--; if (!pending && refresh) refresh(); },
      err => { pending--; alert('保存できませんでした: ' + err.message); if (refresh) refresh(); }
    );
  }
  // 送信中にページを閉じようとしたら確認する
  window.addEventListener('beforeunload', e => {
    if (pending) { e.preventDefault(); e.returnValue = ''; }
  });

  // 追加・編集ダイアログ（item が null のときは追加）
  function openEditor(item, onSave, opts = {}) {
    document.querySelector('#nd-dlg')?.remove();
    const v = item || {};
    const dlg = document.createElement('dialog');
    dlg.id = 'nd-dlg';
    dlg.innerHTML = `
      <form id="nd-form">
        <div class="form-head" tabindex="-1" autofocus><h3>${item ? '編集' : '追加'}</h3></div>
        <div class="form-body">
        <label>商品名<input name="name" required value="${esc(v.name)}"></label>
        <label>カテゴリ<select name="category">${(opts.categories || categories).map(c => `<option${v.category === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>見た目の説明（AI用）<input name="desc" value="${esc(v.desc)}" placeholder="例：深みのあるボルドー"></label>
        <label>色・番号<input name="color" value="${esc(v.color)}"></label>
        <label>サイズ・容量<input name="size" value="${esc(v.size)}"></label>
        <label>購入先<input name="shop" value="${esc(v.shop)}"></label>
        <label>商品番号<input name="sku" value="${esc(v.sku)}" inputmode="text" autocomplete="off"></label>
        <label>メモ<input name="note" value="${esc(v.note)}"></label>
        <fieldset class="nd-tags" data-for="color"><legend>色タグ</legend>${chips('colortag', colorTags, tagsOf(v.colortag))}</fieldset>
        <fieldset class="nd-tags" data-for="color"><legend>質感タグ（1つ）</legend>${chips('texture', textureTags, tagsOf(v.texture).slice(0, 1), 'radio')}</fieldset>
        <fieldset class="nd-tags" data-for="part"><legend>種類（1つ）</legend>${chips('parttype', partTypes, [String(v.parttype || '')], 'radio')}</fieldset>
        <label>写真（任意）<input type="file" id="nd-file" accept="image/*"></label>
        <p class="note" id="nd-status" style="margin:4px 0 0"></p>
        <input type="hidden" name="photo" value="${esc(v.photo)}">
        </div>
        ${item && opts.onDelete ? '<div class="form-del"><button type="button" id="nd-delete">この持ち物を削除</button></div>' : ''}
        <div class="form-foot"><button type="button" id="nd-cancel">キャンセル</button><button type="submit">保存</button></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#nd-cancel').onclick = () => dlg.close();
    const del = dlg.querySelector('#nd-delete');
    if (del) del.onclick = () => {
      if (!confirm(`「${v.name}」を削除しますか？`)) return;
      dlg.close();
      opts.onDelete();
    };
    // パーツのときは「種類」、それ以外は「色タグ・質感タグ」を出す
    const catSel = dlg.querySelector('select[name=category]');
    const showTags = () => dlg.querySelectorAll('.nd-tags').forEach(fs => {
      fs.hidden = (fs.dataset.for === 'part') !== (catSel.value === 'パーツ');
    });
    catSel.addEventListener('change', showTags);
    showTags();
    dlg.querySelectorAll('input[type=radio]').forEach(r => {
      const chip = r.closest('label');
      chip.addEventListener('pointerdown', () => { r.dataset.was = r.checked ? '1' : ''; });
      r.addEventListener('click', () => { if (r.dataset.was) r.checked = false; r.dataset.was = ''; });
    });
    dlg.querySelector('#nd-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const f = Object.fromEntries(fd);
      Object.keys(f).forEach(k => f[k] = f[k].trim());
      const isPart = f.category === 'パーツ';
      f.colortag = isPart ? '' : fd.getAll('colortag').join(', ');
      f.texture = isPart ? '' : fd.getAll('texture').join(', ');
      f.parttype = isPart ? (fd.get('parttype') || '') : '';
      const file = dlg.querySelector('#nd-file').files[0];
      try {
        if (file) {
          dlg.querySelector('#nd-status').textContent = '写真を保存しています…';
          f.photo = await photoDataUrl(file);
        }
        await onSave(f);
        dlg.close();
      } catch (err) {
        dlg.querySelector('#nd-status').textContent = '';
        alert('保存できませんでした: ' + err.message);
      }
    };
    dlg.showModal();
  }

  // タグを選ぶチェックボックス（押すと色が付く小さな札）
  // type='radio' のときは1つだけ選べる（選んだものをもう一度押すと外れる）
  function chips(name, all, on, type = 'checkbox') {
    return all.map(t => `<label class="nd-chip"><input type="${type}" name="${name}" value="${esc(t)}"${on.includes(t) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('');
  }

  // 持ち物を、AIに渡しやすい文章にする（見た目の説明＋質感・種類）
  function inventoryText(items) {
    const mine = items.filter(i => i.status === '持ち物');
    const line = i => {
      let t = String(i.desc || i.name || '').trim();
      if (i.category === 'パーツ' && i.parttype) t = `${i.parttype}：${t}`;
      if (i.category === 'ジェル') { const tx = tagsOf(i.texture)[0]; if (tx) t += `／${tx}`; }
      if (i.low) t += '（残りわずか）';
      return '・' + t;
    };
    return ['ジェル', 'パーツ']
      .map(c => { const g = mine.filter(i => i.category === c); return g.length ? `【${c}】\n${g.map(line).join('\n')}` : ''; })
      .filter(Boolean).join('\n\n');
  }

  // 「designs」列（例: "harvard, other"）を配列にする
  const designsOf = i => String(i.designs || '').split(/[,、\s]+/).filter(Boolean);

  // 写真の拡大表示（タップで閉じる）
  function lightbox(src, alt) {
    document.querySelector('#nd-lb')?.remove();
    const d = document.createElement('dialog');
    d.id = 'nd-lb';
    d.style.cssText = 'padding:0;border:0;background:transparent;max-width:96vw;max-height:96vh';
    d.innerHTML = `
      <img src="${esc(src)}" alt="${esc(alt)}" style="max-width:96vw;max-height:88vh;border-radius:8px;display:block;margin:auto">
      <p style="text-align:center"><button type="button" style="margin-top:8px">閉じる</button></p>`;
    d.querySelector('button').onclick = () => d.close();
    d.onclick = e => { if (e.target === d) d.close(); };
    document.body.appendChild(d);
    d.showModal();
  }

  // 写真を軽くする（長辺1000px・JPEG 80%）。送る前にブラウザ側で行う
  function compressImage(file, maxSide = 1000, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob(b => b ? resolve(b) : reject(new Error('画像を変換できませんでした')), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }

  // 写真を小さな画像データにする（シートのセル上限 50,000 文字に収まるまで縮める）
  // ドライブを使わないので、Apps Script の追加設定なしで保存できる
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }
  // 指示画像など大きめの画像用（長辺 maxSide px の JPEG）
  async function imageData(file, maxSide = 1400, quality = .8) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return c.toDataURL('image/jpeg', quality);
  }

  // 写真の切り抜き（サムネイル用）：枠の中で指で動かし、つまみで拡大。決定で 4:5 の JPEG を返す
  function cropImage(src, aspect = 4 / 5) {
    return new Promise(resolve => {
      document.querySelector('#nd-crop')?.remove();
      const d = document.createElement('dialog');
      d.id = 'nd-crop';
      d.innerHTML = `
        <div class="crop-wrap">
          <div class="form-head"><h3>サムネイルを調整</h3></div>
          <div class="crop-body">
            <div class="crop-frame"><img alt="" draggable="false"></div>
            <label class="crop-zoom">拡大<input type="range" min="1" max="4" step="0.01" value="1"></label>
          </div>
          <div class="form-foot"><button type="button" data-x>キャンセル</button><button type="button" data-ok>決定</button></div>
        </div>`;
      document.body.appendChild(d);
      const frame = d.querySelector('.crop-frame'), img = frame.querySelector('img'), zoom = d.querySelector('input[type=range]');
      let W = 0, H = 0, base = 1, z = 1, x = 0, y = 0;   // 画像の大きさ・最小倍率・拡大・位置
      const fw = () => frame.clientWidth, fh = () => frame.clientHeight;
      const clamp = () => {
        const w = W * base * z, h = H * base * z;
        x = Math.min(0, Math.max(fw() - w, x));
        y = Math.min(0, Math.max(fh() - h, y));
      };
      const paint = () => { clamp(); img.style.width = W * base * z + 'px'; img.style.transform = `translate(${x}px, ${y}px)`; };
      img.onload = () => {
        W = img.naturalWidth; H = img.naturalHeight;
        base = Math.max(fw() / W, fh() / H);
        x = (fw() - W * base) / 2; y = (fh() - H * base) / 2;
        paint();
      };
      img.src = src;
      // 指（マウス）で動かす
      let drag = null;
      frame.addEventListener('pointerdown', e => { drag = { sx: e.clientX, sy: e.clientY, x, y }; frame.setPointerCapture(e.pointerId); });
      frame.addEventListener('pointermove', e => { if (!drag) return; x = drag.x + e.clientX - drag.sx; y = drag.y + e.clientY - drag.sy; paint(); });
      frame.addEventListener('pointerup', () => { drag = null; });
      frame.addEventListener('pointercancel', () => { drag = null; });
      // 拡大は枠の真ん中を中心に
      zoom.addEventListener('input', () => {
        const cx = fw() / 2, cy = fh() / 2, nz = +zoom.value;
        x = cx - (cx - x) * nz / z; y = cy - (cy - y) * nz / z; z = nz;
        paint();
      });
      const done = v => { d.close(); d.remove(); resolve(v); };
      d.querySelector('[data-x]').onclick = () => done(null);
      d.querySelector('[data-ok]').onclick = () => {
        const s = 1 / (base * z);                    // 画面の1pxが元画像の何pxか
        const sx = -x * s, sy = -y * s, sw = fw() * s, sh = fh() * s;
        const c = document.createElement('canvas');
        c.width = 560; c.height = Math.round(560 / aspect);
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        let q = .85, out = c.toDataURL('image/jpeg', q);
        while (out.length > 45000 && q > .4) { q -= .08; out = c.toDataURL('image/jpeg', q); }
        done(out);
      };
      d.showModal();
    });
  }

  // 持ち物を削除する（表からは消さず「削除」の印を付け、どこにも出さない）
  function removeItem(item, refresh) {
    item.status = '削除';
    item.designs = '';
    later(async () => {
      await send('setStatus', { id: item.id, status: '削除' });
      await send('update', { id: item.id, fields: { designs: '' } });
    }, refresh);
  }

  async function photoDataUrl(file) {
    const img = await loadImage(file);
    const steps = [[560, .78], [480, .74], [400, .7], [320, .68], [260, .62], [200, .6]];
    for (const [side, q] of steps) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', q);
      if (url.length < 45000) { URL.revokeObjectURL(img.src); return url; }
    }
    URL.revokeObjectURL(img.src);
    throw new Error('写真を小さくできませんでした');
  }

  // 軽くした写真をApps Script経由でGoogleドライブに保存し、表示用URLを返す
  async function uploadPhoto(file) {
    const blob = await compressImage(file);
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('写真を読み込めませんでした'));
      r.readAsDataURL(blob);
    });
    const res = await send('upload', { name: 'photo.jpg', data });
    return res.url;
  }

  return { cfg, configured, esc, later, categories, colorTags, textureTags, partTypes, tagsOf, inventoryText, list, listFast, send, openEditor, designsOf, lightbox, uploadPhoto, photoDataUrl, imageData, cropImage, removeItem, copyText };
})();
