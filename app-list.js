function render(){
 const r=rows();
 E.count.textContent=`${r.length} of ${ITEMS.length} places`;
 E.cards.innerHTML=r.length?r.map(i=>{
  const d=dist(i);
  return `<article class="card" data-type="${esc(i.type)}"><div class="accent"></div><div class="card-body">
  <h2>${esc(i.name)}</h2><div class="badges"><span class="badge">${esc(i.type)}</span><span class="badge">${esc(i.area)}</span></div>
  <p class="desc">${esc(i.description)}</p>
  <p class="meta">${i.visitTime?`<strong>Visit:</strong> ${esc(i.visitTime)}<br>`:""}<strong>Location:</strong> ${esc(i.location)}${d?`<br><span class="distance">${esc(d)}</span>`:""}</p>
  <div class="actions"><a class="btn primary" target="_blank" rel="noopener" href="${esc(maps(i))}">Google Maps</a>
  <a class="btn secondary" target="_blank" rel="noopener" href="${esc(directions(i))}">Directions</a>
  ${i.website1?`<a class="btn" target="_blank" rel="noopener" href="${esc(i.website1)}">Website</a>`:""}
  ${i.website2?`<a class="btn" target="_blank" rel="noopener" href="${esc(i.website2)}">More info</a>`:""}</div></div></article>`;
 }).join(""):'<div class="card"><div class="card-body">No matching places.</div></div>';
}
