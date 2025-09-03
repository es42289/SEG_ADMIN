const yearInput = document.getElementById('year');
    const yearVal = document.getElementById('year-val');
    const statusDiv = document.getElementById('status');
    const userWellsCount = document.getElementById('user-wells-count');
    // Removed references to totalNearby elements as they were removed from the HTML

    const MAPBOX_TOKEN = 'pk.eyJ1Ijoid2VsbG1hcHBlZCIsImEiOiJjbGlreXVsMWowNDg5M2ZxcGZucDV5bnIwIn0.5wYuJnmZvUbHZh9M580M-Q';
    const MAPBOX_STYLE = 'mapbox://styles/wellmapped/clixrm3dg00fy01pzehcncxie';

    function updateStatus(message, isError = false, isSuccess = false) {
      statusDiv.textContent = message;
      statusDiv.className = 'status';
      if (isError) statusDiv.classList.add('error');
      if (isSuccess) statusDiv.classList.add('success');
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
          console.log('bulk-production (user only, ONCE):', {
            apis_sent: apis.length,
            rows_returned: prod ? prod.count : 0,
            apis_with_rows: Object.keys(window.productionByApi).length
          });
          return window.productionByApi;
        } catch (e) {
          console.error('loadUserProductionOnce error:', e);
          window.productionByApi = {};
          return window.productionByApi;
        }
      })();

      return productionLoadPromise;
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
    function createNearbyWellsChart(ageCategories, centroid, radiusMiles = 20, chartId = 'nearby-chart', totalId = 'total-nearby', chartColor = 'red') {
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
            width: 3  // Thick borders
          }
        },
        text: [recentCount, mediumCount, oldCount],
        textposition: 'auto',
        textfont: {
          color: '#ffffff'
        }
      }];

      const layout = {
        title: {
          text: `Wells within ${radiusMiles} Miles by Age`,
          font: { color: '#eaeaea', size: 16 }
        },
        paper_bgcolor: '#1a1a1a',
        plot_bgcolor: '#2a2a2a',
        font: { color: '#eaeaea' },
        xaxis: {
          title: 'Well Age',
          color: '#eaeaea',
          gridcolor: '#444'
        },
        yaxis: {
          title: 'Number of Wells',
          color: '#eaeaea',
          gridcolor: '#444'
        },
        margin: { t: 50, r: 20, b: 60, l: 60 }
      };

      Plotly.newPlot(chartId, data, layout, {displayModeBar: false});

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
        
        updateStatus(`✓ Loaded ${data.lat.length} total wells from Snowflake`, false, true);
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
          return { lat: [], lon: [], text: [], year: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [], api_uwi: [] };
        }
        
        console.log(`Received ${data.lat.length} user wells`);
        return data;
        
      } catch (error) {
        console.error('User wells fetch error:', error);
        return { lat: [], lon: [], text: [], year: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [], api_uwi: [] };
      }
    }

    // Filter data by year (frontend filtering) - show wells completed <= year
    function filterDataByYear(data, year) {
      if (!data || !data.year) {
        return { lat: [], lon: [], text: [], years: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [] };
      }

      const filteredIndices = [];
      for (let i = 0; i < data.year.length; i++) {
        if (data.year[i] <= year) {
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
        api_uwi: filteredIndices.map(i => data.api_uwi ? data.api_uwi[i] : null)
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
    function createLineData(data, colors, year) {
      const lineLats = [];
      const lineLons = [];
      const lineColors = [];
      
      for (let i = 0; i < data.lat.length; i++) {
        if (data.lat_bh[i] && data.lon_bh[i]) {
          // Use dark grey with low opacity for all well sticks
          const wellColor = 'rgba(64, 64, 64, 0.15)'; // Dark grey, mostly transparent
          
          lineLats.push(data.lat[i]);
          lineLons.push(data.lon[i]);
          lineLats.push(data.lat_bh[i]);
          lineLons.push(data.lon_bh[i]);
          lineLats.push(null);
          lineLons.push(null);
          
          lineColors.push(wellColor);
          lineColors.push(wellColor);
          lineColors.push(wellColor);
        }
      }
      
      return { lineLats, lineLons, lineColors };
    }

    function renderUserWellsTable(data) {
      const table = document.getElementById('userWellsTable');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (!data || !data.api_uwi || data.api_uwi.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.textContent = 'No wells found';
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
      }

      for (let i = 0; i < data.api_uwi.length; i++) {
        const row = document.createElement('tr');
        const cells = [
          data.api_uwi[i] || '',
          data.years[i] || '',
          data.last_producing[i] || '',
          data.owner_interest[i] != null ? data.owner_interest[i] : ''
        ];
        cells.forEach(txt => {
          const td = document.createElement('td');
          td.textContent = txt;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      }
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

        // Update user wells count display
        userWellsCount.textContent = `Your Wells: ${userData.lat.length}`;
        renderUserWellsTable(userData);
        
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
        createNearbyWellsChart(nearbyAnalysis10.ageCategories, nearbyAnalysis10.centroid, 10, 'nearby-chart-10', 'total-nearby-10', 'blue');
        createNearbyWellsChart(nearbyAnalysis20.ageCategories, nearbyAnalysis20.centroid, 20, 'nearby-chart', 'total-nearby', 'red');

        updateStatus(`✓ Showing ${generalData.lat.length} total wells (${userData.lat.length} yours) for year ${year}`, false, true);

        // Calculate colors for general wells
        const generalColors = calculateColors(generalData.years, year);
        
        // Create line data for general wells
        const generalLines = createLineData(generalData, generalColors, year);
        
        // Create line data for user wells (red trajectories)
        const userLines = createLineData(userData, [], year);
        const userLineColors = userLines.lineColors.map(() => 'rgba(64, 64, 64, 0.25)');

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
                color: generalLines.lineColors,
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
                color: userLineColors,
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
              showlegend: true
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
              line: { color: 'white', width: 1 }
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
                line: { color: 'white', width: 2 },
                symbol: 'circle'
              },
              name: 'Your Wells',
              showlegend: true
            });
          }

          const layout = {
            paper_bgcolor: '#0b0b0c',
            plot_bgcolor: '#0b0b0c',
            font: { color: '#eaeaea' },
            mapbox: {
              accesstoken: MAPBOX_TOKEN,
              style: MAPBOX_STYLE,
              center: nearbyAnalysis20.centroid ? 
                { lat: nearbyAnalysis20.centroid.lat, lon: nearbyAnalysis20.centroid.lon } :
                { lat: 31.0, lon: -99.0 },
              zoom: nearbyAnalysis20.centroid ? 8 : 6
            },
            margin: { t: 40, r: 10, b: 10, l: 10 },
            height: window.innerHeight * 0.8,
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

          await Plotly.react('map', traces, layout, {scrollZoom: true});
          
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
                fillcolor: 'rgba(255, 0, 0, 0.1)',
                line: {
                  color: 'rgba(255, 0, 0, 0.3)',
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
                fillcolor: 'rgba(0, 0, 255, 0.1)',
                line: {
                  color: 'rgba(0, 0, 255, 0.3)',
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
            lat: [generalLines.lineLats, userLines.lineLats, nearbyAnalysis20.centroid ? [nearbyAnalysis20.centroid.lat] : [], generalData.lat, userData.lat],
            lon: [generalLines.lineLons, userLines.lineLons, nearbyAnalysis20.centroid ? [nearbyAnalysis20.centroid.lon] : [], generalData.lon, userData.lon],
            text: [[], [], nearbyAnalysis20.centroid ? ['Centroid of Your Wells'] : [], generalData.text, userData.text],
            'line.color': [generalLines.lineColors, userLineColors, [], [], []],
            'marker.color': [[], [], nearbyAnalysis20.centroid ? ['orange'] : [], generalColors, userData.lat.length > 0 ? new Array(userData.lat.length).fill('red') : []]
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
    loadUserProductionOnce();