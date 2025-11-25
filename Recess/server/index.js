const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname);
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safe = file.originalname.replace(/[^a-z0-9.\-\_]/gi, '_');
    cb(null, `${unique}-${safe}`);
  }
});
const upload = multer({ storage });

// sqlite3 setup
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');
const db = new sqlite3.Database(DB_PATH);

// Load config (admin token)
let CONFIG = { adminToken: 'recess-admin-token-CHANGE_ME' };
try {
  const cfg = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  CONFIG = JSON.parse(cfg);
} catch (e) {
  console.warn('No config.json found or invalid, using default admin token.');
}

// simple admin middleware
function requireAdmin(req, res, next) {
  let token = (req.headers['x-admin-token'] || req.headers['authorization'] || '').toString();
  if (!token) {
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.recess_admin_token) token = cookies.recess_admin_token;
  }
  if (!token || (token !== CONFIG.adminToken && token !== ('Bearer ' + CONFIG.adminToken))) return res.status(401).json({ error: 'admin token required' });
  next();
}

// simple parent middleware (token maps to configured parent email)
function requireParent(req, res, next) {
  // Accept Bearer JWT in Authorization or legacy x-parent-token
  const auth = req.headers['authorization'] || '';
  if (auth && auth.toString().startsWith('Bearer ')) {
    const token = auth.toString().slice(7);
    try {
      const payload = jwt.verify(token, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME');
      if (payload && payload.role === 'parent') {
        req.parentId = payload.id;
        req.parentEmail = payload.email;
        return next();
      }
      return res.status(401).json({ error: 'invalid parent token' });
    } catch (e) {
      return res.status(401).json({ error: 'invalid token' });
    }
  }
  // Fallback: check cookie for recess_parent_jwt
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.recess_parent_jwt) {
    try {
      const payload = jwt.verify(cookies.recess_parent_jwt, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME');
      if (payload && payload.role === 'parent') {
        req.parentId = payload.id;
        req.parentEmail = payload.email;
        return next();
      }
      return res.status(401).json({ error: 'invalid parent token' });
    } catch (e) {
      return res.status(401).json({ error: 'invalid token' });
    }
  }
  const token = (req.headers['x-parent-token'] || '').toString();
  if (!token) return res.status(401).json({ error: 'parent token required' });
  const match = (CONFIG.parentTokens || []).find(p => p.token === token);
  if (!match) return res.status(401).json({ error: 'invalid parent token' });
  // attach parent email to request for downstream checks
  req.parentEmail = match.email;
  next();
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    displayName TEXT,
    role TEXT DEFAULT 'user',
    ageRange TEXT,
    parentalConsent INTEGER DEFAULT 0,
    createdAt INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT,
    description TEXT,
    mediaUrl TEXT,
    mediaType TEXT,
    category TEXT,
    tags TEXT,
    status TEXT DEFAULT 'pending',
    likesCount INTEGER DEFAULT 0,
    createdAt INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS moderation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    action TEXT,
    admin TEXT,
    reason TEXT,
    createdAt INTEGER
  )`);
  // Create reports and parent_child tables
  // Reports table with enhanced fields for staff moderation
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    reporterId INTEGER,
    reasonCategory TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    staffNotes TEXT,
    resolvedBy TEXT,
    resolvedAt INTEGER,
    createdAt INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS parent_child (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parentUserId INTEGER,
    childUserId INTEGER,
    createdAt INTEGER
  )`);

  // Add parentApprovedBy column to posts if not present (SQLite simple alter)
  db.run("ALTER TABLE posts ADD COLUMN parentApprovedBy INTEGER", [], (err) => {
    // ignore error if column exists
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add parentApprovedBy column:', err.message);
  });
  // Add passwordHash column to users if not present
  db.run("ALTER TABLE users ADD COLUMN passwordHash TEXT", [], (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add passwordHash column:', err.message);
  });

  // Add enhanced report columns if not present (backwards compatibility)
  db.run("ALTER TABLE reports ADD COLUMN reasonCategory TEXT", [], (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add reasonCategory column:', err.message);
  });
  db.run("ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'pending'", [], (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add status column:', err.message);
  });
  db.run("ALTER TABLE reports ADD COLUMN staffNotes TEXT", [], (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add staffNotes column:', err.message);
  });
  db.run("ALTER TABLE reports ADD COLUMN resolvedBy TEXT", [], (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add resolvedBy column:', err.message);
  });
  db.run("ALTER TABLE reports ADD COLUMN resolvedAt INTEGER", [], (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.warn('Could not add resolvedAt column:', err.message);
  });

  // Ensure at least one admin user exists (seed)
  db.get("SELECT id FROM users WHERE role='admin' LIMIT 1", [], (err, row) => {
    if (err) console.error('DB error checking admin user:', err);
    if (!row) {
      const stmt = db.prepare('INSERT INTO users (email, displayName, role, createdAt, parentalConsent) VALUES (?, ?, ?, ?, ?)');
      stmt.run('admin@local', 'admin', 'admin', Date.now(), 1, (e) => {
        if (e) console.error('Failed to seed admin user:', e);
        else console.log('Seeded admin user: admin@local');
      });
    }
  });

  // Ensure at least one parent and one child exist for local testing; link them
  db.get("SELECT id FROM users WHERE role='parent' LIMIT 1", [], (err, prow) => {
    if (err) console.error('DB error checking parent user:', err);
    if (!prow) {
      // seed parent with password hash from config
      const parentPassword = CONFIG.parentPassword || 'parentpass';
      const hash = bcrypt.hashSync(parentPassword, 10);
      const stmt = db.prepare('INSERT INTO users (email, displayName, role, createdAt, parentalConsent, passwordHash) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run('parent@local', 'Parent Local', 'parent', Date.now(), 1, hash, (e) => {
        if (e) console.error('Failed to seed parent user:', e);
        else console.log('Seeded parent user: parent@local');
      });
    }
  });

  // Ensure a sample child exists
  db.get("SELECT id FROM users WHERE email='child@local' LIMIT 1", [], (err, crow) => {
    if (err) console.error('DB error checking child user:', err);
    if (!crow) {
      const stmt = db.prepare('INSERT INTO users (email, displayName, role, createdAt, parentalConsent) VALUES (?, ?, ?, ?, ?)');
      stmt.run('child@local', 'Child Local', 'user', Date.now(), 0, (e) => {
        if (e) console.error('Failed to seed child user:', e);
        else console.log('Seeded child user: child@local');
      });
    }
  });

  // Link parent and child if not linked
  setTimeout(() => {
    db.get("SELECT id FROM users WHERE email='parent@local'", [], (err, pRow) => {
      db.get("SELECT id FROM users WHERE email='child@local'", [], (err2, cRow) => {
        if (pRow && cRow) {
          db.get('SELECT id FROM parent_child WHERE parentUserId = ? AND childUserId = ?', [pRow.id, cRow.id], (e, r) => {
            if (!r) {
              db.run('INSERT INTO parent_child (parentUserId, childUserId, createdAt) VALUES (?, ?, ?)', [pRow.id, cRow.id, Date.now()], (ee) => {
                if (ee) console.error('Failed to link parent-child:', ee);
                else console.log('Linked parent@local -> child@local');
              });
            }
          });
        }
      });
    });
  }, 300);

  // Seed two demo accounts: a young child (5yo) and a teen (14yo) for demo purposes
  db.get("SELECT id FROM users WHERE email='kid5@local' LIMIT 1", [], (err, k5) => {
    if (err) console.error('DB error checking kid5:', err);
    if (!k5) {
      db.run('INSERT INTO users (email, displayName, role, createdAt, parentalConsent, ageRange) VALUES (?, ?, ?, ?, ?, ?)', ['kid5@local', 'Sam (5)', 'user', Date.now(), 0, '5'], (e) => {
        if (e) console.error('Failed to seed kid5:', e);
        else console.log('Seeded demo user: kid5@local (5yo)');
      });
    }
  });

  db.get("SELECT id FROM users WHERE email='teen14@local' LIMIT 1", [], (err, t14) => {
    if (err) console.error('DB error checking teen14:', err);
    if (!t14) {
      db.run('INSERT INTO users (email, displayName, role, createdAt, parentalConsent, ageRange) VALUES (?, ?, ?, ?, ?, ?)', ['teen14@local', 'Alex (14)', 'user', Date.now(), 1, '14-15'], (e) => {
        if (e) console.error('Failed to seed teen14:', e);
        else console.log('Seeded demo user: teen14@local (14yo)');
      });
    }
  });

  // Seed a few demo posts (only if none exist) to make the UI feel alive on first run
  setTimeout(() => {
    db.get('SELECT COUNT(1) as cnt FROM posts', [], (err, row) => {
      if (err) return console.error('Error checking posts count:', err);
      if (row && row.cnt > 0) return; // already have posts
      // find child user id
      db.get("SELECT id FROM users WHERE email='child@local' LIMIT 1", [], (e, childRow) => {
        const childId = childRow ? childRow.id : 0;
        const now = Date.now();
        const demos = [
          {
            title: 'Lemon battery — simple science at home',
            description: 'Make a small battery using lemons, copper and zinc. Great for a classroom demo!',
            mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            mediaType: 'youtube',
            category: 'Science',
            status: 'approved',
            createdAt: now - 1000 * 60 * 60 * 24
          },
          {
            title: 'Color-changing milk experiment',
            description: 'A colorful surface-tension experiment using milk and soap.',
            mediaUrl: 'https://www.youtube.com/watch?v=QH2-TGUlwu4',
            mediaType: 'youtube',
            category: 'Chemistry',
            status: 'approved',
            createdAt: now - 1000 * 60 * 60 * 12
          },
          {
            title: 'Paper rocket launch',
            description: 'Build a small paper rocket and learn about thrust.',
            mediaUrl: 'https://via.placeholder.com/640x360.png?text=Paper+Rocket',
            mediaType: 'image',
            category: 'Engineering',
            status: 'approved',
            createdAt: now - 1000 * 60 * 60 * 6
          }
        ];
        const stmt = db.prepare('INSERT INTO posts (userId, title, description, mediaUrl, mediaType, category, tags, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        demos.forEach(d => {
          stmt.run(childId, d.title, d.description, d.mediaUrl, d.mediaType, d.category, '', d.status, d.createdAt, (ie) => {
            if (ie) console.error('Failed to insert demo post:', ie);
          });
        });
        stmt.finalize(() => console.log('Seeded demo posts'));
      });
    });
  }, 600);
});

