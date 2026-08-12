const HOLIDAY_DAYS=[
 {date:"2026-08-15",day:"Sat",label:"Sat 15 Aug"},{date:"2026-08-16",day:"Sun",label:"Sun 16 Aug"},
 {date:"2026-08-17",day:"Mon",label:"Mon 17 Aug"},{date:"2026-08-18",day:"Tue",label:"Tue 18 Aug"},
 {date:"2026-08-19",day:"Wed",label:"Wed 19 Aug"},{date:"2026-08-20",day:"Thu",label:"Thu 20 Aug"},
 {date:"2026-08-21",day:"Fri",label:"Fri 21 Aug"},{date:"2026-08-22",day:"Sat",label:"Sat 22 Aug"},
 {date:"2026-08-23",day:"Sun",label:"Sun 23 Aug"},{date:"2026-08-24",day:"Mon",label:"Mon 24 Aug"}
];
const ITINERARY_SECTIONS=["Anytime","Morning","Lunch","Afternoon","Evening"];
const I={
 day:$("itineraryDay"),area:$("itineraryArea"),sections:$("itinerarySections"),empty:$("itineraryEmpty"),
 saveStatus:$("itinerarySaveStatus"),exportBtn:$("exportItineraryBtn"),importBtn:$("importItineraryBtn"),importFile:$("importItineraryFile"),
 modal:$("addModal"),modalItem:$("addModalItem"),dayButtons:$("addDayButtons"),closeModal:$("closeAddModal"),sectionFilters:$("sectionFilters")
};
let entries=loadEntries(),pendingItem=null;
const visibleSections=new Set(ITINERARY_SECTIONS);

