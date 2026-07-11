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
          --accent:#38bdf8; --accent2:#0ea5e9; --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
  * { box-sizing:border-box; }
  html, body { height:100%; }
  /* Trang không cuộn — chỉ vùng nội dung cuộn */
  body { margin:0; height:100vh; overflow:hidden; display:flex; flex-direction:column;
         font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  header { flex:0 0 auto; padding:14px 20px; border-bottom:1px solid var(--line);
           display:flex; justify-content:space-between; align-items:center; background:var(--bg); }
  header h1 { font-size:16px; margin:0; }
  button { font:inherit; cursor:pointer; transition:transform .12s ease, background .15s ease, border-color .15s ease, opacity .15s ease; }
  button:active { transform:scale(.96); }
  .btn-ghost { background:none; border:1px solid var(--line); color:var(--fg); padding:7px 12px; border-radius:8px; }
  .btn-ghost:hover { border-color:var(--accent); color:var(--accent); }
  .btn-primary { background:linear-gradient(180deg,var(--accent),var(--accent2)); color:#04263a; border:none;
                 padding:9px 16px; border-radius:8px; font-weight:600; box-shadow:0 2px 8px rgba(56,189,248,.25); }
  .btn-primary:hover { filter:brightness(1.06); }
  main { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; max-width:1160px; width:100%; margin:0 auto; padding:16px 20px 0; }
  .toolbar { flex:0 0 auto; display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; }
  .toolbar .left { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  input, select, textarea { width:100%; background:var(--bg); border:1px solid var(--line); color:var(--fg);
          border-radius:8px; padding:8px 10px; font:inherit; transition:border-color .15s ease, box-shadow .15s ease; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(56,189,248,.15); }
  #search { width:280px; }
  /* Vùng cuộn nội dung */
  .list-wrap { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:auto; border:1px solid var(--line);
               border-radius:12px; background:var(--card); scroll-behavior:smooth; }
  table { width:100%; border-collapse:collapse; }
  thead th { position:sticky; top:0; z-index:2; background:#243449; color:var(--muted);
             text-align:left; padding:11px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em;
             cursor:pointer; user-select:none; white-space:nowrap; border-bottom:1px solid var(--line); }
  thead th.sorted { color:var(--accent); }
  thead th.sorted::after { content:" ↓"; } thead th.sorted.asc::after { content:" ↑"; }
  tbody td { padding:10px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:top; }
  tbody tr { animation:rowin .28s ease both; }
  tbody tr:hover { background:rgba(56,189,248,.06); }
  @keyframes rowin { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  code { font-family:ui-monospace,Menlo,monospace; }
  .pill { display:inline-block; padding:2px 9px; border-radius:999px; font-size:12px; font-weight:600; }
  .pill.valid { background:rgba(34,197,94,.15); color:var(--ok); }
  .pill.expired { background:rgba(239,68,68,.15); color:var(--bad); }
  .pill.revoked { background:rgba(148,163,184,.15); color:var(--muted); }
  .pill.pending { background:rgba(245,158,11,.15); color:var(--warn); }
  .muted { color:var(--muted); }
  .err { color:var(--bad); margin:8px 0; min-height:18px; }
  .actions button { margin-right:6px; }
  #sentinel { padding:16px; text-align:center; color:var(--muted); font-size:13px; }
  .spinner { display:inline-block; width:18px; height:18px; border:2px solid var(--line);
             border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; vertical-align:middle; }
  @keyframes spin { to { transform:rotate(360deg); } }
  #login { max-width:380px; margin:80px auto; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; }
  .hidden { display:none !important; }
  /* Modal */
  dialog { background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:14px;
           padding:22px; max-width:600px; width:92%; box-shadow:0 20px 60px rgba(0,0,0,.5); }
  dialog[open] { animation:dlgin .2s ease; }
  @keyframes dlgin { from { opacity:0; transform:translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
  dialog::backdrop { background:rgba(2,6,23,.62); backdrop-filter:blur(2px); }
  dialog h2 { margin:0 0 14px; font-size:16px; }
  label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
  .row-end { display:flex; gap:10px; justify-content:flex-end; margin-top:16px; }
  .fld { margin-top:12px; }
</style>
</head>
<body>
<div id="login">
  <h2 style="margin-top:0">Đăng nhập quản trị</h2>
  <label>Admin token</label>
  <input id="token" type="password" placeholder="x-admin-token" autocomplete="current-password">
  <div class="err" id="loginErr"></div>
  <button class="btn-primary" id="loginBtn" style="width:100%">Đăng nhập</button>
</div>

<header class="hidden" id="hdr">
  <h1>WCode — Quản lý license</h1>
  <button class="btn-ghost" id="logout">Đăng xuất</button>
</header>
<main class="hidden" id="app">
  <div class="toolbar">
    <div class="left">
      <input id="search" placeholder="Tìm theo tên, liên hệ, key...">
      <button class="btn-ghost" id="refresh">Làm mới</button>
    </div>
    <button class="btn-primary" id="openCreate">＋ Tạo license</button>
  </div>
  <div class="list-wrap" id="listWrap">
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
    <div id="sentinel"></div>
  </div>
</main>

<dialog id="createDlg">
  <h2>Tạo license mới</h2>
  <div class="grid">
    <div><label>Tên khách *</label><input id="c_name" placeholder="Ivan Petrov"></div>
    <div><label>Liên hệ</label><input id="c_contact" placeholder="@telegram / email"></div>
    <div><label>Số máy tối đa</label><input id="c_devices" type="number" min="1" value="3"></div>
    <div><label>Gói</label><input id="c_plan" value="standard"></div>
    <div><label>Ngày bắt đầu</label><input id="c_start" type="date"></div>
    <div><label>Ngày kết thúc *</label><input id="c_end" type="date"></div>
  </div>
  <div class="fld"><label>Ghi chú</label><input id="c_notes" placeholder="chuyển Sber 12/07..."></div>
  <div class="err" id="createErr"></div>
  <div class="row-end">
    <button class="btn-ghost" id="createCancel">Đóng</button>
    <button class="btn-primary" id="createBtn">Tạo license</button>
  </div>
</dialog>

<dialog id="editDlg">
  <h2 id="editTitle">Sửa license</h2>
  <div class="grid">
    <div><label>Tên khách</label><input id="e_name"></div>
    <div><label>Liên hệ</label><input id="e_contact"></div>
    <div><label>Số máy tối đa</label><input id="e_devices" type="number" min="1"></div>
    <div><label>Gói</label><input id="e_plan"></div>
    <div><label>Ngày bắt đầu</label><input id="e_start" type="date"></div>
    <div><label>Ngày kết thúc</label><input id="e_end" type="date"></div>
  </div>
  <div class="fld"><label>Ghi chú</label><input id="e_notes"></div>
  <div id="e_devicesList" class="muted fld"></div>
  <div class="err" id="editErr"></div>
  <div class="row-end">
    <button class="btn-ghost" id="editClose">Đóng</button>
    <button class="btn-primary" id="editSave">Lưu</button>
  </div>
</dialog>

<script>
const $ = (id) => document.getElementById(id);
let TOKEN = sessionStorage.getItem('wc_admin_token') || '';
let sortBy = 'created_at', sortOrder = 'desc', editingKey = null;
const LIMIT = 20;
let offset = 0, hasMore = true, loading = false;

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type':'application/json', 'x-admin-token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || ('HTTP ' + res.status)); e.status = res.status; throw e; }
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
    await api('GET', '/api/v1/admin/licenses?limit=1');
    sessionStorage.setItem('wc_admin_token', TOKEN);
    $('login').classList.add('hidden'); $('hdr').classList.remove('hidden'); $('app').classList.remove('hidden');
    reset();
  } catch (e) { $('loginErr').textContent = 'Token sai hoặc server lỗi: ' + e.message; }
}
function logout() { sessionStorage.removeItem('wc_admin_token'); TOKEN=''; location.reload(); }

function reset() {
  offset = 0; hasMore = true; loading = false;
  $('rows').innerHTML = '';
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === sortBy);
    th.classList.toggle('asc', th.dataset.sort === sortBy && sortOrder === 'asc');
  });
  loadMore();
}