// Serve uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// Simple cookie parser for our needs (no extra dependency)
function parseCookies(cookieHeader) {
  const obj = {};
  if (!cookieHeader) return obj;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    obj[key] = decodeURIComponent(val);
  });
  return obj;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.recess_parent_jwt) return true;
  if (cookies.recess_admin_token) return true;
  if (cookies.recess_user_jwt) return true;
  return false;
}

// Redirect unauthenticated visitors at root to landing page
app.get('/', (req, res, next) => {
  try {
    if (!isAuthenticated(req)) return res.redirect('/landing.html');
  } catch (e) {
    // fall through
  }
  next();
});

// Serve frontend static
app.use('/', express.static(path.join(__dirname, '..', 'web')));

// API: list posts
app.get('/api/posts', (req, res) => {
  const showAll = req.query.all === '1';
  const sql = showAll ? 'SELECT * FROM posts ORDER BY createdAt DESC' : "SELECT * FROM posts WHERE status='approved' ORDER BY createdAt DESC";
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Paginated feed endpoint for swipe/pagination UI
app.get('/api/feed', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '5')));
  const offset = (page - 1) * limit;
  // return approved posts, newest first
  db.all("SELECT * FROM posts WHERE status='approved' ORDER BY createdAt DESC LIMIT ? OFFSET ?", [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // produce a thumbnail if missing (simple SVG data URI)
    const makeThumb = (p) => {
      if (p.mediaUrl && p.mediaType === 'image') return p.mediaUrl;
      if (p.mediaUrl && /youtube.com|youtu.be/i.test(p.mediaUrl)) {
        // best-effort youtube thumbnail (works for most videos)
        try {
          const u = new URL(p.mediaUrl);
          let id = null;
          if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
          else id = u.searchParams.get('v');
          if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        } catch (e) { /* ignore */ }
      }
      // fallback: svg with title text
      const txt = (p.title || 'Recess').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='#e6f2ff'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial,Segoe UI,Helvetica' font-size='28' fill='#0b4ea2'>${txt}</text></svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    };
    const out = rows.map(r => ({ id: r.id, title: r.title, description: r.description, mediaUrl: r.mediaUrl, mediaType: r.mediaType, category: r.category, thumbnail: makeThumb(r), createdAt: r.createdAt }));
    res.json({ page, limit, posts: out, hasMore: rows.length === limit });
  });
});

