(()=>{
  const DATE="2026-08-22";
  const STORAGE_KEY="holidayapp_itinerary_v1";
  const REVISION_KEY="holidayapp_route_20260822_ring_kerry_v1";
  if(localStorage.getItem(REVISION_KEY)==="done")return;
  if(!window.HolidayItinerary||!Array.isArray(window.HOLIDAY_ITEMS))return;

  const route=[
    {name:"Killarney — Ring of Kerry Start",section:"Morning",attractionTime:"08:30"},
    {name:"Mountain Stage",section:"Morning",attractionTime:"09:15"},
    {name:"Cahersiveen",section:"Morning",attractionTime:"09:45"},
    {name:"Portmagee",section:"Morning",attractionTime:"10:30"},
    {name:"Kerry Cliffs",section:"Morning",attractionTime:"10:45"},
    {name:"The Moorings Hotel & Seafood Restaurant",section:"Lunch"},
    {name:"Coomanaspig Pass",section:"Afternoon",attractionTime:"13:15"},
    {name:"St Finian’s Bay",section:"Afternoon",attractionTime:"13:30"},
    {name:"Ballinskelligs",section:"Afternoon",attractionTime:"13:45"},
    {name:"Waterville",section:"Afternoon",attractionTime:"14:15"},
    {name:"Derrynane Beach",section:"Afternoon",attractionTime:"14:45"},
    {name:"Sneem",section:"Afternoon",attractionTime:"15:45"},
    {name:"The Boathouse Bistro at Dromquinna Manor",section:"Evening",dinnerTime:"17:30"},
    {name:"Kenmare",section:"Evening",attractionTime:"18:00"},
    {name:"The Falls Restaurant at Sheen Falls Lodge",section:"Evening",dinnerTime:"18:00"},
    {name:"Moll’s Gap",section:"Evening",attractionTime:"18:30"},
    {name:"Ladies View",section:"Evening",attractionTime:"18:45"},
    {name:"Killarney — Ring of Kerry Return",section:"Evening",attractionTime:"19:15"}
  ];

  const itemKey=item=>item.name+"|"+item.location;
  const itemsByName=new Map(window.HOLIDAY_ITEMS.map(item=>[item.name,item]));
  const missing=route.filter(step=>!itemsByName.has(step.name));
  if(missing.length){
    console.warn("Saturday Ring of Kerry route not seeded; missing list items:",missing.map(x=>x.name));
    return;
  }

  // Add anything that is not already on Saturday. The itinerary API keeps its
  // in-memory state and localStorage in sync while preserving all existing data.
  for(const step of route){
    const item=itemsByName.get(step.name);
    const key=itemKey(item);
    const already=window.HolidayItinerary.entries().some(entry=>entry.date===DATE&&entry.itemKey===key);
    if(!already)window.HolidayItinerary.addItemToDay(item,DATE);
  }

  const entries=window.HolidayItinerary.entries();
  const routeKeys=new Set();
  const sectionCounters={Morning:0,Lunch:0,Afternoon:0,Evening:0};

  for(const step of route){
    const item=itemsByName.get(step.name);
    const key=itemKey(item);
    routeKeys.add(key);
    const entry=entries.find(e=>e.date===DATE&&e.itemKey===key);
    if(!entry)continue;

    entry.section=step.section;
    entry.order=sectionCounters[step.section]++;

    if(step.attractionTime)entry.attractionTime=step.attractionTime;
    else delete entry.attractionTime;

    if(step.dinnerTime)entry.dinnerTime=step.dinnerTime;
    else if(item.type!=="Dinner")delete entry.dinnerTime;
  }

  // Preserve any other Saturday plans, placing them after this route within
  // their existing section rather than deleting or overwriting them.
  for(const section of ["Morning","Lunch","Afternoon","Evening"]){
    const extras=entries
      .filter(e=>e.date===DATE&&e.section===section&&!routeKeys.has(e.itemKey))
      .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
    let order=sectionCounters[section];
    for(const entry of extras)entry.order=order++;
  }

  localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,holiday:"Ireland 2026",entries}));
  localStorage.setItem(REVISION_KEY,"done");
  window.HolidayItinerary.render();
  document.dispatchEvent(new CustomEvent("holidayapp:itinerary-opened"));
})();
