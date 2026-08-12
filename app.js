const ITEMS=window.HOLIDAY_ITEMS;
const ORIGINAL_NAMES=new Set(window.HOLIDAY_ORIGINAL_NAMES||[]);
const ITINERARY_STORAGE_KEY="holidayapp_itinerary_v1";
const COORD_CACHE_KEY="holidayapp_coords_v2";
const state={type:"All",area:"All",search:"",view:"list",gps:null};

function loadCoordCache(){
  try{
    const current=JSON.parse(localStorage.getItem(COORD_CACHE_KEY)||"null");
    if(current&&typeof current==="object")return current;
    const old=JSON.parse(localStorage.getItem("holidayapp_coords_v1")||"{}");
    const migrated={};
    for(const [k,v] of Object.entries(old)){
      if(v&&Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lng))){
        migrated[k]={lat:Number(v.lat),lng:Number(v.lng)};
      }
    }
    localStorage.setItem(COORD_CACHE_KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return{}}
}
const coordCache=loadCoordCache();

let map=null,markerLayer=null,myMarker=null,resizeObserver=null;
let placeIndexPromise=null,placeIndexStarted=false,placeIndexFinished=false;
let nominatimQueue=Promise.resolve(),lastNominatimAt=0;

const $=id=>document.getElementById(id);
const E={
 search:$("search"),area:$("area"),types:$("types"),
 listBtn:$("listBtn"),mapBtn:$("mapBtn"),itineraryBtn:$("itineraryBtn"),searchBtn:$("searchTabBtn"),
 gpsBtn:$("gpsBtn"),gpsStatus:$("gpsStatus"),clearBtn:$("clearBtn"),count:$("count"),cards:$("cards"),
 listView:$("listView"),mapView:$("mapView"),itineraryView:$("itineraryView"),searchView:$("searchView"),
 mapStatus:$("mapStatus"),browseSummary:$("browseSummary")
};

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function itemKey(i){return i.name+"|"+i.location}
function rows(){
 const q=state.search.trim().toLowerCase();
 return ITEMS.filter(i=>(state.type==="All"||i.type===state.type)&&(state.area==="All"||i.area===state.area)&&(!q||[i.name,i.location,i.area,i.type,i.description].join(" ").toLowerCase().includes(q)));
}
function maps(i){return"https://www.google.com/maps?q="+encodeURIComponent(i.location)}
function directions(i){return"https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(i.location)+"&travelmode=driving"}
function sourceLabel(i){return(i.type==="Hotel"||ORIGINAL_NAMES.has(i.name))?"Your list":"Suggested"}
function itineraryEntries(){
 try{const d=JSON.parse(localStorage.getItem(ITINERARY_STORAGE_KEY)||"{}");return Array.isArray(d.entries)?d.entries:[]}catch{return[]}
}
function fmtDay(date){
 const d=new Date(date+"T12:00:00");
 return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
}
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
 const source=sourceLabel(i);
 const sourceClass=source==="Your list"?"flag-user":"flag-suggested";
 const planned=itineraryFlags(i).map(x=>`<span class="card-flag flag-itinerary">✓ ${esc(fmtDay(x.date))} · ${esc(x.section)}</span>`).join("");
 return`<div class="card-flags"><span class="card-flag ${sourceClass}">${esc(source)}</span>${planned}</div>`;
}
function render(){
 const r=rows();E.count.textContent=`${r.length} of ${ITEMS.length} places`;
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

function initMap(){
 if(map)return;
 map=L.map("map",{zoomControl:true,preferCanvas:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([53.25,-8.05],7);
 L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,updateWhenIdle:true,keepBuffer:3,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 markerLayer=L.layerGroup().addTo(map);
 if(window.ResizeObserver){
  resizeObserver=new ResizeObserver(()=>{if(map&&state.view==="map")map.invalidateSize({pan:false})});
  resizeObserver.observe($("map"));
 }
}
function stabiliseMapSize(){
 if(!map)return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  map.invalidateSize({pan:false});
  setTimeout(()=>map&&map.invalidateSize({pan:false}),120);
  setTimeout(()=>map&&map.invalidateSize({pan:false}),400);
 }));
}
function pinIcon(type,s){
 return L.divIcon({className:"",html:`<div class="pin ${type.toLowerCase()}"><span>${s}</span></div>`,iconSize:[24,24],iconAnchor:[12,24],popupAnchor:[0,-24]});
}
const pinSymbols={Attraction:"★",Hotel:"H",Lunch:"L",Dinner:"D"};
function popupHtml(i){
 return`<div class="popup-title">${esc(i.name)}</div><div class="popup-meta">${esc(i.type)} · ${esc(i.area)}</div><div>${esc(i.description)}</div>
 <div class="popup-actions"><a target="_blank" rel="noopener" href="${esc(maps(i))}">Google Maps</a> <a target="_blank" rel="noopener" href="${esc(directions(i))}">Directions</a></div>`;
}
function redrawMarkers(fit=false){
 if(!map)return;
 markerLayer.clearLayers();const pts=[];
 for(const i of rows()){
  const c=coordCache[itemKey(i)];if(!c||c.failed)continue;
  L.marker([c.lat,c.lng],{icon:pinIcon(i.type,pinSymbols[i.type]||"•"),title:i.name}).bindPopup(popupHtml(i)).addTo(markerLayer);
  pts.push([c.lat,c.lng]);
 }
 if(state.gps){
  if(myMarker)myMarker.remove();
  myMarker=L.marker([state.gps.lat,state.gps.lng],{icon:pinIcon("me","●"),title:"You are here"}).bindPopup("You are here").addTo(map);
  pts.push([state.gps.lat,state.gps.lng]);
 }
 if(fit&&pts.length)map.fitBounds(pts,{padding:[30,30],maxZoom:14,animate:false});
}

