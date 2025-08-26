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

  function aggregate(byApi) {
    const rows = Array.isArray(byApi) ? byApi : Object.values(byApi || {}).flat();
    console.log('[prod-chart] aggregate: input rows=%d', rows.length);

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

    const keys = Array.from(monthly.keys()).sort();
    console.log('[prod-chart] months=%d, range=%s..%s', keys.length, keys[0], keys[keys.length - 1]);

    // Forecast backlog trim: keep forecast prior to latest prod only for last 6 prod months
    let latestProdKey = null;
    for (const k of keys) {
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
      for (const k of keys) {
        if (k < latestProdKey && !keep.has(k)) {
          const a = monthly.get(k);
          a.oilFc = null;
          a.gasFc = null;
        }
      }
    }

    const oil = keys.map((k) => monthly.get(k).oil || null);
    const gas = keys.map((k) => monthly.get(k).gas || null);
    const oilFc = keys.map((k) => {
      const v = monthly.get(k).oilFc;
      return (v === 0 ? 0 : v) ?? null;
    });
    const gasFc = keys.map((k) => {
      const v = monthly.get(k).gasFc;
      return (v === 0 ? 0 : v) ?? null;
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
      el.style.height = '360px';
      document.body.appendChild(el);
      return el;
    }
    if (el.tagName.toLowerCase() === 'canvas') {
      console.warn('[prod-chart] found <canvas id=\"prodChart\">; replacing with <div> for Plotly');
      const d = document.createElement('div');
      d.id = 'prodChart';
      d.style.height = (el.height ? el.height : 360) + 'px';
      el.replaceWith(d);
      return d;
    }
    if (!el.style.height) el.style.height = '360px';
    console.log('[prod-chart] container ready: #%s (%s)', el.id, el.tagName);
    return el;
  }

  async function init() {
    try {
      const el = ensureContainer();

      if (!window.Plotly) {
        console.error('[prod-chart] Plotly is not defined. Check base.html include.');
        el.innerHTML =
          '<div style=\"padding:8px;color:#f66;\">Plotly not loaded. Ensure base.html includes the Plotly script in &lt;head&gt;.</div>';
        return;
      }

      const byApi = await ensureProductionData();
      const apiCount =
        byApi && typeof byApi === 'object' ? Object.keys(byApi).length : (Array.isArray(byApi) ? byApi.length : 0);
      console.log('[prod-chart] data ready: api keys/len=%d', apiCount);

      const agg = aggregate(byApi);
      const x = agg.keys.map((k) => k.slice(0, 7)); // YYYY-MM

      const traces = [
        { name: 'Oil (BBL)', x, y: agg.oil, mode: 'markers', marker: { size: 6, color: OIL_COLOR, opacity: 0.7 }, hovertemplate: '%{x}<br>Oil: %{y:,}<extra></extra>', yaxis: 'y' },
        { name: 'Gas (MCF)', x, y: agg.gas, mode: 'markers', marker: { size: 6, color: GAS_COLOR, opacity: 0.7 }, hovertemplate: '%{x}<br>Gas: %{y:,}<extra></extra>', yaxis: 'y' },
        { name: 'Oil Forecast (BBL)', x, y: agg.oilFc, mode: 'lines', line: { color: OIL_COLOR, width: 2 }, hovertemplate: '%{x}<br>Oil Fcst: %{y:,}<extra></extra>', yaxis: 'y' },
        { name: 'Gas Forecast (MCF)', x, y: agg.gasFc, mode: 'lines', line: { color: GAS_COLOR, width: 2 }, hovertemplate: '%{x}<br>Gas Fcst: %{y:,}<extra></extra>', yaxis: 'y' },
        { name: 'Well Count', x, y: agg.wc, mode: 'lines', line: { color: COUNT_COLOR, width: 1.5, dash: 'dash' }, hovertemplate: '%{x}<br>Wells: %{y}<extra></extra>', yaxis: 'y2' },
      ];

      const layout = {
        height: 360,
        margin: { l: 50, r: 60, t: 10, b: 40 },
        showlegend: true,
        xaxis: { title: 'Production Month', type: 'category', tickangle: -45 },
        yaxis: { title: 'MCF or BBL per Month', type: 'log', range: [Math.log10(agg.yMin), Math.log10(agg.yMax)], gridcolor: '#333' },
        yaxis2: { title: 'Well Count', overlaying: 'y', side: 'right', gridcolor: 'rgba(0,0,0,0)' },
        paper_bgcolor: '#1a1a1a',
        plot_bgcolor: '#1a1a1a',
        font: { color: '#eaeaea' },
      };

      console.log('[prod-chart] plotting with %d months, Plotly=%s', agg.keys.length, typeof window.Plotly);
      Plotly.newPlot(el, traces, layout, { displayModeBar: false, responsive: true })
        .then(() => console.log('[prod-chart] Chart rendered (Plotly)'))
        .catch((e) => console.error('[prod-chart] Plotly.newPlot error:', e));
    } catch (err) {
      console.error('[prod-chart] init error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
