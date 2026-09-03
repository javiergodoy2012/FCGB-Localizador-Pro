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
  const originalDrawRamalPreview = drawRamalPreview;

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

  function samplesForSection(branch, startPk, endPk) {
    const samples = getDisplaySamples(branch.ramal)
      .filter(point => point.pk >= startPk && point.pk <= endPk);
    const source = NETWORK[branch.ramal].puntos;
    for (const pk of [startPk, endPk]) {
      const point = findPoint(source, pk);
      if (point) samples.push({ pk, lat: Number(point[1]), lon: Number(point[2]) });
    }
    samples.sort((a, b) => a.pk - b.pk);
    return samples
      .filter((point, index) => !index || point.pk !== samples[index - 1].pk);
  }

  function pointsForSection(branch, startPk, endPk) {
    return samplesForSection(branch, startPk, endPk)
      .map(point => [point.lat, point.lon]);
  }

  function overviewSections(branch) {
    if (branch.ramal === 'C15') {
      return [
        { start: 1120.846, end: 1354.500, status: 'Activo', inactive: false },
        { start: 1354.501, end: 1354.900, status: 'Inactivo', inactive: true },
        { start: 1354.901, end: 1456.200, status: 'Activo', inactive: false }
      ];
    }
    return [{
      start: branch.km_inicio,
      end: branch.km_fin,
      status: branch.ramal === 'C25' ? 'Inactivo' : '',
      inactive: branch.ramal === 'C25'
    }];
  }

  function drawSegmentedRamalPreview(ramal, fit) {
    const branch = CAT.ramales.find(item => item.ramal === ramal);
    if (!branch) return;
    drawBackgroundRoutes(ramal);
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.featureGroup().addTo(map);

    for (const section of overviewSections(branch)) {
      const samples = samplesForSection(branch, section.start, section.end);
      const points = samples.map(point => [point.lat, point.lon]);
      if (points.length < 2) continue;
      const weight = section.inactive ? 2 : 5;
      const line = L.polyline(points, {
        color: OVERVIEW_COLOR,
        weight,
        opacity: section.inactive ? 0.72 : 1,
        smoothFactor: 1,
        interactive: true
      }).addTo(routeLine);

      line.bindTooltip('', {
        sticky: true,
        direction: 'top',
        opacity: 0.98,
        className: 'ramal-km-tooltip'
      });
      line.on('mousemove', event => {
        if (currentMode !== 'localizador') return;
        const sample = nearestSample(samples, event.latlng);
        if (!sample) return;
        line.setTooltipContent(
          `<b>Ramal ${escapeHtml(ramal)}</b><br>` +
          `<span>Sector ${section.status.toLowerCase()}</span><br>` +
          `km ${fmtPk(sample.pk)}`
        );
        line.openTooltip(event.latlng);
      });
      line.on('mouseout', () => line.closeTooltip());
      line.on('click', event => {
        if (currentMode !== 'localizador') return;
        const sample = nearestSample(samples, event.latlng);
        if (!sample) return;
        ramalSelect.value = ramal;
        kmInput.value = sample.pk.toFixed(3).replace('.', ',');
        buscar();
      });
      line.bringToFront();
    }

    if (fit && routeLine.getBounds().isValid()) {
      map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
    }
  }

  drawRamalPreview = function (ramal, fit = true) {
    if (ramal === 'C15' || ramal === 'C25') {
      drawSegmentedRamalPreview(ramal, fit);
      return;
    }
    originalDrawRamalPreview(ramal, fit);
  };

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
      for (const section of overviewSections(branch)) {
        const points = pointsForSection(branch, section.start, section.end);
        if (!points.length) continue;
        const baseWeight = section.inactive ? 2 : 4;
        const hoverWeight = section.inactive ? 4 : 7;

        const line = L.polyline(points, {
          color: OVERVIEW_COLOR,
          weight: baseWeight,
          opacity: section.inactive ? 0.72 : 0.92,
          smoothFactor: 1,
          interactive: true
        }).addTo(backgroundRoutes);

        line.bindTooltip(
          `<b>Ramal ${escapeHtml(branch.ramal)}</b><br>` +
          (section.status ? `<span>Sector ${section.status.toLowerCase()}</span><br>` : '') +
          `km ${fmtPk(section.start)} → ${fmtPk(section.end)}<br>` +
          '<span>Hacé clic para seleccionar</span>',
          { sticky: true, direction: 'top', opacity: 0.98, className: 'ramal-km-tooltip' }
        );

        line.on('mouseover', function () {
          this.setStyle({ color: HOVER_COLOR, weight: hoverWeight, opacity: 1 });
          this.bringToFront();
          map.getContainer().style.cursor = 'pointer';
        });
        line.on('mouseout', function () {
          this.setStyle({ color: OVERVIEW_COLOR, weight: baseWeight, opacity: section.inactive ? 0.72 : 0.92 });
          map.getContainer().style.cursor = '';
        });
        line.on('click', function () {
          map.getContainer().style.cursor = '';
          selectRamal(branch.ramal);
        });

        bounds.extend(line.getBounds());
      }
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
