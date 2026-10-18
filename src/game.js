// Состояние игры и экономика. Без DOM и Three.js — чистые данные и правила.

export const ENERGY_MAX = 100;
export const ACTION_ENERGY_COST = 2;
export const CHARGE_RATE = 2;       // единиц в секунду вне тени Земли
export const DRAIN_RATE = 0;        // картограф в тени не разряжается
export const RELAY_DRAIN_RATE = 2;  // связь в тени: расход, сбалансированный с зарядом
export const CLICKS_PER_DOLLAR = 5;
export const CONTRACT_ANGLE = 0.42; // ~24 градуса

export const BALANCE = {
  firstGoal: 50,
  relayGoal: 500,
  contractRewardMin: 30,
  contractRewardMax: 50,
  contractRequired: 3,
  relayCost: 500,
  relayIncome: 0.10,
  thermalCost: 5000,
  realSatelliteCost: 150000,
};

export const RELAY_COST = BALANCE.relayCost;
export const RELAY_INCOME = BALANCE.relayIncome;

export const STORY_STAGES = {
  INTRO: 'intro',
  ACTION_HINT: 'action_hint',
  FIRST50: 'first50',
  CONTRACTS: 'contracts',
  RELAY: 'relay',
  AFTER_RELAY: 'after_relay',
};

export const EARTH_RADIUS_KM = 6371;

export const RECOMMENDED_ORBITS = {
  mapper: { altitudeKm: 550, inclinationDeg: 90, longitudeDeg: 0 },
  relay: { altitudeKm: 35786, inclinationDeg: 0, longitudeDeg: 45 },
};

// Регион для связи — это долгота подспутниковой точки на экваторе.
// Названия нужны для выбора и подсказки о зоне покрытия.
export const RELAY_REGIONS = [
  { id: 'america', name: 'Америка', longitudeDeg: -75, coverage: 'Северная и Южная Америка' },
  { id: 'atlantic', name: 'Атлантика и Африка', longitudeDeg: 15, coverage: 'Западная Африка, Атлантика' },
  { id: 'indian', name: 'Индийский океан', longitudeDeg: 45, coverage: 'Мадагаскар, Восточная Африка, Индия' },
  { id: 'asia', name: 'Азия', longitudeDeg: 105, coverage: 'Юго-Восточная Азия, Австралия' },
  { id: 'pacific', name: 'Тихий океан', longitudeDeg: 180, coverage: 'Тихий океан, Новая Зеландия' },
];

export const SATELLITE_SPECS = {
  mapper: {
    kind: 'Картограф',
    role: 'Картографирование поверхности',
    orbitLabel: 'Полярная',
    recommendedOrbit: RECOMMENDED_ORBITS.mapper,
    instrument: {
      name: 'Оптическая камера',
      kind: 'Оптическая съёмка',
      resolution: 'Низкое · ~250 м/пиксель',
      fov: '±16°',
      channels: 'Видимый диапазон',
      power: '2 энергии за снимок',
      note: 'Снимает поверхность в видимом диапазоне. Качество зависит от освещения и облачности.',
    },
    note: 'Снимает участки поверхности. Для снимка нужен пролёт над зоной контракта.',
  },
  relay: {
    kind: 'Связь',
    role: 'Связь и ретрансляция',
    orbitLabel: 'Геостационарная',
    recommendedOrbit: RECOMMENDED_ORBITS.relay,
    instrument: {
      name: 'Антенна и ретранслятор',
      kind: 'Связь',
      resolution: '—',
      fov: '—',
      channels: 'Радиоканал',
      power: '—',
      note: 'Принимает и передаёт данные между аппаратами и наземными станциями.',
    },
    note: 'Передаёт данные и приносит пассивный доход +$0.10/сек. На рекомендованной орбите 35 786 км / 0° висит над одной точкой экватора; регион выбирается при покупке. В тени расходует заряд.',
  },
};

const SAVE_KEY = 'sputnik-save-v1';

