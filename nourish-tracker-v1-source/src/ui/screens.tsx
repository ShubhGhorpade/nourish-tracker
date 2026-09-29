import type { AppData, Food, Meal, MealItem, MealType, Nutrients } from '../types.js';
import { sumNutrients } from '../domain/nutrition.js';
import { localDateKey } from '../domain/id.js';
import { EmptyState, FoodAvatar, MealCard, Metric, NutrientMini, SourceChip } from './common.js';

function mealsForDate(data: AppData, date: Date): Meal[] {
  const key = localDateKey(date);
  return data.meals.filter(m => localDateKey(m.eatenAt) === key).sort((a,b) => new Date(a.eatenAt).getTime() - new Date(b.eatenAt).getTime());
}

function mealTotal(meal: Meal): Nutrients { return sumNutrients(meal.items.map(i => i.nutritionSnapshot)); }
function dayTotal(meals: Meal[]): Nutrients { return sumNutrients(meals.flatMap(m => m.items.map(i => i.nutritionSnapshot))); }

export function TodayScreen(props: {
  data: AppData;
  onLog: (mealType?: MealType, food?: Food) => void;
  onCopyMeal: (meal: Meal) => void;
  onEditItem: (meal: Meal, item: MealItem) => void;
  onRemoveItem: (meal: Meal, item: MealItem) => void;
}): JSX.Element {
  const today = new Date();
  const meals = mealsForDate(props.data, today);
  const totals = dayTotal(meals);
  const uniqueFoods = new Set(meals.flatMap(m => m.items.map(i => i.foodId ?? i.name.toLowerCase()))).size;
  const recent = [...props.data.foods].filter(f => f.lastUsedAt).sort((a,b)=>new Date(b.lastUsedAt ?? 0).getTime()-new Date(a.lastUsedAt ?? 0).getTime()).slice(0,5);
  const dateLabel = today.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
  const byType = new Map<MealType, Meal>();
  meals.forEach(m => byType.set(m.mealType, m));
  const mealTypes: MealType[] = ['breakfast','lunch','dinner','snack'];
  return <div className="page today-page">
    <header className="page-heading"><div><div className="eyebrow">Today</div><h1>{dateLabel}</h1><p>Your nutrition memory gets faster every time you confirm what you actually ate.</p></div></header>
    <section className="metrics-grid">
      <Metric label="Protein" value={totals.proteinG} unit="g" goal={props.data.settings.proteinGoalG} />
      <Metric label="Fiber" value={totals.fiberG} unit="g" goal={props.data.settings.fiberGoalG} />
      {props.data.settings.showEnergy ? <Metric label="Energy" value={totals.energyKcal} unit=" kcal" subdued /> : <Metric label="Food variety" value={uniqueFoods} unit=" foods" subdued />}
      <Metric label="Foods logged" value={meals.reduce((n,m)=>n+m.items.length,0)} unit="" subdued />
    </section>

    {recent.length ? <section className="quick-strip"><div className="section-heading-inline"><h2>Quick log</h2><span>Personal-first</span></div><div className="quick-scroll">
      {recent.map(food => <button key={food.id} className="quick-food" onClick={() => props.onLog(undefined, food)}><FoodAvatar food={food}/><span>{food.name}</span><small>{props.data.defaults.find(d => d.foodKey === food.id)?.typicalAmountG ? `usual ${Math.round(props.data.defaults.find(d => d.foodKey === food.id)!.typicalAmountG)} g` : food.servings[0]?.label ?? 'choose amount'}</small></button>)}
      <button className="quick-food quick-special" onClick={() => props.onLog()}><div className="food-avatar food-avatar-fallback">+</div><span>Something else</span><small>search · photo · barcode</small></button>
    </div></section> : null}

    <section className="meal-grid">
      {mealTypes.map(type => {
        const meal = byType.get(type);
        if (meal) return <MealCard key={type} meal={meal} total={mealTotal(meal)} onCopy={() => props.onCopyMeal(meal)} onEditItem={item => props.onEditItem(meal,item)} onRemoveItem={item => props.onRemoveItem(meal,item)} />;
        return <section key={type} className="meal-card meal-card-empty"><header><div><div className="eyebrow">{type}</div><h3>Not logged</h3></div><button className="text-button" onClick={() => props.onLog(type)}>Add</button></header><div className="meal-empty-body"><span>+</span><p>Log only when useful. No streaks, no guilt.</p></div></section>;
      })}
    </section>
  </div>;
}

