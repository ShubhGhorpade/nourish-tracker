# nutrition-api Edge Function

Authenticated server-side integration boundary for Nourish.

Actions:

- `usda.search`
- `ai.parseMeal`
- `ai.analyzePhoto`
- `ai.extractLabel`
- `ai.parseRecipe`

Required secrets:

- `GEMINI_API_KEY`
- `USDA_API_KEY`
- `ALLOWED_ORIGINS`

The function also reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` to validate the caller. Deploy with JWT verification enabled (see `supabase/config.toml`).

Example:

```bash
supabase functions deploy nutrition-api
```

Never copy provider keys into the frontend's `config.js`.
