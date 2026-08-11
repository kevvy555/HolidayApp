const ITEMS=window.HOLIDAY_ITEMS;
const state={type:"All",area:"All",search:"",view:"list",gps:null};
const cache=JSON.parse(localStorage.getItem("holidayapp_coords_v1")||"{}");
let map,layer,myMarker,busy=false,generation=0;
const $=id=>document.getElementById(id);
const E={search:$("search"),area:$("area"),types:$("types"),listBtn:$("listBtn"),mapBtn:$("mapBtn"),gpsBtn:$("gpsBtn"),gpsStatus:$("gpsStatus"),clearBtn:$("clearBtn"),count:$("count"),cards:$("cards"),listView:$("listView"),mapView:$("mapView"),mapStatus:$("mapStatus")};
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const key=i=>i.name+"|"+i.location;
function rows(){
 const q=state.search.trim().toLowerCase();
 return ITEMS.filter(i=>(state.type==="All"||i.type===state.type)&&(state.area==="All"||i.area===state.area)&&(!q||[i.name,i.location,i.area,i.type,i.description].join(" ").toLowerCase().includes(q)));
}
const maps=i=>"https://www.google.com/maps?q="+encodeURIComponent(i.location);
const directions=i=>"https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(i.location)+"&travelmode=driving";
function km(a,b){
 const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),q=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;
 return 2*R*Math.asin(Math.sqrt(q));
}
function dist(i){
 if(!state.gps)return"";
 const c=cache[key(i)];
 if(!c)return"Distance pending map location";
 const m=km(state.gps,c)*.621371;
 return(m<10?m.toFixed(1):Math.round(m))+" miles away";
}
