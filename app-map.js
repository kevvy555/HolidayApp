function initMap(){
 if(map)return;
 map=L.map("map").setView([53.2,-8],7);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 layer=L.layerGroup().addTo(map);
}
function icon(type,s){
 return L.divIcon({className:"",html:`<div class="pin ${type.toLowerCase()}"><span>${s}</span></div>`,iconSize:[24,24],iconAnchor:[12,24],popupAnchor:[0,-24]});
}
const syms={Attraction:"★",Hotel:"H",Lunch:"L",Dinner:"D"};
function popup(i){
 return `<div class="popup-title">${esc(i.name)}</div><div class="popup-meta">${esc(i.type)} · ${esc(i.area)}</div><div>${esc(i.description)}</div>
 <div class="popup-actions"><a target="_blank" rel="noopener" href="${esc(maps(i))}">Google Maps</a>
 <a target="_blank" rel="noopener" href="${esc(directions(i))}">Directions</a></div>`;
}
function redraw(){
 if(!map)return;
 layer.clearLayers();
 const pts=[];
 for(const i of rows()){
  const c=cache[key(i)];
  if(!c)continue;
  L.marker([c.lat,c.lng],{icon:icon(i.type,syms[i.type]||"•"),title:i.name}).bindPopup(popup(i)).addTo(layer);
  pts.push([c.lat,c.lng]);
 }
 if(state.gps){
  if(myMarker)myMarker.remove();
  myMarker=L.marker([state.gps.lat,state.gps.lng],{icon:icon("me","●"),title:"You are here"}).bindPopup("You are here").addTo(map);
  pts.push([state.gps.lat,state.gps.lng]);
 }
 if(pts.length)map.fitBounds(pts,{padding:[25,25],maxZoom:14});
}
