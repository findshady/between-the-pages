const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'books.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL, author TEXT NOT NULL, genre TEXT NOT NULL,
    book_condition TEXT NOT NULL, location TEXT NOT NULL,
    description TEXT NOT NULL, cover TEXT NOT NULL DEFAULT 'sage',
    status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id), book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, book_id)
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id),
    requester_id INTEGER NOT NULL REFERENCES users(id),
    owner_id INTEGER NOT NULL REFERENCES users(id),
    message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const sessions = new Map();
const hashPassword = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};
const verifyPassword = (password, stored) => {
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
};
const seedUser = (name, email) => {
  db.prepare('INSERT OR IGNORE INTO users (name,email,password_hash) VALUES (?,?,?)')
    .run(name, email, hashPassword('demo1234'));
  return db.prepare('SELECT id FROM users WHERE email=?').get(email).id;
};
if (db.prepare('SELECT COUNT(*) AS n FROM books').get().n === 0) {
  const a = seedUser('Aanya Rao', 'aanya@campus.edu');
  const b = seedUser('Kabir Mehta', 'kabir@campus.edu');
  const c = seedUser('Mira Sen', 'mira@campus.edu');
  const add = db.prepare(`INSERT INTO books (owner_id,title,author,genre,book_condition,location,description,cover)
    VALUES (?,?,?,?,?,?,?,?)`);
  [
    [a,'The Midnight Library','Matt Haig','Fiction','Like new','MIT Library','A moving story about the lives we could have lived. Clean pages and no markings.','violet'],
    [b,'Atomic Habits','James Clear','Self-growth','Good','Student Plaza','A practical guide to building better habits. A few highlighted pages.','peach'],
    [c,'The Psychology of Money','Morgan Housel','Business','Like new','Academic Block 1','Short, thoughtful chapters on how people think about money.','navy'],
    [a,'Norwegian Wood','Haruki Murakami','Fiction','Good','MIT Library','A quiet and beautiful novel. Slight wear on the cover.','forest'],
    [b,'A Brief History of Time','Stephen Hawking','Science','Good','Hostel Block 5','A classic introduction to the universe. All pages intact.','sky'],
    [c,'The Design of Everyday Things','Don Norman','Design','Like new','Student Plaza','A favorite for anyone curious about how useful things are designed.','coral'],
    [a,'Sapiens','Yuval Noah Harari','Non-fiction','Fair','Hostel Block 2','A sweeping history of humankind with some notes in pencil.','gold'],
    [b,'The Alchemist','Paulo Coelho','Fiction','Like new','Academic Block 1','A short, hopeful read about finding your path.','mint']
  ].forEach(row => add.run(...row));
}


// Add the philosophy collection once, including databases created before this collection.
db.exec("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)");
if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('philosophy-collection')) {
  const owner = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  const add = db.prepare(`INSERT INTO books (owner_id,title,author,genre,book_condition,location,description,cover) VALUES (?,?,?,?,?,?,?,?)`);
  const titles = [
    ['Meditations','Marcus Aurelius','Personal reflections on attention, character, and living well.','navy'],
    ['The Stranger','Albert Camus','A spare philosophical novel about alienation and the absurd.','peach'],
    ['The Republic','Plato','Dialogues on justice, education, and the shape of a good society.','forest'],
    ['Beyond Good and Evil','Friedrich Nietzsche','A challenging examination of morality, truth, and philosophical assumptions.','violet'],
    ['The Myth of Sisyphus','Albert Camus','An essay exploring absurdity and how to live in its presence.','gold'],
    ['Letters from a Stoic','Seneca','Practical letters on friendship, time, and self-command.','coral']
  ];
  db.exec('BEGIN');
  try {
    for (const [title,author,description,cover] of titles)
      add.run(owner.id,title,author,'Philosophy','Good','MIT Library',description,cover);
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run('philosophy-collection');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}
function fail(res, status, message) { send(res, status, { error: message }); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 30000) throw new Error('Request is too large.');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON.'); }
}
function currentUser(req) {
  const token = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const id = sessions.get(token);
  return id ? db.prepare('SELECT id,name,email FROM users WHERE id=?').get(id) : null;
}
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) fail(res, 401, 'Please sign in to continue.');
  return user;
}
function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
function bookQuery(where = '', params = [], userId = 0) {
  return db.prepare(`SELECT b.*, u.name AS owner_name,
    EXISTS(SELECT 1 FROM favorites f WHERE f.book_id=b.id AND f.user_id=?) AS is_favorite
    FROM books b JOIN users u ON u.id=b.owner_id ${where} ORDER BY b.created_at DESC, b.id DESC`)
    .all(userId, ...params);
}

