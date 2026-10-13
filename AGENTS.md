# Agent notes

This is a Next.js 16 App Router project. Read the version-matched docs in
`node_modules/next/dist/docs/` before relying on remembered APIs (e.g. `proxy.ts`
replaces `middleware.ts`, request APIs such as `cookies()` and `params` are async).

- Database: `supabase/migrations/*.sql` is the source of truth. After changing it run
  `npm run db:types` to regenerate `src/types/database.ts`, then `npm run test:db`.
- Never use the service-role client (`src/lib/supabase/admin.ts`) for a request before
  authorizing the caller with the user-scoped client or an RLS-checked RPC.
- UI strings live in `messages/ar.json` and `messages/en.json` (Arabic is the default locale).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
