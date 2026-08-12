const GOOGLE_KEY_STORAGE_KEY="holidayapp_google_maps_api_key";
const GOOGLE_AREA_BOUNDS={
  "All":{south:51.30,west:-10.90,north:55.50,east:-5.30},
  "Dublin":{south:53.15,west:-6.80,north:53.65,east:-5.90},
  "Galway":{south:52.90,west:-10.35,north:53.80,east:-8.70},
  "Roscommon / Athlone":{south:53.10,west:-8.90,north:54.15,east:-7.35},
  "Limerick / Clare":{south:52.35,west:-9.65,north:53.25,east:-7.80},
  "Killarney / Kerry":{south:51.60,west:-10.75,north:52.70,east:-8.65}
};
const GOOGLE_AREA_CENTERS={
  "All":{lat:53.25,lng:-8.05,zoom:7},
  "Dublin":{lat:53.35,lng:-6.26,zoom:10},
  "Galway":{lat:53.30,lng:-9.35,zoom:9},
  "Roscommon / Athlone":{lat:53.55,lng:-8.05,zoom:9},
  "Limerick / Clare":{lat:52.75,lng:-8.95,zoom:9},
  "Killarney / Kerry":{lat:52.05,lng:-9.75,zoom:9}
};
const GOOGLE_PIN={Attraction:{className:"attraction",glyph:"★"},Hotel:{className:"hotel",glyph:"H"},Lunch:{className:"lunch",glyph:"L"},Dinner:{className:"dinner",glyph:"D"}};
const GOOGLE_RESULT_FIELDS=[
  "id","displayName","formattedAddress","shortFormattedAddress","location","viewport",
  "websiteURI","googleMapsURI","primaryType","primaryTypeDisplayName","types","rating","userRatingCount",
  "currentOpeningHours","regularOpeningHours","utcOffsetMinutes","priceLevel","nationalPhoneNumber",
  "internationalPhoneNumber","photos","businessStatus"
];

let googleMapsLoadPromise=null;
let googleMap=null,googleInfoWindow=null;
let GooglePlace=null,AdvancedMarkerElement=null,LatLngBounds=null,AutocompleteSuggestion=null,AutocompleteSessionToken=null;
let listedMarkers=[],resultMarkers=[],meMarker=null,searchResults=[];
let autocompleteToken=null,autocompleteSuggestions=[],autocompleteTimer=null,autocompleteRequestId=0;
let activeResultIndex=-1,lastSearchQuery="",listedIndexPromise=null;

const GS={
  keySetup:document.getElementById("googleKeySetup"),keyInput:document.getElementById("googleApiKeyInput"),
  keySave:document.getElementById("googleApiKeySave"),keyForget:document.getElementById("googleApiKeyForget"),
  controls:document.getElementById("googleSearchControls"),query:document.getElementById("googlePlaceQuery"),
  button:document.getElementById("placeSearchBtn"),searchArea:document.getElementById("searchThisAreaBtn"),
  suggestions:document.getElementById("googleSuggestions"),categories:document.getElementById("googleCategoryRow"),
  status:document.getElementById("placeSearchStatus"),map:document.getElementById("searchMap"),
  detail:document.getElementById("googlePlaceDetail"),results:document.getElementById("placeSearchResults")
};

