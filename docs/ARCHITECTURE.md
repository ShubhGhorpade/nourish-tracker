# Architecture

## Product boundary

Nourish deliberately separates four responsibilities:

1. **Interpretation** — understand text/photos/labels (AI where useful).
2. **Resolution** — map a food concept/barcode to a personal or provider-backed food record.
3. **Calculation** — deterministic grams/serving/recipe/nutrient arithmetic.
4. **Memory** — immutable history plus explicit personal defaults learned from repeated use.

A model response is never directly treated as nutrition truth.

## Frontend

The frontend is a static React + TypeScript app suitable for GitHub Pages. It uses hash navigation to avoid static-host routing problems and only relative asset paths so repository-name/base-path changes do not require a rebuild setting.

Primary data lives in IndexedDB (`nourish-db`) with a localStorage fallback. This makes ordinary logging fast and gives the user a useful app even before cloud configuration exists.

### Personal-first search

The store ranks local results using:

- personal/verified status;
- recipe status;
- exact/name/alias match;
- use count;
- recency;
- meal/time context.

External search is explicit rather than search-as-you-type. That reduces latency/noise and respects external provider rate limits.

## Nutrition representation

Nutrients are `number | null`.

- `0` means the source explicitly reports zero.
- `null` means unknown/unavailable.

Aggregation returns `null` for a nutrient when the logged data do not provide enough source information; it does not silently turn missing micronutrients into zero.

## Historical correctness

Every `MealItem` stores:

- food identity snapshot;
- source/provenance snapshot;
- nutrition-per-100g snapshot;
- calculated nutrition for its logged quantity;
- recipe/version identity when applicable;
- identity / quantity / nutrition confidence.

Changing a food, upstream provider record, or recipe later cannot rewrite an older meal.

## Recipes

Each recipe has immutable versions. A version contains ingredient snapshots and one or both yield mechanisms:

- `finishedWeightG` for nutrition-per-gram;
- `yieldCount` / `yieldUnit` for count-based logging.

New edits create a new version and update the recipe-derived food used for future logs only.

## Barcode flow

```text
camera/manual UPC/EAN
→ local barcode cache
→ Open Food Facts lookup
→ product confirmation
→ local verified/cache record
→ log
```

The browser's native `BarcodeDetector` is used only when available. Unknown products can flow to Nutrition Facts extraction or manual verified-food entry.

## AI flow

```text
browser input/photo
→ metadata-stripped/resized payload
→ authenticated Edge Function
→ Gemini structured output
→ semantic validation
→ food candidates / visible label fields
→ browser personal/provider resolution
→ deterministic calculation
→ user correction/confirmation
```

Meal/photo prompts prohibit invented nutrient values. Label extraction only accepts visible/readable fields and uses `null`/missing values otherwise.

## Backend

The Supabase Edge Function:

- rejects unauthenticated calls;
- validates allowed origins;
- owns Gemini and USDA secrets;
- validates input lengths/file payloads;
- uses structured output schemas;
- semantically cleans and validates model data;
- normalizes USDA results into the application's provider-neutral food shape;
- returns safe error messages.

## Cloud persistence

V1 operational sync uses `public.user_state` as one RLS-protected per-user JSON document because it cleanly preserves the local-first application state.

The migration also supplies the normalized long-term schema:

- foods/source_foods/barcodes;
- nutrient definitions/records/values;
- servings;
- meals/meal_items;
- recipes/versions/ingredients;
- photos/ai_runs/corrections;
- personal_defaults/data_sources.

The normalized schema is intentionally richer than the first cloud-sync adapter so future record-level sync does not require a destructive redesign.
