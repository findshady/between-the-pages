# Between the Pages

A responsive campus book exchange. Students can discover books, list their own copies, save favorites, request an exchange, and track each request through completion.

## Run locally

Requires Node.js 22.13 or newer. The project uses Node's built-in HTTP server and SQLite module, so there are no packages to install.

```bash
npm start
```

Open the URL printed in the terminal (normally `http://127.0.0.1:3000`). The database is created automatically in `data/books.db` with fourteen sample books and three demo users.

| Demo user | Email | Password |
| --- | --- | --- |
| Aanya Rao | `aanya@campus.edu` | `demo1234` |
| Kabir Mehta | `kabir@campus.edu` | `demo1234` |
| Mira Sen | `mira@campus.edu` | `demo1234` |

You can also register a new account.

## Features

1. Register, sign in, and sign out.
2. Browse books and search by title or author.
3. Filter available books by genre and condition.
4. Publish a listing with condition, location, description, and cover theme.
5. Save books to a personal shelf.
6. Send an exchange request with a message.
7. Accept, decline, cancel, and complete requests.
8. View owned listings, saved books, and exchange history.

## Project structure

| File | Purpose |
| --- | --- |
| `public/index.html` | Semantic HTML shell and navigation |
| `public/styles.css` | Responsive visual design |
| `public/app.js` | Pages, forms, client-side validation, API calls |
| `server.js` | HTTP API, server-side validation, sessions, SQLite queries |
| `test/app.test.js` | End-to-end API flow and permission tests |

The browser exchanges JSON with `/api/...` routes. The server validates each write, stores users, books, favorites, and requests in SQLite, and sends JSON responses. Session IDs are stored in an HTTP-only cookie. Passwords are hashed with `scrypt`.

## Test

```bash
npm test
```

The test covers listing a book, finding it in search, saving it, requesting it from another account, accepting the request, and completing the exchange. It also checks that an unauthenticated user cannot list a book and an owner cannot request their own book.

## Cover images

Catalog cover images are requested by ISBN from the [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers). They require internet access. A title fallback appears if a cover fails to load. The philosophy collection is added once to existing databases without deleting user listings.

## Deploy on Render

The included `render.yaml` configures a free web service. Push the source to GitHub, then select New > Blueprint in Render and connect that repository. Render supplies PORT; the configuration sets HOST to 0.0.0.0 and Node to version 24.

Free Render services have temporary filesystems: accounts, listings, and exchanges stored in SQLite can disappear after a restart or redeploy. For persistent use, select a paid web service, attach a disk mounted at `/var/data`, and set `DATA_DIR=/var/data`. Sessions currently live in memory, so users must log in again after a server restart even with a persistent disk.
