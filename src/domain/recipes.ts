import type { RecipeIngredient, RecipeVersion, Nutrients } from '../types.js';
import { per100gFromTotal, scaleNutrients, sumNutrients } from './nutrition.js';

export function calculateRecipeTotal(ingredients: RecipeIngredient[]): Nutrients {
  return sumNutrients(ingredients.map(i => scaleNutrients(i.nutritionPer100gSnapshot, i.amountG)));
}

export function calculateRecipePer100g(version: RecipeVersion): Nutrients {
  if (!version.finishedWeightG || version.finishedWeightG <= 0) throw new Error('A finished cooked weight is required for gram-based recipe logging.');
  return per100gFromTotal(version.totalNutrition, version.finishedWeightG);
}

export function calculateRecipeServing(version: RecipeVersion, servingCount = 1): Nutrients {
  if (!version.yieldCount || version.yieldCount <= 0) throw new Error('A positive yield count is required for count-based recipe logging.');
  const servings = Math.max(0, servingCount);
  const fraction = servings / version.yieldCount;
  const result = { ...version.totalNutrition } as Nutrients;
  for (const key of Object.keys(result) as (keyof Nutrients)[]) {
    const value = result[key];
    result[key] = value === null ? null : value * fraction;
  }
  return result;
}
