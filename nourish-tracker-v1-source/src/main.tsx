import type { AppData, Food, Meal, MealItem, MealType } from './types.js';
import { initialData, store } from './data/store.js';
import { TodayScreen, HistoryScreen, InsightsScreen, LibraryScreen, RecipesScreen } from './ui/screens.js';
import { MealComposer } from './ui/composer.js';
import { PersonalFoodEditor, RecipeEditor, type FoodEditorInitial } from './ui/editors.js';
import { SettingsScreen } from './ui/settings.js';
import { MealItemRow, Modal, NutrientMini, SourceChip, Toast } from './ui/common.js';
import { sumNutrients } from './domain/nutrition.js';
import { backendConfigured } from './services/config.js';

type Route='today'|'history'|'recipes'|'library'|'insights'|'settings';
type ModalState=
  |{type:'composer';mealType?:MealType;food?:Food}
  |{type:'foodEditor';initial?:FoodEditorInitial;returnMealType?:MealType}
  |{type:'recipeEditor';recipeId?:string}
  |{type:'editAmount';meal:Meal;item:MealItem}
  |{type:'meal';meal:Meal}
  |null;

function currentRoute():Route{const raw=location.hash.replace(/^#/,'').split('/')[0] as Route;return ['today','history','recipes','library','insights','settings'].includes(raw)?raw:'today';}
function navigate(route:Route){location.hash=route;}

class AppRoot extends React.Component<{}, {data:AppData;ready:boolean;route:Route;modal:ModalState;toast?:{message:string;tone:'neutral'|'success'|'error'};online:boolean}>{
  unsubscribe?:()=>void;toastTimer?:number;
  constructor(props:{}){super(props);this.state={data:initialData(),ready:false,route:currentRoute(),modal:null,online:navigator.onLine};}
  componentDidMount(){
    this.unsubscribe=store.subscribe(()=>this.setState({data:store.snapshot(),ready:store.isReady()}));
    store.init().catch(e=>this.showToast(e instanceof Error?e.message:'Could not open local database.','error'));
    addEventListener('hashchange',this.onHash);addEventListener('online',this.onOnline);addEventListener('offline',this.onOffline);
    if('serviceWorker'in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{/* non-fatal */});}
  }
  componentWillUnmount(){this.unsubscribe?.();removeEventListener('hashchange',this.onHash);removeEventListener('online',this.onOnline);removeEventListener('offline',this.onOffline);}
  onHash=()=>this.setState({route:currentRoute()});onOnline=()=>this.setState({online:true});onOffline=()=>this.setState({online:false});
  showToast(message:string,tone:'neutral'|'success'|'error'='neutral'){if(this.toastTimer)clearTimeout(this.toastTimer);this.setState({toast:{message,tone}});this.toastTimer=window.setTimeout(()=>this.setState({toast:undefined}),4200);}
  openComposer(mealType?:MealType,food?:Food){this.setState({modal:{type:'composer',mealType,food}});}
  async copyMeal(meal:Meal){try{await store.copyMeal(meal.id,new Date());this.showToast(`Copied ${meal.mealType} to today—no AI call.`,'success');navigate('today');}catch(e){this.showToast(e instanceof Error?e.message:'Could not copy meal.','error');}}
  async removeItem(meal:Meal,item:MealItem){if(!confirm(`Remove ${item.name} from this meal?`))return;await store.removeMealItem(meal.id,item.id);this.showToast('Item removed.','neutral');}
  render(){if(!this.state.ready)return <div className="boot-screen"><div className="brand-mark">N</div><strong>Nourish</strong><span>Opening your local nutrition memory…</span></div>;
    return <div className="app-shell"><Sidebar route={this.state.route} online={this.state.online}/><main className="main-area"><Topbar online={this.state.online} onLog={()=>this.openComposer()}/>{this.renderRoute()}</main><MobileNav route={this.state.route} onLog={()=>this.openComposer()}/>{this.renderModal()}{this.state.toast?<Toast message={this.state.toast.message} tone={this.state.toast.tone}/>:null}</div>;
  }
  renderRoute(){const common={data:this.state.data};switch(this.state.route){case'today':return <TodayScreen {...common} onLog={(m,f)=>this.openComposer(m,f)} onCopyMeal={m=>this.copyMeal(m)} onEditItem={(m,i)=>this.setState({modal:{type:'editAmount',meal:m,item:i}})} onRemoveItem={(m,i)=>this.removeItem(m,i)}/>;case'history':return <HistoryScreen {...common} onCopyMeal={m=>this.copyMeal(m)} onOpenMeal={m=>this.setState({modal:{type:'meal',meal:m}})}/>;case'recipes':return <RecipesScreen {...common} onCreate={()=>this.setState({modal:{type:'recipeEditor'}})} onEdit={id=>this.setState({modal:{type:'recipeEditor',recipeId:id}})} onLog={f=>this.openComposer(undefined,f)}/>;case'library':return <LibraryScreen {...common} onCreateFood={()=>this.setState({modal:{type:'foodEditor'}})} onLogFood={f=>this.openComposer(undefined,f)}/>;case'insights':return <InsightsScreen {...common}/>;case'settings':return <SettingsScreen {...common} onRefresh={()=>this.setState({data:store.snapshot()})} onToast={(m:string,t?:'neutral'|'success'|'error')=>this.showToast(m,t)}/>;}}
  renderModal(){const m=this.state.modal;if(!m)return null;
    if(m.type==='composer')return <Modal title="Log food" subtitle="One composer for search, language, photo, barcode, and repeat meals." onClose={()=>this.setState({modal:null})} wide><MealComposer data={this.state.data} initialMealType={m.mealType} initialFood={m.food} onClose={()=>this.setState({modal:null})} onSaved={()=>this.setState({modal:null})} onCreateFood={(initial?:FoodEditorInitial)=>this.setState({modal:{type:'foodEditor',initial,returnMealType:m.mealType}})} onToast={(msg:string,tone?:'neutral'|'success'|'error')=>this.showToast(msg,tone)}/></Modal>;
    if(m.type==='foodEditor')return <Modal title="Personal verified food" subtitle="Use values from a package label or another source you trust. Blank nutrients stay unknown." onClose={()=>this.setState({modal:null})} wide><PersonalFoodEditor initial={m.initial} onCancel={()=>this.setState({modal:null})} onSaved={(food:Food)=>{this.showToast('Personal verified food saved.','success');this.openComposer(m.returnMealType,food);}}/></Modal>;
    if(m.type==='recipeEditor')return <Modal title={m.recipeId?'Create new recipe version':'Create recipe'} subtitle="Ingredient nutrition is snapshotted into this version, so historical meals remain stable." onClose={()=>this.setState({modal:null})} wide><RecipeEditor data={this.state.data} recipeId={m.recipeId} onCancel={()=>this.setState({modal:null})} onSaved={()=>{this.setState({modal:null});this.showToast(m.recipeId?'New recipe version saved.':'Recipe saved.','success');}}/></Modal>;
    if(m.type==='editAmount')return <EditAmountModal meal={m.meal} item={m.item} onClose={()=>this.setState({modal:null})} onSaved={()=>{this.setState({modal:null});this.showToast('Quantity updated. Historical source provenance was preserved.','success');}}/>;
    if(m.type==='meal')return <MealDetailModal meal={m.meal} onClose={()=>this.setState({modal:null})} onCopy={()=>{this.setState({modal:null});this.copyMeal(m.meal);}}/>;
    return null;
  }
}

function Sidebar({route,online}:{route:Route;online:boolean}):JSX.Element{const items:Array<[Route,string,string]>=[['today','Today','⌂'],['history','History','↺'],['recipes','Recipes','⌘'],['library','Library','◫'],['insights','Insights','⌁'],['settings','Settings','⚙']];return <aside className="sidebar"><div className="brand"><div className="brand-mark">N</div><div><strong>Nourish</strong><span>personal nutrition memory</span></div></div><nav>{items.map(([id,label,icon])=><a key={id} href={`#${id}`} className={route===id?'active':''}><span aria-hidden="true">{icon}</span>{label}</a>)}</nav><div className="sidebar-foot"><div className={`connection-dot ${online?'online':'offline'}`}/><span>{online?(backendConfigured()?'Online · backend configured':'Online · local first'):'Offline · local logging'}</span></div></aside>;}
function Topbar({online,onLog}:{online:boolean;onLog:()=>void}):JSX.Element{return <header className="topbar"><div className="mobile-brand"><div className="brand-mark">N</div><strong>Nourish</strong></div><div className="topbar-status"><span className={`connection-dot ${online?'online':'offline'}`}/>{online?'Online':'Offline'}</div><button className="button button-primary topbar-log" onClick={onLog}>+ Log food</button></header>;}
function MobileNav({route,onLog}:{route:Route;onLog:()=>void}):JSX.Element{return <nav className="mobile-nav"><a href="#today" className={route==='today'?'active':''}><span>⌂</span><small>Today</small></a><a href="#history" className={route==='history'?'active':''}><span>↺</span><small>History</small></a><button aria-label="Log food" className="mobile-log" onClick={onLog}>+</button><a href="#recipes" className={route==='recipes'?'active':''}><span>⌘</span><small>Recipes</small></a><a href="#insights" className={route==='insights'?'active':''}><span>⌁</span><small>Insights</small></a></nav>;}

class EditAmountModal extends React.Component<{meal:Meal;item:MealItem;onClose:()=>void;onSaved:()=>void},{grams:string;error:string;busy:boolean}>{
  constructor(p:any){super(p);this.state={grams:String(p.item.amountG),error:'',busy:false};}
  async save(){try{this.setState({busy:true,error:''});const grams=Number(this.state.grams);await store.updateMealItemAmount(this.props.meal.id,this.props.item.id,grams,`${Math.round(grams*10)/10} g`);this.props.onSaved();}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:'Could not update amount.'});}}
  render(){return <Modal title={`Edit ${this.props.item.name}`} subtitle="Only quantity changes. The original nutrition source and per-100g snapshot stay attached to this historical item." onClose={this.props.onClose}><div className="editor-stack"><label><span>Amount</span><div className="input-unit"><input autoFocus type="number" min="0.1" step="0.1" value={this.state.grams} onChange={(e:any)=>this.setState({grams:e.target.value})}/><b>g</b></div></label><SourceChip name={this.props.item.sourceSnapshot.name} quality={this.props.item.sourceSnapshot.quality}/>{this.state.error?<div className="inline-error">{this.state.error}</div>:null}<div className="editor-actions"><button className="button button-quiet" onClick={this.props.onClose}>Cancel</button><button className="button button-primary" disabled={this.state.busy} onClick={()=>this.save()}>{this.state.busy?'Saving…':'Update quantity'}</button></div></div></Modal>;}
}

