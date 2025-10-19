// bismarck.js
// Exposes ship profile data and movement state/helpers for classic scripts via window.shipProfile and window.shipState
// Also supports ES module export when imported as a module.

(function(global){
  const profile = {
    name: "Bismarck",
    type: "Battleship",
    dimensions: { length: 250, beam: 36, draft: 10, radius: 14 },
    displacement_tons: 50900,
    crew: 2600,

    // Movement & handling
    movement: {
      base_speed: 40,
      min_speed_knots: -8,
      max_speed_knots: 30,
      acceleration: { forward: 5, reverse: 3, neutral_zone: 0 },
      turn_rate_deg_per_sec: 10,
      rudder_effectiveness: { min_knots: 0, min_effectiveness: 0, max_knots: 30, max_effectiveness: 1.0, effectiveness_at_5kts: 0.1 }
    },

    // Weapons
    weapons: {
      main_battery: { count: 4, reload_time_seconds: 10, range_meters: 20000, shell_speed_mps: 800 },
      secondary_battery: { count: 8, reload_time_seconds: 5, range_meters: 5000, shell_speed_mps: 900 },
      anti_aircraft: { count: 2, range_meters: 4000, rate_of_fire_rpm: 120 },
      torpedotubes: { count: 2, reload_time_seconds: 15 }
    },

    armor: { belt_mm: 500, turrets_mm: 500 },
    propulsion: { engine_power_shp: 1000, max_speed_knots: 30 },

    // Hull Integrity (general hits to the ship PNG)
    hullIntegrity: {
      maxHP: 2000,
      currentHP: 2000,
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
        aa1: { hp: 300, damage_percent: 0, floodable: false, effect: "AA reduced aim or none" },
        aa2: { hp: 300, damage_percent: 0, floodable: false, effect: "AA reduced aim or none" },
        bow: { hp: 500, damage_percent: 0, floodable: true, effect: "Flooding, reduced speed, reduced steering" },
        bridge: { hp: 300, damage_percent: 0, floodable: false, effect: "Crew damage, slow commands" },
        damagecontrol1: { hp: 300, damage_percent: 0, floodable: false, effect: "Reduced repair ability: flooding/fires" },
        damagecontrol2: { hp: 300, damage_percent: 0, floodable: false, effect: "Reduced repair ability: flooding/fires" },
        engine: { hp: 500, damage_percent: 0, floodable: false, effect: "Slower ship, slower acceleration, reduced power to turrets" },
        funnel: { hp: 300, damage_percent: 0, floodable: false, effect: "Slows ship, smoke effects" },
        hullaft1: { hp: 400, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullaft2: { hp: 400, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullfore1: { hp: 400, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullfore2: { hp: 400, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        hullmid: { hp: 400, damage_percent: 0, floodable: true, effect: "Slows ship, flooding, maybe damages crew" },
        magazine: { hp: 100, damage_percent: 0, floodable: false, effect: "1 hit kill" },
        prop: { hp: 500, damage_percent: 0, floodable: false, effect: "Slowed acceleration, reduced topspeed, or off completely" },
        rangefinder: { hp: 100, damage_percent: 0, floodable: false, effect: "Accuracy decrease / takes longer to solve" },
        rudder: { hp: 200, damage_percent: 0, floodable: false, effect: "Impacts or stops steering, may lock left/right" },
        torpedotube1: { hp: 300, damage_percent: 0, floodable: false, effect: "Slow launch or broken completely" },
        torpedotube2: { hp: 300, damage_percent: 0, floodable: false, effect: "Slow launch or broken completely" },
        turret1: { hp: 500, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" },
        turret2: { hp: 500, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" },
        turret3: { hp: 500, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" },
        turret4: { hp: 500, damage_percent: 0, floodable: false, effect: "Slow aiming, slow firing, reduced accuracy" }
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

  // Movement/control state migrated out of game.js
  const SPEED_MIN = profile.movement.min_speed_knots; // -8
  const SPEED_MAX = profile.movement.max_speed_knots; // 30
  const ACCEL_KTS_PER_SEC = 2; // reach 30kts in ~15s (30/2)

  const ship = {
    x: 512,
    y: 512,
    r: profile.dimensions.radius,
    heading: 0,
    desiredHeading: 0,
    speed: profile.movement.base_speed * 0.5, // Halved to match NPC speeds
    moveTarget: null,
  };

  let speedKts = 15;      // target speed from control (snapped)
  let actualSpeedKts = 0; // smooth actual speed following target

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

  // Rudder effectiveness grows with speed: 0 @ 0kts, 0.1 @ 5kts, 1.0 @ 30kts
  function rudderEffectiveness(ktsAbs) {
    const eff5 = profile.movement.rudder_effectiveness.effectiveness_at_5kts; // 0.1
    const t = Math.max(0, Math.min(1, (ktsAbs - 5) / (30 - 5)));
    return (ktsAbs <= 5) ? (eff5 * (ktsAbs / 5)) : (eff5 + (1 - eff5) * t);
  }

  // Expose a small API for game.js to integrate
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
    displayName: 'Battleship 1',
  };

  // Attach to window for classic script usage
  if (global) {
    global.shipProfile = profile;
    global.shipState = shipState;
    try {
      // Enforce fixed player ID policy: Friendly IDs 1-49, set player to ID 1
      shipState.id = 1;
      if (!shipState.displayName) shipState.displayName = `Friendly Battleship 1`;
      // Initialize next-id counter to 1 to avoid collisions; enemy IDs will be handled separately
      global.IronTideFleetNextId = 1;
      global.IronTideFleet = global.IronTideFleet || [];
      const __bmHandle = { state: shipState, profile };
      global.IronTideFleet.push(__bmHandle);
      // Register into global ShipPool and ShipHandlesById for unified lookups
      try {
        global.ShipPool = global.ShipPool || { friendly: { All: [], Battleship: [], Transport: [] }, enemy: { All: [], Battleship: [], Transport: [] } };
        if (!global.ShipPool.friendly.All.find(h => h && (h.state?.id === shipState.id))) global.ShipPool.friendly.All.push(__bmHandle);
        if (!global.ShipPool.friendly.Battleship.find(h => h && (h.state?.id === shipState.id))) global.ShipPool.friendly.Battleship.push(__bmHandle);
      } catch {}
      try { global.ShipHandlesById = global.ShipHandlesById || {}; global.ShipHandlesById[String(shipState.id)] = __bmHandle; } catch {}
      // Ensure friendly numbering picks up after the player (Battleship 1)
      try {
        const typeLabel = (profile && profile.type) ? profile.type : 'Ship';
        global.ShipCounters = global.ShipCounters || { enemy: {}, friendly: {} };
        // If no friendly count yet for this type, initialize to 1 (player is Battleship 1)
        const cur = global.ShipCounters.friendly[typeLabel] || 0;
        if (cur < 1) global.ShipCounters.friendly[typeLabel] = 1;
      } catch {}
    } catch {}
  }

  // Centralized Audio Manager for Bismarck
  (function setupAudio(){
    try {
      const audio = {
        inited: false,
        muted: false,
        // Looped engine sounds
        rest: null,
        engine: null,
        restVol: 0.6,
        engineVol: 0.6,
        _firstRun: true,
        // One-shot pools
        cannons: [],
        splashes: [],
        ensureInit(){
          if (this.inited) return;
          this.inited = true;
          // Create looped tracks
          try {
            this.rest = new Audio('assets/audio/shipatrest1.mp3');
            this.rest.loop = true; this.rest.preload = 'auto'; this.rest.volume = 0.0;
          } catch {}
          try {
            this.engine = new Audio('assets/audio/engine1.mp3');
            this.engine.loop = true; this.engine.preload = 'auto'; this.engine.volume = 0.0;
          } catch {}
          // One-shots
          try {
            ['assets/audio/cannon1.mp3','assets/audio/cannon2.mp3'].forEach(u=>{ const a=new Audio(u); a.preload='auto'; a.volume=0.9; audio.cannons.push(a); });
          } catch {}
          try {
            ['assets/audio/splash1.mp3','assets/audio/splash2.mp3'].forEach(u=>{ const a=new Audio(u); a.preload='auto'; a.volume=0.9; audio.splashes.push(a); });
          } catch {}
        },
        setMuted(m){ this.muted = !!m; try { if (this.rest) this.rest.muted = this.muted; if (this.engine) this.engine.muted = this.muted; } catch {} },
        // Crossfade logic based on actual speed
        updateEngineMix(){
          this.ensureInit();
          const kts = (shipState && typeof shipState.actualSpeedKts === 'number') ? Math.abs(shipState.actualSpeedKts) : 0;
          // Target gains: rest loud at ~0, engine increases with speed
          const t = Math.max(0, Math.min(1, kts / 12));
          const restTarget = (1 - t) * this.restVol;
          const engTarget = t * this.engineVol;
          // Lazy start playback if needed and allowed
          try { if (this.rest && this.rest.paused) this.rest.play().catch(()=>{}); } catch {}
          try { if (this.engine && this.engine.paused) this.engine.play().catch(()=>{}); } catch {}
          // On first run, snap to targets so sound is immediately audible
          if (this._firstRun) {
            try { if (this.rest) this.rest.volume = this.muted ? 0 : restTarget; } catch {}
            try { if (this.engine) this.engine.volume = this.muted ? 0 : engTarget; } catch {}
            this._firstRun = false;
            return;
          }
          // Smooth step toward targets
          const step = 0.15; // slightly faster response
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
      // Periodic updater for engine mix
      try { setInterval(()=> audio.updateEngineMix(), 300); } catch {}
      // User gesture unlock: start loops on first interaction to satisfy autoplay policies
      try {
        const unlock = () => {
          try { audio.updateEngineMix(); } catch {}
          try { audio.updateEngineMix(); } catch {}
          window.removeEventListener('pointerdown', unlock, true);
          window.removeEventListener('keydown', unlock, true);
          window.removeEventListener('touchend', unlock, true);
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
        window.addEventListener('touchend', unlock, true);
      } catch {}
      // Also try once DOM is ready (in case user has already interacted)
      try {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          audio.updateEngineMix();
        } else {
          window.addEventListener('DOMContentLoaded', () => { try { audio.updateEngineMix(); } catch {} });
        }
      } catch {}
      // Expose globally
      global.IronTideAudio = audio;
    } catch {}
  })();

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
