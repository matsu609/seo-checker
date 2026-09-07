# Next.js 16 notes（このリポジトリで使っている版の要点）

Installed: `next@16.3.4`, `react@19.2.8`, Node 22, TypeScript strict, Turbopack (default). `next.config.ts` is empty: **`cacheComponents` is OFF**, so the "previous" caching model applies (see §7). Bundled, version-matched docs live in `node_modules/next/dist/docs/01-app/` — read those, not memory. Key files: `01-getting-started/{03-layouts-and-pages,05-server-and-client-components,15-route-handlers,16-proxy}.md`, `02-guides/{streaming,upgrading/version-16,caching-without-cache-components}.md`, `03-api-reference/03-file-conventions/{layout,page,route,error,loading,proxy}.md`.

## 1. Things that break Next 14/15-style code

| Next 14/15 habit | Next 16 (this repo) |
|---|---|
| `params.slug`, `searchParams.q` read synchronously | **Promises.** `const { slug } = await params`. Sync access was removed in 16 (15 only warned). Client components use `use(params)`. |
| `cookies().get()`, `headers().get()` | `(await cookies()).get()`, `(await headers()).get()`. Same for `draftMode()`. |
| `middleware.ts` exporting `middleware` | `proxy.ts` (at `src/proxy.ts`, same level as `app/`) exporting `proxy` (or default). Runtime is Node only, not configurable. `middleware.ts` still works but is deprecated. |
| `export const runtime = 'edge'` | **Deprecated.** Default and only supported value is `'nodejs'`; `preferredRegion` deprecated too. |
| `next lint`, `eslint` key in next.config | Removed. Run `npx eslint <paths>` (flat config in `eslint.config.mjs`). `next build` no longer lints. |
| `revalidateTag('x')` | Requires a profile: `revalidateTag('x', 'max')`. `cacheLife`/`cacheTag` lost the `unstable_` prefix. |
| `experimental.ppr` / `dynamicIO` / `useCache`, `experimental_ppr` export | Removed; the single switch is `cacheComponents: true` (not enabled here). |
| `error.tsx` receives `{ error, reset }` | Receives `{ error, retry }` (stable in 16.3; `reset` still exists but `retry` re-fetches and is preferred). |
| Parallel route slot without `default.js` | Build fails; every `@slot` needs `default.tsx`. |
| `useRouter` from `next/router`, `router.query`, `router.events` | `next/navigation` only; `usePathname()` / `useSearchParams()` instead of `pathname`/`query`. |
| `serverRuntimeConfig` / `publicRuntimeConfig`, `next/amp`, `next/legacy/image`, `images.domains` | Removed / deprecated. Use env vars (`NEXT_PUBLIC_` for client). |
| dev output in `.next/` | `next dev` writes to `.next/dev/`; `next build` to `.next/`. tsconfig includes both `types/` dirs. |

## 2. App Router file conventions

Hierarchy per segment (outer → inner): `layout` → `template` → `error` (error boundary) → `loading` (Suspense) → `not-found` → `page` or child `layout`. A segment is public only when it has `page.tsx` or `route.ts`; `route.ts` and `page.tsx` **cannot** share a segment (`app/api/x/route.ts` next to `app/page.tsx` is fine). `(group)` folders are omitted from the URL, `_folder` is never routable, so components/helpers can be colocated.

```tsx
// app/layout.tsx  — Server Component. Root layout MUST render <html> and <body>.
// Never hand-write <head>/<title>/<meta>; use the metadata export.
import type { Metadata } from "next";
export const metadata: Metadata = { title: "...", description: "..." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}

// app/tools/rank/page.tsx — Server Component by default; may be async.
export default async function Page({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;           // reading it makes the page dynamic
  return <RankTool initialQuery={typeof q === "string" ? q : ""} />;
}

// app/blog/[slug]/page.tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
}

// app/tools/rank/loading.tsx — wraps page in <Suspense>; shown instantly on navigation.
export default function Loading() { return <p>読み込み中…</p>; }

// app/tools/rank/error.tsx — MUST be a Client Component.
"use client";
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <button onClick={() => retry()}>再試行</button>;   // error.message is generic in prod for server errors
}
```

- Layouts do **not** re-render on navigation and cannot read `searchParams` or the pathname; do that in a Client Component (`usePathname`, `useSearchParams`) or in `page.tsx`.
- Layouts cannot pass data to `children`; fetch in both places and dedupe with `React.cache` / `fetch` memoization.
- Global typed helpers `PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/api/x/[id]'>` exist **only after** `next dev` / `next build` / `next typegen` regenerated `.next/types/routes.d.ts`. The committed file only knows `/`, `/api/analyze`, `/api/faq`, `/api/site`, so `PageProps<'/tools/rank'>` fails `tsc` until typegen runs. **Prefer the explicit inline prop types above** in parallel work; do not run `next dev`/`next build` for this.

## 3. Route Handlers (`app/api/<feature>/route.ts`)