function MealDetailModal({meal,onClose,onCopy}:{meal:Meal;onClose:()=>void;onCopy:()=>void}):JSX.Element{const total=sumNutrients(meal.items.map(i=>i.nutritionSnapshot));return <Modal title={`${meal.mealType[0].toUpperCase()+meal.mealType.slice(1)} · ${new Date(meal.eatenAt).toLocaleDateString()}`} subtitle="This view uses the nutrition snapshots stored when you logged the meal." onClose={onClose} wide><div className="meal-detail"><div className="meal-detail-total"><NutrientMini nutrients={total}/><button className="button button-secondary" onClick={onCopy}>Copy to today</button></div>{meal.items.map(item=><div key={item.id} className="meal-detail-item"><MealItemRow item={item}/><details><summary>Provenance & uncertainty</summary><div className="provenance-grid"><div><span>Source</span><strong>{item.sourceSnapshot.name}</strong></div><div><span>Identity</span><strong>{item.confidence.identity}</strong></div><div><span>Quantity</span><strong>{item.confidence.quantity}</strong></div><div><span>Nutrition</span><strong>{item.confidence.nutrition}</strong></div>{item.recipeVersionId?<div><span>Recipe version</span><strong>{item.recipeVersionId}</strong></div>:null}</div></details></div>)}</div></Modal>;}

ReactDOM.render(<AppRoot/>,document.getElementById('root')!);
