// ships.js
// Core system for registering ship types and spawning instances
(function(global){
  const REG = {
    types: new Map(), // typeName -> profile
    handles: [], // array of { state, profile }
    // Unique ID tracking
    usedIDs: new Set(),
    retiredIDs: new Set(),
    nextFriendlyId: 0,
    nextEnemyId: 0,
  };

  function deepClone(obj){ try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }

  function ensureArrays(){
    global.ShipCounters = global.ShipCounters || { enemy: {}, friendly: {} };
    // Canonical fleets
    global.Fleet1 = Array.isArray(global.Fleet1) ? global.Fleet1 : [];
    global.Fleet2 = Array.isArray(global.Fleet2) ? global.Fleet2 : [];
    global.Fleet3 = Array.isArray(global.Fleet3) ? global.Fleet3 : [];
    global.EnemyFleet1 = Array.isArray(global.EnemyFleet1) ? global.EnemyFleet1 : [];
    global.EnemyFleet2 = Array.isArray(global.EnemyFleet2) ? global.EnemyFleet2 : [];
    global.EnemyFleet3 = Array.isArray(global.EnemyFleet3) ? global.EnemyFleet3 : [];
  }

  function pushHandle(side, handle){
    // Push into proper top-level fleet by side (default Fleet1 / EnemyFleet1)
    ensureArrays();
    if (side === 'enemy') {
      try { global.EnemyFleet1.push(handle); } catch {}
    } else {
      try { global.Fleet1.push(handle); } catch {}
    }
  }

  function registerType(typeName, profile){
    if (!typeName || !profile) return;
    const key = String(typeName).toLowerCase();
    REG.types.set(key, structuredClone(profile));
  }

  // --- Unique ID allocation helpers ---
  function _nextAvailable(startFrom){
    let n = startFrom;
    do { n += 1; } while (REG.usedIDs.has(n) || REG.retiredIDs.has(n));
    return n;
  }
  function getNextFriendlyID(){
    REG.nextFriendlyId = _nextAvailable(REG.nextFriendlyId);
    return REG.nextFriendlyId;
  }
  function getNextEnemyID(){
    REG.nextEnemyId = _nextAvailable(REG.nextEnemyId);
    return REG.nextEnemyId;
  }
  function retireId(id){
    try {
      const n = Number(id);
      if (!Number.isFinite(n)) return;
      REG.usedIDs.delete(n);
      REG.retiredIDs.add(n);
    } catch {}
  }

  function spawn(typeName, side, opts){
    ensureArrays();
    const key = String(typeName||'').toLowerCase();
    const base = REG.types.get(key);
    if (!base) return null;
    const p = deepClone(base);
    const shipObj = {
      x: (opts && typeof opts.x==='number') ? opts.x : 640,
      y: (opts && typeof opts.y==='number') ? opts.y : 640,
      r: (p.dimensions && typeof p.dimensions.radius==='number') ? p.dimensions.radius : 14,
      heading: (opts && typeof opts.heading==='number') ? opts.heading : 0,
      desiredHeading: (opts && typeof opts.heading==='number') ? opts.heading : 0,
      speed: (p.movement && typeof p.movement.base_speed==='number') ? p.movement.base_speed*0.5 : 20,
      moveTarget: null,
    };
    // Allocate unique ID per side
    const isEnemy = String(side)==='enemy';
    const id = isEnemy ? getNextEnemyID() : getNextFriendlyID();
    try { REG.usedIDs.add(id); } catch {}
    const state = {
      profile: p,
      ship: shipObj,
      id,
      displayName: '',
      SPEED_MIN: p.movement?.min_speed_knots ?? -6,
      SPEED_MAX: p.movement?.max_speed_knots ?? 30,
      ACCEL_KTS_PER_SEC: 1.6,
      speedKts: Number(opts?.speedKts) || 0,
      actualSpeedKts: Number(opts?.speedKts) || 0,
      setSpeedFromSlider(v){ this.speedKts = Math.max(this.SPEED_MIN, Math.min(this.SPEED_MAX, v|0)); return this.speedKts; },
      adjustSpeed(d){ return this.setSpeedFromSlider((this.speedKts||0) + (d>0?1:-1)); },
      rudderEffectiveness(k){ const eff5 = p.movement?.rudder_effectiveness?.effectiveness_at_5kts ?? 0.12; const t=Math.max(0,Math.min(1,(Math.abs(k)-5)/(20-5))); return (Math.abs(k)<=5)?(eff5*(Math.abs(k)/5)):(eff5+(1-eff5)*t); },
    };

    // Naming and counters
    const sideKey = (String(side)==='enemy') ? 'enemy' : 'friendly';
    const typeCap = p.type || typeName;
    const cur = (global.ShipCounters[sideKey][typeCap] || 0) + 1;
    global.ShipCounters[sideKey][typeCap] = cur;
    state.displayName = (sideKey==='enemy') ? (`Enemy ${typeCap} ${cur}`) : (`${typeCap} ${cur}`);

    const handle = { state, profile: deepClone(p) };
    // Determine fleet assignment and store on ship state
    const fleetIdRaw = Number(opts && (sideKey==='enemy' ? (opts.enemyFleetId ?? opts.fleetId) : opts.fleetId));
    const fleetId = (isFinite(fleetIdRaw) && fleetIdRaw >= 1 && fleetIdRaw <= 3) ? fleetIdRaw : 1;
    const fleetKey = (sideKey === 'enemy') ? (`EnemyFleet${fleetId}`) : (`Fleet${fleetId}`);
    try { state.fleet = fleetKey; } catch {}

    // Attach independent runtime systems and assets to handle
    try {
      if (typeof window.DamageModel === 'function') handle.damageModel = new window.DamageModel(state);
    } catch {}
    try {
      if (typeof window.FiringSolution === 'function' && handle.damageModel) handle.firingSolution = new window.FiringSolution(state, handle.damageModel);
    } catch {}
    try { handle.png = p.image || (String((p.type||'').toLowerCase())==='transport' ? 'assets/trans.png' : (String((p.type||'').toLowerCase())==='cruiser' ? 'assets/prinz.png' : 'assets/bismarck1.png')); } catch {}
    try { handle.tmx = p.tmx || p.hitboxFile || (String((p.type||'').toLowerCase())==='transport' ? 'assets/transtmx.tmx' : (String((p.type||'').toLowerCase())==='cruiser' ? 'assets/prinztmx.tmx' : 'assets/BSTMX.tmx')); } catch {}
    try { handle.fleet = fleetKey; } catch {}
    // Create and register per-ship HUD
    try {
      if (typeof window.HUD === 'function') {
        handle.hud = new window.HUD(handle);
        try { if (window.HUDSystem && typeof window.HUDSystem.register === 'function') window.HUDSystem.register(handle.hud); } catch {}
      }
    } catch {}

    REG.handles.push(handle);
    // Push into primary side arrays
    pushHandle(sideKey==='enemy'?'enemy':'friendly', handle);
    // Also push into fleet bucket
    try {
      const bucket = getFleetArrayByKey(fleetKey);
      if (Array.isArray(bucket)) bucket.push(handle);
    } catch {}
    // Assign leader if none exists in this fleet
    try {
      const bucket = getFleetArrayByKey(fleetKey);
      const hasLeader = Array.isArray(bucket) && bucket.some(h => !!(h && h.state && h.state.isLeader) && !(h.state.sunk || h.state?.effects?.sunk));
      if (!hasLeader && state) state.isLeader = true;
    } catch {}

    // Registry mappings
    try {
      const idStr = String(state.id);
      global.ShipHandlesById = global.ShipHandlesById || {};
      global.ShipHandlesById[idStr] = handle;
    } catch {}

    return handle;
  }

  function getHandles(){ return REG.handles.slice(); }

  // Fleet utilities
  function getFleetArrayByKey(k){
    const key = String(k||'');
    switch(key){
      case 'Fleet1': return global.Fleet1;
      case 'Fleet2': return global.Fleet2;
      case 'Fleet3': return global.Fleet3;
      case 'EnemyFleet1': return global.EnemyFleet1;
      case 'EnemyFleet2': return global.EnemyFleet2;
      case 'EnemyFleet3': return global.EnemyFleet3;
      default: return null;
    }
  }
  function promoteNextLeader(fleetKey){
    try {
      const order = ['Fleet1','Fleet2','Fleet3','EnemyFleet1','EnemyFleet2','EnemyFleet3'];
      const fk = String(fleetKey||'');
      const idx = Math.max(0, order.indexOf(fk));
      for (let i = idx; i < order.length; i++) {
        const k = order[i];
        const arr = getFleetArrayByKey(k);
        if (!Array.isArray(arr) || arr.length===0) continue;
        // Find first alive ship and promote
        const candidate = arr.find(h => !!(h && h.state) && !(h.state.sunk || h.state?.effects?.sunk));
        if (candidate && candidate.state) {
          try {
            // Clear any existing leaders in this fleet
            arr.forEach(h=>{ if (h && h.state) h.state.isLeader = false; });
          } catch {}
          candidate.state.isLeader = true;
          return candidate.state.id;
        }
      }
    } catch {}
    return null;
  }

  // Expose sink/retire hook so other systems can mark IDs unavailable for reuse
  function onShipSunk(id){ retireId(id); }

  // --- Debugging helper ---
  function findSharedHUDs(){
    try {
      const seen = new Map();
      const collisions = [];
      for (const h of REG.handles) {
        if (!h?.hud) continue;
        const key = h.hud.constructor?.name || 'HUD';
        const dom = h.hud.el || h.hud.element || h.hud.dom;
        if (dom && seen.has(dom)) {
          const prev = seen.get(dom);
          collisions.push({
            id1: prev && prev.state ? prev.state.id : undefined,
            id2: h.state && h.state.id,
            sharedDOM: dom,
          });
        } else if (dom) {
          seen.set(dom, h);
        }
      }
      if (collisions.length === 0) {
        console.log('%c✅ No shared HUD elements detected.', 'color:lime');
      } else {
        console.warn('⚠️ Shared HUD elements found:', collisions);
      }
    } catch(err){ console.error('HUD check failed', err); }
  }

  // Expose API
  global.ShipRegistry = global.ShipRegistry || {
    registerType,
    spawn,
    getHandles,
    // ID management
    getNextFriendlyID,
    getNextEnemyID,
    onShipSunk,
    retireId,
    // Fleet management
    promoteNextLeader,
    getFleetArrayByKey,
  };
  try { global.ShipRegistry.findSharedHUDs = findSharedHUDs; } catch {}
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:{}));
