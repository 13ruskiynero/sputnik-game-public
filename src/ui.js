import { ACTION_ENERGY_COST, CLICKS_PER_DOLLAR, CONTRACT_ANGLE, EARTH_RADIUS_KM, RELAY_COST, SATELLITE_SPECS } from './game.js';

function formatMoney(value) {
  if (!Number.isFinite(value)) return '$0';
  if (Math.abs(value - Math.round(value)) < 0.005) {
    return '$' + Math.round(value).toLocaleString('ru-RU');
  }
  return '$' + value.toFixed(2);
}

function zoneHint(angle) {
  if (angle === null || angle === undefined) return 'нет данных';
  const deg = angle * 180 / Math.PI;
  if (deg <= CONTRACT_ANGLE * 180 / Math.PI) return 'над зоной';
  if (deg <= 60) return 'близко';
  return 'следите за орбитой';
}

function orbitOf(sat) {
  const recommended = SATELLITE_SPECS[sat.type]?.recommendedOrbit || {
    altitudeKm: 550,
    inclinationDeg: 90,
  };
  const orbit = sat.orbit || recommended;
  return {
    altitudeKm: Number.isFinite(orbit.altitudeKm) ? orbit.altitudeKm : recommended.altitudeKm,
    inclinationDeg: Number.isFinite(orbit.inclinationDeg) ? orbit.inclinationDeg : recommended.inclinationDeg,
  };
}

function orbitLabelFor(orbit) {
  const inclination = Math.abs(orbit.inclinationDeg);
  if (inclination >= 80) return 'Полярная';
  if (inclination <= 5) return orbit.altitudeKm >= 30000 ? 'Геостационарная' : 'Экваториальная';
  return 'Наклонная';
}

export class UI {
  constructor(game, world, time = { scale: 1 }) {
    this.game = game;
    this.world = world;
    this.time = time;
    this._satKey = '';
    this._zoneKey = '';
    this._detailId = null;
    this._orbitEdit = null;

    const $ = id => document.getElementById(id);
    this.el = {
      balance: $('balance'),
      income: $('income'),
      energyFill: $('energy-fill'),
      energyValue: $('energy-value'),
      energySatName: $('energy-sat-name'),
      actionFill: $('action-fill'),
      contractTitle: $('contract-title'),
      contractReward: $('contract-reward'),
      contractShots: $('contract-shots'),
      contractZone: $('contract-zone'),
      contractCard: $('contract-card'),
      btnSatellites: $('btn-satellites'),
      satSheet: $('sat-sheet'),
      satDetail: $('sat-detail'),
      instrumentDetail: $('instrument-detail'),
      btnSatBack: $('btn-sat-back'),
      btnSatSheetClose: $('btn-sat-sheet-close'),
      btnSatInstrument: $('btn-sat-instrument'),
      btnInstrumentBack: $('btn-instrument-back'),
      orbitEditor: $('orbit-editor'),
      orbitTitle: $('orbit-title'),
      orbitSubtitle: $('orbit-subtitle'),
      orbitAltitude: $('orbit-altitude'),
      orbitInclination: $('orbit-inclination'),
      orbitAltitudeValue: $('orbit-altitude-value'),
      orbitInclinationValue: $('orbit-inclination-value'),
      orbitAltitudeRecommended: $('orbit-altitude-recommended'),
      orbitInclinationRecommended: $('orbit-inclination-recommended'),
      btnOrbitBack: $('btn-orbit-back'),
      btnOrbitRecommended: $('btn-orbit-recommended'),
      btnOrbitApply: $('btn-orbit-apply'),
      btnOrbitCancel: $('btn-orbit-cancel'),
      satDetailName: $('sat-detail-name'),
      satDetailSubtitle: $('sat-detail-subtitle'),
      satDetailEnergy: $('sat-detail-energy'),
      satDetailEnergyFill: $('sat-detail-energy-fill'),
      satDetailWork: $('sat-detail-work'),
      satDetailInstrument: $('sat-detail-instrument'),
      satDetailOrbit: $('sat-detail-orbit'),
      satDetailDistance: $('sat-detail-distance'),
      satDetailAltitude: $('sat-detail-altitude'),
      satDetailPeriod: $('sat-detail-period'),
      satDetailSpeed: $('sat-detail-speed'),
      satDetailNote: $('sat-detail-note'),
      instrumentName: $('instrument-name'),
      instrumentSubtitle: $('instrument-subtitle'),
      instrumentKind: $('instrument-kind'),
      instrumentResolution: $('instrument-resolution'),
      instrumentFov: $('instrument-fov'),
      instrumentChannels: $('instrument-channels'),
      instrumentPower: $('instrument-power'),
      instrumentNote: $('instrument-note'),
      btnTasks: $('btn-tasks'),
      btnCloseContract: $('btn-close-contract'),
      btnShop: $('btn-shop'),
      btnMenu: $('btn-menu'),
      btnAction: $('btn-action'),
      actionHint: $('action-hint'),
      btnBuyRelay: $('btn-buy-relay'),
      btnReset: $('btn-reset'),
      devSpeed2: $('dev-speed-2'),
      devSpeed5: $('dev-speed-5'),
      devPause: $('dev-pause'),
      devPanel: $('dev-panel'),
      satList: $('sat-list'),
      toasts: $('toasts'),
      panels: Array.from(document.querySelectorAll('.panel')),
    };

    this.bind();
  }

