// Handles Leaflet map setup, clustering, filtering, and UI events

var map = null;
var sessionsSinglesLayer = null;
var sessionsGroupsLayer = null;
var venuesLayer = null;
var lastSessionFeatures = [];
var zoomDisplayDiv = null;
var searchAreaBtn = null;
var lastFetchedBbox = null;
var userLocationMarker = null;
var userAccuracyCircle = null;
var currentSortRef = null;

// Initialise app
initMap();
initUI();
loadAll();

// initialise map
function initMap() {
  map = L.map("map").setView([53.35, -6.26], 11);

  // use openstreetmaps to display map
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "OpenStreetMap",
  }).addTo(map);

  sessionsSinglesLayer = L.layerGroup().addTo(map);
  sessionsGroupsLayer = L.layerGroup().addTo(map);
  venuesLayer = L.layerGroup().addTo(map);

  // show zoom level
  var ZoomInfo = L.Control.extend({
    onAdd: function () {
      zoomDisplayDiv = L.DomUtil.create("div", "zoom-display");
      zoomDisplayDiv.style.background = "rgba(0,0,0,0.5)";
      zoomDisplayDiv.style.color = "#fff";
      zoomDisplayDiv.style.padding = "2px 6px";
      zoomDisplayDiv.style.fontSize = "11px";
      zoomDisplayDiv.innerHTML = "Zoom: " + map.getZoom();
      return zoomDisplayDiv;
    },
    onRemove: function () {},
  });
  new ZoomInfo({ position: "bottomleft" }).addTo(map);

  // update display when map moves
  map.on("moveend", function () {
    var z = map.getZoom();
    if (zoomDisplayDiv) {
      zoomDisplayDiv.innerHTML = "Zoom: " + z;
    }

    if (shouldShowSearchAreaBtn()) {
      showSearchAreaBtn();
    }

    if (lastSessionFeatures && lastSessionFeatures.length) {
      displaySessions(lastSessionFeatures);
      renderSessionListAuto(lastSessionFeatures);
    }
  });
}

// initialise ui
function initUI() {
  var searchBtn = document.getElementById("search-btn");
  var refreshBtn = document.getElementById("refresh-btn");
  var togglePanelBtn = document.getElementById("btn-toggle-panel");
  var searchBox = document.getElementById("search-box");
  var filterSystem = document.getElementById("filter-system");
  var filterOpen = document.getElementById("filter-open");
  var filterProvince = document.getElementById("filter-province");

  // floating buttons
  searchAreaBtn = document.getElementById("search-area-btn");
  if (searchAreaBtn) {
    searchAreaBtn.style.display = "block";
    searchAreaBtn.onclick = function () {
      fetchSessionsInCurrentBbox();
    };
  }

  var nearMeBtn = document.getElementById("btn-near-me");
  if (nearMeBtn) {
    nearMeBtn.onclick = findNearestToMe;
  }

  // search + reset
  if (searchBtn) searchBtn.onclick = doSearch;
  if (refreshBtn) {
    refreshBtn.onclick = function () {
      if (searchBox) searchBox.value = "";
      if (filterSystem) filterSystem.value = "";
      if (filterOpen) filterOpen.checked = false;
      if (filterProvince) filterProvince.value = "";
      fetchSessionsInCurrentBbox();
    };
  }

  // search on enter or filter change
  if (searchBox) {
    searchBox.onkeyup = function (e) {
      if (e.key === "Enter") {
        doSearch();
      }
    };
  }
  if (filterSystem) filterSystem.onchange = doSearch;
  if (filterOpen) filterOpen.onchange = doSearch;
  if (filterProvince) filterProvince.onchange = doSearch;

  loadSystemsIntoFilter();
  loadProvincesIntoFilter();
}

// initial load
function loadAll() {
  fetchSessionsInCurrentBbox();
  loadVenues();
}

