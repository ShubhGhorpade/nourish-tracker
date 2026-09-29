import type { AppData, Confidence, ConfidenceProfile, Food, FoodCandidate, Meal, MealType, ParsedMealCandidate } from '../types.js';
import { store } from '../data/store.js';
import { hasCoreNutrition } from '../domain/nutrition.js';
import { lookupBarcodeOpenFoodFacts, searchOpenFoodFacts } from '../services/openFoodFacts.js';
import { searchUsda } from '../services/usda.js';
import { analyzeMealPhoto, extractNutritionLabel, parseMealText, type LabelExtraction } from '../services/ai.js';
import { prepareImage } from '../services/images.js';
import { backendConfigured } from '../services/config.js';
import { barcodeImageSupported, barcodeScannerEngine, barcodeScannerSupported, decodeBarcodeImage, startBarcodeScanner, type BarcodeScannerHandle } from '../services/barcode.js';
import { listenOnce, speechRecognitionSupported } from '../services/speech.js';
import { ConfidenceChip, FoodAvatar, SourceChip } from './common.js';
import type { FoodEditorInitial } from './editors.js';

interface DraftLine { key:string; food:Food; grams:string; quantityLabel:string; confidence:ConfidenceProfile; range?:{energyKcalMin?:number;energyKcalMax?:number}; }

function defaultAmount(food:Food, data:AppData, mealType:MealType):number{
  return data.defaults.find(d=>d.foodKey===food.id&&d.context===mealType)?.typicalAmountG ?? data.defaults.find(d=>d.foodKey===food.id&&d.context==='any')?.typicalAmountG ?? food.servings[0]?.grams ?? 100;
}
function labelFor(food:Food, grams:number, data:AppData, mealType:MealType):string{
  const d=data.defaults.find(x=>x.foodKey===food.id&&(x.context===mealType||x.context==='any'));
  if(d && Math.abs(d.typicalAmountG-grams)<1)return `usual · ${Math.round(grams)} g`;
  const serving=food.servings.find(s=>Math.abs(s.grams-grams)<0.5);
  return serving?.label ?? `${Math.round(grams)} g`;
}
function confidenceFor(food:Food, quantity:Confidence='high'):ConfidenceProfile{
  return {identity:'high',quantity,nutrition:food.source.quality==='verified'||food.source.quality==='authoritative'?'high':food.source.quality==='estimated'?'low':'medium'};
}