function saveCoordCache(){localStorage.setItem(COORD_CACHE_KEY,JSON.stringify(coordCache))}
function areaHint(area){
 return({"Dublin":"Dublin","Galway":"Galway","Roscommon / Athlone":"Athlone Roscommon","Limerick / Clare":"Limerick Clare","Killarney / Kerry":"Killarney Kerry"})[area]||area||"Ireland";
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function nominatimRequest(params){
 const url="https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit="+encodeURIComponent(params.limit||1)+"&countrycodes=ie"+(params.extratags?"&extratags=1":"")+"&q="+encodeURIComponent(params.q);
 const task=nominatimQueue.then(async()=>{
  const wait=Math.max(0,1100-(Date.now()-lastNominatimAt));
  if(wait)await sleep(wait);
  lastNominatimAt=Date.now();
  const res=await fetch(url,{headers:{Accept:"application/json"}});
  if(!res.ok)throw new Error("Nominatim "+res.status);
  return res.json();
 });
 nominatimQueue=task.catch(()=>{});
 return task;
}
window.HolidayNominatim={search:(q,limit=8,extratags=true)=>nominatimRequest({q,limit,extratags})};

async function tryGeocode(item,query){
 try{
  const data=await nominatimRequest({q:query,limit:1});
  if(data&&data[0]){
   coordCache[itemKey(item)]={lat:Number(data[0].lat),lng:Number(data[0].lon)};
   saveCoordCache();
   if(map&&state.view==="map")redrawMarkers(false);
   return true;
  }
 }catch(err){console.warn("Geocode failed",item.name,query,err)}
 return false;
}
function indexStatus(done,total,failed=0){
 if(!E.mapStatus)return;
 if(placeIndexFinished){
  const shown=ITEMS.filter(hasCoords).length;
  E.mapStatus.textContent=failed?`${shown} places located; ${failed} could not be matched automatically.`:`All ${shown} places are cached and ready.`;
 }else{
  E.mapStatus.textContent=`Building place map once… ${done} / ${total} checked. You can leave this tab; loading continues in the background.`;
 }
}
async function indexAllPlacesOnce(){
 if(placeIndexPromise)return placeIndexPromise;
 placeIndexStarted=true;
 placeIndexPromise=(async()=>{
  const unresolved=ITEMS.filter(i=>!coordCache[itemKey(i)]);
  let done=ITEMS.length-unresolved.length;
  indexStatus(done,ITEMS.length,0);
  const retry=[];
  for(const item of unresolved){
   const ok=await tryGeocode(item,`${item.name}, ${item.location}`);
   if(!ok)retry.push(item);
   done++;indexStatus(done,ITEMS.length,0);
  }
  const retry2=[];
  for(const item of retry){
   const ok=await tryGeocode(item,item.location);
   if(!ok)retry2.push(item);
  }
  const finalFailures=[];
  for(const item of retry2){
   const ok=await tryGeocode(item,`${item.name}, ${areaHint(item.area)}, Ireland`);
   if(!ok)finalFailures.push(item);
  }
  for(const item of finalFailures)coordCache[itemKey(item)]={failed:true};
  saveCoordCache();
  placeIndexFinished=true;
  indexStatus(ITEMS.length,ITEMS.length,finalFailures.length);
  if(map){redrawMarkers(true);stabiliseMapSize()}
  if(state.gps)render();
 })();
 return placeIndexPromise;
}
function mapCacheSummary(){
 const good=ITEMS.filter(hasCoords).length;
 const failed=ITEMS.filter(i=>coordCache[itemKey(i)]?.failed).length;
 const pending=ITEMS.length-good-failed;
 return{good,failed,pending};
}

function showView(view){
 state.view=view;
 document.body.classList.toggle("itinerary-mode",view==="itinerary");
 document.body.classList.toggle("search-mode",view==="search");
 E.listView.classList.toggle("hidden",view!=="list");
 E.mapView.classList.toggle("active",view==="map");
 E.itineraryView.classList.toggle("active",view==="itinerary");
 E.searchView?.classList.toggle("active",view==="search");
 E.browseSummary.style.display=(view==="list"||view==="map")?"block":"none";
 E.listBtn.classList.toggle("active",view==="list");
 E.mapBtn.classList.toggle("active",view==="map");
 E.itineraryBtn.classList.toggle("active",view==="itinerary");
 E.searchBtn?.classList.toggle("active",view==="search");
 if(view==="map"){
  initMap();stabiliseMapSize();
  const s=mapCacheSummary();
  setTimeout(()=>{redrawMarkers(true);if(!placeIndexStarted||s.pending>0)indexAllPlacesOnce();else indexStatus(ITEMS.length,ITEMS.length,s.failed)},80);
 }
 if(view==="itinerary")document.dispatchEvent(new CustomEvent("holidayapp:itinerary-opened"));
 if(view==="search")document.dispatchEvent(new CustomEvent("holidayapp:search-opened"));
}
function refresh(){
 render();
 if(state.view==="map"){
  initMap();stabiliseMapSize();redrawMarkers(true);
  const s=mapCacheSummary();if(!placeIndexStarted||s.pending>0)indexAllPlacesOnce();
 }
}
function useGps(){
 if(!navigator.geolocation){E.gpsStatus.textContent="GPS not supported by this browser.";return}
 E.gpsBtn.disabled=true;E.gpsStatus.textContent="Requesting location permission…";
 navigator.geolocation.getCurrentPosition(p=>{
  state.gps={lat:p.coords.latitude,lng:p.coords.longitude};
  E.gpsStatus.textContent="Location enabled — distances are straight-line estimates.";E.gpsBtn.textContent="Location enabled";
  render();if(map){redrawMarkers(true);stabiliseMapSize()}
  document.dispatchEvent(new CustomEvent("holidayapp:gps-updated",{detail:state.gps}));
 },()=>{
  E.gpsBtn.disabled=false;E.gpsStatus.textContent="Location permission was blocked. Check browser/site Location permissions.";
 },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}

E.search.addEventListener("input",e=>{state.search=e.target.value;refresh()});
E.area.addEventListener("change",e=>{state.area=e.target.value;refresh()});
E.types.addEventListener("click",e=>{const b=e.target.closest("[data-type]");if(!b)return;state.type=b.dataset.type;document.querySelectorAll("#types [data-type]").forEach(x=>x.classList.toggle("active",x===b));refresh()});
E.listBtn.addEventListener("click",()=>showView("list"));
E.mapBtn.addEventListener("click",()=>showView("map"));
E.itineraryBtn.addEventListener("click",()=>showView("itinerary"));
E.searchBtn?.addEventListener("click",()=>showView("search"));
E.gpsBtn.addEventListener("click",useGps);
E.clearBtn.addEventListener("click",()=>{state.type="All";state.area="All";state.search="";E.search.value="";E.area.value="All";document.querySelectorAll("#types [data-type]").forEach(x=>x.classList.toggle("active",x.dataset.type==="All"));refresh()});
window.addEventListener("resize",()=>{if(map&&state.view==="map")stabiliseMapSize()});
window.addEventListener("orientationchange",()=>{if(map&&state.view==="map")setTimeout(stabiliseMapSize,250)});
window.HolidayApp={showView,itemKey,maps,directions,esc,state,coordCache,indexAllPlacesOnce};
render();