```ts
import { NextRequest } from "next/server";
export const runtime = "nodejs";   // default anyway; 'edge' is deprecated
export const maxDuration = 60;     // seconds; platform limit hint (existing routes use 60 / 300)

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");      // NextRequest = Request + nextUrl + cookies
  return Response.json({ q });
}
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 }); }
  // zod-validate body here; return { error } + status on failure (ARCHITECTURE.md convention)
  return Response.json({ result: "..." });
}
// Dynamic segment: app/api/items/[id]/route.ts
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return new Response(null, { status: 204 });
}
```

- Supported exports: `GET HEAD POST PUT PATCH DELETE OPTIONS` (OPTIONS auto-implemented). Unknown method → 405. Body via `request.json() / .formData() / .text()`; no `bodyParser` config.
- `GET` handlers are **dynamic by default** (since 15); `export const dynamic = 'force-static'` (+ `revalidate = N`) opts a GET into caching. Other methods never cache.
- `cookies()` / `headers()` from `next/headers` are async. In a Route Handler `(await cookies()).get/set/delete` all work; `headers()` is read-only (set response headers on the `Response`). `redirect()` / `notFound()` from `next/navigation` also work in handlers.
- `after(() => …)` from `next/server` runs work after the response is sent (logging, cleanup) within `maxDuration`. `connection()` forces request-time execution.
- Route Handlers are plain functions: in vitest (`environment: "node"`) `import { POST } from "@/app/api/analyze/route"` and call it with `new NextRequest("http://localhost/api/analyze", { method: "POST", body })` — verified to work with the existing analyze route (bad JSON → 400).

### Streaming from a Route Handler (verified against `02-guides/streaming.md`)

```ts
export async function POST(request: NextRequest) {
  // 1. validate input FIRST — once the stream starts, status/headers are frozen (always 200).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of produceChunks()) {                     // e.g. Anthropic client.messages.stream(...)
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));   // NDJSON: one JSON object per line
          // SSE variant: encoder.encode(`event: delta\ndata: ${JSON.stringify(chunk)}\n\n`)
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: "生成中にエラーが発生しました" }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",   // SSE: "text/event-stream; charset=utf-8"
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",                                 // nginx-style proxies buffer otherwise
    },
  });
}
```

- The docs' canonical shape is exactly `new ReadableStream({ async start(controller) { controller.enqueue(encoder.encode(...)); controller.close(); } })` returned as `new Response(stream, { headers })`; an async-iterator → `pull()` adapter is the other documented form. `maxDuration` still bounds the whole stream.
- Client side: `const reader = res.body!.getReader(); const dec = new TextDecoder();` loop `reader.read()` and split on `\n` (keep the trailing partial line in a buffer). WebKit buffers the first 1024 bytes, `curl -N` needs newlines to flush — do not "fix" that in code.
- Mid-stream errors must be sent **in-band** (a final `{ error }` line) because the status code can no longer change; also log them server-side.

## 4. Server vs Client Components

- Everything under `app/` is a Server Component unless the file starts with `"use client"` (above imports). Server Components can be `async`, read env/secrets, and import server-only modules; they cannot use hooks, state, effects, event handlers, `window`/`localStorage`, or React context.
- `"use client"` marks a **boundary**: that file and everything it imports goes to the client bundle. Do not add it to every file — only to entry points rendered from Server Components.
- Props crossing the boundary must be serializable (no functions, class instances, `URL`). Server Components may be passed **as `children`/props** into a Client Component; they are rendered on the server and slotted in.
- `metadata` / `generateMetadata` exports work **only in Server Components**. So keep `page.tsx` a thin Server Component that renders a client component from `src/components/<feature>/`, exactly like `src/app/page.tsx` → `<Checker />`.
- `localStorage` (the `src/lib/store/` layer) is client-only: read it inside `useEffect`/event handlers, or guard with `typeof window !== "undefined"`; never at module top level, and never in Server Components or Route Handlers.
- Only `NEXT_PUBLIC_*` env vars reach the client; others become `""` there. Keep API keys in `src/lib/*` used from Route Handlers.

### Client shell (sidebar with `usePathname`) wrapping `children` in the root layout

```tsx
// src/components/shell/AppShell.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { features } from "@/lib/features/registry";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();                       // client hook; updates on every navigation
  return (
    <div className="flex min-h-full">
      <nav aria-label="メインナビゲーション">
        {features.map((f) => (
          <Link key={f.path} href={f.path} aria-current={pathname === f.path ? "page" : undefined}>
            {f.label}
          </Link>
        ))}
      </nav>
      <main className="flex-1">{children}</main>          {/* children = Server Component pages, passed as a slot */}
    </div>
  );
}

// src/app/layout.tsx (stays a Server Component; keeps the metadata export)
import { AppShell } from "@/components/shell/AppShell";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ja"><body><AppShell>{children}</AppShell></body></html>);
}
```

This is the documented "context provider / interleaving" pattern: the layout does not become a Client Component, pages remain Server Components, and `usePathname` re-renders only the shell. With `cacheComponents` off no `<Suspense>` is required around `usePathname`. `useSearchParams` on a prerendered page is different: it de-opts the client tree up to the nearest `<Suspense>` boundary to client rendering (Next reports `blocking-prerender-client-hook` without one), so wrap the component that calls it in `<Suspense fallback={…}>`.

