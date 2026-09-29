const GEMINI_MODEL = 'gemini-3.8-flash';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:4173,http://127.0.0.1:4173').split(',').map(x => x.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : null;
}
function cors(req: Request): Record<string,string> {
  const origin = allowedOrigin(req);
  return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', 'vary':'Origin' } : {};
}
function respond(req: Request, body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors(req) } }); }
function cleanText(value: unknown, max = 4000): string { return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
function finiteOrNull(v: unknown): number | null { const n=Number(v); return Number.isFinite(n)&&n>=0?n:null; }

async function requireUser(req: Request): Promise<{ id:string; email?:string }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anon) throw new Error('AUTH_REQUIRED');
  const r = await fetch(`${url}/auth/v1/user`, { headers: { authorization:`Bearer ${token}`, apikey:anon } });
  if (!r.ok) throw new Error('AUTH_REQUIRED');
  const user = await r.json();
  if (!user?.id) throw new Error('AUTH_REQUIRED');
  return { id:user.id, email:user.email };
}

const confidenceEnum = { type:'string', enum:['high','medium','low'] };
const mealSchema = {
  type:'object', additionalProperties:false,
  properties:{
    mealType:{type:['string','null'],enum:['breakfast','lunch','dinner','snack',null]},
    clarificationQuestion:{type:['string','null']},
    items:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,properties:{foodQuery:{type:'string'},quantity:{type:['number','null'],minimum:0},unit:{type:['string','null']},preparation:{type:['string','null']},identityConfidence:confidenceEnum,quantityConfidence:confidenceEnum,clarificationNeeded:{type:['string','null']}},required:['foodQuery','identityConfidence','quantityConfidence']}}
  },required:['items']
};
const photoSchema = {
  type:'object',additionalProperties:false,properties:{
    clarificationQuestion:{type:['string','null']},overallNote:{type:['string','null']},
    items:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,properties:{foodQuery:{type:'string'},identityConfidence:confidenceEnum,quantityText:{type:['string','null']},quantityConfidence:confidenceEnum,clarificationNeeded:{type:['string','null']}},required:['foodQuery','identityConfidence','quantityConfidence']}}
  },required:['items']
};
const labelSchema = {
  type:'object',additionalProperties:false,properties:{
    productName:{type:['string','null']},brand:{type:['string','null']},servingSizeText:{type:['string','null']},servingGrams:{type:['number','null'],minimum:0},
    calories:{type:['number','null'],minimum:0},proteinG:{type:['number','null'],minimum:0},carbsG:{type:['number','null'],minimum:0},fatG:{type:['number','null'],minimum:0},fiberG:{type:['number','null'],minimum:0},saturatedFatG:{type:['number','null'],minimum:0},sodiumMg:{type:['number','null'],minimum:0},sugarG:{type:['number','null'],minimum:0},addedSugarG:{type:['number','null'],minimum:0},confidence:confidenceEnum,warnings:{type:'array',items:{type:'string'},maxItems:8}
  },required:['confidence','warnings']
};
const recipeSchema = {
  type:'object',additionalProperties:false,properties:{name:{type:['string','null']},warnings:{type:'array',items:{type:'string'},maxItems:8},ingredients:{type:'array',maxItems:40,items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},amount:{type:['number','null'],minimum:0},unit:{type:['string','null']},preparationState:{type:['string','null']}},required:['name']}}},required:['ingredients']
};

function imagePart(dataUrl: string): { inlineData:{mimeType:string;data:string} } {
  if (dataUrl.length > 8_000_000) throw new Error('IMAGE_TOO_LARGE');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('INVALID_IMAGE');
  return { inlineData:{mimeType:m[1],data:m[2]} };
}

async function geminiJson(prompt: string, schema: unknown, imageDataUrl?: string): Promise<any> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_NOT_CONFIGURED');
  const parts:any[]=[{text:prompt}];
  if(imageDataUrl)parts.push(imagePart(imageDataUrl));
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{thinkingConfig:{thinkingLevel:'low'},responseFormat:{text:{mimeType:'application/json',schema}}}})
  });
  const raw=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`GEMINI_${response.status}:${raw?.error?.message??'request failed'}`);
  const text=raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text??'').join('').trim();
  if(!text)throw new Error('GEMINI_EMPTY');
  try{return JSON.parse(text);}catch{throw new Error('GEMINI_INVALID_JSON');}
}

