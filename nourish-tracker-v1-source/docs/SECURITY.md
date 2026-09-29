# Security and privacy notes

## Secret boundary

Public static site:

- Supabase project URL;
- Supabase anon/public key;
- Edge Function URL.

Server-only:

- Gemini API key;
- USDA API key;
- any future commercial provider secret;
- Supabase service-role key (not used by the current frontend).

A static GitHub Pages site cannot safely contain private keys. All private-provider requests therefore pass through the authenticated Edge Function.

## Authentication and authorization

- Supabase Auth supplies the user access token.
- The Edge Function validates that token against the Supabase Auth endpoint before performing provider calls.
- Database tables containing user data have Row Level Security enabled with owner policies keyed to `auth.uid()`.
- The V1 sync adapter can only read/write the signed-in user's `user_state` row.

## CORS

Set `ALLOWED_ORIGINS` to the exact local and production origins that should call the Edge Function. Do not use `*` for production.

## Images

Before an image leaves the browser, the app:

1. decodes it locally;
2. resizes it to a bounded dimension;
3. draws it onto a canvas;
4. exports a fresh JPEG payload.

That normal re-encoding strips ordinary EXIF/GPS metadata. V1 does not persist meal images to Supabase Storage by default.

## Provider/privacy considerations

External provider policies can change. Before enabling production AI, review the current Gemini data-use/retention terms for the billing tier and API surface being used. The app does not enable web/search grounding for meal logging.

Open Food Facts lookups are public network requests for search terms/barcodes. They do not receive the user's private meal history from Nourish.

## Backups

The Settings JSON export contains the user's local nutrition history and should be treated as sensitive personal data. Import validates the basic application-state shape before replacement, but users should only import backups they trust.
