const fetch = require('node-fetch');

const API = 'http://localhost:3000/api';
const ADMIN_TOKEN = '1234';

async function run() {
  console.log('Running staff moderation backend tests...\n');
  
  // 1) Test report categories endpoint
  console.log('1. Testing report categories endpoint...');
  let res = await fetch(`${API}/moderation/report-categories`);
  if (res.status !== 200) { console.error('Failed to get report categories'); process.exit(1); }
  const categories = await res.json();
  if (!Array.isArray(categories) || !categories.includes('inappropriate')) {
    console.error('Invalid categories:', categories);
    process.exit(1);
  }
  console.log('   Categories:', categories.join(', '));
  console.log('   ✓ Report categories endpoint works\n');

  // 2) Create a post and report it with a specific category
  console.log('2. Creating and reporting a post with category...');
  res = await fetch(`${API}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test post for moderation',
      mediaUrl: 'https://example.com/test.jpg',
      childEmail: 'child@local'
    })
  });
  if (res.status !== 201) { console.error('Failed to create post'); process.exit(2); }
  const post = await res.json();
  console.log('   Created post ID:', post.id);

  // Report with 'inappropriate' category
  res = await fetch(`${API}/posts/${post.id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reasonCategory: 'inappropriate',
      reason: 'This content is not appropriate for children'
    })
  });
  if (res.status !== 201) { console.error('Failed to report post'); process.exit(3); }
  const report1 = await res.json();
  console.log('   Report ID:', report1.reportId, 'Category:', report1.reasonCategory);
  console.log('   ✓ Post reported with category\n');

  // 3) Report same post with different category
  console.log('3. Reporting same post with different category...');
  res = await fetch(`${API}/posts/${post.id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reasonCategory: 'inaccurate',
      reason: 'The information presented is wrong'
    })
  });
  if (res.status !== 201) { console.error('Failed to add second report'); process.exit(4); }
  const report2 = await res.json();
  console.log('   Second report ID:', report2.reportId);
  console.log('   ✓ Multiple reports for same post\n');

  // 4) Test reports listing endpoint (admin)
  console.log('4. Testing reports listing (admin)...');
  res = await fetch(`${API}/moderation/reports`, {
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  if (res.status !== 200) { console.error('Failed to list reports'); process.exit(5); }
  const reports = await res.json();
  if (!Array.isArray(reports) || reports.length < 2) {
    console.error('Expected at least 2 reports:', reports.length);
    process.exit(5);
  }
  console.log('   Total reports:', reports.length);
  console.log('   ✓ Reports listing works\n');

  // 5) Test filtering by status
  console.log('5. Testing report filtering...');
  res = await fetch(`${API}/moderation/reports?status=pending`, {
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  if (res.status !== 200) { console.error('Failed to filter reports'); process.exit(6); }
  const pendingReports = await res.json();
  console.log('   Pending reports:', pendingReports.length);

  res = await fetch(`${API}/moderation/reports?reasonCategory=inappropriate`, {
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  const inappropriateReports = await res.json();
  console.log('   Inappropriate reports:', inappropriateReports.length);
  console.log('   ✓ Filtering works\n');

  // 6) Test single report endpoint
  console.log('6. Testing single report endpoint...');
  res = await fetch(`${API}/moderation/reports/${report1.reportId}`, {
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  if (res.status !== 200) { console.error('Failed to get single report'); process.exit(7); }
  const singleReport = await res.json();
  if (singleReport.id !== report1.reportId) {
    console.error('Wrong report returned:', singleReport.id);
    process.exit(7);
  }
  console.log('   Report details - Category:', singleReport.reasonCategory, 'Post:', singleReport.postTitle);
  console.log('   ✓ Single report endpoint works\n');

  // 7) Test moderation stats
  console.log('7. Testing moderation stats...');
  res = await fetch(`${API}/moderation/stats`, {
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  if (res.status !== 200) { console.error('Failed to get stats'); process.exit(8); }
  const stats = await res.json();
  console.log('   Stats:', JSON.stringify(stats));
  if (typeof stats.byStatus !== 'object' || typeof stats.pendingByCategory !== 'object') {
    console.error('Invalid stats format');
    process.exit(8);
  }
  console.log('   ✓ Stats endpoint works\n');

  // 8) Test dismiss report action
  console.log('8. Testing dismiss report action...');
  res = await fetch(`${API}/moderation/reports/${report1.reportId}/dismiss`, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffNotes: 'False positive - content is fine' })
  });
  if (res.status !== 200) { console.error('Failed to dismiss report'); process.exit(9); }
  const dismissResult = await res.json();
  if (dismissResult.status !== 'dismissed') {
    console.error('Expected dismissed status:', dismissResult);
    process.exit(9);
  }
  console.log('   Report dismissed');
  console.log('   ✓ Dismiss action works\n');

  // 9) Test action on report (reject post)
  console.log('9. Testing action on report (reject post)...');
  res = await fetch(`${API}/moderation/reports/${report2.reportId}/action`, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject', staffNotes: 'Content verified as problematic' })
  });
  if (res.status !== 200) { console.error('Failed to action report'); process.exit(10); }
  const actionResult = await res.json();
  if (actionResult.reportStatus !== 'actioned' || actionResult.postStatus !== 'rejected') {
    console.error('Unexpected action result:', actionResult);
    process.exit(10);
  }
  console.log('   Report actioned, post rejected');
  console.log('   ✓ Action on report works\n');

  // 10) Verify post status changed
  console.log('10. Verifying post status changed...');
  res = await fetch(`${API}/posts?all=1`);
  const allPosts = await res.json();
  const updatedPost = allPosts.find(p => p.id === post.id);
  if (!updatedPost || updatedPost.status !== 'rejected') {
    console.error('Post status not updated:', updatedPost);
    process.exit(11);
  }
  console.log('   Post status:', updatedPost.status);
  console.log('   ✓ Post status correctly updated\n');

  // 11) Test reports for specific post endpoint
  console.log('11. Testing reports for specific post...');
  res = await fetch(`${API}/moderation/posts/${post.id}/reports`, {
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  if (res.status !== 200) { console.error('Failed to get post reports'); process.exit(12); }
  const postReports = await res.json();
  if (!Array.isArray(postReports) || postReports.length !== 2) {
    console.error('Expected 2 reports for post:', postReports.length);
    process.exit(12);
  }
  console.log('   Reports for post:', postReports.length);
  console.log('   ✓ Post reports endpoint works\n');

  // 12) Test bulk action
  console.log('12. Testing bulk action...');
  // Create more reports for bulk test
  res = await fetch(`${API}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Bulk test 1', mediaUrl: 'https://example.com/b1.jpg' })
  });
  const bulkPost1 = await res.json();
  res = await fetch(`${API}/posts/${bulkPost1.id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reasonCategory: 'spam', reason: 'Spam test' })
  });
  const bulkReport1 = await res.json();

  res = await fetch(`${API}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Bulk test 2', mediaUrl: 'https://example.com/b2.jpg' })
  });
  const bulkPost2 = await res.json();
  res = await fetch(`${API}/posts/${bulkPost2.id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reasonCategory: 'spam', reason: 'Spam test 2' })
  });
  const bulkReport2 = await res.json();

  res = await fetch(`${API}/moderation/reports/bulk`, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportIds: [bulkReport1.reportId, bulkReport2.reportId],
      action: 'dismiss',
      staffNotes: 'Bulk dismissed'
    })
  });
  if (res.status !== 200) { console.error('Bulk action failed'); process.exit(13); }
  const bulkResult = await res.json();
  if (bulkResult.updated !== 2) {
    console.error('Expected 2 updates:', bulkResult);
    process.exit(13);
  }
  console.log('   Bulk dismissed:', bulkResult.updated, 'reports');
  console.log('   ✓ Bulk action works\n');

  // 13) Test auth requirement
  console.log('13. Testing auth requirement...');
  res = await fetch(`${API}/moderation/reports`);
  if (res.status !== 401) {
    console.error('Expected 401 without auth:', res.status);
    process.exit(14);
  }
  console.log('   ✓ Auth correctly required\n');

  console.log('=================================');
  console.log('All staff moderation tests passed!');
  console.log('=================================');
  process.exit(0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