function validateParsedMeal(v:any):any{
  if(!v||!Array.isArray(v.items))throw new Error('INVALID_AI_OUTPUT');
  const allowed=new Set(['high','medium','low']);
  const items=v.items.slice(0,12).map((x:any)=>{const foodQuery=cleanText(x?.foodQuery,120);if(!foodQuery)throw new Error('INVALID_AI_OUTPUT');const identityConfidence=allowed.has(x.identityConfidence)?x.identityConfidence:'low';const quantityConfidence=allowed.has(x.quantityConfidence)?x.quantityConfidence:'low';return{foodQuery,quantity:x.quantity==null?undefined:finiteOrNull(x.quantity)??undefined,unit:cleanText(x.unit,40)||undefined,preparation:cleanText(x.preparation,80)||undefined,identityConfidence,quantityConfidence,clarificationNeeded:cleanText(x.clarificationNeeded,180)||undefined};});
  const mt=['breakfast','lunch','dinner','snack'].includes(v.mealType)?v.mealType:undefined;
  return{items,mealType:mt,clarificationQuestion:cleanText(v.clarificationQuestion,220)||undefined};
}
function validatePhoto(v:any):any{return validateParsedMeal({items:(v?.items??[]).map((x:any)=>({...x,quantity:null,unit:x.quantityText})),clarificationQuestion:v?.clarificationQuestion,mealType:null}).items.map((x:any)=>({foodQuery:x.foodQuery,identityConfidence:x.identityConfidence,quantityText:x.unit,quantityConfidence:x.quantityConfidence,clarificationNeeded:x.clarificationNeeded})).reduce((acc:any,item:any)=>{acc.items.push(item);return acc;},{items:[],clarificationQuestion:cleanText(v?.clarificationQuestion,220)||undefined,overallNote:cleanText(v?.overallNote,260)||undefined});}

