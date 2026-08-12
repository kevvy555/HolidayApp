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
const LISTED_PIN_STYLE={
  Attraction:{background:"#c23a3a",glyph:"★"},
  Hotel:{background:"#2f6eb6",glyph:"H"},
  Lunch:{background:"#6aa84f",glyph:"L"},
  Dinner:{background:"#23704a",glyph:"D"}
};

const SEARCH_VIEW=document.getElementById("searchView");
const SEARCH_TAB_BUTTON=document.getElementById("searchTabBtn");
if(SEARCH_TAB_BUTTON)SEARCH_TAB_BUTTON.textContent="Map - Google";
if(SEARCH_VIEW){
  SEARCH_VIEW.innerHTML=`
    <div class="search-panel">
      <div id="googleKeySetup" class="google-key-setup">
        <h2>Google Maps setup</h2>
        <p>Paste your restricted browser API key once on this device. It remains in this browser only.</p>
        <div class="google-key-row">
          <input id="googleApiKeyInput" type="password" placeholder="Google Maps API key" autocomplete="off" spellcheck="false">
          <button id="googleApiKeySave" class="btn primary" type="button">Save key</button>
        </div>
      </div>
      <div id="googleSearchControls" hidden>
        <div class="google-map-toolbar">
          <h2>Google Map & Place Search</h2>
          <div class="google-map-toolbar-note">The normal Location, Type and text filters above also filter the holiday pins on this Google map.</div>
          <div class="google-search-grid">
            <div>
              <div class="google-map-toolbar-note">Find a specific place</div>
              <div id="placeAutocompleteHost"></div>
            </div>
            <div>
              <div class="google-map-toolbar-note">General Google Places search</div>
              <div class="google-text-row">
                <input id="googleTextSearchInput" type="search" placeholder="e.g. vegetarian restaurant, castle, beach…" autocomplete="off">
                <button id="placeSearchBtn" class="btn primary" type="button">Search</button>
              </div>
            </div>
          </div>
          <button id="googleApiKeyForget" class="small-btn" type="button">Forget saved key</button>
        </div>
      </div>
      <div id="placeSearchStatus" class="search-status">Google Maps will load after the API key is available on this device.</div>
      <div id="googleListedStatus" class="listed-status"></div>
      <div class="google-map-legend">
        <span class="ga">Attractions</span><span class="gh">Hotels</span><span class="gl">Lunch</span><span class="gd">Dinner</span><span class="gs">Google search result</span>
      </div>
      <div id="searchMap"></div>
      <div id="placeSearchResults" class="search-results"></div>
    </div>`;
}

function retryPreviouslyFailedCoordsOnce(){
  const rev="2026-08-12-google-map-v1";
  if(localStorage.getItem("holidayapp_coord_retry_revision")===rev)return;
  const cache=window.HolidayApp?.coordCache;if(!cache)return;
  let changed=false;
  for(const [k,v] of Object.entries(cache)){if(v?.failed){delete cache[k];changed=true;}}
  if(changed)localStorage.setItem("holidayapp_coords_v2",JSON.stringify(cache));
  localStorage.setItem("holidayapp_coord_retry_revision",rev);
}
retryPreviouslyFailedCoordsOnce();

let googleMapsLoadPromise=null;
let googleMap=null,googleInfoWindow=null;
let listedMarkers=[],resultMarkers=[],searchResults=[],placeAutocomplete=null;
let GooglePlace=null,AdvancedMarkerElement=null,PinElement=null,LatLngBounds=null;
let listedIndexPromise=null;

const GS={
  keySetup:document.getElementById("googleKeySetup"),
  keyInput:document.getElementById("googleApiKeyInput"),
  keySave:document.getElementById("googleApiKeySave"),
  keyForget:document.getElementById("googleApiKeyForget"),
  controls:document.getElementById("googleSearchControls"),
  autocompleteHost:document.getElementById("placeAutocompleteHost"),
  textInput:document.getElementById("googleTextSearchInput"),
  button:document.getElementById("placeSearchBtn"),
  status:document.getElementById("placeSearchStatus"),
  listedStatus:document.getElementById("googleListedStatus"),
  map:document.getElementById("searchMap"),
  results:document.getElementById("placeSearchResults")
};

function storedGoogleKey(){return localStorage.getItem(GOOGLE_KEY_STORAGE_KEY)||""}
function setGoogleKey(key){localStorage.setItem(GOOGLE_KEY_STORAGE_KEY,key.trim())}
function forgetGoogleKey(){localStorage.removeItem(GOOGLE_KEY_STORAGE_KEY);location.reload()}

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
    script.onerror=()=>{
      delete window[callback];googleMapsLoadPromise=null;
      reject(new Error("Google Maps JavaScript API failed to load"));
    };
    document.head.appendChild(script);
  });
  return googleMapsLoadPromise;
}

