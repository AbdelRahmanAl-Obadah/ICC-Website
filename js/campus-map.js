/**
 * campus-map.js
 * -----------------------------------------------------------------------
 * Interactive schematic campus map (campus-map.html).
 * Standalone module: builds pins from BUILDINGS, wires search + zone
 * filters + a results list, and keeps building names in sync with the
 * site's EN/AR language switch via the `icc:languagechange` event.
 * ------------------------------------------------------------------------
 */

const BUILDINGS = [
  // Medical zone
  { id: "med-1", cat: "medical", x: 90, y: 190, en: "Faculty of Medicine", ar: "كلية الطب" },
  { id: "med-2", cat: "medical", x: 130, y: 190, en: "Faculty of Science and Arts", ar: "كلية العلوم والآداب" },
  { id: "med-3", cat: "medical", x: 170, y: 190, en: "Faculty of Nursing", ar: "كلية التمريض" },
  { id: "med-4", cat: "medical", x: 210, y: 190, en: "Faculty of Applied Medical Sciences", ar: "كلية العلوم الطبية التطبيقية" },
  { id: "med-5", cat: "medical", x: 60, y: 230, en: "Faculty of Dentistry", ar: "كلية طب الأسنان" },
  { id: "med-6", cat: "medical", x: 95, y: 230, en: "Dental Clinics", ar: "عيادات الأسنان" },
  { id: "med-7", cat: "medical", x: 220, y: 235, en: "King Abdullah University Hospital", ar: "مستشفى الملك عبدالله الجامعي" },
  { id: "med-8", cat: "medical", x: 260, y: 235, en: "Field Hospital of the North", ar: "مستشفى الميداني الشمالي" },
  { id: "med-9", cat: "medical", x: 260, y: 270, en: "Saudi Radiotherapy Center", ar: "مركز العلاج الإشعاعي السعودي" },
  { id: "med-10", cat: "medical", x: 150, y: 300, en: "Science Hall 1", ar: "قاعة العلوم 1" },
  { id: "med-11", cat: "medical", x: 190, y: 300, en: "Prof. Sa'ad Hijazi Hall", ar: "قاعة الأستاذ سعد حجازي" },
  { id: "med-12", cat: "medical", x: 190, y: 335, en: "Medical Halls", ar: "القاعات الطبية" },
  { id: "med-13", cat: "medical", x: 70, y: 360, en: "Faculty of Pharmacy", ar: "كلية الصيدلة" },

  // Central campus
  { id: "cen-1", cat: "central", x: 500, y: 140, en: "University Presidency", ar: "رئاسة الجامعة" },
  { id: "cen-2", cat: "central", x: 420, y: 160, en: "Prof. Kamel Aljouni Lecture Halls", ar: "قاعات محاضرات الأستاذ كامل الجعوني" },
  { id: "cen-3", cat: "central", x: 380, y: 200, en: "Library", ar: "المكتبة" },
  { id: "cen-4", cat: "central", x: 380, y: 240, en: "Students Gate", ar: "بوابة الطلبة" },
  { id: "cen-5", cat: "central", x: 480, y: 260, en: "Post Office / Bank", ar: "مكتب البريد / البنك" },
  { id: "cen-6", cat: "central", x: 440, y: 310, en: "The Mosque", ar: "المسجد" },
  { id: "cen-7", cat: "central", x: 560, y: 170, en: "Deanship of Students' Affairs", ar: "عمادة شؤون الطلبة" },
  { id: "cen-8", cat: "central", x: 600, y: 200, en: "International Students Office", ar: "مكتب الطلبة الدوليين" },
  { id: "cen-9", cat: "central", x: 610, y: 240, en: "International Relations Office", ar: "مكتب العلاقات الدولية" },
  { id: "cen-10", cat: "central", x: 590, y: 280, en: "Nanotechnology Institute", ar: "معهد تقنية النانو" },
  { id: "cen-11", cat: "central", x: 610, y: 320, en: "Football Stadium", ar: "استاد كرة القدم" },
  { id: "cen-12", cat: "central", x: 560, y: 350, en: "Sport Hall", ar: "القاعة الرياضية" },

  // Engineering zone
  { id: "eng-1", cat: "engineering", x: 720, y: 165, en: "Faculty of Architecture and Design", ar: "كلية العمارة والتصميم" },
  { id: "eng-2", cat: "engineering", x: 720, y: 200, en: "Faculty of Agriculture", ar: "كلية الزراعة" },
  { id: "eng-3", cat: "engineering", x: 760, y: 165, en: "Faculty of Computer and Information Technology", ar: "كلية الحاسوب وتكنولوجيا المعلومات" },
  { id: "eng-4", cat: "engineering", x: 760, y: 200, en: "Faculty of Graduate Studies", ar: "كلية الدراسات العليا" },
  { id: "eng-5", cat: "engineering", x: 800, y: 165, en: "Faculty of Engineering", ar: "كلية الهندسة" },
  { id: "eng-6", cat: "engineering", x: 800, y: 200, en: "Faculty of Veterinary Medicine", ar: "كلية الطب البيطري" },
  { id: "eng-7", cat: "engineering", x: 850, y: 150, en: "Deanship of Scientific Research", ar: "عمادة البحث العلمي" },
  { id: "eng-8", cat: "engineering", x: 850, y: 185, en: "Al Karomeh Auditorium", ar: "قاعة الكرامة" },
  { id: "eng-9", cat: "engineering", x: 890, y: 150, en: "Al Farouq Auditorium", ar: "قاعة الفاروق" },
  { id: "eng-10", cat: "engineering", x: 890, y: 185, en: "Cafeteria", ar: "الكافتيريا" },
  { id: "eng-11", cat: "services", x: 850, y: 220, en: "Salah Eldeen Auditorium", ar: "قاعة صلاح الدين" },
  { id: "eng-12", cat: "services", x: 890, y: 220, en: "Center of Excellence for Innovative Projects", ar: "مركز التميز للمشاريع الابتكارية" },
  { id: "eng-13", cat: "services", x: 720, y: 240, en: "Veterinary Hospital", ar: "المستشفى البيطري" },
  { id: "eng-14", cat: "services", x: 760, y: 240, en: "Female Students' Housing", ar: "سكن الطالبات" },
  { id: "eng-15", cat: "services", x: 800, y: 250, en: "Student Entrance", ar: "مدخل الطلبة" },
  { id: "eng-16", cat: "services", x: 840, y: 255, en: "Cottages", ar: "الأكواخ" },
  { id: "lake-1", cat: "services", x: 905, y: 290, en: "The Lake", ar: "البحيرة" },

  // Services & parking scattered near the road
  { id: "srv-1", cat: "services", x: 130, y: 415, en: "Disabled Parking (West)", ar: "مواقف ذوي الإعاقة (غرب)" },
  { id: "srv-2", cat: "services", x: 400, y: 415, en: "Central Parking", ar: "المواقف المركزية" },
  { id: "srv-3", cat: "services", x: 700, y: 415, en: "East Parking", ar: "المواقف الشرقية" },
];

