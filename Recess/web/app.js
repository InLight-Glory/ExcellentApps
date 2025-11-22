// Cleaned up app.js with admin token support
const qs = (s, el=document) => el.querySelector(s);
const $feedList = qs('#feedList');

const API_BASE = '/api';

document.getElementById('btn-feed').addEventListener('click', () => show('feed'));
document.getElementById('btn-upload').addEventListener('click', () => show('upload'));
document.getElementById('btn-parent').addEventListener('click', () => showParent());
document.getElementById('btn-admin').addEventListener('click', () => showAdmin());

function show(id){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  qs('#'+id).classList.remove('hidden');
  if (id === 'feed') loadFeed();
}

function getAdminToken(){
  return localStorage.getItem('recess_admin_token') || null;
}

async function promptForAdminToken(){
  let token = getAdminToken();
  if (!token) {
    token = prompt('Enter admin token (ask the server owner).\nYou can find it in server/config.json (change it there).');
    if (token) localStorage.setItem('recess_admin_token', token);
  }
  return token;
}

async function showAdmin(){
  const token = await promptForAdminToken();
  if (!token) return alert('Admin token required to enter admin view.');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  qs('#admin').classList.remove('hidden');
  loadPending();
}

function getParentToken(){
  return localStorage.getItem('recess_parent_jwt') || null;
}

async function promptForParentLogin(){
  // prompt for email/password and call login endpoint
  const email = prompt('Parent email: (e.g. parent@local)');
  if (!email) return null;
  const password = prompt('Parent password:');
  if (!password) return null;
  try {
    const res = await fetch(`${API_BASE}/parents/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    if (res.status !== 200) {
      alert('Login failed');
      return null;
    }
    const body = await res.json();
    if (body.token) {
      localStorage.setItem('recess_parent_jwt', body.token);
      return body.token;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

async function showParent(){
  let token = getParentToken();
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  qs('#parent').classList.remove('hidden');
  // if we already have a JWT, hide the login form and load pending posts
  token = getParentToken();
  const loginForm = qs('#parentLoginForm');
  const loginMsg = qs('#parentLoginMsg');
  if (token) {
    if (loginForm) loginForm.style.display = 'none';
    if (loginMsg) loginMsg.textContent = '';
    loadParentPending();
  } else {
    // show the login form
    if (loginForm) loginForm.style.display = '';
    if (loginMsg) loginMsg.textContent = '';
    qs('#parentPendingList').innerHTML = '';
  }
}

// Parent login form handling (in-page)
const parentLoginForm = qs('#parentLoginForm');
if (parentLoginForm) {
  parentLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = qs('#parentEmail').value;
    const password = qs('#parentPassword').value;
    const msg = qs('#parentLoginMsg');
    msg.textContent = 'Logging in...';
    try {
      const res = await fetch(`${API_BASE}/parents/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      if (res.status !== 200) {
        const body = await res.json().catch(()=>({}));
        msg.textContent = body.error || 'Login failed';
        return;
      }
      const body = await res.json();
      if (body.token) {
        localStorage.setItem('recess_parent_jwt', body.token);
        msg.textContent = 'Logged in';
        parentLoginForm.style.display = 'none';
        loadParentPending();
      } else {
        msg.textContent = 'Login did not return a token';
      }
    } catch (err) {
      console.error(err);
      msg.textContent = 'Login error';
    }
  });
}

const parentLogoutBtn = qs('#parentLogout');
if (parentLogoutBtn) parentLogoutBtn.addEventListener('click', () => { localStorage.removeItem('recess_parent_jwt'); alert('Parent token cleared'); parentLoginForm.style.display = ''; qs('#parentPendingList').innerHTML = ''; });

