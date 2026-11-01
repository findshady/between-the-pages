const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'book-exchange-test-'));
const { api, db } = require('../server');

async function call(method, route, payload, cookie = '') {
  const req = {
    method,
    headers: { cookie },
    async *[Symbol.asyncIterator]() { if (payload) yield JSON.stringify(payload); }
  };
  const res = {
    status: 0, headers: {}, raw: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.raw = value; }
  };
  await api(req, res, new URL(route, 'http://localhost'));
  return { status: res.status, headers: res.headers, data: JSON.parse(res.raw) };
}

test('a book can be listed, requested and exchanged by two users', async () => {
  const owner = await call('POST','/api/login',{email:'aanya@campus.edu',password:'demo1234'});
  const reader = await call('POST','/api/login',{email:'kabir@campus.edu',password:'demo1234'});
  assert.equal(owner.status, 200);
  assert.equal(reader.status, 200);
  const ownerCookie = owner.headers['Set-Cookie'].split(';')[0];
  const readerCookie = reader.headers['Set-Cookie'].split(';')[0];

  const listing = await call('POST','/api/books',{
    title:'A Test Book',author:'A Reader',genre:'Fiction',condition:'Good',
    location:'Campus Library',description:'A lovely and readable copy.',cover:'mint'
  }, ownerCookie);
  assert.equal(listing.status, 201);
  const id = listing.data.book.id;
  assert.equal((await call('GET','/api/books?q=A%20Test')).data.books.some(b=>b.id===id),true);

  const favorite = await call('POST',`/api/books/${id}/favorite`,{},readerCookie);
  assert.equal(favorite.data.favorite,true);
  assert.equal((await call('GET','/api/my/favorites',null,readerCookie)).data.books.some(b=>b.id===id),true);

  const request = await call('POST','/api/requests',{bookId:id,message:'I would love to read this book.'},readerCookie);
  assert.equal(request.status,201);
  const incoming = await call('GET','/api/requests',null,ownerCookie);
  const requestId = incoming.data.requests.find(r=>r.book_id===id).id;
  assert.equal((await call('PATCH',`/api/requests/${requestId}`,{status:'accepted'},ownerCookie)).status,200);
  assert.equal((await call('GET','/api/books')).data.books.some(b=>b.id===id),false);
  assert.equal((await call('PATCH',`/api/requests/${requestId}`,{status:'completed'},ownerCookie)).status,200);
  assert.equal((await call('GET','/api/requests',null,readerCookie)).data.requests.find(r=>r.id===requestId).status,'completed');
  assert.equal((await call('DELETE',`/api/books/${id}`,null,ownerCookie)).status,200);
  assert.equal((await call('GET','/api/requests',null,readerCookie)).data.requests.find(r=>r.id===requestId).status,'completed');
});

test('unauthenticated listings and self requests are rejected', async () => {
  assert.equal((await call('POST','/api/books',{})).status,401);
  const owner = await call('POST','/api/login',{email:'aanya@campus.edu',password:'demo1234'});
  const cookie = owner.headers['Set-Cookie'].split(';')[0];
  const ownBook = db.prepare('SELECT id FROM books WHERE owner_id=? LIMIT 1').get(owner.data.user.id);
  assert.equal((await call('POST','/api/requests',{bookId:ownBook.id,message:'Can I have my own book?'},cookie)).status,400);
});