const ZONE_COLORS = {
  medical: "#C96A78",
  central: "#8FAE6C",
  engineering: "#5E93C9",
  services: "#C9A23D",
};

function currentLang() {
  return document.documentElement.getAttribute("lang") === "ar" ? "ar" : "en";
}

function labelFor(b) {
  return currentLang() === "ar" ? b.ar : b.en;
}

function catLabel(cat) {
  const map = {
    medical: { en: "Medical buildings", ar: "المباني الطبية" },
    central: { en: "Central campus", ar: "الحرم المركزي" },
    engineering: { en: "Engineering buildings", ar: "المباني الهندسية" },
    services: { en: "Services & parking", ar: "الخدمات والمواقف" },
  };
  return map[cat] ? map[cat][currentLang()] : cat;
}

(function initCampusMap() {
  const svg = document.getElementById("mapSvg");
  const pinsLayer = document.getElementById("mapPins");
  const stage = document.getElementById("mapStage");
  const callout = document.getElementById("mapCallout");
  const calloutName = document.getElementById("mapCalloutName");
  const calloutCat = document.getElementById("mapCalloutCat");
  const listEl = document.getElementById("mapList");
  const searchEl = document.getElementById("mapSearch");
  const filtersEl = document.getElementById("mapFilters");

  if (!svg || !pinsLayer) return;

  let activeId = null;

  // Build pins once.
  BUILDINGS.forEach((b) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "map-pin");
    g.setAttribute("data-id", b.id);
    g.setAttribute("data-cat", b.cat);
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");

    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("class", "halo");
    halo.setAttribute("cx", b.x);
    halo.setAttribute("cy", b.y);
    halo.setAttribute("r", "10");
    halo.setAttribute("fill", ZONE_COLORS[b.cat] || "#389FFF");

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", "dot");
    dot.setAttribute("cx", b.x);
    dot.setAttribute("cy", b.y);
    dot.setAttribute("r", "5");
    dot.setAttribute("fill", ZONE_COLORS[b.cat] || "#389FFF");

    g.appendChild(halo);
    g.appendChild(dot);
    pinsLayer.appendChild(g);

    const show = () => showCallout(b, g);
    g.addEventListener("mouseenter", show);
    g.addEventListener("focus", show);
    g.addEventListener("click", () => setActive(b.id, true));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(b.id, true); }
    });
  });

  function showCallout(b, pinEl) {
    const rect = pinEl.querySelector(".dot").getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    calloutName.textContent = labelFor(b);
    calloutCat.textContent = catLabel(b.cat);
    callout.style.left = (rect.left - stageRect.left + rect.width / 2) + "px";
    callout.style.top = (rect.top - stageRect.top - 6) + "px";
    callout.classList.add("is-visible");
  }

  function hideCallout() {
    callout.classList.remove("is-visible");
  }

  stage.addEventListener("mouseleave", () => { if (!activeId) hideCallout(); });

  function setActive(id, scrollList) {
    activeId = id;
    document.querySelectorAll(".map-pin").forEach((p) => p.classList.toggle("is-active", p.getAttribute("data-id") === id));
    document.querySelectorAll(".map-list button").forEach((btn) => btn.classList.toggle("is-active", btn.getAttribute("data-id") === id));
    const b = BUILDINGS.find((x) => x.id === id);
    const pinEl = pinsLayer.querySelector(`[data-id="${id}"]`);
    if (b && pinEl) showCallout(b, pinEl);
    if (scrollList) {
      const li = listEl.querySelector(`[data-id="${id}"]`);
      if (li) li.scrollIntoView({ block: "nearest" });
    }
  }

  function activeCats() {
    return Array.from(filtersEl.querySelectorAll("input:checked")).map((i) => i.value);
  }

  function renderList() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const cats = activeCats();

    const matches = BUILDINGS.filter((b) => {
      if (!cats.includes(b.cat)) return false;
      if (!q) return true;
      return b.en.toLowerCase().includes(q) || b.ar.includes(q);
    });

    // Pins: show/hide
    document.querySelectorAll(".map-pin").forEach((p) => {
      const id = p.getAttribute("data-id");
      const visible = matches.some((m) => m.id === id);
      p.classList.toggle("is-hidden", !visible);
    });

    // List
    listEl.innerHTML = "";
    if (matches.length === 0) {
      const empty = document.createElement("li");
      empty.className = "map-list__empty";
      empty.textContent = currentLang() === "ar" ? "لا توجد نتائج." : "No buildings match.";
      listEl.appendChild(empty);
      return;
    }

    matches.forEach((b) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-id", b.id);
      btn.classList.toggle("is-active", b.id === activeId);
      const dot = document.createElement("span");
      dot.className = "map-list__dot";
      dot.style.background = ZONE_COLORS[b.cat] || "#389FFF";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(labelFor(b)));
      btn.addEventListener("click", () => setActive(b.id, false));
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  searchEl.addEventListener("input", renderList);
  filtersEl.addEventListener("change", renderList);

  document.addEventListener("icc:languagechange", () => {
    renderList();
    if (activeId) {
      const b = BUILDINGS.find((x) => x.id === activeId);
      const pinEl = pinsLayer.querySelector(`[data-id="${activeId}"]`);
      if (b && pinEl) showCallout(b, pinEl);
    }
  });

  renderList();
})();
