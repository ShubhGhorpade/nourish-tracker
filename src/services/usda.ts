import type { FoodCandidate } from '../types.js';
import { backendCall } from './backend.js';

export async function searchUsda(query: string): Promise<FoodCandidate[]> {
  const result = await backendCall<{ foods: FoodCandidate[] }>('usda.search', { query });
  return result.foods ?? [];
}