// display Game Sessions
function displaySessions(features) {
  sessionsSinglesLayer.clearLayers();
  sessionsGroupsLayer.clearLayers();

  if (!features || !features.length) return;

  var zoom = map && map.getZoom ? map.getZoom() : 11;
  var clusterRadius = getClusterRadiusForZoom(zoom);
  var useVenueNames = zoom >= 15;
  var clusters = [];

  // group features into clusters
  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    if (!f || !f.geometry || f.geometry.type !== "Point") continue;

    var lng = f.geometry.coordinates[0];
    var lat = f.geometry.coordinates[1];
    var p = f.properties || {};

    // group by venue name if zoomed in
    if (useVenueNames && p.venue_name && p.venue_name.trim() !== "") {
      var foundVenueCluster = false;
      for (var v = 0; v < clusters.length; v++) {
        if (
          clusters[v].venueName &&
          clusters[v].venueName === p.venue_name.trim().toLowerCase()
        ) {
          clusters[v].items.push(f);
          foundVenueCluster = true;
          break;
        }
      }
      if (!foundVenueCluster) {
        clusters.push({
          lat: lat,
          lng: lng,
          items: [f],
          venueName: p.venue_name.trim().toLowerCase(),
        });
      }
      continue;
    }

    // group by distance if zoomed in enough
    var placed = false;
    for (var c = 0; c < clusters.length; c++) {
      var cl = clusters[c];
      if (cl.venueName) continue;
      var d = distanceInMeters(lat, lng, cl.lat, cl.lng);
      if (d <= clusterRadius) {
        cl.items.push(f);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        lat: lat,
        lng: lng,
        items: [f],
      });
    }
  }

  // render clusters
  for (var ci = 0; ci < clusters.length; ci++) {
    var cluster = clusters[ci];
    var list = cluster.items;
    var lat = cluster.lat;
    var lng = cluster.lng;

    if (list.length === 1) {
      var p = list[0].properties || {};
      var marker = L.marker([lat, lng]).bindPopup(buildPopupForSingle(p));
      sessionsSinglesLayer.addLayer(marker);
    } else {
      var count = list.length;
      var icon = L.divIcon({
        html: '<div class="cluster-bubble">' + count + "</div>",
        className: "warhammer-count-icon",
        iconSize: [34, 34],
      });

      var m = L.marker([lat, lng], {
        icon: icon,
        _groupSessions: list,
      }).on("click", function (e) {
        var sessionsHere = e.target.options._groupSessions || [];
        var html = buildPopupForGroup(sessionsHere);

        var count = sessionsHere.length;
        var popupWidth;
        if (count <= 1) popupWidth = 350;
        else if (count == 2) popupWidth = 500;
        else if (count == 3) popupWidth = 650;
        else popupWidth = 750;

        L.popup({ maxWidth: popupWidth, minWidth: popupWidth - 50 })
          .setLatLng(e.latlng)
          .setContent(html)
          .openOn(map);
      });

      sessionsGroupsLayer.addLayer(m);
    }
  }
}

// cluster radius
function getClusterRadiusForZoom(zoom) {
  if (zoom <= 4) return 20000;
  else if (zoom <= 7) return 5000;
  else if (zoom <= 10) return 2000;
  else if (zoom <= 12) return 800;
  else if (zoom <= 14) return 200;
  else return 50;
}

// Display venues
function displayVenues(features) {
  venuesLayer.clearLayers();
  if (!features || !features.length) return;

  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    if (!f || !f.geometry || f.geometry.type !== "Point") continue;
    var lng = f.geometry.coordinates[0];
    var lat = f.geometry.coordinates[1];
    var p = f.properties || {};

    L.circleMarker([lat, lng], {
      radius: 5,
      color: "#a00012",
      fillColor: "#ff4545",
      fillOpacity: 0.9,
      weight: 1,
    })
      .bindPopup("<strong>" + (p.name || "Venue") + "</strong>")
      .addTo(venuesLayer);
  }
}

//  ----- POPUPS -----

// Builds popup for a single game session marker
function buildPopupForSingle(p) {
  var html = "<div><h6>" + (p.title || "Game session") + "</h6>";
  if (p.game_system)
    html += "<div><strong>System:</strong> " + p.game_system + "</div>";
  if (p.points_level)
    html += "<div><strong>Points:</strong> " + p.points_level + "</div>";
  if (p.venue_name)
    html += "<div><strong>Venue:</strong> " + p.venue_name + "</div>";
  if (p.start_time)
    html += "<div><strong>Starts:</strong> " + p.start_time + "</div>";
  if (p.organiser)
    html += "<div><strong>Organiser:</strong> " + p.organiser + "</div>";
  if (p.organiser_contact)
    html += "<div><strong>Contact:</strong> " + p.organiser_contact + "</div>";
  if (p.max_players || p.current_players)
    html +=
      "<div><strong>Players:</strong> " +
      (p.current_players || 0) +
      "/" +
      (p.max_players || "?") +
      "</div>";
  html +=
    "<div><strong>Status:</strong> " +
    (p.is_open ? "Open" : "Closed") +
    "</div>";
  if (p.description)
    html += "<div style='margin-top:4px'>" + p.description + "</div>";
  html += "</div>";
  return html;
}

