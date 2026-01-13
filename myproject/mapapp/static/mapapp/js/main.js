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
const BASE_PLOT_CONFIG = {
  responsive: true,
  scrollZoom: false,
  displaylogo: false,
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'zoom2d'],
};
const mapStyles = {
  userWellsMap: MAPBOX_STYLE_TERRAIN,
  map: MAPBOX_STYLE_TERRAIN
};

const getMapStyle = (mapId) => mapStyles[mapId] || MAPBOX_STYLE_TERRAIN;
const setMapStyle = (mapId, style) => {
  mapStyles[mapId] = style;
};

const initCollapsibleCard = () => {
  const toggle = document.getElementById('map-analysis-toggle');
  const content = document.getElementById('map-analysis-content');
  if (!toggle || !content) return;

  const setExpanded = (expanded) => {
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.textContent = expanded ? 'Collapse' : 'Expand';
    if (expanded) {
      content.removeAttribute('hidden');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    } else {
      content.setAttribute('hidden', 'hidden');
    }
  };

  const mobilePortraitQuery = window.matchMedia('(orientation: portrait) and (max-width: 768px)');
  const mobileLandscapeQuery = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
  const shouldHideForMobile = mobilePortraitQuery.matches || mobileLandscapeQuery.matches;

  // Default to expanded unless hidden on constrained mobile layouts.
  setExpanded(!shouldHideForMobile);

  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(!isExpanded);
  });
};

const initCollapsibleCardWhenReady = () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollapsibleCard, { once: true });
  } else {
    initCollapsibleCard();
  }
};

