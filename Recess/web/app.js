// Cleaned up app.js with admin token support
const qs = (s, el=document) => el.querySelector(s);
const $feedList = qs('#feedList');

const API_BASE = '/api';

document.getElementById('btn-feed').addEventListener('click', () => show('feed'));
document.getElementById('btn-upload').addEventListener('click', () => show('upload'));
document.getElementById('btn-parent').addEventListener('click', () => showParent());
document.getElementById('btn-admin').addEventListener('click', () => showAdmin());
// User nav button
const btnUserNav = document.getElementById('btn-user');
if (btnUserNav) btnUserNav.addEventListener('click', () => show('user'));

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
  // in-page admin login: prefer stored token
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  qs('#admin').classList.remove('hidden');
  const token = getAdminToken();
  const adminForm = qs('#adminLoginForm');
  const adminMsg = qs('#adminLoginMsg');
  const adminTabs = qs('#adminTabs');
  if (token) {
    if (adminForm) adminForm.style.display = 'none';
    if (adminMsg) adminMsg.textContent = '';
    if (adminTabs) adminTabs.style.display = 'flex';
    showAdminTab('pending');
  } else {
    if (adminForm) adminForm.style.display = '';
    if (adminMsg) adminMsg.textContent = '';
    if (adminTabs) adminTabs.style.display = 'none';
    qs('#pendingList').innerHTML = '';
  }
}

// Admin in-page login handling
const adminLoginForm = qs('#adminLoginForm');
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const token = qs('#adminTokenInput').value;
    const msg = qs('#adminLoginMsg');
    const adminTabs = qs('#adminTabs');
    if (!token) { msg.textContent = 'Enter token'; return; }
    // send to server to set an HttpOnly cookie for admin session
    fetch(`${API_BASE}/admin/login`, { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token }) })
      .then(r => r.json())
      .then(b => {
        if (b && b.ok) {
          localStorage.setItem('recess_admin_token', token);
          msg.textContent = 'Saved';
          adminLoginForm.style.display = 'none';
          if (adminTabs) adminTabs.style.display = 'flex';
          showAdminTab('pending');
        } else {
          msg.textContent = b.error || 'Login failed';
        }
      }).catch(err => { console.error(err); msg.textContent = 'Login error'; });
  });
}
const adminLogoutBtn = qs('#adminLogout');
if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', async () => {
  try { await fetch(`${API_BASE}/admin/logout`, { method: 'POST', credentials: 'same-origin' }); } catch(e){}
  localStorage.removeItem('recess_admin_token');
  alert('Admin token cleared');
  if (adminLoginForm) adminLoginForm.style.display = '';
  qs('#pendingList').innerHTML = '';
});

// Reset demo posts button (admin-protected)
const resetDemoBtn = qs('#resetDemoBtn');
if (resetDemoBtn) resetDemoBtn.addEventListener('click', async () => {
  // rely on server cookie for admin auth; ensure credentials are sent
  resetDemoBtn.textContent = 'Resetting...';
  const res = await fetch(`${API_BASE}/admin/reset-demo`, { method: 'POST', credentials: 'same-origin' });
  const body = await res.json().catch(()=>({}));
  resetDemoBtn.textContent = 'Reset demo posts';
  if (res.status === 401) return alert('Not authorized. Please log in as admin via the Admin panel.');
  if (res.ok) { alert('Demo posts reset'); loadFeed(); } else alert('Reset failed: ' + (body.error || JSON.stringify(body)));
});

// Profile picture placeholder: store locally as data URL
const profilePic = qs('#profilePic');
const profilePicInput = qs('#profilePicInput');
function loadProfilePic(){
  const data = localStorage.getItem('recess_profile_pic');
  if (data && profilePic) profilePic.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:999px"/>`;
}
if (profilePic) {
  profilePic.addEventListener('click', () => { if (profilePicInput) profilePicInput.click(); });
}
if (profilePicInput) {
  profilePicInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return alert('Please select an image');
    const reader = new FileReader();
    reader.onload = () => { localStorage.setItem('recess_profile_pic', reader.result); loadProfilePic(); };
    reader.readAsDataURL(f);
  });
}
loadProfilePic();

