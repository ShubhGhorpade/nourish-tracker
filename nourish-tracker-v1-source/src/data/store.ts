import type {
  AppData, ConfidenceProfile, Food, FoodCandidate, Meal, MealItem, MealType,
  Nutrients, PersonalDefault, Recipe, RecipeIngredient, RecipeVersion, Settings
} from '../types.js';
import { loadLocalData, saveLocalData } from './db.js';
import { emptyNutrients, scaleNutrients, sumNutrients } from '../domain/nutrition.js';
import { sourceConfidence } from '../domain/confidence.js';
import { calculateRecipePer100g, calculateRecipeTotal } from '../domain/recipes.js';
import { rankFood, updatePersonalDefault } from '../domain/personalization.js';
import { localDateKey, newId } from '../domain/id.js';

const DEFAULT_SETTINGS: Settings = {
  showEnergy: true,
  proteinGoalG: 100,
  fiberGoalG: 28,
  retentionMealPhotos: false,
  preferredUnits: 'metric',
  defaultMealType: 'breakfast'
};

export function initialData(): AppData {
  return {
    schemaVersion: 1,
    foods: [],
    meals: [],
    recipes: [],
    defaults: [],
    barcodeCache: [],
    pendingSync: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

function migrate(input: AppData): AppData {
  return {
    ...initialData(),
    ...input,
    foods: input.foods ?? [], meals: input.meals ?? [], recipes: input.recipes ?? [],
    defaults: input.defaults ?? [], barcodeCache: input.barcodeCache ?? [], pendingSync: input.pendingSync ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) },
    schemaVersion: 1
  };
}

export class NutritionStore {
  private data: AppData = initialData();
  private listeners = new Set<() => void>();
  private ready = false;

  async init(): Promise<void> {
    const loaded = await loadLocalData();
    this.data = loaded ? migrate(loaded) : initialData();
    this.ready = true;
    this.emit();
  }

  isReady(): boolean { return this.ready; }
  snapshot(): AppData { return structuredClone(this.data); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void { for (const listener of this.listeners) listener(); }
  private async commit(): Promise<void> { await saveLocalData(this.data); this.emit(); }

  async setSettings(patch: Partial<Settings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...patch };
    await this.commit();
  }