function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class Game {
  constructor() {
    this.listeners = new Set();
    this.state = this.defaultState();
    this.load();
  }

  defaultState() {
    return {
      version: 1,
      balance: 0,
      actionClicks: 0,
      incomePerSec: 0,
      satellites: [
        { id: 'mapper-1', type: 'mapper', name: 'Картограф-1', energy: 100, selected: true, orbit: { ...RECOMMENDED_ORBITS.mapper } },
      ],
      selectedId: 'mapper-1',
      contract: this.newContractData(),
      story: this.defaultStory(),
      stats: this.defaultStats(),
    };
  }

  defaultStory() {
    return {
      stage: STORY_STAGES.INTRO,
      introSeen: false,
      contractsUnlocked: false,
      relayUnlocked: false,
      relayPurchased: false,
    };
  }

  defaultStats() {
    return {
      clicks: 0,
      shots: 0,
      contracts: 0,
      totalEarned: 0,
      playSeconds: 0,
    };
  }

  newContractData(options = {}) {
    const titles = [
      'Картографирование сектора',
      'Съёмка побережья',
      'Мониторинг ледовой обстановки',
      'Обзор транспортного узла',
    ];
    const targets = [];
    for (let i = 0; i < BALANCE.contractRequired; i += 1) {
      const lat = -55 + Math.random() * 110;
      const lon = -180 + Math.random() * 360;
      targets.push({
        id: uid('target'),
        lat: Math.round(lat * 10) / 10,
        lon: Math.round(lon * 10) / 10,
        shot: false,
      });
    }
    const first = targets[0];
    return {
      id: uid('contract'),
      title: titles[Math.floor(Math.random() * titles.length)],
      lat: first.lat,
      lon: first.lon,
      targets,
      required: targets.length,
      shots: 0,
      reward: options.first
        ? 40
        : BALANCE.contractRewardMin
          + Math.floor(Math.random() * (BALANCE.contractRewardMax - BALANCE.contractRewardMin + 1)),
    };
  }

  normalizeContract(contract) {
    if (!contract) return this.newContractData();
    let targets = Array.isArray(contract.targets) ? contract.targets : [];
    targets = targets
      .filter(target => target && Number.isFinite(target.lat) && Number.isFinite(target.lon))
      .map(target => ({
        id: target.id || uid('target'),
        lat: Math.round(target.lat * 10) / 10,
        lon: Math.round(target.lon * 10) / 10,
        shot: Boolean(target.shot),
      }));

    if (targets.length === 0) {
      const baseLat = Number.isFinite(contract.lat) ? contract.lat : -20;
      const baseLon = Number.isFinite(contract.lon) ? contract.lon : 0;
      for (let i = 0; i < BALANCE.contractRequired; i += 1) {
        const lat = i === 0 ? baseLat : -55 + Math.random() * 110;
        const lon = i === 0 ? baseLon : -180 + Math.random() * 360;
        targets.push({
          id: uid('target'),
          lat: Math.round(lat * 10) / 10,
          lon: Math.round(lon * 10) / 10,
          shot: false,
        });
      }
    }

    return {
      ...contract,
      targets,
      lat: targets[0].lat,
      lon: targets[0].lon,
      required: targets.length,
      shots: targets.filter(target => target.shot).length,
    };
  }

  checkStory() {
    let changed = false;
    for (let guard = 0; guard < 4; guard += 1) {
      const story = this.state.story;
      if (story.stage === STORY_STAGES.FIRST50 && this.state.balance >= BALANCE.firstGoal) {
        story.stage = STORY_STAGES.CONTRACTS;
        story.contractsUnlocked = true;
        this.state.contract = this.newContractData({ first: true });
        changed = true;
        continue;
      }
      if (story.stage === STORY_STAGES.CONTRACTS && this.state.balance >= BALANCE.relayGoal) {
        story.stage = STORY_STAGES.RELAY;
        story.relayUnlocked = true;
        changed = true;
        continue;
      }
      break;
    }
    return changed;
  }

  advanceIntro() {
    if (this.state.story.stage !== STORY_STAGES.INTRO) return false;
    this.state.story.stage = STORY_STAGES.ACTION_HINT;
    this.state.story.introSeen = true;
    this.emit();
    this.save();
    return true;
  }

  addMoney(amount) {
    const value = Math.max(0, Number(amount) || 0);
    if (!value) return;
    this.state.balance += value;
    this.state.stats.totalEarned += value;
    this.checkStory();
    this.emit();
    this.save();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  selectedSatellite() {
    return this.state.satellites.find(s => s.id === this.state.selectedId) || null;
  }

  select(id) {
    if (!this.state.satellites.some(s => s.id === id)) return false;
    this.state.selectedId = id;
    for (const s of this.state.satellites) s.selected = s.id === id;
    this.emit();
    this.save();
    return true;
  }

  doAction(angleToContract = null, targetId = null) {
    const sat = this.selectedSatellite();
    if (!sat) return { ok: false, reason: 'Нет выбранного спутника' };
    if (sat.type !== 'mapper') return { ok: false, reason: 'Этот аппарат не ведёт съёмку' };
    if (sat.energy < ACTION_ENERGY_COST) {
      return { ok: false, reason: 'Мало энергии — дождитесь солнечной стороны' };
    }

    sat.energy = Math.max(0, sat.energy - ACTION_ENERGY_COST);
    this.state.stats.clicks += 1;
    this.state.actionClicks += 1;
    if (this.state.story.stage === STORY_STAGES.ACTION_HINT) {
      this.state.story.stage = STORY_STAGES.FIRST50;
      this.state.story.introSeen = true;
    }

    let earned = 0;
    if (this.state.actionClicks >= CLICKS_PER_DOLLAR) {
      this.state.actionClicks = 0;
      this.state.balance += 1;
      this.state.stats.totalEarned += 1;
      earned = 1;
    }

    let shot = false;
    let contractDone = false;
    let completed = null;

    const c = this.state.contract;
    const contractUnlocked = Boolean(this.state.story?.contractsUnlocked);
    const targets = c && Array.isArray(c.targets) ? c.targets : [];
    const target = targetId
      ? targets.find(item => item.id === targetId && !item.shot)
      : targets.find(item => !item.shot);
    const overZone = target !== undefined && angleToContract !== null && angleToContract <= CONTRACT_ANGLE;
    if (contractUnlocked && c && target && overZone) {
      shot = true;
      target.shot = true;
      c.shots = targets.filter(item => item.shot).length;
      c.required = targets.length;
      this.state.stats.shots += 1;
      if (c.shots >= c.required) {
        completed = { ...c, targets: c.targets.map(item => ({ ...item })) };
        this.state.balance += c.reward;
        this.state.stats.totalEarned += c.reward;
        this.state.stats.contracts += 1;
        this.state.contract = this.newContractData();
        contractDone = true;
      }
    }

    this.checkStory();
    this.emit();
    this.save();
    return {
      ok: true,
      earned,
      shot,
      contractDone,
      completed,
      reward: completed ? completed.reward : 0,
      satName: sat.name,
    };
  }

  update(dt, sunlitById = {}) {
    let changed = false;
    this.state.stats.playSeconds += dt;

    for (const sat of this.state.satellites) {
      const sunlit = sunlitById[sat.id] !== false;
      const drainRate = sat.type === 'relay' ? RELAY_DRAIN_RATE : DRAIN_RATE;
      const rate = sunlit ? CHARGE_RATE : -drainRate;
      const before = sat.energy;
      sat.energy = clamp(sat.energy + rate * dt, 0, ENERGY_MAX);
      if (Math.abs(sat.energy - before) > 0.02) changed = true;
    }

    if (this.state.incomePerSec > 0) {
      const income = this.state.incomePerSec * dt;
      this.state.balance += income;
      this.state.stats.totalEarned += income;
      changed = true;
    }

    const storyChanged = this.checkStory();
    if (changed || storyChanged) this.emit();
  }

  buyRelay() {
    if (!this.state.story.relayUnlocked) {
      return { ok: false, reason: 'Друг ещё не договорился о связи' };
    }
    if (this.state.story.relayPurchased) {
      return { ok: false, reason: 'Друг помог со связью только один раз' };
    }
    if (this.state.balance < RELAY_COST) {
      return { ok: false, reason: `Нужно $${RELAY_COST}` };
    }
    this.state.balance -= RELAY_COST;
    const count = this.state.satellites.filter(s => s.type === 'relay').length + 1;
    const sat = {
      id: uid('relay'),
      type: 'relay',
      name: 'Связь-' + count,
      energy: ENERGY_MAX,
      selected: false,
      orbit: { ...RECOMMENDED_ORBITS.relay },
    };
    this.state.satellites.push(sat);
    this.state.incomePerSec = Math.round((this.state.incomePerSec + RELAY_INCOME) * 100) / 100;
    this.state.story.relayPurchased = true;
    this.state.story.stage = STORY_STAGES.AFTER_RELAY;
    this.state.selectedId = sat.id;
    for (const s of this.state.satellites) s.selected = s.id === sat.id;
    this.emit();
    this.save();
    return { ok: true, sat };
  }

  setSatelliteOrbit(id, orbit) {
    const sat = this.state.satellites.find(s => s.id === id);
    if (!sat || !orbit) return null;
    sat.orbit = {
      altitudeKm: Math.round(clamp(Number(orbit.altitudeKm) || 0, 300, 40000)),
      inclinationDeg: Math.round(clamp(Number(orbit.inclinationDeg) || 0, 0, 180)),
      longitudeDeg: Math.round(clamp(Number(orbit.longitudeDeg) || 0, -180, 180)),
    };
    this.emit();
    this.save();
    return sat.orbit;
  }

  reset() {
    this.state = this.defaultState();
    this.save();
    this.emit();
  }

  save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      // сохранение не критично для игры
    }
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return;
      if (!Array.isArray(data.satellites) || data.satellites.length === 0) return;
      if (!data.contract) data.contract = this.newContractData();
      const hadStory = Boolean(data.story);
      this.state = Object.assign(this.defaultState(), data);
      this.state.story = Object.assign(this.defaultStory(), data.story || {});
      this.state.stats = Object.assign(this.defaultStats(), data.stats || {});
      this.state.contract = this.normalizeContract(this.state.contract);
      if (!hadStory) {
        this.state.story.stage = STORY_STAGES.FIRST50;
      }
      if (!this.state.satellites.some(s => s.id === this.state.selectedId)) {
        this.state.selectedId = this.state.satellites[0].id;
      }
      for (const s of this.state.satellites) {
        s.selected = s.id === this.state.selectedId;
        if (!s.orbit) {
          s.orbit = { ...(RECOMMENDED_ORBITS[s.type] || RECOMMENDED_ORBITS.mapper) };
        } else if (!Number.isFinite(s.orbit.longitudeDeg)) {
          s.orbit.longitudeDeg = (RECOMMENDED_ORBITS[s.type] || RECOMMENDED_ORBITS.mapper).longitudeDeg;
        }
      }

      const hasRelay = this.state.satellites.some(s => s.type === 'relay');
      if (!this.state.story.introSeen
          && !hasRelay
          && this.state.story.stage === STORY_STAGES.FIRST50
          && this.state.balance < BALANCE.firstGoal
          && this.state.stats.contracts === 0) {
        // Один раз показываем вступление в старых сохранениях.
        this.state.story.stage = STORY_STAGES.INTRO;
      } else if (this.state.story.stage !== STORY_STAGES.INTRO
          && this.state.story.stage !== STORY_STAGES.ACTION_HINT) {
        this.state.story.introSeen = true;
      }

      if (hasRelay) {
        this.state.story.contractsUnlocked = true;
        this.state.story.relayUnlocked = true;
        this.state.story.relayPurchased = true;
        this.state.story.stage = STORY_STAGES.AFTER_RELAY;
      } else if (this.state.story.stage === STORY_STAGES.AFTER_RELAY) {
        this.state.story.stage = STORY_STAGES.CONTRACTS;
        this.state.story.contractsUnlocked = true;
      } else if (!hadStory && this.state.stats.contracts > 0) {
        this.state.story.stage = STORY_STAGES.CONTRACTS;
        this.state.story.contractsUnlocked = true;
        this.state.contract = this.newContractData({ first: true });
      }

      this.checkStory();
    } catch (e) {
      // битое сохранение — начинаем заново
    }
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}
