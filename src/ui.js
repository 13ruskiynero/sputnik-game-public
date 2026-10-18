import { ACTION_ENERGY_COST, BALANCE, CLICKS_PER_DOLLAR, CONTRACT_ANGLE, EARTH_RADIUS_KM, RELAY_COST, RELAY_INCOME, SATELLITE_SPECS, RELAY_REGIONS, STORY_STAGES } from './game.js';

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
    longitudeDeg: 0,
  };
  const orbit = sat.orbit || recommended;
  return {
    altitudeKm: Number.isFinite(orbit.altitudeKm) ? orbit.altitudeKm : recommended.altitudeKm,
    inclinationDeg: Number.isFinite(orbit.inclinationDeg) ? orbit.inclinationDeg : recommended.inclinationDeg,
    longitudeDeg: Number.isFinite(orbit.longitudeDeg) ? orbit.longitudeDeg : (recommended.longitudeDeg || 0),
  };
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

function storyTextFor(stage) {
  if (stage === STORY_STAGES.INTRO) {
    return 'Привет! Поздравляю, теперь ты владеешь настоящим спутником, способным делать фотографии поверхности Земли. Это уже немало. Об обслуживании пока не беспокойся, сначала разберись, как делать хорошие фотоснимки.';
  }
  if (stage === STORY_STAGES.ACTION_HINT) {
    return 'Делай фотки с помощью этой кнопки «Действие» — она подсвечивается и пульсирует, пока позволяет заряд батареи твоего спутника. Батарея будет подзаряжаться, пока спутник находится на свету Солнца.';
  }
  if (stage === STORY_STAGES.FIRST50) {
    return 'Делай снимки — в среднем за 5 снимков будешь получать по $1. Наделай снимков на $50, и потом посмотрим, найдутся ли заказчики для твоей работы.';
  }
  if (stage === STORY_STAGES.CONTRACTS) {
    return 'Контракты открыты. Накопи $500 — я найду для нас старый спутник связи.';
  }
  if (stage === STORY_STAGES.RELAY) {
    return 'Связь уже в магазине за $500. Купи её и выбери регион, где она будет работать.';
  }
  if (stage === STORY_STAGES.AFTER_RELAY) {
    return 'Отлично, связь на месте. Скоро попрошу тебя сделать несколько снимков.';
  }
  return 'Накопи $50 ручной работой — потом я договорюсь о первых заказах.';
}

function formatLongitude(deg) {
  let value = Math.round(Number(deg) || 0);
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  if (value === 0) return '0°';
  if (Math.abs(value) === 180) return '180°';
  return Math.abs(value) + '° ' + (value > 0 ? 'в.д.' : 'з.д.');
}

function orbitLabelFor(orbit) {
  const inclination = Math.abs(orbit.inclinationDeg);
  if (inclination >= 80) return 'Полярная';
  if (Math.abs(orbit.altitudeKm - GEO_ALTITUDE_KM) <= 50) {
    return inclination <= 0.5 ? 'Геостационарная' : 'Геосинхронная';
  }
  if (inclination <= 5) {
    return orbit.altitudeKm >= 30000 ? 'Высокая экваториальная' : 'Экваториальная';
  }
  return 'Наклонная';
}

const EARTH_MU = 398600.4418;
const GEO_ALTITUDE_KM = 35786;

