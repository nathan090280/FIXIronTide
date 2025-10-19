// damageModel.js
// Applies incoming damage to specific ship hitboxes and hull integrity, updates runtime effects on shipState
// Works with bismarck.js shipState/profile structure (profile.damage.hitboxes & profile.damage.hullIntegrity)

(function(global){
  class DamageModel {
    /**
     * @param {object} shipState - window.shipState from bismarck.js (contains { profile, ship, ... })
     */
    constructor(shipState){
      if (!shipState || !shipState.profile || !shipState.profile.damage) {
        throw new Error('DamageModel requires a shipState with profile.damage');
      }
      this.state = shipState;
      this.profile = shipState.profile;
      this.hitboxes = this.profile.damage.hitboxes || {};
      
      // Initialize runtime fields for hitboxes
      for (const [name, hb] of Object.entries(this.hitboxes)) {
        if (typeof hb.max_hp !== 'number') hb.max_hp = hb.hp;
        if (typeof hb.destroyed !== 'boolean') hb.destroyed = false;
        if (typeof hb.flood_level !== 'number') hb.flood_level = 0; // percent 0..100
        if (typeof hb.on_fire !== 'boolean') hb.on_fire = false; // per-hitbox fire flag
        if (typeof hb.disabled !== 'boolean') hb.disabled = false;
      }

      // Initialize hullIntegrity if not present
      if (!this.profile.damage.hullIntegrity) {
        this.profile.damage.hullIntegrity = { maxHP: 4000, currentHP: 4000 };
      }

      // Effects aggregate stored on shipState so gameplay can consume without mutating profile constants
      this.state.effects = this.state.effects || this._defaultEffects();
      // Runtime fire lock flags (turrets lock 20% fire contribution once they reach 100% damage)
      this.state.fireLocks = this.state.fireLocks || { turret1:false, turret2:false, turret3:false, turret4:false };
      this.recomputeEffects();

      // Start periodic flooding progression (time-based) - 1% damage every 5s for partially flooded compartments
      this._setupFloodingTimer();
      // Start periodic fire progression (time-based) for specific compartments
      this._setupFireTimer();
    }

    _defaultEffects(){
      return {
        // Movement
        speedFactor: 1,       // multiplicative cap/scale on top speed
        accelFactor: 1,       // multiplicative scale on acceleration response
        turnRateFactor: 1,    // multiplicative scale on turn rate
        speedCapKts: this.profile.propulsion?.max_speed_knots || 30,
        // Rudder
        rudderEffectivenessScale: 1, // 0..1 multiplier applied to rudder effectiveness curve
        rudderJam: null,             // 'left' | 'right' | null
        // Sensors / Fire control
        rangefinderEffectiveness: 1, // 0..1
        // Command and DC
        commandDelaySeconds: 0,      // additional command latency
        repairEfficiency: 1,         // 0..1
        // Visuals
        funnelSmoke: 1,              // 0..1
        // Per-turret modifiers
        turrets: {
          turret1: { accuracy: 1, reloadMultiplier: 1 },
          turret2: { accuracy: 1, reloadMultiplier: 1 },
          turret3: { accuracy: 1, reloadMultiplier: 1 },
          turret4: { accuracy: 1, reloadMultiplier: 1 },
        },
        // State
        sunk: false,
      };
    }

    /**
     * Apply damage to a hitbox and recompute effects
     * @param {string} hitbox - name of the hitbox key under profile.damage.hitboxes
     * @param {number} dmg - incoming damage value (already adjusted by gunnery solution)
     */
    applyDamage(hitbox, dmg){
      const hb = this.hitboxes[hitbox];
      if (!hb) return;
      if (hb.destroyed) return;
      if (!isFinite(dmg) || dmg <= 0) return;

      hb.hp -= dmg;
      if (hb.hp <= 0) {
        hb.hp = 0;
        hb.destroyed = true;
      }

      // Maintain derived fields
      const hpPercent = hb.max_hp > 0 ? (hb.hp / hb.max_hp) : 0;
      hb.damage_percent = Math.round((1 - hpPercent) * 100);
      if (hb.floodable) hb.flood_level = Math.round((1 - hpPercent) * 100);

      this.recomputeEffects();
    }

    /**
     * Apply damage directly to the hull (missed hitboxes)
     * @param {number} dmg
     */
    applyHullDamage(dmg){
      const hull = this.profile.damage.hullIntegrity;
      if(!hull || dmg <= 0) return;
      hull.currentHP = Math.max(0, hull.currentHP - dmg);
      this.recomputeEffects();
    }

    /**
     * Recompute global effect aggregates from all hitboxes and hull
     */
    recomputeEffects(){
      const eff = this._defaultEffects();
      const move = this.profile.movement || {};
      const rudder = move.rudder_effectiveness || {};

      // Track worst-case speed cap contributions
      let speedCap = this.profile.propulsion?.max_speed_knots || 30;
      let speedScale = 1;
      let accelScale = 1;
      let turnScale = 1;

      // Hull integrity penalties
      const hull = this.profile.damage.hullIntegrity;
      if(hull && hull.maxHP > 0){
        const hullPct = hull.currentHP / hull.maxHP;
        speedScale *= hullPct;
        turnScale  *= hullPct;
        if(hullPct <= 0) eff.sunk = true; // Condition: Hull integrity reaches 0%
      }

      // Flooding compartments
      let floodedCount = 0;
      let anyFlood100 = false;
      // Track bow/engine/prop damage percent for penalties
      let bowDamagePercent = 0;
      let engineDamagePercent = 0;
      let propDamagePercent = 0;
      // Track average flooding percent across floodable compartments for speed cap rule
      let floodSumPercent = 0;
      let floodCount = 0;
      // Track Damage Control hitbox damage percents for efficiency calc
      let dc1DamageP = 0;
      let dc2DamageP = 0;

      // Track fire percent and 100% fire condition
      let firePercentAgg = 0;
      let anyFire100 = false;

      for (const [name, hb] of Object.entries(this.hitboxes)){
        const hpP = hb.max_hp > 0 ? (hb.hp / hb.max_hp) : 0; // 0..1
        // Hull flooding contributions
        if (hb.floodable) {
          // New rule: 1% penalty per 10% flooding for kinematics; also accumulate for speed cap percent later
          const floodP = hb.flood_level || Math.round((1 - hpP) * 100);
          const clampFlood = Math.max(0, Math.min(100, floodP));
          const floodFactor = 1 - (clampFlood * 0.001);
          speedScale *= Math.max(0, floodFactor);
          turnScale  *= Math.max(0, floodFactor);
          floodSumPercent += clampFlood;
          floodCount++;
          if(clampFlood >= 100) { floodedCount++; anyFlood100 = true; }
        }
        switch(name){
          case 'bow':
            // New rule: bow damage reduces speed and maneuverability by 1% per 10% damage
            bowDamagePercent = Math.max(0, Math.min(100, hb.damage_percent != null ? hb.damage_percent : Math.round((1 - hpP) * 100)));
            break;
          case 'rudder':
            eff.rudderEffectivenessScale = hpP; // linear scale with HP
            if (hb.destroyed && !eff.rudderJam) eff.rudderJam = (Math.random() < 0.5 ? 'left' : 'right');
            break;
          case 'prop':
            speedScale *= hpP;
            accelScale *= hpP;
            // Track prop damage percent for speed cap rule (1% per 10%)
            propDamagePercent = Math.max(0, Math.min(100, hb.damage_percent != null ? hb.damage_percent : Math.round((1 - hpP) * 100)));
            break;
          case 'engine':
            speedScale *= hpP;
            accelScale *= hpP;
            // Track engine damage percent for speed cap rule (2% per 10%)
            engineDamagePercent = Math.max(0, Math.min(100, hb.damage_percent != null ? hb.damage_percent : Math.round((1 - hpP) * 100)));
            break;
          case 'funnel':
            eff.funnelSmoke = hpP;
            speedScale *= Math.max(0, 1 - 0.25 * (1 - hpP)); // mild penalty when damaged
            break;
          case 'rangefinder':
            eff.rangefinderEffectiveness = hb.destroyed ? 0 : hpP;
            break;
          case 'bridge':
            eff.commandDelaySeconds = (1 - hpP) * 5;
            break;
          case 'damagecontrol1':
            dc1DamageP = Math.max(0, Math.min(100, hb.damage_percent != null ? hb.damage_percent : Math.round((1 - hpP) * 100)));
            break;
          case 'damagecontrol2':
            dc2DamageP = Math.max(0, Math.min(100, hb.damage_percent != null ? hb.damage_percent : Math.round((1 - hpP) * 100)));
            break;
          case 'magazine':
            if (hb.destroyed || (hb.damage_percent >= 100)) eff.sunk = true; // Condition: Magazine 100%
            break;
          case 'turret1':
          case 'turret2':
          case 'turret3':
          case 'turret4': {
            const key = name;
            eff.turrets[key] = {
              accuracy: hpP, // 0..1
              reloadMultiplier: hpP > 0 ? (1 / hpP) : 4, // slower reload as HP drops
            };
            // Lock fire contribution if turret hits 100% damage
            try {
              const hb = this.hitboxes[key];
              const dp = Math.max(0, Math.min(100, hb && typeof hb.damage_percent === 'number' ? hb.damage_percent : Math.round((1 - hpP) * 100)));
              if (dp >= 100 && this.state && this.state.fireLocks) this.state.fireLocks[key] = true;
            } catch {}
            break;
          }
          default:
            break;
        }
        // Accumulate fire percent: if on fire, contribute its damage percent
        try {
          const dp = Math.max(0, Math.min(100, typeof hb.damage_percent === 'number' ? hb.damage_percent : Math.round((1 - hpP) * 100)));
          if (hb.on_fire) {
            firePercentAgg = Math.max(firePercentAgg, dp); // take max as conservative global fire percent
            if (dp >= 100) anyFire100 = true;
          }
        } catch {}
      }

      // Condition: Flooding reaches 100% (global or any compartment flooded 100%)
      // Prefer explicit global flooding percent if present
      try {
        const gFlood = this.profile?.damage?.flooding?.level_percent;
        if (typeof gFlood === 'number' && isFinite(gFlood) && gFlood >= 100) eff.sunk = true;
      } catch {}
      if (anyFlood100) eff.sunk = true;

      // Compute average/global flooding percent (reuse later for turn penalty and speed cap)
      let avgFloodPercent_forTurn = 0;
      try {
        const gFlood = this.profile?.damage?.flooding?.level_percent;
        if (typeof gFlood === 'number' && isFinite(gFlood) && gFlood > 0) {
          avgFloodPercent_forTurn = Math.max(0, Math.min(100, gFlood));
        } else {
          avgFloodPercent_forTurn = floodCount > 0 ? (floodSumPercent / floodCount) : 0;
        }
      } catch { avgFloodPercent_forTurn = floodCount > 0 ? (floodSumPercent / floodCount) : 0; }

      // Apply an additional global flooding penalty to turning ability: 1% per 10% flooding
      if (avgFloodPercent_forTurn > 0) {
        const floodTurnFactor = 1 - (avgFloodPercent_forTurn * 0.001);
        turnScale *= Math.max(0, floodTurnFactor);
      }

      // Apply bow kinematic penalties (1% per 10% damage to speed/turn)
      if (bowDamagePercent > 0) {
        const bowFactor = 1 - (bowDamagePercent * 0.001);
        speedScale *= Math.max(0, bowFactor);
        turnScale  *= Math.max(0, bowFactor);
      }

      // Damage Control efficiency: each DC contributes up to -40%
      // Efficiency = 1 - 0.4*(dc1Damage/100) - 0.4*(dc2Damage/100), clamped to [0.2,1]
      let dcEff = 1 - 0.4 * (dc1DamageP/100) - 0.4 * (dc2DamageP/100);
      dcEff = Math.max(0.2, Math.min(1, dcEff));
      eff.repairEfficiency = dcEff;

      eff.speedFactor = Math.max(0, speedScale);
      eff.accelFactor = Math.max(0, accelScale);
      eff.turnRateFactor = Math.max(0, turnScale);
      // Expose an aggregate fire percent for UI/logic
      eff.firePercent = Math.max(0, Math.min(100, Math.round(firePercentAgg)));
      // Rudder jam policy: jam only when rudder is 100% damaged; persist until repaired below 100% or sunk
      try {
        const prevJam = (this.state && this.state.effects) ? this.state.effects.rudderJam : null;
        // Compute rudder damage percent from hitbox
        const rud = this.hitboxes && this.hitboxes['rudder'];
        const rudMax = rud && typeof rud.max_hp === 'number' ? rud.max_hp : 0;
        const rudHp  = rud && typeof rud.hp === 'number' ? rud.hp : rudMax;
        const rudDamP = (rudMax > 0) ? Math.round((1 - Math.max(0, Math.min(1, rudHp / rudMax))) * 100) : 0;
        if (rudDamP >= 100) {
          eff.rudderJam = prevJam || ((Math.random() < 0.5) ? 'left' : 'right');
        } else if (!eff.sunk) {
          eff.rudderJam = null;
        }
      } catch {}
      // Compute MAX SPEED cap from explicit damage rules
      const baseMax = (this.profile.propulsion?.max_speed_knots || speedCap || 30);
      // Prefer global flooding if provided; else average of compartments
      let avgFloodPercent = 0;
      try {
        const gFlood = this.profile?.damage?.flooding?.level_percent;
        if (typeof gFlood === 'number' && isFinite(gFlood) && gFlood > 0) {
          avgFloodPercent = Math.max(0, Math.min(100, gFlood));
        } else {
          avgFloodPercent = floodCount > 0 ? (floodSumPercent / floodCount) : 0;
        }
      } catch {
        avgFloodPercent = floodCount > 0 ? (floodSumPercent / floodCount) : 0;
      }
      // Percent reduction contributions (per rules): bow 1%/10%, flood 1%/10%, engine 6%/10%, prop 1%/10%
      const redBowPct    = bowDamagePercent     * 0.1; // 1% per 10% => 0.1 per 1%
      const redFloodPct  = avgFloodPercent      * 0.1;
      const redEnginePct = engineDamagePercent  * 0.6; // reduced by 25% from 0.8 -> 0.6
      const redPropPct   = propDamagePercent    * 0.1;
      let totalRedPct = redBowPct + redFloodPct + redEnginePct + redPropPct;
      if (!isFinite(totalRedPct) || totalRedPct < 0) totalRedPct = 0;
      // Cap reduction at 100%
      totalRedPct = Math.min(100, totalRedPct);
      const capKts = Math.max(0, baseMax * (1 - totalRedPct/100));
      eff.speedCapKts = capKts;

      // Additional Sunk conditions:
      // - Fire reaches 100%
      if (eff.firePercent >= 100 || anyFire100) eff.sunk = true;
      // - 4 hull sections (including Bow) at 100% damage
      try {
        const hb = this.hitboxes || {};
        const hullKeys = ['bow','hullfore1','hullfore2','hullmid','hullaft1','hullaft2'];
        let c100 = 0;
        for (const k of hullKeys) {
          const h = hb[k]; if (!h) continue;
          const dp = Math.max(0, Math.min(100, typeof h.damage_percent === 'number' ? h.damage_percent : (h.max_hp>0 ? Math.round((1 - (h.hp/(h.max_hp||h.hp||1))) * 100) : 0)));
          if (dp >= 100) c100++;
        }
        if (c100 >= 4) eff.sunk = true;
      } catch {}

      // Save back to shipState
      this.state.effects = eff;
      if (eff.sunk) this.state.sunk = true;
    }

    /**
     * Periodically increase damage in partially flooded compartments to simulate progressive flooding.
     * Rule: if bow or any hull compartment is partially flooded (flood_level 1..99),
     * increase its damage_percent by 1% every 5 seconds (clamped to 100%).
     * This updates hp consistently and mirrors flood_level to damage_percent.
     */
    _setupFloodingTimer(){
      try {
        if (this._floodTimer) return; // avoid multiple timers
        const FLOOD_KEYS = ['bow','hullfore1','hullfore2','hullmid','hullaft1','hullaft2'];
        const tick = ()=>{
          try {
            if (!this.hitboxes) return;
            let changed = false;
            for (const key of FLOOD_KEYS){
              const hb = this.hitboxes[key];
              if (!hb || !hb.floodable) continue;
              const lvl = Math.max(0, Math.min(100, typeof hb.flood_level === 'number' ? hb.flood_level : (hb.damage_percent||0)));
              let dmgP = Math.max(0, Math.min(100, typeof hb.damage_percent === 'number' ? hb.damage_percent : Math.round((1 - (hb.hp/(hb.max_hp||hb.hp||1))) * 100)));
              // Auto-flooding progresses ONLY when damage >= 50%, and ceases when repaired to <= 50%
              if (lvl > 0 && lvl < 100 && dmgP >= 50) {
                // apply +1% damage progression
                const next = Math.min(100, dmgP + 1);
                if (next !== dmgP) {
                  hb.damage_percent = next;
                  // sync HP to damage_percent
                  const maxhp = (typeof hb.max_hp === 'number' && hb.max_hp > 0) ? hb.max_hp : (typeof hb.hp === 'number' ? hb.hp : 0);
                  if (maxhp > 0) hb.hp = Math.max(0, Math.round(maxhp * (1 - next/100)));
                  // update destroyed flag
                  hb.destroyed = (next >= 100) || (hb.hp <= 0);
                  // mirror flood level to damage percent for now (game rule ties flooding to damage)
                  hb.flood_level = next;
                  changed = true;
                }
              }
            }
            if (changed) this.recomputeEffects();
          } catch {}
        };
        // 5 second cadence
        this._floodTimer = setInterval(tick, 5000);
      } catch {}
    }

    /**
     * Periodically check for fires on specified compartments and progress fire damage.
     * Compartments: Engine, Bridge, Magazine, Turret1-4
     * Rule:
     *  - When damage >= 50% and not already on fire, 10% chance to ignite every tick.
     *  - If on fire and damage >= 50% and < 100%, increase damage by 1% per tick.
     *  - If repaired to <= 50%, extinguish fire and stop progression.
     */
    _setupFireTimer(){
      try {
        if (this._fireTimer) return;
        const FIRE_KEYS = ['engine','bridge','magazine','turret1','turret2','turret3','turret4'];
        const tick = ()=>{
          try {
            if (!this.hitboxes) return;
            let changed = false;
            for (const key of FIRE_KEYS){
              const hb = this.hitboxes[key];
              if (!hb) continue;
              // compute current damage percent
              let dmgP = Math.max(0, Math.min(100, typeof hb.damage_percent === 'number' ? hb.damage_percent : (hb.max_hp>0 ? Math.round((1 - (hb.hp/(hb.max_hp||hb.hp||1))) * 100) : 0)));
              // Extinguish if repaired below threshold
              if (dmgP <= 50) {
                if (hb.on_fire) { hb.on_fire = false; changed = true; }
                continue;
              }
              // If not on fire and above threshold, chance to ignite
              if (!hb.on_fire && dmgP >= 50) {
                if (Math.random() < 0.10) { hb.on_fire = true; changed = true; }
              }
              // If on fire, progress damage until 100%
              if (hb.on_fire && dmgP >= 50 && dmgP < 100) {
                const next = Math.min(100, dmgP + 1);
                if (next !== dmgP) {
                  hb.damage_percent = next;
                  // sync HP
                  const maxhp = (typeof hb.max_hp === 'number' && hb.max_hp > 0) ? hb.max_hp : (typeof hb.hp === 'number' ? hb.hp : 0);
                  if (maxhp > 0) hb.hp = Math.max(0, Math.round(maxhp * (1 - next/100)));
                  hb.destroyed = (next >= 100) || (hb.hp <= 0);
                  changed = true;
                }
              }
            }
            if (changed) this.recomputeEffects();
          } catch {}
        };
        this._fireTimer = setInterval(tick, 5000);
      } catch {}
    }

    /**
     * Dispose timers and release references so the model can be GC'd
     */
    dispose(){
      try { if (this._floodTimer) { clearInterval(this._floodTimer); this._floodTimer = null; } } catch {}
      try { if (this._fireTimer)  { clearInterval(this._fireTimer);  this._fireTimer  = null; } } catch {}
      try { this.state = null; } catch {}
      try { this.profile = null; } catch {}
      try { this.hitboxes = null; } catch {}
    }
  }

  // Attach to window and support ESM default export
  if (global) {
    global.DamageModel = DamageModel;
  }
  try {
    if (typeof module !== 'undefined' && module.exports) module.exports = DamageModel;
  } catch {}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
