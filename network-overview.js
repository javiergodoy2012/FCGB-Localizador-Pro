(function () {
  'use strict';

  const OVERVIEW_VALUE = '__up_salta_overview__';
  const OVERVIEW_COLOR = '#2F80ED';
  const HOVER_COLOR = '#73B7FF';
  const ramalSelect = document.getElementById('ramal');
  const kmInput = document.getElementById('km');
  const searchButton = document.getElementById('buscar');
  const status = document.getElementById('status');
  const result = document.getElementById('resultado');

  if (!ramalSelect || typeof map === 'undefined' || typeof changeRamal !== 'function') return;

  const originalChangeRamal = changeRamal;

  function setSearchEnabled(enabled) {
    if (kmInput) {
      kmInput.disabled = !enabled;
      kmInput.placeholder = enabled ? '' : 'Seleccioná un ramal en el mapa';
    }
    if (searchButton) searchButton.disabled = !enabled;
  }

  function resetPreviousResult() {
    if (typeof marker !== 'undefined' && marker) {
      marker.remove();
      marker = null;
    }
    map.closePopup();
    if (typeof lastPoint !== 'undefined') lastPoint = null;
    if (result) result.hidden = true;
  }

  function selectRamal(ramal) {
    ramalSelect.value = ramal;
    changeRamal();
    ramalSelect.focus({ preventScroll: true });
  }

  function showNetworkOverview() {
    resetPreviousResult();
    setSearchEnabled(false);
    if (kmInput) kmInput.value = '';
    if (typeof routeLine !== 'undefined' && routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    backgroundRoutes.clearLayers();

    const bounds = L.latLngBounds([]);
    for (const branch of CAT.ramales) {
      const points = getDisplayPoints(branch.ramal);
      if (!points.length) continue;
      const inactive = branch.ramal === 'C25';
      const baseWeight = inactive ? 2 : 4;
      const hoverWeight = inactive ? 4 : 7;

      const line = L.polyline(points, {
        color: OVERVIEW_COLOR,
        weight: baseWeight,
        opacity: inactive ? 0.72 : 0.92,
        smoothFactor: 1,
        interactive: true
      }).addTo(backgroundRoutes);

      line.bindTooltip(
        `<b>Ramal ${escapeHtml(branch.ramal)}</b><br>` +
        (inactive ? '<span>Ramal inactivo</span><br>' : '') +
        `km ${fmtPk(branch.km_inicio)} → ${fmtPk(branch.km_fin)}<br>` +
        '<span>Hacé clic para seleccionar</span>',
        { sticky: true, direction: 'top', opacity: 0.98, className: 'ramal-km-tooltip' }
      );

      line.on('mouseover', function () {
        this.setStyle({ color: HOVER_COLOR, weight: hoverWeight, opacity: 1 });
        this.bringToFront();
        map.getContainer().style.cursor = 'pointer';
      });
      line.on('mouseout', function () {
        this.setStyle({ color: OVERVIEW_COLOR, weight: baseWeight, opacity: inactive ? 0.72 : 0.92 });
        map.getContainer().style.cursor = '';
      });
      line.on('click', function () {
        map.getContainer().style.cursor = '';
        selectRamal(branch.ramal);
      });

      bounds.extend(line.getBounds());
    }

    if (status) {
      status.textContent = 'Vista general UP Salta · 7 ramales. Pasá el cursor sobre una traza y hacé clic para seleccionarla.';
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 8 });
  }

  changeRamal = function () {
    if (ramalSelect.value === OVERVIEW_VALUE) {
      showNetworkOverview();
      return;
    }
    setSearchEnabled(true);
    originalChangeRamal();
  };

  const overviewOption = document.createElement('option');
  overviewOption.value = OVERVIEW_VALUE;
  overviewOption.textContent = 'Vista general UP Salta · 7 ramales';
  ramalSelect.insertBefore(overviewOption, ramalSelect.firstChild);

  ramalSelect.addEventListener('change', function (event) {
    if (ramalSelect.value !== OVERVIEW_VALUE) return;
    event.stopImmediatePropagation();
    showNetworkOverview();
  }, true);

  ramalSelect.value = OVERVIEW_VALUE;
  showNetworkOverview();
})();
