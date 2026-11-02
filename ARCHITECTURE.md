# Reconstructed architecture and agreed rebuild scope

Source: publicly served HTML, JavaScript bundle, CSS, and API responses from thethinkingbeyond.com, inspected 2026-11-02. The original source repository and server code are unavailable. This is an observed interface map, not a claim about unexposed implementation details.

## Observed architecture

- Frontend: single-page React application with React Router; static HTML loads a JavaScript bundle and stylesheet.
- Backend: Express API under `/api`, returning JSON. Authentication uses a bearer token stored by the frontend. Storage implementation is unknown.
- Public routes: `/`, `/episodes`, an individual episode route, `/contact`; About and Newsletter are sections on `/` reached through hash links.
- Public API: `GET /api/podcast`, `GET /api/episodes?sort=...`, `GET /api/episodes/:id`, `POST /api/episodes/:id/view`, `POST /api/newsletter`, `POST /api/contact`.
- Admin API: `POST /api/admin/login`, `GET /api/admin/me`, episode create/update/delete, `GET/PUT /api/episodes/order`, `GET /api/admin/messages`, `GET /api/admin/subscribers`, `GET /api/admin/settings`, `POST /api/admin/settings`, `POST /api/admin/settings/image`.
- The current admin create form asks for YouTube URL, title, guest, summary, publish date, and duration. It validates a YouTube URL, nonempty title, and nonempty summary. The site currently embeds YouTube video on individual episode pages.
- Current episode data includes ID, episode number, title, guest, summary, published date, duration, views, YouTube URL/ID, creation date, and rank. The public API does not currently expose topic tags.

## Confirmed user requirements

- Rebuild every current public and admin feature from the surviving website.
- Keep the admin workflow but redesign its screens.
- Adding a YouTube link should obtain the video's thumbnail and generate a short description and topic tags, then publish automatically.
- Make a distinct, high-quality visual redesign while preserving the existing site structure and navigation.
- Use YouTube playback on the page and keep icons restrained.

## Unknowns to resolve before production deployment

- Original database, backup, hosting configuration, and administrative credentials cannot be inferred from public code.
- The public bundle exposes endpoints and form behavior but not server validation, storage schema, authentication signing, email delivery, or data retention.
- YouTube title/description/thumbnail retrieval is straightforward for public videos; accurate generated summaries and tags depend on transcript availability or a separate generation service. The generation source and operating cost need a concrete choice.
- The public API data can seed a new database, but private admin records, messages, subscriber lists, and credentials require an authenticated export or new setup.

## Current local status

The `codebase` directory contains an early visual prototype. It does not reproduce the original backend or admin. Treat it as a design exploration; integrate or replace it against the reconstructed architecture above. Do not deploy it as a replacement for the live site until the missing behavior is implemented and verified.
