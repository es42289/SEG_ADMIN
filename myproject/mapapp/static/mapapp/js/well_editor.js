(function () {
  const OIL_COLOR = '#1e8f4e';
  const GAS_COLOR = '#d62728';
  const FORECAST_DASH = 'dash';

  const modal = document.getElementById('wellEditorModal');
  const titleEl = document.getElementById('wellEditorTitle');
  const subtitleEl = document.getElementById('wellEditorSubtitle');
  const chartEl = document.getElementById('wellEditorChart');
  const controlsEl = document.getElementById('wellEditorControls');
  const saveButton = document.getElementById('wellEditorSave');
  const messageEl = document.getElementById('wellEditorMessage');

  const metrics = {
    grossOil: document.getElementById('wellEditorGrossOil'),
    grossGas: document.getElementById('wellEditorGrossGas'),
    netOil: document.getElementById('wellEditorNetOil'),
    netGas: document.getElementById('wellEditorNetGas'),
    remainingOil: document.getElementById('wellEditorRemainingOil'),
    remainingGas: document.getElementById('wellEditorRemainingGas'),
    nriValue: document.getElementById('wellEditorNriValue'),
  };

  const state = {
    api: null,
    production: [],
    params: {},
    lastProdDate: null,
    firstProdDate: null,
    nriFraction: null,
    baselineNetEur: null,
    baselinePv17: null,
  };

  const userWellsCache = { data: null, promise: null };

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '--';
    return Math.round(value).toLocaleString('en-US');
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return '--';
    return '$' + Math.round(value).toLocaleString('en-US');
  }

  function parseDate(value) {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1));
  }

  function formatDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }

  function addMonths(base, months) {
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
  }

  function monthsBetween(start, end) {
    return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  }

  function clampDate(value, min, max) {
    if (!value) return null;
    if (min && value < min) return min;
    if (max && value > max) return max;
    return value;
  }

  function numValue(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function calculateDeclineRates(qi, qf, declineType, bFactor, initialDecline, terminalDecline, maxMonths) {
    const rates = [];
    let currentRate = qi;

    if (declineType === 'EXP') {
      const monthlyDecline = 1 - Math.exp(-initialDecline / 12);
      while (currentRate > qf && rates.length < maxMonths) {
        rates.push(currentRate);
        currentRate *= 1 - monthlyDecline;
      }
      return rates;
    }

    let t = 0;
    const monthlyTerminal = 1 - Math.exp(-terminalDecline / 12);

    while (currentRate > qf && rates.length < maxMonths) {
      const currentDecline = initialDecline / (1 + bFactor * initialDecline * t / 12);

      if (currentDecline <= terminalDecline) {
        while (currentRate > qf && rates.length < maxMonths) {
          rates.push(currentRate);
          currentRate *= 1 - monthlyTerminal;
        }
        break;
      }

      rates.push(currentRate);
      currentRate = qi / Math.pow(1 + bFactor * initialDecline * (t + 1) / 12, 1 / bFactor);
      t += 1;
    }

    return rates;
  }

  function buildForecast(production, params) {
    const maxMonths = 600;
    const prodMonths = production
      .map((row) => parseDate(row.PRODUCINGMONTH || row.producingmonth))
      .filter(Boolean);

    const firstProdDate = prodMonths.length ? new Date(Math.min(...prodMonths.map((d) => d.getTime()))) : null;
    const lastProdDate = prodMonths.length ? new Date(Math.max(...prodMonths.map((d) => d.getTime()))) : null;

    const oilStart = clampDate(parseDate(params.FCST_START_OIL), firstProdDate, lastProdDate);
    const gasStart = clampDate(parseDate(params.FCST_START_GAS), firstProdDate, lastProdDate);

    let earliestStart = null;
    if (oilStart || gasStart) {
      earliestStart = [oilStart, gasStart].filter(Boolean).sort((a, b) => a - b)[0];
    }

    const forecastMap = new Map();

    if (earliestStart) {
      const dates = Array.from({ length: maxMonths }, (_, idx) => addMonths(earliestStart, idx));

      const gasQi = numValue(params.GAS_CALC_QI);
      const gasQf = numValue(params.GAS_Q_MIN);
      const gasDeclineType = params.GAS_DECLINE_TYPE || 'EXP';
      const gasDecline = numValue(params.GAS_EMPIRICAL_DI);
      const gasBFactor = Math.max(0.8, numValue(params.GAS_CALC_B_FACTOR, 0.8));
      const gasTerminal = numValue(params.GAS_D_MIN);

      if (gasStart) {
        const gasRates = calculateDeclineRates(
          gasQi,
          gasQf,
          gasDeclineType,
          gasBFactor,
          gasDecline,
          gasTerminal,
          maxMonths,
        );
        const gasOffset = Math.max(0, monthsBetween(earliestStart, gasStart));
        const gasLength = Math.min(gasRates.length, dates.length - gasOffset);
        for (let i = 0; i < gasLength; i++) {
          const idx = gasOffset + i;
          forecastMap.set(formatDate(dates[idx]), {
            ...(forecastMap.get(formatDate(dates[idx])) || {}),
            gas: gasRates[i],
          });
        }
      }

      const oilQi = numValue(params.OIL_CALC_QI);
      const oilQf = numValue(params.OIL_Q_MIN);
      const oilDeclineType = params.OIL_DECLINE_TYPE || 'HYP';
      const oilDecline = numValue(params.OIL_EMPIRICAL_DI);
      const oilBFactor = Math.max(0.8, numValue(params.OIL_CALC_B_FACTOR, 0.8));
      const oilTerminal = numValue(params.OIL_D_MIN);

      if (oilStart) {
        const oilRates = calculateDeclineRates(
          oilQi,
          oilQf,
          oilDeclineType,
          oilBFactor,
          oilDecline,
          oilTerminal,
          maxMonths,
        );
        const oilOffset = Math.max(0, monthsBetween(earliestStart, oilStart));
        const oilLength = Math.min(oilRates.length, dates.length - oilOffset);
        for (let i = 0; i < oilLength; i++) {
          const idx = oilOffset + i;
          forecastMap.set(formatDate(dates[idx]), {
            ...(forecastMap.get(formatDate(dates[idx])) || {}),
            oil: oilRates[i],
          });
        }
      }

      const cutoffYears = numValue(params.GAS_FCST_YRS, null);
      if (cutoffYears && earliestStart) {
        const cutoffDate = new Date(Date.UTC(earliestStart.getUTCFullYear() + cutoffYears, earliestStart.getUTCMonth(), 1));
        for (const [dateKey, entry] of forecastMap.entries()) {
          if (new Date(dateKey) > cutoffDate) {
            forecastMap.set(dateKey, { ...entry, gas: null });
          }
        }
      }
    }

    return { forecastMap, firstProdDate, lastProdDate };
  }

  function updateMetrics(production, forecastMap) {
    const nriFraction = Number.isFinite(state.nriFraction) ? state.nriFraction : null;
    let grossOil = 0;
    let grossGas = 0;
    let forecastOil = 0;
    let forecastGas = 0;

    production.forEach((row) => {
      grossOil += numValue(row.LIQUIDSPROD_BBL || row.liquidsprod_bbl);
      grossGas += numValue(row.GASPROD_MCF || row.gasprod_mcf);
    });

    for (const entry of forecastMap.values()) {
      if (Number.isFinite(entry.oil)) {
        grossOil += entry.oil;
        forecastOil += entry.oil;
      }
      if (Number.isFinite(entry.gas)) {
        grossGas += entry.gas;
        forecastGas += entry.gas;
      }
    }

    const netOil = nriFraction !== null ? grossOil * nriFraction : null;
    const netGas = nriFraction !== null ? grossGas * nriFraction : null;
    const remainingOil = nriFraction !== null ? forecastOil * nriFraction : null;
    const remainingGas = nriFraction !== null ? forecastGas * nriFraction : null;

    metrics.grossOil.textContent = formatNumber(grossOil);
    metrics.grossGas.textContent = formatNumber(grossGas);
    metrics.netOil.textContent = netOil === null ? '--' : formatNumber(netOil);
    metrics.netGas.textContent = netGas === null ? '--' : formatNumber(netGas);
    metrics.remainingOil.textContent = remainingOil === null ? '--' : formatNumber(remainingOil);
    metrics.remainingGas.textContent = remainingGas === null ? '--' : formatNumber(remainingGas);

    if (Number.isFinite(state.baselinePv17) && Number.isFinite(state.baselineNetEur) && state.baselineNetEur > 0 && netOil !== null && netGas !== null) {
      const updatedNetEur = netOil + netGas;
      const scaledPv = state.baselinePv17 * (updatedNetEur / state.baselineNetEur);
      metrics.nriValue.textContent = formatCurrency(scaledPv);
    } else if (Number.isFinite(state.baselinePv17)) {
      metrics.nriValue.textContent = formatCurrency(state.baselinePv17);
    } else {
      metrics.nriValue.textContent = '--';
    }
  }

  function renderChart(production, forecastMap) {
    if (!chartEl || !window.Plotly) return;

    const prodMap = new Map();
    production.forEach((row) => {
      const dateKey = formatDate(parseDate(row.PRODUCINGMONTH || row.producingmonth));
      if (!dateKey) return;
      prodMap.set(dateKey, {
        oil: numValue(row.LIQUIDSPROD_BBL || row.liquidsprod_bbl),
        gas: numValue(row.GASPROD_MCF || row.gasprod_mcf),
      });
    });

    const allDates = Array.from(new Set([...prodMap.keys(), ...forecastMap.keys()])).sort();

    const oilHistory = [];
    const gasHistory = [];
    const oilForecast = [];
    const gasForecast = [];

    allDates.forEach((dateKey) => {
      const prod = prodMap.get(dateKey) || {};
      const fcst = forecastMap.get(dateKey) || {};
      oilHistory.push(prod.oil ?? null);
      gasHistory.push(prod.gas ?? null);
      oilForecast.push(fcst.oil ?? null);
      gasForecast.push(fcst.gas ?? null);
    });

    const traces = [
      {
        name: 'Oil History',
        x: allDates,
        y: oilHistory,
        mode: 'lines',
        line: { color: OIL_COLOR, width: 2 },
      },
      {
        name: 'Gas History',
        x: allDates,
        y: gasHistory,
        mode: 'lines',
        line: { color: GAS_COLOR, width: 2 },
      },
      {
        name: 'Oil Forecast',
        x: allDates,
        y: oilForecast,
        mode: 'lines',
        line: { color: OIL_COLOR, width: 2, dash: FORECAST_DASH },
      },
      {
        name: 'Gas Forecast',
        x: allDates,
        y: gasForecast,
        mode: 'lines',
        line: { color: GAS_COLOR, width: 2, dash: FORECAST_DASH },
      },
    ];

    const yValues = [...oilHistory, ...gasHistory, ...oilForecast, ...gasForecast].filter((v) => Number.isFinite(v) && v > 0);
    const yMin = yValues.length ? Math.min(...yValues) : 1;
    const yMax = yValues.length ? Math.max(...yValues) : 100;

    const layout = {
      height: (chartEl.clientHeight || 360),
      margin: { l: 50, r: 50, t: 10, b: 60 },
      showlegend: true,
      legend: {
        x: 0.98,
        y: 0.9,
        xanchor: 'right',
        yanchor: 'top',
        orientation: 'v',
        bgcolor: '#fff',
        bordercolor: '#1f293aff',
        borderwidth: 1,
        font: { size: 9 },
      },
      xaxis: {
        title: 'Production Month',
        tickangle: -45,
        automargin: true,
      },
      yaxis: {
        title: 'MCF or BBL per Month',
        type: 'log',
        range: [Math.log10(Math.max(0.1, yMin)), Math.log10(Math.max(1, yMax))],
        gridcolor: '#1f293a1f',
      },
      paper_bgcolor: '#fff',
      plot_bgcolor: '#fff',
      font: { color: '#1f293a' },
      dragmode: 'pan',
    };

    Plotly.react(chartEl, traces, layout, {
      responsive: true,
      scrollZoom: false,
      displaylogo: false,
      modeBarButtonsToRemove: ['select2d', 'lasso2d', 'zoom2d'],
    });
  }

  function updateForecastDisplay() {
    const { forecastMap, firstProdDate, lastProdDate } = buildForecast(state.production, state.params);
    state.firstProdDate = firstProdDate;
    state.lastProdDate = lastProdDate;
    if (lastProdDate) {
      state.params.FCST_START_OIL = formatDate(clampDate(parseDate(state.params.FCST_START_OIL), firstProdDate, lastProdDate));
      state.params.FCST_START_GAS = formatDate(clampDate(parseDate(state.params.FCST_START_GAS), firstProdDate, lastProdDate));
    }
    renderChart(state.production, forecastMap);
    updateMetrics(state.production, forecastMap);
  }

  function buildField({ key, label, type, min, max, step, options, value, dateConfig }) {
    const field = document.createElement('div');
    field.className = 'well-editor__field';

    const labelEl = document.createElement('label');
    labelEl.className = 'well-editor__field-label';
    labelEl.textContent = label;
    field.appendChild(labelEl);

    const rangeWrap = document.createElement('div');
    rangeWrap.className = 'well-editor__field-range';

    if (type === 'select') {
      const select = document.createElement('select');
      (options || []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      select.value = value ?? '';
      select.addEventListener('change', () => {
        state.params[key] = select.value;
        updateForecastDisplay();
      });
      rangeWrap.appendChild(select);
      field.appendChild(rangeWrap);
      return field;
    }

    const range = document.createElement('input');
    range.type = 'range';
    range.min = min;
    range.max = max;
    range.step = step;

    if (type === 'date') {
      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.min = dateConfig.min;
      dateInput.max = dateConfig.max;
      dateInput.value = value || dateConfig.max || dateConfig.min || '';
      const startDate = clampDate(parseDate(dateInput.value), dateConfig.minDate, dateConfig.maxDate) || dateConfig.minDate;
      range.value = monthsBetween(dateConfig.base, startDate);

      const updateDate = (nextDate) => {
        state.params[key] = nextDate;
        dateInput.value = nextDate;
        updateForecastDisplay();
      };

      range.addEventListener('input', () => {
        const base = dateConfig.base;
        const next = addMonths(base, Number(range.value));
        const formatted = formatDate(clampDate(next, dateConfig.minDate, dateConfig.maxDate));
        updateDate(formatted);
      });

      dateInput.addEventListener('change', () => {
        const selected = clampDate(parseDate(dateInput.value), dateConfig.minDate, dateConfig.maxDate);
        const formatted = formatDate(selected);
        const offset = monthsBetween(dateConfig.base, selected);
        range.value = Math.max(Number(range.min), Math.min(Number(range.max), offset));
        updateDate(formatted);
      });

      rangeWrap.appendChild(range);
      rangeWrap.appendChild(dateInput);
      field.appendChild(rangeWrap);
      return field;
    }

    range.value = value ?? min;

    const number = document.createElement('input');
    number.type = 'number';
    number.min = min;
    number.max = max;
    number.step = step;
    number.value = value ?? min;

    const sync = (raw) => {
      const next = Math.max(Number(min), Math.min(Number(max), Number(raw)));
      range.value = next;
      number.value = next;
      state.params[key] = next;
      updateForecastDisplay();
    };

    range.addEventListener('input', () => sync(range.value));
    number.addEventListener('change', () => sync(number.value));

    rangeWrap.appendChild(range);
    rangeWrap.appendChild(number);
    field.appendChild(rangeWrap);
    return field;
  }

  function renderControls() {
    controlsEl.innerHTML = '';
    if (!state.firstProdDate || !state.lastProdDate) {
      const empty = document.createElement('div');
      empty.textContent = 'No production history available for this well.';
      controlsEl.appendChild(empty);
      return;
    }

    const baseDate = state.firstProdDate;
    const maxDate = state.lastProdDate;
    const monthsRange = Math.max(1, monthsBetween(baseDate, maxDate));

    const oilGroup = document.createElement('div');
    oilGroup.className = 'well-editor__group';
    const oilTitle = document.createElement('div');
    oilTitle.className = 'well-editor__group-title';
    oilTitle.textContent = 'Oil Decline Inputs';
    oilGroup.appendChild(oilTitle);

    const gasGroup = document.createElement('div');
    gasGroup.className = 'well-editor__group';
    const gasTitle = document.createElement('div');
    gasTitle.className = 'well-editor__group-title';
    gasTitle.textContent = 'Gas Decline Inputs';
    gasGroup.appendChild(gasTitle);

    const dateConfig = {
      base: baseDate,
      min: formatDate(baseDate),
      max: formatDate(maxDate),
      minDate: baseDate,
      maxDate: maxDate,
    };

    oilGroup.appendChild(buildField({
      key: 'FCST_START_OIL',
      label: 'Oil Forecast Start Date',
      type: 'date',
      min: 0,
      max: monthsRange,
      step: 1,
      value: state.params.FCST_START_OIL || dateConfig.max,
      dateConfig,
    }));

    oilGroup.appendChild(buildField({
      key: 'OIL_CALC_QI',
      label: 'Oil Qi (BBL/mo)',
      type: 'number',
      min: 0,
      max: Math.max(5000, numValue(state.params.OIL_CALC_QI) * 3),
      step: 25,
      value: numValue(state.params.OIL_CALC_QI),
    }));

    oilGroup.appendChild(buildField({
      key: 'OIL_Q_MIN',
      label: 'Oil Qf (BBL/mo)',
      type: 'number',
      min: 0,
      max: 1000,
      step: 10,
      value: numValue(state.params.OIL_Q_MIN),
    }));

    oilGroup.appendChild(buildField({
      key: 'OIL_DECLINE_TYPE',
      label: 'Oil Decline Type',
      type: 'select',
      options: [
        { value: 'HYP', label: 'Hyperbolic' },
        { value: 'EXP', label: 'Exponential' },
      ],
      value: state.params.OIL_DECLINE_TYPE || 'HYP',
    }));

    oilGroup.appendChild(buildField({
      key: 'OIL_EMPIRICAL_DI',
      label: 'Oil Di (annual)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      value: numValue(state.params.OIL_EMPIRICAL_DI),
    }));

    oilGroup.appendChild(buildField({
      key: 'OIL_CALC_B_FACTOR',
      label: 'Oil b-factor',
      type: 'number',
      min: 0.8,
      max: 2.0,
      step: 0.05,
      value: Math.max(0.8, numValue(state.params.OIL_CALC_B_FACTOR, 0.8)),
    }));

    oilGroup.appendChild(buildField({
      key: 'OIL_D_MIN',
      label: 'Oil Terminal Decline',
      type: 'number',
      min: 0,
      max: 0.3,
      step: 0.005,
      value: numValue(state.params.OIL_D_MIN),
    }));

    gasGroup.appendChild(buildField({
      key: 'FCST_START_GAS',
      label: 'Gas Forecast Start Date',
      type: 'date',
      min: 0,
      max: monthsRange,
      step: 1,
      value: state.params.FCST_START_GAS || dateConfig.max,
      dateConfig,
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_CALC_QI',
      label: 'Gas Qi (MCF/mo)',
      type: 'number',
      min: 0,
      max: Math.max(50000, numValue(state.params.GAS_CALC_QI) * 3),
      step: 250,
      value: numValue(state.params.GAS_CALC_QI),
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_Q_MIN',
      label: 'Gas Qf (MCF/mo)',
      type: 'number',
      min: 0,
      max: 5000,
      step: 50,
      value: numValue(state.params.GAS_Q_MIN),
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_DECLINE_TYPE',
      label: 'Gas Decline Type',
      type: 'select',
      options: [
        { value: 'HYP', label: 'Hyperbolic' },
        { value: 'EXP', label: 'Exponential' },
      ],
      value: state.params.GAS_DECLINE_TYPE || 'EXP',
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_EMPIRICAL_DI',
      label: 'Gas Di (annual)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      value: numValue(state.params.GAS_EMPIRICAL_DI),
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_CALC_B_FACTOR',
      label: 'Gas b-factor',
      type: 'number',
      min: 0.8,
      max: 2.0,
      step: 0.05,
      value: Math.max(0.8, numValue(state.params.GAS_CALC_B_FACTOR, 0.8)),
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_D_MIN',
      label: 'Gas Terminal Decline',
      type: 'number',
      min: 0,
      max: 0.3,
      step: 0.005,
      value: numValue(state.params.GAS_D_MIN),
    }));

    gasGroup.appendChild(buildField({
      key: 'GAS_FCST_YRS',
      label: 'Gas Forecast Years',
      type: 'number',
      min: 1,
      max: 50,
      step: 1,
      value: numValue(state.params.GAS_FCST_YRS, 10),
    }));

    controlsEl.appendChild(oilGroup);
    controlsEl.appendChild(gasGroup);
  }

  async function loadUserWellData() {
    if (userWellsCache.data) return userWellsCache.data;
    if (userWellsCache.promise) return userWellsCache.promise;
    userWellsCache.promise = fetch('/user-wells-data/')
      .then((resp) => resp.json())
      .then((data) => {
        userWellsCache.data = data;
        return data;
      })
      .catch(() => null);
    return userWellsCache.promise;
  }

  function applyBaselineMetrics(userData, api) {
    if (!userData || !api) {
      state.nriFraction = null;
      state.baselineNetEur = null;
      state.baselinePv17 = null;
      return;
    }

    const apiList = userData.api_uwi || [];
    const index = apiList.indexOf(api);
    if (index === -1) {
      state.nriFraction = null;
      state.baselineNetEur = null;
      state.baselinePv17 = null;
      return;
    }

    const ownerInterest = Number(userData.owner_interest?.[index]);
    state.nriFraction = Number.isFinite(ownerInterest) ? ownerInterest : null;

    const netOilEur = Number(userData.net_oil_eur?.[index]);
    const netGasEur = Number(userData.net_gas_eur?.[index]);
    const baselineNet = (Number.isFinite(netOilEur) ? netOilEur : 0) + (Number.isFinite(netGasEur) ? netGasEur : 0);
    state.baselineNetEur = baselineNet > 0 ? baselineNet : null;

    const pv17 = Number(userData.pv17?.[index]);
    state.baselinePv17 = Number.isFinite(pv17) ? pv17 : null;
  }

  function setMessage(text, variant) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.className = 'profile-modal__message';
    if (variant) {
      messageEl.classList.add(`profile-modal__message--${variant}`);
    }
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function loadWell(api) {
    if (!api) return;
    setMessage('Loading well data...', 'saving');
    saveButton.disabled = true;
    const [wellData, userData] = await Promise.all([
      fetch(`/api/well-dca-inputs/?api=${encodeURIComponent(api)}`).then((resp) => resp.json()),
      loadUserWellData(),
    ]);

    state.api = api;
    state.production = Array.isArray(wellData.production) ? wellData.production : [];
    state.params = wellData.params || {};

    applyBaselineMetrics(userData, api);

    titleEl.textContent = `Well DCA Editor: ${api}`;
    subtitleEl.textContent = 'Adjust decline inputs to see the impact on forecasts.';

    updateForecastDisplay();
    renderControls();
    updateForecastDisplay();

    setMessage('', null);
    saveButton.disabled = false;
  }

  function normalizePayload() {
    return {
      api: state.api,
      params: {
        ...state.params,
        FCST_START_OIL: state.params.FCST_START_OIL || null,
        FCST_START_GAS: state.params.FCST_START_GAS || null,
      },
    };
  }

  async function saveParams() {
    if (!state.api) return;
    setMessage('Saving parameters...', 'saving');
    saveButton.disabled = true;
    try {
      const resp = await fetch('/api/well-dca-inputs/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizePayload()),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Save failed');
      }
      setMessage('Parameters saved.', 'success');
    } catch (err) {
      setMessage('Unable to save parameters.', 'error');
      console.error('Save failed', err);
    } finally {
      saveButton.disabled = false;
    }
  }

  function attachTableHandler() {
    const table = document.getElementById('userWellsTable');
    if (!table) return;
    table.addEventListener('click', (event) => {
      const button = event.target.closest('.well-edit-button');
      if (!button) return;
      const api = button.dataset.api;
      if (!api) return;
      openModal();
      loadWell(api);
    });
  }

  function attachModalClose() {
    if (!modal) return;
    modal.addEventListener('click', (event) => {
      if (event.target.matches('[data-well-editor-close]')) {
        closeModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
        closeModal();
      }
    });
  }

  if (saveButton) {
    saveButton.addEventListener('click', saveParams);
  }

  attachTableHandler();
  attachModalClose();
})();
