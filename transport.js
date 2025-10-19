// transport.js
// Transport ship profile, cloned from bismarck.js with adjusted movement (20 kts max) and same armor schema

(function(global){
  const profile = {
    name: "Transport",
    type: "Transport",
    image: 'assets/trans.png',
    tmx: 'assets/transtmx.tmx',
    hitboxFile: 'assets/transtmx.tmx',
    // Size adjusted: 50% larger than previous halved values
    dimensions: { length: 165, beam: 22.5, draft: 6.75, radius: 10.5 },
    displacement_tons: 18000,
    crew: 150,

    // Movement & handling (reduced top speed to 20 kts)
    movement: {
      base_speed: 36, // visual scale base; keep similar so world speeds feel consistent
      min_speed_knots: -6,
      max_speed_knots: 20,
      acceleration: { forward: 3, reverse: 2, neutral_zone: 0 },
      turn_rate_deg_per_sec: 6,
      rudder_effectiveness: { min_knots: 0, min_effectiveness: 0, max_knots: 20, max_effectiveness: 1.0, effectiveness_at_5kts: 0.12 }
    },

    // NO WEAPONS - Transport is peaceful
    weapons: {
      main_battery: { count: 0, reload_time_seconds: 0, range_meters: 0, shell_speed_mps: 0 },
      secondary_battery: { count: 0, reload_time_seconds: 0, range_meters: 0, shell_speed_mps: 0 },
      anti_aircraft: { count: 0, range_meters: 0, rate_of_fire_rpm: 0 },
      torpedotubes: { count: 0, reload_time_seconds: 0 }
    },

    // Same armor schema as Bismarck per request
    armor: { belt_mm: 500, turrets_mm: 500 },
    propulsion: { engine_power_shp: 500, max_speed_knots: 20 },

    // Hull Integrity (general hits to the ship PNG)
    hullIntegrity: {
      maxHP: 1200,
      currentHP: 1200,
      thresholds: {
        "0.75": { effect: "Minor drag, -10% top speed" },
        "0.50": { effect: "Flooding risk begins, acceleration -25%" },
        "0.25": { effect: "Severe flooding risk, chance to sink increases" },
        "0.00": { effect: "Ship destroyed (hull breaks up / sinks)" }
      }
    },

    // Hitboxes: keep keys compatible; HPs slightly lower but kept broad to be easier to hit (geometry comes from TMX)
    damage: {
      flooding: { level_percent: 0, max_percent: 100, effect: "Reduces speed, acceleration, handling; crew damage; compartment-specific effects" },
      fire: { level_percent: 0, max_percent: 100, effect: "Reduces efficiency of systems; damages crew; may spread to compartments" },
      hitboxes: {
        aa1: { hp: 200, damage_percent: 0, floodable: false, effect: "AA reduced aim or none" },
        aa2: { hp: 200, damage_percent: 0, floodable: false, effect: "AA reduced aim or none" },
        bow: { hp: 400, damage_percent: 0, floodable: true, effect: "Flooding, reduced speed, reduced steering" },
        bridge: { hp: 240, damage_percent: 0, floodable: false, effect: "Crew damage, slow commands" },
        damagecontrol1: { hp: 240, damage_percent: 0, floodable: false, effect: "Reduced repair ability: flooding/fires" },
        damagecontrol2: { hp: 240, damage_percent: 0, floodable: false, effect: "Reduced repair ability: flooding/fires" },
        engine: { hp: 380, damage_percent: 0, floodable: false, effect: "Slower ship, slower acceleration" },
        funnel: { hp: 200, damage_percent: 0, floodable: false, effect: "Slows ship, smoke effects" },
        hullaft1: { hp: 320, damage_percent: 0, floodable: true, effect: "Slows ship, flooding" },
        hullaft2: { hp: 320, damage_percent: 0, floodable: true, effect: "Slows ship, flooding" },
        hullfore1: { hp: 320, damage_percent: 0, floodable: true, effect: "Slows ship, flooding" },
        hullfore2: { hp: 320, damage_percent: 0, floodable: true, effect: "Slows ship, flooding" },
        hullmid: { hp: 360, damage_percent: 0, floodable: true, effect: "Slows ship, flooding" },
        magazine: { hp: 100, damage_percent: 0, floodable: false, effect: "Catastrophic if ignited" },
        prop: { hp: 360, damage_percent: 0, floodable: false, effect: "Slowed acceleration, reduced topspeed" },
        rangefinder: { hp: 100, damage_percent: 0, floodable: false, effect: "Accuracy decrease" },
        rudder: { hp: 180, damage_percent: 0, floodable: false, effect: "Impacts or stops steering" },
        torpedotube1: { hp: 0, damage_percent: 0, floodable: false, effect: "None" },
        torpedotube2: { hp: 0, damage_percent: 0, floodable: false, effect: "None" },
        turret1: { hp: 0, damage_percent: 0, floodable: false, effect: "None" },
        turret2: { hp: 0, damage_percent: 0, floodable: false, effect: "None" },
        turret3: { hp: 0, damage_percent: 0, floodable: false, effect: "None" },
        turret4: { hp: 0, damage_percent: 0, floodable: false, effect: "None" }
      }
    },

    calculateEffects: {
      rudder: (baseTurnRate, damagePercent) => ({
        turnRate: baseTurnRate * (1 - damagePercent / 100),
        lockChance: damagePercent >= 75 ? 0.5 : 0
      }),
      prop: (baseSpeed, baseAccel, damagePercent) => {
        const factor = 1 - 0.75 * (damagePercent / 100);
        return { topSpeed: baseSpeed * factor, acceleration: baseAccel * factor };
      },
      engine: (baseSpeed, damagePercent) => ({ topSpeed: baseSpeed * (1 - damagePercent / 100) }),
      hull: (baseSpeed, baseTurnRate, floodPercent) => {
        const factor = 1 - 0.5 * (floodPercent / 100);
        return { speed: baseSpeed * factor, turnRate: baseTurnRate * factor };
      },
      flooding: (compartments) => {
        let floodedCount = 0;
        for (const comp in compartments) if (compartments[comp] >= 100) floodedCount++;
        return { floodedCount, shipSunk: floodedCount >= 2 };
      },
      turret: (baseRotation, baseReload, baseAccuracy, damagePercent) => ({
        rotationSpeed: baseRotation * (1 - damagePercent / 100),
        reloadTime: baseReload * (1 + damagePercent / 100),
        accuracy: baseAccuracy * (1 - damagePercent / 100)
      }),
      aa: (baseAccuracy, damagePercent) => baseAccuracy * (1 - damagePercent / 100),
      rangefinder: (baseSolutionSpeed, baseAccuracy, damagePercent) => ({
        solutionSpeed: baseSolutionSpeed * (1 - 0.5 * damagePercent / 100),
        accuracy: baseAccuracy * (1 - 0.5 * damagePercent / 100)
      }),
      bridge: (baseDelay, damagePercent) => baseDelay * (1 + damagePercent / 100),
      damageControl: (baseRate, damagePercent) => baseRate * (1 - damagePercent / 100),
      funnel: (baseSpeed, damagePercent) => ({ speed: baseSpeed * (1 - 0.25 * damagePercent / 100) }),
      torpedotube: (baseLaunchTime, damagePercent) => baseLaunchTime * (1 + damagePercent / 100),
      magazine: (damagePercent) => (damagePercent >= 100 ? "explosion" : "intact")
    }
  };

  // Movement/control state
  const SPEED_MIN = profile.movement.min_speed_knots; // -6
  const SPEED_MAX = profile.movement.max_speed_knots; // 20
  const ACCEL_KTS_PER_SEC = 1.6; // slower accel than BB

  const ship = {
    x: 640,
    y: 640,
    r: profile.dimensions.radius,
    heading: 0,
    desiredHeading: 0,
    speed: profile.movement.base_speed * 0.5,
    moveTarget: null,
  };

  let speedKts = 10;      // target speed
  let actualSpeedKts = 0; // smooth actual speed

  function setSpeedFromSlider(val) {
    let raw = parseInt(val, 10);
    if (!isFinite(raw)) raw = 0;
    raw = Math.max(SPEED_MIN, Math.min(SPEED_MAX, raw));
    let v = 0;
    if (raw === 0) v = 0; else if (raw > 0) v = (raw < 5) ? 0 : raw; else v = (raw > -5) ? -5 : raw;
    speedKts = v;
    return v;
  }

  function adjustSpeed(delta) {
    const cur = speedKts || 0;
    let next = cur;
    if (delta > 0) {
      if (cur < -5) next = cur + 1;
      else if (cur === -5) next = 0;
      else if (cur === 0) next = 5;
      else if (cur >= 5) next = Math.min(SPEED_MAX, cur + 1);
    } else if (delta < 0) {
      if (cur > 5) next = cur - 1;
      else if (cur === 5) next = 0;
      else if (cur === 0) next = -5;
      else if (cur <= -5) next = Math.max(SPEED_MIN, cur - 1);
    }
    return setSpeedFromSlider(next);
  }

  function rudderEffectiveness(ktsAbs) {
    const eff5 = profile.movement.rudder_effectiveness.effectiveness_at_5kts;
    const t = Math.max(0, Math.min(1, (ktsAbs - 5) / (20 - 5)));
    return (ktsAbs <= 5) ? (eff5 * (ktsAbs / 5)) : (eff5 + (1 - eff5) * t);
  }

  const shipState = {
    profile,
    ship,
    get SPEED_MIN(){ return SPEED_MIN; },
    get SPEED_MAX(){ return SPEED_MAX; },
    get ACCEL_KTS_PER_SEC(){ return ACCEL_KTS_PER_SEC; },
    get speedKts(){ return speedKts; },
    set speedKts(v){ speedKts = setSpeedFromSlider(v); },
    get actualSpeedKts(){ return actualSpeedKts; },
    set actualSpeedKts(v){ actualSpeedKts = v; },
    setSpeedFromSlider,
    adjustSpeed,
    rudderEffectiveness,
    displayName: 'Transport 1',
  };

  // Attach to window
  if (global) {
    global.transportProfile = profile;
    global.transportState = shipState;
    try {
      // Do NOT auto-register Transport into fleets on load; only explicit spawns may add ships
      // Keep profile/state available for factories and HUD logic, but avoid unintended ship creation here
    } catch {}
  }

  // Audio: reuse engine/rest loop logic so transports have ambient sound
  (function setupAudio(){
    try {
      const audio = global.IronTideAudio || {
        inited: false,
        muted: false,
        rest: null,
        engine: null,
        restVol: 0.5,
        engineVol: 0.5,
        _firstRun: true,
        cannons: [],
        splashes: [],
        ensureInit(){
          if (this.inited) return;
          this.inited = true;
          try { this.rest = new Audio('assets/audio/shipatrest1.mp3'); this.rest.loop=true; this.rest.preload='auto'; this.rest.volume=0.0; } catch {}
          try { this.engine = new Audio('assets/audio/engine1.mp3'); this.engine.loop=true; this.engine.preload='auto'; this.engine.volume=0.0; } catch {}
        },
        setMuted(m){ this.muted = !!m; try { if (this.rest) this.rest.muted = this.muted; if (this.engine) this.engine.muted = this.muted; } catch {} },
        updateEngineMix(){
          this.ensureInit();
          const kts = (shipState && typeof shipState.actualSpeedKts === 'number') ? Math.abs(shipState.actualSpeedKts) : 0;
          const t = Math.max(0, Math.min(1, kts / 10));
          const restTarget = (1 - t) * this.restVol;
          const engTarget = t * this.engineVol;
          try { if (this.rest && this.rest.paused) this.rest.play().catch(()=>{}); } catch {}
          try { if (this.engine && this.engine.paused) this.engine.play().catch(()=>{}); } catch {}
          if (this._firstRun) { try { if (this.rest) this.rest.volume = this.muted ? 0 : restTarget; } catch {} try { if (this.engine) this.engine.volume = this.muted ? 0 : engTarget; } catch {} this._firstRun=false; return; }
          const step = 0.15;
          try { if (this.rest) this.rest.volume = this.muted ? 0 : (this.rest.volume + (restTarget - this.rest.volume) * step); } catch {}
          try { if (this.engine) this.engine.volume = this.muted ? 0 : (this.engine.volume + (engTarget - this.engine.volume) * step); } catch {}
        },
      };
      try { setInterval(()=> audio.updateEngineMix(), 400); } catch {}
      if (!global.IronTideAudio) global.IronTideAudio = audio;
    } catch {}
  })();

  // Register Transport type with the global ShipRegistry (new class system)
  try { if (global.ShipRegistry && typeof global.ShipRegistry.registerType === 'function') { global.ShipRegistry.registerType('Transport', profile); } } catch {}

  // Create Transport factory that mimics Bismarck's EXACT initialization pattern
  function createTransportState(side) {
    const s = JSON.parse(JSON.stringify(profile));
    
    // Movement/control state - COPY EXACT PATTERN FROM BISMARCK
    const SPEED_MIN = s.movement.min_speed_knots;
    const SPEED_MAX = s.movement.max_speed_knots;
    const ACCEL_KTS_PER_SEC = 2;

    const ship = {
      x: 640,
      y: 640,
      r: s.dimensions.radius,
      heading: 0,
      desiredHeading: 0,
      speed: s.movement.base_speed * 0.5,
      moveTarget: null,
    };

    let speedKts = 0;
    let actualSpeedKts = 0;

    function setSpeedFromSlider(val) {
      let raw = parseInt(val, 10);
      if (!isFinite(raw)) raw = 0;
      raw = Math.max(SPEED_MIN, Math.min(SPEED_MAX, raw));
      let v = 0;
      if (raw === 0) v = 0; else if (raw > 0) v = (raw < 5) ? 0 : raw; else v = (raw > -5) ? -5 : raw;
      speedKts = v;
      return v;
    }

    function adjustSpeed(delta) {
      const cur = speedKts || 0;
      let next = cur;
      if (delta > 0) {
        if (cur < -5) next = cur + 1;
        else if (cur === -5) next = 0;
        else if (cur === 0) next = 5;
        else if (cur >= 5) next = Math.min(SPEED_MAX, cur + 1);
      } else if (delta < 0) {
        if (cur > 5) next = cur - 1;
        else if (cur === 5) next = 0;
        else if (cur === 0) next = -5;
        else if (cur <= -5) next = Math.max(SPEED_MIN, cur - 1);
      }
      return setSpeedFromSlider(next);
    }

    function rudderEffectiveness(ktsAbs) {
      const eff5 = s.movement.rudder_effectiveness.effectiveness_at_5kts;
      const t = Math.max(0, Math.min(1, (ktsAbs - 5) / (30 - 5)));
      return (ktsAbs <= 5) ? (eff5 * (ktsAbs / 5)) : (eff5 + (1 - eff5) * t);
    }

    // Create state object EXACTLY like Bismarck
    const transportState = {
      profile: s,
      ship,
      get SPEED_MIN(){ return SPEED_MIN; },
      get SPEED_MAX(){ return SPEED_MAX; },
      get ACCEL_KTS_PER_SEC(){ return ACCEL_KTS_PER_SEC; },
      get speedKts(){ return speedKts; },
      set speedKts(v){ speedKts = setSpeedFromSlider(v); },
      get actualSpeedKts(){ return actualSpeedKts; },
      set actualSpeedKts(v){ actualSpeedKts = v; },
      setSpeedFromSlider,
      adjustSpeed,
      rudderEffectiveness,
      displayName: '',
    };
    
    // CRITICAL: Attach the Transport profile to the state
    transportState.profile = profile;

    return transportState;
  }

  // RADICAL OVERHAUL: Use the EXACT same pattern as spawnNpcAt from game.js
  try {
    global.spawnTransport = function spawnTransport(side, wx, wy, opts={}){
      const isEnemy = String(side||'friendly').toLowerCase().startsWith('enemy');
      const sideKey = isEnemy ? 'enemy' : 'friendly';
      
      // Use the EXACT same ID and naming system as game.js spawnNpcAt
      const typeLabel = 'Transport';
      global.ShipCounters = global.ShipCounters || { enemy: {}, friendly: {} };
      global.ShipCounters[sideKey] = global.ShipCounters[sideKey] || {};
      const nIdx = (global.ShipCounters[sideKey][typeLabel]) ? global.ShipCounters[sideKey][typeLabel] : 1;
      const displayName = (sideKey === 'enemy') ? (`Enemy ${typeLabel} ${nIdx}`) : (`${typeLabel} ${nIdx}`);
      
      // Create state using EXACT same pattern as game.js spawnNpcAt
      const strictAlloc = (typeof global.allocateStrictId === 'function') ? global.allocateStrictId : null;
      const assignedId = strictAlloc ? strictAlloc(sideKey, opts && opts.requestedId) : null;
      const state = {
        id: (assignedId != null ? assignedId : (global.IronTideFleetNextId = (global.IronTideFleetNextId || 1) + 1)),
        displayName,
        side: sideKey, // CRITICAL: Set side properly
        SPEED_MIN: profile.movement.min_speed_knots,
        SPEED_MAX: profile.movement.max_speed_knots,
        ACCEL_KTS_PER_SEC: profile.movement.acceleration?.forward || 2.5,
        speedKts: 0,
        actualSpeedKts: 0,
        effects: {}, // Fresh effects object
        // NO TURRETS for Transport
        ship: { 
          x: Math.round(wx||0), 
          y: Math.round(wy||0), 
          r: profile.dimensions?.radius || 10.5, 
          heading: Number(opts.heading)||0, 
          desiredHeading: Number(opts.heading)||0, 
          speed: profile.movement?.base_speed || 36,
          moveTarget: null 
        },
        // Transport-specific methods
        setSpeedFromSlider: function(v){ this.speedKts = Math.max(this.SPEED_MIN, Math.min(this.SPEED_MAX, v)); return this.speedKts; },
        adjustSpeed: function(delta){ return this.setSpeedFromSlider(this.speedKts + delta); }
      };
      
      // Attach profile and create damage model like spawnNpcAt
      state.profile = JSON.parse(JSON.stringify(profile));
      
      console.log('=== TRANSPORT PROFILE ATTACHMENT ===');
      console.log('Original profile type:', profile.type);
      console.log('Original profile image:', profile.image);
      console.log('Original profile tmx:', profile.tmx);
      console.log('State profile type:', state.profile.type);
      console.log('State profile image:', state.profile.image);
      console.log('State profile tmx:', state.profile.tmx);
      let dm = null; 
      try { dm = new global.DamageModel(state); } catch {};
      
      // Create NPC handle with damage model like spawnNpcAt
      const npc = { state, profile: state.profile, damageModel: dm };
      
      // CRITICAL: Add to correct array based on side to prevent duplicates
      // Friendly -> IronTideFleet only; Enemy -> NPCs only
      if (sideKey === 'enemy') {
        global.NPCs = global.NPCs || [];
        global.NPCs.push(npc);
      } else {
        global.IronTideFleet = global.IronTideFleet || [];
        global.IronTideFleet.push(npc);
      }
      
      // Register in EnemyFleet1 when spawned as enemy so all targeting/damage systems recognize it
      if (sideKey === 'enemy') {
        const idStr = String(state.id);
        global.EnemyFleet1 = global.EnemyFleet1 || new Set();
        global.EnemyFleet1.add(idStr);
      }
      
      // FORCE friendly Transport into Fleet 1 using EXACT same pattern as spawnNpcAt
      if (sideKey === 'friendly') {
        const idStr = String(state.id);
        global.IronTideFleetAssignments = global.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        [1,2,3].forEach(k=>{ if (!(global.IronTideFleetAssignments[k] instanceof Set)) global.IronTideFleetAssignments[k] = new Set(); });
        global.IronTideFleetAssignments[2].delete(idStr);
        global.IronTideFleetAssignments[3].delete(idStr);
        global.IronTideFleetAssignments[1].add(idStr);
        
        // Also add to legacy fleet systems for compatibility
        global.fa = global.fa || { 1: new Set(), 2: new Set(), 3: new Set() };
        global.fleetAssignments = global.fleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        global.fleetMembers = global.fleetMembers || { 1: [], 2: [], 3: [] };
        
        global.fa[1].add(idStr);
        global.fleetAssignments[1].add(idStr);
        global.fleetMembers[1].push(npc);
        
        // Add to controllable ships
        global.allShips = global.allShips || [];
        global.allShips.push(npc);
        
        global.controllableShips = global.controllableShips || [];
        global.controllableShips.push(npc);
        
        console.log('=== FRIENDLY TRANSPORT ADDED TO FLEET 1 ===');
        console.log('Transport ID:', state.id, 'Name:', state.displayName);
        console.log('Side:', state.side);
        console.log('Added to IronTideFleetAssignments[1]:', global.IronTideFleetAssignments[1].has(idStr));
        console.log('Added to fa[1]:', global.fa[1].has(idStr));
      }
      
      // Register globally
      global.ShipHandlesById = global.ShipHandlesById || {};
      global.ShipHandlesById[String(state.id)] = npc;
      // Register in ShipPool for consistency with other ship types (helps generic queries)
      try {
        global.ShipPool = global.ShipPool || { friendly: { All: [], Battleship: [], Transport: [] }, enemy: { All: [], Battleship: [], Transport: [] } };
        const bucket = (sideKey === 'enemy') ? global.ShipPool.enemy : global.ShipPool.friendly;
        if (!bucket.All.find(h => h && h.state && h.state.id === state.id)) bucket.All.push(npc);
        if (!bucket.Transport.find(h => h && h.state && h.state.id === state.id)) bucket.Transport.push(npc);
      } catch {}
      
      // Increment counter for next spawn
      global.ShipCounters[sideKey][typeLabel] = nIdx + 1;
      
      // Register HUD for this Transport in Multi-HUD system
      if (typeof global.registerHudForShip === 'function') {
        // Transport uses DEDICATED container to prevent conflicts with Bismarck
        global.registerHudForShip(String(state.id), 'shipHudTransport', 'shipHudCanvasTransport');
        console.log('Registered Multi-HUD for Transport ID:', state.id, 'using DEDICATED Transport container');
      }
      
      console.log('=== TRANSPORT SPAWNED ===');
      console.log('ID:', state.id, 'Name:', state.displayName);
      console.log('Profile type:', state.profile?.type);
      console.log('Profile image:', state.profile?.image);
      
      return npc;
    };
  } catch {}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
