(() => {
  const filtersContainer = document.getElementById('wellExplorerFilters');
  if (!filtersContainer) return;

  const applyFiltersButton = document.getElementById('applyWellExplorerFilters');
  const clearFiltersButton = document.getElementById('clearWellExplorerFilters');
  const clearSelectionButton = document.getElementById('clearWellExplorerSelection');
  const csvTextarea = document.getElementById('wellExplorerCsv');
  const applyCsvButton = document.getElementById('applyWellExplorerCsv');
  const tableBody = document.getElementById('wellExplorerTableBody');
  const selectedCount = document.getElementById('wellExplorerSelectedCount');
  const mapDiv = document.getElementById('wellExplorerMap');
  const wellsetSelect = document.getElementById('wellExplorerWellsetSelect');
  const wellsetNameInput = document.getElementById('wellExplorerWellsetName');
  const saveWellsetButton = document.getElementById('saveWellsetButton');
  const wellsetStatus = document.getElementById('wellExplorerWellsetStatus');

  const FILTER_FIELDS = [
    { key: 'envoperator', label: 'ENV Operator' },
    { key: 'owner_list', label: 'Owner List' },
    { key: 'api_uwi', label: 'API/UWI' },
    { key: 'envwellstatus', label: 'Well Status' },
    { key: 'wellname', label: 'Well Name' },
    { key: 'trajectory', label: 'Trajectory' },
    { key: 'county', label: 'County' },
  ];

  const state = {
    wells: [],
    filters: {},
    selectedApis: new Set(),
    csvApis: new Set(),
    wellMap: new Map(),
    normalizedWellMap: new Map(),
    wellsets: new Map(),
  };

  const filterInputs = {};
  let mapInitialized = false;

  const MAPBOX_TOKEN = 'pk.eyJ1Ijoid2VsbG1hcHBlZCIsImEiOiJjbGlreXVsMWowNDg5M2ZxcGZucDV5bnIwIn0.5wYuJnmZvUbHZh9M580M-Q';
  const MAPBOX_STYLE = 'mapbox://styles/wellmapped/clixrm3dg00fy01pzehcncxie';
  const BASE_PLOT_CONFIG = {
    responsive: true,
    scrollZoom: false,
    displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'zoom2d'],
  };

  const normalizeValue = (value) => String(value || '').trim().toLowerCase();
  const normalizeApi = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normalizeWellsetName = (value) => String(value || '').trim().toLowerCase();

  const getCookie = (name) => {
    if (!document.cookie) return null;
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(`${name}=`)) {
        return decodeURIComponent(trimmed.slice(name.length + 1));
      }
    }
    return null;
  };

  const getMatchingWells = () => {
    const criteria = FILTER_FIELDS.reduce((acc, field) => {
      const input = filterInputs[field.key];
      if (input && input.value.trim()) {
        acc[field.key] = normalizeValue(input.value);
      }
      return acc;
    }, {});

    const csvSet = state.csvApis;
    return state.wells.filter((well) => {
      if (!well.api_uwi) return false;

      if (csvSet.size > 0) {
        const normalized = normalizeApi(well.api_uwi).slice(0, 10);
        if (!csvSet.has(normalized)) {
          return false;
        }
      }

      return Object.entries(criteria).every(([key, value]) => {
        const fieldValue = normalizeValue(well[key]);
        return fieldValue.includes(value);
      });
    });
  };

  const updateSelectedCount = () => {
    if (selectedCount) {
      selectedCount.textContent = String(state.selectedApis.size);
    }
  };

  const updateWellEditorData = () => {
    if (typeof window.setWellEditorData !== 'function') return;
    const selected = Array.from(state.selectedApis)
      .map((api) => state.wellMap.get(api))
      .filter(Boolean);

    const payload = {
      api_uwi: selected.map((well) => well.api_uwi),
      name: selected.map((well) => well.wellname || well.api_uwi),
      owner_interest: selected.map(() => 1),
      pv17: selected.map(() => 0),
      dca_approved: selected.map((well) => Boolean(well.dca_approved)),
    };
    window.setWellEditorData(payload);
  };

  const setWellsetStatus = (message, isSaved) => {
    if (!wellsetStatus) return;
    wellsetStatus.textContent = message;
    wellsetStatus.classList.toggle('is-saved', Boolean(isSaved));
    wellsetStatus.classList.toggle('is-unsaved', !isSaved);
  };

  const getCurrentWellsetName = () => {
    if (!wellsetNameInput) return '';
    return wellsetNameInput.value.trim();
  };

  const getNormalizedSelection = () => new Set(
    Array.from(state.selectedApis).map((api) => normalizeApi(api))
  );

  const updateWellsetStatus = () => {
    const name = getCurrentWellsetName();
    if (!name) {
      setWellsetStatus('Wellset not saved yet', false);
      return;
    }
    const key = normalizeWellsetName(name);
    const savedWellset = state.wellsets.get(key);
    if (!savedWellset) {
      setWellsetStatus('Wellset not saved yet', false);
      return;
    }
    const normalizedSaved = new Set((savedWellset.apis || []).map((api) => normalizeApi(api)));
    const normalizedSelected = getNormalizedSelection();
    const isMatch = normalizedSaved.size === normalizedSelected.size
      && Array.from(normalizedSelected).every((api) => normalizedSaved.has(api));
    setWellsetStatus(isMatch ? 'Wellset saved' : 'Wellset not saved yet', isMatch);
  };

  const renderTable = () => {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const selected = Array.from(state.selectedApis)
      .map((api) => state.wellMap.get(api))
      .filter(Boolean);

    if (!selected.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'well-explorer-table__empty';
      cell.textContent = 'No wells selected yet.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    selected.forEach((well) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${well.api_uwi || '--'}</td>
        <td>${well.wellname || '--'}</td>
        <td>${well.county || '--'}</td>
        <td>${well.envoperator || '--'}</td>
        <td>${well.envwellstatus || '--'}</td>
        <td>${well.trajectory || '--'}</td>
        <td>
          <button type="button" class="well-explorer-edit-button" data-api="${well.api_uwi || ''}">
            Edit
          </button>
          <button type="button" class="well-explorer-remove-button" data-api="${well.api_uwi || ''}">
            Remove
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  };

  const computeMapViewport = (latitudes, longitudes) => {
    if (!latitudes.length || !longitudes.length) {
      return { center: { lat: 31.0, lon: -99.0 }, zoom: 4 };
    }
    const latMin = Math.min(...latitudes);
    const latMax = Math.max(...latitudes);
    const lonMin = Math.min(...longitudes);
    const lonMax = Math.max(...longitudes);
    const center = { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
    const maxDiff = Math.max(latMax - latMin, lonMax - lonMin);
    let zoom = 10;
    if (maxDiff > 4) zoom = 5;
    else if (maxDiff > 2) zoom = 6;
    else if (maxDiff > 1) zoom = 7;
    else if (maxDiff > 0.5) zoom = 8;
    else if (maxDiff > 0.25) zoom = 9;
    else if (maxDiff > 0.1) zoom = 10;
    else zoom = 11;
    return { center, zoom };
  };

  const updateMapSelection = () => {
    if (!mapDiv || !mapInitialized) return;
    const selectedWells = Array.from(state.selectedApis)
      .map((api) => state.wellMap.get(api))
      .filter((well) => well && Number.isFinite(well.lat) && Number.isFinite(well.lon));

    const selectedLat = selectedWells.map((well) => well.lat);
    const selectedLon = selectedWells.map((well) => well.lon);
    const selectedApi = selectedWells.map((well) => well.api_uwi);

    Plotly.restyle(mapDiv, { lat: [selectedLat], lon: [selectedLon], customdata: [selectedApi] }, [1]);

    const fallbackLat = state.wells.map((well) => well.lat).filter((value) => Number.isFinite(value));
    const fallbackLon = state.wells.map((well) => well.lon).filter((value) => Number.isFinite(value));
    const viewport = selectedLat.length
      ? computeMapViewport(selectedLat, selectedLon)
      : computeMapViewport(fallbackLat, fallbackLon);
    Plotly.relayout(mapDiv, {
      'mapbox.center': viewport.center,
      'mapbox.zoom': viewport.zoom,
    });
  };

  const updateSelection = (apis) => {
    state.selectedApis = new Set(apis.filter(Boolean));
    updateSelectedCount();
    renderTable();
    updateMapSelection();
    updateWellEditorData();
    updateWellsetStatus();
  };

  const renderMap = () => {
    if (!mapDiv) return;
    const validWells = state.wells.filter(
      (well) => Number.isFinite(well.lat) && Number.isFinite(well.lon)
    );
    const lat = validWells.map((well) => well.lat);
    const lon = validWells.map((well) => well.lon);
    const api = validWells.map((well) => well.api_uwi);

    const viewport = computeMapViewport(lat, lon);

    const traces = [
      {
        type: 'scattermapbox',
        lat,
        lon,
        mode: 'markers',
        marker: { size: 6, color: '#94a3b8' },
        customdata: api,
        hovertemplate: '%{customdata}<extra></extra>',
        name: 'Available wells',
      },
      {
        type: 'scattermapbox',
        lat: [],
        lon: [],
        mode: 'markers',
        marker: { size: 8, color: '#22c55e' },
        customdata: [],
        hovertemplate: '%{customdata}<extra></extra>',
        name: 'Selected wells',
      },
    ];

    const layout = {
      paper_bgcolor: '#156082',
      plot_bgcolor: '#156082',
      font: { color: '#e8f5fb' },
      mapbox: {
        accesstoken: MAPBOX_TOKEN,
        style: MAPBOX_STYLE,
        center: viewport.center,
        zoom: viewport.zoom,
      },
      margin: { t: 10, r: 10, b: 10, l: 10 },
      showlegend: false,
      dragmode: 'pan',
    };

    Plotly.newPlot(mapDiv, traces, layout, { ...BASE_PLOT_CONFIG });
    mapInitialized = true;

    mapDiv.on('plotly_click', (event) => {
      const point = event.points?.[0];
      const apiValue = point?.customdata;
      if (!apiValue) return;
      if (!state.selectedApis.has(apiValue)) {
        state.selectedApis.add(apiValue);
        updateSelectedCount();
        renderTable();
        updateMapSelection();
        updateWellEditorData();
        updateWellsetStatus();
      }
    });
  };

  const buildFilters = () => {
    filtersContainer.innerHTML = '';
    FILTER_FIELDS.forEach((field) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'well-explorer-filter';
      const label = document.createElement('span');
      label.className = 'well-explorer-filter__label';
      label.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'well-explorer-input';
      input.placeholder = `Filter by ${field.label}`;
      const listId = `wellExplorerList-${field.key}`;
      input.setAttribute('list', listId);
      const datalist = document.createElement('datalist');
      datalist.id = listId;
      const values = state.filters[field.key] || [];
      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        datalist.appendChild(option);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(datalist);
      filtersContainer.appendChild(wrapper);
      filterInputs[field.key] = input;
    });
  };

  const applyFilters = () => {
    const matching = getMatchingWells().map((well) => well.api_uwi);
    updateSelection(matching);
  };

  const clearFilters = () => {
    Object.values(filterInputs).forEach((input) => {
      input.value = '';
    });
    state.csvApis = new Set();
    if (csvTextarea) {
      csvTextarea.value = '';
    }
  };

  const parseCsv = () => {
    const text = csvTextarea?.value || '';
    const lines = text.split(/[\n,]+/);
    const normalized = lines
      .map((entry) => entry.trim())
      .filter((entry) => entry && !['api_uwi', 'api10'].includes(entry.toLowerCase()))
      .map((entry) => normalizeApi(entry).slice(0, 10))
      .filter(Boolean);
    return new Set(normalized);
  };

  const attachListeners = () => {
    if (applyFiltersButton) {
      applyFiltersButton.addEventListener('click', applyFilters);
    }
    if (clearFiltersButton) {
      clearFiltersButton.addEventListener('click', () => {
        clearFilters();
        applyFilters();
      });
    }
    if (clearSelectionButton) {
      clearSelectionButton.addEventListener('click', () => updateSelection([]));
    }
    if (applyCsvButton) {
      applyCsvButton.addEventListener('click', () => {
        state.csvApis = parseCsv();
        applyFilters();
      });
    }
    if (wellsetSelect) {
      wellsetSelect.addEventListener('change', () => {
        const selectedName = wellsetSelect.value;
        if (wellsetNameInput) {
          wellsetNameInput.value = selectedName;
        }
        if (!selectedName) {
          updateWellsetStatus();
          return;
        }
        const key = normalizeWellsetName(selectedName);
        const wellset = state.wellsets.get(key);
        if (!wellset) {
          updateWellsetStatus();
          return;
        }
        const mappedApis = (wellset.apis || [])
          .map((api) => state.normalizedWellMap.get(normalizeApi(api)))
          .filter(Boolean);
        updateSelection(mappedApis);
      });
    }
    if (wellsetNameInput) {
      wellsetNameInput.addEventListener('input', () => {
        const name = getCurrentWellsetName();
        if (wellsetSelect) {
          const key = normalizeWellsetName(name);
          const wellset = state.wellsets.get(key);
          wellsetSelect.value = wellset ? wellset.name : '';
        }
        updateWellsetStatus();
      });
    }
    if (saveWellsetButton) {
      saveWellsetButton.addEventListener('click', async () => {
        const name = getCurrentWellsetName();
        if (!name) {
          setWellsetStatus('Enter a wellset name to save.', false);
          return;
        }
        if (state.selectedApis.size === 0) {
          setWellsetStatus('Select wells before saving.', false);
          return;
        }
        try {
          const response = await fetch('/well-explorer/wellsets/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCookie('csrftoken') || '',
            },
            body: JSON.stringify({
              wellset_name: name,
              apis: Array.from(state.selectedApis),
            }),
          });
          if (!response.ok) {
            throw new Error(`Save failed (${response.status})`);
          }
          const payload = await response.json();
          const saved = payload.wellset;
          if (saved && saved.name) {
            state.wellsets.set(normalizeWellsetName(saved.name), {
              name: saved.name,
              apis: saved.apis || [],
            });
            buildWellsetOptions();
            if (wellsetNameInput) {
              wellsetNameInput.value = saved.name;
            }
            if (wellsetSelect) {
              wellsetSelect.value = saved.name;
            }
            updateWellsetStatus();
          }
        } catch (error) {
          console.error('Wellset save failed', error);
          setWellsetStatus('Wellset not saved yet', false);
        }
      });
    }
    if (tableBody) {
      tableBody.addEventListener('click', (event) => {
        const editButton = event.target.closest('.well-explorer-edit-button');
        if (editButton) {
          const api = editButton.dataset.api;
          if (api && typeof window.openWellEditor === 'function') {
            window.openWellEditor(api);
          }
          return;
        }
        const removeButton = event.target.closest('.well-explorer-remove-button');
        if (removeButton) {
          const api = removeButton.dataset.api;
          if (api) {
            const updated = Array.from(state.selectedApis).filter((entry) => entry !== api);
            updateSelection(updated);
          }
        }
      });
    }
  };

  const buildWellsetOptions = () => {
    if (!wellsetSelect) return;
    const currentValue = wellsetSelect.value;
    wellsetSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a saved wellset';
    wellsetSelect.appendChild(placeholder);
    Array.from(state.wellsets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([, value]) => {
        const option = document.createElement('option');
        option.value = value.name;
        option.textContent = value.name;
        wellsetSelect.appendChild(option);
      });
    wellsetSelect.value = currentValue || '';
  };

  const loadWellsets = async () => {
    const response = await fetch('/well-explorer/wellsets/');
    if (!response.ok) {
      throw new Error(`Failed to load wellsets (${response.status})`);
    }
    const payload = await response.json();
    const entries = payload.wellsets || [];
    state.wellsets = new Map();
    entries.forEach((entry) => {
      const name = entry.name || '';
      if (!name) return;
      state.wellsets.set(normalizeWellsetName(name), {
        name,
        apis: entry.apis || [],
      });
    });
    buildWellsetOptions();
    updateWellsetStatus();
  };

  const init = async () => {
    try {
      const res = await fetch('/well-explorer/data/');
      if (!res.ok) {
        throw new Error(`Failed to load well explorer data (${res.status})`);
      }
      const payload = await res.json();
      state.wells = (payload.wells || []).filter((well) => well && well.api_uwi);
      state.filters = payload.filters || {};
      state.wells.forEach((well) => {
        state.wellMap.set(well.api_uwi, well);
        state.normalizedWellMap.set(normalizeApi(well.api_uwi), well.api_uwi);
      });

      buildFilters();
      attachListeners();
      renderMap();
      updateSelection([]);
      try {
        await loadWellsets();
      } catch (error) {
        console.error('Failed to load wellsets', error);
        setWellsetStatus('Wellset not saved yet', false);
      }
    } catch (error) {
      console.error('Well explorer init failed', error);
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="well-explorer-table__empty">Unable to load well explorer data.</td>
          </tr>
        `;
      }
    }
  };

  init();
})();
