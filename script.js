import { dataWisata } from "./data/data_wisata.js";

/* ---------------------------
   Helpers
--------------------------- */
function norm(s) {
  return String(s ?? "").toLowerCase().trim();
}

function hasCoord(w) {
  return Number.isFinite(w.latitude) && Number.isFinite(w.longitude);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function isMobile() {
  return window.matchMedia("(max-width: 980px)").matches;
}

/* ---------------------------
   DOM
--------------------------- */
const elSidebar = document.getElementById("sidebar");
const elToggle = document.getElementById("btnToggleSidebar");
const elFit = document.getElementById("btnFit");
const elLocate = document.getElementById("btnLocate");

const elQ = document.getElementById("q");
const elKategori = document.getElementById("kategori");
const elSort = document.getElementById("sort");
const elMinRating = document.getElementById("minRating");
const elLimit = document.getElementById("limit");
const elReset = document.getElementById("btnReset");

const elList = document.getElementById("list");
const elCountShown = document.getElementById("countShown");
const elCountAll = document.getElementById("countAll");
const elStatus = document.getElementById("statusText");

/* ---------------------------
   Data Prep
--------------------------- */
const all = (Array.isArray(dataWisata) ? dataWisata : [])
  .map((w, idx) => ({
    id: idx,
    nama: w.nama ?? "",
    kategori: w.kategori ?? "Tidak diketahui",
    preferensi: w.preferensi ?? "",
    kecamatan: w.kecamatan ?? "",
    wilayah: w.wilayah ?? "",
    rating: typeof w.rating === "number" ? w.rating : null,
    jumlah_rating: typeof w.jumlah_rating === "number" ? w.jumlah_rating : null,
    link_maps: w.link_maps ?? "",
    latitude: typeof w.latitude === "number" ? w.latitude : Number(w.latitude),
    longitude: typeof w.longitude === "number" ? w.longitude : Number(w.longitude),
  }))
  .filter((w) => hasCoord(w));

elCountAll.textContent = String(all.length);

/* Build kategori options */
const kategoriSet = new Set(all.map((w) => w.kategori).filter(Boolean));
[...kategoriSet].sort((a, b) => a.localeCompare(b, "id")).forEach((k) => {
  const opt = document.createElement("option");
  opt.value = k;
  opt.textContent = k;
  elKategori.appendChild(opt);
});

/* ---------------------------
   Map Init
--------------------------- */
const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true,
});

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
});
osm.addTo(map);

/* Default view: Bogor-ish */
map.setView([-6.6, 106.8], 11);

/* Layer groups */
const markersLayer = L.layerGroup().addTo(map);
let userMarker = null;
let userCircle = null;

/* ---------------------------
   Marker styling by kategori
--------------------------- */
function colorForKategori(k) {
  const key = norm(k);
  if (key.includes("alam")) return "#246028ff";
  if (key.includes("budaya")) return "#004cffff";
  if (key.includes("rekreasi")) return "#fffb00ff";
  if (key.includes("umum")) return "#ff0000ff";
  return "#9aa7c7";
}

