# QA record

## Automated

Run:

```bash
npm test
```

The suite covers deterministic nutrition behavior, historical snapshots, recipe versioning, barcode cache, personal serving learning, confidence labels, static/PWA build properties, and secret isolation.

## Browser smoke workflow

A production `dist/` build was exercised in Chromium at desktop and 390×844 mobile viewports. The smoke workflow included:

1. load the production build;
2. navigate to Food Library;
3. create a verified personal food with a 170 g serving, 100 kcal, and 17 g protein;
4. open the Meal Composer;
5. log that food to breakfast;
6. edit the logged quantity to 85 g;
7. verify the historical entry reports approximately half the nutrition (50 kcal / 9 g protein after display rounding);
8. open History;
9. verify mobile navigation/layout loads without console/page errors.

Provider-backed paths (Gemini, USDA, Supabase deployment) require real external credentials and are not recorded here as live-tested until those services are configured.
