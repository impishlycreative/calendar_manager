const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync('google_app_scripts/EventImages.gs','utf8');
function backend(props = {}, existing = 404) {
  const calls = [];
  const ctx = {requireObject_:v=>assert(v),getScriptProperty_:k=>props[k] || '',
    WebAppError:class extends Error {constructor(code,message){super(message);this.code=code}},
    Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob:s=>({getBytes:()=>Array.from(Buffer.from(s))}),
      DigestAlgorithm:{SHA_1:'sha1'},computeDigest:(algorithm,b)=>Array.from(crypto.createHash(algorithm).update(Buffer.from(b)).digest())},
    UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return {getResponseCode:()=>options.method==='put'?201:existing,getContentText:()=>JSON.stringify({type:'file',sha:'different'})}}}};
  vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls};
}
const image = {filename:'event_123.png',mimeType:'image/png',content:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')};
const props = {IMAGE_GITHUB_REPOSITORY:'example/site',IMAGE_GITHUB_BRANCH:'main',IMAGE_GITHUB_FOLDER:'images/events',IMAGE_GITHUB_TOKEN:'test-only',IMAGE_PUBLIC_BASE_URL:'https://example.com/images/events/'};
test('missing configuration and invalid images never upload',()=>{
 const {ctx,calls}=backend();
 assert.throws(()=>ctx.uploadEventImage_(image),e=>e.code==='IMAGE_UPLOAD_NOT_CONFIGURED');
 assert.throws(()=>ctx.uploadEventImage_({...image,filename:'../x.png'}),e=>e.code==='INVALID_REQUEST');
 assert.throws(()=>ctx.uploadEventImage_({...image,content:'YWJj'}),e=>e.code==='INVALID_REQUEST');
 assert.equal(calls.length,0);
});
test('upload uses configured branch and returns public image URL',()=>{
 const {ctx,calls}=backend(props);assert.equal(ctx.uploadEventImage_(image),'https://example.com/images/events/event_123.png');
 assert.equal(JSON.parse(calls[1].options.payload).branch,'main');assert.equal(calls[1].options.method,'put');
});
test('existing different image is never overwritten',()=>{
 const {ctx,calls}=backend(props,200);assert.throws(()=>ctx.uploadEventImage_(image),e=>e.code==='IMAGE_NAME_CONFLICT');assert.equal(calls.length,1);
});
test('local staging restores per event, survives failed upload, and clears after success',async()=>{
 const elements = new Map();
 global.crypto = crypto.webcrypto;
 global.document={querySelector:id=>{if(!elements.has(id))elements.set(id,{value:'',addEventListener(){},removeAttribute(){}});return elements.get(id)}};
 const storage = new Map();global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const module = await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('kcw-calendar-site/assets/event-image.js','utf8')).toString('base64'));
 const key='kcw:event-image:v1:user:event';storage.set(key,JSON.stringify({...image,dataUrl:'data:image/png;base64,'+image.content,imageAlt:'Writing group'}));
 const editor=module.createImageEditor(()=> 'user');editor.open({id:'event'});
 assert.equal(editor.preview().imageAlt,'Writing group');
 editor.open({id:'event'});
 assert.equal(elements.get('#imageFilename').value,'event_123.png');
 assert.match(elements.get('#imageSelection').textContent,/Selected image: event_123.png/);
 assert.equal(elements.get('#chooseImage').textContent,'Replace image');
 await assert.rejects(editor.forSave(async()=>{throw new Error('offline')}));assert(storage.has(key));
 const fields=await editor.forSave(async(action)=>{assert.equal(action,'uploadEventImage');return {image:'https://example.com/image.png'}});
 assert.equal(fields.imageFilename,'event_123.png');
 assert.equal(fields.image,'https://example.com/image.png');assert(storage.has(key));
 let attempts=0;
 await editor.forSave(async(action,data)=>{
   if (++attempts===1) {const error=new Error('collision');error.code='IMAGE_NAME_CONFLICT';throw error;}
   assert.match(data.filename,/^event_[0-9]+\.png$/);assert.notEqual(data.filename,'event_123.png');
   return {image:'https://example.com/new.png'};
 });
 assert.equal(attempts,2);
 editor.saved();assert(!storage.has(key));
 editor.open({id:'other'});assert.equal(editor.preview().image,'');
 assert.equal(module.safeImageUrl('javascript:alert(1)'),'');
 assert.equal(elements.get('#imageSelection').textContent,'No image selected.');
 editor.open({id:'saved',image:'https://example.com/event_456.png',imageAlt:'Saved image'});
 assert.equal(elements.get('#imageFilename').value,'event_456.png');
 assert.equal(elements.get('#imageSelection').textContent,'Saved image: event_456.png');
 editor.open({id:'saved',...fields});
 assert.equal(elements.get('#imageFilename').value,'event_123.png');
 const resaved=await editor.forSave(async()=>{throw new Error('Should not upload again')});
 assert.equal(resaved.imageFilename,'event_123.png');
});



test('Draft and Publish save the actual Featured checkbox value',async()=>{
 const code=fs.readFileSync('kcw-calendar-site/assets/calendar.js','utf8');
 const handler=code.slice(code.indexOf('form.addEventListener("submit"'),code.indexOf('dialog.addEventListener("cancel"'));
 for(const status of ['Draft','Published']) for(const checked of [true,false]) {
  const values={'#eventId':'existing','#start':'2026-09-24T18:00','#end':'2026-09-24T19:00','#title':'Meeting','#type':'Meeting','#location':'Virtual','#description':'Text','#hoverText':''};
  const fields={}; for(const [id,value] of Object.entries(values))fields[id]={value};fields['#featured']={checked};fields['#editorError']={};
  let submit, saved;
  const ctx={form:{addEventListener:(type,fn)=>submit=fn,querySelectorAll:()=>[]},document:{querySelector:id=>fields[id]},saving:false,editorStatus:'Published',window:{confirm:()=>true},imageEditor:{forSave:async()=>({}),saved:()=>true},api:async(action,payload)=>{saved=payload},dialog:{close(){}},showStatus(){},loadEvents:async()=>{},handleError:async(error)=>{throw error}};
  vm.createContext(ctx);vm.runInContext(handler,ctx);
  await submit({preventDefault(){},submitter:{value:status}});
  assert.equal(saved.featured,checked);assert.equal(saved.status,status);
 }
});
