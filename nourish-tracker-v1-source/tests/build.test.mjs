import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}

test('production build contains PWA shell and uses hash navigation suitable for GitHub Pages',async()=>{
  const html=await readFile('dist/index.html','utf8');
  assert.match(html,/manifest\.webmanifest/);assert.match(html,/service-worker\.js|src\/main\.js/);
  const manifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone');assert.match(manifest.start_url,/#today/);
});

test('browser build does not contain private Gemini or USDA endpoints/secrets',async()=>{
  const files=(await walk('dist')).filter(f=>/\.(js|html|css|json|webmanifest)$/.test(f));
  const text=(await Promise.all(files.map(f=>readFile(f,'utf8')))).join('\n');
  assert.equal(text.includes('generativelanguage.googleapis.com'),false);
  assert.equal(text.includes('api.nal.usda.gov'),false);
  assert.equal(text.includes('GEMINI_API_KEY'),false);
  assert.equal(text.includes('USDA_API_KEY'),false);
  assert.equal(text.includes('SUPABASE_SERVICE_ROLE_KEY'),false);
  const config=await readFile('dist/config.js','utf8');
  assert.match(config,/supabaseUrl:\s*""/);assert.match(config,/backendFunctionUrl:\s*""/);
});

test('service worker pre-cache manifest only references files present in production build',async()=>{
  const sw=await readFile('dist/service-worker.js','utf8');
  const matches=[...sw.matchAll(/'\.\/([^']+)'/g)].map(m=>m[1]).filter(x=>x && x!=='');
  const missing=[];
  for(const rel of matches){
    try{await readFile(join('dist',rel));}catch{missing.push(rel);}
  }
  assert.deepEqual(missing,[]);
});

test('GitHub Pages workflow never embeds server-only provider secret names as environment values',async()=>{
  const workflow=await readFile('.github/workflows/pages.yml','utf8');
  assert.match(workflow,/actions\/configure-pages@v6/);
  assert.match(workflow,/actions\/deploy-pages@v5/);
  assert.equal(workflow.includes('GEMINI_API_KEY'),false);
  assert.equal(workflow.includes('USDA_API_KEY'),false);
  assert.equal(workflow.includes('SUPABASE_SERVICE_ROLE_KEY'),false);
});