function getParentToken(){
  return localStorage.getItem('recess_parent_jwt') || null;
}

// Session / user helpers
async function loadSession() {
  try {
    const res = await fetch(`${API_BASE}/session`, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const body = await res.json();
    return body;
  } catch (e) { return null; }
}

function renderUserInfo(info) {
  const box = qs('#userInfo');
  if (!box) return;
  if (!info) {
    box.innerHTML = '<div class="muted">Not signed in</div>';
    return;
  }
  box.innerHTML = `<div>Signed in as <strong>${info.displayName||info.role}</strong> (${info.role})</div><div style="margin-top:8px"><button id="userDoLogout" class="btn">Logout</button></div>`;
  const btn = qs('#userDoLogout');
  if (btn) btn.addEventListener('click', async () => {
    try { await fetch(`${API_BASE}/users/logout`, { method: 'POST', credentials: 'same-origin' }); } catch(e){}
    localStorage.removeItem('recess_user_jwt');
    renderUserInfo(null);
    alert('Signed out');
  });
}

async function promptForParentLogin(){
  // prompt for email/password and call login endpoint
  const email = prompt('Parent email: (e.g. parent@local)');
  if (!email) return null;
  const password = prompt('Parent password:');
  if (!password) return null;
  try {
    const res = await fetch(`${API_BASE}/parents/login`, { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
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
      const res = await fetch(`${API_BASE}/parents/login`, { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      if (res.status !== 200) {
        const body = await res.json().catch(()=>({}));
        msg.textContent = body.error || 'Login failed';
        return;
      }
      const body = await res.json();
      if (body.token) {
        // store token locally as fallback, server also sets HttpOnly cookie
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

// User login handling (in-page)
const userLoginForm = qs('#userLoginForm');
if (userLoginForm) {
  userLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = qs('#userEmail').value;
    const password = qs('#userPassword').value;
    const msg = qs('#userMsg');
    msg.textContent = 'Logging in...';
    try {
      const res = await fetch(`${API_BASE}/users/login`, { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) { msg.textContent = body.error || 'Login failed'; return; }
      if (body.token) localStorage.setItem('recess_user_jwt', body.token);
      msg.textContent = 'Logged in';
      const session = await loadSession();
      renderUserInfo(session);
    } catch (err) { console.error(err); msg.textContent = 'Login error'; }
  });
}

const userLogoutBtn = qs('#userLogout');
if (userLogoutBtn) userLogoutBtn.addEventListener('click', async () => {
  try { await fetch(`${API_BASE}/users/logout`, { method: 'POST', credentials: 'same-origin' }); } catch(e){}
  localStorage.removeItem('recess_user_jwt');
  renderUserInfo(null);
  alert('Signed out');
});

// Try to render session/user info on load into the new panel
loadSession().then(s => { if (s) renderUserInfo(s); });

// If the app is opened with ?demoEmail=..., open the User panel and prefill the email
// so the tester can enter the demo password (demo123) manually instead of being auto-signed in.
(function handleDemoPrefill() {
  try {
    const params = new URLSearchParams(window.location.search);
    const demoEmail = params.get('demoEmail');
    if (!demoEmail) return;
    // Show the user panel and prefill the login form
    show('user');
    const emailInput = qs('#userEmail');
    const pwdInput = qs('#userPassword');
    const msg = qs('#userMsg');
    if (emailInput) emailInput.value = demoEmail;
    if (msg) msg.textContent = 'Enter password (demo123)';
    if (pwdInput) {
      pwdInput.focus();
    }
    // Remove the param from the URL so repeated reload doesn't re-trigger
    const cleanPath = window.location.pathname + window.location.hash;
    history.replaceState(null, '', cleanPath);
  } catch (e) { /* ignore */ }
})();

const parentLogoutBtn = qs('#parentLogout');
if (parentLogoutBtn) parentLogoutBtn.addEventListener('click', async () => {
  try { await fetch(`${API_BASE}/parents/logout`, { method: 'POST', credentials: 'same-origin' }); } catch(e){}
  localStorage.removeItem('recess_parent_jwt');
  alert('Parent token cleared');
  if (parentLoginForm) parentLoginForm.style.display = '';
  qs('#parentPendingList').innerHTML = '';
});

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

  // media (support YouTube embeds, hosted video, or image)
  const isYouTube = (url) => {
    if (!url) return false;
    return /(?:youtube.com\/watch\?v=|youtu.be\/)/i.test(url);
  };
  const toYouTubeEmbed = (url) => {
    try {
      const u = new URL(url);
      let id = null;
      if (u.hostname.includes('youtu.be')) {
        id = u.pathname.slice(1);
      } else if (u.hostname.includes('youtube.com')) {
        id = u.searchParams.get('v');
      }
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    } catch (e) {
      return null;
    }
  };

  if (p.mediaUrl && isYouTube(p.mediaUrl)) {
    const embed = toYouTubeEmbed(p.mediaUrl);
    if (embed) {
      const iframe = document.createElement('iframe');
      iframe.width = '100%'; iframe.height = '220'; iframe.src = embed; iframe.frameBorder = '0'; iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'; iframe.allowFullscreen = true; card.appendChild(iframe);
    }
  } else if (p.mediaType === 'video' || (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i))) {
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

  // Report button with category selection
  const report = document.createElement('button'); report.className='btn'; report.textContent = 'Report';
  report.onclick = () => showReportDialog(p.id, p.title);
  actions.appendChild(report);

  // status badge for dev clarity
  const status = document.createElement('div'); status.className = 'muted small'; status.style.marginLeft='8px'; status.textContent = p.status || '';
  actions.appendChild(status);

  card.appendChild(actions);
  return card;
}

// Report dialog for posts
async function showReportDialog(postId, postTitle) {
  // Fetch categories if not cached
  let categories = ['inappropriate', 'suggestive', 'inaccurate', 'misleading', 'spam', 'harassment', 'dangerous', 'copyright', 'other'];
  try {
    const res = await fetch(`${API_BASE}/moderation/report-categories`);
    if (res.ok) categories = await res.json();
  } catch (e) { /* use default */ }
  
  const categoryLabels = {
    'inappropriate': 'Inappropriate content',
    'suggestive': 'Suggestive/adult content',
    'inaccurate': 'Inaccurate information',
    'misleading': 'Misleading content',
    'spam': 'Spam or promotional',
    'harassment': 'Harassment or bullying',
    'dangerous': 'Dangerous activities',
    'copyright': 'Copyright violation',
    'other': 'Other'
  };
  
  const categoryList = categories.map(c => `${c}: ${categoryLabels[c] || c}`).join('\n');
  const reasonCategory = prompt(`Report "${postTitle}"\n\nSelect a reason category:\n${categoryList}\n\nEnter category name:`);
  
  if (!reasonCategory) return;
  
  const validCategory = categories.includes(reasonCategory.toLowerCase()) ? reasonCategory.toLowerCase() : 'other';
  const reason = prompt('Please describe the issue (optional):') || '';
  
  try {
    const res = await fetch(`${API_BASE}/posts/${postId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasonCategory: validCategory, reason })
    });
    
    if (res.ok) {
      alert('Thank you for your report. Our staff will review it.');
      loadFeed();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('Report failed: ' + (err.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Report failed:', e);
    alert('Report failed');
  }
}

// Upload
const uploadForm = qs('#uploadForm');
if (uploadForm) {
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    // If media URL provided and no file selected, ensure it's sent
    const mediaUrlInput = qs('#uploadMediaUrl');
    const fileInput = qs('#uploadMediaFile');
    if (mediaUrlInput && mediaUrlInput.value) {
      fd.set('mediaUrl', mediaUrlInput.value);
    }
    qs('#uploadResult').textContent = 'Uploading...';
    const res = await fetch('/api/posts', { method: 'POST', body: fd });
    const data = await res.json().catch(()=>({}));
    if (res.ok) qs('#uploadResult').textContent = `Uploaded (id=${data.id}). Status: ${data.status}`;
    else qs('#uploadResult').textContent = `Error: ${data.error || JSON.stringify(data)}`;
    form.reset();
    // clear preview
    const prev = qs('#uploadPreview'); if (prev) prev.innerHTML = '';
  });

  const uploadReset = qs('#uploadReset');
  if (uploadReset) uploadReset.addEventListener('click', () => { uploadForm.reset(); qs('#uploadResult').textContent=''; });

  // Client-side preview for selected file or media URL
  const mediaFileInput = qs('#uploadMediaFile');
  const mediaUrlInput = qs('#uploadMediaUrl');
  const uploadPreview = qs('#uploadPreview');
  function clearPreview(){ if (uploadPreview) uploadPreview.innerHTML = ''; }
  if (mediaFileInput) {
    mediaFileInput.addEventListener('change', (e) => {
      clearPreview();
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => { if (uploadPreview) uploadPreview.innerHTML = `<img src="${reader.result}" style="max-width:100%;border-radius:8px">`; };
        reader.readAsDataURL(f);
      } else if (f.type.startsWith('video/')) {
        const url = URL.createObjectURL(f);
        if (uploadPreview) uploadPreview.innerHTML = `<video controls src="${url}" style="max-width:100%;border-radius:8px"></video>`;
      }
    });
  }
  if (mediaUrlInput) {
    mediaUrlInput.addEventListener('input', (e) => {
      clearPreview();
      const v = e.target.value.trim();
      if (!v) return;
      // YouTube embed
      if (/(?:youtube.com\/watch\?v=|youtu.be\/)/i.test(v)) {
        try {
          const url = new URL(v);
          const id = url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
          if (id && uploadPreview) uploadPreview.innerHTML = `<iframe width="100%" height="180" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } catch(e) {}
      } else if (v.match(/\.(jpg|jpeg|png|gif)$/i)) {
        if (uploadPreview) uploadPreview.innerHTML = `<img src="${v}" style="max-width:100%;border-radius:8px">`;
      }
    });
  }
}

// Admin: pending
async function loadPending(){
  // Use cookie-based auth by sending credentials; server will detect recess_admin_token cookie
  let res = await fetch(`${API_BASE}/moderation/pending`, { credentials: 'same-origin' });
  if (res.status === 401) {
    // Server did not detect an admin session
    return alert('Admin session required. Please log in via the Admin panel.');
  }
  const posts = await res.json();
  const box = qs('#pendingList'); box.innerHTML = '';
  if (!posts.length) { box.textContent = 'No pending posts'; return; }
  posts.forEach(p => {
    const el = document.createElement('div'); el.className='post';
    el.innerHTML = `<h3>${p.title||'Untitled'}</h3>`;
    if (p.mediaUrl && /(?:youtube.com\/watch\?v=|youtu.be\/)/i.test(p.mediaUrl)) {
      // embed
      const embed = (function(u){ try { const url = new URL(u); const id = url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v'); return id ? `https://www.youtube.com/embed/${id}` : null; } catch(e){ return null; } })(p.mediaUrl);
      if (embed) el.innerHTML += `<iframe width="100%" height="220" src="${embed}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else if (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) el.innerHTML += `<video controls src="${p.mediaUrl}"></video>`;
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
  // Rely on server cookie to authorize admin actions. Send credentials so cookie is included.
  const url = `${API_BASE}/moderation/${id}/${action}`;
  const opts = { method: 'POST', credentials: 'same-origin', headers: {} };
  if (action === 'reject') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify({ reason: 'Rejected via admin UI' }); }
  const res = await fetch(url, opts);
  if (res.status === 401) return alert('Admin session missing or expired. Please log in via the Admin panel.');
}

// ========================================
// Staff Moderation UI for Flagged Posts
// ========================================

// Admin tab switching
const tabPending = qs('#tabPending');
const tabReports = qs('#tabReports');
const tabStats = qs('#tabStats');
const pendingTab = qs('#pendingTab');
const reportsTab = qs('#reportsTab');
const statsTab = qs('#statsTab');
const adminTabs = qs('#adminTabs');

function showAdminTab(tabName) {
  // Hide all tab contents
  [pendingTab, reportsTab, statsTab].forEach(t => { if (t) t.classList.add('hidden'); });
  // Remove active from all tab buttons
  [tabPending, tabReports, tabStats].forEach(b => { if (b) b.classList.remove('active'); });
  
  if (tabName === 'pending') {
    if (pendingTab) pendingTab.classList.remove('hidden');
    if (tabPending) tabPending.classList.add('active');
    loadPending();
  } else if (tabName === 'reports') {
    if (reportsTab) reportsTab.classList.remove('hidden');
    if (tabReports) tabReports.classList.add('active');
    loadReports();
  } else if (tabName === 'stats') {
    if (statsTab) statsTab.classList.remove('hidden');
    if (tabStats) tabStats.classList.add('active');
    loadModerationStats();
  }
}

if (tabPending) tabPending.addEventListener('click', () => showAdminTab('pending'));
if (tabReports) tabReports.addEventListener('click', () => showAdminTab('reports'));
if (tabStats) tabStats.addEventListener('click', () => showAdminTab('stats'));

// Load report categories into filter dropdown
async function loadReportCategories() {
  try {
    const res = await fetch(`${API_BASE}/moderation/report-categories`);
    const categories = await res.json();
    const filterCategory = qs('#filterCategory');
    if (filterCategory && Array.isArray(categories)) {
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        filterCategory.appendChild(opt);
      });
    }
  } catch (e) { console.error('Failed to load report categories:', e); }
}

// Load reports with filtering
async function loadReports() {
  const filterStatus = qs('#filterStatus');
  const filterCategory = qs('#filterCategory');
  const reportsList = qs('#reportsList');
  
  if (!reportsList) return;
  
  const params = new URLSearchParams();
  if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
  if (filterCategory && filterCategory.value) params.set('reasonCategory', filterCategory.value);
  
  reportsList.innerHTML = '<div class="muted">Loading reports...</div>';
  
  try {
    const res = await fetch(`${API_BASE}/moderation/reports?${params.toString()}`, { credentials: 'same-origin' });
    if (res.status === 401) {
      reportsList.innerHTML = '<div class="muted">Admin session required</div>';
      return;
    }
    const reports = await res.json();
    
    if (!reports.length) {
      reportsList.innerHTML = '<div class="muted">No reports found</div>';
      return;
    }
    
    reportsList.innerHTML = '';
    reports.forEach(r => {
      const card = renderReportCard(r);
      reportsList.appendChild(card);
    });
  } catch (e) {
    console.error('Failed to load reports:', e);
    reportsList.innerHTML = '<div class="muted">Error loading reports</div>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function renderReportCard(r) {
  const card = document.createElement('div');
  card.className = `report-card ${r.status || 'pending'}`;
  
  const categoryClass = r.reasonCategory || 'other';
  const categoryLabel = (r.reasonCategory || 'other').charAt(0).toUpperCase() + (r.reasonCategory || 'other').slice(1);
  const statusLabel = (r.status || 'pending').charAt(0).toUpperCase() + (r.status || 'pending').slice(1);
  const createdDate = r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Unknown';
  
  card.innerHTML = `
    <div class="report-header">
      <span class="report-category ${categoryClass}">${escapeHtml(categoryLabel)}</span>
      <span class="report-status">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="report-post-info">
      <h4>${escapeHtml(r.postTitle || 'Untitled Post')}</h4>
      <div class="muted small">Post ID: ${r.postId} • Post Status: ${escapeHtml(r.postStatus || 'unknown')}</div>
      ${r.postAuthorName ? `<div class="muted small">Author: ${escapeHtml(r.postAuthorName)}</div>` : ''}
    </div>
    ${r.reason ? `<div class="report-reason">"${escapeHtml(r.reason)}"</div>` : ''}
    <div class="muted small">
      Reported: ${escapeHtml(createdDate)}
      ${r.reporterName ? ` by ${escapeHtml(r.reporterName)}` : ''}
    </div>
    ${r.staffNotes ? `<div class="muted small" style="margin-top:4px">Staff notes: ${escapeHtml(r.staffNotes)}</div>` : ''}
  `;
  
  // Add action buttons for pending reports
  if (r.status === 'pending') {
    const actions = document.createElement('div');
    actions.className = 'report-actions';
    
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.onclick = () => handleReportAction(r.id, 'dismiss');
    
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn warning';
    reviewBtn.textContent = 'Mark Reviewed';
    reviewBtn.onclick = () => handleReportAction(r.id, 'reviewed');
    
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn danger';
    rejectBtn.textContent = 'Remove Post';
    rejectBtn.onclick = () => handleReportAction(r.id, 'action', 'reject');
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn primary';
    viewBtn.textContent = 'View Post';
    viewBtn.onclick = () => viewReportedPost(r);
    
    actions.appendChild(viewBtn);
    actions.appendChild(dismissBtn);
    actions.appendChild(reviewBtn);
    actions.appendChild(rejectBtn);
    card.appendChild(actions);
  }
  
  return card;
}

async function handleReportAction(reportId, actionType, postAction) {
  const staffNotes = prompt('Add staff notes (optional):') || '';
  
  try {
    let url, body;
    if (actionType === 'action') {
      url = `${API_BASE}/moderation/reports/${reportId}/action`;
      body = JSON.stringify({ action: postAction || 'reject', staffNotes });
    } else {
      url = `${API_BASE}/moderation/reports/${reportId}/${actionType}`;
      body = JSON.stringify({ staffNotes });
    }
    
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    if (res.status === 401) {
      alert('Admin session required');
      return;
    }
    
    const result = await res.json();
    if (res.ok) {
      loadReports();
      loadModerationStats();
    } else {
      alert('Action failed: ' + (result.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Report action failed:', e);
    alert('Action failed');
  }
}

function viewReportedPost(report) {
  // Open a simple modal or alert with post details (without exposing sensitive email info)
  const details = `
Post: ${report.postTitle || 'Untitled'}
Category: ${report.postCategory || 'N/A'}
Description: ${report.postDescription || 'N/A'}
Media: ${report.mediaUrl || 'N/A'}
Author: ${report.postAuthorName || 'Unknown'}

Report Reason: ${report.reasonCategory || 'other'}
Reporter Notes: ${report.reason || 'None'}
  `.trim();
  
  alert(details);
}

// Load moderation statistics
async function loadModerationStats() {
  const statsBox = qs('#moderationStats');
  if (!statsBox) return;
  
  statsBox.innerHTML = '<div class="muted">Loading stats...</div>';
  
  try {
    const res = await fetch(`${API_BASE}/moderation/stats`, { credentials: 'same-origin' });
    if (res.status === 401) {
      statsBox.innerHTML = '<div class="muted">Admin session required</div>';
      return;
    }
    const stats = await res.json();
    
    const pending = stats.byStatus?.pending || 0;
    const reviewed = stats.byStatus?.reviewed || 0;
    const dismissed = stats.byStatus?.dismissed || 0;
    const actioned = stats.byStatus?.actioned || 0;
    const escalatedPosts = stats.escalatedPosts || 0;
    
    statsBox.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${pending}</div>
          <div class="stat-label">Pending Reports</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${escalatedPosts}</div>
          <div class="stat-label">Escalated Posts</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${reviewed}</div>
          <div class="stat-label">Reviewed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${dismissed}</div>
          <div class="stat-label">Dismissed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${actioned}</div>
          <div class="stat-label">Actioned</div>
        </div>
      </div>
      <h4 style="margin-top:16px">Pending by Category</h4>
      <div class="stats-grid">
        ${Object.entries(stats.pendingByCategory || {}).map(([cat, count]) => `
          <div class="stat-card">
            <div class="stat-value">${count}</div>
            <div class="stat-label">${cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
          </div>
        `).join('') || '<div class="muted">No pending reports</div>'}
      </div>
    `;
  } catch (e) {
    console.error('Failed to load stats:', e);
    statsBox.innerHTML = '<div class="muted">Error loading stats</div>';
  }
}

// Filter change handlers
const filterStatus = qs('#filterStatus');
const filterCategory = qs('#filterCategory');
const refreshReports = qs('#refreshReports');

if (filterStatus) filterStatus.addEventListener('change', loadReports);
if (filterCategory) filterCategory.addEventListener('change', loadReports);
if (refreshReports) refreshReports.addEventListener('click', loadReports);

// Initialize categories on page load
loadReportCategories();

// ========================================
// End Staff Moderation UI
// ========================================

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
    if (p.mediaUrl && /(?:youtube.com\/watch\?v=|youtu.be\/)/i.test(p.mediaUrl)) {
      const embed = (function(u){ try { const url = new URL(u); const id = url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v'); return id ? `https://www.youtube.com/embed/${id}` : null; } catch(e){ return null; } })(p.mediaUrl);
      if (embed) el.innerHTML += `<iframe width="100%" height="220" src="${embed}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else if (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) el.innerHTML += `<video controls src="${p.mediaUrl}"></video>`;
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
// Landing / entry overlay logic
const ENTRY_KEY = 'recess_seen_entry';
const entryOverlay = qs('#entryOverlay');
const enterGuestBtn = qs('#enterGuestBtn');
const enterDemoBtn = qs('#enterDemoBtn');
const showParentLoginLink = qs('#showParentLogin');
const showAdminLoginLink = qs('#showAdminLogin');

function hideEntryOverlay() {
  if (entryOverlay) { entryOverlay.style.display = 'none'; entryOverlay.setAttribute('aria-hidden','true'); }
  localStorage.setItem(ENTRY_KEY, '1');
}

function showEntryOverlay() {
  if (entryOverlay) { entryOverlay.style.display = ''; entryOverlay.setAttribute('aria-hidden','false'); }
}

if (enterGuestBtn) enterGuestBtn.addEventListener('click', (e) => { e.preventDefault(); hideEntryOverlay(); show('feed'); });
if (enterDemoBtn) enterDemoBtn.addEventListener('click', (e) => { e.preventDefault(); localStorage.setItem('recess_demo_mode','1'); hideEntryOverlay(); show('feed'); });
if (showParentLoginLink) showParentLoginLink.addEventListener('click', (e) => { e.preventDefault(); hideEntryOverlay(); showParent(); });
if (showAdminLoginLink) showAdminLoginLink.addEventListener('click', (e) => { e.preventDefault(); hideEntryOverlay(); showAdmin(); });

// On load: if user hasn't seen entry overlay, show it. Otherwise proceed to feed.
if (!localStorage.getItem(ENTRY_KEY)) {
  showEntryOverlay();
} else {
  hideEntryOverlay();
  show('feed');
}

// Quick demo sign-in handlers (landing page buttons)
const quickKid5 = qs('#quickKid5');
const quickTeen14 = qs('#quickTeen14');
async function demoSignIn(email) {
  try {
    const res = await fetch(`${API_BASE}/users/demo-login`, { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
    if (!res.ok) {
      const b = await res.json().catch(()=>({}));
      return alert('Demo sign-in failed: ' + (b.error || res.status));
    }
    // server sets cookie, but also return token for local fallback
    const body = await res.json().catch(()=>({}));
    if (body && body.token) localStorage.setItem('recess_user_jwt', body.token);
    // open app
    window.location.href = '/index.html';
  } catch (e) { console.error(e); alert('Demo sign-in error'); }
}
if (quickKid5) quickKid5.addEventListener('click', (e) => { e.preventDefault(); demoSignIn('kid5@local'); });
if (quickTeen14) quickTeen14.addEventListener('click', (e) => { e.preventDefault(); demoSignIn('teen14@local'); });

// Swipe feed: full-screen single-item pager for touch and keyboard testing
const btnSwipe = qs('#btn-swipe');
const swipeView = qs('#swipeView');
const swipeContainer = qs('#swipeContainer');
const swipeClose = qs('#swipeClose');
const swipePagination = qs('#swipePagination');
const swipeMeta = qs('#swipeMeta');

let swipeFeedPage = 1;
let swipeFeedLimit = 5;
let swipePosts = [];
let swipeIndex = 0;

if (btnSwipe) btnSwipe.addEventListener('click', async () => { await enterSwipeMode(); });
if (swipeClose) swipeClose.addEventListener('click', () => exitSwipeMode());

async function fetchFeedPage(page = 1) {
  try {
    const res = await fetch(`${API_BASE}/feed?page=${page}&limit=${swipeFeedLimit}`);
    if (!res.ok) return { posts: [], hasMore: false };
    return await res.json();
  } catch (e) { return { posts: [], hasMore: false }; }
}

async function enterSwipeMode() {
  swipeFeedPage = 1; swipePosts = []; swipeIndex = 0;
  const data = await fetchFeedPage(swipeFeedPage);
  swipePosts = data.posts || [];
  swipeView.classList.remove('hidden'); swipeView.setAttribute('aria-hidden','false');
  renderSwipeItem(swipeIndex);
  updateSwipePagination();
  // attach key handlers
  window.addEventListener('keydown', swipeKeyHandler);
  // touch handlers
  initSwipeTouchHandlers();
}

function exitSwipeMode() {
  swipeView.classList.add('hidden'); swipeView.setAttribute('aria-hidden','true');
  swipeContainer.innerHTML = '';
  window.removeEventListener('keydown', swipeKeyHandler);
}

function updateSwipePagination(){
  swipePagination.textContent = `Item ${Math.min(swipeIndex+1, swipePosts.length)} of ${swipePosts.length} (page ${swipeFeedPage})`;
  swipeMeta.textContent = swipePosts[swipeIndex] ? `${swipePosts[swipeIndex].title || ''} • ${swipePosts[swipeIndex].category || ''}` : '';
}

function renderSwipeItem(index) {
  const p = swipePosts[index];
  // pause any playing video before replacing the content
  try { Array.from(swipeContainer.querySelectorAll('video')).forEach(v => { try { v.pause(); } catch(e){} }); } catch(e){}
  swipeContainer.innerHTML = '';
  if (!p) { swipeContainer.innerHTML = '<div class="muted">No posts</div>'; return; }
  const el = document.createElement('div'); el.className = 'swipe-item';
  if (p.mediaType === 'video' || (p.mediaUrl && p.mediaUrl.match(/\.(mp4|webm|ogg)$/i))) {
    const v = document.createElement('video'); v.src = p.mediaUrl; v.controls = true; v.muted = true; v.playsInline = true; v.autoplay = true; v.style.maxHeight = '100%'; el.appendChild(v);
    // try to autoplay; if blocked, leave controls for manual play
    v.play().catch(()=>{});
  } else if (p.mediaUrl) {
    const img = document.createElement('img'); img.src = p.thumbnail || p.mediaUrl; img.alt = p.title || 'Recess post preview'; el.appendChild(img);
  } else {
    const img = document.createElement('img'); img.src = p.thumbnail; img.alt = p.title || 'Recess post preview'; el.appendChild(img);
  }
  const info = document.createElement('div'); info.style.marginTop='8px'; info.style.textAlign='center'; info.innerHTML = `<h3 style="margin:6px 0">${p.title||'Untitled'}</h3><div class="muted small">${p.description||''}</div>`;
  el.appendChild(info);
  swipeContainer.appendChild(el);
  updateSwipePagination();
}

function swipeKeyHandler(e){
  if (e.key === 'ArrowDown' || e.key === 'j') return swipeNext();
  if (e.key === 'ArrowUp' || e.key === 'k') return swipePrev();
  if (e.key === 'Escape') return exitSwipeMode();
}

async function swipeNext(){
  if (swipeIndex < swipePosts.length - 1) { swipeIndex++; renderSwipeItem(swipeIndex); }
  else if (swipePosts.length && swipePosts.length === swipeFeedLimit) {
    // fetch next page
    swipeFeedPage++;
    const data = await fetchFeedPage(swipeFeedPage);
    if (data.posts && data.posts.length) {
      swipePosts = swipePosts.concat(data.posts);
      swipeIndex++;
      renderSwipeItem(swipeIndex);
    }
  }
}

function swipePrev(){ if (swipeIndex > 0) { swipeIndex--; renderSwipeItem(swipeIndex); } }

// Touch handlers: simple vertical swipe detection
function initSwipeTouchHandlers(){
  let startY = 0; let down = false;
  swipeContainer.addEventListener('touchstart', (ev) => { if (ev.touches && ev.touches[0]) { startY = ev.touches[0].clientY; down = true; } });
  swipeContainer.addEventListener('touchmove', (ev) => { if (!down) return; const y = ev.touches[0].clientY; const dy = y - startY; if (Math.abs(dy) > 80) { down = false; if (dy < 0) swipeNext(); else swipePrev(); } });
  swipeContainer.addEventListener('touchend', () => { down = false; });
}
