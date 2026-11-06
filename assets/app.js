const ND = (() => {
  const cfg = window.ND_CONFIG || {};
  const categories = ['ジェル', 'ツール', 'パーツ', '基本用品'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const configured = () => !!cfg.API_URL;
  const norm = r => ({ ...r, id: String(r.id), low: r.low === true || r.low === 'TRUE' });

  async function list() {
    const r = await fetch(cfg.API_URL, { cache: 'no-store' });
    return (await r.json()).map(norm);
  }

  async function send(action, body = {}) {
    const r = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.TOKEN, action, ...body })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }

  // 追加・編集ダイアログ（item が null のときは追加）
  function openEditor(item, onSave) {
    document.querySelector('#nd-dlg')?.remove();
    const v = item || {};
    const dlg = document.createElement('dialog');
    dlg.id = 'nd-dlg';
    dlg.innerHTML = `
      <form id="nd-form">
        <h3>${item ? '編集' : '追加'}</h3>
        <label>名前<input name="name" required value="${esc(v.name)}"></label>
        <label>カテゴリ<select name="category">${categories.map(c => `<option${v.category === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>色・番号<input name="color" value="${esc(v.color)}"></label>
        <label>サイズ・容量<input name="size" value="${esc(v.size)}"></label>
        <label>購入先<input name="shop" value="${esc(v.shop)}"></label>
        <label>メモ<input name="note" value="${esc(v.note)}"></label>
        <label>写真のパス（任意）<input name="photo" value="${esc(v.photo)}" placeholder="images/tools/xxx.jpg"></label>
        <div class="btns"><button type="button" id="nd-cancel">キャンセル</button> <button type="submit">保存</button></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#nd-cancel').onclick = () => dlg.close();
    dlg.querySelector('#nd-form').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      Object.keys(f).forEach(k => f[k] = f[k].trim());
      try { await onSave(f); dlg.close(); } catch (err) { alert('保存できませんでした: ' + err.message); }
    };
    dlg.showModal();
  }

  return { cfg, configured, esc, categories, list, send, openEditor };
})();
