const WELL_EXPLORER_ENDPOINT = '/well-explorer/data/';
const WELL_EXPLORER_MAP_ID = 'wellExplorerMap';

const explorerElements = {
  operator: document.getElementById('filterOperator'),
  ownerList: document.getElementById('filterOwnerList'),
  api: document.getElementById('filterApi'),
  status: document.getElementById('filterStatus'),
  name: document.getElementById('filterName'),
  trajectory: document.getElementById('filterTrajectory'),
  county: document.getElementById('filterCounty'),
  matchCount: document.getElementById('wellExplorerMatchCount'),
  selectedCount: document.getElementById('wellExplorerSelectedCount'),
  addFilters: document.getElementById('addFilterSelection'),
  replaceFilters: document.getElementById('replaceFilterSelection'),
  clearSelection: document.getElementById('clearSelection'),
  csvInput: document.getElementById('apiCsvInput'),
  applyCsv: document.getElementById('applyCsvSelection'),
  replaceCsv: document.getElementById('replaceCsvSelection'),
  table: document.getElementById('selectedWellsTable'),
};

const explorerOptionTargets = {
  operator: document.getElementById('filterOperatorOptions'),
  ownerList: document.getElementById('filterOwnerListOptions'),
  api: document.getElementById('filterApiOptions'),
  status: document.getElementById('filterStatusOptions'),
  name: document.getElementById('filterNameOptions'),
  trajectory: document.getElementById('filterTrajectoryOptions'),
  county: document.getElementById('filterCountyOptions'),
};

let allExplorerWells = [];
let mapWells = [];
let mapIndexByApi = new Map();
const selectedExplorerApis = new Set();
let explorerMapReady = false;

const normalizeString = (value) => (value || '').toString().trim();
const normalizeApi = (value) => normalizeString(value).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const normalizeMatch = (value) => normalizeString(value).toUpperCase();

const getFilterValues = () => ({
  operator: normalizeMatch(explorerElements.operator?.value),
  ownerList: normalizeMatch(explorerElements.ownerList?.value),
  api: normalizeMatch(explorerElements.api?.value),
  status: normalizeMatch(explorerElements.status?.value),
  name: normalizeMatch(explorerElements.name?.value),
  trajectory: normalizeMatch(explorerElements.trajectory?.value),
  county: normalizeMatch(explorerElements.county?.value),
});

const isMatch = (sourceValue, filterValue) => {
  if (!filterValue) return true;
  const source = normalizeMatch(sourceValue);
  return source.includes(filterValue);
};

const parseCsvApis = (value) => {
  if (!value) return [];
  return value
    .split(/\s|,|;/)
    .map((entry) => normalizeApi(entry))
    .filter(Boolean);
};

const buildOptionList = (values, target) => {
  if (!target) return;
  target.innerHTML = '';
  const unique = [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  unique.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    target.appendChild(option);
  });
};

const setStatValue = (element, value) => {
  if (!element) return;
  element.textContent = value.toLocaleString('en-US');
};

const buildExplorerOptions = () => {
  buildOptionList(allExplorerWells.map((well) => well.operator), explorerOptionTargets.operator);
  buildOptionList(allExplorerWells.map((well) => well.owner_list), explorerOptionTargets.ownerList);
  buildOptionList(allExplorerWells.map((well) => well.api_uwi), explorerOptionTargets.api);
  buildOptionList(allExplorerWells.map((well) => well.status), explorerOptionTargets.status);
  buildOptionList(allExplorerWells.map((well) => well.name), explorerOptionTargets.name);
  buildOptionList(allExplorerWells.map((well) => well.trajectory), explorerOptionTargets.trajectory);
  buildOptionList(allExplorerWells.map((well) => well.county), explorerOptionTargets.county);
};

const filterExplorerWells = () => {
  const filters = getFilterValues();
  return allExplorerWells.filter((well) => {
    if (!isMatch(well.operator, filters.operator)) return false;
    if (!isMatch(well.owner_list, filters.ownerList)) return false;
    if (!isMatch(well.api_uwi, filters.api)) return false;
    if (!isMatch(well.status, filters.status)) return false;
    if (!isMatch(well.name, filters.name)) return false;
    if (!isMatch(well.trajectory, filters.trajectory)) return false;
    if (!isMatch(well.county, filters.county)) return false;
    return true;
  });
};

const updateMatchCount = () => {
  const matches = filterExplorerWells();
  setStatValue(explorerElements.matchCount, matches.length);
  return matches;
};

const updateSelectedCount = () => {
  setStatValue(explorerElements.selectedCount, selectedExplorerApis.size);
};

