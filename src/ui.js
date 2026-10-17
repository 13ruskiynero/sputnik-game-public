import { ACTION_ENERGY_COST, CLICKS_PER_DOLLAR, CONTRACT_ANGLE, RELAY_COST } from './game.js';

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
  return 'вращайте Землю';
}

export class UI {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this._satKey = '';
    this._zoneKey = '';

    const $ = id => document.getElementById(id);
    this.el = {
      balance: $('balance'),
      income: $('income'),
      actionFill: $('action-fill'),
      contractTitle: $('contract-title'),
      contractReward: $('contract-reward'),
      contractShots: $('contract-shots'),
      contractZone: $('contract-zone'),
      contractCard: $('contract-card'),
      btnSatellites: $('btn-satellites'),
      btnShop: $('btn-shop'),
      btnMenu: $('btn-menu'),
      btnAction: $('btn-action'),
      actionHint: $('action-hint'),
      btnBuyRelay: $('btn-buy-relay'),
      btnReset: $('btn-reset'),
      satList: $('sat-list'),
      toasts: $('toasts'),
      panels: Array.from(document.querySelectorAll('.panel')),
    };

    this.bind();
  }

  bind() {
    this.el.btnSatellites.addEventListener('click', () => this.togglePanel('panel-satellites'));
    this.el.btnShop.addEventListener('click', () => this.togglePanel('panel-shop'));
    this.el.btnMenu.addEventListener('click', () => this.togglePanel('panel-menu'));
    this.el.btnAction.addEventListener('click', () => this.onAction());
    this.el.btnBuyRelay.addEventListener('click', () => this.onBuyRelay());
    this.el.btnReset.addEventListener('click', () => {
      this.game.reset();
      this.closePanels();
      this.toast('Прогресс сброшен', 'warn');
    });
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.panel');
        if (panel) panel.classList.remove('open');
      });
    });
  }

  togglePanel(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const willOpen = !target.classList.contains('open');
    for (const panel of this.el.panels) panel.classList.remove('open');
    if (willOpen) target.classList.add('open');
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
    if (result.shot) this.toast('Снимок сделан', 'ok');
    if (result.earned) this.toast('+$1 за ручную работу', 'money');
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
      row.addEventListener('click', () => {
        this.game.select(sat.id);
        this.closePanels();
      });
      this.el.satList.appendChild(row);
    }
  }
}