// Builds popup for clustered markers
function buildPopupForGroup(list) {
  var html = "<div>";
  html += "<h6 style='margin-bottom:8px;'>" + list.length + " games here</h6>";
  html +=
    "<div style='display:flex; gap:10px; overflow-x:auto; max-width:800px; padding-bottom:4px;'>";
  for (var i = 0; i < list.length; i++) {
    var p = list[i].properties || {};
    html +=
      "<div style='min-width:190px; max-width:220px; border:1px solid #ddd; border-radius:6px; padding:6px; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.05); flex:0 0 auto;'>";
    html +=
      "<div style='font-weight:600; margin-bottom:4px;'>" +
      (p.title || "Game session") +
      "</div>";
    if (p.game_system)
      html += "<div><strong>System:</strong> " + p.game_system + "</div>";
    if (p.venue_name)
      html += "<div><strong>Venue:</strong> " + p.venue_name + "</div>";
    if (p.start_time)
      html += "<div><strong>Starts:</strong> " + p.start_time + "</div>";
    if (p.organiser)
      html += "<div><strong>Organiser:</strong> " + p.organiser + "</div>";
    if (p.organiser_contact)
      html +=
        "<div><strong>Contact:</strong> " + p.organiser_contact + "</div>";
    if (p.current_players || p.max_players)
      html +=
        "<div><strong>Players:</strong> " +
        (p.current_players || 0) +
        "/" +
        (p.max_players || "?") +
        "</div>";
    if (typeof p.is_open !== "undefined")
      html +=
        "<div><strong>Status:</strong> " +
        (p.is_open ? "Open" : "Closed") +
        "</div>";
    if (p.description)
      html +=
        "<div style='margin-top:4px; font-size:0.8rem;'>" +
        p.description +
        "</div>";
    html += "</div>";
  }
  html += "</div>";
  html += "</div>";
  return html;
}

// ----- LIST SORTING & DISPLAY -----

