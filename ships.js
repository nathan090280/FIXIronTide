// ships.js
// Core system for registering ship types and spawning instances
(function(global){
  const REG = {
    types: new Map(), // typeName -> profile
    nextId: 0,
    handles: [], // array of { state, profile }
  };

  function deepClone(obj){ try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }

  function ensureArrays(){
    global.IronTideFleet = Array.isArray(global.IronTideFleet) ? global.IronTideFleet : [];
    global.NPCs = Array.isArray(global.NPCs) ? global.NPCs : [];
    global.ShipCounters = global.ShipCounters || { enemy: {}, friendly: {} };
  }

  function pushHandle(side, handle){
    // Push into friendly or enemy array using expected structure
    ensureArrays();
    const beforeF = global.IronTideFleet.length;
    const beforeN = global.NPCs.length;
    if (side === 'enemy') {
      try { global.NPCs.push(handle); } catch {}
      if (global.NPCs.length === beforeN) {
        try { global.NPCs = (global.NPCs || []).concat([handle]); } catch {}
      }
    } else {
      try { global.IronTideFleet.push(handle); } catch {}
      if (global.IronTideFleet.length === beforeF) {
        try { global.IronTideFleet = (global.IronTideFleet || []).concat([handle]); } catch {}
      }
    }
  }

  function registerType(typeName, profile){
    if (!typeName || !profile) return;
    const key = String(typeName).toLowerCase();
    REG.types.set(key, deepClone(profile));
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
    REG.nextId += 1;
    const id = REG.nextId;
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

    const handle = { state, profile: p };
    REG.handles.push(handle);
    pushHandle(sideKey==='enemy'?'enemy':'friendly', handle);
    return handle;
  }

  function getHandles(){ return REG.handles.slice(); }

  // Expose API
  global.ShipRegistry = global.ShipRegistry || {
    registerType,
    spawn,
    getHandles,
  };
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:{}));
