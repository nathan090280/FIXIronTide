// firingSolution.js
// Calculates shell damage and hit probability for a ship using shipState and DamageModel

(function(global){
  class FiringSolution {
    constructor(shipState, damageModel){
      if(!shipState || !damageModel) throw new Error("FiringSolution needs shipState + damageModel");
      this.state = shipState;
      this.profile = shipState.profile;
      this.damageModel = damageModel;
    }

    /**
     * Compute probability to hit target based on distance, speeds, turret accuracy, and rangefinder
     * @param {number} distanceMeters
     * @param {number} turretAccuracy 0..1
     * @param {number} rangefinderEffect 0..1
     * @param {number} attackerSpeedKnots
     * @param {number} targetSpeedKnots
     * @returns {number} 0..1 hit probability
     */
    computeHitProbability(distanceMeters, turretAccuracy, rangefinderEffect, attackerSpeedKnots, targetSpeedKnots){
      const maxRange = this.profile.weapons.main_battery.range_meters || 20000;

      // --- Distance penalty ---
      // Increase distance penalty by 30% (harsher falloff)
      const distanceRatio = distanceMeters / maxRange;
      let distancePenalty = Math.max(0, 1 - 1.3 * distanceRatio); // at max range: -100%
      distancePenalty = Math.min(1, distancePenalty); // never above 100%

      // --- Speed penalties ---
      // Attacker speed: 0.5% accuracy loss per knot
      const attackerPenalty = 1 - (attackerSpeedKnots * 0.005);
      // Target speed: 1% accuracy loss per knot
      const targetPenalty = 1 - (targetSpeedKnots * 0.01);

      // Clamp both
      const attackerFactor = Math.max(0.5, attackerPenalty); // at worst 50%
      const targetFactor = Math.max(0.3, targetPenalty);     // at worst 30%

      // --- Base probability (deterministic; no randomness here) ---
      const baseHit = turretAccuracy * rangefinderEffect * distancePenalty * attackerFactor * targetFactor;

      // Clamp 0..1 (randomness is applied only during computeDamage/fire)
      return Math.max(0, Math.min(1, baseHit));
    }

    /**
     * Calculate damage for a single shell
     */
    computeDamage(distanceMeters, baseDamage, hitProbability){
      if(Math.random() > hitProbability) return 0; // missed
      if(Math.random() < 0.1) return 0;            // dud chance (10%)

      // Random variance ±25%
      const variance = 0.75 + Math.random() * 0.5; // 0.75..1.25

      // Range damage reduction (max 25% weaker at max range)
      const maxRange = this.profile.weapons.main_battery.range_meters || 20000;
      const rangeFactor = Math.max(0.75, 1 - 0.25 * (distanceMeters / maxRange));

      return Math.round(baseDamage * variance * rangeFactor);
    }

    /**
     * Fire a shell at target
     */
    fireShell(preferredHitboxes, baseDamage, distanceMeters, turret, attackerSpeed=0, targetSpeed=0){
      const turretMods = this.state.effects.turrets[turret] || {accuracy:1};
      const turretAccuracy = turretMods.accuracy;
      const rangefinderEffect = this.state.effects.rangefinderEffectiveness || 1;

      const hitProb = this.computeHitProbability(distanceMeters, turretAccuracy, rangefinderEffect, attackerSpeed, targetSpeed);
      const damage = this.computeDamage(distanceMeters, baseDamage, hitProb);

      if(damage <= 0) return {hit:false, damage:0};

      // Helper: pick a random available hitbox from ALL intact hitboxes (open up all hitboxes)
      const allHitboxesObj = (this.profile && this.profile.damage && this.profile.damage.hitboxes) ? this.profile.damage.hitboxes : {};
      const pool = Object.keys(allHitboxesObj).filter(hb => allHitboxesObj[hb] && !allHitboxesObj[hb].destroyed);
      function pickRandom(arr){ return (arr && arr.length) ? arr[Math.floor(Math.random()*arr.length)] : null; }

      // First, decide if we targeted a discrete hitbox or the generic PNG hull (50/50)
      const goHitbox = Math.random() < 0.5;
      if (goHitbox) {
        const chosen = pickRandom(pool);
        if (chosen) {
          this.damageModel.applyDamage(chosen, damage);
          return {hit:true, hitbox:chosen, damage};
        }
        // If no available hitboxes, fall through to hull
      }

      // We hit the PNG hull: apply pass-through mechanic
      // 50% chance: solid hull impact (apply hull damage)
      if (Math.random() < 0.5) {
        this.damageModel.applyHullDamage(damage);
        return {hit:true, hitbox:"hull", damage};
      }

      // 50% chance: pass-through -> now 50% miss entirely OR 50% hit a random hitbox
      if (Math.random() < 0.5) {
        // Miss entirely (no damage)
        return {hit:false, damage:0};
      } else {
        const chosen = pickRandom(pool);
        if (chosen) {
          this.damageModel.applyDamage(chosen, damage);
          return {hit:true, hitbox:chosen, damage};
        }
        // No available hitboxes: treat as miss
        return {hit:false, damage:0};
      }
    }
  }

  if(global) global.FiringSolution = FiringSolution;
  try{ if(typeof module !== 'undefined' && module.exports) module.exports = FiringSolution; } catch {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
