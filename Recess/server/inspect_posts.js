const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, title, status, mediaUrl, mediaType, createdAt FROM posts ORDER BY createdAt DESC", [], (err, rows) => {
  if (err) {
    console.error('ERROR', err.message);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
