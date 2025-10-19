// assets/shipProfile.js
// Exposes ship profile data and movement state/helpers for classic scripts via window.shipProfile and window.shipState
// Also supports ES module export when imported as a module.

(function(global){
  const profile = {
    name: "Bismarck",
    type: "Battleship",
    dimensions: { length: 250, beam: 36, draft: 10, radius: 14 },
    displacement_tons: 50900,
    crew: 2600,
    movement: {
      base_speed: 40,
      min_speed_knots: -8,
      max_speed_knots: 30,
      acceleration: { forward: 5, reverse: 3, neutral_zone: 0 },
      turn_rate_deg_per_sec: 10,
      rudder_effectiveness: { min_knots: 0, min_effectiveness: 0, max_knots: 30, max_effectiveness: 1.0, effectiveness_at_5kts: 0.1 }
    },
    weapons: {
      main_battery: { count: 4, reload_time_seconds: 10, range_meters: 20000, shell_speed_mps: 800 },
      secondary_battery: { count: 8, reload_time_seconds: 5, range_meters: 5000, shell_speed_mps: 900 },
      anti_aircraft: { count: 2, range_meters: 4000, rate_of_fire_rpm: 120 },
      torpedotubes: { count: 2, reload_time_seconds: 15 }
    },
    armor: { belt_mm: 500, turrets_mm: 500 },
    propulsion: { engine_power_shp: 1000, max_speed_knots: 30 },
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
    speed: profile.movement.base_speed,
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
  };

  // Attach to window for classic script usage
  if (global) {
    global.shipProfile = profile;
    global.shipState = shipState;
  }

  // Optional ES module export support
  try {
    // eslint-disable-next-line no-undef
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { shipProfile: profile, shipState };
    }
  } catch {}
  // ESM export when imported with type="module"
  try {
    // dynamic export not supported; consumers can import default via bundlers. Keeping window globals for now.
  } catch {}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
