// static/js/prod-chart.js
/* Production chart (Plotly) — instrumented for debugging
   Uses: window.productionByApi  (/bulk-production → WELLS.MINERALS.FORECASTS)
   Columns: API_UWI, PRODUCINGMONTH, LIQUIDSPROD_BBL, GASPROD_MCF, OilFcst_BBL, GasFcst_MCF
*/
(function () {
  const OIL_COLOR = '#1e8f4e';
  const GAS_COLOR = '#d62728';
  const COUNT_COLOR = 'gray';

  console.log('[prod-chart] start: Plotly=%s, readyState=%s', typeof window.Plotly, document.readyState);

  function toMonthKey(d) {
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  function monthKeyToIndex(key) {
    if (typeof key !== 'string' || key.length < 7) return null;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    return year * 12 + (month - 1);
  }

  function currentMonthIndex() {
    const now = new Date();
    return now.getUTCFullYear() * 12 + now.getUTCMonth();
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function ensureProductionData() {
    try {
      const cached = window.productionByApi;
      const cachedCount =
        cached && typeof cached === 'object' ? Object.keys(cached).length : (Array.isArray(cached) ? cached.length : 0);
      console.log('[prod-chart] cache check: keys/len=%d', cachedCount);

      if (cached && cachedCount > 0) {
        console.log('[prod-chart] using cached window.productionByApi');
        return cached;
      }

      console.log('[prod-chart] fetching /user-wells-data/');
      const uw = await fetch('/user-wells-data/');
      console.log('[prod-chart] /user-wells-data/ status=%s', uw.status);
      const uj = await uw.json();
      const apis = uj.api_uwi || uj.API_UWI || uj.apis || [];
      console.log('[prod-chart] api count=%d', apis.length);
      if (!apis.length) return {};

      console.log('[prod-chart] posting /bulk-production/ for %d APIs', apis.length);
      const resp = await fetch('/bulk-production/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apis }),
      });
      console.log('[prod-chart] /bulk-production/ status=%s', resp.status);
      const bj = await resp.json();
      if (bj && bj.missing) {
        console.warn('[prod-chart] wells with no production data:', bj.missing);
      }

      if (bj && bj.by_api) {
        const k = Object.keys(bj.by_api).length;
        console.log('[prod-chart] got by_api with %d keys', k);
        window.productionByApi = bj.by_api;
        return bj.by_api;
      }

      const rows = Array.isArray(bj?.rows) ? bj.rows : Array.isArray(bj) ? bj : [];
      console.log('[prod-chart] rows len=%d (grouping by API)', rows.length);
      const map = {};
      for (const r of rows) {
        const api = r.API_UWI || r.api_uwi || r.Api_Uwi;
        if (!api) continue;
        (map[api] ||= []).push(r);
      }
      const groupedCount = Object.keys(map).length;
      console.log('[prod-chart] grouped into %d API keys', groupedCount);
      window.productionByApi = map;
      return map;
    } catch (e) {
      console.error('[prod-chart] ensureProductionData error:', e);
      return {};
    }
  }

  function getSelectionContext() {
    const selectionInitialized =
      typeof window.hasUserWellSelection === 'function' && window.hasUserWellSelection();
    const selectedApis =
      typeof window.getSelectedWellApis === 'function'
        ? (window.getSelectedWellApis() || []).filter(Boolean)
        : [];
    return { selectedApis, selectionInitialized };
  }

  function aggregate(byApi, selectionContext = {}) {
    const selectedApis = Array.isArray(selectionContext.selectedApis)
      ? selectionContext.selectedApis
      : [];
    const selectionInitialized = !!selectionContext.selectionInitialized;

    let rows;
    if (Array.isArray(byApi)) {
      rows = byApi;
    } else if (selectedApis.length) {
      const allow = new Set(selectedApis.map(String));
      rows = Object.entries(byApi || {})
        .filter(([api]) => allow.has(String(api)))
        .flatMap(([, arr]) => arr || []);
    } else if (selectionInitialized) {
      rows = [];
    } else {
      rows = Object.values(byApi || {}).flat();
    }

    console.log(
      '[prod-chart] aggregate: input rows=%d (selected=%d, init=%s)',
      rows.length,
      selectedApis.length,
      selectionInitialized
    );

    const monthly = new Map(); // monthKey -> agg bucket
    for (const r of rows) {
      const api = r.API_UWI || r.api_uwi || r.Api_Uwi;
      const mk =
        toMonthKey(
          r.PRODUCINGMONTH || r.ProducingMonth || r.PRODUCTIONMONTH || r.MONTH || r.month
        );
      if (!api || !mk) continue;

      let a = monthly.get(mk);
      if (!a) {
        a = { oil: 0, gas: 0, oilFc: 0, gasFc: 0, apis: new Set() };
        monthly.set(mk, a);
      }
      a.oil += num(r.LIQUIDSPROD_BBL || r.OIL_BBL || r.oil_bbl);
      a.gas += num(r.GASPROD_MCF || r.GAS_MCF || r.gas_mcf);
      a.oilFc += num(r.OilFcst_BBL || r.OILFCST_BBL || r.oilfcst_bbl);
      a.gasFc += num(r.GasFcst_MCF || r.GASFCST_MCF || r.gasfcst_mcf);
      a.apis.add(String(api));
    }

    const allKeys = Array.from(monthly.keys()).sort();
    if (!allKeys.length) {
      console.log('[prod-chart] months=0');
      return { keys: [], oil: [], gas: [], oilFc: [], gasFc: [], wc: [], yMin: 1, yMax: 1 };
    }
    console.log('[prod-chart] months=%d, range=%s..%s', allKeys.length, allKeys[0], allKeys[allKeys.length - 1]);

    // Forecast backlog trim: keep forecast prior to latest prod only for last 6 prod months
    let latestProdKey = null;
    for (const k of allKeys) {
      const a = monthly.get(k);
      if (a.oil > 0 || a.gas > 0) latestProdKey = k;
    }
    if (latestProdKey) {
      const keep = new Set();
      const d = new Date(latestProdKey + 'T00:00:00Z');
      for (let i = 0; i < 6; i++) {
        const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
        keep.add(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-01`);
      }
      for (const k of allKeys) {
        if (k < latestProdKey && !keep.has(k)) {
          const a = monthly.get(k);
          a.oilFc = null;
          a.gasFc = null;
        }
      }
    }

    // Limit view to Jan 2020 through Dec 2032
    const minIdx = monthKeyToIndex('2020-01-01');
    const maxIdx = monthKeyToIndex('2032-12-01');
    if (minIdx === null || maxIdx === null) {
      console.error('[prod-chart] invalid range indices for 2020-2032');
      return { keys: [], oil: [], gas: [], oilFc: [], gasFc: [], wc: [], yMin: 1, yMax: 1 };
    }
    const keys = allKeys.filter((k) => {
      const idx = monthKeyToIndex(k);
      return idx !== null && idx >= minIdx && idx <= maxIdx;
    });
    if (!keys.length) {
      console.log('[prod-chart] filtered months=0 (window %d..%d)', minIdx, maxIdx);
      return { keys: [], oil: [], gas: [], oilFc: [], gasFc: [], wc: [], yMin: 1, yMax: 1 };
    }
    console.log(
      '[prod-chart] filtered months=%d, range=%s..%s (window %d..%d)',
      keys.length,
      keys[0],
      keys[keys.length - 1],
      minIdx,
      maxIdx
    );

    const oil = keys.map((k) => monthly.get(k).oil || null);
    const gas = keys.map((k) => monthly.get(k).gas || null);
    const oilFc = keys.map((k) => {
      const v = monthly.get(k).oilFc;
      return v > 0 ? v : null;
    });
    const gasFc = keys.map((k) => {
      const v = monthly.get(k).gasFc;
      return v > 0 ? v : null;
    });
    const wc = keys.map((k) => monthly.get(k).apis.size);

    const vols = [];
    for (let i = 0; i < keys.length; i++) {
      const arr = [oil[i], gas[i], oilFc[i], gasFc[i]];
      for (const v of arr) if (v > 0) vols.push(v);
    }
    let yMin = 1,
      yMax = 1000;
    if (vols.length) {
      const mi = Math.min(...vols);
      const ma = Math.max(...vols);
      yMin = 10 ** Math.floor(Math.log10(mi));
      yMax = 10 ** Math.ceil(Math.log10(ma));
    }
    console.log('[prod-chart] y-domain(log) = [%s, %s], wc max=%d', yMin, yMax, Math.max(...wc, 0));

    return { keys, oil, gas, oilFc, gasFc, wc, yMin, yMax };
  }

  function ensureContainer() {
    let el = document.getElementById('prodChart');
    if (!el) {
      console.warn('[prod-chart] #prodChart not found; creating one at end of <body>');
      el = document.createElement('div');
      el.id = 'prodChart';
      el.style.height = '400px';
      document.body.appendChild(el);
      return el;
    }
    if (el.tagName.toLowerCase() === 'canvas') {
      console.warn('[prod-chart] found <canvas id="prodChart">; replacing with <div> for Plotly');
      const d = document.createElement('div');
      d.id = 'prodChart';
      d.style.height = (el.height ? el.height : 400) + 'px';
      el.replaceWith(d);
      return d;
    }
    if (!el.style.height) el.style.height = '400px';
    console.log('[prod-chart] container ready: #%s (%s)', el.id, el.tagName);
    return el;
  }

  let latestByApi = null;

  function renderProductionChart(byApi) {
    const el = ensureContainer();
    if (!el) return;

    const selectionContext = getSelectionContext();
    const agg = aggregate(byApi, selectionContext);
    // Build x as 'YYYY-MM' categories, but derive ticks from full keys 'YYYY-MM-01'
    const months = agg.keys; // e.g., ['2019-01-01','2019-02-01',...]
    const x = months.map((k) => k.slice(0, 7)); // 'YYYY-MM'

    // Keep only Januaries (sorted already), then take every 3rd one
    const janMonths = months.filter((k) => k.slice(5, 7) === '01');
    const janEvery3 = janMonths.filter((_, i) => i % 3 === 0); // 0,3,6,...

    const yearTicks = janEvery3.map((k) => k.slice(0, 7)); // ['YYYY-01', ...]
    const yearText = janEvery3.map((k) => k.slice(0, 4)); // ['YYYY', ...]

    const traces = [
      {
        name: 'Oil (BBL)',
        x,
        y: agg.oil,
        mode: 'markers',
        marker: { size: 6, color: OIL_COLOR, opacity: 0.7 },
        hovertemplate: '%{x}<br>Oil: %{y:,}<extra></extra>',
        yaxis: 'y',
      },
      {
        name: 'Gas (MCF)',
        x,
        y: agg.gas,
        mode: 'markers',
        marker: { size: 6, color: GAS_COLOR, opacity: 0.7 },
        hovertemplate: '%{x}<br>Gas: %{y:,}<extra></extra>',
        yaxis: 'y',
      },
      {
        name: 'Oil Forecast (BBL)',
        x,
        y: agg.oilFc,
        mode: 'lines',
        line: { color: OIL_COLOR, width: 2 },
        hovertemplate: '%{x}<br>Oil Fcst: %{y:,}<extra></extra>',
        yaxis: 'y',
      },
      {
        name: 'Gas Forecast (MCF)',
        x,
        y: agg.gasFc,
        mode: 'lines',
        line: { color: GAS_COLOR, width: 2 },
        hovertemplate: '%{x}<br>Gas Fcst: %{y:,}<extra></extra>',
        yaxis: 'y',
      },
      {
        name: 'Well Count',
        x,
        y: agg.wc,
        mode: 'lines',
        line: { color: COUNT_COLOR, width: 1.5, dash: 'dash' },
        hovertemplate: '%{x}<br>Wells: %{y}<extra></extra>',
        yaxis: 'y2',
      },
    ];

    const layout = {
      height: (el && (el.clientHeight || parseInt(getComputedStyle(el).height))) || 300,
      margin: { l: 50, r: 60, t: 10, b: 60 }, // extra bottom margin for angled labels
      showlegend: true,
      legend: {
        x: 0.98, // right edge
        y: 0.9, // a touch below the top (lower = more down)
        xanchor: 'right',
        yanchor: 'top',
        orientation: 'v',
        bgcolor: '#fff',
        bordercolor: '#1f293aff',
        borderwidth: 1,
        font: { size: 12 }, // optional: tweak as you like
      },
      xaxis: {
        title: 'Production Month',
        type: 'category',
        tickmode: 'array',
        tickvals: yearTicks, // only January points
        ticktext: yearText, // show "YYYY" only
        tickangle: -45, // rotate labels 45° (use -45 for down-right)
        automargin: true, // avoid clipping when rotated
      },
      yaxis: {
        title: 'MCF or BBL per Month',
        type: 'log',
        range: [Math.log10(agg.yMin), Math.log10(agg.yMax)],
        gridcolor: '#1f293a1f',
      },
      yaxis2: { title: 'Well Count', overlaying: 'y', side: 'right', gridcolor: '#1f293a02' },
      paper_bgcolor: '#fff',
      plot_bgcolor: '#fff',
      font: { color: '#1f293a' },
    };

    console.log('[prod-chart] plotting with %d months, Plotly=%s', agg.keys.length, typeof window.Plotly);
    Plotly.newPlot(el, traces, layout, { displayModeBar: false, responsive: true })
      .then(() => console.log('[prod-chart] Chart rendered (Plotly)'))
      .catch((e) => console.error('[prod-chart] Plotly.newPlot error:', e));
  }

  async function init() {
    try {
      const el = ensureContainer();

      if (!window.Plotly) {
        console.error('[prod-chart] Plotly is not defined. Check base.html include.');
        el.innerHTML =
          '<div style="padding:8px;color:#f66;">Plotly not loaded. Ensure base.html includes the Plotly script in &lt;head&gt;.</div>';
        return;
      }

      const byApi = await ensureProductionData();
      const apiCount =
        byApi && typeof byApi === 'object' ? Object.keys(byApi).length : Array.isArray(byApi) ? byApi.length : 0;
      console.log('[prod-chart] data ready: api keys/len=%d', apiCount);
      latestByApi = byApi;
      renderProductionChart(byApi);
    } catch (err) {
      console.error('[prod-chart] init error:', err);
    }
  }

  window.reloadProductionChartWithSelection = function reloadProductionChartWithSelection() {
    if (!latestByApi) {
      ensureProductionData().then((data) => {
        latestByApi = data;
        renderProductionChart(data);
      });
      return;
    }
    renderProductionChart(latestByApi);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
