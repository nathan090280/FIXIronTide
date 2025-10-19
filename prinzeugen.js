// prinzeugen.js
// Prinz Eugen - German WW2 Heavy Cruiser
// 20% smaller than Bismarck, 4 turrets
// Exposes ship profile data and movement state/helpers for classic scripts

(function(global){
  const profile = {
    name: "Prinz Eugen",
    type: "Cruiser",
    image: 'assets/prinz.png',
    tmx: 'assets/prinztmx.tmx',
    hitboxFile: 'assets/prinztmx.tmx',
    // Dimensions: 20% smaller than Bismarck
    dimensions: { length: 200, beam: 28.8, draft: 8, radius: 11.2 },
    displacement_tons: 16970,
    crew: 1600,

    // Movement & handling (slightly faster/more maneuverable than Bismarck)
    movement: {
      base_speed: 40,
      min_speed_knots: -8,
      max_speed_knots: 32,
      acceleration: { forward: 5.5, reverse: 3.5, neutral_zone: 0 },
      turn_rate_deg_per_sec: 12,
      rudder_effectiveness: { min_knots: 0, min_effectiveness: 0, max_knots: 32, max_effectiveness: 1.0, effectiveness_at_5kts: 0.12 }
    },

    // Weapons - 4 main battery turrets
    weapons: {
      main_battery: { count: 4, reload_time_seconds: 8, range_meters: 18000, shell_speed_mps: 850 },
      secondary_battery: { count: 6, reload_time_seconds: 4, range_meters: 4500, shell_speed_mps: 900 },
      anti_aircraft: { count: 2, range_meters: 3500, rate_of_fire_rpm: 150 },
      torpedotubes: { count: 2, reload_time_seconds: 12 }
    },

    armor: { belt_mm: 350, turrets_mm: 350 },
    propulsion: { engine_power_shp: 800, max_speed_knots: 32 },

    // Hull Integrity
    hullIntegrity: {
      maxHP: 1600,
      currentHP: 1600,
      thresholds: {
        "0.75": { effect: "Minor drag, -10% top speed" },
        "0.50": { effect: "Flooding risk begins, acceleration -25%" },
        "0.25": { effect: "Severe flooding risk, chance to sink increases" },
        "0.00": { effect: "Ship destroyed (hull breaks up / sinks)" }
      }
    },

    damage: {
      flooding: { level_percent: 0, max_percent: 100, effect: "Reduces speed, acceleration, handling; crew damage; compartment-specific effects" },
      fire: { level_percent: 0, max_percent: 100, effect: "Reduces efficiency of systems; damages crew; may spread to compartments" },
      hitboxes: {
        aa1: { hp: 250, damage_percent: 0, floodable: false, effect: "AA reduced aim or none" },
        aa2: { hp: 250, damage_percent: 0, floodable: false, effect: "AA reduced aim or none" },
        bow: { hp: 400, damage_percent: 0, floodable: true, effect: "Flooding, reduced speed, reduced steering" },
        bridge: { hp: 250, damage_percent: 0, floodable: false, effect: "Crew damage, slow commands" },
        damagecontrol1: { hp: 250, damage_percent: 0, floodable: false, effect: "Reduced repair ability: flooding/fires" },
        damagecontrol2: { hp: 250, damage_percent: 0, floodable: false, effect: "Reduced repair ability: flooding/fires" },
        engine: { hp: 400, damage_percent: 0, floodable: false, effect: "Slower ship, slower acceleration, reduced power to turrets" },
        funnel: { hp: 250, damage_percent: 0, floodable: false, effect: "Slows ship, smoke effects" },
        hullaft1: { hp: 350, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullaft2: { hp: 350, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullfore1: { hp: 350, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullfore2: { hp: 350, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullmid: { hp: 350, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        magazine: { hp: 100, damage_percent: 0, floodable: false, effect: "1 hit kill" },
        prop: { hp: 400, damage_percent: 0, floodable: false, effect: "Slowed acceleration, reduced topspeed, or off completely" },
        rangefinder: { hp: 100, damage_percent: 0, floodable: false, effect: "Accuracy decrease / takes longer to solve" },
        rudder: { hp: 180, damage_percent: 0, floodable: false, effect: "Impacts or stops steering, may lock left/right" },
        torpedotube1: { hp: 250, damage_percent: 0, floodable: false, effect: "Slow launch or broken completely" },
        torpedotube2: { hp: 250, damage_percent: 0, floodable: false, effect: "Slow launch or broken completely" },
        turret1: { hp: 400, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" },
        turret2: { hp: 400, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" },
        turret3: { hp: 400, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" },
        turret4: { hp: 400, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" }
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
  const SPEED_MIN = profile.movement.min_speed_knots; // -8
  const SPEED_MAX = profile.movement.max_speed_knots; // 32
  const ACCEL_KTS_PER_SEC = 2.2; // slightly faster accel than Bismarck

  const ship = {
    x: 640,
    y: 640,
    r: profile.dimensions.radius,
    heading: 0,
    desiredHeading: 0,
    speed: profile.movement.base_speed * 0.5,
    moveTarget: null,
  };

  let speedKts = 15;
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
    const eff5 = profile.movement.rudder_effectiveness.effectiveness_at_5kts;
    const t = Math.max(0, Math.min(1, (ktsAbs - 5) / (32 - 5)));
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
    displayName: 'Prinz Eugen 1',
  };

  // Attach to window
  if (global) {
    global.prinzEugenProfile = profile;
    global.prinzEugenState = shipState;
    try {
      // Do NOT auto-register Prinz Eugen into fleets on load; only explicit spawns may add ships
    } catch {}
  }

  // Centralized Audio Manager for Prinz Eugen (reuse Bismarck's audio)
  (function setupAudio(){
    try {
      const audio = global.IronTideAudio || {
        inited: false,
        muted: false,
        rest: null,
        engine: null,
        restVol: 0.6,
        engineVol: 0.6,
        _firstRun: true,
        cannons: [],
        splashes: [],
        ensureInit(){
          if (this.inited) return;
          this.inited = true;
          try {
            this.rest = new Audio('assets/audio/shipatrest1.mp3');
            this.rest.loop = true; this.rest.preload = 'auto'; this.rest.volume = 0.0;
          } catch {}
          try {
            this.engine = new Audio('assets/audio/engine1.mp3');
            this.engine.loop = true; this.engine.preload = 'auto'; this.engine.volume = 0.0;
          } catch {}
          try {
            ['assets/audio/cannon1.mp3','assets/audio/cannon2.mp3'].forEach(u=>{ const a=new Audio(u); a.preload='auto'; a.volume=0.9; audio.cannons.push(a); });
          } catch {}
          try {
            ['assets/audio/splash1.mp3','assets/audio/splash2.mp3'].forEach(u=>{ const a=new Audio(u); a.preload='auto'; a.volume=0.9; audio.splashes.push(a); });
          } catch {}
        },
        setMuted(m){ this.muted = !!m; try { if (this.rest) this.rest.muted = this.muted; if (this.engine) this.engine.muted = this.muted; } catch {} },
        updateEngineMix(){
          this.ensureInit();
          const kts = (shipState && typeof shipState.actualSpeedKts === 'number') ? Math.abs(shipState.actualSpeedKts) : 0;
          const t = Math.max(0, Math.min(1, kts / 12));
          const restTarget = (1 - t) * this.restVol;
          const engTarget = t * this.engineVol;
          try { if (this.rest && this.rest.paused) this.rest.play().catch(()=>{}); } catch {}
          try { if (this.engine && this.engine.paused) this.engine.play().catch(()=>{}); } catch {}
          if (this._firstRun) {
            try { if (this.rest) this.rest.volume = this.muted ? 0 : restTarget; } catch {}
            try { if (this.engine) this.engine.volume = this.muted ? 0 : engTarget; } catch {}
            this._firstRun = false;
            return;
          }
          const step = 0.15;
          try { if (this.rest) this.rest.volume = this.muted ? 0 : (this.rest.volume + (restTarget - this.rest.volume) * step); } catch {}
          try { if (this.engine) this.engine.volume = this.muted ? 0 : (this.engine.volume + (engTarget - this.engine.volume) * step); } catch {}
        },
        playCannon(){
          this.ensureInit();
          try {
            if (!this.cannons.length) return;
            const base = this.cannons[Math.random() < 0.5 ? 0 : 1];
            const a = base.cloneNode(); a.volume = base.volume; a.muted = this.muted; a.play().catch(()=>{});
          } catch {}
        },
        playSplash(){
          this.ensureInit();
          try {
            if (!this.splashes.length) return;
            const base = this.splashes[Math.random() < 0.5 ? 0 : 1];
            const a = base.cloneNode(); a.volume = base.volume; a.muted = this.muted; a.play().catch(()=>{});
          } catch {}
        }
      };
      try { setInterval(()=> audio.updateEngineMix(), 300); } catch {}
      if (!global.IronTideAudio) global.IronTideAudio = audio;
    } catch {}
  })();

  // Register Prinz Eugen type with the global ShipRegistry
  try { if (global.ShipRegistry && typeof global.ShipRegistry.registerType === 'function') { global.ShipRegistry.registerType('Cruiser', profile); } } catch {}

  // Create Prinz Eugen factory matching Bismarck's EXACT initialization pattern
  try {
    global.spawnPrinzEugen = function spawnPrinzEugen(side, wx, wy, opts={}){
      const isEnemy = String(side||'friendly').toLowerCase().startsWith('enemy');
      const sideKey = isEnemy ? 'enemy' : 'friendly';
      
      // Use the EXACT same ID and naming system as game.js spawnNpcAt
      const typeLabel = 'Cruiser';
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
        npcTurretAnglesRelDeg: { t1: 0, t2: 0, t3: 180, t4: 180 }, // 4 turrets: 2 forward, 2 aft
        ship: { 
          x: Math.round(wx||0), 
          y: Math.round(wy||0), 
          r: profile.dimensions?.radius || 11.2, 
          heading: Number(opts.heading)||0, 
          desiredHeading: Number(opts.heading)||0, 
          speed: profile.movement?.base_speed || 40,
          moveTarget: null 
        },
        setSpeedFromSlider: function(v){ this.speedKts = Math.max(this.SPEED_MIN, Math.min(this.SPEED_MAX, v)); return this.speedKts; },
        adjustSpeed: function(delta){ return this.setSpeedFromSlider(this.speedKts + delta); }
      };
      
      // Attach profile and create damage model
      state.profile = JSON.parse(JSON.stringify(profile));
      
      console.log('=== PRINZ EUGEN PROFILE ATTACHMENT ===');
      console.log('Original profile type:', profile.type);
      console.log('Original profile image:', profile.image);
      console.log('Original profile tmx:', profile.tmx);
      console.log('State profile type:', state.profile.type);
      console.log('State profile image:', state.profile.image);
      console.log('State profile tmx:', state.profile.tmx);
      
      let dm = null; 
      try { dm = new global.DamageModel(state); } catch {};
      
      // Create NPC handle with damage model
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
      
      // Register in EnemyFleet1 when spawned as enemy
      if (sideKey === 'enemy') {
        const idStr = String(state.id);
        global.EnemyFleet1 = global.EnemyFleet1 || new Set();
        global.EnemyFleet1.add(idStr);
      }
      
      // FORCE friendly Prinz Eugen into Fleet 1 using EXACT same pattern as spawnNpcAt
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
        
        console.log('=== FRIENDLY PRINZ EUGEN ADDED TO FLEET 1 ===');
        console.log('Prinz Eugen ID:', state.id, 'Name:', state.displayName);
        console.log('Side:', state.side);
        console.log('Added to IronTideFleetAssignments[1]:', global.IronTideFleetAssignments[1].has(idStr));
        console.log('Added to fa[1]:', global.fa[1].has(idStr));
      }
      
      // Register globally
      global.ShipHandlesById = global.ShipHandlesById || {};
      global.ShipHandlesById[String(state.id)] = npc;
      
      // Register in ShipPool
      try {
        global.ShipPool = global.ShipPool || { friendly: { All: [], Battleship: [], Transport: [], Cruiser: [] }, enemy: { All: [], Battleship: [], Transport: [], Cruiser: [] } };
        const bucket = (sideKey === 'enemy') ? global.ShipPool.enemy : global.ShipPool.friendly;
        if (!bucket.All.find(h => h && h.state && h.state.id === state.id)) bucket.All.push(npc);
        if (!bucket.Cruiser.find(h => h && h.state && h.state.id === state.id)) bucket.Cruiser.push(npc);
      } catch {}
      
      // Increment counter for next spawn
      global.ShipCounters[sideKey][typeLabel] = nIdx + 1;
      
      // Register HUD for this Prinz Eugen in Multi-HUD system
      if (typeof global.registerHudForShip === 'function') {
        // Cruisers use their own right HUD container to avoid conflicts
        global.registerHudForShip(String(state.id), 'shipHudCruiser', 'shipHudCanvasCruiser');
        console.log('Registered Multi-HUD for Prinz Eugen ID:', state.id, 'using shipHudCruiser container');
      }
      
      console.log('=== PRINZ EUGEN SPAWNED ===');
      console.log('ID:', state.id, 'Name:', state.displayName);
      console.log('Profile type:', state.profile?.type);
      console.log('Profile image:', state.profile?.image);
      
      return npc;
    };
  } catch {}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
