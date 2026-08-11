const ITINERARY_STORAGE_KEY = "holidayapp_itinerary_v1";
const HOLIDAY_DAYS = [
  { date: "2026-08-15", day: "Sat", label: "Sat 15 Aug" },
  { date: "2026-08-16", day: "Sun", label: "Sun 16 Aug" },
  { date: "2026-08-17", day: "Mon", label: "Mon 17 Aug" },
  { date: "2026-08-18", day: "Tue", label: "Tue 18 Aug" },
  { date: "2026-08-19", day: "Wed", label: "Wed 19 Aug" },
  { date: "2026-08-20", day: "Thu", label: "Thu 20 Aug" },
  { date: "2026-08-21", day: "Fri", label: "Fri 21 Aug" },
  { date: "2026-08-22", day: "Sat", label: "Sat 22 Aug" },
  { date: "2026-08-23", day: "Sun", label: "Sun 23 Aug" },
  { date: "2026-08-24", day: "Mon", label: "Mon 24 Aug" }
];
const ITINERARY_SECTIONS = ["Anytime", "Morning", "Lunch", "Afternoon", "Evening"];

const itineraryEls = {
  view: document.getElementById("itineraryView"),
  btn: document.getElementById("itineraryBtn"),
  browseSummary: document.getElementById("browseSummary"),
  day: document.getElementById("itineraryDay"),
  area: document.getElementById("itineraryArea"),
  sections: document.getElementById("itinerarySections"),
  empty: document.getElementById("itineraryEmpty"),
  saveStatus: document.getElementById("itinerarySaveStatus"),
  exportBtn: document.getElementById("exportItineraryBtn"),
  importBtn: document.getElementById("importItineraryBtn"),
  importFile: document.getElementById("importItineraryFile"),
  modal: document.getElementById("addModal"),
  modalItem: document.getElementById("addModalItem"),
  dayButtons: document.getElementById("addDayButtons"),
  closeModal: document.getElementById("closeAddModal")
};

let itineraryEntries = loadItineraryEntries();
let itineraryPendingItem = null;

function itineraryUid() {
  return window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : "it-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function loadItineraryEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(ITINERARY_STORAGE_KEY) || "{}");
    return Array.isArray(saved.entries) ? saved.entries : [];
  } catch {
    return [];
  }
}

