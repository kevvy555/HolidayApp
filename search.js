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

let googleMapsLoadPromise=null;
let searchMap=null,searchInfoWindow=null,searchMarkers=[],searchResults=[],placeAutocomplete=null;
let GooglePlace=null,AdvancedMarkerElement=null,LatLngBounds=null;

const S={
 keySetup:document.getElementById("googleKeySetup"),
 keyInput:document.getElementById("googleApiKeyInput"),
 keySave:document.getElementById("googleApiKeySave"),
 keyForget:document.getElementById("googleApiKeyForget"),
 controls:document.getElementById("googleSearchControls"),
 autocompleteHost:document.getElementById("placeAutocompleteHost"),
 button:document.getElementById("placeSearchBtn"),
 status:document.getElementById("placeSearchStatus"),
 map:document.getElementById("searchMap"),
 results:document.getElementById("placeSearchResults"),
 area:document.getElementById("placeSearchArea")
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
  window[callback]=()=>{
   delete window[callback];
   resolve();
  };
  const script=document.createElement("script");
  script.async=true;
  script.defer=true;
  script.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(key)+
   "&loading=async&v=weekly&libraries=places&language=en&region=IE&auth_referrer_policy=origin&callback="+callback;
  script.onerror=()=>{
   delete window[callback];
   googleMapsLoadPromise=null;
   reject(new Error("Google Maps JavaScript API failed to load"));
  };
  document.head.appendChild(script);
 });
 return googleMapsLoadPromise;
}

function googleArea(){return S.area?.value||"All"}
function currentBounds(){return GOOGLE_AREA_BOUNDS[googleArea()]||GOOGLE_AREA_BOUNDS.All}
function currentCenter(){return GOOGLE_AREA_CENTERS[googleArea()]||GOOGLE_AREA_CENTERS.All}

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
  name:place.displayName||"Place",
  location,
  area:inferGoogleArea(location),
  type:typeOverride||inferGoogleType(place),
  visitTime:"",
  description:`Google Places · ${category}`,
  website1:place.websiteURI||"",
  website2:place.googleMapsURI||"",
  lat,lng,
  source:"Search"
 };
}
function mapsForGooglePlace(place,item){
 return place.googleMapsURI||("https://www.google.com/maps?q="+encodeURIComponent(item.location||item.name));
}

async function initGoogleSearch(){
 const key=storedGoogleKey();
 S.keySetup.hidden=!!key;
 S.controls.hidden=!key;
 if(!key){
  S.status.textContent="Add your restricted Google Maps browser key once on this device to enable Google Places search.";
  return;
 }
 try{
  S.status.textContent="Loading Google Maps…";
  await loadGoogleMapsApi();
  const [{Map,InfoWindow},{Place,PlaceAutocompleteElement},{AdvancedMarkerElement:AME},{LatLngBounds:LLB}]=await Promise.all([
   google.maps.importLibrary("maps"),
   google.maps.importLibrary("places"),
   google.maps.importLibrary("marker"),
   google.maps.importLibrary("core")
  ]);
  GooglePlace=Place;
  AdvancedMarkerElement=AME;
  LatLngBounds=LLB;

  if(!searchMap){
   const c=currentCenter();
   searchMap=new Map(S.map,{
    center:{lat:c.lat,lng:c.lng},
    zoom:c.zoom,
    mapTypeControl:false,
    streetViewControl:false,
    fullscreenControl:true,
    mapId:"DEMO_MAP_ID"
   });
   searchInfoWindow=new InfoWindow();
  }

  if(!placeAutocomplete){
   placeAutocomplete=new PlaceAutocompleteElement({
    includedRegionCodes:["ie"],
    requestedLanguage:"en",
    requestedRegion:"ie"
   });
   placeAutocomplete.placeholder="Search Google Places…";
   placeAutocomplete.locationRestriction=currentBounds();
   S.autocompleteHost.replaceChildren(placeAutocomplete);
   placeAutocomplete.addEventListener("gmp-select",async({placePrediction})=>{
    try{
     S.status.textContent="Loading place…";
     const place=placePrediction.toPlace();
     await place.fetchFields({fields:[
      "id","displayName","formattedAddress","shortFormattedAddress","location","viewport",
      "websiteURI","googleMapsURI","primaryType","primaryTypeDisplayName","types"
     ]});
     searchResults=[place];
     renderGoogleResults();
     drawGoogleResults(true);
     S.status.textContent="1 place selected.";
    }catch(err){
     console.error(err);
     S.status.textContent="That place could not be loaded.";
    }
   });
  }
  S.status.textContent="Google Places ready. Type a specific place or a general search such as ‘vegetarian restaurant’.";
 }catch(err){
  console.error(err);
  S.status.textContent="Google Maps could not load. Check the API key restrictions and enabled APIs, then reload this page.";
 }
}