async function api(req, res, url) {
  const method = req.method;
  const route = url.pathname;
  const user = currentUser(req);
  if (route === '/api/me' && method === 'GET') return send(res, 200, { user });
  if (route === '/api/register' && method === 'POST') {
    const input = await body(req);
    const name = clean(input.name, 60), email = clean(input.email, 120).toLowerCase();
    const password = String(input.password || '');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8)
      return fail(res, 400, 'Enter a name, valid email and password of at least 8 characters.');
    try {
      const result = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)')
        .run(name, email, hashPassword(password));
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, Number(result.lastInsertRowid));
      return send(res, 201, { user: { id: Number(result.lastInsertRowid), name, email } },
        { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` });
    } catch (error) {
      if (error.message.includes('UNIQUE')) return fail(res, 409, 'An account with this email already exists.');
      throw error;
    }
  }
  if (route === '/api/login' && method === 'POST') {
    const input = await body(req);
    const found = db.prepare('SELECT * FROM users WHERE email=?').get(clean(input.email,120).toLowerCase());
    if (!found || !verifyPassword(String(input.password || ''), found.password_hash))
      return fail(res, 401, 'Incorrect email or password.');
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, found.id);
    return send(res, 200, { user: { id: found.id, name: found.name, email: found.email } },
      { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` });
  }
  if (route === '/api/logout' && method === 'POST') {
    const token = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (route === '/api/books' && method === 'GET') {
    const q = clean(url.searchParams.get('q'), 100);
    const genre = clean(url.searchParams.get('genre'), 40);
    const condition = clean(url.searchParams.get('condition'), 40);
    let where = 'WHERE b.status=?', params = ['available'];
    if (q) { where += ' AND (b.title LIKE ? OR b.author LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (genre) { where += ' AND b.genre=?'; params.push(genre); }
    if (condition) { where += ' AND b.book_condition=?'; params.push(condition); }
    return send(res, 200, { books: bookQuery(where, params, user?.id) });
  }
  if (route === '/api/books' && method === 'POST') {
    if (!requireUser(req, res)) return;
    const input = await body(req);
    const title = clean(input.title, 100), author = clean(input.author, 80);
    const genre = clean(input.genre, 40), condition = clean(input.condition, 30);
    const location = clean(input.location, 80), description = clean(input.description, 500);
    const cover = clean(input.cover, 20);
    if (!title || !author || !['Philosophy','Fiction','Non-fiction','Science','Business','Design','Self-growth','Textbook'].includes(genre)
      || !['Like new','Good','Fair'].includes(condition) || !location || description.length < 10
      || !['violet','peach','navy','forest','sky','coral','gold','mint'].includes(cover))
      return fail(res, 400, 'Please complete every book field.');
    const result = db.prepare(`INSERT INTO books (owner_id,title,author,genre,book_condition,location,description,cover)
      VALUES (?,?,?,?,?,?,?,?)`).run(user.id,title,author,genre,condition,location,description,cover);
    return send(res, 201, { book: bookQuery('WHERE b.id=?',[Number(result.lastInsertRowid)],user.id)[0] });
  }
  const bookMatch = /^\/api\/books\/(\d+)$/.exec(route);
  if (bookMatch && method === 'GET') {
    const book = bookQuery("WHERE b.id=? AND b.status<>'removed'",[Number(bookMatch[1])],user?.id)[0];
    return book ? send(res, 200, { book }) : fail(res, 404, 'Book not found.');
  }
  if (bookMatch && method === 'DELETE') {
    if (!requireUser(req, res)) return;
    const book = db.prepare('SELECT * FROM books WHERE id=?').get(Number(bookMatch[1]));
    if (!book || book.owner_id !== user.id) return fail(res, 404, 'Your listing was not found.');
    const active = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE book_id=? AND status IN ('pending','accepted')").get(book.id).n;
    if (active) return fail(res, 409, 'Resolve active requests before removing this listing.');
    db.prepare('DELETE FROM favorites WHERE book_id=?').run(book.id);
    db.prepare("UPDATE books SET status='removed' WHERE id=?").run(book.id);
    return send(res, 200, { ok: true });
  }
  const favoriteMatch = /^\/api\/books\/(\d+)\/favorite$/.exec(route);
  if (favoriteMatch && method === 'POST') {
    if (!requireUser(req, res)) return;
    const bookId = Number(favoriteMatch[1]);
    if (!db.prepare('SELECT 1 FROM books WHERE id=? AND status=?').get(bookId,'available'))
      return fail(res, 404, 'Book not found.');
    const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND book_id=?').get(user.id,bookId);
    if (existing) db.prepare('DELETE FROM favorites WHERE user_id=? AND book_id=?').run(user.id,bookId);
    else db.prepare('INSERT INTO favorites (user_id,book_id) VALUES (?,?)').run(user.id,bookId);
    return send(res, 200, { favorite: !existing });
  }
  if (route === '/api/my/books' && method === 'GET') {
    if (!requireUser(req, res)) return;
    return send(res, 200, { books: bookQuery("WHERE b.owner_id=? AND b.status<>'removed'",[user.id],user.id) });
  }
  if (route === '/api/my/favorites' && method === 'GET') {
    if (!requireUser(req, res)) return;
    return send(res, 200, { books: bookQuery('JOIN favorites mine ON mine.book_id=b.id WHERE mine.user_id=? AND b.status=?',[user.id,'available'],user.id) });
  }
  if (route === '/api/requests' && method === 'POST') {
    if (!requireUser(req, res)) return;
    const input = await body(req), bookId = Number(input.bookId), message = clean(input.message,300);
    const book = db.prepare('SELECT * FROM books WHERE id=? AND status=?').get(bookId,'available');
    if (!book) return fail(res, 404, 'This book is no longer available.');
    if (book.owner_id === user.id) return fail(res, 400, 'You cannot request your own book.');
    if (message.length < 10) return fail(res, 400, 'Write a short message of at least 10 characters.');
    if (db.prepare("SELECT 1 FROM requests WHERE book_id=? AND requester_id=? AND status IN ('pending','accepted')").get(bookId,user.id))
      return fail(res, 409, 'You already have an active request for this book.');
    db.prepare('INSERT INTO requests (book_id,requester_id,owner_id,message) VALUES (?,?,?,?)')
      .run(bookId,user.id,book.owner_id,message);
    return send(res, 201, { ok: true });
  }
  if (route === '/api/requests' && method === 'GET') {
    if (!requireUser(req, res)) return;
    const rows = db.prepare(`SELECT r.*, b.title, b.author, b.cover, b.location,
      requester.name AS requester_name, requester.email AS requester_email,
      owner.name AS owner_name, owner.email AS owner_email
      FROM requests r JOIN books b ON b.id=r.book_id
      JOIN users requester ON requester.id=r.requester_id
      JOIN users owner ON owner.id=r.owner_id
      WHERE r.requester_id=? OR r.owner_id=? ORDER BY r.created_at DESC,r.id DESC`).all(user.id,user.id);
    return send(res, 200, { requests: rows });
  }
  const requestMatch = /^\/api\/requests\/(\d+)$/.exec(route);
  if (requestMatch && method === 'PATCH') {
    if (!requireUser(req, res)) return;
    const request = db.prepare('SELECT * FROM requests WHERE id=?').get(Number(requestMatch[1]));
    const status = clean((await body(req)).status,20);
    if (!request) return fail(res, 404, 'Request not found.');
    if (status === 'cancelled' && request.requester_id === user.id && request.status === 'pending') {
      db.prepare('UPDATE requests SET status=? WHERE id=?').run(status,request.id);
    } else if (['accepted','declined'].includes(status) && request.owner_id === user.id && request.status === 'pending') {
      db.prepare('UPDATE requests SET status=? WHERE id=?').run(status,request.id);
      if (status === 'accepted') {
        db.prepare("UPDATE requests SET status='declined' WHERE book_id=? AND id<>? AND status='pending'").run(request.book_id,request.id);
        db.prepare("UPDATE books SET status='reserved' WHERE id=?").run(request.book_id);
      }
    } else if (status === 'completed' && request.owner_id === user.id && request.status === 'accepted') {
      db.prepare('UPDATE requests SET status=? WHERE id=?').run(status,request.id);
      db.prepare("UPDATE books SET status='exchanged' WHERE id=?").run(request.book_id);
    } else return fail(res, 400, 'This action is not available for the request.');
    return send(res, 200, { ok: true });
  }
  return fail(res, 404, 'Endpoint not found.');
}

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
function staticFile(req, res, url) {
  const publicRoot = path.join(ROOT, 'public');
  const requested = path.resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!requested.startsWith(publicRoot + path.sep)) return fail(res, 403, 'Forbidden.');
  fs.readFile(requested, (error, content) => {
    if (error) return fail(res, 404, 'Page not found.');
    res.writeHead(200, { 'Content-Type': mime[path.extname(requested)] || 'application/octet-stream' });
    res.end(content);
  });
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await api(req,res,url);
    else if (req.method === 'GET') staticFile(req,res,url);
    else fail(res,405,'Method not allowed.');
  } catch (error) {
    console.error(error);
    fail(res, error.message === 'Invalid JSON.' || error.message === 'Request is too large.' ? 400 : 500,
      error.message === 'Invalid JSON.' || error.message === 'Request is too large.' ? error.message : 'Something went wrong.');
  }
});
if (require.main === module) {
  const host = process.env.HOST || '127.0.0.1';
  let port = Number(process.env.PORT || 3000);
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && !process.env.PORT && port < 3010) {
      console.log(`Port ${port} is occupied. Trying ${port + 1}...`);
      server.listen(++port, host);
      return;
    }
    console.error(`Could not start on ${host}:${port}: ${error.message}`);
    process.exitCode = 1;
  });
  server.on('listening', () => console.log(`Book Exchange at http://${host}:${port}`));
  server.listen(port, host);
}
module.exports = { api, db, server };