  bind() {
    this.el.btnSatellites.addEventListener('click', () => this.togglePanel('panel-satellites'));
    if (this.el.btnSatBack) this.el.btnSatBack.addEventListener('click', () => this.backToSatList());
    if (this.el.btnSatSheetClose) this.el.btnSatSheetClose.addEventListener('click', () => this.hideSatSheet());
    if (this.el.btnSatInstrument) this.el.btnSatInstrument.addEventListener('click', () => this.showInstrument());
    if (this.el.btnInstrumentBack) this.el.btnInstrumentBack.addEventListener('click', () => this.showSatelliteView());
    if (this.el.btnOrbitBack) this.el.btnOrbitBack.addEventListener('click', () => this.cancelOrbitEdit());
    if (this.el.btnOrbitCancel) this.el.btnOrbitCancel.addEventListener('click', () => this.cancelOrbitEdit());
    if (this.el.btnOrbitRecommended) this.el.btnOrbitRecommended.addEventListener('click', () => this.resetOrbitToRecommended());
    if (this.el.btnOrbitApply) this.el.btnOrbitApply.addEventListener('click', () => this.applyOrbitEdit());
    if (this.el.orbitAltitude) this.el.orbitAltitude.addEventListener('input', () => this.onOrbitInput());
    if (this.el.orbitInclination) this.el.orbitInclination.addEventListener('input', () => this.onOrbitInput());
    this.el.btnTasks.addEventListener('click', () => this.el.contractCard.classList.toggle('open'));
    this.el.btnCloseContract.addEventListener('click', () => this.el.contractCard.classList.remove('open'));
    this.el.btnShop.addEventListener('click', () => this.togglePanel('panel-shop'));
    this.el.btnMenu.addEventListener('click', () => this.togglePanel('panel-menu'));
    this.el.btnAction.addEventListener('click', () => this.onAction());
    this.el.btnBuyRelay.addEventListener('click', () => this.onBuyRelay());
    this.el.btnReset.addEventListener('click', () => {
      this.game.reset();
      this.time.scale = 1;
      this.time.paused = false;
      this.updateDevButtons();
      this.closePanels();
      this.toast('Прогресс сброшен', 'warn');
    });
    this.bindDevSpeed(this.el.devSpeed2, 2);
    this.bindDevSpeed(this.el.devSpeed5, 5);
    if (this.el.devPause) {
      this.el.devPause.addEventListener('click', () => {
        this.time.paused = !this.time.paused;
        this.updateDevButtons();
      });
    }
    this.bindDevPanelDrag();
    this.updateDevButtons();

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.panel');
        if (panel) panel.classList.remove('open');
      });
    });
  }

  bindDevSpeed(button, scale) {
    if (!button) return;
    button.addEventListener('click', () => {
      this.time.scale = this.time.scale === scale ? 1 : scale;
      this.updateDevButtons();
    });
  }

  bindDevPanelDrag() {
    const panel = this.el.devPanel;
    if (!panel) return;

    let drag = null;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const keepInside = () => {
      const rect = panel.getBoundingClientRect();
      if (rect.right > window.innerWidth || rect.bottom > window.innerHeight || rect.left < 0 || rect.top < 0) {
        panel.style.left = clamp(rect.left, 0, window.innerWidth - rect.width) + 'px';
        panel.style.top = clamp(rect.top, 0, window.innerHeight - rect.height) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    };

    panel.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      panel.classList.add('dragging');
      if (panel.setPointerCapture) {
        try {
          panel.setPointerCapture(e.pointerId);
        } catch (err) {
          // Синтетические события в тестах не имеют активного указателя.
        }
      }
      e.preventDefault();
    });

    panel.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;

      const rect = panel.getBoundingClientRect();
      panel.style.left = clamp(drag.left + dx, 0, window.innerWidth - rect.width) + 'px';
      panel.style.top = clamp(drag.top + dy, 0, window.innerHeight - rect.height) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      e.preventDefault();
    });

    const end = e => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      drag = null;
      panel.classList.remove('dragging');
    };

    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('resize', keepInside);
  }

  updateDevButtons() {
    const active = this.time.scale;
    if (this.el.devSpeed2) {
      this.el.devSpeed2.classList.toggle('active', active === 2);
      this.el.devSpeed2.setAttribute('aria-pressed', String(active === 2));
    }
    if (this.el.devSpeed5) {
      this.el.devSpeed5.classList.toggle('active', active === 5);
      this.el.devSpeed5.setAttribute('aria-pressed', String(active === 5));
    }
    if (this.el.devPause) {
      const paused = Boolean(this.time.paused);
      this.el.devPause.classList.toggle('active', paused);
      this.el.devPause.setAttribute('aria-pressed', String(paused));
      this.el.devPause.textContent = paused ? '▶' : '⏸';
      this.el.devPause.title = paused ? 'Продолжить' : 'Пауза';
    }
  }

  hideSatSheet() {
    if (this._orbitEdit) this.cancelOrbitEdit();
    this._detailId = null;
    if (this.el.satSheet) this.el.satSheet.hidden = true;
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satSheet) this.el.satSheet.classList.remove('orbit-mode');
  }

  backToSatList() {
    this.hideSatSheet();
    this.togglePanel('panel-satellites');
  }

  showSatDetail(id) {
    const sat = this.game.state.satellites.find(s => s.id === id);
    if (!sat || !this.el.satSheet) return;
    this.closePanels();
    this._detailId = id;
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satSheet) this.el.satSheet.classList.remove('orbit-mode');
    this.el.satSheet.hidden = false;
    this.renderSatDetail(id);
  }

  showSatelliteView() {
    if (!this._detailId || !this.el.satSheet) return;
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satSheet) this.el.satSheet.classList.remove('orbit-mode');
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    this.renderSatDetail(this._detailId);
  }

  showInstrument() {
    const sat = this.game.state.satellites.find(s => s.id === this._detailId);
    if (!sat || !this.el.satSheet) return;
    this.renderInstrument(sat);
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satDetail) this.el.satDetail.hidden = true;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = false;
  }

  renderSatDetail(id) {
    if (!this.el.satDetailName) return;
    const sat = this.game.state.satellites.find(s => s.id === id);
    if (!sat) {
      this.hideSatSheet();
      return;
    }
    const spec = SATELLITE_SPECS[sat.type] || {};
    const info = this.world.getSatelliteInfo(id) || {};
    const orbit = orbitOf(sat);
    const orbitLabel = orbitLabelFor(orbit);
    const energy = Math.round(Math.max(0, Math.min(100, sat.energy)));
    const inclination = Math.abs(orbit.inclinationDeg).toFixed(0) + '°';
    const altitudeKm = orbit.altitudeKm;
    const distanceKm = EARTH_RADIUS_KM + altitudeKm;
    const instrument = spec.instrument || {};

    this.el.satDetailName.textContent = sat.name;
    this.el.satDetailSubtitle.textContent =
      [spec.kind, orbitLabel].filter(Boolean).join(' · ');
    this.el.satDetailEnergy.textContent = energy + '%';
    this.el.satDetailEnergyFill.style.width = energy + '%';
    this.el.satDetailEnergyFill.classList.toggle('low', energy < 20);
    this.el.satDetailWork.textContent = spec.role || '—';
    this.el.satDetailInstrument.textContent = instrument.name || '—';
    this.el.satDetailOrbit.textContent =
      [orbitLabel, inclination].filter(Boolean).join(' · ');
    this.el.satDetailDistance.textContent = distanceKm != null
      ? distanceKm.toLocaleString('ru-RU') + ' км от центра'
      : '—';
    this.el.satDetailAltitude.textContent = altitudeKm != null
      ? altitudeKm.toLocaleString('ru-RU') + ' км над поверхностью'
      : '—';
    this.el.satDetailPeriod.textContent = Number.isFinite(info.periodSec)
      ? info.periodSec.toFixed(1) + ' с'
      : '—';
    this.el.satDetailSpeed.textContent = Number.isFinite(info.speed)
      ? info.speed.toFixed(2) + ' рад/с'
      : '—';
    this.el.satDetailNote.textContent = spec.note || '';
  }

  renderInstrument(sat) {
    if (!this.el.instrumentName) return;
    const spec = SATELLITE_SPECS[sat.type] || {};
    const instrument = spec.instrument || {};
    this.el.instrumentName.textContent = instrument.name || '—';
    this.el.instrumentSubtitle.textContent =
      [instrument.kind, sat.name].filter(Boolean).join(' · ');
    this.el.instrumentKind.textContent = instrument.kind || '—';
    this.el.instrumentResolution.textContent = instrument.resolution || '—';
    this.el.instrumentFov.textContent = instrument.fov || '—';
    this.el.instrumentChannels.textContent = instrument.channels || '—';
    this.el.instrumentPower.textContent = instrument.power || '—';
    this.el.instrumentNote.textContent = instrument.note || '';
  }

  recommendedOrbit(sat) {
    return SATELLITE_SPECS[sat.type]?.recommendedOrbit || orbitOf(sat);
  }

  openOrbitEditor() {
    const sat = this.game.state.satellites.find(s => s.id === this._detailId);
    if (!sat || !this.el.orbitEditor) return;
    const original = orbitOf(sat);
    const recommended = this.recommendedOrbit(sat);
    this._orbitEdit = {
      id: sat.id,
      original: { ...original },
      draft: { ...original },
      recommended: { ...recommended },
      prevZoom: this.world.getZoom(),
    };
    this.el.orbitTitle.textContent = 'Орбита · ' + sat.name;
    this.el.orbitAltitudeRecommended.textContent =
      recommended.altitudeKm.toLocaleString('ru-RU') + ' км';
    this.el.orbitInclinationRecommended.textContent =
      recommended.inclinationDeg + '°';
    this.setOrbitControls(original);
    if (this.el.satDetail) this.el.satDetail.hidden = true;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    this.el.orbitEditor.hidden = false;
    this.el.satSheet.hidden = false;
    if (this.el.satSheet) this.el.satSheet.classList.add('orbit-mode');
    this.world.zoomToOrbit(this.world.getVisualRadius(recommended.altitudeKm));
  }

  setOrbitControls(orbit) {
    if (!this.el.orbitAltitude || !this.el.orbitInclination) return;
    this.el.orbitAltitude.value = String(orbit.altitudeKm);
    this.el.orbitInclination.value = String(orbit.inclinationDeg);
    this.updateOrbitLabels();
  }

  updateOrbitLabels() {
    if (!this.el.orbitAltitude || !this.el.orbitInclination) return;
    const altitudeKm = Number(this.el.orbitAltitude.value);
    const inclinationDeg = Number(this.el.orbitInclination.value);
    this.el.orbitAltitudeValue.textContent = altitudeKm.toLocaleString('ru-RU') + ' км';
    this.el.orbitInclinationValue.textContent = inclinationDeg + '°';
    const sat = this.game.state.satellites.find(s => s.id === this._orbitEdit?.id);
    this.el.orbitSubtitle.textContent =
      [sat?.name, orbitLabelFor({ altitudeKm, inclinationDeg })].filter(Boolean).join(' · ');
  }

  onOrbitInput() {
    const edit = this._orbitEdit;
    if (!edit || !this.el.orbitAltitude) return;
    let altitudeKm = Number(this.el.orbitAltitude.value);
    let inclinationDeg = Number(this.el.orbitInclination.value);

    const snapAltitude = Math.max(50, edit.recommended.altitudeKm * 0.02);
    if (Math.abs(altitudeKm - edit.recommended.altitudeKm) <= snapAltitude) {
      altitudeKm = edit.recommended.altitudeKm;
      this.el.orbitAltitude.value = String(altitudeKm);
    }
    if (Math.abs(inclinationDeg - edit.recommended.inclinationDeg) <= 3) {
      inclinationDeg = edit.recommended.inclinationDeg;
      this.el.orbitInclination.value = String(inclinationDeg);
    }

    edit.draft = { altitudeKm, inclinationDeg };
    this.updateOrbitLabels();
    this.world.updateSatelliteOrbit(edit.id, edit.draft);
    this.world.zoomToOrbit(this.world.getVisualRadius(altitudeKm));
  }

  resetOrbitToRecommended() {
    const edit = this._orbitEdit;
    if (!edit) return;
    edit.draft = { ...edit.recommended };
    this.setOrbitControls(edit.draft);
    this.world.updateSatelliteOrbit(edit.id, edit.draft);
    this.world.zoomToOrbit(this.world.getVisualRadius(edit.draft.altitudeKm));
  }

  applyOrbitEdit() {
    const edit = this._orbitEdit;
    if (!edit) return;
    this.game.setSatelliteOrbit(edit.id, edit.draft);
    this.world.updateSatelliteOrbit(edit.id, edit.draft);
    this._orbitEdit = null;
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satSheet) this.el.satSheet.classList.remove('orbit-mode');
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    this.renderSatDetail(edit.id);
  }

  cancelOrbitEdit() {
    const edit = this._orbitEdit;
    if (!edit) return;
    this._orbitEdit = null;
    this.world.updateSatelliteOrbit(edit.id, edit.original);
    this.world.zoomToOrbit(this.world.getVisualRadius(edit.original.altitudeKm));
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satSheet) this.el.satSheet.classList.remove('orbit-mode');
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    this.renderSatDetail(edit.id);
  }

  togglePanel(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const willOpen = !target.classList.contains('open');
    for (const panel of this.el.panels) panel.classList.remove('open');
    if (willOpen) {
      this.hideSatSheet();
      target.classList.add('open');
    }
  }

  closePanels() {
    for (const panel of this.el.panels) panel.classList.remove('open');
  }

  onAction() {
    const sat = this.game.selectedSatellite();
    const angle = sat ? this.world.getAngleToContract(sat.id) : null;
    const result = this.game.doAction(angle);

    if (!result.ok) {
      this.toast(result.reason, 'warn');
      return;
    }

    this.pulseAction();
    this.world.triggerObservation(sat.id);
    if (result.shot) this.toast('Снимок сделан', 'ok');
    if (result.contractDone) {
      this.toast('Контракт выполнен: +$' + result.reward, 'ok');
    }
  }

  onBuyRelay() {
    const result = this.game.buyRelay();
    if (!result.ok) {
      this.toast(result.reason, 'warn');
      return;
    }
    this.toast('Куплен ' + result.sat.name + ': +$0.05/сек', 'ok');
    this.closePanels();
    this.showSatDetail(result.sat.id);
    this.openOrbitEditor();
  }

  pulseAction() {
    this.el.btnAction.classList.remove('pulse');
    void this.el.btnAction.offsetWidth;
    this.el.btnAction.classList.add('pulse');
    setTimeout(() => this.el.btnAction.classList.remove('pulse'), 260);
  }

  toast(text, type = '') {
    const node = document.createElement('div');
    node.className = 'toast ' + type;
    node.textContent = text;
    this.el.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 260);
    }, 2200);
  }

  render(state) {
    this.el.balance.textContent = formatMoney(state.balance);
    this.el.income.textContent = '+' + '$' + state.incomePerSec.toFixed(2) + '/сек';
    const fill = Math.min(100, (state.actionClicks / CLICKS_PER_DOLLAR) * 100);
    this.el.actionFill.style.width = fill + '%';

    const sat = state.satellites.find(s => s.id === state.selectedId) || state.satellites[0] || null;
    const energyPct = sat ? Math.round(Math.max(0, Math.min(100, sat.energy))) : 0;
    this.el.energyFill.style.width = energyPct + '%';
    this.el.energyValue.textContent = energyPct + '%';
    if (this.el.energySatName) {
      this.el.energySatName.textContent = sat ? sat.name : '—';
      this.el.energySatName.title = sat ? sat.name : '';
    }
    this.el.energyFill.classList.toggle('low', energyPct < 20);
    const angle = sat ? this.world.getAngleToContract(sat.id) : null;
    const overZone = angle !== null && angle <= CONTRACT_ANGLE;

    const contract = state.contract;
    if (contract) {
      this.el.contractTitle.textContent = contract.title;
      this.el.contractReward.textContent = '$' + contract.reward;
      this.el.contractShots.textContent =
        contract.shots + '/' + contract.required + ' снимок';
      const zone = zoneHint(angle);
      if (zone !== this._zoneKey) {
        this._zoneKey = zone;
        this.el.contractZone.textContent = zone;
      }
      this.el.contractZone.classList.toggle('over', overZone);
    }

    const canAct = Boolean(sat) && sat.type === 'mapper' && sat.energy >= ACTION_ENERGY_COST;
    this.el.btnAction.classList.toggle('is-disabled', !canAct);
    if (!sat) {
      this.el.actionHint.textContent = '';
    } else if (sat.type !== 'mapper') {
      this.el.actionHint.textContent = 'Пассивный аппарат';
    } else if (sat.energy < ACTION_ENERGY_COST) {
      this.el.actionHint.textContent = 'Нужна энергия';
    } else if (overZone) {
      this.el.actionHint.textContent = 'Снимок готов';
    } else {
      this.el.actionHint.textContent = 'Ручная работа';
    }

    const key = state.satellites
      .map(s => s.id + ':' + (s.selected ? 1 : 0) + ':' + Math.round(s.energy))
      .join('|');
    if (key !== this._satKey) {
      this._satKey = key;
      this.renderSatList(state);
    }

    this.el.btnBuyRelay.classList.toggle('is-disabled', state.balance < RELAY_COST);
    this.el.btnBuyRelay.textContent = state.balance >= RELAY_COST ? '$' + RELAY_COST + ' — купить' : '$' + RELAY_COST;

    if (this.el.satSheet && !this.el.satSheet.hidden && this._detailId) {
      const exists = state.satellites.some(s => s.id === this._detailId);
      if (!exists) {
        this.hideSatSheet();
      } else if (this.el.satDetail && !this.el.satDetail.hidden) {
        this.renderSatDetail(this._detailId);
      }
    }
  }

  renderSatList(state) {
    this.el.satList.innerHTML = '';
    for (const sat of state.satellites) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'sat-row' + (sat.id === state.selectedId ? ' selected' : '');
      const typeLabel = sat.type === 'mapper' ? 'картограф' : 'связь';
      const energy = Math.max(0, Math.min(100, Math.round(sat.energy)));
      row.innerHTML =
        '<span class="sat-name">' + sat.name + '<small>' + typeLabel + '</small></span>' +
        '<span class="sat-energy"><i style="width:' + energy + '%"></i></span>' +
        '<span class="sat-pct">' + energy + '%</span>';
      row.setAttribute('aria-label', 'Открыть параметры: ' + sat.name);
      row.addEventListener('click', () => {
        this.game.select(sat.id);
        this.showSatDetail(sat.id);
      });
      this.el.satList.appendChild(row);
    }
  }
}
