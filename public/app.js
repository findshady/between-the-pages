const $ = selector => document.querySelector(selector);
const app = $('#app');
const modalRoot = $('#modal-root');
const state = { user: null, books: [], shelfTab: 'listings', requestTab: 'incoming', search: '', genre: '', condition: '', initialized: false };

const icons = {
  arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
  pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type':'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  $('#toast-region').appendChild(node);
  setTimeout(() => node.remove(), 3800);
}
const coverISBNs = {"The Midnight Library": "9780525559474", "Atomic Habits": "9780735211292", "The Psychology of Money": "9780857197689", "Norwegian Wood": "9780375704024", "A Brief History of Time": "9780553380163", "The Design of Everyday Things": "9780465050659", "Sapiens": "9780062316097", "The Alchemist": "9780061122415", "Meditations": "9780140449334", "The Stranger": "9780679720201", "The Republic": "9780140455113", "Beyond Good and Evil": "9780140449235", "The Myth of Sisyphus": "9780679733737", "Letters from a Stoic": "9780140442106"};
function cover(book, cls = '') {
  const isbn = coverISBNs[book.title];
  if (isbn) return `<img class="cover real-cover ${cls}" src="https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg" alt="${escapeHTML(book.title)} book cover" loading="lazy" width="200" height="300">`;
  return `<div class="cover ${escapeHTML(book.cover || 'sage')} ${cls}" aria-label="Cover design for ${escapeHTML(book.title || 'your book')}">
    <span class="cover-kicker">Between the pages · A good read</span><span class="cover-ornament" aria-hidden="true"></span>
    <span class="cover-center"><span class="cover-title">${escapeHTML(book.title || 'Your next great read')}</span></span>
    <span class="cover-author">${escapeHTML(book.author || 'By you')}</span></div>`;
}
function bookCard(book, own = false) {
  return `<article class="book-card">
    <div class="book-art"><a class="card-click" href="#book/${book.id}" aria-label="View ${escapeHTML(book.title)}">${cover(book)}</a>
      ${!own ? `<button class="favorite-button ${book.is_favorite ? 'is-favorite' : ''}" data-action="favorite" data-id="${book.id}" aria-label="${book.is_favorite ? 'Remove from' : 'Add to'} favorites" aria-pressed="${!!book.is_favorite}">${icons.heart}</button>` : ''}
    </div>
    <div class="book-meta"><span class="book-category">${escapeHTML(book.genre)}</span><span class="book-condition">${escapeHTML(book.book_condition)}</span></div>
    <h3 class="book-title"><a href="#book/${book.id}">${escapeHTML(book.title)}</a></h3>
    <p class="book-author">by ${escapeHTML(book.author)}</p>
    <div class="book-location">${icons.pin}${escapeHTML(book.location)}</div>
    ${own ? `<div class="own-actions"><span class="status ${book.status === 'exchanged' ? 'completed' : book.status === 'reserved' ? 'pending' : 'accepted'}">${book.status === 'exchanged' ? 'Exchanged' : book.status === 'reserved' ? 'Reserved' : 'Available'}</span><button class="small-danger" data-action="delete-book" data-id="${book.id}">Remove listing</button></div>` : ''}
  </article>`;
}
function empty(title, message, button = '') {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true"></div><h3>${title}</h3><p>${message}</p>${button}</div>`;
}
function header() {
  const target = $('#header-actions');
  target.innerHTML = state.user
    ? `<span class="user-chip"><span class="avatar">${escapeHTML(state.user.name[0].toUpperCase())}</span><span>${escapeHTML(state.user.name.split(' ')[0])}</span></span><a href="#list" class="btn btn-primary btn-sm">${icons.plus} List a book</a><button class="icon-button" data-action="logout" aria-label="Sign out" title="Sign out">↪</button>`
    : `<button class="btn btn-ghost" data-action="auth" data-mode="login">Log in</button><button class="btn btn-primary btn-sm" data-action="auth" data-mode="register">Join the exchange ${icons.arrow}</button>`;
  const route = location.hash.slice(1).split('/')[0] || 'home';
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === route));
}
function hero() {
  return `<section class="hero"><div class="wrap hero-inner"><div class="hero-copy">
    <span class="eyebrow">Your campus book exchange</span>
    <h1>Done with it?<br><em>Someone isn’t.</em></h1>
    <p>Trade the books you’ve finished for the ones you keep meaning to read. Find a copy, message its owner, meet on campus.</p>
    <div class="hero-buttons"><a class="btn btn-primary" href="#explore">Explore books ${icons.arrow}</a><a class="btn btn-outline" href="#list">Share a book ${icons.plus}</a></div>
    <div class="hero-proof"><div class="proof-avatars" aria-hidden="true"><span>A</span><span>K</span><span>M</span><span>+</span></div><span>Fiction, philosophy, textbooks. No checkout total.</span></div>
  </div><div class="hero-art" aria-hidden="true"><div class="hero-orbit"></div><div class="hero-sun"></div><div class="hero-doodle"></div><div class="hero-stack">
    <div class="hero-book one">${cover({title:'The Stranger',author:'Albert Camus',cover:'violet'})}</div>
    <div class="hero-book two">${cover({title:'Meditations',author:'Marcus Aurelius',cover:'navy'})}</div>
    <div class="hero-book three">${cover({title:'The Republic',author:'Plato',cover:'forest'})}</div>
    <div class="hero-sticker">read it.<br>love it.<br>pass it on.</div></div></div></div></section>`;
}
function home() {
  const featured = state.books.slice(0,4);
  app.innerHTML = `${hero()}
    <div class="value-strip"><div class="wrap value-inner"><div class="value-item"><span class="value-icon">↔</span><div><strong>No listing fees</strong><span>Exchange directly with the owner</span></div></div><div class="value-item"><span class="value-icon"></span><div><strong>Used copies, clearly described</strong><span>Check the condition before you request</span></div></div><div class="value-item"><span class="value-icon">⌂</span><div><strong>Campus pickup</strong><span>Agree on a public meeting spot</span></div></div></div></div>
    <section class="section section-cream"><div class="wrap"><div class="section-header"><div><span class="eyebrow">Recently listed</span><h2 class="section-title">On someone’s shelf. Soon on yours.</h2></div><a href="#explore" class="text-link">Browse all books ${icons.arrow}</a></div><div class="book-grid">${featured.map(b => bookCard(b)).join('') || empty('A fresh page is coming','Be the first to list a book.','<a class="btn btn-primary" href="#list">List a book</a>')}</div></div></section>
    <section class="section" id="how-section"><div class="wrap"><div class="section-header"><div><span class="eyebrow">The exchange</span><h2 class="section-title">How it works</h2></div><p class="section-subtitle">Three steps. You arrange the meetup; we keep track of the request.</p></div><div class="how-grid"><div class="step-card"><span class="step-num">01.</span><h3>Find a copy</h3><p>Search a title or browse by genre. Check the condition and pickup location before requesting.</p></div><div class="step-card"><span class="step-num">02.</span><h3>Ask the owner</h3><p>Send a short note. Once accepted, use the contact link to agree on a time and place.</p></div><div class="step-card"><span class="step-num">03.</span><h3>Meet. Swap. Read.</h3><p>Meet on campus, check the copy, and mark the exchange complete. Your requests stay in your history.</p></div></div></div></section>
    <section class="quote-banner"><span class="quote-flower" aria-hidden="true"></span><div class="wrap quote-inner"><h2>Your shelf is full.<br><em>Someone’s reading list is longer.</em></h2><a href="#list" class="btn btn-dark">List a book ${icons.arrow}</a></div></section>`;
}
function pageHero(kicker, title, intro) {
  return `<section class="page-hero"><div class="wrap"><span class="eyebrow">${kicker}</span><h1 class="page-title">${title}</h1><p class="page-intro">${intro}</p></div></section>`;
}
function explore() {
  app.innerHTML = `${pageHero('The catalog','Explore books','Browse available copies. Filter by genre or condition, then ask the owner for an exchange.')}
    <section class="page-content"><div class="wrap"><div class="filter-bar"><label class="search-box">${icons.search}<input id="search-input" type="search" placeholder="Search title or author..." aria-label="Search books" value="${escapeHTML(state.search)}"></label>
    <label class="select-wrap"><span class="sr-only">Genre</span><select id="genre-filter" class="filter-select"><option value="">All genres</option>${['Philosophy','Fiction','Non-fiction','Science','Business','Design','Self-growth','Textbook'].map(x=>`<option ${state.genre===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label class="select-wrap"><span class="sr-only">Condition</span><select id="condition-filter" class="filter-select"><option value="">Any condition</option>${['Like new','Good','Fair'].map(x=>`<option ${state.condition===x?'selected':''}>${x}</option>`).join('')}</select></label></div>
    <div class="pill-row" id="genre-pills">${['All','Philosophy','Fiction','Non-fiction','Science','Business','Design','Self-growth','Textbook'].map(x=>`<button class="pill ${(state.genre || 'All')===x?'active':''}" data-action="genre" data-genre="${x==='All'?'':x}">${x}</button>`).join('')}</div>
    <div class="result-line"><span><strong id="result-count">${state.books.length}</strong> books to discover</span><span>Available on campus</span></div>
    <div class="book-grid" id="explore-grid">${state.books.map(b=>bookCard(b)).join('')}</div></div></section>`;
  refreshExplore();
}
async function refreshExplore() {
  const params = new URLSearchParams();
  if (state.search) params.set('q',state.search);
  if (state.genre) params.set('genre',state.genre);
  if (state.condition) params.set('condition',state.condition);
  try {
    const {books} = await api(`/api/books?${params}`);
    const grid = $('#explore-grid');
    if (!grid) return;
    grid.innerHTML = books.length ? books.map(b=>bookCard(b)).join('') : empty('No books found','Try another search or filter.');
    $('#result-count').textContent = books.length;
  } catch (error) { toast(error.message,true); }
}
function listPage() {
  if (!state.user) {
    app.innerHTML = `${pageHero('Add to the catalog','List a book','List a copy you’re ready to exchange.')}<section class="page-content"><div class="wrap">${empty('Join the exchange','Sign in to share a book from your shelf.','<button class="btn btn-primary" data-action="auth" data-mode="login">Sign in</button>')}</div></section>`;
    return;
  }
  app.innerHTML = `${pageHero('Add to the catalog','List a book','Add the title, condition, and a campus pickup location. Mention any underlining, notes, or damage.')}
    <section class="page-content"><div class="wrap form-shell"><div class="panel form-panel"><h2 class="panel-title">The book details</h2><p class="panel-caption">Use the details printed on your copy.</p>
      <form id="list-form"><div class="form-grid">
      <div class="field full"><label for="book-title">Book title *</label><input id="book-title" name="title" required maxlength="100" placeholder="e.g. The Midnight Library"></div>
      <div class="field"><label for="book-author">Author *</label><input id="book-author" name="author" required maxlength="80" placeholder="e.g. Matt Haig"></div>
      <div class="field"><label for="book-genre">Genre *</label><select id="book-genre" name="genre" required><option value="">Choose a genre</option>${['Philosophy','Fiction','Non-fiction','Science','Business','Design','Self-growth','Textbook'].map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label for="book-condition">Condition *</label><select id="book-condition" name="condition" required><option value="">Choose condition</option><option>Like new</option><option>Good</option><option>Fair</option></select></div>
      <div class="field"><label for="book-location">Exchange location *</label><input id="book-location" name="location" required maxlength="80" placeholder="e.g. MIT Library"><small>A public campus meeting spot works best.</small></div>
      <div class="field full"><label for="book-description">A note about this book *</label><textarea id="book-description" name="description" required minlength="10" maxlength="500" placeholder="What makes it a great read? Any notes or marks inside?"></textarea></div>
      <div class="field full"><label for="book-cover">Cover color *</label><select id="book-cover" name="cover"><option value="violet">Evening violet</option><option value="peach">Warm peach</option><option value="navy">Deep navy</option><option value="forest">Forest green</option><option value="sky">Sky blue</option><option value="coral">Terracotta</option><option value="gold">Golden hour</option><option value="mint">Soft mint</option></select><small>A simple cover design keeps your listing neat and readable.</small></div>
      </div><div class="form-actions"><p>By listing, you agree to meet safely in a public campus space.</p><button class="btn btn-primary" type="submit">Publish listing ${icons.arrow}</button></div></form></div>
      <aside><div class="panel preview-panel"><h3>Listing preview</h3><p>Here's how your book will look on the shelf.</p><div class="preview-art" id="book-preview">${cover({title:'Your next great read',author:'By you',cover:'violet'})}</div></div><div class="tip-card"><strong> A good listing gets noticed</strong><p>Include the book’s real condition and a short, honest note. Readers love knowing what makes it special.</p></div></aside>
    </div></section>`;
  $('#list-form').addEventListener('input', updatePreview);
  $('#list-form').addEventListener('change', updatePreview);
}
function updatePreview() {
  const form = $('#list-form');
  if (!form) return;
  const value = name => form.elements.namedItem(name).value;
  $('#book-preview').innerHTML = cover({title:value('title') || 'Your next great read',author:value('author') || 'By you',cover:value('cover')});
}
async function bookPage(id) {
  let book;
  try { ({book} = await api(`/api/books/${id}`)); } catch { app.innerHTML = pageHero('Page not found','Book not found','This story may have moved on.') + '<section class="page-content wrap"><a class="btn btn-primary" href="#explore">Explore books</a></section>'; return; }
  const own = state.user?.id === book.owner_id;
  app.innerHTML = `${pageHero('A closer look','${escapeHTML(book.title)}','Check the condition and location before requesting this copy.')}
    <section class="page-content"><div class="wrap"><a href="#explore" class="text-link">← Back to exploring</a><div class="panel detail-page-panel"><div class="detail-layout"><div class="detail-art">${cover(book)}</div><div><span class="eyebrow">${escapeHTML(book.genre)}</span><h2 class="detail-heading">${escapeHTML(book.title)}</h2><p class="book-author">by ${escapeHTML(book.author)}</p>
    <div class="detail-meta"><span>${escapeHTML(book.book_condition)} condition</span><span>${escapeHTML(book.location)}</span><span>${book.status==='available'?'Available for exchange':book.status==='reserved'?'Exchange in progress':'Already exchanged'}</span></div>
    <p class="detail-description">${escapeHTML(book.description)}</p><div class="detail-owner"><span class="avatar">${escapeHTML(book.owner_name[0])}</span><div><strong>Shared by ${escapeHTML(book.owner_name)}</strong><small>Meet at ${escapeHTML(book.location)}</small></div></div>
    <div class="detail-actions">${!own && book.status==='available' ? `<button class="btn btn-primary" data-action="request" data-id="${book.id}">Request this book ${icons.arrow}</button><button class="btn btn-outline" data-action="favorite" data-id="${book.id}">${book.is_favorite?'♥ Saved':'♡ Save book'}</button>` : own ? '<a class="btn btn-dark" href="#shelf">View on my shelf</a>' : '<span class="status completed">Exchanged</span>'}</div>
    </div></div></div></div></section>`;
}
async function shelfPage() {
  if (!state.user) return signedOutPage('My shelf','Keep your books and favorites in one cozy corner.');
  const endpoint = state.shelfTab==='listings' ? '/api/my/books' : '/api/my/favorites';
  const {books} = await api(endpoint);
  app.innerHTML = `${pageHero('Your account','My shelf','Manage your listings and find the books you’ve saved.')}
    <section class="page-content"><div class="wrap"><div class="shelf-top"><div class="tabs" role="tablist" aria-label="Shelf sections"><button role="tab" aria-selected="${state.shelfTab==='listings'}" class="tab ${state.shelfTab==='listings'?'active':''}" data-action="shelf-tab" data-tab="listings">My listings</button><button role="tab" aria-selected="${state.shelfTab==='favorites'}" class="tab ${state.shelfTab==='favorites'?'active':''}" data-action="shelf-tab" data-tab="favorites">Saved books</button></div><a class="btn btn-primary btn-sm" href="#list">${icons.plus} List a book</a></div>
      <div class="shelf-grid">${books.length ? books.map(b=>bookCard(b,state.shelfTab==='listings')).join('') : empty(state.shelfTab==='listings'?'No listings yet':'Nothing saved yet',state.shelfTab==='listings'?'List a book you’re ready to exchange.':'Explore and save books you want to read.',`<a class="btn btn-primary" href="#${state.shelfTab==='listings'?'list':'explore'}">${state.shelfTab==='listings'?'List a book':'Explore books'}</a>`)}</div>
    </div></section>`;
}
function signedOutPage(title, intro) {
  app.innerHTML = `${pageHero('Your space',title,intro)}<section class="page-content"><div class="wrap">${empty('Come on in','Sign in to see your books and requests.','<button class="btn btn-primary" data-action="auth" data-mode="login">Sign in</button>')}</div></section>`;
}
function requestCard(request) {
  const incoming = request.owner_id === state.user.id;
  const other = incoming ? request.requester_name : request.owner_name;
  let actions = '';
  if (request.status==='pending' && incoming) actions = `<button class="btn btn-dark btn-sm" data-action="request-status" data-id="${request.id}" data-status="accepted">Accept</button><button class="btn btn-light btn-sm" data-action="request-status" data-id="${request.id}" data-status="declined">Decline</button>`;
  else if (request.status==='pending' && !incoming) actions = `<button class="btn btn-light btn-sm" data-action="request-status" data-id="${request.id}" data-status="cancelled">Cancel request</button>`;
  else if (request.status==='accepted' && incoming) actions = `<button class="btn btn-dark btn-sm" data-action="request-status" data-id="${request.id}" data-status="completed">Mark exchanged</button>`;
  const contact = incoming ? request.requester_email : request.owner_email;
  return `<article class="request-card">${cover({title:request.title,author:request.author,cover:request.cover})}<div class="request-info"><span class="book-category">${incoming?'A reader requested your book':'Your request'}</span><h3>${escapeHTML(request.title)}</h3><p>${incoming?'From':'Shared by'} ${escapeHTML(other)} · ${escapeHTML(request.location)}</p><div class="request-message">“${escapeHTML(request.message)}”</div>${['accepted','completed'].includes(request.status)?`<a class="contact-link" href="mailto:${escapeHTML(contact)}">✉ Contact ${escapeHTML(other)} to arrange the exchange</a>`:''}</div><div class="request-side"><span class="status ${request.status}">${escapeHTML(request.status)}</span><div class="request-actions">${actions}</div></div></article>`;
}
async function requestsPage() {
  if (!state.user) return signedOutPage('Exchange requests','All the conversations that turn pages into new connections.');
  const {requests} = await api('/api/requests');
  const filtered = requests.filter(r => state.requestTab==='history' ? !['pending','accepted'].includes(r.status) : state.requestTab==='incoming' ? r.owner_id===state.user.id && ['pending','accepted'].includes(r.status) : r.requester_id===state.user.id && ['pending','accepted'].includes(r.status));
  app.innerHTML = `${pageHero('Your exchanges','Exchange requests','Accept incoming requests, check replies, and record completed exchanges.')}
    <section class="page-content"><div class="wrap"><div class="tabs" role="tablist" aria-label="Request sections"><button role="tab" aria-selected="${state.requestTab==='incoming'}" class="tab ${state.requestTab==='incoming'?'active':''}" data-action="request-tab" data-tab="incoming">Incoming</button><button role="tab" aria-selected="${state.requestTab==='outgoing'}" class="tab ${state.requestTab==='outgoing'?'active':''}" data-action="request-tab" data-tab="outgoing">Sent by me</button><button role="tab" aria-selected="${state.requestTab==='history'}" class="tab ${state.requestTab==='history'?'active':''}" data-action="request-tab" data-tab="history">History</button></div>
      <div class="request-list">${filtered.length ? filtered.map(requestCard).join('') : empty('Nothing here yet',state.requestTab==='incoming'?'When someone requests your book, you’ll see it here.':state.requestTab==='outgoing'?'Find a book you love and send a request.':'Completed and closed exchanges will live here.',state.requestTab==='outgoing'?'<a class="btn btn-primary" href="#explore">Explore books</a>':'<a class="btn btn-primary" href="#list">List a book</a>')}</div>
    </div></section>`;
}
function howPage() { home(); setTimeout(()=>$('#how-section')?.scrollIntoView({behavior:'smooth'}),50); }
async function render() {
  header();
  const route = location.hash.slice(1) || 'home';
  try {
    if (route==='home') home();
    else if (route==='explore') explore();
    else if (route==='list') listPage();
    else if (route==='shelf') await shelfPage();
    else if (route==='requests') await requestsPage();
    else if (route==='how') howPage();
    else if (route.startsWith('book/')) await bookPage(route.split('/')[1]);
    else home();
    
  } catch (error) { toast(error.message,true); }
}
function closeModal() { modalRoot.classList.remove('open'); modalRoot.innerHTML=''; document.body.style.overflow=''; }
function showModal(content, wide = false) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true"><button class="icon-button modal-close" data-action="close-modal" aria-label="Close dialog">✕</button>${content}</div>`;
  modalRoot.classList.add('open'); document.body.style.overflow='hidden';
  modalRoot.querySelector('input,textarea,button:not(.modal-close)')?.focus();
}
function authModal(mode = 'login') {
  const register = mode==='register';
  showModal(`<span class="eyebrow">${register?'Create an account':'Welcome back'}</span><h2>${register?'Join the exchange':'Log in'}</h2><p class="modal-intro">${register?'Save books, publish listings, and request exchanges.':'Log in to manage your listings and requests.'}</p>
    <form id="auth-form" data-mode="${mode}">${register?'<div class="field"><label for="auth-name">Your name</label><input id="auth-name" name="name" required minlength="2" maxlength="60" autocomplete="name" placeholder="Your full name"></div>':''}
    <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" required type="email" autocomplete="email" placeholder="you@campus.edu"></div>
    <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" required type="password" minlength="${register?8:1}" autocomplete="${register?'new-password':'current-password'}" placeholder="${register?'At least 8 characters':'Enter your password'}"></div>
    <button class="btn btn-primary" type="submit">${register?'Create account':'Log in'} ${icons.arrow}</button></form>
    <p class="modal-switch">${register?'Already have an account?':'New around here?'} <button data-action="auth" data-mode="${register?'login':'register'}">${register?'Log in':'Create an account'}</button></p>
    ${register?'':`<div class="demo-note"><strong>Just exploring?</strong> Try <b>aanya@campus.edu</b> with password <b>demo1234</b>.</div>`}`);
}
function requestModal(id) {
  if (!state.user) return authModal('login');
  const book = state.books.find(b => b.id===id);
  showModal(`<span class="eyebrow">Request an exchange</span><h2>Request this book</h2><p class="modal-intro">Send the owner a friendly note. You can arrange the exchange after they accept.</p>
    <form id="request-form" data-id="${id}"><div class="field"><label for="request-message">Your message</label><textarea id="request-message" name="message" required minlength="10" maxlength="300" placeholder="Hi! I'd love to read this book. I can meet at the library this week."></textarea></div><button class="btn btn-primary" type="submit">Send request ${icons.arrow}</button></form>
    <div class="demo-note">${book?`Requesting <strong>${escapeHTML(book.title)}</strong>. `:''}Meet in a public campus space and check the book before exchanging.</div>`);
}
async function loadBooks() { state.books = (await api('/api/books')).books; }
let searchTimer;
document.addEventListener('input', event => {
  if (event.target.id==='search-input') {
    state.search = event.target.value;
    clearTimeout(searchTimer); searchTimer = setTimeout(refreshExplore,250);
  }
});
document.addEventListener('change', event => {
  if (event.target.id==='genre-filter') { state.genre=event.target.value; explore(); }
  if (event.target.id==='condition-filter') { state.condition=event.target.value; explore(); }
});
document.addEventListener('click', async event => {
  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const {action,id,mode,genre,tab,status} = actionNode.dataset;
  try {
    if (action==='auth') authModal(mode);
    if (action==='close-modal') closeModal();
    if (action==='genre') { state.genre=genre; explore(); }
    if (action==='shelf-tab') { state.shelfTab=tab; await shelfPage(); }
    if (action==='request-tab') { state.requestTab=tab; await requestsPage(); }
    if (action==='request') requestModal(Number(id));
    if (action==='logout') { await api('/api/logout',{method:'POST'}); state.user=null; await loadBooks(); toast('Signed out. See you soon!'); await render(); }
    if (action==='favorite') {
      if (!state.user) return authModal('login');
      const result = await api(`/api/books/${id}/favorite`,{method:'POST'});
      toast(result.favorite?'Saved to your shelf.':'Removed from saved books.');
      await loadBooks(); await render();
    }
    if (action==='request-status') {
      await api(`/api/requests/${id}`,{method:'PATCH',body:JSON.stringify({status})});
      toast(status==='accepted'?'Request accepted. Arrange a campus meetup!':status==='completed'?'Exchange marked complete. Happy reading!':`Request ${status}.`);
      await loadBooks(); await requestsPage();
    }
    if (action==='delete-book') {
      if (!confirm('Remove this book listing?')) return;
      await api(`/api/books/${id}`,{method:'DELETE'}); toast('Listing removed.'); await loadBooks(); await shelfPage();
    }
  } catch (error) { toast(error.message,true); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['auth-form','list-form','request-form'].includes(form.id)) return;
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  submit.disabled=true;
  try {
    if (form.id==='auth-form') {
      const input = Object.fromEntries(new FormData(form));
      const result = await api(`/api/${form.dataset.mode==='register'?'register':'login'}`,{method:'POST',body:JSON.stringify(input)});
      state.user=result.user; closeModal(); await loadBooks(); toast(`Welcome${form.dataset.mode==='register'?' to the exchange':' back'}, ${state.user.name.split(' ')[0]}!`); await render();
    }
    if (form.id==='list-form') {
      const input=Object.fromEntries(new FormData(form));
      const result=await api('/api/books',{method:'POST',body:JSON.stringify(input)});
      await loadBooks(); toast('Your book is on the shelf!'); location.hash=`#book/${result.book.id}`;
    }
    if (form.id==='request-form') {
      const input={bookId:Number(form.dataset.id),message:form.elements.namedItem('message').value};
      await api('/api/requests',{method:'POST',body:JSON.stringify(input)});
      closeModal(); toast('Request sent! Watch your requests for updates.'); location.hash='#requests'; state.requestTab='outgoing'; await render();
    }
  } catch (error) { toast(error.message,true); }
  finally { submit.disabled=false; }
});
document.addEventListener('keydown', event => { if (event.key==='Escape') closeModal(); });
$('#menu-toggle').addEventListener('click', () => { const nav=$('#mobile-nav'); nav.classList.toggle('open'); $('#menu-toggle').setAttribute('aria-expanded',String(nav.classList.contains('open'))); });
$('#mobile-nav').addEventListener('click', event => { if(event.target.closest('a')) { $('#mobile-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false'); } });
window.addEventListener('hashchange', async () => { window.scrollTo(0, 0); await render(); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) app.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'cubic-bezier(.2,.7,.2,1)'}); });
(async () => {
  try { state.user=(await api('/api/me')).user; await loadBooks(); await render(); }
  catch (error) { app.innerHTML=empty('Could not load the exchange',escapeHTML(error.message)); }
})();

// External cover services can fail; keep the title readable when they do.
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('real-cover')) return;
  const fallback = document.createElement('div');
  fallback.className = 'cover cover-image-failed';
  fallback.textContent = image.alt.replace(/ book cover$/, '');
  image.replaceWith(fallback);
}, true);