export class MealComposer extends React.Component<{
  data:AppData; initialMealType?:MealType; initialFood?:Food; onClose:()=>void; onSaved:()=>void;
  onCreateFood:(initial?:FoodEditorInitial)=>void; onToast:(message:string,tone?:'neutral'|'success'|'error')=>void;
},any>{
  constructor(props:any){
    super(props);
    const mealType=props.initialMealType??props.data.settings.defaultMealType;
    const draft:DraftLine[]=[];
    if(props.initialFood){const g=defaultAmount(props.initialFood,props.data,mealType);draft.push({key:`draft_${Date.now()}`,food:props.initialFood,grams:String(Math.round(g)),quantityLabel:labelFor(props.initialFood,g,props.data,mealType),confidence:confidenceFor(props.initialFood)});}
    this.state={tab:props.initialFood?'search':'search',mealType,query:'',results:[],searching:false,searchError:'',draft,aiText:'',aiLoading:false,aiItems:[],aiQuestion:'',saveError:''};
  }
  localSearch(query:string){this.setState({query,results:query.trim()?store.searchLocal(query,this.state.mealType).slice(0,12):store.recentFoods(10),searchError:''});}
  async searchDatabases(){
    const q=this.state.query.trim();if(!q)return;
    this.setState({searching:true,searchError:''});
    const local=store.searchLocal(q,this.state.mealType);
    const remote:FoodCandidate[]=[];const errors:string[]=[];
    if(backendConfigured()){try{remote.push(...await searchUsda(q));}catch(e){errors.push(e instanceof Error?e.message:'USDA search failed.');}}
    try{remote.push(...await searchOpenFoodFacts(q));}catch(e){errors.push(e instanceof Error?e.message:'Open Food Facts search failed.');}
    const seen=new Set<string>();const results=[...local,...remote].filter(f=>{const k=`${f.barcode??''}|${f.name.toLowerCase()}|${(f.brand??'').toLowerCase()}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,24);
    this.setState({results,searching:false,searchError:results.length?'':errors[0]??'No database matches found.'});
  }
  addFood(food:Food, quantityConfidence:Confidence='high', suggested?:{quantity?:number;unit?:string}){
    let grams=defaultAmount(food,this.props.data,this.state.mealType);let quantityLabel=labelFor(food,grams,this.props.data,this.state.mealType);
    if(suggested?.quantity&&suggested.unit){const unit=suggested.unit.toLowerCase();if(unit==='g'||unit==='gram'||unit==='grams'){grams=suggested.quantity;quantityLabel=`${suggested.quantity} g`;}else{const s=food.servings.find(x=>x.label.toLowerCase().includes(unit.replace(/s$/,'')));if(s){grams=s.grams*suggested.quantity;quantityLabel=`${suggested.quantity} ${suggested.unit}`;}}}
    const line:DraftLine={key:`draft_${Date.now()}_${Math.random()}`,food,grams:String(Math.round(grams*10)/10),quantityLabel,confidence:confidenceFor(food,quantityConfidence)};
    this.setState({draft:[...this.state.draft,line],query:'',results:[],searchError:''});
  }
  updateDraft(index:number,grams:string){const draft=[...this.state.draft];const n=Number(grams);draft[index]={...draft[index],grams,quantityLabel:Number.isFinite(n)&&n>0?`${Math.round(n*10)/10} g`:draft[index].quantityLabel,confidence:{...draft[index].confidence,quantity:'high'}};this.setState({draft});}
  removeDraft(index:number){this.setState({draft:this.state.draft.filter((_:DraftLine,i:number)=>i!==index)});}
  async save(){
    if(!this.state.draft.length){this.setState({saveError:'Add at least one food before saving.'});return;}
    try{
      this.setState({saving:true,saveError:''});
      for(const line of this.state.draft as DraftLine[]){const grams=Number(line.grams);if(!Number.isFinite(grams)||grams<=0)throw new Error(`Enter a valid amount for ${line.food.name}.`);await store.logFood(line.food,grams,this.state.mealType,line.quantityLabel,line.confidence,line.range);}
      this.props.onToast(`Saved ${this.state.draft.length} ${this.state.draft.length===1?'item':'items'} to ${this.state.mealType}.`,'success');this.props.onSaved();
    }catch(e){this.setState({saveError:e instanceof Error?e.message:'Could not save meal.',saving:false});}
  }
  async parseText(){
    const text=this.state.aiText.trim();if(!text)return;
    this.setState({aiLoading:true,searchError:'',aiItems:[],aiQuestion:''});
    try{
      const parsed=await parseMealText(text);
      if(parsed.mealType)this.setState({mealType:parsed.mealType});
      const unresolved:ParsedMealCandidate[]=[];const draft=[...this.state.draft];
      for(const item of parsed.items){
        const local=store.searchLocal(item.foodQuery,parsed.mealType??this.state.mealType);
        const exact=local.find(f=>f.name.toLowerCase()===item.foodQuery.toLowerCase()||f.aliases.some(a=>a.toLowerCase()===item.foodQuery.toLowerCase()));
        if(exact){let grams=defaultAmount(exact,this.props.data,parsed.mealType??this.state.mealType);let qlabel=labelFor(exact,grams,this.props.data,parsed.mealType??this.state.mealType);if(item.quantity&&item.unit){const u=item.unit.toLowerCase();if(['g','gram','grams'].includes(u)){grams=item.quantity;qlabel=`${item.quantity} g`;}else{const s=exact.servings.find(x=>x.label.toLowerCase().includes(u.replace(/s$/,'')));if(s){grams=s.grams*item.quantity;qlabel=`${item.quantity} ${item.unit}`;}}}draft.push({key:`draft_${Date.now()}_${Math.random()}`,food:exact,grams:String(Math.round(grams*10)/10),quantityLabel:qlabel,confidence:{identity:item.identityConfidence,quantity:item.quantityConfidence,nutrition:confidenceFor(exact).nutrition,reason:item.clarificationNeeded}});}
        else unresolved.push(item);
      }
      this.setState({draft,aiItems:unresolved,aiQuestion:parsed.clarificationQuestion??'',aiLoading:false});
      if(!unresolved.length)this.props.onToast('I matched every item to foods you already know. Review the amounts before saving.','success');
    }catch(e){this.setState({aiLoading:false,searchError:e instanceof Error?e.message:'AI interpretation failed. Ordinary search still works.'});}
  }
  findAiItem(item:ParsedMealCandidate){this.setState({tab:'search',query:item.foodQuery,aiItems:this.state.aiItems.filter((x:ParsedMealCandidate)=>x!==item)},()=>this.searchDatabases());}
  addPhotoItems(items:Array<{foodQuery:string;identityConfidence:Confidence;quantityConfidence:Confidence;clarificationNeeded?:string}> , question?:string){
    const draft=[...this.state.draft];const unresolved:ParsedMealCandidate[]=[];
    for(const item of items){
      const local=store.searchLocal(item.foodQuery,this.state.mealType);
      const exact=local.find(f=>f.name.toLowerCase()===item.foodQuery.toLowerCase()||f.aliases.some(a=>a.toLowerCase()===item.foodQuery.toLowerCase()));
      if(exact){const grams=defaultAmount(exact,this.props.data,this.state.mealType);draft.push({key:`draft_${Date.now()}_${Math.random()}`,food:exact,grams:String(Math.round(grams*10)/10),quantityLabel:labelFor(exact,grams,this.props.data,this.state.mealType),confidence:{identity:item.identityConfidence,quantity:item.quantityConfidence,nutrition:confidenceFor(exact).nutrition,reason:item.clarificationNeeded}});}
      else unresolved.push({...item});
    }
    this.setState({draft,aiItems:[...this.state.aiItems,...unresolved],aiQuestion:question??'',tab:'describe'});
    if(!unresolved.length&&items.length)this.props.onToast('Matched the recognized foods to your personal library. Review only the amounts that look wrong.','success');
  }
  render(){
    const tabs=[['search','Search'],['describe','Describe'],['photo','Photo'],['barcode','Barcode'],['repeat','Repeat']];
    return <div className="composer">
      <div className="composer-top"><label><span>Meal</span><select value={this.state.mealType} onChange={(e:any)=>this.setState({mealType:e.target.value})}>{(['breakfast','lunch','dinner','snack'] as MealType[]).map(x=><option value={x} key={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label><div className="composer-tabs" role="tablist">{tabs.map(([id,label])=><button key={id} className={this.state.tab===id?'active':''} onClick={()=>this.setState({tab:id,searchError:''})}>{label}</button>)}</div></div>
      <div className="composer-input-area">
        {this.state.tab==='search'?this.renderSearch():null}
        {this.state.tab==='describe'?this.renderDescribe():null}
        {this.state.tab==='photo'?<PhotoPane onItems={(items:any[],q?:string)=>this.addPhotoItems(items,q)} onToast={this.props.onToast}/>:null}
        {this.state.tab==='barcode'?<BarcodePane data={this.props.data} mealType={this.state.mealType} onFood={(f:Food)=>this.addFood(f)} onManual={(initial?:FoodEditorInitial)=>this.props.onCreateFood(initial)} onToast={this.props.onToast}/>:null}
        {this.state.tab==='repeat'?<RepeatPane data={this.props.data} onCopied={()=>{this.props.onToast('Copied the meal without an AI call.','success');this.props.onSaved();}}/>:null}
      </div>
      {this.state.searchError?<div className="inline-error">{this.state.searchError}</div>:null}
      <section className="draft-panel"><header><div><span className="eyebrow">Meal composer</span><h3>{this.state.draft.length?`${this.state.draft.length} ${this.state.draft.length===1?'item':'items'} ready`:'Build one editable meal'}</h3></div><small>AI interprets · databases quantify · code calculates</small></header>
        {this.state.draft.length?<div className="draft-list">{(this.state.draft as DraftLine[]).map((line,index)=><div className="draft-row" key={line.key}><FoodAvatar food={line.food}/><div className="draft-main"><div><strong>{line.food.name}</strong>{line.food.brand?<span>{line.food.brand}</span>:null}</div><div className="draft-source"><SourceChip name={line.food.source.name} quality={line.food.source.quality}/><ConfidenceChip profile={line.confidence}/>{!hasCoreNutrition(line.food.nutritionPer100g)?<span className="warning-chip">nutrition incomplete</span>:null}</div></div><div className="draft-quantity"><div className="input-unit compact"><input aria-label={`Grams of ${line.food.name}`} type="number" min="0.1" step="0.1" value={line.grams} onChange={(e:any)=>this.updateDraft(index,e.target.value)}/><b>g</b></div><small>{line.quantityLabel}</small></div><button className="icon-button" aria-label={`Remove ${line.food.name}`} onClick={()=>this.removeDraft(index)}>×</button></div>)}</div>:<div className="soft-empty">Choose a recent food, search your library, describe a meal, take a photo, or scan a barcode. Every path ends here before anything is saved.</div>}
      </section>
      {this.state.saveError?<div className="inline-error">{this.state.saveError}</div>:null}
      <div className="composer-actions"><button className="button button-quiet" onClick={this.props.onClose}>Cancel</button><button className="button button-primary" onClick={()=>this.save()} disabled={!this.state.draft.length||this.state.saving}>{this.state.saving?'Saving…':`Save to ${this.state.mealType}`}</button></div>
    </div>;
  }
  renderSearch(){return <div><div className="search-field prominent"><span>⌕</span><input autoFocus value={this.state.query} onChange={(e:any)=>this.localSearch(e.target.value)} onKeyDown={(e:any)=>{if(e.key==='Enter'){e.preventDefault();this.searchDatabases();}}} placeholder="Search your foods first…"/><button className="button button-secondary" disabled={this.state.searching||!this.state.query.trim()} onClick={()=>this.searchDatabases()}>{this.state.searching?'Searching…':'Search databases'}</button></div><p className="search-hint">Typing searches only your personal history instantly. Database search runs only when you ask, which keeps logging fast and avoids rate-limit churn.</p>{this.state.results.length?<div className="food-results">{(this.state.results as Food[]).map((food,index)=><button key={`${food.id}-${food.source.id}-${index}`} className="food-result" onClick={()=>this.addFood(food)}><FoodAvatar food={food}/><div className="result-main"><strong>{food.name}</strong><span>{food.brand??food.servings[0]?.label??'100 g basis'}</span><div><SourceChip name={food.source.name} quality={food.source.quality}/></div></div><div className="result-nutrition"><b>{food.nutritionPer100g.energyKcal===null?'—':Math.round(food.nutritionPer100g.energyKcal)}</b><span>kcal / 100g</span></div><span className="add-glyph">+</span></button>)}</div>:this.state.query?<div className="soft-empty compact-empty">No personal matches yet. Use “Search databases” or create a verified personal food.</div>:<RecentFoodGrid data={this.props.data} mealType={this.state.mealType} onAdd={(f)=>this.addFood(f)}/>}</div>;}
  renderDescribe(){return <div className="describe-pane"><div className="describe-box"><textarea value={this.state.aiText} onChange={(e:any)=>this.setState({aiText:e.target.value})} placeholder="Try: two rotis, about a bowl of dal, chicken curry and Greek yogurt" rows={4}/><div className="describe-actions">{speechRecognitionSupported()?<button className="button button-quiet" onClick={()=>{try{listenOnce(t=>this.setState({aiText:t}),m=>this.setState({searchError:m}));}catch(e){this.setState({searchError:e instanceof Error?e.message:'Voice input failed.'});}}}>◉ Speak</button>:null}<button className="button button-primary" disabled={this.state.aiLoading||!this.state.aiText.trim()||!backendConfigured()} onClick={()=>this.parseText()}>{this.state.aiLoading?'Interpreting…':'Interpret meal'}</button></div></div>{!backendConfigured()?<div className="callout"><strong>AI backend not connected</strong><span>Text, search, barcode, recipes, and repeat logging still work. Add the Supabase Edge Function URL to enable Gemini interpretation.</span></div>:null}{this.state.aiQuestion?<div className="ai-question"><span>One useful clarification</span><strong>{this.state.aiQuestion}</strong></div>:null}{this.state.aiItems.length?<div className="recognized-list"><div className="field-explainer"><strong>Needs a food match</strong><p>Gemini identified these concepts, but no nutrition has been invented. Match each one to a real food or recipe.</p></div>{(this.state.aiItems as ParsedMealCandidate[]).map((item,index)=><div className="recognized-row" key={`${item.foodQuery}-${index}`}><div><strong>{item.quantity?`${item.quantity} ${item.unit??''} `:''}{item.foodQuery}</strong><small>identity {item.identityConfidence} · amount {item.quantityConfidence}</small></div><button className="button button-quiet" onClick={()=>this.findAiItem(item)}>Find match</button></div>)}</div>:null}</div>;}
}

function RecentFoodGrid({data,mealType,onAdd}:{data:AppData;mealType:MealType;onAdd:(f:Food)=>void}):JSX.Element{
  const recent=[...data.foods].filter(f=>f.lastUsedAt).sort((a,b)=>new Date(b.lastUsedAt??0).getTime()-new Date(a.lastUsedAt??0).getTime()).slice(0,8);
  return recent.length?<div className="recent-grid"><div className="field-explainer"><strong>Recent</strong><p>Known foods require no network and no AI.</p></div>{recent.map(food=><button className="recent-result" key={food.id} onClick={()=>onAdd(food)}><FoodAvatar food={food}/><span><strong>{food.name}</strong><small>{labelFor(food,defaultAmount(food,data,mealType),data,mealType)}</small></span><b>+</b></button>)}</div>:<div className="soft-empty compact-empty">Your recent foods will appear here after the first few logs.</div>;
}

class PhotoPane extends React.Component<{onItems:(items:any[],question?:string)=>void;onToast:(m:string,t?:any)=>void},any>{
  constructor(props:any){super(props);this.state={preview:'',loading:false,error:'',note:''};}
  async choose(file?:File){if(!file)return;try{this.setState({loading:true,error:''});const data=await prepareImage(file);this.setState({preview:data});if(!backendConfigured())throw new Error('Photo interpretation requires the secure Gemini backend. The image stays local until that backend is configured.');const result=await analyzeMealPhoto(data);this.setState({loading:false,note:result.overallNote??''});this.props.onItems(result.items,result.clarificationQuestion);this.props.onToast('Photo interpreted. Match only the items that still need nutrition sources.','success');}catch(e){this.setState({loading:false,error:e instanceof Error?e.message:'Could not analyze photo.'});}}
  render(){return <div className="photo-pane"><label className="dropzone"><input type="file" accept="image/*" capture="environment" onChange={(e:any)=>this.choose(e.target.files?.[0])}/>{this.state.preview?<img src={this.state.preview} alt="Meal preview"/>:<div className="dropzone-copy"><span className="camera-mark">◎</span><strong>Take or choose a meal photo</strong><small>The browser resizes it and strips metadata before external processing. Meal photos are not saved by default.</small></div>}</label>{this.state.loading?<div className="loading-line">Analyzing food identity—not inventing calories…</div>:null}{this.state.note?<div className="callout"><span>{this.state.note}</span></div>:null}{this.state.error?<div className="inline-error">{this.state.error}</div>:null}<div className="callout subtle"><strong>Photo rule</strong><span>Identity, portion, and nutrition source are separate. A clear photo can still have an uncertain amount or recipe.</span></div></div>;}
}

class BarcodePane extends React.Component<{data:AppData;mealType:MealType;onFood:(f:Food)=>void;onManual:(initial?:FoodEditorInitial)=>void;onToast:(m:string,t?:any)=>void},any>{
  videoRef=React.createRef<HTMLVideoElement>(); scanner?:BarcodeScannerHandle;
  constructor(props:any){super(props);this.state={code:'',status:'',error:'',scanning:false,unknown:false,labelLoading:false,imageLoading:false};}
  componentWillUnmount(){this.scanner?.stop();}
  async scan(){
    try{
      this.setState({scanning:true,error:'',status:'Opening the rear camera…'});
      this.scanner=await startBarcodeScanner(this.videoRef.current!,code=>{
        this.setState({code,scanning:false,status:'Barcode detected.'});
        this.lookup(code);
      },m=>this.setState({error:m}));
      this.setState({status:`Point the camera at the UPC/EAN barcode · ${barcodeScannerEngine()==='zxing'?'compatibility scanner':'on-device scanner'}`});
    }catch(e){
      this.setState({scanning:false,status:'',error:e instanceof Error?e.message:'Camera scanning failed.'});
    }
  }
  stop(){this.scanner?.stop();this.scanner=undefined;this.setState({scanning:false,status:''});}
  async scanBarcodePhoto(file?:File){
    if(!file)return;
    try{
      this.stop();
      this.setState({imageLoading:true,error:'',status:'Reading barcode photo…'});
      const code=await decodeBarcodeImage(file);
      this.setState({code,imageLoading:false,status:'Barcode detected from photo.'});
      await this.lookup(code);
    }catch(e){
      this.setState({imageLoading:false,status:'',error:e instanceof Error?e.message:'Could not read that barcode photo.'});
    }
  }
  async lookup(input?:string){const code=(input??this.state.code).replace(/\D/g,'');if(code.length<8){this.setState({error:'Enter a valid UPC/EAN barcode.'});return;}this.stop();this.setState({status:'Checking your personal cache…',error:'',unknown:false});try{const local=store.findBarcode(code);if(local){this.props.onFood(local);this.setState({status:'Found in your personal cache.'});this.props.onToast('Known barcode matched locally—no AI call.','success');return;}this.setState({status:'Checking Open Food Facts…'});const food=await lookupBarcodeOpenFoodFacts(code);if(food){this.props.onFood(food);this.setState({status:'Product found. Review the package label if precision matters.'});return;}this.setState({status:'',unknown:true});}catch(e){this.setState({status:'',error:e instanceof Error?e.message:'Barcode lookup failed.'});}}
  async scanLabel(file?:File){if(!file)return;try{this.setState({labelLoading:true,error:''});const data=await prepareImage(file);const label=await extractNutritionLabel(data);const values:any={energyKcal:label.calories??null,proteinG:label.proteinG??null,carbsG:label.carbsG??null,fatG:label.fatG??null,fiberG:label.fiberG??null,saturatedFatG:label.saturatedFatG??null,sodiumMg:label.sodiumMg??null,sugarG:label.sugarG??null,addedSugarG:label.addedSugarG??null};this.props.onManual({name:label.productName,brand:label.brand,barcode:this.state.code,servingLabel:label.servingSizeText??'1 serving',servingGrams:label.servingGrams??100,valuesPerServing:values});}catch(e){this.setState({error:e instanceof Error?e.message:'Could not extract the label.'});}finally{this.setState({labelLoading:false});}}
  render(){
    const supported=barcodeScannerSupported();
    const stillSupported=barcodeImageSupported();
    const engine=barcodeScannerEngine();
    return <div className="barcode-pane">
      <div className={`scanner-shell ${this.state.scanning?'active':''}`}>
        <video ref={this.videoRef} playsInline muted autoPlay/>
        <div className="scanner-frame"><i/><i/><i/><i/></div>
        {!this.state.scanning?<div className="scanner-placeholder"><span>▦</span><strong>{supported?'Scan a UPC/EAN barcode':'Use barcode photo or manual entry'}</strong><small>{supported?(engine==='zxing'?'iPhone compatibility scanner is ready. Keep the full barcode inside the frame.':'UPC-A, UPC-E, EAN-8 and EAN-13 are decoded on-device.'):'Safari does not expose the native BarcodeDetector API. The photo fallback works without Gemini.'}</small></div>:null}
      </div>
      <div className="barcode-actions">
        {supported?<button className="button button-secondary" onClick={()=>this.state.scanning?this.stop():this.scan()}>{this.state.scanning?'Stop camera':'Start camera'}</button>:null}
        {stillSupported?<label className="button button-quiet file-button">{this.state.imageLoading?'Reading photo…':'Take barcode photo'}<input type="file" accept="image/*" capture="environment" onChange={(e:any)=>this.scanBarcodePhoto(e.target.files?.[0])}/></label>:null}
        <div className="barcode-manual"><input inputMode="numeric" autoComplete="off" placeholder="Enter barcode digits" value={this.state.code} onChange={(e:any)=>this.setState({code:e.target.value.replace(/\D/g,'')})} onKeyDown={(e:any)=>{if(e.key==='Enter')this.lookup();}}/><button className="button button-primary" onClick={()=>this.lookup()}>Look up</button></div>
      </div>
      {this.state.status?<div className="loading-line">{this.state.status}</div>:null}
      {this.state.error?<div className="inline-error">{this.state.error}</div>:null}
      <div className="callout subtle"><strong>No AI needed</strong><span>Barcode decoding and Open Food Facts lookup stay deterministic. If the live camera is awkward on iPhone, use “Take barcode photo.”</span></div>
      {this.state.unknown?<div className="unknown-product"><strong>We don’t have this product yet.</strong><p>No fake match was substituted. Add it from the package label and it will become a personal verified product for next time.</p><div><label className="button button-secondary file-button">{this.state.labelLoading?'Reading label…':'Scan nutrition label'}<input type="file" accept="image/*" capture="environment" onChange={(e:any)=>this.scanLabel(e.target.files?.[0])}/></label><button className="button button-quiet" onClick={()=>this.props.onManual({barcode:this.state.code})}>Enter manually</button></div></div>:null}
    </div>;
  }
}

function RepeatPane({data,onCopied}:{data:AppData;onCopied:()=>void}):JSX.Element{
  const meals=[...data.meals].sort((a,b)=>new Date(b.eatenAt).getTime()-new Date(a.eatenAt).getTime()).slice(0,8);
  return <div className="repeat-pane"><div className="field-explainer"><strong>Repeat without reinterpreting</strong><p>Copies the historical nutrition snapshots exactly. No search and no AI.</p></div>{meals.length?<div className="repeat-list">{meals.map(meal=><div className="repeat-row" key={meal.id}><div><span className="eyebrow">{new Date(meal.eatenAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {meal.mealType}</span><strong>{meal.items.map(i=>i.name).join(' · ')}</strong></div><button className="button button-quiet" onClick={async()=>{await store.copyMeal(meal.id,new Date());onCopied();}}>Copy to today</button></div>)}</div>:<div className="soft-empty compact-empty">Past meals will appear here.</div>}</div>;
}
