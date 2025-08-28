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
    const oil = rows.map(r=>r.OIL);
    const gas = rows.map(r=>r.GAS);
    const fig = [
      {x:dates,y:oil,mode:'lines',name:'Oil',line:{color:'green'}},
      {x:dates,y:gas,mode:'lines',name:'Gas',line:{color:'red'}}
    ];
    Plotly.newPlot('priceDeckChart',fig,{yaxis:{type:'log'},title:'Price Deck'}, {responsive:true});
  }

  async function loadEconomics(deck){
    const data = await fetchJSON('/econ-data/?deck='+encodeURIComponent(deck));
    renderNPV(data.npv);
    renderCum(data.cum);
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
    const fig = [{x:w.dates,y:w.ncf,type:'bar',marker:{color:'#A4CA98'}}];
    const layout = {title:'Net Cash Flow: 12 Months Backward & 24 Months Forward',xaxis:{tickangle:-45}};
    Plotly.newPlot('cashflowWindowChart',fig,layout,{responsive:true});
  }

  function renderSummary(s){
    const labels = s.map(v=>v.label);
    const vals = s.map(v=>v.value);
    Plotly.newPlot('cashflowSummaryChart',[{type:'bar',x:labels,y:vals,marker:{color:'#737F6F'}}],{title:'Cumulative Net Cash Flow Summary'},{responsive:true});
  }

  if(document.readyState !== 'loading') loadPriceDeckOptions();
  else document.addEventListener('DOMContentLoaded', loadPriceDeckOptions);
})();
