import type { ParsedMealResult } from '../types.js';
import { backendCall } from './backend.js';

export interface PhotoAnalysis {
  items: Array<{ foodQuery: string; identityConfidence: 'high'|'medium'|'low'; quantityText?: string; quantityConfidence: 'high'|'medium'|'low'; clarificationNeeded?: string }>;
  clarificationQuestion?: string;
  overallNote?: string;
}

export interface LabelExtraction {
  productName?: string;
  brand?: string;
  servingSizeText?: string;
  servingGrams?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  saturatedFatG?: number;
  sodiumMg?: number;
  sugarG?: number;
  addedSugarG?: number;
  confidence: 'high'|'medium'|'low';
  warnings: string[];
}

export async function parseMealText(text: string): Promise<ParsedMealResult> {
  if (!text.trim()) throw new Error('Describe what you ate first.');
  return backendCall<ParsedMealResult>('ai.parseMeal', { text: text.trim() });
}

export async function analyzeMealPhoto(dataUrl: string): Promise<PhotoAnalysis> {
  return backendCall<PhotoAnalysis>('ai.analyzePhoto', { imageDataUrl: dataUrl });
}

export async function extractNutritionLabel(dataUrl: string): Promise<LabelExtraction> {
  return backendCall<LabelExtraction>('ai.extractLabel', { imageDataUrl: dataUrl });
}

export async function parseRecipeText(text: string): Promise<{ ingredients: Array<{ name: string; amount?: number; unit?: string; preparationState?: string }>; name?: string; warnings?: string[] }> {
  return backendCall('ai.parseRecipe', { text });
}