// Compares strings alphabetically
function compareStrings(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

// Sorts sessions by distance, then venue, system, and title
function sortSessionsUniversal(features, refLatLng) {
  const toRad = Math.PI / 180;
  return features
    .slice()
    .map((f) => {
      const p = f.properties || {};
      if (refLatLng && f.geometry && f.geometry.coordinates) {
        const lng = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const dLat = (lat - refLatLng.lat) * toRad;
        let dLng = (lng - refLatLng.lng) * toRad;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(refLatLng.lat * toRad) *
            Math.cos(lat * toRad) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        f._dist = 6371000 * c;
      } else {
        f._dist = null;
      }
      f._venue = (p.venue_name || "").toLowerCase();
      f._system = (p.game_system || "").toLowerCase();
      f._title = (p.title || "").toLowerCase();
      return f;
    })
    .sort((a, b) => {
      if (a._dist != null && b._dist != null && a._dist !== b._dist) {
        return a._dist - b._dist;
      }
      const venueDiff = compareStrings(a._venue, b._venue);
      if (venueDiff !== 0) return venueDiff;
      const sysDiff = compareStrings(a._system, b._system);
      if (sysDiff !== 0) return sysDiff;
      return compareStrings(a._title, b._title);
    });
}

// Renders right-panel list, sorted by distance
function renderSessionListDistanceSorted(features, refLatLng) {
  if (!features || !features.length) {
    renderSessionList(features);
    return;
  }
  const sorted = sortSessionsUniversal(features, refLatLng);
  const list = document.getElementById("results-list");
  list.innerHTML = "";
  for (const f of sorted) {
    const p = f.properties || {};
    const div = document.createElement("div");
    div.className = "result-card";
    let distHtml = "";
    if (refLatLng && typeof f._dist === "number") {
      const distText =
        f._dist >= 1000
          ? (f._dist / 1000).toFixed(1) + " km away"
          : f._dist.toFixed(0) + " m away";
      distHtml = "<div class='distance-line'>" + distText + "</div>";
    }
    div.innerHTML =
      "<strong>" +
      (p.title || "Game session") +
      "</strong>" +
      "<div class='small text-muted'>" +
      (p.game_system || "Unknown system") +
      "</div>" +
      (p.venue_name
        ? "<div class='venue-line'>" + p.venue_name + "</div>"
        : "") +
      distHtml;
    list.appendChild(div);
  }
}

// Auto-selects sorting mode
function renderSessionListAuto(features) {
  const titleEl = document.getElementById("results-title");
  if (currentSortRef) {
    if (titleEl) {
      titleEl.innerHTML =
        "Sessions <span class='loc-pill'>using your location</span>";
    }
    renderSessionListDistanceSorted(features, currentSortRef);
  } else {
    if (titleEl) {
      titleEl.textContent = "Sessions";
    }
    renderSessionList(features);
  }
}

// Displays the default unsorted session list
function renderSessionList(features) {
  const list = document.getElementById("results-list");
  if (!list) return;
  list.innerHTML = "";
  if (!features || !features.length) {
    list.innerHTML = "<div class='p-2 text-muted'>No games found</div>";
    return;
  }
  const sorted = sortSessionsUniversal(features, null);
  for (const f of sorted) {
    const p = f.properties || {};
    const div = document.createElement("div");
    div.className = "result-card";
    div.innerHTML =
      "<strong>" +
      (p.title || "Game session") +
      "</strong>" +
      "<div class='small text-muted'>" +
      (p.game_system || "Unknown system") +
      "</div>" +
      (p.venue_name
        ? "<div class='venue-line'>" + p.venue_name + "</div>"
        : "");
    list.appendChild(div);
  }
}

// ----- SEARCH & LOAD -----

// run search
function doSearch() {
  loadSessions();
}

// Fetches sessions from API using filters
function loadSessions() {
  var searchBox = document.getElementById("search-box");
  var filterSystem = document.getElementById("filter-system");
  var filterOpen = document.getElementById("filter-open");
  var filterProvince = document.getElementById("filter-province");

  var params = [];

  if (searchBox && searchBox.value.trim() !== "") {
    params.push("q=" + encodeURIComponent(searchBox.value.trim()));
  }
  if (filterSystem && filterSystem.value) {
    params.push("system=" + encodeURIComponent(filterSystem.value));
  }
  if (filterProvince && filterProvince.value) {
    params.push("province=" + encodeURIComponent(filterProvince.value));
  }
  if (filterOpen && filterOpen.checked) {
    params.push("open=1");
  }

  var url = "/api/sessions/geojson/";
  if (params.length) {
    url += "?" + params.join("&");
  }

  fetch(url)
    .then(function (resp) {
      return resp.json();
    })
    .then(function (data) {
      var features = data && data.features ? data.features : [];
      lastSessionFeatures = features;
      displaySessions(features);
      renderSessionListAuto(features);
      hideSearchAreaBtn && hideSearchAreaBtn();
    })
    .catch(function (err) {
      console.error("Error loading sessions:", err);
    });
}

// ----- DISTANCE HELPER -----

// alculates distance between two coordinates
function distanceInMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ----- FILTER DROPDOWNS -----

// Populates the “System” dropdown with distinct systems from API
function loadSystemsIntoFilter() {
  var sel = document.getElementById("filter-system");
  if (!sel) return;

  fetch("/api/sessions/distinct-systems/")
    .then((resp) => resp.json())
    .then((systems) => {
      sel.innerHTML = '<option value="">All Systems</option>';

      const seen = new Set();
      (systems || []).forEach((sys) => {
        const clean = (sys || "").trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const opt = document.createElement("option");
        opt.value = clean;
        opt.textContent = clean;
        sel.appendChild(opt);
      });
    })
    .catch((err) => {
      console.error("Error loading systems:", err);
    });
}

// Populates the “Province” dropdown with distinct provinces from API
function loadProvincesIntoFilter() {
  var sel = document.getElementById("filter-province");
  if (!sel) return;

  fetch("/api/counties/distinct-provinces/")
    .then(function (resp) {
      return resp.json();
    })
    .then(function (provs) {
      sel.innerHTML = '<option value="">All Provinces</option>';
      (provs || []).forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
      });
    })
    .catch(function (err) {
      console.error("Error loading provinces:", err);
    });
}