// API: create post (multipart: media)
app.post('/api/posts', upload.single('media'), (req, res) => {
  const { title = '', description = '', category = '', tags = '', childEmail = '', mediaUrl: bodyMediaUrl = '' } = req.body;
  const file = req.file;
  let mediaUrl = bodyMediaUrl;
  let mediaType = null;
  if (file) {
    mediaUrl = `/uploads/${path.basename(file.path)}`;
    mediaType = file.mimetype.startsWith('video') ? 'video' : 'image';
  } else if (bodyMediaUrl) {
    // infer from extension
    mediaType = (bodyMediaUrl.match(/\.(mp4|webm|ogg)$/i)) ? 'video' : 'image';
  } else {
    return res.status(400).json({ error: 'media file required or provide mediaUrl in body' });
  }

  const createdAt = Date.now();

  // determine userId from childEmail if provided
  function insertWithUserId(userId) {
    const stmt = db.prepare(`INSERT INTO posts (userId, title, description, mediaUrl, mediaType, category, tags, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    // Default new posts require parent approval first
    stmt.run(userId || 0, title, description, mediaUrl, mediaType, category, tags, 'pending_parent', createdAt, function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      res.status(201).json({ id, title, mediaUrl, status: 'pending_parent' });
    });
  }

  if (childEmail) {
    db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [childEmail], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const userId = row ? row.id : 0;
      insertWithUserId(userId);
    });
  } else {
    insertWithUserId(0);
  }
});

// API: like a post
app.post('/api/posts/:id/like', (req, res) => {
  const id = req.params.id;
  const sql = 'UPDATE posts SET likesCount = likesCount + 1 WHERE id = ?';
  db.run(sql, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT likesCount FROM posts WHERE id = ?', [id], (e, row) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ likesCount: row ? row.likesCount : 0 });
    });
  });
});

// Valid report reason categories
const REPORT_REASON_CATEGORIES = [
  'inappropriate',    // Inappropriate content for children
  'suggestive',       // Suggestive or adult-oriented content
  'inaccurate',       // Inaccurate information
  'misleading',       // Misleading content
  'spam',             // Spam or promotional content
  'harassment',       // Harassment or bullying
  'dangerous',        // Dangerous activities
  'copyright',        // Copyright violation
  'other'             // Other reason (requires description)
];

// API: report a post (anyone)
app.post('/api/posts/:id/report', (req, res) => {
  const id = req.params.id;
  const { reporterId = null, reasonCategory = 'other', reason = '' } = req.body || {};
  
  // Validate reasonCategory
  const validCategory = REPORT_REASON_CATEGORIES.includes(reasonCategory) ? reasonCategory : 'other';
  
  const createdAt = Date.now();
  db.run('INSERT INTO reports (postId, reporterId, reasonCategory, reason, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)', 
    [id, reporterId, validCategory, reason, 'pending', createdAt], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    const reportId = this.lastID;
    // mark the post as escalated for staff review
    db.run("UPDATE posts SET status='escalated' WHERE id = ?", [id], function (e) {
      if (e) console.error('Failed to mark escalated:', e);
      res.status(201).json({ reportId, escalated: true, reasonCategory: validCategory });
    });
  });
});

// Parent endpoints
// GET linked children for the authenticated parent
app.get('/api/parents/me/children', requireParent, (req, res) => {
  // if JWT provided, req.parentId is available
  if (req.parentId) {
    db.all('SELECT u.id,u.email,u.displayName,u.role FROM parent_child pc JOIN users u ON pc.childUserId = u.id WHERE pc.parentUserId = ?', [req.parentId], (e, rows) => {
      if (e) return res.status(500).json({ error: e.message });
      return res.json(rows);
    });
  } else {
    const parentEmail = req.parentEmail;
    db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [parentEmail], (err, parentRow) => {
      if (err || !parentRow) return res.status(404).json({ error: 'parent not found' });
      db.all('SELECT u.id,u.email,u.displayName,u.role FROM parent_child pc JOIN users u ON pc.childUserId = u.id WHERE pc.parentUserId = ?', [parentRow.id], (e, rows) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(rows);
      });
    });
  }
});

// GET pending posts for linked children
app.get('/api/parents/me/pending', requireParent, (req, res) => {
  const parentEmail = req.parentEmail;
  db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [parentEmail], (err, parentRow) => {
    if (err || !parentRow) return res.status(404).json({ error: 'parent not found' });
    db.all('SELECT p.* FROM parent_child pc JOIN posts p ON pc.childUserId = p.userId WHERE pc.parentUserId = ? AND p.status = ?', [parentRow.id, 'pending_parent'], (e, rows) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json(rows);
    });
  });
});

// Parent approve a child's post
app.post('/api/parents/me/posts/:id/approve', requireParent, (req, res) => {
  const postId = req.params.id;
  const parentId = req.parentId;
  const parentEmail = req.parentEmail;
  if (!parentId && !parentEmail) return res.status(401).json({ error: 'parent authentication required' });
  const lookupParentId = (cb) => {
    if (parentId) return cb(null, parentId);
    db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [parentEmail], (err, row) => cb(err, row ? row.id : null));
  };
  lookupParentId((err, pId) => {
    if (err || !pId) return res.status(404).json({ error: 'parent not found' });
    db.get('SELECT * FROM posts WHERE id = ?', [postId], (e, post) => {
      if (e || !post) return res.status(404).json({ error: 'post not found' });
      // ensure the post belongs to a child of this parent
      db.get('SELECT id FROM parent_child WHERE parentUserId = ? AND childUserId = ?', [pId, post.userId], (ee, rel) => {
        if (ee) return res.status(500).json({ error: ee.message });
        if (!rel) return res.status(403).json({ error: 'not authorized for this post' });
        db.run("UPDATE posts SET status='approved', parentApprovedBy = ? WHERE id = ?", [pId, postId], function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          db.run('INSERT INTO moderation (postId, action, admin, createdAt) VALUES (?, ?, ?, ?)', [postId, 'parent-approve', parentEmail || pId, Date.now()], () => {
            res.json({ id: postId, status: 'approved' });
          });
        });
      });
    });
  });
});

// Parent reject a child's post
app.post('/api/parents/me/posts/:id/reject', requireParent, (req, res) => {
  const postId = req.params.id;
  const reason = req.body.reason || '';
  const parentId = req.parentId;
  const parentEmail = req.parentEmail;
  if (!parentId && !parentEmail) return res.status(401).json({ error: 'parent authentication required' });
  const lookupParentId = (cb) => {
    if (parentId) return cb(null, parentId);
    db.get('SELECT id FROM users WHERE email = ? LIMIT 1', [parentEmail], (err, row) => cb(err, row ? row.id : null));
  };
  lookupParentId((err, pId) => {
    if (err || !pId) return res.status(404).json({ error: 'parent not found' });
    db.get('SELECT * FROM posts WHERE id = ?', [postId], (e, post) => {
      if (e || !post) return res.status(404).json({ error: 'post not found' });
      db.get('SELECT id FROM parent_child WHERE parentUserId = ? AND childUserId = ?', [pId, post.userId], (ee, rel) => {
        if (ee) return res.status(500).json({ error: ee.message });
        if (!rel) return res.status(403).json({ error: 'not authorized for this post' });
        db.run("UPDATE posts SET status='rejected' WHERE id = ?", [postId], function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          db.run('INSERT INTO moderation (postId, action, admin, reason, createdAt) VALUES (?, ?, ?, ?, ?)', [postId, 'parent-reject', parentEmail || pId, reason, Date.now()], () => {
            res.json({ id: postId, status: 'rejected' });
          });
        });
      });
    });
  });
});

// Moderation endpoints (no auth in scaffold)
app.post('/api/moderation/:id/approve', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.run("UPDATE posts SET status='approved' WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run("INSERT INTO moderation (postId, action, admin, createdAt) VALUES (?, ?, ?, ?)", [id, 'approve', 'admin', Date.now()], (e) => {
      if (e) console.error(e);
      res.json({ id, status: 'approved' });
    });
  });
});

app.post('/api/moderation/:id/reject', requireAdmin, (req, res) => {
  const id = req.params.id;
  const reason = req.body.reason || '';
  db.run("UPDATE posts SET status='rejected' WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run("INSERT INTO moderation (postId, action, admin, reason, createdAt) VALUES (?, ?, ?, ?, ?)", [id, 'reject', 'admin', reason, Date.now()], (e) => {
      if (e) console.error(e);
      res.json({ id, status: 'rejected' });
    });
  });
});

// Admin helper: reset demo posts (clear posts and insert demo set). Protected by admin token.
app.post('/api/admin/reset-demo', requireAdmin, (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM posts', [], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // insert demo posts (same as initial seed)
      db.get("SELECT id FROM users WHERE email='kid5@local' LIMIT 1", [], (err, kidRow) => {
        const kidId = kidRow ? kidRow.id : 0;
        const now = Date.now();
        const demos = [
          { title: 'Lemon battery — simple science at home', description: 'Make a small battery using lemons, copper and zinc. Great for a classroom demo!', mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaType: 'youtube', category: 'Science', status: 'approved', createdAt: now - 1000 * 60 * 60 * 24 },
          { title: 'Color-changing milk experiment', description: 'A colorful surface-tension experiment using milk and soap.', mediaUrl: 'https://www.youtube.com/watch?v=QH2-TGUlwu4', mediaType: 'youtube', category: 'Chemistry', status: 'approved', createdAt: now - 1000 * 60 * 60 * 12 },
          { title: 'Paper rocket launch', description: 'Build a small paper rocket and learn about thrust.', mediaUrl: 'https://via.placeholder.com/640x360.png?text=Paper+Rocket', mediaType: 'image', category: 'Engineering', status: 'approved', createdAt: now - 1000 * 60 * 60 * 6 }
        ];
        const stmt = db.prepare('INSERT INTO posts (userId, title, description, mediaUrl, mediaType, category, tags, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        demos.forEach(d => {
          stmt.run(kidId, d.title, d.description, d.mediaUrl, d.mediaType, d.category, '', d.status, d.createdAt, (ie) => {
            if (ie) console.error('Failed to insert demo post:', ie);
          });
        });
        stmt.finalize(() => res.json({ reset: true, inserted: demos.length }));
      });
    });
  });
});

// Helper: expose pending posts for admin UI
app.get('/api/moderation/pending', requireAdmin, (req, res) => {
  db.all("SELECT * FROM posts WHERE status != 'approved' ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin: list escalated posts (staff review)
app.get('/api/moderation/escalated', requireAdmin, (req, res) => {
  db.all("SELECT * FROM posts WHERE status = 'escalated' ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ========================================
// Staff Moderation Backend for User-Flagged Posts
// ========================================

// GET: List all valid report reason categories
app.get('/api/moderation/report-categories', (req, res) => {
  res.json(REPORT_REASON_CATEGORIES);
});

// GET: List all reports with optional filtering
// Query params: status (pending|reviewed|dismissed|actioned), reasonCategory, postId
app.get('/api/moderation/reports', requireAdmin, (req, res) => {
  const { status, reasonCategory, postId } = req.query;
  
  let sql = `
    SELECT r.*, p.title AS postTitle, p.status AS postStatus, p.mediaUrl, p.userId AS postUserId,
           u.displayName AS reporterName, u.email AS reporterEmail
    FROM reports r
    LEFT JOIN posts p ON r.postId = p.id
    LEFT JOIN users u ON r.reporterId = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (status) {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  if (reasonCategory) {
    sql += ' AND r.reasonCategory = ?';
    params.push(reasonCategory);
  }
  if (postId) {
    sql += ' AND r.postId = ?';
    params.push(postId);
  }
  
  sql += ' ORDER BY r.createdAt DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET: Get a specific report with full details
app.get('/api/moderation/reports/:id', requireAdmin, (req, res) => {
  const reportId = req.params.id;
  
  const sql = `
    SELECT r.*, p.title AS postTitle, p.description AS postDescription, p.status AS postStatus, 
           p.mediaUrl, p.mediaType, p.userId AS postUserId, p.category AS postCategory,
           u.displayName AS reporterName, u.email AS reporterEmail,
           pu.displayName AS postAuthorName, pu.email AS postAuthorEmail
    FROM reports r
    LEFT JOIN posts p ON r.postId = p.id
    LEFT JOIN users u ON r.reporterId = u.id
    LEFT JOIN users pu ON p.userId = pu.id
    WHERE r.id = ?
  `;
  
  db.get(sql, [reportId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Report not found' });
    res.json(row);
  });
});

// GET: Get all reports for a specific post
app.get('/api/moderation/posts/:postId/reports', requireAdmin, (req, res) => {
  const postId = req.params.postId;
  
  const sql = `
    SELECT r.*, u.displayName AS reporterName, u.email AS reporterEmail
    FROM reports r
    LEFT JOIN users u ON r.reporterId = u.id
    WHERE r.postId = ?
    ORDER BY r.createdAt DESC
  `;
  
  db.all(sql, [postId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET: Get summary statistics for moderation dashboard
app.get('/api/moderation/stats', requireAdmin, (req, res) => {
  const stats = {};
  
  // Count reports by status
  db.all(`
    SELECT status, COUNT(*) as count 
    FROM reports 
    GROUP BY status
  `, [], (err, statusRows) => {
    if (err) return res.status(500).json({ error: err.message });
    stats.byStatus = {};
    statusRows.forEach(r => { stats.byStatus[r.status || 'unknown'] = r.count; });
    
    // Count reports by category
    db.all(`
      SELECT reasonCategory, COUNT(*) as count 
      FROM reports 
      WHERE status = 'pending'
      GROUP BY reasonCategory
    `, [], (err2, catRows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      stats.pendingByCategory = {};
      catRows.forEach(r => { stats.pendingByCategory[r.reasonCategory || 'other'] = r.count; });
      
      // Count escalated posts
      db.get(`SELECT COUNT(*) as count FROM posts WHERE status = 'escalated'`, [], (err3, escRow) => {
        if (err3) return res.status(500).json({ error: err3.message });
        stats.escalatedPosts = escRow ? escRow.count : 0;
        
        res.json(stats);
      });
    });
  });
});

// POST: Dismiss a report (mark as false positive / no action needed)
app.post('/api/moderation/reports/:id/dismiss', requireAdmin, (req, res) => {
  const reportId = req.params.id;
  const { staffNotes = '' } = req.body || {};
  const resolvedAt = Date.now();
  
  db.run(`
    UPDATE reports 
    SET status = 'dismissed', staffNotes = ?, resolvedBy = 'admin', resolvedAt = ?
    WHERE id = ?
  `, [staffNotes, resolvedAt, reportId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Report not found' });
    
    // Log the action in moderation table
    db.run('INSERT INTO moderation (postId, action, admin, reason, createdAt) VALUES ((SELECT postId FROM reports WHERE id = ?), ?, ?, ?, ?)',
      [reportId, 'report-dismissed', 'admin', staffNotes, resolvedAt]);
    
    res.json({ id: parseInt(reportId), status: 'dismissed' });
  });
});

// POST: Mark a report as reviewed (acknowledge but keep post)
app.post('/api/moderation/reports/:id/reviewed', requireAdmin, (req, res) => {
  const reportId = req.params.id;
  const { staffNotes = '' } = req.body || {};
  const resolvedAt = Date.now();
  
  db.run(`
    UPDATE reports 
    SET status = 'reviewed', staffNotes = ?, resolvedBy = 'admin', resolvedAt = ?
    WHERE id = ?
  `, [staffNotes, resolvedAt, reportId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Report not found' });
    
    // Log the action in moderation table
    db.run('INSERT INTO moderation (postId, action, admin, reason, createdAt) VALUES ((SELECT postId FROM reports WHERE id = ?), ?, ?, ?, ?)',
      [reportId, 'report-reviewed', 'admin', staffNotes, resolvedAt]);
    
    res.json({ id: parseInt(reportId), status: 'reviewed' });
  });
});

// POST: Take action on a reported post (remove/reject the post)
app.post('/api/moderation/reports/:id/action', requireAdmin, (req, res) => {
  const reportId = req.params.id;
  const { action = 'reject', staffNotes = '' } = req.body || {};
  const resolvedAt = Date.now();
  
  // First, get the postId from the report
  db.get('SELECT postId FROM reports WHERE id = ?', [reportId], (err, report) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    
    const postId = report.postId;
    const newPostStatus = action === 'approve' ? 'approved' : 'rejected';
    
    // Update the post status
    db.run(`UPDATE posts SET status = ? WHERE id = ?`, [newPostStatus, postId], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      
      // Update the report status
      db.run(`
        UPDATE reports 
        SET status = 'actioned', staffNotes = ?, resolvedBy = 'admin', resolvedAt = ?
        WHERE id = ?
      `, [staffNotes, resolvedAt, reportId], function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        
        // Also mark other pending reports for the same post as actioned
        db.run(`
          UPDATE reports 
          SET status = 'actioned', staffNotes = 'Resolved via report #' || ?, resolvedBy = 'admin', resolvedAt = ?
          WHERE postId = ? AND status = 'pending' AND id != ?
        `, [reportId, resolvedAt, postId, reportId]);
        
        // Log the action in moderation table
        db.run('INSERT INTO moderation (postId, action, admin, reason, createdAt) VALUES (?, ?, ?, ?, ?)',
          [postId, 'report-action-' + action, 'admin', staffNotes, resolvedAt]);
        
        res.json({ 
          reportId: parseInt(reportId), 
          reportStatus: 'actioned', 
          postId: postId,
          postStatus: newPostStatus 
        });
      });
    });
  });
});

// POST: Bulk action on multiple reports
app.post('/api/moderation/reports/bulk', requireAdmin, (req, res) => {
  const { reportIds = [], action = 'dismiss', staffNotes = '' } = req.body || {};
  
  if (!Array.isArray(reportIds) || reportIds.length === 0) {
    return res.status(400).json({ error: 'reportIds array required' });
  }
  
  // Validate that all reportIds are integers to prevent SQL injection
  const validatedIds = reportIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
  if (validatedIds.length === 0) {
    return res.status(400).json({ error: 'No valid report IDs provided' });
  }
  
  const validActions = ['dismiss', 'reviewed'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Use: dismiss, reviewed' });
  }
  
  const resolvedAt = Date.now();
  const status = action === 'dismiss' ? 'dismissed' : 'reviewed';
  const placeholders = validatedIds.map(() => '?').join(',');
  
  db.run(`
    UPDATE reports 
    SET status = ?, staffNotes = ?, resolvedBy = 'admin', resolvedAt = ?
    WHERE id IN (${placeholders})
  `, [status, staffNotes, resolvedAt, ...validatedIds], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes, status });
  });
});

// ========================================
// End Staff Moderation Backend
// ========================================

// Parent login: return JWT
app.post('/api/parents/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  db.get('SELECT * FROM users WHERE email = ? AND role = ? LIMIT 1', [email, 'parent'], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const hash = user.passwordHash;
    if (!hash) return res.status(500).json({ error: 'no password set for this user' });
    const ok = bcrypt.compareSync(password, hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: 'parent' }, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME', { expiresIn: '8h' });
    // Set an HttpOnly cookie for server-side session detection (local dev only)
    try {
      res.cookie('recess_parent_jwt', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
    } catch (e) {
      // If res.cookie not available for some reason, ignore
    }
    res.json({ token });
  });
});

// Demo/user login endpoint — for local demo only.
// Accepts { email } and issues a user JWT; if the demo account has no passwordHash, set it to 'demo123'.
app.post('/api/users/demo-login', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  db.get('SELECT * FROM users WHERE email = ? AND role = ? LIMIT 1', [email, 'user'], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'user not found' });
    // If user has no passwordHash, seed it to demo123 for demo convenience
    if (!user.passwordHash) {
      const seedHash = bcrypt.hashSync('demo123', 10);
      db.run('UPDATE users SET passwordHash = ? WHERE id = ?', [seedHash, user.id], (e) => {
        if (e) console.error('Failed to set demo passwordHash:', e);
      });
    }
    // Sign a JWT for the user
    const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME', { expiresIn: '8h' });
    try { res.cookie('recess_user_jwt', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }); } catch (e) {}
    // Return token as convenience (client still gets cookie)
    res.json({ token });
  });
});

