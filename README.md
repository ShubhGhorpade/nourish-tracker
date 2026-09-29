# Nourish — Personal Nutrition Memory

Nourish is a local-first personal nutrition tracker built around one rule:

> **AI interprets. Databases quantify. Code calculates. The user confirms when needed.**

It is designed to make repeat food logging faster over time without fabricating nutrition values or rewriting historical meals when a recipe/database changes.

## What is implemented

- Responsive React + TypeScript web UI for desktop and mobile browsers.
- Installable PWA shell and offline caching of the application code.
- IndexedDB persistence with localStorage fallback.
- Today dashboard, History, Recipes, Food Library, Insights, Settings.
- Universal Meal Composer: personal search, external database search, natural-language interpretation, photo interpretation, barcode flow, repeat meal.
- Personal-first search/ranking and learned usual portions.
- Deterministic nutrition calculations that preserve **unknown** separately from numeric zero.
- Personal verified foods and Nutrition Facts/manual entry.
- Recipes with finished cooked weight, optional count yield, immutable version history, and per-gram nutrition.
- Immutable meal-item nutrition/source snapshots.
- Barcode cache plus Open Food Facts lookup; native `BarcodeDetector` camera scanning when the browser supports it, with manual entry fallback.
- Secure backend contract for USDA FoodData Central and Gemini 3.8 Flash. Private keys never belong in the browser bundle.
- Gemini structured-output flows for meal parsing, meal-photo identification, label extraction, and recipe parsing. AI outputs food concepts/visible label data; nutrition is resolved/calculated elsewhere.
- Optional Supabase Auth and cloud backup/sync of the V1 local state, protected by RLS.
- Normalized PostgreSQL schema foundation for foods, sources, meals, recipes, versions, corrections, AI runs, defaults, and provenance.
- JSON export/import backup.
- GitHub Pages deployment workflow.
- Automated tests for the deterministic nutrition and historical-correctness rules.

## Architecture

```text
Browser / PWA
├─ React + TypeScript UI
├─ IndexedDB local state
├─ personal food / recipe / barcode cache
├─ deterministic nutrition + recipe math
├─ camera barcode decoder (supported browsers)
└─ direct Open Food Facts reads
       │
       └──────── authenticated HTTPS ────────┐
                                             ▼
                                  Supabase Edge Function
                                  ├─ verifies Supabase user
                                  ├─ Gemini 3.8 Flash
                                  └─ USDA FoodData Central
                                             │
                                             ▼
                                  structured candidates/data
                                             │
Browser                                      ▼
food resolution → quantity resolution → deterministic calculation → confirmation → personal history
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md).

## Local development

Requirements:

- Node 20+ (Node 22 recommended)
- TypeScript 5.8.x (installed via `npm install`)

```bash
npm install
npm test
npm run serve
```

Then open `http://localhost:4173`.

The UI remains useful with **no cloud credentials**: personal foods, recipes, logging, history, insights, nutrition arithmetic, repeat meals, backup/restore, cached barcodes, and Open Food Facts lookups are not dependent on Gemini.

## Runtime configuration

Copy `.env.example` as a reference only. This project intentionally does not bundle a conventional client `.env` file into the static site.

Browser-safe values are written to `public/config.js` for local work or to `dist/config.js` by the GitHub Pages workflow:

```text
NOURISH_SUPABASE_URL
NOURISH_SUPABASE_ANON_KEY
NOURISH_BACKEND_FUNCTION_URL
```

`SUPABASE_ANON_KEY` is intended to be a public client credential. Security still depends on Row Level Security and authenticated server functions.

**Never put these private values in `public/config.js`, GitHub Pages variables, source code, or browser JavaScript:**

```text
GEMINI_API_KEY
USDA_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Those belong only in Supabase Edge Function secrets.

## Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/202609280001_initial_schema.sql` in the SQL editor or via the Supabase CLI.
3. Enable the authentication method you want (email/password works with the included UI).
4. Deploy `supabase/functions/nutrition-api`.
5. Configure Edge Function secrets:

