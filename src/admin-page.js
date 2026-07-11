// Web admin panel (self-contained SPA). Token admin lưu trong sessionStorage của trình duyệt,
// gửi kèm header x-admin-token cho mọi lời gọi API. Trang HTML này công khai; dữ liệu thì không.

export function adminPageHtml() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WCode — Quản lý license</title>
<style>
  :root { --bg:#0f172a; --card:#1e293b; --line:#334155; --fg:#e2e8f0; --muted:#94a3b8;
          --accent:#38bdf8; --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  header { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; }
  header h1 { font-size:16px; margin:0; }
  header button { background:none; border:1px solid var(--line); color:var(--muted); padding:6px 10px; border-radius:8px; cursor:pointer; }
  main { max-width:1100px; margin:0 auto; padding:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:18px; }
  .card h2 { font-size:14px; margin:0 0 12px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
  input, select, textarea { width:100%; background:var(--bg); border:1px solid var(--line); color:var(--fg);
          border-radius:8px; padding:8px 10px; font:inherit; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  button.primary { background:var(--accent); color:#04263a; border:none; padding:9px 16px; border-radius:8px; font-weight:600; cursor:pointer; }
  button.ghost { background:none; border:1px solid var(--line); color:var(--fg); padding:6px 10px; border-radius:8px; cursor:pointer; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:top; }
  th { color:var(--muted); cursor:pointer; user-select:none; white-space:nowrap; }
  th.sorted::after { content:" ↓"; } th.sorted.asc::after { content:" ↑"; }
  code { font-family:ui-monospace,Menlo,monospace; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:600; }
  .pill.valid { background:rgba(34,197,94,.15); color:var(--ok); }
  .pill.expired { background:rgba(239,68,68,.15); color:var(--bad); }
  .pill.revoked { background:rgba(148,163,184,.15); color:var(--muted); }
  .pill.pending { background:rgba(245,158,11,.15); color:var(--warn); }
  .muted { color:var(--muted); }
  .err { color:var(--bad); margin:8px 0; min-height:18px; }
  #login { max-width:380px; margin:80px auto; }
  .hidden { display:none; }
  .actions button { margin-right:6px; }
  dialog { background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:12px; padding:20px; max-width:560px; width:92%; }
  dialog::backdrop { background:rgba(0,0,0,.6); }
</style>
</head>
<body>
<div id="login" class="card">
  <h2>Đăng nhập quản trị</h2>
  <label>Admin token</label>
  <input id="token" type="password" placeholder="x-admin-token" autocomplete="current-password">
  <div class="err" id="loginErr"></div>
  <button class="primary" id="loginBtn">Đăng nhập</button>
</div>

<div id="app" class="hidden">
  <header>
    <h1>WCode — Quản lý license</h1>
    <button id="logout">Đăng xuất</button>
  </header>
  <main>
    <div class="card">
      <h2>Tạo license mới</h2>
      <div class="grid">
        <div><label>Tên khách *</label><input id="c_name" placeholder="Ivan Petrov"></div>
        <div><label>Liên hệ</label><input id="c_contact" placeholder="@telegram / email"></div>
        <div><label>Số máy tối đa</label><input id="c_devices" type="number" min="1" value="3"></div>
        <div><label>Gói</label><input id="c_plan" value="standard"></div>
        <div><label>Ngày bắt đầu</label><input id="c_start" type="date"></div>
        <div><label>Ngày kết thúc *</label><input id="c_end" type="date"></div>
      </div>
      <div style="margin-top:12px"><label>Ghi chú</label><input id="c_notes" placeholder="chuyển Sber 12/07..."></div>
      <div class="err" id="createErr"></div>
      <button class="primary" id="createBtn">Tạo license</button>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between; margin-bottom:12px">
        <h2 style="margin:0">Danh sách license</h2>
        <div class="row">
          <input id="search" placeholder="Tìm theo tên, liên hệ, key..." style="width:260px">
          <button class="ghost" id="refresh">Làm mới</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th data-sort="customer_name">Khách</th>
            <th>Key</th>
            <th>Máy</th>
            <th data-sort="starts_at">Bắt đầu</th>
            <th data-sort="expires_at">Kết thúc</th>
            <th>Trạng thái</th>
            <th data-sort="created_at">Tạo</th>
            <th></th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="muted" id="empty"></div>
    </div>
  </main>
</div>

<dialog id="editDlg">
  <h2 style="margin-top:0" id="editTitle">Sửa license</h2>
  <div class="grid">
    <div><label>Tên khách</label><input id="e_name"></div>
    <div><label>Liên hệ</label><input id="e_contact"></div>
    <div><label>Số máy tối đa</label><input id="e_devices" type="number" min="1"></div>
    <div><label>Gói</label><input id="e_plan"></div>
    <div><label>Ngày bắt đầu</label><input id="e_start" type="date"></div>
    <div><label>Ngày kết thúc</label><input id="e_end" type="date"></div>
  </div>
  <div style="margin-top:12px"><label>Ghi chú</label><input id="e_notes"></div>
  <div id="e_devicesList" class="muted" style="margin-top:12px"></div>
  <div class="err" id="editErr"></div>
  <div class="row" style="justify-content:flex-end; margin-top:14px">
    <button class="ghost" id="editClose">Đóng</button>
    <button class="primary" id="editSave">Lưu</button>
  </div>
</dialog>

<script>
const $ = (id) => document.getElementById(id);
let TOKEN = sessionStorage.getItem('wc_admin_token') || '';
let sortBy = 'created_at', sortOrder = 'desc', editingKey = null;

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type':'application/json', 'x-admin-token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || ('HTTP ' + res.status));
  return data;
}

const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('vi-VN') : '—';
const toEndOfDayMs = (v) => v ? new Date(v + 'T23:59:59').getTime() : undefined;
const toStartMs = (v) => v ? new Date(v + 'T00:00:00').getTime() : undefined;
const toDateInput = (ms) => { const d = new Date(ms); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function login() {
  TOKEN = $('token').value.trim();
  try {
    await api('GET', '/api/v1/admin/licenses');
    sessionStorage.setItem('wc_admin_token', TOKEN);
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    load();
  } catch (e) { $('loginErr').textContent = 'Token sai hoặc server lỗi: ' + e.message; }
}

async function load() {
  try {
    const q = encodeURIComponent($('search').value.trim());
    const data = await api('GET', '/api/v1/admin/licenses?q=' + q + '&sort=' + sortBy + '&order=' + sortOrder);
    renderRows(data.licenses);
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortBy);
      th.classList.toggle('asc', th.dataset.sort === sortBy && sortOrder === 'asc');
    });
  } catch (e) {
    if (String(e.message).includes('401')) return logout();
    $('empty').textContent = 'Lỗi tải: ' + e.message;
  }
}

