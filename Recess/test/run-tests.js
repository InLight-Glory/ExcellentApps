const fetch = require('node-fetch');

const API = 'http://localhost:3000/api';
const PARENT_EMAIL = 'parent@local';
const PARENT_PASSWORD = 'parentpass';
const ADMIN_TOKEN = '1234';

async function run(){
  console.log('Running parent workflow tests...');
  // 1) parent login
  let res = await fetch(`${API}/parents/login`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: PARENT_EMAIL, password: PARENT_PASSWORD }) });
  if (res.status !== 200) { console.error('Parent login failed', await res.text()); process.exit(2); }
  const { token } = await res.json();
  console.log('Parent login ok, token length', token.length);

  // 2) create post for child via JSON (no file)
  const postResp = await fetch(`${API}/posts`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: 'Test project', mediaUrl: 'https://example.com/image.jpg', childEmail: 'child@local' }) });
  if (postResp.status !== 201) { console.error('Create post failed', await postResp.text()); process.exit(3); }
  const postData = await postResp.json();
  console.log('Created post id', postData.id);

  // 3) parent pending
  const pendingResp = await fetch(`${API}/parents/me/pending`, { headers: { 'Authorization': 'Bearer ' + token } });
  if (pendingResp.status !== 200) { console.error('Pending fetch failed', await pendingResp.text()); process.exit(4); }
  const pending = await pendingResp.json();
  if (!Array.isArray(pending) || !pending.find(p=>p.id===postData.id)) { console.error('Pending list does not contain post', pending); process.exit(5); }
  console.log('Pending list contains post');

  // 4) parent approve
  const approveResp = await fetch(`${API}/parents/me/posts/${postData.id}/approve`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
  if (approveResp.status !== 200) { console.error('Approve failed', await approveResp.text()); process.exit(6); }
  console.log('Parent approved post');

  // 5) feed should include post
  const feedResp = await fetch(`${API}/posts`);
  const feed = await feedResp.json();
  if (!feed.find(p => p.id === postData.id)) { console.error('Feed does not contain approved post', feed); process.exit(7); }
  console.log('Feed contains approved post');

  // 6) report -> escalated
  const reportResp = await fetch(`${API}/posts/${postData.id}/report`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reporterId: null, reason: 'test' }) });
  if (reportResp.status !== 201) { console.error('Report failed', await reportResp.text()); process.exit(8); }
  console.log('Reported post, escalated');

  // 7) admin escalated list
  const escalResp = await fetch(`${API}/moderation/escalated`, { headers: { 'x-admin-token': ADMIN_TOKEN } });
  const escal = await escalResp.json();
  if (!escal.find(p => p.id === postData.id)) { console.error('Escalated list missing post', escal); process.exit(9); }
  console.log('Escalated list contains post — tests passed');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