function uid(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():"it-"+Date.now()+"-"+Math.random().toString(36).slice(2)}
function loadEntries(){try{const s=JSON.parse(localStorage.getItem(ITINERARY_STORAGE_KEY)||"{}");return Array.isArray(s.entries)?s.entries:[]}catch{return[]}}
function saveEntries(){
 localStorage.setItem(ITINERARY_STORAGE_KEY,JSON.stringify({version:2,holiday:"Ireland 2026",entries}));
 I.saveStatus.textContent="Saved on this device";
 render();renderItinerary();
}
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
function findItem(k,entry=null){
 return ITEMS.find(i=>itemKey(i)===k)||(entry&&entry.itemSnapshot?entry.itemSnapshot:null);
}
function snapshotFor(item){
 return{
  name:item.name,location:item.location,area:item.area||"Other",type:item.type||"Attraction",
  visitTime:item.visitTime||"",description:item.description||"",website1:item.website1||"",website2:item.website2||"",
  lat:Number.isFinite(Number(item.lat))?Number(item.lat):undefined,
  lng:Number.isFinite(Number(item.lng))?Number(item.lng):undefined,
  source:item.source||"Search"
 };
}
function defaultSection(type){if(type==="Hotel"||type==="Dinner")return"Evening";if(type==="Lunch")return"Lunch";return"Anytime"}
function setupDays(){I.day.innerHTML=HOLIDAY_DAYS.map(d=>`<option value="${d.date}">${d.label}</option>`).join("");if(!I.day.value)I.day.value=HOLIDAY_DAYS[0].date}
function openModal(item){
 pendingItem=item;I.modalItem.textContent=`${item.name} · ${item.area||"Other"} · ${item.type||"Attraction"}`;
 I.dayButtons.innerHTML=HOLIDAY_DAYS.map(d=>{const already=entries.some(e=>e.date===d.date&&e.itemKey===itemKey(item));return`<button type="button" class="day-choice${already?" added":""}" data-itinerary-date="${d.date}" ${already?"disabled":""}>${d.day}<small>${d.label.replace(d.day+" ","")}${already?" · Added":""}</small></button>`}).join("");
 I.modal.hidden=false;document.body.classList.add("modal-open");
}
function closeModal(){I.modal.hidden=true;document.body.classList.remove("modal-open");pendingItem=null}
function addPending(date){
 if(!pendingItem)return;
 const k=itemKey(pendingItem);
 if(entries.some(e=>e.date===date&&e.itemKey===k)){closeModal();return}
 const section=defaultSection(pendingItem.type),peers=entries.filter(e=>e.date===date&&e.section===section);
 const isBuiltIn=ITEMS.some(i=>itemKey(i)===k);
 const entry={id:uid(),itemKey:k,date,section,order:peers.length};
 if(!isBuiltIn)entry.itemSnapshot=snapshotFor(pendingItem);
 entries.push(entry);
 I.day.value=date;closeModal();saveEntries();
}
function visibleEntries(){
 const date=I.day.value,area=I.area.value;
 return entries.filter(e=>e.date===date).filter(e=>{const item=findItem(e.itemKey,e);return item&&(area==="All"||item.area===area)});
}
function itemHtml(entry){
 const item=findItem(entry.itemKey,entry);if(!item)return"";
 return`<div class="it-item" data-entry-id="${esc(entry.id)}">
  <button class="it-drag" type="button" aria-label="Drag to reorder">☰</button>
  <div class="it-main"><div class="it-name">${esc(item.name)}</div><div class="it-meta">${esc(item.type)} · ${esc(item.area)} · <a target="_blank" rel="noopener" href="${esc(maps(item))}">Map</a></div></div>
  <div class="it-actions"><button class="it-order-btn" data-it-move="up" type="button" aria-label="Move up">↑</button><button class="it-order-btn" data-it-move="down" type="button" aria-label="Move down">↓</button><button class="it-delete" data-it-delete="${esc(entry.id)}" type="button" aria-label="Remove">×</button></div>
 </div>`;
}
function renderItinerary(){
 const visible=visibleEntries();I.empty.style.display=visible.length?"none":"block";
 ITINERARY_SECTIONS.forEach(section=>{
  const wrapper=I.sections.querySelector(`[data-day-section="${section}"]`),container=I.sections.querySelector(`[data-section="${section}"]`);
  wrapper.classList.toggle("section-hidden",!visibleSections.has(section));
  const sectionEntries=visible.filter(e=>e.section===section).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
  container.innerHTML=sectionEntries.map(itemHtml).join("");
 });
 initSortables();
}
function normalize(date){
 ITINERARY_SECTIONS.forEach(section=>entries.filter(e=>e.date===date&&e.section===section).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)).forEach((e,i)=>e.order=i));
}
function handleDrop(evt){
 const id=evt.item.dataset.entryId,entry=entries.find(e=>e.id===id);if(!entry)return;
 const newSection=evt.to.dataset.section;entry.section=newSection;
 [...evt.to.querySelectorAll(".it-item")].forEach((node,index)=>{const e=entries.find(x=>x.id===node.dataset.entryId);if(e){e.section=newSection;e.order=index}});
 normalize(I.day.value);saveEntries();
}
function initSortables(){
 if(!window.Sortable)return;
 document.querySelectorAll(".itinerary-list").forEach(c=>{
  if(c._sortable)return;
  c._sortable=Sortable.create(c,{group:"holiday-itinerary",animation:150,handle:".it-drag",ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",onEnd:handleDrop});
 });
}
function moveEntry(id,dir){
 const e=entries.find(x=>x.id===id);if(!e)return;
 const peers=entries.filter(x=>x.date===e.date&&x.section===e.section).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
 const idx=peers.findIndex(x=>x.id===id),target=dir==="up"?idx-1:idx+1;if(target<0||target>=peers.length)return;
 const temp=peers[idx].order;peers[idx].order=peers[target].order;peers[target].order=temp;normalize(e.date);saveEntries();
}
function removeEntry(id){entries=entries.filter(e=>e.id!==id);saveEntries()}
function exportItinerary(){
 const blob=new Blob([JSON.stringify({version:2,holiday:"Ireland 2026",entries},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Ireland_2026_Itinerary.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importItinerary(file){
 try{
  const data=JSON.parse(await file.text());if(!Array.isArray(data.entries))throw new Error("Invalid itinerary file");
  entries=data.entries.filter(e=>e&&e.id&&e.itemKey&&e.date&&ITINERARY_SECTIONS.includes(e.section));
  saveEntries();I.saveStatus.textContent="Imported and saved";
 }catch{alert("That file is not a valid HolidayApp itinerary export.")}
 finally{I.importFile.value=""}
}

document.addEventListener("click",e=>{
 const add=e.target.closest("[data-add-itinerary]");
 if(add){const item=findItem(add.dataset.addItinerary);if(item)openModal(item);return}
 const day=e.target.closest("[data-itinerary-date]");if(day){addPending(day.dataset.itineraryDate);return}
 const del=e.target.closest("[data-it-delete]");if(del){removeEntry(del.dataset.itDelete);return}
 const move=e.target.closest("[data-it-move]");if(move){moveEntry(move.closest(".it-item").dataset.entryId,move.dataset.itMove);return}
 const filter=e.target.closest("[data-section-filter]");if(filter){
  const section=filter.dataset.sectionFilter;
  if(visibleSections.has(section))visibleSections.delete(section);else visibleSections.add(section);
  filter.classList.toggle("active",visibleSections.has(section));renderItinerary();
 }
});
I.closeModal.addEventListener("click",closeModal);
I.modal.addEventListener("click",e=>{if(e.target===I.modal)closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!I.modal.hidden)closeModal()});
I.day.addEventListener("change",renderItinerary);I.area.addEventListener("change",renderItinerary);
I.exportBtn.addEventListener("click",exportItinerary);I.importBtn.addEventListener("click",()=>I.importFile.click());
I.importFile.addEventListener("change",()=>{const f=I.importFile.files?.[0];if(f)importItinerary(f)});
document.addEventListener("holidayapp:itinerary-opened",renderItinerary);

window.HolidayItinerary={
 openItem(item){openModal(item)},
 entries(){return entries.slice()},
 render:renderItinerary,
 addItemToDay(item,date){pendingItem=item;addPending(date)}
};

setupDays();renderItinerary();
