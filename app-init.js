function refresh(){
 render();
 if(state.view==="map"){initMap();setTimeout(()=>map.invalidateSize(),50);geocode()}
}
function gps(){
 if(!navigator.geolocation){E.gpsStatus.textContent="GPS not supported by this browser.";return}
 E.gpsBtn.disabled=true;E.gpsStatus.textContent="Requesting location permission…";
 navigator.geolocation.getCurrentPosition(p=>{
  state.gps={lat:p.coords.latitude,lng:p.coords.longitude};
  E.gpsStatus.textContent="Location enabled — distances are straight-line estimates.";
  E.gpsBtn.textContent="Location enabled";
  render();if(map)redraw();
 },()=>{
  E.gpsBtn.disabled=false;
  E.gpsStatus.textContent="Location permission was blocked. Check browser/site Location permissions.";
 },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
E.search.addEventListener("input",e=>{state.search=e.target.value;refresh()});
E.area.addEventListener("change",e=>{state.area=e.target.value;refresh()});
E.types.addEventListener("click",e=>{
 const b=e.target.closest("[data-type]");if(!b)return;
 state.type=b.dataset.type;
 document.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("active",x===b));
 refresh();
});
E.listBtn.addEventListener("click",()=>{
 state.view="list";E.listView.classList.remove("hidden");E.mapView.classList.remove("active");E.listBtn.classList.add("active");E.mapBtn.classList.remove("active");
});
E.mapBtn.addEventListener("click",()=>{
 state.view="map";E.listView.classList.add("hidden");E.mapView.classList.add("active");E.mapBtn.classList.add("active");E.listBtn.classList.remove("active");refresh();
});
E.gpsBtn.addEventListener("click",gps);
E.clearBtn.addEventListener("click",()=>{
 state.type="All";state.area="All";state.search="";E.search.value="";E.area.value="All";
 document.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("active",x.dataset.type==="All"));refresh();
});
refresh();