```bash
supabase secrets set \
  GEMINI_API_KEY=... \
  USDA_API_KEY=... \
  ALLOWED_ORIGINS="http://localhost:4173,https://YOUR_USER.github.io"
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are normally supplied automatically to Supabase Edge Functions; the function uses them to validate the caller.

The V1 cloud-sync screen stores the local application state in the RLS-protected `user_state` table. The normalized relational tables are included as the forward-compatible schema for incremental/server-native sync, but the V1 UI does not yet mirror every local mutation into those tables individually.

## Gemini setup

The Edge Function currently uses the official stable model name:

```text
gemini-3.8-flash
```

The implementation uses low thinking effort and structured JSON output. It deliberately does **not** ask the model to generate calories/macros for normal meal or photo interpretation. It uses Gemini only where semantic interpretation is useful:

- natural-language meal parsing;
- photo food-component identification;
- Nutrition Facts extraction;
- recipe parsing.

All model responses are semantically validated after schema-constrained decoding.

The model name, quotas, and pricing can change. Verify the official Gemini docs before production deployment or pinning a long-lived operational budget.

## Food-data setup

### USDA FoodData Central

Obtain a Data.gov/USDA API key and set it **only** as the `USDA_API_KEY` Edge Function secret. USDA requests are proxied through the authenticated backend.

### Open Food Facts

Open Food Facts is queried directly from the browser for explicit searches and barcode lookups. The app intentionally does not issue search-as-you-type network requests; local/personal search happens instantly and remote search happens only after the user requests it.

Community-sourced Open Food Facts records are marked as such rather than being displayed with the same provenance as a user-verified product or authoritative source.

## GitHub Pages deployment

The repository includes `.github/workflows/pages.yml`.

1. Push the repository to GitHub with the default branch named `main`.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. Add repository **Variables** (not secrets) if Supabase is enabled:
   - `NOURISH_SUPABASE_URL`
   - `NOURISH_SUPABASE_ANON_KEY`
   - `NOURISH_BACKEND_FUNCTION_URL`
4. Push to `main` or run the workflow manually.

All static asset paths are relative and app navigation uses URL hashes, so the build works under a repository subpath without hard-coding the repository name.

Private provider keys are not used by the Pages job.

## PWA and offline behavior

The service worker pre-caches the complete application shell and compiled modules. Once installed successfully, the UI, local meals, personal foods, recipes, deterministic calculations, and cached data continue to work offline.

Network-only operations fail gracefully:

- Gemini interpretation;
- fresh USDA lookup;
- fresh Open Food Facts lookup;
- Supabase cloud sync.

The app does not synthesize fake fallback nutrition when a provider is unavailable.

## Security / privacy

- Private API keys exist only in the server function environment.
- Supabase RLS scopes user-owned rows to `auth.uid()`.
- Edge Function requests require a valid Supabase user session.
- CORS uses an explicit `ALLOWED_ORIGINS` list.
- Photos are resized and re-encoded through canvas, removing normal EXIF metadata before remote processing.
- Meal photos are **not persisted by default**; persistent photo history is intentionally disabled in V1.
- Historical meal entries store the nutrition/source snapshot used at log time.
- JSON backup is user-initiated.

See [`docs/SECURITY.md`](docs/SECURITY.md).

## Testing

```bash
npm test
```

The test command first performs a production frontend build and a static TypeScript check of the Supabase Edge Function, then runs the deterministic behavior suite.

The automated suite covers:

- missing nutrients vs zero;
- scaling and aggregation;
- recipe cooked-weight calculation;
- recipe versioning;
- historical nutrition snapshots;
- quantity edits against historical data;
- meal copying without re-resolution;
- barcode cache;
- personal-portion learning;
- confidence labels;
- PWA/GitHub Pages build properties;
- absence of private Gemini/USDA endpoints in the browser build.

A browser smoke test should additionally cover mobile/desktop layout, creating/logging/editing a personal food, composer behavior, History, and the production build.

## Current limitations

- **Live Supabase/Gemini/USDA calls require external credentials and a deployed Edge Function.** The integration code is present, but cannot be verified against your accounts until those resources exist.
- The V1 sync path backs up the local state as one RLS-protected user document; normalized per-entity bidirectional sync is future work.
- Native camera barcode scanning depends on the experimental/limited browser `BarcodeDetector` API. Manual UPC/EAN entry and label-scan fallback work independently; iOS Safari may require a future dedicated WASM/JS barcode decoder for consistent camera scanning.
- Restaurant-specific commercial nutrition data is intentionally not included in V1.
- Persistent meal-photo history is intentionally disabled.
- The build currently vendors a React UMD runtime so the app can build in a network-isolated environment. Upgrade that runtime/package strategy during the next dependency-refresh cycle if you standardize on a package-based bundler.

## Design invariants

1. AI is never the authoritative nutrient database.
2. Missing nutrient data stays missing; it does not silently become zero.
3. Logged nutrition is snapshotted and historical meals do not mutate retroactively.
4. Personal verified foods/recipes/history outrank generic search results.
5. AI failure never disables normal logging.
6. Uncertain identity/quantity is labeled rather than hidden behind fake precision.
7. No private API key is shipped to the browser.