function orbitalNumbers(altitudeKm) {
  const radius = EARTH_RADIUS_KM + altitudeKm;
  const periodSec = 2 * Math.PI * Math.sqrt(Math.pow(radius, 3) / EARTH_MU);
  const speedKmS = Math.sqrt(EARTH_MU / radius);
  return {
    periodSec,
    speedKmS,
    orbitsPerDay: 86400 / periodSec,
  };
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
    this._periodUnit = 'game';
    this._speedUnit = 'game';
    this._storyStage = null;
    this._storyOpen = false;
    this._storyUnread = true;
    this._suppressDevToggleClick = false;
    this._keepDevPanelInside = null;

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
      storyWidget: $('story-widget'),
      storyCard: $('story-card'),
      storyCollapsed: $('story-collapsed'),
      storyBadge: $('story-badge'),
      btnStoryClose: $('btn-story-close'),
      storyText: $('story-text'),
      btnStoryNext: $('btn-story-next'),
      storyProgress: $('story-progress'),
      storyTag: $('story-tag'),
      storyGoal: $('story-goal'),
      storyProgressFill: $('story-progress-fill'),
      storyMetrics: $('story-metrics'),
      relayCardDesc: $('relay-card-desc'),
      shopRealCard: $('shop-real-card'),
      shopThermalCard: $('shop-thermal-card'),
      devToggle: $('dev-toggle'),
      devMoney50: $('dev-money-50'),
      devMoney500: $('dev-money-500'),
      devReset: $('dev-reset'),
      satSheet: $('sat-sheet'),
      satSheetHandle: $('sat-sheet-handle'),
      satCompact: $('sat-compact'),
      btnSatNext: $('btn-sat-next'),
      btnSatExpand: $('btn-sat-expand'),
      btnSatCompactClose: $('btn-sat-compact-close'),
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
      orbitRegionBlock: $('orbit-region-block'),
      orbitRegionValue: $('orbit-region-value'),
      orbitRegionChips: $('orbit-region-chips'),
      orbitRegionCoverage: $('orbit-region-coverage'),
      orbitLongitudeControl: $('orbit-longitude-control'),
      orbitLongitude: $('orbit-longitude'),
      orbitLongitudeValue: $('orbit-longitude-value'),
      orbitLongitudeRecommended: $('orbit-longitude-recommended'),
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
      satDetailAltitude: $('sat-detail-altitude'),
      satDetailPeriod: $('sat-detail-period'),
      satDetailSpeed: $('sat-detail-speed'),
      btnPeriodUnit: $('btn-period-unit'),
      btnSpeedUnit: $('btn-speed-unit'),
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
    if (this.el.btnSatCompactClose) this.el.btnSatCompactClose.addEventListener('click', () => this.hideSatSheet());
    if (this.el.btnSatNext) this.el.btnSatNext.addEventListener('click', () => this.nextSatellite());
    if (this.el.btnSatExpand) this.el.btnSatExpand.addEventListener('click', () => this.expandSatSheet());
    this.bindSatSheetHandle();
    if (this.el.btnSatInstrument) this.el.btnSatInstrument.addEventListener('click', () => this.showInstrument());
    if (this.el.btnInstrumentBack) this.el.btnInstrumentBack.addEventListener('click', () => this.showSatelliteView());
    if (this.el.btnPeriodUnit) {
      this.el.btnPeriodUnit.addEventListener('click', () => {
        this._periodUnit = this._periodUnit === 'game' ? 'earth' : 'game';
        if (this._detailId) this.renderSatDetail(this._detailId);
      });
    }
    if (this.el.btnSpeedUnit) {
      this.el.btnSpeedUnit.addEventListener('click', () => {
        this._speedUnit = this._speedUnit === 'game' ? 'earth' : 'game';
        if (this._detailId) this.renderSatDetail(this._detailId);
      });
    }
    if (this.el.btnOrbitBack) this.el.btnOrbitBack.addEventListener('click', () => this.cancelOrbitEdit());
    if (this.el.btnOrbitCancel) this.el.btnOrbitCancel.addEventListener('click', () => this.cancelOrbitEdit());
    if (this.el.btnOrbitRecommended) this.el.btnOrbitRecommended.addEventListener('click', () => this.resetOrbitToRecommended());
    if (this.el.btnOrbitApply) this.el.btnOrbitApply.addEventListener('click', () => this.applyOrbitEdit());
    if (this.el.orbitAltitude) this.el.orbitAltitude.addEventListener('input', () => this.onOrbitInput());
    if (this.el.orbitInclination) this.el.orbitInclination.addEventListener('input', () => this.onOrbitInput());
    if (this.el.orbitLongitude) this.el.orbitLongitude.addEventListener('input', () => this.onOrbitInput());
    if (this.el.storyCollapsed) {
      this.el.storyCollapsed.addEventListener('click', () => this.openStory());
    }
    if (this.el.btnStoryClose) {
      this.el.btnStoryClose.addEventListener('click', () => this.closeStory());
    }
    if (this.el.btnStoryNext) {
      this.el.btnStoryNext.addEventListener('click', () => this.game.advanceIntro());
    }
    this.el.btnTasks.addEventListener('click', () => this.toggleContractCard());
    this.el.btnCloseContract.addEventListener('click', () => this.closeContractCard());
    this.el.btnShop.addEventListener('click', () => this.togglePanel('panel-shop'));
    this.el.btnMenu.addEventListener('click', () => this.togglePanel('panel-menu'));
    this.el.btnAction.addEventListener('click', () => this.onAction());
    this.el.btnBuyRelay.addEventListener('click', () => this.onBuyRelay());
    this.el.btnReset.addEventListener('click', () => this.resetProgress());
    if (this.el.devReset) {
      this.el.devReset.addEventListener('click', () => this.resetProgress());
    }
    if (this.el.devToggle) {
      this.el.devToggle.addEventListener('click', () => {
        if (this._suppressDevToggleClick) {
          this._suppressDevToggleClick = false;
          return;
        }
        this.toggleDevPanel();
      });
    }
    if (this.el.devMoney50) {
      this.el.devMoney50.addEventListener('click', () => this.devAddMoney(50));
    }
    if (this.el.devMoney500) {
      this.el.devMoney500.addEventListener('click', () => this.devAddMoney(500));
    }
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
    window.addEventListener('resize', () => this.updateStoryWidgetPosition());

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.panel');
        if (panel) panel.classList.remove('open');
      });
    });
  }

  devAddMoney(amount) {
    this.game.addMoney(amount);
    this.toast('DEV: +$' + amount, 'money');
  }

  toggleDevPanel() {
    if (!this.el.devPanel) return;
    const collapsed = this.el.devPanel.classList.toggle('collapsed');
    this.el.devToggle.setAttribute('aria-expanded', String(!collapsed));
    this.el.devToggle.title = collapsed ? 'Открыть dev-панель' : 'Свернуть dev-панель';
    this.el.devToggle.setAttribute('aria-label', this.el.devToggle.title);
    if (this._keepDevPanelInside) {
      requestAnimationFrame(() => this._keepDevPanelInside());
    }
  }

  openStory() {
    this._storyOpen = true;
    this._storyUnread = false;
    this.updateStoryVisibility();
  }

  closeStory() {
    this._storyOpen = false;
    this._storyUnread = false;
    this.updateStoryVisibility();
  }

  updateStoryVisibility() {
    if (this.el.storyCollapsed) {
      this.el.storyCollapsed.hidden = this._storyOpen;
      this.el.storyCollapsed.setAttribute('aria-expanded', String(this._storyOpen));
    }
    if (this.el.storyCard) this.el.storyCard.hidden = !this._storyOpen;
    if (this.el.storyBadge) {
      this.el.storyBadge.hidden = !this._storyUnread || this._storyOpen;
    }
  }

  resetProgress() {
    this._storyOpen = false;
    this._storyUnread = true;
    this._storyStage = null;
    this._suppressDevToggleClick = false;
    this._keepDevPanelInside = null;
    this.game.reset();
    this.time.scale = 1;
    this.time.paused = false;
    this.hideSatSheet();
    this.closePanels();
    this.updateDevButtons();
    this.updateStoryVisibility();
    this.toast('Прогресс сброшен', 'warn');
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
    this._keepDevPanelInside = keepInside;

    panel.addEventListener('pointerdown', e => {
      const isToggle = Boolean(e.target.closest('#dev-toggle'));
      if (!isToggle && e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
        startToggle: isToggle,
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

    const end = (e, cancelled = false) => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      const wasToggle = drag.startToggle;
      const moved = drag.moved;
      drag = null;
      panel.classList.remove('dragging');
      if (!cancelled && wasToggle) {
        this._suppressDevToggleClick = true;
        if (!moved) this.toggleDevPanel();
        setTimeout(() => {
          this._suppressDevToggleClick = false;
        }, 250);
      }
    };

    panel.addEventListener('pointerup', e => end(e, false));
    panel.addEventListener('pointercancel', e => end(e, true));
    window.addEventListener('pointerup', e => end(e, false));
    window.addEventListener('pointercancel', e => end(e, true));
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
    if (this.el.satSheet) {
      this.el.satSheet.classList.remove('orbit-mode');
      this.el.satSheet.classList.remove('focus-mode');
      this.el.satSheet.classList.remove('collapsed');
    }
    if (this.el.satCompact) this.el.satCompact.hidden = true;
    this.world.focusEarth();
  }

  bindSatSheetHandle() {
    const handle = this.el.satSheetHandle;
    if (!handle) return;
    let startY = null;
    let moved = false;
    let pointerId = null;

    const down = e => {
      if (e.button !== undefined && e.button !== 0) return;
      startY = e.clientY;
      moved = false;
      pointerId = e.pointerId;
      handle.classList.add('dragging');
      if (handle.setPointerCapture) {
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (err) {
          // Синтетические события в тестах не имеют активного указателя.
        }
      }
      e.preventDefault();
    };

    const move = e => {
      if (startY === null || (pointerId !== null && e.pointerId !== pointerId)) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 6) moved = true;
      if (dy > 32) {
        this.collapseSatSheet();
        startY = null;
      } else if (dy < -32) {
        this.expandSatSheet();
        startY = null;
      }
      e.preventDefault();
    };

    const end = e => {
      if (startY === null) return;
      if (!moved) this.toggleSatSheet();
      startY = null;
      pointerId = null;
      handle.classList.remove('dragging');
      e.preventDefault();
    };

    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleSatSheet();
      }
    });
  }

  toggleSatSheet() {
    if (!this.el.satSheet) return;
    if (this.el.satSheet.classList.contains('collapsed')) {
      this.expandSatSheet();
    } else {
      this.collapseSatSheet();
    }
  }

  collapseSatSheet() {
    if (!this.el.satSheet || this.el.satSheet.hidden) return;
    this.el.satSheet.classList.add('collapsed');
    if (this.el.satCompact) this.el.satCompact.hidden = false;
    this.el.satSheet.scrollTop = 0;
  }

  expandSatSheet() {
    if (!this.el.satSheet) return;
    this.el.satSheet.classList.remove('collapsed');
    if (this.el.satCompact) this.el.satCompact.hidden = true;
  }

  nextSatellite() {
    const satellites = this.game.state.satellites;
    if (!satellites.length) return;
    const current = this._detailId || this.game.state.selectedId;
    const index = satellites.findIndex(sat => sat.id === current);
    const next = satellites[(index + 1) % satellites.length];

    this._detailId = next.id;
    if (this.el.satSheet) {
      this.el.satSheet.hidden = false;
      this.el.satSheet.classList.remove('orbit-mode');
      this.el.satSheet.classList.add('focus-mode');
      this.el.satSheet.classList.add('collapsed');
    }
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satCompact) this.el.satCompact.hidden = false;

    this.game.select(next.id);
    this.renderSatDetail(next.id);
    this.world.focusSatellite(next.id);
  }

  backToSatList() {
    this.hideSatSheet();
    this.togglePanel('panel-satellites');
  }

  showSatDetail(id, options = {}) {
    const sat = this.game.state.satellites.find(s => s.id === id);
    if (!sat || !this.el.satSheet) return;
    this.closePanels();
    this._detailId = id;
    if (this.el.satDetail) this.el.satDetail.hidden = false;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    if (this.el.orbitEditor) this.el.orbitEditor.hidden = true;
    if (this.el.satSheet) {
      this.el.satSheet.classList.remove('orbit-mode');
      this.el.satSheet.classList.toggle('focus-mode', options.focus !== false);
      this.el.satSheet.classList.remove('collapsed');
    }
    if (this.el.satCompact) this.el.satCompact.hidden = true;
    this.el.satSheet.hidden = false;
    this.renderSatDetail(id);
    if (options.focus !== false) this.world.focusSatellite(id);
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
    const energy = Math.round(Math.max(0, Math.min(100, sat.energy)));
    const altitudeKm = orbit.altitudeKm;
    const inclination = Math.abs(orbit.inclinationDeg).toFixed(0) + '°';
    const orbitLabel = orbitLabelFor(orbit);
    const real = orbitalNumbers(altitudeKm);
    const instrument = spec.instrument || {};
    const gameSpeed = Number.isFinite(info.speed) && Number.isFinite(info.radius)
      ? info.speed * info.radius
      : null;
    const periodText = this._periodUnit === 'earth'
      ? real.orbitsPerDay.toFixed(2) + ' оборотов/сут'
      : (Number.isFinite(info.periodSec) ? info.periodSec.toFixed(1) : '—') + ' с/оборот';
    const speedText = this._speedUnit === 'earth'
      ? Math.round(real.speedKmS * 3600).toLocaleString('ru-RU') + ' км/ч'
      : (gameSpeed != null ? gameSpeed.toFixed(2) : '—') + ' ед/с';

    this.el.satDetailName.textContent = sat.name;
    this.el.satDetailSubtitle.textContent = spec.kind || '—';
    this.el.satDetailEnergy.textContent = energy + '%';
    this.el.satDetailEnergyFill.style.width = energy + '%';
    this.el.satDetailEnergyFill.classList.toggle('low', energy < 20);
    this.el.satDetailWork.textContent = spec.role || '—';
    this.el.satDetailInstrument.textContent = instrument.name || '—';
    const orbitParts = [orbitLabel, inclination].filter(Boolean);
    if (Math.abs(altitudeKm - GEO_ALTITUDE_KM) <= 50) {
      orbitParts.push(formatLongitude(orbit.longitudeDeg));
    }
    this.el.satDetailOrbit.textContent = orbitParts.join(' · ');
    this.el.satDetailAltitude.textContent =
      altitudeKm.toLocaleString('ru-RU') + ' км над поверхностью';
    this.el.satDetailPeriod.textContent = periodText;
    this.el.satDetailSpeed.textContent = speedText;
    this.el.satDetailNote.textContent = spec.note || '';
    if (this.el.btnPeriodUnit) {
      this.el.btnPeriodUnit.title = this._periodUnit === 'earth'
        ? 'Показать игровой период'
        : 'Показать земной период';
    }
    if (this.el.btnSpeedUnit) {
      this.el.btnSpeedUnit.title = this._speedUnit === 'earth'
        ? 'Показать игровую скорость'
        : 'Показать земную скорость';
    }
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
    const isRelay = sat.type === 'relay';
    this._orbitEdit = {
      id: sat.id,
      regionId: null,
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
    if (this.el.orbitRegionBlock) this.el.orbitRegionBlock.hidden = !isRelay;
    if (this.el.orbitLongitudeControl) this.el.orbitLongitudeControl.hidden = !isRelay;
    if (this.el.orbitLongitudeRecommended) {
      this.el.orbitLongitudeRecommended.textContent = formatLongitude(recommended.longitudeDeg);
    }
    this.renderOrbitRegions();
    this.setOrbitControls(original);
    if (this.el.satDetail) this.el.satDetail.hidden = true;
    if (this.el.instrumentDetail) this.el.instrumentDetail.hidden = true;
    this.el.orbitEditor.hidden = false;
    this.el.satSheet.hidden = false;
    if (this.el.satSheet) this.el.satSheet.classList.add('orbit-mode');
    this.world.zoomToOrbit(this.world.getVisualRadius(recommended.altitudeKm));
  }

  renderOrbitRegions() {
    if (!this.el.orbitRegionChips) return;
    this.el.orbitRegionChips.innerHTML = '';
    const sat = this.game.state.satellites.find(s => s.id === this._orbitEdit?.id);
    if (!sat || sat.type !== 'relay') return;
    for (const region of RELAY_REGIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'region-chip';
      button.dataset.regionId = region.id;
      button.textContent = region.name;
      button.title = 'Покрытие: ' + region.coverage;
      button.addEventListener('click', () => this.selectOrbitRegion(region.id));
      this.el.orbitRegionChips.appendChild(button);
    }
  }

  selectOrbitRegion(regionId) {
    const edit = this._orbitEdit;
    const region = RELAY_REGIONS.find(r => r.id === regionId);
    if (!edit || !region) return;
    edit.regionId = region.id;
    edit.draft = {
      altitudeKm: edit.recommended.altitudeKm,
      inclinationDeg: edit.recommended.inclinationDeg,
      longitudeDeg: region.longitudeDeg,
    };
    this.setOrbitControls(edit.draft);
    this.world.updateSatelliteOrbit(edit.id, edit.draft);
    this.world.zoomToOrbit(this.world.getVisualRadius(edit.draft.altitudeKm));
  }

  setOrbitControls(orbit) {
    if (!this.el.orbitAltitude || !this.el.orbitInclination) return;
    this.el.orbitAltitude.value = String(orbit.altitudeKm);
    this.el.orbitInclination.value = String(orbit.inclinationDeg);
    if (this.el.orbitLongitude && Number.isFinite(orbit.longitudeDeg)) {
      this.el.orbitLongitude.value = String(orbit.longitudeDeg);
    }
    this.updateOrbitLabels();
  }

  updateOrbitLabels() {
    if (!this.el.orbitAltitude || !this.el.orbitInclination) return;
    const altitudeKm = Number(this.el.orbitAltitude.value);
    const inclinationDeg = Number(this.el.orbitInclination.value);
    const longitudeDeg = this.el.orbitLongitude ? Number(this.el.orbitLongitude.value) : 0;
    this.el.orbitAltitudeValue.textContent = altitudeKm.toLocaleString('ru-RU') + ' км';
    this.el.orbitInclinationValue.textContent = inclinationDeg + '°';
    if (this.el.orbitLongitudeValue) {
      this.el.orbitLongitudeValue.textContent = formatLongitude(longitudeDeg);
    }
    const sat = this.game.state.satellites.find(s => s.id === this._orbitEdit?.id);
    this.el.orbitSubtitle.textContent = sat ? sat.name : '';
    this.updateOrbitRegions();
  }

  updateOrbitRegions() {
    const edit = this._orbitEdit;
    if (!edit || !this.el.orbitRegionChips) return;
    let active = null;
    if (this.el.orbitRegionBlock && !this.el.orbitRegionBlock.hidden) {
      const altitude = Number(this.el.orbitAltitude.value);
      const inclination = Number(this.el.orbitInclination.value);
      const longitude = this.el.orbitLongitude ? Number(this.el.orbitLongitude.value) : 0;
      active = RELAY_REGIONS.find(region => (
        Math.abs(region.longitudeDeg - longitude) <= 0.5
        && Math.abs(altitude - edit.recommended.altitudeKm) <= 1
        && Math.abs(inclination - edit.recommended.inclinationDeg) <= 0.5
      )) || null;
    }
    edit.regionId = active ? active.id : null;
    if (this.el.orbitRegionValue) {
      this.el.orbitRegionValue.textContent = active ? active.name : 'Вручную';
    }
    if (this.el.orbitRegionCoverage) {
      this.el.orbitRegionCoverage.textContent = active
        ? 'Покрытие: ' + active.coverage
        : 'Свободная долгота: выберите регион или настройте ползунки';
    }
    if (active && this.el.orbitLongitudeRecommended) {
      this.el.orbitLongitudeRecommended.textContent = formatLongitude(active.longitudeDeg);
    }
    this.el.orbitRegionChips.querySelectorAll('[data-region-id]').forEach(button => {
      button.classList.toggle('active', Boolean(active) && button.dataset.regionId === active.id);
    });
  }

  onOrbitInput() {
    const edit = this._orbitEdit;
    if (!edit || !this.el.orbitAltitude) return;
    let altitudeKm = Number(this.el.orbitAltitude.value);
    let inclinationDeg = Number(this.el.orbitInclination.value);
    const longitudeDeg = this.el.orbitLongitude ? Number(this.el.orbitLongitude.value) : 0;

    const snapAltitude = Math.max(50, edit.recommended.altitudeKm * 0.02);
    if (Math.abs(altitudeKm - edit.recommended.altitudeKm) <= snapAltitude) {
      altitudeKm = edit.recommended.altitudeKm;
      this.el.orbitAltitude.value = String(altitudeKm);
    }
    if (Math.abs(inclinationDeg - edit.recommended.inclinationDeg) <= 3) {
      inclinationDeg = edit.recommended.inclinationDeg;
      this.el.orbitInclination.value = String(inclinationDeg);
    }

    edit.draft = { altitudeKm, inclinationDeg, longitudeDeg };
    this.updateOrbitLabels();
    this.world.updateSatelliteOrbit(edit.id, edit.draft);
    this.world.zoomToOrbit(this.world.getVisualRadius(altitudeKm));
  }

  resetOrbitToRecommended() {
    const edit = this._orbitEdit;
    if (!edit) return;
    const region = edit.regionId ? RELAY_REGIONS.find(r => r.id === edit.regionId) : null;
    edit.draft = {
      ...edit.recommended,
      longitudeDeg: region ? region.longitudeDeg : edit.draft.longitudeDeg,
    };
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

  toggleContractCard() {
    this.el.contractCard.classList.toggle('open');
    this.updateStoryWidgetPosition();
  }

  closeContractCard() {
    this.el.contractCard.classList.remove('open');
    this.updateStoryWidgetPosition();
  }

  updateStoryWidgetPosition() {
    if (!this.el.storyWidget || !this.el.contractCard) return;
    if (this.el.contractCard.classList.contains('open')) {
      const rect = this.el.contractCard.getBoundingClientRect();
      this.el.storyWidget.style.top = Math.max(0, Math.round(rect.bottom + 8)) + 'px';
    } else {
      this.el.storyWidget.style.top = '';
    }
  }

  onAction() {
    const sat = this.game.selectedSatellite();
    const target = sat ? this.nextContractTarget(sat.id) : null;
    const result = this.game.doAction(target ? target.angle : null, target ? target.id : null);

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
    this.toast('Куплен ' + result.sat.name + ': +$' + RELAY_INCOME.toFixed(2) + '/сек', 'ok');
    this.closePanels();
    this.showSatDetail(result.sat.id, { focus: false });
    this.openOrbitEditor();
  }

  pulseAction() {
    this.el.btnAction.classList.remove('pulse');
    void this.el.btnAction.offsetWidth;
    this.el.btnAction.classList.add('pulse');
    setTimeout(() => this.el.btnAction.classList.remove('pulse'), 260);
  }

  nextContractTarget(satId) {
    const targets = this.world.getContractAngles(satId) || [];
    return targets
      .filter(target => !target.shot)
      .sort((a, b) => a.angle - b.angle)[0] || null;
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

  renderStory(state) {
    if (!this.el.storyText) return;
    const story = state.story || {};
    const stage = story.stage || STORY_STAGES.INTRO;
    const stats = state.stats || {};
    let goal = 'Знакомство';
    let progress = 0;
    let showProgress = false;
    let showNext = false;

    if (stage === STORY_STAGES.INTRO) {
      goal = 'Знакомство';
      showNext = true;
    } else if (stage === STORY_STAGES.ACTION_HINT) {
      goal = 'Нажми «Действие»';
    } else if (stage === STORY_STAGES.FIRST50) {
      goal = 'Цель: $' + BALANCE.firstGoal;
      progress = Math.min(100, (state.balance / BALANCE.firstGoal) * 100);
      showProgress = true;
    } else if (stage === STORY_STAGES.CONTRACTS) {
      goal = 'Цель: $' + BALANCE.relayGoal;
      progress = Math.min(100, (state.balance / BALANCE.relayGoal) * 100);
      showProgress = true;
    } else if (stage === STORY_STAGES.RELAY) {
      goal = 'Купить связь за $' + RELAY_COST;
      progress = story.relayUnlocked ? 100 : Math.min(100, (state.balance / RELAY_COST) * 100);
      showProgress = true;
    } else if (stage === STORY_STAGES.AFTER_RELAY) {
      goal = 'Связь выведена';
      progress = 100;
      showProgress = true;
    }

    this.el.storyText.textContent = storyTextFor(stage);
    this.el.storyTag.textContent = stage === STORY_STAGES.AFTER_RELAY ? 'Готово' : 'На связи';
    this.el.storyGoal.textContent = goal;
    this.el.storyProgressFill.style.width = progress + '%';
    if (this.el.btnStoryNext) this.el.btnStoryNext.hidden = !showNext;
    if (this.el.storyProgress) this.el.storyProgress.hidden = !showProgress;
    if (this.el.storyMetrics) {
      const earned = Number.isFinite(stats.totalEarned) ? stats.totalEarned : 0;
      const seconds = Number.isFinite(stats.playSeconds) ? stats.playSeconds : 0;
      this.el.storyMetrics.textContent = 'Заработано ' + formatMoney(earned) + ' · ' + formatTime(seconds);
    }

    const sat = state.satellites.find(s => s.id === state.selectedId) || state.satellites[0] || null;
    const hintPulse = stage === STORY_STAGES.ACTION_HINT
      && sat && sat.type === 'mapper'
      && sat.energy >= ACTION_ENERGY_COST;
    this.el.btnAction.classList.toggle('hint-pulse', Boolean(hintPulse));

    if (stage === STORY_STAGES.INTRO && this._storyStage !== STORY_STAGES.INTRO) {
      this.openStory();
    } else if (stage === STORY_STAGES.ACTION_HINT && this._storyStage !== STORY_STAGES.ACTION_HINT) {
      this.openStory();
    } else if (this._storyStage === STORY_STAGES.ACTION_HINT && stage === STORY_STAGES.FIRST50) {
      this.openStory();
    }

    if (this._storyStage && this._storyStage !== stage) {
      if (!this._storyOpen) this._storyUnread = true;
      if (stage === STORY_STAGES.CONTRACTS) this.toast('Друг: контракты открыты', 'ok');
      if (stage === STORY_STAGES.RELAY) this.toast('Друг: связь доступна за $500', 'money');
      if (stage === STORY_STAGES.AFTER_RELAY) this.toast('Друг: связь выведена', 'ok');
    }
    this._storyStage = stage;
    this.updateStoryVisibility();
  }

  renderShop(state) {
    const story = state.story || {};
    const unlocked = Boolean(story.relayUnlocked);
    const purchased = Boolean(story.relayPurchased);
    const contractsUnlocked = Boolean(story.contractsUnlocked);

    if (this.el.btnTasks) {
      this.el.btnTasks.hidden = !contractsUnlocked;
    }
    if (!contractsUnlocked) {
      this.el.contractCard.classList.remove('open');
      this.updateStoryWidgetPosition();
    }
    if (this.el.shopRealCard) this.el.shopRealCard.hidden = !purchased;
    if (this.el.shopThermalCard) this.el.shopThermalCard.hidden = !purchased;

    let desc = 'Друг обещал помочь с выводом после $500.';
    let label = 'Закрыто';
    let disabled = true;
    if (unlocked && purchased) {
      desc = 'Старая связь уже выведена. Друг помог только один раз.';
      label = 'Куплен';
    } else if (unlocked) {
      desc = 'Пассивный доход +$' + RELAY_INCOME.toFixed(2) + '/сек. Выбери регион GEO.';
      disabled = state.balance < RELAY_COST;
      label = disabled ? '$' + RELAY_COST : '$' + RELAY_COST + ' — купить';
    } else if (state.balance >= BALANCE.relayGoal) {
      desc = 'Друг ещё не вышел на связь.';
    }

    if (this.el.relayCardDesc) this.el.relayCardDesc.textContent = desc;
    this.el.btnBuyRelay.classList.toggle('is-disabled', disabled);
    this.el.btnBuyRelay.textContent = label;
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
    const nextTarget = sat ? this.nextContractTarget(sat.id) : null;
    const angle = nextTarget ? nextTarget.angle : null;
    const overZone = angle !== null && angle <= CONTRACT_ANGLE;

    const contract = state.contract;
    if (contract) {
      this.el.contractTitle.textContent = contract.title;
      this.el.contractReward.textContent = '$' + contract.reward;
      this.el.contractShots.textContent =
        contract.shots + '/' + contract.required + ' снимка';
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

    this.renderStory(state);
    this.renderShop(state);

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