function saveItineraryEntries() {
  localStorage.setItem(ITINERARY_STORAGE_KEY, JSON.stringify({
    version: 1,
    holiday: "Ireland 2026",
    entries: itineraryEntries
  }));
  itineraryEls.saveStatus.textContent = "Saved on this device";
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

function itineraryItemKey(item) {
  return item.name + "|" + item.location;
}

function itineraryItemByKey(key) {
  return ITEMS.find(item => itineraryItemKey(item) === key);
}

function defaultItinerarySection(type) {
  if (type === "Hotel" || type === "Dinner") return "Evening";
  if (type === "Lunch") return "Lunch";
  return "Anytime";
}

function setupItineraryDays() {
  itineraryEls.day.innerHTML = HOLIDAY_DAYS
    .map(d => `<option value="${d.date}">${d.label}</option>`)
    .join("");
  itineraryEls.day.value = HOLIDAY_DAYS[0].date;
}

function enhanceListCards() {
  document.querySelectorAll("#cards .card").forEach(card => {
    if (card.querySelector("[data-add-itinerary]")) return;
    const name = card.querySelector("h2")?.textContent?.trim();
    const item = ITEMS.find(i => i.name === name);
    const actions = card.querySelector(".actions");
    if (!item || !actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn add-itinerary-btn";
    button.textContent = "Add";
    button.dataset.addItinerary = itineraryItemKey(item);
    actions.appendChild(button);
  });
}

const cardObserver = new MutationObserver(enhanceListCards);
cardObserver.observe(document.getElementById("cards"), { childList: true, subtree: true });
enhanceListCards();

function openItineraryModal(item) {
  itineraryPendingItem = item;
  itineraryEls.modalItem.textContent = `${item.name} · ${item.area} · ${item.type}`;
  itineraryEls.dayButtons.innerHTML = HOLIDAY_DAYS.map(d => {
    const already = itineraryEntries.some(entry =>
      entry.date === d.date && entry.itemKey === itineraryItemKey(item)
    );
    return `<button type="button" class="day-choice${already ? " added" : ""}"
      data-itinerary-date="${d.date}" ${already ? "disabled" : ""}>
      ${d.day}<small>${d.label.replace(d.day + " ", "")}${already ? " · Added" : ""}</small>
    </button>`;
  }).join("");
  itineraryEls.modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeItineraryModal() {
  itineraryEls.modal.hidden = true;
  document.body.classList.remove("modal-open");
  itineraryPendingItem = null;
}

function addPendingItemToDay(date) {
  if (!itineraryPendingItem) return;
  const key = itineraryItemKey(itineraryPendingItem);
  if (itineraryEntries.some(entry => entry.date === date && entry.itemKey === key)) {
    closeItineraryModal();
    return;
  }
  const section = defaultItinerarySection(itineraryPendingItem.type);
  const sectionEntries = itineraryEntries.filter(e => e.date === date && e.section === section);
  const order = sectionEntries.length
    ? Math.max(...sectionEntries.map(e => Number(e.order) || 0)) + 1
    : 0;
  itineraryEntries.push({
    id: itineraryUid(),
    itemKey: key,
    date,
    section,
    order
  });
  saveItineraryEntries();
  itineraryEls.day.value = date;
  closeItineraryModal();
  renderItinerary();
}

function itineraryVisibleEntries() {
  const selectedDay = itineraryEls.day.value;
  const selectedArea = itineraryEls.area.value;
  return itineraryEntries.filter(entry => {
    if (entry.date !== selectedDay) return false;
    const item = itineraryItemByKey(entry.itemKey);
    return item && (selectedArea === "All" || item.area === selectedArea);
  });
}

function itineraryCardHtml(entry) {
  const item = itineraryItemByKey(entry.itemKey);
  if (!item) return "";
  return `<div class="it-item" data-entry-id="${esc(entry.id)}">
    <button class="it-drag" type="button" aria-label="Drag to reorder">☰</button>
    <div class="it-main">
      <div class="it-name">${esc(item.name)}</div>
      <div class="it-meta">${esc(item.type)} · ${esc(item.area)} ·
        <a target="_blank" rel="noopener" href="${esc(maps(item))}">Map</a>
      </div>
    </div>
    <div class="it-actions">
      <button class="it-order-btn" data-it-move="up" type="button" aria-label="Move up">↑</button>
      <button class="it-order-btn" data-it-move="down" type="button" aria-label="Move down">↓</button>
      <button class="it-delete" data-it-delete="${esc(entry.id)}" type="button" aria-label="Remove">×</button>
    </div>
  </div>`;
}

function renderItinerary() {
  const visible = itineraryVisibleEntries();
  itineraryEls.empty.style.display = visible.length ? "none" : "block";
  ITINERARY_SECTIONS.forEach(section => {
    const container = itineraryEls.sections.querySelector(`[data-section="${section}"]`);
    const entries = visible
      .filter(entry => entry.section === section)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    container.innerHTML = entries.map(itineraryCardHtml).join("");
  });
  initItinerarySortables();
}

function normalizeItineraryOrders(date) {
  ITINERARY_SECTIONS.forEach(section => {
    itineraryEntries
      .filter(entry => entry.date === date && entry.section === section)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .forEach((entry, index) => { entry.order = index; });
  });
}

function handleItineraryDrop(evt) {
  const id = evt.item.dataset.entryId;
  const entry = itineraryEntries.find(e => e.id === id);
  if (!entry) return;
  const newSection = evt.to.dataset.section;
  entry.section = newSection;
  [...evt.to.querySelectorAll(".it-item")].forEach((node, index) => {
    const moved = itineraryEntries.find(e => e.id === node.dataset.entryId);
    if (moved) {
      moved.section = newSection;
      moved.order = index;
    }
  });
  normalizeItineraryOrders(itineraryEls.day.value);
  saveItineraryEntries();
  renderItinerary();
}

function initItinerarySortables() {
  if (!window.Sortable) return;
  document.querySelectorAll(".itinerary-list").forEach(container => {
    if (container._itinerarySortable) return;
    container._itinerarySortable = Sortable.create(container, {
      group: "holiday-itinerary",
      animation: 150,
      handle: ".it-drag",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd: handleItineraryDrop
    });
  });
}

function moveItineraryEntry(id, direction) {
  const entry = itineraryEntries.find(e => e.id === id);
  if (!entry) return;
  const peers = itineraryEntries
    .filter(e => e.date === entry.date && e.section === entry.section)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const index = peers.findIndex(e => e.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= peers.length) return;
  const temp = peers[index].order;
  peers[index].order = peers[targetIndex].order;
  peers[targetIndex].order = temp;
  normalizeItineraryOrders(entry.date);
  saveItineraryEntries();
  renderItinerary();
}

function removeItineraryEntry(id) {
  itineraryEntries = itineraryEntries.filter(entry => entry.id !== id);
  saveItineraryEntries();
  renderItinerary();
}

function exportItinerary() {
  const payload = {
    version: 1,
    holiday: "Ireland 2026",
    days: HOLIDAY_DAYS,
    entries: itineraryEntries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Ireland-Holiday-Itinerary-2026.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importItinerary(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || !Array.isArray(payload.entries)) throw new Error("invalid");
    const accepted = payload.entries.filter(entry =>
      entry && entry.id && entry.itemKey && entry.date &&
      ITINERARY_SECTIONS.includes(entry.section)
    );
    if (!confirm(`Replace this device's itinerary with ${accepted.length} imported item${accepted.length === 1 ? "" : "s"}?`)) {
      return;
    }
    itineraryEntries = accepted;
    saveItineraryEntries();
    renderItinerary();
  } catch {
    alert("That file is not a valid HolidayApp itinerary JSON file.");
  } finally {
    itineraryEls.importFile.value = "";
  }
}

function showItineraryView() {
  state.view = "itinerary";
  generation++;
  document.body.classList.add("itinerary-mode");
  E.listView.classList.add("hidden");
  E.mapView.classList.remove("active");
  itineraryEls.view.classList.add("active");
  itineraryEls.browseSummary.style.display = "none";
  E.listBtn.classList.remove("active");
  E.mapBtn.classList.remove("active");
  itineraryEls.btn.classList.add("active");
  renderItinerary();
}

function leaveItineraryView() {
  document.body.classList.remove("itinerary-mode");
  itineraryEls.view.classList.remove("active");
  itineraryEls.browseSummary.style.display = "block";
  itineraryEls.btn.classList.remove("active");
}

document.getElementById("cards").addEventListener("click", event => {
  const button = event.target.closest("[data-add-itinerary]");
  if (!button) return;
  const item = itineraryItemByKey(button.dataset.addItinerary);
  if (item) openItineraryModal(item);
});
itineraryEls.btn.addEventListener("click", showItineraryView);
E.listBtn.addEventListener("click", leaveItineraryView);
E.mapBtn.addEventListener("click", leaveItineraryView);
itineraryEls.day.addEventListener("change", renderItinerary);
itineraryEls.area.addEventListener("change", renderItinerary);
itineraryEls.closeModal.addEventListener("click", closeItineraryModal);
itineraryEls.modal.addEventListener("click", event => {
  if (event.target === itineraryEls.modal) closeItineraryModal();
});
itineraryEls.dayButtons.addEventListener("click", event => {
  const button = event.target.closest("[data-itinerary-date]");
  if (button && !button.disabled) addPendingItemToDay(button.dataset.itineraryDate);
});
itineraryEls.sections.addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-it-delete]");
  if (deleteButton) {
    removeItineraryEntry(deleteButton.dataset.itDelete);
    return;
  }
  const moveButton = event.target.closest("[data-it-move]");
  if (moveButton) {
    const card = moveButton.closest("[data-entry-id]");
    if (card) moveItineraryEntry(card.dataset.entryId, moveButton.dataset.itMove);
  }
});
itineraryEls.exportBtn.addEventListener("click", exportItinerary);
itineraryEls.importBtn.addEventListener("click", () => itineraryEls.importFile.click());
itineraryEls.importFile.addEventListener("change", () => {
  const file = itineraryEls.importFile.files && itineraryEls.importFile.files[0];
  if (file) importItinerary(file);
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && !itineraryEls.modal.hidden) closeItineraryModal();
});

setupItineraryDays();
renderItinerary();
