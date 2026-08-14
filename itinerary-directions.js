(()=>{
  function findItem(entry){
    if(!entry)return null;
    return window.HOLIDAY_ITEMS.find(item=>(item.name+"|"+item.location)===entry.itemKey)||(entry.itemSnapshot||null);
  }

  function decorateItineraryDirections(){
    if(!window.HolidayItinerary||!Array.isArray(window.HOLIDAY_ITEMS))return;
    const entries=window.HolidayItinerary.entries();
    const byId=new Map(entries.map(entry=>[entry.id,entry]));

    document.querySelectorAll(".it-item[data-entry-id]").forEach(node=>{
      const entry=byId.get(node.dataset.entryId);
      const item=findItem(entry);
      if(!item)return;
      const href=typeof directions==="function"?directions(item):"https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(item.location)+"&travelmode=driving";

      const name=node.querySelector(".it-name");
      if(name&&!name.querySelector(".it-name-directions")){
        const text=name.textContent;
        name.textContent="";
        const link=document.createElement("a");
        link.className="it-name-directions";
        link.href=href;
        link.target="_blank";
        link.rel="noopener";
        link.textContent=text;
        link.title="Open driving directions in Google Maps";
        name.appendChild(link);
      }

      const meta=node.querySelector(".it-meta");
      if(meta&&!meta.querySelector(".it-directions-link")){
        const sep=document.createTextNode(" · ");
        const link=document.createElement("a");
        link.className="it-directions-link";
        link.href=href;
        link.target="_blank";
        link.rel="noopener";
        link.textContent="Directions";
        link.title="Drive to this stop in Google Maps";
        meta.append(sep,link);
      }
    });
  }

  function installStyles(){
    if(document.getElementById("itineraryDirectionsStyles"))return;
    const style=document.createElement("style");
    style.id="itineraryDirectionsStyles";
    style.textContent=`
      .it-name-directions{color:inherit;text-decoration:none;border-bottom:1px dotted #8a9690}
      .it-name-directions:hover,.it-name-directions:focus{color:var(--accent);border-bottom-color:var(--accent)}
      .it-directions-link{display:inline-flex;align-items:center;margin-left:2px;padding:3px 7px;border-radius:7px;background:var(--soft);color:var(--accent)!important;font-weight:850;text-decoration:none}
      .it-directions-link:before{content:"↗";margin-right:3px;font-size:.72rem}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  decorateItineraryDirections();
  document.addEventListener("holidayapp:itinerary-opened",decorateItineraryDirections);
  document.addEventListener("holidayapp:custom-places-changed",decorateItineraryDirections);

  const sections=document.getElementById("itinerarySections");
  if(sections){
    new MutationObserver(()=>decorateItineraryDirections()).observe(sections,{childList:true,subtree:true});
  }
})();
