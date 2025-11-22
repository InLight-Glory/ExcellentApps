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
  const token = (req.headers['x-admin-token'] || req.headers['authorization'] || '').toString();
  if (!token || token !== CONFIG.adminToken) return res.status(401).json({ error: 'admin token required' });
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
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    reporterId INTEGER,
    reason TEXT,
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
});

// Serve uploads
app.use('/uploads', express.static(UPLOADS_DIR));

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

// API: report a post (anyone)
app.post('/api/posts/:id/report', (req, res) => {
  const id = req.params.id;
  const { reporterId = null, reason = '' } = req.body || {};
  const createdAt = Date.now();
  db.run('INSERT INTO reports (postId, reporterId, reason, createdAt) VALUES (?, ?, ?, ?)', [id, reporterId, reason, createdAt], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    // mark the post as escalated for staff review
    db.run("UPDATE posts SET status='escalated' WHERE id = ?", [id], function (e) {
      if (e) console.error('Failed to mark escalated:', e);
      res.status(201).json({ reportId: this.lastID, escalated: true });
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
    res.json({ token });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Recess server listening on http://localhost:${PORT}`);
});
