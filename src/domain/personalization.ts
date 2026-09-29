import type { Confidence, Food, MealType, PersonalDefault } from '../types.js';
import { learnedConfidence } from './confidence.js';

export function median(values: number[]): number {
  if (!values.length) throw new Error('Cannot calculate median of an empty list.');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function updatePersonalDefault(existing: PersonalDefault | undefined, foodKey: string, context: MealType | 'any', amountG: number, now = new Date().toISOString()): PersonalDefault {
  if (!Number.isFinite(amountG) || amountG <= 0) throw new Error('Personal default observation must be positive.');
  const observations = [...(existing?.observations ?? []), amountG].slice(-20);
  const count = (existing?.observationCount ?? 0) + 1;
  return {
    id: existing?.id ?? `default_${cryptoSafeId()}`,
    foodKey,
    context,
    typicalAmountG: median(observations),
    observations,
    observationCount: count,
    confidence: learnedConfidence(count),
    lastUsedAt: now
  };
}

export function rankFood(food: Food, query: string, context: MealType, defaultEntry?: PersonalDefault): number {
  const q = query.trim().toLowerCase();
  const name = food.name.toLowerCase();
  const brand = (food.brand ?? '').toLowerCase();
  const aliases = food.aliases.map(a => a.toLowerCase());
  let score = 0;
  if (name === q || aliases.includes(q)) score += 500;
  else if (name.startsWith(q)) score += 320;
  else if (name.includes(q) || brand.includes(q) || aliases.some(a => a.includes(q))) score += 180;
  if (food.kind === 'personal') score += 160;
  if (food.kind === 'recipe') score += 150;
  if (food.source.quality === 'verified') score += 140;
  if (food.source.quality === 'authoritative') score += 90;
  if (food.source.quality === 'community') score += 30;
  score += Math.min(food.useCount, 50) * 4;
  if (defaultEntry && (defaultEntry.context === context || defaultEntry.context === 'any')) score += 80;
  if (food.lastUsedAt) {
    const days = (Date.now() - new Date(food.lastUsedAt).getTime()) / 86400000;
    score += Math.max(0, 50 - Math.min(50, days));
  }
  return score;
}

function cryptoSafeId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function confidenceFromVariance(observations: number[]): Confidence {
  if (observations.length < 3) return 'low';
  const avg = observations.reduce((a,b) => a+b,0) / observations.length;
  if (!avg) return 'low';
  const variance = observations.reduce((sum, x) => sum + (x - avg) ** 2, 0) / observations.length;
  const cv = Math.sqrt(variance) / avg;
  if (observations.length >= 8 && cv < 0.15) return 'high';
  if (cv < 0.3) return 'medium';
  return 'low';
}
