const ITEMS=window.HOLIDAY_ITEMS;
const ORIGINAL_NAMES=new Set(window.HOLIDAY_ORIGINAL_NAMES||[]);
const ITINERARY_STORAGE_KEY="holidayapp_itinerary_v1";
const state={type:"All",area:"All",search:"",view:"list",gps:null};
const coordCache=JSON.parse(localStorage.getItem("holidayapp_coords_v1")||"{}");
let map=null,markerLayer=null,myMarker=null,geocodeBusy=false,geocodeGeneration=0,resizeObserver=null;

const $=id=>document.getElementById(id);
const E={
 search:$("search"),area:$("area"),types:$("types"),listBtn:$("listBtn"),mapBtn:$("mapBtn"),itineraryBtn:$("itineraryBtn"),
 gpsBtn:$("gpsBtn"),gpsStatus:$("gpsStatus"),clearBtn:$("clearBtn"),count:$("count"),cards:$("cards"),
 listView:$("listView"),mapView:$("mapView"),itineraryView:$("itineraryView"),mapStatus:$("mapStatus"),browseSummary:$("browseSummary")
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
function km(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),q=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function distanceText(i){
 if(!state.gps)return"";
 const c=coordCache[itemKey(i)];if(!c)return"Distance pending map location";
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
  const c=coordCache[itemKey(i)];if(!c)continue;
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
async function geocodeVisible(){
 if(geocodeBusy){geocodeGeneration++;return}
 geocodeBusy=true;const myGen=++geocodeGeneration;
 const r=rows(),missing=r.filter(i=>!coordCache[itemKey(i)]);
 E.mapStatus.textContent=missing.length?`Locating ${missing.length} uncached place${missing.length===1?"":"s"}… markers will appear as they are found.`:`All ${r.length} filtered places are ready.`;
 redrawMarkers(true);
 for(let n=0;n<missing.length;n++){
  if(myGen!==geocodeGeneration)break;
  const i=missing[n];
  try{
   const url="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ie&q="+encodeURIComponent(i.name+", "+i.location);
   const res=await fetch(url,{headers:{Accept:"application/json"}});
   if(res.ok){
    const data=await res.json();
    if(data[0]){
     coordCache[itemKey(i)]={lat:Number(data[0].lat),lng:Number(data[0].lon)};
     localStorage.setItem("holidayapp_coords_v1",JSON.stringify(coordCache));
     redrawMarkers(false);render();
    }
   }
  }catch(err){console.warn("Geocode failed",i.name,err)}
  E.mapStatus.textContent=`Locating places… ${Math.min(n+1,missing.length)} / ${missing.length} checked.`;
  await new Promise(res=>setTimeout(res,1050));
 }
 geocodeBusy=false;
 const left=rows().filter(i=>!coordCache[itemKey(i)]).length;
 E.mapStatus.textContent=left?`${left} filtered place${left===1?"":"s"} could not be located automatically; the rest are shown.`:`All ${rows().length} filtered places are shown.`;
 redrawMarkers(true);stabiliseMapSize();render();
}

function showView(view){
 state.view=view;
 document.body.classList.toggle("itinerary-mode",view==="itinerary");
 E.listView.classList.toggle("hidden",view!=="list");
 E.mapView.classList.toggle("active",view==="map");
 E.itineraryView.classList.toggle("active",view==="itinerary");
 E.browseSummary.style.display=view==="itinerary"?"none":"block";
 E.listBtn.classList.toggle("active",view==="list");
 E.mapBtn.classList.toggle("active",view==="map");
 E.itineraryBtn.classList.toggle("active",view==="itinerary");
 if(view==="map"){
  initMap();stabiliseMapSize();setTimeout(()=>{redrawMarkers(true);geocodeVisible()},80);
 }else{geocodeGeneration++}
 if(view==="itinerary")document.dispatchEvent(new CustomEvent("holidayapp:itinerary-opened"));
}
function refresh(){render();if(state.view==="map"){initMap();stabiliseMapSize();redrawMarkers(true);geocodeVisible()}}
function useGps(){
 if(!navigator.geolocation){E.gpsStatus.textContent="GPS not supported by this browser.";return}
 E.gpsBtn.disabled=true;E.gpsStatus.textContent="Requesting location permission…";
 navigator.geolocation.getCurrentPosition(p=>{
  state.gps={lat:p.coords.latitude,lng:p.coords.longitude};
  E.gpsStatus.textContent="Location enabled — distances are straight-line estimates.";E.gpsBtn.textContent="Location enabled";
  render();if(map){redrawMarkers(true);stabiliseMapSize()}
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
E.gpsBtn.addEventListener("click",useGps);
E.clearBtn.addEventListener("click",()=>{state.type="All";state.area="All";state.search="";E.search.value="";E.area.value="All";document.querySelectorAll("#types [data-type]").forEach(x=>x.classList.toggle("active",x.dataset.type==="All"));refresh()});
window.addEventListener("resize",()=>{if(map&&state.view==="map")stabiliseMapSize()});
window.addEventListener("orientationchange",()=>{if(map&&state.view==="map")setTimeout(stabiliseMapSize,250)});
render();
