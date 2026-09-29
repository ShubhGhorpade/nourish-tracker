import type { AppData, Food, FoodCandidate, Nutrients, RecipeIngredient } from '../types.js';
import { emptyNutrients, hasCoreNutrition } from '../domain/nutrition.js';
import { newId } from '../domain/id.js';
import { store } from '../data/store.js';
import { searchOpenFoodFacts } from '../services/openFoodFacts.js';
import { searchUsda } from '../services/usda.js';
import { backendConfigured } from '../services/config.js';
import { FoodAvatar, SourceChip } from './common.js';

const nutrientFields: Array<{ key:keyof Nutrients; label:string; unit:string }> = [
  {key:'energyKcal',label:'Calories',unit:'kcal'}, {key:'proteinG',label:'Protein',unit:'g'},
  {key:'carbsG',label:'Carbohydrate',unit:'g'}, {key:'fatG',label:'Fat',unit:'g'},
  {key:'fiberG',label:'Fiber',unit:'g'}, {key:'saturatedFatG',label:'Saturated fat',unit:'g'},
  {key:'sodiumMg',label:'Sodium',unit:'mg'}, {key:'sugarG',label:'Total sugar',unit:'g'},
  {key:'addedSugarG',label:'Added sugar',unit:'g'}, {key:'potassiumMg',label:'Potassium',unit:'mg'},
  {key:'calciumMg',label:'Calcium',unit:'mg'}, {key:'ironMg',label:'Iron',unit:'mg'}, {key:'vitaminDMcg',label:'Vitamin D',unit:'mcg'}
];

export interface FoodEditorInitial {
  name?: string; brand?: string; barcode?: string; servingLabel?: string; servingGrams?: number;
  valuesPerServing?: Partial<Nutrients>;
}

export class PersonalFoodEditor extends React.Component<{ initial?:FoodEditorInitial; onSaved:(food:Food)=>void; onCancel:()=>void }, any> {
  constructor(props:any){
    super(props);
    const values:Record<string,string>={};
    for(const field of nutrientFields){const v=props.initial?.valuesPerServing?.[field.key];values[field.key]=v===null||v===undefined?'':String(v);}
    this.state={name:props.initial?.name??'',brand:props.initial?.brand??'',barcode:props.initial?.barcode??'',servingLabel:props.initial?.servingLabel??'1 serving',servingGrams:String(props.initial?.servingGrams??100),values,error:'',saving:false};
  }
  async save(){
    try{
      this.setState({error:'',saving:true});
      const grams=Number(this.state.servingGrams);
      if(!this.state.name.trim())throw new Error('Give this food a name.');
      if(!Number.isFinite(grams)||grams<=0)throw new Error('Serving weight must be greater than zero.');
      const perServing=emptyNutrients();
      for(const field of nutrientFields){const raw=this.state.values[field.key];perServing[field.key]=raw===''?null:Number(raw);if(perServing[field.key]!==null&&(!Number.isFinite(perServing[field.key]!)||perServing[field.key]!<0))throw new Error(`${field.label} must be a positive number or blank.`);}
      if(!hasCoreNutrition(perServing))throw new Error('Enter at least one core nutrition value from the label or a trusted source.');
      const per100=emptyNutrients();
      for(const key of Object.keys(perServing) as (keyof Nutrients)[]){const v=perServing[key];per100[key]=v===null?null:v*100/grams;}
      const food=await store.createPersonalFood({name:this.state.name,brand:this.state.brand,barcode:this.state.barcode,nutritionPer100g:per100,servingLabel:this.state.servingLabel,servingGrams:grams});
      this.props.onSaved(food);
    }catch(e){this.setState({error:e instanceof Error?e.message:'Could not save food.',saving:false});}
  }
  render(){return <div className="editor-stack">
    <div className="form-grid two"><label><span>Food name</span><input value={this.state.name} onChange={(e:any)=>this.setState({name:e.target.value})} placeholder="e.g. My protein bar" autoFocus/></label><label><span>Brand <em>optional</em></span><input value={this.state.brand} onChange={(e:any)=>this.setState({brand:e.target.value})}/></label></div>
    <div className="form-grid three"><label><span>Barcode <em>optional</em></span><input inputMode="numeric" value={this.state.barcode} onChange={(e:any)=>this.setState({barcode:e.target.value.replace(/\D/g,'')})}/></label><label><span>Serving label</span><input value={this.state.servingLabel} onChange={(e:any)=>this.setState({servingLabel:e.target.value})}/></label><label><span>Serving weight</span><div className="input-unit"><input type="number" min="0.1" step="0.1" value={this.state.servingGrams} onChange={(e:any)=>this.setState({servingGrams:e.target.value})}/><b>g</b></div></label></div>
    <div className="field-explainer"><strong>Nutrition for that serving</strong><p>Leave unavailable nutrients blank. Blank means unknown—never zero.</p></div>
    <div className="nutrient-form-grid">{nutrientFields.map(field=><label key={field.key}><span>{field.label}</span><div className="input-unit"><input type="number" min="0" step="any" value={this.state.values[field.key]} onChange={(e:any)=>this.setState({values:{...this.state.values,[field.key]:e.target.value}})} placeholder="—"/><b>{field.unit}</b></div></label>)}</div>
    {this.state.error?<div className="inline-error">{this.state.error}</div>:null}
    <div className="editor-actions"><button className="button button-quiet" onClick={this.props.onCancel}>Cancel</button><button className="button button-primary" disabled={this.state.saving} onClick={()=>this.save()}>{this.state.saving?'Saving…':'Save verified food'}</button></div>
  </div>;}
}

