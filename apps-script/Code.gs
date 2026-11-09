// Google Apps Script（ウェブアプリ）
// スプレッドシートの「items」「prompts」シートを読み書きする小さなAPIです。
// 設定: 下の TOKEN を自分で決めた合言葉に変えてください。

const TOKEN = 'ここを自分の合言葉に変更';
const SHEET_NAME = 'items';

function sheetByName_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh && name === 'prompts') {
    sh = ss.insertSheet('prompts');
    sh.appendRow(['id', 'title', 'body']);
  }
  if (!sh && name === 'designimages') {
    sh = ss.insertSheet('designimages');
    sh.appendRow(['id', 'design', 'slot', 'url']);
  }
  return sh;
}

// デザインの指示画像（STEP2A・STEP2B など）の差し替え。同じデザイン・同じ枠なら上書き
function designImageAction_(req) {
  const sh = sheetByName_('designimages');
  const values = sh.getDataRange().getValues();
  const rowIndex = values.findIndex((r, i) => i > 0 && r[1] === req.design && r[2] === req.slot);
  if (rowIndex > 0) {
    sh.getRange(rowIndex + 1, 4).setValue(req.url);
  } else {
    sh.appendRow(['d' + Utilities.getUuid().slice(0, 8), req.design, req.slot, req.url]);
  }
  return out_({ ok: true });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readRows_(sh) {
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(r => r[0] !== '')
    .map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = r[i]);
      return o;
    });
}

// 全件取得（サイトから読み込むとき）。?sheet=prompts で指示プロンプトを取得
function doGet(e) {
  const name = (e && e.parameter && e.parameter.sheet) || SHEET_NAME;
  return out_(readRows_(sheetByName_(name)));
}

// 指示プロンプトの追加・編集・削除
function promptAction_(req) {
  const sh = sheetByName_('prompts');
  const values = sh.getDataRange().getValues();

  if (req.action === 'addPrompt') {
    const id = 'p' + Utilities.getUuid().slice(0, 8);
    sh.appendRow([id, req.title || '', req.body || '']);
    return out_({ ok: true, id: id });
  }

  const rowIndex = values.findIndex((r, i) => i > 0 && String(r[0]) === String(req.id));
  if (rowIndex < 1) return out_({ error: 'not found' });

  if (req.action === 'deletePrompt') {
    sh.deleteRow(rowIndex + 1);
    return out_({ ok: true });
  }
  if (req.action === 'updatePrompt') {
    sh.getRange(rowIndex + 1, 2, 1, 2).setValues([[req.title || '', req.body || '']]);
    return out_({ ok: true });
  }
  return out_({ error: 'unknown action' });
}

// 変更・追加（サイトから操作するとき）。途中で失敗しても理由をサイトに返す
function doPost(e) {
  try {
    return handlePost_(e);
  } catch (err) {
    return out_({ error: String(err && err.message || err) });
  }
}

function handlePost_(e) {
  const req = JSON.parse(e.postData.contents);
  if (req.token !== TOKEN) return out_({ error: 'unauthorized' });

  if (['addPrompt', 'updatePrompt', 'deletePrompt'].includes(req.action)) {
    return promptAction_(req);
  }
  if (req.action === 'setDesignImage') {
    return designImageAction_(req);
  }

  // 写真のアップロード（軽くした画像を受け取り、Googleドライブに保存して表示用URLを返す）
  if (req.action === 'upload') {
    const blob = Utilities.newBlob(Utilities.base64Decode(req.data), 'image/jpeg', req.name || 'photo.jpg');
    const folders = DriveApp.getFoldersByName('nail-photos');
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('nail-photos');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return out_({ ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() });
  }

  const sh = sheetByName_(SHEET_NAME);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');

  if (req.action === 'add') {
    const it = Object.assign({}, req.item, {
      id: 'i' + Utilities.getUuid().slice(0, 8),
      status: req.item.status || '購入リスト',
      low: !!req.item.low
    });
    sh.appendRow(headers.map(h => (it[h] === undefined ? '' : it[h])));
    return out_({ ok: true, id: it.id });
  }

  const rowIndex = values.findIndex((r, i) => i > 0 && String(r[idCol]) === String(req.id));
  if (rowIndex < 1) return out_({ error: 'not found' });
  const row = rowIndex + 1;

  let fields = null;
  if (req.action === 'setStatus') fields = { status: req.status };
  if (req.action === 'setLow') fields = { low: !!req.low };
  if (req.action === 'update') fields = req.fields;
  if (!fields) return out_({ error: 'unknown action' });

  Object.keys(fields).forEach(k => {
    const c = headers.indexOf(k);
    if (c >= 0 && k !== 'id') sh.getRange(row, c + 1).setValue(fields[k]);
  });
  return out_({ ok: true });
}
