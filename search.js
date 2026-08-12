let searchMap=null,searchLayer=null,searchResults=[],searchMeMarker=null;
const S={
 input:$("placeSearch"),button:$("placeSearchBtn"),status:$("placeSearchStatus"),map:$("searchMap"),
 results:$("placeSearchResults"),area:$("placeSearchArea")
};

function initSearchMap(){
 if(searchMap)return;
 searchMap=L.map("searchMap",{zoomControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([53.25,-8.05],7);
 L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,updateWhenIdle:true,keepBuffer:3,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(searchMap);
 searchLayer=L.layerGroup().addTo(searchMap);
}
function inferArea(display){
 const s=(display||"").toLowerCase();
 if(s.includes("dublin"))return"Dublin";
 if(s.includes("galway"))return"Galway";
 if(s.includes("athlone")||s.includes("roscommon")||s.includes("westmeath"))return"Roscommon / Athlone";
 if(s.includes("limerick")||s.includes("clare"))return"Limerick / Clare";
 if(s.includes("killarney")||s.includes("kerry"))return"Killarney / Kerry";
 return"Other";
}
function inferType(r){
 const c=(r.category||"").toLowerCase(),t=(r.type||"").toLowerCase();
 if(c==="tourism"&&["hotel","motel","guest_house","hostel"].includes(t))return"Hotel";
 if(c==="amenity"&&["restaurant","pub","bar","biergarten"].includes(t))return"Dinner";
 if(c==="amenity"&&["cafe","fast_food","food_court"].includes(t))return"Lunch";
 return"Attraction";
}
function resultName(r){
 return r.namedetails?.name||r.name||(r.display_name||"Place").split(",")[0];
}
function resultItem(r,typeOverride=null){
 const name=resultName(r),location=r.display_name||name,area=inferArea(location),type=typeOverride||inferType(r);
 return{
  name,location,area,type,visitTime:"",
  description:`Search result · ${r.type||r.category||"place"}`,
  website1:r.extratags?.website||r.extratags?.["contact:website"]||"",
  website2:"",
  lat:Number(r.lat),lng:Number(r.lon),source:"Search"
 };
}
function searchPinIcon(type){
 const symbols={Attraction:"★",Hotel:"H",Lunch:"L",Dinner:"D"};
 return pinIcon(type,symbols[type]||"•");
}
function renderSearchResults(){
 S.results.innerHTML=searchResults.length?searchResults.map((r,idx)=>{
  const item=resultItem(r);
  return`<article class="search-result">
   <div class="search-result-main">
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.location)}</p>
   </div>
   <div class="search-result-actions">
    <select class="search-type-select" data-search-type-index="${idx}" aria-label="Itinerary type for ${esc(item.name)}">
     ${["Attraction","Hotel","Lunch","Dinner"].map(t=>`<option ${t===item.type?"selected":""}>${t}</option>`).join("")}
    </select>
    <button class="btn add-search-result" type="button" data-search-add="${idx}">Add</button>
    <a class="btn secondary" target="_blank" rel="noopener" href="${esc(maps(item))}">Google Maps</a>
   </div>
  </article>`;
 }).join(""):'<div class="search-empty">Search for a restaurant, attraction, hotel, beach, shop or any other place in Ireland.</div>';
}
function drawSearchResults(){
 initSearchMap();searchLayer.clearLayers();
 const pts=[];
 searchResults.forEach((r,idx)=>{
  const select=S.results.querySelector(`[data-search-type-index="${idx}"]`);
  const item=resultItem(r,select?.value||inferType(r));
  L.marker([item.lat,item.lng],{icon:searchPinIcon(item.type),title:item.name})
   .bindPopup(`<div class="popup-title">${esc(item.name)}</div><div class="popup-meta">${esc(item.location)}</div>`)
   .addTo(searchLayer);
  pts.push([item.lat,item.lng]);
 });
 if(window.HolidayApp?.state?.gps){
  const g=window.HolidayApp.state.gps;
  if(searchMeMarker)searchMeMarker.remove();
  searchMeMarker=L.marker([g.lat,g.lng],{icon:pinIcon("me","●"),title:"You are here"}).bindPopup("You are here").addTo(searchMap);
  pts.push([g.lat,g.lng]);
 }
 if(pts.length)searchMap.fitBounds(pts,{padding:[30,30],maxZoom:15,animate:false});
}
async function runPlaceSearch(){
 const raw=S.input.value.trim();if(!raw)return;
 initSearchMap();S.button.disabled=true;S.status.textContent="Searching…";
 const area=S.area.value;
 const areaText=area==="All"?"Ireland":area.replace(" / "," ");
 try{
  searchResults=await window.HolidayNominatim.search(`${raw}, ${areaText}`,8,true);
  renderSearchResults();drawSearchResults();
  S.status.textContent=searchResults.length?`${searchResults.length} result${searchResults.length===1?"":"s"} found.`:"No matching places found.";
 }catch(err){
  console.error(err);S.status.textContent="Search could not be completed. Try again in a moment.";
 }finally{S.button.disabled=false}
}
S.button.addEventListener("click",runPlaceSearch);
S.input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();runPlaceSearch()}});
S.results.addEventListener("change",e=>{if(e.target.matches("[data-search-type-index]"))drawSearchResults()});
S.results.addEventListener("click",e=>{
 const b=e.target.closest("[data-search-add]");if(!b)return;
 const idx=Number(b.dataset.searchAdd),r=searchResults[idx];if(!r)return;
 const type=S.results.querySelector(`[data-search-type-index="${idx}"]`)?.value||inferType(r);
 const item=resultItem(r,type);
 window.HolidayItinerary?.openItem(item);
});
document.addEventListener("holidayapp:search-opened",()=>{
 initSearchMap();
 setTimeout(()=>{searchMap.invalidateSize({pan:false});if(searchResults.length)drawSearchResults()},80);
});
document.addEventListener("holidayapp:gps-updated",()=>{if(searchMap)drawSearchResults()});
renderSearchResults();