function storedGoogleKey(){return localStorage.getItem(GOOGLE_KEY_STORAGE_KEY)||""}
function setGoogleKey(key){localStorage.setItem(GOOGLE_KEY_STORAGE_KEY,key.trim())}
function forgetGoogleKey(){localStorage.removeItem(GOOGLE_KEY_STORAGE_KEY);location.reload()}
function activeArea(){return window.HolidayApp?.state?.area||"All"}
function activeBounds(){return GOOGLE_AREA_BOUNDS[activeArea()]||GOOGLE_AREA_BOUNDS.All}
function activeCenter(){return GOOGLE_AREA_CENTERS[activeArea()]||GOOGLE_AREA_CENTERS.All}
function holidayKey(item){return window.HolidayApp?.itemKey?.(item)||(item.name+"|"+item.location)}
function mapLink(item){return window.HolidayApp?.maps?.(item)||("https://www.google.com/maps?q="+encodeURIComponent(item.location||item.name))}
function dirLink(item){return window.HolidayApp?.directions?.(item)||("https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(item.location||item.name)+"&travelmode=driving")}
function safe(v){return window.HolidayApp?.esc?.(v)||String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}

function loadGoogleMapsApi(){
  const key=storedGoogleKey();
  if(!key)return Promise.reject(new Error("No Google Maps API key configured"));
  if(window.google?.maps?.importLibrary)return Promise.resolve();
  if(googleMapsLoadPromise)return googleMapsLoadPromise;
  googleMapsLoadPromise=new Promise((resolve,reject)=>{
    const callback="__holidayAppGoogleMapsReady";
    window[callback]=()=>{delete window[callback];resolve();};
    const script=document.createElement("script");
    script.async=true;script.defer=true;
    script.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(key)+
      "&loading=async&v=weekly&language=en&region=IE&auth_referrer_policy=origin&callback="+callback;
    script.onerror=()=>{delete window[callback];googleMapsLoadPromise=null;reject(new Error("Google Maps JavaScript API failed to load"));};
    document.head.appendChild(script);
  });
  return googleMapsLoadPromise;
}

function listedItemsForGoogle(){
  const st=window.HolidayApp?.state||{type:"All",area:"All",search:""};
  const q=(st.search||"").trim().toLowerCase();
  return (window.HOLIDAY_ITEMS||[]).filter(item=>
    (st.type==="All"||item.type===st.type)&&
    (st.area==="All"||item.area===st.area)&&
    (!q||[item.name,item.location,item.area,item.type,item.description].join(" ").toLowerCase().includes(q))
  );
}
function inferGoogleArea(address){
  const s=(address||"").toLowerCase();
  if(s.includes("dublin"))return"Dublin";
  if(s.includes("galway"))return"Galway";
  if(s.includes("athlone")||s.includes("roscommon")||s.includes("westmeath"))return"Roscommon / Athlone";
  if(s.includes("limerick")||s.includes("clare"))return"Limerick / Clare";
  if(s.includes("killarney")||s.includes("kerry"))return"Killarney / Kerry";
  return"Other";
}
function inferGoogleType(place){
  const types=new Set([place.primaryType,...(place.types||[])].filter(Boolean));
  if(["hotel","lodging","motel","bed_and_breakfast","guest_house","hostel","resort_hotel"].some(x=>types.has(x)))return"Hotel";
  if(["cafe","coffee_shop","bakery","sandwich_shop","meal_takeaway","food_court","brunch_restaurant","breakfast_restaurant"].some(x=>types.has(x)))return"Lunch";
  if(["restaurant","pub","bar","gastropub","steak_house","seafood_restaurant","italian_restaurant","indian_restaurant","thai_restaurant","chinese_restaurant","pizza_restaurant"].some(x=>types.has(x))||[...types].some(x=>x?.endsWith("_restaurant")))return"Dinner";
  return"Attraction";
}
function googlePlaceItem(place,typeOverride=null){
  const loc=place.location;
  const lat=loc&&typeof loc.lat==="function"?loc.lat():Number(loc?.lat);
  const lng=loc&&typeof loc.lng==="function"?loc.lng():Number(loc?.lng);
  const location=place.formattedAddress||place.shortFormattedAddress||place.displayName||"";
  return{
    name:place.displayName||"Place",location,area:inferGoogleArea(location),type:typeOverride||inferGoogleType(place),visitTime:"",
    description:`Google Places · ${place.primaryTypeDisplayName||place.primaryType||"Place"}`,
    website1:place.websiteURI||"",website2:place.googleMapsURI||"",lat,lng,source:"Search"
  };
}
function googleMapsForPlace(place,item){return place.googleMapsURI||mapLink(item)}

function markerElement(type,result=false,label=""){
  const info=GOOGLE_PIN[type]||GOOGLE_PIN.Attraction;
  const el=document.createElement("div");
  el.className=result?"google-result-pin":`google-listed-pin ${info.className}`;
  el.textContent=label||info.glyph;
  return el;
}
function clearMarkers(arr){for(const marker of arr)marker.map=null;arr.length=0;}

function photoUri(place,w=500,h=320){try{return place.photos?.[0]?.getURI({maxWidth:w,maxHeight:h})||""}catch{return""}}
function priceText(place){
  const raw=String(place.priceLevel??"").toLowerCase();if(!raw)return"";
  if(raw.includes("free"))return"Free";if(raw.includes("very")&&raw.includes("expensive"))return"££££";if(raw.includes("expensive"))return"£££";if(raw.includes("moderate"))return"££";if(raw.includes("inexpensive"))return"£";
  const n=Number(place.priceLevel);if(Number.isFinite(n))return n===0?"Free":"£".repeat(Math.min(4,Math.max(1,n)));return"";
}
function openText(place){
  const periods=place.currentOpeningHours?.periods,offset=Number(place.utcOffsetMinutes);if(!Array.isArray(periods)||!periods.length||!Number.isFinite(offset))return"";
  const now=new Date(Date.now()+offset*60000);let current=now.getUTCDay()*1440+now.getUTCHours()*60+now.getUTCMinutes();
  for(const p of periods){if(!p?.open)continue;let start=p.open.day*1440+p.open.hour*60+p.open.minute;let end=p.close?p.close.day*1440+p.close.hour*60+p.close.minute:start+10080;if(end<=start)end+=10080;let cur=current;if(cur<start&&end>10080)cur+=10080;if(cur>=start&&cur<end)return"Open now";}return"Closed";
}
function ratingHtml(place){return Number.isFinite(Number(place.rating))?`<span class="stars">★ ${Number(place.rating).toFixed(1)}${place.userRatingCount?` (${Number(place.userRatingCount).toLocaleString()})`:""}</span>`:""}
function metaHtml(place){
  const bits=[],open=openText(place),price=priceText(place),category=place.primaryTypeDisplayName||place.primaryType||"Place";
  if(category)bits.push(`<span class="search-result-category">${safe(category)}</span>`);if(place.rating)bits.push(ratingHtml(place));if(open)bits.push(`<span class="${open==="Open now"?"open-text":"closed-text"}">${open}</span>`);if(price)bits.push(`<span class="price-text">${price}</span>`);return bits.join("");
}

function renderListedMarkers(fit=false){
  if(!googleMap||!AdvancedMarkerElement)return;clearMarkers(listedMarkers);if(meMarker){meMarker.map=null;meMarker=null;}
  const bounds=new LatLngBounds();let count=0;
  for(const item of listedItemsForGoogle()){
    const c=window.HolidayApp?.coordCache?.[holidayKey(item)];if(!c||c.failed||!Number.isFinite(Number(c.lat))||!Number.isFinite(Number(c.lng)))continue;
    const pos={lat:Number(c.lat),lng:Number(c.lng)};const marker=new AdvancedMarkerElement({map:googleMap,position:pos,title:item.name,content:markerElement(item.type)});marker.addListener("gmp-click",()=>showListedDetail(item,marker));listedMarkers.push(marker);bounds.extend(pos);count++;
  }
  const gps=window.HolidayApp?.state?.gps;if(gps){const meEl=markerElement("Attraction",false,"●");meEl.className="google-listed-pin me";meMarker=new AdvancedMarkerElement({map:googleMap,position:{lat:gps.lat,lng:gps.lng},title:"You are here",content:meEl});bounds.extend({lat:gps.lat,lng:gps.lng});}
  if(fit&&count&&!searchResults.length)googleMap.fitBounds(bounds,60);
}
function ensureListedIndex(){renderListedMarkers(false);if(listedIndexPromise)return listedIndexPromise;listedIndexPromise=Promise.resolve(window.HolidayApp?.indexAllPlacesOnce?.()).then(()=>renderListedMarkers(true)).catch(()=>renderListedMarkers(false));return listedIndexPromise;}

function renderResults(){
  GS.results.innerHTML=searchResults.length?searchResults.map((place,idx)=>{
    const item=googlePlaceItem(place),photo=photoUri(place,260,180),selected=idx===activeResultIndex?" selected":"";
    return`<article class="search-result${selected}" data-result-index="${idx}">${photo?`<img class="search-result-photo" src="${safe(photo)}" alt="">`:`<div class="search-result-photo placeholder">⌖</div>`}<div class="search-result-main"><h3>${safe(item.name)}</h3><p>${safe(item.location)}</p><div class="search-result-meta">${metaHtml(place)}</div></div><div class="search-result-actions"><select class="search-type-select" data-search-type-index="${idx}" aria-label="Itinerary type for ${safe(item.name)}">${["Attraction","Hotel","Lunch","Dinner"].map(t=>`<option ${t===item.type?"selected":""}>${t}</option>`).join("")}</select><button class="btn add-search-result" type="button" data-search-add="${idx}">Add</button><button class="btn" type="button" data-show-detail="${idx}">Details</button>${item.website1?`<a class="btn" target="_blank" rel="noopener" href="${safe(item.website1)}">Website</a>`:""}<a class="btn secondary" target="_blank" rel="noopener" href="${safe(googleMapsForPlace(place,item))}">Google Maps</a></div></article>`;
  }).join(""):'<div class="search-empty">Search Google Maps above, or use a category shortcut.</div>';
}
function drawResultMarkers(fit=true){
  if(!googleMap||!AdvancedMarkerElement)return;clearMarkers(resultMarkers);const bounds=new LatLngBounds();let count=0;
  searchResults.forEach((place,idx)=>{if(!place.location)return;const marker=new AdvancedMarkerElement({map:googleMap,position:place.location,title:place.displayName||"Google result",content:markerElement(inferGoogleType(place),true,String(idx+1))});marker.addListener("gmp-click",()=>showGoogleDetail(idx,marker));resultMarkers.push(marker);bounds.extend(place.location);count++;});
  if(fit&&count===1){const p=searchResults.find(x=>x.location);if(p?.viewport)googleMap.fitBounds(p.viewport);else{googleMap.setCenter(p.location);googleMap.setZoom(15);}}else if(fit&&count>1)googleMap.fitBounds(bounds,60);
}
function setResults(places,fit=true){searchResults=places||[];activeResultIndex=-1;renderResults();drawResultMarkers(fit);if(!searchResults.length)GS.detail.hidden=true;}

function showListedDetail(item,marker=null){
  activeResultIndex=-1;renderResults();GS.detail.hidden=false;
  GS.detail.innerHTML=`<div class="detail-grid"><div class="detail-photo-placeholder">${safe(GOOGLE_PIN[item.type]?.glyph||"•")}</div><div class="detail-body"><h2>${safe(item.name)}</h2><div class="detail-address">${safe(item.location)}</div><div class="detail-meta"><span class="detail-chip">${safe(item.type)}</span><span class="detail-chip">${safe(item.area)}</span><span class="detail-chip">Holiday list</span></div><div>${safe(item.description||"")}</div><div class="detail-actions"><button class="btn primary" type="button" data-detail-add-listed="${safe(holidayKey(item))}">Add to itinerary</button><a class="btn secondary" target="_blank" rel="noopener" href="${safe(mapLink(item))}">Google Maps</a>${item.website1?`<a class="btn" target="_blank" rel="noopener" href="${safe(item.website1)}">Website</a>`:""}</div></div></div>`;
  if(marker&&googleInfoWindow){googleInfoWindow.setContent(`<strong>${safe(item.name)}</strong><br>${safe(item.type)} · ${safe(item.area)}`);googleInfoWindow.open({map:googleMap,anchor:marker,shouldFocus:false});}
}
function showGoogleDetail(idx,marker=null){
  const place=searchResults[idx];if(!place)return;activeResultIndex=idx;renderResults();const item=googlePlaceItem(place),photo=photoUri(place,720,450),open=openText(place),price=priceText(place),hours=place.currentOpeningHours?.weekdayDescriptions||place.regularOpeningHours?.weekdayDescriptions||[];GS.detail.hidden=false;
  GS.detail.innerHTML=`<div class="detail-grid">${photo?`<img class="detail-photo" src="${safe(photo)}" alt="">`:`<div class="detail-photo-placeholder">⌖</div>`}<div class="detail-body"><h2>${safe(item.name)}</h2><div class="detail-address">${safe(item.location)}</div><div class="detail-meta">${place.rating?`<span class="detail-chip">★ ${Number(place.rating).toFixed(1)}${place.userRatingCount?` · ${Number(place.userRatingCount).toLocaleString()} reviews`:""}</span>`:""}${open?`<span class="detail-chip ${open==="Open now"?"open":"closed"}">${open}</span>`:""}${price?`<span class="detail-chip">${price}</span>`:""}<span class="detail-chip">${safe(place.primaryTypeDisplayName||place.primaryType||"Place")}</span></div>${place.nationalPhoneNumber||place.internationalPhoneNumber?`<div class="detail-address">${safe(place.nationalPhoneNumber||place.internationalPhoneNumber)}</div>`:""}<div class="detail-actions"><select class="detail-type-select" id="googleDetailType">${["Attraction","Hotel","Lunch","Dinner"].map(t=>`<option ${t===item.type?"selected":""}>${t}</option>`).join("")}</select><button class="btn primary" type="button" data-detail-add-google="${idx}">Add to itinerary</button>${item.website1?`<a class="btn" target="_blank" rel="noopener" href="${safe(item.website1)}">Website</a>`:""}<a class="btn secondary" target="_blank" rel="noopener" href="${safe(googleMapsForPlace(place,item))}">Google Maps</a></div>${hours.length?`<div class="detail-hours">${hours.map(x=>safe(x)).join("<br>")}</div>`:""}</div></div>`;
  if(place.location){googleMap.panTo(place.location);if(googleMap.getZoom()<14)googleMap.setZoom(14);}if(marker&&googleInfoWindow){googleInfoWindow.setContent(`<strong>${safe(item.name)}</strong><br>${ratingHtml(place)} ${open?`· ${safe(open)}`:""}`);googleInfoWindow.open({map:googleMap,anchor:marker,shouldFocus:false});}GS.detail.scrollIntoView({behavior:"smooth",block:"nearest"});
}

function restrictionForSearch(useVisibleMap=false){if(useVisibleMap&&googleMap?.getBounds){const b=googleMap.getBounds();if(b){const sw=b.getSouthWest(),ne=b.getNorthEast();return{south:sw.lat(),west:sw.lng(),north:ne.lat(),east:ne.lng()};}}return activeBounds();}
async function textSearch(query,useVisibleMap=false){
  query=(query||"").trim();if(!query)return;if(!GooglePlace){await initGoogleTab();if(!GooglePlace)return;}lastSearchQuery=query;GS.query.value=query;hideSuggestions();GS.button.disabled=true;GS.searchArea.disabled=true;GS.status.textContent=`Searching Google Maps for “${query}”…`;
  try{const {places}=await GooglePlace.searchByText({textQuery:query,fields:GOOGLE_RESULT_FIELDS,locationRestriction:restrictionForSearch(useVisibleMap),language:"en",region:"ie",maxResultCount:20});setResults(places||[],true);GS.status.textContent=searchResults.length?`${searchResults.length} Google result${searchResults.length===1?"":"s"} found. Tap a pin or result for details.`:"No matching places found in this area.";}catch(err){console.error(err);GS.status.textContent=`Google Places search failed: ${err?.message||err}. Check that Maps JavaScript API, Places API and Places API (New) are allowed.`;}finally{GS.button.disabled=false;GS.searchArea.disabled=false;}
}

function hideSuggestions(){GS.suggestions.hidden=true;GS.suggestions.innerHTML="";autocompleteSuggestions=[];}
function renderSuggestions(){const predictions=autocompleteSuggestions.filter(x=>x?.placePrediction);if(!predictions.length){hideSuggestions();return;}GS.suggestions.innerHTML=predictions.map((s,idx)=>{const p=s.placePrediction;return`<button class="google-suggestion" type="button" data-google-suggestion="${idx}"><span class="google-suggestion-main">${safe(p.mainText?.toString?.()||p.text?.toString?.()||"Place")}</span><span class="google-suggestion-secondary">${safe(p.secondaryText?.toString?.()||"")}</span></button>`;}).join("");GS.suggestions.hidden=false;}
async function fetchSuggestions(){
  const q=GS.query.value.trim(),reqId=++autocompleteRequestId;if(q.length<2){hideSuggestions();return;}if(!AutocompleteSuggestion)return;if(!autocompleteToken)autocompleteToken=new AutocompleteSessionToken();
  try{const {suggestions}=await AutocompleteSuggestion.fetchAutocompleteSuggestions({input:q,locationRestriction:restrictionForSearch(false),includedRegionCodes:["ie"],language:"en",region:"ie",sessionToken:autocompleteToken});if(reqId!==autocompleteRequestId)return;autocompleteSuggestions=suggestions||[];renderSuggestions();}catch(err){if(reqId===autocompleteRequestId){console.warn("Autocomplete failed",err);hideSuggestions();}}
}
async function selectSuggestion(idx){const s=autocompleteSuggestions.filter(x=>x?.placePrediction)[idx];if(!s)return;try{GS.status.textContent="Loading place details…";const place=s.placePrediction.toPlace();await place.fetchFields({fields:GOOGLE_RESULT_FIELDS});autocompleteToken=null;hideSuggestions();GS.query.value=place.displayName||s.placePrediction.text?.toString?.()||"";lastSearchQuery=GS.query.value;setResults([place],true);showGoogleDetail(0,resultMarkers[0]);GS.status.textContent="Place selected.";}catch(err){console.error(err);GS.status.textContent=`That place could not be loaded: ${err?.message||err}`;}}

async function initGoogleTab(){
  const key=storedGoogleKey();GS.keySetup.hidden=!!key;GS.controls.hidden=!key;if(!key){GS.status.textContent="Add your restricted Google Maps browser key once on this device to enable Map - Google.";return;}
  try{GS.status.textContent="Loading Google Maps…";await loadGoogleMapsApi();const [{Map,InfoWindow},{Place,AutocompleteSuggestion:AS,AutocompleteSessionToken:AST},{AdvancedMarkerElement:AME},{LatLngBounds:LLB}]=await Promise.all([google.maps.importLibrary("maps"),google.maps.importLibrary("places"),google.maps.importLibrary("marker"),google.maps.importLibrary("core")]);GooglePlace=Place;AutocompleteSuggestion=AS;AutocompleteSessionToken=AST;AdvancedMarkerElement=AME;LatLngBounds=LLB;if(!googleMap){const c=activeCenter();googleMap=new Map(GS.map,{center:{lat:c.lat,lng:c.lng},zoom:c.zoom,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,mapId:"DEMO_MAP_ID"});googleInfoWindow=new InfoWindow();googleMap.addListener("idle",()=>{if(lastSearchQuery)GS.searchArea.disabled=false;});}GS.status.textContent="Google Maps ready. Search, choose a category, or tap an existing holiday pin.";ensureListedIndex();renderListedMarkers(true);}catch(err){console.error(err);GS.status.textContent=`Google Maps could not load: ${err?.message||err}. Check the key and allow Maps JavaScript API, Places API and Places API (New).`;}
}

GS.keySave?.addEventListener("click",()=>{const key=(GS.keyInput?.value||"").trim();if(!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)){GS.status.textContent="That does not look like a Google Maps API key.";return;}setGoogleKey(key);GS.keyInput.value="";GS.keySetup.hidden=true;GS.controls.hidden=false;initGoogleTab();});
GS.keyInput?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();GS.keySave.click();}});GS.keyForget?.addEventListener("click",forgetGoogleKey);
GS.query?.addEventListener("input",()=>{clearTimeout(autocompleteTimer);autocompleteTimer=setTimeout(fetchSuggestions,250);});GS.query?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();textSearch(GS.query.value,false);}else if(e.key==="Escape")hideSuggestions();});GS.button?.addEventListener("click",()=>textSearch(GS.query.value,false));GS.searchArea?.addEventListener("click",()=>textSearch(GS.query.value||lastSearchQuery,true));GS.categories?.addEventListener("click",e=>{const b=e.target.closest("[data-google-query]");if(!b)return;textSearch(b.dataset.googleQuery,false);});GS.suggestions?.addEventListener("click",e=>{const b=e.target.closest("[data-google-suggestion]");if(b)selectSuggestion(Number(b.dataset.googleSuggestion));});
GS.results?.addEventListener("click",e=>{const add=e.target.closest("[data-search-add]");if(add){const idx=Number(add.dataset.searchAdd),place=searchResults[idx];if(place){const type=GS.results.querySelector(`[data-search-type-index="${idx}"]`)?.value||inferGoogleType(place);window.HolidayItinerary?.openItem(googlePlaceItem(place,type));}return;}const detail=e.target.closest("[data-show-detail]");if(detail){showGoogleDetail(Number(detail.dataset.showDetail),resultMarkers[Number(detail.dataset.showDetail)]);return;}if(e.target.closest("a,button,select"))return;const card=e.target.closest("[data-result-index]");if(card)showGoogleDetail(Number(card.dataset.resultIndex),resultMarkers[Number(card.dataset.resultIndex)]);});GS.results?.addEventListener("change",e=>{if(e.target.matches("[data-search-type-index]"))drawResultMarkers(false);});
GS.detail?.addEventListener("click",e=>{const g=e.target.closest("[data-detail-add-google]");if(g){const idx=Number(g.dataset.detailAddGoogle),place=searchResults[idx];if(place){const type=document.getElementById("googleDetailType")?.value||inferGoogleType(place);window.HolidayItinerary?.openItem(googlePlaceItem(place,type));}return;}const l=e.target.closest("[data-detail-add-listed]");if(l){const item=(window.HOLIDAY_ITEMS||[]).find(x=>holidayKey(x)===l.dataset.detailAddListed);if(item)window.HolidayItinerary?.openItem(item);}});
document.addEventListener("click",e=>{if(!e.target.closest(".google-query-wrap"))hideSuggestions();});document.addEventListener("holidayapp:search-opened",()=>{initGoogleTab().then(()=>{if(googleMap){google.maps.event.trigger(googleMap,"resize");renderListedMarkers(!searchResults.length);}});});document.addEventListener("holidayapp:list-rendered",()=>{if(googleMap)renderListedMarkers(false);});document.addEventListener("holidayapp:gps-updated",()=>{if(googleMap)renderListedMarkers(false);});

renderResults();initGoogleTab();
