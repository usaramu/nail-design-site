// Google Apps Script（ウェブアプリ）
// スプレッドシートの「items」シートを読み書きする小さなAPIです。
// 設定: 下の TOKEN を自分で決めた合言葉に変えてください。

const TOKEN = 'ここを自分の合言葉に変更';
const SHEET_NAME = 'items';

function sheet_() {
  return SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 全件取得（サイトから読み込むとき）
function doGet() {
  const values = sheet_().getDataRange().getValues();
  const headers = values.shift();
  const items = values
    .filter(r => r[0] !== '')
    .map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = r[i]);
      return o;
    });
  return out_(items);
}

// 変更・追加（サイトから操作するとき）
function doPost(e) {
  const req = JSON.parse(e.postData.contents);
  if (req.token !== TOKEN) return out_({ error: 'unauthorized' });

  // 写真のアップロード（軽くした画像を受け取り、Googleドライブに保存して表示用URLを返す）
  if (req.action === 'upload') {
    const blob = Utilities.newBlob(Utilities.base64Decode(req.data), 'image/jpeg', req.name || 'photo.jpg');
    const folders = DriveApp.getFoldersByName('nail-photos');
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('nail-photos');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return out_({ ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() });
  }

  const sh = sheet_();
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