const nutrientById:Record<number,keyof ReturnType<typeof blankNutrients>>={1008:'energyKcal',1003:'proteinG',1005:'carbsG',1004:'fatG',1079:'fiberG',1258:'saturatedFatG',1093:'sodiumMg',2000:'sugarG',1235:'addedSugarG',1092:'potassiumMg',1087:'calciumMg',1089:'ironMg',1114:'vitaminDMcg'};
function blankNutrients(){return{energyKcal:null as number|null,proteinG:null as number|null,carbsG:null as number|null,fatG:null as number|null,fiberG:null as number|null,saturatedFatG:null as number|null,sodiumMg:null as number|null,sugarG:null as number|null,addedSugarG:null as number|null,potassiumMg:null as number|null,calciumMg:null as number|null,ironMg:null as number|null,vitaminDMcg:null as number|null};}
function normalizeUsda(food:any):any{
  const n=blankNutrients();
  for(const row of food.foodNutrients??[]){const id=Number(row.nutrientId??row.nutrient?.id);const key=nutrientById[id];if(!key)continue;let value=finiteOrNull(row.value??row.amount);if(value===null)continue;const unit=String(row.unitName??row.nutrient?.unitName??'').toUpperCase();if(key==='sodiumMg'||key==='potassiumMg'||key==='calciumMg'||key==='ironMg'){if(unit==='G')value*=1000;else if(unit==='UG'||unit==='MCG')value/=1000;}if(key==='vitaminDMcg'){if(unit==='G')value*=1_000_000;else if(unit==='MG')value*=1000;}n[key]=value;}
  const grams=Number(food.servingSize)>0&&String(food.servingSizeUnit).toLowerCase()==='g'?Number(food.servingSize):100;
  return{id:`usda_${food.fdcId}`,name:String(food.description??'USDA food'),brand:cleanText(food.brandOwner??food.brandName,120)||undefined,kind:food.dataType==='Branded'?'branded':'generic',barcode:cleanText(food.gtinUpc,30)||undefined,nutritionPer100g:n,servings:[{id:`usda_serv_${food.fdcId}`,label:food.householdServingFullText||(`${grams} g`),grams,source:'database'}],source:{id:`usda_${food.fdcId}`,name:'USDA FoodData Central',quality:'authoritative',externalId:String(food.fdcId),url:`https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,retrievedAt:new Date().toISOString(),note:`USDA data type: ${food.dataType??'unknown'}`},useCount:0,aliases:[],matchReason:`USDA · ${food.dataType??'FoodData Central'}`};
}
async function usdaSearch(query:string):Promise<any>{
  const key=Deno.env.get('USDA_API_KEY');if(!key)throw new Error('USDA_NOT_CONFIGURED');
  const response=await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,pageSize:20,dataType:['Foundation','SR Legacy','Survey (FNDDS)','Branded'],sortBy:'dataType.keyword',sortOrder:'asc'})});
  const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`USDA_${response.status}`);return{foods:(json.foods??[]).map(normalizeUsda)};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS'){if(!allowedOrigin(req))return respond(req,{error:'Origin not allowed'},403);return new Response(null,{status:204,headers:cors(req)});}
  if(req.method!=='POST')return respond(req,{error:'Method not allowed'},405);
  if(req.headers.get('origin')&&!allowedOrigin(req))return respond(req,{error:'Origin not allowed'},403);
  try{
    await requireUser(req);
    const body=await req.json().catch(()=>({}));const action=cleanText(body.action,80);
    if(action==='usda.search'){const q=cleanText(body.query,160);if(!q)return respond(req,{error:'Query required'},400);return respond(req,await usdaSearch(q));}
    if(action==='ai.parseMeal'){
      const text=cleanText(body.text,1800);if(!text)return respond(req,{error:'Text required'},400);
      const result=await geminiJson(`You are the interpretation layer inside a nutrition tracker. Parse the user's meal description into semantic food candidates. NEVER invent calories, macros, nutrients, database IDs, or precise gram weights that the user did not state. Preserve Indian and culturally specific food names. Quantity confidence should be low when a household measure such as bowl/katori has not been personally calibrated. Ask at most one clarification question, and only if it materially changes food identity. User text:\n${text}`,mealSchema);
      return respond(req,validateParsedMeal(result));
    }
    if(action==='ai.analyzePhoto'){
      const img=cleanText(body.imageDataUrl,8_000_000);if(!img)return respond(req,{error:'Image required'},400);
      const result=await geminiJson('Identify visible food components in this meal photo. Separate food identity from portion confidence. Do NOT output calories, nutrient values, database IDs, or fake gram precision. For mixed dishes, use culturally appropriate names when reasonably identifiable. If one question would materially disambiguate an item, ask only that one. Be explicit when quantity is uncertain.',photoSchema,img);
      if(!result||!Array.isArray(result.items))throw new Error('INVALID_AI_OUTPUT');
      const allowed=new Set(['high','medium','low']);const items=result.items.slice(0,12).map((x:any)=>({foodQuery:cleanText(x.foodQuery,120),identityConfidence:allowed.has(x.identityConfidence)?x.identityConfidence:'low',quantityText:cleanText(x.quantityText,80)||undefined,quantityConfidence:allowed.has(x.quantityConfidence)?x.quantityConfidence:'low',clarificationNeeded:cleanText(x.clarificationNeeded,180)||undefined})).filter((x:any)=>x.foodQuery);
      return respond(req,{items,clarificationQuestion:cleanText(result.clarificationQuestion,220)||undefined,overallNote:cleanText(result.overallNote,260)||undefined});
    }
    if(action==='ai.extractLabel'){
      const img=cleanText(body.imageDataUrl,8_000_000);if(!img)return respond(req,{error:'Image required'},400);
      const result=await geminiJson('Read the visible Nutrition Facts label. Extract only values actually visible or directly derivable from a clearly labeled serving. Use null when unreadable or absent. Do not guess hidden nutrients. Return sodium in mg, vitamin D in mcg, macros in grams. Include warnings for blurry/cropped/ambiguous fields.',labelSchema,img);
      const safe:any={confidence:['high','medium','low'].includes(result.confidence)?result.confidence:'low',warnings:Array.isArray(result.warnings)?result.warnings.map((x:any)=>cleanText(x,160)).filter(Boolean).slice(0,8):[]};
      for(const k of ['productName','brand','servingSizeText'])safe[k]=cleanText(result[k],160)||undefined;
      for(const k of ['servingGrams','calories','proteinG','carbsG','fatG','fiberG','saturatedFatG','sodiumMg','sugarG','addedSugarG'])safe[k]=result[k]==null?undefined:finiteOrNull(result[k])??undefined;
      return respond(req,safe);
    }
    if(action==='ai.parseRecipe'){
      const text=cleanText(body.text,5000);if(!text)return respond(req,{error:'Text required'},400);
      const result=await geminiJson(`Parse this recipe into ingredient concepts and stated amounts. Do not invent nutrition values or missing quantities. Preserve cultural ingredient names. Text:\n${text}`,recipeSchema);
      const ingredients=(result?.ingredients??[]).slice(0,40).map((x:any)=>({name:cleanText(x.name,120),amount:x.amount==null?undefined:finiteOrNull(x.amount)??undefined,unit:cleanText(x.unit,40)||undefined,preparationState:cleanText(x.preparationState,60)||undefined})).filter((x:any)=>x.name);
      return respond(req,{name:cleanText(result?.name,160)||undefined,ingredients,warnings:Array.isArray(result?.warnings)?result.warnings.map((x:any)=>cleanText(x,160)).filter(Boolean).slice(0,8):[]});
    }
    return respond(req,{error:'Unknown action'},404);
  }catch(error){
    const msg=error instanceof Error?error.message:'Unknown error';
    if(msg==='AUTH_REQUIRED')return respond(req,{error:'Sign in is required for protected backend features.'},401);
    if(msg==='GEMINI_NOT_CONFIGURED'||msg==='USDA_NOT_CONFIGURED')return respond(req,{error:msg==='GEMINI_NOT_CONFIGURED'?'Gemini is not configured on the backend.':'USDA FoodData Central is not configured on the backend.'},503);
    if(msg==='IMAGE_TOO_LARGE'||msg==='INVALID_IMAGE')return respond(req,{error:msg==='IMAGE_TOO_LARGE'?'Image is too large after preprocessing.':'Unsupported image payload.'},400);
    console.error(msg);
    return respond(req,{error:msg.startsWith('GEMINI_')?'AI processing failed. Try again or use ordinary logging.':msg.startsWith('USDA_')?'USDA lookup failed. Try again or use another source.':'Request could not be completed.'},502);
  }
});