interface IngredientDraft { food:Food; grams:string; }

export class RecipeEditor extends React.Component<{ data:AppData; recipeId?:string; onSaved:()=>void; onCancel:()=>void }, any> {
  constructor(props:any){
    super(props);
    const recipe=props.recipeId?props.data.recipes.find((r:any)=>r.id===props.recipeId):undefined;
    const current=recipe?.versions.find((v:any)=>v.id===recipe.currentVersionId);
    const ingredients:IngredientDraft[]=(current?.ingredients??[]).map((i:any)=>({food:{id:i.foodId??newId('snapshotFood'),name:i.name,kind:'personal',nutritionPer100g:i.nutritionPer100gSnapshot,servings:[],source:i.sourceSnapshot,useCount:0,aliases:[]},grams:String(i.amountG)}));
    this.state={name:recipe?.name??'',query:'',ingredients,finishedWeight:String(current?.finishedWeightG??''),yieldCount:String(current?.yieldCount??''),yieldUnit:current?.yieldUnit??'servings',notes:'',results:[],searching:false,error:'',saving:false};
  }
  localSearch(q:string){this.setState({query:q,results:q.trim()?store.searchLocal(q,'dinner').slice(0,8):[]});}
  async searchDatabases(){
    const q=this.state.query.trim();if(!q)return;
    this.setState({searching:true,error:''});
    try{
      const parts:FoodCandidate[][]=[];
      if(backendConfigured()){try{parts.push(await searchUsda(q));}catch{/* OFF may still work */}}
      try{parts.push(await searchOpenFoodFacts(q));}catch{/* surfaced below only if all empty */}
      const dedup=new Map<string,FoodCandidate>();for(const list of parts)for(const f of list)dedup.set(`${f.barcode??''}|${f.name}|${f.brand??''}`,f);
      this.setState({results:[...store.searchLocal(q,'dinner'),...dedup.values()].slice(0,15)});
    }catch(e){this.setState({error:e instanceof Error?e.message:'Search failed.'});}
    finally{this.setState({searching:false});}
  }
  add(food:Food){
    if(this.state.ingredients.some((x:IngredientDraft)=>x.food.id===food.id))return;
    const grams=store.findDefault(food.id,'dinner')?.typicalAmountG??food.servings[0]?.grams??100;
    this.setState({ingredients:[...this.state.ingredients,{food,grams:String(Math.round(grams))}],query:'',results:[]});
  }
  async save(){
    try{
      this.setState({saving:true,error:''});
      if(!this.state.name.trim())throw new Error('Recipe name is required.');
      const ingredients:RecipeIngredient[]=this.state.ingredients.map((x:IngredientDraft)=>{const grams=Number(x.grams);if(!Number.isFinite(grams)||grams<=0)throw new Error(`Enter a valid weight for ${x.food.name}.`);return{id:newId('ingredient'),foodId:x.food.id,name:x.food.name,amountG:grams,preparationState:'unknown',nutritionPer100gSnapshot:structuredClone(x.food.nutritionPer100g),sourceSnapshot:structuredClone(x.food.source)};});
      const finished=this.state.finishedWeight===''?undefined:Number(this.state.finishedWeight);const count=this.state.yieldCount===''?undefined:Number(this.state.yieldCount);
      if(this.props.recipeId)await store.createRecipeVersion(this.props.recipeId,{ingredients,finishedWeightG:finished,yieldCount:count,yieldUnit:this.state.yieldUnit,notes:this.state.notes});
      else await store.createRecipe({name:this.state.name,ingredients,finishedWeightG:finished,yieldCount:count,yieldUnit:this.state.yieldUnit,notes:this.state.notes});
      this.props.onSaved();
    }catch(e){this.setState({error:e instanceof Error?e.message:'Could not save recipe.',saving:false});}
  }
  render(){return <div className="recipe-editor editor-stack">
    <div className="form-grid two"><label><span>Recipe name</span><input value={this.state.name} disabled={Boolean(this.props.recipeId)} onChange={(e:any)=>this.setState({name:e.target.value})} placeholder="e.g. Mom's yellow dal" autoFocus/></label><label><span>{this.props.recipeId?'Creating':'Recipe'} version</span><input disabled value={this.props.recipeId?`New version ${this.props.data.recipes.find(r=>r.id===this.props.recipeId)!.versions.length+1}`:'Version 1'}/></label></div>
    <div className="field-explainer"><strong>Ingredients</strong><p>Use actual ingredient weights when possible. Nutrition is frozen into this version when you save it.</p></div>
    <div className="ingredient-search"><div className="search-field"><span>⌕</span><input value={this.state.query} onChange={(e:any)=>this.localSearch(e.target.value)} onKeyDown={(e:any)=>{if(e.key==='Enter'){e.preventDefault();this.searchDatabases();}}} placeholder="Search your foods first…"/><button className="button button-quiet" onClick={()=>this.searchDatabases()} disabled={this.state.searching}>{this.state.searching?'Searching…':'Search databases'}</button></div>
      {this.state.results.length?<div className="search-popover">{this.state.results.map((food:Food)=><button key={`${food.id}-${food.source.id}`} onClick={()=>this.add(food)}><FoodAvatar food={food}/><div><strong>{food.name}</strong><small>{food.brand||food.source.name}</small></div><span>+</span></button>)}</div>:null}
    </div>
    <div className="ingredient-list">{this.state.ingredients.length?this.state.ingredients.map((x:IngredientDraft,index:number)=><div className="ingredient-row" key={`${x.food.id}-${index}`}><div><strong>{x.food.name}</strong><SourceChip name={x.food.source.name} quality={x.food.source.quality}/></div><div className="input-unit compact"><input type="number" min="0.1" step="0.1" value={x.grams} onChange={(e:any)=>{const list=[...this.state.ingredients];list[index]={...x,grams:e.target.value};this.setState({ingredients:list});}}/><b>g</b></div><button className="icon-button" aria-label="Remove ingredient" onClick={()=>this.setState({ingredients:this.state.ingredients.filter((_:any,i:number)=>i!==index)})}>×</button></div>):<div className="soft-empty">Search and add ingredients. Personal verified foods and prior ingredients are intentionally ranked first.</div>}</div>
    <div className="yield-panel"><div><h3>How will you portion the finished recipe?</h3><p>For dal, curry, sabzi, soup, or biryani, finished cooked weight is usually the most reusable measurement.</p></div><div className="form-grid three"><label><span>Finished weight</span><div className="input-unit"><input type="number" min="1" step="1" value={this.state.finishedWeight} onChange={(e:any)=>this.setState({finishedWeight:e.target.value})} placeholder="e.g. 1420"/><b>g</b></div></label><label><span>Yield count <em>optional</em></span><input type="number" min="1" step="1" value={this.state.yieldCount} onChange={(e:any)=>this.setState({yieldCount:e.target.value})} placeholder="e.g. 12"/></label><label><span>Yield unit</span><input value={this.state.yieldUnit} onChange={(e:any)=>this.setState({yieldUnit:e.target.value})} placeholder="rotis"/></label></div></div>
    {this.state.error?<div className="inline-error">{this.state.error}</div>:null}
    <div className="editor-actions"><button className="button button-quiet" onClick={this.props.onCancel}>Cancel</button><button className="button button-primary" disabled={this.state.saving} onClick={()=>this.save()}>{this.state.saving?'Saving…':this.props.recipeId?'Save new version':'Save recipe'}</button></div>
  </div>;}
}
