(() => {
  const mapContainer = document.getElementById('wellExplorerMap');
  if (!mapContainer) return;

  const statusEl = document.getElementById('wellExplorerStatus');
  const countEl = document.getElementById('wellExplorerCount');
  const selectionCountEl = document.getElementById('wellExplorerSelectionCount');
  const selectionBody = document.getElementById('wellExplorerSelectionBody');
  const clearButton = document.getElementById('wellExplorerClear');
  const applyCsvButton = document.getElementById('wellExplorerApplyCsv');
  const csvInput = document.getElementById('wellExplorerApiCsv');

  const filterInputs = {
    envoperator: document.getElementById('filterEnvOperator'),
    owner_list: document.getElementById('filterOwnerList'),
    api_uwi: document.getElementById('filterApi'),
    envwellstatus: document.getElementById('filterStatus'),
    wellname: document.getElementById('filterWellName'),
    trajectory: document.getElementById('filterTrajectory'),
    county: document.getElementById('filterCounty')
  };

  const filterLists = {
    envoperator: document.getElementById('filterEnvOperatorList'),
    owner_list: document.getElementById('filterOwnerListValues'),
    api_uwi: document.getElementById('filterApiList'),
    envwellstatus: document.getElementById('filterStatusList'),
    wellname: document.getElementById('filterWellNameList'),
    trajectory: document.getElementById('filterTrajectoryList'),
    county: document.getElementById('filterCountyList')
  };

  const MAPBOX_TOKEN = 'pk.eyJ1Ijoid2VsbG1hcHBlZCIsImEiOiJjbGlreXVsMWowNDg5M2ZxcGZucDV5bnIwIn0.5wYuJnmZvUbHZh9M580M-Q';
  const MAPBOX_STYLE = 'mapbox://styles/wellmapped/clixrm3dg00fy01pzehcncxie';

  const state = {
    wells: [],
    filters: {},
    filterSelected: new Set(),
    manualSelected: new Set(),
    selectedWells: []
  };

  const normalizeValue = (value) => (value || '').toString().trim();
  const normalizeApi = (value) => normalizeValue(value).replace(/-/g, '').replace(/\s+/g, '');

  const setStatus = (message, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#dc2626' : '#64748b';
  };

  const parseCsvApis = () => {
    const raw = csvInput?.value || '';
    return raw
      .split(/[\n,]+/)
      .map((entry) => normalizeApi(entry))
      .filter((entry) => entry.length > 0);
  };

  const applyFilters = () => {
    const filters = {
      envoperator: normalizeValue(filterInputs.envoperator?.value).toLowerCase(),
      owner_list: normalizeValue(filterInputs.owner_list?.value).toLowerCase(),
      api_uwi: normalizeValue(filterInputs.api_uwi?.value).toLowerCase(),
      envwellstatus: normalizeValue(filterInputs.envwellstatus?.value).toLowerCase(),
      wellname: normalizeValue(filterInputs.wellname?.value).toLowerCase(),
      trajectory: normalizeValue(filterInputs.trajectory?.value).toLowerCase(),
      county: normalizeValue(filterInputs.county?.value).toLowerCase()
    };

    const csvApis = new Set(parseCsvApis());

    const hasActiveFilters = Object.values(filters).some((value) => value.length > 0) || csvApis.size > 0;

    const matches = hasActiveFilters
      ? state.wells.filter((well) => {
      const api = normalizeValue(well.api_uwi);
      const matchesCsv = csvApis.size === 0 || csvApis.has(normalizeApi(api));
      if (!matchesCsv) return false;

      return Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        const fieldValue = normalizeValue(well[key]).toLowerCase();
        return fieldValue.includes(value);
      });
    })
      : [];

    state.filterSelected = new Set(matches.map((well) => well.api_uwi));
    updateSelection();
  };

  const updateSelection = () => {
    const selectedSet = new Set([...state.filterSelected, ...state.manualSelected]);
    state.selectedWells = state.wells.filter((well) => selectedSet.has(well.api_uwi));

    const selectedCount = state.selectedWells.length;
    if (countEl) {
      countEl.textContent = `${selectedCount.toLocaleString()} selected`;
    }
    if (selectionCountEl) {
      selectionCountEl.textContent = `${selectedCount.toLocaleString()} wells selected`;
    }

    renderSelectionTable();
    renderMap();
    syncWellEditorData();
  };

  const renderSelectionTable = () => {
    if (!selectionBody) return;
    selectionBody.innerHTML = '';

    if (!state.selectedWells.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'well-explorer__empty';
      cell.textContent = 'No wells selected yet.';
      row.appendChild(cell);
      selectionBody.appendChild(row);
      return;
    }

    state.selectedWells.forEach((well) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${well.api_uwi || '--'}</td>
        <td>${well.wellname || '--'}</td>
        <td>${well.envoperator || '--'}</td>
        <td>${well.county || '--'}</td>
        <td>${well.envwellstatus || '--'}</td>
        <td>${well.owner_list || '--'}</td>
        <td><button type="button" class="well-explorer__edit" data-api="${well.api_uwi}">Edit</button></td>
      `;
      selectionBody.appendChild(row);
    });
  };

  const syncWellEditorData = () => {
    if (typeof window.setUserWellData !== 'function') return;
    const payload = {
      api_uwi: [],
      name: [],
      owner_interest: [],
      dca_approved: [],
      pv17: []
    };

    state.selectedWells.forEach((well) => {
      payload.api_uwi.push(well.api_uwi);
      payload.name.push(well.wellname || well.api_uwi);
      payload.owner_interest.push(0);
      payload.dca_approved.push(false);
      payload.pv17.push(null);
    });

    window.setUserWellData(payload);
  };

  const getZoomForBounds = (latMin, latMax, lonMin, lonMax) => {
    const maxDiff = Math.max(latMax - latMin, lonMax - lonMin);
    if (maxDiff > 8) return 5;
    if (maxDiff > 4) return 6;
    if (maxDiff > 2) return 7;
    if (maxDiff > 1) return 8;
    if (maxDiff > 0.5) return 9;
    if (maxDiff > 0.25) return 10;
    if (maxDiff > 0.1) return 11;
    return 12;
  };

  const getBounds = (wells) => {
    if (!wells.length) return null;
    let latMin = Infinity;
    let latMax = -Infinity;
    let lonMin = Infinity;
    let lonMax = -Infinity;
    wells.forEach((well) => {
      latMin = Math.min(latMin, well.lat);
      latMax = Math.max(latMax, well.lat);
      lonMin = Math.min(lonMin, well.lon);
      lonMax = Math.max(lonMax, well.lon);
    });
    return { latMin, latMax, lonMin, lonMax };
  };

  const renderMap = () => {
    if (!window.Plotly) return;

    const allWells = state.wells;
    const selectedWells = state.selectedWells;

    const allTrace = {
      type: 'scattermapbox',
      lat: allWells.map((well) => well.lat),
      lon: allWells.map((well) => well.lon),
      text: allWells.map((well) => `${well.api_uwi || 'Well'}<br>${well.wellname || ''}`),
      mode: 'markers',
      marker: {
        size: 6,
        color: '#94a3b8',
        opacity: 0.7
      },
      hoverinfo: 'text',
      name: 'All owner wells'
    };

    const selectedTrace = {
      type: 'scattermapbox',
      lat: selectedWells.map((well) => well.lat),
      lon: selectedWells.map((well) => well.lon),
      text: selectedWells.map((well) => `${well.api_uwi || 'Well'}<br>${well.wellname || ''}`),
      mode: 'markers',
      marker: {
        size: 9,
        color: '#16a34a',
        line: { color: '#0f172a', width: 1 }
      },
      hoverinfo: 'text',
      name: 'Selected wells'
    };

    const bounds = getBounds(selectedWells.length ? selectedWells : allWells) || {
      latMin: 31.0,
      latMax: 31.0,
      lonMin: -99.0,
      lonMax: -99.0
    };

    const center = {
      lat: (bounds.latMin + bounds.latMax) / 2,
      lon: (bounds.lonMin + bounds.lonMax) / 2
    };

    const zoom = getZoomForBounds(bounds.latMin, bounds.latMax, bounds.lonMin, bounds.lonMax);

    const layout = {
      paper_bgcolor: '#0f172a',
      plot_bgcolor: '#0f172a',
      font: { color: '#e2e8f0' },
      mapbox: {
        accesstoken: MAPBOX_TOKEN,
        style: MAPBOX_STYLE,
        center,
        zoom
      },
      margin: { t: 10, r: 10, b: 10, l: 10 },
      height: mapContainer.clientHeight || 480,
      showlegend: false
    };

    window.Plotly.react(mapContainer, [allTrace, selectedTrace], layout, { scrollZoom: false, responsive: true });

    if (typeof mapContainer.removeAllListeners === 'function') {
      mapContainer.removeAllListeners('plotly_click');
    }

    mapContainer.on('plotly_click', (event) => {
      const point = event.points?.[0];
      if (!point || point.curveNumber !== 0) return;
      const well = allWells[point.pointIndex];
      if (!well || !well.api_uwi) return;
      state.manualSelected.add(well.api_uwi);
      updateSelection();
    });
  };

  const updateFilterOptions = (filters) => {
    Object.entries(filters).forEach(([key, values]) => {
      const list = filterLists[key];
      if (!list) return;
      list.innerHTML = '';
      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        list.appendChild(option);
      });
    });
  };

  const clearSelection = () => {
    state.filterSelected.clear();
    state.manualSelected.clear();
    if (csvInput) csvInput.value = '';
    Object.values(filterInputs).forEach((input) => {
      if (input) input.value = '';
    });
    updateSelection();
  };

  const attachListeners = () => {
    Object.values(filterInputs).forEach((input) => {
      if (!input) return;
      input.addEventListener('input', applyFilters);
    });

    applyCsvButton?.addEventListener('click', applyFilters);
    clearButton?.addEventListener('click', clearSelection);

    selectionBody?.addEventListener('click', (event) => {
      const target = event.target.closest('[data-api]');
      if (!target) return;
      const api = target.dataset.api;
      if (api && typeof window.openWellEditor === 'function') {
        window.openWellEditor(api);
      }
    });
  };

  const loadWells = async () => {
    try {
      setStatus('Loading wells…');
      const response = await fetch('/api/well-explorer-data/');
      if (!response.ok) {
        throw new Error('Unable to load wells.');
      }
      const data = await response.json();
      state.wells = data.wells || [];
      state.filters = data.filters || {};
      updateFilterOptions(state.filters);
      setStatus(`Loaded ${state.wells.length.toLocaleString()} owner wells.`);
      applyFilters();
    } catch (error) {
      setStatus(error.message || 'Unable to load wells.', true);
      console.error('Well explorer load error', error);
    }
  };

  attachListeners();
  loadWells();
})();