  searchLocal(query: string, context: MealType): FoodCandidate[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.recentFoods(10).map(f => ({ ...f, matchReason: 'Recent' }));
    return this.data.foods
      .map(food => {
        const d = this.findDefault(food.id, context);
        return { ...food, score: rankFood(food, q, context, d), matchReason: food.kind === 'personal' ? 'Your food' : food.kind === 'recipe' ? 'Your recipe' : food.source.name };
      })
      .filter(f => (f.score ?? 0) >= 180)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  recentFoods(limit = 8): Food[] {
    return [...this.data.foods]
      .filter(f => Boolean(f.lastUsedAt))
      .sort((a,b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime())
      .slice(0, limit);
  }

  findDefault(foodKey: string, context: MealType | 'any'): PersonalDefault | undefined {
    return this.data.defaults.find(d => d.foodKey === foodKey && (d.context === context || d.context === 'any'));
  }

  getFood(id: string): Food | undefined { return this.data.foods.find(f => f.id === id); }
  getRecipe(id: string): Recipe | undefined { return this.data.recipes.find(r => r.id === id); }

  async upsertFood(food: Food, queueSync = true): Promise<void> {
    const index = this.data.foods.findIndex(f => f.id === food.id);
    if (index >= 0) this.data.foods[index] = structuredClone(food);
    else this.data.foods.push(structuredClone(food));
    if (food.barcode) {
      const cached = this.data.barcodeCache.find(b => b.code === food.barcode);
      if (cached) { cached.foodId = food.id; cached.verified = food.source.quality === 'verified'; cached.updatedAt = new Date().toISOString(); }
      else this.data.barcodeCache.push({ code: food.barcode, foodId: food.id, verified: food.source.quality === 'verified', updatedAt: new Date().toISOString() });
    }
    if (queueSync) this.queue('food', food.id);
    await this.commit();
  }

  async createPersonalFood(input: { name: string; brand?: string; barcode?: string; nutritionPer100g: Nutrients; servingLabel?: string; servingGrams?: number; aliases?: string[] }): Promise<Food> {
    if (!input.name.trim()) throw new Error('Food name is required.');
    const servingGrams = input.servingGrams && input.servingGrams > 0 ? input.servingGrams : 100;
    const food: Food = {
      id: newId('food'), name: input.name.trim(), brand: input.brand?.trim() || undefined,
      kind: 'personal', barcode: input.barcode?.trim() || undefined,
      nutritionPer100g: structuredClone(input.nutritionPer100g),
      servings: [{ id: newId('serv'), label: input.servingLabel?.trim() || `${servingGrams} g`, grams: servingGrams, source: 'user' }],
      source: { id: newId('source'), name: 'Personal verified food', quality: 'verified', retrievedAt: new Date().toISOString() },
      verifiedAt: new Date().toISOString(), useCount: 0, aliases: input.aliases ?? []
    };
    await this.upsertFood(food);
    return food;
  }

  findBarcode(code: string): Food | undefined {
    const cached = this.data.barcodeCache.find(b => b.code === code);
    return cached ? this.getFood(cached.foodId) : this.data.foods.find(f => f.barcode === code);
  }

  async logFood(food: Food, amountG: number, mealType: MealType, quantityLabel?: string, confidence?: Partial<ConfidenceProfile>, range?: { energyKcalMin?: number; energyKcalMax?: number }): Promise<Meal> {
    if (!Number.isFinite(amountG) || amountG <= 0) throw new Error('Quantity must be greater than zero.');
    const now = new Date();
    const fullConfidence: ConfidenceProfile = {
      identity: confidence?.identity ?? 'high',
      quantity: confidence?.quantity ?? 'high',
      nutrition: confidence?.nutrition ?? sourceConfidence(food.source.quality),
      reason: confidence?.reason
    };
    const item: MealItem = {
      id: newId('item'), foodId: food.id,
      recipeId: food.kind === 'recipe' ? food.source.externalId?.split(':')[0] : undefined,
      recipeVersionId: food.kind === 'recipe' ? food.source.externalId?.split(':')[1] : undefined,
      name: food.name, brand: food.brand, amountG,
      quantityLabel: quantityLabel ?? `${Math.round(amountG)} g`,
      nutritionPer100gSnapshot: structuredClone(food.nutritionPer100g),
      nutritionSnapshot: scaleNutrients(food.nutritionPer100g, amountG),
      sourceSnapshot: structuredClone(food.source), confidence: fullConfidence, range,
      createdAt: now.toISOString()
    };
    const dateKey = localDateKey(now);
    let meal = this.data.meals.find(m => localDateKey(m.eatenAt) === dateKey && m.mealType === mealType);
    if (!meal) {
      meal = { id: newId('meal'), eatenAt: now.toISOString(), mealType, items: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
      this.data.meals.push(meal);
    }
    meal.items.push(item);
    meal.updatedAt = now.toISOString();
    const storedFood = this.data.foods.find(f => f.id === food.id);
    if (!storedFood) this.data.foods.push({ ...structuredClone(food), useCount: 1, lastUsedAt: now.toISOString() });
    else { storedFood.useCount += 1; storedFood.lastUsedAt = now.toISOString(); }
    const existingDefault = this.data.defaults.find(d => d.foodKey === food.id && d.context === mealType);
    const nextDefault = updatePersonalDefault(existingDefault, food.id, mealType, amountG, now.toISOString());
    if (existingDefault) Object.assign(existingDefault, nextDefault); else this.data.defaults.push(nextDefault);
    this.queue('meal', meal.id);
    await this.commit();
    return structuredClone(meal);
  }

  async updateMealItemAmount(mealId: string, itemId: string, amountG: number, quantityLabel?: string): Promise<void> {
    if (!Number.isFinite(amountG) || amountG <= 0) throw new Error('Quantity must be greater than zero.');
    const meal = this.data.meals.find(m => m.id === mealId);
    const item = meal?.items.find(i => i.id === itemId);
    if (!meal || !item) throw new Error('Meal item not found.');
    item.amountG = amountG;
    item.quantityLabel = quantityLabel ?? `${Math.round(amountG)} g`;
    item.nutritionSnapshot = scaleNutrients(item.nutritionPer100gSnapshot, amountG);
    item.confidence.quantity = 'high';
    meal.updatedAt = new Date().toISOString();
    this.queue('meal', meal.id);
    await this.commit();
  }

  async removeMealItem(mealId: string, itemId: string): Promise<void> {
    const meal = this.data.meals.find(m => m.id === mealId);
    if (!meal) return;
    meal.items = meal.items.filter(i => i.id !== itemId);
    meal.updatedAt = new Date().toISOString();
    if (!meal.items.length) this.data.meals = this.data.meals.filter(m => m.id !== mealId);
    this.queue('meal', mealId);
    await this.commit();
  }

  async copyMeal(mealId: string, target = new Date()): Promise<Meal> {
    const source = this.data.meals.find(m => m.id === mealId);
    if (!source) throw new Error('Meal not found.');
    const nowIso = target.toISOString();
    const copied: Meal = {
      id: newId('meal'), eatenAt: nowIso, mealType: source.mealType,
      items: source.items.map(item => ({ ...structuredClone(item), id: newId('item'), createdAt: nowIso })),
      note: source.note, createdAt: nowIso, updatedAt: nowIso
    };
    this.data.meals.push(copied);
    this.queue('meal', copied.id);
    await this.commit();
    return structuredClone(copied);
  }

  mealsForDate(date: Date): Meal[] {
    const key = localDateKey(date);
    return this.data.meals.filter(m => localDateKey(m.eatenAt) === key).sort((a,b) => new Date(a.eatenAt).getTime() - new Date(b.eatenAt).getTime());
  }

  mealNutrition(meal: Meal): Nutrients { return sumNutrients(meal.items.map(i => i.nutritionSnapshot)); }
  dayNutrition(date: Date): Nutrients { return sumNutrients(this.mealsForDate(date).flatMap(m => m.items.map(i => i.nutritionSnapshot))); }

  async createRecipe(input: { name: string; ingredients: RecipeIngredient[]; finishedWeightG?: number; yieldCount?: number; yieldUnit?: string; notes?: string }): Promise<Recipe> {
    if (!input.name.trim()) throw new Error('Recipe name is required.');
    if (!input.ingredients.length) throw new Error('Add at least one ingredient.');
    if ((!input.finishedWeightG || input.finishedWeightG <= 0) && (!input.yieldCount || input.yieldCount <= 0)) throw new Error('Provide finished cooked weight or a yield count.');
    const recipeId = newId('recipe');
    const version = this.makeRecipeVersion(recipeId, 1, input);
    const recipe: Recipe = { id: recipeId, name: input.name.trim(), aliases: [], currentVersionId: version.id, versions: [version], useCount: 0, createdAt: new Date().toISOString() };
    this.data.recipes.push(recipe);
    this.upsertRecipeFood(recipe, version);
    this.queue('recipe', recipe.id);
    await this.commit();
    return structuredClone(recipe);
  }

  async createRecipeVersion(recipeId: string, input: { ingredients: RecipeIngredient[]; finishedWeightG?: number; yieldCount?: number; yieldUnit?: string; notes?: string }): Promise<RecipeVersion> {
    const recipe = this.data.recipes.find(r => r.id === recipeId);
    if (!recipe) throw new Error('Recipe not found.');
    const version = this.makeRecipeVersion(recipeId, recipe.versions.length + 1, input);
    recipe.versions.push(version);
    recipe.currentVersionId = version.id;
    this.upsertRecipeFood(recipe, version);
    this.queue('recipe', recipe.id);
    await this.commit();
    return structuredClone(version);
  }

  private makeRecipeVersion(recipeId: string, versionNumber: number, input: { ingredients: RecipeIngredient[]; finishedWeightG?: number; yieldCount?: number; yieldUnit?: string; notes?: string }): RecipeVersion {
    const total = calculateRecipeTotal(input.ingredients);
    return { id: newId('recipeVersion'), recipeId, version: versionNumber, createdAt: new Date().toISOString(), ingredients: structuredClone(input.ingredients), totalNutrition: total, finishedWeightG: input.finishedWeightG, yieldCount: input.yieldCount, yieldUnit: input.yieldUnit, notes: input.notes };
  }

  private upsertRecipeFood(recipe: Recipe, version: RecipeVersion): void {
    let per100g: Nutrients;
    let servingGrams = 100;
    let servingLabel = '100 g';
    if (version.finishedWeightG && version.finishedWeightG > 0) {
      per100g = calculateRecipePer100g(version);
    } else if (version.yieldCount && version.yieldCount > 0) {
      servingGrams = 100;
      servingLabel = `1 ${version.yieldUnit ?? 'serving'} (count-based nutrition)`;
      const perServing = {} as Nutrients;
      for (const key of Object.keys(emptyNutrients()) as (keyof Nutrients)[]) {
        const value = version.totalNutrition[key];
        perServing[key] = value === null ? null : value / version.yieldCount;
      }
      // Represent one count as 100 pseudo-grams internally; UI labels it explicitly.
      per100g = perServing;
    } else throw new Error('Recipe needs a valid yield.');
    const id = `recipeFood_${recipe.id}`;
    const existing = this.data.foods.find(f => f.id === id);
    const food: Food = {
      id, name: recipe.name, kind: 'recipe', nutritionPer100g: per100g,
      servings: [{ id: newId('serv'), label: servingLabel, grams: servingGrams, source: 'recipe' }],
      source: { id: newId('source'), name: `Your recipe · v${version.version}`, quality: 'verified', externalId: `${recipe.id}:${version.id}`, retrievedAt: version.createdAt },
      verifiedAt: version.createdAt, useCount: existing?.useCount ?? 0, lastUsedAt: existing?.lastUsedAt, aliases: recipe.aliases
    };
    const index = this.data.foods.findIndex(f => f.id === id);
    if (index >= 0) this.data.foods[index] = food; else this.data.foods.push(food);
  }

  private queue(kind: 'meal' | 'food' | 'recipe' | 'delete', entityId: string): void {
    const existing = this.data.pendingSync.find(o => o.kind === kind && o.entityId === entityId);
    if (!existing) this.data.pendingSync.push({ id: newId('sync'), kind, entityId, createdAt: new Date().toISOString(), attempts: 0 });
  }

  async clearSyncOperation(id: string): Promise<void> {
    this.data.pendingSync = this.data.pendingSync.filter(o => o.id !== id);
    await this.commit();
  }

  async importData(data: AppData): Promise<void> { this.data = migrate(data); await this.commit(); }
  exportData(): AppData { return this.snapshot(); }
}

export const store = new NutritionStore();
