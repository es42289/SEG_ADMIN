const yearInput = document.getElementById('year');
    const yearVal = document.getElementById('year-val');
    const statusDiv = document.getElementById('status');
    const userWellsCount = document.getElementById('user-wells-count');
    const avgWellAge = document.getElementById('avg-well-age');
    const lastOil = document.getElementById('last-oil');
    const lastGas = document.getElementById('last-gas');
    const lastYearOil = document.getElementById('last-year-oil');
    const lastYearGas = document.getElementById('last-year-gas');
    const nextYearOil = document.getElementById('next-year-oil');
    const nextYearGas = document.getElementById('next-year-gas');
    const lastYearCashflow = document.getElementById('last-year-cashflow');
    const nextYearCashflow = document.getElementById('next-year-cashflow');
    const effectiveDate = document.getElementById('effective-date');
    const lastProductionDate = document.getElementById('last-production-date');
    // Removed references to totalNearby elements as they were removed from the HTML

    const MAPBOX_TOKEN = 'pk.eyJ1Ijoid2VsbG1hcHBlZCIsImEiOiJjbGlreXVsMWowNDg5M2ZxcGZucDV5bnIwIn0.5wYuJnmZvUbHZh9M580M-Q';
    const MAPBOX_STYLE_TERRAIN = 'mapbox://styles/wellmapped/clixrm3dg00fy01pzehcncxie';
    const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';
    let currentMapStyle = MAPBOX_STYLE_TERRAIN;

    const rootElement = document.documentElement;
    const updateLayoutOffsets = () => {
      const banner = document.querySelector('.top-banner');
      if (!banner || !rootElement) return;
      const bannerHeight = banner.offsetHeight;
      if (bannerHeight > 0) {
        rootElement.style.setProperty('--top-banner-height', `${bannerHeight}px`);
      }
    };

    updateLayoutOffsets();
    document.addEventListener('DOMContentLoaded', updateLayoutOffsets);
    window.addEventListener('load', updateLayoutOffsets);
    window.addEventListener('resize', updateLayoutOffsets);

    function updateStatus(message, isError = false, isSuccess = false) {
      if (!statusDiv) return;
      statusDiv.textContent = message;
      statusDiv.className = 'status';
      if (isError) statusDiv.classList.add('error');
      if (isSuccess) statusDiv.classList.add('success');
    }

    const formatDisplayDate = (dateObj) => {
      if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(dateObj);
    };

    const setStatValue = (element, value, fallback = '--') => {
      if (!element) return;
      const valueEl = element.querySelector('.stat-value');
      if (!valueEl) return;
      if (value === undefined || value === null || value === '') {
        valueEl.textContent = fallback;
      } else {
        valueEl.textContent = typeof value === 'number' ? value.toString() : value;
      }
    };

    const formatCurrencyStat = (value) => {
      if (value === undefined || value === null) return null;
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return num.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
      });
    };

    function updateCashflowMetrics(ltmValue, ntmValue) {
      if (lastYearCashflow) {
        const formatted = formatCurrencyStat(ltmValue);
        setStatValue(lastYearCashflow, formatted, '--');
      }
      if (nextYearCashflow) {
        const formatted = formatCurrencyStat(ntmValue);
        setStatValue(nextYearCashflow, formatted, '--');
      }
    }

    window.updateCashflowMetrics = updateCashflowMetrics;

    function updateEffectiveDateDisplay() {
      if (!effectiveDate) return;
      const today = new Date();
      const firstOfNextMonth = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() + 1,
        1
      ));
      const formatted = formatDisplayDate(firstOfNextMonth);
      setStatValue(effectiveDate, formatted, '--');
    }

    updateEffectiveDateDisplay();

    function getCsrfToken() {
      const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    }

    // Global variables to store all data
    let allWellData = null;
    let userWellData = null;

    // ===== One-time loader for user production (fetches once, caches forever) =====
    window.productionByApi = window.productionByApi || {};
    let productionLoadPromise = null;

    async function loadUserProductionOnce() {
      if (productionLoadPromise) return productionLoadPromise; // already running or done

      productionLoadPromise = (async () => {
        try {
          // Ensure user wells are loaded so we have the APIs
          if (!userWellData) {
            userWellData = await fetchUserWells();
          }

          const apis = [...new Set((userWellData.api_uwi || []).filter(Boolean))];
          if (!apis.length) {
            console.warn('No user API_UWI found in /user-wells-data/. Skipping production fetch.');
            window.productionByApi = {};
            return window.productionByApi;
          }

          const resp = await fetch('/bulk-production/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ apis })   // ← user wells only
          });

          const bodyText = await resp.text(); // capture any server message
          if (!resp.ok) {
            console.error('bulk-production (user-only) failed:', resp.status, bodyText);
            window.productionByApi = {};
            return window.productionByApi;
          }

          let prod;
          try { prod = JSON.parse(bodyText); } catch { prod = null; }
          window.productionByApi = (prod && prod.by_api) ? prod.by_api : {};
          if (userWellData) {
            computeProductionStats(userWellData, window.productionByApi);
            renderUserWellsTable(userWellData);
          }
          console.log('bulk-production (user only, ONCE):', {
            apis_sent: apis.length,
            rows_returned: prod ? prod.count : 0,
            apis_with_rows: Object.keys(window.productionByApi).length
          });
          if (prod && prod.missing) {
            console.warn('Wells with no production data:', prod.missing);
          }
          return window.productionByApi;
        } catch (e) {
          console.error('loadUserProductionOnce error:', e);
          window.productionByApi = {};
          return window.productionByApi;
        }
      })();

      return productionLoadPromise;
    }

    function updateLastProductionMetrics(prodMap) {
      if (!lastOil || !lastGas || !lastYearOil || !lastYearGas || !nextYearOil || !nextYearGas) {
        setStatValue(lastProductionDate, null, '--');
        return;
      }
      const rows = Object.values(prodMap || {}).flat();
      if (!rows.length) {
        setStatValue(lastProductionDate, null, '--');
        return;
      }

      const monthly = {};

      function monthKey(d) {
        const dt = new Date(d);
        if (isNaN(dt)) return null;
        return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      }

      for (const r of rows) {
        const mk = monthKey(r.PRODUCINGMONTH || r.ProducingMonth || r.PRODUCTIONMONTH || r.MONTH || r.month);
        if (!mk) continue;
        if (!monthly[mk]) monthly[mk] = { oil: 0, gas: 0, oilFc: 0, gasFc: 0 };
        monthly[mk].oil += Number(r.LIQUIDSPROD_BBL || r.OIL_BBL || r.oil_bbl || 0);
        monthly[mk].gas += Number(r.GASPROD_MCF || r.GAS_MCF || r.gas_mcf || 0);
        monthly[mk].oilFc += Number(r.OilFcst_BBL || r.OILFCST_BBL || r.oilfcst_bbl || 0);
        monthly[mk].gasFc += Number(r.GasFcst_MCF || r.GASFCST_MCF || r.gasfcst_mcf || 0);
      }

      // Determine the most recent month with non-zero production
      const months = Object.keys(monthly).sort();
      let latest = null;
      for (const mk of months) {
        const bucket = monthly[mk];
        if (bucket.oil > 0 || bucket.gas > 0) latest = mk;
      }
      if (latest) {
        const data = monthly[latest];
        setStatValue(lastOil, Math.round(data.oil).toLocaleString());
        setStatValue(lastGas, Math.round(data.gas).toLocaleString());

        const endIndex = months.indexOf(latest);
        const last12 = months.slice(Math.max(0, endIndex - 11), endIndex + 1);
        let sumOil = 0;
        let sumGas = 0;
        for (const mk of last12) {
          sumOil += monthly[mk].oil;
          sumGas += monthly[mk].gas;
        }
        setStatValue(lastYearOil, Math.round(sumOil).toLocaleString());
        setStatValue(lastYearGas, Math.round(sumGas).toLocaleString());

        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        let sumOilFc = 0;
        let sumGasFc = 0;
        for (let i = 0; i < 12; i++) {
          const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
          const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (monthly[mk]) {
            sumOilFc += monthly[mk].oilFc || 0;
            sumGasFc += monthly[mk].gasFc || 0;
          }
        }
        setStatValue(nextYearOil, Math.round(sumOilFc).toLocaleString());
        setStatValue(nextYearGas, Math.round(sumGasFc).toLocaleString());

        if (lastProductionDate) {
          const [yearStr, monthStr] = latest.split('-');
          const year = Number(yearStr);
          const month = Number(monthStr);
          const latestDate = Number.isFinite(year) && Number.isFinite(month)
            ? new Date(Date.UTC(year, month - 1, 1))
            : null;
          const formattedLast = latestDate ? formatDisplayDate(latestDate) : null;
          setStatValue(lastProductionDate, formattedLast, '--');
        }
      } else {
        setStatValue(lastProductionDate, null, '--');
      }
    }

    function computeProductionStats(data, prodMap) {
      if (!data || !Array.isArray(data.api_uwi)) return;

      const parseMonthKey = (key) => {
        if (!key) return null;
        const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(key);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        return new Date(Date.UTC(year, month - 1, day));
      };

      const monthKey = (value) => {
        if (!value) return null;
        const dt = new Date(value);
        if (!Number.isNaN(dt.getTime())) {
          return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
        }
        const str = String(value);
        const match = /^([0-9]{4})-([0-9]{2})/.exec(str);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
        return `${year}-${String(month).padStart(2, '0')}-01`;
      };

      const toNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
      };

      const formatDate = (dateObj) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
        return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
      };

      data.first_prod_date = [];
      data.last_prod_date = [];
      data.gross_oil_eur = [];
      data.gross_gas_eur = [];
      data.net_oil_eur = [];
      data.net_gas_eur = [];
      data.remaining_net_oil = [];
      data.remaining_net_gas = [];

      const now = new Date();
      const remainingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const remainingEnd = new Date(Date.UTC(remainingStart.getUTCFullYear() + 15, remainingStart.getUTCMonth(), 1));

      for (let i = 0; i < data.api_uwi.length; i++) {
        const api = data.api_uwi[i];
        const rows = (prodMap && prodMap[api]) ? prodMap[api] : [];
        const monthly = new Map();

        for (const r of rows) {
          const mk = monthKey(r.PRODUCINGMONTH || r.ProducingMonth || r.PRODUCTIONMONTH || r.MONTH || r.month);
          if (!mk) continue;
          let bucket = monthly.get(mk);
          if (!bucket) {
            bucket = { oilHist: 0, gasHist: 0, oilFc: 0, gasFc: 0 };
            monthly.set(mk, bucket);
          }
          bucket.oilHist += toNumber(r.LIQUIDSPROD_BBL || r.OIL_BBL || r.oil_bbl);
          bucket.gasHist += toNumber(r.GASPROD_MCF || r.GAS_MCF || r.gas_mcf);
          bucket.oilFc += toNumber(r.OilFcst_BBL || r.OILFCST_BBL || r.oilfcst_bbl);
          bucket.gasFc += toNumber(r.GasFcst_MCF || r.GASFCST_MCF || r.gasfcst_mcf);
        }

        const keys = Array.from(monthly.keys()).sort();
        let firstDate = null;
        let lastDate = null;
        let oilHistSum = 0;
        let gasHistSum = 0;
        let oilForecastSum = 0;
        let gasForecastSum = 0;
        let oilHasVolume = false;
        let gasHasVolume = false;
        let remainingOilSum = 0;
        let remainingGasSum = 0;

        for (const key of keys) {
          const bucket = monthly.get(key);
          const dt = parseMonthKey(key);
          const histOil = bucket.oilHist > 0 ? bucket.oilHist : 0;
          const histGas = bucket.gasHist > 0 ? bucket.gasHist : 0;
          const fcOil = bucket.oilFc > 0 ? bucket.oilFc : 0;
          const fcGas = bucket.gasFc > 0 ? bucket.gasFc : 0;

          let includedThisMonth = false;

          if (histOil > 0) {
            oilHasVolume = true;
            oilHistSum += histOil;
            includedThisMonth = true;
          }
          if (histGas > 0) {
            gasHasVolume = true;
            gasHistSum += histGas;
            includedThisMonth = true;
          }

          const includeForecastOil =
            fcOil > 0 && dt && dt >= remainingStart && dt < remainingEnd && histOil === 0;
          if (includeForecastOil) {
            oilHasVolume = true;
            oilForecastSum += fcOil;
            includedThisMonth = true;
          }

          const includeForecastGas =
            fcGas > 0 && dt && dt >= remainingStart && dt < remainingEnd && histGas === 0;
          if (includeForecastGas) {
            gasHasVolume = true;
            gasForecastSum += fcGas;
            includedThisMonth = true;
          }

          if (dt && includedThisMonth) {
            if (!firstDate || dt < firstDate) firstDate = dt;
            if (!lastDate || dt > lastDate) lastDate = dt;
          }
          if (dt && dt >= remainingStart && dt < remainingEnd) {
            remainingOilSum += bucket.oilFc;
            remainingGasSum += bucket.gasFc;
          }
        }

        const firstStr = formatDate(firstDate);
        const lastStr = formatDate(lastDate);
        const oilTotal = oilHasVolume ? Math.round(oilHistSum + oilForecastSum) : '';
        const gasTotal = gasHasVolume ? Math.round(gasHistSum + gasForecastSum) : '';
        const hasRemainingOil = remainingOilSum > 0;
        const hasRemainingGas = remainingGasSum > 0;

        let nri = null;
        if (data.owner_interest && data.owner_interest.length > i) {
          const raw = data.owner_interest[i];
          if (raw !== null && raw !== undefined && raw !== '') {
            const val = Number(raw);
            if (!Number.isNaN(val)) {
              nri = val;
            }
          }
        }

        const netOil = oilHasVolume && nri !== null
          ? Math.round((oilHistSum + oilForecastSum) * nri)
          : (oilHasVolume && nri === 0 ? 0 : '');
        const netGas = gasHasVolume && nri !== null
          ? Math.round((gasHistSum + gasForecastSum) * nri)
          : (gasHasVolume && nri === 0 ? 0 : '');
        const remainingNetOil = hasRemainingOil && nri !== null ? Math.round(remainingOilSum * nri) : (hasRemainingOil && nri === 0 ? 0 : '');
        const remainingNetGas = hasRemainingGas && nri !== null ? Math.round(remainingGasSum * nri) : (hasRemainingGas && nri === 0 ? 0 : '');

        data.first_prod_date.push(firstStr);
        data.last_prod_date.push(lastStr);
        data.gross_oil_eur.push(oilTotal);
        data.gross_gas_eur.push(gasTotal);
        data.net_oil_eur.push(netOil);
        data.net_gas_eur.push(netGas);
        data.remaining_net_oil.push(remainingNetOil);
        data.remaining_net_gas.push(remainingNetGas);
      }
    }

    // Calculate distance between two lat/lon points in miles
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    // Calculate centroid of user wells
    function calculateCentroid(lats, lons) {
      if (lats.length === 0) return null;
      
      const avgLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
      const avgLon = lons.reduce((sum, lon) => sum + lon, 0) / lons.length;
      
      return { lat: avgLat, lon: avgLon };
    }

    // Analyze wells within radius of centroid
    function analyzeNearbyWells(allWells, userWells, currentYear, radiusMiles = 20) {
      if (userWells.lat.length === 0) {
        return {
          centroid: null,
          nearbyWells: [],
          ageCategories: { recent: 0, medium: 0, old: 0 }
        };
      }

      // Calculate centroid of user wells
      const centroid = calculateCentroid(userWells.lat, userWells.lon);
      
      // Find wells within specified radius of centroid
      const nearbyWells = [];
      
      for (let i = 0; i < allWells.lat.length; i++) {
        const distance = calculateDistance(
          centroid.lat, centroid.lon,
          allWells.lat[i], allWells.lon[i]
        );
        
        if (distance <= radiusMiles) {
          const wellAge = currentYear - allWells.years[i];
          nearbyWells.push({
            index: i,
            distance: distance,
            age: wellAge,
            year: allWells.years[i]
          });
        }
      }

      // Categorize by age
      const ageCategories = {
        recent: nearbyWells.filter(w => w.age <= 3).length,    // ≤3 years
        medium: nearbyWells.filter(w => w.age > 3 && w.age <= 10).length, // 4-10 years  
        old: nearbyWells.filter(w => w.age > 10).length        // >10 years
      };

      return { centroid, nearbyWells, ageCategories };
    }

    // Create bar chart for nearby wells
    function createNearbyWellsChart(ageCategories, centroid, radiusMiles = 20, chartId = 'nearby-chart', totalId = 'total-nearby', chartColor = 'white') {
      // Ensure all values are valid numbers (fix for null/undefined causing chart to break)
      const recentCount = ageCategories.recent || 0;
      const mediumCount = ageCategories.medium || 0;
      const oldCount = ageCategories.old || 0;
      
      const data = [{
        x: ['≤3 Years', '4-10 Years', '>10 Years'],
        y: [recentCount, mediumCount, oldCount],
        type: 'bar',
        marker: {
          color: [chartColor, chartColor, chartColor],  // Use specified color for fill
          line: {
            color: ['#00ff00', '#000000', '#888888'],  // Green, black, grey borders
            width: 5  // Thick borders
          }
        },
        text: [recentCount, mediumCount, oldCount],
        textposition: 'auto',
        textfont: {
          color: '#000000ff'
        }
      }];

      const chartElement = document.getElementById(chartId);

      const layout = {
        title: {
          text: `Wells within ${radiusMiles} Miles by Age`,
          font: { color: '#eaeaea', size: 16 }
        },
        paper_bgcolor: '#156082',
        plot_bgcolor: '#ffff',
        font: { color: '#eaeaea' },
        xaxis: {
          title: 'Well Age',
          color: '#eaeaea',
          gridcolor: '#66666668'
        },
        yaxis: {
          title: 'Number of Wells',
          color: '#eaeaea',
          gridcolor: '#66666668'
        },
        margin: { t: 50, r: 20, b: 60, l: 60 },
        autosize: true
      };

      if (chartElement) {
        const elementHeight = chartElement.getBoundingClientRect().height;
        if (elementHeight > 0) {
          layout.height = elementHeight;
        } else if (chartElement.parentElement) {
          const parentHeight = chartElement.parentElement.getBoundingClientRect().height;
          if (parentHeight > 0) {
            layout.height = parentHeight;
          }
        }
      }

      Plotly.newPlot(chartElement || chartId, data, layout, { displayModeBar: false, responsive: true });

      if (chartElement) {
        Plotly.Plots.resize(chartElement);

        if (!chartElement.dataset.resizeBound) {
          chartElement.dataset.resizeBound = 'true';
          window.addEventListener('resize', () => Plotly.Plots.resize(chartElement));
        }
      }

      // Removed the code that updates the total count display elements
    }

    // Fetch ALL Snowflake data once
    async function fetchAllData() {
      updateStatus(`Fetching all Snowflake data...`);
      
      try {
        const res = await fetch(`/map-data/`);
        if (!res.ok) { 
          throw new Error(`HTTP ${res.status}: ${res.statusText}`); 
        }
        const data = await res.json();
        
        if (!data.lat || !data.lon || !data.text) {
          throw new Error('Invalid data format from server - need lat, lon, text arrays');
        }
        
        if (!data.year) {
          console.log('No year data found, creating mock years for testing');
          data.year = data.lat.map(() => 2024);
        }
        
        if (!data.lat_bh) {
          console.log('No bottom hole data found, creating null values');
          data.lat_bh = data.lat.map(() => null);
          data.lon_bh = data.lat.map(() => null);
        }
        
        console.log(`Received ${data.lat.length} total wells from Snowflake`);
        return data;
        
      } catch (error) {
        updateStatus(`✗ Failed to load Snowflake data: ${error.message}`, true);
        console.error('Snowflake fetch error:', error);
        throw error;
      }
    }

    // Fetch user wells data
    async function fetchUserWells() {
      try {
        const res = await fetch(`/user-wells-data/`);
        if (!res.ok) { 
          throw new Error(`HTTP ${res.status}: ${res.statusText}`); 
        }
        const data = await res.json();
        
        if (!data.lat || data.lat.length === 0) {
          console.log('No user wells found');
          if (avgWellAge) setStatValue(avgWellAge, '0');
          return { lat: [], lon: [], text: [], year: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [], api_uwi: [], last_producing: [], completion_date: [] };
        }

        console.log(`Received ${data.lat.length} user wells`);
        setStatValue(userWellsCount, data.lat.length.toLocaleString());

        if (avgWellAge && data.year && data.last_producing) {
          const currentYear = new Date().getUTCFullYear();
          const ages = [];
          for (let i = 0; i < data.year.length; i++) {
            const compYear = parseInt(data.year[i], 10);
            if (isNaN(compYear)) continue;
            const last = data.last_producing[i];
            let endYear = last ? new Date(last).getUTCFullYear() : currentYear;
            if (isNaN(endYear)) endYear = currentYear;
            ages.push(endYear - compYear + 1);
          }
          const avg = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
          setStatValue(avgWellAge, avg.toFixed(1));
        }

        renderUserWellsTable(data);
        renderUserWellsMap(data);
        return data;
        
      } catch (error) {
        console.error('User wells fetch error:', error);
        return { lat: [], lon: [], text: [], year: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [], api_uwi: [], last_producing: [], completion_date: [] };
      }
    }

    // Filter data by year (frontend filtering) - show wells completed <= year
    function filterDataByYear(data, year) {
      if (!data || !data.year) {
        return { lat: [], lon: [], text: [], years: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [], api_uwi: [], last_producing: [] };
      }

      const filteredIndices = [];
      for (let i = 0; i < data.year.length; i++) {
        const wellYear = parseInt(data.year[i], 10);
        if (!isNaN(wellYear) && wellYear <= year) {
          filteredIndices.push(i);
        }
      }

      return {
        lat: filteredIndices.map(i => data.lat[i]),
        lon: filteredIndices.map(i => data.lon[i]),
        text: filteredIndices.map(i => data.text[i]),
        years: filteredIndices.map(i => data.year[i]),
        lat_bh: filteredIndices.map(i => data.lat_bh[i]),
        lon_bh: filteredIndices.map(i => data.lon_bh[i]),
        owner_interest: filteredIndices.map(i => data.owner_interest ? data.owner_interest[i] : null),
        owner_name: filteredIndices.map(i => data.owner_name ? data.owner_name[i] : null),
        last_producing: filteredIndices.map(i => data.last_producing ? data.last_producing[i] : null),
        api_uwi: filteredIndices.map(i => data.api_uwi ? data.api_uwi[i] : null),
        completion_date: filteredIndices.map(i => data.completion_date ? data.completion_date[i] : null)
      };
    }

    // Calculate colors based on well year
    function calculateColors(years, currentYear) {
      const colors = [];
      for (let i = 0; i < years.length; i++) {
        const yearsSinceCompletion = currentYear - years[i];
        if (yearsSinceCompletion <= 10) {
          const ratio = (10 - yearsSinceCompletion) / 10;
          const green = Math.round(255 * ratio);
          colors.push(`rgb(0, ${green}, 0)`);
        } else if (yearsSinceCompletion <= 15) {
          const ratio = (yearsSinceCompletion - 10) / 5;
          const grey = Math.round(200 * ratio);
          colors.push(`rgb(${grey}, ${grey}, ${grey})`);
        } else {
          colors.push('rgb(200, 200, 200)');
        }
      }
      return colors;
    }

    // Create line data for well trajectories
    function createLineData(data) {
      const lineLats = [];
      const lineLons = [];

      for (let i = 0; i < data.lat.length; i++) {
        if (data.lat_bh[i] && data.lon_bh[i]) {
          lineLats.push(data.lat[i]);
          lineLons.push(data.lon[i]);
          lineLats.push(data.lat_bh[i]);
          lineLons.push(data.lon_bh[i]);
          lineLats.push(null);
          lineLons.push(null);
        }
      }

      return { lineLats, lineLons };
    }

    const ROYALTY_RATE_KEY = 'pv17';
    window.wellPvCells = window.wellPvCells || {};
    window.latestPerWellPvMap = window.latestPerWellPvMap || null;

    const formatCurrencyNoCents = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    };

    function applyPerWellPvMap(pvMap) {
      if (!pvMap || typeof pvMap !== 'object') return;
      const cellsMap = window.wellPvCells || {};

      for (const [apiKey, values] of Object.entries(pvMap)) {
        if (!values || typeof values !== 'object') continue;
        const keyVariants = [apiKey, apiKey.replace(/-/g, '')];
        let cellGroup = null;
        for (const variant of keyVariants) {
          if (cellsMap[variant]) {
            cellGroup = cellsMap[variant];
            break;
          }
        }
        if (!cellGroup) continue;

        const cell = cellGroup[ROYALTY_RATE_KEY];
        if (!cell) continue;
        const rawValue = values[ROYALTY_RATE_KEY];
        if (rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue))) {
          cell.textContent = '';
        } else {
          cell.textContent = formatCurrencyNoCents(rawValue);
        }
      }
    }

    function renderUserWellsTable(data) {
      const table = document.getElementById('userWellsTable');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      tbody.innerHTML = '';
      window.wellPvCells = {};

      if (!data || !data.api_uwi || data.api_uwi.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 15;
        cell.textContent = 'No wells found';
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
      }

      const formatInterest = (value) => {
        if (value === null || value === undefined || value === '') return '';
        const num = Number(value);
        if (Number.isNaN(num)) return '';
        return `${(num * 100).toFixed(2)}%`;
      };

      const formatVolume = (value) => {
        if (value === null || value === undefined || value === '') return '';
        const cleaned = typeof value === 'string' ? value.replace(/,/g, '') : value;
        const num = Number(cleaned);
        if (!Number.isFinite(num)) return '';
        return Math.round(num).toLocaleString('en-US');
      };

      for (let i = 0; i < data.api_uwi.length; i++) {
        const row = document.createElement('tr');
        const apiValue = data.api_uwi[i] || '';
        if (apiValue) {
          row.dataset.api = apiValue;
        }

        const rowValues = [
          { key: 'api_uwi', value: apiValue },
          { key: 'name', value: data.name && data.name[i] ? data.name[i] : '' },
          { key: 'operator', value: data.operator && data.operator[i] ? data.operator[i] : '' },
          { key: 'trajectory', value: data.trajectory && data.trajectory[i] ? data.trajectory[i] : '' },
          { key: 'owner_interest', value: data.owner_interest && data.owner_interest[i] != null ? formatInterest(data.owner_interest[i]) : '' },
          { key: 'permit_date', value: data.permit_date && data.permit_date[i] ? data.permit_date[i] : '' },
          { key: 'first_prod_date', value: data.first_prod_date && data.first_prod_date[i] ? data.first_prod_date[i] : '' },
          { key: 'last_prod_date', value: data.last_prod_date && data.last_prod_date[i] ? data.last_prod_date[i] : '' },
          { key: 'gross_oil_eur', value: data.gross_oil_eur && data.gross_oil_eur[i] != null ? formatVolume(data.gross_oil_eur[i]) : '' },
          { key: 'gross_gas_eur', value: data.gross_gas_eur && data.gross_gas_eur[i] != null ? formatVolume(data.gross_gas_eur[i]) : '' },
          { key: 'net_oil_eur', value: data.net_oil_eur && data.net_oil_eur[i] != null ? formatVolume(data.net_oil_eur[i]) : '' },
          { key: 'net_gas_eur', value: data.net_gas_eur && data.net_gas_eur[i] != null ? formatVolume(data.net_gas_eur[i]) : '' },
          { key: 'remaining_net_oil', value: data.remaining_net_oil && data.remaining_net_oil[i] != null ? formatVolume(data.remaining_net_oil[i]) : '' },
          { key: 'remaining_net_gas', value: data.remaining_net_gas && data.remaining_net_gas[i] != null ? formatVolume(data.remaining_net_gas[i]) : '' },
          { key: ROYALTY_RATE_KEY, value: data[ROYALTY_RATE_KEY] && data[ROYALTY_RATE_KEY][i] != null ? formatCurrencyNoCents(data[ROYALTY_RATE_KEY][i]) : '' },
        ];

        let pvCellStore = null;
        if (apiValue) {
          pvCellStore = {};
          window.wellPvCells[apiValue] = pvCellStore;
          const apiNoDash = apiValue.replace(/-/g, '');
          window.wellPvCells[apiNoDash] = pvCellStore;
        }

        rowValues.forEach(({ key, value }) => {
          const td = document.createElement('td');
          td.textContent = value;
          row.appendChild(td);
          if (pvCellStore && key === ROYALTY_RATE_KEY) {
            pvCellStore[key] = td;
          }
        });
        tbody.appendChild(row);
      }

      if (window.latestPerWellPvMap) {
        applyPerWellPvMap(window.latestPerWellPvMap);
      }
    }

    window.updateWellPvValues = function updateWellPvValues(pvMap) {
      if (!pvMap || typeof pvMap !== 'object') return;
      window.latestPerWellPvMap = pvMap;
      applyPerWellPvMap(pvMap);
    };

    function renderUserWellsMap(data) {
      const mapDivId = 'userWellsMap';
      const mapDiv = document.getElementById(mapDivId);
      if (!mapDiv || !data || !data.lat || data.lat.length === 0) return;

      const hoverText = data.api_uwi.map((api, i) => {
        const name = data.name && data.name[i] ? data.name[i] : '';
        const fp = data.first_prod_date && data.first_prod_date[i] ? data.first_prod_date[i] : '';
        const comp = data.completion_date && data.completion_date[i] ? data.completion_date[i] : '';
        return `API: ${api}<br>Name: ${name}<br>First Prod: ${fp}<br>Completion: ${comp}`;
      });

      const traces = [];
      const lineTraceIndices = {};
      const traceToWellIndex = {};
      for (let i = 0; i < data.lat.length; i++) {
        if (data.lat_bh[i] && data.lon_bh[i]) {
          const traceIndex = traces.length;
          lineTraceIndices[i] = traceIndex;
          traceToWellIndex[traceIndex] = i;
          traces.push({
            type: 'scattermapbox',
            lat: [data.lat[i], data.lat_bh[i]],
            lon: [data.lon[i], data.lon_bh[i]],
            mode: 'lines',
            line: { color: 'red', width: 2 },
            text: [hoverText[i], hoverText[i]],
            hoverinfo: 'text',
            showlegend: false
          });
        }
      }

      const colors = data.lat.map(() => 'red');
      traces.push({
        type: 'scattermapbox',
        lat: data.lat,
        lon: data.lon,
        text: hoverText,
        mode: 'markers',
        marker: {
          size: 10,
          color: colors,
          line: { color: 'black', width: 1 }
        },
        hoverinfo: 'text',
        name: 'User Wells'
      });

      const center = calculateCentroid(data.lat, data.lon) || { lat: 31.0, lon: -99.0 };
      let zoom = 10;
      if (data.lat.length > 1) {
        const latMin = Math.min(...data.lat);
        const latMax = Math.max(...data.lat);
        const lonMin = Math.min(...data.lon);
        const lonMax = Math.max(...data.lon);
        const maxDiff = Math.max(latMax - latMin, lonMax - lonMin);
        if (maxDiff > 4) zoom = 6;
        else if (maxDiff > 2) zoom = 7;
        else if (maxDiff > 1) zoom = 8;
        else if (maxDiff > 0.5) zoom = 9;
        else if (maxDiff > 0.25) zoom = 10;
        else if (maxDiff > 0.1) zoom = 11;
        else zoom = 12;
      }

      const layout = {
        paper_bgcolor: '#156082',
        plot_bgcolor: '#156082',
        font: { color: '#eaeaea' },
        mapbox: {
          accesstoken: MAPBOX_TOKEN,
          style: currentMapStyle,
          center: center,
          zoom: zoom
        },
        margin: { t: 5, r: 10, b: 10, l: 10 },
        height: 400,
        // title: { text: 'User Wells Map', font: { color: '#eaeaea' } },
        showlegend: false
      };

      Plotly.newPlot(mapDivId, traces, layout, { scrollZoom: false });

      const markerTraceIndex = traces.length - 1;
      mapDiv.on('plotly_hover', e => {
        const traceIndex = e.points[0].curveNumber;
        let idx;
        if (traceIndex === markerTraceIndex) {
          idx = e.points[0].pointIndex;
        } else if (traceToWellIndex[traceIndex] !== undefined) {
          idx = traceToWellIndex[traceIndex];
        } else {
          return;
        }
        colors[idx] = 'green';
        Plotly.restyle(mapDivId, { 'marker.color': [colors] }, [markerTraceIndex]);
        if (lineTraceIndices[idx] !== undefined) {
          Plotly.restyle(mapDivId, { 'line.color': 'green' }, [lineTraceIndices[idx]]);
        }
      });
      mapDiv.on('plotly_unhover', e => {
        const traceIndex = e.points[0].curveNumber;
        let idx;
        if (traceIndex === markerTraceIndex) {
          idx = e.points[0].pointIndex;
        } else if (traceToWellIndex[traceIndex] !== undefined) {
          idx = traceToWellIndex[traceIndex];
        } else {
          return;
        }
        colors[idx] = 'red';
        Plotly.restyle(mapDivId, { 'marker.color': [colors] }, [markerTraceIndex]);
        if (lineTraceIndices[idx] !== undefined) {
          Plotly.restyle(mapDivId, { 'line.color': 'red' }, [lineTraceIndices[idx]]);
        }
      });
    }

    // Main draw function with frontend filtering
    async function drawWithFilteredData(year) {
      yearVal.textContent = year;
      
      try {
        // If we don't have data yet, fetch it
        if (!allWellData) {
          allWellData = await fetchAllData();
        }
        if (!userWellData) {
          userWellData = await fetchUserWells();
        }

        // Filter both datasets by year on frontend
        const generalData = filterDataByYear(allWellData, year);
        const userData = filterDataByYear(userWellData, year);

        // Table displays all user wells; no need to update here
        
        // Analyze nearby wells and create charts - use unfiltered user wells for centroid
        const nearbyAnalysis20 = analyzeNearbyWells(generalData, userWellData, year, 20);
        const nearbyAnalysis10 = analyzeNearbyWells(generalData, userWellData, year, 10);

        if (window.Stats) {
          window.Stats.render(generalData, userData, {
            nearby10: (nearbyAnalysis10.nearbyWells || []).length,
            nearby20: (nearbyAnalysis20.nearbyWells || []).length
          });
        }

        // Call createNearbyWellsChart with swapped order - 10-mile first, then 20-mile
        createNearbyWellsChart(nearbyAnalysis10.ageCategories, nearbyAnalysis10.centroid, 10, 'nearby-chart-10', 'total-nearby-10', 'rgba(21, 96, 130, 0.6)');
        createNearbyWellsChart(nearbyAnalysis20.ageCategories, nearbyAnalysis20.centroid, 20, 'nearby-chart', 'total-nearby', 'rgba(21, 96, 130, 0.3)');

        updateStatus(`✓ Showing ${generalData.lat.length} total wells (${userData.lat.length} yours) for year ${year}`, false, true);

        // Calculate colors for general wells
        const generalColors = calculateColors(generalData.years, year);
        
        // Create line data for well trajectories
        const generalLines = createLineData(generalData);
        const userLines = createLineData(userData);

        // First time: create the map
        if (!document.getElementById('map').data) {
          const traces = [];
          
          // Add general well trajectory lines
          if (generalLines.lineLats.length > 0) {
            traces.push({
              type: 'scattermapbox',
              lat: generalLines.lineLats,
              lon: generalLines.lineLons,
              mode: 'lines',
              line: {
                color: 'rgba(128, 128, 128, 0.4)',
                width: 1
              },
              hoverinfo: 'skip',
              name: 'Well Trajectories',
              showlegend: false
            });
          }

          // Add user well trajectory lines
          if (userLines.lineLats.length > 0) {
            traces.push({
              type: 'scattermapbox',
              lat: userLines.lineLats,
              lon: userLines.lineLons,
              mode: 'lines',
              line: {
                color: 'rgba(128, 128, 128, 0.6)',
                width: 2
              },
              hoverinfo: 'skip',
              name: 'Your Well Trajectories',
              showlegend: false
            });
          }
          
          // Add centroid marker if user has wells
          if (nearbyAnalysis20.centroid) {
            traces.push({
              type: 'scattermapbox',
              lat: [nearbyAnalysis20.centroid.lat],
              lon: [nearbyAnalysis20.centroid.lon],
              mode: 'markers',
              marker: {
                size: 15,
                color: 'orange',
                symbol: 'star',
                line: { color: 'white', width: 2 }
              },
              text: ['Centroid of Your Wells'],
              name: 'Centroid',
              showlegend: false
            });
          }
          
          // Add general wellhead points
          traces.push({
            type: 'scattermapbox',
            lat: generalData.lat, 
            lon: generalData.lon, 
            text: generalData.text,
            mode: 'markers', 
            marker: {
              size: 6,
              color: generalColors,
              line: { color: 'black', width: 1 }
            },
            name: 'All Wells',
            showlegend: true
          });

          // Add user wellhead points (red, larger)
          if (userData.lat.length > 0) {
            traces.push({
              type: 'scattermapbox',
              lat: userData.lat, 
              lon: userData.lon, 
              text: userData.text,
              mode: 'markers', 
              marker: {
                size: 10,
                color: 'red',
                line: { color: 'black', width: 1 },
                symbol: 'circle'
              },
              name: 'Your Wells',
              showlegend: true
            });
          }

          const layout = {
            paper_bgcolor: '#156082',
            plot_bgcolor: '#156082',
            font: { color: '#eaeaea' },
            mapbox: {
              accesstoken: MAPBOX_TOKEN,
              style: currentMapStyle,
              center: nearbyAnalysis20.centroid ? 
                { lat: nearbyAnalysis20.centroid.lat, lon: nearbyAnalysis20.centroid.lon } :
                { lat: 31.0, lon: -99.0 },
              zoom: nearbyAnalysis20.centroid ? 9 : 6
            },
            margin: { t: 40, r: 10, b: 10, l: 10 },
            height: window.innerHeight * 0.75,
            title: {
              text: `Oil Development Proximity Map - Year ${year}`,
              font: { color: '#eaeaea' }
            },
            legend: {
              x: 0,
              y: 1,
              bgcolor: 'rgba(0,0,0,0.5)',
              font: { color: '#eaeaea' }
            }
          };

          await Plotly.react('map', traces, layout, {scrollZoom: false});
          
          // ADD CIRCLE AFTER MAP IS CREATED - separate operation that doesn't affect your trace structure
          if (userWellData && userWellData.lat && userWellData.lat.length > 0) {
            const centroid = calculateCentroid(userWellData.lat, userWellData.lon);
            if (centroid) {
              // Calculate 20-mile circle points
              const circlePoints = [];
              const R = 3959; // Earth radius in miles
              for (let i = 0; i <= 64; i++) {
                const angle = (i * 2 * Math.PI) / 64;
                const radiusRad = 20 / R;
                const lat = Math.asin(
                  Math.sin(centroid.lat * Math.PI / 180) * Math.cos(radiusRad) +
                  Math.cos(centroid.lat * Math.PI / 180) * Math.sin(radiusRad) * Math.cos(angle)
                ) * 180 / Math.PI;
                const lon = (centroid.lon * Math.PI / 180 + Math.atan2(
                  Math.sin(angle) * Math.sin(radiusRad) * Math.cos(centroid.lat * Math.PI / 180),
                  Math.cos(radiusRad) - Math.sin(centroid.lat * Math.PI / 180) * Math.sin(lat * Math.PI / 180)
                )) * 180 / Math.PI;
                circlePoints.push({lat, lon});
              }
              
              // Calculate 10-mile circle points
              const circlePoints10 = [];
              for (let i = 0; i <= 64; i++) {
                const angle = (i * 2 * Math.PI) / 64;
                const radiusRad = 10 / R;
                const lat = Math.asin(
                  Math.sin(centroid.lat * Math.PI / 180) * Math.cos(radiusRad) +
                  Math.cos(centroid.lat * Math.PI / 180) * Math.sin(radiusRad) * Math.cos(angle)
                ) * 180 / Math.PI;
                const lon = (centroid.lon * Math.PI / 180 + Math.atan2(
                  Math.sin(angle) * Math.sin(radiusRad) * Math.cos(centroid.lat * Math.PI / 180),
                  Math.cos(radiusRad) - Math.sin(centroid.lat * Math.PI / 180) * Math.sin(lat * Math.PI / 180)
                )) * 180 / Math.PI;
                circlePoints10.push({lat, lon});
              }
              
              const circleTrace = {
                type: 'scattermapbox',
                lat: circlePoints.map(p => p.lat),
                lon: circlePoints.map(p => p.lon),
                mode: 'lines',
                fill: 'toself',
                fillcolor: 'rgba(21, 96, 130, 0.1)',
                line: {
                  color: 'rgba(21, 96, 130, 0.3)',
                  width: 2
                },
                hoverinfo: 'skip',
                name: '20 Mile Radius',
                showlegend: true
              };
              
              // Add 10-mile circle (blue)
              const circle10Trace = {
                type: 'scattermapbox',
                lat: circlePoints10.map(p => p.lat),
                lon: circlePoints10.map(p => p.lon),
                mode: 'lines',
                fill: 'toself',
                fillcolor: 'rgba(21, 96, 130, 0.3)',
                line: {
                  color: 'rgba(21, 96, 130, 0.6)',
                  width: 2
                },
                hoverinfo: 'skip',
                name: '10 Mile Radius',
                showlegend: true
              };
              
              // Add both circles as separate traces
              Plotly.addTraces('map', [circleTrace, circle10Trace]);
            }
          }
        } else {
          // Update only specific traces, not all traces (to avoid affecting the circles)
          // Get the number of traces that existed before we added the circles
          const originalTraceCount = document.getElementById('map').data.length - 2; // Subtract both circles
          
          const updateData = {
            lat: [
              generalLines.lineLats,
              userLines.lineLats,
              nearbyAnalysis20.centroid ? [nearbyAnalysis20.centroid.lat] : [],
              generalData.lat,
              userData.lat
            ],
            lon: [
              generalLines.lineLons,
              userLines.lineLons,
              nearbyAnalysis20.centroid ? [nearbyAnalysis20.centroid.lon] : [],
              generalData.lon,
              userData.lon
            ],
            text: [
              [],
              [],
              nearbyAnalysis20.centroid ? ['Centroid of Your Wells'] : [],
              generalData.text,
              userData.text
            ],
            'line.color': [
              'rgba(128, 128, 128, 0.4)',
              'rgba(128, 128, 128, 0.6)',
              null,
              null,
              null
            ],
            'marker.color': [
              null,
              null,
              nearbyAnalysis20.centroid ? ['orange'] : [],
              generalColors,
              userData.lat.length > 0 ? new Array(userData.lat.length).fill('red') : []
            ]
          };
          
          // Update only the original traces (0 through originalTraceCount-1), skip the circle
          const traceIndices = [];
          for (let i = 0; i < originalTraceCount; i++) {
            traceIndices.push(i);
          }
          
          await Plotly.restyle('map', updateData, traceIndices);
          
          // Update title separately
          await Plotly.relayout('map', {
            'title.text': `Oil Development Proximity Map - Year ${year}`
          });
        }

        // Click handler
        const mapDiv = document.getElementById('map');
        mapDiv.removeAllListeners('plotly_click');
        mapDiv.on('plotly_click', (evt) => {
          const p = evt.points?.[0];
          if (p) {
            alert(`Clicked: ${p.text}\nLat: ${p.lat}, Lon: ${p.lon}`);
          }
        });

      } catch (error) {
        updateStatus(`✗ Error: ${error.message}`, true);
        console.error('Error in drawWithFilteredData:', error);
      }
    }

    // Event listener
    yearInput.addEventListener('input', e => drawWithFilteredData(parseInt(e.target.value, 10)));

    // Initialize with frontend filtering
    drawWithFilteredData(parseInt(yearInput.value, 10));
    
    // Fire-and-forget: fetch production for user wells once
    loadUserProductionOnce().then(updateLastProductionMetrics);

    const mapStyleToggleBtn = document.getElementById('mapStyleToggle');
    if (mapStyleToggleBtn) {
      mapStyleToggleBtn.addEventListener('click', () => {
        currentMapStyle = currentMapStyle === MAPBOX_STYLE_TERRAIN ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_TERRAIN;
        mapStyleToggleBtn.textContent = currentMapStyle === MAPBOX_STYLE_TERRAIN ? 'Satellite View' : 'Terrain View';
        if (document.getElementById('userWellsMap') && document.getElementById('userWellsMap').data) {
          Plotly.relayout('userWellsMap', { 'mapbox.style': currentMapStyle });
        }
        if (document.getElementById('map') && document.getElementById('map').data) {
          Plotly.relayout('map', { 'mapbox.style': currentMapStyle });
        }
      });
    }

    // ===== Supporting documents =====
    const supportDocButtons = Array.from(document.querySelectorAll('.support-docs-button'));
    const supportDocsStatus = document.getElementById('support-docs-status');
    const supportDocsTableBody = document.querySelector('#support-docs-table tbody');
    const supportDocsEmptyState = document.getElementById('support-docs-empty');
    const supportDocsDateFormatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    let supportDocs = [];
    let isLoadingSupportDocs = false;
    let isUploadingSupportDoc = false;
    let supportDocsStatusTimeoutId = null;

    function setSupportDocsStatus(message, variant = null) {
      if (!supportDocsStatus) return;

      supportDocsStatus.textContent = message || '';
      supportDocsStatus.classList.remove(
        'support-docs-status--success',
        'support-docs-status--error',
        'is-visible'
      );

      if (supportDocsStatusTimeoutId) {
        window.clearTimeout(supportDocsStatusTimeoutId);
        supportDocsStatusTimeoutId = null;
      }

      if (message) {
        supportDocsStatus.classList.add('is-visible');
        if (variant === 'success') {
          supportDocsStatus.classList.add('support-docs-status--success');
          supportDocsStatusTimeoutId = window.setTimeout(() => {
            supportDocsStatus.classList.remove('is-visible');
            supportDocsStatusTimeoutId = null;
          }, 5000);
        } else if (variant === 'error') {
          supportDocsStatus.classList.add('support-docs-status--error');
        }
      }
    }

    function updateSupportDocsEmptyState() {
      if (!supportDocsEmptyState) return;
      if (!supportDocs.length) {
        supportDocsEmptyState.classList.add('is-visible');
      } else {
        supportDocsEmptyState.classList.remove('is-visible');
      }
    }

    function formatSupportDocSize(bytes) {
      const size = Number(bytes);
      if (!Number.isFinite(size) || size <= 0) return '--';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = size;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      const precision = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
      return `${value.toFixed(precision)} ${units[unitIndex]}`;
    }

    function renderSupportDocsTable() {
      if (!supportDocsTableBody) return;

      supportDocsTableBody.innerHTML = '';
      supportDocs.forEach((doc) => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = doc.filename || 'Document';
        link.addEventListener('click', (event) => {
          event.preventDefault();
          openSupportDoc(doc);
        });
        nameCell.appendChild(link);
        row.appendChild(nameCell);

        const uploadedCell = document.createElement('td');
        if (doc.created_at) {
          const date = new Date(doc.created_at);
          uploadedCell.textContent = Number.isNaN(date.getTime())
            ? '--'
            : supportDocsDateFormatter.format(date);
        } else {
          uploadedCell.textContent = '--';
        }
        row.appendChild(uploadedCell);

        const sizeCell = document.createElement('td');
        sizeCell.textContent = formatSupportDocSize(doc.bytes);
        row.appendChild(sizeCell);

        const noteCell = document.createElement('td');
        noteCell.textContent = doc.note || '--';
        row.appendChild(noteCell);

        const actionsCell = document.createElement('td');
        actionsCell.className = 'support-docs-actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'support-docs-action support-docs-action--primary';
        editButton.textContent = 'Edit Note';
        editButton.addEventListener('click', () => {
          handleSupportDocEdit(doc);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'support-docs-action support-docs-action--danger';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
          handleSupportDocDelete(doc);
        });

        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);
        row.appendChild(actionsCell);

        supportDocsTableBody.appendChild(row);
      });

      updateSupportDocsEmptyState();
    }

    async function supportDocsRequest(url, options = {}) {
      const fetchOptions = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: options.headers ? { ...options.headers } : {},
      };

      if (options.body !== undefined) {
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = 'application/json';
        }
        fetchOptions.body = options.body;
      }

      const csrfToken = getCsrfToken();
      if (csrfToken) {
        fetchOptions.headers['X-CSRFToken'] = csrfToken;
      }

      const response = await fetch(url, fetchOptions);
      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (_) { data = null; }
      }

      if (response.status === 401) {
        throw new Error('Please log in to manage supporting documents.');
      }

      if (!response.ok) {
        const detail = data && (data.detail || data.error);
        throw new Error(detail || `Request failed (${response.status})`);
      }

      return data;
    }

    async function loadSupportDocs() {
      if (!supportDocsTableBody || isLoadingSupportDocs) return;

      isLoadingSupportDocs = true;
      setSupportDocsStatus('Loading documents...');
      try {
        const data = await supportDocsRequest('/api/files');
        supportDocs = Array.isArray(data?.files) ? data.files : [];
        renderSupportDocsTable();
        if (supportDocs.length) {
          setSupportDocsStatus('');
        } else {
          setSupportDocsStatus('');
        }
      } catch (error) {
        console.error('Failed to load supporting documents:', error);
        setSupportDocsStatus('Unable to load documents right now.', 'error');
      } finally {
        isLoadingSupportDocs = false;
      }
    }

    async function openSupportDoc(doc) {
      if (!doc || !doc.id) return;
      try {
        setSupportDocsStatus('Generating download link...');
        const data = await supportDocsRequest(`/api/files/${doc.id}/open`, {
          method: 'POST',
          body: '{}',
        });
        if (data?.download_url) {
          window.open(data.download_url, '_blank', 'noopener');
          setSupportDocsStatus('Download link ready.', 'success');
        } else {
          throw new Error('Download URL unavailable.');
        }
      } catch (error) {
        console.error('Failed to open document:', error);
        setSupportDocsStatus(error.message || 'Unable to open document.', 'error');
      }
    }

    async function updateSupportDocNote(doc, newNote) {
      if (!doc || !doc.id) return;
      try {
        setSupportDocsStatus('Saving comment...');
        const payload = { note: newNote };
        await supportDocsRequest(`/api/files/${doc.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        doc.note = (newNote || '').trim() ? newNote : null;
        renderSupportDocsTable();
        setSupportDocsStatus('Comment updated.', 'success');
      } catch (error) {
        console.error('Failed to update document note:', error);
        setSupportDocsStatus(error.message || 'Unable to update comment.', 'error');
      }
    }

    async function deleteSupportDoc(doc) {
      if (!doc || !doc.id) return;
      try {
        setSupportDocsStatus('Deleting document...');
        await supportDocsRequest(`/api/files/${doc.id}`, {
          method: 'DELETE',
        });
        supportDocs = supportDocs.filter((item) => item !== doc);
        renderSupportDocsTable();
        setSupportDocsStatus('Document deleted.', 'success');
      } catch (error) {
        console.error('Failed to delete document:', error);
        setSupportDocsStatus(error.message || 'Unable to delete document.', 'error');
      }
    }

    async function uploadSupportDoc(file, note) {
      if (!file) return;
      if (isUploadingSupportDoc) {
        setSupportDocsStatus('An upload is already in progress.');
        return;
      }

      isUploadingSupportDoc = true;
      supportDocButtons.forEach((button) => button.setAttribute('disabled', 'disabled'));
      setSupportDocsStatus('Starting upload...');

      try {
        const contentType = file.type || 'application/octet-stream';
        const startData = await supportDocsRequest('/api/uploads/start', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            content_type: contentType,
          }),
        });

        if (!startData?.upload_url || !startData?.file_id || !startData?.s3_key) {
          throw new Error('Upload could not be initialized.');
        }

        const uploadHeaders = { ...(startData.headers || {}) };
        if (!uploadHeaders['Content-Type'] && !uploadHeaders['content-type']) {
          uploadHeaders['Content-Type'] = contentType;
        }

        const uploadResponse = await fetch(startData.upload_url, {
          method: 'PUT',
          headers: uploadHeaders,
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed (${uploadResponse.status})`);
        }

        await supportDocsRequest('/api/uploads/finalize', {
          method: 'POST',
          body: JSON.stringify({
            file_id: startData.file_id,
            s3_key: startData.s3_key,
            note,
          }),
        });

        setSupportDocsStatus('Document uploaded successfully.', 'success');
        await loadSupportDocs();
      } catch (error) {
        console.error('Failed to upload supporting document:', error);
        setSupportDocsStatus(error.message || 'Unable to upload document.', 'error');
      } finally {
        isUploadingSupportDoc = false;
        supportDocButtons.forEach((button) => button.removeAttribute('disabled'));
      }
    }

    function handleSupportDocEdit(doc) {
      if (!doc) return;
      const currentNote = doc.note || '';
      const result = window.prompt('Update the comment for this document:', currentNote);
      if (result === null) {
        return;
      }
      updateSupportDocNote(doc, result);
    }

    function handleSupportDocDelete(doc) {
      if (!doc) return;
      const confirmed = window.confirm('Delete this document and its comment?');
      if (!confirmed) return;
      deleteSupportDoc(doc);
    }

    function handleSupportDocButtonClick() {
      if (isUploadingSupportDoc) {
        setSupportDocsStatus('Please wait for the current upload to complete.');
        return;
      }

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        document.body.removeChild(fileInput);

        if (!file) {
          setSupportDocsStatus('No file selected.');
          return;
        }

        const note = window.prompt('Add a comment about this document (optional):', '');
        if (note === null) {
          setSupportDocsStatus('Upload cancelled.');
          return;
        }

        uploadSupportDoc(file, note);
      }, { once: true });

      fileInput.click();
    }

    if (supportDocButtons.length) {
      supportDocButtons.forEach((button) => {
        button.addEventListener('click', handleSupportDocButtonClick);
      });
    }

    if (supportDocsTableBody) {
      loadSupportDocs();
    }

    const feedbackForm = document.getElementById('feedback-form');
    const feedbackTextarea = document.getElementById('feedback-text');
    const feedbackSubmitButton = document.getElementById('feedback-submit');
    const feedbackStatus = document.getElementById('feedback-status');
    const feedbackTableBody = document.querySelector('#feedback-table tbody');
    const feedbackEmptyState = document.getElementById('feedback-empty');
    const feedbackRefreshButton = document.getElementById('feedback-refresh');

    const feedbackDateFormatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    let feedbackEntries = [];
    let feedbackStatusTimeoutId = null;
    let isFeedbackLoading = false;

    const normaliseIsoString = (value) => {
      if (typeof value !== 'string') return value;
      return value.endsWith('Z') ? `${value.slice(0, -1)}+00:00` : value;
    };

    const parseIsoDate = (value) => {
      if (!value) return null;
      const parsed = new Date(normaliseIsoString(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const formatFeedbackTimestamp = (value) => {
      const date = parseIsoDate(value);
      if (!date) return '--';
      return feedbackDateFormatter.format(date);
    };

    const setFeedbackStatus = (message, variant = 'info') => {
      if (!feedbackStatus) return;
      feedbackStatus.textContent = message || '';
      feedbackStatus.className = 'feedback-status';
      feedbackStatus.style.opacity = message ? 1 : 0;

      if (message) {
        if (variant === 'success') {
          feedbackStatus.classList.add('feedback-status--success');
        } else if (variant === 'error') {
          feedbackStatus.classList.add('feedback-status--error');
        }

        if (feedbackStatusTimeoutId) {
          window.clearTimeout(feedbackStatusTimeoutId);
        }

        feedbackStatusTimeoutId = window.setTimeout(() => {
          feedbackStatus.style.opacity = 0;
          feedbackStatusTimeoutId = null;
        }, 4000);
      } else if (feedbackStatusTimeoutId) {
        window.clearTimeout(feedbackStatusTimeoutId);
        feedbackStatusTimeoutId = null;
      }
    };

    const toggleFeedbackEmptyState = () => {
      if (!feedbackEmptyState) return;
      if (!feedbackEntries.length) {
        feedbackEmptyState.classList.add('is-visible');
      } else {
        feedbackEmptyState.classList.remove('is-visible');
      }
    };

    const renderFeedbackEntries = () => {
      if (!feedbackTableBody) return;
      feedbackTableBody.innerHTML = '';

      feedbackEntries.forEach((entry) => {
        const row = document.createElement('tr');
        row.dataset.submittedAt = entry.submitted_at;
        if (entry.isSaving) {
          row.classList.add('feedback-row--saving');
        }

        const submittedCell = document.createElement('td');
        submittedCell.textContent = formatFeedbackTimestamp(entry.submitted_at);
        row.appendChild(submittedCell);

        const feedbackCell = document.createElement('td');
        if (entry.isEditing) {
          const textarea = document.createElement('textarea');
          textarea.className = 'feedback-edit-textarea';
          textarea.value = entry.editDraft ?? entry.feedback_text ?? '';
          textarea.addEventListener('input', (event) => {
            entry.editDraft = event.target.value;
          });
          feedbackCell.appendChild(textarea);
        } else {
          feedbackCell.textContent = entry.feedback_text || '--';
        }
        row.appendChild(feedbackCell);

        const actionsCell = document.createElement('td');
        actionsCell.className = 'feedback-actions';

        if (entry.isEditing) {
          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'feedback-action feedback-action--primary';
          saveBtn.textContent = 'Save';
          saveBtn.addEventListener('click', () => {
            saveFeedbackEdit(entry);
          });

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'feedback-action';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.addEventListener('click', () => {
            entry.isEditing = false;
            entry.editDraft = undefined;
            renderFeedbackEntries();
          });

          actionsCell.appendChild(saveBtn);
          actionsCell.appendChild(cancelBtn);
        } else {
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'feedback-action';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', () => {
            entry.isEditing = true;
            entry.editDraft = entry.feedback_text;
            renderFeedbackEntries();
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'feedback-action feedback-action--danger';
          deleteBtn.textContent = 'Delete';
          deleteBtn.addEventListener('click', () => {
            deleteFeedbackEntry(entry);
          });

          actionsCell.appendChild(editBtn);
          actionsCell.appendChild(deleteBtn);
        }

        row.appendChild(actionsCell);
        feedbackTableBody.appendChild(row);
      });

      toggleFeedbackEmptyState();
    };

    const hydrateFeedbackEntries = (entries) => {
      feedbackEntries = Array.isArray(entries)
        ? entries.map((entry) => ({ ...entry }))
        : [];
      renderFeedbackEntries();
    };

    const loadFeedbackEntries = async (showStatus = false) => {
      if (!feedbackTableBody || isFeedbackLoading) return;
      isFeedbackLoading = true;
      if (showStatus) {
        setFeedbackStatus('Refreshing feedback history...');
      }
      if (feedbackRefreshButton) {
        feedbackRefreshButton.disabled = true;
      }

      try {
        const response = await fetch('/feedback/');
        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }
        const payload = await response.json();
        hydrateFeedbackEntries(payload.entries || []);
        if (showStatus) {
          setFeedbackStatus('Feedback history updated.', 'success');
        } else {
          setFeedbackStatus('');
        }
      } catch (error) {
        console.error('Failed to load feedback entries:', error);
        setFeedbackStatus('Unable to load feedback history right now.', 'error');
      } finally {
        isFeedbackLoading = false;
        if (feedbackRefreshButton) {
          feedbackRefreshButton.disabled = false;
        }
      }
    };

    const saveFeedbackEdit = async (entry) => {
      const newText = (entry.editDraft ?? '').trim();
      if (!newText) {
        setFeedbackStatus('Feedback text cannot be empty.', 'error');
        return;
      }

      entry.isSaving = true;
      renderFeedbackEntries();

      try {
        const response = await fetch('/feedback/', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submitted_at: entry.submitted_at,
            feedback_text: newText
          })
        });

        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }

        const payload = await response.json();
        const updatedEntry = payload.entry || {};
        entry.feedback_text = updatedEntry.feedback_text ?? newText;
        entry.submitted_at = updatedEntry.submitted_at ?? entry.submitted_at;
        entry.isEditing = false;
        entry.editDraft = undefined;
        setFeedbackStatus('Feedback updated.', 'success');
      } catch (error) {
        console.error('Failed to update feedback entry:', error);
        setFeedbackStatus('Unable to update feedback. Please try again.', 'error');
      } finally {
        entry.isSaving = false;
        renderFeedbackEntries();
      }
    };

    const deleteFeedbackEntry = async (entry) => {
      if (!window.confirm('Delete this feedback entry?')) {
        return;
      }

      entry.isSaving = true;
      renderFeedbackEntries();

      try {
        const response = await fetch('/feedback/', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submitted_at: entry.submitted_at })
        });

        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }

        feedbackEntries = feedbackEntries.filter((item) => item !== entry);
        renderFeedbackEntries();
        setFeedbackStatus('Feedback removed.', 'success');
      } catch (error) {
        console.error('Failed to delete feedback entry:', error);
        entry.isSaving = false;
        renderFeedbackEntries();
        setFeedbackStatus('Unable to delete feedback. Please try again.', 'error');
      }
    };

    if (feedbackTableBody) {
      toggleFeedbackEmptyState();
    }

    if (feedbackRefreshButton) {
      feedbackRefreshButton.addEventListener('click', () => {
        loadFeedbackEntries(true);
      });
    }

    if (feedbackForm && feedbackTextarea && feedbackSubmitButton) {
      const originalButtonText = feedbackSubmitButton.textContent;

      feedbackForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedbackValue = (feedbackTextarea.value || '').trim();

        if (!feedbackValue) {
          setFeedbackStatus('Please enter feedback before submitting.', 'error');
          feedbackTextarea.focus();
          return;
        }

        try {
          feedbackTextarea.setAttribute('disabled', 'disabled');
          feedbackSubmitButton.disabled = true;
          feedbackSubmitButton.textContent = 'Submitting...';
          setFeedbackStatus('Submitting feedback...');

          const response = await fetch('/feedback/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback_text: feedbackValue })
          });

          if (!response.ok) {
            throw new Error(`Unexpected status: ${response.status}`);
          }

          const payload = await response.json();
          const newEntry = payload.entry || {};
          feedbackEntries = [
            newEntry,
            ...feedbackEntries.filter((entry) => entry.submitted_at !== newEntry.submitted_at)
          ];
          renderFeedbackEntries();
          feedbackForm.reset();
          setFeedbackStatus('Feedback submitted. Thank you!', 'success');
        } catch (error) {
          console.error('Failed to submit feedback:', error);
          setFeedbackStatus('Unable to submit feedback right now.', 'error');
        } finally {
          feedbackTextarea.removeAttribute('disabled');
          feedbackSubmitButton.disabled = false;
          feedbackSubmitButton.textContent = originalButtonText;
          feedbackTextarea.focus();
        }
      });

      loadFeedbackEntries();
    }
