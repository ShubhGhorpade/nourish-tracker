import type { Nutrients } from '../types.js';

export const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  'energyKcal','proteinG','carbsG','fatG','fiberG','saturatedFatG','sodiumMg','sugarG','addedSugarG','potassiumMg','calciumMg','ironMg','vitaminDMcg'
];

export function emptyNutrients(): Nutrients {
  return {
    energyKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null,
    saturatedFatG: null, sodiumMg: null, sugarG: null, addedSugarG: null,
    potassiumMg: null, calciumMg: null, ironMg: null, vitaminDMcg: null
  };
}

export function sanitizeNutrients(input: Partial<Nutrients>): Nutrients {
  const out = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const value = input[key];
    if (value === null || value === undefined || Number.isNaN(Number(value))) out[key] = null;
    else out[key] = Math.max(0, Number(value));
  }
  return out;
}

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const factor = Math.max(0, grams) / 100;
  const out = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const value = per100g[key];
    out[key] = value === null ? null : value * factor;
  }
  return out;
}

/**
 * Sums nutrients while preserving missingness. A nutrient is null only when every input is null.
 * Missing data never becomes zero simply because another nutrient exists.
 */
export function sumNutrients(items: Nutrients[]): Nutrients {
  const out = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const values = items.map(item => item[key]).filter((v): v is number => v !== null);
    out[key] = values.length ? values.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

export function per100gFromTotal(total: Nutrients, finishedWeightG: number): Nutrients {
  if (!Number.isFinite(finishedWeightG) || finishedWeightG <= 0) throw new Error('Finished weight must be greater than zero.');
  const out = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const value = total[key];
    out[key] = value === null ? null : value * 100 / finishedWeightG;
  }
  return out;
}

export function roundNutrition(n: Nutrients, digits = 1): Nutrients {
  const scale = 10 ** digits;
  const out = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const value = n[key];
    out[key] = value === null ? null : Math.round(value * scale) / scale;
  }
  return out;
}

export function hasCoreNutrition(n: Nutrients): boolean {
  return n.energyKcal !== null || n.proteinG !== null || n.carbsG !== null || n.fatG !== null;
}

export function formatNutrient(value: number | null, unit: string, digits = 0): string {
  if (value === null) return 'Unknown';
  return `${value.toFixed(digits)} ${unit}`;
}
