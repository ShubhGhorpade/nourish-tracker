import test from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage(){
  const m=new Map();
  return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()};
}

function setBrowserGlobals(config={}){
  Object.defineProperty(globalThis,'window',{value:{NOURISH_CONFIG:config},configurable:true,writable:true});
  Object.defineProperty(globalThis,'localStorage',{value:memoryStorage(),configurable:true,writable:true});
}

test('protected backend calls create a private anonymous Supabase session when no account session exists',async()=>{
  setBrowserGlobals({supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'sb_publishable_test',backendFunctionUrl:'https://example.supabase.co/functions/v1/nutrition-api'});
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    calls.push({url:String(url),init});
    if(String(url).endsWith('/auth/v1/signup')){
      return new Response(JSON.stringify({access_token:'anon-token',refresh_token:'refresh',expires_in:3600,user:{id:'user-1',is_anonymous:true}}),{status:200,headers:{'content-type':'application/json'}});
    }
    assert.equal(init.headers.Authorization,'Bearer anon-token');
    return new Response(JSON.stringify({foods:[]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const { backendCall }=await import('../dist/src/services/backend.js');
  const result=await backendCall('usda.search',{query:'banana'});
  assert.deepEqual(result,{foods:[]});
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/auth\/v1\/signup$/);
  const signupBody=JSON.parse(String(calls[0].init.body));
  assert.equal(signupBody.data.app,'nourish');
  const stored=JSON.parse(localStorage.getItem('nourish-supabase-session-v1'));
  assert.equal(stored.isAnonymous,true);
  assert.equal(stored.accessToken,'anon-token');
});

test('barcode compatibility engine recognizes ZXing fallback when native BarcodeDetector is unavailable',async()=>{
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia(){}}},configurable:true});
  globalThis.window={ZXingBrowser:{BrowserMultiFormatReader:function(){}}};
  const { barcodeScannerEngine, barcodeScannerSupported, barcodeImageSupported }=await import('../dist/src/services/barcode.js');
  assert.equal(barcodeScannerEngine(),'zxing');
  assert.equal(barcodeScannerSupported(),true);
  assert.equal(barcodeImageSupported(),true);
});
