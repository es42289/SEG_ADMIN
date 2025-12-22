// Handles price deck selection and economics charts
(function(){
  async function fetchJSON(url){
    const r = await fetch(url);
    return r.json();
  }

  async function loadPriceDeckOptions(){
    const sel = document.getElementById('priceDeckSelect');
    if (!sel) return;
    const data = await fetchJSON('/price-decks/');
    data.options.forEach(o=>{
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      sel.appendChild(opt);
    });
    if(data.options.length){
      sel.value = data.options[0];
      loadPriceDeck(sel.value);
    }
    sel.addEventListener('change',()=>{
      loadPriceDeck(sel.value);
    });
  }

  async function loadPriceDeck(name){
    const resp = await fetchJSON('/price-decks/?deck='+encodeURIComponent(name));
    if(resp.data){
      renderPriceDeck(resp.data);
      loadEconomics(name);
    }
  }

  function renderPriceDeck(rows){
    const chartEl = document.getElementById('priceDeckChart');
    if (!chartEl) return;
    const dates = rows.map(r=>r.MONTH_DATE);
    const toPos = v=>{
      const num = Number(v);
      return isFinite(num) && num > 0 ? num : null;
    };
    const oil = rows.map(r=>toPos(r.OIL));
    const gas = rows.map(r=>toPos(r.GAS));
    const fig = [
      {x:dates,y:oil,mode:'lines',name:'Oil',line:{color:'green'}},
      {x:dates,y:gas,mode:'lines',name:'Gas',line:{color:'red'}}
    ];
    Plotly.newPlot(chartEl,fig,{showlegend: false,
                                            yaxis:{type:'log', title:'Gas Price / Oil Price, $'},
                                            title:'Price Deck',
                                            margin:{ l: 40, r: 5, t: 40, b: 40 }},
                                            {responsive:true});
  }

  async function loadEconomics(deck){
    const npvEl = document.getElementById('npvChart');
    const cumEl = document.getElementById('cumCashChart');
    const windowEl = document.getElementById('cashflowWindowChart');
    const summaryEl = document.getElementById('cashflowSummaryChart');
    const statsEl = document.getElementById('summaryStats');
    if(!npvEl && !cumEl && !windowEl && !summaryEl && !statsEl) return;
    const data = await fetchJSON('/econ-data/?deck='+encodeURIComponent(deck));
    if (npvEl && data.npv) renderNPV(npvEl, data.npv);
    if (cumEl && data.cum) renderCum(cumEl, data.cum);
    if (windowEl && data.window) renderWindow(windowEl, data.window);
    if (summaryEl && data.summary) renderSummary(summaryEl, data.summary);
    if (data.stats || data.royalty_curve) {
      renderStats(statsEl, data.stats, data.royalty_curve);
    }
    if (typeof window.syncRoyaltyPanelHeight === 'function') {
      window.syncRoyaltyPanelHeight();
      setTimeout(window.syncRoyaltyPanelHeight, 150);
    }
    if (typeof window.updateCashflowMetrics === 'function' && data.stats) {
      window.updateCashflowMetrics(data.stats.ltm_cf, data.stats.ntm_cf);
    }
    if (data.per_well_pv && typeof window.updateWellPvValues === 'function') {
      window.updateWellPvValues(data.per_well_pv);
    }
  }

  function resolveEl(el){
    return typeof el === 'string' ? document.getElementById(el) : el;
  }

  function renderNPV(el, npv){
    const target = resolveEl(el);
    if(!target) return;
    const rates = npv.map(r=>r.rate);
    const vals = npv.map(r=>r.npv);
    Plotly.newPlot(target,[{type:'bar',x:rates,y:vals,marker:{color:'#737F6F'}}],{title:'NPV'});
  }

  function renderCum(el, c){
    const target = resolveEl(el);
    if(!target) return;
    const fig = [
      {x:c.dates,y:c.cum_revenue,mode:'lines',name:'Cum Revenue',line:{color:'#1e8f4e'}},
      {x:c.dates,y:c.cum_ncf,mode:'lines',name:'Cum NCF',line:{color:'#d62728'}}
    ];
    Plotly.newPlot(target,fig,{title:'Cumulative Cash and Revenue'}, {responsive:true});
  }

  function renderWindow(el, w){
    const target = resolveEl(el);
    if(!target) return;
    const dates = w.dates.map(d=>new Date(d));
    const yMax = Math.max(0, ...w.ncf);
    const today = new Date(w.today);
    const ltmCenter = new Date(today);
    ltmCenter.setMonth(ltmCenter.getMonth() - 6);
    const ntmCenter = new Date(today);
    ntmCenter.setMonth(ntmCenter.getMonth() + 12);

    const fig = [{x:dates,y:w.ncf,type:'bar',marker:{color:'#156082'},name:'Net Cash Flow'}];
    const layout = {
      title:'Net Cash Flow: 12 Months Backward & 24 Months Forward',
      template:'plotly_white',
      height:400,
      xaxis:{
        tickangle:-45,
        tickformat:'%b %Y',
        dtick:'M4',
        tickmode:'linear',
        title:'Date'
      },
      yaxis:{title:'Net Cash Flow'},
      shapes:[{
        type:'line',
        x0:today,x1:today,yref:'paper',y0:0,y1:1,
        line:{color:'red',dash:'dash'}
      }],
      annotations:[
        {
          x:today,
          y:yMax,
          text:'<b>Today</b>',
          showarrow:true,
          arrowhead:0,
          arrowsize:1,
          arrowwidth:2,
          ax:-40,ay:-40,
          font:{color:'red',size:12},
          align:'center'
        },
        {
          x:ltmCenter,
          y:yMax*1.05,
          text:'Last 12 Months',
          showarrow:false,
          font:{size:14},
          xanchor:'center'
        },
        {
          x:ntmCenter,
          y:yMax*1.05,
          text:'Next 24 Months',
          showarrow:false,
          font:{size:14},
          xanchor:'center'
        }
      ]
    };
    Plotly.newPlot(target,fig,layout,{responsive:true});
  }

  function renderSummary(el, s){
    const target = resolveEl(el);
    if(!target) return;
    const labels = s.map(v => v.label || v.CF_YR);
    const vals = s.map(v => v.value ?? v.CNCF);

    const LTM_LABEL = 'Last 12 Months';
    const NTM_LABEL = 'Next 12 Months';

    const ltmIdx = labels.indexOf(LTM_LABEL);
    const ntmIdx = labels.indexOf(NTM_LABEL);

    const ordered = [];
    if (ltmIdx !== -1) ordered.push({label: LTM_LABEL, value: vals[ltmIdx]});
    if (ntmIdx !== -1) ordered.push({label: NTM_LABEL, value: vals[ntmIdx]});
    const years = labels
      .map((label, i) => ({label, value: vals[i]}))
      .filter((_, i) => i !== ltmIdx && i !== ntmIdx)
      .sort((a, b) => parseInt(a.label) - parseInt(b.label));
    ordered.push(...years);

    const ordLabels = ordered.map(o => o.label);
    const ordVals = ordered.map(o => o.value);

    const colors = ordLabels.map(l => {
      if (l === LTM_LABEL) return '#156082';
      if (l === NTM_LABEL) return '#156082';
      return '#156082';
    });

    function formatCurrency(value){
      const absVal = Math.abs(value);
      if (absVal >= 1_000_000) return `$${(value/1_000_000).toFixed(1)}M`;
      if (absVal >= 1_000) return `$${(value/1_000).toFixed(1)}k`;
      return `$${value.toFixed(0)}`;
    }

    const trace = {
      type: 'bar',
      x: ordLabels,
      y: ordVals,
      marker: {color: colors},
      text: ordVals.map(formatCurrency),
      textposition: 'outside',
      textfont: {size: 18, color: 'black'}
    };

    const positiveMax = Math.max(0, ...ordVals);
    const negativeMin = Math.min(0, ...ordVals);
    const span = positiveMax - negativeMin;
    const padBase = span === 0 ? (positiveMax || Math.abs(negativeMin) || 1) : span;
    const padding = padBase * 0.1;
    const yRange = [
      negativeMin === 0 ? 0 : negativeMin - padding,
      positiveMax + padding
    ];

    const layout = {
      title: 'Cumulative Net Cash Flow Summary',
      yaxis: {title: 'CNCF ($)', range: yRange},
      xaxis: {title: 'Period', type: 'category'},
      uniformtext: {minsize: 8, mode: 'hide'},
      template: 'plotly_white',
      height: 400
    };

    Plotly.newPlot(target, [trace], layout, {responsive: true});
    if (typeof window.syncRoyaltyPanelHeight === 'function') {
      window.syncRoyaltyPanelHeight();
    }
  }

  function renderStats(el, stats, royaltyCurve){
    const target = resolveEl(el);
    const statData = stats || {};

    function formatNumber(v){
      const num = Number(v ?? 0);
      if (!Number.isFinite(num)) return '0';
      return num.toLocaleString('en-US',{maximumFractionDigits:0});
    }
    function formatCurrency(v){
      const num = Number(v ?? 0);
      if (!Number.isFinite(num)) return '$0';
      const sign = num < 0 ? '-' : '';
      const abs = Math.abs(num);
      if (abs >= 1_000_000) return `${sign}$${(abs/1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${sign}$${(abs/1_000).toFixed(1)}k`;
      return `${sign}$${abs.toFixed(0)}`;
    }

    const assetValueBox = document.getElementById('asset-value-box');
    if (assetValueBox) {
      const amountEl = assetValueBox.querySelector('.asset-value-amount');
      if (amountEl) {
        const pv17 = Number(statData && statData.pv17);
        if (Number.isFinite(pv17)) {
          const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
          const absFormatted = formatter.format(Math.round(Math.abs(pv17)));
          amountEl.textContent = `${pv17 < 0 ? '-$' : '$'}${absFormatted}`;
        } else {
          amountEl.textContent = '--';
        }
      }
    }

    const mapping = {
      'stat-ltm-oil': `Last 12 Months Oil: <br>${formatNumber(statData.ltm_oil)} BBL`,
      'stat-ltm-gas': `Last 12 Months Gas: <br>${formatNumber(statData.ltm_gas)} MCF`,
      'stat-ltm-cf': `Last 12 Months Cashflow: <br>${formatCurrency(statData.ltm_cf)}`,
      'stat-ntm-oil': `Next 12 Months Oil: <br>${formatNumber(statData.ntm_oil)} BBL`,
      'stat-ntm-gas': `Next 12 Months Gas: <br>${formatNumber(statData.ntm_gas)} MCF`,
      'stat-ntm-cf': `Next 12 Months Cashflow: <br>${formatCurrency(statData.ntm_cf)}`
    };

    if (target) {
      Object.entries(mapping).forEach(([id, html]) => {
        const statEl = document.getElementById(id);
        if (statEl) {
          statEl.innerHTML = html;
        }
      });
    }

    renderRoyaltyChart('royaltyValueChart', royaltyCurve);
    if (typeof window.syncRoyaltyPanelHeight === 'function') {
      window.syncRoyaltyPanelHeight();
      setTimeout(window.syncRoyaltyPanelHeight, 100);
    }
  }

  function renderRoyaltyChart(el, curve){
    const target = resolveEl(el);
    if(!target) return;

    if(!curve || !Array.isArray(curve.months) || !Array.isArray(curve.values)){
      Plotly.purge(target);
      return;
    }

    const xDates = curve.months.map(m => new Date(m));
    const yVals = curve.values.map(v => Number(v) || 0);
    const textLabels = xDates.map(d => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${month}-${year}`;
    });

    const trace = {
      x: xDates,
      y: yVals,
      mode: 'markers',
      marker: {color: '#156082', size: 8, line: {color: '#0b3d57', width: 1}},
      hovertemplate: '%{text}<br>$%{y:,.0f}<extra></extra>',
      text: textLabels,
      name: 'Royalty Value'
    };

    const layout = {
      height: 400,
      title: {text: 'Value Loss Through Time', font: {size: 16, color: '#156082'}},
      margin: {l: 70, r: 10, t: 50, b: 60},
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: {
        type: 'date',
        tickformat: '%Y',
        dtick: 'M12',
        tick0: '2000-01-01',
        tickangle: 45,
        showgrid: false,
        tickfont: {size: 10, color: '#156082'},
        linecolor: '#156082',
        mirror: true,
        title: {text: 'Close Date', font: {size: 12, color: '#156082'}},
      },
      yaxis: {
        title: {text: 'Royalty Value ($)', font: {size: 10, color: '#156082'}},
        tickprefix: '$',
        tickfont: {size: 10, color: '#156082'},
        showgrid: false,
        linecolor: '#156082',
        mirror: true,
        automargin: true
      },
      showlegend: false,
      font: {color: '#156082'},
      hoverlabel: {bgcolor: '#156082', font: {color: '#ffffff'}},
    };

    Plotly.newPlot(target, [trace], layout, {displayModeBar: false, responsive: true});
  }

  if(document.readyState !== 'loading') loadPriceDeckOptions();
  else document.addEventListener('DOMContentLoaded', loadPriceDeckOptions);
})();
