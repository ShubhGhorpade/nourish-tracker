import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, scaleNutrients, sumNutrients, per100gFromTotal } from '../dist/src/domain/nutrition.js';
import { confidenceLabel, learnedConfidence } from '../dist/src/domain/confidence.js';
import { median, updatePersonalDefault } from '../dist/src/domain/personalization.js';
import { calculateRecipeTotal, calculateRecipePer100g } from '../dist/src/domain/recipes.js';

function n(p={}){ return {...emptyNutrients(),...p}; }

test('nutrition scaling preserves missing fields rather than treating them as zero',()=>{
  const out=scaleNutrients(n({energyKcal:200,proteinG:10,ironMg:null}),50);
  assert.equal(out.energyKcal,100); assert.equal(out.proteinG,5); assert.equal(out.ironMg,null);
});

test('aggregation distinguishes zero from unknown',()=>{
  const out=sumNutrients([n({proteinG:10,fiberG:null}),n({proteinG:5,fiberG:null})]);
  assert.equal(out.proteinG,15); assert.equal(out.fiberG,null);
  const withZero=sumNutrients([n({fiberG:0}),n({fiberG:null})]);
  assert.equal(withZero.fiberG,0);
});

test('finished recipe weight calculates deterministic per-100g nutrition',()=>{
  const ingredients=[
    {id:'1',name:'A',amountG:200,nutritionPer100gSnapshot:n({energyKcal:100,proteinG:5}),sourceSnapshot:{id:'s',name:'test',quality:'verified'}},
    {id:'2',name:'B',amountG:100,nutritionPer100gSnapshot:n({energyKcal:200,proteinG:10}),sourceSnapshot:{id:'s2',name:'test',quality:'verified'}}
  ];
  const total=calculateRecipeTotal(ingredients);
  assert.equal(total.energyKcal,400); assert.equal(total.proteinG,20);
  const version={id:'v',recipeId:'r',version:1,createdAt:new Date().toISOString(),ingredients,totalNutrition:total,finishedWeightG:800};
  const per100=calculateRecipePer100g(version);
  assert.equal(per100.energyKcal,50); assert.equal(per100.proteinG,2.5);
});

test('invalid finished recipe weight is rejected',()=>assert.throws(()=>per100gFromTotal(n({energyKcal:100}),0)));

test('personal defaults use median and gain confidence only with observations',()=>{
  let d=updatePersonalDefault(undefined,'food','dinner',180,'2026-09-01T00:00:00Z');
  d=updatePersonalDefault(d,'food','dinner',200,'2026-09-02T00:00:00Z');
  d=updatePersonalDefault(d,'food','dinner',190,'2026-09-03T00:00:00Z');
  assert.equal(d.typicalAmountG,190); assert.equal(d.confidence,'medium');
  assert.equal(median([1,9,3,5]),4);
  assert.equal(learnedConfidence(8),'high');
});

test('confidence labels do not overstate uncertain quantity',()=>{
  assert.equal(confidenceLabel({identity:'high',quantity:'high',nutrition:'high'}),'Verified');
  assert.equal(confidenceLabel({identity:'high',quantity:'low',nutrition:'high'}),'Estimated');
  assert.equal(confidenceLabel({identity:'low',quantity:'low',nutrition:'high'}),'Rough estimate');
});