const updateUserWellDataFromSelection = () => {
  if (typeof userWellData === 'undefined') return;
  const selected = allExplorerWells.filter((well) => selectedExplorerApis.has(well.api_uwi));
  userWellData = {
    api_uwi: selected.map((well) => well.api_uwi),
    name: selected.map((well) => well.name),
    operator: selected.map((well) => well.operator),
    trajectory: selected.map((well) => well.trajectory),
    owner_interest: selected.map(() => 0),
    pv17: selected.map(() => 0),
    dca_approved: selected.map(() => false),
    lat: selected.map((well) => well.latitude),
    lon: selected.map((well) => well.longitude),
    lat_bh: selected.map((well) => well.latitude_bh),
    lon_bh: selected.map((well) => well.longitude_bh),
  };
  if (typeof buildWellEditorSelect === 'function') {
    buildWellEditorSelect();
  }
};

const renderSelectedTable = () => {
  if (!explorerElements.table) return;
  const tbody = explorerElements.table.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const selected = allExplorerWells.filter((well) => selectedExplorerApis.has(well.api_uwi));
  if (selected.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = 'No wells selected.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  selected.forEach((well) => {
    const row = document.createElement('tr');
    row.dataset.api = well.api_uwi;

    const editCell = document.createElement('td');
    editCell.classList.add('well-edit-cell');
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.classList.add('well-edit-button');
    editButton.setAttribute('aria-label', `Edit well ${well.api_uwi}`);
    editButton.textContent = '✎';
    editButton.dataset.api = well.api_uwi;
    editCell.appendChild(editButton);
    row.appendChild(editCell);

    const cells = [
      well.api_uwi,
      well.name,
      well.operator,
      well.status,
      well.trajectory,
      well.county,
      well.owner_list,
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value || '';
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  if (!tbody.dataset.editListener) {
    tbody.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.classList?.contains('well-edit-button')) return;
      const api = target.dataset.api;
      if (api && typeof window.openWellEditor === 'function') {
        window.openWellEditor(api);
      }
    });
    tbody.dataset.editListener = 'true';
  }
};

const updateSelectionViews = () => {
  updateSelectedCount();
  renderSelectedTable();
  updateUserWellDataFromSelection();
  renderExplorerMap();
};

const addSelection = (apis) => {
  apis.forEach((api) => selectedExplorerApis.add(api));
  updateSelectionViews();
};

const replaceSelection = (apis) => {
  selectedExplorerApis.clear();
  apis.forEach((api) => selectedExplorerApis.add(api));
  updateSelectionViews();
};

const getMapZoomForBounds = (latMin, latMax, lonMin, lonMax) => {
  const maxDiff = Math.max(latMax - latMin, lonMax - lonMin);
  if (maxDiff > 4) return 6;
  if (maxDiff > 2) return 7;
  if (maxDiff > 1) return 8;
  if (maxDiff > 0.5) return 9;
  if (maxDiff > 0.25) return 10;
  if (maxDiff > 0.1) return 11;
  return 12;
};

const renderExplorerMap = () => {
  const mapDiv = document.getElementById(WELL_EXPLORER_MAP_ID);
  if (!mapDiv || !window.Plotly) return;

  const mapPoints = mapWells;
  if (!mapPoints.length) return;

  const colors = mapPoints.map((well) => (selectedExplorerApis.has(well.api_uwi) ? '#1e8f4e' : '#d62828'));

  const trace = {
    type: 'scattermapbox',
    lat: mapPoints.map((well) => well.latitude),
    lon: mapPoints.map((well) => well.longitude),
    text: mapPoints.map(
      (well) =>
        `API: ${well.api_uwi}<br>Name: ${well.name || ''}<br>Operator: ${well.operator || ''}<br>Status: ${well.status || ''}`
    ),
    mode: 'markers',
    marker: {
      size: 9,
      color: colors,
      line: { color: '#000', width: 1 },
    },
    customdata: mapPoints.map((well) => [well.api_uwi]),
    hoverinfo: 'text',
  };

  const selectedPoints = mapPoints.filter((well) => selectedExplorerApis.has(well.api_uwi));
  const pointsForExtent = selectedPoints.length ? selectedPoints : mapPoints;
  const latValues = pointsForExtent.map((well) => well.latitude);
  const lonValues = pointsForExtent.map((well) => well.longitude);
  const latMin = Math.min(...latValues);
  const latMax = Math.max(...latValues);
  const lonMin = Math.min(...lonValues);
  const lonMax = Math.max(...lonValues);
  const center = {
    lat: (latMin + latMax) / 2,
    lon: (lonMin + lonMax) / 2,
  };

  const layout = {
    paper_bgcolor: '#156082',
    plot_bgcolor: '#156082',
    font: { color: '#eaeaea' },
    mapbox: {
      accesstoken: MAPBOX_TOKEN,
      style: getMapStyle(WELL_EXPLORER_MAP_ID),
      center,
      zoom: getMapZoomForBounds(latMin, latMax, lonMin, lonMax),
    },
    margin: { t: 10, r: 10, b: 10, l: 10 },
    height: mapDiv.getBoundingClientRect().height || 480,
  };

  if (!explorerMapReady) {
    Plotly.newPlot(WELL_EXPLORER_MAP_ID, [trace], layout, { ...BASE_PLOT_CONFIG });
    explorerMapReady = true;
  } else {
    Plotly.react(WELL_EXPLORER_MAP_ID, [trace], layout, { ...BASE_PLOT_CONFIG });
  }

  mapDiv.removeAllListeners('plotly_click');
  mapDiv.on('plotly_click', (event) => {
    const point = event?.points?.[0];
    const api = point?.customdata?.[0];
    if (!api) return;
    selectedExplorerApis.add(api);
    updateSelectionViews();
  });
};

