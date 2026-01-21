const WELL_EXPLORER_TOKEN = 'pk.eyJ1Ijoid2VsbG1hcHBlZCIsImEiOiJjbGlreXVsMWowNDg5M2ZxcGZucDV5bnIwIn0.5wYuJnmZvUbHZh9M580M-Q';
const WELL_EXPLORER_STYLE = 'mapbox://styles/wellmapped/clixrm3dg00fy01pzehcncxie';
const WELL_EXPLORER_STORAGE_KEY = 'wellExplorerSelection';

const filterInputs = {
  operator: document.getElementById('filterOperator'),
  owner: document.getElementById('filterOwner'),
  api: document.getElementById('filterApi'),
  status: document.getElementById('filterStatus'),
  name: document.getElementById('filterName'),
  trajectory: document.getElementById('filterTrajectory'),
  county: document.getElementById('filterCounty'),
};

const datalistElements = {
  operator: document.getElementById('filterOperatorOptions'),
  owner: document.getElementById('filterOwnerOptions'),
  api: document.getElementById('filterApiOptions'),
  status: document.getElementById('filterStatusOptions'),
  name: document.getElementById('filterNameOptions'),
  trajectory: document.getElementById('filterTrajectoryOptions'),
  county: document.getElementById('filterCountyOptions'),
};

const filteredCountEl = document.getElementById('filteredWellsCount');
const selectedCountEl = document.getElementById('selectedWellsCount');
const tableBody = document.getElementById('selectedWellsTableBody');
const mapContainer = document.getElementById('wellExplorerMap');
const apiCsvInput = document.getElementById('apiCsvInput');
const apiCsvStatus = document.getElementById('apiCsvStatus');
const applyApiListButton = document.getElementById('applyApiList');
const replaceApiListButton = document.getElementById('replaceApiList');
const addFilteredButton = document.getElementById('addFilteredWells');
const clearSelectionButton = document.getElementById('clearSelection');

const state = {
  wells: [],
  wellsByApi: new Map(),
  filteredWells: [],
  selectedApis: new Set(),
  fullExtent: null,
};

const normalizeValue = (value) => (value ?? '').toString().trim();
const normalizeForMatch = (value) => normalizeValue(value).toLowerCase();
const uniq = (items) => Array.from(new Set(items.filter(Boolean)));

const buildDatalist = (element, values) => {
  if (!element) return;
  element.innerHTML = '';
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    element.appendChild(option);
  });
};

const setStatus = (message, isError = false) => {
  if (!apiCsvStatus) return;
  apiCsvStatus.textContent = message;
  apiCsvStatus.classList.toggle('is-error', isError);
};

const parseApiList = (text) => {
  if (!text) return [];
  return text
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\s+/g, ''))
    .map((entry) => entry.toUpperCase());
};

const applySelection = (apis, { replace = false } = {}) => {
  if (replace) {
    state.selectedApis.clear();
  }
  apis.forEach((api) => {
    const normalized = api.replace(/-/g, '').toUpperCase();
    const match = state.wells.find((well) => well.api_uwi_no_dash === normalized);
    if (match?.api_uwi) {
      state.selectedApis.add(match.api_uwi);
    }
  });
  renderSelection();
  renderMap();
};

const getFilterValue = (key) => normalizeForMatch(filterInputs[key]?.value);

const matchesFilter = (well) => {
  const operator = getFilterValue('operator');
  const owner = getFilterValue('owner');
  const api = getFilterValue('api');
  const status = getFilterValue('status');
  const name = getFilterValue('name');
  const trajectory = getFilterValue('trajectory');
  const county = getFilterValue('county');

  if (operator && !normalizeForMatch(well.operator).includes(operator)) return false;
  if (status && !normalizeForMatch(well.status).includes(status)) return false;
  if (name && !normalizeForMatch(well.well_name).includes(name)) return false;
  if (trajectory && !normalizeForMatch(well.trajectory).includes(trajectory)) return false;
  if (county && !normalizeForMatch(well.county).includes(county)) return false;
  if (api) {
    const apiMatch = normalizeForMatch(well.api_uwi);
    if (!apiMatch.includes(api)) return false;
  }
  if (owner) {
    const owners = normalizeForMatch(well.owner_list);
    if (!owners.includes(owner)) return false;
  }
  return true;
};

