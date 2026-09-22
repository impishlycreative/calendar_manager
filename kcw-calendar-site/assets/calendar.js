import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { api, requireSession } from "./api.js";

const eventsEl=document.querySelector("#events"), statusEl=document.querySelector("#status"), dialog=document.querySelector("#eventDialog"), form=document.querySelector("#eventForm"), deleteDialog=document.querySelector("#deleteDialog");
let events=[]; let deleteId=null;
const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const showStatus=(msg,type="")=>{statusEl.textContent=msg;statusEl.className=`notice ${type}`;statusEl.hidden=false};
const toLocal=v=>{if(!v)return"";const d=new Date(v);const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
const fmt=v=>new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));

async function loadEvents(){eventsEl.innerHTML='<div class="empty">Loading events…</div>';try{const r=await api("listEvents");events=Array.isArray(r.events)?r.events:[];render()}catch(e){handleError(e)}}
function render(){if(!events.length){eventsEl.innerHTML='<div class="empty">No upcoming events.</div>';return}eventsEl.innerHTML=events.map(e=>`<article class="event-card"><div><div class="event-date">${esc(fmt(e.start))}</div><h2>${esc(e.title)}</h2>${e.location?`<p class="location">${esc(e.location)}</p>`:""}${e.description?`<p>${esc(e.description)}</p>`:""}</div><div class="event-actions"><button class="secondary edit" data-id="${esc(e.id)}">Edit</button><button class="danger-outline delete" data-id="${esc(e.id)}">Delete</button></div></article>`).join("");}
function openEditor(e=null){document.querySelector("#dialogTitle").textContent=e?"Edit event":"Add event";document.querySelector("#eventId").value=e?.id||"";document.querySelector("#title").value=e?.title||"";document.querySelector("#start").value=toLocal(e?.start);document.querySelector("#end").value=toLocal(e?.end);document.querySelector("#location").value=e?.location||"";document.querySelector("#description").value=e?.description||"";dialog.showModal();}
async function handleError(e){console.error(e);if(e.message==="SESSION_EXPIRED"){await signOut(auth);location.replace("index.html");return}showStatus("The request could not be completed. Please try again.","error-box")}

document.querySelector("#addButton").onclick=()=>openEditor();document.querySelector("#closeDialog").onclick=()=>dialog.close();document.querySelector("#cancelButton").onclick=()=>dialog.close();document.querySelector("#logoutButton").onclick=async()=>{sessionStorage.clear();await signOut(auth);location.replace("index.html")};
eventsEl.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const item=events.find(x=>String(x.id)===b.dataset.id);if(b.classList.contains("edit"))openEditor(item);if(b.classList.contains("delete")){deleteId=b.dataset.id;document.querySelector("#deleteMessage").textContent=`Delete “${item?.title||"this event"}”? This cannot be undone.`;deleteDialog.showModal()}});
form.addEventListener("submit",async e=>{e.preventDefault();const id=document.querySelector("#eventId").value;const payload={id,title:document.querySelector("#title").value.trim(),start:new Date(document.querySelector("#start").value).toISOString(),end:new Date(document.querySelector("#end").value).toISOString(),location:document.querySelector("#location").value.trim(),description:document.querySelector("#description").value.trim()};try{await api(id?"updateEvent":"createEvent",payload);dialog.close();showStatus(id?"Event updated.":"Event created.","success");await loadEvents()}catch(err){handleError(err)}});
document.querySelector("#cancelDelete").onclick=()=>deleteDialog.close();document.querySelector("#confirmDelete").onclick=async()=>{try{await api("deleteEvent",{id:deleteId});deleteDialog.close();showStatus("Event deleted.","success");await loadEvents()}catch(e){handleError(e)}};

onAuthStateChanged(auth,async user=>{if(!user){location.replace("index.html");return}try{await requireSession();document.querySelector("#userEmail").textContent=user.email||"Signed in";await loadEvents()}catch(e){handleError(e)}});
