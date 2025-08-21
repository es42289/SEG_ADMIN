(function () {
  function fmt(n) {
    return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—';
  }
  function maxDate(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    const dates = arr
      .map(v => (v ? new Date(v) : null))
      .filter(d => d && !isNaN(d));
    if (!dates.length) return null;
    return new Date(Math.max.apply(null, dates));
  }
  function yearRange(years) {
    if (!Array.isArray(years) || !years.length) return '—';
    const ys = years.filter(y => typeof y === 'number' && isFinite(y));
    if (!ys.length) return '—';
    return `${Math.min(...ys)}–${Math.max(...ys)}`;
  }
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // Accept the CURRENT (already filtered) general data and user data.
  function render(generalData, userData, extras) {
    const g = generalData || {};
    const u = userData || {};

    const total = Array.isArray(g.lat) ? g.lat.length : 0;
    const userTotal = Array.isArray(u.lat) ? u.lat.length : 0;

    // Prefer user last_producing if present, else fall back to general.
    const lastProd = maxDate(u.last_producing || g.last_producing);
    const lastProdStr = lastProd
      ? `${lastProd.getFullYear()}-${String(lastProd.getMonth() + 1).padStart(2, '0')}`
      : '—';

    setText('stat-total', fmt(total));
    setText('stat-user-total', fmt(userTotal));
    setText('stat-year-range', yearRange((g.years || g.year || [])));
    setText('stat-last-prod', lastProdStr);

    // Optional nearby counts (if caller provides them)
    if (extras && typeof extras.nearby10 === 'number') {
      setText('stat-nearby-10', fmt(extras.nearby10));
    }
    if (extras && typeof extras.nearby20 === 'number') {
      setText('stat-nearby-20', fmt(extras.nearby20));
    }
  }

  // Expose as a safe global (no modules).
  window.Stats = { render };
})();