const updateFilteredWells = () => {
  state.filteredWells = state.wells.filter(matchesFilter);
  if (filteredCountEl) {
    filteredCountEl.textContent = state.filteredWells.length.toLocaleString('en-US');
  }
  renderMap();
};

const renderSelection = () => {
  if (!tableBody) return;
  const rows = Array.from(state.selectedApis)
    .map((api) => state.wellsByApi.get(api))
    .filter(Boolean);

  if (selectedCountEl) {
    selectedCountEl.textContent = rows.length.toLocaleString('en-US');
  }

  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="7" class="well-explorer__empty">No wells selected yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  rows.forEach((well) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${well.api_uwi || '--'}</td>
      <td>${well.well_name || '--'}</td>
      <td>${well.operator || '--'}</td>
      <td>${well.status || '--'}</td>
      <td>${well.county || '--'}</td>
      <td>${well.owner_list || '--'}</td>
      <td class="well-explorer__edit-cell">
        <button type="button" class="well-explorer__edit" data-api="${well.api_uwi}">Edit</button>
      </td>
    `;
    tableBody.appendChild(row);
  });
};

const getBounds = (wells) => {
  if (!wells.length) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  wells.forEach((well) => {
    if (!Number.isFinite(well.lat) || !Number.isFinite(well.lon)) return;
    minLat = Math.min(minLat, well.lat);
    maxLat = Math.max(maxLat, well.lat);
    minLon = Math.min(minLon, well.lon);
    maxLon = Math.max(maxLon, well.lon);
  });

  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return null;
  return { minLat, maxLat, minLon, maxLon };
};

const zoomForBounds = (bounds) => {
  if (!bounds) return 4;
  const latSpan = Math.max(0.01, bounds.maxLat - bounds.minLat);
  const lonSpan = Math.max(0.01, bounds.maxLon - bounds.minLon);
  const span = Math.max(latSpan, lonSpan);
  const zoom = Math.log2(360 / span);
  return Math.min(12, Math.max(3, zoom));
};

const getCenter = (bounds) => {
  if (!bounds) return { lat: 38.5, lon: -96.5 };
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lon: (bounds.minLon + bounds.maxLon) / 2,
  };
};

const renderMap = () => {
  if (!mapContainer || !window.Plotly) return;

  const filtered = state.filteredWells.length ? state.filteredWells : state.wells;
  const selected = Array.from(state.selectedApis)
    .map((api) => state.wellsByApi.get(api))
    .filter(Boolean);

  const filteredTrace = {
    type: 'scattermapbox',
    mode: 'markers',
    lat: filtered.map((w) => w.lat),
    lon: filtered.map((w) => w.lon),
    text: filtered.map((w) => `${w.api_uwi || ''} ${w.well_name || ''}`.trim()),
    marker: {
      size: 6,
      color: '#94a3b8',
      opacity: 0.7,
    },
    customdata: filtered.map((w) => ({ api: w.api_uwi })),
    name: 'Filtered wells',
  };

  const selectedTrace = {
    type: 'scattermapbox',
    mode: 'markers',
    lat: selected.map((w) => w.lat),
    lon: selected.map((w) => w.lon),
    text: selected.map((w) => `${w.api_uwi || ''} ${w.well_name || ''}`.trim()),
    marker: {
      size: 9,
      color: '#16a34a',
      opacity: 0.9,
      line: { width: 1, color: '#14532d' },
    },
    customdata: selected.map((w) => ({ api: w.api_uwi })),
    name: 'Selected wells',
  };

  const bounds = selected.length ? getBounds(selected) : state.fullExtent || getBounds(filtered);
  const center = getCenter(bounds);
  const zoom = zoomForBounds(bounds);

  const layout = {
    mapbox: {
      accesstoken: WELL_EXPLORER_TOKEN,
      style: WELL_EXPLORER_STYLE,
      center: { lat: center.lat, lon: center.lon },
      zoom,
    },
    margin: { t: 0, b: 0, l: 0, r: 0 },
    showlegend: false,
  };

  const config = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
  };

  window.Plotly.react(mapContainer, [filteredTrace, selectedTrace], layout, config);
};

const attachMapClick = () => {
  if (!mapContainer || !mapContainer.on) return;
  mapContainer.on('plotly_click', (event) => {
    const point = event?.points?.[0];
    const api = point?.customdata?.api;
    if (!api) return;
    state.selectedApis.add(api);
    renderSelection();
    renderMap();
  });
};

const handleTableClick = (event) => {
  const button = event.target.closest('.well-explorer__edit');
  if (!button) return;
  const api = button.dataset.api;
  if (!api) return;

  const selectionPayload = {
    apis: Array.from(state.selectedApis),
    focus_api: api,
    saved_at: new Date().toISOString(),
  };
  localStorage.setItem(WELL_EXPLORER_STORAGE_KEY, JSON.stringify(selectionPayload));
  const target = `/map/?well_explorer=1&open_editor=1&focus_api=${encodeURIComponent(api)}`;
  window.location.assign(target);
};

const handleApiList = (replace = false) => {
  if (!apiCsvInput) return;
  const apis = parseApiList(apiCsvInput.value);
  if (!apis.length) {
    setStatus('Enter at least one API/UWI value.', true);
    return;
  }
  applySelection(apis, { replace });
  setStatus(`Added ${apis.length.toLocaleString('en-US')} API value${apis.length === 1 ? '' : 's'} to selection.`);
};

const handleAddFiltered = () => {
  const filteredApis = state.filteredWells.map((well) => well.api_uwi).filter(Boolean);
  if (!filteredApis.length) {
    setStatus('No filtered wells to add.', true);
    return;
  }
  applySelection(filteredApis, { replace: false });
  setStatus(`Added ${filteredApis.length.toLocaleString('en-US')} filtered wells to selection.`);
};

const handleClearSelection = () => {
  state.selectedApis.clear();
  renderSelection();
  renderMap();
};

const attachListeners = () => {
  Object.values(filterInputs).forEach((input) => {
    if (!input) return;
    input.addEventListener('input', updateFilteredWells);
  });

  if (applyApiListButton) {
    applyApiListButton.addEventListener('click', () => handleApiList(false));
  }
  if (replaceApiListButton) {
    replaceApiListButton.addEventListener('click', () => handleApiList(true));
  }
  if (addFilteredButton) {
    addFilteredButton.addEventListener('click', handleAddFiltered);
  }
  if (clearSelectionButton) {
    clearSelectionButton.addEventListener('click', handleClearSelection);
  }
  if (tableBody) {
    tableBody.addEventListener('click', handleTableClick);
  }
};

const buildOptions = (filters) => {
  buildDatalist(datalistElements.operator, filters.operator || []);
  buildDatalist(datalistElements.owner, filters.owner || []);
  buildDatalist(datalistElements.api, filters.api || []);
  buildDatalist(datalistElements.status, filters.status || []);
  buildDatalist(datalistElements.name, filters.name || []);
  buildDatalist(datalistElements.trajectory, filters.trajectory || []);
  buildDatalist(datalistElements.county, filters.county || []);
};

const hydrateState = (payload) => {
  state.wells = payload.wells || [];
  state.wellsByApi = new Map(state.wells.map((well) => [well.api_uwi, well]));
  state.filteredWells = state.wells;
  if (payload.extent) {
    state.fullExtent = {
      minLat: payload.extent.min_lat,
      maxLat: payload.extent.max_lat,
      minLon: payload.extent.min_lon,
      maxLon: payload.extent.max_lon,
    };
  } else {
    state.fullExtent = getBounds(state.wells);
  }

  if (filteredCountEl) {
    filteredCountEl.textContent = state.filteredWells.length.toLocaleString('en-US');
  }
};

const loadWellExplorer = async () => {
  try {
    const response = await fetch('/well-explorer/data/');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    hydrateState(payload);
    buildOptions(payload.filters || {});
    renderSelection();
    renderMap();
    attachMapClick();
  } catch (error) {
    console.error('Failed to load well explorer data', error);
    if (filteredCountEl) {
      filteredCountEl.textContent = '--';
    }
  }
};

attachListeners();
loadWellExplorer();
