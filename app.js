const ITEMS=window.HOLIDAY_ITEMS;
const ORIGINAL_NAMES=new Set(window.HOLIDAY_ORIGINAL_NAMES||[]);
const ITINERARY_STORAGE_KEY="holidayapp_itinerary_v1";
const COORD_CACHE_KEY="holidayapp_coords_v2";
const ALL_TYPES=["Attraction","Hotel","Lunch","Dinner"];
const ALL_AREAS=["Dublin","Galway","Roscommon / Athlone","Limerick / Clare","Killarney / Kerry"];
const state={types:new Set(ALL_TYPES),areas:new Set(ALL_AREAS),search:"",view:"list",gps:null};

function loadCoordCache(){
  try{
    const current=JSON.parse(localStorage.getItem(COORD_CACHE_KEY)||"null");
    if(current&&typeof current==="object")return current;
    const old=JSON.parse(localStorage.getItem("holidayapp_coords_v1")||"{}");
    const migrated={};
    for(const [k,v] of Object.entries(old)){
      if(v&&Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lng))){migrated[k]={lat:Number(v.lat),lng:Number(v.lng)};}
    }
    localStorage.setItem(COORD_CACHE_KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return{}}
}
const coordCache=loadCoordCache();

function retryFailedCoordsOnce(){
  const rev="2026-08-12-multifilter-google-v2";
  if(localStorage.getItem("holidayapp_coord_retry_revision")===rev)return;
  let changed=false;
  for(const [k,v] of Object.entries(coordCache)){if(v?.failed){delete coordCache[k];changed=true;}}
  if(changed)localStorage.setItem(COORD_CACHE_KEY,JSON.stringify(coordCache));
  localStorage.setItem("holidayapp_coord_retry_revision",rev);
}
retryFailedCoordsOnce();

let placeIndexPromise=null,placeIndexFinished=false;
let nominatimQueue=Promise.resolve(),lastNominatimAt=0;