function iconForKategori(k) {
  const c = colorForKategori(k);
  return L.divIcon({
    className: "custom-pin",
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${c};
      border:2px solid rgba(255,255,255,.85);
      box-shadow: 0 6px 18px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/* ---------------------------
   Legend (Bottom Right) - AUTO dari data
--------------------------- */
const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "map-legend");

  const kategoriLegend = [...new Set(all.map((w) => w.kategori).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "id"));

  div.innerHTML = `
    <div class="legend-title">Legenda Kategori</div>
    ${kategoriLegend
      .map((k) => `
        <div class="legend-row">
          <span class="legend-swatch" style="background:${colorForKategori(k)}"></span>
          <span>${escapeHtml(k)}</span>
        </div>
      `)
      .join("")}
    <div class="legend-note">Warna marker mengikuti kategori data wisata.</div>
  `;

  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  return div;
};
legend.addTo(map);

/* ---------------------------
   Filtering + Rendering
--------------------------- */
let current = [];
let markerIndex = new Map(); // id -> marker

function applyFilters() {
  const q = norm(elQ.value);
  const kat = elKategori.value;
  const sort = elSort.value;
  const minRating = Number(elMinRating.value);
  const limit = Number(elLimit.value);

  let arr = all.filter((w) => {
    if (kat !== "ALL" && w.kategori !== kat) return false;
    if (w.rating != null && w.rating < minRating) return false;
    if (w.rating == null && minRating > 0) return false;

    if (!q) return true;
    const hay = norm(`${w.nama} ${w.kecamatan} ${w.wilayah} ${w.kategori} ${w.preferensi}`);
    return hay.includes(q);
  });

  if (sort === "rating_desc") {
    arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  } else if (sort === "rating_asc") {
    arr.sort((a, b) => (a.rating ?? 999) - (b.rating ?? 999));
  } else if (sort === "nama_asc") {
    arr.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  } else if (sort === "nama_desc") {
    arr.sort((a, b) => b.nama.localeCompare(a.nama, "id"));
  } else {
    if (q) {
      arr.sort((a, b) => {
        const an = norm(a.nama).includes(q) ? 0 : 1;
        const bn = norm(b.nama).includes(q) ? 0 : 1;
        if (an !== bn) return an - bn;
        return (b.rating ?? -1) - (a.rating ?? -1);
      });
    } else {
      arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    }
  }

  if (Number.isFinite(limit) && limit > 0) arr = arr.slice(0, limit);

  current = arr;

  elCountShown.textContent = String(current.length);
  elStatus.textContent = q
    ? `Filter aktif: "${elQ.value}"`
    : (kat !== "ALL" ? `Kategori: ${kat}` : "");

  renderList();
  renderMarkers();
}

function renderList() {
  elList.innerHTML = "";

  if (current.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `<div class="item__title">Tidak ada data yang cocok</div>
      <div class="item__meta">Coba ubah kata kunci / kategori / min rating.</div>`;
    elList.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  current.forEach((w) => {
    const div = document.createElement("div");
    div.className = "item";
    div.dataset.id = String(w.id);

    const ratingText =
      w.rating == null ? "—" : `${w.rating.toFixed(1)} (${w.jumlah_rating ?? 0})`;

    div.innerHTML = `
      <div class="item__title">${escapeHtml(w.nama)}</div>
      <div class="item__meta">
        <span class="tag"><span class="dot" style="background:${colorForKategori(w.kategori)}"></span>${escapeHtml(w.kategori)}</span>
        <span class="tag">${escapeHtml(w.kecamatan || "-")}</span>
        <span class="tag">${escapeHtml(w.wilayah || "-")}</span>
        <span class="tag">⭐ ${escapeHtml(ratingText)}</span>
      </div>
    `;

    div.addEventListener("click", () => focusItem(w.id));
    frag.appendChild(div);
  });

  elList.appendChild(frag);
}

function popupHtml(w) {
  const ratingText =
    w.rating == null ? "—" : `${w.rating.toFixed(1)} (${w.jumlah_rating ?? 0})`;

  return `
    <div style="min-width:220px">
      <div style="font-weight:800;margin-bottom:6px">${escapeHtml(w.nama)}</div>
      <div style="font-size:12px;opacity:.85;line-height:1.4">
        <div><b>Kategori:</b> ${escapeHtml(w.kategori || "-")}</div>
        <div><b>Kecamatan:</b> ${escapeHtml(w.kecamatan || "-")}</div>
        <div><b>Wilayah:</b> ${escapeHtml(w.wilayah || "-")}</div>
        <div><b>Rating:</b> ${escapeHtml(ratingText)}</div>
      </div>
      ${
        w.link_maps
          ? `<div style="margin-top:8px">
               <a href="${escapeHtml(w.link_maps)}" target="_blank" rel="noopener">Buka di Google Maps</a>
             </div>`
          : ""
      }
    </div>
  `;
}

function renderMarkers() {
  markersLayer.clearLayers();
  markerIndex.clear();

  current.forEach((w) => {
    const m = L.marker([w.latitude, w.longitude], {
      icon: iconForKategori(w.kategori),
      title: w.nama,
    });

    m.bindPopup(popupHtml(w));
    m.addTo(markersLayer);
    markerIndex.set(w.id, m);
  });
}

function focusItem(id) {
  const m = markerIndex.get(id);
  const w = current.find((x) => x.id === id);
  if (!m || !w) return;

  map.setView([w.latitude, w.longitude], clamp(map.getZoom() + 1, 12, 17), { animate: true });
  m.openPopup();

  const card = elList.querySelector(`.item[data-id="${id}"]`);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });

  if (isMobile()) {
    elSidebar.classList.remove("is-open");
    setTimeout(() => map.invalidateSize(), 260);
  }
}

function fitToCurrent() {
  if (current.length === 0) return;
  const latlngs = current.map((w) => [w.latitude, w.longitude]);
  const bounds = L.latLngBounds(latlngs);
  map.fitBounds(bounds.pad(0.15));
}

/* ---------------------------
   UI events
--------------------------- */
function toggleSidebar() {
  if (isMobile()) {
    elSidebar.classList.toggle("is-open");
    setTimeout(() => map.invalidateSize(), 260);
  } else {
    elSidebar.classList.toggle("is-hidden");
    setTimeout(() => map.invalidateSize(), 260);
  }
}

elToggle.addEventListener("click", toggleSidebar);

elFit.addEventListener("click", () => {
  fitToCurrent();
});

elReset.addEventListener("click", () => {
  elQ.value = "";
  elKategori.value = "ALL";
  elSort.value = "relevansi";
  elMinRating.value = "0";
  elLimit.value = "100";
  applyFilters();
  fitToCurrent();
});

let debounceTimer = null;
function debounceApply() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(applyFilters, 180);
}

elQ.addEventListener("input", debounceApply);
elKategori.addEventListener("change", applyFilters);
elSort.addEventListener("change", applyFilters);
elMinRating.addEventListener("change", applyFilters);
elLimit.addEventListener("change", applyFilters);

/* ---------------------------
   Geolocation (Lokasi Saya)
--------------------------- */
elLocate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    elStatus.textContent = "Browser tidak mendukung geolocation.";
    return;
  }

  elStatus.textContent = "Mengambil lokasi...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      elStatus.textContent = `Lokasi didapat (akurasi ±${Math.round(accuracy)}m)`;

      const latlng = [latitude, longitude];

      if (userMarker) userMarker.remove();
      if (userCircle) userCircle.remove();

      userMarker = L.marker(latlng).addTo(map).bindPopup("Lokasi saya");
      userCircle = L.circle(latlng, {
        radius: accuracy,
        color: "#7aa2ff",
        weight: 2,
        fillOpacity: 0.08,
      }).addTo(map);

      map.setView(latlng, 14, { animate: true });
      userMarker.openPopup();
    },
    (err) => {
      elStatus.textContent = `Gagal ambil lokasi: ${err.message}`;
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

/* ---------------------------
   Init
--------------------------- */
applyFilters();
fitToCurrent();

/* default mobile: panel tertutup */
if (isMobile()) {
  elSidebar.classList.remove("is-hidden");
  elSidebar.classList.remove("is-open");
}

/* Leaflet refresh size on resize/orientation */
window.addEventListener("resize", () => {
  map.invalidateSize();
});