export function HistoryScreen(props: { data: AppData; onCopyMeal: (meal: Meal) => void; onOpenMeal: (meal: Meal) => void }): JSX.Element {
  const groups = new Map<string, Meal[]>();
  [...props.data.meals].sort((a,b)=>new Date(b.eatenAt).getTime()-new Date(a.eatenAt).getTime()).forEach(meal => {
    const key = localDateKey(meal.eatenAt); const list = groups.get(key) ?? []; list.push(meal); groups.set(key,list);
  });
  return <div className="page"><header className="page-heading"><div><div className="eyebrow">History</div><h1>Your food memory</h1><p>Past entries are immutable nutrition snapshots: later database or recipe changes do not rewrite what you logged.</p></div></header>
    {!groups.size ? <EmptyState icon="↺" title="No history yet" body="Your logged meals will appear here, ready to copy without an AI call." /> : <div className="history-list">
      {[...groups.entries()].map(([key, meals]) => { const totals=dayTotal(meals); const d=new Date(`${key}T12:00:00`); return <section className="history-day" key={key}><header><div><h2>{d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}</h2><NutrientMini nutrients={totals}/></div></header><div className="history-meals">{meals.map(meal => <article key={meal.id} className="history-meal"><button className="history-meal-open" onClick={()=>props.onOpenMeal(meal)} aria-label={`Open ${meal.mealType} details`}><div><span className="eyebrow">{meal.mealType}</span><strong>{meal.items.map(i=>i.name).join(' · ')}</strong><small>{meal.items.length} {meal.items.length===1?'item':'items'}</small></div><span>{mealTotal(meal).energyKcal===null?'—':`${Math.round(mealTotal(meal).energyKcal!)} kcal`}</span></button><button className="text-button" onClick={()=>props.onCopyMeal(meal)}>Copy</button></article>)}</div></section>; })}
    </div>}
  </div>;
}

function lastNDates(n: number): Date[] { const out:Date[]=[]; for(let i=n-1;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);out.push(d);}return out; }

