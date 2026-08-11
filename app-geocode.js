async function geocode(){
 if(busy){generation++;return}
 busy=true;
 const g=++generation,r=rows(),missing=r.filter(i=>!cache[key(i)]);
 E.mapStatus.textContent=missing.length?`Locating ${missing.length} uncached place${missing.length===1?"":"s"}… cached markers appear immediately.`:`All ${r.length} filtered places are cached.`;
 redraw();
 for(let n=0;n<missing.length;n++){
  if(g!==generation)break;
  const i=missing[n];
  try{
   const url="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ie&q="+encodeURIComponent(i.name+", "+i.location);
   const res=await fetch(url,{headers:{Accept:"application/json"}});
   if(res.ok){
    const d=await res.json();
    if(d[0]){
     cache[key(i)]={lat:+d[0].lat,lng:+d[0].lon};
     localStorage.setItem("holidayapp_coords_v1",JSON.stringify(cache));
     redraw();render();
    }
   }
  }catch(e){console.warn("Geocode failed",i.name,e)}
  E.mapStatus.textContent=`Locating places… ${Math.min(n+1,missing.length)} / ${missing.length} checked.`;
  await new Promise(x=>setTimeout(x,1050));
 }
 busy=false;
 const left=rows().filter(i=>!cache[key(i)]).length;
 E.mapStatus.textContent=left?`${left} filtered place${left===1?"":"s"} could not be located automatically; the rest are shown.`:`All ${rows().length} filtered places are shown.`;
 redraw();render();
}