function clearGoogleMarkers(){
 for(const marker of searchMarkers)marker.map=null;
 searchMarkers=[];
 if(searchInfoWindow)searchInfoWindow.close();
}
function renderGoogleResults(){
 S.results.innerHTML=searchResults.length?searchResults.map((place,idx)=>{
  const item=googlePlaceItem(place);
  const category=place.primaryTypeDisplayName||place.primaryType||"Place";
  const gmaps=mapsForGooglePlace(place,item);
  return`<article class="search-result">
   <div class="search-result-main">
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.location)}</p>
    <div class="search-result-category">${esc(category)}</div>
   </div>
   <div class="search-result-actions">
    <select class="search-type-select" data-search-type-index="${idx}" aria-label="Itinerary type for ${esc(item.name)}">
     ${["Attraction","Hotel","Lunch","Dinner"].map(t=>`<option ${t===item.type?"selected":""}>${t}</option>`).join("")}
    </select>
    <button class="btn add-search-result" type="button" data-search-add="${idx}">Add</button>
    ${item.website1?`<a class="btn" target="_blank" rel="noopener" href="${esc(item.website1)}">Website</a>`:""}
    <a class="btn secondary" target="_blank" rel="noopener" href="${esc(gmaps)}">Google Maps</a>
   </div>
  </article>`;
 }).join(""):'<div class="search-empty">Search for a restaurant, attraction, hotel, beach, shop or any other place in Ireland.</div>';
}
function drawGoogleResults(fit=true){
 if(!searchMap||!AdvancedMarkerElement)return;
 clearGoogleMarkers();
 const bounds=new LatLngBounds();
 let pointCount=0;
 searchResults.forEach((place)=>{
  if(!place.location)return;
  const item=googlePlaceItem(place);
  const marker=new AdvancedMarkerElement({
   map:searchMap,
   position:place.location,
   title:item.name
  });
  marker.addListener("gmp-click",()=>{
   searchInfoWindow.setContent(`<strong>${esc(item.name)}</strong><br>${esc(item.location)}`);
   searchInfoWindow.open({map:searchMap,anchor:marker,shouldFocus:false});
  });
  searchMarkers.push(marker);
  bounds.extend(place.location);
  pointCount++;
 });
 if(fit&&pointCount===1){
  const p=searchResults.find(x=>x.location);
  if(p?.viewport)searchMap.fitBounds(p.viewport);
  else{searchMap.setCenter(p.location);searchMap.setZoom(15)}
 }else if(fit&&pointCount>1){
  searchMap.fitBounds(bounds,60);
 }
}

async function runGoogleTextSearch(){
 if(!GooglePlace){
  await initGoogleSearch();
  if(!GooglePlace)return;
 }
 const raw=(placeAutocomplete?.value||"").trim();
 if(!raw){
  S.status.textContent="Type something to search for first.";
  return;
 }
 S.button.disabled=true;
 S.status.textContent="Searching Google Places…";
 try{
  const request={
   textQuery:raw,
   fields:[
    "id","displayName","formattedAddress","shortFormattedAddress","location","viewport",
    "websiteURI","googleMapsURI","primaryType","primaryTypeDisplayName","types"
   ],
   locationRestriction:currentBounds(),
   language:"en",
   region:"ie",
   maxResultCount:12
  };
  const {places}=await GooglePlace.searchByText(request);
  searchResults=places||[];
  renderGoogleResults();
  drawGoogleResults(true);
  S.status.textContent=searchResults.length?`${searchResults.length} Google Places result${searchResults.length===1?"":"s"} found.`:"No matching places found in the selected area.";
 }catch(err){
  console.error(err);
  S.status.textContent="Google Places search failed. Check the key/API restrictions or try a different search.";
 }finally{
  S.button.disabled=false;
 }
}

function updateGoogleArea(){
 if(!searchMap)return;
 const c=currentCenter();
 searchMap.setCenter({lat:c.lat,lng:c.lng});
 searchMap.setZoom(c.zoom);
 if(placeAutocomplete)placeAutocomplete.locationRestriction=currentBounds();
}
S.keySave?.addEventListener("click",()=>{
 const key=(S.keyInput?.value||"").trim();
 if(!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)){
  S.status.textContent="That does not look like a Google Maps API key.";
  return;
 }
 setGoogleKey(key);
 S.keyInput.value="";
 S.keySetup.hidden=true;
 S.controls.hidden=false;
 initGoogleSearch();
});
S.keyInput?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();S.keySave.click()}});
S.keyForget?.addEventListener("click",forgetGoogleKey);
S.button?.addEventListener("click",runGoogleTextSearch);
S.area?.addEventListener("change",updateGoogleArea);
S.results?.addEventListener("click",e=>{
 const b=e.target.closest("[data-search-add]");
 if(!b)return;
 const idx=Number(b.dataset.searchAdd),place=searchResults[idx];
 if(!place)return;
 const type=S.results.querySelector(`[data-search-type-index="${idx}"]`)?.value||inferGoogleType(place);
 const item=googlePlaceItem(place,type);
 window.HolidayItinerary?.openItem(item);
});
document.addEventListener("holidayapp:search-opened",()=>{
 initGoogleSearch().then(()=>{
  if(searchMap){
   const c=currentCenter();
   google.maps.event.trigger(searchMap,"resize");
   if(!searchResults.length){searchMap.setCenter({lat:c.lat,lng:c.lng});searchMap.setZoom(c.zoom)}
  }
 });
});
renderGoogleResults();
initGoogleSearch();