const $=id=>document.getElementById(id);
const E={
  search:$("search"),areas:$("areas"),types:$("types"),listBtn:$("listBtn"),itineraryBtn:$("itineraryBtn"),searchBtn:$("searchTabBtn"),
  gpsBtn:$("gpsBtn"),gpsStatus:$("gpsStatus"),clearBtn:$("clearBtn"),count:$("count"),cards:$("cards"),
  listView:$("listView"),itineraryView:$("itineraryView"),searchView:$("searchView"),browseSummary:$("browseSummary")
};

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function itemKey(i){return i.name+"|"+i.location}
function filteredItems(){
  const q=state.search.trim().toLowerCase();
  return ITEMS.filter(i=>state.types.has(i.type)&&state.areas.has(i.area)&&(!q||[i.name,i.location,i.area,i.type,i.description].join(" ").toLowerCase().includes(q)));
}
function rows(){return filteredItems()}
function maps(i){return"https://www.google.com/maps?q="+encodeURIComponent(i.location)}
function directions(i){return"https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(i.location)+"&travelmode=driving"}
function sourceLabel(i){return(i.type==="Hotel"||ORIGINAL_NAMES.has(i.name))?"Your list":"Suggested"}
function itineraryEntries(){
  try{const d=JSON.parse(localStorage.getItem(ITINERARY_STORAGE_KEY)||"{}");return Array.isArray(d.entries)?d.entries:[]}catch{return[]}
}
function fmtDay(date){return new Date(date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
function itineraryFlags(i){
  const k=itemKey(i);
  return itineraryEntries().filter(x=>x.itemKey===k).sort((a,b)=>a.date.localeCompare(b.date)||(a.order||0)-(b.order||0));
}
function hasCoords(i){
  const c=coordCache[itemKey(i)];
  return !!(c&&!c.failed&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lng)));
}
function km(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),q=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function distanceText(i){
  if(!state.gps)return"";
  const c=coordCache[itemKey(i)];if(!c||c.failed)return"";
  const m=km(state.gps,c)*.621371;return(m<10?m.toFixed(1):Math.round(m))+" miles away";
}
function flagsHtml(i){
  const source=sourceLabel(i),sourceClass=source==="Your list"?"flag-user":"flag-suggested";
  const planned=itineraryFlags(i).map(x=>`<span class="card-flag flag-itinerary">✓ ${esc(fmtDay(x.date))} · ${esc(x.section)}</span>`).join("");
  return`<div class="card-flags"><span class="card-flag ${sourceClass}">${esc(source)}</span>${planned}</div>`;
}
function render(){
  const r=filteredItems();
  if(E.count)E.count.textContent=`${r.length} of ${ITEMS.length} places`;
  if(!E.cards)return;
  E.cards.innerHTML=r.length?r.map(i=>{
    const d=distanceText(i),k=itemKey(i);
    return`<article class="card" data-type="${esc(i.type)}" data-item-key="${esc(k)}"><div class="accent"></div><div class="card-body">
      <div class="card-head"><h2>${esc(i.name)}</h2>${flagsHtml(i)}</div>
      <div class="badges"><span class="badge">${esc(i.type)}</span><span class="badge">${esc(i.area)}</span></div>
      <p class="desc">${esc(i.description)}</p>
      <p class="meta">${i.visitTime?`<strong>Visit:</strong> ${esc(i.visitTime)}<br>`:""}<strong>Location:</strong> ${esc(i.location)}${d?`<br><span class="distance">${esc(d)}</span>`:""}</p>
      <div class="actions">
        <a class="btn primary" target="_blank" rel="noopener" href="${esc(maps(i))}">Google Maps</a>
        <a class="btn secondary" target="_blank" rel="noopener" href="${esc(directions(i))}">Directions</a>
        ${i.website1?`<a class="btn" target="_blank" rel="noopener" href="${esc(i.website1)}">Website</a>`:""}
        ${i.website2?`<a class="btn" target="_blank" rel="noopener" href="${esc(i.website2)}">More info</a>`:""}
        <button class="btn add-itinerary-btn" type="button" data-add-itinerary="${esc(k)}">Add</button>
      </div></div></article>`;
  }).join(""):'<div class="card"><div class="card-body">No matching places.</div></div>';
  document.dispatchEvent(new CustomEvent("holidayapp:list-rendered"));
}

function saveCoordCache(){localStorage.setItem(COORD_CACHE_KEY,JSON.stringify(coordCache))}
function areaHint(area){return({"Dublin":"Dublin","Galway":"Galway","Roscommon / Athlone":"Athlone Roscommon","Limerick / Clare":"Limerick Clare","Killarney / Kerry":"Killarney Kerry"})[area]||area||"Ireland"}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function nominatimRequest(params){
  const url="https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit="+encodeURIComponent(params.limit||1)+"&countrycodes=ie&q="+encodeURIComponent(params.q);
  const task=nominatimQueue.then(async()=>{
    const wait=Math.max(0,1100-(Date.now()-lastNominatimAt));if(wait)await sleep(wait);
    lastNominatimAt=Date.now();
    const res=await fetch(url,{headers:{Accept:"application/json"}});if(!res.ok)throw new Error("Nominatim "+res.status);
    return res.json();
  });
  nominatimQueue=task.catch(()=>{});return task;
}
async function tryGeocode(item,query){
  try{
    const data=await nominatimRequest({q:query,limit:1});
    if(data?.[0]){
      coordCache[itemKey(item)]={lat:Number(data[0].lat),lng:Number(data[0].lon)};saveCoordCache();
      document.dispatchEvent(new CustomEvent("holidayapp:index-place",{detail:{item,success:true}}));return true;
    }
  }catch(err){console.warn("Geocode failed",item.name,query,err)}
  return false;
}
function emitIndexProgress(done,total,failed=0,finished=false){
  document.dispatchEvent(new CustomEvent("holidayapp:index-progress",{detail:{done,total,failed,finished,located:ITEMS.filter(hasCoords).length}}));
}
async function indexAllPlacesOnce(){
  if(placeIndexPromise)return placeIndexPromise;
  placeIndexPromise=(async()=>{
    const unresolved=ITEMS.filter(i=>!coordCache[itemKey(i)]),total=ITEMS.length;
    let done=total-unresolved.length;emitIndexProgress(done,total,0,false);
    const retry=[];
    for(const item of unresolved){const ok=await tryGeocode(item,`${item.name}, ${item.location}`);if(!ok)retry.push(item);done++;emitIndexProgress(done,total,0,false);}
    const retry2=[];
    for(const item of retry){const ok=await tryGeocode(item,item.location);if(!ok)retry2.push(item);}
    const finalFailures=[];
    for(const item of retry2){const ok=await tryGeocode(item,`${item.name}, ${areaHint(item.area)}, Ireland`);if(!ok)finalFailures.push(item);}
    for(const item of finalFailures)coordCache[itemKey(item)]={failed:true};
    saveCoordCache();placeIndexFinished=true;emitIndexProgress(total,total,finalFailures.length,true);
    return{failed:finalFailures.length,located:ITEMS.filter(hasCoords).length};
  })();
  return placeIndexPromise;
}
function mapCacheSummary(){
  const good=ITEMS.filter(hasCoords).length,failed=ITEMS.filter(i=>coordCache[itemKey(i)]?.failed).length;
  return{good,failed,pending:ITEMS.length-good-failed};
}

function updateFilterButtons(){
  if(E.types){
    E.types.querySelectorAll("[data-type]").forEach(b=>{
      const v=b.dataset.type;b.classList.toggle("active",v==="All"?state.types.size===ALL_TYPES.length:state.types.has(v));
    });
  }
  if(E.areas){
    E.areas.querySelectorAll("[data-area]").forEach(b=>{
      const v=b.dataset.area;b.classList.toggle("active",v==="All"?state.areas.size===ALL_AREAS.length:state.areas.has(v));
    });
  }
}
function toggleSet(set,value,allValues){
  if(value==="All"){allValues.forEach(x=>set.add(x));}
  else if(set.has(value))set.delete(value);else set.add(value);
}
function filtersChanged(){
  updateFilterButtons();render();
  document.dispatchEvent(new CustomEvent("holidayapp:filters-changed",{detail:{types:[...state.types],areas:[...state.areas],search:state.search}}));
}
function showView(view){
  state.view=view;
  document.body.classList.toggle("itinerary-mode",view==="itinerary");
  E.listView.classList.toggle("hidden",view!=="list");
  E.searchView.classList.toggle("active",view==="google");
  E.itineraryView.classList.toggle("active",view==="itinerary");
  E.browseSummary.style.display=view==="list"?"block":"none";
  E.listBtn.classList.toggle("active",view==="list");
  E.searchBtn.classList.toggle("active",view==="google");
  E.itineraryBtn.classList.toggle("active",view==="itinerary");
  if(view==="google")document.dispatchEvent(new CustomEvent("holidayapp:google-opened"));
  if(view==="itinerary")document.dispatchEvent(new CustomEvent("holidayapp:itinerary-opened"));
}
function useGps(){
  if(!navigator.geolocation){E.gpsStatus.textContent="GPS not supported by this browser.";return}
  E.gpsBtn.disabled=true;E.gpsStatus.textContent="Requesting location permission…";
  navigator.geolocation.getCurrentPosition(p=>{
    state.gps={lat:p.coords.latitude,lng:p.coords.longitude};E.gpsStatus.textContent="Location enabled — distances are straight-line estimates.";E.gpsBtn.textContent="Location enabled";
    render();document.dispatchEvent(new CustomEvent("holidayapp:gps-updated",{detail:state.gps}));
  },()=>{E.gpsBtn.disabled=false;E.gpsStatus.textContent="Location permission was blocked. Check browser/site Location permissions.";},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}

E.search.addEventListener("input",e=>{state.search=e.target.value;filtersChanged()});
E.types.addEventListener("click",e=>{const b=e.target.closest("[data-type]");if(!b)return;toggleSet(state.types,b.dataset.type,ALL_TYPES);filtersChanged()});
E.areas.addEventListener("click",e=>{const b=e.target.closest("[data-area]");if(!b)return;toggleSet(state.areas,b.dataset.area,ALL_AREAS);filtersChanged()});
E.listBtn.addEventListener("click",()=>showView("list"));
E.searchBtn.addEventListener("click",()=>showView("google"));
E.itineraryBtn.addEventListener("click",()=>showView("itinerary"));
E.gpsBtn.addEventListener("click",useGps);
E.clearBtn.addEventListener("click",()=>{state.types=new Set(ALL_TYPES);state.areas=new Set(ALL_AREAS);state.search="";E.search.value="";filtersChanged()});

window.HolidayApp={showView,itemKey,maps,directions,esc,state,coordCache,indexAllPlacesOnce,mapCacheSummary,filteredItems,allTypes:ALL_TYPES,allAreas:ALL_AREAS};
updateFilterButtons();render();
