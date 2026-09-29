import type { FoodCandidate, Nutrients } from '../types.js';
import { emptyNutrients, sanitizeNutrients } from '../domain/nutrition.js';
import { newId } from '../domain/id.js';

const PRODUCT_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity,image_front_small_url,last_modified_t';

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function offNutrients(raw: any): Nutrients {
  const n = raw ?? {};
  const sodiumG = finite(n.sodium_100g);
  const potassiumG = finite(n.potassium_100g);
  const calciumG = finite(n.calcium_100g);
  const ironG = finite(n.iron_100g);
  const vitaminDG = finite(n['vitamin-d_100g']);
  return sanitizeNutrients({
    energyKcal: finite(n['energy-kcal_100g']),
    proteinG: finite(n.proteins_100g),
    carbsG: finite(n.carbohydrates_100g),
    fatG: finite(n.fat_100g),
    fiberG: finite(n.fiber_100g),
    saturatedFatG: finite(n['saturated-fat_100g']),
    sodiumMg: sodiumG === null ? null : sodiumG * 1000,
    sugarG: finite(n.sugars_100g),
    addedSugarG: finite(n['added-sugars_100g']),
    potassiumMg: potassiumG === null ? null : potassiumG * 1000,
    calciumMg: calciumG === null ? null : calciumG * 1000,
    ironMg: ironG === null ? null : ironG * 1000,
    vitaminDMcg: vitaminDG === null ? null : vitaminDG * 1_000_000
  });
}

function mapProduct(product: any): FoodCandidate | null {
  const name = String(product?.product_name ?? '').trim();
  if (!name) return null;
  const per100g = offNutrients(product.nutriments);
  const grams = finite(product.serving_quantity) ?? 100;
  const servingText = String(product.serving_size ?? '').trim() || `${grams} g`;
  return {
    id: `off_${product.code || newId('product')}`,
    name,
    brand: String(product.brands ?? '').split(',')[0]?.trim() || undefined,
    kind: 'branded',
    barcode: product.code ? String(product.code) : undefined,
    nutritionPer100g: per100g ?? emptyNutrients(),
    servings: [{ id: newId('serv'), label: servingText, grams: grams > 0 ? grams : 100, source: 'database' }],
    source: {
      id: `off_${product.code || newId('source')}`,
      name: 'Open Food Facts', quality: 'community', externalId: product.code ? String(product.code) : undefined,
      url: product.code ? `https://world.openfoodfacts.org/product/${product.code}` : undefined,
      retrievedAt: new Date().toISOString(), note: 'Crowdsourced product data; verify against the package label when accuracy matters.'
    },
    imageUrl: product.image_front_small_url || undefined,
    useCount: 0,
    aliases: [],
    matchReason: 'Open Food Facts · community'
  };
}

export async function lookupBarcodeOpenFoodFacts(code: string): Promise<FoodCandidate | null> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 8 || clean.length > 14) throw new Error('Enter a valid UPC/EAN barcode.');
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json?fields=${encodeURIComponent(PRODUCT_FIELDS)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts lookup failed (${response.status}).`);
  const json = await response.json();
  if (json.status !== 1 || !json.product) return null;
  return mapProduct(json.product);
}

export async function searchOpenFoodFacts(query: string): Promise<FoodCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  // OFF explicitly rate-limits search; this is called only on explicit submit, never on each keystroke.
  const params = new URLSearchParams({
    search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '12', fields: PRODUCT_FIELDS
  });
  const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open Food Facts search failed (${response.status}).`);
  const json = await response.json();
  return (json.products ?? []).map(mapProduct).filter(Boolean) as FoodCandidate[];
}
