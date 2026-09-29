export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodKind = 'generic' | 'branded' | 'personal' | 'recipe';
export type SourceQuality = 'verified' | 'authoritative' | 'community' | 'manual' | 'estimated';
export type Confidence = 'high' | 'medium' | 'low';

export interface Nutrients {
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  saturatedFatG: number | null;
  sodiumMg: number | null;
  sugarG: number | null;
  addedSugarG: number | null;
  potassiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminDMcg: number | null;
}

export interface Serving {
  id: string;
  label: string;
  grams: number;
  source: 'database' | 'label' | 'user' | 'recipe';
}

export interface DataSourceRef {
  id: string;
  name: string;
  externalId?: string;
  quality: SourceQuality;
  url?: string;
  retrievedAt?: string;
  note?: string;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  kind: FoodKind;
  barcode?: string;
  nutritionPer100g: Nutrients;
  servings: Serving[];
  source: DataSourceRef;
  verifiedAt?: string;
  lastUsedAt?: string;
  useCount: number;
  aliases: string[];
  imageUrl?: string;
}

export interface ConfidenceProfile {
  identity: Confidence;
  quantity: Confidence;
  nutrition: Confidence;
  reason?: string;
}

export interface NutritionRange {
  energyKcalMin?: number;
  energyKcalMax?: number;
}

export interface MealItem {
  id: string;
  foodId?: string;
  recipeId?: string;
  recipeVersionId?: string;
  name: string;
  brand?: string;
  amountG: number;
  quantityLabel: string;
  nutritionPer100gSnapshot: Nutrients;
  nutritionSnapshot: Nutrients;
  sourceSnapshot: DataSourceRef;
  confidence: ConfidenceProfile;
  range?: NutritionRange;
  createdAt: string;
}

export interface Meal {
  id: string;
  eatenAt: string;
  mealType: MealType;
  items: MealItem[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  foodId?: string;
  name: string;
  amountG: number;
  householdAmount?: number;
  householdUnit?: string;
  preparationState?: 'raw' | 'cooked' | 'unknown';
  nutritionPer100gSnapshot: Nutrients;
  sourceSnapshot: DataSourceRef;
}

export interface RecipeVersion {
  id: string;
  recipeId: string;
  version: number;
  createdAt: string;
  ingredients: RecipeIngredient[];
  totalNutrition: Nutrients;
  finishedWeightG?: number;
  yieldCount?: number;
  yieldUnit?: string;
  notes?: string;
}

export interface Recipe {
  id: string;
  name: string;
  aliases: string[];
  currentVersionId: string;
  versions: RecipeVersion[];
  useCount: number;
  lastUsedAt?: string;
  createdAt: string;
}

export interface PersonalDefault {
  id: string;
  foodKey: string;
  context: MealType | 'any';
  typicalAmountG: number;
  observations: number[];
  observationCount: number;
  confidence: Confidence;
  lastUsedAt: string;
}

export interface BarcodeCacheEntry {
  code: string;
  foodId: string;
  verified: boolean;
  updatedAt: string;
}

export interface PendingSyncOperation {
  id: string;
  kind: 'meal' | 'food' | 'recipe' | 'delete';
  entityId: string;
  createdAt: string;
  attempts: number;
}

export interface Settings {
  showEnergy: boolean;
  proteinGoalG: number;
  fiberGoalG: number;
  retentionMealPhotos: boolean;
  preferredUnits: 'metric' | 'us';
  defaultMealType: MealType;
}

export interface AppData {
  schemaVersion: number;
  foods: Food[];
  meals: Meal[];
  recipes: Recipe[];
  defaults: PersonalDefault[];
  barcodeCache: BarcodeCacheEntry[];
  pendingSync: PendingSyncOperation[];
  settings: Settings;
}

export interface FoodCandidate extends Food {
  matchReason?: string;
  score?: number;
}

export interface ParsedMealCandidate {
  foodQuery: string;
  quantity?: number;
  unit?: string;
  preparation?: string;
  identityConfidence: Confidence;
  quantityConfidence: Confidence;
  clarificationNeeded?: string;
}

export interface ParsedMealResult {
  items: ParsedMealCandidate[];
  mealType?: MealType;
  clarificationQuestion?: string;
}
