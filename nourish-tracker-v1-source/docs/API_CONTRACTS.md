# Backend/API contracts

The frontend sends authenticated `POST` requests to the configured `NOURISH_BACKEND_FUNCTION_URL`.

Common headers:

```http
Authorization: Bearer <supabase access token>
apikey: <public supabase anon key>
Content-Type: application/json
```

The Edge Function currently requires a valid Supabase session for every action.

## `usda.search`

Request:

```json
{ "action": "usda.search", "query": "plain greek yogurt" }
```

Response:

```json
{
  "foods": [
    {
      "id": "usda_...",
      "name": "...",
      "kind": "generic",
      "nutritionPer100g": { "energyKcal": 59, "proteinG": 10.2 },
      "servings": [{ "id": "...", "label": "100 g", "grams": 100, "source": "database" }],
      "source": { "name": "USDA FoodData Central", "quality": "authoritative" }
    }
  ]
}
```

The full nutrient object contains nullable fields; omitted/missing upstream nutrients are `null` after normalization.

## `ai.parseMeal`

Request:

```json
{
  "action": "ai.parseMeal",
  "text": "two rotis, about a bowl of dal and Greek yogurt"
}
```

Response:

```json
{
  "mealType": "dinner",
  "clarificationQuestion": null,
  "items": [
    {
      "foodQuery": "roti",
      "quantity": 2,
      "unit": "piece",
      "identityConfidence": "high",
      "quantityConfidence": "high"
    },
    {
      "foodQuery": "dal",
      "quantity": 1,
      "unit": "bowl",
      "identityConfidence": "high",
      "quantityConfidence": "low"
    }
  ]
}
```

**Invariant:** this response does not contain nutrition values. Food candidates must be resolved against personal/provider data before calculation.

## `ai.analyzePhoto`

Request:

```json
{
  "action": "ai.analyzePhoto",
  "imageDataUrl": "data:image/jpeg;base64,..."
}
```

Response:

```json
{
  "items": [
    {
      "foodQuery": "yellow dal",
      "identityConfidence": "high",
      "quantityText": "about one bowl",
      "quantityConfidence": "low"
    }
  ],
  "clarificationQuestion": null,
  "overallNote": "Portions are approximate from one image."
}
```

Photo interpretation identifies components; it does not create nutrient truth or fake gram precision.

## `ai.extractLabel`

Request uses the same metadata-stripped `imageDataUrl` structure.

Example response:

```json
{
  "productName": "Example Bar",
  "brand": "Example",
  "servingSizeText": "1 bar (60 g)",
  "servingGrams": 60,
  "calories": 210,
  "proteinG": 20,
  "carbsG": 23,
  "fatG": 7,
  "fiberG": 8,
  "sodiumMg": 220,
  "confidence": "high",
  "warnings": []
}
```

Unreadable/unseen values are omitted rather than guessed. The UI must show the extraction for confirmation before saving it as a personal verified food.

## `ai.parseRecipe`

Request:

```json
{
  "action": "ai.parseRecipe",
  "text": "2 cups toor dal, 1 onion, 2 tomatoes, 2 tbsp oil"
}
```

Response:

```json
{
  "name": null,
  "ingredients": [
    { "name": "toor dal", "amount": 2, "unit": "cup" },
    { "name": "onion", "amount": 1, "unit": "piece" }
  ],
  "warnings": []
}
```

Amounts not present in the input are not invented. Ingredient nutrition is resolved separately.

## Error behavior

Representative statuses:

- `400` invalid/missing input;
- `401` sign-in required;
- `403` origin not allowed;
- `404` unknown action;
- `503` provider secret not configured;
- `502` provider/model processing failure.

Provider failure must not be converted into fabricated nutrition in the browser.