// Feed
async function loadFeed(){
  const status = qs('#feedStatus'); if (status) status.textContent = 'Loading...';
  const res = await fetch(`${API_BASE}/posts`);
  const posts = await res.json();
  const list = $feedList || document.createElement('div');
  list.innerHTML = '';
  for (const p of posts){
    const el = renderPost(p);
    list.appendChild(el);
  }
  if ($feedList) $feedList.replaceWith(list);
  // ensure id remains
  if (!list.id) list.id = 'feedList';
  if (status) status.textContent = '';
}

function renderPost(p){
  const card = document.createElement('div');
  card.className = 'card';

  // media
  if (p.mediaType === 'video' || (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i))) {
    const v = document.createElement('video'); v.controls = true; v.src = p.mediaUrl; card.appendChild(v);
  } else if (p.mediaUrl) {
    const img = document.createElement('img'); img.src = p.mediaUrl; card.appendChild(img);
  }

  const title = document.createElement('h3'); title.textContent = p.title || 'Untitled';
  card.appendChild(title);

  const meta = document.createElement('div'); meta.className = 'meta';
  const left = document.createElement('div'); left.textContent = (p.userEmail || p.userId) ? `by ${p.userEmail || p.userId}` : '';
  const right = document.createElement('div'); right.textContent = p.category || '';
  meta.appendChild(left); meta.appendChild(right);
  card.appendChild(meta);

  if (p.description) {
    const desc = document.createElement('p'); desc.textContent = p.description; card.appendChild(desc);
  }

  const actions = document.createElement('div'); actions.className = 'actions';
  const like = document.createElement('button'); like.className='btn'; like.textContent = `Like (${p.likesCount||0})`;
  like.onclick = async () => { await fetch(`${API_BASE}/posts/${p.id}/like`, { method:'POST' }); loadFeed(); };
  actions.appendChild(like);

  // status badge for dev clarity
  const status = document.createElement('div'); status.className = 'muted small'; status.style.marginLeft='8px'; status.textContent = p.status || '';
  actions.appendChild(status);

  card.appendChild(actions);
  return card;
}

// Upload
const uploadForm = qs('#uploadForm');
if (uploadForm) {
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    // childEmail will be present if the input has a name
    qs('#uploadResult').textContent = 'Uploading...';
    const res = await fetch('/api/posts', { method: 'POST', body: fd });
    const data = await res.json().catch(()=>({}));
    if (res.ok) qs('#uploadResult').textContent = `Uploaded (id=${data.id}). Status: ${data.status}`;
    else qs('#uploadResult').textContent = `Error: ${data.error || JSON.stringify(data)}`;
    form.reset();
  });

  const uploadReset = qs('#uploadReset');
  if (uploadReset) uploadReset.addEventListener('click', () => { uploadForm.reset(); qs('#uploadResult').textContent=''; });
}

// Admin: pending
async function loadPending(){
  const token = getAdminToken();
  let res = await fetch(`${API_BASE}/moderation/pending`, { headers: token ? { 'x-admin-token': token } : {} });
  if (res.status === 401) {
    // clear stored token and prompt once for a new one, then retry once
    localStorage.removeItem('recess_admin_token');
    const newToken = await promptForAdminToken();
    if (!newToken) return alert('Admin token required to view pending posts.');
    res = await fetch(`${API_BASE}/moderation/pending`, { headers: { 'x-admin-token': newToken } });
    if (res.status === 401) return alert('Invalid admin token. Please contact the server owner.');
  }
  const posts = await res.json();
  const box = qs('#pendingList'); box.innerHTML = '';
  if (!posts.length) { box.textContent = 'No pending posts'; return; }
  posts.forEach(p => {
    const el = document.createElement('div'); el.className='post';
    el.innerHTML = `<h3>${p.title||'Untitled'}</h3>`;
    if (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) el.innerHTML += `<video controls src="${p.mediaUrl}"></video>`;
    else if (p.mediaUrl) el.innerHTML += `<img src="${p.mediaUrl}"/>`;
    const actions = document.createElement('div'); actions.className='admin-actions';
    const a = document.createElement('button'); a.textContent='Approve'; a.onclick = async () => { await adminAction(p.id, 'approve'); loadPending(); };
    const r = document.createElement('button'); r.textContent='Reject'; r.onclick = async () => { await adminAction(p.id, 'reject'); loadPending(); };
    const clear = document.createElement('button'); clear.textContent='Clear token'; clear.onclick = () => { localStorage.removeItem('recess_admin_token'); alert('Token cleared'); };
    actions.appendChild(a); actions.appendChild(r); actions.appendChild(clear); el.appendChild(actions);
    box.appendChild(el);
  });
}