const hydrateMapData = () => {
  mapWells = allExplorerWells.filter((well) => Number.isFinite(well.latitude) && Number.isFinite(well.longitude));
  mapIndexByApi = new Map();
  allExplorerWells.forEach((well, index) => {
    mapIndexByApi.set(well.api_uwi, index);
    const normalized = normalizeApi(well.api_uwi);
    if (normalized) {
      mapIndexByApi.set(normalized, index);
    }
  });
};

const hydrateExplorerData = (wells) => {
  allExplorerWells = wells || [];
  buildExplorerOptions();
  hydrateMapData();
  updateMatchCount();
  updateSelectedCount();
  renderExplorerMap();
  renderSelectedTable();
};

const fetchExplorerData = async () => {
  const response = await fetch(WELL_EXPLORER_ENDPOINT);
  if (!response.ok) {
    throw new Error(`Unable to load wells (${response.status}).`);
  }
  const payload = await response.json();
  const wells = (payload.wells || []).map((well) => ({
    api_uwi: normalizeString(well.api_uwi),
    owner_list: normalizeString(well.owner_list),
    operator: normalizeString(well.operator),
    status: normalizeString(well.status),
    name: normalizeString(well.name),
    trajectory: normalizeString(well.trajectory),
    county: normalizeString(well.county),
    latitude: typeof well.latitude === 'number' ? well.latitude : Number(well.latitude),
    longitude: typeof well.longitude === 'number' ? well.longitude : Number(well.longitude),
    latitude_bh: typeof well.latitude_bh === 'number' ? well.latitude_bh : Number(well.latitude_bh),
    longitude_bh: typeof well.longitude_bh === 'number' ? well.longitude_bh : Number(well.longitude_bh),
  }));
  hydrateExplorerData(wells);
};

const applyFilterActions = () => {
  explorerElements.addFilters?.addEventListener('click', () => {
    const matches = filterExplorerWells();
    const apis = matches.map((well) => well.api_uwi).filter(Boolean);
    addSelection(apis);
  });

  explorerElements.replaceFilters?.addEventListener('click', () => {
    const matches = filterExplorerWells();
    const apis = matches.map((well) => well.api_uwi).filter(Boolean);
    replaceSelection(apis);
  });

  explorerElements.clearSelection?.addEventListener('click', () => {
    selectedExplorerApis.clear();
    updateSelectionViews();
  });

  const refreshMatches = () => {
    updateMatchCount();
  };

  Object.values(explorerElements).forEach((element) => {
    if (!element || element.tagName !== 'INPUT') return;
    element.addEventListener('input', refreshMatches);
  });
};

const applyCsvActions = () => {
  const applyCsvList = (mode) => {
    const values = parseCsvApis(explorerElements.csvInput?.value);
    if (!values.length) return;
    const apis = values
      .map((api) => {
        const index = mapIndexByApi.get(api);
        return Number.isInteger(index) ? allExplorerWells[index]?.api_uwi : null;
      })
      .filter(Boolean);
    if (mode === 'replace') {
      replaceSelection(apis);
    } else {
      addSelection(apis);
    }
  };

  explorerElements.applyCsv?.addEventListener('click', () => applyCsvList('add'));
  explorerElements.replaceCsv?.addEventListener('click', () => applyCsvList('replace'));
};

const initWellExplorer = async () => {
  if (!document.getElementById('wellExplorerMap')) return;
  try {
    await fetchExplorerData();
  } catch (error) {
    console.error('Failed to load well explorer data', error);
  }

  applyFilterActions();
  applyCsvActions();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWellExplorer, { once: true });
} else {
  initWellExplorer();
}