// Demo/user logout - clear cookie
app.post('/api/users/logout', (req, res) => {
  try { res.clearCookie('recess_user_jwt'); } catch (e) {}
  res.json({ ok: true });
});

// User login (email + password) - similar to parent login but for role 'user'
app.post('/api/users/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  db.get('SELECT * FROM users WHERE email = ? AND role = ? LIMIT 1', [email, 'user'], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const hash = user.passwordHash;
    if (!hash) return res.status(401).json({ error: 'invalid credentials' });
    const ok = bcrypt.compareSync(password, hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME', { expiresIn: '8h' });
    try { res.cookie('recess_user_jwt', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }); } catch (e) {}
    res.json({ token, id: user.id, email: user.email, displayName: user.displayName });
  });
});

// Session endpoint: returns basic session info (role/displayName) if the server recognizes a cookie or auth header
app.get('/api/session', (req, res) => {
  // Check admin cookie or header
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.recess_admin_token && cookies.recess_admin_token === CONFIG.adminToken) {
    return res.json({ role: 'admin', displayName: 'admin' });
  }
  // Check parent JWT cookie
  if (cookies.recess_parent_jwt) {
    try {
      const payload = jwt.verify(cookies.recess_parent_jwt, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME');
      return res.json({ role: 'parent', displayName: payload.email || payload.id });
    } catch (e) {}
  }
  // Check user JWT cookie
  if (cookies.recess_user_jwt) {
    try {
      const payload = jwt.verify(cookies.recess_user_jwt, CONFIG.jwtSecret || 'recess-jwt-secret-CHANGE_ME');
      // fetch displayName from DB
      db.get('SELECT displayName,email FROM users WHERE id = ? LIMIT 1', [payload.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'user not found' });
        return res.json({ role: 'user', displayName: row.displayName || row.email });
      });
      return;
    } catch (e) {}
  }
  // Not authenticated
  res.status(401).json({ authenticated: false });
});

// Parent logout - clear cookie
app.post('/api/parents/logout', (req, res) => {
  try { res.clearCookie('recess_parent_jwt'); } catch (e) {}
  res.json({ ok: true });
});

// Admin login endpoint to set an HttpOnly cookie for admin token (local dev)
app.post('/api/admin/login', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });
  if (token !== CONFIG.adminToken) return res.status(401).json({ error: 'invalid admin token' });
  try { res.cookie('recess_admin_token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }); } catch (e) {}
  res.json({ ok: true });
});

// Admin logout - clear cookie
app.post('/api/admin/logout', (req, res) => {
  try { res.clearCookie('recess_admin_token'); } catch (e) {}
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Recess server listening on http://localhost:${PORT}`);
});