async function adminAction(id, action){
  const token = getAdminToken();
  if (!token) return alert('Admin token missing');
  const headers = { 'x-admin-token': token };
  const url = `${API_BASE}/moderation/${id}/${action}`;
  const opts = { method: 'POST', headers };
  if (action === 'reject') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify({ reason: 'Rejected via admin UI' }); }
  let res = await fetch(url, opts);
  if (res.status === 401) {
    // prompt for new token and retry once
    localStorage.removeItem('recess_admin_token');
    const newToken = await promptForAdminToken();
    if (!newToken) return alert('Admin token required');
    opts.headers['x-admin-token'] = newToken;
    res = await fetch(url, opts);
    if (res.status === 401) { alert('Invalid admin token'); localStorage.removeItem('recess_admin_token'); }
  }
}

// Parent: pending posts for linked children
async function loadParentPending(){
  let token = getParentToken();
  let res = await fetch(`${API_BASE}/parents/me/pending`, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
  if (res.status === 401) {
    // clear stored token and prompt once for a new login, then retry once
    localStorage.removeItem('recess_parent_jwt');
    token = await promptForParentLogin();
    if (!token) return alert('Parent login required to view pending posts.');
    res = await fetch(`${API_BASE}/parents/me/pending`, { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status === 401) return alert('Invalid parent credentials. Please contact the server owner.');
  }
  const posts = await res.json();
  const box = qs('#parentPendingList'); box.innerHTML = '';
  if (!posts.length) { box.textContent = 'No pending posts for your children'; return; }
  posts.forEach(p => {
    const el = document.createElement('div'); el.className='post';
    el.innerHTML = `<h3>${p.title||'Untitled'}</h3>`;
    if (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) el.innerHTML += `<video controls src="${p.mediaUrl}"></video>`;
    else if (p.mediaUrl) el.innerHTML += `<img src="${p.mediaUrl}"/>`;
    const actions = document.createElement('div'); actions.className='admin-actions';
    const a = document.createElement('button'); a.textContent='Approve'; a.onclick = async () => { await parentAction(p.id, 'approve'); loadParentPending(); };
    const r = document.createElement('button'); r.textContent='Reject'; r.onclick = async () => { await parentAction(p.id, 'reject'); loadParentPending(); };
  const clear = document.createElement('button'); clear.textContent='Clear token'; clear.onclick = () => { localStorage.removeItem('recess_parent_jwt'); alert('Token cleared'); };
    actions.appendChild(a); actions.appendChild(r); actions.appendChild(clear); el.appendChild(actions);
    box.appendChild(el);
  });
}

async function parentAction(id, action){
  let token = getParentToken();
  if (!token) return alert('Parent login missing');
  const headers = { 'Authorization': 'Bearer ' + token };
  const url = `${API_BASE}/parents/me/posts/${id}/${action}`;
  const opts = { method: 'POST', headers };
  if (action === 'reject') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify({ reason: 'Rejected by parent' }); }
  let res = await fetch(url, opts);
  if (res.status === 401) {
    // prompt for new parent login and retry once
    localStorage.removeItem('recess_parent_jwt');
    token = await promptForParentLogin();
    if (!token) return alert('Parent login required');
    opts.headers['Authorization'] = 'Bearer ' + token;
    res = await fetch(url, opts);
    if (res.status === 401) { alert('Invalid parent credentials'); localStorage.removeItem('recess_parent_jwt'); }
  }
}

// initial view
show('feed');