## 5. `next/link` and `next/navigation`

- `<Link href="/tools/rank">` (string or `{ pathname, query }`), props `replace`, `scroll`, `prefetch` (`true | false | "auto" | null`), `onNavigate`, `transitionTypes`; plain `<a>` attributes (`className`, `target`) pass through. Use `<Link>` for all internal navigation so prefetching and client-side transitions work; reserve `<a>` for external URLs.
- `useRouter()` → `push(href, { scroll })`, `replace`, `refresh()` (re-fetches Server Components, keeps client state), `back()`, `forward()`, `prefetch()`. Never pass untrusted URLs to `push`/`replace`.
- `usePathname()` → string; `useSearchParams()` → read-only `URLSearchParams`; `useParams()`; `useSelectedLayoutSegment(s)()` for active-section logic in layouts. All are Client-only hooks.
- Server side: `redirect()`, `permanentRedirect()`, `notFound()` from `next/navigation` (throw; call before any `await` that could start streaming if you need a real 404 status).

## 6. Metadata

`export const metadata: Metadata = { title, description, openGraph, robots, … }` from any `layout.tsx`/`page.tsx` Server Component; nested segments merge/override. Dynamic: `export async function generateMetadata({ params }: { params: Promise<{…}> }, parent: ResolvingMetadata): Promise<Metadata>`. Not both in one file. Root layout already sets the site title/description; a tool page can export its own `metadata` (e.g. `title: "順位計測 | SEO Checker"`) as long as `page.tsx` is not `"use client"`. `favicon.ico` in `app/` is picked up automatically.

## 7. Caching / rendering model in this repo (`cacheComponents` OFF)

- Pages are prerendered when they touch no request-time API; `await searchParams`, `cookies()`, `headers()`, `connection()` or `fetch(..., { cache: "no-store" })` make them dynamic. Route Handlers run per request.
- `fetch()` in server code is **not cached by default**; opt in with `{ cache: "force-cache" }` or `{ next: { revalidate: N, tags: [...] } }`. `unstable_cache` exists for non-fetch functions. The project's own memoization is the in-process `globalCache(name, ttlMs)` from `src/lib/cache.ts` — reuse it.
- Segment config available here: `dynamic`, `revalidate`, `fetchCache`, `dynamicParams`, `runtime`, `maxDuration`. `revalidate` must be a literal number.
- **Do not write `'use cache'`, `cacheLife()`, `cacheTag()`, `instant`, or `prefetch` segment exports** — they require `cacheComponents: true`, which is a whole-app migration (it also removes `dynamic`/`revalidate`/`fetchCache` and demands `<Suspense>` around all uncached reads). Do not flip that flag in `next.config.ts`.
- Turbopack is the bundler; adding a `webpack` key to the config makes `next build` fail.

## 8. How the existing app uses all this

- `src/app/layout.tsx`: Server Component, `export const metadata`, `<html lang="ja">` + `<body className="min-h-full flex flex-col bg-surface text-ink">`, imports `./globals.css` (Tailwind v4 `@theme` tokens). Only the shared-files owner (基盤担当, per ARCHITECTURE.md) edits it; that is where `AppShell` gets mounted around `{children}`.
- `src/app/page.tsx`: three-line Server Component returning `<Checker />`; all interactivity lives in `src/components/Checker.tsx` (`"use client"`, `useState`/`useEffect`, `fetch("/api/analyze")`). Copy this split for `src/app/tools/<feature>/page.tsx` → `src/components/<feature>/`.
- `src/app/api/analyze/route.ts`, `api/site/route.ts`: `POST(request: NextRequest)`; `request.json()` in try/catch → 400 `{ error }`; input checks → 400; `globalCache<T>("name", ttl)` lookup returning `{ result, cached: true }`; `FetchError.code` `invalid_url`/`blocked_host` → 400, other fetch failures → 502; unexpected → `console.error("[name] …")` + 500. All user-facing strings are Japanese. Both set `maxDuration` (60 / 300); `analyze` and `faq` also set `runtime = "nodejs"` explicitly.
- `src/app/api/faq/route.ts`: `GET` returns a capability flag `{ enabled }` (the pattern `GET /api/integrations` follows); `POST` maps Anthropic SDK errors (`AuthenticationError` 503, `RateLimitError` 429, `APIError` 502) and hashes the cache key with `crypto.subtle`. Long generations (writing tools) should instead stream as in §3.
- URL fetching always goes through `normalizeUrl` → `assertPublicHost` → `fetchText` in `src/lib/analyzer/fetch.ts`; never `fetch()` a user URL directly from a handler.
- Verification without touching the dev server: `npx tsc --noEmit 2>&1 | grep "src/<your dir>"`, `npx eslint src/<your dir>`, `npx vitest run src/lib/<feature>/__tests__/x.test.ts` (vitest `environment: "node"`, alias `@` → `src`). `next build` is the orchestrator's final gate only.
