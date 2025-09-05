// Handles price deck selection and economics charts
(function(){
  async function fetchJSON(url){
    const r = await fetch(url);
    return r.json();
  }

  async function loadPriceDeckOptions(){
    const data = await fetchJSON('/price-decks/');
    const sel = document.getElementById('priceDeckSelect');
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
    Plotly.newPlot('priceDeckChart',fig,{yaxis:{type:'log'},title:'Price Deck'}, {responsive:true});
  }

  async function loadEconomics(deck){
    const data = await fetchJSON('/econ-data/?deck='+encodeURIComponent(deck));
    const hasNPV = document.getElementById('npvChart');
    const hasCum = document.getElementById('cumCashChart');
    if (hasNPV) renderNPV(data.npv);
    if (hasCum) renderCum(data.cum);
    renderWindow(data.window);
    renderSummary(data.summary);
  }

  function renderNPV(npv){
    const rates = npv.map(r=>r.rate);
    const vals = npv.map(r=>r.npv);
    Plotly.newPlot('npvChart',[{type:'bar',x:rates,y:vals,marker:{color:'#737F6F'}}],{title:'NPV'});
  }

  function renderCum(c){
    const fig = [
      {x:c.dates,y:c.cum_revenue,mode:'lines',name:'Cum Revenue',line:{color:'#1e8f4e'}},
      {x:c.dates,y:c.cum_ncf,mode:'lines',name:'Cum NCF',line:{color:'#d62728'}}
    ];
    Plotly.newPlot('cumCashChart',fig,{title:'Cumulative Cash and Revenue'}, {responsive:true});
  }

  function renderWindow(w){
    const dates = w.dates.map(d=>new Date(d));
    const yMax = Math.max(0, ...w.ncf);
    const today = new Date(w.today);
    const ltmCenter = new Date(today);
    ltmCenter.setMonth(ltmCenter.getMonth() - 6);
    const ntmCenter = new Date(today);
    ntmCenter.setMonth(ntmCenter.getMonth() + 12);

    const fig = [{x:dates,y:w.ncf,type:'bar',marker:{color:'#A4CA98'},name:'Net Cash Flow'}];
    const layout = {
      title:'Net Cash Flow: 12 Months Backward & 24 Months Forward',
      template:'plotly_white',
      height:600,
      xaxis:{
        tickangle:-45,
        tickformat:'%b %Y',
        dtick:'M1',
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
          text:'LTM',
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
    Plotly.newPlot('cashflowWindowChart',fig,layout,{responsive:true});
  }

  function renderSummary(s){
    const labels = s.map(v => v.label || v.CF_YR);
    const vals = s.map(v => v.value ?? v.CNCF);

    const ltmIdx = labels.indexOf('LTM');
    const ntmIdx = labels.indexOf('NTM');

    const ordered = [];
    if (ltmIdx !== -1) ordered.push({label: 'LTM', value: vals[ltmIdx]});
    if (ntmIdx !== -1) ordered.push({label: 'NTM', value: vals[ntmIdx]});
    const years = labels
      .map((label, i) => ({label, value: vals[i]}))
      .filter((_, i) => i !== ltmIdx && i !== ntmIdx)
      .sort((a, b) => parseInt(a.label) - parseInt(b.label));
    ordered.push(...years);

    const ordLabels = ordered.map(o => o.label);
    const ordVals = ordered.map(o => o.value);

    const colors = ordLabels.map(l => {
      if (l === 'LTM') return '#A4CA98';
      if (l === 'NTM') return '#F4D65A';
      return '#737F6F';
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

    const layout = {
      title: 'Cumulative Net Cash Flow Summary',
      yaxis: {title: 'CNCF ($)'},
      xaxis: {title: 'Period', type: 'category'},
      uniformtext: {minsize: 8, mode: 'hide'},
      template: 'plotly_white',
      height: 600
    };

    Plotly.newPlot('cashflowSummaryChart', [trace], layout, {responsive: true});
  }

  if(document.readyState !== 'loading') loadPriceDeckOptions();
  else document.addEventListener('DOMContentLoaded', loadPriceDeckOptions);
})();