function renderRows(list) {
  $('empty').textContent = list.length ? '' : 'Chưa có license nào.';
  $('rows').innerHTML = list.map((l) => \`<tr>
    <td>\${esc(l.customerName)}<div class="muted">\${esc(l.customerContact||'')}</div></td>
    <td><code>\${esc(l.licenseKey)}</code></td>
    <td>\${l.deviceCount}/\${l.maxDevices}</td>
    <td>\${fmtDate(l.startsAt)}</td>
    <td>\${fmtDate(l.expiresAt)}</td>
    <td><span class="pill \${l.status}">\${l.status}</span></td>
    <td class="muted">\${fmtDate(l.createdAt)}</td>
    <td class="actions" style="white-space:nowrap">
      <button class="ghost" data-copy="\${esc(l.licenseKey)}">Copy</button>
      <button class="ghost" data-edit="\${esc(l.licenseKey)}">Sửa</button>
      <button class="ghost" data-revoke="\${esc(l.licenseKey)}">Thu hồi</button>
    </td></tr>\`).join('');
}

async function openEdit(key) {
  const l = await api('GET', '/api/v1/admin/licenses/' + encodeURIComponent(key));
  editingKey = key;
  $('editTitle').textContent = 'Sửa: ' + key;
  $('e_name').value = l.customerName; $('e_contact').value = l.customerContact;
  $('e_devices').value = l.maxDevices; $('e_plan').value = l.plan;
  $('e_start').value = toDateInput(l.startsAt); $('e_end').value = toDateInput(l.expiresAt);
  $('e_notes').value = l.notes || ''; $('editErr').textContent = '';
  $('e_devicesList').innerHTML = 'Máy đã kích hoạt (' + l.devices.length + '): ' +
    (l.devices.map((d) => esc(d.device_name || d.fingerprint.slice(0,10)) +
      ' <button class="ghost" data-rmdev="'+esc(d.fingerprint)+'">gỡ</button>').join(', ') || '<span class="muted">chưa có</span>');
  $('editDlg').showModal();
}

document.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (t.dataset.copy) { navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'Đã copy'; setTimeout(()=>t.textContent='Copy',1200); }
  if (t.dataset.edit) openEdit(t.dataset.edit).catch((e)=>alert(e.message));
  if (t.dataset.revoke) { if (confirm('Thu hồi license ' + t.dataset.revoke + '?')) { await api('POST','/api/v1/admin/licenses/'+encodeURIComponent(t.dataset.revoke)+'/revoke'); load(); } }
  if (t.dataset.rmdev && editingKey) { await api('DELETE','/api/v1/admin/licenses/'+encodeURIComponent(editingKey)+'/devices/'+encodeURIComponent(t.dataset.rmdev)); openEdit(editingKey); }
});

$('loginBtn').onclick = login;
$('token').onkeydown = (e) => { if (e.key === 'Enter') login(); };
$('logout').onclick = logout;
function logout() { sessionStorage.removeItem('wc_admin_token'); TOKEN=''; $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }
$('refresh').onclick = load;
let searchTimer; $('search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 250); };
document.querySelectorAll('th[data-sort]').forEach((th) => th.onclick = () => {
  if (sortBy === th.dataset.sort) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  else { sortBy = th.dataset.sort; sortOrder = 'asc'; }
  load();
});

$('createBtn').onclick = async () => {
  $('createErr').textContent = '';
  try {
    const lic = await api('POST', '/api/v1/admin/licenses', {
      customerName: $('c_name').value.trim(),
      customerContact: $('c_contact').value.trim(),
      maxDevices: Number($('c_devices').value),
      plan: $('c_plan').value.trim() || 'standard',
      startsAt: toStartMs($('c_start').value),
      expiresAt: toEndOfDayMs($('c_end').value),
      notes: $('c_notes').value.trim(),
    });
    ['c_name','c_contact','c_notes','c_start','c_end'].forEach((id)=>$(id).value='');
    await load();
    alert('Đã tạo license — gửi key cho khách:\\n\\n' + lic.licenseKey);
  } catch (e) { $('createErr').textContent = e.message; }
};

$('editClose').onclick = () => $('editDlg').close();
$('editSave').onclick = async () => {
  $('editErr').textContent = '';
  try {
    await api('PATCH', '/api/v1/admin/licenses/' + encodeURIComponent(editingKey), {
      customerName: $('e_name').value.trim(),
      customerContact: $('e_contact').value.trim(),
      maxDevices: Number($('e_devices').value),
      plan: $('e_plan').value.trim(),
      startsAt: toStartMs($('e_start').value),
      expiresAt: toEndOfDayMs($('e_end').value),
      notes: $('e_notes').value.trim(),
    });
    $('editDlg').close(); load();
  } catch (e) { $('editErr').textContent = e.message; }
};

if (TOKEN) { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); load(); }
</script>
</body>
</html>`;
}