// ----- AREA SEARCH -----

// Loads sessions within the current map view (bbox)
function fetchSessionsInCurrentBbox() {
  if (!map) return;
  var b = map.getBounds();
  var west = b.getWest();
  var south = b.getSouth();
  var east = b.getEast();
  var north = b.getNorth();

  var url =
    "/api/sessions/in-bbox/?west=" +
    west +
    "&south=" +
    south +
    "&east=" +
    east +
    "&north=" +
    north;

  var systemSel = document.getElementById("filter-system");
  var openChk = document.getElementById("filter-open");
  var provinceSel = document.getElementById("filter-province");

  if (systemSel && systemSel.value) {
    url += "&system=" + encodeURIComponent(systemSel.value);
  }
  if (provinceSel && provinceSel.value) {
    url += "&province=" + encodeURIComponent(provinceSel.value);
  }
  if (openChk && openChk.checked) {
    url += "&open=1";
  }

  fetch(url)
    .then(function (resp) {
      return resp.json();
    })
    .then(function (data) {
      var features = data && data.features ? data.features : [];
      lastSessionFeatures = features;
      displaySessions(features);
      renderSessionListAuto(features);

      lastFetchedBbox = { west: west, south: south, east: east, north: north };
    })
    .catch(function (err) {
      console.error("Error loading bbox sessions:", err);
    });
}

// show button
function showSearchAreaBtn() {
  if (searchAreaBtn) {
    searchAreaBtn.style.display = "block";
  }
}

// hide button
function hideSearchAreaBtn() {
  if (searchAreaBtn) {
    searchAreaBtn.style.display = "none";
  }
}

// Checks if the map has moved enough to show the search button
function shouldShowSearchAreaBtn() {
  if (!map) return false;
  if (!lastFetchedBbox) return true;

  var b = map.getBounds();
  var west = b.getWest();
  var south = b.getSouth();
  var east = b.getEast();
  var north = b.getNorth();

  var moved =
    Math.abs(west - lastFetchedBbox.west) > 0.0005 ||
    Math.abs(south - lastFetchedBbox.south) > 0.0005 ||
    Math.abs(east - lastFetchedBbox.east) > 0.0005 ||
    Math.abs(north - lastFetchedBbox.north) > 0.0005;

  return moved;
}

// ----- NEAR ME -----

// Uses device location to find nearby sessions based on user position
function findNearestToMe() {
  if (!navigator.geolocation) {
    alert("Your browser doesn’t support geolocation.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      var acc = pos.coords.accuracy || 0;

      // If exists remove to prevent duplicates
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

      userLocationMarker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup("You are here")
        .openPopup();

      // Draw accuracy circle
      if (acc > 0) {
        userAccuracyCircle = L.circle([lat, lng], {
          radius: acc,
          color: "#3388ff",
          weight: 1,
          fillOpacity: 0.1,
        }).addTo(map);
      }

      currentSortRef = { lat: lat, lng: lng };

      // Prep to send to API
      var bodyData = {
        lat: lat,
        lng: lng,
        limit: 10,
        system: document.getElementById("filter-system").value || "",
        open: document.getElementById("filter-open").checked ? 1 : 0,
      };
      var provSel = document.getElementById("filter-province");
      if (provSel && provSel.value) {
        bodyData.province = provSel.value;
      }

      // Request from API
      fetch("/api/sessions/nearest/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      })
        .then((r) => r.json())
        .then((data) => {
          var features = data.features || [];
          lastSessionFeatures = features;
          displaySessions(features);
          renderSessionListAuto(features);
          map.setView([lat, lng], 13);
        })
        .catch((err) => console.error("Error fetching nearest sessions:", err));
    },
    function (err) {
      console.error(err);
      alert("Unable to get your location: " + err.message);
    },
    // Tell Browser to use GPS
    { enableHighAccuracy: true }
  );
}

// ----- LOAD VENUES -----

// Fetches venue locations
function loadVenues() {
  fetch("/api/venues/geojson/")
    .then(function (resp) {
      return resp.json();
    })
    .then(function (data) {
      var features = data && data.features ? data.features : [];
      displayVenues(features);
    })
    .catch(function (err) {
      console.error("Error loading venues:", err);
    });
}
