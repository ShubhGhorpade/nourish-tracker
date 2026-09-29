import test from 'node:test';
import assert from 'node:assert/strict';
import { NutritionStore } from '../dist/src/data/store.js';
import { emptyNutrients } from '../dist/src/domain/nutrition.js';
import { newId } from '../dist/src/domain/id.js';

function n(p={}){return {...emptyNutrients(),...p};}
async function fresh(){const s=new NutritionStore();await s.init();return s;}

test('logging snapshots nutrition so later food edits cannot rewrite history',async()=>{
  const s=await fresh();
  const food=await s.createPersonalFood({name:'Snapshot food',nutritionPer100g:n({energyKcal:100,proteinG:10}),servingGrams:100});
  await s.logFood(food,100,'lunch');
  const changed={...food,nutritionPer100g:n({energyKcal:250,proteinG:25})};
  await s.upsertFood(changed);
  const meal=s.mealsForDate(new Date())[0];
  assert.equal(meal.items[0].nutritionSnapshot.energyKcal,100);
  assert.equal(meal.items[0].nutritionPer100gSnapshot.energyKcal,100);
});

test('editing quantity recalculates from historical snapshot, not current food record',async()=>{
  const s=await fresh();
  const food=await s.createPersonalFood({name:'Edit food',nutritionPer100g:n({energyKcal:120}),servingGrams:100});
  const meal=await s.logFood(food,100,'breakfast');
  await s.upsertFood({...food,nutritionPer100g:n({energyKcal:999})});
  await s.updateMealItemAmount(meal.id,meal.items[0].id,50);
  const updated=s.mealsForDate(new Date())[0];
  assert.equal(updated.items[0].nutritionSnapshot.energyKcal,60);
});

test('copy meal preserves historical nutrition and does not require food re-resolution',async()=>{
  const s=await fresh();
  const food=await s.createPersonalFood({name:'Copy food',nutritionPer100g:n({energyKcal:80}),servingGrams:100});
  const meal=await s.logFood(food,125,'snack');
  const target=new Date();target.setDate(target.getDate()+1);
  const copy=await s.copyMeal(meal.id,target);
  assert.notEqual(copy.id,meal.id);assert.notEqual(copy.items[0].id,meal.items[0].id);
  assert.deepEqual(copy.items[0].nutritionSnapshot,meal.items[0].nutritionSnapshot);
});

test('barcode cache resolves a confirmed personal product locally',async()=>{
  const s=await fresh();
  const food=await s.createPersonalFood({name:'Bar',barcode:'012345678905',nutritionPer100g:n({energyKcal:300}),servingGrams:60});
  assert.equal(s.findBarcode('012345678905')?.id,food.id);
});

test('recipe versioning leaves a logged v1 snapshot unchanged when v2 is created',async()=>{
  const s=await fresh();
  const ingredient=await s.createPersonalFood({name:'Ingredient',nutritionPer100g:n({energyKcal:100,proteinG:5}),servingGrams:100});
  const ing=(g)=>({id:newId('ing'),foodId:ingredient.id,name:ingredient.name,amountG:g,preparationState:'raw',nutritionPer100gSnapshot:ingredient.nutritionPer100g,sourceSnapshot:ingredient.source});
  const recipe=await s.createRecipe({name:'Dal test',ingredients:[ing(200)],finishedWeightG:400});
  const v1=recipe.currentVersionId;
  const recipeFood=s.getFood(`recipeFood_${recipe.id}`);
  assert.ok(recipeFood);
  const meal=await s.logFood(recipeFood,100,'dinner');
  const oldEnergy=meal.items[0].nutritionSnapshot.energyKcal;
  await s.createRecipeVersion(recipe.id,{ingredients:[ing(400)],finishedWeightG:400});
  const updatedRecipe=s.getRecipe(recipe.id);
  assert.notEqual(updatedRecipe.currentVersionId,v1);
  const historical=s.mealsForDate(new Date()).find(m=>m.id===meal.id);
  assert.equal(historical.items[0].recipeVersionId,v1);
  assert.equal(historical.items[0].nutritionSnapshot.energyKcal,oldEnergy);
  assert.notEqual(s.getFood(`recipeFood_${recipe.id}`).nutritionPer100g.energyKcal,meal.items[0].nutritionPer100gSnapshot.energyKcal);
});

test('personal portion defaults learn from repeated logs but remain editable observations',async()=>{
  const s=await fresh();
  const food=await s.createPersonalFood({name:'Bowl food',nutritionPer100g:n({energyKcal:50}),servingGrams:100});
  await s.logFood(food,180,'dinner'); await s.logFood(food,200,'dinner'); await s.logFood(food,190,'dinner');
  const d=s.findDefault(food.id,'dinner');
  assert.equal(d.typicalAmountG,190);assert.equal(d.observationCount,3);assert.equal(d.confidence,'medium');
});