async function loadMore() {
  if (loading || !hasMore) return;
  loading = true;
  $('sentinel').innerHTML = '<span class="spinner"></span>';
  try {
    const q = encodeURIComponent($('search').value.trim());
    const data = await api('GET', '/api/v1/admin/licenses?q=' + q + '&sort=' + sortBy + '&order=' + sortOrder + '&offset=' + offset + '&limit=' + LIMIT);
    appendRows(data.licenses);
    offset += data.licenses.length;
    hasMore = data.hasMore;
    if ($('rows').children.length === 0) $('sentinel').textContent = 'Chưa có license nào.';
    else if (!hasMore) $('sentinel').textContent = '— hết —';
    else $('sentinel').innerHTML = '';
    loading = false;
    // Nếu chưa đầy khung nhìn mà vẫn còn dữ liệu, tải tiếp
    const w = $('listWrap');
    if (hasMore && w.scrollHeight <= w.clientHeight + 40) loadMore();
  } catch (e) {
    loading = false;
    if (e.status === 401) return logout();
    $('sentinel').textContent = 'Lỗi tải: ' + e.message;
  }
}

function appendRows(list) {
  const html = list.map((l) => \`<tr>
    <td>\${esc(l.customerName)}<div class="muted">\${esc(l.customerContact||'')}</div></td>
    <td><code>\${esc(l.licenseKey)}</code></td>
    <td>\${l.deviceCount}/\${l.maxDevices}</td>
    <td>\${fmtDate(l.startsAt)}</td>
    <td>\${fmtDate(l.expiresAt)}</td>
    <td><span class="pill \${l.status}">\${l.status}</span></td>
    <td class="muted">\${fmtDate(l.createdAt)}</td>
    <td class="actions" style="white-space:nowrap">
      <button class="btn-ghost" data-copy="\${esc(l.licenseKey)}">Copy</button>
      <button class="btn-ghost" data-edit="\${esc(l.licenseKey)}">Sửa</button>
      <button class="btn-ghost" data-revoke="\${esc(l.licenseKey)}">Thu hồi</button>
    </td></tr>\`).join('');
  $('rows').insertAdjacentHTML('beforeend', html);
}

$('listWrap').addEventListener('scroll', () => {
  const w = $('listWrap');
  if (w.scrollTop + w.clientHeight >= w.scrollHeight - 120) loadMore();
});

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
      ' <button class="btn-ghost" data-rmdev="'+esc(d.fingerprint)+'">gỡ</button>').join(', ') || '<span class="muted">chưa có</span>');
  $('editDlg').showModal();
}

document.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (t.dataset.copy) { navigator.clipboard.writeText(t.dataset.copy); const o=t.textContent; t.textContent='Đã copy'; setTimeout(()=>t.textContent=o,1200); }
  if (t.dataset.edit) openEdit(t.dataset.edit).catch((e)=>alert(e.message));
  if (t.dataset.revoke) { if (confirm('Thu hồi license ' + t.dataset.revoke + '?')) { await api('POST','/api/v1/admin/licenses/'+encodeURIComponent(t.dataset.revoke)+'/revoke'); reset(); } }
  if (t.dataset.rmdev && editingKey) { await api('DELETE','/api/v1/admin/licenses/'+encodeURIComponent(editingKey)+'/devices/'+encodeURIComponent(t.dataset.rmdev)); openEdit(editingKey); }
});

$('loginBtn').onclick = login;
$('token').onkeydown = (e) => { if (e.key === 'Enter') login(); };
$('logout').onclick = logout;
$('refresh').onclick = reset;
let searchTimer; $('search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(reset, 250); };
document.querySelectorAll('th[data-sort]').forEach((th) => th.onclick = () => {
  if (sortBy === th.dataset.sort) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  else { sortBy = th.dataset.sort; sortOrder = 'asc'; }
  reset();
});

// Create modal
$('openCreate').onclick = () => { $('createErr').textContent=''; $('createDlg').showModal(); };
$('createCancel').onclick = () => $('createDlg').close();
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
    $('createDlg').close();
    reset();
    alert('Đã tạo license — gửi key cho khách:\\n\\n' + lic.licenseKey);
  } catch (e) { $('createErr').textContent = e.message; }
};

// Edit modal
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
    $('editDlg').close(); reset();
  } catch (e) { $('editErr').textContent = e.message; }
};

if (TOKEN) { $('login').classList.add('hidden'); $('hdr').classList.remove('hidden'); $('app').classList.remove('hidden'); reset(); }
</script>
</body>
</html>`;
}