initCollapsibleCardWhenReady();
const rootElement = document.documentElement;
window.syncRoyaltyPanelHeight = () => {
  const cumChart = document.getElementById('cashflowSummaryChart');
  const royaltyCard = document.querySelector('.econ-card--match-cashflow');
  const royaltyChart = document.getElementById('royaltyValueChart');
      if (!cumChart || !royaltyCard || !royaltyChart) return;

      const cumCard = cumChart.closest('.econ-card');
      if (!cumCard) return;

      const cumRect = cumCard.getBoundingClientRect();
      if (!cumRect.height) return;

      royaltyCard.style.height = `${cumRect.height}px`;

      const cardStyle = getComputedStyle(royaltyCard);
      const paddingY = parseFloat(cardStyle.paddingTop || '0') + parseFloat(cardStyle.paddingBottom || '0');
      const titleEl = royaltyCard.querySelector('.econ-card-title');
      const titleHeight = titleEl?.getBoundingClientRect().height || 0;
      const rawAvailable = Math.max(240, cumRect.height - paddingY - titleHeight - 8);
      const adjustedHeight = Math.max(216, Math.round(rawAvailable * 0.98));
      royaltyChart.style.height = `${adjustedHeight}px`;
      if (window.Plotly && royaltyChart.data) {
        Plotly.relayout(royaltyChart, { height: adjustedHeight });
        Plotly.Plots.resize(royaltyChart);
      }
    };
    const getResponsivePlotHeight = (el, options = {}) => {
      const { min = 320, max = 520, ratio = 0.65, matchHeightEl } = options;
      const docEl = document.documentElement;
      const docWidth = docEl && docEl.clientWidth ? docEl.clientWidth : Number.POSITIVE_INFINITY;
      const viewportWidth = Math.min(
        Number.isFinite(window.innerWidth) ? window.innerWidth : Number.POSITIVE_INFINITY,
        docWidth
      );
      const isNarrow = Number.isFinite(viewportWidth) && viewportWidth < 900;
      const minHeight = isNarrow ? 260 : min;
      const resolvedMax = max === null ? Number.POSITIVE_INFINITY : max;
      const maxHeight = isNarrow
        ? (max === null ? Number.POSITIVE_INFINITY : Math.min(resolvedMax, 480))
        : resolvedMax;
      const targetRatio = isNarrow ? Math.max(ratio, 0.72) : ratio;
      const clampHeight = (value) => Math.max(minHeight, Math.min(maxHeight, value));
      const getMatchHeight = () => {
        if (!matchHeightEl) return null;
        const rect = matchHeightEl.getBoundingClientRect?.();
        if (rect && rect.height > 0) {
          return Math.round(rect.height);
        }
        return null;
      };

      const matched = getMatchHeight();
      if (matched) {
        return clampHeight(matched);
      }

      if (!el) return minHeight;
      const width = el.getBoundingClientRect ? el.getBoundingClientRect().width : el.clientWidth || 0;
      if (!width) return minHeight;
      const target = Math.round(width * targetRatio);
      return clampHeight(target);
    };
    const syncChartAndMapContainers = () => {
      const prodChartSection = document.getElementById('prod-chart');
      const mapSection = document.getElementById('user-wells-map');
      if (!mapSection || !prodChartSection) return;

      const prodRect = prodChartSection.getBoundingClientRect();
      if (prodRect && prodRect.height > 0) {
        mapSection.style.height = `${prodRect.height}px`;
      }
    };
    const primeChartMapHeightSync = () => {
      syncChartAndMapContainers();
      requestAnimationFrame(syncChartAndMapContainers);
      setTimeout(syncChartAndMapContainers, 250);
    };
    document.addEventListener('DOMContentLoaded', primeChartMapHeightSync, {
      once: true
    });
    const updateLayoutOffsets = () => {
      const banner = document.querySelector('.top-banner');
      const header = document.querySelector('body > .min-h-screen > header');
      const footer = document.querySelector('body > .min-h-screen > footer');
      if (!rootElement) return;
      const bannerHeight = banner?.offsetHeight || 0;
      // Nudge the layout upward so the dashboard content sits closer to the fixed banner.
      const adjustedHeight = Math.max(0, bannerHeight - 60);
      rootElement.style.setProperty('--top-banner-height', `${adjustedHeight}px`);
      const headerHeight = header?.offsetHeight || 0;
      const footerHeight = footer?.offsetHeight || 0;
      rootElement.style.setProperty('--site-header-height', `${headerHeight}px`);
      rootElement.style.setProperty('--site-footer-height', `${footerHeight}px`);
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

    const updateWellSummaryStats = (data) => {
      if (!data) {
        setStatValue(userWellsCount, '0');
        setStatValue(avgWellAge, '0');
        return;
      }

      const totalWells = Array.isArray(data.lat) ? data.lat.length : 0;
      setStatValue(userWellsCount, totalWells.toLocaleString());

      if (avgWellAge && data.year && data.last_producing) {
        const currentYear = new Date().getUTCFullYear();
        const ages = [];
        for (let i = 0; i < data.year.length; i++) {
          const compYear = parseInt(data.year[i], 10);
          if (Number.isNaN(compYear)) continue;
          const last = data.last_producing[i];
          let endYear = last ? new Date(last).getUTCFullYear() : currentYear;
          if (Number.isNaN(endYear)) endYear = currentYear;
          ages.push(endYear - compYear + 1);
        }
        const avg = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
        setStatValue(avgWellAge, avg.toFixed(1));
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

    const OWNER_PROFILE_FIELDS = [
      'owner_type',
      'first_name',
      'last_name',
      'display_name',
      'phone_number',
      'address_line_1',
      'address_line_2',
      'city',
      'state',
      'postal_code',
      'country',
      'contact_first_name',
      'contact_last_name',
      'contact_title'
    ];

    const OWNER_TYPE_MAP = {
      INDIVIDUAL: 'Individual',
      ENTITY: 'Entity',
      TRUST: 'Trust',
      CORPORATION: 'Corporation'
    };

    const OWNER_PROFILE_FIELD_LABELS = {
      owner_type: 'Owner type',
      first_name: 'First name',
      last_name: 'Last name',
      display_name: 'Display name',
      phone_number: 'Phone number',
      address_line_1: 'Address line 1',
      address_line_2: 'Address line 2',
      city: 'City',
      state: 'State / Province',
      postal_code: 'Postal code',
      country: 'Country',
      contact_first_name: 'Main contact first name',
      contact_last_name: 'Main contact last name',
      contact_title: 'Contact title',
      email: 'Email'
    };

    const ownerProfileButton = document.getElementById('ownerProfileButton');
    const chatScrollButton = document.getElementById('chatScrollButton');
    const executiveDashButton = document.getElementById('executiveDashButton');
    const ownerProfileModal = document.getElementById('ownerProfileModal');
    const executiveDashModal = document.getElementById('executiveDashModal');
    const ownerProfileForm = document.getElementById('ownerProfileForm');
    const ownerProfileMessage = document.getElementById('ownerProfileMessage');

    const ownerProfileState = {
      original: null,
      data: null,
      isOpen: false,
      saving: false,
      loading: false,
      fetchPromise: null,
      autoOpenChecked: false,
      userEmail:
        (ownerProfileForm && ownerProfileForm.dataset.userEmail) ||
        (ownerProfileForm && ownerProfileForm.elements && ownerProfileForm.elements.email
          ? ownerProfileForm.elements.email.value
          : '')
    };

    const executiveDashState = {
      isOpen: false
    };

    const scrollToFeedbackSection = () => {
      const feedbackSection = document.getElementById('feedback-section');
      if (!feedbackSection) return;
      const scrollContainer = feedbackSection.closest('.main-content');
      if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetTop =
          feedbackSection.getBoundingClientRect().top -
          containerRect.top +
          scrollContainer.scrollTop -
          12;
        scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
        feedbackSection.focus?.({ preventScroll: true });
        return;
      }
      const header = document.querySelector('header');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const offset = headerHeight + 12;
      const targetTop = feedbackSection.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
      feedbackSection.focus?.({ preventScroll: true });
    };

    function canonicalizeOwnerType(value) {
      if (!value && value !== '') return 'Individual';
      const cleaned = String(value || '').trim();
      if (!cleaned) return 'Individual';
      const key = cleaned.toUpperCase();
      return OWNER_TYPE_MAP[key] || (() => { throw new Error('Invalid owner type'); })();
    }

    function createOwnerProfileDefaults(email) {
      const defaults = { email: email || '', owner_type: 'Individual' };
      for (const field of OWNER_PROFILE_FIELDS) {
        if (!(field in defaults)) {
          defaults[field] = null;
        }
      }
      return defaults;
    }

    function normalizeOwnerProfile(rawProfile) {
      const normalized = createOwnerProfileDefaults(ownerProfileState.userEmail);
      if (!rawProfile || typeof rawProfile !== 'object') {
        return normalized;
      }

      const working = { ...rawProfile };
      if (Object.prototype.hasOwnProperty.call(working, 'email')) {
        normalized.email = String(working.email || '').trim();
      }

      for (const field of OWNER_PROFILE_FIELDS) {
        const value = working[field];
        if (value === undefined) {
          continue;
        }

        if (value === null) {
          normalized[field] = null;
          continue;
        }

        if (typeof value === 'string') {
          const trimmed = value.trim();
          normalized[field] = trimmed ? trimmed : null;
          continue;
        }

        normalized[field] = value;
      }

      try {
        normalized.owner_type = canonicalizeOwnerType(working.owner_type ?? normalized.owner_type);
      } catch (err) {
        console.warn('Owner profile owner_type normalization failed:', err);
        normalized.owner_type = 'Individual';
      }

      return normalized;
    }

    function ownerProfilesEqual(a, b) {
      if (!a || !b) return false;
      for (const field of OWNER_PROFILE_FIELDS) {
        const left = a[field] ?? null;
        const right = b[field] ?? null;
        if (left !== right) {
          return false;
        }
      }
      return true;
    }

    function requiredOwnerProfileFields(profile) {
      const normalized = normalizeOwnerProfile(profile);
      const canonicalType = canonicalizeOwnerType(normalized.owner_type);
      if (canonicalType === 'Individual') {
        return ['email', 'first_name', 'last_name'];
      }

      return ['email', 'contact_first_name', 'contact_last_name'];
    }

    function missingRequiredOwnerProfileFields(profile) {
      const normalized = normalizeOwnerProfile(profile);
      return requiredOwnerProfileFields(normalized).filter((field) => {
        const value = normalized[field];
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        return false;
      });
    }

    function describeMissingOwnerProfileFields(profile) {
      const missing = missingRequiredOwnerProfileFields(profile);
      if (!missing.length) {
        return '';
      }

      const labels = missing
        .map((field) => OWNER_PROFILE_FIELD_LABELS[field] || field)
        .filter(Boolean);

      if (!labels.length) {
        return 'Please complete the required fields before closing.';
      }

      if (labels.length === 1) {
        return `${labels[0]} is required before closing.`;
      }

      const last = labels.pop();
      return `${labels.join(', ')} and ${last} are required before closing.`;
    }

    function setOwnerProfileMessage(message, intent) {
      if (!ownerProfileMessage) return;
      ownerProfileMessage.textContent = message || '';
      ownerProfileMessage.className = 'profile-modal__message';
      if (intent) {
        ownerProfileMessage.classList.add(`profile-modal__message--${intent}`);
      }
    }

    function toggleOwnerProfileSections(ownerType) {
      const canonicalType = (() => {
        try {
          return canonicalizeOwnerType(ownerType);
        } catch {
          return 'Individual';
        }
      })();

      if (!ownerProfileForm) return;

      const individualGrid = ownerProfileForm.querySelector('.profile-form-grid--individual');
      const entityGrid = ownerProfileForm.querySelector('.profile-form-grid--entity');

      if (individualGrid) {
        if (canonicalType === 'Individual') {
          individualGrid.classList.remove('is-hidden');
        } else {
          individualGrid.classList.add('is-hidden');
        }
      }

      if (entityGrid) {
        if (canonicalType === 'Individual') {
          entityGrid.classList.add('is-hidden');
        } else {
          entityGrid.classList.remove('is-hidden');
        }
      }
    }

    function populateOwnerProfileForm(profile) {
      if (!ownerProfileForm) return;
      const normalized = normalizeOwnerProfile(profile);

      for (const field of OWNER_PROFILE_FIELDS) {
        const input = ownerProfileForm.elements[field];
        if (!input) continue;
        const value = normalized[field];
        input.value = value === null || value === undefined ? '' : value;
      }

      if (ownerProfileForm.elements.email) {
        ownerProfileForm.elements.email.value = normalized.email || ownerProfileState.userEmail || '';
      }

      toggleOwnerProfileSections(normalized.owner_type);
    }

    function readOwnerProfileForm() {
      if (!ownerProfileForm) return createOwnerProfileDefaults(ownerProfileState.userEmail);
      const formData = new FormData(ownerProfileForm);
      const raw = { email: ownerProfileState.userEmail || '' };
      for (const field of OWNER_PROFILE_FIELDS) {
        raw[field] = formData.get(field);
      }
      if (formData.has('email')) {
        raw.email = formData.get('email');
      }
      return normalizeOwnerProfile(raw);
    }

    function disableOwnerProfileForm(disabled) {
      if (!ownerProfileForm) return;
      ownerProfileForm.classList.toggle('is-disabled', Boolean(disabled));
    }

    async function fetchOwnerProfileData() {
      if (ownerProfileState.fetchPromise) {
        return ownerProfileState.fetchPromise;
      }
      if (!ownerProfileForm) {
        ownerProfileState.fetchPromise = Promise.resolve(createOwnerProfileDefaults(ownerProfileState.userEmail));
        return ownerProfileState.fetchPromise;
      }

      ownerProfileState.loading = true;
      disableOwnerProfileForm(true);
      setOwnerProfileMessage('Loading owner profile…', 'warning');

      ownerProfileState.fetchPromise = (async () => {
        try {
          const resp = await fetch('/api/user-info/', { headers: { Accept: 'application/json' } });
          if (!resp.ok) {
            throw new Error(`Failed to load owner profile (${resp.status})`);
          }
          const payload = await resp.json();
          const profile = normalizeOwnerProfile(payload.profile || payload);
          ownerProfileState.original = profile;
          ownerProfileState.data = profile;
          populateOwnerProfileForm(profile);
          setOwnerProfileMessage('Profile loaded.', 'success');
          if (!ownerProfileState.autoOpenChecked) {
            ownerProfileState.autoOpenChecked = true;
          }
          return profile;
        } catch (error) {
          console.error('Unable to fetch owner profile:', error);
          const fallback = createOwnerProfileDefaults(ownerProfileState.userEmail);
          ownerProfileState.original = fallback;
          ownerProfileState.data = fallback;
          populateOwnerProfileForm(fallback);
          setOwnerProfileMessage('Unable to load owner profile. You can still make updates.', 'error');
          return fallback;
        } finally {
          ownerProfileState.loading = false;
          disableOwnerProfileForm(false);
        }
      })();

      return ownerProfileState.fetchPromise;
    }

    async function saveOwnerProfile(profile) {
      const normalized = normalizeOwnerProfile(profile);
      const payload = { ...normalized };
      delete payload.email;

      try {
        ownerProfileState.saving = true;
        disableOwnerProfileForm(true);
        setOwnerProfileMessage('Saving changes…', 'saving');

        const resp = await fetch('/api/user-info/', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
          },
          body: JSON.stringify(payload)
        });

        const text = await resp.text();
        if (!resp.ok) {
          throw new Error(text || `Failed to save owner profile (${resp.status})`);
        }

        let responseData = {};
        try {
          responseData = JSON.parse(text);
        } catch (err) {
          console.warn('Unable to parse owner profile save response:', err);
        }

        const savedProfile = normalizeOwnerProfile(responseData.profile || responseData || normalized);
        ownerProfileState.original = savedProfile;
        ownerProfileState.data = savedProfile;
        populateOwnerProfileForm(savedProfile);
        setOwnerProfileMessage('Profile saved successfully.', 'success');
        return true;
      } catch (error) {
        console.error('Unable to save owner profile:', error);
        setOwnerProfileMessage('We could not save your updates. Please try again.', 'error');
        return false;
      } finally {
        ownerProfileState.saving = false;
        disableOwnerProfileForm(false);
      }
    }

    function showOwnerProfileModal() {
      if (!ownerProfileModal || !ownerProfileButton) return;
      ownerProfileModal.classList.add('is-visible');
      ownerProfileModal.setAttribute('aria-hidden', 'false');
      ownerProfileState.isOpen = true;
      setOwnerProfileMessage('', null);
      if (ownerProfileForm && ownerProfileForm.elements.owner_type) {
        ownerProfileForm.elements.owner_type.focus();
      }
    }

    function hideOwnerProfileModal(options = {}) {
      if (!ownerProfileModal) return;
      const preserveMessage = Boolean(options && options.preserveMessage);
      ownerProfileModal.classList.remove('is-visible');
      ownerProfileModal.setAttribute('aria-hidden', 'true');
      ownerProfileState.isOpen = false;
      if (!preserveMessage) {
        setTimeout(() => setOwnerProfileMessage('', null), 200);
      }
      if (ownerProfileButton) {
        ownerProfileButton.focus({ preventScroll: true });
      }
    }

    function showExecutiveDashModal() {
      if (!executiveDashModal || !executiveDashButton) return;
      executiveDashModal.classList.add('is-visible');
      executiveDashModal.setAttribute('aria-hidden', 'false');
      executiveDashState.isOpen = true;
      const closeButton = executiveDashModal.querySelector('[data-executive-close]');
      closeButton?.focus?.();
    }

    function hideExecutiveDashModal() {
      if (!executiveDashModal) return;
      executiveDashModal.classList.remove('is-visible');
      executiveDashModal.setAttribute('aria-hidden', 'true');
      executiveDashState.isOpen = false;
      if (executiveDashButton) {
        executiveDashButton.focus({ preventScroll: true });
      }
    }

    async function attemptCloseOwnerProfileModal() {
      if (!ownerProfileForm) {
        hideOwnerProfileModal();
        return;
      }
      if (ownerProfileState.saving) {
        return;
      }

      const current = readOwnerProfileForm();
      ownerProfileState.data = current;

      if (!ownerProfileState.original) {
        ownerProfileState.original = createOwnerProfileDefaults(ownerProfileState.userEmail);
      }

      const hasChanges = !ownerProfilesEqual(current, ownerProfileState.original);
      if (!hasChanges) {
        hideOwnerProfileModal();
        return;
      }

      if (!current.owner_type) {
        setOwnerProfileMessage('Owner type is required.', 'error');
        return;
      }

      const saved = await saveOwnerProfile(current);
      if (saved) {
        hideOwnerProfileModal();
        return;
      }

      const discard = window.confirm(
        'We were unable to save your updates. Close without saving them?'
      );

      if (!discard) {
        setOwnerProfileMessage(
          'Your changes have not been saved. Please review and try again.',
          'error'
        );
        return;
      }

      const fallback =
        ownerProfileState.original ||
        createOwnerProfileDefaults(ownerProfileState.userEmail);

      ownerProfileState.data = fallback;
      populateOwnerProfileForm(fallback);
      setOwnerProfileMessage(
        'Your recent changes were not saved due to a connection error.',
        'error'
      );
      hideOwnerProfileModal({ preserveMessage: true });
    }

    function handleOwnerProfileFieldChange(event) {
      if (!ownerProfileForm) return;
      if (event && event.target && event.target.name === 'owner_type') {
        toggleOwnerProfileSections(event.target.value);
      }

      const current = readOwnerProfileForm();
      const changed = ownerProfileState.original
        ? !ownerProfilesEqual(current, ownerProfileState.original)
        : true;
      if (!changed) {
        setOwnerProfileMessage('', null);
      }
    }

    if (chatScrollButton) {
      chatScrollButton.addEventListener('click', (event) => {
        event.preventDefault();
        scrollToFeedbackSection();
      });
    }

    if (ownerProfileModal && ownerProfileForm && ownerProfileButton) {
      ownerProfileForm.addEventListener('submit', (event) => event.preventDefault());
      ownerProfileForm.addEventListener('change', handleOwnerProfileFieldChange, true);
      ownerProfileForm.addEventListener('input', handleOwnerProfileFieldChange, true);

      ownerProfileModal
        .querySelectorAll('[data-profile-close]')
        .forEach((el) => el.addEventListener('click', (event) => {
          event.preventDefault();
          attemptCloseOwnerProfileModal();
        }));

      ownerProfileButton.addEventListener('click', async (event) => {
        event.preventDefault();
        await fetchOwnerProfileData();
        showOwnerProfileModal();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && ownerProfileState.isOpen) {
          event.preventDefault();
          attemptCloseOwnerProfileModal();
        }
      });

      fetchOwnerProfileData();
    }

    if (executiveDashModal && executiveDashButton) {
      executiveDashModal
        .querySelectorAll('[data-executive-close]')
        .forEach((el) => el.addEventListener('click', (event) => {
          event.preventDefault();
          hideExecutiveDashModal();
        }));

      executiveDashModal.addEventListener('click', (event) => {
        const target = event.target.closest('[data-executive-select-email]');
        if (!target) return;
        const email = target.dataset.executiveSelectEmail;
        if (!email) return;
        const adminForm = document.querySelector('.admin-banner__form');
        const select = adminForm?.querySelector('select[name="selected_email"]');
        if (!select) return;
        select.value = email;
        hideExecutiveDashModal();
        adminForm.submit();
      });

      executiveDashButton.addEventListener('click', (event) => {
        event.preventDefault();
        showExecutiveDashModal();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && executiveDashState.isOpen) {
          event.preventDefault();
          hideExecutiveDashModal();
        }
      });
    }

    // Global variables to store all data
    let allWellData = null;
    let userWellData = null;
    const selectedWellApis = new Set();
    let selectionInitialized = false;
    const WELL_SELECTION_TOGGLE_ID = 'wellSelectionToggle';

    function pruneSelectedApis(validApis) {
      const validSet = new Set((validApis || []).filter(Boolean));
      for (const api of Array.from(selectedWellApis)) {
        if (!validSet.has(api)) {
          selectedWellApis.delete(api);
        }
      }
    }

    function ensureDefaultSelections(validApis) {
      if (selectionInitialized) return;
      (validApis || []).forEach(api => {
        if (api) selectedWellApis.add(api);
      });
      selectionInitialized = true;
    }

    const getSelectedWellData = () => {
      if (!userWellData) return null;
      return applySelectionToWellData(userWellData);
    };

    let latestFilteredGeneralData = null;
    let latestFilteredUserData = null;
    let latestStatsExtras = null;

    const rerenderStatsWithSelection = () => {
      if (!window.Stats || !latestFilteredGeneralData || !latestFilteredUserData) return;
      const selectedUserData = applySelectionToWellData(latestFilteredUserData);
      window.Stats.render(latestFilteredGeneralData, selectedUserData, latestStatsExtras);
    };

    const notifySelectionChange = () => {
      updateWellSummaryStats(getSelectedWellData());
      if (window.productionByApi) {
        const selectedProd = {};
        for (const api of Array.from(selectedWellApis)) {
          if (window.productionByApi[api]) {
            selectedProd[api] = window.productionByApi[api];
          }
        }
        updateLastProductionMetrics(selectedProd);
      } else {
        updateLastProductionMetrics(null);
      }

      rerenderStatsWithSelection();

      if (typeof window.reloadEconomicsWithSelection === 'function') {
        window.reloadEconomicsWithSelection();
      }
      if (typeof window.reloadProductionChartWithSelection === 'function') {
        window.reloadProductionChartWithSelection();
      }
      if (typeof window.reloadUserWellsMapWithSelection === 'function') {
        window.reloadUserWellsMapWithSelection();
      }
    };

    const getWellSelectionInputs = () => {
      const table = document.getElementById('userWellsTable');
      if (!table) return [];
      return Array.from(table.querySelectorAll('.well-select-input'));
    };

    const updateSelectionToggleButton = () => {
      const toggle = document.getElementById(WELL_SELECTION_TOGGLE_ID);
      if (!toggle) return;

      const selectableInputs = getWellSelectionInputs().filter((input) => !input.disabled);
      const total = selectableInputs.length;
      const selected = selectableInputs.filter((input) => input.checked).length;
      const allSelected = total > 0 && selected === total;

      toggle.disabled = total === 0;
      toggle.textContent = allSelected ? 'Deselect All' : 'Select All';
      toggle.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
    };

    const applyBulkWellSelection = (shouldSelect) => {
      const inputs = getWellSelectionInputs().filter((input) => !input.disabled);
      if (!inputs.length) {
        updateSelectionToggleButton();
        return false;
      }

      let changed = false;

      inputs.forEach((input) => {
        const api = input.dataset.api;
        if (!api) return;

        if (input.checked !== shouldSelect) {
          input.checked = shouldSelect;
          changed = true;
        }

        if (shouldSelect) {
          selectedWellApis.add(api);
        } else {
          selectedWellApis.delete(api);
        }
      });

      selectionInitialized = true;
      updateSelectionToggleButton();
      return changed;
    };

    window.getSelectedWellApis = function getSelectedWellApis() {
      return Array.from(selectedWellApis);
    };

    window.hasUserWellSelection = function hasUserWellSelection() {
      return selectionInitialized;
    };

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
      const resetProductionStats = () => {
        setStatValue(lastOil, '0');
        setStatValue(lastGas, '0');
        setStatValue(lastYearOil, '0');
        setStatValue(lastYearGas, '0');
        setStatValue(nextYearOil, '0');
        setStatValue(nextYearGas, '0');
        setStatValue(lastProductionDate, null, '--');
      };

      if (!lastOil || !lastGas || !lastYearOil || !lastYearGas || !nextYearOil || !nextYearGas) {
        resetProductionStats();
        return;
      }
      const rows = Object.values(prodMap || {}).flat();
      if (!rows.length) {
        resetProductionStats();
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

      const baseHeight = layout.height ?? 400;

      if (window.innerWidth <= 640) {
        layout.height = Math.max(Math.floor(baseHeight * 0.5), 120);
      }

      layout.dragmode = 'pan';

      Plotly.newPlot(chartElement || chartId, data, layout, { ...BASE_PLOT_CONFIG });

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
          updateWellSummaryStats(null);
          return { lat: [], lon: [], text: [], year: [], lat_bh: [], lon_bh: [], owner_interest: [], owner_name: [], api_uwi: [], last_producing: [], completion_date: [] };
        }

        console.log(`Received ${data.lat.length} user wells`);
        updateWellSummaryStats(data);

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

      const validApis = (data.api_uwi || []).filter(Boolean);
      pruneSelectedApis(validApis);
      ensureDefaultSelections(validApis);

      if (!data || !data.api_uwi || data.api_uwi.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 17;
        cell.textContent = 'No wells found';
        row.appendChild(cell);
        tbody.appendChild(row);
        updateSelectionToggleButton();
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

        const editCell = document.createElement('td');
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.classList.add('well-edit-button');
        editButton.textContent = 'Edit';
        editButton.dataset.api = apiValue;
        editButton.disabled = !apiValue;
        editCell.appendChild(editButton);
        row.appendChild(editCell);

        const selectionCell = document.createElement('td');
        selectionCell.classList.add('well-select-cell');
        const selectionInput = document.createElement('input');
        selectionInput.type = 'checkbox';
        selectionInput.classList.add('well-select-input');
        selectionInput.dataset.api = apiValue;
        const isSelected = !selectionInitialized || selectedWellApis.has(apiValue);
        selectionInput.checked = !!apiValue && isSelected;
        selectionInput.disabled = !apiValue;
        if (selectionInput.checked && apiValue) {
          selectedWellApis.add(apiValue);
        }
        selectionCell.appendChild(selectionInput);
        row.appendChild(selectionCell);

        const rowValues = [
          { key: 'api_uwi', value: apiValue },
          { key: 'owner_interest', value: data.owner_interest && data.owner_interest[i] != null ? formatInterest(data.owner_interest[i]) : '' },
          { key: ROYALTY_RATE_KEY, value: data[ROYALTY_RATE_KEY] && data[ROYALTY_RATE_KEY][i] != null ? formatCurrencyNoCents(data[ROYALTY_RATE_KEY][i]) : '' },
          { key: 'name', value: data.name && data.name[i] ? data.name[i] : '' },
          { key: 'operator', value: data.operator && data.operator[i] ? data.operator[i] : '' },
          { key: 'trajectory', value: data.trajectory && data.trajectory[i] ? data.trajectory[i] : '' },
          { key: 'permit_date', value: data.permit_date && data.permit_date[i] ? data.permit_date[i] : '' },
          { key: 'first_prod_date', value: data.first_prod_date && data.first_prod_date[i] ? data.first_prod_date[i] : '' },
          { key: 'last_prod_date', value: data.last_prod_date && data.last_prod_date[i] ? data.last_prod_date[i] : '' },
          { key: 'gross_oil_eur', value: data.gross_oil_eur && data.gross_oil_eur[i] != null ? formatVolume(data.gross_oil_eur[i]) : '' },
          { key: 'gross_gas_eur', value: data.gross_gas_eur && data.gross_gas_eur[i] != null ? formatVolume(data.gross_gas_eur[i]) : '' },
          { key: 'net_oil_eur', value: data.net_oil_eur && data.net_oil_eur[i] != null ? formatVolume(data.net_oil_eur[i]) : '' },
          { key: 'net_gas_eur', value: data.net_gas_eur && data.net_gas_eur[i] != null ? formatVolume(data.net_gas_eur[i]) : '' },
          { key: 'remaining_net_oil', value: data.remaining_net_oil && data.remaining_net_oil[i] != null ? formatVolume(data.remaining_net_oil[i]) : '' },
          { key: 'remaining_net_gas', value: data.remaining_net_gas && data.remaining_net_gas[i] != null ? formatVolume(data.remaining_net_gas[i]) : '' },
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
          if (key === ROYALTY_RATE_KEY) {
            td.classList.add('est-nri-value');
            if (pvCellStore) {
              pvCellStore[key] = td;
            }
          }
        });
        tbody.appendChild(row);
      }

      if (window.latestPerWellPvMap) {
        applyPerWellPvMap(window.latestPerWellPvMap);
      }

      updateSelectionToggleButton();

      if (!table._selectionListenerAttached) {
        table.addEventListener('change', (event) => {
          const target = event.target;
          if (!target || !target.classList || !target.classList.contains('well-select-input')) {
            return;
          }
          const api = target.dataset.api;
          if (!api) return;
          if (target.checked) {
            selectedWellApis.add(api);
          } else {
            selectedWellApis.delete(api);
          }
          updateSelectionToggleButton();
          notifySelectionChange();
        });
        table._selectionListenerAttached = true;
      }

      if (!table._bulkSelectionListenerAttached) {
        const toggle = document.getElementById(WELL_SELECTION_TOGGLE_ID);
        if (toggle) {
          toggle.addEventListener('click', () => {
            const selectableInputs = getWellSelectionInputs().filter((input) => !input.disabled);
            const total = selectableInputs.length;
            const selectedCount = selectableInputs.filter((input) => input.checked).length;
            const shouldSelectAll = total === 0 ? false : selectedCount !== total;
            const changed = applyBulkWellSelection(shouldSelectAll);
            if (changed) {
              notifySelectionChange();
            }
          });
        }
        table._bulkSelectionListenerAttached = true;
      }
    }

    const WELL_EDIT_MODAL_ID = 'well-edit-modal';
    const WELL_EDIT_CHART_ID = 'well-edit-chart';
    const WELL_EDIT_CONTROLS_ID = 'well-edit-controls';
    const WELL_EDIT_EUR_ID = 'well-edit-eur';
    const WELL_EDIT_STATUS_ID = 'well-edit-status';
    const WELL_EDIT_NRI_VALUE_ID = 'well-edit-nri-value';
    const WELL_EDIT_TITLE_ID = 'well-edit-title';
    const WELL_EDIT_SUBTITLE_ID = 'well-edit-subtitle';

    const WELL_EDIT_PARAMS = [
      { key: 'OIL_CALC_QI', label: 'Oil Qi (BBL/mo)', min: 0, max: 50000, step: 10, section: 'Oil' },
      { key: 'OIL_Q_MIN', label: 'Oil Qmin (BBL/mo)', min: 0, max: 5000, step: 10, section: 'Oil' },
      { key: 'OIL_EMPIRICAL_DI', label: 'Oil Di (annual)', min: 0, max: 2, step: 0.01, section: 'Oil' },
      { key: 'OIL_CALC_B_FACTOR', label: 'Oil b-factor', min: 0, max: 2, step: 0.01, section: 'Oil' },
      { key: 'OIL_D_MIN', label: 'Oil Dmin (annual)', min: 0, max: 1, step: 0.01, section: 'Oil' },
      { key: 'GAS_CALC_QI', label: 'Gas Qi (MCF/mo)', min: 0, max: 200000, step: 10, section: 'Gas' },
      { key: 'GAS_Q_MIN', label: 'Gas Qmin (MCF/mo)', min: 0, max: 10000, step: 10, section: 'Gas' },
      { key: 'GAS_EMPIRICAL_DI', label: 'Gas Di (annual)', min: 0, max: 2, step: 0.01, section: 'Gas' },
      { key: 'GAS_CALC_B_FACTOR', label: 'Gas b-factor', min: 0, max: 2, step: 0.01, section: 'Gas' },
      { key: 'GAS_D_MIN', label: 'Gas Dmin (annual)', min: 0, max: 1, step: 0.01, section: 'Gas' },
      { key: 'GAS_FCST_YRS', label: 'Gas forecast years', min: 1, max: 50, step: 1, section: 'Gas' },
    ];

    const WELL_EDIT_STATE = {
      api: null,
      production: [],
      params: {},
      ownerInterest: null,
      lastProdDate: null,
      firstProdDate: null,
      priceAverages: null,
    };

    const getWellEditModal = () => document.getElementById(WELL_EDIT_MODAL_ID);

    const parseDateValue = (value) => {
      if (!value) return null;
      const dt = new Date(value);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };

    const monthKey = (dateObj) => {
      if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
      return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-01`;
    };

    const monthIndex = (dateObj) => {
      if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
      return dateObj.getUTCFullYear() * 12 + dateObj.getUTCMonth();
    };

    const monthIndexToDate = (index) => {
      if (!Number.isFinite(index)) return null;
      const year = Math.floor(index / 12);
      const month = index % 12;
      return new Date(Date.UTC(year, month, 1));
    };

    const formatDateLabel = (dateObj) => {
      if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '--';
      return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-01`;
    };

    const toNumber = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    const formatNumber = (value) => {
      if (!Number.isFinite(value)) return '--';
      return Math.round(value).toLocaleString('en-US');
    };

    const formatCurrency = (value) => {
      if (!Number.isFinite(value)) return '--';
      return '$' + Math.round(value).toLocaleString('en-US');
    };

    const getOwnerInterestForApi = (api) => {
      if (!userWellData || !Array.isArray(userWellData.api_uwi)) return null;
      const idx = userWellData.api_uwi.findIndex((entry) => entry === api);
      if (idx === -1) return null;
      const val = userWellData.owner_interest ? userWellData.owner_interest[idx] : null;
      const num = Number(val);
      return Number.isFinite(num) ? num : null;
    };

    const ensurePriceAverages = async () => {
      if (WELL_EDIT_STATE.priceAverages) return WELL_EDIT_STATE.priceAverages;
      try {
        const resp = await fetch('/price-decks/');
        if (!resp.ok) return null;
        const payload = await resp.json();
        const avg = payload && payload.trailing_averages ? payload.trailing_averages['10_year'] : null;
        if (avg && Number.isFinite(avg.oil) && Number.isFinite(avg.gas)) {
          WELL_EDIT_STATE.priceAverages = avg;
          return avg;
        }
      } catch (error) {
        console.warn('Failed to load price deck averages', error);
      }
      return null;
    };

    const calculateDeclineRates = (qi, qf, declineType, bFactor, initialDecline, terminalDecline, maxMonths = 600) => {
      const rates = [];
      let currentRate = qi;

      if (declineType === 'EXP') {
        const monthlyDecline = 1 - Math.exp(-initialDecline / 12);
        while (currentRate > qf && rates.length < maxMonths) {
          rates.push(currentRate);
          currentRate *= (1 - monthlyDecline);
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
            currentRate *= (1 - monthlyTerminal);
          }
          break;
        }
        rates.push(currentRate);
        currentRate = qi / Math.pow(1 + bFactor * initialDecline * (t + 1) / 12, 1 / bFactor);
        t += 1;
      }
      return rates;
    };

    const buildForecastSeries = (productionRows, params) => {
      const maxMonths = 600;
      const oilStartRaw = parseDateValue(params.FCST_START_OIL);
      const gasStartRaw = parseDateValue(params.FCST_START_GAS);
      const oilStart = oilStartRaw ? new Date(Date.UTC(oilStartRaw.getUTCFullYear(), oilStartRaw.getUTCMonth(), 1)) : null;
      const gasStart = gasStartRaw ? new Date(Date.UTC(gasStartRaw.getUTCFullYear(), gasStartRaw.getUTCMonth(), 1)) : null;

      const startCandidates = [oilStart, gasStart].filter(Boolean);
      const earliestStart = startCandidates.length
        ? new Date(Math.min(...startCandidates.map((d) => d.getTime())))
        : null;

      const monthMap = new Map();
      let minDate = null;
      let maxDate = null;

      productionRows.forEach((row) => {
        const dt = parseDateValue(row.PRODUCINGMONTH);
        const key = monthKey(dt);
        if (!key) return;
        const bucket = monthMap.get(key) || { oilHist: 0, gasHist: 0, oilFc: null, gasFc: null };
        bucket.oilHist += toNumber(row.LIQUIDSPROD_BBL);
        bucket.gasHist += toNumber(row.GASPROD_MCF);
        monthMap.set(key, bucket);
        if (!minDate || dt < minDate) minDate = dt;
        if (!maxDate || dt > maxDate) maxDate = dt;
      });

      if (!earliestStart) {
        return { monthMap, minDate, maxDate };
      }

      const gasQi = toNumber(params.GAS_CALC_QI);
      const gasQf = toNumber(params.GAS_Q_MIN);
      const gasDeclineType = params.GAS_DECLINE_TYPE || 'EXP';
      const gasDecline = toNumber(params.GAS_EMPIRICAL_DI);
      let gasBFactor = toNumber(params.GAS_CALC_B_FACTOR);
      if (!gasBFactor || gasBFactor < 0.8) gasBFactor = 0.8;
      const gasTerminal = toNumber(params.GAS_D_MIN);

      const oilQi = toNumber(params.OIL_CALC_QI);
      const oilQf = toNumber(params.OIL_Q_MIN);
      const oilDeclineType = params.OIL_DECLINE_TYPE || 'HYP';
      const oilDecline = toNumber(params.OIL_EMPIRICAL_DI);
      let oilBFactor = toNumber(params.OIL_CALC_B_FACTOR);
      if (!oilBFactor || oilBFactor < 0.8) oilBFactor = 0.8;
      const oilTerminal = toNumber(params.OIL_D_MIN);

      const gasRates = gasStart
        ? calculateDeclineRates(gasQi, gasQf, gasDeclineType, gasBFactor, gasDecline, gasTerminal, maxMonths)
        : [];
      const oilRates = oilStart
        ? calculateDeclineRates(oilQi, oilQf, oilDeclineType, oilBFactor, oilDecline, oilTerminal, maxMonths)
        : [];

      for (let i = 0; i < maxMonths; i++) {
        const dt = new Date(Date.UTC(earliestStart.getUTCFullYear(), earliestStart.getUTCMonth() + i, 1));
        const key = monthKey(dt);
        const bucket = monthMap.get(key) || { oilHist: 0, gasHist: 0, oilFc: null, gasFc: null };
        monthMap.set(key, bucket);
      }

      const cutoffDate = new Date(Date.UTC(2050, 11, 31));
      for (const key of Array.from(monthMap.keys())) {
        const dt = parseDateValue(key);
        if (dt && dt > cutoffDate) {
          monthMap.delete(key);
        }
      }

      if (gasStart) {
        const offset = Math.max(0, monthIndex(gasStart) - monthIndex(earliestStart));
        for (let i = 0; i < gasRates.length; i++) {
          const idx = offset + i;
          const dt = new Date(Date.UTC(earliestStart.getUTCFullYear(), earliestStart.getUTCMonth() + idx, 1));
          const key = monthKey(dt);
          const bucket = monthMap.get(key);
          if (bucket) bucket.gasFc = gasRates[i];
        }
      }

      if (oilStart) {
        const offset = Math.max(0, monthIndex(oilStart) - monthIndex(earliestStart));
        for (let i = 0; i < oilRates.length; i++) {
          const idx = offset + i;
          const dt = new Date(Date.UTC(earliestStart.getUTCFullYear(), earliestStart.getUTCMonth() + idx, 1));
          const key = monthKey(dt);
          const bucket = monthMap.get(key);
          if (bucket) bucket.oilFc = oilRates[i];
        }
      }

      const gasYears = toNumber(params.GAS_FCST_YRS);
      if (gasYears > 0 && minDate) {
        const cutoff = new Date(Date.UTC(minDate.getUTCFullYear() + gasYears, minDate.getUTCMonth(), 1));
        for (const [key, bucket] of monthMap.entries()) {
          const dt = parseDateValue(key);
          if (dt && dt > cutoff) {
            bucket.gasFc = null;
          }
        }
      }

      const allDates = Array.from(monthMap.keys()).map((key) => parseDateValue(key)).filter(Boolean);
      if (allDates.length) {
        const sorted = allDates.sort((a, b) => a - b);
        minDate = minDate || sorted[0];
        maxDate = maxDate || sorted[sorted.length - 1];
      }

      return { monthMap, minDate, maxDate };
    };

    const computeEurForWell = (monthMap, ownerInterest) => {
      const keys = Array.from(monthMap.keys()).sort();
      const now = new Date();
      const remainingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const remainingEnd = new Date(Date.UTC(remainingStart.getUTCFullYear() + 15, remainingStart.getUTCMonth(), 1));

      let oilHistSum = 0;
      let gasHistSum = 0;
      let oilForecastSum = 0;
      let gasForecastSum = 0;
      let remainingOilSum = 0;
      let remainingGasSum = 0;

      for (const key of keys) {
        const bucket = monthMap.get(key);
        const dt = parseDateValue(key);
        const histOil = bucket.oilHist > 0 ? bucket.oilHist : 0;
        const histGas = bucket.gasHist > 0 ? bucket.gasHist : 0;
        const fcOil = bucket.oilFc > 0 ? bucket.oilFc : 0;
        const fcGas = bucket.gasFc > 0 ? bucket.gasFc : 0;

        oilHistSum += histOil;
        gasHistSum += histGas;

        if (dt && dt >= remainingStart && dt < remainingEnd && histOil === 0) {
          oilForecastSum += fcOil;
        }
        if (dt && dt >= remainingStart && dt < remainingEnd && histGas === 0) {
          gasForecastSum += fcGas;
        }

        if (dt && dt >= remainingStart && dt < remainingEnd) {
          remainingOilSum += fcOil;
          remainingGasSum += fcGas;
        }
      }

      const grossOil = oilHistSum + oilForecastSum;
      const grossGas = gasHistSum + gasForecastSum;
      const nri = Number.isFinite(ownerInterest) ? ownerInterest : null;

      const netOil = nri !== null ? grossOil * nri : null;
      const netGas = nri !== null ? grossGas * nri : null;
      const remainingNetOil = nri !== null ? remainingOilSum * nri : null;
      const remainingNetGas = nri !== null ? remainingGasSum * nri : null;

      return {
        grossOil,
        grossGas,
        netOil,
        netGas,
        remainingNetOil,
        remainingNetGas,
      };
    };

    const renderWellEditMetrics = async (monthMap, ownerInterest) => {
      const eurEl = document.getElementById(WELL_EDIT_EUR_ID);
      const nriEl = document.getElementById(WELL_EDIT_NRI_VALUE_ID);
      if (!eurEl || !nriEl) return;

      const metrics = computeEurForWell(monthMap, ownerInterest);
      eurEl.innerHTML = `
        <div>Gross Oil EUR: ${formatNumber(metrics.grossOil)}</div>
        <div>Gross Gas EUR: ${formatNumber(metrics.grossGas)}</div>
        <div>Net Oil EUR: ${formatNumber(metrics.netOil)}</div>
        <div>Net Gas EUR: ${formatNumber(metrics.netGas)}</div>
        <div>Remaining Net Oil: ${formatNumber(metrics.remainingNetOil)}</div>
        <div>Remaining Net Gas: ${formatNumber(metrics.remainingNetGas)}</div>
      `;

      const prices = await ensurePriceAverages();
      if (prices && Number.isFinite(metrics.remainingNetOil) && Number.isFinite(metrics.remainingNetGas)) {
        const valueEstimate = metrics.remainingNetOil * prices.oil + metrics.remainingNetGas * prices.gas;
        nriEl.textContent = formatCurrency(valueEstimate);
      } else {
        nriEl.textContent = '--';
      }
    };

    const renderWellEditChart = (monthMap) => {
      const chartEl = document.getElementById(WELL_EDIT_CHART_ID);
      if (!chartEl || !window.Plotly) return;

      const keys = Array.from(monthMap.keys()).sort();
      const x = keys.map((k) => k.slice(0, 7));
      const oilHist = keys.map((k) => monthMap.get(k).oilHist || null);
      const gasHist = keys.map((k) => monthMap.get(k).gasHist || null);
      const oilFc = keys.map((k) => {
        const v = monthMap.get(k).oilFc;
        return v > 0 ? v : null;
      });
      const gasFc = keys.map((k) => {
        const v = monthMap.get(k).gasFc;
        return v > 0 ? v : null;
      });

      const janMonths = keys.filter((k) => k.slice(5, 7) === '01');
      const janEvery3 = janMonths.filter((_, i) => i % 3 === 0);
      const yearTicks = janEvery3.map((k) => k.slice(0, 7));
      const yearText = janEvery3.map((k) => k.slice(0, 4));

      const traces = [
        {
          name: 'Oil (BBL)',
          x,
          y: oilHist,
          mode: 'markers',
          marker: { size: 6, color: '#1e8f4e', opacity: 0.7 },
          hovertemplate: '%{x}<br>Oil: %{y:,}<extra></extra>',
        },
        {
          name: 'Gas (MCF)',
          x,
          y: gasHist,
          mode: 'markers',
          marker: { size: 6, color: '#d62728', opacity: 0.7 },
          hovertemplate: '%{x}<br>Gas: %{y:,}<extra></extra>',
        },
        {
          name: 'Oil Forecast (BBL)',
          x,
          y: oilFc,
          mode: 'lines',
          line: { color: '#1e8f4e', width: 2 },
          hovertemplate: '%{x}<br>Oil Fcst: %{y:,.0f} BBL/month<extra></extra>',
        },
        {
          name: 'Gas Forecast (MCF)',
          x,
          y: gasFc,
          mode: 'lines',
          line: { color: '#d62728', width: 2 },
          hovertemplate: '%{x}<br>Gas Fcst: %{y:,.0f} MCF/month<extra></extra>',
        },
      ];

      const layout = {
        height: chartEl.clientHeight || 320,
        margin: { l: 50, r: 40, t: 10, b: 60 },
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
          font: { size: 8 },
        },
        xaxis: {
          title: 'Production Month',
          type: 'category',
          tickmode: 'array',
          tickvals: yearTicks,
          ticktext: yearText,
          tickangle: -45,
          automargin: true,
        },
        yaxis: {
          title: 'MCF or BBL per Month',
          type: 'log',
          gridcolor: '#1f293a1f',
        },
        paper_bgcolor: '#fff',
        plot_bgcolor: '#fff',
        font: { color: '#1f293a' },
        dragmode: 'pan',
      };

      Plotly.react(chartEl, traces, layout, { ...BASE_PLOT_CONFIG });
    };

    const updateWellEditVisualization = () => {
      const { production, params, ownerInterest } = WELL_EDIT_STATE;
      if (!production || !params) return;
      const { monthMap } = buildForecastSeries(production, params);
      renderWellEditChart(monthMap);
      renderWellEditMetrics(monthMap, ownerInterest);
    };

    const setWellEditStatus = (message, isError = false) => {
      const statusEl = document.getElementById(WELL_EDIT_STATUS_ID);
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.style.color = isError ? '#dc2626' : '#1f293a';
    };

    const buildControlCard = (labelText, inputEl) => {
      const card = document.createElement('div');
      card.classList.add('control-card');
      const label = document.createElement('label');
      label.textContent = labelText;
      card.appendChild(label);
      card.appendChild(inputEl);
      return card;
    };

    const renderWellEditControls = () => {
      const container = document.getElementById(WELL_EDIT_CONTROLS_ID);
      if (!container) return;
      container.innerHTML = '';

      const params = WELL_EDIT_STATE.params || {};
      const firstDate = WELL_EDIT_STATE.firstProdDate;
      const lastDate = WELL_EDIT_STATE.lastProdDate;
      const firstIndex = firstDate ? monthIndex(firstDate) : null;
      const lastIndex = lastDate ? monthIndex(lastDate) : null;

      const buildRangeControl = (field, label, min, max, step) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('control-inputs');
        const range = document.createElement('input');
        range.type = 'range';
        range.min = min;
        range.max = max;
        range.step = step;
        range.value = Number(params[field] ?? min);
        range.dataset.field = field;
        const number = document.createElement('input');
        number.type = 'number';
        number.min = min;
        number.max = max;
        number.step = step;
        number.value = range.value;
        wrapper.appendChild(range);
        wrapper.appendChild(number);

        const sync = (value) => {
          range.value = value;
          number.value = value;
          WELL_EDIT_STATE.params[field] = Number(value);
          updateWellEditVisualization();
        };

        range.addEventListener('input', () => sync(range.value));
        number.addEventListener('change', () => sync(number.value));

        return buildControlCard(label, wrapper);
      };

      const buildSelectControl = (field, label, options) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('control-inputs');
        const select = document.createElement('select');
        select.dataset.field = field;
        options.forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          select.appendChild(option);
        });
        select.value = params[field] || options[0];
        wrapper.appendChild(select);
        select.addEventListener('change', () => {
          WELL_EDIT_STATE.params[field] = select.value;
          updateWellEditVisualization();
        });
        return buildControlCard(label, wrapper);
      };

      const buildDateSlider = (field, label) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('control-inputs');
        const range = document.createElement('input');
        range.type = 'range';
        if (firstIndex !== null) range.min = firstIndex;
        if (lastIndex !== null) range.max = lastIndex;
        if (firstIndex === null && lastIndex === null) {
          range.min = 0;
          range.max = 0;
          range.disabled = true;
        }
        range.step = 1;

        const currentDate = parseDateValue(params[field]) || lastDate || firstDate;
        let currentIndex = currentDate ? monthIndex(currentDate) : lastIndex;
        if (lastIndex !== null && currentIndex !== null && currentIndex > lastIndex) {
          currentIndex = lastIndex;
        }
        range.value = currentIndex ?? (lastIndex ?? 0);

        const display = document.createElement('input');
        display.type = 'text';
        display.readOnly = true;
        display.value = formatDateLabel(monthIndexToDate(Number(range.value)));

        wrapper.appendChild(range);
        wrapper.appendChild(display);

        range.addEventListener('input', () => {
          const selectedDate = monthIndexToDate(Number(range.value));
          display.value = formatDateLabel(selectedDate);
          WELL_EDIT_STATE.params[field] = formatDateLabel(selectedDate);
          updateWellEditVisualization();
        });

        return buildControlCard(label, wrapper);
      };

      container.appendChild(buildDateSlider('FCST_START_OIL', 'Oil forecast start'));
      container.appendChild(buildDateSlider('FCST_START_GAS', 'Gas forecast start'));
      container.appendChild(buildSelectControl('OIL_DECLINE_TYPE', 'Oil decline type', ['EXP', 'HYP']));
      container.appendChild(buildSelectControl('GAS_DECLINE_TYPE', 'Gas decline type', ['EXP', 'HYP']));

      WELL_EDIT_PARAMS.forEach((def) => {
        container.appendChild(buildRangeControl(def.key, def.label, def.min, def.max, def.step));
      });
    };

    const loadWellEditData = async (api) => {
      const resp = await fetch(`/well-dca-detail/?api=${encodeURIComponent(api)}`);
      if (!resp.ok) {
        throw new Error(`Failed to load ${api}`);
      }
      const payload = await resp.json();
      return payload;
    };

    const openWellEditModal = async (api) => {
      const modal = getWellEditModal();
      if (!modal) return;
      modal.removeAttribute('hidden');
      setWellEditStatus('Loading well data...');
      WELL_EDIT_STATE.api = api;
      WELL_EDIT_STATE.ownerInterest = getOwnerInterestForApi(api);

      try {
        const data = await loadWellEditData(api);
        WELL_EDIT_STATE.production = data.production || [];
        WELL_EDIT_STATE.params = data.params || {};

        const prodDates = WELL_EDIT_STATE.production
          .map((row) => parseDateValue(row.PRODUCINGMONTH))
          .filter(Boolean)
          .sort((a, b) => a - b);
        WELL_EDIT_STATE.firstProdDate = prodDates[0] || null;
        WELL_EDIT_STATE.lastProdDate = prodDates[prodDates.length - 1] || null;

        if (!WELL_EDIT_STATE.params.FCST_START_OIL && WELL_EDIT_STATE.lastProdDate) {
          WELL_EDIT_STATE.params.FCST_START_OIL = formatDateLabel(WELL_EDIT_STATE.lastProdDate);
        }
        if (!WELL_EDIT_STATE.params.FCST_START_GAS && WELL_EDIT_STATE.lastProdDate) {
          WELL_EDIT_STATE.params.FCST_START_GAS = formatDateLabel(WELL_EDIT_STATE.lastProdDate);
        }
        if (!WELL_EDIT_STATE.params.OIL_DECLINE_TYPE) {
          WELL_EDIT_STATE.params.OIL_DECLINE_TYPE = 'HYP';
        }
        if (!WELL_EDIT_STATE.params.GAS_DECLINE_TYPE) {
          WELL_EDIT_STATE.params.GAS_DECLINE_TYPE = 'EXP';
        }

        const titleEl = document.getElementById(WELL_EDIT_TITLE_ID);
        const subtitleEl = document.getElementById(WELL_EDIT_SUBTITLE_ID);
        if (titleEl) titleEl.textContent = `Edit Well Forecast: ${api}`;
        if (subtitleEl) {
          subtitleEl.textContent = WELL_EDIT_STATE.lastProdDate
            ? `Last production month: ${formatDateLabel(WELL_EDIT_STATE.lastProdDate)}`
            : 'No production history found.';
        }

        renderWellEditControls();
        updateWellEditVisualization();
        setWellEditStatus('');
      } catch (error) {
        console.error('Well edit load failed', error);
        setWellEditStatus('Unable to load well data.', true);
      }
    };

    const closeWellEditModal = () => {
      const modal = getWellEditModal();
      if (!modal) return;
      modal.setAttribute('hidden', 'hidden');
      WELL_EDIT_STATE.api = null;
    };

    const bindWellEditEvents = () => {
      const table = document.getElementById('userWellsTable');
      if (table) {
        table.addEventListener('click', (event) => {
          const button = event.target.closest('.well-edit-button');
          if (!button) return;
          const api = button.dataset.api;
          if (!api) return;
          openWellEditModal(api);
        });
      }

      const closeButton = document.getElementById('well-edit-close');
      if (closeButton) closeButton.addEventListener('click', closeWellEditModal);

      const modal = getWellEditModal();
      if (modal) {
        modal.addEventListener('click', (event) => {
          if (event.target === modal) closeWellEditModal();
        });
      }

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const modalEl = getWellEditModal();
        if (modalEl && !modalEl.hasAttribute('hidden')) closeWellEditModal();
      });

      const saveButton = document.getElementById('well-edit-save');
      if (saveButton) {
        saveButton.addEventListener('click', async () => {
          if (!WELL_EDIT_STATE.api) return;
          saveButton.disabled = true;
          setWellEditStatus('Saving parameters...');
          try {
            const resp = await fetch('/well-dca-inputs/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ api: WELL_EDIT_STATE.api, params: WELL_EDIT_STATE.params }),
            });
            if (!resp.ok) {
              throw new Error(`Save failed ${resp.status}`);
            }
            setWellEditStatus('Parameters saved.');
          } catch (error) {
            console.error('Save failed', error);
            setWellEditStatus('Unable to save parameters.', true);
          } finally {
            saveButton.disabled = false;
          }
        });
      }
    };

    document.addEventListener('DOMContentLoaded', bindWellEditEvents);

    window.updateWellPvValues = function updateWellPvValues(pvMap) {
      if (!pvMap || typeof pvMap !== 'object') return;
      window.latestPerWellPvMap = pvMap;
      applyPerWellPvMap(pvMap);
    };

    function applySelectionToWellData(data) {
      if (!data || !Array.isArray(data.api_uwi)) return data;

      const indices = [];
      const apis = data.api_uwi;
      for (let i = 0; i < apis.length; i++) {
        const api = apis[i];
        if (!selectionInitialized || selectedWellApis.has(api)) {
          indices.push(i);
        }
      }

      if (indices.length === apis.length) return data;

      const filtered = {};
      Object.entries(data).forEach(([key, value]) => {
        filtered[key] = Array.isArray(value) ? indices.map((i) => value[i]) : value;
      });
      return filtered;
    }

    function renderUserWellsMap(data) {
      const mapDivId = 'userWellsMap';
      const mapDiv = document.getElementById(mapDivId);
      if (!mapDiv || !data) return;

      const filteredData = applySelectionToWellData(data);
      const hasWellPoints = Array.isArray(filteredData.lat) && filteredData.lat.length > 0;
      if (!hasWellPoints) {
        if (mapDiv._segResizeHandler) {
          window.removeEventListener('resize', mapDiv._segResizeHandler);
          mapDiv._segResizeHandler = null;
        }
        if (mapDiv._segResizeObserver) {
          mapDiv._segResizeObserver.disconnect();
          mapDiv._segResizeObserver = null;
        }
        Plotly.react(mapDivId, [], {
          paper_bgcolor: '#156082',
          plot_bgcolor: '#156082',
          mapbox: {
            accesstoken: MAPBOX_TOKEN,
            style: getMapStyle(mapDivId),
            center: { lat: 31.0, lon: -99.0 },
            zoom: 6
          },
          margin: { t: 5, r: 10, b: 10, l: 10 },
          height: getResponsivePlotHeight(mapDiv)
        }, { scrollZoom: false, responsive: true });
        return;
      }

      const hoverText = filteredData.api_uwi.map((api, i) => {
        const name = filteredData.name && filteredData.name[i] ? filteredData.name[i] : '';
        const fp = filteredData.first_prod_date && filteredData.first_prod_date[i] ? filteredData.first_prod_date[i] : '';
        const comp = filteredData.completion_date && filteredData.completion_date[i] ? filteredData.completion_date[i] : '';
        return `API: ${api}<br>Name: ${name}<br>First Prod: ${fp}<br>Completion: ${comp}`;
      });

      const traces = [];
      const lineTraceIndices = {};
      const traceToWellIndex = {};
      for (let i = 0; i < filteredData.lat.length; i++) {
        if (filteredData.lat_bh[i] && filteredData.lon_bh[i]) {
          const traceIndex = traces.length;
          lineTraceIndices[i] = traceIndex;
          traceToWellIndex[traceIndex] = i;
          traces.push({
            type: 'scattermapbox',
            lat: [filteredData.lat[i], filteredData.lat_bh[i]],
            lon: [filteredData.lon[i], filteredData.lon_bh[i]],
            mode: 'lines',
            line: { color: 'red', width: 2 },
            text: [hoverText[i], hoverText[i]],
            hoverinfo: 'text',
            showlegend: false
          });
        }
      }

      const colors = filteredData.lat.map(() => 'red');
      traces.push({
        type: 'scattermapbox',
        lat: filteredData.lat,
        lon: filteredData.lon,
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

      const center = calculateCentroid(filteredData.lat, filteredData.lon) || { lat: 31.0, lon: -99.0 };
      let zoom = 10;
      if (filteredData.lat.length > 1) {
        const latMin = Math.min(...filteredData.lat);
        const latMax = Math.max(...filteredData.lat);
        const lonMin = Math.min(...filteredData.lon);
        const lonMax = Math.max(...filteredData.lon);
        const maxDiff = Math.max(latMax - latMin, lonMax - lonMin);
        if (maxDiff > 4) zoom = 6;
        else if (maxDiff > 2) zoom = 7;
        else if (maxDiff > 1) zoom = 8;
        else if (maxDiff > 0.5) zoom = 9;
        else if (maxDiff > 0.25) zoom = 10;
        else if (maxDiff > 0.1) zoom = 11;
        else zoom = 12;
      }

      const prodChartEl = document.getElementById('prodChart');
      const syncMapHeight = () => getResponsivePlotHeight(mapDiv, { matchHeightEl: prodChartEl });
      const layout = {
        paper_bgcolor: '#156082',
        plot_bgcolor: '#156082',
        font: { color: '#eaeaea' },
        mapbox: {
          accesstoken: MAPBOX_TOKEN,
          style: getMapStyle(mapDivId),
          center: center,
          zoom: zoom
        },
        margin: { t: 5, r: 10, b: 10, l: 10 },
        height: syncMapHeight(),
        // title: { text: 'User Wells Map', font: { color: '#eaeaea' } },
        showlegend: false,
        dragmode: 'pan'
      };

      Plotly.newPlot(mapDivId, traces, layout, { ...BASE_PLOT_CONFIG });
      syncChartAndMapContainers();

      if (mapDiv._segResizeHandler) {
        window.removeEventListener('resize', mapDiv._segResizeHandler);
      }
      const handleResize = () => {
        const nextHeight = syncMapHeight();
        Plotly.relayout(mapDivId, { height: nextHeight });
        Plotly.Plots.resize(mapDiv);
        syncChartAndMapContainers();
      };
      mapDiv._segResizeHandler = handleResize;
      window.addEventListener('resize', handleResize);
      requestAnimationFrame(handleResize);
      setTimeout(handleResize, 200);
      if (window.ResizeObserver && prodChartEl) {
        const ro = new ResizeObserver(handleResize);
        ro.observe(prodChartEl);
        mapDiv._segResizeObserver = ro;
      }
      window.syncRoyaltyPanelHeight();

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

    window.reloadUserWellsMapWithSelection = function reloadUserWellsMapWithSelection() {
      if (!userWellData) return;
      renderUserWellsMap(userWellData);
    };

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

        latestFilteredGeneralData = generalData;
        latestFilteredUserData = userData;

        // Table displays all user wells; no need to update here
        
        // Analyze nearby wells and create charts - use unfiltered user wells for centroid
        const nearbyAnalysis20 = analyzeNearbyWells(generalData, userWellData, year, 20);
        const nearbyAnalysis10 = analyzeNearbyWells(generalData, userWellData, year, 10);

        latestStatsExtras = {
          nearby10: (nearbyAnalysis10.nearbyWells || []).length,
          nearby20: (nearbyAnalysis20.nearbyWells || []).length
        };

        if (window.Stats) {
          const statsUserData = applySelectionToWellData(userData);
          window.Stats.render(generalData, statsUserData, latestStatsExtras);
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

          const mapDiv = document.getElementById('map');
          if (mapDiv?._segResizeHandler) {
            window.removeEventListener('resize', mapDiv._segResizeHandler);
            mapDiv._segResizeHandler = null;
          }

          const syncMapHeight = () => getResponsivePlotHeight(mapDiv, { min: 280, max: null, ratio: 0.78 });

          const layout = {
            paper_bgcolor: '#156082',
            plot_bgcolor: '#156082',
            font: { color: '#eaeaea' },
            mapbox: {
              accesstoken: MAPBOX_TOKEN,
              style: getMapStyle('map'),
              center: nearbyAnalysis20.centroid ?
                { lat: nearbyAnalysis20.centroid.lat, lon: nearbyAnalysis20.centroid.lon } :
                { lat: 31.0, lon: -99.0 },
              zoom: nearbyAnalysis20.centroid ? 9 : 6
            },
            margin: { t: 40, r: 10, b: 10, l: 10 },
            height: syncMapHeight(),
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

          await Plotly.react('map', traces, layout, {scrollZoom: false, responsive: true});

          const handleResize = () => {
            const nextHeight = syncMapHeight();
            Plotly.relayout('map', { height: nextHeight });
            Plotly.Plots.resize(mapDiv);
          };

          mapDiv._segResizeHandler = handleResize;
          window.addEventListener('resize', handleResize);
          requestAnimationFrame(handleResize);
          setTimeout(handleResize, 200);
          
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
      const targetMapId = mapStyleToggleBtn.dataset.mapTarget || 'userWellsMap';
      mapStyleToggleBtn.textContent = getMapStyle(targetMapId) === MAPBOX_STYLE_TERRAIN ? 'Satellite View' : 'Terrain View';

      mapStyleToggleBtn.addEventListener('click', () => {
        const currentStyle = getMapStyle(targetMapId);
        const nextStyle = currentStyle === MAPBOX_STYLE_TERRAIN ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_TERRAIN;
        setMapStyle(targetMapId, nextStyle);
        mapStyleToggleBtn.textContent = nextStyle === MAPBOX_STYLE_TERRAIN ? 'Satellite View' : 'Terrain View';

        const targetMapElement = document.getElementById(targetMapId);
        if (targetMapElement && targetMapElement.data) {
          Plotly.relayout(targetMapId, { 'mapbox.style': nextStyle });
        }
      });
    }

    // ===== Supporting documents =====
    const supportDocButtons = Array.from(
      document.querySelectorAll('.support-docs-button')
    );
    const supportDocsStatus = document.getElementById('support-docs-status');
    const supportDocsTableBody = document.querySelector('#support-docs-table tbody');
    const supportDocsEmptyState = document.getElementById('support-docs-empty');
    const supportDocsDateFormatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    let supportDocs = [];
    let lastSupportDocCorsWarning = null;
    let isLoadingSupportDocs = false;
    let isUploadingSupportDoc = false;
    let supportDocsStatusTimeoutId = null;

    function setSupportDocsStatus(message, variant = null) {
      if (!supportDocsStatus) return;

      supportDocsStatus.textContent = message || '';
      supportDocsStatus.classList.remove(
        'support-docs-status--success',
        'support-docs-status--error',
        'support-docs-status--warning',
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
        } else if (variant === 'warning') {
          supportDocsStatus.classList.add('support-docs-status--warning');
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

        const noteCell = document.createElement('td');
        noteCell.textContent = doc.note || '--';
        row.appendChild(noteCell);

        const actionsCell = document.createElement('td');
        actionsCell.className = 'support-docs-actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'support-docs-action support-docs-action--primary';
        editButton.textContent = 'Edit';
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
        const nextLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const nextParam = encodeURIComponent(nextLocation || '/');
        const loginUrl = `/login/?next=${nextParam}`;

        // Avoid infinite redirects if the login page itself triggers this helper.
        if (!window.__supportDocsAuthRedirected) {
          window.__supportDocsAuthRedirected = true;
          window.location.assign(loginUrl);
        }

        throw new Error('Authentication required. Redirecting to log in...');
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
        const message = error?.message || 'Unable to load documents right now.';
        setSupportDocsStatus(message, 'error');
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

        if (startData?.cors_warning) {
          lastSupportDocCorsWarning = startData.cors_warning;
          setSupportDocsStatus(startData.cors_warning, 'warning');
        } else {
          lastSupportDocCorsWarning = null;
        }

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
          let errorDetail = '';
          try {
            const responseText = await uploadResponse.text();
            if (responseText) {
              try {
                const parser = new window.DOMParser();
                const doc = parser.parseFromString(responseText, 'application/xml');
                const messageNode = doc.querySelector('Message');
                if (messageNode && messageNode.textContent) {
                  errorDetail = messageNode.textContent.trim();
                }
              } catch (_) {
                errorDetail = responseText.trim();
              }
            }
          } catch (_) {
            errorDetail = '';
          }

          let combinedMessage = `Upload failed (${uploadResponse.status})`;
          if (errorDetail) {
            combinedMessage += `: ${errorDetail}`;
          }
          if (lastSupportDocCorsWarning) {
            combinedMessage += ` ${lastSupportDocCorsWarning}`;
          }
          throw new Error(combinedMessage);
        }

        await supportDocsRequest('/api/uploads/finalize', {
          method: 'POST',
          body: JSON.stringify({
            file_id: startData.file_id,
            s3_key: startData.s3_key,
            note,
          }),
        });

        lastSupportDocCorsWarning = null;
        setSupportDocsStatus('Document uploaded successfully.', 'success');
        await loadSupportDocs();
      } catch (error) {
        console.error('Failed to upload supporting document:', error);
        let message = error.message || 'Unable to upload document.';
        if (!message.includes('Unable to upload') && lastSupportDocCorsWarning && !message.includes(lastSupportDocCorsWarning)) {
          message = `${message} ${lastSupportDocCorsWarning}`;
        }
        setSupportDocsStatus(message, 'error');
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

    const feedbackSection = document.getElementById('feedback-section');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackTextarea = document.getElementById('feedback-text');
    const feedbackSubmitButton = document.getElementById('feedback-submit');
    const feedbackStatus = document.getElementById('feedback-status');
    const feedbackTableBody = document.querySelector('#feedback-table tbody');
    const feedbackEmptyState = document.getElementById('feedback-empty');
    const isAdminFeedback = feedbackSection?.dataset?.isAdmin === 'true';
    const feedbackResponseModal = document.getElementById('feedbackResponseModal');
    const feedbackResponseForm = document.getElementById('feedbackResponseForm');
    const feedbackResponseText = document.getElementById('feedbackResponseText');
    const feedbackResponseMessage = document.getElementById('feedbackResponseMessage');
    const feedbackResponseDelete = document.getElementById('feedbackResponseDelete');
    const feedbackResponseCloseButtons = document.querySelectorAll('[data-feedback-close]');

    const feedbackResponseState = {
      isOpen: false,
      entry: null,
      saving: false
    };

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

    const setFeedbackResponseMessage = (message, variant) => {
      if (!feedbackResponseMessage) return;
      feedbackResponseMessage.textContent = message || '';
      feedbackResponseMessage.className = 'profile-modal__message';
      if (variant) {
        feedbackResponseMessage.classList.add(`profile-modal__message--${variant}`);
      }
    };

    const showFeedbackResponseModal = (entry) => {
      if (!feedbackResponseModal || !feedbackResponseText) return;
      feedbackResponseState.entry = entry;
      feedbackResponseModal.classList.add('is-visible');
      feedbackResponseModal.setAttribute('aria-hidden', 'false');
      feedbackResponseState.isOpen = true;
      feedbackResponseText.value = entry?.feedback_response || '';
      if (feedbackResponseDelete) {
        feedbackResponseDelete.disabled = !entry?.feedback_response;
      }
      setFeedbackResponseMessage('', null);
      feedbackResponseText.focus();
    };

    const hideFeedbackResponseModal = () => {
      if (!feedbackResponseModal) return;
      feedbackResponseModal.classList.remove('is-visible');
      feedbackResponseModal.setAttribute('aria-hidden', 'true');
      feedbackResponseState.isOpen = false;
      feedbackResponseState.entry = null;
      if (feedbackResponseDelete) {
        feedbackResponseDelete.disabled = true;
      }
      setFeedbackResponseMessage('', null);
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
        if (isAdminFeedback) {
          row.classList.add('feedback-row--interactive');
        }

        const submittedCell = document.createElement('td');
        submittedCell.textContent = formatFeedbackTimestamp(entry.submitted_at);
        row.appendChild(submittedCell);

        const feedbackCell = document.createElement('td');
        feedbackCell.textContent = entry.feedback_text || '--';
        if (entry.feedback_response) {
          const responseLabel = document.createElement('div');
          responseLabel.className = 'feedback-response__label';
          responseLabel.textContent = 'Admin Response:';
          feedbackCell.appendChild(responseLabel);

          const responseText = document.createElement('div');
          responseText.className = 'feedback-response';
          responseText.textContent = entry.feedback_response;
          feedbackCell.appendChild(responseText);
        }
        row.appendChild(feedbackCell);
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

    const loadFeedbackEntries = async () => {
      if (!feedbackTableBody || isFeedbackLoading) return;
      isFeedbackLoading = true;

      try {
        const response = await fetch('/feedback/');
        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }
        const payload = await response.json();
        hydrateFeedbackEntries(payload.entries || []);
        setFeedbackStatus('');
      } catch (error) {
        console.error('Failed to load feedback entries:', error);
        setFeedbackStatus('Unable to load feedback history right now.', 'error');
      } finally {
        isFeedbackLoading = false;
      }
    };

    if (feedbackTableBody) {
      toggleFeedbackEmptyState();
    }

    const saveFeedbackResponse = async (entry, responseText) => {
      if (!entry?.submitted_at) return;
      const trimmedResponse = (responseText || '').trim();
      if (!trimmedResponse) {
        setFeedbackResponseMessage('Response text is required.', 'error');
        return;
      }

      try {
        feedbackResponseState.saving = true;
        if (feedbackResponseForm) {
          feedbackResponseForm.classList.add('is-disabled');
        }
        setFeedbackResponseMessage('Saving response…', 'saving');
        const response = await fetch('/feedback/', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submitted_at: entry.submitted_at,
            feedback_response: trimmedResponse
          })
        });

        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }

        const payload = await response.json();
        const updated = payload.entry || {};
        feedbackEntries = feedbackEntries.map((current) => {
          if (current.submitted_at !== entry.submitted_at) {
            return current;
          }
          return {
            ...current,
            feedback_response: updated.feedback_response || trimmedResponse
          };
        });
        renderFeedbackEntries();
        setFeedbackResponseMessage('Response saved.', 'success');
        setTimeout(() => hideFeedbackResponseModal(), 200);
      } catch (error) {
        console.error('Failed to save feedback response:', error);
        setFeedbackResponseMessage('Unable to save response right now.', 'error');
      } finally {
        feedbackResponseState.saving = false;
        if (feedbackResponseForm) {
          feedbackResponseForm.classList.remove('is-disabled');
        }
      }
    };

    const deleteFeedbackResponse = async (entry) => {
      if (!entry?.submitted_at) return;
      if (!entry.feedback_response) {
        setFeedbackResponseMessage('No response to delete.', 'error');
        return;
      }

      const confirmed = window.confirm('Delete this response? This cannot be undone.');
      if (!confirmed) return;

      try {
        feedbackResponseState.saving = true;
        if (feedbackResponseForm) {
          feedbackResponseForm.classList.add('is-disabled');
        }
        setFeedbackResponseMessage('Deleting response…', 'saving');
        const response = await fetch('/feedback/', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submitted_at: entry.submitted_at,
            clear_response: true
          })
        });

        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }

        const payload = await response.json();
        const updated = payload.entry || {};
        feedbackEntries = feedbackEntries.map((current) => {
          if (current.submitted_at !== entry.submitted_at) {
            return current;
          }
          return {
            ...current,
            feedback_response: updated.feedback_response || null
          };
        });
        renderFeedbackEntries();
        setFeedbackResponseMessage('Response deleted.', 'success');
        setTimeout(() => hideFeedbackResponseModal(), 200);
      } catch (error) {
        console.error('Failed to delete feedback response:', error);
        setFeedbackResponseMessage('Unable to delete response right now.', 'error');
      } finally {
        feedbackResponseState.saving = false;
        if (feedbackResponseForm) {
          feedbackResponseForm.classList.remove('is-disabled');
        }
      }
    };

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

    if (feedbackTableBody && isAdminFeedback) {
      feedbackTableBody.addEventListener('click', (event) => {
        const row = event.target.closest('tr');
        if (!row) return;
        const submittedAt = row.dataset.submittedAt;
        const entry = feedbackEntries.find((item) => item.submitted_at === submittedAt);
        if (!entry) return;
        showFeedbackResponseModal(entry);
      });
    }

    if (feedbackResponseForm && feedbackResponseText) {
      feedbackResponseForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (feedbackResponseState.saving) return;
        if (!feedbackResponseState.entry) {
          setFeedbackResponseMessage('Select a feedback entry first.', 'error');
          return;
        }
        saveFeedbackResponse(feedbackResponseState.entry, feedbackResponseText.value);
      });
    }

    if (feedbackResponseDelete) {
      feedbackResponseDelete.addEventListener('click', () => {
        if (feedbackResponseState.saving) return;
        if (!feedbackResponseState.entry) {
          setFeedbackResponseMessage('Select a feedback entry first.', 'error');
          return;
        }
        deleteFeedbackResponse(feedbackResponseState.entry);
      });
    }

    if (feedbackResponseCloseButtons.length) {
      feedbackResponseCloseButtons.forEach((button) => {
        button.addEventListener('click', () => {
          if (feedbackResponseState.saving) return;
          hideFeedbackResponseModal();
        });
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!feedbackResponseState.isOpen || feedbackResponseState.saving) return;
      hideFeedbackResponseModal();
    });
