const GOOGLE_KEY_STORAGE_KEY="holidayapp_google_maps_api_key";
const GOOGLE_USAGE_STORAGE_KEY="holidayapp_google_usage_v1";
const GOOGLE_USAGE_LIMITS={mapLoads:1000,autocomplete:5000,searches:500,details:250,photos:250};
const GOOGLE_AREA_BOUNDS={
  "Dublin":{south:53.15,west:-6.80,north:53.65,east:-5.90},
  "Galway":{south:52.90,west:-10.35,north:53.80,east:-8.70},
  "Roscommon / Athlone":{south:53.10,west:-8.90,north:54.15,east:-7.35},
  "Limerick / Clare":{south:52.35,west:-9.65,north:53.25,east:-7.80},
  "Killarney / Kerry":{south:51.60,west:-10.75,north:52.70,east:-8.65}
};
const IRELAND_BOUNDS={south:51.30,west:-10.90,north:55.50,east:-5.30};
const LISTED_PIN_STYLE={Attraction:{background:"#c23a3a",glyph:"★"},Hotel:{background:"#2f6eb6",glyph:"H"},Lunch:{background:"#6aa84f",glyph:"L"},Dinner:{background:"#23704a",glyph:"D"}};

let googleMapsLoadPromise=null,googleMap=null,googleInfoWindow=null;
let listedMarkers=[],resultMarkers=[],gpsMarker=null,searchResults=[];
let PlaceClass=null,AdvancedMarkerElement=null,PinElement=null,LatLngBounds=null;
let AutocompleteSuggestion=null,AutocompleteSessionToken=null,autocompleteToken=null,autocompleteTimer=null,autocompleteSequence=0;
let listedIndexPromise=null,resultTypeOverrides=new Map();

const GS={
  keySetup:document.getElementById("googleKeySetup"),keyInput:document.getElementById("googleApiKeyInput"),keySave:document.getElementById("googleApiKeySave"),
  keyForget:document.getElementById("googleApiKeyForget"),controls:document.getElementById("googleSearchControls"),query:document.getElementById("googlePlaceQuery"),
  suggestions:document.getElementById("googleSuggestions"),searchBtn:document.getElementById("placeSearchBtn"),searchAreaBtn:document.getElementById("searchThisAreaBtn"),
  categoryRow:document.getElementById("googleCategoryRow"),status:document.getElementById("placeSearchStatus"),listedStatus:document.getElementById("googleListedStatus"),
  map:document.getElementById("searchMap"),detail:document.getElementById("googlePlaceDetail"),results:document.getElementById("placeSearchResults"),
  usageBtn:document.getElementById("googleUsageBtn"),usagePanel:document.getElementById("googleUsagePanel"),usageClose:document.getElementById("googleUsageClose"),
  usageContent:document.getElementById("googleUsageContent"),limiterToggle:document.getElementById("googleLimiterToggle")
};