export function InsightsScreen({ data }: { data: AppData }): JSX.Element {
  const days = lastNDates(7);
  const series = days.map(d => ({ date:d, total:dayTotal(mealsForDate(data,d)), meals:mealsForDate(data,d) }));
  const loggedDays = series.filter(x=>x.meals.length);
  const avg = (key: keyof Nutrients): number | null => { const vals=loggedDays.map(x=>x.total[key]).filter((v):v is number=>v!==null); return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null; };
  const protein=avg('proteinG'), fiber=avg('fiberG'), sodium=avg('sodiumMg');
  const incompleteIron=loggedDays.filter(x=>x.total.ironMg===null).length;
  const maxProtein=Math.max(1,...series.map(x=>x.total.proteinG??0));
  return <div className="page"><header className="page-heading"><div><div className="eyebrow">Insights</div><h1>Patterns, not judgment</h1><p>Seven-day trends use only the nutrition your sources actually provided. Missing nutrients remain unknown rather than becoming zero.</p></div></header>
    {!loggedDays.length ? <EmptyState icon="⌁" title="Insights need a little history" body="Log a few meals and this view will summarize patterns without scoring foods as good or bad." /> : <div className="insights-wrap">
      <section className="insight-summary">
        <article><span>Protein</span><strong>{protein===null?'Incomplete':`${Math.round(protein)} g/day`}</strong><p>{protein!==null&&protein>=data.settings.proteinGoalG*.9?'Close to your current daily target on logged days.':'Below your current target on the logged days shown.'}</p></article>
        <article><span>Fiber</span><strong>{fiber===null?'Incomplete':`${Math.round(fiber)} g/day`}</strong><p>{fiber!==null&&fiber>=data.settings.fiberGoalG*.8?'Often near your current fiber target.':'Often below your current fiber target; look at the weekly pattern rather than one meal.'}</p></article>
        <article><span>Sodium</span><strong>{sodium===null?'Incomplete':`${Math.round(sodium)} mg/day`}</strong><p>Shown descriptively; restaurant and community records may have uneven coverage.</p></article>
        <article><span>Iron data</span><strong>{incompleteIron ? `${incompleteIron} day${incompleteIron===1?'':'s'} incomplete` : 'Available each logged day'}</strong><p>“Unknown” is preserved when a source does not report iron.</p></article>
      </section>
      <section className="trend-panel"><div className="section-heading-inline"><h2>Protein · last 7 days</h2><span>logged data only</span></div><div className="bars">{series.map(x=><div className="bar-col" key={x.date.toISOString()}><div className="bar-track"><i style={{height:`${Math.max(2,((x.total.proteinG??0)/maxProtein)*100)}%`}} /></div><small>{x.date.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</small></div>)}</div></section>
    </div>}
  </div>;
}

export function LibraryScreen(props: { data: AppData; onCreateFood: () => void; onLogFood: (food: Food) => void }): JSX.Element {
  const foods=[...props.data.foods].sort((a,b)=>(b.useCount-a.useCount)||a.name.localeCompare(b.name));
  return <div className="page"><header className="page-heading"><div><div className="eyebrow">Library</div><h1>Your foods</h1><p>Verified personal foods, remembered products, and recipe-derived foods outrank generic database clutter.</p></div><button className="button button-secondary" onClick={props.onCreateFood}>+ Personal food</button></header>
    {!foods.length ? <EmptyState icon="◫" title="Your library starts empty" body="Scan a product, create a personal food, or save a recipe. Your own history becomes the first search layer." actionLabel="Create personal food" onAction={props.onCreateFood}/> : <div className="library-list">{foods.map(food=><article key={food.id} className="library-row"><FoodAvatar food={food}/><div className="library-main"><div><strong>{food.name}</strong>{food.brand?<span>{food.brand}</span>:null}</div><div><SourceChip name={food.source.name} quality={food.source.quality}/><small>{food.useCount} logs</small></div></div><div className="library-nutrition"><span>{food.nutritionPer100g.energyKcal===null?'—':Math.round(food.nutritionPer100g.energyKcal)}<small> kcal/100g</small></span><button className="button button-quiet" onClick={()=>props.onLogFood(food)}>Log</button></div></article>)}</div>}
  </div>;
}

export function RecipesScreen(props: { data: AppData; onCreate: () => void; onEdit: (recipeId:string) => void; onLog: (food:Food) => void }): JSX.Element {
  return <div className="page"><header className="page-heading"><div><div className="eyebrow">Recipes</div><h1>Homemade food, remembered correctly</h1><p>Each change creates a new recipe version. Old meals keep their original nutrition snapshots.</p></div><button className="button button-primary" onClick={props.onCreate}>+ New recipe</button></header>
    {!props.data.recipes.length ? <EmptyState icon="⌘" title="No recipes yet" body="Recipes are the most trustworthy way to track dal, curry, sabzi, soups, biryani, and other mixed homemade dishes." actionLabel="Create recipe" onAction={props.onCreate}/> : <div className="recipe-list">{props.data.recipes.map(recipe=>{const v=recipe.versions.find(x=>x.id===recipe.currentVersionId)!;const food=props.data.foods.find(f=>f.id===`recipeFood_${recipe.id}`);return <article className="recipe-card" key={recipe.id}><header><div><span className="eyebrow">Recipe · v{v.version}</span><h2>{recipe.name}</h2></div><span className="version-count">{recipe.versions.length} version{recipe.versions.length===1?'':'s'}</span></header><div className="recipe-facts"><span><b>{v.ingredients.length}</b> ingredients</span>{v.finishedWeightG?<span><b>{Math.round(v.finishedWeightG)} g</b> finished</span>:null}{v.yieldCount?<span><b>{v.yieldCount}</b> {v.yieldUnit??'servings'}</span>:null}</div><div className="recipe-ingredients">{v.ingredients.slice(0,4).map(i=><span key={i.id}>{i.name} · {Math.round(i.amountG)}g</span>)}{v.ingredients.length>4?<span>+{v.ingredients.length-4} more</span>:null}</div><footer><button className="button button-quiet" onClick={()=>props.onEdit(recipe.id)}>New version</button>{food?<button className="button button-primary" onClick={()=>props.onLog(food)}>Log recipe</button>:null}</footer></article>;})}</div>}
  </div>;
}