function activeArea(){return window.HolidayApp?.state?.area||"All"}
function activeBounds(){return GOOGLE_AREA_BOUNDS[activeArea()]||GOOGLE_AREA_BOUNDS.All}
function activeCenter(){return GOOGLE_AREA_CENTERS[activeArea()]||GOOGLE_AREA_CENTERS.All}
function listedItemsForGoogle(){
  const st=window.HolidayApp?.state||{type:"All",area:"All",search:""};
  const q=(st.search||"").trim().toLowerCase();
  return ITEMS.filter(item=>
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
  const hotels=["hotel","lodging","motel","bed_and_breakfast","guest_house","hostel","resort_hotel"];
  const lunch=["cafe","coffee_shop","bakery","sandwich_shop","meal_takeaway","food_court","brunch_restaurant","breakfast_restaurant"];
  const dinner=["restaurant","pub","bar","gastropub","steak_house","seafood_restaurant","italian_restaurant","indian_restaurant","thai_restaurant","chinese_restaurant","pizza_restaurant"];
  if(hotels.some(x=>types.has(x)))return"Hotel";
  if(lunch.some(x=>types.has(x)))return"Lunch";
  if(dinner.some(x=>types.has(x))||[...types].some(x=>x&&x.endsWith("_restaurant")))return"Dinner";
  return"Attraction";
}
function googlePlaceItem(place,typeOverride=null){
  const loc=place.location;
  const lat=loc&&typeof loc.lat==="function"?loc.lat():Number(loc?.lat);
  const lng=loc&&typeof loc.lng==="function"?loc.lng():Number(loc?.lng);
  const location=place.formattedAddress||place.shortFormattedAddress||place.displayName||"";
  const category=place.primaryTypeDisplayName||place.primaryType||"Google place";
  return{
    name:place.displayName||"Place",location,area:inferGoogleArea(location),
    type:typeOverride||inferGoogleType(place),visitTime:"",
    description:`Google Places · ${category}`,
    website1:place.websiteURI||"",website2:place.googleMapsURI||"",
    lat,lng,source:"Search"
  };
}
function mapsForGooglePlace(place,item){
  return place.googleMapsURI||("https://www.google.com/maps?q="+encodeURIComponent(item.location||item.name));
}

function clearMarkerArray(arr){for(const marker of arr)marker.map=null;arr.length=0;}
function listedPin(item){
  const style=LISTED_PIN_STYLE[item.type]||LISTED_PIN_STYLE.Attraction;
  const pin=new PinElement({background:style.background,borderColor:"#ffffff",glyphColor:"#ffffff",glyph:style.glyph,scale:0.9});
  return pin.element;
}
function resultPin(type){
  const style=LISTED_PIN_STYLE[type]||LISTED_PIN_STYLE.Attraction;
  const pin=new PinElement({background:"#7b4db3",borderColor:"#ffffff",glyphColor:"#ffffff",glyph:style.glyph,scale:1.05});
  return pin.element;
}

function drawListedPlaces(fit=false){
  if(!googleMap||!AdvancedMarkerElement||!PinElement)return;
  clearMarkerArray(listedMarkers);
  const bounds=new LatLngBounds();let count=0,missing=0;
  for(const item of listedItemsForGoogle()){
    const c=window.HolidayApp?.coordCache?.[window.HolidayApp.itemKey(item)];
    if(!c||c.failed||!Number.isFinite(Number(c.lat))||!Number.isFinite(Number(c.lng))){missing++;continue;}
    const pos={lat:Number(c.lat),lng:Number(c.lng)};
    const marker=new AdvancedMarkerElement({map:googleMap,position:pos,title:item.name,content:listedPin(item)});
    marker.addListener("gmp-click",()=>{
      googleInfoWindow.setContent(`<div class="google-popup"><strong>${esc(item.name)}</strong><br><span>${esc(item.type)} · ${esc(item.area)}</span><br><a target="_blank" rel="noopener" href="${esc(maps(item))}">Google Maps</a></div>`);
      googleInfoWindow.open({map:googleMap,anchor:marker,shouldFocus:false});
    });
    listedMarkers.push(marker);bounds.extend(pos);count++;
  }
  if(GS.listedStatus){
    const total=listedItemsForGoogle().length;
    GS.listedStatus.textContent=missing?`${count} of ${total} filtered holiday places shown; ${missing} location${missing===1?" is":"s are"} still being indexed.`:`${count} filtered holiday place${count===1?"":"s"} shown.`;
  }
  if(fit&&count&&!searchResults.length)googleMap.fitBounds(bounds,60);
}

async function ensureListedIndex(){
  if(listedIndexPromise)return listedIndexPromise;
  drawListedPlaces(false);
  listedIndexPromise=window.HolidayApp?.indexAllPlacesOnce?.()
    ?.then(()=>{drawListedPlaces(true);})
    ?.catch(err=>{console.warn("Listed place indexing failed",err);drawListedPlaces(false);})||Promise.resolve();
  return listedIndexPromise;
}

function renderGoogleResults(){
  GS.results.innerHTML=searchResults.length?searchResults.map((place,idx)=>{
    const item=googlePlaceItem(place),category=place.primaryTypeDisplayName||place.primaryType||"Place";
    return`<article class="search-result">
      <div class="search-result-main"><h3>${esc(item.name)}</h3><p>${esc(item.location)}</p><div class="search-result-category">${esc(category)}</div></div>
      <div class="search-result-actions">
        <select class="search-type-select" data-search-type-index="${idx}" aria-label="Itinerary type for ${esc(item.name)}">
          ${["Attraction","Hotel","Lunch","Dinner"].map(t=>`<option ${t===item.type?"selected":""}>${t}</option>`).join("")}
        </select>
        <button class="btn add-search-result" type="button" data-search-add="${idx}">Add</button>
        ${item.website1?`<a class="btn" target="_blank" rel="noopener" href="${esc(item.website1)}">Website</a>`:""}
        <a class="btn secondary" target="_blank" rel="noopener" href="${esc(mapsForGooglePlace(place,item))}">Google Maps</a>
      </div>
    </article>`;
  }).join(""):'<div class="search-empty">Use Google search above to find extra restaurants, attractions, hotels, beaches, shops or other places.</div>';
}

function drawSearchResults(fit=true){
  if(!googleMap||!AdvancedMarkerElement||!PinElement)return;
  clearMarkerArray(resultMarkers);
  if(!searchResults.length){drawListedPlaces(false);return;}
  const bounds=new LatLngBounds();let count=0;
  for(let idx=0;idx<searchResults.length;idx++){
    const place=searchResults[idx];if(!place.location)continue;
    const selectedType=GS.results.querySelector(`[data-search-type-index="${idx}"]`)?.value||inferGoogleType(place);
    const item=googlePlaceItem(place,selectedType);
    const marker=new AdvancedMarkerElement({map:googleMap,position:place.location,title:item.name,content:resultPin(item.type)});
    marker.addListener("gmp-click",()=>{
      googleInfoWindow.setContent(`<div class="google-popup"><strong>${esc(item.name)}</strong><br><span>${esc(item.location)}</span></div>`);
      googleInfoWindow.open({map:googleMap,anchor:marker,shouldFocus:false});
    });
    resultMarkers.push(marker);bounds.extend(place.location);count++;
  }
  if(fit&&count===1){
    const p=searchResults.find(x=>x.location);
    if(p?.viewport)googleMap.fitBounds(p.viewport);else{googleMap.setCenter(p.location);googleMap.setZoom(15);}
  }else if(fit&&count>1){googleMap.fitBounds(bounds,60);}
}

async function initGoogleMapTab(){
  const key=storedGoogleKey();
  GS.keySetup.hidden=!!key;GS.controls.hidden=!key;
  if(!key){GS.status.textContent="Add your restricted Google Maps browser key once on this device to enable Google Maps and Places.";return;}
  try{
    GS.status.textContent="Loading Google Maps…";
    await loadGoogleMapsApi();
    const [{Map,InfoWindow},{Place,PlaceAutocompleteElement},{AdvancedMarkerElement:AME,PinElement:PE},{LatLngBounds:LLB}]=await Promise.all([
      google.maps.importLibrary("maps"),google.maps.importLibrary("places"),google.maps.importLibrary("marker"),google.maps.importLibrary("core")
    ]);
    GooglePlace=Place;AdvancedMarkerElement=AME;PinElement=PE;LatLngBounds=LLB;
    if(!googleMap){
      const c=activeCenter();
      googleMap=new Map(GS.map,{center:{lat:c.lat,lng:c.lng},zoom:c.zoom,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,mapId:"DEMO_MAP_ID"});
      googleInfoWindow=new InfoWindow();
    }
    if(!placeAutocomplete){
      placeAutocomplete=new PlaceAutocompleteElement({includedRegionCodes:["ie"]});
      placeAutocomplete.placeholder="Find a specific place…";
      placeAutocomplete.locationRestriction=activeBounds();
      GS.autocompleteHost.replaceChildren(placeAutocomplete);
      placeAutocomplete.addEventListener("gmp-select",async({placePrediction})=>{
        try{
          GS.status.textContent="Loading place…";
          const place=placePrediction.toPlace();
          await place.fetchFields({fields:["id","displayName","formattedAddress","shortFormattedAddress","location","viewport","websiteURI","googleMapsURI","primaryType","primaryTypeDisplayName","types"]});
          searchResults=[place];renderGoogleResults();drawSearchResults(true);
          GS.status.textContent="1 Google place selected. The normal holiday pins remain on the map.";
        }catch(err){console.error(err);GS.status.textContent="That place could not be loaded: "+(err?.message||err);}
      });
    }
    drawListedPlaces(false);ensureListedIndex();
    GS.status.textContent="Google Maps ready. Search for extra places; your existing holiday places are shown as coloured pins.";
  }catch(err){
    console.error(err);
    GS.status.textContent="Google Maps could not load: "+(err?.message||err)+". Check Maps JavaScript API, Places API and Places API (New) are all allowed for this key.";
  }
}

async function runGoogleTextSearch(){
  if(!GooglePlace){await initGoogleMapTab();if(!GooglePlace)return;}
  const raw=(GS.textInput?.value||"").trim();
  if(!raw){GS.status.textContent="Type something to search for first.";return;}
  GS.button.disabled=true;GS.status.textContent="Searching Google Places…";
  try{
    const request={
      textQuery:raw,
      fields:["id","displayName","formattedAddress","shortFormattedAddress","location","viewport","websiteURI","googleMapsURI","primaryType","primaryTypeDisplayName","types"],
      locationRestriction:activeBounds(),language:"en",region:"ie",maxResultCount:12
    };
    const response=await GooglePlace.searchByText(request);
    searchResults=response.places||[];
    renderGoogleResults();drawSearchResults(true);
    GS.status.textContent=searchResults.length?`${searchResults.length} Google Places result${searchResults.length===1?"":"s"} found. Purple pins are search results; coloured pins are your holiday list.`:"No matching places found in the selected location.";
  }catch(err){
    console.error("Google Place.searchByText failed",err);
    const msg=err?.message||String(err);
    GS.status.textContent=`Google Places search failed: ${msg}. Make sure Maps JavaScript API, Places API and Places API (New) are all enabled and allowed for the key.`;
  }finally{GS.button.disabled=false;}
}

function refreshGoogleForFilters(){
  if(!googleMap)return;
  const c=activeCenter();
  if(placeAutocomplete)placeAutocomplete.locationRestriction=activeBounds();
  drawListedPlaces(true);
  if(!listedMarkers.length&&!searchResults.length){googleMap.setCenter({lat:c.lat,lng:c.lng});googleMap.setZoom(c.zoom);}
}

GS.keySave?.addEventListener("click",()=>{
  const key=(GS.keyInput?.value||"").trim();
  if(!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)){GS.status.textContent="That does not look like a Google Maps API key.";return;}
  setGoogleKey(key);GS.keyInput.value="";GS.keySetup.hidden=true;GS.controls.hidden=false;initGoogleMapTab();
});
GS.keyInput?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();GS.keySave.click();}});
GS.keyForget?.addEventListener("click",forgetGoogleKey);
GS.button?.addEventListener("click",runGoogleTextSearch);
GS.textInput?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();runGoogleTextSearch();}});
GS.results?.addEventListener("change",e=>{if(e.target.matches("[data-search-type-index]"))drawSearchResults(false);});
GS.results?.addEventListener("click",e=>{
  const b=e.target.closest("[data-search-add]");if(!b)return;
  const idx=Number(b.dataset.searchAdd),place=searchResults[idx];if(!place)return;
  const type=GS.results.querySelector(`[data-search-type-index="${idx}"]`)?.value||inferGoogleType(place);
  window.HolidayItinerary?.openItem(googlePlaceItem(place,type));
});

document.getElementById("area")?.addEventListener("change",()=>setTimeout(refreshGoogleForFilters,0));
document.getElementById("search")?.addEventListener("input",()=>setTimeout(refreshGoogleForFilters,0));
document.getElementById("types")?.addEventListener("click",()=>setTimeout(refreshGoogleForFilters,0));
document.addEventListener("holidayapp:gps-updated",()=>refreshGoogleForFilters());
document.addEventListener("holidayapp:search-opened",()=>{
  initGoogleMapTab().then(()=>{
    if(googleMap){google.maps.event.trigger(googleMap,"resize");setTimeout(()=>{drawListedPlaces(true);ensureListedIndex();},80);}
  });
});

renderGoogleResults();
initGoogleMapTab();