function storedGoogleKey(){return localStorage.getItem(GOOGLE_KEY_STORAGE_KEY)||""}
function setGoogleKey(key){localStorage.setItem(GOOGLE_KEY_STORAGE_KEY,key.trim())}
function forgetGoogleKey(){localStorage.removeItem(GOOGLE_KEY_STORAGE_KEY);location.reload()}
function monthKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`}
function blankCounts(){return{mapLoads:0,autocomplete:0,searches:0,details:0,photos:0}}
function loadUsage(){
  try{
    const saved=JSON.parse(localStorage.getItem(GOOGLE_USAGE_STORAGE_KEY)||"null");
    if(saved&&saved.createdAt){
      saved.limiterEnabled=saved.limiterEnabled!==false;
      saved.limits={...GOOGLE_USAGE_LIMITS,...(saved.limits||{})};
      saved.totals={...blankCounts(),...(saved.totals||{})};
      saved.months=saved.months||{};
      return saved;
    }
  }catch{}
  const fresh={createdAt:new Date().toISOString(),limiterEnabled:true,limits:{...GOOGLE_USAGE_LIMITS},totals:blankCounts(),months:{}};
  localStorage.setItem(GOOGLE_USAGE_STORAGE_KEY,JSON.stringify(fresh));return fresh;
}
let usage=loadUsage();
function currentMonthCounts(){
  const key=monthKey();if(!usage.months[key])usage.months[key]=blankCounts();
  return usage.months[key];
}
function saveUsage(){localStorage.setItem(GOOGLE_USAGE_STORAGE_KEY,JSON.stringify(usage));renderUsage()}
function usageRatio(kind){return(currentMonthCounts()[kind]||0)/(usage.limits[kind]||1)}
function canUse(kind){return!usage.limiterEnabled||(currentMonthCounts()[kind]||0)<(usage.limits[kind]||Infinity)}
function recordUsage(kind,amount=1){
  const month=currentMonthCounts();month[kind]=(month[kind]||0)+amount;usage.totals[kind]=(usage.totals[kind]||0)+amount;saveUsage();
}
function usageLabel(kind){return({mapLoads:"Map loads",autocomplete:"Autocomplete",searches:"Text searches",details:"Place details",photos:"Photos"})[kind]||kind}
function renderUsage(){
  if(!GS.usageContent)return;
  const month=currentMonthCounts(),created=new Date(usage.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const rows=Object.keys(GOOGLE_USAGE_LIMITS).map(kind=>{
    const used=month[kind]||0,limit=usage.limits[kind],pct=Math.min(100,Math.round(used/limit*100));
    return`<div class="usage-row"><div class="usage-row-top"><span>${usageLabel(kind)}</span><strong>${used} / ${limit}</strong></div><div class="usage-bar"><span style="width:${pct}%"></span></div><small>Total since tracking: ${usage.totals[kind]||0}</small></div>`;
  }).join("");
  GS.usageContent.innerHTML=`<div class="usage-since">Tracking since <strong>${esc(created)}</strong><br>Current month: <strong>${esc(monthKey())}</strong></div>${rows}`;
  GS.limiterToggle.checked=usage.limiterEnabled;
  const max=Math.max(...Object.keys(GOOGLE_USAGE_LIMITS).map(usageRatio));
  GS.usageBtn?.classList.toggle("usage-warn",max>=.7&&max<.95);GS.usageBtn?.classList.toggle("usage-danger",max>=.95);
}
function blockedMessage(kind){return`Local Google safety limit reached for ${usageLabel(kind).toLowerCase()}. Open the usage icon to disable the limiter if you intentionally want to continue.`}

function selectedBounds(){
  const selected=[...(window.HolidayApp?.state?.areas||[])];
  if(!selected.length||selected.length===window.HolidayApp?.allAreas?.length)return IRELAND_BOUNDS;
  const boxes=selected.map(a=>GOOGLE_AREA_BOUNDS[a]).filter(Boolean);if(!boxes.length)return IRELAND_BOUNDS;
  return{south:Math.min(...boxes.map(b=>b.south)),west:Math.min(...boxes.map(b=>b.west)),north:Math.max(...boxes.map(b=>b.north)),east:Math.max(...boxes.map(b=>b.east))};
}
function boundsCenter(b){return{lat:(b.south+b.north)/2,lng:(b.west+b.east)/2}}
function filteredHolidayItems(){return window.HolidayApp?.filteredItems?.()||ITEMS}

function loadGoogleMapsApi(){
  const key=storedGoogleKey();if(!key)return Promise.reject(new Error("No Google Maps API key configured"));
  if(window.google?.maps?.importLibrary)return Promise.resolve();
  if(googleMapsLoadPromise)return googleMapsLoadPromise;
  if(!canUse("mapLoads"))return Promise.reject(new Error(blockedMessage("mapLoads")));
  recordUsage("mapLoads");
  googleMapsLoadPromise=new Promise((resolve,reject)=>{
    const callback="__holidayAppGoogleMapsReady";
    window[callback]=()=>{delete window[callback];resolve();};
    const script=document.createElement("script");script.async=true;script.defer=true;
    script.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(key)+"&loading=async&v=weekly&language=en&region=IE&auth_referrer_policy=origin&callback="+callback;
    script.onerror=()=>{delete window[callback];googleMapsLoadPromise=null;reject(new Error("Google Maps JavaScript API failed to load"));};
    document.head.appendChild(script);
  });
  return googleMapsLoadPromise;
}

function clearMarkers(arr){for(const marker of arr)marker.map=null;arr.length=0}
function makePin(background,glyph,scale=.9){return new PinElement({background,borderColor:"#ffffff",glyphColor:"#ffffff",glyph,scale}).element}
function inferGoogleArea(address){
  const s=(address||"").toLowerCase();
  if(s.includes("dublin"))return"Dublin";if(s.includes("galway"))return"Galway";
  if(s.includes("athlone")||s.includes("roscommon")||s.includes("westmeath"))return"Roscommon / Athlone";
  if(s.includes("limerick")||s.includes("clare"))return"Limerick / Clare";
  if(s.includes("killarney")||s.includes("kerry"))return"Killarney / Kerry";return"Other";
}
function inferGoogleType(place){
  const types=new Set([place.primaryType,...(place.types||[])].filter(Boolean));
  const hotels=["hotel","lodging","motel","bed_and_breakfast","guest_house","hostel","resort_hotel"];
  const lunch=["cafe","coffee_shop","bakery","sandwich_shop","meal_takeaway","food_court","brunch_restaurant","breakfast_restaurant"];
  const dinner=["restaurant","pub","bar","gastropub","steak_house","seafood_restaurant","italian_restaurant","indian_restaurant","thai_restaurant","chinese_restaurant","pizza_restaurant"];
  if(hotels.some(x=>types.has(x)))return"Hotel";if(lunch.some(x=>types.has(x)))return"Lunch";
  if(dinner.some(x=>types.has(x))||[...types].some(x=>x?.endsWith("_restaurant")))return"Dinner";return"Attraction";
}
function resultKey(place,idx){return place.id||`result-${idx}`}
function resultType(place,idx){return resultTypeOverrides.get(resultKey(place,idx))||inferGoogleType(place)}
function googlePlaceItem(place,idx){
  const loc=place.location,lat=loc&&typeof loc.lat==="function"?loc.lat():Number(loc?.lat),lng=loc&&typeof loc.lng==="function"?loc.lng():Number(loc?.lng);
  const location=place.formattedAddress||place.shortFormattedAddress||place.displayName||"",category=place.primaryTypeDisplayName||place.primaryType||"Google place";
  return{name:place.displayName||"Place",location,area:inferGoogleArea(location),type:resultType(place,idx),visitTime:"",description:`Google Places · ${category}`,
    website1:place.websiteURI||"",website2:place.googleMapsURI||"",lat,lng,source:"Search"};
}
function mapsForPlace(place,item){return place.googleMapsURI||("https://www.google.com/maps?q="+encodeURIComponent(item.location||item.name))}
function ratingHtml(place){return Number.isFinite(place.rating)?`<span class="google-rating">★ ${place.rating.toFixed(1)}${place.userRatingCount?` <small>(${place.userRatingCount.toLocaleString()})</small>`:""}</span>`:""}
function priceText(level){
  const map={PRICE_LEVEL_FREE:"Free",PRICE_LEVEL_INEXPENSIVE:"£",PRICE_LEVEL_MODERATE:"££",PRICE_LEVEL_EXPENSIVE:"£££",PRICE_LEVEL_VERY_EXPENSIVE:"££££"};return map[String(level)]||"";
}
function openStatus(place){
  const hours=place.currentOpeningHours||place.regularOpeningHours,offset=Number(place.utcOffsetMinutes);
  if(!hours?.periods?.length||!Number.isFinite(offset))return null;
  const local=new Date(Date.now()+offset*60000),now=local.getUTCDay()*1440+local.getUTCHours()*60+local.getUTCMinutes(),week=7*1440;
  for(const p of hours.periods){
    if(!p?.open)continue;
    const start=p.open.day*1440+p.open.hour*60+p.open.minute;if(!p.close)return true;
    let end=p.close.day*1440+p.close.hour*60+p.close.minute;if(end<=start)end+=week;
    if((now>=start&&now<end)||(now+week>=start&&now+week<end))return true;
  }
  return false;
}
function photoMarkup(place,large=false){
  if(!place.__holidayPhotoAllowed||!place.photos?.[0])return"";
  const photo=place.photos[0],src=photo.getURI(large?{maxWidth:900,maxHeight:500}:{maxWidth:280,maxHeight:180});
  const attrs=(photo.authorAttributions||[]).map(a=>a.uri?`<a target="_blank" rel="noopener" href="${esc(a.uri)}">${esc(a.displayName||"Photo")}</a>`:esc(a.displayName||"Photo")).join(", ");
  return`<div class="google-photo${large?" large":""}"><img src="${esc(src)}" alt="${esc(place.displayName||"Place photo")}" loading="lazy">${attrs?`<div class="photo-credit">Photo: ${attrs}</div>`:""}</div>`;
}
function richMeta(place){
  if(!place.__holidayRichLoaded)return"";
  const open=openStatus(place),price=priceText(place.priceLevel);
  return`<div class="google-rich-meta">${ratingHtml(place)}${open===true?'<span class="open-now">Open now</span>':open===false?'<span class="closed-now">Closed now</span>':""}${price?`<span>${esc(price)}</span>`:""}</div>`;
}

function drawListedPlaces(fit=false){
  if(!googleMap||!AdvancedMarkerElement||!PinElement)return;
  clearMarkers(listedMarkers);const bounds=new LatLngBounds();let count=0,missing=0;
  for(const item of filteredHolidayItems()){
    const c=window.HolidayApp.coordCache[window.HolidayApp.itemKey(item)];
    if(!c||c.failed||!Number.isFinite(Number(c.lat))||!Number.isFinite(Number(c.lng))){missing++;continue;}
    const style=LISTED_PIN_STYLE[item.type]||LISTED_PIN_STYLE.Attraction,pos={lat:Number(c.lat),lng:Number(c.lng)};
    const marker=new AdvancedMarkerElement({map:googleMap,position:pos,title:item.name,content:makePin(style.background,style.glyph,.88)});
    marker.addListener("click",()=>{
      googleInfoWindow.setContent(`<div class="google-popup"><strong>${esc(item.name)}</strong><br><span>${esc(item.type)} · ${esc(item.area)}</span><br><a target="_blank" rel="noopener" href="${esc(maps(item))}">Google Maps</a> · <a href="#" data-listed-add="${esc(window.HolidayApp.itemKey(item))}">Add</a></div>`);
      googleInfoWindow.open({map:googleMap,anchor:marker,shouldFocus:false});
    });
    listedMarkers.push(marker);bounds.extend(pos);count++;
  }
  const total=filteredHolidayItems().length;
  GS.listedStatus.textContent=missing?`${count} of ${total} filtered holiday places shown; ${missing} still locating.`:`${count} filtered holiday place${count===1?"":"s"} shown.`;
  if(fit&&count&&!searchResults.length)googleMap.fitBounds(bounds,60);
}
function drawGps(){
  if(gpsMarker){gpsMarker.map=null;gpsMarker=null;}const gps=window.HolidayApp?.state?.gps;if(!googleMap||!gps)return;
  gpsMarker=new AdvancedMarkerElement({map:googleMap,position:gps,title:"You are here",content:makePin("#111111","●",.95)});
}
async function ensureListedIndex(){
  drawListedPlaces(false);drawGps();
  const summary=window.HolidayApp?.mapCacheSummary?.();
  if(summary&&summary.pending===0){drawListedPlaces(true);return}
  if(listedIndexPromise)return listedIndexPromise;
  listedIndexPromise=window.HolidayApp?.indexAllPlacesOnce?.().then(()=>drawListedPlaces(true)).catch(err=>{console.warn(err);drawListedPlaces(false)})||Promise.resolve();
  return listedIndexPromise;
}

function renderResults(){
  if(!GS.results)return;
  GS.results.innerHTML=searchResults.length?searchResults.map((place,idx)=>{
    const item=googlePlaceItem(place,idx),category=place.primaryTypeDisplayName||place.primaryType||"Place",rich=place.__holidayRichLoaded;
    return`<article class="search-result" data-google-result="${idx}">
      <button class="search-result-main" type="button" data-google-detail="${idx}">
        <h3>${esc(item.name)}</h3><p>${esc(item.location)}</p><div class="search-result-category">${esc(category)}</div>${rich?richMeta(place):'<div class="result-hint">Tap for rating, hours, phone and photo</div>'}
      </button>
      <div class="search-result-actions">
        <select class="search-type-select" data-search-type-index="${idx}" aria-label="Itinerary type for ${esc(item.name)}">${["Attraction","Hotel","Lunch","Dinner"].map(t=>`<option ${t===item.type?"selected":""}>${t}</option>`).join("")}</select>
        <button class="btn add-search-result" type="button" data-search-add="${idx}">Add</button>
        <button class="btn" type="button" data-google-detail="${idx}">${rich?"Details":"View details"}</button>
        <a class="btn secondary" target="_blank" rel="noopener" href="${esc(mapsForPlace(place,item))}">Google Maps</a>
      </div>
    </article>`;
  }).join(""):'<div class="search-empty">Search Google Maps for restaurants, cafés, attractions, hotels or any other place. Your holiday pins remain on the map.</div>';
}
function drawSearchResults(fit=true){
  if(!googleMap||!AdvancedMarkerElement)return;clearMarkers(resultMarkers);if(!searchResults.length)return;
  const bounds=new LatLngBounds();let count=0;
  searchResults.forEach((place,idx)=>{
    if(!place.location)return;const marker=new AdvancedMarkerElement({map:googleMap,position:place.location,title:place.displayName||"Google result",content:makePin("#7b4db3","G",1.02)});
    marker.addListener("click",()=>openRichDetails(idx));resultMarkers.push(marker);bounds.extend(place.location);count++;
  });
  if(fit&&count===1){const p=searchResults.find(x=>x.location);if(p?.viewport)googleMap.fitBounds(p.viewport);else{googleMap.setCenter(p.location);googleMap.setZoom(15)}}
  else if(fit&&count>1)googleMap.fitBounds(bounds,60);
}
function clearSuggestions(){GS.suggestions.hidden=true;GS.suggestions.innerHTML=""}
function renderSuggestions(suggestions){
  const places=suggestions.filter(s=>s.placePrediction).slice(0,8);
  GS.suggestions.innerHTML=places.map((s,i)=>`<button type="button" data-suggestion-index="${i}">${esc(s.placePrediction.text.toString())}</button>`).join("");
  GS.suggestions._items=places;GS.suggestions.hidden=!places.length;
}
async function fetchSuggestions(){
  const input=GS.query.value.trim(),seq=++autocompleteSequence;if(input.length<2){clearSuggestions();autocompleteToken=null;return}
  if(!AutocompleteSuggestion)return;if(!canUse("autocomplete")){GS.status.textContent=blockedMessage("autocomplete");clearSuggestions();return}
  if(!autocompleteToken)autocompleteToken=new AutocompleteSessionToken();
  try{
    recordUsage("autocomplete");
    const {suggestions}=await AutocompleteSuggestion.fetchAutocompleteSuggestions({input,locationRestriction:selectedBounds(),language:"en-GB",region:"ie",sessionToken:autocompleteToken});
    if(seq!==autocompleteSequence)return;renderSuggestions(suggestions||[]);
  }catch(err){console.warn("Autocomplete failed",err);if(seq===autocompleteSequence)clearSuggestions()}
}
async function selectSuggestion(index){
  const s=GS.suggestions._items?.[index],prediction=s?.placePrediction;if(!prediction)return;
  if(!canUse("details")){GS.status.textContent=blockedMessage("details");return}
  try{
    const place=prediction.toPlace();recordUsage("details");
    await place.fetchFields({fields:["id","displayName","formattedAddress","shortFormattedAddress","location","viewport","primaryType","primaryTypeDisplayName","types","googleMapsURI"]});
    GS.query.value=place.displayName||prediction.text.toString();searchResults=[place];resultTypeOverrides.clear();clearSuggestions();autocompleteToken=null;
    renderResults();drawSearchResults(true);GS.status.textContent="1 Google place selected. Tap it for richer details.";
  }catch(err){console.error(err);GS.status.textContent=`Google place selection failed: ${err?.message||err}`}
}

async function runTextSearch(useMapBounds=false){
  const raw=GS.query.value.trim();if(!raw){GS.status.textContent="Type something to search for first.";return}
  if(!PlaceClass){await initGoogleMap();if(!PlaceClass)return}
  if(!canUse("searches")){GS.status.textContent=blockedMessage("searches");return}
  GS.searchBtn.disabled=true;GS.searchAreaBtn.disabled=true;GS.status.textContent="Searching Google Places…";clearSuggestions();autocompleteToken=null;
  try{
    let restriction=selectedBounds();if(useMapBounds&&googleMap?.getBounds)restriction=googleMap.getBounds()?.toJSON()||restriction;
    recordUsage("searches");
    const {places}=await PlaceClass.searchByText({textQuery:raw,fields:["id","displayName","formattedAddress","shortFormattedAddress","location","viewport","primaryType","primaryTypeDisplayName","types","googleMapsURI"],locationRestriction:restriction,language:"en",region:"ie",maxResultCount:12});
    searchResults=places||[];resultTypeOverrides.clear();renderResults();drawSearchResults(!useMapBounds);
    GS.status.textContent=searchResults.length?`${searchResults.length} Google result${searchResults.length===1?"":"s"}. Rich details load only when you open a place.`:"No matching Google places found.";
  }catch(err){console.error(err);GS.status.textContent=`Google Places search failed: ${err?.message||err}`}
  finally{GS.searchBtn.disabled=false;GS.searchAreaBtn.disabled=false}
}

async function openRichDetails(index){
  const place=searchResults[index];if(!place)return;
  if(!place.__holidayRichLoaded){
    if(!canUse("details")){GS.status.textContent=blockedMessage("details");return}
    const fields=["rating","userRatingCount","currentOpeningHours","regularOpeningHours","utcOffsetMinutes","nationalPhoneNumber","websiteURI","priceLevel","googleMapsURI"];
    const allowPhoto=canUse("photos");if(allowPhoto)fields.push("photos");
    try{
      GS.status.textContent="Loading place details…";recordUsage("details");await place.fetchFields({fields});place.__holidayRichLoaded=true;
      if(allowPhoto&&place.photos?.length){place.__holidayPhotoAllowed=true;recordUsage("photos")}
      renderResults();GS.status.textContent="Place details loaded.";
    }catch(err){console.error(err);GS.status.textContent=`Place details failed: ${err?.message||err}`;return}
  }
  showDetailPanel(index);
}
function showDetailPanel(index){
  const place=searchResults[index];if(!place)return;const item=googlePlaceItem(place,index),hours=place.currentOpeningHours||place.regularOpeningHours;
  const today=hours?.weekdayDescriptions?.[new Date().getDay()]||"",phone=place.nationalPhoneNumber||"",price=priceText(place.priceLevel);
  GS.detail.innerHTML=`<div class="google-detail-card">
    <button class="google-detail-close" type="button" data-detail-close aria-label="Close">×</button>
    ${photoMarkup(place,true)}
    <div class="google-detail-body"><h2>${esc(item.name)}</h2><p>${esc(item.location)}</p>${richMeta(place)}
      ${today?`<div class="detail-line"><strong>Today:</strong> ${esc(today)}</div>`:""}${phone?`<div class="detail-line"><strong>Phone:</strong> ${esc(phone)}</div>`:""}${price?`<div class="detail-line"><strong>Price:</strong> ${esc(price)}</div>`:""}
      <div class="detail-actions"><button class="btn primary" type="button" data-search-add="${index}">Add to itinerary</button>${place.websiteURI?`<a class="btn" target="_blank" rel="noopener" href="${esc(place.websiteURI)}">Website</a>`:""}<a class="btn secondary" target="_blank" rel="noopener" href="${esc(mapsForPlace(place,item))}">Google Maps</a></div>
    </div></div>`;
  GS.detail.hidden=false;GS.detail.scrollIntoView({behavior:"smooth",block:"nearest"});
}

async function initGoogleMap(){
  const key=storedGoogleKey();GS.keySetup.hidden=!!key;GS.controls.hidden=!key;
  if(!key){GS.status.textContent="Add your restricted Google Maps browser key once on this device to enable Google Maps and Places.";return}
  if(googleMap){drawListedPlaces(false);drawGps();return}
  try{
    GS.status.textContent="Loading Google Maps…";await loadGoogleMapsApi();
    const [{Map,InfoWindow},{Place,AutocompleteSuggestion:AS,AutocompleteSessionToken:AST},{AdvancedMarkerElement:AME,PinElement:PE},{LatLngBounds:LLB}]=await Promise.all([
      google.maps.importLibrary("maps"),google.maps.importLibrary("places"),google.maps.importLibrary("marker"),google.maps.importLibrary("core")
    ]);
    PlaceClass=Place;AutocompleteSuggestion=AS;AutocompleteSessionToken=AST;AdvancedMarkerElement=AME;PinElement=PE;LatLngBounds=LLB;
    const bounds=selectedBounds(),center=boundsCenter(bounds);
    googleMap=new Map(GS.map,{center,zoom:7,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,mapId:"DEMO_MAP_ID"});googleInfoWindow=new InfoWindow();
    await ensureListedIndex();renderResults();renderUsage();GS.status.textContent="Google Places ready. Search results use basic fields until you open a place.";
  }catch(err){console.error(err);GS.status.textContent=`Google Maps could not load: ${err?.message||err}`}
}

GS.keySave?.addEventListener("click",()=>{
  const key=(GS.keyInput.value||"").trim();if(!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)){GS.status.textContent="That does not look like a Google Maps API key.";return}
  setGoogleKey(key);GS.keyInput.value="";GS.keySetup.hidden=true;GS.controls.hidden=false;initGoogleMap();
});
GS.keyInput?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();GS.keySave.click()}});
GS.keyForget?.addEventListener("click",forgetGoogleKey);
GS.query?.addEventListener("input",()=>{clearTimeout(autocompleteTimer);autocompleteTimer=setTimeout(fetchSuggestions,350)});
GS.query?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();runTextSearch(false)}else if(e.key==="Escape")clearSuggestions()});
GS.searchBtn?.addEventListener("click",()=>runTextSearch(false));GS.searchAreaBtn?.addEventListener("click",()=>runTextSearch(true));
GS.categoryRow?.addEventListener("click",e=>{const b=e.target.closest("[data-google-query]");if(!b)return;GS.query.value=b.dataset.googleQuery;runTextSearch(false)});
GS.suggestions?.addEventListener("click",e=>{const b=e.target.closest("[data-suggestion-index]");if(b)selectSuggestion(Number(b.dataset.suggestionIndex))});
GS.results?.addEventListener("change",e=>{const s=e.target.closest("[data-search-type-index]");if(!s)return;const idx=Number(s.dataset.searchTypeIndex),place=searchResults[idx];if(place)resultTypeOverrides.set(resultKey(place,idx),s.value)});
GS.results?.addEventListener("click",e=>{
  const add=e.target.closest("[data-search-add]");if(add){const idx=Number(add.dataset.searchAdd),p=searchResults[idx];if(p)window.HolidayItinerary?.openItem(googlePlaceItem(p,idx));return}
  const d=e.target.closest("[data-google-detail]");if(d)openRichDetails(Number(d.dataset.googleDetail));
});
GS.detail?.addEventListener("click",e=>{
  if(e.target.closest("[data-detail-close]")){GS.detail.hidden=true;return}
  const add=e.target.closest("[data-search-add]");if(add){const idx=Number(add.dataset.searchAdd),p=searchResults[idx];if(p)window.HolidayItinerary?.openItem(googlePlaceItem(p,idx));}
});
GS.usageBtn?.addEventListener("click",()=>{GS.usagePanel.hidden=!GS.usagePanel.hidden;renderUsage()});
GS.usageClose?.addEventListener("click",()=>GS.usagePanel.hidden=true);
GS.limiterToggle?.addEventListener("change",()=>{usage.limiterEnabled=GS.limiterToggle.checked;saveUsage();if(!usage.limiterEnabled&&!googleMap)initGoogleMap()});
document.addEventListener("click",e=>{
  if(!GS.usagePanel?.hidden&&!e.target.closest(".usage-anchor"))GS.usagePanel.hidden=true;
  const listed=e.target.closest?.("[data-listed-add]");if(listed){e.preventDefault();const item=ITEMS.find(i=>window.HolidayApp.itemKey(i)===listed.dataset.listedAdd);if(item)window.HolidayItinerary?.openItem(item);}
});
document.addEventListener("holidayapp:filters-changed",()=>{if(googleMap)drawListedPlaces(true)});
document.addEventListener("holidayapp:index-place",()=>{if(googleMap)drawListedPlaces(false)});
document.addEventListener("holidayapp:index-progress",e=>{if(!googleMap)return;const d=e.detail;if(!d.finished)GS.listedStatus.textContent=`Locating holiday places… ${d.done} / ${d.total}`;else drawListedPlaces(true)});
document.addEventListener("holidayapp:gps-updated",()=>drawGps());
document.addEventListener("holidayapp:google-opened",()=>{initGoogleMap().then(()=>setTimeout(()=>{if(googleMap)google.maps.event.trigger(googleMap,"resize")},80))});

renderUsage();renderResults();
const hasStoredGoogleKey=!!storedGoogleKey();
GS.keySetup.hidden=hasStoredGoogleKey;GS.controls.hidden=!hasStoredGoogleKey;
if(!hasStoredGoogleKey)GS.status.textContent="Add your restricted Google Maps browser key once on this device to enable Google Maps and Places.";
