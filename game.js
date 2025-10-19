// Nautical Compass Game (minimal)
// - Renders assets/TESTMAPTMX.tmx background (map1.png imagelayer)
// - Uses TMX tile layer as collision grid (gid > 0 = collidable)
// - Player ship with heading set via on-screen compass or arrow keys

(function() {
  // If an older instance is running, cancel its RAF before reinitializing
  if (window.__NAUTICAL_RUNNING__ && window.__NAUTICAL_RAF__) {
    try { cancelAnimationFrame(window.__NAUTICAL_RAF__); } catch {}
  }

  // Fully remove a ship from all registries/arrays and clear heavy asset references.
  // Options: { emitSmoke: boolean }
  function fullyDespawnShipById(idStr, opts){
    try {
      const id = String(idStr||''); if (!id) return false;
      const res = (typeof window.resolveHandleByIdStrict === 'function') ? window.resolveHandleByIdStrict(id) : ((typeof window.resolveShipById === 'function') ? window.resolveShipById(id) : null);
      const handle = res && (res.handle || (res.state ? { state: res.state, profile: res.profile } : null));
      const st = handle && handle.state; const prof = handle && (handle.profile || st?.profile) || {};
      // Visual cue: prefer a one-shot explosion; avoid persistent funnel smoke that lingers
      if (opts && opts.emitSmoke && st && st.ship && Number.isFinite(st.ship.x) && Number.isFinite(st.ship.y)) {
        try { if (typeof spawnMightyExplosion === 'function') spawnMightyExplosion(st.ship.x, st.ship.y); } catch {}
      }
      // Null out heavy asset refs so PNG/TMX can be GC'd
      try { if (prof && typeof prof === 'object') { if ('image' in prof) prof.image = null; if (prof.damage && prof.damage.hitboxes) prof.damage.hitboxes = {}; if ('tmx' in prof) prof.tmx = null; } } catch {}
      try { if (handle && handle.damageModel) { handle.damageModel.profile = null; handle.damageModel.hitboxes = null; } } catch {}
      // Remove from ShipHandlesById
      try { if (window.ShipHandlesById && id in window.ShipHandlesById) delete window.ShipHandlesById[id]; } catch {}
      // Remove from arrays (exact ID match only)
      try { if (Array.isArray(window.IronTideFleet)) window.IronTideFleet = window.IronTideFleet.filter(h => !(h && h.state && String(h.state.id) === id)); } catch {}
      try { if (Array.isArray(window.NPCs)) window.NPCs = window.NPCs.filter(h => !(h && h.state && String(h.state.id) === id)); } catch {}
      // Remove from enemy set and fleet assignments
      try { if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(id); } catch {}
      try {
        const maps = [window.IronTideFleetAssignments, window.fleetAssignments, window.fa];
        maps.forEach(m => { try { [1,2,3].forEach(fid => { const set = m && m[fid]; if (set && typeof set.delete === 'function') set.delete(id); }); } catch {} });
      } catch {}
      // Cleanup visual resources like smoke emitters
      try { cleanupShipResources(id, st && st.ship ? st.ship : null); } catch {}
      return true;
    } catch { return false; }
  }
  try { window.fullyDespawnShipById = fullyDespawnShipById; } catch {}

  // === Target Leading Utilities ===
  // Track previous positions to estimate velocities (world units/sec)
  window.__PrevPos = window.__PrevPos || new Map();
  function trackEntityVelocity(id, x, y){
    try {
      const now = (typeof simTime === 'number' && isFinite(simTime)) ? simTime : ((performance.now ? performance.now() : Date.now()) / 1000);
      const key = String(id);
      const prev = window.__PrevPos.get(key);
      if (prev) {
        const dt = Math.max(1e-3, now - prev.t);
        const vx = (x - prev.x) / dt;
        const vy = (y - prev.y) / dt;
        prev.x = x; prev.y = y; prev.t = now; prev.vx = vx; prev.vy = vy;
        window.__PrevPos.set(key, prev);
        return { vx, vy };
      } else {
        window.__PrevPos.set(key, { x, y, t: now, vx: 0, vy: 0 });
        return { vx: 0, vy: 0 };
      }
    } catch { return { vx: 0, vy: 0 }; }
  }
  function getTrackedVelocity(id){
    try { const p = window.__PrevPos.get(String(id)); return p ? { vx: p.vx||0, vy: p.vy||0 } : { vx:0, vy:0 }; } catch { return { vx:0, vy:0 }; }
  }
  function getWuPerMeter(){
    try {
      const rangeMeters = (window.shipProfile && window.shipProfile.weapons && window.shipProfile.weapons.main_battery && window.shipProfile.weapons.main_battery.range_meters) || 20000;
      const rangeWorld = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 16000;
      return rangeWorld / Math.max(1, rangeMeters);
    } catch { return (typeof getMaxRangeWorld==='function'?getMaxRangeWorld():16000)/20000; }
  }
  function knotsToWorldUnitsPerSec(kts){
    const mps = (kts||0) * 0.514444;
    return mps * getWuPerMeter();
  }
  function resolveShipEntityById(id){
    const sid = String(id);
    try {
      if (window.IronTideFleet && Array.isArray(window.IronTideFleet)) {
        for (let i=0;i<window.IronTideFleet.length;i++){
          const h = window.IronTideFleet[i];
          if (h && h.state && String(h.state.id) === sid) {
            const sh = h.state.ship || {};
            return {
              x: sh.x, y: sh.y, heading: sh.heading,
              actualSpeedKts: h.state.actualSpeedKts, speedKts: h.state.speedKts
            };

  // Strict handle resolver: finds exact ship by ID from registries/arrays, no player fallback
  window.resolveHandleByIdStrict = function(idStr){
    try {
      const sid = String(idStr||''); if (!sid) return null;
      try { if (window.ShipHandlesById && window.ShipHandlesById[sid]) { const h = window.ShipHandlesById[sid]; return { state: h.state, profile: h.profile||h.state?.profile||null, handle: h }; } } catch {}
      if (Array.isArray(window.IronTideFleet)) {
        for (let i=0;i<window.IronTideFleet.length;i++){
          const h = window.IronTideFleet[i]; if (h && h.state && String(h.state.id) === sid) return { state: h.state, profile: h.profile||h.state?.profile||null, handle: h };
        }
      }
      if (Array.isArray(window.NPCs)) {
        for (let i=0;i<window.NPCs.length;i++){
          const n = window.NPCs[i]; if (n && n.state && String(n.state.id) === sid) return { state: n.state, profile: n.profile||n.state?.profile||n.damageModel?.profile||null, handle: n };
        }
      }
      return null;
    } catch { return null; }
  };

  // Helper: get live hitboxes reference for a ship by ID
  window.getShipHitboxesById = function(idStr){
    try {
      const r = window.resolveHandleByIdStrict(idStr); if (!r) return null;
      const h = r.handle, st = r.state, prof = r.profile;
      if (h && h.damageModel && h.damageModel.hitboxes) return h.damageModel.hitboxes;
      if (st && st.damageModel && st.damageModel.hitboxes) return st.damageModel.hitboxes;
      if (st && st.profile && st.profile.damage && st.profile.damage.hitboxes) return st.profile.damage.hitboxes;
      if (prof && prof.damage && prof.damage.hitboxes) return prof.damage.hitboxes;
      return null;
    } catch { return null; }
  };

  // Central sunk handling: mark ship sunk and prevent further interactions
  window.markShipSunkById = function(idStr){
    try {
      const id = String(idStr||''); if (!id) return false;
      const r = (typeof window.resolveShipById === 'function') ? window.resolveShipById(id) : null;
      const st = r && r.state; if (!st) return false;
      // Set sunk flags
      try { st.sunk = true; } catch {}
      try { st.effects = st.effects || {}; st.effects.sunk = true; } catch {}
      try { if (typeof st.displayName === 'string' && !st.displayName.includes('(SUNK)')) st.displayName += ' (SUNK)'; } catch {}
      try { window.ShipHighlight = window.ShipHighlight || {}; window.ShipHighlight[id] = false; } catch {}
      try { if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(id); } catch {}
      // Hide HUDs and stop cycles for this id
      try { if (typeof cleanupSunkShipById === 'function') cleanupSunkShipById(id); } catch {}
      // Promote next leader if needed
      try {
        // Determine fleet id: prefer state.fleetId, else check assignment maps
        let fid = st.fleetId || 0;
        if (!fid) {
          try {
            const maps = [window.IronTideFleetAssignments, window.fleetAssignments, window.fa];
            for (const m of maps) {
              if (!m) continue;
              for (const k of [1,2,3]) {
                const set = m[k];
                if (set && typeof set.has === 'function' && (set.has(id) || set.has(Number(id)))) { fid = k; break; }
              }
              if (fid) break;
            }
          } catch {}
        }
        if (fid) promoteFleetLeaderIfSunk(fid);
      } catch {}
      return true;
    } catch { return false; }
  };

  // Catastrophic detonation check (e.g., magazine 100%) -> explode and sink
  window.checkCatastrophicDetonation = function(handle){
    try {
      if (!handle || !handle.state) return;
      const st = handle.state;
      // Skip if already sunk
      if (st.effects?.sunk || st.sunk) return;
      // Prefer damageModel.hitboxes if present; else profile.damage.hitboxes
      const dm = handle.damageModel && handle.damageModel.hitboxes ? handle.damageModel.hitboxes : (handle.profile && handle.profile.damage && handle.profile.damage.hitboxes ? handle.profile.damage.hitboxes : null);
      if (!dm) return;
      // Heuristic: detonate if any hitbox indicates magazine/ammos reaching 100%
      const keys = Object.keys(dm);
      for (const k of keys) {
        const low = String(k).toLowerCase();
        const hb = dm[k] || {};
        const p = Number(hb.damage_percent);
        const detonates = !!hb.detonate || !!hb.explodes || !!hb.catastrophic;
        const nameMatch = /mag|ammo|ammun|powder|shell/.test(low);
        if ((detonates || nameMatch) && isFinite(p) && p >= 100) {
          // Spawn explosion at ship position
          try {
            const x = st.ship?.x, y = st.ship?.y;
            if (typeof spawnMightyExplosion === 'function' && typeof x === 'number' && typeof y === 'number') spawnMightyExplosion(x, y);
            if (typeof playExplodeSfx === 'function') playExplodeSfx(x, y);
          } catch {}
          // Mark sunk
          window.markShipSunkById(String(st.id));
          break;
        }
      }
    } catch {}
  };

  // Apply damage to ship by id in both profile and runtime damageModel (if present)
  window.applyDamageToShipId = function(idStr, hitboxName, percent){
    try {
      const id = String(idStr||''); if (!id) return false;
      const v = Math.max(0, Math.min(100, Number(percent)||0));
      // Resolve strictly by ID
      let r = (typeof window.resolveShipById === 'function') ? window.resolveShipById(id) : null;
      let st = r && r.state; let handle = r && r.handle; let prof = r && r.profile;
      // If resolve returned player or mismatched id, try direct registries
      if (!st || String(st.id) !== id) {
        try { if (window.ShipHandlesById && window.ShipHandlesById[id]) { const h = window.ShipHandlesById[id]; r = { state: h.state, handle: h, profile: h.profile||h.state?.profile||null }; } } catch {}
        if ((!r || !r.state) && Array.isArray(window.IronTideFleet)) {
          for (const h of window.IronTideFleet) { if (h && h.state && String(h.state.id) === id) { r = { state: h.state, handle: h, profile: h.profile||h.state?.profile||null }; break; } }
        }
        if ((!r || !r.state) && Array.isArray(window.NPCs)) {
          for (const n of window.NPCs) { if (n && n.state && String(n.state.id)===id) { r = { state: n.state, handle: n, profile: n.profile||n.state?.profile||n.damageModel?.profile||null }; break; } }
        }
        st = r && r.state; handle = r && r.handle; prof = r && r.profile;
      }
      if (!st || String(st.id)!==id) return false;
      // Skip sunk
      if (st.effects?.sunk || st.sunk) return false;
      // Ensure a live damageModel exists on handle for cruisers/others that missed initialization
      try {
        if (handle && (!handle.damageModel || !handle.damageModel.hitboxes)) {
          const fallback = (st && st.profile && st.profile.damage && st.profile.damage.hitboxes) ? st.profile.damage.hitboxes : (prof && prof.damage && prof.damage.hitboxes ? prof.damage.hitboxes : null);
          if (fallback) handle.damageModel = handle.damageModel || {}; handle.damageModel.hitboxes = handle.damageModel.hitboxes || fallback;
        }
      } catch {}
      const setOn = (hitboxes)=>{
        try {
          if (!hitboxes || typeof hitboxes !== 'object') return;
          const hb = hitboxes[hitboxName]; if (!hb) return;
          hb.damage_percent = v;
          if (typeof hb.max_hp === 'number' && hb.max_hp > 0) hb.hp = Math.max(0, Math.round((1 - v/100) * hb.max_hp));
        } catch {}
      };
      // Apply to all plausible containers
      try { if (handle && handle.damageModel && handle.damageModel.hitboxes) setOn(handle.damageModel.hitboxes); } catch {}
      try { if (st && st.profile && st.profile.damage && st.profile.damage.hitboxes) setOn(st.profile.damage.hitboxes); } catch {}
      try { if (prof && prof.damage && prof.damage.hitboxes) setOn(prof.damage.hitboxes); } catch {}
      try { if (st && st.damageModel && st.damageModel.hitboxes) setOn(st.damageModel.hitboxes); } catch {}
      // Run detonation check using a handle-like object
      try { if (handle) window.checkCatastrophicDetonation(handle); else if (st) window.checkCatastrophicDetonation({ state: st, profile: prof, damageModel: st.damageModel||handle?.damageModel||null }); } catch {}
      // If the exact edited hitbox name implies magazine/ammo and is at 100%, force detonation as a fallback
      try {
        const lowName = String(hitboxName||'').toLowerCase();
        const nameMatch = /mag|ammo|ammun|powder|shell/.test(lowName);
        if (nameMatch && v >= 100) {
          if (window.VerboseLogs) console.log(`[DET-FORCE] Forcing detonation on ship ${id} due to ${hitboxName}=100%`);
          // Ensure explosion SFX/FX
          try {
            const x = st.ship?.x, y = st.ship?.y;
            if (typeof spawnMightyExplosion === 'function' && typeof x === 'number' && typeof y === 'number') spawnMightyExplosion(x, y);
            if (typeof playExplodeSfx === 'function') playExplodeSfx(x, y);
          } catch {}
          window.markShipSunkById(String(st.id));
        }
      } catch {}
      return true;
    } catch { return false; }
  };
          }
        }
      }
    } catch {}
    try {
      if (Array.isArray(window.NPCs)) {
        for (let i=0;i<window.NPCs.length;i++){
          const n = window.NPCs[i];
          if (n && n.state && String(n.state.id) === sid) {
            const sh = n.state.ship || {};
            return {
              x: sh.x, y: sh.y, heading: sh.heading,
              actualSpeedKts: n.state.actualSpeedKts, speedKts: n.state.speedKts
            };
          }
        }
      }
    } catch {}
    return null;
  }
  function getEntityVelocityEstimate(entity, id){
    // Prefer tracked velocity; if nearly zero, estimate from heading and actualSpeedKts
    const v = getTrackedVelocity(id);
    if (Math.hypot(v.vx||0, v.vy||0) > 1e-3) return v;
    try {
      let ent = entity;
      if (!ent || (ent.actualSpeedKts==null && ent.speedKts==null && ent.heading==null)) {
        const resolved = resolveShipEntityById(id);
        if (resolved) ent = resolved;
      }
      // On-demand last-seen velocity estimation
      window.__LastSeen = window.__LastSeen || new Map();
      const now = (typeof simTime === 'number' && isFinite(simTime)) ? simTime : ((performance.now ? performance.now() : Date.now()) / 1000);
      if (ent && typeof ent.x === 'number' && typeof ent.y === 'number'){
        const prev = window.__LastSeen.get(String(id));
        if (prev && now > prev.t) {
          const dt = Math.max(1e-3, now - prev.t);
          const vx = (ent.x - prev.x) / dt;
          const vy = (ent.y - prev.y) / dt;
          window.__LastSeen.set(String(id), { x: ent.x, y: ent.y, t: now });
          if (Math.hypot(vx, vy) > 1e-3) return { vx, vy };
        } else {
          window.__LastSeen.set(String(id), { x: ent.x, y: ent.y, t: now });
        }
      }
      const kts = (ent && (ent.actualSpeedKts!=null ? ent.actualSpeedKts : ent.speedKts)) || 0;
      const hdg = (ent && ent.heading!=null ? ent.heading : (ent.state && ent.state.ship && ent.state.ship.heading)) || 0;
      const wps = knotsToWorldUnitsPerSec(Math.abs(kts));
      const rad = hdg * Math.PI/180;
      return { vx: Math.sin(rad) * wps, vy: -Math.cos(rad) * wps };
    } catch { return { vx:0, vy:0 }; }
  }
  function getShellSpeedWorldPerSec(){
    // Must match spawnShell projectile speed to ensure lead is accurate
    return 350;
  }
  function predictIntercept(shooter, target, targetVel, projSpeed){
    try {
      const rx = target.x - shooter.x, ry = target.y - shooter.y;
      const vx = targetVel.vx||0, vy = targetVel.vy||0;
      const a = vx*vx + vy*vy - projSpeed*projSpeed;
      const b = 2*(rx*vx + ry*vy);
      const c = rx*rx + ry*ry;
      let t = 0;
      if (Math.abs(a) < 1e-9) {
        // Linear case: target speed ~ projectile speed along line of sight
        t = (projSpeed > 1e-9) ? (Math.sqrt(c) / projSpeed) : 0;
      } else {
        const disc = b*b - 4*a*c;
        if (disc < 0) {
          // No real roots -> fallback to simple range time
          t = (projSpeed > 1e-9) ? (Math.sqrt(c) / projSpeed) : 0;
        } else {
          const sDisc = Math.sqrt(disc);
          const t1 = (-b + sDisc) / (2*a);
          const t2 = (-b - sDisc) / (2*a);
          // Choose the smallest positive root
          const candidates = [t1, t2].filter(x => x > 1e-4 && isFinite(x));
          if (candidates.length) {
            t = Math.min.apply(null, candidates);
          } else {
            t = (projSpeed > 1e-9) ? (Math.sqrt(c) / projSpeed) : 0;
          }
        }
      }
      return { x: target.x + (targetVel.vx||0) * t, y: target.y + (targetVel.vy||0) * t, t };
    } catch { return { x: target.x, y: target.y, t: 0 }; }
  }

  // Take over a specific ship by id as the player (keep it in IronTideFleet, just rebind as player)
  function takeoverShipById(idStr) {
    try {
      if (!idStr) return false;
      // Find handle by id in IronTideFleet
      let h = null;
      if (Array.isArray(window.IronTideFleet)) {
        for (let i = 0; i < window.IronTideFleet.length; i++) {
          const cand = window.IronTideFleet[i];
          if (cand && cand.state && String(cand.state.id) === String(idStr)) { h = cand; break; }
        }
      }
      if (!h || !h.state || !h.state.ship) return false;
      const id = String(h.state.id);
      // Remove from NPC behavior list (but keep in IronTideFleet for rendering)
      try { if (Array.isArray(window.NPCs)) window.NPCs = window.NPCs.filter(n => !(n && n.state && String(n.state.id) === id)); } catch {}
      try { if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(id); } catch {}
      // Ensure assigned to Fleet 1 for player control
      try {
        const fa = window.IronTideFleetAssignments || { 1:new Set(),2:new Set(),3:new Set() };
        [1,2,3].forEach(k=>{ try { if (fa[k] instanceof Set) fa[k].delete(id); } catch {} });
        if (fa[1] instanceof Set) fa[1].add(id);
      } catch {}
      // Scrub ID 50 from any legacy arrays that might imply friendly membership
      try {
        if (window.fleetMembers && window.fleetMembers[1]) {
          window.fleetMembers[1] = window.fleetMembers[1].filter(h => String(h?.state?.id) !== '50');
        }
      } catch {}
      try {
        if (Array.isArray(window.controllableShips)) {
          window.controllableShips = window.controllableShips.filter(h => String(h?.state?.id) !== '50');
        }
      } catch {}
      try {
        if (Array.isArray(window.allShips)) {
          window.allShips = window.allShips.filter(h => String(h?.state?.id) !== '50');
        }
      } catch {}
      // Switch global player references (this ship IS now the player)
      // CRITICAL: Copy properties from new ship to the existing globals so const references continue to work
      try {
        if (window.shipState && h.state) {
          Object.assign(window.shipState, h.state);
        } else {
          window.shipState = h.state;
        }
      } catch {}
      try {
        if (window.ship && h.state.ship) {
          // Copy all properties from new ship to existing ship object so const references work
          Object.keys(h.state.ship).forEach(k => { try { window.ship[k] = h.state.ship[k]; } catch {} });
          // Also set direct properties
          window.ship.x = h.state.ship.x;
          window.ship.y = h.state.ship.y;
          window.ship.heading = h.state.ship.heading;
          window.ship.desiredHeading = h.state.ship.desiredHeading;
          window.ship.speed = h.state.ship.speed;
        } else {
          window.ship = h.state.ship;
        }
      } catch {}
      try { window.shipProfile = h.profile; } catch {}
      try { if (h.damageModel) { window.damageModel = h.damageModel; } } catch {}
      // Recreate main battery firing solution bound to new player
      try {
        if (window.FiringSolution && window.damageModel && window.shipState) {
          window.mainBatteryFS = new window.FiringSolution(window.shipState, window.damageModel);
        }
      } catch {}
      // Reset targeting and FIRE
      try { if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false); } catch {}
      try { if (window.firingSolution) { window.firingSolution.target = null; window.firingSolution.targetId = null; } } catch {}
      // Move camera to new ship
      try { if (typeof camera === 'object') { camera.cx = h.state.ship.x; camera.cy = h.state.ship.y; currentViewRect = getViewRect(); } } catch {}
      // Clear despawn flag if set
      try { window.PlayerDespawned = false; } catch {}
      // Enable follow
      try { window.viewFollow = window.viewFollow || { enabled:true, mode:'ship', shipId:id }; window.viewFollow.enabled = true; window.viewFollow.mode = 'ship'; window.viewFollow.shipId = id; } catch {}
      console.log(`[TAKEOVER] Promoted ship ${id} to player control`);
      return true;
    } catch { return false; }
  }

  // Promote next ship to fleet leader if current leader is sunk.
  function promoteFleetLeaderIfSunk(fid) {
    try {
      const leader = getFleetLeader(fid);
      if (!leader || !leader.state) return;
      const sunk = !!(leader.state.effects?.sunk || leader.state.sunk);
      if (!sunk) return;
      const sunkId = String(leader.state.id);
      // If we've already processed this sunk leader, skip
      window.__ProcessedSunkLeaders__ = window.__ProcessedSunkLeaders__ || new Set();
      if (window.__ProcessedSunkLeaders__.has(`${fid}:${sunkId}`)) return;
      window.__ProcessedSunkLeaders__.add(`${fid}:${sunkId}`);
      // Ensure sunk flags set and highlight cleared
      try { leader.state.sunk = true; } catch {}
      try { leader.state.effects = leader.state.effects || {}; leader.state.effects.sunk = true; } catch {}
      try { if (typeof leader.state.displayName === 'string' && !leader.state.displayName.includes('(SUNK)')) leader.state.displayName += ' (SUNK)'; } catch {}
      try { window.ShipHighlight = window.ShipHighlight || {}; window.ShipHighlight[sunkId] = false; } catch {}
      try { if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(sunkId); } catch {}
      // Choose next alive ship in this fleet
      const members = getFleetMembers(fid);
      let nextId = null;
      for (let i = 0; i < members.length; i++) {
        const id = members[i];
        if (id === sunkId) continue;
        // ensure alive
        const h = getShipHandleById(id);
        if (h && h.state && !(h.state.effects?.sunk || h.state.sunk)) { nextId = id; break; }
      }
      // Despawn the sunk leader: remove images/TMX, emit funnel smoke, remove from registries and assignments
      try { fullyDespawnShipById(sunkId, { emitSmoke: true }); } catch {}
      if (!nextId) { return; }
      if (fid === 1) {
        // Take over as the new player ship
        takeoverShipById(nextId);
      } else {
        // For fleets 2/3, simply snap to new leader and keep follow
        try { snapCameraToFleetLeader(fid); } catch {}
        try { window.viewFollow = window.viewFollow || { enabled:true, mode:'fleet', fleetId: fid }; window.viewFollow.enabled = true; window.viewFollow.mode = 'fleet'; window.viewFollow.fleetId = fid; } catch {}
      }
    } catch {}
  }

  // Ensure Damage Control global exists upfront and won't be clobbered later
  (function initDamageControlGlobal(){
    try {
      const defaults = { mode: 0, team1: null, team2: null, team1ShipId: '', team2ShipId: '', cursorOn: false };
      if (!window.DamageControl) {
        window.DamageControl = defaults;
      } else {
        // Merge without losing any existing assignments
        window.DamageControl = Object.assign({}, defaults, window.DamageControl);
      }
    } catch {}
  })();

  // Public API: assign/clear Damage Control targets by ship id so they persist while you switch HUDs
  // Resolve a ship handle and its profile/state by id. Searches player, fleet, and NPCs.
  window.resolveShipById = function(idStr){
    try {
      const sid = String(idStr||'');
      const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
      if (sid && playerId && sid === playerId) {
        return { profile: window.shipProfile, state: window.shipState, handle: null };
      }
      if (Array.isArray(window.IronTideFleet)) {
        for (let i=0;i<window.IronTideFleet.length;i++){
          const h = window.IronTideFleet[i];
          if (h && h.state && String(h.state.id) === sid) return { profile: h.profile, state: h.state, handle: h };
        }
        // Trigger a redraw to reflect dashed animation direction immediately
        try { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(()=>{}); } catch {}
      }
      if (Array.isArray(window.NPCs)) {
        for (let i=0;i<window.NPCs.length;i++){
          const n = window.NPCs[i];
          if (n && n.state && String(n.state.id) === sid) return { profile: n.profile||n.damageModel?.profile||null, state: n.state, handle: n };
        }
      }
    } catch {}
    return { profile: window.shipProfile, state: window.shipState, handle: null };
  };

  // Apply repair to a profile's hitbox in a damage-model-friendly way
  window.applyRepairToProfile = function(profile, hitboxName, amount){
    try {
      if (!profile || !profile.damage || !profile.damage.hitboxes) return;
      const hb = profile.damage.hitboxes[hitboxName];
      if (!hb) return;
      const max = (typeof hb.max_hp === 'number' && hb.max_hp > 0) ? hb.max_hp : (typeof hb.hp === 'number' ? Math.max(1, hb.hp) : 0);
      if (!max || amount <= 0) return;
      if (typeof hb.hp !== 'number') hb.hp = max;
      // Prefer repairing via percent if damage_percent exists to keep 100% -> 0% clear
      if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) {
        const deltaP = (amount / max) * 100;
        // Keep internal value with fractional precision for smooth accumulation; round only on display
        hb.damage_percent = Math.max(0, Math.min(100, hb.damage_percent - deltaP));
        // Sync hp to percent for consistency (hp can be rounded to integer pixels)
        hb.hp = Math.max(0, Math.min(max, Math.round(max * (1 - hb.damage_percent/100))));
      } else {
        // Repair directly in HP and derive percent
        hb.hp = Math.max(0, Math.min(max, hb.hp + amount));
        const hpP = Math.max(0, Math.min(1, hb.hp / max));
        hb.damage_percent = Math.max(0, Math.min(100, Math.round((1 - hpP) * 100)));
      }
      // Extinguish and deflood when repaired below thresholds
      if (hb.damage_percent <= 50) {
        if (hb.on_fire) hb.on_fire = false;
        if (hb.floodable && typeof hb.flood_level === 'number') hb.flood_level = 0;
      }
    } catch {}
  };

  // Assign Damage Control team to a specific ship id and hitbox. team = 1 or 2.
  window.assignDamageControl = function(shipId, hitboxName, team){
    try {
      const teamNum = (team === 2) ? 2 : 1;
      if (!hitboxName || typeof hitboxName !== 'string') return false;
      const idStr = String(shipId||'');
      if (!idStr) return false;
      // Validate that the target ship exists and has the hitbox
      const tgt = window.resolveShipById(idStr) || {};
      const prof = tgt.profile && tgt.profile.damage && tgt.profile.damage.hitboxes ? tgt.profile.damage.hitboxes : null;
      if (!prof || !prof[hitboxName]) return false;
      window.DamageControl['team'+teamNum] = hitboxName;
      window.DamageControl['team'+teamNum+'ShipId'] = idStr;
      return true;
    } catch { return false; }
  };

  // Clear assignment for a team
  window.clearDamageControl = function(team){
    const teamNum = (team === 2) ? 2 : 1;
    try {
      window.DamageControl['team'+teamNum] = null;
      window.DamageControl['team'+teamNum+'ShipId'] = '';
    } catch {}
  };

  // Convenience: send Team 1 or 2 to the most damaged eligible compartment on a ship
  window.assignDCMostDamaged = function(shipId, options){
    try {
      const opts = options || {};
      const teamNum = (opts.team === 2) ? 2 : 1;
      const preferFlood = !!opts.preferFlood; // if true, prefer floodable compartments with highest damage
      const tgt = window.resolveShipById(String(shipId||'')) || {};
      const hbs = (tgt.profile && tgt.profile.damage && tgt.profile.damage.hitboxes) || {};
      let best = null; let bestScore = -1;
      const keys = Object.keys(hbs);
      for (const k of keys){
        const hb = hbs[k]; if (!hb) continue;
        const hp = (typeof hb.hp === 'number') ? hb.hp : hb.max_hp;
        const max = hb.max_hp || hp || 1;
        const dmgP = (typeof hb.damage_percent === 'number') ? hb.damage_percent : Math.round((1 - Math.max(0, Math.min(1, hp/max))) * 100);
        const floodable = !!hb.floodable;
        // Skip non-repairable cosmetic boxes if desired; here we consider all defined hitboxes
        let score = dmgP;
        if (preferFlood && floodable) score += 10;
        if (score > bestScore) { bestScore = score; best = k; }
      }
      if (!best) return false;
      return window.assignDamageControl(String(shipId||''), best, teamNum);
    } catch { return false; }
  };

  // Helper: start per-fleet solution timer (for Fleet 2/3 UI + logic)
  function startFleetSolutionTimer(fid){
    try {
      if (fid !== 2 && fid !== 3) return;
      window.FleetSolutionCalc = window.FleetSolutionCalc || { 1:{},2:{},3:{} };
      const sc = window.FleetSolutionCalc[fid] || (window.FleetSolutionCalc[fid] = {});
      sc.active = true;
      sc.start = performance.now();
      sc.duration = (typeof computeSolutionDurationSec === 'function' ? computeSolutionDurationSec() : 6) * 1000;
      // Show/update progress bar on the correct fleet's button
      const btnF = document.querySelector(`#navalDock .get-firing-solution-btn[data-fleet="${fid}"]`);
      if (btnF) {
        let trackF = btnF.querySelector('.solution-progress');
        if (!trackF) {
          trackF = document.createElement('div');
          trackF.className = 'solution-progress';
          const barF = document.createElement('div');
          barF.className = 'bar';
          trackF.appendChild(barF);
          btnF.appendChild(trackF);
        }
        trackF.style.display = 'block';
        const barF = trackF.querySelector('.bar');
        if (barF) barF.style.width = '0%';
      }
      // Also save a numeric progress field for robust completion checks
      sc.progress = 0;
    } catch {}
  }

  // New: Render turret lines for a fleet leader in world space, independent of Fleet 1
  function drawFleetTurretLinesWorld(fid) {
    try {
      // Preconditions
      if (!shipImg || !turretImg || !Array.isArray(turretPoints)) return;
      
      // Check if this fleet has gunnery enabled
      let gunneryEnabled = false;
      if (fid === 1) {
        // Fleet 1 uses original gunnery system
        gunneryEnabled = !!(window.gunnery && window.gunnery.enabled);
      } else {
        // Fleet 2/3 use FleetGunnery system
        window.FleetGunnery = window.FleetGunnery || { 1:{},2:{},3:{} };
        const g = window.FleetGunnery[fid] || {};
        gunneryEnabled = !!g.gunneryEnabled;
      }

      // Highlight management: show green ring only for ships in the active context (selected fleet or opened fleet modal)
      function setFleetHighlightsFor(fleetId){
        try {
          window.ShipHighlight = window.ShipHighlight || {};
          const assign = window.IronTideFleetAssignments || {};
          // Disable all highlights first
          try {
            if (Array.isArray(window.IronTideFleet)) {
              window.IronTideFleet.forEach(h=>{ if (h && h.state) window.ShipHighlight[String(h.state.id)] = false; });
            }
            if (Array.isArray(window.NPCs)) {
              window.NPCs.forEach(n=>{ if (n && n.state) window.ShipHighlight[String(n.state.id)] = false; });
            }
          } catch {}
          // Enable for target fleet
          const set = assign[fleetId];
          if (set instanceof Set) {
            set.forEach(id=>{ window.ShipHighlight[String(id)] = true; });
          }
          console.log('[Highlight] Active fleet', fleetId, 'highlighted');
        } catch {}
      }

      function clearShipHighlight(shipId){
        try { window.ShipHighlight = window.ShipHighlight || {}; window.ShipHighlight[String(shipId)] = false; } catch {}
      }

      function snapToFleetLeader(fleetId){
        try {
          const set = getFleetSettings(fleetId);
          const leaderId = set && set.leaderId ? String(set.leaderId) : null;
          if (!leaderId) return;
          const h = getHandleById(leaderId);
          const s = h && h.state && h.state.ship ? h.state.ship : null;
          if (!s) return;
          camera.cx = s.x; camera.cy = s.y; currentViewRect = getViewRect();
          window.viewFollow = window.viewFollow || {};
          window.viewFollow.enabled = true;
          window.viewFollow.mode = 'ship';
          window.viewFollow.shipId = leaderId;
        } catch {}
      }

      const fa = window.IronTideFleetAssignments || {};
      const hasShips = !!(fa[fid] instanceof Set && fa[fid].size > 0);
      if (!hasShips) return;

      // Draw ONLY the fleet leader to avoid too many lines
      const leader = (typeof getFleetLeader === 'function') ? getFleetLeader(fid) : null;
      if (!leader || !leader.state || !leader.state.ship) return;

      // Resolve target for the fleet (pin first, then targetId, then nearest enemy center)
      let target = null;
      try {
        if (fid === 1) {
          // Fleet 1 uses firingSolution system
          if (window.firingSolution && window.firingSolution.target && Number.isFinite(window.firingSolution.target.x) && Number.isFinite(window.firingSolution.target.y)) {
            target = { x: window.firingSolution.target.x, y: window.firingSolution.target.y };
          } else if (window.firingSolution && window.firingSolution.targetId != null) {
            const tid = String(window.firingSolution.targetId);
            const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
            for (let i=0;i<others.length;i++) { const s = others[i]; if (String(s.id) === tid) { target = { x: s.x, y: s.y }; break; } }
          }
        } else {
          // Fleet 2/3 use FleetGunnery system
          const g = window.FleetGunnery[fid] || {};
          if (g.target && Number.isFinite(g.target.x) && Number.isFinite(g.target.y)) {
            target = { x: g.target.x, y: g.target.y };
          } else if (g.targetId != null) {
            const tid = String(g.targetId);
            const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
            for (let i=0;i<others.length;i++) { const s = others[i]; if (String(s.id) === tid) { target = { x: s.x, y: s.y }; break; } }
          }
        }
      } catch {}
      if (!target) {
        // Fallback: nearest enemy NPC center
        try {
          const enemySet = window.EnemyFleet1 instanceof Set ? window.EnemyFleet1 : new Set();
          if (Array.isArray(window.NPCs) && enemySet.size > 0) {
            let best = null; let bestD = 1e15;
            // Use camera center as reference, since per-ship 'st' isn't defined yet here
            const vrRef = currentViewRect || getViewRect();
            const refx = vrRef && Number.isFinite(vrRef.cx) ? vrRef.cx : 0;
            const refy = vrRef && Number.isFinite(vrRef.cy) ? vrRef.cy : 0;
            for (let i=0;i<window.NPCs.length;i++){
              const n = window.NPCs[i];
              if (!n || !n.state || !n.state.ship) continue;
              const idStr = String(n.state.id);
              if (!enemySet.has(idStr)) continue;
              const dx = n.state.ship.x - refx; const dy = n.state.ship.y - refy;
              const d = Math.hypot(dx, dy);
              if (d < bestD) { bestD = d; best = { x: n.state.ship.x, y: n.state.ship.y }; }
            }
            if (best) target = best;
          }
        } catch {}
      }

      // Only render turret lines when this fleet's gunnery is enabled
      if (!gunneryEnabled) return;

      // Compute sprite world dimensions to transform turret points
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const targetHBase = 96;
      const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
      const worldH = Math.max(1, targetHScreen / scale);
      const worldW = (shipImg && shipImg.width && shipImg.height) ? Math.round((shipImg.width / shipImg.height) * worldH) : worldH;
      const sx = worldW / shipImg.width;
      const sy = worldH / shipImg.height;

      const byId = new Map(turretPoints.map(p => [p.id, p]));
      
      // Prepare a shipHandle-like object for the leader for angle sourcing
      const shipHandle = { kind: (leader.isPlayer ? 'player' : 'npc'), state: leader.state, ship: leader.state.ship };
      const st = shipHandle.ship;

        ['t1','t2','t3','t4'].forEach(id => {
        const p = byId.get(id); if (!p) return;
        const tx = (p.x - shipImg.width / 2) * sx;
        const ty = (p.y - shipImg.height / 2) * sy;
        const forwardDelta = (id === 't1') ? (5 / scale) : 0;
          // Relative turret angle from current ship (handle both player and NPC ships)
          let relDeg = 0;
          try {
            if (shipHandle.kind === 'player' && window.turretAnglesRelDeg) {
              relDeg = (typeof window.turretAnglesRelDeg[id] === 'number') ? window.turretAnglesRelDeg[id] : (id==='t3'||id==='t4' ? 180 : 0);
            } else if (shipHandle.kind === 'npc' && shipHandle.state && shipHandle.state.npcTurretAnglesRelDeg) {
              relDeg = (typeof shipHandle.state.npcTurretAnglesRelDeg[id] === 'number') ? shipHandle.state.npcTurretAnglesRelDeg[id] : (id==='t3'||id==='t4' ? 180 : 0);
            } else {
              relDeg = (id==='t3'||id==='t4' ? 180 : 0);
            }
          } catch { relDeg = (id==='t3'||id==='t4' ? 180 : 0); }

          // Compute muzzle world position from current ship transform and turret offset
        const hr = (st.heading || 0) * Math.PI/180;
        const lx = tx; const ly = ty - forwardDelta;
        const twx = st.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
        const twy = st.y + (lx * Math.sin(hr) + ly * Math.cos(hr));

        // Determine desired/occlusion/alignment
        let makeGreen = false;
        let dxL = 0, dyL = -1200; // default long barrel line if no target
        if (target) {
          const wdx = target.x - twx; const wdy = target.y - twy;
          const desiredWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
          const desiredRel = angleNorm360(desiredWorld - (st.heading || 0));
          const isTop = (id === 't1' || id === 't2');
          const ds = isTop ? 145 : 325;
          const de = isTop ? 235 : 55;
          const occluded = inDeadZone(desiredRel, ds, de);
          const delta = ((desiredRel - relDeg + 540) % 360) - 180;
          // Alignment window: allow firing readiness within Â±135Â° from turret forward
          const aligned = Math.abs(delta) <= 135;
          const dist = Math.hypot(wdx, wdy);
          const maxRange = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : Infinity;
          // Solution must be COMPLETE (timer done) for this fleet
          let solutionComplete = false;
          if (fid === 1) {
            // Fleet 1 uses solutionCalc system
            const sc = window.solutionCalc || {};
            const progress = (typeof sc.progress === 'number') ? sc.progress : (typeof sc.pct === 'number' ? sc.pct : null);
            solutionComplete = ((!!sc.start) && !sc.active) || (progress != null && progress >= 1);
          } else {
            // Fleet 2/3 use FleetSolutionCalc system
            const fsc = (window.FleetSolutionCalc && window.FleetSolutionCalc[fid]) || {};
            const progress = (typeof fsc.progress === 'number') ? fsc.progress : (typeof fsc.pct === 'number' ? fsc.pct : null);
            solutionComplete = ((!!fsc.start) && !fsc.active) || (progress != null && progress >= 1);
          }
          // Green only when: solution complete AND aligned AND not occluded AND within range
          makeGreen = solutionComplete && aligned && !occluded && dist <= maxRange;

          // Convert world vector to turret-local and draw exactly to the target point
          const totalRad = ((st.heading || 0) + relDeg) * Math.PI/180;
          const cosi = Math.cos(-totalRad), sini = Math.sin(-totalRad);
          dxL = wdx * cosi - wdy * sini;
          dyL = wdx * sini + wdy * cosi;
        }

        // Draw line from turret muzzle to target using world coordinates
        // Track player velocity for lead calculations
    try { if (window.shipState && window.shipState.id != null && ship) trackEntityVelocity(String(window.shipState.id), ship.x, ship.y); } catch {}
    ctx.save();
        ctx.strokeStyle = makeGreen ? 'rgba(40,220,60,0.95)' : 'rgba(220,40,40,0.95)';
        ctx.lineWidth = Math.max(1.25, 2 / (scale || 1));
        ctx.beginPath();
        ctx.moveTo(twx, twy);
        if (target) {
          ctx.lineTo(target.x, target.y);
        } else {
          // Default line forward from turret
          const lineRad = ((st.heading || 0) + relDeg) * Math.PI/180;
          const endX = twx + Math.sin(lineRad) * 1200;
          const endY = twy - Math.cos(lineRad) * 1200;
          ctx.lineTo(endX, endY);
        }
          ctx.stroke();
          ctx.restore();
        }); // End turret forEach
    } catch {}
  }

  // Cleanup resources tied to a ship so they can be GC'd (smoke emitters, active emitter keys)
  function cleanupShipResources(idStr, shipRef){
    try {
      // Remove persistent/temporary smoke emitters bound to this ship
      try {
        if (Array.isArray(blackSmokeEmitters)) {
          const keep = [];
          for (let i=0;i<blackSmokeEmitters.length;i++){
            const em = blackSmokeEmitters[i];
            if (!em) continue;
            if (em.ship === shipRef) continue; // drop
            keep.push(em);
          }
          blackSmokeEmitters.length = 0; Array.prototype.push.apply(blackSmokeEmitters, keep);
        }
      } catch {}
      // Clear active damage emitter keys for this id
      try {
        if (window.ActiveDamageEmitters instanceof Set) {
          const next = new Set();
          window.ActiveDamageEmitters.forEach(k=>{
            try { if (typeof k === 'string' && !k.startsWith(String(idStr)+':')) next.add(k); } catch { next.add(k); }
          });
          window.ActiveDamageEmitters = next;
        }
      } catch {}
    } catch {}
  }

  // --- Sunk Explosion and Sink SFX ---
  const explodeSfx = { url: 'assets/audio/explode1.mp3', pool: [], inited: false };
  function initExplodeAudio(){
    if (explodeSfx.inited) return; explodeSfx.inited = true;
    try {
      for (let i=0;i<3;i++){ const a = new Audio(explodeSfx.url); a.preload='auto'; a.volume=1.0; explodeSfx.pool.push(a); }
    } catch {}
  }
  function playExplodeSound(){
    try {
      if (!explodeSfx.inited) initExplodeAudio();
      let a = null;
      for (let i=0;i<explodeSfx.pool.length;i++){ if (explodeSfx.pool[i].paused) { a = explodeSfx.pool[i]; break; } }
      if (!a && explodeSfx.pool.length) a = explodeSfx.pool[0].cloneNode();
      if (a) { a.currentTime = 0; a.play().catch(()=>{}); }
    } catch {}
  }
  const sinkSfx = { url: 'assets/audio/sink1.mp3', pool: [], inited: false };
  function initSinkAudio(){
    if (sinkSfx.inited) return; sinkSfx.inited = true;
    try {
      for (let i=0;i<2;i++){ const a = new Audio(sinkSfx.url); a.preload='auto'; a.volume=0.95; sinkSfx.pool.push(a); }
    } catch {}
  }
  function playSinkSound(){
    try {
      if (!sinkSfx.inited) initSinkAudio();
      let a = null;
      for (let i=0;i<sinkSfx.pool.length;i++){ if (sinkSfx.pool[i].paused) { a = sinkSfx.pool[i]; break; } }
      if (!a && sinkSfx.pool.length) a = sinkSfx.pool[0].cloneNode();
      if (a) { a.currentTime = 0; a.play().catch(()=>{}); }
    } catch {}
  }

  // Draw additional NPCs (beyond npc1) WITH turret overlays and destruction effects
  function drawAdditionalNpcs(){
    try {
      if (!Array.isArray(window.NPCs)) return;
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale;
      const targetHBase = 96;
      const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
      const worldH = Math.max(1, targetHScreen / (scale || 1));
      // Per-NPC image cache (original images) and scaled sprite cache (offscreen canvases)
      window.NpcImageCache = window.NpcImageCache || new Map();
      window.NpcScaledCache = window.NpcScaledCache || new Map(); // key: src -> offscreen canvas
      // Per-ship TMX turret points cache (shared)
      window.NpcTurretPointsCache = window.NpcTurretPointsCache || new Map(); // key: tmxUrl -> [{id,x,y},...]
      const getNpcImg = (src)=>{
        if (!src) return null;
        if (window.NpcImageCache.has(src)) return window.NpcImageCache.get(src);
        const im = new Image(); try { im.decoding = 'async'; } catch {} try { im.loading = 'eager'; } catch {}
        im.src = src; window.NpcImageCache.set(src, im); return im;
      };
      // Shared loader (attach to window so other functions can call it)
      if (!window.getNpcTurretPoints) {
        window.getNpcTurretPoints = async (tmxUrl)=>{
          try {
            if (!tmxUrl) return null;
            if (window.NpcTurretPointsCache.has(tmxUrl)) return window.NpcTurretPointsCache.get(tmxUrl);
            const res = await fetch(tmxUrl, { cache: 'force-cache' });
            const text = await res.text();
            const xml = new DOMParser().parseFromString(text, 'application/xml');
            // TMX image dimensions (so mapping uses the same space as TMX coordinates)
            let tmxIw = 0, tmxIh = 0;
            try {
              const imgNode = xml.querySelector('imagelayer > image');
              if (imgNode) { tmxIw = parseFloat(imgNode.getAttribute('width')||'0'); tmxIh = parseFloat(imgNode.getAttribute('height')||'0'); }
            } catch {}
            const pts = [];
            xml.querySelectorAll('objectgroup[name="turrets"] object').forEach(obj => {
              let tid = '';
              const props = obj.querySelectorAll('properties > property');
              props.forEach(pr => {
                const name = (pr.getAttribute('name')||'').trim().toLowerCase();
                if (/^t[1-4]$/.test(name)) tid = name; // t1..t4
              });
              if (!tid) return;
              const x = parseFloat(obj.getAttribute('x') || '0');
              const y = parseFloat(obj.getAttribute('y') || '0');
              pts.push({ id: tid, x, y });
            });
            const payload = { points: pts, iw: tmxIw, ih: tmxIh };
            window.NpcTurretPointsCache.set(tmxUrl, payload);
            return payload;
          } catch { return null; }
        };
      }
      const getScaledSprite = (src, img)=>{
        if (!src || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
        if (window.NpcScaledCache.has(src)) return window.NpcScaledCache.get(src);
        // Downscale to a fixed base height to reduce per-frame resampling cost
        const BASE_H = 256; // smaller cache to cut memory/CPU further
        const ih = img.naturalHeight, iw = img.naturalWidth;
        const ratio = iw / ih;
        const oh = Math.max(64, Math.min(BASE_H, ih));
        const ow = Math.round(oh * ratio);
        const off = document.createElement('canvas'); off.width = ow; off.height = oh;
        const octx = off.getContext('2d');
        octx.imageSmoothingEnabled = true; try { octx.imageSmoothingQuality = 'high'; } catch {}
        octx.drawImage(img, 0, 0, ow, oh);
        window.NpcScaledCache.set(src, off);
        return off;
      };
      for (let i=0;i<window.NPCs.length;i++){
        const npc = window.NPCs[i];
        if (!npc || npc === npc1 || !npc.state || !npc.state.ship) continue;
        // Skip sunk NPCs
        try { if (npc.state && (npc.state.effects?.sunk || npc.state.sunk)) continue; } catch {}
        const st = npc.state.ship;
        // Track NPC velocity for lead calculations
        try { if (npc.state && npc.state.id != null) trackEntityVelocity(String(npc.state.id), st.x, st.y); } catch {}
        // Compute enemy status ONCE per NPC so both green/red ring blocks can use it
        const npcId = npc && npc.state && npc.state.id != null ? String(npc.state.id) : '';
        const enemySet = (window.EnemyFleet1 instanceof Set) ? window.EnemyFleet1 : new Set();
        const npcSide = (npc.state && npc.state.side) ? String(npc.state.side).toLowerCase() : ((npc.profile && npc.profile.side) ? String(npc.profile.side).toLowerCase() : '');
        const isEnemyNpc = enemySet.has(npcId) || enemySet.has(Number(npcId)) || npcSide === 'enemy';
        // Determine per-NPC image and aspect before any sizing/rings
        const src = (npc.profile && npc.profile.image) ? npc.profile.image : null;
        const img = getNpcImg(src);
        // Proactively load this ship's TMX turret points (once)
        try {
          if (npc.profile && npc.profile.tmx && !(window.NpcTurretPointsCache && window.NpcTurretPointsCache.has(npc.profile.tmx))) {
            // Fire-and-forget; cache will be filled when resolved
            getNpcTurretPoints(npc.profile.tmx).catch(()=>{});
          }
        } catch {}
        const scaled = getScaledSprite(src, img);
        // Prefer TMX image size for aspect and mapping; fallback to image natural size
        const tpCache = (npc.profile && npc.profile.tmx) ? window.NpcTurretPointsCache.get(npc.profile.tmx) : null;
        const baseIw = (tpCache && tpCache.iw) ? tpCache.iw : ((img && img.naturalWidth) ? img.naturalWidth : (shipImg ? shipImg.width : 1024));
        const baseIh = (tpCache && tpCache.ih) ? tpCache.ih : ((img && img.naturalHeight) ? img.naturalHeight : (shipImg ? shipImg.height : 1536));
        // Apply cruiser scale multiplier (Prinz Eugen 20% smaller)
        const isCruiser = !!(npc.profile && String(npc.profile.type||'').toLowerCase() === 'cruiser');
        const sizeMul = isCruiser ? 0.8 : 1.0;
        const worldHScaled = Math.max(1, worldH * sizeMul);
        const worldWScaled = Math.round((baseIw / baseIh) * worldHScaled);
        // Fleet highlight ring for NPC if in selected fleet
        try {
          const sel = window.IronTideSelectedFleet || 1;
          const isInSel = (function(){
            // Check all known fleet assignment stores for robustness
            try { const A = window.IronTideFleetAssignments; if (A && A[sel] instanceof Set && (A[sel].has(npcId) || A[sel].has(Number(npcId)))) return true; } catch {}
            try { const B = window.fleetAssignments; if (B && B[sel] instanceof Set && (B[sel].has(npcId) || B[sel].has(Number(npcId)))) return true; } catch {}
            try { const C = window.fa; if (C && C[sel] instanceof Set && (C[sel].has(npcId) || C[sel].has(Number(npcId)))) return true; } catch {}
            return false;
          })();
          if (isInSel && !isEnemyNpc) {
            const lw = Math.max(0.5, 1 / (scale || 1));
            const baseR = Math.max(worldWScaled, worldHScaled) / 2;
            const r = baseR * 1.5;
            ctx.save();
            ctx.lineWidth = lw;
            ctx.strokeStyle = 'rgba(40, 220, 60, 0.95)';
            ctx.beginPath();
            ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          // Case B/C: Player moved to Fleet 2 or Fleet 3 -> clone player-style lines using FleetGunnery[fid]
          else if ((playerInFleet2 || playerInFleet3)) {
            const fid = playerInFleet2 ? 2 : 3;
            window.FleetGunnery = window.FleetGunnery || { 1:{},2:{},3:{} };
            const tg = window.FleetGunnery[fid] || {};
            // Only draw when that fleet's gunnery is enabled
            if (tg.gunneryEnabled) {
              // Resolve target from manual point or targetId
              let tgt = null;
              if (tg.target && Number.isFinite(tg.target.x) && Number.isFinite(tg.target.y)) {
                tgt = tg.target;
              } else if (tg.targetId != null) {
                try {
                  const tid = String(tg.targetId);
                  const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
                  for (let i=0;i<others.length;i++) { const s = others[i]; if (String(s.id) === tid) { tgt = { x: s.x, y: s.y, __id: tid }; break; } }
                } catch {}
              }
              if (tgt) {
                let lineLen = 500;
                const lw = Math.max(0.5, 1 / (scale || 1));
                let color = 'rgba(220,60,60,0.95)';
                // Compute turret muzzle world coordinates
                const hr = (ship.heading) * Math.PI/180;
                const lx = tx;
                const ly = ty - forwardDelta;
                const twx = ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
                const twy = ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
                // Apply leading if tgt is an entity id reference
                try {
                  if (tgt.__id) {
                    const v = getTrackedVelocity(tgt.__id);
                    const ps = getShellSpeedWorldPerSec();
                    const lead = predictIntercept({ x: twx, y: twy }, { x: tgt.x, y: tgt.y }, v, ps);
                    const blend = 0.85;
                    tgt = { x: tgt.x*(1-blend) + lead.x*blend, y: tgt.y*(1-blend) + lead.y*blend };
                  }
                } catch {}
                const wdx = tgt.x - twx;
                const wdy = tgt.y - twy;
                lineLen = Math.hypot(wdx, wdy);
                const desiredHeadingDeg = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
                const desiredRelDeg = ((desiredHeadingDeg - ship.heading) % 360 + 360) % 360;
                let delta = desiredRelDeg - relDeg;
                delta = ((delta + 540) % 360) - 180;
                const topDeadStart = 145, topDeadEnd = 235;
                const bottomDeadStart = 325, bottomDeadEnd = 55;
                const isTop = (id === 't1' || id === 't2');
                const ds = isTop ? topDeadStart : bottomDeadStart;
                const de = isTop ? topDeadEnd : bottomDeadEnd;
                const occluded = inDeadZone(desiredRelDeg, ds, de);
                const aligned = Math.abs(delta) <= 1;
                color = (aligned && !occluded) ? 'rgba(40,180,60,0.95)' : 'rgba(220,60,60,0.95)';
                ctx.save();
                ctx.lineWidth = lw;
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -lineLen);
                ctx.stroke();
                ctx.restore();
              } else {
                // No target yet: draw a visible long red barrel-direction line
                const lw = Math.max(0.5, 1 / (scale || 1));
                ctx.save();
                ctx.lineWidth = lw;
                ctx.strokeStyle = 'rgba(220,60,60,0.95)';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -1200);
                ctx.stroke();
                ctx.restore();
              }
            }
          }
        } catch {}
        // Enemy highlight ring (replicate sizing of friendly ring, color red)
        try {
          if (isEnemyNpc) {
            const lw = Math.max(0.5, 1 / (scale || 1));
            const baseR = Math.max(worldWScaled, worldHScaled) / 2;
            const r = baseR * 1.5;
            ctx.save();
            ctx.lineWidth = lw;
            ctx.strokeStyle = 'rgba(235, 50, 50, 0.95)';
            ctx.beginPath();
            ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        } catch {}
        // Draw hull
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.rotate((st.heading || 0) * Math.PI / 180);
        const prevSmooth = ctx.imageSmoothingEnabled; const prevQual = ctx.imageSmoothingQuality;
        ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'low'; } catch {}
        // Use previously computed img and scaled dimensions
        const iw = baseIw, ih = baseIh;
        const worldW = worldWScaled, worldH_use = worldHScaled;
        if (scaled) {
          ctx.drawImage(scaled, -worldW/2, -worldH_use/2, worldW, worldH_use);
        } else if (img && img.complete) {
          ctx.drawImage(img, -worldW/2, -worldH_use/2, worldW, worldH_use);
        } else if (shipImg) {
          // Fallback to global shipImg aspect until image loads
          ctx.drawImage(shipImg, -worldW/2, -worldH_use/2, worldW, worldH_use);
        }
        // Draw turrets if assets available
        try {
          if (turretImg && turretPoints && turretPoints.length) {
            const sx = worldW / (iw || 1);
            const sy = worldH_use / (ih || 1);
            const turretW = Math.round(worldW * 0.175);
            const tAspect = turretImg.width / turretImg.height;
            const turretH = Math.round(turretW / tAspect);
            const byId = new Map(turretPoints.map(p => [p.id, p]));
            // Initialize destroyed flags map per NPC
            npc.state.turretDestroyedFlags = npc.state.turretDestroyedFlags || { turret1:false, turret2:false, turret3:false, turret4:false };
            const hbMap = (npc.profile && npc.profile.damage && npc.profile.damage.hitboxes) ? npc.profile.damage.hitboxes : {};
            ['t1','t2','t3','t4'].forEach(id => {
              const p = byId.get(id);
              if (!p) return;
              const hbKey = id.replace(/^t/, 'turret');
              const hb = hbMap[hbKey];
              const maxhp = hb && typeof hb.max_hp === 'number' ? hb.max_hp : 0;
              const hp = hb && typeof hb.hp === 'number' ? hb.hp : maxhp;
              const dp = (hb && typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp>0 ? (100 - Math.round((hp/Math.max(1,maxhp))*100)) : 0);
              const destroyed = (maxhp > 0 && hp <= 0) || (hb && (hb.destroyed || dp >= 100));
              const tx = (p.x - (iw || 1) / 2) * sx;
              const ty = (p.y - (ih || 1) / 2) * sy;
              if (destroyed) {
                if (!npc.state.turretDestroyedFlags[hbKey]) {
                  const hr = (st.heading || 0) * Math.PI/180;
                  const wx = st.x + (tx * Math.cos(hr) - ty * Math.sin(hr));
                  const wy = st.y + (tx * Math.sin(hr) + ty * Math.cos(hr));
                  try { spawnExplosion(wx, wy); } catch {}
                  try { spawnBlackSmoke(wx, wy, 8); } catch {}
                  npc.state.turretDestroyedFlags[hbKey] = true;
                }
                return; // skip drawing destroyed turret
              }
              // Draw intact turret with per-NPC relative angle
              ctx.save();
              let relDeg = 0;
              try {
                const angles = npc && npc.state && npc.state.npcTurretAnglesRelDeg;
                relDeg = (angles && typeof angles[id] === 'number') ? angles[id] : (id==='t3'||id==='t4' ? 180 : 0);
              } catch { relDeg = (id==='t3'||id==='t4' ? 180 : 0); }
              const forwardDelta = (id === 't1') ? (5 / (scale || 1)) : 0;
              ctx.translate(tx, ty - forwardDelta);
              ctx.rotate(relDeg * Math.PI / 180);
              const prevSmoothT = ctx.imageSmoothingEnabled; const prevQualT = ctx.imageSmoothingQuality;
              ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch {}
              ctx.drawImage(turretImg, -turretW / 2, -turretH / 2, turretW, turretH);
              // NPC turret aim line (friendlies only): draw from turret MUZZLE (current origin) to the actual target point
              try {
                const idStrNpc = npc && npc.state && npc.state.id != null ? String(npc.state.id) : '';
                const isEnemyNpc = !!(window.EnemyFleet1 instanceof Set && window.EnemyFleet1.has(idStrNpc));
                // Resolve per-fleet target: Fleet 1 uses player's firingSolution; Fleets 2/3 use FleetGunnery targets
                let resolvedTarget = null;
                let isAligned = false;
                if (!isEnemyNpc) {
                  // Determine which fleet this NPC belongs to (robust to string/number IDs)
                  let fid = 0;
                  try {
                    const fa = window.IronTideFleetAssignments || {};
                    const idNumNpc = npc && npc.state && npc.state.id != null ? Number(npc.state.id) : NaN;
                    const inSet = (s, vStr, vNum) => !!(s && (s.has(vStr) || (!Number.isNaN(vNum) && s.has(vNum))));
                    if (fa[1] instanceof Set && inSet(fa[1], idStrNpc, idNumNpc)) fid = 1;
                    else if (fa[2] instanceof Set && inSet(fa[2], idStrNpc, idNumNpc)) fid = 2;
                    else if (fa[3] instanceof Set && inSet(fa[3], idStrNpc, idNumNpc)) fid = 3;
                  } catch {}
                  if (fid === 1) {
                    if (firingSolution && firingSolution.target) resolvedTarget = firingSolution.target;
                  } else if (fid === 2 || fid === 3) {
                    try {
                      window.FleetGunnery = window.FleetGunnery || { 1:{},2:{},3:{} };
                      const tg = window.FleetGunnery[fid];
                      // Check for manual target pin first
                      if (tg && tg.target) {
                        resolvedTarget = tg.target;
                      } else if (tg && tg.targetId != null) {
                        const tid = String(tg.targetId);
                        const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
                        for (let i=0;i<others.length;i++) { const s = others[i]; if (String(s.id) === tid) { resolvedTarget = { x: s.x, y: s.y }; break; } }
                      }
                    } catch {}
                  }
                }
                if (!isEnemyNpc) {
                  // Debug fleet detection (fid computed above)
                  if (id === 't1') {
                    try { console.log(`NPC ${idStrNpc} turret fleet detection -> fid=${fid}`); } catch {}
                  }
                  
                  // ONLY Fleet 2/3 logic - completely independent of Fleet 1
                  if (fid === 2 || fid === 3) {
                    // Check if this specific fleet has ships
                    const fleetHasShips = !!(window.IronTideFleetAssignments && window.IronTideFleetAssignments[fid] && window.IronTideFleetAssignments[fid].size > 0);
                    const gState = (window.FleetGunnery && window.FleetGunnery[fid]) || {};
                    
                    // Turret lines are now handled by drawFleetTurretLinesWorld() - no duplicate code needed here
                  }
                }
              } catch {}
              ctx.imageSmoothingEnabled = prevSmoothT; try { ctx.imageSmoothingQuality = prevQualT; } catch {}
              ctx.restore();
            });
          }
        } catch {}

        // Turret lines are now handled by the unified drawFleetTurretLinesWorld() system
        // (Removed duplicate turret line code)

        ctx.imageSmoothingEnabled = prevSmooth; try { ctx.imageSmoothingQuality = prevQual; } catch {}
        ctx.restore();
      }
    } catch {}
  }

  // Draw friendly fleet ships from IronTideFleet (with green circles for Fleet 1)
  function drawFriendlyFleetShips(){
    try {
      if (!Array.isArray(window.IronTideFleet)) return;
      const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale;
      const targetHBase = 96;
      const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
      const worldH = Math.max(1, targetHScreen / (scale || 1));
      // Share image caches with drawAdditionalNpcs
      window.NpcImageCache = window.NpcImageCache || new Map();
      window.NpcScaledCache = window.NpcScaledCache || new Map();
      window.NpcTurretPointsCache = window.NpcTurretPointsCache || new Map();
      const getNpcImg = (src)=>{
        if (!src) return null;
        if (window.NpcImageCache.has(src)) return window.NpcImageCache.get(src);
        const im = new Image(); try { im.decoding = 'async'; } catch {} try { im.loading = 'eager'; } catch {}
        im.src = src; window.NpcImageCache.set(src, im); return im;
      };
      const getScaledSprite = (src, img)=>{
        if (!src || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
        if (window.NpcScaledCache.has(src)) return window.NpcScaledCache.get(src);
        const BASE_H = 256;
        const ih = img.naturalHeight, iw = img.naturalWidth;
        const ratio = iw / ih;
        const oh = Math.max(64, Math.min(BASE_H, ih));
        const ow = Math.round(oh * ratio);
        const off = document.createElement('canvas'); off.width = ow; off.height = oh;
        const octx = off.getContext('2d');
        octx.imageSmoothingEnabled = true; try { octx.imageSmoothingQuality = 'high'; } catch {}
        octx.drawImage(img, 0, 0, ow, oh);
        window.NpcScaledCache.set(src, off);
        return off;
      };
      for (let i=0;i<window.IronTideFleet.length;i++){
        const ship = window.IronTideFleet[i];
        if (!ship || !ship.state || !ship.state.ship) continue;
        const shipId = String(ship.state.id);
        // Skip player ship (already drawn by drawShipWorld)
        if (shipId === playerId) continue;
        // Skip sunk ships
        try { if (ship.state && (ship.state.effects?.sunk || ship.state.sunk)) continue; } catch {}
        const st = ship.state.ship;
        if (window.VerboseLogs) console.log(`[FRIENDLY-RENDER] Drawing ship ID ${shipId}, type: ${ship.profile?.type}, pos: (${st.x}, ${st.y}), image: ${ship.profile?.image}`);
        // Track velocity for lead calculations
        try { if (ship.state && ship.state.id != null) trackEntityVelocity(shipId, st.x, st.y); } catch {}
        // Determine per-ship image and aspect
        const src = (ship.profile && ship.profile.image) ? ship.profile.image : null;
        const img = getNpcImg(src);
        // Proactively load TMX turret points
        try {
          if (ship.profile && ship.profile.tmx && !(window.NpcTurretPointsCache && window.NpcTurretPointsCache.has(ship.profile.tmx))) {
            if (window.getNpcTurretPoints) window.getNpcTurretPoints(ship.profile.tmx).catch(()=>{});
          }
        } catch {}
        const scaled = getScaledSprite(src, img);
        // Prefer TMX image size for aspect
        const tpCache = (ship.profile && ship.profile.tmx) ? window.NpcTurretPointsCache.get(ship.profile.tmx) : null;
        const baseIw = (tpCache && tpCache.iw) ? tpCache.iw : ((img && img.naturalWidth) ? img.naturalWidth : (shipImg ? shipImg.width : 1024));
        const baseIh = (tpCache && tpCache.ih) ? tpCache.ih : ((img && img.naturalHeight) ? img.naturalHeight : (shipImg ? shipImg.height : 1536));
        // Apply cruiser/transport scale multiplier
        const isCruiser = !!(ship.profile && String(ship.profile.type||'').toLowerCase() === 'cruiser');
        const isTransport = !!(ship.profile && String(ship.profile.type||'').toLowerCase() === 'transport');
        const sizeMul = isCruiser ? 0.8 : (isTransport ? 0.7 : 1.0);
        const worldHScaled = Math.max(1, worldH * sizeMul);
        const worldWScaled = Math.round((baseIw / baseIh) * worldHScaled);
        // Green circle for ships in selected fleet
        try {
          const sel = window.IronTideSelectedFleet || 1;
          const isInSel = (function(){
            try { const A = window.IronTideFleetAssignments; if (A && A[sel] instanceof Set && (A[sel].has(shipId) || A[sel].has(Number(shipId)))) return true; } catch {}
            try { const B = window.fleetAssignments; if (B && B[sel] instanceof Set && (B[sel].has(shipId) || B[sel].has(Number(shipId)))) return true; } catch {}
            try { const C = window.fa; if (C && C[sel] instanceof Set && (C[sel].has(shipId) || C[sel].has(Number(shipId)))) return true; } catch {}
            return false;
          })();
          if (isInSel) {
            const lw = Math.max(0.5, 1 / (scale || 1));
            const baseR = Math.max(worldWScaled, worldHScaled) / 2;
            const r = baseR * 1.5;
            ctx.save();
            ctx.lineWidth = lw;
            ctx.strokeStyle = 'rgba(40, 220, 60, 0.95)';
            ctx.beginPath();
            ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        } catch {}
        // Draw hull
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.rotate((st.heading || 0) * Math.PI / 180);
        const prevSmooth = ctx.imageSmoothingEnabled; const prevQual = ctx.imageSmoothingQuality;
        ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'low'; } catch {}
        const iw = baseIw, ih = baseIh;
        const worldW = worldWScaled, worldH_use = worldHScaled;
        if (window.VerboseLogs) console.log(`[FRIENDLY-RENDER] Ship ${shipId} - scaled: ${!!scaled}, img: ${!!img}, img.complete: ${img?.complete}, shipImg: ${!!shipImg}, worldW: ${worldW}, worldH: ${worldH_use}`);
        if (scaled) {
          if (window.VerboseLogs) console.log(`[FRIENDLY-RENDER] Drawing scaled sprite for ${shipId}`);
          ctx.drawImage(scaled, -worldW/2, -worldH_use/2, worldW, worldH_use);
        } else if (img && img.complete) {
          if (window.VerboseLogs) console.log(`[FRIENDLY-RENDER] Drawing complete image for ${shipId}`);
          ctx.drawImage(img, -worldW/2, -worldH_use/2, worldW, worldH_use);
        } else if (shipImg) {
          if (window.VerboseLogs) console.log(`[FRIENDLY-RENDER] Drawing fallback shipImg for ${shipId}`);
          ctx.drawImage(shipImg, -worldW/2, -worldH_use/2, worldW, worldH_use);
        } else {
          console.warn(`[FRIENDLY-RENDER] No image available to draw for ship ${shipId}!`);
        }
        // Draw turrets if assets available
        try {
          if (turretImg && turretPoints && turretPoints.length && !isTransport) {
            const sx = worldW / (iw || 1);
            const sy = worldH_use / (ih || 1);
            const turretW = Math.round(worldW * 0.175);
            const tAspect = turretImg.width / turretImg.height;
            const turretH = Math.round(turretW / tAspect);
            const byId = new Map(turretPoints.map(p => [p.id, p]));
            ship.state.turretDestroyedFlags = ship.state.turretDestroyedFlags || { turret1:false, turret2:false, turret3:false, turret4:false };
            const hbMap = (ship.profile && ship.profile.damage && ship.profile.damage.hitboxes) ? ship.profile.damage.hitboxes : {};
            ['t1','t2','t3','t4'].forEach(id => {
              const p = byId.get(id);
              if (!p) return;
              const hbKey = id.replace(/^t/, 'turret');
              const hb = hbMap[hbKey];
              const maxhp = hb && typeof hb.max_hp === 'number' ? hb.max_hp : 0;
              const curhp = hb && typeof hb.hp === 'number' ? hb.hp : maxhp;
              const destroyed = (maxhp > 0 && curhp <= 0) || ship.state.turretDestroyedFlags[hbKey];
              if (destroyed) return;
              const lx = (p.x - iw/2) * sx;
              const ly = (p.y - ih/2) * sy;
              const relDeg = (ship.state.npcTurretAnglesRelDeg && typeof ship.state.npcTurretAnglesRelDeg[id] === 'number') ? ship.state.npcTurretAnglesRelDeg[id] : 0;
              ctx.save();
              ctx.translate(lx, ly);
              ctx.rotate((relDeg) * Math.PI/180);
              ctx.drawImage(turretImg, -turretW/2, -turretH/2, turretW, turretH);
              ctx.restore();
            });
          }
        } catch {}
        ctx.imageSmoothingEnabled = prevSmooth; try { ctx.imageSmoothingQuality = prevQual; } catch {}
        ctx.restore();
      }
    } catch {}
  }

  // Expose camera/view helper for external UI (Debug panel)
  try { window.getViewRect = getViewRect; } catch {}
  
  // Snap camera to a fleet leader (immediate, no animation)
  // Safe to call anytime; will no-op if leader not found.
  function snapCameraToFleetLeader(fid) {
    try {
      const fleetLeader = getFleetLeader(fid);
      if (fleetLeader && fleetLeader.state && fleetLeader.state.ship) {
        const leaderX = fleetLeader.state.ship.x;
        const leaderY = fleetLeader.state.ship.y;
        if (Number.isFinite(leaderX) && Number.isFinite(leaderY)) {
          camera.cx = leaderX;
          camera.cy = leaderY;
          currentViewRect = getViewRect();
          return true;
        }
      }
    } catch {}
    return false;
  }

  try { window.snapCameraToFleetLeader = snapCameraToFleetLeader; } catch {}

  // (Duplicate view helper and snapCamera function removed)


  // Expose NPC helpers for Debug UI
  try { window.spawnNpcBismarck = spawnNpcBismarck; } catch {}
  try { window.spawnNpcAt = spawnNpcAt; } catch {}
  try {
    window.despawnNpc = function(){
      try {
        if (npc1 && npc1.state && npc1.state.id != null && Array.isArray(window.IronTideFleet)) {
          const idStr = String(npc1.state.id);
          window.IronTideFleet = window.IronTideFleet.filter(e => !(e && e.state && String(e.state.id) === idStr));
        }
      } catch {}
      npc1 = null;
      try { window.npc1 = null; } catch {}
    };
  } catch {}
  try {
    window.despawnNpcById = function(id){
      try {
        const idStr = String(id);
        // Remove legacy npc1 if matches
        if (npc1 && String(npc1.state && npc1.state.id) === idStr) { npc1 = null; try { window.npc1 = null; } catch {} }
        // Remove from IronTideFleet
        if (Array.isArray(window.IronTideFleet)) {
          window.IronTideFleet = window.IronTideFleet.filter(e => !(e && e.state && String(e.state.id) === idStr));
        }
        // Remove from NPCs list
        if (Array.isArray(window.NPCs)) {
          window.NPCs = window.NPCs.filter(n => !(n && n.state && String(n.state.id) === idStr));
        }
        // Remove from EnemyFleet1 grouping
        if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(idStr);
        // Remove from Fleet assignments
        if (window.IronTideFleetAssignments) {
          [1,2,3].forEach(k=>{ try { if (window.IronTideFleetAssignments[k] instanceof Set) window.IronTideFleetAssignments[k].delete(idStr); } catch {} });
        }
      } catch {}
    };

    // Despawn the player: mark a global flag and remove the player id from fleet assignments
    window.despawnPlayer = function(){
      try {
        const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
        window.PlayerDespawned = true;
        // Remove from Fleet assignments so AI cannot select player as a valid target
        const fa = window.IronTideFleetAssignments;
        if (fa) { [1,2,3].forEach(k=>{ try { if (fa[k] instanceof Set) fa[k].delete(pid); } catch {} }); }
        // Optional: clear any NPC currentTargetId that was pointing to the player
        try {
          if (Array.isArray(window.NPCs)) {
            window.NPCs.forEach(n=>{ try { if (n && n.state && n.state.currentTargetId === pid) n.state.currentTargetId = null; } catch {} });
          }
        } catch {}
      } catch {}
    };

    // Take over the nearest friendly ship (alive and not in EnemyFleet1).
    // If originX/Y are provided, measure distance from there; otherwise use current camera center.
    window.takeoverNearestFriendly = function(originX, originY){
      try {
        const enemySet = (window.EnemyFleet1 instanceof Set) ? window.EnemyFleet1 : new Set();
        const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        let ox = originX, oy = originY;
        try { if (!isFinite(ox) || !isFinite(oy)) { const vr = (typeof getViewRect === 'function') ? getViewRect() : { cx:0, cy:0 }; ox = vr.cx; oy = vr.cy; } } catch { ox = 0; oy = 0; }
        // Collect friendly, alive ships from IronTideFleet
        const candidates = [];
        if (Array.isArray(window.IronTideFleet)) {
          for (let i=0;i<window.IronTideFleet.length;i++){
            const h = window.IronTideFleet[i]; if (!h || !h.state || !h.state.ship) continue;
            const idStr = String(h.state.id);
            const isEnemy = enemySet.has(idStr);
            const alive = !(h.state.effects?.sunk || h.state.sunk);
            if (!isEnemy && alive) {
              const sx = h.state.ship.x, sy = h.state.ship.y;
              const d = Math.hypot((sx - ox), (sy - oy));
              candidates.push({ handle: h, id: idStr, x: sx, y: sy, d });
            }
          }
        }
        if (!candidates.length) return false;
        candidates.sort((a,b)=>a.d - b.d);
        const picked = candidates[0];
        const h = picked.handle;
        // Remove from NPC lists so it no longer behaves as an NPC
        try { if (Array.isArray(window.NPCs)) window.NPCs = window.NPCs.filter(n => !(n && n.state && String(n.state.id) === picked.id)); } catch {}
        try { if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(picked.id); } catch {}
        // Make sure it's assigned to Fleet 1 as the player's ship
        try {
          [1,2,3].forEach(k=>{ try { if (fa[k] instanceof Set) fa[k].delete(picked.id); } catch {} });
          if (fa[1] instanceof Set) fa[1].add(picked.id);
        } catch {}
        // Switch global player references
        try { window.shipState = h.state; } catch {}
        try { window.shipProfile = h.profile; } catch {}
        try { if (h.damageModel) { window.damageModel = h.damageModel; } } catch {}
        // Recreate main battery firing solution bound to new player
        try {
          if (window.FiringSolution && window.damageModel && window.shipState) {
            window.mainBatteryFS = new window.FiringSolution(window.shipState, window.damageModel);
          }
        } catch {}
        // Reset targeting and FIRE
        try { if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false); } catch {}
        try { if (window.firingSolution) { window.firingSolution.target = null; window.firingSolution.targetId = null; } } catch {}
        // Move camera to new ship
        try { if (typeof camera === 'object') { camera.cx = h.state.ship.x; camera.cy = h.state.ship.y; currentViewRect = getViewRect(); } } catch {}
        // Clear despawn flag if set
        try { window.PlayerDespawned = false; } catch {}
        return true;
      } catch { return false; }
    };
  } catch {}

  // Monitor ships to start/stop persistent damage smoke when damage crosses thresholds
  function monitorContinuousDamageSmoke(){
    try {
      window.ActiveDamageEmitters = window.ActiveDamageEmitters || new Set();
      function ensureFor(stateObj, profile){
        if (!stateObj || !profile || !profile.damage || !profile.damage.hitboxes) return;
        const hbMap = profile.damage.hitboxes;
        const keys = Object.keys(hbMap).filter(k => (
          k === 'engine' || k === 'funnel' || /^hull/.test(k) || /^turret\d+$/.test(k)
        ));
        // Compute ship-local anchors for known types
        const vr = currentViewRect || getViewRect();
        const scale = vr.scale || 1;
        const targetHBase = 96;
        const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
        const worldH = Math.max(1, targetHScreen / scale);
        let worldW = worldH;
        if (shipImg && shipImg.width && shipImg.height) worldW = Math.round(worldH * (shipImg.width / shipImg.height));
        function turretLocalXY(key){
          try {
            if (!turretPoints || !turretPoints.length || !shipImg) return null;
            const id = key.replace(/^turret/, 't');
            const p = turretPoints.find(tp => tp.id === id);
            if (!p) return null;
            const sx = worldW / shipImg.width; const sy = worldH / shipImg.height;
            const tx = (p.x - shipImg.width / 2) * sx;
            const ty = (p.y - shipImg.height / 2) * sy;
            return { lx: tx, ly: ty };
          } catch { return null; }
        }
        function hullLocalXY(name){
          const sx = 0; // center laterally
          let sy = 0;
          if (/^hullfore/.test(name)) sy = -worldH * 0.25;
          else if (/^hullaft/.test(name)) sy =  worldH * 0.25;
          else sy = 0; // hullmid or general hull
          return { lx: sx, ly: sy };
        }
        keys.forEach(k => {
          const hb = hbMap[k]; if (!hb) return;
          let damagePercent = 0;
          if (typeof hb.damage_percent === 'number') damagePercent = Math.max(0, Math.min(100, hb.damage_percent));
          else if (typeof hb.max_hp === 'number') {
            const maxhp = Math.max(1, hb.max_hp); const cur = (typeof hb.hp === 'number') ? hb.hp : maxhp;
            damagePercent = Math.max(0, Math.min(100, 100 - Math.round((cur / maxhp) * 100)));
          }
          const key = `${stateObj.state && stateObj.state.id ? stateObj.state.id : 'player'}:${k}`;
          const active = window.ActiveDamageEmitters.has(key);
          const over = (damagePercent >= 70) && !hb.destroyed;
          if (over && !active) {
            // Compute an anchor world position for the emitter
            let anchor = null;
            if (/^turret\d+$/.test(k)) anchor = turretLocalXY(k);
            else if (k === 'engine' || k === 'funnel') anchor = { lx: 0, ly: -worldH * 0.1 };
            else if (/^hull/.test(k)) anchor = hullLocalXY(k);
            // Fallback center if unknown
            if (!anchor) anchor = { lx: 0, ly: 0 };
            const hr = (stateObj.state && stateObj.state.ship ? (stateObj.state.ship.heading||0) : (ship.heading||0)) * Math.PI/180;
            const cosr = Math.cos(hr), sinr = Math.sin(hr);
            const shipRef = stateObj.state && stateObj.state.ship ? stateObj.state.ship : ship;
            const wx = shipRef.x + (anchor.lx * cosr - anchor.ly * sinr);
            const wy = shipRef.y + (anchor.lx * sinr + anchor.ly * cosr);
            // IMPORTANT: spawnPersistentDamageEmitterForShip requires an object with a `.ship` field.
            // Pass a compact state object that includes the ship and the profile for persistence checks.
            spawnPersistentDamageEmitterForShip({ ship: shipRef, profile }, k, wx, wy, 8);
            window.ActiveDamageEmitters.add(key);
          } else if ((!over || hb.destroyed) && active) {
            // Allow emitter to expire by not re-adding; also clear from active set
            window.ActiveDamageEmitters.delete(key);
          }
        });
      }
      // Player ship uses global shipProfile/state
      if (window.shipProfile && window.shipState && window.shipState.ship) ensureFor({ state: window.shipState, profile: window.shipProfile }, window.shipProfile);
      // NPC1 if present
      if (typeof npc1 === 'object' && npc1 && npc1.state && npc1.profile) ensureFor(npc1, npc1.profile);
    } catch {}
  }

  // --- Per-frame solution progress update ---
  function updateSolutionProgress(nowMs){
    try {
      // Selected-fleet progress (legacy single instance)
      if (solutionCalc && solutionCalc.active) {
        const elapsed = nowMs - solutionCalc.start;
        const dur = Math.max(1, solutionCalc.duration || 1);
        const t = Math.max(0, Math.min(1, elapsed / dur));
        if (solutionCalc.bar) solutionCalc.bar.style.width = (t * 100).toFixed(1) + '%';
        if (elapsed >= dur) {
          solutionCalc.active = false;
          if (solutionCalc.btn) {
            const track = solutionCalc.btn.querySelector('.solution-progress');
            if (track) track.style.display = 'none';
          }
          if (solutionCalc.bar) solutionCalc.bar.style.width = '100%';
        }
      }
      // Per-fleet mirrors for fleets 1/2/3
      try {
        window.FleetSolutionCalc = window.FleetSolutionCalc || { 1:{},2:{},3:{} };
        [1,2,3].forEach(fid => {
          const sc = window.FleetSolutionCalc[fid];
          if (!sc || !sc.start) return;
          const elapsedF = nowMs - (sc.start || 0);
          const durF = Math.max(1, sc.duration || 1);
          const btn = document.querySelector(`#navalDock .get-firing-solution-btn[data-fleet="${fid}"]`);
          const track = btn ? btn.querySelector('.solution-progress') : null;
          const bar = track ? track.querySelector('.bar') : null;
          if (elapsedF >= durF) {
            sc.active = false;
            if (track) track.style.display = 'none';
            if (bar) bar.style.width = '100%';
          } else if (elapsedF >= 0) {
            if (track) track.style.display = 'block';
            if (bar) bar.style.width = ((elapsedF / durF) * 100).toFixed(1) + '%';
          }
        });
      } catch {}
    } catch {}
  }

  function spawnBlackSmokeEmitterForShip(shipRef, worldX, worldY, durationSec=5, ratePerSec=6){
    if (!shipRef) return;
    const dx = worldX - shipRef.x;
    const dy = worldY - shipRef.y;
    const hr = (shipRef.heading || 0) * Math.PI/180;
    // Convert to ship-local so it follows rotation and movement
    const lx = dx * Math.cos(-hr) - dy * Math.sin(-hr);
    const ly = dx * Math.sin(-hr) + dy * Math.cos(-hr);
    blackSmokeEmitters.push({ ship: shipRef, lx, ly, life: 0, maxLife: durationSec, rate: ratePerSec, acc: 0 });
  }

  // Persistent smoke emitter tied to a hitbox; continues until that hitbox is repaired
  function spawnPersistentDamageEmitterForShip(stateObj, hitboxName, worldX, worldY, ratePerSec=8){
    try {
      if (!stateObj || !stateObj.ship) return;
      const shipRef = stateObj.ship;
      const dx = worldX - shipRef.x;
      const dy = worldY - shipRef.y;
      const hr = (shipRef.heading || 0) * Math.PI/180;
      const lx = dx * Math.cos(-hr) - dy * Math.sin(-hr);
      const ly = dx * Math.sin(-hr) + dy * Math.cos(-hr);
      blackSmokeEmitters.push({
        ship: shipRef,
        stateObj,
        hitbox: hitboxName,
        lx, ly,
        life: 0,
        maxLife: Infinity,
        rate: ratePerSec,
        acc: 0,
        persistent: true,
        funnelAnchor: (hitboxName === 'engine' || hitboxName === 'funnel'),
      });
    } catch {}
  }

  // --- Explosions & Black Smoke over ship PNGs ---
  const hitExplosions = { pool: [], active: [] };
  function allocExplosion(){
    return hitExplosions.pool.length ? hitExplosions.pool.pop() : {
      x:0,y:0, t:0, maxT:0.45, // seconds
    };
  }

  // --- Islands ---
  const islands = [];
  // Convert map degrees (as shown by drawMapAnnotations) to world pixels
  function mapDegToWorld(latN, lonE){
    const spanLonDeg = 16, spanLatDeg = 16;
    const wpx = Math.max(1, mapPixelSize && mapPixelSize.w ? mapPixelSize.w : 1024);
    const hpx = Math.max(1, mapPixelSize && mapPixelSize.h ? mapPixelSize.h : 1024);
    const degPerPxX = spanLonDeg / wpx; // deg per pixel
    const degPerPxY = spanLatDeg / hpx; // deg per pixel
    const baseLat = 35, baseLon = 135; // same as drawMapAnnotations
    const wx = (lonE - baseLon) / degPerPxX;
    const wy = (baseLat - latN) / degPerPxY;
    return { x: wx, y: wy };
  }
  function latLonToWorld(latGrid, lonGrid){
    // Infinite grid coordinates (no off-map), centered at map center so (0,0) is center.
    // Keep spacing identical to prior 16-unit span: 1 grid unit = mapPixelSize/16 pixels.
    // Positive X = East (right). Positive Y = North (DOWNWARD on screen).
    const wpx = Math.max(1, mapPixelSize && mapPixelSize.w ? mapPixelSize.w : 4096);
    const hpx = Math.max(1, mapPixelSize && mapPixelSize.h ? mapPixelSize.h : 4096);
    const unitX = wpx / 16; // px per grid unit horizontally
    const unitY = hpx / 16; // px per grid unit vertically
    const cx = wpx / 2;
    const cy = hpx / 2;
    const wx = cx + (lonGrid || 0) * unitX;
    const wy = cy + (latGrid || 0) * unitY; // N down
    return { x: wx, y: wy };
  }
  // Interpret inputs like 40N,130E or 9N,180E as literal grid units (no scaling)
  function reinterpretToGrid(latLegacy, lonLegacy){
    // Literal mapping: use provided numbers directly as grid units
    const gy = (latLegacy || 0);
    const gx = (lonLegacy || 0);
    return { gy, gx };
  }
  function makeHitMaskFromImage(img){
    try {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, img.width, img.height);
      return { canvas: c, data: id.data, w: img.width, h: img.height };
    } catch { return null; }
  }
  function islandSolidAtWorld(wx, wy){
    if (!Array.isArray(islands)) return false;
    for (let k=0;k<islands.length;k++){
      const isl = islands[k];
      if (!isl || !isl.mask || !isl.img) continue;
      // Compute local pixel within the island image assuming isl.cx, isl.cy are the island center
      const halfW = Math.floor(isl.mask.w / 2);
      const halfH = Math.floor(isl.mask.h / 2);
      const lx = Math.floor(wx - (isl.cx - halfW));
      const ly = Math.floor(wy - (isl.cy - halfH));
      if (lx < 0 || ly < 0 || lx >= isl.mask.w || ly >= isl.mask.h) continue;
      const idx = (ly * isl.mask.w + lx) * 4;
      const a = isl.mask.data[idx + 3] || 0; // alpha
      if (a >= 128) return true; // solid island pixel (increased threshold)
    }
    return false;
  }
  function drawIslandsWorld(){
    try {
      if (!Array.isArray(islands) || !islands.length) return;
      for (const isl of islands) {
        if (!isl || !isl.img) continue;
        const dx = Math.round((isl.cx || 0) - isl.img.width/2);
        const dy = Math.round((isl.cy || 0) - isl.img.height/2);
        ctx.drawImage(isl.img, dx, dy);
      }
    } catch {}
  }
  function freeExplosion(e){ hitExplosions.pool.push(e); }
  function spawnExplosion(x, y){
    const e = allocExplosion();
    e.x = x; e.y = y; e.t = 0; e.maxT = 0.45;
    e.scale = 1;      // visual size multiplier
    e.bright = 1;     // brightness multiplier
    hitExplosions.active.push(e);
  }
  // Mighty explosion for ship sunk: 10x bigger, 10x brighter, 5x slower
  function spawnMightyExplosion(x, y){
    const e = allocExplosion();
    e.x = x; e.y = y; e.t = 0; e.maxT = (0.45 * 5) + 3.0; // add ~3 seconds more
    e.scale = 10;     // 10x size
    e.bright = 10;    // 10x brightness (clamped in renderer)
    hitExplosions.active.push(e);
  }

  const blackSmoke = { pool: [], active: [] };
  const blackSmokeEmitters = [];
  function allocBlackSmoke(){
    return blackSmoke.pool.length ? blackSmoke.pool.pop() : {
      x:0,y:0, vx:0, vy:0, life:0, maxLife: 8.0, r: 6,
    };
  }
  function freeBlackSmoke(s){ blackSmoke.pool.push(s); }
  function spawnBlackSmoke(x, y, count=6){
    for (let i=0;i<count;i++){
      const s = allocBlackSmoke();
      s.x = x + (Math.random()*12-6); // slight left/right variation
      s.y = y + (Math.random()*6-3);
      const ang = (-Math.PI/2) + (Math.random()*0.6 - 0.3); // mostly upward with small spread
      const spd = 10 + Math.random()*12;
      s.vx = Math.cos(ang) * spd * 0.3;
      s.vy = Math.sin(ang) * spd * 0.3;
      s.life = 0;
      s.maxLife = 6.5 + Math.random()*3.5; // linger longer than funnel smoke
      s.r = 5 + Math.random()*7;
      blackSmoke.active.push(s);
    }
  }

  function updateExplosionsAndSmoke(dt){
    // Explosions
    if (hitExplosions.active.length){
      const keep = [];
      for (let i=0;i<hitExplosions.active.length;i++){
        const e = hitExplosions.active[i];
        e.t += dt;
        if (e.t < e.maxT) keep.push(e); else freeExplosion(e);
      }
      hitExplosions.active = keep;
    }
    // Black smoke
    if (blackSmoke.active.length){
      const keep = [];
      // Compute wind drift once per frame
      let wx = 0, wy = 0;
      try {
        const wRad = (wind.currentDeg||0) * Math.PI/180;
        const windPxPerSecPerKt = 1.2; // subtle wind influence for smoke
        const wMag = Math.max(0, wind.currentSpeed||0) * windPxPerSecPerKt;
        wx = Math.sin(wRad) * wMag;
        wy = -Math.cos(wRad) * wMag;
      } catch {}
      for (let i=0;i<blackSmoke.active.length;i++){
        const s = blackSmoke.active[i];
        s.life += dt;
        // gentle rise and drift + wind advection
        s.x += (s.vx + wx) * dt;
        s.y += (s.vy + wy) * dt;
        // slow gravity-like upward decrease in vy
        s.vy -= 2 * dt;
        if (s.life < s.maxLife) keep.push(s); else freeBlackSmoke(s);
      }
      blackSmoke.active = keep;
    }

    // Emitters: continuously spawn smoke that follows the ship for ~duration or until repaired (for persistent ones)
    if (blackSmokeEmitters.length){
      const keepE = [];
      for (let i=0;i<blackSmokeEmitters.length;i++){
        const em = blackSmokeEmitters[i];
        em.life += dt;
        // Compute current world position from ship + local offset
        const ship = em.ship;
        if (!ship) continue;
        const hr = (ship.heading || 0) * Math.PI/180;
        // Clamp emitter local offset to stay within the rendered ship PNG bounds
        // For engine/funnel persistent emitters, override to funnel anchor
        let clx = em.lx, cly = em.ly;
        if (em.funnelAnchor) {
          // Funnel anchor in ship-local space: slight forward (-Y), centered laterally (no side bias)
          const anchorOffset = 10; // world px forward
          clx = 0;
          cly = -anchorOffset;
        }
        // For all non-funnel emitters (hull hits), bias slightly inward toward center to avoid edge pops
        if (!em.funnelAnchor) { clx *= 0.9; cly *= 0.9; }
        try {
          const vrE = currentViewRect || getViewRect();
          const scaleE = vrE.scale || 1;
          const targetHBase = 96;
          const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
          const worldH = Math.max(1, targetHScreen / scaleE);
          if (shipImg && shipImg.width && shipImg.height) {
            const aspect = shipImg.width / shipImg.height;
            const worldW = Math.round(worldH * aspect);
            const halfW = worldW / 2;
            const halfH = worldH / 2;
            // Shrink bounds by a margin to ensure visibly inside the PNG (avoid edge/transparent trim)
            const marginWorld = (em.funnelAnchor ? 6 : 10) / scaleE;
            const maxX = Math.max(0, halfW - marginWorld);
            const maxY = Math.max(0, halfH - marginWorld);
            if (clx >  maxX) clx =  maxX; else if (clx < -maxX) clx = -maxX;
            if (cly >  maxY) cly =  maxY; else if (cly < -maxY) cly = -maxY;
          }
        } catch {}
        // Precompute helpers for local->world transform
        const cosr = Math.cos(hr), sinr = Math.sin(hr);
        // Accumulate spawn amount
        em.acc += em.rate * dt;
        const spawnN = Math.floor(em.acc);
        if (spawnN > 0){
          em.acc -= spawnN;
          // Lateral jitter: Â±10px (screen) left/right in LOCAL space, with per-particle clamping to ship bounds
          const vrE2 = currentViewRect || getViewRect();
          const scaleE2 = vrE2.scale || 1;
          // Compute half-bounds once
          let halfW = 0, halfH = 0;
          try {
            const targetHBase = 96;
            const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
            const worldH = Math.max(1, targetHScreen / scaleE2);
            if (shipImg && shipImg.width && shipImg.height) {
              const aspect = shipImg.width / shipImg.height;
              halfW = Math.round(worldH * aspect) / 2;
              halfH = worldH / 2;
            }
          } catch {}
          // Per-particle inset: larger for hull to keep puffs clearly inside
          const marginWorld2 = (em.funnelAnchor ? 6 : 10) / (scaleE2 || 1);
          const maxX2 = Math.max(0, halfW - marginWorld2);
          const maxY2 = Math.max(0, halfH - marginWorld2);
          for (let k=0;k<spawnN;k++){
            // Jitter in local X, then clamp to bounds to ensure within PNG
            const jitterRange = em.funnelAnchor ? 10 : 6; // px
            const jitterPx = (Math.random()*2 - 1) * jitterRange; // symmetric range
            const jitterLocalX = jitterPx / (scaleE2 || 1);
            let jlx = clx + jitterLocalX;
            let jly = cly;
            if (jlx >  maxX2) jlx =  maxX2; else if (jlx < -maxX2) jlx = -maxX2;
            if (jly >  maxY2) jly =  maxY2; else if (jly < -maxY2) jly = -maxY2;
            // For hull emitters, nudge further toward the center a few pixels to ensure visibly inside
            if (!em.funnelAnchor) {
              const inwardPx = 4; // screen px inward
              const inwardWorld = inwardPx / (scaleE2 || 1);
              const len = Math.hypot(jlx, jly);
              if (len > 1e-3) {
                const nx = -jlx / len, ny = -jly / len;
                jlx += nx * Math.min(inwardWorld, len);
                jly += ny * Math.min(inwardWorld, len);
                // Re-clamp after inward nudge
                if (jlx >  maxX2) jlx =  maxX2; else if (jlx < -maxX2) jlx = -maxX2;
                if (jly >  maxY2) jly =  maxY2; else if (jly < -maxY2) jly = -maxY2;
              }
            }
            const wx = ship.x + (jlx * cosr - jly * sinr);
            const wy = ship.y + (jlx * sinr + jly * cosr);
            spawnBlackSmoke(wx, wy, 1);
          }
        }
        // Lifespan logic: either time-bounded or persistent based on hitbox repair state
        if (em.persistent) {
          let persist = true;
          try {
            const prof = em.stateObj && em.stateObj.profile;
            const hb = prof && prof.damage && prof.damage.hitboxes && prof.damage.hitboxes[em.hitbox];
            if (hb) {
              let damagePercent = 0;
              if (typeof hb.damage_percent === 'number') {
                damagePercent = Math.max(0, Math.min(100, hb.damage_percent));
              } else if (typeof hb.max_hp === 'number') {
                const maxhp = Math.max(1, hb.max_hp);
                const cur = (typeof hb.hp === 'number') ? hb.hp : maxhp;
                damagePercent = Math.max(0, Math.min(100, 100 - Math.round((cur / maxhp) * 100)));
              }
              // Persist for ANY tracked hitbox when >= 70% damaged or destroyed
              persist = (damagePercent >= 70) || !!hb.destroyed;
            }
          } catch {}
          if (persist) keepE.push(em);
        } else {
          if (em.life < em.maxLife) keepE.push(em);
        }
      }
      blackSmokeEmitters.length = 0; Array.prototype.push.apply(blackSmokeEmitters, keepE);
    }
  }

  function drawExplosionsAndSmoke(){
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    // Draw explosions (over ship)
    for (let i=0;i<hitExplosions.active.length;i++){
      const e = hitExplosions.active[i];
      const t = Math.max(0, Math.min(1, e.t / e.maxT));
      const mul = (typeof e.scale === 'number' && e.scale > 0) ? e.scale : 1;
      const r = ((10 + 60*t) * mul) / scale;
      const aBase = 1 - t;
      const bMul = (typeof e.bright === 'number' && e.bright > 0) ? e.bright : 1;
      const a = Math.max(0, Math.min(1, aBase * bMul));
      // flash core
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      grad.addColorStop(0, `rgba(255,230,160,${Math.min(1, 0.9*a)})`);
      grad.addColorStop(0.4, `rgba(255,140,60,${Math.min(1, 0.8*a)})`);
      grad.addColorStop(1, `rgba(255,140,60,0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // Draw black smoke
    for (let i=0;i<blackSmoke.active.length;i++){
      const s = blackSmoke.active[i];
      const t = Math.max(0, Math.min(1, s.life / s.maxLife));
      const r = (s.r + t*12) / scale;
      // alpha: fade in quick, then slow fade out
      const a = (t < 0.2) ? (t/0.2) : (1 - (t-0.2)/0.8);
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grad.addColorStop(0, `rgba(10,10,10,${0.7*a})`);
      grad.addColorStop(0.4, `rgba(30,30,30,${0.6*a})`);
      grad.addColorStop(1, `rgba(30,30,30,0)`);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // --- Splash SFX (HTMLAudio) ---
  const splashSfx = { urls: ['assets/audio/splash1.mp3', 'assets/audio/splash2.mp3'], pool: [] };
  function initSplashAudio(){
    if (splashSfx.inited) return; splashSfx.inited = true;
    try {
      splashSfx.pool = splashSfx.urls.map(u => { const a = new Audio(u); a.preload = 'auto'; a.volume = 0.9; return a; });
    } catch {}
  }
  function playSplashSound(){
    try { if (window.IronTideAudio && IronTideAudio.playSplash) IronTideAudio.playSplash(); } catch {}
  }

  // --- Cannon SFX (HTMLAudio) ---
  const cannonSfx = { urls: ['assets/audio/cannon1.mp3', 'assets/audio/cannon2.mp3'], pool: [] };
  function initCannonAudio(){
    if (cannonSfx.inited) return; cannonSfx.inited = true;
    try {
      cannonSfx.pool = cannonSfx.urls.map(u=>{ const a=new Audio(u); a.preload='auto'; a.volume=0.9; return a; });
    } catch {}
  }
  function playCannonSound(){
    try { if (window.IronTideAudio && IronTideAudio.playCannon) IronTideAudio.playCannon(); } catch {}
  }

  // --- Shell Reload SFX (plays 5s after each turret fires) ---
  const shellLoadSfx = { url: 'assets/audio/shellload1.mp3', pool: [], inited: false };
  function initShellLoadAudio(){
    if (shellLoadSfx.inited) return; shellLoadSfx.inited = true;
    try {
      // Create a small pool to avoid overlap issues
      for (let i = 0; i < 4; i++) {
        const a = new Audio(shellLoadSfx.url);
        a.preload = 'auto';
        a.volume = 0.6; // slightly quieter
        shellLoadSfx.pool.push(a);
      }
    } catch {}
  }
  function playShellLoadSound(){
    try {
      if (!shellLoadSfx.inited) initShellLoadAudio();
      let a = null;
      for (let i=0;i<shellLoadSfx.pool.length;i++) { if (shellLoadSfx.pool[i].paused) { a = shellLoadSfx.pool[i]; break; } }
      if (!a && shellLoadSfx.pool.length) a = shellLoadSfx.pool[0].cloneNode();
      if (a) { a.currentTime = 0; a.play().catch(()=>{}); }
    } catch {}
  }

  // --- Shell Hit SFX (plays when a shell hits enemy/NPC or land) ---
  const hitSfx = { urls: ['assets/audio/hit1.mp3', 'assets/audio/hit2.mp3', 'assets/audio/hit3.mp3'], pool: [], inited: false };
  function initHitAudio(){
    if (hitSfx.inited) return; hitSfx.inited = true;
    try {
      hitSfx.pool = hitSfx.urls.map(u => { const a = new Audio(u); a.preload = 'auto'; a.volume = 0.9; return a; });
    } catch {}
  }
  function playHitSound(){
    try {
      if (!hitSfx.inited) initHitAudio();
      if (!hitSfx.pool || hitSfx.pool.length === 0) return;
      // pick a random base audio from the pool
      const idx = Math.floor(Math.random() * hitSfx.pool.length);
      let a = null;
      // try to find a paused instance of the chosen clip
      for (let i=0;i<hitSfx.pool.length;i++) {
        const cand = hitSfx.pool[(idx + i) % hitSfx.pool.length];
        if (cand.paused) { a = cand; break; }
      }
      if (!a) a = hitSfx.pool[idx].cloneNode();
      if (a) { a.currentTime = 0; a.play().catch(()=>{}); }
    } catch {}
  }

  // Keep existing call site working; drive the engine/rest crossfade based on current speed
  function updateShipAudio(/*dt, actualSpeedKts*/){
    try { if (window.IronTideAudio && IronTideAudio.updateEngineMix) IronTideAudio.updateEngineMix(); } catch {}
  }

  // --- Ambient SFX (very intermittent random samples) ---
  const ambientSfx = {
    urls: [
      'assets/audio/whales1.mp3',
      'assets/audio/seagulls1.mp3',
    ],
    base: [], // base Audio nodes for cloning
    nextAt: null, // simTime (seconds) when next sample should play
    meanIntervalSec: 20 * 60, // 20 minutes on average
    volume: 0.7,
  };
  function initAmbientAudio(){
    if (ambientSfx.inited) return; ambientSfx.inited = true;
    try {
      ambientSfx.base = ambientSfx.urls.map(u => {
        const a = new Audio(u);
        a.preload = 'auto';
        a.volume = ambientSfx.volume;
        return a;
      });
    } catch {}
  }
  function scheduleNextAmbient(now){
    // Exponential distribution for natural random spacing with specified mean
    const mean = ambientSfx.meanIntervalSec;
    const u = Math.random() || 0.0001;
    const interval = -Math.log(1 - u) * mean; // seconds
    ambientSfx.nextAt = now + interval;
  }
  function tryPlayAmbient(now){
    try {
      if (!ambientSfx.inited) initAmbientAudio();
      if (!ambientSfx.base || ambientSfx.base.length === 0) return;
      if (ambientSfx.nextAt == null) { scheduleNextAmbient(now); return; }
      if (now >= ambientSfx.nextAt) {
        const idx = Math.floor(Math.random() * ambientSfx.base.length);
        const base = ambientSfx.base[idx];
        if (base) {
          const a = base.cloneNode();
          a.volume = base.volume;
          a.play().catch(()=>{});
        }
        scheduleNextAmbient(now);
      }
    } catch {}
  }

  // Hit test for Tight Circle pins (two antipodal points). Returns index 0 or 1, or -1 if none.
  function hitTestCirclePin(px, py) {
    if (!patterns.circlePins || patterns.circlePins.length === 0) return -1;
    const w = screenToWorld(px, py);
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14;
    const hitWorldRadius = hitScreenRadius / scale;
    for (let i = 0; i < patterns.circlePins.length; i++) {
      const pin = patterns.circlePins[i];
      if (!pin) continue;
      const dxB = w.x - pin.x;
      const dyB = w.y - pin.y;
      if (Math.hypot(dxB, dyB) <= hitWorldRadius) return i;
      const dxR = w.x - pin.x;
      const dyR = w.y - (pin.y - 18);
      if (Math.hypot(dxR, dyR) <= hitWorldRadius) return i;
    }
    return -1;
  }

  // Hit test for Zig-Zag pins (two-pin mode). Returns index 0 or 1, or -1 if none.
  function hitTestZigPin(px, py) {
    if (!patterns.zigPins || patterns.zigPins.length === 0) return -1;
    const w = screenToWorld(px, py);
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14;
    const hitWorldRadius = hitScreenRadius / scale;
    for (let i = 0; i < patterns.zigPins.length; i++) {
      const pin = patterns.zigPins[i];
      if (!pin) continue;
      const dxB = w.x - pin.x;
      const dyB = w.y - pin.y;
      if (Math.hypot(dxB, dyB) <= hitWorldRadius) return i;
      const dxR = w.x - pin.x;
      const dyR = w.y - (pin.y - 18);
      if (Math.hypot(dxR, dyR) <= hitWorldRadius) return i;
    }
    return -1;
  }

  function hitTestBoxPin(px, py) {
    // Determine which point set to test: in placement (boxPins) or finalized (path)
    const pts = (patterns.pendingSelection === 'box') ? patterns.boxPins : (patterns.selected === 'box' ? patterns.path : null);
    if (!pts || !pts.length) return -1;
    const w = screenToWorld(px, py);
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14; // px consistent with zig pin
    const hitWorldRadius = hitScreenRadius / scale;
    for (let i = 0; i < pts.length; i++) {
      const pin = pts[i];
      // Base
      const dxB = w.x - pin.x;
      const dyB = w.y - pin.y;
      if (Math.hypot(dxB, dyB) <= hitWorldRadius) return i;
      // Ring/head at y-18
      const dxR = w.x - pin.x;
      const dyR = w.y - (pin.y - 18);
      if (Math.hypot(dxR, dyR) <= hitWorldRadius) return i;
    }
    return -1;
  }

  function hitTestFreeDrawPin(px, py) {
    // Test Free Draw pins during placement or after finalization
    const pts = (patterns.pendingSelection === 'freedraw') ? patterns.freeDrawPins : (patterns.selected === 'freedraw' ? patterns.path : null);
    if (!pts || !pts.length) return -1;
    const w = screenToWorld(px, py);
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14;
    const hitWorldRadius = hitScreenRadius / scale;
    for (let i = 0; i < pts.length; i++) {
      const pin = pts[i];
      const dxB = w.x - pin.x;
      const dyB = w.y - pin.y;
      if (Math.hypot(dxB, dyB) <= hitWorldRadius) return i;
      const dxR = w.x - pin.x;
      const dyR = w.y - (pin.y - 18);
      if (Math.hypot(dxR, dyR) <= hitWorldRadius) return i;
    }
    return -1;
  }

  function hitTestFigurePin(px, py) {
    // Test Figure Eight center pin
    const pts = (patterns.pendingSelection === 'figure') ? patterns.figurePins : (patterns.selected === 'figure' ? patterns.figurePins : null);
    if (!pts || !pts.length) return -1;
    const w = screenToWorld(px, py);
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14;
    const hitWorldRadius = hitScreenRadius / scale;
    for (let i = 0; i < pts.length; i++) {
      const pin = pts[i];
      const dxB = w.x - pin.x;
      const dyB = w.y - pin.y;
      if (Math.hypot(dxB, dyB) <= hitWorldRadius) return i;
      const dxR = w.x - pin.x;
      const dyR = w.y - (pin.y - 18);
      if (Math.hypot(dxR, dyR) <= hitWorldRadius) return i;
    }
    return -1;
  }

  function hitTestOvalPin(px, py) {
    // Test Oval center pin
    const pts = (patterns.pendingSelection === 'oval') ? patterns.ovalPins : (patterns.selected === 'oval' ? patterns.ovalPins : null);
    if (!pts || !pts.length) return -1;
    const w = screenToWorld(px, py);
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14;
    const hitWorldRadius = hitScreenRadius / scale;
    for (let i = 0; i < pts.length; i++) {
      const pin = pts[i];
      const dxB = w.x - pin.x;
      const dyB = w.y - pin.y;
      if (Math.hypot(dxB, dyB) <= hitWorldRadius) return i;
      const dxR = w.x - pin.x;
      const dyR = w.y - (pin.y - 18);
      if (Math.hypot(dxR, dyR) <= hitWorldRadius) return i;
    }
    return -1;
  }

  function polygonSignedArea(pts) {
    if (!pts || pts.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i+1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5; // Screen coords (y-down): >0 => CW, <0 => CCW
  }

  // Like moveAlongPath, but wraps around ends to form a loop; supports signed distance
  function moveAlongPathLooped(path, segIndex, t, distance) {
    if (!path || path.length < 2) return null;
    const nSeg = path.length - 1;
    let i = Math.max(0, Math.min(segIndex, nSeg));
    let ax = path[i].x, ay = path[i].y;
    let bx = path[(i+1) % path.length].x, by = path[(i+1) % path.length].y;
    let segLen = Math.hypot(bx-ax, by-ay) || 1;
    let pos = t * segLen + distance;
    // Normalize pos with wrapping across segments
    while (pos >= segLen) {
      pos -= segLen;
      i = (i + 1) % path.length;
      ax = path[i].x; ay = path[i].y; bx = path[(i+1) % path.length].x; by = path[(i+1) % path.length].y;
      segLen = Math.hypot(bx-ax, by-ay) || 1;
    }
    while (pos < 0) {
      i = (i - 1 + path.length) % path.length;
      ax = path[i].x; ay = path[i].y; bx = path[(i+1) % path.length].x; by = path[(i+1) % path.length].y;
      segLen = Math.hypot(bx-ax, by-ay) || 1;
      pos += segLen;
    }
    const lt = Math.max(0, Math.min(1, pos / segLen));
    return { x: ax + (bx-ax) * lt, y: ay + (by-ay) * lt, segIndex: i, t: lt };
  }

  // Prefer aiming at internal vertices (peaks/troughs) when they are reasonably close ahead
  function nextVertexTarget(path, cp, params) {
    if (!cp) return null;
    const i = Math.max(0, Math.min(cp.segIndex + 1, path.length - 1));
    // Internal vertices are indices 1..length-2
    if (i <= 0 || i >= path.length - 1) return null;
    const v = path[i];
    // Distance along current segment to the vertex
    const ax = path[cp.segIndex].x, ay = path[cp.segIndex].y;
    const bx = path[cp.segIndex + 1].x, by = path[cp.segIndex + 1].y;
    const segLen = Math.hypot(bx - ax, by - ay) || 1;
    const aheadAlong = (1 - cp.t) * segLen;
    // Window within which we try to hit the vertex directly
    const window = Math.max(30, params.wavelength * 0.8);
    if (aheadAlong <= window) return v;
    return null;
  }

  // --- Path guidance helpers for gentle course correction ---
  function closestPointOnSegment(ax, ay, bx, by, px, py) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const vv = vx*vx + vy*vy || 1;
    let t = (vx*wx + vy*wy) / vv;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + vx * t;
    const cy = ay + vy * t;
    const dx = px - cx, dy = py - cy;
    return { x: cx, y: cy, t, dist: Math.hypot(dx, dy), dirx: (vx/Math.sqrt(vv)), diry: (vy/Math.sqrt(vv)) };
  }
  function closestPointOnPolyline(path, px, py) {
    if (!path || path.length < 2) return null;
    let best = null, bestI = 0;
    for (let i = 0; i < path.length-1; i++) {
      const a = path[i], b = path[i+1];
      const res = closestPointOnSegment(a.x, a.y, b.x, b.y, px, py);
      if (!best || res.dist < best.dist) { best = res; bestI = i; }
    }
    return { segIndex: bestI, point: { x: best.x, y: best.y }, t: best.t, dist: best.dist, dirx: best.dirx, diry: best.diry };
  }
  // For closed loops, include the wrapping segment from last to first
  function closestPointOnLoop(path, px, py) {
    if (!path || path.length < 2) return null;
    let best = null, bestI = 0;
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const a = path[i], b = path[(i+1) % n];
      const res = closestPointOnSegment(a.x, a.y, b.x, b.y, px, py);
      if (!best || res.dist < best.dist) { best = res; bestI = i; }
    }
    return { segIndex: bestI, point: { x: best.x, y: best.y }, t: best.t, dist: best.dist, dirx: best.dirx, diry: best.diry };
  }

  function aheadPointOnPath(path, segIndex, t, lookahead) {
    // Move forward along the polyline by 'lookahead' distance from (segIndex,t)
    let i = Math.max(0, Math.min(segIndex, path.length-2));
    let ax = path[i].x, ay = path[i].y;
    let bx = path[i+1].x, by = path[i+1].y;
    let segLen = Math.hypot(bx-ax, by-ay) || 1;
    let remain = lookahead + (t * segLen);
    // advance over segments
    while (i < path.length-1) {
      ax = path[i].x; ay = path[i].y; bx = path[i+1].x; by = path[i+1].y;
      segLen = Math.hypot(bx-ax, by-ay) || 1;
      if (remain <= segLen) {
        const lt = Math.max(0, Math.min(1, remain / segLen));
        return { x: ax + (bx-ax)*lt, y: ay + (by-ay)*lt };
      }
      remain -= segLen;
      i++;
    }
    // If we run out, return last point (likely near the pin)
    return { x: path[path.length-1].x, y: path[path.length-1].y };
  }

  // Move along a polyline by a signed distance from a current (segIndex, t) location.
  // Positive distance moves toward the end; negative moves toward the start.
  function moveAlongPath(path, segIndex, t, distance) {
    if (!path || path.length < 2) return null;
    let i = Math.max(0, Math.min(segIndex, path.length - 2));
    let ax = path[i].x, ay = path[i].y;
    let bx = path[i+1].x, by = path[i+1].y;
    let segLen = Math.hypot(bx-ax, by-ay) || 1;
    // Convert current fractional position to absolute distance from segment start
    let pos = t * segLen + distance;
    // Move forward across segments
    while (pos > segLen && i < path.length - 2) {
      pos -= segLen;
      i++;
      ax = path[i].x; ay = path[i].y; bx = path[i+1].x; by = path[i+1].y;
      segLen = Math.hypot(bx-ax, by-ay) || 1;
    }
    // Move backward across segments
    while (pos < 0 && i > 0) {
      i--;
      ax = path[i].x; ay = path[i].y; bx = path[i+1].x; by = path[i+1].y;
      segLen = Math.hypot(bx-ax, by-ay) || 1;
      pos += segLen;
    }
    const lt = Math.max(0, Math.min(1, pos / segLen));
    return { x: ax + (bx-ax) * lt, y: ay + (by-ay) * lt, segIndex: i, t: lt };
  }

  // Compute a smooth lookahead distance along the zig-zag path based on speed.
  // This predicts where the ship will be shortly and steers toward that point to avoid S-turns.
  function zigLookaheadForSpeed(params, kts) {
    const k = Math.max(0, Math.min(30, Math.abs(kts || 0)));
    // Use the same low-speed easing as movement to avoid twitch near 0 kts
    const kEff = (k >= 5) ? k : (k / 5) * (k / 5) * 5;
    const worldSpeedPerSec = ship.speed * (kEff / 15);
    const timeAhead = 0.7; // seconds to look ahead
    let d = worldSpeedPerSec * timeAhead; // world pixels ahead
    // Clamp relative to wavelength so we corner early but not too far
    const minD = Math.max(30, params.wavelength * 0.25);
    const maxD = Math.max(minD + 1, params.wavelength * 0.9);
    d = Math.max(minD, Math.min(maxD, d));
    return d;
  }

  function getZigParams() {
    // Read from Pattern Options UI with sane defaults
    let amp = 50, wave = 420;
    if (zigAmpEl) {
      const v = parseFloat(zigAmpEl.value);
      if (isFinite(v) && v > 0) amp = v;
    }
    if (zigWaveEl) {
      const v = parseFloat(zigWaveEl.value);
      if (isFinite(v) && v > 0) wave = v;
    }
    return { amplitude: amp, wavelength: wave };
  }
  
  // --- Ship Wake Particle System (top-down) ---
  const wake = {
    pool: [],
    active: [],
    max: 90,
    tex: null,
    sideToggle: 1, // alternate left/right edge emission for visual variety
    enabled: false, // globally toggle wake rendering; disabled by default
  };
  function createWakeTexture() {
    const c = document.createElement('canvas');
    const w = 64, h = 24; c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0,0,w,h);
    // Soft foamy ellipse: white center, transparent edges
    const grad = g.createRadialGradient(w/2, h/2, 2, w/2, h/2, Math.max(w,h)/2);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(240,240,240,0.6)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w/2, h/2, w/2, h/2, 0, 0, Math.PI*2);
    g.fill();
    return c;
  }
  function allocWake() {
    return wake.pool.length ? wake.pool.pop() : {
      x:0,y:0, vx:0,vy:0, life:0, maxLife:1, w:12, l:20, rot:0, baseA:0.8,
      type:'edge', rippleAmp:1.5, rippleFreq:2.0, sideX:0, sideY:0,
    };
  }
  function freeWake(p) { wake.pool.push(p); }
  function wakeEmissionRateKps(kts) {
    // No wake below 1 kt; ~4/sec @5kts up to ~28/sec @30kts
    const t = Math.max(0, Math.min(1, (kts - 1) / 29));
    return 4 + t * (28 - 4);
  }
  function spawnWake(px, py, hr, kts, kind, sideSign) {
    const p = allocWake();
    p.x = px; p.y = py;
    const t = Math.max(0, Math.min(1, kts/30));
    p.type = kind; // 'edge' or 'core'
    // Opening angle for Kelvin-like wake edges (deg)
    const openDeg = 12 + t * (28 - 12);
    const open = (openDeg * Math.PI/180);
    // Base backward direction from ship heading
    const backX = -Math.sin(hr), backY = Math.cos(hr);
    // Left/right side unit perpendicular in ship space
    const sX = Math.cos(hr), sY = Math.sin(hr);
    // Speed along trail
    const base = 60 + t * 140; // px/s
    let vx, vy;
    if (kind === 'edge') {
      // Rotate backward vector by Â±open angle to form the V edges
      const ang = Math.atan2(backY, backX) + (sideSign > 0 ? open : -open);
      vx = Math.cos(ang) * base;
      vy = Math.sin(ang) * base;
      // Ripple parameters for foam shimmer
      p.rippleAmp = 1.0 + Math.random()*2.0;           // px
      p.rippleFreq = 3.0 + Math.random()*2.5;          // Hz (cycles/sec)
      p.sideX = -Math.sin(ang); // side vector perpendicular to velocity dir
      p.sideY = Math.cos(ang);
      // Edge streaks are thinner but longer
      p.w = 5 + t * 8;
      p.l = 16 + t * 28;
      p.baseA = 0.5 + t * 0.25;
      p.maxLife = (0.7 + Math.random()*0.5) + t * 0.9;
    } else {
      // Core churn straight aft with slight randomness
      vx = backX * base;
      vy = backY * base;
      p.rippleAmp = 0.5 + Math.random()*1.0;
      p.rippleFreq = 2.0 + Math.random()*1.5;
      p.sideX = sX; p.sideY = sY;
      // Core is wider, shorter
      p.w = 7 + t * 10;
      p.l = 12 + t * 20;
      p.baseA = 0.6 + t * 0.2;
      p.maxLife = (0.6 + Math.random()*0.4) + t * 0.7;
    }
    // Add a touch of lateral turbulence
    const jitter = (Math.random()*2 - 1) * (6 + t*10);
    vx += sX * jitter * 0.2; vy += sY * jitter * 0.2;
    p.vx = vx; p.vy = vy;
    // Orient along velocity direction
    p.rot = Math.atan2(p.vy, p.vx);
    p.life = 0;
    wake.active.push(p);
  }
  function updateAndDrawWakeWorld(dt) {
    if (!wake.tex) wake.tex = createWakeTexture();
    // Stern position: behind the ship center along heading
    const hr = ship.heading * Math.PI/180;
    const sternOffset = 18; // world px toward stern
    const sternX = ship.x - Math.sin(hr) * sternOffset;
    const sternY = ship.y + Math.cos(hr) * sternOffset; // behind center (downwards in heading frame)
    const kts = Math.abs(actualSpeedKts);
    const rate = wakeEmissionRateKps(kts);
    updateAndDrawWakeWorld._emitAcc = (updateAndDrawWakeWorld._emitAcc||0) + rate * dt;
    // Reduce when zoomed out for perf
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const cap = scale < 0.6 ? Math.round(wake.max * 0.6) : wake.max;
    while (updateAndDrawWakeWorld._emitAcc >= 1 && wake.active.length < cap) {
      const side = (wake.sideToggle *= -1); // alternate left/right
      // Emit two edge particles more often and one core occasionally
      const edgeBias = 0.8; // proportion of emissions that are edges
      const sx = sternX, sy = sternY;
      spawnWake(sx, sy, hr, kts, 'edge', side);
      if (Math.random() > edgeBias) {
        spawnWake(sx, sy, hr, kts, 'core', 0);
      }
      updateAndDrawWakeWorld._emitAcc -= 1;
    }

    // Minimal wind/current influence
    const wRad = wind.currentDeg * Math.PI/180;
    const windPxPerSecPerKt = 0.15; // tiny effect on wake
    const wMag = Math.max(0, wind.currentSpeed) * windPxPerSecPerKt;
    const wx = Math.sin(wRad) * wMag;
    const wy = -Math.cos(wRad) * wMag;

    const alives = [];
    const tex = wake.tex;
    for (let i=0;i<wake.active.length;i++){
      const p = wake.active[i];
      p.life += dt;
      const tLife = Math.max(0, Math.min(1, p.life / p.maxLife));
      if (tLife >= 1) { freeWake(p); continue; }
      // Integrate motion with slight decay; tiny wind push; small random
      p.vx += wx * dt + (Math.random()*2-1) * 2 * dt;
      p.vy += wy * dt + (Math.random()*2-1) * 2 * dt;
      // Light damping to reduce jitter over time
      p.vx *= (1 - 0.15*dt);
      p.vy *= (1 - 0.15*dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Re-orient along current velocity
      p.rot = Math.atan2(p.vy, p.vx);
      // Shrink and fade over time
      const alpha = p.baseA * (1 - tLife);
      const wNow = p.w * (1 - tLife*0.6);
      const lNow = p.l * (1 - tLife*0.2);
      // Ripple foam offset along the local side vector (stronger on edges)
      let rdx = 0, rdy = 0;
      if (p.type === 'edge') {
        const phase = p.life * p.rippleFreq * Math.PI * 2;
        const amp = p.rippleAmp * (1 - tLife);
        // sideX/sideY should be unit perpendicular to velocity; fallback if missing
        const sx = p.sideX || -Math.sin(p.rot);
        const sy = p.sideY || Math.cos(p.rot);
        rdx = sx * Math.sin(phase) * amp;
        rdy = sy * Math.sin(phase) * amp;
      }
      const a = Math.max(0, Math.min(1, alpha));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x + rdx, p.y + rdy);
      ctx.rotate(p.rot);
      ctx.drawImage(tex, -lNow/2, -wNow/2, lNow, wNow);
      ctx.restore();
      alives.push(p);
    }
    wake.active = alives;
  }
  // Simple global toggles for wake usage in the future
  try {
    window.IronTideWake = {
      setEnabled(b) { wake.enabled = !!b; },
      enable() { wake.enabled = true; },
      disable() { wake.enabled = false; },
      get enabled() { return !!wake.enabled; },
    };
  } catch {}

  // Draw ship in world coordinates using the world transform scale for consistent sizing
  function drawShipWorld() {
    // Skip drawing if player is sunk
    try { if (window.shipState && (window.shipState.effects?.sunk || window.shipState.sunk)) return; } catch {}
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale;
    const targetHBase = 96;
    const targetHScreen = Math.round(targetHBase * zoomOutSlider.value);
    const worldH = Math.max(1, targetHScreen / scale);
    // Fleet highlight ring (selected fleet only)
    try {
      const sel = window.IronTideSelectedFleet || 1;
      const playerId = (window.shipState && window.shipState.id) ? String(window.shipState.id) : '';
      // Robust membership check across all assignment stores; no defaulting to Fleet 1
      const isInSel = (function(){
        try { const A = window.IronTideFleetAssignments; if (A && A[sel] instanceof Set && (A[sel].has(playerId) || A[sel].has(Number(playerId)))) return true; } catch {}
        try { const B = window.fleetAssignments; if (B && B[sel] instanceof Set && (B[sel].has(playerId) || B[sel].has(Number(playerId)))) return true; } catch {}
        try { const C = window.fa; if (C && C[sel] instanceof Set && (C[sel].has(playerId) || C[sel].has(Number(playerId)))) return true; } catch {}
        return false;
      })();
      if (isInSel) {
        const lw = Math.max(0.5, 1 / (scale || 1)); // thin screen-consistent
        // Radius 50% larger than the bigger ship dimension
        let worldW = worldH;
        if (shipImg && shipImg.width && shipImg.height) {
          worldW = Math.round(worldH * (shipImg.width / shipImg.height));
        }
        const baseR = Math.max(worldW, worldH) / 2;
        const r = baseR * 1.5;
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = 'rgba(40, 220, 60, 0.95)';
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } catch {}
    // If Gunnery mode is on (desktop) OR Gunnery FIRE is enabled (mobile path), draw the red range circle
    // Desktop behavior preserved (gunnery.enabled) - but only if player is in Fleet 1.
    // On touch devices, also render when placing/has target to help aiming.
    const isTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
    const playerId = window.shipState && window.shipState.id != null ? String(window.shipState.id) : null;
    const playerInFleet1 = !!(playerId && window.IronTideFleetAssignments && window.IronTideFleetAssignments[1] && window.IronTideFleetAssignments[1].has(playerId));
    const desktopGate = playerInFleet1 && (typeof gunnery !== 'undefined' && gunnery && gunnery.enabled);
    const mobileGate = isTouch || (typeof gunneryFire !== 'undefined' && gunneryFire && gunneryFire.enabled) || (isTouch && ((firingSolution && (firingSolution.placing || firingSolution.target))));
    if (desktopGate || mobileGate) {
      // Use the same world-space range as shell clamping to ensure parity across devices
      const radius = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : (16.8 * worldH);
      let lw = Math.max(1, 2 / (scale || 1)); // keep screen-constant thickness
      if (isTouch) lw = Math.max(lw, 2.25);   // stronger on touch devices
      // Underlay (halo) only on touch to guarantee visibility
      if (isTouch) {
        ctx.save();
        ctx.lineWidth = Math.max(1, lw + 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // Primary red stroke (desktop and mobile)
      ctx.save();
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(220, 30, 30, 0.98)';
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Additionally, when Fleet 2 or Fleet 3 gunnery is toggled ON, always show that fleet leader's range ring
    try {
      const selFleet = (window.IronTideSelectedFleet || 1);
      if (selFleet !== 1) {
        window.FleetGunnery = window.FleetGunnery || { 2: {}, 3: {} };
        const fg = window.FleetGunnery[selFleet];
        if (fg && fg.gunneryEnabled) {
          const leader = (typeof getFleetLeader === 'function') ? getFleetLeader(selFleet) : null;
          const st = leader && leader.state && leader.state.ship ? leader.state.ship : null;
          if (st) {
            const radius = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : (16.8 * worldH);
            const lw = Math.max(1, 2 / (scale || 1));
            // Distinct colors per fleet to differentiate from Fleet 1 red ring
            const col = selFleet === 2 ? 'rgba(255, 215, 0, 0.98)' : 'rgba(0, 200, 255, 0.98)';
            ctx.save();
            ctx.lineWidth = lw;
            ctx.strokeStyle = col;
            ctx.beginPath();
            ctx.arc(st.x, st.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    } catch {}
    // Draw ghost placement target (acts as custom cursor) while placing
    if (firingSolution && firingSolution.placing && firingSolution.hover) {
      const t = firingSolution.hover;
      const ringR = 12 / (scale || 1);
      const armL = 16 / (scale || 1);
      const gap = 6 / (scale || 1);
      const lw = Math.max(1, 2 / (scale || 1));
      ctx.save();
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(235, 50, 50, 0.6)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, ringR, 0, Math.PI*2);
      ctx.moveTo(t.x - armL, t.y); ctx.lineTo(t.x - gap, t.y);
      ctx.moveTo(t.x + gap, t.y); ctx.lineTo(t.x + armL, t.y);
      ctx.moveTo(t.x, t.y - armL); ctx.lineTo(t.x, t.y - gap);
      ctx.moveTo(t.x, t.y + gap); ctx.lineTo(t.x, t.y + armL);
      ctx.stroke();
      ctx.restore();
    }
    // Draw pinned firing solution target (crosshair), constant on-screen size
    if (firingSolution && firingSolution.target) {
      const t = firingSolution.target;
      const ringR = 12 / (scale || 1);   // ~12px ring radius on screen
      const armL = 16 / (scale || 1);    // ~16px arm length on screen
      const gap = 6 / (scale || 1);      // gap around center
      const lw = Math.max(1, 2 / (scale || 1));
      ctx.save();
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(235, 50, 50, 0.95)';
      ctx.beginPath();
      // Outer ring
      ctx.arc(t.x, t.y, ringR, 0, Math.PI*2);
      // Cross arms with center gap
      // Horizontal left
      ctx.moveTo(t.x - armL, t.y);
      ctx.lineTo(t.x - gap, t.y);
      // Horizontal right
      ctx.moveTo(t.x + gap, t.y);
      ctx.lineTo(t.x + armL, t.y);
      // Vertical up
      ctx.moveTo(t.x, t.y - armL);
      ctx.lineTo(t.x, t.y - gap);
      // Vertical down
      ctx.moveTo(t.x, t.y + gap);
      ctx.lineTo(t.x, t.y + armL);
      ctx.stroke();
      // Center dot
      ctx.fillStyle = 'rgba(235, 50, 50, 0.95)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(1, 2/(scale||1)), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    // Draw pinned firing solution targets for Fleet 2/3
    try {
      [2, 3].forEach(fid => {
        const g = window.FleetGunnery && window.FleetGunnery[fid];
        if (g && g.target) {
          const t = g.target;
          const ringR = 12 / (scale || 1);
          const armL = 16 / (scale || 1);
          const gap = 6 / (scale || 1);
          const lw = Math.max(1, 2 / (scale || 1));
          ctx.save();
          ctx.lineWidth = lw;
          ctx.strokeStyle = fid === 2 ? 'rgba(255,255,0,0.95)' : 'rgba(0,255,255,0.95)'; // Yellow for Fleet 2, Cyan for Fleet 3
          ctx.beginPath();
          // Outer ring
          ctx.arc(t.x, t.y, ringR, 0, Math.PI*2);
          // Cross arms with center gap
          ctx.moveTo(t.x - armL, t.y); ctx.lineTo(t.x - gap, t.y);
          ctx.moveTo(t.x + gap, t.y); ctx.lineTo(t.x + armL, t.y);
          ctx.moveTo(t.x, t.y - armL); ctx.lineTo(t.x, t.y - gap);
          ctx.moveTo(t.x, t.y + gap); ctx.lineTo(t.x, t.y + armL);
          ctx.stroke();
          // Center dot
          ctx.fillStyle = fid === 2 ? 'rgba(255,255,0,0.95)' : 'rgba(0,255,255,0.95)';
          ctx.beginPath();
          ctx.arc(t.x, t.y, Math.max(1, 2/(scale||1)), 0, Math.PI*2);
          ctx.fill();
          ctx.restore();
        }
      });
    } catch {}
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate((ship.heading) * Math.PI / 180);

    if (shipImg) {
      const aspect = shipImg.width / shipImg.height;
      const worldW = Math.round(worldH * aspect);
      const prevSmooth = ctx.imageSmoothingEnabled;
      const prevQual = ctx.imageSmoothingQuality;
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'high'; } catch {}
      ctx.drawImage(shipImg, -worldW / 2, -worldH / 2, worldW, worldH);
      ctx.imageSmoothingEnabled = prevSmooth;
      try { ctx.imageSmoothingQuality = prevQual; } catch {}

      if (turretImg && turretPoints && turretPoints.length) {
        const sx = worldW / shipImg.width;
        const sy = worldH / shipImg.height;
        const turretW = Math.round(worldW * 0.175);
        const tAspect = turretImg.width / turretImg.height;
        const turretH = Math.round(turretW / tAspect);
        // Draw order from bottom to top: t1, t4, t3, t2 (t2 and t3 are above t1 and t4)
        const order = ['t1', 't4', 't3', 't2'];
        const byId = new Map(turretPoints.map(p => [p.id, p]));
        order.forEach(id => {
          const p = byId.get(id);
          if (!p) return;
          const tx = (p.x - shipImg.width / 2) * sx;
          const ty = (p.y - shipImg.height / 2) * sy;
          // Per-turret relative angle (fallback 0)
          const relDeg = (turretAnglesRelDeg && typeof turretAnglesRelDeg[id] === 'number') ? turretAnglesRelDeg[id] : 0;
          const extraRot = relDeg * Math.PI / 180;
          // Despawn at 100% damage: check hitbox state and explode once
          try {
            window.PlayerTurretDestroyed = window.PlayerTurretDestroyed || { turret1:false, turret2:false, turret3:false, turret4:false };
            const hbKey = String(id).replace(/^t/, 'turret');
            const hbMap = (window.shipProfile && window.shipProfile.damage && window.shipProfile.damage.hitboxes) ? window.shipProfile.damage.hitboxes : null;
            if (hbMap && hbMap[hbKey]) {
              const hb = hbMap[hbKey];
              const maxhp = (typeof hb.max_hp === 'number') ? hb.max_hp : 0;
              const hp = (typeof hb.hp === 'number') ? hb.hp : maxhp;
              const dp = (typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp > 0 ? (100 - Math.round((hp/Math.max(1,maxhp)) * 100)) : 0);
              const destroyed = (maxhp > 0 && hp <= 0) || (dp >= 100) || !!hb.destroyed;
              if (destroyed) {
                if (!window.PlayerTurretDestroyed[hbKey]) {
                  const hr = (ship.heading) * Math.PI/180;
                  const lx = tx;
                  const ly = ty - ((id === 't1') ? (5 / scale) : 0);
                  const wx = ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
                  const wy = ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
                  try { spawnExplosion(wx, wy); } catch {}
                  try { spawnBlackSmoke(wx, wy, 8); } catch {}
                  window.PlayerTurretDestroyed[hbKey] = true;
                }
                return; // skip drawing destroyed turret and its aim line
              }
            }
          } catch {}
          ctx.save();
          // Shift only t1 forward (toward bow/up) by 5px screen => 5/scale world units
          const forwardDelta = (id === 't1') ? (5 / scale) : 0;
          ctx.translate(tx, ty - forwardDelta);
          ctx.rotate(extraRot);
          // Apply recoil: translate back along local +Y by turretRecoil amount (world units)
          try {
            const rec = (turretRecoil && turretRecoil[id]) ? turretRecoil[id] : 0;
            if (rec > 0) ctx.translate(0, rec);
          } catch {}
          const prevSmoothT = ctx.imageSmoothingEnabled;
          const prevQualT = ctx.imageSmoothingQuality;
          ctx.imageSmoothingEnabled = true;
          try { ctx.imageSmoothingQuality = 'high'; } catch {}
          ctx.drawImage(turretImg, -turretW / 2, -turretH / 2, turretW, turretH);
          // Draw aim line from turret
          const playerId = window.shipState && window.shipState.id != null ? String(window.shipState.id) : null;
          const fa = window.IronTideFleetAssignments || {};
          const playerInFleet1 = !!(playerId && fa[1] instanceof Set && fa[1].has(playerId));
          const playerInFleet2 = !!(playerId && fa[2] instanceof Set && fa[2].has(playerId));
          const playerInFleet3 = !!(playerId && fa[3] instanceof Set && fa[3].has(playerId));

          // Case A: Player in Fleet 1 -> use original firingSolution
          if (playerInFleet1 && gunnery.enabled && firingSolution && (firingSolution.target || firingSolution.targetId != null)) {
            let lineLen = 500; // default forward length in world units
            const lw = Math.max(0.5, 1 / (scale || 1));
            let color = 'rgba(220,60,60,0.95)'; // default to red while turning/computing
            let dx = 0, dy = -lineLen; // default: forward in turret local space
            // Resolve target: world point or ship with leading
            let tgt = firingSolution.target;
            try {
              if (!tgt && firingSolution.targetId != null) {
                const tid = String(firingSolution.targetId);
                const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
                for (let i=0;i<others.length;i++) { const s = others[i]; if (String(s.id) === tid) { tgt = { x: s.x, y: s.y, __id: tid }; break; } }
              }
              // If aiming at a ship id, compute a lead point
              if (tgt && tgt.__id) {
                const muzzle = (function(){
                  const hr = (ship.heading) * Math.PI/180;
                  const lx0 = tx; const ly0 = ty - forwardDelta;
                  const wx = ship.x + (lx0 * Math.cos(hr) - ly0 * Math.sin(hr));
                  const wy = ship.y + (lx0 * Math.sin(hr) + ly0 * Math.cos(hr));
                  return { x: wx, y: wy };
                })();
                const v = getTrackedVelocity(tgt.__id);
                const ps = getShellSpeedWorldPerSec();
                const lead = predictIntercept(muzzle, { x: tgt.x, y: tgt.y }, v, ps);
                const blend = 0.85; // reduce accuracy vs stationary
                tgt = { x: tgt.x*(1-blend) + lead.x*blend, y: tgt.y*(1-blend) + lead.y*blend };
                // Also reflect the lead in the global pin for consistency
                try { firingSolution.target = { x: tgt.x, y: tgt.y }; } catch {}
              }
            } catch {}
            // Compute turret world position from ship transform and local turret offset
            const hr = (ship.heading) * Math.PI/180;
            const lx = tx; // local in ship space
            const ly = ty - forwardDelta;
            const twx = ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
            const twy = ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
            const wdx = tgt ? (tgt.x - twx) : 0;
            const wdy = tgt ? (tgt.y - twy) : -lineLen;
            // Set line length to actual distance so the line ends at the target
            lineLen = Math.hypot(wdx, wdy) || lineLen;
            // Convert world vector to heading degrees (0 = up/-Y), consistent with ship/turret headings
            const desiredHeadingDeg = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
            // Desired relative angle in ship space
            const desiredRelDeg = ((desiredHeadingDeg - ship.heading) % 360 + 360) % 360;
            // Compute smallest signed delta between current turret rel angle and desired rel angle
            let delta = desiredRelDeg - relDeg;
            delta = ((delta + 540) % 360) - 180; // normalize to [-180,180]
            // Keep the line oriented along the current turret barrel while tracking
            dx = 0; dy = -lineLen;
            // Dead-zone (Bridge) occlusion check: t1/t2 top zone, t3/t4 bottom zone
            const topDeadStart = 145, topDeadEnd = 235;   // must mirror update loop
            const bottomDeadStart = 325, bottomDeadEnd = 55;
            const isTop = (id === 't1' || id === 't2');
            const ds = isTop ? topDeadStart : bottomDeadStart;
            const de = isTop ? topDeadEnd : bottomDeadEnd;
            const occluded = inDeadZone(desiredRelDeg, ds, de);
            // Color red until aligned; turn green only when aligned and not occluded
            const aligned = Math.abs(delta) <= 1; // degrees threshold
            color = (aligned && !occluded) ? 'rgba(40,180,60,0.95)' : 'rgba(220,60,60,0.95)';
            ctx.save();
            ctx.lineWidth = lw;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dx, dy);
            ctx.stroke();
            ctx.restore();
          }
          ctx.imageSmoothingEnabled = prevSmoothT;
          try { ctx.imageSmoothingQuality = prevQualT; } catch {}
          ctx.restore();
        });
      }

      // Box options listeners (attach once)
      window.__boxHandlersAdded__ = window.__boxHandlersAdded__ || false;
      if (!window.__boxHandlersAdded__) {
        if (boxLoopBtn) boxLoopBtn.addEventListener('click', ()=>{
          const on = !boxLoopBtn.classList.contains('active');
          boxLoopBtn.classList.toggle('active', on);
          try { boxLoopBtn.setAttribute('aria-pressed', String(on)); } catch {}
          patterns.boxLoop = on;
        });
        if (boxDirCwBtn) boxDirCwBtn.addEventListener('click', ()=> setBoxDir(true));
        if (boxDirCcwBtn) boxDirCcwBtn.addEventListener('click', ()=> setBoxDir(false));
        window.__boxHandlersAdded__ = true;
      }
      
      // Free Draw options listeners (attach once)
      window.__freeDrawHandlersAdded__ = window.__freeDrawHandlersAdded__ || false;
      if (!window.__freeDrawHandlersAdded__) {
        let attachedAny = false;
        if (freeDrawLoopBtn) { freeDrawLoopBtn.addEventListener('click', ()=>{
          const on = !freeDrawLoopBtn.classList.contains('active');
          freeDrawLoopBtn.classList.toggle('active', on);
          try { freeDrawLoopBtn.setAttribute('aria-pressed', String(on)); } catch {}
          patterns.freeDrawLoop = on;
        }); attachedAny = true; }
        // Direction buttons are bound later next to the setter (like Box)
        if (freeDrawResetBtn) { freeDrawResetBtn.addEventListener('click', ()=>{
          // Clear the current fleet's pattern and re-enter placement for free draw
          const currentFleet = window.IronTideSelectedFleet || 1;
          clearPattern(currentFleet);
          
          // Re-enter free draw placement mode for both FleetPatterns and live patterns
          const fleetPatterns = getFleetPatterns(currentFleet);
          fleetPatterns.selected = 'freedraw';
          fleetPatterns.pendingSelection = 'freedraw';
          fleetPatterns.path = [];
          fleetPatterns.freeDrawPins = [];
          fleetPatterns.freeDrawComplete = false;
          fleetPatterns.placingPin = true;
          fleetPatterns.guiding = true;
          
          // Sync live patterns so first click is recognized
          patterns.selected = 'freedraw';
          patterns.pendingSelection = 'freedraw';
          patterns.path = [];
          patterns.freeDrawPins = [];
          patterns.freeDrawComplete = false;
          patterns.placingPin = true;
          patterns.guiding = true;

          // Update UI
          if (patternSelEl) {
            patternSelEl.value = 'Free Draw';
            patternSelEl.classList.add('pattern-placing');
          }
          setPinCursor(true);
          
          // Show Free Draw options
          if (freeDrawOptionsEl) {
            freeDrawOptionsEl.classList.add('show');
            freeDrawOptionsEl.setAttribute('aria-hidden', 'false');
          }
        }); attachedAny = true; }
        // Direction buttons bound near setter like Box (no delegate here)
        if (attachedAny) window.__freeDrawHandlersAdded__ = true;
      }
      
      // Close button handlers for all pattern options
      if (patternCloseBtn) patternCloseBtn.addEventListener('click', ()=>{
        if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden','true'); }
      });
      if (boxCloseBtn) boxCloseBtn.addEventListener('click', ()=>{
        if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden','true'); }
      });
      if (circleCloseBtn) circleCloseBtn.addEventListener('click', ()=>{
        if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden','true'); }
      });
      if (freeDrawCloseBtn) freeDrawCloseBtn.addEventListener('click', ()=>{
        if (freeDrawOptionsEl) { freeDrawOptionsEl.classList.remove('show'); freeDrawOptionsEl.setAttribute('aria-hidden','true'); }
        // End placement and clear pattern-placing visuals so it can be reopened easily
        patterns.placingPin = false;
        setPinCursor(false);
        if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
        try { if (patternSelEl) patternSelEl.value = ''; } catch {}
      });
      function setBoxDir(cw) {
        patterns.boxCw = !!cw;
        if (boxDirCwBtn && boxDirCcwBtn) {
          boxDirCwBtn.classList.toggle('active', !!cw);
          boxDirCcwBtn.classList.toggle('active', !cw);
        }
        // Sync to current fleet's persisted patterns so following uses correct direction
        try {
          const currentFleet = window.IronTideSelectedFleet || 1;
          if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
            window.FleetPatterns[currentFleet].boxCw = !!cw;
          }
        } catch {}
        // Immediately update desired heading to point along the selected travel direction
        if (patterns.selected === 'box' && patterns.path && patterns.path.length > 2) {
          try {
            const cp = closestPointOnLoop(patterns.path, ship.x, ship.y);
            let perim = 0; for (let i=0;i<patterns.path.length;i++){ const a=patterns.path[i], b=patterns.path[(i+1)%patterns.path.length]; perim += Math.hypot(b.x-a.x,b.y-a.y); }
            const avgSeg = Math.max(30, perim / patterns.path.length);
            const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(actualSpeedKts||0));
            const distSigned = patterns.boxCw ? lookahead : -lookahead;
            const ahead = cp ? moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, distSigned) : patterns.path[1];
            if (ahead) {
              const dxB = ahead.x - ship.x;
              const dyB = ahead.y - ship.y;
              const desiredB = (Math.atan2(dxB, -dyB) * 180 / Math.PI + 360) % 360;
              ship.desiredHeading = desiredB;
            }
            // Ensure guidance is active so reversal takes effect immediately
            patterns.guiding = true;
          } catch {}
        }
      }
      // Bind Box direction buttons
      if (boxDirCwBtn) boxDirCwBtn.addEventListener('click', ()=> setBoxDir(true));
      if (boxDirCcwBtn) boxDirCcwBtn.addEventListener('click', ()=> setBoxDir(false));
      // Initialize highlight state
      setBoxDir(!!patterns.boxCw);
      
      // Free Draw direction control functions
      function setFreeDrawDir(cw) {
        patterns.freeDrawCw = !!cw;
        if (freeDrawDirCwBtn && freeDrawDirCcwBtn) {
          // Deterministically set visual state
          freeDrawDirCwBtn.classList.remove('active');
          freeDrawDirCcwBtn.classList.remove('active');
          if (cw) freeDrawDirCwBtn.classList.add('active'); else freeDrawDirCcwBtn.classList.add('active');
          try {
            freeDrawDirCwBtn.setAttribute('aria-pressed', String(!!cw));
            freeDrawDirCcwBtn.setAttribute('aria-pressed', String(!cw));
          } catch {}
        }
        // Sync to current fleet's persisted patterns so following uses correct direction
        try {
          const currentFleet = window.IronTideSelectedFleet || 1;
          window.FleetPatterns = window.FleetPatterns || {};
          window.FleetPatterns[currentFleet] = window.FleetPatterns[currentFleet] || {};
          window.FleetPatterns[currentFleet].freeDrawCw = !!cw;
        } catch {}
        // Immediately update desired heading to point along the selected travel direction
        if (patterns.selected === 'freedraw' && patterns.path && patterns.path.length > 2) {
          try {
            const cp = closestPointOnLoop(patterns.path, ship.x, ship.y);
            let perim = 0; for (let i=0;i<patterns.path.length;i++){ const a=patterns.path[i], b=patterns.path[(i+1)%patterns.path.length]; perim += Math.hypot(b.x-a.x,b.y-a.y); }
            const avgSeg = Math.max(30, perim / patterns.path.length);
            const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(actualSpeedKts||0));
            const distSigned = patterns.freeDrawCw ? lookahead : -lookahead;
            const ahead = cp ? moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, distSigned) : patterns.path[1];
            if (ahead) {
              const dxF = ahead.x - ship.x;
              const dyF = ahead.y - ship.y;
              const desiredF = (Math.atan2(dxF, -dyF) * 180 / Math.PI + 360) % 360;
              ship.desiredHeading = desiredF;
            }
            // Ensure guidance is active so reversal takes effect immediately
            patterns.guiding = true;
          } catch {}
        }
      }
      
      // Bind Free Draw direction buttons (like Box) and initialize
      if (freeDrawDirCwBtn) freeDrawDirCwBtn.addEventListener('click', ()=> setFreeDrawDir(true));
      if (freeDrawDirCcwBtn) freeDrawDirCcwBtn.addEventListener('click', ()=> setFreeDrawDir(false));
      setFreeDrawDir(!!patterns.freeDrawCw);
      
      // Box reset: delete box loop and return to pin placement
      const boxResetBtn = document.getElementById('boxReset');
      if (boxResetBtn) boxResetBtn.addEventListener('click', ()=>{
        // Clear the current fleet's pattern and re-enter placement for box
        const currentFleet = window.IronTideSelectedFleet || 1;
        clearPattern(currentFleet);
        
        // Re-enter box placement mode
        const fleetPatterns = getFleetPatterns(currentFleet);
        fleetPatterns.selected = 'box';
        fleetPatterns.pendingSelection = 'box';
        fleetPatterns.placingPin = true;
        fleetPatterns.guiding = true;
        
        // Also update global patterns for current fleet
        if (currentFleet === (window.IronTideSelectedFleet || 1)) {
          patterns.selected = 'box';
          patterns.pendingSelection = 'box';
          patterns.placingPin = true;
          patterns.guiding = true;
        }
        
        if (patternSelEl) patternSelEl.classList.add('pattern-placing');
        setPinCursor(true);
        // Keep the box options window visible
        if (boxOptionsEl) { boxOptionsEl.classList.add('show'); boxOptionsEl.setAttribute('aria-hidden','false'); }
      });
      if (boxCloseBtn) boxCloseBtn.addEventListener('click', ()=>{
        if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden','true'); }
        // Do not clear any box planning/pins; just hide UI
        patterns.placingPin = false;
        setPinCursor(false);
        if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
        try { patternSelEl.value = ''; } catch {}
      });
    }
    ctx.restore();
  }

  // --- DEBUG: Track Fleet 2/3 state ---
  window.debugFleets = {
    log: function(fid, msg) {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[FLEET${fid} ${ts}]`, msg);
    },
    logTurret: function(fid, id, msg) {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[FLEET${fid} ${ts} ${id}]`, msg);
    }
  };

  // --- DEBUG: Track Fleet 2/3 state ---
  window.debugFleets = {
    log: function(fid, msg) {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[FLEET${fid} ${ts}]`, msg);
    },
    logTurret: function(fid, id, msg) {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[FLEET${fid} ${ts} ${id}]`, msg);
    }
  };

  // --- DEBUG: Track Fleet 2/3 state ---
  window.debugFleets = {
    log: function(fid, msg) {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[FLEET${fid} ${ts}]`, msg);
    },
    logTurret: function(fid, id, msg) {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[FLEET${fid} ${ts} ${id}]`, msg);
    }
  };

  // --- NPC Bismarck (stationary target) ---
  // Naming counters per side/type
  window.ShipCounters = window.ShipCounters || { enemy: {}, friendly: {} };
  let npc1 = null; // Legacy single NPC handle (kept for compatibility)
  window.NPCs = window.NPCs || []; // [{ state, profile, damageModel }]
  
  // Generate a fresh, pristine ship profile (not cloned from potentially damaged window.shipProfile)
  function createFreshProfile() {
    return {
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
      hullIntegrity: { maxHP: 2000, currentHP: 2000 },
      damage: {
        flooding: { level_percent: 0, max_percent: 100 },
        fire: { level_percent: 0, max_percent: 100 },
        hitboxes: {
          aa1: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          aa2: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          bow: { hp: 500, max_hp: 500, damage_percent: 0, floodable: true },
          bridge: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          damagecontrol1: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          damagecontrol2: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          engine: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false },
          funnel: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          hullaft1: { hp: 400, max_hp: 400, damage_percent: 0, floodable: true },
          hullaft2: { hp: 400, max_hp: 400, damage_percent: 0, floodable: true },
          hullfore1: { hp: 400, max_hp: 400, damage_percent: 0, floodable: true },
          hullfore2: { hp: 400, max_hp: 400, damage_percent: 0, floodable: true },
          hullmid: { hp: 400, max_hp: 400, damage_percent: 0, floodable: true },
          magazine: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false },
          prop: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false },
          rangefinder: { hp: 100, max_hp: 100, damage_percent: 0, floodable: false },
          rudder: { hp: 200, max_hp: 200, damage_percent: 0, floodable: false },
          torpedotube1: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          torpedotube2: { hp: 300, max_hp: 300, damage_percent: 0, floodable: false },
          turret1: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false },
          turret2: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false },
          turret3: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false },
          turret4: { hp: 500, max_hp: 500, damage_percent: 0, floodable: false }
        }
      }
    };
  }
  function spawnNpcBismarck() {
    try {
      if (!window.shipProfile || !window.shipState || npc1) return;
      // Use fresh pristine profile instead of cloning potentially damaged player profile
      const prof = createFreshProfile();
      // Rename NPC and keep all four turrets hooked to damage model
      try {
        // Do not overwrite prof.name; keep original class name (e.g., "Bismarck").
        if (prof.damage && prof.damage.hitboxes) {
          const hb = prof.damage.hitboxes;
          // Make all turrets well-armoured like a hull compartment
          const turretKeys = ['turret1','turret2','turret3','turret4'];
          // Pick a representative hull hitbox to copy armour from
          const hullKey = Object.keys(hb).find(k => /^hull/.test(k)) || 'hullmid';
          const hullHb = hb[hullKey];
          if (hullHb && typeof hullHb.max_hp === 'number') {
            turretKeys.forEach(tk => {
              const t = hb[tk] = hb[tk] || { max_hp: 100, hp: 100 };
              t.max_hp = hullHb.max_hp;
              t.hp = hullHb.max_hp;
            });
          }
        }
        // Keep any turret effects intact; no deletion so turrets 2â€“4 stay active
      } catch {}
      const ps = window.shipState.ship || { x: 512, y: 512, speed: 40 };
      // Unique naming using counters like spawnNpcAt() does
      const typeLabel = prof.type || 'Ship';
      const sideKey = 'enemy';
      try {
        window.ShipCounters = window.ShipCounters || { enemy: {}, friendly: {} };
        window.ShipCounters[sideKey][typeLabel] = (window.ShipCounters[sideKey][typeLabel] || 0) + 1;
      } catch {}
      const nIdx = (window.ShipCounters && window.ShipCounters[sideKey] && window.ShipCounters[sideKey][typeLabel]) ? window.ShipCounters[sideKey][typeLabel] : 1;
      const displayName = `Enemy ${typeLabel} ${nIdx}`;
      const state = {
        id: 2,
        displayName,
        SPEED_MIN: -8,  // Fresh default values, not inherited from player
        SPEED_MAX: 30,
        ACCEL_KTS_PER_SEC: 2.5,
        speedKts: 0,
        actualSpeedKts: 0,
        effects: {},  // Fresh effects object
        turret1Destroyed: false,
        ship: {
          x: ps.x + 1600,
          y: ps.y,
          r: prof.dimensions?.radius || 14,
          heading: 0,
          desiredHeading: 0,
          speed: ps.speed || 40,
          moveTarget: null,
        },
      };
      // Important: attach profile onto NPC state so DamageModel can compute effects
      try { state.profile = prof; } catch {}
      // Initialize damage/effects via DamageModel (use same construction as player)
      let dm = null;
      try { dm = new DamageModel(state); } catch {}
      // Register in fleet for HUD lookup
      try {
        window.IronTideFleetNextId = (window.IronTideFleetNextId || 1) + 1;
        state.id = window.IronTideFleetNextId; // ensure unique if needed
        window.IronTideFleet = window.IronTideFleet || [];
        window.IronTideFleet.push({ state, profile: prof });
        // Ensure enemy grouping for targeting separation
        const idStr = String(state.id);
        window.EnemyFleet1 = window.EnemyFleet1 || new Set();
        window.EnemyFleet1.add(idStr);
      } catch {}
      // Initialize NPC-specific turret angle state (independent from player)
      state.npcTurretAnglesRelDeg = { t1: 0, t2: 0, t3: 180, t4: 180 };
      npc1 = { state, profile: prof, damageModel: dm };
      try { window.npc1 = npc1; } catch {}
      // Also register into multi-NPC list for cycling/drawing
      try { window.NPCs.push(npc1); } catch {}
      
      // Register in Multi-HUD system for EYE button cycling
      try {
        const shipId = String(state.id);
        if (typeof window.registerHudForShip === 'function') {
          // Battleships use the right HUD container
          window.registerHudForShip(shipId, 'shipHudRight', 'shipHudCanvasRight');
          console.log('Registered Multi-HUD for Bismarck ID:', shipId);
        }
        
        // Also register in global handle registry for quick lookup
        window.ShipHandlesById = window.ShipHandlesById || {};
        window.ShipHandlesById[shipId] = npc1;
      } catch {}
    } catch {}
  }

  // Strict ID allocator: Friendly 1-49, Enemy 50-99
  function allocateStrictId(side, requestedId){
    try {
      const sideKey = (String(side||'enemy').toLowerCase()==='friendly') ? 'friendly' : 'enemy';
      const range = sideKey==='friendly' ? [1,49] : [50,99];
      // Gather used IDs
      const used = new Set();
      try { if (Array.isArray(window.IronTideFleet)) window.IronTideFleet.forEach(h=>{ const id=String(h?.state?.id); if (id) used.add(id); }); } catch {}
      try { if (Array.isArray(window.NPCs)) window.NPCs.forEach(n=>{ const id=String(n?.state?.id); if (id) used.add(id); }); } catch {}
      // Accept requested if valid and free
      if (requestedId != null) {
        const rid = Number(requestedId)|0; const rs = String(rid);
        if (rid>=range[0] && rid<=range[1] && !used.has(rs)) return rid;
      }
      // Otherwise find first free in range
      for (let i=range[0]; i<=range[1]; i++) { const s=String(i); if (!used.has(s)) return i; }
      return null;
    } catch { return null; }
  }
  try { window.allocateStrictId = allocateStrictId; } catch {}

  // Spawn NPC at specific world coords with options { heading, speedKts, side }
  function spawnNpcAt(wx, wy, opts={}){
    try {
      if (!window.shipProfile || !window.shipState) return null;
      // Use fresh pristine profile instead of cloning potentially damaged player profile
      const prof = createFreshProfile();
      // Determine type label from opts or profile
      const typeLabel = (opts && typeof opts.typeLabel === 'string' && opts.typeLabel) ? opts.typeLabel : (prof.type || 'Ship');
      const sideKey = (opts && opts.side === 'friendly') ? 'friendly' : 'enemy';
      // Increment counter for naming
      try {
        window.ShipCounters[sideKey][typeLabel] = (window.ShipCounters[sideKey][typeLabel] || 0) + 1;
      } catch {}
      const nIdx = (window.ShipCounters && window.ShipCounters[sideKey] && window.ShipCounters[sideKey][typeLabel]) ? window.ShipCounters[sideKey][typeLabel] : 1;
      const displayName = (sideKey === 'enemy') ? (`Enemy ${typeLabel} ${nIdx}`) : (`${typeLabel} ${nIdx}`);
      // Do NOT overwrite prof.name; keep original (e.g., "Bismarck") for HUD left side
      const assignedId = allocateStrictId(sideKey, opts && opts.requestedId);
      const state = {
        id: (assignedId != null ? assignedId : (window.IronTideFleetNextId = (window.IronTideFleetNextId || 1) + 1)),
        displayName,
        side: sideKey,
        SPEED_MIN: -8,  // Fresh default values, not inherited from player
        SPEED_MAX: 30,
        ACCEL_KTS_PER_SEC: 2.5,
        speedKts: Number(opts.speedKts) || 0,
        actualSpeedKts: Number(opts.speedKts) || 0,
        effects: {},  // Fresh effects object
        npcTurretAnglesRelDeg: { t1: 0, t2: 0, t3: 180, t4: 180 },
        ship: { x: Math.round(wx||0), y: Math.round(wy||0), r: prof.dimensions?.radius || 14, heading: Number(opts.heading)||0, desiredHeading: Number(opts.heading)||0, speed: 40, moveTarget: null }  // Fresh default speed
      };
      // Attach profile and DM
      try { state.profile = prof; } catch {}
      let dm = null; try { dm = new DamageModel(state); } catch {}
      const npc = { state, profile: prof, damageModel: dm };
      // CRITICAL: Add to correct array based on side to prevent duplicates
      // Friendly -> IronTideFleet only; Enemy -> NPCs only
      if (sideKey === 'enemy') {
        window.NPCs = window.NPCs || [];
        window.NPCs.push(npc);
        // Maintain legacy handle to latest NPC for backwards usage
        npc1 = npc; try { window.npc1 = npc; } catch {}
      } else {
        // Friendly ships go into IronTideFleet
        window.IronTideFleet = window.IronTideFleet || [];
        window.IronTideFleet.push(npc);
      }
      // Group into Enemy Fleet 1 if enemy; otherwise leave to caller to assign
      try {
        const idStr = String(state.id);
        window.EnemyFleet1 = window.EnemyFleet1 || new Set();
        if (sideKey !== 'friendly') window.EnemyFleet1.add(idStr);
        // Assign friendly ships to Fleet 1 by default
        if (sideKey === 'friendly') {
          window.IronTideFleetAssignments = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
          [1,2,3].forEach(k=>{ if (!(window.IronTideFleetAssignments[k] instanceof Set)) window.IronTideFleetAssignments[k] = new Set(); });
          window.IronTideFleetAssignments[2].delete(idStr);
          window.IronTideFleetAssignments[3].delete(idStr);
          window.IronTideFleetAssignments[1].add(idStr);
        }
      } catch {}
      
      // Register in Multi-HUD system for EYE button cycling
      try {
        const shipId = String(state.id);
        if (typeof window.registerHudForShip === 'function') {
          // Battleships use the right HUD container
          window.registerHudForShip(shipId, 'shipHudRight', 'shipHudCanvasRight');
          console.log('Registered Multi-HUD for spawned battleship ID:', shipId, 'side:', sideKey);
        }
        
        // Also register in global handle registry for quick lookup
        window.ShipHandlesById = window.ShipHandlesById || {};
        window.ShipHandlesById[shipId] = npc;
      } catch {}
      
      return npc;
    } catch { return null; }
  }

  function drawNpcShipWorld() {
    if (!npc1 || !shipImg) return;
    // Skip drawing if npc1 is sunk
    try { if (npc1.state && (npc1.state.effects?.sunk || npc1.state.sunk)) return; } catch {}
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale;
    const targetHBase = 96;
    const targetHScreen = Math.round(targetHBase * zoomOutSlider.value);
    const worldH = Math.max(1, targetHScreen / scale);
    // Per-NPC image: prefer npc1.profile.image; fallback to global shipImg
    window.NpcImageCache = window.NpcImageCache || new Map();
    const getNpcImg = (src)=>{
      if (!src) return null;
      if (window.NpcImageCache.has(src)) return window.NpcImageCache.get(src);
      const im = new Image(); im.src = src; window.NpcImageCache.set(src, im); return im;
    };
    const src = (npc1.profile && npc1.profile.image) ? npc1.profile.image : null;
    const img = getNpcImg(src);
    // Use scaled offscreen sprite when available
    window.NpcScaledCache = window.NpcScaledCache || new Map();
    const scaled = (function(){
      if (!src || !img || !img.complete) return null;
      if (window.NpcScaledCache.has(src)) return window.NpcScaledCache.get(src);
      const BASE_H = 512; const ih = img.naturalHeight, iw = img.naturalWidth; const ratio = iw/ih;
      const oh = Math.max(64, Math.min(BASE_H, ih)); const ow = Math.round(oh * ratio);
      const off = document.createElement('canvas'); off.width = ow; off.height = oh;
      const octx = off.getContext('2d'); octx.imageSmoothingEnabled = true; try { octx.imageSmoothingQuality = 'high'; } catch {}
      octx.drawImage(img, 0, 0, ow, oh); window.NpcScaledCache.set(src, off); return off;
    })();
    const refImg = (scaled || img);
    const iw = (refImg && (refImg.naturalWidth || refImg.width)) ? (refImg.naturalWidth || refImg.width) : shipImg.width;
    const ih = (refImg && (refImg.naturalHeight || refImg.height)) ? (refImg.naturalHeight || refImg.height) : shipImg.height;
    // Cruiser 20% smaller
    const isCruiser = !!(npc1.profile && String(npc1.profile.type||'').toLowerCase() === 'cruiser');
    const sizeMul = isCruiser ? 0.8 : 1.0;
    const worldHScaled = Math.max(1, worldH * sizeMul);
    const worldW = Math.round((iw / ih) * worldHScaled);
    // Compute enemy status ONCE for npc1 so both friend/enemy ring draws can use it
    const npc1Id = npc1 && npc1.state && npc1.state.id != null ? String(npc1.state.id) : '';
    const enemySet1 = (window.EnemyFleet1 instanceof Set) ? window.EnemyFleet1 : new Set();
    const npc1Side = (npc1.state && npc1.state.side) ? String(npc1.state.side).toLowerCase() : ((npc1.profile && npc1.profile.side) ? String(npc1.profile.side).toLowerCase() : '');
    const npc1IsEnemy = enemySet1.has(npc1Id) || enemySet1.has(Number(npc1Id)) || npc1Side === 'enemy';
    // Fleet highlight ring for NPC if in selected fleet (avoid for enemies)
    try {
      const sel = window.IronTideSelectedFleet || 1;
      const npcId = npc1Id;
      const isInSel = (function(){
        try { const A = window.IronTideFleetAssignments; if (A && A[sel] instanceof Set && (A[sel].has(npcId) || A[sel].has(Number(npcId)))) return true; } catch {}
        try { const B = window.fleetAssignments; if (B && B[sel] instanceof Set && (B[sel].has(npcId) || B[sel].has(Number(npcId)))) return true; } catch {}
        try { const C = window.fa; if (C && C[sel] instanceof Set && (C[sel].has(npcId) || C[sel].has(Number(npcId)))) return true; } catch {}
        return false;
      })();
      if (isInSel && !npc1IsEnemy) {
        const lw = Math.max(0.5, 1 / (scale || 1));
        const baseR = Math.max(worldW, worldH) / 2;
        const r = baseR * 1.5;
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = 'rgba(40, 220, 60, 0.95)';
        ctx.beginPath();
        ctx.arc(npc1.state.ship.x, npc1.state.ship.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } catch {}
    // Enemy highlight ring for npc1 (replicate friendly sizing; color red)
    try {
      if (npc1IsEnemy) {
        const lw = Math.max(0.5, 1 / (scale || 1));
        const baseR = Math.max(worldW, worldH) / 2;
        const r = baseR * 1.5;
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = 'rgba(235, 50, 50, 0.95)';
        ctx.beginPath();
        ctx.arc(npc1.state.ship.x, npc1.state.ship.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } catch {}
    ctx.save();
    ctx.translate(npc1.state.ship.x, npc1.state.ship.y);
    ctx.rotate((npc1.state.ship.heading) * Math.PI / 180);
    const prevSmooth = ctx.imageSmoothingEnabled;
    const prevQual = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'low'; } catch {}
    if (typeof scaled !== 'undefined' && scaled) {
      ctx.drawImage(scaled, -worldW / 2, -worldHScaled / 2, worldW, worldHScaled);
    } else if (img && img.complete) {
      ctx.drawImage(img, -worldW / 2, -worldHScaled / 2, worldW, worldHScaled);
    } else {
      ctx.drawImage(shipImg, -worldW / 2, -worldHScaled / 2, worldW, worldHScaled);
    }
    // NPC turrets: handle explosions for turrets 1-4 when destroyed
    try {
      // Prefer per-ship TMX turret points; fall back to global if unavailable
      // Proactively load if not present yet
      try {
        if (npc1.profile && npc1.profile.tmx && !(window.NpcTurretPointsCache && window.NpcTurretPointsCache.has(npc1.profile.tmx))) {
          // This will populate cache asynchronously
          if (typeof getNpcTurretPoints === 'function') getNpcTurretPoints(npc1.profile.tmx).catch(()=>{});
        }
      } catch {}
      const tpCacheN = (npc1.profile && npc1.profile.tmx) ? (window.NpcTurretPointsCache && window.NpcTurretPointsCache.get(npc1.profile.tmx)) : null;
      const localTurretPointsN = (tpCacheN && Array.isArray(tpCacheN.points)) ? tpCacheN.points : null;
      const canPlaceNpc1 = (!!turretImg) && (!!localTurretPointsN && localTurretPointsN.length) && (iw>0 && ih>0);
      if (canPlaceNpc1) {
        const sx = worldW / (iw || 1);
        const sy = worldHScaled / (ih || 1);
        const turretW = Math.round(worldW * 0.175);
        const tAspect = turretImg.width / turretImg.height;
        const turretH = Math.round(turretW / tAspect);
        const byId = new Map(localTurretPointsN.map(p => [p.id, p]));
        npc1.state.turretDestroyedFlags = npc1.state.turretDestroyedFlags || { turret1:false, turret2:false, turret3:false, turret4:false };
        const hbMap = (npc1.profile && npc1.profile.damage && npc1.profile.damage.hitboxes) ? npc1.profile.damage.hitboxes : {};
        ['t1','t2','t3','t4'].forEach(id => {
          const p = byId.get(id);
          if (!p) return;
          const hbKey = id.replace(/^t/, 'turret');
          const hb = hbMap[hbKey];
          const maxhp = hb && typeof hb.max_hp === 'number' ? hb.max_hp : 0;
          const hp = hb && typeof hb.hp === 'number' ? hb.hp : maxhp;
          const dp = (hb && typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp>0 ? (100 - Math.round((hp/Math.max(1,maxhp))*100)) : 0);
          const destroyed = (maxhp > 0 && hp <= 0) || (hb && (hb.destroyed || dp >= 100));
          const tx = (p.x - (iw || 1) / 2) * sx;
          const ty = (p.y - (ih || 1) / 2) * sy;
          if (destroyed) {
            if (!npc1.state.turretDestroyedFlags[hbKey]) {
              const hr = (npc1.state.ship.heading || 0) * Math.PI/180;
              const wx = npc1.state.ship.x + (tx * Math.cos(hr) - ty * Math.sin(hr));
              const wy = npc1.state.ship.y + (tx * Math.sin(hr) + ty * Math.cos(hr));
              try { spawnExplosion(wx, wy); } catch {}
              try { spawnBlackSmoke(wx, wy, 8); } catch {}
              npc1.state.turretDestroyedFlags[hbKey] = true;
            }
            return;
          }
          // Draw intact NPC turret (apply same offsets and rotation as player)
          ctx.save();
          // Per-turret relative angle â€” use NPC-specific angles, independent of player
          let relDeg = 0;
          try {
            const nAngles = npc1 && npc1.state && npc1.state.npcTurretAnglesRelDeg;
            relDeg = (nAngles && typeof nAngles[id] === 'number') ? nAngles[id] : (id==='t3'||id==='t4' ? 180 : 0);
          } catch { relDeg = (id==='t3'||id==='t4' ? 180 : 0); }
          // No forward shift; rotate on the spot
          ctx.translate(tx, ty);
          ctx.rotate(relDeg * Math.PI / 180);
          const prevSmoothT = ctx.imageSmoothingEnabled;
          const prevQualT = ctx.imageSmoothingQuality;
          ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'low'; } catch {}
          ctx.drawImage(turretImg, -turretW / 2, -turretH / 2, turretW, turretH);
          ctx.imageSmoothingEnabled = prevSmoothT;
          try { ctx.imageSmoothingQuality = prevQualT; } catch {}
          ctx.restore();
        });
      }
    } catch {}
    ctx.imageSmoothingEnabled = prevSmooth;
    try { ctx.imageSmoothingQuality = prevQual; } catch {}
    ctx.restore();
  }

  // --- Funnel Smoke Particle System (top-down) ---
  const smoke = {
    pool: [],
    active: [],
    max: 80,
    tex: null, // pre-rendered circular sprite
    smokescreen: false,
  };
  function createSmokeTexture() {
    const c = document.createElement('canvas');
    const s = 64; c.width = s; c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.25, 'rgba(200,200,200,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(s/2, s/2, s/2, 0, Math.PI*2); g.fill();
    return c;
  }
  function allocSmoke() {
    return smoke.pool.length ? smoke.pool.pop() : {
      x:0,y:0, vx:0,vy:0, life:0, maxLife:1, size:10, rot:0, drot:0, baseA:1,
    };
  }
  function freeSmoke(p) {
    smoke.pool.push(p);
  }
  function emissionRateKps(kts) {
    // 2/sec at 0 kts, 40/sec at 30 kts
    const t = Math.max(0, Math.min(1, kts/30));
    let rate = 2 + t * (40 - 2);
    if (smoke.smokescreen) rate *= 2.0;
    return rate;
  }
  function spawnSmoke(px, py, speedKts) {
    const p = allocSmoke();
    p.x = px;
    p.y = py;
    // Base properties scale with speed and smokescreen
    const t = Math.max(0, Math.min(1, speedKts / 30));
    const sizeMin = 6, sizeMax = 28;
    const size = sizeMin + Math.random()*(sizeMax - sizeMin);
    p.size = smoke.smokescreen ? size * 1.25 : size;
    p.maxLife = (0.9 + Math.random()*1.6) * (smoke.smokescreen ? 1.5 : 1.0);
    // Rotation wobble
    p.rot = Math.random()*Math.PI*2;
    p.drot = (Math.random()*2 - 1) * 1.2; // rad/s
    // Opacity base by speed (darker at high speed)
    const opLow = 0.35, opHigh = 0.85;
    p.baseA = (opLow + t*(opHigh - opLow)) * (smoke.smokescreen ? 1.3 : 1.0);
    // Initial drift small; velocity computed in update using wind/ship
    p.vx = 0; p.vy = 0;
    p.life = 0;
    smoke.active.push(p);
  }
  function updateAndDrawSmokeWorld(dt) {
    if (!smoke.tex) smoke.tex = createSmokeTexture();
    // Determine funnel world position slightly aft/center of ship (toward bow/up in ship space)
    const offset = 10; // world px in front of ship center
    const hr = ship.heading * Math.PI/180;
    // Right vector for lateral fine-tune (spawn was appearing left; nudge right)
    const rightX = Math.cos(hr), rightY = Math.sin(hr);
    const lateral = 3; // world px
    const funnelX = ship.x + rightX * lateral;
    const funnelY = ship.y - Math.cos(hr) * offset + rightY * lateral;

    // Emit based on actual speed
    const kts = Math.abs(actualSpeedKts);
    const rate = emissionRateKps(kts);
    updateAndDrawSmokeWorld._emitAcc = (updateAndDrawSmokeWorld._emitAcc||0) + rate * dt;
    const maxParticles = (dpr > 1.4 ? smoke.max : Math.round(smoke.max*0.5));
    while (updateAndDrawSmokeWorld._emitAcc >= 1 && smoke.active.length < maxParticles) {
      spawnSmoke(funnelX, funnelY, kts);
      updateAndDrawSmokeWorld._emitAcc -= 1;
    }

    // Compute wind vector in world units per second, scaled by wind speed (kts)
    const wRad = (wind.currentDeg) * Math.PI/180;
    const windPxPerSecPerKt = 3.0; // convert kts -> px/s influence (stronger)
    const windMag = Math.max(0, wind.currentSpeed) * windPxPerSecPerKt;
    const wxUnit = Math.sin(wRad);
    const wyUnit = -Math.cos(wRad);
    const wxBase = wxUnit * windMag;
    const wyBase = wyUnit * windMag;
    // Ship movement bias (trail behind movement)
    const moveBias = 10; // px/s scaled by current speed ratio
    const tSpeed = Math.max(0, Math.min(1, kts/30));
    const shipVX = Math.sin(hr) * (tSpeed * moveBias);
    const shipVY = -Math.cos(hr) * (tSpeed * moveBias);

    // Draw in world space (assumes caller set world transform)
    const tex = smoke.tex;
    const alives = [];
    for (let i=0;i<smoke.active.length;i++){
      const p = smoke.active[i];
      p.life += dt;
      const lifeT = Math.max(0, Math.min(1, p.life / p.maxLife));
      if (lifeT >= 1) { freeSmoke(p); continue; }
      // Drift: wind (age-ramped) + slight bias opposite to ship motion + random meander
      const randAmp = 6; // px/s
      const rdx = (Math.random()*2-1) * randAmp;
      const rdy = (Math.random()*2-1) * randAmp;
      // Wind influence ramp: start weak, full by ~0.6s starting after 0.2s
      const ramp = Math.max(0, Math.min(1, (p.life - 0.2) / 0.6));
      const wx = wxBase * ramp;
      const wy = wyBase * ramp;
      const shipBias = 1 - ramp; // fade ship trail bias as wind takes over
      p.vx += (wx - shipVX * shipBias + rdx) * dt * 0.5;
      p.vy += (wy - shipVY * shipBias + rdy) * dt * 0.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.drot * dt;
      // Expand and fade over time
      const size = p.size * (1 + lifeT * 1.2);
      const alpha = p.baseA * (1 - lifeT);
      // Darken with speed (simulate soot at flank): modulate composite globalAlpha only
      const alphaClamped = Math.max(0, Math.min(1, alpha));
      ctx.save();
      ctx.globalAlpha = alphaClamped;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * 0.1);
      ctx.drawImage(tex, -size/2, -size/2, size, size);
      ctx.restore();
      alives.push(p);
    }
    smoke.active = alives;
  }
  window.__NAUTICAL_RUNNING__ = true;
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // --- Gunnery Aim Lines Toggle ---
  // Clicking the "Gunnery" button toggles grey direction lines from each turret
  const gunnery = { enabled: false };
  (function setupGunneryToggle(){
    try {
      const btn = document.querySelector('.gunnery-title-btn');
      if (!btn) return;
      // Reflect state: both legacy 'active' and brass-selected visual, plus aria-pressed
      const updateBtn = () => {
        btn.classList.toggle('active', gunnery.enabled);
        btn.classList.toggle('brass-selected', gunnery.enabled);
        btn.setAttribute('aria-pressed', gunnery.enabled ? 'true' : 'false');
        // If turning Gunnery OFF, remove targeting pin and restore default pointer
        if (!gunnery.enabled) {
          try {
            if (typeof firingSolution === 'object' && firingSolution) {
              firingSolution.placing = false;
              firingSolution.hover = null;
              firingSolution.dragging = false;
            }
          } catch {}
          try {
            const solBtn = document.querySelector('.get-firing-solution-btn');
            if (solBtn) solBtn.classList.remove('active');
          } catch {}
          try { canvas.style.cursor = ''; } catch {}
        }
      };
      // Initialize aria role for accessibility
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-pressed', 'false');
      const toggle = () => { gunnery.enabled = !gunnery.enabled; updateBtn(); };
      btn.addEventListener('click', toggle);
      btn.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); }
      });
      updateBtn();
    } catch {}
  })();

  // --- Dock button toggles: Fleet 1/2/3 and Map ---
  (function setupDockToggles(){
    try {
      // Helpers for fleet selection - now all fleets have full access
      function isFleet1Selected(){ return (window.IronTideSelectedFleet || 1) === 1; }
      function setupDockInteractivityBlocker(){
        const dock = document.getElementById('navalDock');
        if (!dock) return;
        
        // Remove old blocking behavior - all fleets now have full modal access
        // Visual feedback: remove fleet-locked class since all fleets can use controls
        const panel = dock.querySelector('.dock-panel');
        if (panel) {
          panel.classList.remove('fleet-locked'); // Always allow full access
        }
      }
      // Fleet buttons (exclude the Gunnery header button which also has 'fleet-btn')
      const fleetBtns = document.querySelectorAll('#navalDock .fleet-btn:not(.gunnery-title-btn)');
      fleetBtns.forEach(btn => {
        try {
          btn.setAttribute('role', 'button');
          if (!btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', 'false');
          const toggle = () => {
            const alreadyOn = btn.classList.contains('brass-selected');
            if (alreadyOn) {
              // Do nothing; cannot turn off current fleet by clicking it again
              return;
            }
            // Switch selection to this button exclusively
            fleetBtns.forEach(other => {
              other.classList.remove('brass-selected');
              other.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('brass-selected');
            btn.setAttribute('aria-pressed', 'true');
            // Track selected fleet index globally (1-based)
            try {
              const idx = Array.prototype.indexOf.call(fleetBtns, btn);
              const newFleetId = (idx >= 0 ? (idx + 1) : 1);
              const oldFleetId = window.IronTideSelectedFleet || 1;
              
              // Save current fleet settings before switching
              if (oldFleetId !== newFleetId) {
                saveCurrentFleetSettings(oldFleetId);
                window.IronTideSelectedFleet = newFleetId;
                loadFleetSettings(newFleetId);
                
                // Snap camera to fleet leader (must always happen on fleet select)
                snapCameraToFleetLeader(newFleetId);

                // Enable follow of selected fleet leader
                window.viewFollow = window.viewFollow || { enabled: false, mode: 'player', fleetId: 1 };
                window.viewFollow.enabled = true;
                window.viewFollow.mode = 'fleet';
                window.viewFollow.fleetId = newFleetId;
              }
            } catch {}
            // Update dock interactivity according to selected fleet
            try { setupDockInteractivityBlocker(); } catch {}
            // Ensure follow mode reflects current fleet selection and update view button UI
            try {
              const vBtn = document.querySelector('#navalDock .gunnery-view-btn');
              if (vBtn) { vBtn.classList.remove('brass-selected'); vBtn.setAttribute('aria-pressed','false'); }
              window.viewFollow = window.viewFollow || { enabled: true, mode: 'fleet', fleetId: window.IronTideSelectedFleet || 1 };
              window.viewFollow.enabled = true;
              window.viewFollow.mode = 'fleet';
              window.viewFollow.fleetId = window.IronTideSelectedFleet || 1;
            } catch {}
          };
          btn.addEventListener('click', toggle);
          btn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); } });
        } catch {}
      });
      // Map button
      const mapBtn = document.querySelector('#navalDock .tactical-map-btn');
      if (mapBtn) {
        try {
          mapBtn.setAttribute('role', 'button');
          if (!mapBtn.hasAttribute('aria-pressed')) mapBtn.setAttribute('aria-pressed', 'false');
          const toggleMap = () => {
            const on = mapBtn.classList.toggle('brass-selected');
            mapBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
          };
          mapBtn.addEventListener('click', toggleMap);
          mapBtn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggleMap(); } });
        } catch {}
      }

      // Initial state: select Fleet 1 and assign Battleship 1 (player) to Fleet 1
      try {
        const firstFleetBtn = fleetBtns && fleetBtns[0];
        if (firstFleetBtn) {
          // Simulate exclusive selection state without firing events
          fleetBtns.forEach(b => { b.classList.remove('brass-selected'); b.setAttribute('aria-pressed', 'false'); });
          firstFleetBtn.classList.add('brass-selected');
          firstFleetBtn.setAttribute('aria-pressed', 'true');
        }
        // HARD RESET: Ensure Fleet 2/3 Gunnery buttons start OFF visually and in state
        try {
          const g2 = document.querySelector('.gunnery-title-btn[data-fleet="2"]');
          const g3 = document.querySelector('.gunnery-title-btn[data-fleet="3"]');
          [g2, g3].forEach(b => {
            if (!b) return;
            b.classList.remove('active');
            b.classList.remove('brass-selected');
            b.setAttribute('aria-pressed', 'false');
          });
          window.FleetGunnery = window.FleetGunnery || { 1:{},2:{},3:{} };
          if (!window.FleetGunnery[2]) window.FleetGunnery[2] = {};
          if (!window.FleetGunnery[3]) window.FleetGunnery[3] = {};
          window.FleetGunnery[2].gunneryEnabled = false;
          window.FleetGunnery[3].gunneryEnabled = false;
        } catch {}
        // Initialize view follow state and mode
        window.viewFollow = { enabled: false, mode: 'player', fleetId: 1 };
        // Initialize per-fleet gunnery state (include explicit gunneryEnabled OFF by default)
        window.FleetGunnery = window.FleetGunnery || {
          1: { targetId: null, fireEnabled: false, gunneryEnabled: false, lastTurretAt: { t1:-1e9,t2:-1e9,t3:-1e9,t4:-1e9 }, intervalSec: 10 },
          2: { targetId: null, fireEnabled: false, gunneryEnabled: false, lastTurretAt: { t1:-1e9,t2:-1e9,t3:-1e9,t4:-1e9 }, intervalSec: 10 },
          3: { targetId: null, fireEnabled: false, gunneryEnabled: false, lastTurretAt: { t1:-1e9,t2:-1e9,t3:-1e9,t4:-1e9 }, intervalSec: 10 }
        };
        window.FleetTargetingMode = window.FleetTargetingMode || { active: false, fid: 0 };
        // Initialize per-fleet gunnery state (independent of player gunnery) and ensure OFF by default
        window.FleetGunnery = window.FleetGunnery || {
          1: { targetId: null, fireEnabled: false, gunneryEnabled: false, lastSalvoAt: 0, intervalSec: 10 },
          2: { targetId: null, fireEnabled: false, gunneryEnabled: false, lastSalvoAt: 0, intervalSec: 10 },
          3: { targetId: null, fireEnabled: false, gunneryEnabled: false, lastSalvoAt: 0, intervalSec: 10 }
        };
        // Initialize manual heading hold flags (per-fleet)
        window.IronTideManualHeadingHold = window.IronTideManualHeadingHold || { 1: false, 2: false, 3: false };
        // Create a simple fleet assignment table on window
        const playerId = (window.shipState && window.shipState.id) ? String(window.shipState.id) : '1';
        window.IronTideFleetAssignments = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        // Ensure Sets for idempotency
        [1,2,3].forEach(k=>{ if (!(window.IronTideFleetAssignments[k] instanceof Set)) window.IronTideFleetAssignments[k] = new Set(); });
        // Assign player ship to Fleet 1 exclusively
        window.IronTideFleetAssignments[2].delete(playerId);
        window.IronTideFleetAssignments[3].delete(playerId);
        window.IronTideFleetAssignments[1].add(playerId);
        // Default selected fleet is 1
        window.IronTideSelectedFleet = 1;
        // Install blocker now that dock exists
        try { setupDockInteractivityBlocker(); } catch {}
        // Initialize per-fleet control states (Fleet 1 bound to live ship; 2/3 default templates)
        window.IronTideFleetStates = window.IronTideFleetStates || {};
        window.IronTideFleetStates[1] = window.IronTideFleetStates[1] || {
          desiredHeading: (typeof ship.desiredHeading === 'number' ? ship.desiredHeading : 0),
          speedKts: (typeof shipState?.speedKts === 'number' ? shipState.speedKts : 0),
          moveTarget: null
        };
        window.IronTideFleetStates[2] = window.IronTideFleetStates[2] || { desiredHeading: 0, speedKts: 0, moveTarget: null };
        window.IronTideFleetStates[3] = window.IronTideFleetStates[3] || { desiredHeading: 0, speedKts: 0, moveTarget: null };
      } catch {}
    } catch {}
  })();

  // --- Gunnery Target Cycling (header arrows) ---
  const gunneryCycle = { index: -1 };
  // Per-fleet gunnery cycling state (Fleet 1 uses global gunneryCycle for compatibility)
  window.FleetGunneryCycle = window.FleetGunneryCycle || { 1: gunneryCycle, 2: { index: -1 }, 3: { index: -1 } };
  function collectOtherShips(){
    const targets = [];
    try {
      if (Array.isArray(window.NPCs)) {
        window.NPCs.forEach(n=>{
          try {
            const st = n && n.state && n.state.ship;
            if (st) targets.push({ id: n.state.id, name: n.state.displayName || 'Ship', x: st.x, y: st.y, kind: 'npc' });
          } catch {}
        });
      } else if (npc1 && npc1.state && npc1.state.ship) {
        const st = npc1.state.ship; targets.push({ id: npc1.state.id || 2, name: npc1.state.displayName || 'Ship', x: st.x, y: st.y, kind: 'npc' });
      }
      // Append player as final cycle target (always available)
      try { if (ship) targets.push({ id: (window.shipState && window.shipState.id) ? window.shipState.id : 1, name: 'Player', x: ship.x, y: ship.y, kind: 'player' }); } catch {}
    } catch {}
    return targets;
  }
  
  // Collect only friendly ships (for left HUD cycling with i button)
  function collectFriendlyShips(){
    const friendlies = [];
    try {
      const fleetA = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
      const enemySet = window.EnemyFleet1 instanceof Set ? window.EnemyFleet1 : new Set();
      
      if (Array.isArray(window.NPCs)) {
        window.NPCs.forEach(n => {
          try {
            const st = n && n.state && n.state.ship;
            if (!st) return;
            const idStr = String(n.state.id);
            const isEnemy = enemySet.has(idStr);
            // Skip sunk NPCs
            const isSunk = !!(n && n.state && (n.state.effects?.sunk || n.state.sunk));
            if (isSunk) return;
            if (isEnemy) return; // Skip enemies
            const isFriendly = !!(fleetA[1].has(idStr) || fleetA[2].has(idStr) || fleetA[3].has(idStr));
            if (isFriendly) {
              friendlies.push({ id: n.state.id, name: n.state.displayName || 'Ship', x: st.x, y: st.y, kind: 'npc' });
            }
          } catch {}
        });
      }
      
      // Include player ship as well
      try { 
        if (ship) {
          const playerId = (window.shipState && window.shipState.id) ? window.shipState.id : 1;
          friendlies.push({ id: playerId, name: 'Player', x: ship.x, y: ship.y, kind: 'player' }); 
        }
      } catch {}
    } catch {}
    return friendlies;
  }
  (function setupGunneryArrows(){
    try {
      // Setup arrows for all fleets
      const leftArrows = document.querySelectorAll('#navalDock .gunnery-arrow.left');
      const rightArrows = document.querySelectorAll('#navalDock .gunnery-arrow.right');
      const oldInfoBtn = document.querySelector('#navalDock .gunnery-info-btn');
      const viewBtn = document.querySelector('#navalDock .gunnery-view-btn');
      // Do not early-return if arrows are missing; we still need to wire the Info button

      function showHudForShipId(id, on){
        try {
          const hudL = document.getElementById('shipHud');
          const hudR = document.getElementById('shipHudRight');
          const idStr = id != null ? String(id) : '';
          const matchAndShow = (hud) => {
            if (!hud) return false;
            const hId = hud.dataset && hud.dataset.shipId ? String(hud.dataset.shipId) : '';
            if (hId && hId === idStr) {
              hud.style.display = on ? 'block' : 'none';
              return true;
            }
            return false;
          };
          // Do not force-hide other HUD; allow both to be visible simultaneously
          if (on) { if (!matchAndShow(hudL)) matchAndShow(hudR); }
          else { if (!matchAndShow(hudL)) matchAndShow(hudR); }
        } catch {}
      }

      function cycle(dir, fleetId = 1){
        try {
          const targets = collectOtherShips();
          if (!targets.length) return;
          // Use fleet-specific cycle state
          window.FleetGunneryCycle = window.FleetGunneryCycle || { 1: { index: -1 }, 2: { index: -1 }, 3: { index: -1 } };
          const cycleState = window.FleetGunneryCycle[fleetId];
          if (cycleState.index < 0) cycleState.index = 0;
          else cycleState.index = (cycleState.index + dir + targets.length) % targets.length;
          const t = targets[cycleState.index];
          // Place the Solution Target pin at the center of their sprite (ship.x, ship.y)
          if (t) {
            // Prevent friendly ships from targeting other friendlies
            const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
            const enemySet = (window.EnemyFleet1 instanceof Set) ? window.EnemyFleet1 : new Set();
            const targetIsEnemy = enemySet.has(String(t.id));
            const playerIsEnemy = enemySet.has(playerId);
            
            // Skip if both player and target are friendly (not enemies)
            if (!targetIsEnemy && !playerIsEnemy) {
              // Skip this target and try next one
              cycle(dir, fleetId);
              return;
            }
            
            // Set target for specific fleet
            window.FleetGunnery = window.FleetGunnery || { 1: {}, 2: {}, 3: {} };
            
            if (fleetId === 1) {
              // Fleet 1 uses original firingSolution - arrows override pins
              if (typeof firingSolution !== 'object' || !firingSolution) window.firingSolution = {};
              firingSolution.target = null; // Clear any pin target
              firingSolution.targetId = String(t.id);
              firingSolution.placing = false;
              firingSolution.hover = null;
              
              // Don't auto-enable FIRE - let user press FIRE button manually
              // Fleet 1 FIRE remains manual control only
            } else {
              // Fleet 2/3 use FleetGunnery state - arrows override pins
              window.FleetGunnery[fleetId].targetId = String(t.id);
              window.FleetGunnery[fleetId].target = null; // Clear any pin target
              // Ensure Fleet 2/3 solution timer starts so green state can be reached after countdown
              try { if (typeof startFleetSolutionTimer === 'function') startFleetSolutionTimer(fleetId); } catch {}
              // Update accuracy panel for this fleet with accuracy calculation
              const panel = document.getElementById(`accuracyPanel${fleetId === 1 ? '' : fleetId}`);
              if (panel) {
                try {
                  const leader = getFleetLeader(fleetId);
                  if (leader && leader.state && leader.state.ship) {
                    const dx = t.x - leader.state.ship.x;
                    const dy = t.y - leader.state.ship.y;
                    const distance = Math.hypot(dx, dy);
                    const maxRange = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 20000;
                    const accuracy = Math.max(10, Math.min(95, 95 - (distance / maxRange) * 60));
                    panel.textContent = `Accuracy: ${Math.round(accuracy)}%`;
                  } else {
                    panel.textContent = 'Accuracy: --%';
                  }
                } catch {
                  panel.textContent = 'Accuracy: --%';
                }
              }
            }
            
            console.log(`Fleet ${fleetId} targeting ship ${t.id} at (${t.x}, ${t.y})`);
            // If info toggle is on, update HUD to this target
            if (infoBtn && infoBtn.classList && infoBtn.classList.contains('brass-selected')) {
              showHudForShipId(t.id, true);
            }
            // If view toggle is on, immediately snap camera to this target
            if (viewBtn && viewBtn.classList && viewBtn.classList.contains('brass-selected')) {
              camera.cx = t.x; camera.cy = t.y; currentViewRect = getViewRect();
            }
            // New target selected via arrows -> start solution calculation
            startSolutionCalculation();
          }
        } catch {}
      }

      // Setup click handlers for all fleet arrows (if present)
      try {
        leftArrows.forEach(arrow => {
          const fleetId = parseInt(arrow.getAttribute('data-fleet')) || 1;
          arrow.addEventListener('click', () => cycle(-1, fleetId));
        });
        rightArrows.forEach(arrow => {
          const fleetId = parseInt(arrow.getAttribute('data-fleet')) || 1;
          arrow.addEventListener('click', () => cycle(1, fleetId));
        });
      } catch {}

      // If Free Draw is already selected, allow reopening its options by clicking/focusing the selector
      const reopenFreeDrawIfSelected = () => {
        try {
          // Determine if Free Draw is the active/working pattern regardless of select value
          const isFreeDrawSelected = (
            (patterns && (patterns.selected === 'freedraw' || patterns.pendingSelection === 'freedraw')) ||
            (function(){
              try {
                const cf = window.IronTideSelectedFleet || 1;
                const fp = window.FleetPatterns && window.FleetPatterns[cf];
                return fp && (fp.selected === 'freedraw' || fp.pendingSelection === 'freedraw');
              } catch { return false; }
            })()
          );
          if (isFreeDrawSelected) {
            if (freeDrawOptionsEl) {
              freeDrawOptionsEl.classList.add('show');
              freeDrawOptionsEl.setAttribute('aria-hidden', 'false');
            }
            // Hide other pattern windows to avoid overlap
            if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
            if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden', 'true'); }
            // Sync direction button highlight
            try { if (typeof setFreeDrawDir === 'function') setFreeDrawDir(!!patterns.freeDrawCw); } catch {}
          }
        } catch {}
      };
      if (patternSel) {
        patternSel.addEventListener('click', reopenFreeDrawIfSelected);
        patternSel.addEventListener('focus', reopenFreeDrawIfSelected);
      }

      // Setup gunnery title buttons for all fleets (toggle gunnery on/off)
      try {
        document.querySelectorAll('.gunnery-title-btn').forEach(btn => {
          const fleetId = parseInt(btn.getAttribute('data-fleet')) || 1;
          if (!btn.__cycleHooked__) {
            // Ensure buttons start in OFF state (no brass fill, aria-pressed=false)
            try {
              btn.classList.remove('active');
              btn.classList.remove('brass-selected');
              btn.setAttribute('aria-pressed', 'false');
              // Ensure underlying state defaults to OFF
              window.FleetGunnery = window.FleetGunnery || { 1:{},2:{},3:{} };
              if (!window.FleetGunnery[fleetId]) window.FleetGunnery[fleetId] = {};
              if (fleetId === 2 || fleetId === 3) window.FleetGunnery[fleetId].gunneryEnabled = false;
            } catch {}

            btn.addEventListener('click', () => {
              if (fleetId === 1) {
                // Fleet 1 uses original gunnery system - allow toggle regardless of ship assignments
                window.gunnery = window.gunnery || { enabled: false };
                gunnery.enabled = !gunnery.enabled;
                btn.classList.toggle('active', gunnery.enabled);
                btn.classList.toggle('brass-selected', gunnery.enabled);
                btn.setAttribute('aria-pressed', gunnery.enabled ? 'true' : 'false');
                console.log(`Fleet 1 gunnery ${gunnery.enabled ? 'ENABLED' : 'DISABLED'}`);
                if (gunnery.enabled) window.FleetGunneryCycle[1].index = -1;
              } else {
                // Fleet 2/3 toggle their gunnery state - but only if fleet has ships
                const fleetHasShips = !!(window.IronTideFleetAssignments && window.IronTideFleetAssignments[fleetId] && window.IronTideFleetAssignments[fleetId].size > 0);
                if (!fleetHasShips) {
                  console.log(`Fleet ${fleetId} has no ships - gunnery cannot be enabled`);
                  return;
                }
                
                window.FleetGunnery = window.FleetGunnery || { 2: {}, 3: {} };
                const g = window.FleetGunnery[fleetId];
                g.gunneryEnabled = !g.gunneryEnabled;
                btn.classList.toggle('active', g.gunneryEnabled);
                btn.setAttribute('aria-pressed', g.gunneryEnabled ? 'true' : 'false');
                console.log(`Fleet ${fleetId} gunnery ${g.gunneryEnabled ? 'ENABLED' : 'DISABLED'} (has ${window.IronTideFleetAssignments[fleetId].size} ships)`);
                if (g.gunneryEnabled) window.FleetGunneryCycle[fleetId].index = -1;
              }
            });
            btn.__cycleHooked__ = true;
          }
        });
      } catch {}

      // Ensure a working Info (i) button exists: create and replace if necessary
      let infoButton = oldInfoBtn;
      try {
        const header = document.querySelector('#navalDock .gunnery-header') || document.querySelector('#navalDock .group.actions');
        const needsNew = !infoButton || infoButton.disabled || window.getComputedStyle(infoButton).pointerEvents === 'none';
        if (needsNew && header) {
          const btn = document.createElement('button');
          btn.className = 'gunnery-info-btn brass';
          btn.type = 'button';
          btn.innerText = 'i';
          btn.title = 'Cycle friendlies (Left HUD)';
          btn.setAttribute('aria-label','Cycle friendlies (Left HUD)');
          header.appendChild(btn);
          // Hide old button if it existed
          try { if (infoButton) infoButton.style.display = 'none'; } catch {}
          infoButton = btn;
        }
      } catch {}

      // Info button: cycle LEFT HUD through friendly ships only, with camera follow
      if (infoButton) {
        try {
          // Guard against duplicate bindings
          if (infoButton.__infoBound__) return;
          infoButton.__infoBound__ = true;
          infoButton.setAttribute('role', 'button');
          infoButton.setAttribute('aria-pressed', 'false');
          infoButton.disabled = false;
          try { infoButton.style.pointerEvents = 'auto'; infoButton.tabIndex = 0; } catch {}
          window.infoCycle = window.infoCycle || { index: -1, ships: [] };
          const cycleFriendlyHud = () => {
            try {
              console.log('[INFO] i-button clicked: starting friendly cycle');
              // Get all friendly ships
              const friendlies = collectFriendlyShips();
              console.log('[INFO] friendlies found:', friendlies.length, friendlies.map(f=>String(f.id)));
              if (!friendlies.length) {
                // No friendlies â€” close HUD and reset
                const hudL = document.getElementById('shipHud');
                if (hudL) hudL.style.display = 'none';
                infoButton.classList.remove('brass-selected');
                infoButton.setAttribute('aria-pressed','false');
                window.infoCycle.index = -1; window.infoCycle.ships = [];
                return;
              }
              
              // Start or advance cycle
              if (window.infoCycle.index < 0) {
                window.infoCycle.ships = friendlies; 
                window.infoCycle.index = 0;
                infoButton.classList.add('brass-selected'); 
                infoButton.setAttribute('aria-pressed','true');
              } else {
                window.infoCycle.index += 1;
              }
              
              if (window.infoCycle.index >= window.infoCycle.ships.length) {
                // Cycle complete: close LEFT HUD and reset camera to player
                const hudL = document.getElementById('shipHud');
                if (hudL) hudL.style.display = 'none';
                infoButton.classList.remove('brass-selected');
                infoButton.setAttribute('aria-pressed','false');
                window.infoCycle.index = -1; 
                window.infoCycle.ships = [];
                // Snap camera back to player
                try {
                  camera.cx = ship.x; 
                  camera.cy = ship.y; 
                  currentViewRect = getViewRect();
                } catch {}
                return;
              }
              
              const currentShip = window.infoCycle.ships[window.infoCycle.index];
              if (!currentShip) return;
              
              const idStr = String(currentShip.id);
              
              // Snap camera to this ship and follow it
              try {
                camera.cx = currentShip.x;
                camera.cy = currentShip.y;
                currentViewRect = getViewRect();
              } catch {}
              
              // Show LEFT HUD for this ship
              let hudL = document.getElementById('shipHud');
              if (!hudL) {
                // Create minimal left HUD if missing
                try {
                  hudL = document.createElement('div');
                  hudL.id = 'shipHud';
                  hudL.className = 'ship-hud left';
                  const canvas = document.createElement('canvas');
                  canvas.id = 'shipHudCanvas';
                  hudL.appendChild(canvas);
                  document.body.appendChild(hudL);
                  console.log('[INFO] Created missing left HUD container and canvas');
                } catch (e) { console.warn('Failed to create left HUD container', e); }
              }
              if (hudL) {
                try {
                  hudL.dataset.shipId = idStr;
                  hudL.style.display = 'block';
                  if (typeof initShipHudFor === 'function') {
                    initShipHudFor('shipHud', 'shipHudCanvas');
                  }
                  console.log('LEFT HUD cycling to friendly ship:', idStr, currentShip.name);
                } catch {}
              }
            } catch {}
          };
          infoButton.addEventListener('click', (e)=>{ try { e.preventDefault(); e.stopPropagation(); } catch {} cycleFriendlyHud(); });
          infoButton.addEventListener('mousedown', (e)=>{ /* fallback */ });
          infoButton.addEventListener('touchstart', (e)=>{ try { e.preventDefault(); cycleFriendlyHud(); } catch {} }, { passive: false });
          infoButton.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); cycleFriendlyHud(); } });
        } catch {}
      }

      // View ("Eye") button: momentary cycle of camera through all NPCs, then back to player
      if (viewBtn) {
        try {
          viewBtn.setAttribute('role', 'button');
          viewBtn.setAttribute('aria-pressed', 'false');
          window.viewCycle = window.viewCycle || { index: -1 };
          const advanceViewOnce = () => {
            try {
              // Build cycle list: all other ships, then a sentinel for player
              const npcs = collectOtherShips();
              const cycle = Array.isArray(npcs) ? npcs.slice() : [];
              // Append player as last step
              cycle.push({ id: 'player', x: ship.x, y: ship.y });
              if (!cycle.length) return;
              // Advance index
              if (typeof window.viewCycle.index !== 'number' || window.viewCycle.index < 0) {
                window.viewCycle.index = 0;
              } else {
                window.viewCycle.index = (window.viewCycle.index + 1) % cycle.length;
              }
              const t = cycle[window.viewCycle.index];
              if (!t) return;
              if (t.id === 'player') {
                // Snap camera back to player and hide right-side HUD
                camera.cx = ship.x; camera.cy = ship.y; currentViewRect = getViewRect();
                try {
                  const hudR = document.getElementById('shipHudRight');
                  if (hudR) hudR.style.display = 'none';
                } catch {}
              } else {
                // Move camera to target ship and show its HUD on the right
                camera.cx = t.x; camera.cy = t.y; currentViewRect = getViewRect();
                try {
                  const hudR = document.getElementById('shipHudRight');
                  if (hudR) {
                    try { hudR.dataset.shipId = String(t.id); } catch {}
                    hudR.style.display = 'block';
                  }
                } catch {}
              }
            } catch {}
            // Momentary: not a toggle
            viewBtn.classList.remove('brass-selected');
            viewBtn.setAttribute('aria-pressed', 'false');
          };
          viewBtn.addEventListener('click', advanceViewOnce);
          viewBtn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); advanceViewOnce(); } });
        } catch {}
      }
    } catch {}

    // Fleet Management System - 3 Separate Modals
    try {
      const fleetManageBtns = document.querySelectorAll('.fleet-manage');
      
      // Fleet-specific modal elements
      const fleetModals = {
        1: {
          window: document.getElementById('fleetManagement1'),
          shipsList: document.getElementById('fleetShipsList1'),
          closeBtn: document.getElementById('fleetManagement1CloseBtn')
        },
        2: {
          window: document.getElementById('fleetManagement2'),
          shipsList: document.getElementById('fleetShipsList2'),
          closeBtn: document.getElementById('fleetManagement2CloseBtn')
        },
        3: {
          window: document.getElementById('fleetManagement3'),
          shipsList: document.getElementById('fleetShipsList3'),
          closeBtn: document.getElementById('fleetManagement3CloseBtn')
        }
      };
      
      // Fleet-specific drag state (each fleet has its own)
      const fleetDragState = {
        1: { draggedShip: null },
        2: { draggedShip: null },
        3: { draggedShip: null }
      };




      // --- Per-fleet order container + persistence helpers ---
      function getFleetSettings(fleetId){
        window.IronTideFleetSettings = window.IronTideFleetSettings || { 1:{},2:{},3:{} };
        if (!window.IronTideFleetSettings[fleetId]) window.IronTideFleetSettings[fleetId] = {};
        return window.IronTideFleetSettings[fleetId];
      }

      function storageKeyForOrder(fleetId){ return `IronTide_Fleet_${fleetId}_Order`; }

      function loadFleetOrderFromStorage(fleetId){
        try {
          const raw = localStorage.getItem(storageKeyForOrder(fleetId));
          if (!raw) return null;
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) return arr.map(String);
        } catch {}
        return null;
      }

      function saveFleetOrderToStorage(fleetId, order){
        try { localStorage.setItem(storageKeyForOrder(fleetId), JSON.stringify(Array.isArray(order)? order.map(String) : [])); } catch {}
      }

      function getFleetOrder(fleetId){
        const set = getFleetSettings(fleetId);
        if (Array.isArray(set.shipOrder)) return set.shipOrder.map(String);
        const stored = loadFleetOrderFromStorage(fleetId);
        if (stored) { set.shipOrder = stored.slice(); return stored; }
        return [];
      }

      function setFleetOrder(fleetId, order){
        const set = getFleetSettings(fleetId);
        set.shipOrder = Array.isArray(order) ? order.map(String) : [];
        saveFleetOrderToStorage(fleetId, set.shipOrder);
      }

      // Ensure stored order only contains ships that actually exist in the fleet
      function reconcileFleetOrder(fleetId, presentShipIds){
        const present = new Set(presentShipIds.map(String));
        let order = getFleetOrder(fleetId);
        order = order.filter(id => present.has(id));
        // Append any ships not in order to the end, preserving current DOM fetch order
        presentShipIds.forEach(id => { if (!order.includes(String(id))) order.push(String(id)); });
        setFleetOrder(fleetId, order);
        return order;
      }

      // Assign/record current leader for a fleet and refresh UI bindings so controls act on leader
      function setFleetLeader(fleetId, leaderId){
        try {
          const set = getFleetSettings(fleetId);
          const prev = set.leaderId ? String(set.leaderId) : null;
          const cur = leaderId ? String(leaderId) : null;
          if (prev === cur) return;
          set.leaderId = cur;
          window.FleetLeaders = window.FleetLeaders || { 1:null,2:null,3:null };
          window.FleetLeaders[fleetId] = cur;

          // Persist lightweight leader mapping alongside order for resilience
          try { localStorage.setItem(`IronTide_Fleet_${fleetId}_Leader`, cur || ''); } catch {}

          // If the actively selected fleet changed leader, refresh dock UI to bind controls to new leader
          try {
            if (window.IronTideSelectedFleet === fleetId) {
              // Best-effort refresh: reload fleet settings and compass needles so heading/speed reflect new leader
              if (typeof window.loadFleetSettings === 'function') window.loadFleetSettings(fleetId);
              const settings = (window.IronTideFleetSettings && window.IronTideFleetSettings[fleetId]) ? window.IronTideFleetSettings[fleetId] : null;
              if (typeof updateCompassNeedles === 'function' && settings) updateCompassNeedles(settings);

              // Auto-switch camera + follow to new leader for the selected fleet
              try {
                const h = getHandleById(cur);
                const s = h && h.state && h.state.ship ? h.state.ship : null;
                if (s) {
                  camera.cx = s.x; camera.cy = s.y; currentViewRect = getViewRect();
                  window.viewFollow = window.viewFollow || {};
                  window.viewFollow.enabled = true;
                  window.viewFollow.mode = 'ship';
                  window.viewFollow.shipId = cur;
                }
              } catch {}
            }
          } catch {}

          console.log(`[Leader] Fleet ${fleetId} leader set to`, cur, 'prev', prev);
        } catch (e) {
          console.warn('setFleetLeader failed', e);
        }
      }

      // Fleet management button handlers
      fleetManageBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const fleetId = parseInt(btn.dataset.fleet);
          
          // Ensure button doesn't stay "pressed" - single press action
          btn.classList.remove('brass-selected', 'active');
          btn.setAttribute('aria-pressed', 'false');
          
          // Snap camera to this fleet's leader when opening management
          try { snapCameraToFleetLeader(fleetId); } catch {}

          openFleetManagement(fleetId);
          
          // Remove any persistent styling after a short delay
          setTimeout(() => {
            btn.classList.remove('brass-selected', 'active');
            btn.setAttribute('aria-pressed', 'false');
          }, 100);
        });
      });

      // Close button handlers for each fleet
      Object.keys(fleetModals).forEach(fleetId => {
        const modal = fleetModals[fleetId];
        if (modal.closeBtn) {
          modal.closeBtn.addEventListener('click', () => closeFleetManagement(parseInt(fleetId)));
        }
      });


      function openFleetManagement(fleetId) {
        // Close all other fleet modals first
        Object.keys(fleetModals).forEach(id => {
          if (parseInt(id) !== fleetId) {
            closeFleetManagement(parseInt(id));
          }
        });
        
        const modal = fleetModals[fleetId];
        if (!modal || !modal.window) return;
        
        // Load any saved order for this fleet before populating
        try { const stored = loadFleetOrderFromStorage(fleetId); if (stored) { getFleetSettings(fleetId).shipOrder = stored; } } catch {}

        // Populate ships list
        populateFleetShips(fleetId);
        modal.window.setAttribute('aria-hidden', 'false');
        modal.window.style.display = 'block';
        // Turn on highlight for this fleet when opening its manager
        try { setFleetHighlightsFor(fleetId); } catch {}
        // Also snap/follow camera to this fleet's leader on open
        try { snapToFleetLeader(fleetId); } catch {}
        
        console.log(`Opened Fleet ${fleetId} Management - ships only from Fleet ${fleetId}`);
      }

      function closeFleetManagement(fleetId) {
        const modal = fleetModals[fleetId];
        if (!modal || !modal.window) return;
        
        // On close, capture current order (if any DOM exists)
        try { updateFleetOrder(fleetId); } catch {}

        modal.window.setAttribute('aria-hidden', 'true');
        modal.window.style.display = 'none';
        
        // Clear drag state for this fleet
        fleetDragState[fleetId].draggedShip = null;
        // Stop compass animation loop if running
        try { if (modal.raf) { cancelAnimationFrame(modal.raf); modal.raf = null; } } catch {}
      }


      function populateFleetShips(fleetId) {
        const modal = fleetModals[fleetId];
        if (!modal || !modal.shipsList) return;
        
        modal.shipsList.innerHTML = '';
        
        // Get ships ONLY in this specific fleet
        const fleetShips = getShipsInFleet(fleetId);
        // Apply saved order if available
        const ids = fleetShips.map(s => String(s.id));
        const order = reconcileFleetOrder(fleetId, ids);
        const indexOfId = (id)=>{ const idx = order.indexOf(String(id)); return idx === -1 ? Number.MAX_SAFE_INTEGER : idx; };
        fleetShips.sort((a,b)=> indexOfId(a.id) - indexOfId(b.id));
        // Ensure leader is recorded from this order
        try { setFleetLeader(fleetId, order.length ? order[0] : null); } catch {}
        
        fleetShips.forEach((ship, index) => {
          const shipItem = document.createElement('div');
          shipItem.className = 'fleet-ship-item';
          if (index === 0) shipItem.classList.add('leader');
          
          shipItem.draggable = true;
          shipItem.dataset.shipId = ship.id;
          shipItem.dataset.originalFleet = fleetId;
          
          const crown = index === 0 ? '<span class="fleet-ship-crown">ðŸ‘‘</span>' : '';
          const shipName = ship.displayName || ship.name || `Ship ${ship.id}`;
          shipItem.innerHTML = `${crown}<span>${shipName}</span>`;
          
          // Fleet-specific drag handlers
          shipItem.addEventListener('dragstart', (e) => handleDragStart(e, fleetId));
          shipItem.addEventListener('dragend', (e) => handleDragEnd(e, fleetId));
          
          modal.shipsList.appendChild(shipItem);
        });
        
        // Setup drop zones for this specific fleet
        setupDropZones(fleetId);
      }

      function getShipsInFleet(fleetId) {
        const ships = [];
        const seen = new Set();
        const fleetAssignments = window.IronTideFleetAssignments || {};
        
        // Only get ships assigned to THIS specific fleet
        if (!fleetAssignments[fleetId]) {
          return ships; // Empty array if fleet doesn't exist
        }
        
        // Collect from IronTideFleet only (includes player handle if present), to avoid duplicates
        try {
          if (Array.isArray(window.IronTideFleet)) {
            window.IronTideFleet.forEach(h => {
              if (!h || !h.state) return;
              const shipId = String(h.state.id);
              
              // CRITICAL: Only include ships that are in THIS fleet
              if (!fleetAssignments[fleetId].has(shipId)) return;
              if (seen.has(shipId)) return;
              
              seen.add(shipId);
              ships.push({
                id: shipId,
                name: h.profile?.name || 'Ship',
                displayName: h.state.displayName || `Ship ${shipId}`,
                isPlayer: false
              });
            });
          }
        } catch {}
        
        // If player is assigned to THIS fleet but not in IronTideFleet array for some reason, add once
        try {
          const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
          if (fleetAssignments[fleetId].has(playerId) && !seen.has(playerId)) {
            ships.push({
              id: playerId,
              name: window.shipProfile?.name || 'Bismarck',
              displayName: (window.shipState && window.shipState.displayName) || 'Battleship 1',
              isPlayer: true
            });
          }
        } catch {}
        
        return ships;
      }

      function handleDragStart(e, fleetId) {
        fleetDragState[fleetId].draggedShip = {
          id: e.target.dataset.shipId,
          originalFleet: parseInt(e.target.dataset.originalFleet),
          element: e.target
        };
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }

      function handleDragEnd(e, fleetId) {
        e.target.classList.remove('dragging');
        fleetDragState[fleetId].draggedShip = null;
      }

      function setupDropZones(fleetId) {
        const modal = fleetModals[fleetId];
        if (!modal || !modal.shipsList) return;
        
        // Setup reordering within THIS fleet's list only
        modal.shipsList.addEventListener('dragover', (e) => handleFleetDragOver(e, fleetId));
        modal.shipsList.addEventListener('drop', (e) => handleFleetDrop(e, fleetId));
        
        // Setup transfer zones for THIS fleet only
        const transferZones = modal.window.querySelectorAll('.fleet-transfer-zone');
        transferZones.forEach(zone => {
          zone.addEventListener('dragover', (e) => handleTransferDragOver(e, fleetId));
          zone.addEventListener('drop', (e) => handleTransferDrop(e, fleetId));
          zone.addEventListener('dragleave', (e) => handleTransferDragLeave(e, fleetId));
          
          // Click to expand/collapse
          const title = zone.querySelector('.fleet-transfer-title');
          if (title) {
            title.addEventListener('click', () => {
              zone.classList.toggle('collapsed');
              zone.classList.toggle('expanded');
            });
          }
        });
      }

      function handleFleetDragOver(e, fleetId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }

      function handleFleetDrop(e, fleetId) {
        e.preventDefault();
        const draggedShip = fleetDragState[fleetId].draggedShip;
        if (!draggedShip) return;
        
        const modal = fleetModals[fleetId];
        const afterElement = getDragAfterElement(modal.shipsList, e.clientY);
        const draggedElement = draggedShip.element;
        
        if (afterElement == null) {
          modal.shipsList.appendChild(draggedElement);
        } else {
          modal.shipsList.insertBefore(draggedElement, afterElement);
        }
        
        // Update fleet order for this specific fleet
        updateFleetOrder(fleetId);
      }

      function handleTransferDragOver(e, fleetId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
      }

      function handleTransferDrop(e, fleetId) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const draggedShip = fleetDragState[fleetId].draggedShip;
        if (!draggedShip) return;
        
        const targetFleet = parseInt(e.currentTarget.dataset.targetFleet);
        const sourceFleet = parseInt(e.currentTarget.dataset.sourceFleet);
        
        // Ensure we're transferring from the correct source fleet
        if (sourceFleet !== fleetId) {
          console.error(`Transfer mismatch: expected source fleet ${fleetId}, got ${sourceFleet}`);
          return;
        }
        
        transferShipToFleet(draggedShip.id, sourceFleet, targetFleet);
        
        // Remove from current list
        draggedShip.element.remove();
        
        // Refresh the target fleet modal if it's open
        const targetModal = fleetModals[targetFleet];
        if (targetModal && targetModal.window.style.display === 'block') {
          populateFleetShips(targetFleet);
        }
      }

      function handleTransferDragLeave(e, fleetId) {
        e.currentTarget.classList.remove('drag-over');
      }

      function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.fleet-ship-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          
          if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
          } else {
            return closest;
          }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
      }

      function updateFleetOrder(fleetId) {
        const modal = fleetModals[fleetId];
        if (!modal || !modal.shipsList) return;
        
        // Update the order based on DOM position for THIS fleet only
        const shipItems = modal.shipsList.querySelectorAll('.fleet-ship-item');
        
        // Remove all leader classes first
        shipItems.forEach(item => item.classList.remove('leader'));
        
        // Collect the new order from DOM
        const newOrder = [];
        shipItems.forEach(item => {
          const shipId = item.dataset.shipId;
          if (shipId) newOrder.push(String(shipId));
        });
        
        // Save the order to fleet settings and localStorage
        try { setFleetOrder(fleetId, newOrder); console.log(`Fleet ${fleetId} order saved:`, newOrder); } catch {}
        // Ensure the first entry is current leader and transfer controls to it
        try { setFleetLeader(fleetId, newOrder.length ? newOrder[0] : null); } catch {}
        
        // Add leader class to first item
        if (shipItems.length > 0) {
          shipItems[0].classList.add('leader');
          
          // Update crown display
          shipItems.forEach((item, index) => {
            const crown = item.querySelector('.fleet-ship-crown');
            if (index === 0) {
              if (!crown) {
                const crownSpan = document.createElement('span');
                crownSpan.className = 'fleet-ship-crown';
                crownSpan.textContent = 'ðŸ‘‘';
                item.insertBefore(crownSpan, item.firstChild);
              }
            } else if (crown) {
              crown.remove();
            }
          });
        }
        
        console.log(`Fleet ${fleetId} order updated - independent from other fleets`);
        // If Fleet 1 order changed, re-evaluate leadership promotion
        try { if (fleetId === 1 && typeof promoteFleet1LeaderIfNeeded === 'function') promoteFleet1LeaderIfNeeded(); } catch {}
      }

      function transferShipToFleet(shipId, fromFleet, toFleet) {
        try {
          const fleetAssignments = window.IronTideFleetAssignments || {};
          
          // Initialize fleet sets if needed
          if (!fleetAssignments[fromFleet]) fleetAssignments[fromFleet] = new Set();
          if (!fleetAssignments[toFleet]) fleetAssignments[toFleet] = new Set();
          
          // Remove from old fleet
          fleetAssignments[fromFleet].delete(shipId);
          
          // Add to new fleet
          fleetAssignments[toFleet].add(shipId);
          
          window.IronTideFleetAssignments = fleetAssignments;
          
          console.log(`Transferred ship ${shipId} from Fleet ${fromFleet} to Fleet ${toFleet}`);

          // Migrate gunnery + firing solution state from source fleet to destination fleet
          try {
            // Ensure containers
            window.FleetGunnery = window.FleetGunnery || { 1:{},2:{},3:{} };
            window.FleetSolutionCalc = window.FleetSolutionCalc || { 1:{},2:{},3:{} };
            window.IronTideFleetSettings = window.IronTideFleetSettings || { 1:{},2:{},3:{} };
            if (!window.FleetGunnery[toFleet]) window.FleetGunnery[toFleet] = {};
            if (!window.FleetSolutionCalc[toFleet]) window.FleetSolutionCalc[toFleet] = {};
            if (!window.IronTideFleetSettings[toFleet]) window.IronTideFleetSettings[toFleet] = {};

            const srcG = window.FleetGunnery[fromFleet] || {};
            const srcSC = window.FleetSolutionCalc[fromFleet] || {};
            const srcSet = window.IronTideFleetSettings[fromFleet] || {};

            // Deep clone helper
            const clone = (o)=>{
              try { if (typeof structuredClone === 'function') return structuredClone(o); } catch {}
              try { return JSON.parse(JSON.stringify(o)); } catch { return Object.assign({}, o); }
            };

            // Move gunnery state (target, targetId, enabled, cycle indices, last times)
            window.FleetGunnery[toFleet] = Object.assign({}, window.FleetGunnery[toFleet], clone(srcG));
            // Move solution calculator state
            window.FleetSolutionCalc[toFleet] = Object.assign({}, clone(srcSC));
            // Move turret angles and any fleet UI gunnery fields stored in settings
            const dstSet = window.IronTideFleetSettings[toFleet];
            dstSet.turretAngles = clone(srcSet.turretAngles || { t1:0, t2:0, t3:180, t4:180 });
            dstSet.targetId = (srcSet && srcSet.targetId != null) ? srcSet.targetId : (window.FleetGunnery[toFleet].targetId ?? null);
            dstSet.firingSolution = clone(srcSet.firingSolution || {});
            dstSet.fireEnabled = !!(srcSet && srcSet.fireEnabled);

            // Visually toggle destination fleet gunnery button
            try {
              const btn = document.querySelector(`.gunnery-title-btn[data-fleet="${toFleet}"]`);
              if (btn) {
                const enabled = !!window.FleetGunnery[toFleet].gunneryEnabled;
                btn.classList.toggle('active', enabled);
                btn.classList.toggle('brass-selected', enabled);
                btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
              }
            } catch {}

            // Reset/clear source fleet gunnery so it doesn't keep controlling ship
            try {
              window.FleetGunnery[fromFleet] = { gunneryEnabled: false, fireEnabled: false, target: null, targetId: null };
              window.FleetSolutionCalc[fromFleet] = {};
              if (window.IronTideFleetSettings[fromFleet]) {
                window.IronTideFleetSettings[fromFleet].targetId = null;
                window.IronTideFleetSettings[fromFleet].firingSolution = null;
                window.IronTideFleetSettings[fromFleet].fireEnabled = false;
              }
            } catch {}

            console.log(`Migrated gunnery+solution from Fleet ${fromFleet} -> Fleet ${toFleet} for ship ${shipId}`);
            // Update per-fleet ship order containers: remove from source, append to destination
            try {
              const fromOrder = getFleetOrder(fromFleet).filter(id => id !== String(shipId));
              setFleetOrder(fromFleet, fromOrder);
              const toOrder = getFleetOrder(toFleet).slice();
              if (!toOrder.includes(String(shipId))) toOrder.push(String(shipId));
              setFleetOrder(toFleet, toOrder);
              // Re-evaluate leaders for both fleets
              setFleetLeader(fromFleet, fromOrder.length ? fromOrder[0] : null);
              setFleetLeader(toFleet, toOrder.length ? toOrder[0] : null);
              // Remove highlight from the moved ship immediately; it will be re-enabled when new fleet is selected/opened
              clearShipHighlight(shipId);
            } catch {}
          } catch (err) {
            console.warn('Gunnery migration failed during transfer:', err);
          }
          
          // Clear any inherited state to prevent cross-fleet contamination
          try {
            if (Array.isArray(window.IronTideFleet)) {
              const ship = window.IronTideFleet.find(h => h && h.state && String(h.state.id) === shipId);
              if (ship && ship.state) {
                // Reset ship state to clean defaults when transferring
                ship.state.speedKts = 0;
                ship.state.desiredHeading = 0;
                if (ship.state.ship) {
                  ship.state.ship.desiredHeading = 0;
                }
                console.log(`Cleared inherited state for ship ${shipId} during transfer`);
              }
            }
          } catch (error) {
            console.error('Error clearing ship state during transfer:', error);
          }
          
          // After any transfer, re-evaluate Fleet 1 leadership and promote transport to player if needed
          try { if (typeof promoteFleet1LeaderIfNeeded === 'function') promoteFleet1LeaderIfNeeded(); } catch {}
          
        } catch (error) {
          console.error('Error transferring ship:', error);
        }
      }

      // Promote top Fleet 1 Transport to Player if Fleet 1 has no battleships
      function promoteFleet1LeaderIfNeeded() {
        try {
          const fleetId = 1;
          const assignments = window.IronTideFleetAssignments || {};
          const fset = assignments[fleetId];
          if (!(fset instanceof Set) || fset.size === 0) return; // nothing in fleet 1

          // Collect fleet 1 handles in UI order if modal open; else arbitrary order
          const handles = [];
          const seen = new Set();
          // Prefer DOM order from Fleet 1 modal if available
          try {
            const modal = (typeof fleetModals !== 'undefined') ? fleetModals['1'] : null;
            const list = modal && modal.shipsList ? modal.shipsList.querySelectorAll('.fleet-ship-item') : null;
            if (list && list.length) {
              list.forEach(el => {
                const id = String(el.dataset.shipId || '');
                if (!id || !fset.has(id) || seen.has(id)) return;
                const h = getHandleById(id);
                if (h) { handles.push(h); seen.add(id); }
              });
            }
          } catch {}
          // Fallback: collect by assignments from IronTideFleet/NPCs
          if (!handles.length) {
            const pushIf = (id)=>{
              const s = String(id||'');
              if (!s || !fset.has(s) || seen.has(s)) return;
              const h = getHandleById(s);
              if (h) { handles.push(h); seen.add(s); }
            };
            try { if (Array.isArray(window.IronTideFleet)) window.IronTideFleet.forEach(h=>{ if (h && h.state) pushIf(h.state.id); }); } catch {}
            try { if (Array.isArray(window.NPCs)) window.NPCs.forEach(n=>{ if (n && n.state) pushIf(n.state.id); }); } catch {}
          }

          if (!handles.length) return;

          // Determine if any non-transport remains in Fleet 1
          const hasBattleship = handles.some(h => {
            const t = h && h.profile && h.profile.type ? String(h.profile.type).toLowerCase() : '';
            return t !== 'transport';
          });
          if (hasBattleship) return; // do nothing; a battleship leads

          // Top transport becomes player-controlled
          const leader = handles[0];
          const leaderId = String(leader.state.id);
          console.log('[PROMOTE] Promoting Fleet 1 leader Transport to Player:', leaderId);

          // Rebind player state/profile to leader references
          try {
            window.shipState = leader.state;
            window.shipProfile = leader.profile;
          } catch {}

          // Show LEFT TRANSPORT HUD for this ship (avoid conflicts with Bismarck/player left HUD)
          try {
            // Hide player left HUD container to prevent flashing
            try { const hudPlayer = document.getElementById('shipHud'); if (hudPlayer) { hudPlayer.style.display = 'none'; hudPlayer.dataset.shipId = ''; } } catch {}
            // Show in dedicated left transport HUD
            const hudLT = document.getElementById('shipHudLeftTransport');
            if (hudLT) {
              hudLT.dataset.shipId = leaderId;
              hudLT.style.display = 'block';
              // Initialize if needed
              try {
                if (!window.__leftTransportHudInit) {
                  initShipHudFor('shipHudLeftTransport', 'shipHudCanvasLeftTransport');
                  window.__leftTransportHudInit = true;
                }
              } catch {}
            }
          } catch {}

          // Snap and follow camera on new player ship
          try {
            const s = leader && leader.state && leader.state.ship ? leader.state.ship : null;
            if (s) {
              camera.cx = s.x; camera.cy = s.y; currentViewRect = getViewRect();
              window.viewFollow = window.viewFollow || {};
              window.viewFollow.enabled = true;
              window.viewFollow.mode = 'ship';
              window.viewFollow.shipId = leaderId;
            }
          } catch {}

          // Update fleet selection UI to Fleet 1 to reflect control
          try {
            window.IronTideSelectedFleet = 1;
            // Refresh dock UI
            if (typeof document !== 'undefined') {
              const btn = document.querySelector('#navalDock .fleet-btn[data-fleet="1"]');
              if (btn) btn.click();
            }
          } catch {}
        } catch (e) {
          console.error('Error promoting Fleet 1 leader to player:', e);
        }
      }

      // Helper: get handle by ship id from registries
      function getHandleById(idStr){
        const sid = String(idStr||'');
        try { if (window.ShipHandlesById && window.ShipHandlesById[sid]) return window.ShipHandlesById[sid]; } catch {}
        try {
          if (Array.isArray(window.IronTideFleet)){
            for (const h of window.IronTideFleet){ if (h && h.state && String(h.state.id) === sid) return h; }
          }
        } catch {}
        try {
          if (Array.isArray(window.NPCs)){
            for (const n of window.NPCs){ if (n && n.state && String(n.state.id) === sid) return n; }
          }
        } catch {}
        return null;
      }

      // Initialize fleet assignments if not present
      if (!window.IronTideFleetAssignments) {
        window.IronTideFleetAssignments = {
          1: new Set(['1']), // Player starts in Fleet 1
          2: new Set(),
          3: new Set()
        };
      }

      // Fleet selection buttons in main UI: select fleet 1/2/3 and refresh UI
      try {
        const fleetSelectBtns = document.querySelectorAll('#navalDock .fleet-btn:not(.gunnery-title-btn)[data-fleet]');
        let lastSelected = (window.IronTideSelectedFleet || 1);
        function updateFleetBtnStates(sel){
          fleetSelectBtns.forEach(b=>{
            const fid = parseInt(b.dataset.fleet);
            const pressed = (fid === sel);
            try { b.setAttribute('aria-pressed', pressed ? 'true' : 'false'); } catch {}
            try { b.classList.toggle('brass-selected', pressed); } catch {}
          });
        }
        function refreshDockForFleet(sel){
          try {
            // Load settings to enable/disable inputs based on fleet leader presence
            if (typeof window.loadFleetSettings === 'function') {
              window.loadFleetSettings(sel);
            }
            // Update compass needles to reflect selected fleet leader
            const settings = (window.IronTideFleetSettings && window.IronTideFleetSettings[sel]) ? window.IronTideFleetSettings[sel] : null;
            if (typeof updateCompassNeedles === 'function' && settings) {
              updateCompassNeedles(settings);
            }
            // Turn on highlights for the selected fleet
            try { setFleetHighlightsFor(sel); } catch {}
            // Snap/follow camera to selected fleet leader as requested
            try { snapToFleetLeader(sel); } catch {}
          } catch {}
        }
        updateFleetBtnStates(lastSelected);
        fleetSelectBtns.forEach(btn=>{
          btn.addEventListener('click', ()=>{
            const fid = parseInt(btn.dataset.fleet);
            if (!isFinite(fid)) return;
            window.IronTideSelectedFleet = fid;
            updateFleetBtnStates(fid);
            refreshDockForFleet(fid);
            
            // Show/hide fleet-specific gunnery UI
            [1,2,3].forEach(id => {
              const header = document.getElementById(`fleet${id}GunneryHeader`);
              const actions = document.getElementById(`fleet${id}GunneryActions`);
              if (header) header.style.display = (id === fid) ? 'flex' : 'none';
              if (actions) actions.style.display = (id === fid) ? 'flex' : 'none';
              
              // Rebuild turret compass ticks when actions become visible
              if (actions && id === fid) {
                const turretCompass = document.getElementById(`turretCompass${id === 1 ? '' : id}`);
                if (turretCompass && typeof buildDomCompassTicks === 'function') {
                  // Defer to ensure layout has applied so widths/heights are non-zero
                  requestAnimationFrame(() => buildDomCompassTicks(turretCompass));
                }
              }
            });
            // Do NOT change any fleet's gunnery state when switching selection.
            // Fleets 1/2/3 operate independently; selection only affects which UI is shown.
            
            // Snap camera to fleet leader (always)
            snapCameraToFleetLeader(fid);
            // Enable persistent follow of this fleet leader
            window.viewFollow = window.viewFollow || { enabled: true, mode: 'fleet', fleetId: fid };
            window.viewFollow.enabled = true;
            window.viewFollow.mode = 'fleet';
            window.viewFollow.fleetId = fid;
          });
        });
      } catch {}

    } catch (error) {
      console.error('Error setting up fleet management:', error);
    }

    // Fleet-Specific Settings System
    try {
      // Initialize fleet settings storage
      if (!window.IronTideFleetSettings) {
        window.IronTideFleetSettings = {
          1: createDefaultFleetSettings(),
          2: createDefaultFleetSettings(),
          3: createDefaultFleetSettings()
        };
      }

      function createDefaultFleetSettings() {
        return {
          // Movement settings
          speed: 0,
          heading: 0,
          actualHeading: 0,
          
          // Formation settings
          formation: 'Line Ahead',
          formationInterval: 180,
          formationWidth: 200, // For Double Line Ahead
          formationAngleDeg: 30,
          formationTurning: 'sequence', // 'sequence' or 'together'
          formationStation: 'formup', // 'formup' or 'anchor'
          echelonDirection: 'left', // 'left' or 'right'
          
          // Pattern settings
          pattern: '',
          patternAmplitude: 50,
          
          // Gunnery settings
          targetId: null,
          firingSolution: null,
          fireEnabled: false,
          gunneryTargets: [], // visible targets for this fleet
          turretAngles: { t1: 0, t2: 0, t3: 180, t4: 180 }, // default turret positions
          
          // Compass settings for formations
          circularEscortHeading: 0,
          screenHeading: 0
        };
      }

      window.saveCurrentFleetSettings = function(fleetId) {
        try {
          const settings = window.IronTideFleetSettings[fleetId];
          if (!settings) return;
          
          // Save movement settings
          const speedSlider = document.getElementById('speedSlider');
          if (speedSlider) settings.speed = parseInt(speedSlider.value) || 0;
          
          // Save formation settings
          const formationSelect = document.getElementById('formationSelect');
          if (formationSelect) settings.formation = formationSelect.value;
          
          const formationInterval = document.getElementById('formationInterval');
          if (formationInterval) settings.formationInterval = parseInt(formationInterval.value) || 300;
          
          const formationWidth = document.getElementById('formationWidth');
          if (formationWidth) settings.formationWidth = parseInt(formationWidth.value) || 200;
          // Save formation angle (only meaningful for Echelon/Wedge)
          const formationAngle = document.getElementById('formationAngle');
          if (formationAngle) settings.formationAngleDeg = parseInt(formationAngle.value) || 30;
          
          // Save formation turning mode
          const turnSeqBtn = document.getElementById('formationTurnSeqBtn');
          const turnTogetherBtn = document.getElementById('formationTurnTogetherBtn');
          if (turnSeqBtn && turnSeqBtn.classList.contains('active')) {
            settings.formationTurning = 'sequence';
          } else if (turnTogetherBtn && turnTogetherBtn.classList.contains('active')) {
            settings.formationTurning = 'together';
          }
          
          // Save formation station mode
          const formUpBtn = document.getElementById('formationFormUpBtn');
          const anchorBtn = document.getElementById('formationAnchorBtn');
          if (formUpBtn && formUpBtn.classList.contains('active')) {
            settings.formationStation = 'formup';
          } else if (anchorBtn && anchorBtn.classList.contains('active')) {
            settings.formationStation = 'anchor';
          }
          
          // Save echelon direction
          const echelonLeftBtn = document.getElementById('echelonLeftBtn');
          const echelonRightBtn = document.getElementById('echelonRightBtn');
          if (echelonLeftBtn && echelonLeftBtn.classList.contains('active')) {
            settings.echelonDirection = 'left';
          } else if (echelonRightBtn && echelonRightBtn.classList.contains('active')) {
            settings.echelonDirection = 'right';
          }
          
          // Save pattern settings
          const patternSelect = document.getElementById('patternSelect');
          if (patternSelect) settings.pattern = patternSelect.value;
          
          const zigAmp = document.getElementById('zigAmp');
          if (zigAmp) settings.patternAmplitude = parseInt(zigAmp.value) || 50;
          
          // Save current pattern state to fleet-specific patterns
          if (window.FleetPatterns && window.FleetPatterns[fleetId]) {
            window.FleetPatterns[fleetId] = JSON.parse(JSON.stringify(patterns));
          }
          
          // Save gunnery settings
          if (window.firingSolution) {
            settings.firingSolution = JSON.parse(JSON.stringify(window.firingSolution));
            settings.targetId = window.firingSolution.targetId || null;
          }
          
          if (window.gunneryFire) {
            settings.fireEnabled = window.gunneryFire.enabled || false;
          }
          
          // Save turret angles for fleet leaders
          if (fleetId === 1 && window.turretAnglesRelDeg) {
            settings.turretAngles = JSON.parse(JSON.stringify(window.turretAnglesRelDeg));
          } else if (fleetId > 1) {
            // For Fleet 2/3, save from fleet leader's NPC state
            const fleetLeader = getFleetLeader(fleetId);
            if (fleetLeader && fleetLeader.state && fleetLeader.state.npcTurretAnglesRelDeg) {
              settings.turretAngles = JSON.parse(JSON.stringify(fleetLeader.state.npcTurretAnglesRelDeg));
            }
          }
          
          // Save compass headings
          settings.heading = window.shipState?.desiredHeading || 0;
          settings.actualHeading = window.shipState?.ship?.heading || 0;
          
        } catch (error) {
          console.error('Error saving fleet settings:', error);
        }
      };

      window.loadFleetSettings = function(fleetId) {
        try {
          const settings = window.IronTideFleetSettings[fleetId];
          if (!settings) return;
          
          // Get the fleet leader (first ship in fleet)
          const fleetLeader = getFleetLeader(fleetId);
          
          // Load movement settings - connect to fleet leader or default if no ships
          const speedSlider = document.getElementById('speedSlider');
          const speedReadout = document.querySelector('.speed-readout');
          if (speedSlider) {
            if (fleetLeader) {
              speedSlider.value = fleetLeader.state.speedKts || settings.speed;
              speedSlider.disabled = false;
              if (speedReadout) speedReadout.textContent = (fleetLeader.state.speedKts || settings.speed) + ' kts';
            } else {
              // No ships in fleet - disable controls and show default
              speedSlider.value = 0;
              speedSlider.disabled = true;
              if (speedReadout) speedReadout.textContent = '0 kts';
            }
          }
          
          // Load formation settings - disable if no ships in fleet
          const formationSelect = document.getElementById('formationSelect');
          if (formationSelect) {
            formationSelect.value = settings.formation;
            formationSelect.disabled = !fleetLeader;
          }
          
          const formationInterval = document.getElementById('formationInterval');
          if (formationInterval) {
            formationInterval.value = settings.formationInterval;
            formationInterval.disabled = !fleetLeader;
          }
          
          const formationWidth = document.getElementById('formationWidth');
          const formationWidthRow = document.getElementById('formationWidthRow');
          if (formationWidth) {
            formationWidth.value = settings.formationWidth || 200;
            formationWidth.disabled = !fleetLeader;
            // Show width only for Double Line Ahead
            if (formationWidthRow && formationSelect) {
              const val = String(formationSelect.value).toLowerCase();
              const show = (val.includes('double') && val.includes('line') && val.includes('ahead'));
              formationWidthRow.style.display = show ? 'flex' : 'none';
              try { formationWidthRow.setAttribute('aria-hidden', String(!show)); } catch {}
            }
          }
          // Load formation angle and show only for Echelon/Wedge
          const formationAngle = document.getElementById('formationAngle');
          const formationAngleValue = document.getElementById('formationAngleValue');
          const formationAngleRow = document.getElementById('formationAngleRow');
          if (formationAngle) {
            formationAngle.value = String(settings.formationAngleDeg || 30);
            if (formationAngleValue) formationAngleValue.textContent = `${settings.formationAngleDeg || 30}Â°`;
            if (formationAngleRow && formationSelect) {
              const val = String(formationSelect.value).toLowerCase();
              const show = (val.includes('echelon') || val.includes('wedge'));
              formationAngleRow.style.display = show ? 'flex' : 'none';
              try { formationAngleRow.setAttribute('aria-hidden', String(!show)); } catch {}
            }
            formationAngle.disabled = !fleetLeader;
          }
          
          // Load formation turning mode
          const turnSeqBtn = document.getElementById('formationTurnSeqBtn');
          const turnTogetherBtn = document.getElementById('formationTurnTogetherBtn');
          if (turnSeqBtn && turnTogetherBtn) {
            if (settings.formationTurning === 'sequence') {
              turnSeqBtn.classList.add('active');
              turnSeqBtn.setAttribute('aria-pressed', 'true');
              turnTogetherBtn.classList.remove('active');
              turnTogetherBtn.setAttribute('aria-pressed', 'false');
            } else {
              turnTogetherBtn.classList.add('active');
              turnTogetherBtn.setAttribute('aria-pressed', 'true');
              turnSeqBtn.classList.remove('active');
              turnSeqBtn.setAttribute('aria-pressed', 'false');
            }
          }
          
          // Load formation station mode
          const formUpBtn = document.getElementById('formationFormUpBtn');
          const anchorBtn = document.getElementById('formationAnchorBtn');
          if (formUpBtn && anchorBtn) {
            if (settings.formationStation === 'formup') {
              formUpBtn.classList.add('active');
              formUpBtn.setAttribute('aria-pressed', 'true');
              anchorBtn.classList.remove('active');
              anchorBtn.setAttribute('aria-pressed', 'false');
            } else {
              anchorBtn.classList.add('active');
              anchorBtn.setAttribute('aria-pressed', 'true');
              formUpBtn.classList.remove('active');
              formUpBtn.setAttribute('aria-pressed', 'false');
            }
          }
          
          // Load echelon direction
          const echelonLeftBtn = document.getElementById('echelonLeftBtn');
          const echelonRightBtn = document.getElementById('echelonRightBtn');
          if (echelonLeftBtn && echelonRightBtn) {
            echelonLeftBtn.classList.remove('active');
            echelonLeftBtn.setAttribute('aria-pressed', 'false');
            echelonRightBtn.classList.remove('active');
            echelonRightBtn.setAttribute('aria-pressed', 'false');
            
            if (settings.echelonDirection === 'left') {
              echelonLeftBtn.classList.add('active');
              echelonLeftBtn.setAttribute('aria-pressed', 'true');
            } else if (settings.echelonDirection === 'right') {
              echelonRightBtn.classList.add('active');
              echelonRightBtn.setAttribute('aria-pressed', 'true');
            }
          }
          
          // Load pattern settings - disable if no ships in fleet
          const patternSelect = document.getElementById('patternSelect');
          if (patternSelect) {
            patternSelect.value = settings.pattern;
            patternSelect.disabled = !fleetLeader;
          }
          
          const zigAmp = document.getElementById('zigAmp');
          if (zigAmp) {
            zigAmp.value = settings.patternAmplitude;
            zigAmp.disabled = !fleetLeader;
          }
          
          // Load fleet-specific pattern state into global patterns
          if (window.FleetPatterns && window.FleetPatterns[fleetId]) {
            const fleetPatterns = window.FleetPatterns[fleetId];
            Object.assign(patterns, fleetPatterns);
          }
          
          // Load gunnery settings
          if (settings.firingSolution) {
            window.firingSolution = JSON.parse(JSON.stringify(settings.firingSolution));
          } else {
            window.firingSolution = null;
          }
          
          // Load turret angles for fleet leaders
          if (settings.turretAngles) {
            if (fleetId === 1 && window.turretAnglesRelDeg) {
              Object.assign(window.turretAnglesRelDeg, settings.turretAngles);
            } else if (fleetId > 1) {
              // For Fleet 2/3, load into fleet leader's NPC state
              const fleetLeader = getFleetLeader(fleetId);
              if (fleetLeader && fleetLeader.state) {
                fleetLeader.state.npcTurretAnglesRelDeg = fleetLeader.state.npcTurretAnglesRelDeg || { t1: 0, t2: 0, t3: 180, t4: 180 };
                Object.assign(fleetLeader.state.npcTurretAnglesRelDeg, settings.turretAngles);
              }
            }
          }
          
          if (window.gunneryFire) {
            window.gunneryFire.enabled = settings.fireEnabled;
            const fireBtn = document.querySelector('.fire-btn');
            if (fireBtn) {
              fireBtn.classList.toggle('active', settings.fireEnabled);
            }
          }
          
          // Update compass needles
          updateCompassNeedles(settings);
          
          // Clear gunnery targets for other fleets, show only current fleet's targets
          updateGunneryTargetsVisibility(fleetId);
          
        } catch (error) {
          console.error('Error loading fleet settings:', error);
        }
      };

      function updateCompassNeedles(settings) {
        try {
          const currentFleet = window.IronTideSelectedFleet || 1;
          const fleetLeader = getFleetLeader(currentFleet);
          
          // Update main fleet compass (in dock)
          const fcPlanned = document.querySelector('#fleetCompass .needle.planned');
          const fcActual = document.querySelector('#fleetCompass .needle.actual');
          
          if (fleetLeader) {
            // Handle player ship (Fleet 1) vs NPC ships differently
            let heading, actualHeading;
            
            if (fleetLeader.isPlayer) {
              // Player ship: use global ship object
              heading = ship?.desiredHeading || 0;
              actualHeading = ship?.heading || 0;
            } else {
              // NPC ship: use state.ship
              heading = fleetLeader.state.desiredHeading || fleetLeader.state.ship?.heading || 0;
              actualHeading = fleetLeader.state.ship?.heading || 0;
            }
            
            if (fcPlanned) setNeedle(fcPlanned, heading);
            if (fcActual) setNeedle(fcActual, actualHeading);
          } else {
            // No ships in fleet - set compass to 0
            if (fcPlanned) setNeedle(fcPlanned, 0);
            if (fcActual) setNeedle(fcActual, 0);
          }
          
          
          // Update formation-specific compasses
          const circularCompass = document.querySelector('#circularEscortCompass .needle.planned');
          if (circularCompass) setNeedle(circularCompass, settings.circularEscortHeading || 0);
          const screenCompass = document.querySelector('#screenCompass .needle.planned');
          if (screenCompass) setNeedle(screenCompass, settings.screenHeading);
          
        } catch (error) {
          console.error('Error updating compass needles:', error);
        }
      }

      function updateGunneryTargetsVisibility(activeFleetId) {
        try {
          // Hide all gunnery solutions first
          if (window.firingSolution) {
            window.firingSolution.visible = false;
          }
          
          // Show only the active fleet's gunnery solution
          const fleetSettings = window.IronTideFleetSettings[activeFleetId];
          if (fleetSettings && fleetSettings.firingSolution) {
            window.firingSolution = fleetSettings.firingSolution;
            window.firingSolution.visible = true;
          }
          
        } catch (error) {
          console.error('Error updating gunnery targets visibility:', error);
        }
      }

      // Initialize with Fleet 1 selected
      if (!window.IronTideSelectedFleet) {
        window.IronTideSelectedFleet = 1;
      }

      // Add event listeners to capture setting changes and apply to fleet leader
      function setupSettingsListeners() {
        try {
          // Speed slider
          const speedSlider = document.getElementById('speedSlider');
          if (speedSlider) {
            speedSlider.addEventListener('input', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const fleetLeader = getFleetLeader(currentFleet);
              const settings = window.IronTideFleetSettings[currentFleet];
              
              const newSpeed = parseInt(speedSlider.value) || 0;
              
              if (settings) {
                settings.speed = newSpeed;
              }
              
              // Apply speed to fleet leader if it exists
              if (fleetLeader && fleetLeader.state) {
                fleetLeader.state.speedKts = newSpeed;
                if (fleetLeader.state.setSpeedFromSlider) {
                  fleetLeader.state.setSpeedFromSlider(newSpeed);
                }
                
                // Update speed readout
                const speedReadout = document.querySelector('.speed-readout');
                if (speedReadout) speedReadout.textContent = newSpeed + ' kts';
              }
            });
          }

          // Formation select
          const formationSelect = document.getElementById('formationSelect');
          if (formationSelect) {
            formationSelect.addEventListener('change', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) {
                settings.formation = formationSelect.value;
              }
              // Toggle angle control visibility for Echelon/Wedge
              try {
                const formationAngleRow = document.getElementById('formationAngleRow');
                if (formationAngleRow) {
                  const val = String(formationSelect.value).toLowerCase();
                  const show = (val.includes('echelon') || val.includes('wedge'));
                  formationAngleRow.style.display = show ? 'flex' : 'none';
                  formationAngleRow.setAttribute('aria-hidden', String(!show));
                }
              } catch {}
              // Toggle width control visibility for Double Line Ahead
              try {
                const formationWidthRow = document.getElementById('formationWidthRow');
                if (formationWidthRow) {
                  const val = String(formationSelect.value).toLowerCase();
                  const show = (val.includes('double') && val.includes('line') && val.includes('ahead'));
                  formationWidthRow.style.display = show ? 'flex' : 'none';
                  formationWidthRow.setAttribute('aria-hidden', String(!show));
                }
              } catch {}
              // Auto-apply default interval: 120m for most, 300m for Circular Escort and Screen
              try {
                const val = String(formationSelect.value).toLowerCase();
                const isCircularEscort = val.includes('circular escort');
                const isScreen = val.includes('screen') && !val.includes('battle line with screen');
                const defInterval = (isCircularEscort || isScreen) ? 300 : 180;
                const intervalInput = document.getElementById('formationInterval');
                if (intervalInput) {
                  intervalInput.value = String(defInterval);
                }
                if (settings) {
                  settings.formationInterval = defInterval;
                }
                // Also reflect in transient formation state if present
                try { if (typeof formationState === 'object') formationState.intervalMeters = defInterval; } catch {}
              } catch {}
            });
          }
          
          // Formation width input (for Double Line Ahead)
          const formationWidthInput = document.getElementById('formationWidth');
          if (formationWidthInput) {
            formationWidthInput.addEventListener('input', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) {
                settings.formationWidth = parseInt(formationWidthInput.value) || 200;
              }
            });
          }

          // Pattern select
          const patternSelect = document.getElementById('patternSelect');
          if (patternSelect) {
            patternSelect.addEventListener('change', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) {
                settings.pattern = patternSelect.value;
              }
            });
          }

          // Formation interval
          const formationInterval = document.getElementById('formationInterval');
          if (formationInterval) {
            formationInterval.addEventListener('input', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) {
                // If input blank/invalid, fall back to formation-specific default
                let v = parseInt(formationInterval.value);
                if (!isFinite(v) || v <= 0) {
                  const fs = String((document.getElementById('formationSelect')?.value) || '').toLowerCase();
                  const isCE = fs.includes('circular escort');
                  const isSc = fs.includes('screen') && !fs.includes('battle line with screen');
                  v = (isCE || isSc) ? 300 : 180;
                }
                settings.formationInterval = v;
              }
            });
          }
          // Formation angle
          const formationAngle = document.getElementById('formationAngle');
          const formationAngleValue = document.getElementById('formationAngleValue');
          if (formationAngle) {
            formationAngle.addEventListener('input', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) settings.formationAngleDeg = parseInt(formationAngle.value) || 30;
              if (formationAngleValue) formationAngleValue.textContent = `${parseInt(formationAngle.value) || 30}Â°`;
            });
          }

          // Pattern amplitude
          const zigAmp = document.getElementById('zigAmp');
          if (zigAmp) {
            zigAmp.addEventListener('input', () => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) {
                settings.patternAmplitude = parseInt(zigAmp.value) || 50;
              }
            });
          }

          // Fleet compass click handling
          const fleetCompass = document.getElementById('fleetCompass');
          if (fleetCompass) {
            fleetCompass.addEventListener('click', (e) => {
              const currentFleet = window.IronTideSelectedFleet || 1;
              const fleetLeader = getFleetLeader(currentFleet);
              
              if (!fleetLeader) return; // No ships in fleet
              
              // Calculate clicked heading from compass center
              const rect = fleetCompass.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = e.clientX - centerX;
              const dy = e.clientY - centerY;
              let heading = Math.atan2(dx, -dy) * (180 / Math.PI);
              if (heading < 0) heading += 360;
              
              // Apply heading to fleet leader
              if (currentFleet === 1) {
                // Fleet 1: when no active pattern, update desired heading and clear move target so it holds
                const fp = (window.FleetPatterns && window.FleetPatterns[1]) || null;
                const patternActive = !!(fp && fp.selected && fp.path && fp.path.length > 1 && fp.guiding !== false);
                if (!patternActive) {
                  ship.desiredHeading = heading;
                  ship.moveTarget = null; // prevent click-to-move from overriding
                  try { window.IronTideManualHeadingHold = window.IronTideManualHeadingHold || { 1:false,2:false,3:false }; window.IronTideManualHeadingHold[1] = true; } catch {}
                  if (fleetLeader.state) {
                    fleetLeader.state.desiredHeading = heading;
                    if (fleetLeader.state.ship) {
                      fleetLeader.state.ship.desiredHeading = heading;
                    }
                  }
                }
              } else {
                // Fleet 2/3: update fleet leader state
                if (fleetLeader.state) {
                  fleetLeader.state.desiredHeading = heading;
                  if (fleetLeader.state.ship) {
                    fleetLeader.state.ship.desiredHeading = heading;
                  }
                }
              }
              
              // Update compass needle
              const fcPlanned = fleetCompass.querySelector('.needle.planned');
              if (fcPlanned) setNeedle(fcPlanned, heading);
                
              // Save to settings
              const settings = window.IronTideFleetSettings[currentFleet];
              if (settings) {
                settings.heading = heading;
              }
            });
          }

        } catch (error) {
          console.error('Error setting up settings listeners:', error);
        }
      }

      // Setup listeners after a short delay to ensure DOM is ready
      setTimeout(setupSettingsListeners, 100);

    } catch (error) {
      console.error('Error setting up fleet-specific settings:', error);
    }
  })();

  // --- Accuracy Panel (uses FiringSolution modifiers) ---
  (function setupAccuracyPanel(){
    // Helper: mean turret accuracy across available turrets
    function getMeanTurretAccuracy(state){
      try {
        const t = state && state.effects && state.effects.turrets;
        if (!t) return 1;
        const vals = Object.values(t).map(v => (v && typeof v.accuracy === 'number') ? v.accuracy : 1);
        if (!vals.length) return 1;
        const sum = vals.reduce((a,b)=>a+b,0);
        return sum / vals.length;
      } catch { return 1; }
    }

    // Compute accuracy probability using the same math as FiringSolution
    function computeAccuracyReport(){
      try {
        if (!firingSolution || !firingSolution.target || !window.shipState) return null;
        const sx = ship.x, sy = ship.y;
        const tx = firingSolution.target.x, ty = firingSolution.target.y;
        const distance = Math.hypot(tx - sx, ty - sy);
        const attackerSpeedKnots = Math.abs(typeof actualSpeedKts === 'number' ? actualSpeedKts : (window.shipState.actualSpeedKts || 0));
        const targetSpeedKnots = (typeof npc1 === 'object' && npc1 && npc1.state && typeof npc1.state.actualSpeedKts === 'number') ? Math.abs(npc1.state.actualSpeedKts) : 0;
        // Mean turret accuracy from current ship effects (0..1)
        const turretAccuracy = getMeanTurretAccuracy(window.shipState);
        // Accuracy penalty rules: Rangefinder can reduce accuracy by up to 12.5% linearly,
        // Bridge can reduce accuracy by up to 12.5% linearly (max combined reduction 25%).
        // Do NOT directly multiply by rangefinderEffect anymore.
        let accMult = 1;
        try {
          const hbs = (window.shipState.profile && window.shipState.profile.damage && window.shipState.profile.damage.hitboxes) || {};
          function hpP(key){
            const hb = hbs[key];
            if (!hb) return 1;
            if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) {
              return Math.max(0, Math.min(1, 1 - hb.damage_percent/100));
            }
            if (!hb.max_hp) return 1;
            const cur=(typeof hb.hp==='number'?hb.hp:hb.max_hp);
            return Math.max(0, Math.min(1, cur/hb.max_hp));
          }
          const rfDamage = 1 - hpP('rangefinder');
          const brDamage = 1 - hpP('bridge');
          const rfPen = 0.125 * rfDamage; // up to 12.5%
          const brPen = 0.125 * brDamage; // up to 12.5%
          accMult = Math.max(0, 1 - (rfPen + brPen));
        } catch {}
        const rangefinderEffect = 1; // neutralize direct effect; we use accMult instead

        let prob = 0;
        if (typeof window.FiringSolution === 'function') {
          // Instantiate with a dummy damage model since we only need profile
          try {
            const fs = new window.FiringSolution(window.shipState, { dummy:true });
            prob = fs.computeHitProbability(distance, turretAccuracy, rangefinderEffect, attackerSpeedKnots, targetSpeedKnots);
          } catch {
            // Fallback to replicated math if constructor guards fail
            const maxRange = (window.shipState.profile && window.shipState.profile.weapons && window.shipState.profile.weapons.main_battery && window.shipState.profile.weapons.main_battery.range_meters) || 20000;
            const rangeFactor = Math.max(0, 1 - 1.3 * (distance / maxRange));
            const speedPenalty = 1 - 0.01 * (attackerSpeedKnots + targetSpeedKnots);
            prob = turretAccuracy * rangefinderEffect * rangeFactor * speedPenalty;
            prob = Math.max(0, Math.min(1, prob));
          }
        } else {
          // Fallback to replicated math if FiringSolution is not available
          const maxRange = (window.shipState.profile && window.shipState.profile.weapons && window.shipState.profile.weapons.main_battery && window.shipState.profile.weapons.main_battery.range_meters) || 20000;
          const rangeFactor = Math.max(0, 1 - 1.3 * (distance / maxRange));
          const speedPenalty = 1 - 0.01 * (attackerSpeedKnots + targetSpeedKnots);
          prob = Math.max(0, rangeFactor * speedPenalty * turretAccuracy * rangefinderEffect);
        }
        // Apply the RF/Bridge accuracy multiplier (max 25% reduction total)
        prob = Math.max(0, Math.min(1, prob * accMult));
        const pct = Math.round(prob * 100);
        return { probability: prob, percentText: pct + '%' };
      } catch { return null; }
    }

    function renderAccuracy(){
      try {
        const el = document.getElementById('accuracyPanel');
        if (!el) return;
        const rep = computeAccuracyReport();
        const txt = rep ? ('Accuracy: ' + rep.percentText) : 'Accuracy: --%';
        if (el.textContent !== txt) el.textContent = txt;
      } catch {}
    }

    function tick(){
      renderAccuracy();
      setupAccuracyPanel._tid = setTimeout(tick, 250);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      tick();
    } else {
      window.addEventListener('DOMContentLoaded', tick, { once: true });
    }

    // Expose for debugging/other UI
    try { window.computeAccuracyReport = computeAccuracyReport; } catch {}
  })();

  // --- Mobile Dock Auto-Scale (fit all controls at bottom, preserve ratio) ---
  function setupDockAutoScaleMobile() {
    try {
      const dock = document.getElementById('navalDock');
      if (!dock) return;
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;
      if (!isMobile) {
        dock.style.transform = '';
        dock.style.transformOrigin = '';
        return;
      }
      // In portrait, prefer sliding (CSS overflow-x) and do not scale
      if (isPortrait) {
        dock.style.transform = '';
        dock.style.transformOrigin = '';
        return;
      }
      // Measure intrinsic size without previous scaling
      const prev = dock.style.transform;
      dock.style.transform = 'none';
      const pad = 4; // small breathing room px
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Target a max band at bottom (e.g., up to 30% vh), but allow smaller if content is short
      const maxBand = 0.30; // 30% of viewport height
      const availH = Math.max(100, Math.floor(vh * maxBand)) - pad;
      const availW = vw - pad*2;
      const rect = dock.getBoundingClientRect();
      const contentW = Math.max(1, rect.width);
      const contentH = Math.max(1, rect.height);
      const scaleW = availW / contentW;
      const scaleH = availH / contentH;
      const s = Math.min(1, scaleW, scaleH);
      dock.style.transformOrigin = 'left bottom';
      dock.style.transform = `scale(${s})`;
      // Keep dock pinned to bottom-left visually (already fixed via CSS)
    } catch {}
  }
  
  // --- Gunnery FIRE system ---
  // Toggle continuous salvos: at most one salvo every 10s. Each salvo triggers 1 shot per turret
  // with a small random delay so they don't fire in perfect unison.
  const gunneryFire = {
    enabled: false,
    lastSalvoAt: 0,
    intervalSec: 10,
    schedule: [], // { id:'t1', t: seconds }
    // Reload SFX scheduling per salvo
    reloadSalvoAt: 0,
    reloadScheduled: false,
  };
  (function setupFireToggle(){
    try {
      const btn = document.querySelector('.fire-btn[data-fleet="1"]') || document.querySelector('.fire-btn');
      // Expose a helper to programmatically enable/disable FIRE and sync the button UI
      window.setFireEnabled = function(on){
        try {
          // Do not block enabling based on range; shells are already clamped to max range in firing logic
          gunneryFire.enabled = !!on;
          if (btn) {
            btn.classList.toggle('active', gunneryFire.enabled);
            try { btn.setAttribute('aria-pressed', gunneryFire.enabled ? 'true' : 'false'); } catch {}
          }
        } catch {}
      };
      // No direct click binding here. Fleet 1 FIRE button is handled together with other fleets
      // inside setupFleetGunneryControls() to keep behavior consistent across fleets.
    } catch {}
  })();

  // --- Fleet Gunnery Controls Setup ---
  (function setupFleetGunneryControls(){
    try {
      // Setup FIRE buttons for all fleets
      document.querySelectorAll('.fire-btn').forEach(btn => {
        const fleetId = parseInt(btn.getAttribute('data-fleet')) || 1;
        btn.addEventListener('click', () => {
          window.FleetGunnery = window.FleetGunnery || { 1: {}, 2: {}, 3: {} };
          const g = window.FleetGunnery[fleetId];
          // Unified FIRE toggle for all fleets
          g.fireEnabled = !g.fireEnabled;
          btn.classList.toggle('active', g.fireEnabled);
          btn.setAttribute('aria-pressed', g.fireEnabled ? 'true' : 'false');
          console.log(`Fleet ${fleetId} fire ${g.fireEnabled ? 'ENABLED' : 'DISABLED'}`);

          // Keep legacy player firing scheduler in sync for Fleet 1
          if (fleetId === 1) {
            gunneryFire.enabled = g.fireEnabled;
          }
        });
      });
      
      // Setup Solution buttons for all fleets
      document.querySelectorAll('.get-firing-solution-btn').forEach(btn => {
        const fleetId = parseInt(btn.getAttribute('data-fleet')) || 1;
        btn.addEventListener('click', () => {
          if (fleetId === 1) {
            // Fleet 1 uses original solution system
            if (typeof window.armSolution === 'function') {
              window.armSolution();
            } else {
              window.gunnerySolutionArmed = !window.gunnerySolutionArmed;
              btn.classList.toggle('active', window.gunnerySolutionArmed);
            }
          } else {
            // Fleet 2/3 enter targeting mode with proper toggle
            window.FleetGunnery = window.FleetGunnery || { 2: {}, 3: {} };
            const g = window.FleetGunnery[fleetId];
            g.solutionArmed = !g.solutionArmed;
            btn.classList.toggle('active', g.solutionArmed);
            btn.setAttribute('aria-pressed', g.solutionArmed ? 'true' : 'false');
            
            if (g.solutionArmed) {
              window.FleetTargetingMode = { active: true, fid: fleetId };
              console.log(`Fleet ${fleetId} solution mode - click on map to set target`);
            } else {
              window.FleetTargetingMode = { active: false, fid: 0 };
            }
          }
        });
      });
    } catch {}
  })();
  // Ensure gunnery title buttons always toggle (delegated, capture-phase)
  (function setupGunneryDelegatedToggle(){
    try {
      if (window.__GunneryTitleDelegated__) return;
      const onClick = (e) => {
        const target = e.target && (e.target.closest ? e.target.closest('.gunnery-title-btn') : null);
        if (!target) return;
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        const fleetId = parseInt(target.getAttribute('data-fleet')) || 1;
        // Toggle per-fleet gunnery state
        if (fleetId === 1) {
          // Check if player ship is ACTUALLY in Fleet 1 (not just exists)
          const playerId = window.shipState && window.shipState.id != null ? String(window.shipState.id) : null;
          const playerInFleet1 = !!(playerId && window.IronTideFleetAssignments && window.IronTideFleetAssignments[1] && window.IronTideFleetAssignments[1].has(playerId));
          
          if (!playerInFleet1) {
            console.log(`Player ship is not in Fleet 1 - Fleet 1 gunnery cannot be enabled`);
            return;
          }
          
          window.gunnery = window.gunnery || { enabled: false };
          gunnery.enabled = !gunnery.enabled;
          target.classList.toggle('active', gunnery.enabled);
          target.classList.toggle('brass-selected', gunnery.enabled);
          target.setAttribute('aria-pressed', gunnery.enabled ? 'true' : 'false');
          console.log(`Fleet 1 gunnery ${gunnery.enabled ? 'ENABLED' : 'DISABLED'} (player in Fleet 1)`);
          // Reset cycle index when enabling
          if (gunnery.enabled) {
            window.FleetGunneryCycle = window.FleetGunneryCycle || { 1:{ index: -1 } };
            window.FleetGunneryCycle[1].index = -1;
          }
        } else {
          // Check if this fleet has ships before allowing gunnery toggle
          const fleetHasShips = !!(window.IronTideFleetAssignments && window.IronTideFleetAssignments[fleetId] && window.IronTideFleetAssignments[fleetId].size > 0);
          if (!fleetHasShips) {
            console.log(`Fleet ${fleetId} has no ships - gunnery cannot be enabled`);
            return; // Don't toggle if fleet is empty
          }
          
          window.FleetGunnery = window.FleetGunnery || { 1:{}, 2:{}, 3:{} };
          const g = window.FleetGunnery[fleetId] || (window.FleetGunnery[fleetId] = {});
          g.gunneryEnabled = !g.gunneryEnabled;
          target.classList.toggle('active', g.gunneryEnabled);
          target.classList.toggle('brass-selected', g.gunneryEnabled);
          target.setAttribute('aria-pressed', g.gunneryEnabled ? 'true' : 'false');
          console.log(`Fleet ${fleetId} gunnery ${g.gunneryEnabled ? 'ENABLED' : 'DISABLED'} (has ${window.IronTideFleetAssignments[fleetId].size} ships)`);
          if (g.gunneryEnabled) {
            window.FleetGunneryCycle = window.FleetGunneryCycle || { 1:{ index: -1 }, 2:{ index: -1 }, 3:{ index: -1 } };
            if (!window.FleetGunneryCycle[fleetId]) window.FleetGunneryCycle[fleetId] = { index: -1 };
            window.FleetGunneryCycle[fleetId].index = -1;
          }
        }
      };
      document.addEventListener('click', onClick, true);
      window.__GunneryTitleDelegated__ = true;
    } catch {}
  })();

  // Force initial visual state of all gunnery title buttons to OFF
  (function initGunneryButtonsOff(){
    try {
      // Fleet 1 state
      if (typeof window.gunnery !== 'object' || !window.gunnery) window.gunnery = { enabled: false };
      else window.gunnery.enabled = false;
      // Fleet 2/3 state
      window.FleetGunnery = window.FleetGunnery || { 1:{}, 2:{}, 3:{} };
      if (!window.FleetGunnery[1]) window.FleetGunnery[1] = {};
      if (!window.FleetGunnery[2]) window.FleetGunnery[2] = {};
      if (!window.FleetGunnery[3]) window.FleetGunnery[3] = {};
      window.FleetGunnery[1].gunneryEnabled = false;
      window.FleetGunnery[2].gunneryEnabled = false;
      window.FleetGunnery[3].gunneryEnabled = false;

      // Clear button visuals
      document.querySelectorAll('.gunnery-title-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.remove('brass-selected');
        btn.setAttribute('aria-pressed', 'false');
      });
    } catch {}
  })();

  // --- Shell projectiles ---
  const shells = { pool: [], active: [] };
  function allocShell(){ return shells.pool.length ? shells.pool.pop() : { x:0,y:0,vx:0,vy:0,life:0,maxLife:5, rScreen: 3, penRemain: 8 }; }
  function freeShell(s){ shells.pool.push(s); }
  // Current max range in world units (matches red circle radius in drawShipWorld)
  function getMaxRangeWorld(){
    try {
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const targetHBase = 96;
      const zValRaw = (typeof zoomOutSlider !== 'undefined' && zoomOutSlider && zoomOutSlider.value != null) ? Number(zoomOutSlider.value) : 1;
      const zVal = (isFinite(zValRaw) && zValRaw > 0) ? zValRaw : 1;
      const targetHScreen = Math.round(targetHBase * zVal);
      const worldH = Math.max(1, targetHScreen / scale);
      const base = 16.8 * worldH; // keep in sync with drawShipWorld() (+20% over doubled)
      const dbgScale = (typeof window !== 'undefined' && typeof window.DebugRangeScale === 'number' && isFinite(window.DebugRangeScale) && window.DebugRangeScale > 0)
        ? window.DebugRangeScale : 1;
      return base * dbgScale;
    } catch { return 400; }
  }
  // Independent NPC gunnery state (not tied to player's firing solution)
  const npcGunnery = {
    enabled: true,
    intervalSec: 12,
    lastTurretAt: { t1: -1e9, t2: -1e9, t3: -1e9, t4: -1e9 },
    schedule: [], // { id:'t1', t: seconds }
  };
  function spawnShell(px, py, worldDeg, turretId, target){
    const s = allocShell();
    const spd = 350; // px/sec (slower)
    const rad = (worldDeg) * Math.PI/180;
    s.x = px; s.y = py;
    s.vx = Math.sin(rad) * spd;
    s.vy = -Math.cos(rad) * spd;
    s.life = 0; s.maxLife = 5; // seconds fallback cap
    // Track source turret to infer ownership (player vs NPC)
    try { s.turretId = turretId; } catch {}
    try { s.owner = (turretId && /^et[1-4]$/.test(String(turretId))) ? 'npc' : 'player'; } catch { s.owner = 'player'; }
    // Use the firing origin as the range clamp center so NPC and player shells behave independently
    const cx = px;
    const cy = py;
    const maxR = getMaxRangeWorld();
    if (target && typeof target.x === 'number' && typeof target.y === 'number') {
      // Clamp final (already deviated) target to max range ring so shells land before an out-of-range target
      let tx = target.x, ty = target.y;
      const dx = tx - cx, dy = ty - cy;
      const d = Math.hypot(dx, dy);
      if (d > maxR) {
        const ux = dx / d, uy = dy / d;
        tx = cx + ux * maxR;
        ty = cy + uy * maxR;
      }
      s.tx = tx; s.ty = ty;
    } else {
      // No explicit target: land at max range along firing direction, with small randomness
      const ux = Math.sin(rad), uy = -Math.cos(rad);
      // Slight jitter: up to Â±2% radial and Â±2% lateral of max range
      const radialJ = (Math.random()*2 - 1) * (0.02 * maxR);
      const latJ = (Math.random()*2 - 1) * (0.02 * maxR);
      const pxj = uy; const pyj = -ux; // perpendicular unit
      const baseR = Math.max(0, maxR + radialJ);
      s.tx = cx + ux * baseR + pxj * latJ;
      s.ty = cy + uy * baseR + pyj * latJ;
    }
    // Ensure lifespan long enough to reach destination
    try {
      if (s.tx != null && s.ty != null) {
        const dxT = s.tx - s.x; const dyT = s.ty - s.y;
        const distT = Math.hypot(dxT, dyT);
        const timeToHit = distT / spd;
        s.maxLife = Math.max(s.maxLife, timeToHit + 0.25); // small margin
      }
    } catch {}
    shells.active.push(s);
    // Turret puff and recoil
    spawnGunPuff(px, py, worldDeg);
    applyTurretRecoil(turretId);
    // Cannon SFX
    playCannonSound();
  }
  function updateAndDrawShellsWorld(dt){
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const out = [];
    for (let i=0;i<shells.active.length;i++){
      const s = shells.active[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        // Decide effect at end-of-life: ship/land -> explosion, open water -> splash
        let did = false;
        try {
          // Land?
          if (islandSolidAtWorld && islandSolidAtWorld(s.x, s.y)) { spawnExplosion(s.x, s.y); playHitSound(); did = true; }
          // Ship?
          else if (npc1 && npc1.state && npc1.state.ship) {
            const hx = npc1.state.ship.x, hy = npc1.state.ship.y;
            const hd = Math.hypot(s.x - hx, s.y - hy);
            if (hd <= 28) { spawnExplosion(s.x, s.y); playHitSound(); spawnBlackSmoke(s.x, s.y, 6); did = true; }
          }
        } catch {}
        if (!did) spawnSplash(s.x, s.y);
        freeShell(s); continue;
      }
      // If a target pin exists for this shell, stop at the pin
      if (s.tx != null && s.ty != null) {
        const dx = s.tx - s.x; const dy = s.ty - s.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.hypot(s.vx*dt, s.vy*dt);
        if (step >= dist) {
          // Arrived (or overshot): clamp to target and finish
          s.x = s.tx; s.y = s.ty;
          // Decide effect based on surface at impact point
          let did = false;
          try {
            if (islandSolidAtWorld && islandSolidAtWorld(s.x, s.y)) { spawnExplosion(s.x, s.y); playHitSound(); did = true; }
            else if (npc1 && npc1.state && npc1.state.ship) {
              const hx = npc1.state.ship.x, hy = npc1.state.ship.y;
              const hd = Math.hypot(s.x - hx, s.y - hy);
              if (hd <= 28) { spawnExplosion(s.x, s.y); playHitSound(); spawnBlackSmoke(s.x, s.y, 6); did = true; }
            }
          } catch {}
          if (!did) spawnSplash(s.x, s.y);
          freeShell(s); continue;
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // Land collision: allow small penetration then explode on island
      try {
        if (islandSolidAtWorld && islandSolidAtWorld(s.x, s.y)) {
          const step = Math.hypot(s.vx*dt, s.vy*dt);
          if (typeof s.penRemain !== 'number') s.penRemain = 8;
          s.penRemain -= step;
          if (s.penRemain <= 0) {
            spawnExplosion(s.x, s.y); playHitSound();
            freeShell(s);
            continue;
          }
        }
      } catch {}
      // NPC hit test: simple radial check around NPC ship center
      if (npc1 && npc1.state && npc1.state.ship && s.owner !== 'npc') {
        const hx = npc1.state.ship.x, hy = npc1.state.ship.y;
        const hd = Math.hypot(s.x - hx, s.y - hy);
        const hitR = 28; // world units
        if (hd <= hitR) {
          // Apply damage to a representative hitbox (approximate): hullmid
          try {
            const dmg = 120; // fixed damage per shell
            if (npc1 && npc1.damageModel && npc1.profile && npc1.profile.damage) {
              const hitboxes = npc1.profile.damage.hitboxes || {};
              const intact = Object.keys(hitboxes).filter(k => hitboxes[k] && !hitboxes[k].destroyed);
              function pickRandom(arr){ return (arr && arr.length) ? arr[Math.floor(Math.random()*arr.length)] : null; }
              // 50% chance to directly hit a discrete hitbox; else treat as hull impact with pass-through logic
              if (Math.random() < 0.5) {
                const chosen = pickRandom(intact);
                if (chosen) {
                  npc1.damageModel.applyDamage(chosen, dmg);
                  // Visual: small explosion and continuous black smoke near impact
                  let ex = s.x + (Math.random()*8 - 4);
                  let ey = s.y + (Math.random()*6 - 3);
                  // Clamp to inside of ship PNG before spawning smoke
                  try {
                    const shipRef = npc1.state.ship;
                    const hrC = (shipRef.heading||0) * Math.PI/180;
                    const vrC = currentViewRect || getViewRect();
                    const scaleC = vrC.scale || 1;
                    const targetHBaseC = 96;
                    const targetHScreenC = Math.round(targetHBaseC * (zoomOutSlider ? zoomOutSlider.value : 1));
                    const worldHC = Math.max(1, targetHScreenC / scaleC);
                    if (shipImg && shipImg.width && shipImg.height) {
                      const aspectC = shipImg.width / shipImg.height;
                      const worldWC = Math.round(worldHC * aspectC);
                      const halfWC = worldWC/2, halfHC2 = worldHC/2;
                      const marginC = 10 / scaleC;
                      let lx =  (ex - shipRef.x) * Math.cos(-hrC) - (ey - shipRef.y) * Math.sin(-hrC);
                      let ly =  (ex - shipRef.x) * Math.sin(-hrC) + (ey - shipRef.y) * Math.cos(-hrC);
                      const maxXC = Math.max(0, halfWC - marginC);
                      const maxYC = Math.max(0, halfHC2 - marginC);
                      if (lx >  maxXC) lx =  maxXC; else if (lx < -maxXC) lx = -maxXC;
                      if (ly >  maxYC) ly =  maxYC; else if (ly < -maxYC) ly = -maxYC;
                      ex = shipRef.x + (lx * Math.cos(hrC) - ly * Math.sin(hrC));
                      ey = shipRef.y + (lx * Math.sin(hrC) + ly * Math.cos(hrC));
                    }
                  } catch {}
                  spawnExplosion(ex, ey);
                  spawnBlackSmoke(ex, ey, 6);
                  if (chosen === 'engine' || chosen === 'funnel') {
                    spawnPersistentDamageEmitterForShip(npc1, chosen, ex, ey, 8);
                  } else {
                    spawnBlackSmokeEmitterForShip(npc1.state.ship, ex, ey, 5, 8);
                  }
                } else if (npc1.profile.damage.hullIntegrity) {
                  npc1.damageModel.applyHullDamage(dmg);
                  let ex = s.x + (Math.random()*8 - 4);
                  let ey = s.y + (Math.random()*6 - 3);
                  try {
                    const shipRef = npc1.state.ship;
                    const hrC = (shipRef.heading||0) * Math.PI/180;
                    const vrC = currentViewRect || getViewRect();
                    const scaleC = vrC.scale || 1;
                    const targetHBaseC = 96;
                    const targetHScreenC = Math.round(targetHBaseC * (zoomOutSlider ? zoomOutSlider.value : 1));
                    const worldHC = Math.max(1, targetHScreenC / scaleC);
                    if (shipImg && shipImg.width && shipImg.height) {
                      const aspectC = shipImg.width / shipImg.height;
                      const worldWC = Math.round(worldHC * aspectC);
                      const halfWC = worldWC/2, halfHC2 = worldHC/2;
                      const marginC = 10 / scaleC;
                      let lx =  (ex - shipRef.x) * Math.cos(-hrC) - (ey - shipRef.y) * Math.sin(-hrC);
                      let ly =  (ex - shipRef.x) * Math.sin(-hrC) + (ey - shipRef.y) * Math.cos(-hrC);
                      const maxXC = Math.max(0, halfWC - marginC);
                      const maxYC = Math.max(0, halfHC2 - marginC);
                      if (lx >  maxXC) lx =  maxXC; else if (lx < -maxXC) lx = -maxXC;
                      if (ly >  maxYC) ly =  maxYC; else if (ly < -maxYC) ly = -maxYC;
                      ex = shipRef.x + (lx * Math.cos(hrC) - ly * Math.sin(hrC));
                      ey = shipRef.y + (lx * Math.sin(hrC) + ly * Math.cos(-hrC));
                    }
                  } catch {}
                  spawnExplosion(ex, ey); playHitSound();
                  spawnBlackSmoke(ex, ey, 5);
                  spawnBlackSmokeEmitterForShip(npc1.state.ship, ex, ey, 5, 7);
                }
              } else {
                // Pass-through: 50% miss, 50% random hitbox
                if (Math.random() < 0.5) {
                  // miss: no damage
                } else {
                  const chosen = pickRandom(intact);
                  if (chosen) {
                    npc1.damageModel.applyDamage(chosen, dmg);
                    let ex = s.x + (Math.random()*8 - 4);
                    let ey = s.y + (Math.random()*6 - 3);
                    try {
                      const shipRef = npc1.state.ship;
                      const hrC = (shipRef.heading||0) * Math.PI/180;
                      const vrC = currentViewRect || getViewRect();
                      const scaleC = vrC.scale || 1;
                      const targetHBaseC = 96;
                      const targetHScreenC = Math.round(targetHBaseC * (zoomOutSlider ? zoomOutSlider.value : 1));
                      const worldHC = Math.max(1, targetHScreenC / scaleC);
                      if (shipImg && shipImg.width && shipImg.height) {
                        const aspectC = shipImg.width / shipImg.height;
                        const worldWC = Math.round(worldHC * aspectC);
                        const halfWC = worldWC/2, halfHC2 = worldHC/2;
                        const marginC = 10 / scaleC;
                        let lx =  (ex - shipRef.x) * Math.cos(-hrC) - (ey - shipRef.y) * Math.sin(-hrC);
                        let ly =  (ex - shipRef.x) * Math.sin(-hrC) + (ey - shipRef.y) * Math.cos(-hrC);
                        const maxXC = Math.max(0, halfWC - marginC);
                        const maxYC = Math.max(0, halfHC2 - marginC);
                        if (lx >  maxXC) lx =  maxXC; else if (lx < -maxXC) lx = -maxXC;
                        if (ly >  maxYC) ly =  maxYC; else if (ly < -maxYC) ly = -maxYC;
                        ex = shipRef.x + (lx * Math.cos(hrC) - ly * Math.sin(hrC));
                        ey = shipRef.y + (lx * Math.sin(hrC) + ly * Math.cos(hrC));
                      }
                    } catch {}
                    spawnExplosion(ex, ey); playHitSound();
                    spawnBlackSmoke(ex, ey, 6);
                    if (chosen === 'engine' || chosen === 'funnel') {
                      spawnPersistentDamageEmitterForShip(npc1, chosen, ex, ey, 8);
                    } else {
                      spawnBlackSmokeEmitterForShip(npc1.state.ship, ex, ey, 5, 8);
                    }
                  }
                }
              }
            }
          } catch {}
          // Ship impact already handled above (explosion/smoke); no splash on ship
          freeShell(s);
          continue;
        }
      }
      // Player shell hit test against all enemy NPCs (beyond legacy npc1)
      if (s.owner !== 'npc' && Array.isArray(window.NPCs) && window.NPCs.length) {
        let hitAny = false;
        try {
          const enemySet = (window.EnemyFleet1 instanceof Set) ? window.EnemyFleet1 : new Set();
          for (let i=0;i<window.NPCs.length;i++){
            const en = window.NPCs[i];
            if (!en || en === npc1) continue; // npc1 already handled above
            if (!en.state || !en.state.ship || !en.damageModel) continue;
            const idStr = String(en.state.id);
            if (!enemySet.has(idStr)) continue; // only damage enemies with player shells
            // Skip sunk
            try { if (en.state.effects?.sunk || en.state.sunk) continue; } catch {}
            const hx = en.state.ship.x, hy = en.state.ship.y;
            const hd = Math.hypot(s.x - hx, s.y - hy);
            const hitR = 28;
            if (hd <= hitR) {
              try {
                const dmg = 120;
                const hitboxes = (en.profile && en.profile.damage && en.profile.damage.hitboxes) ? en.profile.damage.hitboxes : {};
                const intact = Object.keys(hitboxes).filter(k => hitboxes[k] && !hitboxes[k].destroyed);
                function pickRandom(arr){ return (arr && arr.length) ? arr[Math.floor(Math.random()*arr.length)] : null; }
                if (Math.random() < 0.5) {
                  const chosen = pickRandom(intact);
                  if (chosen) {
                    en.damageModel.applyDamage(chosen, dmg);
                  } else if (en.profile && en.profile.damage && en.profile.damage.hullIntegrity) {
                    en.damageModel.applyHullDamage(dmg);
                  }
                } else {
                  if (Math.random() < 0.5) {
                    if (en.profile && en.profile.damage && en.profile.damage.hullIntegrity) en.damageModel.applyHullDamage(dmg);
                  } else {
                    const chosen = pickRandom(intact);
                    if (chosen) en.damageModel.applyDamage(chosen, dmg);
                  }
                }
              } catch {}
              spawnExplosion(s.x, s.y); playHitSound();
              try { spawnBlackSmoke(s.x, s.y, 6); } catch {}
              freeShell(s);
              hitAny = true;
              break;
            }
          }
        } catch {}
        if (hitAny) { continue; }
      }
      // Friendly fleet interception for NPC shells
      // If an enemy shell passes close to a friendly ship (not under player control),
      // allow it to hit the friendly and be absorbed, protecting the player behind.
      if (s.owner === 'npc') {
        let intercepted = false;
        try {
          const enemySet = (window.EnemyFleet1 instanceof Set) ? window.EnemyFleet1 : new Set();
          // Build a combined list of friendlies from both NPCs (non-enemy) and IronTideFleet
          const friendlies = [];
          if (Array.isArray(window.NPCs)) {
            for (let fi = 0; fi < window.NPCs.length; fi++) {
              const h = window.NPCs[fi];
              if (!h || !h.state) continue;
              const hid = String(h.state.id);
              if (!enemySet.has(hid)) friendlies.push(h);
            }
          }
          if (Array.isArray(window.IronTideFleet)) {
            const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
            for (let fi = 0; fi < window.IronTideFleet.length; fi++) {
              const h = window.IronTideFleet[fi];
              if (!h || !h.state) continue;
              const hid = String(h.state.id);
              if (hid && hid === playerId) continue; // exclude player ship (handled separately)
              friendlies.push(h);
            }
          }
          for (let fi = 0; fi < friendlies.length; fi++) {
            const f = friendlies[fi];
            if (!f || !f.state || !f.state.ship || !f.damageModel) continue;
            // Skip sunk friendlies
            try { if (f.state.effects?.sunk || f.state.sunk) continue; } catch {}
            const hx = f.state.ship.x, hy = f.state.ship.y;
            const hd = Math.hypot(s.x - hx, s.y - hy);
            const hitR = 28;
            if (hd <= hitR) {
              try {
                const dmg = 100; // same as player hit from NPC shell
                const hitboxes = (f.profile && f.profile.damage && f.profile.damage.hitboxes) ? f.profile.damage.hitboxes : {};
                const intact = Object.keys(hitboxes).filter(k => hitboxes[k] && !hitboxes[k].destroyed);
                function pickRandom(arr){ return (arr && arr.length) ? arr[Math.floor(Math.random()*arr.length)] : null; }
                if (Math.random() < 0.5) {
                  const chosen = pickRandom(intact);
                  if (chosen) {
                    f.damageModel.applyDamage(chosen, dmg);
                  } else if (f.profile && f.profile.damage && f.profile.damage.hullIntegrity) {
                    f.damageModel.applyHullDamage(dmg);
                  }
                } else {
                  if (Math.random() < 0.5) {
                    if (f.profile && f.profile.damage && f.profile.damage.hullIntegrity) f.damageModel.applyHullDamage(dmg);
                  } else {
                    const chosen = pickRandom(intact);
                    if (chosen) f.damageModel.applyDamage(chosen, dmg);
                  }
                }
              } catch {}
              spawnExplosion(s.x, s.y); playHitSound();
              try { spawnBlackSmoke(s.x, s.y, 6); } catch {}
              freeShell(s);
              intercepted = true;
              break;
            }
          }
        } catch {}
        if (intercepted) { continue; }
      }
      // Player ship hit test for NPC shells
      if (s.owner === 'npc' && ship && damageModel) {
        const hx = ship.x, hy = ship.y;
        const hd = Math.hypot(s.x - hx, s.y - hy);
        const hitR = 28;
        if (hd <= hitR) {
          try {
            const dmg = 100; // NPC shell base damage
            const hbMap = (window.shipProfile && window.shipProfile.damage && window.shipProfile.damage.hitboxes) ? window.shipProfile.damage.hitboxes : {};
            const intact = Object.keys(hbMap).filter(k => hbMap[k] && !hbMap[k].destroyed);
            function pickRandom(arr){ return (arr && arr.length) ? arr[Math.floor(Math.random()*arr.length)] : null; }
            if (Math.random() < 0.5) {
              const chosen = pickRandom(intact);
              if (chosen) {
                damageModel.applyDamage(chosen, dmg);
              } else if (window.shipProfile && window.shipProfile.damage && window.shipProfile.damage.hullIntegrity) {
                damageModel.applyHullDamage(dmg);
              }
            } else {
              if (Math.random() < 0.5) {
                damageModel.applyHullDamage(dmg);
              } else {
                const chosen = pickRandom(intact);
                if (chosen) damageModel.applyDamage(chosen, dmg);
              }
            }
          } catch {}
          spawnExplosion(s.x, s.y); playHitSound();
          try { spawnBlackSmoke(s.x, s.y, 6); } catch {}
          freeShell(s);
          continue;
        }
      }
      // Draw a tiny bright dot with a short streak
      const dotR = Math.max(0.75, 1.25 / scale);
      const trailL = 6 / scale;
      const ang = Math.atan2(s.vy, s.vx);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(255,235,180,0.85)';
      ctx.lineWidth = Math.max(0.75, 1/scale);
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(-trailL, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,180,0.95)';
      ctx.beginPath();
      ctx.arc(0, 0, dotR, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      out.push(s);
    }
    shells.active = out;
  }

  // --- Turret smoke puffs (1s) ---
  const gunPuffs = { pool: [], active: [] };
  function allocGunPuff(){ return gunPuffs.pool.length ? gunPuffs.pool.pop() : { x:0,y:0, life:0, maxLife:1.0, dirx:0, diry:0, sizeMul:1 }; }
  function freeGunPuff(p){ gunPuffs.pool.push(p); }
  function spawnGunPuff(x,y, worldDeg){
    const r = worldDeg * Math.PI/180;
    // Emit multiple overlapping puffs for thicker look
    for (let i=0;i<3;i++){
      const p = allocGunPuff();
      p.x = x; p.y = y; p.life = 0; p.maxLife = 1.0 + Math.random()*0.2;
      const base = 60 + Math.random()*40; // stronger forward drift (px/s)
      const jitter = 10; // lateral jitter (px/s)
      p.dirx = Math.sin(r) * base + (Math.random()*2-1)*jitter;
      p.diry = -Math.cos(r) * base + (Math.random()*2-1)*jitter;
      p.sizeMul = 1.0 + Math.random()*0.6; // varied size per puff
      gunPuffs.active.push(p);
    }
  }
  function updateAndDrawGunPuffsWorld(dt){
    const vr = currentViewRect || getViewRect(); const scale = vr.scale || 1;
    const out = [];
    for (let i=0;i<gunPuffs.active.length;i++){
      const p = gunPuffs.active[i];
      p.life += dt; const t = Math.min(1, p.life / p.maxLife);
      if (t >= 1){ freeGunPuff(p); continue; }
      // Integrate slight drift and expansion
      p.x += p.dirx * dt * 0.5;
      p.y += p.diry * dt * 0.5;
      const baseR = 14; // larger base radius in screen px
      const r = ((baseR * (p.sizeMul||1)) + 36*t) / scale;
      const a = 0.8 * (1 - t);
      ctx.save();
      ctx.globalAlpha = a;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, 'rgba(230,230,230,0.9)');
      grad.addColorStop(1, 'rgba(230,230,230,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      out.push(p);
    }
    gunPuffs.active = out;
  }

  // --- Per-turret recoil (screen-constant ~4px)
  const turretRecoil = { t1:0, t2:0, t3:0, t4:0 };
  function applyTurretRecoil(id){
    try {
      const vr = currentViewRect || getViewRect(); const scale = vr.scale || 1;
      const kick = 4 / scale; // world units for 4px on screen
      turretRecoil[id] = Math.max(turretRecoil[id]||0, kick);
    } catch {}
  }

  // --- Water splashes ---
  const splashes = { pool: [], active: [] };
  function allocSplash(){
    return splashes.pool.length ? splashes.pool.pop() : {
      x:0,y:0, life:0, maxLife:0.8, r:0,
      droplets: null, foamLife:0, foamMax:1.4,
    };
  }
  function freeSplash(p){ splashes.pool.push(p); }
  function spawnSplash(x,y){
    // Play splash sound effect on water impact
    try { playSplashSound(); } catch {}
    const p=allocSplash();
    p.x=x; p.y=y; p.life=0; p.maxLife=0.8; p.r=0; p.foamLife=0; p.foamMax=1.4;
    // Create crown droplets
    const n = 16 + Math.floor(Math.random()*8);
    const dr = [];
    for (let i=0;i<n;i++){
      const ang = (i / n) * Math.PI*2 + (Math.random()*0.3 - 0.15);
      const spd = 140 + Math.random()*120; // px/s
      const up = 120 + Math.random()*120;  // upward bias
      dr.push({
        x, y,
        vx: Math.cos(ang) * spd * 0.35,
        vy: -Math.abs(Math.sin(ang)) * spd * 0.2 - up,
        life: 0,
        maxLife: 0.75 + Math.random()*0.35,
        size: 1.5 + Math.random()*1.2,
      });
    }
    p.droplets = dr;
    splashes.active.push(p);
  }
  function updateAndDrawSplashesWorld(dt){
    const vr = currentViewRect || getViewRect(); const scale = vr.scale || 1;
    const out=[]; const g = 420; // gravity px/s^2 downward
    for (let i=0;i<splashes.active.length;i++){
      const p = splashes.active[i];
      p.life += dt; const t = Math.min(1, p.life / p.maxLife);
      // Expanding crown ring (short)
      if (t < 1){
        const r = (8 + 36*t) / scale;
        const lw = Math.max(0.9, 2.2/scale);
        const a = 0.8*(1-t);
        ctx.save();
        ctx.lineWidth = lw; ctx.strokeStyle = `rgba(210,235,255,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      }
      // Droplets update/draw
      if (p.droplets && p.droplets.length){
        const next=[];
        for (let j=0;j<p.droplets.length;j++){
          const d = p.droplets[j];
          d.life += dt; if (d.life >= d.maxLife) continue;
          // integrate
          d.vy += g * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          // draw
          const a = Math.max(0, 1 - d.life/d.maxLife);
          const sz = Math.max(0.8, d.size) / scale;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(230,245,255,0.95)';
          ctx.beginPath(); ctx.arc(d.x, d.y, sz, 0, Math.PI*2); ctx.fill();
          ctx.restore();
          next.push(d);
        }
        p.droplets = next;
      }
      // Foam patch (lingers)
      p.foamLife += dt; const ft = Math.min(1, p.foamLife / p.foamMax);
      const foamR = (10 + 42*ft) / scale;
      const foamA = 0.35 * (1 - ft);
      ctx.save();
      ctx.globalAlpha = foamA;
      const fgrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, foamR);
      fgrad.addColorStop(0, 'rgba(235,245,250,0.85)');
      fgrad.addColorStop(1, 'rgba(235,245,250,0)');
      ctx.fillStyle = fgrad;
      ctx.beginPath(); ctx.arc(p.x, p.y, foamR, 0, Math.PI*2); ctx.fill();
      ctx.restore();

      // Retain splash until both ring and foam have finished
      if (t>=1 && ft>=1 && (!p.droplets || p.droplets.length===0)) { freeSplash(p); continue; }
      out.push(p);
    }
    splashes.active = out;
  }

  // --- Firing Solution Target Pin ---
  // Click the "Solution" button to enter placement mode; next canvas click pins a target
  // While placing, we hide the system cursor and draw a ghost crosshair that follows the mouse.
  // The pinned target is draggable; double-click near it deletes it.
  const firingSolution = { placing: false, target: null, hover: null, dragging: false, targetId: null };
  // Solution calculation timer state (for turret rotation + computation)
  const solutionCalc = { active: false, start: 0, duration: 0, btn: null, bar: null };
  // Per-fleet lightweight mirror to know when fleets 2/3 are "solved"
  window.FleetSolutionCalc = window.FleetSolutionCalc || { 1:{ active:false, start:0, duration:0 }, 2:{ active:false, start:0, duration:0 }, 3:{ active:false, start:0, duration:0 } };
  // Compute Targeting Systems percent based on current state (rangefinder & bridge can each reduce by up to 50%)
  function getTargetingPercent(){
    try {
      const st = window.shipState; const prof = st && st.profile; const hbs = prof && prof.damage && prof.damage.hitboxes || {};
      function hpP(key){
        const hb = hbs[key];
        if (!hb) return 1;
        if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) {
          return Math.max(0, Math.min(1, 1 - hb.damage_percent/100));
        }
        if (!hb.max_hp) return 1;
        const cur=(typeof hb.hp==='number'?hb.hp:hb.max_hp);
        return Math.max(0, Math.min(1, cur/hb.max_hp));
      }
      const rangefinderP = hpP('rangefinder');
      const bridgeP = hpP('bridge');
      const rfDamage = 1 - rangefinderP;
      const brDamage = 1 - bridgeP;
      const rfMult = 1 - 0.5 * rfDamage;
      const brMult = 1 - 0.5 * brDamage;
      const base = 1; // treat base as 100% then apply the two 50% sliders
      const targeting = Math.max(0, base * rfMult * brMult);
      return Math.round(targeting * 100);
    } catch { return 0; }
  }
  function computeSolutionDurationSec(){
    // Base 5s + 1s per 20% targeting damage
    const tp = getTargetingPercent();
    const dmg = Math.max(0, 100 - tp);
    return 5 + (dmg / 20) * 1; // adds 1 second per 20% damage
  }
  function ensureSolutionProgressBar(){
    try {
      const currentFleet = (window.IronTideSelectedFleet || 1);
      const btn = document.querySelector(`#navalDock .get-firing-solution-btn[data-fleet="${currentFleet}"]`) || document.querySelector('#navalDock .get-firing-solution-btn');
      if (!btn) return;
      let track = btn.querySelector('.solution-progress');
      if (!track) {
        track = document.createElement('div');
        track.className = 'solution-progress';
        const bar = document.createElement('div');
        bar.className = 'bar';
        track.appendChild(bar);
        btn.appendChild(track);
      }
      solutionCalc.btn = btn;
      solutionCalc.bar = track.querySelector('.bar');
    } catch {}
  }
  function startSolutionCalculation(){
    try {
      ensureSolutionProgressBar();
      solutionCalc.active = true;
      solutionCalc.start = performance.now();
      solutionCalc.duration = computeSolutionDurationSec() * 1000; // ms
      // Mirror to the selected fleet so fleets 2/3 can use solution-ready logic and UI
      try {
        const currentFleet = (window.IronTideSelectedFleet || 1);
        if (!window.FleetSolutionCalc) window.FleetSolutionCalc = { 1:{},2:{},3:{} };
        const sc = window.FleetSolutionCalc[currentFleet] || (window.FleetSolutionCalc[currentFleet] = {});
        sc.active = true; sc.start = solutionCalc.start; sc.duration = solutionCalc.duration;
      } catch {}
      if (solutionCalc.btn) {
        const track = solutionCalc.btn.querySelector('.solution-progress');
        if (track) track.style.display = 'block';
      }
      if (solutionCalc.bar) solutionCalc.bar.style.width = '0%';
    } catch {}
  }
  (function setupSolutionPlacement(){
    try {
      const solBtn = document.querySelector('.get-firing-solution-btn');
      if (solBtn) {
        solBtn.addEventListener('click', () => {
          firingSolution.placing = true;
          solBtn.classList.add('active');
          // Hide default cursor so our custom target pin stands in as the pointer
          try { canvas.style.cursor = 'none'; } catch {}
        });
      }
      // Helpers
      function getWorldFromEvent(e){
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        try { return screenToWorld(sx, sy); } catch { return { x: sx, y: sy }; }
      }
      function isNearTarget(wx, wy) {
        if (!firingSolution.target) return false;
        const vr = currentViewRect || getViewRect();
        const scale = vr.scale || 1;
        const hitPx = 16; // screen px radius
        const hitWorld = hitPx / scale;
        const dx = wx - firingSolution.target.x;
        const dy = wy - firingSolution.target.y;
        return Math.hypot(dx, dy) <= hitWorld;
      }

      // Mouse move: update ghost while placing, or drag target while dragging
      canvas.addEventListener('mousemove', (e) => {
        if (!gunnery.enabled) { try { canvas.style.cursor = ''; } catch {} return; }
        const w = getWorldFromEvent(e);
        if (firingSolution.placing) {
          firingSolution.hover = { x: w.x, y: w.y };
        } else if (firingSolution.dragging) {
          // Set target for current fleet only
          const currentFleet = window.IronTideSelectedFleet || 1;
          const fleetSettings = window.IronTideFleetSettings[currentFleet];
          
          if (fleetSettings) {
            if (!fleetSettings.firingSolution) {
              fleetSettings.firingSolution = {};
            }
            fleetSettings.firingSolution.target = { x: w.x, y: w.y };
            fleetSettings.firingSolution.targetId = null;
          }
          
          firingSolution.target = { x: w.x, y: w.y };
          // Manual drag clears any ship-target association
          try { firingSolution.targetId = null; } catch {}
          // Prevent any other handlers from interpreting this drag as movement input
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          else e.stopPropagation();
        }
        e.preventDefault();
      });

      // Mouse down: place if in placing mode, else start dragging if over target
      canvas.addEventListener('mousedown', (e) => {
        if (!gunnery.enabled) { try { canvas.style.cursor = ''; } catch {} return; }
        const w = getWorldFromEvent(e);
        if (firingSolution.placing) {
          // Set target for current fleet only
          const currentFleet = window.IronTideSelectedFleet || 1;
          const fleetSettings = window.IronTideFleetSettings[currentFleet];
          
          if (fleetSettings) {
            if (!fleetSettings.firingSolution) {
              fleetSettings.firingSolution = {};
            }
            fleetSettings.firingSolution.target = { x: w.x, y: w.y };
            fleetSettings.firingSolution.targetId = null;
          }
          
          firingSolution.target = { x: w.x, y: w.y };
          try { firingSolution.targetId = null; } catch {}
          firingSolution.placing = false;
          firingSolution.hover = null;
          if (solBtn) solBtn.classList.remove('active');
          try { canvas.style.cursor = ''; } catch {}
          // Begin solution calculation timer for new target
          startSolutionCalculation();
          // Do not let this click hit other canvas handlers (like pointerDown)
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          else e.stopPropagation();
          e.preventDefault();
        } else if (isNearTarget(w.x, w.y)) {
          firingSolution.dragging = true;
          // Optional: visual feedback for dragging
          try { canvas.style.cursor = 'grabbing'; } catch {}
          // Prevent general pointerDown from treating this as click-to-move
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          else e.stopPropagation();
          e.preventDefault();
        }
      });

      // Mouse up: end drag
      window.addEventListener('mouseup', () => {
        if (!gunnery.enabled) { try { canvas.style.cursor = ''; } catch {} return; }
        if (firingSolution.dragging) {
          firingSolution.dragging = false;
          try { canvas.style.cursor = ''; } catch {}
          // Target moved -> recompute solution time
          if (firingSolution.target) startSolutionCalculation();
        }
      });

      // Double-click: delete target if near
      canvas.addEventListener('dblclick', (e) => {
        if (!gunnery.enabled) { try { canvas.style.cursor = ''; } catch {} return; }
        const w = getWorldFromEvent(e);
        if (isNearTarget(w.x, w.y)) {
          // Clear target for current fleet only
          const currentFleet = window.IronTideSelectedFleet || 1;
          const fleetSettings = window.IronTideFleetSettings[currentFleet];
          
          if (fleetSettings && fleetSettings.firingSolution) {
            fleetSettings.firingSolution.target = null;
            fleetSettings.firingSolution.targetId = null;
          }
          
          firingSolution.target = null;
          firingSolution.hover = null;
          firingSolution.dragging = false;
          // Cancel any ongoing solution calculation and hide progress
          try {
            if (solutionCalc) {
              solutionCalc.active = false;
              if (solutionCalc.btn) {
                const track = solutionCalc.btn.querySelector('.solution-progress');
                if (track) track.style.display = 'none';
              }
            }
          } catch {}
          try { canvas.style.cursor = ''; } catch {}
          // Prevent general click/move handlers from acting on this
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          else e.stopPropagation();
          e.preventDefault();
        }
      });
    } catch {}
  })();
  
  // --- Global Audio Manager & Mute Toggle (brass button under wind widget) ---
  (function setupGlobalMute() {
    const STORAGE_KEY = 'ironTide.muted';
    const state = { muted: false };
    // Load persisted state
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved != null) state.muted = saved === 'true';
    } catch {}

    // Enforce mute on all current media and delegate to central audio manager
    function applyToAll() {
      try {
        const nodes = document.querySelectorAll('audio, video');
        nodes.forEach(m => { try { m.muted = state.muted; } catch {} });
      } catch {}
      try { if (window.IronTideAudio && typeof IronTideAudio.setMuted === 'function') IronTideAudio.setMuted(state.muted); } catch {}
    }

    // Hook media play to apply mute even for dynamically created media
    (function hookPlay() {
      const HMEP = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
      if (!HMEP || HMEP.__ironTidePlayHooked__) return;
      const origPlay = HMEP.play;
      HMEP.play = function() {
        try { this.muted = state.muted; } catch {}
        return origPlay.apply(this, arguments);
      };
      HMEP.__ironTidePlayHooked__ = true;
    })();
  

    function setMuted(m) {
      state.muted = !!m;
      try { localStorage.setItem(STORAGE_KEY, String(state.muted)); } catch {}
      applyToAll();
      updateButton();
    }

    function updateButton() {
      const btn = document.getElementById('muteToggle');
      if (!btn) return;
      btn.classList.toggle('muted', state.muted);
      btn.setAttribute('aria-pressed', String(state.muted));
      btn.textContent = state.muted ? 'ðŸ”‡' : 'ðŸ”Š';
      btn.title = state.muted ? 'Unmute all sound' : 'Mute all sound';
      btn.setAttribute('aria-label', btn.title);
    }

    function initButton() {
      const btn = document.getElementById('muteToggle');
      if (!btn) return;
      btn.addEventListener('click', () => setMuted(!state.muted));
      updateButton();
    }

    // Initialize once DOM is ready, but also try immediately in case element exists
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initButton();
      applyToAll();
      updateButton();
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        initButton(); applyToAll(); updateButton();
      });
    }
    // Expose a dedicated global mute helper without modifying IronTideAudio methods
    try {
      window.IronTideMute = {
        get muted(){ return state.muted; },
        setMuted,
        apply: applyToAll,
      };
    } catch {}
  })();
  
  // --- Ship Audio (Web Audio API) for gapless loop + speed-based volume ---
  const shipAudio = {
    inited: false,
    ctx: null,
    master: null,
    hp: null, // DC-blocking filter
    idleGain: null,
    engGain: null,
    idleBuf: null,
    engBuf: null,
    // Keep raw decoded buffers so we can rebuild loops without re-fetching
    rawIdleBuf: null,
    rawEngBuf: null,
    idleNode: null,
    engNode: null,
    idleVol: 0,
    engVol: 0,
    // Overlap amount (seconds) for the engine crossfaded loop; user-adjustable
    engOverlapSec: 0.6,
  };
  async function loadAudioBuffer(ctx, url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  }
  function createLoopingNode(ctx, buffer, dest, trimEndSec = 0) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Optional small trim; when using crossfaded buffer, keep full length
    if (trimEndSec > 0) {
      const dur = buffer.duration || 0;
      src.loopStart = 0;
      src.loopEnd = Math.max(0, dur - trimEndSec);
    }
    src.connect(dest);
    src.start(0);
    return src;
  }
  // Build a new AudioBuffer with a short crossfade from end->start for clickless looping
  function makeCrossfadedLoopBuffer(ctx, buffer, overlapSec = 0.04) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const rate = buffer.sampleRate;
    const overlapFrames = Math.max(1, Math.min(length >> 2, Math.floor(overlapSec * rate)));
    const out = ctx.createBuffer(channels, length, rate);
    for (let ch = 0; ch < channels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      // Copy full source first
      dst.set(src);
      // Overlap-add: blend last overlap with the head
      for (let i = 0; i < overlapFrames; i++) {
        const t = i / overlapFrames;           // 0..1 fade-in from head
        const head = src[i];                   // beginning sample
        const tailIdx = length - overlapFrames + i;
        const tail = dst[tailIdx];            // current tail sample (copy of src)
        const fadeOut = 1 - t;                // tail fades out
        const fadeIn = t;                     // head fades in
        dst[tailIdx] = tail * fadeOut + head * fadeIn;
      }
    }
    return out;
  }
  async function initShipAudio() {
    if (shipAudio.inited) return;
    shipAudio.inited = true;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      try { await ctx.resume(); } catch {}
      shipAudio.ctx = ctx;
      const master = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 20; // DC/rumble removal to reduce loop clicks
      const idleGain = ctx.createGain();
      const engGain = ctx.createGain();
      idleGain.gain.value = 0;
      engGain.gain.value = 0;
      // Graph: idle/engine -> hp -> master -> destination
      idleGain.connect(hp);
      engGain.connect(hp);
      hp.connect(master);
      master.connect(ctx.destination);
      shipAudio.master = master;
      shipAudio.hp = hp;
      shipAudio.idleGain = idleGain;
      shipAudio.engGain = engGain;

      // Set initial master gain according to current mute state
      try {
        const muted = !!(window.IronTideAudio && window.IronTideAudio.muted);
        shipAudio.master.gain.value = muted ? 0 : 1;
      } catch {}

      // Load buffers in parallel
      const [idleBufRaw, engBufRaw] = await Promise.all([
        loadAudioBuffer(ctx, 'assets/audio/shipatrest1.mp3'),
        loadAudioBuffer(ctx, 'assets/audio/engine1.mp3'),
      ]);
      // Retain raw buffers for rebuilds; build crossfaded versions for clickless looping
      shipAudio.rawIdleBuf = idleBufRaw;
      shipAudio.rawEngBuf  = engBufRaw;
      const idleBuf = makeCrossfadedLoopBuffer(ctx, idleBufRaw, 0.05);
      const engBuf  = makeCrossfadedLoopBuffer(ctx, engBufRaw,  shipAudio.engOverlapSec);
      shipAudio.idleBuf = idleBuf;
      shipAudio.engBuf = engBuf;
      // Create looping sources using full-length loop
      shipAudio.idleNode = createLoopingNode(ctx, idleBuf, idleGain, 0);
      shipAudio.engNode  = createLoopingNode(ctx, engBuf,  engGain,  0);
    } catch (e) {
      console.warn('Web Audio init failed; falling back to silent.', e);
    }
    // Draw Circle pins (two antipodal points)
    if (patterns.selected === 'circle' && patterns.circlePins && patterns.circlePins.length) {
      for (let i = 0; i < patterns.circlePins.length; i++) {
        const p = patterns.circlePins[i]; if (!p) continue;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#5a4f2e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
        const g = ctx.createRadialGradient(p.x, p.y - 18, 2, p.x, p.y - 18, 10);
        g.addColorStop(0, '#fff5cf'); g.addColorStop(1, '#a68f4a');
        ctx.fillStyle = g; ctx.strokeStyle = '#5a4f2e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y - 18, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a4f2e'; ctx.beginPath(); ctx.arc(p.x, p.y - 18, 2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // Allow adjusting only the engine loop overlap without changing any other dynamics
  // sec: number (seconds), small values like 0.03..0.08 recommended
  shipAudio.setEngineOverlap = function(sec) {
    const s = Number(sec);
    if (!isFinite(s) || s <= 0) return; // ignore invalid
    if (!shipAudio.inited || !shipAudio.ctx || !shipAudio.rawEngBuf || !shipAudio.engGain) {
      // Not ready yet; just remember the desired value for when init completes
      shipAudio.engOverlapSec = s;
      return;
    }
    // If unchanged within 1ms, skip
    if (Math.abs((shipAudio.engOverlapSec || 0) - s) < 0.001) return;
    shipAudio.engOverlapSec = s;
    try {
      // Rebuild only the engine loop buffer and node
      const newBuf = makeCrossfadedLoopBuffer(shipAudio.ctx, shipAudio.rawEngBuf, shipAudio.engOverlapSec);
      shipAudio.engBuf = newBuf;
      // Capture current gain to preserve level
      const currentGain = shipAudio.engGain.gain.value;
      // Stop and disconnect old node safely
      try { shipAudio.engNode && shipAudio.engNode.stop(0); } catch {}
      try { shipAudio.engNode && shipAudio.engNode.disconnect(); } catch {}
      // Create a fresh looping source and start immediately
      shipAudio.engNode = createLoopingNode(shipAudio.ctx, newBuf, shipAudio.engGain, 0);
      // Restore gain precisely
      try { shipAudio.engGain.gain.value = currentGain; } catch {}
    } catch (e) {
      console.warn('Failed to set engine overlap:', e);
    }
  };

  shipAudio.getEngineOverlap = function() {
    return shipAudio.engOverlapSec;
  };
  // Bridge into the existing global audio API if available
  try {
    window.IronTideAudio = window.IronTideAudio || {};
    window.IronTideAudio.setEngineOverlap = (sec) => shipAudio.setEngineOverlap(sec);
    window.IronTideAudio.getEngineOverlap = () => shipAudio.getEngineOverlap();
  } catch {}
  // Initialize audio on first user interaction per autoplay policies
  const __initAudioOnce = () => { initShipAudio(); window.removeEventListener('pointerdown', __initAudioOnce); window.removeEventListener('keydown', __initAudioOnce); };
  window.addEventListener('pointerdown', __initAudioOnce, { passive: true });
  window.addEventListener('keydown', __initAudioOnce);
  
  function clamp01(x){ return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function lerp(a,b,t){ return a + (b - a) * t; }
  function volumeSlewFactor(dt){
    // Convert dt to a smoothing factor ~10 Hz response
    const tau = 0.12; // seconds time constant
    const t = 1 - Math.exp(-Math.max(0, dt) / tau);
    return clamp01(t);
  }
  
  function updateShipAudio(dt, speedKts) {
    if (!shipAudio.inited || !shipAudio.ctx || !shipAudio.master) return;
    // Global mute integration
    const muted = !!(window.IronTideAudio && window.IronTideAudio.muted);
    const masterTarget = muted ? 0 : 1;
    const aM = volumeSlewFactor(dt);
    // Smooth master gain toward target
    const currentMaster = shipAudio.master.gain.value;
    shipAudio.master.gain.value = lerp(currentMaster, masterTarget, aM);

    const kts = Math.max(0, Math.abs(speedKts || 0));
    // Idle target: medium at 0 kts, fade out by ~3 kts
    const idleMax = 0.5;
    const idleT = clamp01(1 - (kts / 3));
    const idleTarget = idleMax * idleT;
    // Engine target: 0 below 1 kt, then ramp to 1.0 by 30 kts
    let engTarget = 0;
    if (kts >= 1) {
      const t = clamp01((kts - 1) / 29);
      engTarget = lerp(0.12, 1.0, t);
    }
    const a = volumeSlewFactor(dt);
    shipAudio.idleVol = lerp(shipAudio.idleVol, idleTarget, a);
    shipAudio.engVol  = lerp(shipAudio.engVol,  engTarget,  a);
    try { shipAudio.idleGain.gain.value = shipAudio.idleVol; } catch {}
    try { shipAudio.engGain.gain.value  = shipAudio.engVol; } catch {}
  }
  // Module-scope reference to the Pattern <select> for highlighting during placement
  let patternSelEl = null;
  // Pattern Options UI elements
  let patternOptionsEl = null;
  let zigAmpEl = null;
  let zigWaveEl = null;
  let zigLoopBtn = null;
  let zigResetBtn = null;
  let patternCloseBtn = null;
  // Box Patrol UI elements
  let boxOptionsEl = null;
  let boxCloseBtn = null;
  let boxLoopBtn = null;
  let boxDirCwBtn = null;
  let boxDirCcwBtn = null;
  // Circle UI elements
  let circleOptionsEl = null;
  let circleCloseBtn = null;
  let circleLoopBtn = null;
  let circleDirCwBtn = null;
  let circleDirCcwBtn = null;
  let circleResetBtn = null;
  // Free Draw UI elements
  let ovalDirCcwBtn = null;
  let ovalResetBtn = null;
  // Free Draw UI elements
  let freeDrawOptionsEl = null;
  let freeDrawCloseBtn = null;
  let freeDrawLoopBtn = null;
  let freeDrawDirCwBtn = null;
  let freeDrawDirCcwBtn = null;
  let freeDrawResetBtn = null;
  // Formation Options UI elements
  let formationSelEl = null;
  let formationOptionsEl = null;
  let formationCloseBtn = null;
  let formationTurnSeqBtn = null;
  let formationTurnTogetherBtn = null;
  let formationIntervalEl = null;
  let formationFormUpBtn = null;
  let formationAnchorBtn = null;
  let formationFormUpBtnEchelon = null;
  let echelonLeftBtn = null;
  let echelonRightBtn = null;
  let echelonDirRow = null;
  // Formation state
  let formationState = {
    turning: 'sequence', // 'sequence' | 'together'
    intervalMeters: 300,
    station: 'formup',   // 'formup' | 'anchor'
    echelonDir: 'left'   // 'left' | 'right' (only for Echelon UI)
  };
  // Runtime formation data per fleet (leader trail, per-ship anchor timers)
  window.FleetFormation = window.FleetFormation || { 1: { trail: [], lastRec:{x:0,y:0}, anchor: {} }, 2: { trail: [], lastRec:{x:0,y:0}, anchor: {} }, 3: { trail: [], lastRec:{x:0,y:0}, anchor: {} } };
  const TRAIL_MAX_POINTS = 3000;         // cap to avoid unbounded growth
  const TRAIL_SAMPLE_MIN_DIST = 6;       // record new point when leader moved this far (world px)
  const ANCHOR_WANDER_SECONDS = 3.0;     // wander for N seconds before stopping
  const ANCHOR_WANDER_KTS = 6;           // light drift speed during wander
  // Helper: current selected formation name (lowercase) - now fleet-aware
  function getSelectedFormationName(fleetId){
    try { 
      const fleet = fleetId || (window.IronTideSelectedFleet || 1);
      const settings = window.IronTideFleetSettings && window.IronTideFleetSettings[fleet];
      if (settings && settings.formation) {
        return String(settings.formation).toLowerCase();
      }
      // Fallback to global formation select if no fleet-specific setting
      const formationSelect = document.getElementById('formationSelect');
      return (formationSelect && formationSelect.value) ? String(formationSelect.value).toLowerCase() : ''; 
    } catch { return ''; }
  }
  // Helper: resolve ship handle by id -> { kind:'player'|'npc', id, ship, state, profile }
  function getShipHandleById(idStr){
    try {
      const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
      if (idStr === pid) return { kind: 'player', id: pid, ship: ship, state: shipState, profile: window.shipProfile };
      // Check IronTideFleet first (friendly ships)
      if (Array.isArray(window.IronTideFleet)) {
        for (let i=0;i<window.IronTideFleet.length;i++){
          const h = window.IronTideFleet[i];
          try {
            if (h && h.state && String(h.state.id) === idStr) return { kind: 'friendly', id: idStr, ship: h.state.ship, state: h.state, profile: h.profile };
          } catch {}
        }
      }
      // Check NPCs (enemy ships)
      if (Array.isArray(window.NPCs)) {
        for (let i=0;i<window.NPCs.length;i++){
          const n = window.NPCs[i];
          try {
            if (n && n.state && String(n.state.id) === idStr) return { kind: 'npc', id: idStr, ship: n.state.ship, state: n.state, profile: n.profile };
          } catch {}
        }
      } else if (window.npc1 && window.npc1.state && String(window.npc1.state.id) === idStr) {
        return { kind: 'npc', id: idStr, ship: window.npc1.state.ship, state: window.npc1.state, profile: window.npc1.profile };
      }
    } catch {}
    return null;
  }
  // Helper: members of a fleet (ids as strings). Use stored order if available.
  function getFleetMembers(fleetId){
    const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
    const ids = new Set();
    try {
      const set = fa[fleetId];
      if (set && set instanceof Set) set.forEach(v => ids.add(String(v)));
    } catch {}
    // Check if we have a custom order stored in fleet settings
    try {
      const settings = window.IronTideFleetSettings && window.IronTideFleetSettings[fleetId];
      if (settings && Array.isArray(settings.shipOrder) && settings.shipOrder.length > 0) {
        // Filter to only IDs that are actually in the fleet
        const ordered = settings.shipOrder.filter(id => ids.has(String(id)));
        // Add any new ships not in the order list at the end
        ids.forEach(id => { if (!ordered.includes(String(id))) ordered.push(String(id)); });
        return ordered;
      }
    } catch {}
    // Fallback: sorted array by numeric id then lexicographic
    const arr = Array.from(ids);
    arr.sort((a,b)=>{
      const na = Number(a), nb = Number(b);
      if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
    return arr;
  }
  // Helper: choose a leader id for a fleet. Always use the first ship assigned to that fleet.
  function getFleetLeaderId(fleetId){
    const mem = getFleetMembers(fleetId);
    return mem.length ? mem[0] : null;
  }
  
  // Formation guidance for Echelon (diagonal / or \ formation)
  function updateFormationEchelon(dt, fleetId){
    try {
      const selFleet = fleetId || (window.IronTideSelectedFleet || 1);
      const leaderId = getFleetLeaderId(selFleet); 
      if (!leaderId) return;
      const leader = getShipHandleById(leaderId); 
      if (!leader || !leader.ship) return;
      const ff = (window.FleetFormation[selFleet] = window.FleetFormation[selFleet] || { trail: [], lastRec:{x:0,y:0}, anchor:{} });
      recordLeaderPoint(ff, leader.ship.x, leader.ship.y);
      const members = getFleetMembers(selFleet).map(id => getShipHandleById(id)).filter(h => !!(h && h.ship));
      if (!members.length) return;
      const followers = members.filter(h => h.id !== leaderId);
      const fleetSettings = (window.IronTideFleetSettings && window.IronTideFleetSettings[selFleet]) || {};
      const interval = Math.max(30, Number(fleetSettings.formationInterval) || Number(formationState.intervalMeters) || 180);
      const together = (fleetSettings.formationTurning === 'together') || (formationState.turning === 'together');
      const formUp = (fleetSettings.formationStation === 'formup') || (formationState.station === 'formup');
      console.log(`ECHELON: formUp=${formUp}, fleetSettings.formationStation=${fleetSettings.formationStation}, formationState.station=${formationState.station}`);
      const dir = (fleetSettings.echelonDirection || formationState.echelonDir || 'left');
      const angleDeg = Number(fleetSettings.formationAngleDeg) || 30;
      const anchorMap = (ff.anchor = ff.anchor || {});
      for (let i=0;i<followers.length;i++){
        const rank = i + 1;
        const h = followers[i]; const s = h.ship; const st = h.state;
        console.log(`ECHELON: Processing follower ${i}, id=${h.id}`);
        if (!s || !st) { console.log(`ECHELON: No ship or state`); continue; }
        const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        const shipInThisFleet = fa[selFleet] && fa[selFleet].has(String(h.id));
        console.log(`ECHELON: shipInThisFleet=${shipInThisFleet} for ship ${h.id}`);
        if (!shipInThisFleet && !(selFleet === 1 && h.id === String((window.shipState && window.shipState.id) || '1'))) {
          console.log(`ECHELON: Skipping ship ${h.id} - not in fleet`);
          continue;
        }
        console.log(`ECHELON: Ship ${h.id} passed checks, setting heading/speed`);
        if (typeof st.speedKts !== 'number') st.speedKts = 10;
        if (typeof st.actualSpeedKts !== 'number') st.actualSpeedKts = 0;
        if (typeof s.speed !== 'number') s.speed = ship.speed;
        if (typeof s.heading !== 'number') s.heading = 0;
        if (typeof s.desiredHeading !== 'number') s.desiredHeading = s.heading;
        const aid = h.id;
        anchorMap[aid] = anchorMap[aid] || { t: 0, wanderDeg: Math.random()*360 };
        if (!formUp) {
          // When not in formup mode, ships drift/wander
          const an = anchorMap[aid];
          an.t = Math.min(ANCHOR_WANDER_SECONDS + 0.5, an.t + dt);
          const wander = an.t < ANCHOR_WANDER_SECONDS;
          st.speedKts = wander ? ANCHOR_WANDER_KTS : 0;
          if (wander) {
            s.desiredHeading = an.wanderDeg;
          }
          continue; // Skip formation positioning when not forming up
        } else {
          anchorMap[aid].t = 0;
        }
        let target = null;
        if (together) {
          const hr = (leader.ship.heading || 0) * Math.PI/180;
          const back = rank * interval;
          const dx = -Math.sin(hr) * back;
          const dy = Math.cos(hr) * back;
          const perpAngle = (dir === 'left') ? (leader.ship.heading - 90) : (leader.ship.heading + 90);
          const perpRad = perpAngle * Math.PI/180;
          const perpDist = back * Math.tan(angleDeg * Math.PI/180);
          const perpX = Math.sin(perpRad) * perpDist;
          const perpY = -Math.cos(perpRad) * perpDist;
          target = { x: leader.ship.x + dx + perpX, y: leader.ship.y + dy + perpY };
          s.heading = leader.ship.heading || 0;
          s.desiredHeading = s.heading;
        } else {
          const baseTarget = trailPointBack(ff, rank * interval) || { x: leader.ship.x, y: leader.ship.y };
          const perpAngle = (dir === 'left') ? (leader.ship.heading - 90) : (leader.ship.heading + 90);
          const perpRad = perpAngle * Math.PI/180;
          const perpDist = (rank * interval) * Math.tan(angleDeg * Math.PI/180);
          const perpX = Math.sin(perpRad) * perpDist;
          const perpY = -Math.cos(perpRad) * perpDist;
          target = { x: baseTarget.x + perpX, y: baseTarget.y + perpY };
        }
        const dx = target.x - s.x; const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (!together) {
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          s.desiredHeading = desired;
          st.desiredHeading = desired; // CRITICAL: Also set on state for NPC movement system!
          if (window.VerboseLogs) console.log(`ECHELON: Set desiredHeading=${desired.toFixed(1)} for ship ${h.id}`);
        } else {
          st.desiredHeading = s.desiredHeading; // Copy heading to state
        }
        const leaderKts = (leader.state && typeof leader.state.actualSpeedKts === 'number') ? Math.abs(leader.state.actualSpeedKts) : 12;
        const followerCap = (st && st.effects && typeof st.effects.speedCapKts === 'number')
          ? Math.max(0, st.effects.speedCapKts)
          : (h.profile && h.profile.propulsion && typeof h.profile.propulsion.max_speed_knots === 'number'
            ? h.profile.propulsion.max_speed_knots
            : 30);
        // Improved speed logic: detect ahead/behind and avoid circling
        const fallInBuffer = Math.max(10, interval * 0.15);
        let targetKts;
        
        // Calculate if ship is ahead or behind station along leader's heading
        const leaderHeadingRad = (leader.ship.heading || 0) * Math.PI / 180;
        const toShipX = s.x - leader.ship.x;
        const toShipY = s.y - leader.ship.y;
        const alongLeaderHeading = toShipX * Math.sin(leaderHeadingRad) - toShipY * Math.cos(leaderHeadingRad);
        const expectedDistance = rank * interval;
        const isAhead = Math.abs(alongLeaderHeading) < expectedDistance * 0.5; // if much closer than expected, ship is ahead
        
        if (dist > (interval + fallInBuffer)) {
          // Far behind - use full speed to catch up
          targetKts = followerCap;
        } else if (isAhead && dist < interval) {
          // Ahead of station - slow down MORE than leader to fall back in
          targetKts = Math.max(0, Math.min(followerCap, leaderKts * 0.7));
        } else {
          // Near station - match leader speed
          targetKts = Math.min(followerCap, leaderKts);
        }
        // Set target speed - let NPC movement system handle the actual movement
        st.speedKts = targetKts;
        if (window.VerboseLogs) console.log(`ECHELON: Set speedKts=${targetKts.toFixed(1)} for ship ${h.id}`);
      }
    } catch {}
  }
  
  // Formation guidance for Line Abreast (side by side perpendicular to leader heading)
  function updateFormationLineAbreast(dt, fleetId){
    try {
      const selFleet = fleetId || (window.IronTideSelectedFleet || 1);
      const leaderId = getFleetLeaderId(selFleet); if (!leaderId) return;
      const leader = getShipHandleById(leaderId); if (!leader || !leader.ship) return;
      const ff = (window.FleetFormation[selFleet] = window.FleetFormation[selFleet] || { trail: [], lastRec:{x:0,y:0}, anchor:{} });
      recordLeaderPoint(ff, leader.ship.x, leader.ship.y);
      const members = getFleetMembers(selFleet).map(id => getShipHandleById(id)).filter(h => !!(h && h.ship));
      if (!members.length) return;
      const followers = members.filter(h => h.id !== leaderId);
      const fleetSettings = (window.IronTideFleetSettings && window.IronTideFleetSettings[selFleet]) || {};
      const interval = Math.max(30, Number(fleetSettings.formationInterval) || Number(formationState.intervalMeters) || 180);
      const together = (fleetSettings.formationTurning === 'together') || (formationState.turning === 'together');
      const formUp = (fleetSettings.formationStation === 'formup') || (formationState.station === 'formup');
      const anchorMap = (ff.anchor = ff.anchor || {});
      for (let i=0;i<followers.length;i++){
        const rank = i + 1;
        const side = (i % 2 === 0) ? 'left' : 'right';
        const lateralDist = Math.ceil((rank+1)/2) * interval;
        const h = followers[i]; const s = h.ship; const st = h.state; if (!s || !st) continue;
        const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        const shipInThisFleet = fa[selFleet] && fa[selFleet].has(String(h.id));
        if (!shipInThisFleet && !(selFleet === 1 && h.id === String((window.shipState && window.shipState.id) || '1'))) continue;
        if (typeof st.speedKts !== 'number') st.speedKts = 10;
        if (typeof st.actualSpeedKts !== 'number') st.actualSpeedKts = 0;
        if (typeof s.speed !== 'number') s.speed = ship.speed;
        if (typeof s.heading !== 'number') s.heading = 0;
        if (typeof s.desiredHeading !== 'number') s.desiredHeading = s.heading;
        const aid = h.id;
        anchorMap[aid] = anchorMap[aid] || { t: 0, wanderDeg: Math.random()*360 };
        if (!formUp) {
          const an = anchorMap[aid];
          an.t = Math.min(ANCHOR_WANDER_SECONDS + 0.5, an.t + dt);
          const wander = an.t < ANCHOR_WANDER_SECONDS;
          const ktsTarget = wander ? ANCHOR_WANDER_KTS : 0;
          const accel = 2;
          const diff = ktsTarget - st.actualSpeedKts;
          const step = Math.max(-accel*dt, Math.min(accel*dt, diff));
          st.actualSpeedKts += step;
          if (wander) { s.desiredHeading = an.wanderDeg; }
          const maxTurnRate = 25;
          const cur = angleNorm360(s.heading), tgt = angleNorm360(s.desiredHeading);
          const cw = (tgt - cur + 360) % 360; const ccw = (cur - tgt + 360) % 360;
          s.heading = (cw <= ccw ? angleNorm360(cur + Math.min(maxTurnRate*dt, cw)) : angleNorm360(cur - Math.min(maxTurnRate*dt, ccw)));
          const ktsAbs = Math.abs(st.actualSpeedKts);
          const kEff = (ktsAbs >= 5) ? ktsAbs : (ktsAbs/5)*(ktsAbs/5)*5;
          const spd = s.speed * (kEff/15);
          const rad = s.heading * Math.PI/180;
          const vx = Math.sin(rad) * spd * dt; const vy = -Math.cos(rad) * spd * dt;
          const nx = s.x + vx, ny = s.y + vy;
          if (!collidesAt(nx, s.y)) s.x = nx;
          if (!collidesAt(s.x, ny)) s.y = ny;
          continue;
        } else {
          anchorMap[aid].t = 0;
        }
        let target = null;
        if (together) {
          const hr = (leader.ship.heading || 0) * Math.PI/180;
          const perpAngle = (leader.ship.heading + 90) * Math.PI/180;
          const perpDist = (side === 'left') ? -lateralDist : lateralDist;
          const dx = Math.sin(perpAngle) * perpDist;
          const dy = -Math.cos(perpAngle) * perpDist;
          target = { x: leader.ship.x + dx, y: leader.ship.y + dy };
          s.heading = leader.ship.heading || 0;
          s.desiredHeading = s.heading;
        } else {
          const trailPos = trailPointBack(ff, 0) || { x: leader.ship.x, y: leader.ship.y };
          const perpAngle = (leader.ship.heading + 90) * Math.PI/180;
          const perpDist = (side === 'left') ? -lateralDist : lateralDist;
          const dx = Math.sin(perpAngle) * perpDist;
          const dy = -Math.cos(perpAngle) * perpDist;
          target = { x: trailPos.x + dx, y: trailPos.y + dy };
        }
        const dx = target.x - s.x; const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (!together) {
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          s.desiredHeading = desired;
        }
        const leaderKts = (leader.state && typeof leader.state.actualSpeedKts === 'number') ? Math.abs(leader.state.actualSpeedKts) : 12;
        const followerCap = (st && st.effects && typeof st.effects.speedCapKts === 'number')
          ? Math.max(0, st.effects.speedCapKts)
          : (h.profile && h.profile.propulsion && typeof h.profile.propulsion.max_speed_knots === 'number' ? h.profile.propulsion.max_speed_knots : 30);
        // Improved speed logic: detect ahead/behind and avoid circling
        const fallInBuffer = Math.max(10, interval * 0.15);
        let targetKts;
        
        // Calculate if ship is ahead or behind station
        const toTargetX = target.x - s.x;
        const toTargetY = target.y - s.y;
        const toLeaderX = s.x - leader.ship.x;
        const toLeaderY = s.y - leader.ship.y;
        const distToLeader = Math.hypot(toLeaderX, toLeaderY);
        const isAhead = distToLeader < (rank * interval * 0.7); // if much closer to leader than expected
        
        if (dist > (interval + fallInBuffer)) {
          // Far behind - use full speed to catch up
          targetKts = followerCap;
        } else if (isAhead && dist < interval) {
          // Ahead of station - slow down MORE than leader to fall back in
          targetKts = Math.max(0, Math.min(followerCap, leaderKts * 0.7));
        } else {
          // Near station - match leader speed
          targetKts = Math.min(followerCap, leaderKts);
        }
        const accel = 2.0;
        const diff = targetKts - st.actualSpeedKts;
        const step = Math.max(-accel*dt, Math.min(accel*dt, diff));
        st.actualSpeedKts += step;
        const maxTurnRate = 25;
        const cur = angleNorm360(s.heading), tgt = angleNorm360(s.desiredHeading);
        const cw = (tgt - cur + 360) % 360; const ccw = (cur - tgt + 360) % 360;
        s.heading = (cw <= ccw ? angleNorm360(cur + Math.min(maxTurnRate*dt, cw)) : angleNorm360(cur - Math.min(maxTurnRate*dt, ccw)));
        const ktsAbs = Math.abs(st.actualSpeedKts);
        const kEff = (ktsAbs >= 5) ? ktsAbs : (ktsAbs/5)*(ktsAbs/5)*5;
        const spd = s.speed * (kEff/15);
        const rad = s.heading * Math.PI/180;
        const vx = Math.sin(rad) * spd * dt; const vy = -Math.cos(rad) * spd * dt;
        const nx = s.x + vx, ny = s.y + vy;
        if (!collidesAt(nx, s.y)) s.x = nx;
        if (!collidesAt(s.x, ny)) s.y = ny;
      }
    } catch {}
  }
  
  // Formation guidance for Wedge (V shape /\ with adjustable angle)
  function updateFormationWedge(dt, fleetId){
    try {
      const selFleet = fleetId || (window.IronTideSelectedFleet || 1);
      const leaderId = getFleetLeaderId(selFleet); 
      if (!leaderId) return;
      const leader = getShipHandleById(leaderId); 
      if (!leader || !leader.ship) return;
      const ff = (window.FleetFormation[selFleet] = window.FleetFormation[selFleet] || { trail: [], lastRec:{x:0,y:0}, anchor:{} });
      recordLeaderPoint(ff, leader.ship.x, leader.ship.y);
      const members = getFleetMembers(selFleet).map(id => getShipHandleById(id)).filter(h => !!(h && h.ship));
      if (!members.length) return;
      const followers = members.filter(h => h.id !== leaderId);
      const fleetSettings = (window.IronTideFleetSettings && window.IronTideFleetSettings[selFleet]) || {};
      const interval = Math.max(30, Number(fleetSettings.formationInterval) || Number(formationState.intervalMeters) || 120);
      const together = (fleetSettings.formationTurning === 'together') || (formationState.turning === 'together');
      const formUp = (fleetSettings.formationStation === 'formup') || (formationState.station === 'formup');
      const angleDeg = Math.max(30, Math.min(75, Number(fleetSettings.formationAngleDeg) || 30));
      const anchorMap = (ff.anchor = ff.anchor || {});
      for (let i=0;i<followers.length;i++){
        const idx = i;
        const flankRank = Math.floor(idx/2) + 1;
        const side = (idx % 2 === 0) ? 'left' : 'right';
        const h = followers[i]; const s = h.ship; const st = h.state;
        if (!s || !st) continue;
        const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        const shipInThisFleet = fa[selFleet] && fa[selFleet].has(String(h.id));
        if (!shipInThisFleet && !(selFleet === 1 && h.id === String((window.shipState && window.shipState.id) || '1'))) {
          continue;
        }
        if (typeof st.speedKts !== 'number') st.speedKts = 10;
        if (typeof st.actualSpeedKts !== 'number') st.actualSpeedKts = 0;
        if (typeof s.speed !== 'number') s.speed = ship.speed;
        if (typeof s.heading !== 'number') s.heading = 0;
        if (typeof s.desiredHeading !== 'number') s.desiredHeading = s.heading;
        const aid = h.id;
        anchorMap[aid] = anchorMap[aid] || { t: 0, wanderDeg: Math.random()*360 };
        if (!formUp) {
          // When not in formup mode, ships drift/wander
          const an = anchorMap[aid];
          an.t = Math.min(ANCHOR_WANDER_SECONDS + 0.5, an.t + dt);
          const wander = an.t < ANCHOR_WANDER_SECONDS;
          st.speedKts = wander ? ANCHOR_WANDER_KTS : 0;
          if (wander) {
            s.desiredHeading = an.wanderDeg;
          }
          continue; // Skip formation positioning when not forming up
        } else {
          anchorMap[aid].t = 0;
        }
        let target = null;
        if (together) {
          const hr = (leader.ship.heading || 0) * Math.PI/180;
          const back = flankRank * interval;
          const dx = -Math.sin(hr) * back;
          const dy = Math.cos(hr) * back;
          const angleOffset = (side === 'left') ? -angleDeg : angleDeg;
          const wedgeAngle = (leader.ship.heading + angleOffset) * Math.PI/180;
          const perpDist = back * Math.tan(angleDeg * Math.PI/180);
          const perpX = Math.sin(wedgeAngle) * perpDist;
          const perpY = -Math.cos(wedgeAngle) * perpDist;
          target = { x: leader.ship.x + dx + perpX, y: leader.ship.y + dy + perpY };
          s.heading = leader.ship.heading || 0;
          s.desiredHeading = s.heading;
        } else {
          const baseTarget = trailPointBack(ff, flankRank * interval) || { x: leader.ship.x, y: leader.ship.y };
          const angleOffset = (side === 'left') ? -angleDeg : angleDeg;
          const wedgeAngle = (leader.ship.heading + angleOffset) * Math.PI/180;
          const perpDist = (flankRank * interval) * Math.tan(angleDeg * Math.PI/180);
          const perpX = Math.sin(wedgeAngle) * perpDist;
          const perpY = -Math.cos(wedgeAngle) * perpDist;
          target = { x: baseTarget.x + perpX, y: baseTarget.y + perpY };
        }
        const dx = target.x - s.x; const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (!together) {
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          s.desiredHeading = desired;
          st.desiredHeading = desired; // CRITICAL: Also set on state for NPC movement system!
        } else {
          st.desiredHeading = s.desiredHeading; // Copy heading to state
        }
        const leaderKts = (leader.state && typeof leader.state.actualSpeedKts === 'number') ? Math.abs(leader.state.actualSpeedKts) : 12;
        const followerCap = (st && st.effects && typeof st.effects.speedCapKts === 'number')
          ? Math.max(0, st.effects.speedCapKts)
          : (h.profile && h.profile.propulsion && typeof h.profile.propulsion.max_speed_knots === 'number'
            ? h.profile.propulsion.max_speed_knots
            : 30);
        // Improved speed logic: detect ahead/behind and avoid circling
        const fallInBuffer = Math.max(10, interval * 0.15);
        let targetKts;
        
        // Calculate if ship is ahead or behind station along leader's track
        const leaderHeadingRad = (leader.ship.heading || 0) * Math.PI / 180;
        const toShipX = s.x - leader.ship.x;
        const toShipY = s.y - leader.ship.y;
        const alongLeaderHeading = toShipX * Math.sin(leaderHeadingRad) - toShipY * Math.cos(leaderHeadingRad);
        const expectedDistance = flankRank * interval;
        const isAhead = Math.abs(alongLeaderHeading) < expectedDistance * 0.5;
        
        if (dist > (interval + fallInBuffer)) {
          // Far behind - use full speed to catch up
          targetKts = followerCap;
        } else if (isAhead && dist < interval) {
          // Ahead of station - slow down MORE than leader to fall back in
          targetKts = Math.max(0, Math.min(followerCap, leaderKts * 0.7));
        } else {
          // Near station - match leader speed
          targetKts = Math.min(followerCap, leaderKts);
        }
        // Set target speed - let NPC movement system handle the actual movement
        st.speedKts = targetKts;
      }
    } catch {}
  }
  
  // Helper: get which fleet a ship belongs to
  function getFleetIdForShip(shipId) {
    try {
      const fleetAssignments = window.IronTideFleetAssignments || {};
      const shipIdStr = String(shipId);
      for (let fleetId = 1; fleetId <= 3; fleetId++) {
        if (fleetAssignments[fleetId] && fleetAssignments[fleetId].has(shipIdStr)) {
          return fleetId;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  
  // Helper: get the fleet leader ship object
  function getFleetLeader(fleetId) {
    try {
      const fleetAssignments = window.IronTideFleetAssignments || {};
      if (!fleetAssignments[fleetId]) return null;
      
      // Check if player is in this fleet and return player as leader
      const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
      if (fleetAssignments[fleetId].has(playerId)) {
        return {
          state: window.shipState,
          profile: window.shipProfile,
          isPlayer: true
        };
      }
      
      // Otherwise find first NPC in this fleet
      if (Array.isArray(window.IronTideFleet)) {
        for (let ship of window.IronTideFleet) {
          if (ship && ship.state) {
            const shipId = String(ship.state.id);
            if (fleetAssignments[fleetId].has(shipId)) {
              return ship;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting fleet leader:', error);
      return null;
    }
  }
  
  // Helper: add a point to trail if moved enough
  function recordLeaderPoint(ffleet, x, y){
    try {
      const t = ffleet.trail; const last = ffleet.lastRec;
      if (!t.length) { t.push({ x, y }); ffleet.lastRec = { x, y }; return; }
      const dx = x - last.x, dy = y - last.y;
      if (Math.hypot(dx, dy) >= TRAIL_SAMPLE_MIN_DIST) {
        t.push({ x, y }); ffleet.lastRec = { x, y };
        if (t.length > TRAIL_MAX_POINTS) t.splice(0, t.length - TRAIL_MAX_POINTS);
      }
    } catch {}
  }
  // Helper: pick a point on the leader trail at a given distance back from the most recent point
  function trailPointBack(ffleet, distBack){
    try {
      const t = ffleet.trail; if (!t || t.length === 0) return null;
      let remaining = Math.max(0, distBack);
      for (let i = t.length - 1; i > 0; i--) {
        const a = t[i], b = t[i-1];
        const seg = Math.hypot(a.x - b.x, a.y - b.y);
        if (seg >= remaining) {
          const ratio = remaining / seg;
          return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
        } else {
          remaining -= seg;
        }
      }
      // Fallback to start of trail
      return t[0];
    } catch { return null; }
  }
  // Formation guidance for Line Ahead
  function updateFormationLineAhead(dt, fleetId){
    try {
      const selFleet = fleetId || (window.IronTideSelectedFleet || 1);
      const leaderId = getFleetLeaderId(selFleet); if (!leaderId) return;
      const leader = getShipHandleById(leaderId); if (!leader || !leader.ship) return;
      const ff = (window.FleetFormation[selFleet] = window.FleetFormation[selFleet] || { trail: [], lastRec:{x:0,y:0}, anchor:{} });
      // Record leader breadcrumb
      recordLeaderPoint(ff, leader.ship.x, leader.ship.y);
      // Build ordered members, with leader first
      const members = getFleetMembers(selFleet)
        .map(id => getShipHandleById(id))
        .filter(h => !!(h && h.ship));
      if (!members.length) return;
      // Compute followers (exclude leader)
      const followers = members.filter(h => h.id !== leaderId);
      // Get fleet-specific formation settings
      const fleetSettings = (window.IronTideFleetSettings && window.IronTideFleetSettings[selFleet]) || {};
      // Interval spacing
      const interval = Math.max(30, Number(fleetSettings.formationInterval) || Number(formationState.intervalMeters) || 180);
      const together = (fleetSettings.formationTurning === 'together') || (formationState.turning === 'together');
      const formUp = (fleetSettings.formationStation === 'formup') || (formationState.station === 'formup');
      const anchorMap = (ff.anchor = ff.anchor || {});
      // For each follower, determine target point and steer toward it respecting basic kinematics
      for (let i=0;i<followers.length;i++){
        const rank = i + 1;
        const h = followers[i]; const s = h.ship; const st = h.state; if (!s || !st) continue;
        
        // Double-check this ship actually belongs to this fleet
        const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        const shipInThisFleet = fa[selFleet] && fa[selFleet].has(String(h.id));
        if (!shipInThisFleet && !(selFleet === 1 && h.id === String((window.shipState && window.shipState.id) || '1'))) {
          continue; // Skip ships not in this fleet
        }
        // Ensure NPC has minimal motion state
        if (typeof st.speedKts !== 'number') st.speedKts = 10;
        if (typeof st.actualSpeedKts !== 'number') st.actualSpeedKts = 0;
        if (typeof s.speed !== 'number') s.speed = ship.speed; // reuse player's base speed scaling
        if (typeof s.heading !== 'number') s.heading = 0;
        if (typeof s.desiredHeading !== 'number') s.desiredHeading = s.heading;
        // Anchor behavior
        const aid = h.id;
        anchorMap[aid] = anchorMap[aid] || { t: 0, wanderDeg: Math.random()*360 };
        if (!formUp) {
          // At anchor: brief wander then stop - let NPC movement system handle actual movement
          const an = anchorMap[aid];
          an.t = Math.min(ANCHOR_WANDER_SECONDS + 0.5, an.t + dt);
          const wander = an.t < ANCHOR_WANDER_SECONDS;
          st.speedKts = wander ? ANCHOR_WANDER_KTS : 0;
          if (wander) {
            s.desiredHeading = an.wanderDeg;
            st.desiredHeading = an.wanderDeg;
          }
          continue; // Skip formation positioning when not forming up
        } else {
          // Reset anchor timer when forming up
          anchorMap[aid].t = 0;
        }
        // Determine target point and heading behavior
        let target = null;
        if (together) {
          // Turn Together: All ships turn instantly and exactly the same amount as the leader
          // Position directly behind leader by rank * interval
          const hr = (leader.ship.heading || 0) * Math.PI/180;
          const back = rank * interval;
          const dx = -Math.sin(hr) * back;
          const dy = Math.cos(hr) * back;
          target = { x: leader.ship.x + dx, y: leader.ship.y + dy };
          // Match leader's heading instantly for synchronized turning
          s.heading = leader.ship.heading || 0;
          s.desiredHeading = s.heading;
        } else {
          // Turn in Sequence: Follow like a snake, turn when reaching the point where leader turned
          target = trailPointBack(ff, rank * interval) || { x: leader.ship.x, y: leader.ship.y };
        }
        // Steer toward target: set desiredHeading and speed target (only for Turn in Sequence mode - Turn Together sets heading above)
        const dx = target.x - s.x; const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (!together) {
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          s.desiredHeading = desired;
          st.desiredHeading = desired; // CRITICAL: Also set on state for NPC movement system!
        } else {
          st.desiredHeading = s.desiredHeading; // Copy heading to state for Turn Together
        }
        // Speed plan:
        // - If behind more than interval + buffer, go full available speed to fall in
        // - Once within buffer of the interval, slow to match leader's speed
        const leaderKts = (leader.state && typeof leader.state.actualSpeedKts === 'number') ? Math.abs(leader.state.actualSpeedKts) : 12;
        const followerCap = (st && st.effects && typeof st.effects.speedCapKts === 'number')
          ? Math.max(0, st.effects.speedCapKts)
          : (h.profile && h.profile.propulsion && typeof h.profile.propulsion.max_speed_knots === 'number'
            ? h.profile.propulsion.max_speed_knots
            : 30);
        // Improved speed logic: detect ahead/behind and avoid circling
        const fallInBuffer = Math.max(10, interval * 0.15);
        let targetKts;
        
        // Calculate if ship is ahead or behind station by checking distance from target vs expected
        // For Line Ahead, check position along the trail
        const toTargetX = target.x - s.x;
        const toTargetY = target.y - s.y;
        const targetHeading = Math.atan2(toTargetX, -toTargetY);
        const leaderHeadingRad = (leader.ship.heading || 0) * Math.PI / 180;
        const headingDiff = Math.abs(targetHeading - leaderHeadingRad);
        // If heading to target is opposite to leader heading, ship is ahead
        const isAhead = headingDiff > Math.PI / 2 && dist < interval;
        
        if (dist > (interval + fallInBuffer)) {
          // Far behind - use full speed to catch up
          targetKts = followerCap;
        } else if (isAhead) {
          // Ahead of station - slow down MORE than leader to fall back in
          targetKts = Math.max(0, Math.min(followerCap, leaderKts * 0.6));
        } else {
          // Near station - match leader speed
          targetKts = Math.min(followerCap, leaderKts);
        }
        // Set target speed - let NPC movement system handle the actual movement
        st.speedKts = targetKts;
      }
    } catch {}
  }
  
  // Formation guidance for Double Line Ahead - two parallel lines
  function updateFormationDoubleLineAhead(dt, fleetId){
    try {
      const selFleet = fleetId || (window.IronTideSelectedFleet || 1);
      const leaderId = getFleetLeaderId(selFleet); if (!leaderId) return;
      const leader = getShipHandleById(leaderId); if (!leader || !leader.ship) return;
      const ff = (window.FleetFormation[selFleet] = window.FleetFormation[selFleet] || { trail: [], lastRec:{x:0,y:0}, anchor:{} });
      // Record leader breadcrumb
      recordLeaderPoint(ff, leader.ship.x, leader.ship.y);
      // Build ordered members, with leader first
      const members = getFleetMembers(selFleet)
        .map(id => getShipHandleById(id))
        .filter(h => !!(h && h.ship));
      if (!members.length) return;
      // Compute followers (exclude leader)
      const followers = members.filter(h => h.id !== leaderId);
      // Get fleet-specific formation settings
      const fleetSettings = (window.IronTideFleetSettings && window.IronTideFleetSettings[selFleet]) || {};
      // Interval spacing (along the line) and width (between the two lines)
      const interval = Math.max(30, Number(fleetSettings.formationInterval) || Number(formationState.intervalMeters) || 180);
      const width = Math.max(50, Number(fleetSettings.formationWidth) || 200);
      const together = (fleetSettings.formationTurning === 'together') || (formationState.turning === 'together');
      const formUp = (fleetSettings.formationStation === 'formup') || (formationState.station === 'formup');
      const anchorMap = (ff.anchor = ff.anchor || {});
      
      // Formation layout: Leader is on starboard line at rank 0
      // Followers alternate: 1st=port/rank0, 2nd=starboard/rank1, 3rd=port/rank1, 4th=starboard/rank2, etc.
      for (let i=0;i<followers.length;i++){
        const h = followers[i]; const s = h.ship; const st = h.state; if (!s || !st) continue;
        
        // Double-check this ship actually belongs to this fleet
        const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        const shipInThisFleet = fa[selFleet] && fa[selFleet].has(String(h.id));
        if (!shipInThisFleet && !(selFleet === 1 && h.id === String((window.shipState && window.shipState.id) || '1'))) {
          continue; // Skip ships not in this fleet
        }
        
        // Ensure NPC has minimal motion state
        if (typeof st.speedKts !== 'number') st.speedKts = 10;
        if (typeof st.actualSpeedKts !== 'number') st.actualSpeedKts = 0;
        if (typeof s.speed !== 'number') s.speed = ship.speed;
        if (typeof s.heading !== 'number') s.heading = 0;
        if (typeof s.desiredHeading !== 'number') s.desiredHeading = s.heading;
        
        // Determine which line and rank within that line
        // Follower 0 (i=0): port line, rank 0 (beside leader)
        // Follower 1 (i=1): starboard line, rank 1 (behind leader)
        // Follower 2 (i=2): port line, rank 1 (behind follower 0)
        // Follower 3 (i=3): starboard line, rank 2 (behind follower 1)
        // Pattern: even indices go to port, odd indices go to starboard
        const isPort = (i % 2 === 0); // 0=port, 1=starboard, 2=port, 3=starboard
        // Rank: 0,1,1,2,2,3,3,4...
        const rankInLine = Math.floor((i + 1) / 2);
        
        // Anchor behavior
        const aid = h.id;
        anchorMap[aid] = anchorMap[aid] || { t: 0, wanderDeg: Math.random()*360 };
        if (!formUp) {
          // At anchor: brief wander then stop
          const an = anchorMap[aid];
          an.t = Math.min(ANCHOR_WANDER_SECONDS + 0.5, an.t + dt);
          const wander = an.t < ANCHOR_WANDER_SECONDS;
          st.speedKts = wander ? ANCHOR_WANDER_KTS : 0;
          if (wander) {
            s.desiredHeading = an.wanderDeg;
            st.desiredHeading = an.wanderDeg;
          }
          continue; // Skip formation positioning when not forming up
        } else {
          // Reset anchor timer when forming up
          anchorMap[aid].t = 0;
        }
        
        // Determine target point and heading behavior
        let target = null;
        if (together) {
          // Turn Together: All ships turn instantly and maintain parallel formation
          const hr = (leader.ship.heading || 0) * Math.PI/180;
          // Position back by rank * interval (rank 0 = beside leader, rank 1 = one interval back, etc.)
          const back = rankInLine * interval;
          // Offset perpendicular: starboard = +width/2, port = -width/2
          const offset = isPort ? -width/2 : width/2;
          // Calculate position: back along heading, then offset perpendicular
          const dx = -Math.sin(hr) * back + Math.cos(hr) * offset;
          const dy = Math.cos(hr) * back + Math.sin(hr) * offset;
          target = { x: leader.ship.x + dx, y: leader.ship.y + dy };
          // Match leader's heading instantly for synchronized turning
          s.heading = leader.ship.heading || 0;
          s.desiredHeading = s.heading;
        } else {
          // Turn in Sequence: Follow like a snake, but with lateral offset
          // For rank 0 (first pair), use leader's current position as base
          // For rank 1+, follow the trail
          let trailBase;
          let trailHeading;
          if (rankInLine === 0) {
            // First follower (port side of leader) - position beside leader
            trailBase = { x: leader.ship.x, y: leader.ship.y };
            trailHeading = leader.ship.heading || 0;
          } else {
            // Followers further back - follow trail
            trailBase = trailPointBack(ff, rankInLine * interval) || { x: leader.ship.x, y: leader.ship.y };
            trailHeading = getTrailHeadingAt(ff, rankInLine * interval) || (leader.ship.heading || 0);
          }
          const hr = trailHeading * Math.PI/180;
          const offset = isPort ? -width/2 : width/2;
          const dx = Math.cos(hr) * offset;
          const dy = Math.sin(hr) * offset;
          target = { x: trailBase.x + dx, y: trailBase.y + dy };
        }
        
        // Steer toward target
        const dx = target.x - s.x; const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (!together) {
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          s.desiredHeading = desired;
          st.desiredHeading = desired;
        } else {
          st.desiredHeading = s.desiredHeading;
        }
        
        // Speed plan: match leader speed when in formation, accelerate when catching up
        const leaderKts = (leader.state && typeof leader.state.actualSpeedKts === 'number') ? Math.abs(leader.state.actualSpeedKts) : 12;
        const followerCap = (st && st.effects && typeof st.effects.speedCapKts === 'number')
          ? Math.max(0, st.effects.speedCapKts)
          : (h.profile && h.profile.propulsion && typeof h.profile.propulsion.max_speed_knots === 'number'
            ? h.profile.propulsion.max_speed_knots
            : 30);
        // Improved speed logic: detect ahead/behind and avoid circling
        const fallInBuffer = Math.max(10, interval * 0.15);
        let targetKts;
        
        // Calculate if ship is ahead or behind station
        const toTargetX = target.x - s.x;
        const toTargetY = target.y - s.y;
        const targetHeading = Math.atan2(toTargetX, -toTargetY);
        const leaderHeadingRad = (leader.ship.heading || 0) * Math.PI / 180;
        const headingDiff = Math.abs(targetHeading - leaderHeadingRad);
        // If heading to target is opposite to leader heading, ship is ahead
        const isAhead = headingDiff > Math.PI / 2 && dist < interval;
        
        if (dist > (interval + fallInBuffer)) {
          // Far behind - use full speed to catch up
          targetKts = followerCap;
        } else if (isAhead) {
          // Ahead of station - slow down MORE than leader to fall back in
          targetKts = Math.max(0, Math.min(followerCap, leaderKts * 0.6));
        } else {
          // Near station - match leader speed
          targetKts = Math.min(followerCap, leaderKts);
        }
        st.speedKts = targetKts;
      }
    } catch {}
  }
  
  // Helper function to get heading at a specific distance back in the trail
  function getTrailHeadingAt(ff, distBack){
    try {
      if (!ff || !Array.isArray(ff.trail) || ff.trail.length < 2) return null;
      let acc = 0;
      for (let i = ff.trail.length - 1; i > 0; i--) {
        const p0 = ff.trail[i];
        const p1 = ff.trail[i-1];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const seg = Math.hypot(dx, dy);
        if (acc + seg >= distBack) {
          // Found the segment containing our target point
          // Calculate heading for this segment
          return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        }
        acc += seg;
      }
      // If we ran out of trail, use the oldest available segment
      if (ff.trail.length >= 2) {
        const p0 = ff.trail[1];
        const p1 = ff.trail[0];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      }
      return null;
    } catch { return null; }
  }
  // Pin drag & double-click remove; hover cursor feedback; increase Zig-Zag amplitude/wavelength to be more spread out. Ensure cursor logic plays nicely with placement, hover, and drag states.
  let width = 0, height = 0, dpr = 1;
  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    // Use device pixel ratio for sharper sprites and text
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  function inDeadZone(angle, start, end) {
    // Boundaries are ALLOWED; only strict interior is forbidden
    angle = angleNorm360(angle);
    if (start <= end) return angle > start && angle < end;
    return angle > start || angle < end; // wrapped
  }

  function nearestBoundary(angle, start, end) {
    // Return whichever boundary (start or end) is nearest to angle by shortest angular distance
    const dToStart = Math.abs(angDist(angle, start));
    const dToEnd = Math.abs(angDist(angle, end));
    return dToStart <= dToEnd ? start : end;
  }

  function cwDistance(a, b) { return (angleNorm360(b) - angleNorm360(a) + 360) % 360; }
  function ccwDistance(a, b) { return (angleNorm360(a) - angleNorm360(b) + 360) % 360; }
  function isWithinCWArc(a, b, x) { return cwDistance(a, x) <= cwDistance(a, b); }
  function deadZoneSamples(start, end) {
    // Return only interior sample points of the dead zone (exclude boundaries)
    if (start <= end) {
      return [ (start + end) / 2 ];
    } else {
      // Wrapped interval: we choose a midpoint inside the wrapped arc
      const midWrapped = ((start + 360) + end) / 2; // in [start..360+end]
      const midWrappedNorm = (midWrapped >= 360) ? midWrapped - 360 : midWrapped;
      return [ midWrappedNorm ];
    }
  }
  function pathCrossesDeadZoneCW(a, b, start, end) {
    const samples = deadZoneSamples(start, end);
    for (const s of samples) {
      if (isWithinCWArc(a, b, s)) return true;
    }
    return false;
  }
  function stepAngleAvoidingDeadZone(current, target, start, end, maxSpeedDeg, dt) {
    current = angleNorm360(current); target = angleNorm360(target);
    const cw = cwDistance(current, target);
    const ccw = ccwDistance(current, target);
    const cwCross = pathCrossesDeadZoneCW(current, target, start, end);
    // For CCW, check CW from target to current (equivalent arc reversed)
    const ccwCross = pathCrossesDeadZoneCW(target, current, start, end);
    let goCW;
    if (cwCross && !ccwCross) goCW = false;
    else if (!cwCross && ccwCross) goCW = true;
    else {
      // Both safe or both appear to cross; prefer immediate safe direction
      const probe = Math.max(1, maxSpeedDeg * dt * 0.5); // small probe step in degrees
      const tryCW = angleNorm360(current + probe);
      const tryCCW = angleNorm360(current - probe);
      const cwDead = inDeadZone(tryCW, start, end);
      const ccwDead = inDeadZone(tryCCW, start, end);
      if (cwDead && !ccwDead) goCW = false;
      else if (!cwDead && ccwDead) goCW = true;
      else goCW = cw <= ccw; // both safe or both blocked equally -> pick shorter
    }

    const step = Math.min(maxSpeedDeg * dt, goCW ? cw : ccw);
    let next = current;
    if (goCW) next = angleNorm360(current + step);
    else next = angleNorm360(current - step);
    // Ensure we didn't step into dead zone due to numerical issues
    if (inDeadZone(next, start, end)) {
      next = projectOutOfDeadZone(next, start, end);
    }
    return next;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // World / map data
  let mapImg = null; // background image (map1.png from imagelayer)
  let mapPixelSize = { w: 1024, h: 1024 }; // from TMX imagelayer
  let mapGrid = { cols: 32, rows: 32, tileW: 32, tileH: 32 }; // defaults, updated by TMX
  let collision = []; // boolean array length cols*rows

  // Player ship visual (BSTMX)
  let shipImg = null; // bismarck1.png loaded from BSTMX.tmx imagelayer
  let turretPoints = []; // turret anchor points from object layer (in ship image/world pixels)
  let turretImg = null; // doublebarrel.png turret sprite
  // Background ocean image (large world)
  let pacificImg = null;
  const pacificSize = { w: 4096, h: 4096 };

  // Player ship (required from bismarck.js)
  const shipState = window.shipState; // hard requirement
  const ship = shipState.ship;

  // --- Sinking animation/effects ---
  window.SinkingShips = window.SinkingShips || [];
  // Spawn a sinking animation entry for a given ship handle { id, ship, kind:'player'|'npc' }
  function spawnSinkingFor(handle){
    try {
      if (!handle || !handle.ship) return;
      // Avoid duplicate entries per id
      const idStr = String(handle.id || '');
      if (window.SinkingShips.some(s=>s && s.id === idStr)) return;
      window.SinkingShips.push({
        id: idStr,
        kind: handle.kind || 'npc',
        x: handle.ship.x,
        y: handle.ship.y,
        heading: handle.ship.heading || 0,
        t: 0,             // seconds elapsed
        dur: 6.0,         // total sinking duration seconds
        startR: 1.0,      // visual scale
        endR: 0.6,        // shrink slightly as it sinks
        startAlpha: 1.0,
        endAlpha: 0.0,
      });
    } catch {}
  }
  function updateAndDrawSinkingWorld(dt){
    try {
      if (!window.SinkingShips || !window.SinkingShips.length) return;
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const alive = [];
      for (let i=0;i<window.SinkingShips.length;i++){
        const s = window.SinkingShips[i]; if (!s) continue;
        s.t += dt;
        const u = Math.max(0, Math.min(1, s.t / s.dur));
        // Simple ease
        const ease = u*u*(3-2*u);
        const r = s.startR + (s.endR - s.startR) * ease;
        const a = s.startAlpha + (s.endAlpha - s.startAlpha) * ease;
        // Draw a simple sinking silhouette: faded ellipse/shadow and outline circle shrinking
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.lineWidth = Math.max(0.75, 1/scale);
        const ringR = 18/scale;
        ctx.strokeStyle = 'rgba(50,70,90,0.65)';
        ctx.beginPath(); ctx.arc(s.x, s.y, ringR * r, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(20,30,40,0.35)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 6/scale, 14/scale * r, 8/scale * r, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        if (s.t < s.dur) alive.push(s);
      }
      window.SinkingShips = alive;
    } catch {}
  }

  // Cleanup routine to fully remove sunk ships from HUDs, cycles, and camera follow
  function cleanupSunkShipById(idStr){
    try {
      const id = String(idStr);
      // Hide and mark HUD as sunk so cycles skip it
      try {
        if (window.ShipHUDs && window.ShipHUDs[id]) {
          const hudInfo = window.ShipHUDs[id];
          hudInfo.sunk = true;
          const container = document.getElementById(hudInfo.containerId);
          if (container) container.style.display = 'none';
        }
        // Also hide any surrogate HUDs that map back to this id (e.g., right HUD entries with originalId)
        if (window.ShipHUDs) {
          Object.keys(window.ShipHUDs).forEach(k => {
            try {
              const info = window.ShipHUDs[k];
              if (info && info.originalId && String(info.originalId) === id) {
                info.sunk = true;
                const c = document.getElementById(info.containerId);
                if (c) c.style.display = 'none';
              }
            } catch {}
          });
        }
      } catch {}
      // Stop following if camera is following this ship; snap back to player
      try {
        if (window.viewFollow && window.viewFollow.enabled && window.viewFollow.mode === 'ship' && String(window.viewFollow.shipId) === id) {
          window.viewFollow.enabled = false;
          camera.cx = ship.x; camera.cy = ship.y; currentViewRect = getViewRect();
        }
      } catch {}
      // Remove from legacy shipCycle lists if present
      try {
        if (Array.isArray(window.shipCycle)) {
          window.shipCycle = window.shipCycle.filter(s => String(s && s.id) !== id);
        }
      } catch {}
    } catch {}
  }

  // --- Damage Model hookup (runtime-only; profile is never mutated) ---
  let damageModel = null;
  try {
    if (window.DamageModel) {
      damageModel = new window.DamageModel(shipState);
    }
  } catch {}
  // Helper to apply damage from external systems (e.g., shell impacts)
  window.applyShipDamage = function(hitbox, dmg){
    try { if (damageModel) damageModel.applyDamage(hitbox, dmg); } catch {}
  };
  // Helper to apply repair (healing) to our ship hitboxes; increases hp but does not alter other flags
  window.applyShipRepair = function(hitbox, hpAmount){
    try {
      if (!window.shipProfile || !window.shipProfile.damage) return;
      const hbs = window.shipProfile.damage.hitboxes || {};
      const hb = hbs[hitbox];
      if (!hb || typeof hb.max_hp !== 'number') return;
      const maxhp = hb.max_hp;
      const cur = typeof hb.hp === 'number' ? hb.hp : maxhp;
      const next = Math.min(maxhp, Math.max(0, cur + (hpAmount||0)));
      hb.hp = next;
      // keep a convenient percent field for HUD coloring if present elsewhere
      const pct = maxhp > 0 ? (1 - (next / maxhp)) : 0;
      hb.damage_percent = Math.round(Math.max(0, Math.min(1, pct)) * 100);
      // Recompute effects so HUD and gameplay reflect new repair state
      try { if (typeof damageModel === 'object' && damageModel && typeof damageModel.recomputeEffects === 'function') damageModel.recomputeEffects(); } catch {}
    } catch {}
  };
  // Global Damage Control assignments/state
  window.DamageControl = window.DamageControl || { mode: 0, team1: null, team2: null, cursorOn: false };
  // Global spanner cursor data URL so both HUD and game canvas can use it
  window.SpannerCursor = window.SpannerCursor || 'url("data:image/svg+xml;utf8,\
    <svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'>\
      <path fill=\'#2b2b2b\' d=\'M21 7.5a5.5 5.5 0 0 1-7.76 5.02l-6.6 6.6a1.5 1.5 0 0 1-2.12-2.12l6.6-6.6A5.5 5.5 0 1 1 21 7.5Zm-2 0a3.5 3.5 0 1 0-6.18 2.21l-.9.9l1.97 1.97l.9-.9A3.5 3.5 0 0 0 19 7.5Z\'/>\
    </svg>\
  ") 4 4, auto';
  // Repairs: each active team repairs up to 2% of max HP per second at 100% efficiency
  function damageControlTick(dt){
    try {
      const dc = window.DamageControl || {};
      // Resolve a target profile + state by ship id (string)
      function resolveTargetById(idStr){
        try {
          const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
          if (!idStr || (playerId && idStr === playerId)) {
            return { profile: window.shipProfile, state: window.shipState, handle: null };
          }
          if (Array.isArray(window.IronTideFleet)) {
            for (let i=0;i<window.IronTideFleet.length;i++){
              const h = window.IronTideFleet[i];
              if (h && h.state && String(h.state.id) === String(idStr)) {
                return { profile: h.profile, state: h.state, handle: h };
              }
            }
          }
        } catch {}
        return { profile: window.shipProfile, state: window.shipState, handle: null };
      }
      function tickTeam(teamHitbox, teamShipId){
        if (!teamHitbox) return;
        const tgt = resolveTargetById(String(teamShipId||''));
        const prof = tgt.profile; const st = tgt.state;
        if (!prof || !prof.damage || !prof.damage.hitboxes) return;
        const hbs = prof.damage.hitboxes;
        const hb = hbs[teamHitbox]; if (!hb) return;
        // Normalize max_hp if missing (fallback to current hp)
        let maxhp = (typeof hb.max_hp === 'number' && hb.max_hp > 0) ? hb.max_hp : (typeof hb.hp === 'number' ? hb.hp : 0);
        if (!maxhp) return;
        if (typeof hb.max_hp !== 'number' || hb.max_hp <= 0) hb.max_hp = maxhp;
        // Efficiency from that ship's state (fallback 1)
        let eff = (st && st.effects && typeof st.effects.repairEfficiency === 'number')
          ? Math.max(0, Math.min(1, st.effects.repairEfficiency)) : 1;
        const effClamped = Math.max(0.2, eff);
        const rate = 0.005 + ((effClamped - 0.2) / 0.8) * 0.015; // 0.5%..2.0%
        // Determine current HP: prefer explicit hp; else derive from damage_percent if present
        let cur;
        if (typeof hb.hp === 'number') {
          cur = hb.hp;
        } else if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) {
          const dp = Math.max(0, Math.min(100, hb.damage_percent));
          cur = Math.round(maxhp * (1 - dp/100));
        } else {
          cur = maxhp;
        }
        if (cur >= maxhp) return;
        const add = maxhp * rate * (dt||0);
        // Apply to that profile
        window.applyRepairToProfile(prof, teamHitbox, add);
        // Recompute effects for the repaired ship
        try {
          if (tgt.handle && tgt.handle.damageModel && typeof tgt.handle.damageModel.recomputeEffects === 'function') {
            tgt.handle.damageModel.recomputeEffects();
          } else if (typeof window.recomputeEffectsForShipId === 'function' && tgt.state && tgt.state.id != null) {
            window.recomputeEffectsForShipId(String(tgt.state.id));
          } else if (!tgt.handle && typeof damageModel === 'object' && damageModel && typeof damageModel.recomputeEffects === 'function') {
            damageModel.recomputeEffects();
          }
        } catch {}
      }
      tickTeam(dc.team1, dc.team1ShipId);
      tickTeam(dc.team2, dc.team2ShipId);
    } catch {}
  }

  // Helper to recompute effects for any ship by id (player, fleet, or NPC)
  window.recomputeEffectsForShipId = function(idStr){
    try {
      const tgt = window.resolveShipById(String(idStr||''));
      if (!tgt || !tgt.profile || !tgt.state) return;
      if (tgt.handle && tgt.handle.damageModel && typeof tgt.handle.damageModel.recomputeEffects === 'function') {
        tgt.handle.damageModel.recomputeEffects();
        return;
      }
      // Construct a temporary model if needed to recompute and write back into state.effects
      if (typeof window.DamageModel === 'function') {
        // DamageModel constructor expects a shipState object
        const dm = new window.DamageModel(tgt.state);
        if (typeof dm.recomputeEffects === 'function') dm.recomputeEffects();
      }
    } catch {}
  };
  // Optional: Global firing solution instance and helper for quick tests/integration
  let fsInstance = null;
  try {
    if (window.FiringSolution && damageModel) {
      fsInstance = new window.FiringSolution(shipState, damageModel);
      window.mainBatteryFS = fsInstance;
    }
  } catch {}
  // Fire a single main-battery shell using preferred hitboxes and current effects
  // Example: window.fireShell(["turret1","bow","hullmid"], 100, 12000, "turret1", shipState.actualSpeedKts, 15)
  window.fireShell = function(preferredHitboxes, baseDamage, distanceMeters, turretId, attackerSpeed, targetSpeed){
    try {
      if (!fsInstance && window.FiringSolution && damageModel) {
        fsInstance = new window.FiringSolution(shipState, damageModel);
        window.mainBatteryFS = fsInstance;
      }
      if (!fsInstance) return { hit:false, damage:0 };
      return fsInstance.fireShell(preferredHitboxes||[], baseDamage||100, distanceMeters||10000, turretId||'turret1', attackerSpeed||0, targetSpeed||0);
    } catch { return { hit:false, damage:0 }; }
  };
  // Helper to report current effective stats for Windsurf/telemetry per tick
  window.getShipEffectiveStats = function(){
    const effects = (shipState && shipState.effects) || {};
    const kts = Math.abs(shipState.actualSpeedKts || 0);
    // Match easing used in guidance for near-zero speeds
    const kEff = (kts >= 5) ? kts : (kts/5) * (kts/5) * 5;
    const worldSpeedPxPerSec = ship.speed * (kEff / 15);
    const effRudder = (function(){
      try { return shipState ? shipState.rudderEffectiveness(kts) : 0; } catch { return 0; }
    })() * (effects.rudderEffectivenessScale != null ? effects.rudderEffectivenessScale : 1);
    const turnRateMaxDegPerSec = (typeof TURN_RATE_MAX_FULL === 'number' ? TURN_RATE_MAX_FULL : 45)
      * (effects.turnRateFactor != null ? effects.turnRateFactor : 1)
      * effRudder;
    return {
      // Kinematics
      targetKts: shipState.speedKts,
      actualKts: shipState.actualSpeedKts,
      speedCapKts: (effects.speedCapKts != null ? effects.speedCapKts : shipState.SPEED_MAX),
      worldSpeedPxPerSec,
      accelKtsPerSec: shipState.ACCEL_KTS_PER_SEC * (effects.accelFactor != null ? effects.accelFactor : 1),
      // Heading/turning
      headingDeg: ship.heading,
      desiredHeadingDeg: ship.desiredHeading,
      turnRateMaxDegPerSec,
      rudder: {
        effectiveness: effRudder,
        jam: effects.rudderJam || null,
      },
      // Fire control
      rangefinderEffectiveness: (effects.rangefinderEffectiveness != null ? effects.rangefinderEffectiveness : 1),
      turrets: {
        turret1: (effects.turrets && effects.turrets.turret1) || { accuracy: 1, reloadMultiplier: 1 },
        turret2: (effects.turrets && effects.turrets.turret2) || { accuracy: 1, reloadMultiplier: 1 },
        turret3: (effects.turrets && effects.turrets.turret3) || { accuracy: 1, reloadMultiplier: 1 },
        turret4: (effects.turrets && effects.turrets.turret4) || { accuracy: 1, reloadMultiplier: 1 },
      },
      // Ops/State
      commandDelaySeconds: (effects.commandDelaySeconds != null ? effects.commandDelaySeconds : 0),
      repairEfficiency: (effects.repairEfficiency != null ? effects.repairEfficiency : 1),
      funnelSmoke: (effects.funnelSmoke != null ? effects.funnelSmoke : 1),
      sunk: !!(effects.sunk || shipState.sunk),
    };
  };

  // Input: keys
  const keys = { left: false, right: false, up: false, down: false };
  // Forced turning direction from user input: -1 = CCW (left), +1 = CW (right), 0 = free/none
  let turnDir = 0;
  // Latched turn direction persists after key release until target heading is reached
  let latchedTurnDir = 0;
  function adjustSpeed(delta) {
    const currentFleet = window.IronTideSelectedFleet || 1;
    
    if (currentFleet === 1) {
      // Fleet 1: control player ship directly (original logic)
      const v = shipState.adjustSpeed(delta);
      speedKts = v;
      // Also keep the UI slider/readout matched
      try {
        if (speedSliderEl && speedSliderEl.value !== String(v)) speedSliderEl.value = String(v);
        if (speedReadoutEl) speedReadoutEl.textContent = v + ' kts';
      } catch {}
    } else {
      // Fleet 2/3: control fleet leader
      const fleetLeader = getFleetLeader(currentFleet);
      if (fleetLeader && fleetLeader.state) {
        const currentSpeed = fleetLeader.state.speedKts || 0;
        const newSpeed = Math.max(-8, Math.min(30, currentSpeed + delta));
        fleetLeader.state.speedKts = newSpeed;
        
        // Update settings
        const settings = window.IronTideFleetSettings[currentFleet];
        if (settings) {
          settings.speed = newSpeed;
        }
        
        // Update UI
        try {
          if (speedSliderEl && speedSliderEl.value !== String(newSpeed)) speedSliderEl.value = String(newSpeed);
          if (speedReadoutEl) speedReadoutEl.textContent = newSpeed + ' kts';
        } catch {}
      }
    }
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w') { keys.up = true; adjustSpeed(1); }
    if (e.key === 'ArrowDown' || e.key === 's') { keys.down = true; adjustSpeed(-1); }
    // Update forced turn direction from keys
    if (keys.left && !keys.right) { turnDir = -1; latchedTurnDir = -1; }
    else if (keys.right && !keys.left) { turnDir = 1; latchedTurnDir = 1; }
    else if (!keys.left && !keys.right) { turnDir = 0; /* keep latch */ }
    // Any manual steering cancels click-to-move
    if (keys.left || keys.right || keys.up || keys.down) {
      ship.moveTarget = null;
    }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
    if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
    // Refresh forced turn direction state
    if (keys.left && !keys.right) { turnDir = -1; latchedTurnDir = -1; }
    else if (keys.right && !keys.left) { turnDir = 1; latchedTurnDir = 1; }
    else { turnDir = 0; /* keep latch active */ }
  });

  // On-screen compass control (smaller to keep game view clear)
  const compassUI = {
    cx: 0, cy: 0, r: 56, dragging: false
  };
  // Second compass for turret angle control (relative to ship forward: 0 = bow)
  const turretCompassUI = {
    cx: 0, cy: 0, r: 48, dragging: false
  };
  // Compute dock height dynamically when available
  function getDockHeight() {
    const dock = document.getElementById('navalDock');
    return dock ? Math.max(0, dock.offsetHeight || 0) : 0;
  }
  function layoutCompass() {
    // Keep compasses above the bottom dock dynamically. Add safety margin.
    const bottomOffset = Math.min(200, getDockHeight() + 16); // clamp
    const sideOffset = 88;   // px from side edges
    compassUI.cx = Math.max(compassUI.r + 12, width - sideOffset);
    compassUI.cy = Math.max(compassUI.r + 12, height - bottomOffset);
    turretCompassUI.cx = Math.min(width - (turretCompassUI.r + 12), sideOffset);
    turretCompassUI.cy = Math.max(turretCompassUI.r + 12, height - bottomOffset);
  }
  window.addEventListener('resize', layoutCompass);
  layoutCompass();

  // Speed slider hookup (knots). 15 kts == baseline speed (ship.speed)
  const SPEED_MIN = shipState.SPEED_MIN;
  const SPEED_MAX = shipState.SPEED_MAX;
  const ACCEL_KTS_PER_SEC = shipState.ACCEL_KTS_PER_SEC; // reach 30kts in ~15s (30/2)
  // Mirror values from shipState to keep existing code paths working
  let speedKts = shipState.speedKts;           // target speed
  let actualSpeedKts = shipState.actualSpeedKts; // smooth actual speed
  const speedSliderEl = document.getElementById('speedSlider');
  const speedReadoutEl = (function(){
    const dock = document.getElementById('navalDock');
    return dock ? dock.querySelector('.speed-readout') : null;
  })();
  const speedActualEl = document.getElementById('speedActualIndicator');
  // Access aggregated runtime effects (populated by damageModel.js)
  function getEffects(){
    const e = (shipState && shipState.effects) || {};
    return {
      speedFactor: (e.speedFactor != null ? e.speedFactor : 1),
      accelFactor: (e.accelFactor != null ? e.accelFactor : 1),
      turnRateFactor: (e.turnRateFactor != null ? e.turnRateFactor : 1),
      speedCapKts: (e.speedCapKts != null ? e.speedCapKts : SPEED_MAX),
      rudderEffectivenessScale: (e.rudderEffectivenessScale != null ? e.rudderEffectivenessScale : 1),
      rudderJam: e.rudderJam || null,
    };
  }
  function setSpeedFromSlider(val) {
    // Apply dynamic cap from effects when setting speed
    const effects = getEffects();
    let desired = parseInt(val, 10);
    if (!isFinite(desired)) desired = 0;
    if (desired > effects.speedCapKts) desired = effects.speedCapKts;
    const v = shipState.setSpeedFromSlider(desired);
    speedKts = Math.min(shipState.speedKts, effects.speedCapKts);
    // Ensure UI stays in sync
    if (speedSliderEl && speedSliderEl.value !== String(v)) speedSliderEl.value = String(v);
    if (speedReadoutEl) speedReadoutEl.textContent = v + ' kts';
  }
  if (speedSliderEl) {
    setSpeedFromSlider(speedSliderEl.value);
    speedSliderEl.addEventListener('input', (e)=>{
      const currentFleet = window.IronTideSelectedFleet || 1;
      
      // If Fleet 1 is selected, use the original player ship logic
      if (currentFleet === 1) {
        setSpeedFromSlider(e.target.value);
      } else {
        // For Fleet 2/3, control the fleet leader
        const fleetLeader = getFleetLeader(currentFleet);
        const newSpeed = parseInt(e.target.value) || 0;
        
        if (fleetLeader && fleetLeader.state) {
          fleetLeader.state.speedKts = newSpeed;
          if (fleetLeader.state.setSpeedFromSlider) {
            fleetLeader.state.setSpeedFromSlider(newSpeed);
          }
        }
        
        // Update settings
        const settings = window.IronTideFleetSettings[currentFleet];
        if (settings) {
          settings.speed = newSpeed;
        }
      }
    });
  }

  // Compute current turret muzzle world position and world angle
  function getTurretMuzzleWorld(id) {
    try {
      if (!turretPoints || !shipImg || !turretImg) return null;
      // Match scaling math from drawShipWorld
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const targetHBase = 96;
      const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
      const worldH = Math.max(1, targetHScreen / scale);
      const worldW = Math.round(worldH * (shipImg.width / shipImg.height));
      const sx = worldW / shipImg.width;
      const sy = worldH / shipImg.height;
      const byId = getTurretMuzzleWorld.__map || new Map(turretPoints.map(p => [p.id, p]));
      getTurretMuzzleWorld.__map = byId;
      const p = byId.get(id);
      if (!p) return null;
      const tx = (p.x - shipImg.width / 2) * sx;
      const ty = (p.y - shipImg.height / 2) * sy;
      const forwardDelta = (id === 't1') ? (5 / scale) : 0;
      const relDeg = (turretAnglesRelDeg && typeof turretAnglesRelDeg[id] === 'number') ? turretAnglesRelDeg[id] : 0;
      const worldDeg = angleNorm360(ship.heading + relDeg);
      const hr = ship.heading * Math.PI/180;
      const lx = tx;
      // Green line starts at turret local origin after translate/rotate
      const ly = (ty - forwardDelta);
      const x = ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
      const y = ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
      // Desired aim angle down the target line (green line) if a target exists
      let aimDeg = worldDeg;
      if (firingSolution && firingSolution.target) {
        const wdx = firingSolution.target.x - x;
        const wdy = firingSolution.target.y - y;
        aimDeg = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
      }
      return { x, y, worldDeg, aimDeg };
    } catch { return null; }
  }

  // Determine if a given turret is allowed to fire:
  // - Aim line is green (aligned to desired aim within tight tolerance)
  // - Desired aim is NOT inside the turret's dead zone (bridge occlusion)
  // - Turret is not destroyed (hp<=0 or damage_percent>=100 or destroyed flag)
  // Returns an object { ok, aligned, occluded, aimDeg }
  function canTurretFire(id) {
    try {
      if (!id) return { ok: false, aligned: false, occluded: true, aimDeg: null };
      // Block if this turret is destroyed
      try {
        const hbKey = String(id).replace(/^t/, 'turret');
        const hbMap = (window.shipProfile && window.shipProfile.damage && window.shipProfile.damage.hitboxes) ? window.shipProfile.damage.hitboxes : null;
        if (hbMap && hbMap[hbKey]) {
          const hb = hbMap[hbKey];
          const maxhp = (typeof hb.max_hp === 'number') ? hb.max_hp : 0;
          const hp = (typeof hb.hp === 'number') ? hb.hp : maxhp;
          const dp = (typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp > 0 ? (100 - Math.round((hp/Math.max(1,maxhp)) * 100)) : 0);
          const destroyed = (maxhp > 0 && hp <= 0) || (dp >= 100) || !!hb.destroyed;
          if (destroyed) return { ok: false, aligned: false, occluded: true, aimDeg: null };
        }
      } catch {}
      // Require a Solution target pin to be present to allow firing
      if (!(firingSolution && firingSolution.target)) {
        return { ok: false, aligned: false, occluded: true, aimDeg: null };
      }
      // Dead zones: mirror the update loop values
      const topDeadStart = 145, topDeadEnd = 235;
      const bottomDeadStart = 325, bottomDeadEnd = 55;
      const isTop = (id === 't1' || id === 't2');
      const ds = isTop ? topDeadStart : bottomDeadStart;
      const de = isTop ? topDeadEnd : bottomDeadEnd;
      // Current relative angle and desired aim relative to ship
      const curRel = (turretAnglesRelDeg && typeof turretAnglesRelDeg[id] === 'number') ? turretAnglesRelDeg[id] : 0;
      let desiredRel;
      let aimDegWorld;
      const res = getTurretMuzzleWorld(id);
      if (!res) return { ok: false, aligned: false, occluded: true, aimDeg: null };
      aimDegWorld = res.aimDeg;
      desiredRel = angleNorm360(aimDegWorld - ship.heading);
      const occluded = inDeadZone(desiredRel, ds, de);
      // Alignment (same threshold used for green line)
      const delta = ((desiredRel - curRel + 540) % 360) - 180;
      const aligned = Math.abs(delta) <= 1; // degrees
      return { ok: aligned && !occluded, aligned, occluded, aimDeg: aimDegWorld };
    } catch {
      return { ok: false, aligned: false, occluded: true, aimDeg: null };
    }
  }
  // NPC helpers: compute muzzle world position/aim and fire eligibility vs player ship
  function getNpcTurretMuzzleWorld(id) {
    try {
      if (!npc1 || !npc1.state || !npc1.state.ship || !turretPoints || !shipImg || !turretImg) return null;
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const targetHBase = 96;
      const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
      const worldH = Math.max(1, targetHScreen / scale);
      const worldW = Math.round(worldH * (shipImg.width / shipImg.height));
      const sx = worldW / shipImg.width;
      const sy = worldH / shipImg.height;
      const byId = getNpcTurretMuzzleWorld.__map || new Map(turretPoints.map(p => [p.id, p]));
      getNpcTurretMuzzleWorld.__map = byId;
      const p = byId.get(id);
      if (!p) return null;
      const tx = (p.x - shipImg.width / 2) * sx;
      const ty = (p.y - shipImg.height / 2) * sy;
      const forwardDelta = (id === 't1') ? (5 / scale) : 0;
      const nAngles = (npc1 && npc1.state && npc1.state.npcTurretAnglesRelDeg) || {};
      const relDeg = (typeof nAngles[id] === 'number') ? nAngles[id] : (id==='t3'||id==='t4' ? 180 : 0);
      const worldDeg = angleNorm360((npc1.state.ship.heading || 0) + relDeg);
      const hr = (npc1.state.ship.heading || 0) * Math.PI/180;
      const lx = tx;
      const ly = (ty - forwardDelta);
      const x = npc1.state.ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
      const y = npc1.state.ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
      // Aim at player ship center by default
      let aimDeg = worldDeg;
      if (ship && typeof ship.x === 'number' && typeof ship.y === 'number') {
        const wdx = ship.x - x;
        const wdy = ship.y - y;
        aimDeg = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
      }
      return { x, y, worldDeg, aimDeg };
    } catch { return null; }
  }
  function canNpcTurretFire(id) {
    try {
      if (!id || !npc1 || !npc1.profile) return { ok: false, aligned: false, occluded: true, aimDeg: null };
      // Destroyed check
      try {
        const hbKey = String(id).replace(/^t/, 'turret');
        const hbMap = (npc1.profile && npc1.profile.damage && npc1.profile.damage.hitboxes) ? npc1.profile.damage.hitboxes : null;
        if (hbMap && hbMap[hbKey]) {
          const hb = hbMap[hbKey];
          const maxhp = (typeof hb.max_hp === 'number') ? hb.max_hp : 0;
          const hp = (typeof hb.hp === 'number') ? hb.hp : maxhp;
          const dp = (typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp > 0 ? (100 - Math.round((hp/Math.max(1,maxhp)) * 100)) : 0);
          const destroyed = (maxhp > 0 && hp <= 0) || (dp >= 100) || !!hb.destroyed;
          if (destroyed) return { ok: false, aligned: false, occluded: true, aimDeg: null };
        }
      } catch {}
      const topDeadStart = 145, topDeadEnd = 235;
      const bottomDeadStart = 325, bottomDeadEnd = 55;
      const isTop = (id === 't1' || id === 't2');
      const ds = isTop ? topDeadStart : bottomDeadStart;
      const de = isTop ? topDeadEnd : bottomDeadEnd;
      const nAngles = (npc1 && npc1.state && npc1.state.npcTurretAnglesRelDeg) || {};
      const curRel = (typeof nAngles[id] === 'number') ? nAngles[id] : (isTop ? 0 : 180);
      const res = getNpcTurretMuzzleWorld(id);
      if (!res) return { ok: false, aligned: false, occluded: true, aimDeg: null };
      const aimDegWorld = res.aimDeg;
      const desiredRel = angleNorm360(aimDegWorld - (npc1.state.ship.heading || 0));
      const occluded = inDeadZone(desiredRel, ds, de);
      const delta = ((desiredRel - curRel + 540) % 360) - 180;
      const aligned = Math.abs(delta) <= 2;
      return { ok: aligned && !occluded, aligned, occluded, aimDeg: aimDegWorld };
    } catch { return { ok: false, aligned: false, occluded: true, aimDeg: null }; }
  }

  // Generalized versions for ANY NPC object (not only npc1)
  function getNpcTurretMuzzleWorldFor(npc, id) {
    try {
      if (!npc || !npc.state || !npc.state.ship || !turretPoints || !shipImg || !turretImg) return null;
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const targetHBase = 96;
      const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
      const worldH = Math.max(1, targetHScreen / scale);
      const worldW = Math.round(worldH * (shipImg.width / shipImg.height));
      const sx = worldW / shipImg.width;
      const sy = worldH / shipImg.height;
      const byId = getNpcTurretMuzzleWorldFor.__map || new Map(turretPoints.map(p => [p.id, p]));
      getNpcTurretMuzzleWorldFor.__map = byId;
      const p = byId.get(id);
      if (!p) return null;
      const tx = (p.x - shipImg.width / 2) * sx;
      const ty = (p.y - shipImg.height / 2) * sy;
      const forwardDelta = (id === 't1') ? (5 / scale) : 0;
      const nAngles = (npc && npc.state && npc.state.npcTurretAnglesRelDeg) || {};
      const relDeg = (typeof nAngles[id] === 'number') ? nAngles[id] : (id==='t3'||id==='t4' ? 180 : 0);
      const worldDeg = angleNorm360((npc.state.ship.heading || 0) + relDeg);
      const hr = (npc.state.ship.heading || 0) * Math.PI/180;
      const lx = tx;
      const ly = (ty - forwardDelta);
      const x = npc.state.ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
      const y = npc.state.ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
      // Default aim: toward player ship center if available
      let aimDeg = worldDeg;
      if (ship && typeof ship.x === 'number' && typeof ship.y === 'number') {
        const wdx = ship.x - x;
        const wdy = ship.y - y;
        aimDeg = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
      }
      return { x, y, worldDeg, aimDeg };
    } catch { return null; }
  }
  function canNpcTurretFireFor(npc, id, targetPoint) {
    try {
      if (!id || !npc || !npc.profile) return { ok: false, aligned: false, occluded: true, aimDeg: null };
      // Destroyed check
      try {
        const hbKey = String(id).replace(/^t/, 'turret');
        const hbMap = (npc.profile && npc.profile.damage && npc.profile.damage.hitboxes) ? npc.profile.damage.hitboxes : null;
        if (hbMap && hbMap[hbKey]) {
          const hb = hbMap[hbKey];
          const maxhp = (typeof hb.max_hp === 'number') ? hb.max_hp : 0;
          const hp = (typeof hb.hp === 'number') ? hb.hp : maxhp;
          const dp = (typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp > 0 ? (100 - Math.round((hp/Math.max(1,maxhp)) * 100)) : 0);
          const destroyed = (maxhp > 0 && hp <= 0) || (dp >= 100) || !!hb.destroyed;
          if (destroyed) return { ok: false, aligned: false, occluded: true, aimDeg: null };
        }
      } catch {}
      const topDeadStart = 145, topDeadEnd = 235;
      const bottomDeadStart = 325, bottomDeadEnd = 55;
      const isTop = (id === 't1' || id === 't2');
      const ds = isTop ? topDeadStart : bottomDeadStart;
      const de = isTop ? topDeadEnd : bottomDeadEnd;
      const nAngles = (npc && npc.state && npc.state.npcTurretAnglesRelDeg) || {};
      const curRel = (typeof nAngles[id] === 'number') ? nAngles[id] : (isTop ? 0 : 180);
      const res = getNpcTurretMuzzleWorldFor(npc, id);
      if (!res) return { ok: false, aligned: false, occluded: true, aimDeg: null };
      // Choose desired aim: prefer provided targetPoint, else fallback to player center, else use worldDeg
      let aimDegWorld = res.worldDeg;
      if (targetPoint && typeof targetPoint.x === 'number' && typeof targetPoint.y === 'number') {
        const wdx = targetPoint.x - res.x; const wdy = targetPoint.y - res.y;
        aimDegWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
      } else if (ship && typeof ship.x === 'number' && typeof ship.y === 'number') {
        const wdx = ship.x - res.x; const wdy = ship.y - res.y;
        aimDegWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
      }
      const desiredRel = angleNorm360(aimDegWorld - (npc.state.ship.heading || 0));
      const occluded = inDeadZone(desiredRel, ds, de);
      const delta = ((desiredRel - curRel + 540) % 360) - 180;
      const aligned = Math.abs(delta) <= 2;
      return { ok: aligned && !occluded, aligned, occluded, aimDeg: aimDegWorld };
    } catch { return { ok: false, aligned: false, occluded: true, aimDeg: null }; }
  }

  function updateSpeedIndicatorPosition() {
    if (!speedActualEl) return;
    // Map actualSpeedKts in [-8..30] to vertical position within wrap height (76px)
    const range = SPEED_MAX - SPEED_MIN; // 38
    const s = (actualSpeedKts - SPEED_MIN) / range; // 0..1
    const wrapH = 76; // matches CSS
    const top = Math.round((1 - s) * wrapH);
    speedActualEl.style.top = top + 'px';
  }

  // Zoom slider controlling both ship and map scale. Top = IN (largest), bottom = OUT (smallest)
  const zoomOutSlider = { x: 16, y: 16, w: 22, h: 160, dragging: false, min: 0.25, max: 3.6, value: 1.925 }; // Start at middle of range (0.25 + (3.6-0.25)/2)
  function setZoomOutFromPos(py) {
    const { y, h, min, max } = zoomOutSlider;
    // Inverted: top = Max (1.0), bottom = Out (min)
    const s = Math.max(0, Math.min(1, (py - y) / h)); // 0 top, 1 bottom
    zoomOutSlider.value = max - (max - min) * s;
  }
  function sliderPosFromZoomOut() {
    const { y, h, min, max, value } = zoomOutSlider;
    // value=max -> top; value=min -> bottom
    const s = (max - value) / (max - min);
    return y + s * h;
  }
  function drawZoomOutSlider() {
    const { x, y, w, h } = zoomOutSlider;
    ctx.save();
    // Brass track
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#3a3a3a');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#bfa76a';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // Knob (brass)
    const py = sliderPosFromZoomOut();
    const knobW = w + 12, knobH = 12;
    const kg = ctx.createLinearGradient(0, py - knobH/2, 0, py + knobH/2);
    kg.addColorStop(0, '#e7e1c1');
    kg.addColorStop(1, '#9e8f5a');
    ctx.fillStyle = kg;
    ctx.strokeStyle = '#5a4f2e';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 6, Math.round(py) - knobH/2, knobW, knobH);
    ctx.strokeRect(x - 6, Math.round(py) - knobH/2, knobW, knobH);
    // Labels (top = IN, bottom = OUT)
    ctx.fillStyle = '#bfa76a';
    ctx.font = 'bold 14px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('IN', x + w/2, y - 4);
    ctx.textBaseline = 'top';
    ctx.fillText('OUT', x + w/2, y + h + 4);
    ctx.restore();
  }
  function hitZoomOutSlider(px, py) {
    const { x, y, w, h } = zoomOutSlider;
    return px >= x - 8 && px <= x + w + 8 && py >= y && py <= y + h;
  }

  function screenToCanvas(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);
    return { x, y };
  }

  function pointerDown(evt) {
    const p = screenToCanvas(evt.touches ? evt.touches[0] : evt);
    // Fleet 2/3 target selection mode: first click sets target ship
    try {
      if (window.FleetTargetingMode && window.FleetTargetingMode.active && (window.FleetTargetingMode.fid === 2 || window.FleetTargetingMode.fid === 3)) {
        const fid = window.FleetTargetingMode.fid;
        const w = screenToWorld(p.x, p.y);
        const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
        // Pick nearest ship within reasonable radius
        let best = null, bestD = 1e9;
        for (let i=0;i<others.length;i++){
          const s = others[i];
          const dx = (s.x||0) - w.x, dy = (s.y||0) - w.y; const d = Math.hypot(dx,dy);
          if (d < bestD && d <= 800) { best = s; bestD = d; }
        }
        window.FleetGunnery = window.FleetGunnery || { 2:{}, 3:{} };
        if (best && best.id != null) {
          window.FleetGunnery[fid].targetId = String(best.id);
          // Update accuracy panel for this fleet with accuracy calculation
          const panel = document.getElementById(`accuracyPanel${fid === 1 ? '' : fid}`);
          if (panel) {
            try {
              const leader = getFleetLeader(fid);
              if (leader && leader.state && leader.state.ship) {
                const dx = best.x - leader.state.ship.x;
                const dy = best.y - leader.state.ship.y;
                const distance = Math.hypot(dx, dy);
                const maxRange = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 20000;
                const accuracy = Math.max(10, Math.min(95, 95 - (distance / maxRange) * 60));
                panel.textContent = `Accuracy: ${Math.round(accuracy)}%`;
              } else {
                panel.textContent = 'Accuracy: --%';
              }
            } catch {
              panel.textContent = 'Accuracy: --%';
            }
          }
          // Start per-fleet solution timer and show this fleet's progress bar
          try {
            window.FleetSolutionCalc = window.FleetSolutionCalc || { 1:{},2:{},3:{} };
            const sc = window.FleetSolutionCalc[fid] || (window.FleetSolutionCalc[fid] = {});
            sc.active = true;
            sc.start = performance.now();
            sc.duration = computeSolutionDurationSec() * 1000;
            const btnF = document.querySelector(`#navalDock .get-firing-solution-btn[data-fleet="${fid}"]`);
            if (btnF) {
              let trackF = btnF.querySelector('.solution-progress');
              if (!trackF) {
                trackF = document.createElement('div');
                trackF.className = 'solution-progress';
                const barF = document.createElement('div');
                barF.className = 'bar';
                trackF.appendChild(barF);
                btnF.appendChild(trackF);
              }
              trackF.style.display = 'block';
              const barF = trackF.querySelector('.bar');
              if (barF) barF.style.width = '0%';
            }
          } catch {}
        } else {
          // No target found, clear accuracy
          const panel = document.getElementById(`accuracyPanel${fid === 1 ? '' : fid}`);
          if (panel) panel.textContent = 'Accuracy: --%';
        }
        // Exit targeting mode
        window.FleetTargetingMode = { active: false, fid: 0 };
        const btn = document.querySelector(`.get-firing-solution-btn[data-fleet="${fid}"]`);
        if (btn) btn.classList.remove('active');
        // Stop propagation to avoid interpreting as move/placement
        if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
        else if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
        evt.preventDefault();
        return;
      }
    } catch {}
    // Solution placement: allow for all fleets when armed
    try {
      const currentFleet = window.IronTideSelectedFleet || 1;
      let solutionArmed = false;
      
      if (currentFleet === 1) {
        solutionArmed = gunnery && gunnery.enabled && window.gunnerySolutionArmed;
      } else {
        window.FleetGunnery = window.FleetGunnery || { 2: {}, 3: {} };
        const g = window.FleetGunnery[currentFleet];
        solutionArmed = g && g.solutionArmed;
      }
      
      if (solutionArmed) {
        const w = screenToWorld(p.x, p.y);
        
        if (currentFleet === 1) {
          // Fleet 1 uses original firingSolution
          if (typeof firingSolution !== 'object' || !firingSolution) window.firingSolution = {};
          firingSolution.target = { x: w.x, y: w.y };
          firingSolution.targetId = null;
          firingSolution.placing = false;
          firingSolution.hover = null;
          
          // Disarm Fleet 1 solution mode
          window.gunnerySolutionArmed = false;
          const solutionBtn = document.querySelector('.get-firing-solution-btn[data-fleet="1"]');
          if (solutionBtn) solutionBtn.classList.remove('active');
        } else {
          // Fleet 2/3 use FleetGunnery state
          window.FleetGunnery = window.FleetGunnery || { 2: {}, 3: {} };
          const g = window.FleetGunnery[currentFleet];
          g.target = { x: w.x, y: w.y };
          g.targetId = null; // Clear any ship target when placing pin
          // Start this fleet's solution timer so green logic can complete when ready
          try { if (typeof startFleetSolutionTimer === 'function') startFleetSolutionTimer(currentFleet); } catch {}
          
          // Update accuracy panel
          const panel = document.getElementById(`accuracyPanel${currentFleet === 1 ? '' : currentFleet}`);
          if (panel) {
            try {
              const leader = getFleetLeader(currentFleet);
              if (leader && leader.state && leader.state.ship) {
                const dx = w.x - leader.state.ship.x;
                const dy = w.y - leader.state.ship.y;
                const distance = Math.hypot(dx, dy);
                const maxRange = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 20000;
                const accuracy = Math.max(10, Math.min(95, 95 - (distance / maxRange) * 60));
                panel.textContent = `Accuracy: ${Math.round(accuracy)}%`;
              } else {
                panel.textContent = 'Accuracy: --%';
              }
            } catch {
              panel.textContent = 'Accuracy: --%';
            }
          }
          
          // Disarm Fleet 2/3 solution mode
          g.solutionArmed = false;
          const solutionBtn = document.querySelector(`.get-firing-solution-btn[data-fleet="${currentFleet}"]`);
          if (solutionBtn) {
            solutionBtn.classList.remove('active');
            solutionBtn.setAttribute('aria-pressed', 'false');
          }
        }
        
        console.log(`Fleet ${currentFleet} manual target placed at (${w.x}, ${w.y})`);
        try { setPinCursor(false); } catch {}
        // Do not change heading or move target when placing a solution pin
        return;
      }
    } catch {}
    // If we're placing or dragging the Solution target, ignore general click-to-move logic
    try {
      if (firingSolution && (firingSolution.placing || firingSolution.dragging)) {
        return;
      }
    } catch {}
    // Zoom-out slider interaction
    if (hitZoomOutSlider(p.x, p.y)) {
      zoomOutSlider.dragging = true;
      setZoomOutFromPos(p.y);
      return;
    }
    // Start dragging Zig-Zag pins if hovered (two-pin mode)
    const zHit = hitTestZigPin(p.x, p.y);
    if (zHit >= 0) {
      patterns.zigDraggingIndex = zHit;
      canvas.style.cursor = 'grabbing';
      // Show options while manipulating the pin
      if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
      return;
    }
    // Legacy single-pin drag
    if (patterns.pin && hitTestPin(p.x, p.y)) {
      patterns.draggingPin = true;
      canvas.style.cursor = 'grabbing';
      if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
      return;
    }
    // Start dragging Box Patrol pin/corner if hovered (during placement or finalized)
    const boxHit = hitTestBoxPin(p.x, p.y);
    if (boxHit >= 0) {
      patterns.boxDraggingIndex = boxHit;
      canvas.style.cursor = 'grabbing';
      if (patterns.pendingSelection === 'box') {
        // Keep placing UI visible
        if (boxOptionsEl) { boxOptionsEl.classList.add('show'); boxOptionsEl.setAttribute('aria-hidden', 'false'); }
      }
      return;
    }
    // Start dragging Circle pin if hovered
    const circHit = hitTestCirclePin(p.x, p.y);
    if (circHit >= 0) {
      patterns.circleDraggingIndex = circHit;
      canvas.style.cursor = 'grabbing';
      if (circleOptionsEl) { circleOptionsEl.classList.add('show'); circleOptionsEl.setAttribute('aria-hidden','false'); }
      return;
    }
    // Start dragging Free Draw pin if hovered (but NOT during placement; placement clicks should close loop)
    const freeDrawHit = hitTestFreeDrawPin(p.x, p.y);
    if (freeDrawHit >= 0 && patterns.pendingSelection !== 'freedraw') {
      patterns.freeDrawDraggingIndex = freeDrawHit;
      canvas.style.cursor = 'grabbing';
      if (freeDrawOptionsEl) { freeDrawOptionsEl.classList.add('show'); freeDrawOptionsEl.setAttribute('aria-hidden','false'); }
      return;
    }
    // Pattern pin placement takes precedence over normal click-to-move
    // Placing pin for other patterns (generic fallback):
    if (patterns.placingPin && patterns.pendingSelection && patterns.pendingSelection !== 'zigzag' && patterns.pendingSelection !== 'box' && patterns.pendingSelection !== 'circle' && patterns.pendingSelection !== 'freedraw') {
      const w = screenToWorld(p.x, p.y);
      // Clear existing pattern and switch to the new pattern
      clearPattern();
      // Adopt the pending selection (string value), if any
      patterns.selected = patterns.pendingSelection;
      patterns.pendingSelection = null;
      // For now, set a move target to avoid drifting; future: plan other patterns here
      ship.moveTarget = { x: w.x, y: w.y };
      
      // Immediately save to fleet patterns so it's visible
      const currentFleet = window.IronTideSelectedFleet || 1;
      if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
        window.FleetPatterns[currentFleet] = JSON.parse(JSON.stringify(patterns));
      }
      patterns.placingPin = false;
      setPinCursor(false);
      if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
      // Hide Zig-Zag options if open
      if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden', 'true'); }
      return;
    }
    if (patterns.placingPin && patterns.pendingSelection === 'box') {
      const w = screenToWorld(p.x, p.y);
      patterns.boxPins = patterns.boxPins || [];
      patterns.boxPins.push({ x: w.x, y: w.y });
      // Show accumulating pins; wait until 4 are placed
      if (patterns.boxPins.length < 4) {
        return; // keep placing
      }
      // Finalize Box: copy pins BEFORE clearing any existing pattern
      let pts = patterns.boxPins.slice(0, 4);
      // Now clear existing pattern (e.g., Zig-Zag) and switch to box
      clearPattern();
      patterns.selected = 'box';
      // Normalize stored path orientation to CW (screen y-down => area>0 is CW)
      const area = polygonSignedArea(pts);
      const isCw = area > 0;
      if (!isCw) pts.reverse();
      // Set as path; for looped traversal we do not duplicate the start point
      patterns.path = pts;
      // Loop flag from UI
      patterns.loop = !!patterns.boxLoop;
      patterns.guiding = true;
      
      // Immediately save to fleet patterns so it's visible
      const currentFleet = window.IronTideSelectedFleet || 1;
      if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
        window.FleetPatterns[currentFleet] = JSON.parse(JSON.stringify(patterns));
      }
      // Begin movement toward first segment from current ship position
      const cp = closestPointOnPolyline(patterns.path, ship.x, ship.y) || { segIndex:0, t:0, point: pts[0] };
      const ahead = moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, 10) || pts[0];
      ship.moveTarget = { x: ahead.x, y: ahead.y };
      // Exit placement mode; clear pending selection
      patterns.placingPin = false;
      patterns.pendingSelection = null;
      patterns.boxPins = [];
      setPinCursor(false);
      if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
      // Show Box options window (keep visible)
      if (boxOptionsEl) { boxOptionsEl.classList.add('show'); boxOptionsEl.setAttribute('aria-hidden','false'); }
      return;
    }
    // 2) Placing pin for Free Draw (unlimited pins, close loop by clicking first pin)
    if (patterns.placingPin && patterns.pendingSelection === 'freedraw') {
      const w = screenToWorld(p.x, p.y);
      patterns.freeDrawPins = patterns.freeDrawPins || [];
      
      // Check if clicking on the first pin to close the loop
      if (patterns.freeDrawPins.length >= 3) {
        const firstPin = patterns.freeDrawPins[0];
        const dist = Math.hypot(w.x - firstPin.x, w.y - firstPin.y);
        if (dist <= 28) { // Close loop if within 28 pixels of first pin (easier to click)
          // Finalize Free Draw: copy pins BEFORE clearing any existing pattern
          let pts = patterns.freeDrawPins.slice();
          // Clear existing pattern and switch to freedraw
          clearPattern();
          patterns.selected = 'freedraw';
          patterns.freeDrawComplete = true;
          // Set as path for looped traversal
          patterns.path = pts;
          patterns.loop = !!patterns.freeDrawLoop;
          patterns.guiding = true;
          
          // Immediately save to fleet patterns so it's visible
          const currentFleet = window.IronTideSelectedFleet || 1;
          if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
            window.FleetPatterns[currentFleet] = JSON.parse(JSON.stringify(patterns));
          }
          // Begin movement toward first segment from current ship position
          const cp = closestPointOnLoop(patterns.path, ship.x, ship.y) || { segIndex:0, t:0, point: pts[0] };
          const ahead = moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, 10) || pts[0];
          ship.moveTarget = { x: ahead.x, y: ahead.y };
          // Exit placement mode; clear pending selection
          patterns.placingPin = false;
          patterns.pendingSelection = null;
          patterns.freeDrawPins = [];
          setPinCursor(false);
          if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
          // Show Free Draw options window (keep visible)
          if (freeDrawOptionsEl) { freeDrawOptionsEl.classList.add('show'); freeDrawOptionsEl.setAttribute('aria-hidden','false'); }
          return;
        }
      }
      
      // Add new pin to the path
      patterns.freeDrawPins.push({ x: w.x, y: w.y });
      return; // keep placing more pins
    }
    // 3) Placing pin for Zig-Zag (deferred clear until now)
    if (patterns.placingPin && patterns.pendingSelection === 'zigzag') {
      const w = screenToWorld(p.x, p.y);
      // First click: always clear previous pattern and collect first zig pin
      if (!patterns.zigPins || patterns.zigPins.length === 0) {
        clearPattern();
        patterns.selected = 'zigzag';
        patterns.zigPins = [{ x: w.x, y: w.y }];
        patterns.guiding = true;
        // Stay in placement mode for second pin
        patterns.placingPin = true;
        setPinCursor(true);
        // Show Zig-Zag options; hide Box options
        if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
        if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
        return;
      } else if (patterns.zigPins.length >= 2) {
        // If we already have a complete zig-zag, clear it and start fresh
        clearPattern();
        patterns.selected = 'zigzag';
        patterns.zigPins = [{ x: w.x, y: w.y }];
        patterns.guiding = true;
        // Stay in placement mode for second pin
        patterns.placingPin = true;
        setPinCursor(true);
        // Show Zig-Zag options; hide Box options
        if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
        if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
        return;
      }
      // Second click: set end pin and build path
      if (patterns.zigPins.length === 1) {
        patterns.zigPins.push({ x: w.x, y: w.y });
        const start = patterns.zigPins[0];
        const end = patterns.zigPins[1];
        patterns.path = planZigZagPath(start, end, getZigParams());
        patterns.currentIdx = 1;
        if (patterns.path.length > 1) {
          ship.moveTarget = { x: patterns.path[1].x, y: patterns.path[1].y };
        }
        
        // Immediately save to fleet patterns so it's visible
        const currentFleet = window.IronTideSelectedFleet || 1;
        if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
          window.FleetPatterns[currentFleet] = JSON.parse(JSON.stringify(patterns));
        }
        
        // Exit placement
        patterns.placingPin = false;
        patterns.pendingSelection = null;
        setPinCursor(false);
        if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
        // Keep Zig-Zag options visible
        if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
        if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
        return;
      }
    }
    // 3) Placing pins for Tight Circle (two antipodal points) â€” clone Box flow
    if (patterns.placingPin && patterns.pendingSelection === 'circle') {
      const w = screenToWorld(p.x, p.y);
      patterns.circlePins = patterns.circlePins || [];
      patterns.circlePins.push({ x: w.x, y: w.y });
      // Keep helper visible during placement
      if (circleOptionsEl) { circleOptionsEl.classList.add('show'); circleOptionsEl.setAttribute('aria-hidden','false'); }
      if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden','true'); }
      if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden','true'); }
      // Wait until 2 pins are placed
      if (patterns.circlePins.length < 2) {
        return; // keep placing
      }
      // Finalize Circle: build path from collected pins (do not clear the pins)
      const pts = patterns.circlePins.slice(0, 2);
      // Clear any previous pattern content but preserve the two pins
      patterns.selected = 'circle';
      patterns.path = buildCirclePathFromAntipodal(pts[0], pts[1], 72, !!patterns.circleCw);
      patterns.loop = !!patterns.circleLoop;
      patterns.guiding = true;
      
      // Immediately save to fleet patterns so it's visible
      const currentFleet = window.IronTideSelectedFleet || 1;
      if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
        window.FleetPatterns[currentFleet] = JSON.parse(JSON.stringify(patterns));
      }
      // Begin movement toward path from current ship position
      const cpC = closestPointOnLoop(patterns.path, ship.x, ship.y) || { segIndex:0, t:0, point: patterns.path[0] };
      const aheadC = moveAlongPathLooped(patterns.path, cpC.segIndex, cpC.t, 10) || patterns.path[0];
      ship.moveTarget = { x: aheadC.x, y: aheadC.y };
      // Exit placement: clear pending selection and temp pins
      patterns.placingPin = false;
      patterns.pendingSelection = null;
      setPinCursor(false);
      if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
      // Keep Circle helper visible
      if (circleOptionsEl) { circleOptionsEl.classList.add('show'); circleOptionsEl.setAttribute('aria-hidden','false'); }
      return;
    }
    // Legacy single-pin zig placement (fallback)
    if (patterns.placingPin && patterns.selected === 'zigzag' && (!patterns.zigPins || patterns.zigPins.length === 0)) {
      const w = screenToWorld(p.x, p.y);
      patterns.pin = { x: w.x, y: w.y };
      // Plan zig-zag from current ship position to pin
      patterns.path = planZigZagPath({ x: ship.x, y: ship.y }, patterns.pin, getZigParams());
      patterns.currentIdx = 1; // start moving toward first segment point
      patterns.placingPin = false;
      // Ensure we begin following the planned path
      if (patterns.path.length > 1) {
        ship.moveTarget = { x: patterns.path[1].x, y: patterns.path[1].y };
      }
      // Revert cursor and highlight
      setPinCursor(false);
      if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
      // Keep options visible while Zig-Zag is active
      if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
      return;
    }
    // DOM compasses handle heading/aim; canvas click sets move target
    const w = screenToWorld(p.x, p.y);
    
    // Check for fleet targeting modes
    if (window.fleet2TargetingMode) {
      const fleetSettings = window.IronTideFleetSettings && window.IronTideFleetSettings[2];
      if (fleetSettings) {
        fleetSettings.firingSolution = fleetSettings.firingSolution || {};
        fleetSettings.firingSolution.target = { x: w.x, y: w.y };
        fleetSettings.firingSolution.targetId = null;
        console.log(`Fleet 2 target set at (${w.x.toFixed(1)}, ${w.y.toFixed(1)})`);
        
        // Update display
        const display = document.getElementById('fleet2TargetDisplay');
        if (display) display.textContent = `Target: (${w.x.toFixed(0)}, ${w.y.toFixed(0)})`;
      }
      window.fleet2TargetingMode = false;
      return;
    }
    
    if (window.fleet3TargetingMode) {
      const fleetSettings = window.IronTideFleetSettings && window.IronTideFleetSettings[3];
      if (fleetSettings) {
        fleetSettings.firingSolution = fleetSettings.firingSolution || {};
        fleetSettings.firingSolution.target = { x: w.x, y: w.y };
        fleetSettings.firingSolution.targetId = null;
        console.log(`Fleet 3 target set at (${w.x.toFixed(1)}, ${w.y.toFixed(1)})`);
        
        // Update display
        const display = document.getElementById('fleet3TargetDisplay');
        if (display) display.textContent = `Target: (${w.x.toFixed(0)}, ${w.y.toFixed(0)})`;
      }
      window.fleet3TargetingMode = false;
      return;
    }
    
    // If Gunnery is enabled and Solution is armed, do not treat canvas clicks as move commands
    if (!(gunnery && gunnery.enabled && window.gunnerySolutionArmed)) {
      const sel = (window.IronTideSelectedFleet || 1);
      window.IronTideFleetStates = window.IronTideFleetStates || {};
      window.IronTideFleetStates[sel] = window.IronTideFleetStates[sel] || { desiredHeading: 0, speedKts: 0, moveTarget: null };
      
      if (sel === 1) {
        // Fleet 1: If no active pattern guidance, set a fixed desired heading and clear moveTarget
        const fp = (window.FleetPatterns && window.FleetPatterns[1]) || null;
        const patternActive = !!(fp && fp.selected && fp.path && fp.path.length > 1 && fp.guiding !== false);
        if (!patternActive) {
          // Calculate heading from ship to click point
          const dx = w.x - ship.x;
          const dy = w.y - ship.y;
          const heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          ship.desiredHeading = heading;
          // Lock out click-to-move overrides
          ship.moveTarget = null;
          // Latch turning direction toward the new heading so the update loop actively turns using speed curve
          try {
            const d = ((heading - ship.heading + 540) % 360) - 180; // -180..180
            if (Math.abs(d) > 0.5) {
              if (d > 0) { latchedTurnDir = 1; } else { latchedTurnDir = -1; }
            }
          } catch {}
          // Persist to fleet state for UI
          try { window.IronTideFleetStates[1].desiredHeading = heading; } catch {}
          // Engage manual heading hold so the ship will turn in place toward desired heading
          try { window.IronTideManualHeadingHold = window.IronTideManualHeadingHold || { 1:false,2:false,3:false }; window.IronTideManualHeadingHold[1] = true; } catch {}
          // Mirror to fleet leader state for consistency with compass behavior
          try {
            const leader = getFleetLeader(1);
            if (leader && leader.state) {
              leader.state.desiredHeading = heading;
              if (leader.state.ship) leader.state.ship.desiredHeading = heading;
            }
          } catch {}
          // Update main fleet compass white needle immediately if Fleet 1 selected
          try {
            const fcPlanned = document.querySelector('#fleetCompass .needle.planned');
            if (fcPlanned && typeof setNeedle === 'function') setNeedle(fcPlanned, heading);
          } catch {}
          console.log(`Fleet 1 heading set to ${heading.toFixed(1)}Â° via screen click (hold)`);
        }
      } else {
        // Fleet 2/3: Set move target and heading for fleet leader
        window.IronTideFleetStates[sel].moveTarget = { x: w.x, y: w.y };
        
        const fleetLeader = getFleetLeader(sel);
        if (fleetLeader && fleetLeader.state && fleetLeader.state.ship) {
          const dx = w.x - fleetLeader.state.ship.x;
          const dy = w.y - fleetLeader.state.ship.y;
          const heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          
          fleetLeader.state.desiredHeading = heading;
          fleetLeader.state.ship.desiredHeading = heading;
          
          console.log(`Fleet ${sel} heading set to ${heading.toFixed(1)}Â° via screen click`);
        }
      }
    }
  }
  function pointerMove(evt) {
    const p = screenToCanvas(evt.touches ? evt.touches[0] : evt);
    if (zoomOutSlider.dragging) {
      setZoomOutFromPos(p.y);
      return;
    }
    // Dragging a Zig-Zag pin (two-pin mode): move and replan
    if (patterns.zigDraggingIndex >= 0 && patterns.selected === 'zigzag' && patterns.zigPins && patterns.zigPins.length) {
      const w = screenToWorld(p.x, p.y);
      const i = patterns.zigDraggingIndex;
      if (patterns.zigPins[i]) { patterns.zigPins[i].x = w.x; patterns.zigPins[i].y = w.y; }
      if (patterns.zigPins.length === 2) {
        const start = patterns.zigPins[0];
        const end = patterns.zigPins[1];
        patterns.path = planZigZagPath(start, end, getZigParams());
        patterns.currentIdx = Math.min(1, patterns.path.length - 1);
        if (patterns.path.length > 1) ship.moveTarget = { x: patterns.path[1].x, y: patterns.path[1].y };
      }
      return;
    }
    // Legacy: dragging the single zig pin
    if (patterns.draggingPin && patterns.selected === 'zigzag' && patterns.pin) {
      const w = screenToWorld(p.x, p.y);
      patterns.pin.x = w.x; patterns.pin.y = w.y;
      patterns.path = planZigZagPath({ x: ship.x, y: ship.y }, patterns.pin, getZigParams());
      // Restart waypoint following
      patterns.currentIdx = Math.min(1, patterns.path.length - 1);
      if (patterns.path.length > 1) ship.moveTarget = { x: patterns.path[1].x, y: patterns.path[1].y };
      return;
    }
    // Dragging a Circle pin: move and rebuild circle path
    if (patterns.circleDraggingIndex >= 0 && patterns.selected === 'circle' && patterns.circlePins && patterns.circlePins.length === 2) {
      const w = screenToWorld(p.x, p.y);
      const i = patterns.circleDraggingIndex;
      patterns.circlePins[i].x = w.x;
      patterns.circlePins[i].y = w.y;
      const start = patterns.circlePins[0];
      const opp = patterns.circlePins[1];
      patterns.path = buildCirclePathFromAntipodal(start, opp, 72, !!patterns.circleCw);
      // Retain guidance and target along updated path
      const cp = closestPointOnLoop(patterns.path, ship.x, ship.y);
      const ahead = cp ? moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, 10) : patterns.path[1];
      if (ahead) ship.moveTarget = { x: ahead.x, y: ahead.y };
      return;
    }
    // Dragging a Free Draw pin: move and rebuild path
    if (patterns.freeDrawDraggingIndex >= 0) {
      const w = screenToWorld(p.x, p.y);
      if (patterns.pendingSelection === 'freedraw' && patterns.freeDrawPins && patterns.freeDrawPins[patterns.freeDrawDraggingIndex]) {
        patterns.freeDrawPins[patterns.freeDrawDraggingIndex].x = w.x;
        patterns.freeDrawPins[patterns.freeDrawDraggingIndex].y = w.y;
      } else if (patterns.selected === 'freedraw' && patterns.path && patterns.path[patterns.freeDrawDraggingIndex]) {
        patterns.path[patterns.freeDrawDraggingIndex].x = w.x;
        patterns.path[patterns.freeDrawDraggingIndex].y = w.y;
        // Update ship target to follow the modified path
        const cp = closestPointOnLoop(patterns.path, ship.x, ship.y);
        const ahead = cp ? moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, 10) : patterns.path[1];
        if (ahead) ship.moveTarget = { x: ahead.x, y: ahead.y };
      }
      return;
    }
    // Dragging a Box Patrol pin/corner
    if (patterns.boxDraggingIndex >= 0) {
      const w = screenToWorld(p.x, p.y);
      if (patterns.pendingSelection === 'box' && patterns.boxPins && patterns.boxPins[patterns.boxDraggingIndex]) {
        patterns.boxPins[patterns.boxDraggingIndex].x = w.x;
        patterns.boxPins[patterns.boxDraggingIndex].y = w.y;
      } else if (patterns.selected === 'box' && patterns.path && patterns.path[patterns.boxDraggingIndex]) {
        patterns.path[patterns.boxDraggingIndex].x = w.x;
        patterns.path[patterns.boxDraggingIndex].y = w.y;
      }
      return;
    }
    // Update hover cursor feedback
    updateCursorForPointer(p.x, p.y);
    // Compass dragging moved to DOM widgets
  }
  function pointerUp() { 
    compassUI.dragging = false; 
    turretCompassUI.dragging = false; 
    zoomOutSlider.dragging = false; 
    patterns.draggingPin = false; 
    patterns.zigDraggingIndex = -1;
    patterns.boxDraggingIndex = -1;
    patterns.circleDraggingIndex = -1;
    patterns.freeDrawDraggingIndex = -1;
  }

  // Delete whole Box loop on double-clicking any box pin/corner
  function pointerDblClick(evt) {
    const p = screenToCanvas(evt);
    const hit = hitTestBoxPin(p.x, p.y);
    if (hit >= 0 && patterns.selected === 'box') {
      // Clear the entire box loop
      clearPattern();
      // Hide box window if open
      if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden','true'); }
    } else if (hit >= 0 && patterns.pendingSelection === 'box') {
      // During placement, remove that pending pin
      try { patterns.boxPins.splice(hit, 1); } catch {}
    } else {
      // Check for fleet targeting pin removal first
      const w = screenToWorld(p.x, p.y);
      const currentFleet = window.IronTideSelectedFleet || 1;
      let removedPin = false;
      
      // Check if near any fleet's targeting pin
      for (let fid = 1; fid <= 3; fid++) {
        let target = null;
        if (fid === 1) {
          target = (typeof firingSolution === 'object' && firingSolution && firingSolution.target) ? firingSolution.target : null;
        } else {
          window.FleetGunnery = window.FleetGunnery || { 2: {}, 3: {} };
          const g = window.FleetGunnery[fid] || {};
          target = g.target;
        }
        
        if (target && Math.hypot(w.x - target.x, w.y - target.y) <= 100) {
          // Remove this fleet's pin
          if (fid === 1) {
            if (typeof firingSolution === 'object' && firingSolution) {
              firingSolution.target = null;
              firingSolution.targetId = null;
              firingSolution.hover = null;
              firingSolution.dragging = false;
            }
          } else {
            const g = window.FleetGunnery[fid] || {};
            g.target = null;
            g.targetId = null;
          }
          removedPin = true;
          console.log(`Removed Fleet ${fid} targeting pin`);
          break;
        }
      }
      
      if (!removedPin) {
        // Zig-Zag removal: double-click any zig pin (two-pin mode or legacy)
        const zh = hitTestZigPin(p.x, p.y);
        if (zh >= 0 && patterns.selected === 'zigzag') {
          patterns.path = [];
          patterns.zigPins = [];
          patterns.pin = null;
          patterns.currentIdx = 0;
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          // Keep zig options visible
          if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden','false'); }
        } else if (patterns.pin && hitTestPin(p.x, p.y)) {
          // Legacy single-pin remove
          patterns.path = [];
          patterns.pin = null;
          patterns.currentIdx = 0;
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
        }
      }
    }
  }

  function setHeadingFromVector(dx, dy) {
    // Canvas 0deg is to the right; we want 0deg pointing up visually on compass.
    // Use atan2 to compute bearing from compass center to pointer, then convert so 0 is up.
    let angRad = Math.atan2(dy, dx); // -PI..PI, 0 is right
    let deg = angRad * 180 / Math.PI; // 0 right, 90 down, -90 up
    deg = (deg + 450) % 360; // rotate so 0 is up
    // Block player override when rudder is jammed
    try { if (shipState && shipState.effects && shipState.effects.rudderJam) return; } catch {}
    ship.desiredHeading = deg;
  }

  // Turret angle control
  // desiredTurretWorldDeg: absolute world/map angle selected by the turret compass (0 up/screen north)
  // Per-turret relative angles (degrees) keyed by turret id
  let desiredTurretWorldDeg = 0;
  const turretAnglesRelDeg = { t1: 0, t2: 0, t3: 180, t4: 180 };
  const turretMaxSpeedDeg = 40; // deg/sec rotation speed limit for turrets (slower)
  const TURN_RATE_MAX_FULL = 45; // deg/sec at full rudder effectiveness

  function angleNorm360(a){ a%=360; if(a<0) a+=360; return a; }
  function angDist(a,b){ // shortest signed distance a->b in degrees (-180..180)
    let d = angleNorm360(b) - angleNorm360(a);
    if (d > 180) d -= 360; if (d < -180) d += 360; return d;
  }

  // Step heading only in allowed direction when specified by user (turnDir)
  function stepHeadingOneDir(currentDeg, targetDeg, maxStepDeg, dir) {
    currentDeg = angleNorm360(currentDeg); targetDeg = angleNorm360(targetDeg);
    if (dir > 0) {
      // Clockwise only
      const cw = (targetDeg - currentDeg + 360) % 360; // 0..360
      const step = Math.min(maxStepDeg, cw);
      return angleNorm360(currentDeg + step);
    } else if (dir < 0) {
      // Counter-clockwise only
      const ccw = (currentDeg - targetDeg + 360) % 360; // 0..360
      const step = Math.min(maxStepDeg, ccw);
      return angleNorm360(currentDeg - step);
    } else {
      // Free: shortest path
      const d = angDist(currentDeg, targetDeg);
      const step = Math.max(-maxStepDeg, Math.min(maxStepDeg, d));
      return angleNorm360(currentDeg + step);
    }
  }

  // Rudder effectiveness delegates exclusively to shipState
  function rudderEffectiveness(ktsAbs) {
    return shipState.rudderEffectiveness(Math.abs(ktsAbs||0));
  }

  // Wind system: slowly varying wind direction over long periods (~10 minutes)
  const wind = {
    currentDeg: Math.random() * 360,
    targetDeg: Math.random() * 360,
    // Max rotation speed so a full 360Â° takes a few minutes (~3 min => ~2Â°/s)
    maxSpeedDegPerSec: 2.0,
    // Retarget every ~3 minutes
    retargetIntervalSec: 180,
    retimer: 0,
    arrowEl: null,
    speedEl: null,
    // Wind speed (kts). Start random, change slowly over minutes
    currentSpeed: 5 + Math.random() * 20, // 5..25 kts
    targetSpeed: 5 + Math.random() * 20,
    maxSpeedKtsPerSec: 0.1, // gentle changes over minutes
  };
  function initWind() {
    wind.arrowEl = document.getElementById('windArrow');
    wind.speedEl = document.getElementById('windSpeedKts');
    // Initial render
    if (!wind.arrowEl) {
      wind.arrowEl = document.getElementById('windArrow');
    }
    if (wind.arrowEl) {
      wind.arrowEl.style.transform = `translate(-50%, -50%) rotate(${wind.currentDeg}deg)`;
    }
    if (wind.speedEl) {
      wind.speedEl.textContent = `${Math.round(wind.currentSpeed)} kts`;
    }
  }
  function updateWind(dt) {
    // Smoothly step current toward target within max speed
    const diff = angDist(wind.currentDeg, wind.targetDeg); // -180..180
    const step = Math.max(-wind.maxSpeedDegPerSec * dt, Math.min(wind.maxSpeedDegPerSec * dt, diff));
    wind.currentDeg = angleNorm360(wind.currentDeg + step);
    // Step wind speed toward target
    const sdiff = wind.targetSpeed - wind.currentSpeed;
    const sstep = Math.max(-wind.maxSpeedKtsPerSec * dt, Math.min(wind.maxSpeedKtsPerSec * dt, sdiff));
    wind.currentSpeed = Math.max(0, wind.currentSpeed + sstep);
    wind.retimer += dt;
    if (wind.retimer >= wind.retargetIntervalSec) {
      wind.retimer = 0;
      // Choose new target within +/-120Â° of current to avoid wild swings
      const delta = (Math.random() * 240) - 120; // -120..+120
      wind.targetDeg = angleNorm360(wind.currentDeg + delta);
      // New wind speed target within reasonable range
      wind.targetSpeed = 5 + Math.random() * 20;
    }
    if (!wind.arrowEl) {
      wind.arrowEl = document.getElementById('windArrow');
    }
    if (wind.arrowEl) {
      wind.arrowEl.style.transform = `translate(-50%, -50%) rotate(${wind.currentDeg}deg)`;
    }
    // Update wind speed readout live
    if (!wind.speedEl) {
      wind.speedEl = document.getElementById('windSpeedKts');
    }
    if (wind.speedEl) {
      try { wind.speedEl.textContent = `${Math.round(wind.currentSpeed)} kts`; } catch {}
    }
  }
  function projectOutOfDeadZone(angle, start, end){
    // start..end inclusive is dead; handle wrap if start > end
    angle = angleNorm360(angle);
    if (start <= end) {
      if (angle >= start && angle <= end) {
        const dToStart = Math.abs(angDist(angle, start));
        const dToEnd = Math.abs(angDist(angle, end));
        return dToStart < dToEnd ? start : end;
      }
      return angle;
    } else { // wrapped interval (e.g., 325..55)
      if (angle >= start || angle <= end) {
        const dToStart = Math.abs(angDist(angle, start));
        const dToEnd = Math.abs(angDist(angle, end));
        return dToStart < dToEnd ? start : end;
      }
      return angle;
    }
  }

  function setTurretAngleFromVector(dx, dy) {
    // Similar mapping as ship: 0 is up (bow), increasing clockwise
    let angRad = Math.atan2(dy, dx);
    let deg = angRad * 180 / Math.PI;
    deg = (deg + 450) % 360; // 0 up in screen space (world angle)
    desiredTurretWorldDeg = deg;
  }

  canvas.addEventListener('mousedown', pointerDown);
  canvas.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  canvas.addEventListener('dblclick', pointerDblClick);
  // (Touch handlers and other init code remain managed elsewhere in DOM-specific sections)
  function pinchStart(evt) {
    if (!evt.touches || evt.touches.length < 2) return;
    pinch.active = true;
    const t0 = evt.touches[0], t1 = evt.touches[1];
    const r = canvas.getBoundingClientRect();
    const x0 = t0.clientX - r.left, y0 = t0.clientY - r.top;
    const x1 = t1.clientX - r.left, y1 = t1.clientY - r.top;
    pinch.startDist = Math.hypot(x1 - x0, y1 - y0);
    pinch.startZoom = camera.zoom;
    pinch.midScreen = { x: (x0 + x1)/2, y: (y0 + y1)/2 };
    evt.preventDefault();
  }
  function pinchMove(evt) {
    if (!evt.touches || evt.touches.length < 2) return;
    const t0 = evt.touches[0], t1 = evt.touches[1];
    const r = canvas.getBoundingClientRect();
    const x0 = t0.clientX - r.left, y0 = t0.clientY - r.top;
    const x1 = t1.clientX - r.left, y1 = t1.clientY - r.top;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    if (pinch.startDist > 0) {
      const factor = dist / pinch.startDist;
      // Zoom around pinch midpoint
      const before = screenToWorld(pinch.midScreen.x, pinch.midScreen.y);
      camera.zoom = clampZoom(pinch.startZoom * factor);
      const after = screenToWorld(pinch.midScreen.x, pinch.midScreen.y);
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      camera.cx -= dx;
      camera.cy -= dy;
    }
    evt.preventDefault();
  }

  // Load TMX
  async function loadTMX(url) {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');

    // Map attributes
    const map = xml.querySelector('map');
    const cols = parseInt(map.getAttribute('width') || '32', 10);
    const rows = parseInt(map.getAttribute('height') || '32', 10);
    const tileW = parseInt(map.getAttribute('tilewidth') || '32', 10);
    const tileH = parseInt(map.getAttribute('tileheight') || '32', 10);
    mapGrid = { cols, rows, tileW, tileH };

    // Imagelayer (background)
    const imgLayer = xml.querySelector('imagelayer image');
    if (imgLayer) {
      const src = imgLayer.getAttribute('source');
      const iw = parseInt(imgLayer.getAttribute('width') || '1024', 10);
      const ih = parseInt(imgLayer.getAttribute('height') || '1024', 10);
      mapPixelSize = { w: iw, h: ih };
      mapImg = await loadImage('assets/' + src.replace(/^\.\/?/, ''));
    }

    // Collision layer: read CSV data and mark gid>0 as collidable
    const layer = xml.querySelector('layer[name]');
    let csv = '';
    if (layer) {
      const dataNode = layer.querySelector('data');
      if (dataNode && dataNode.getAttribute('encoding') === 'csv') {
        csv = dataNode.textContent.trim();
      }
    }
    const values = csv.split(/\s*,\s*|\s*\n\s*/).filter(s => s.length > 0).map(v => parseInt(v, 10));
    collision = new Array(cols * rows).fill(false);
    for (let i = 0; i < values.length && i < collision.length; i++) {
      collision[i] = values[i] > 0;
    }
  }

  // Load BSTMX ship (image + turret object positions)
  async function loadShipTMX(url) {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    // Load ship image
    const imageLayer = xml.querySelector('imagelayer image');
    if (imageLayer) {
      const src = imageLayer.getAttribute('source');
      shipImg = await loadImage('assets/' + src.replace(/^\/\.?/, ''));
    }

    // Turret object points with string IDs (t2, t3, t4, t5)
    turretPoints = [];
    xml.querySelectorAll('objectgroup[name="turrets"] object').forEach(obj => {
      const x = parseFloat(obj.getAttribute('x') || '0');
      const y = parseFloat(obj.getAttribute('y') || '0');
      // Find the turret ID from properties (t1, t2, t3, t4)
      let turretId = null;
      const props = obj.querySelectorAll('property');
      for (const prop of props) {
        const name = prop.getAttribute('name') || '';
        if (name.startsWith('t') && prop.getAttribute('value') === 'turret') {
          turretId = name; // This will be 't1', 't2', 't3', or 't4'
          break;
        }
      }
      if (turretId) {
        turretPoints.push({ id: turretId, x, y });
      }
    });

    // Load turret sprite
    turretImg = await loadImage('assets/doublebarrel.png');
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Camera with 25% dead-zone scrolling and cover rendering
  const camera = {
    cx: 512, // center in world pixels
    cy: 512,
    zoom: 1, // 1 = default coverage; >1 shows more map (zoom out), <1 shows less (zoom in)
  };
  // Current frame's stabilized view rect (set once per frame)
  let currentViewRect = null;

  // Zoom helpers (zoom=1 shows the entire map fitted; >1 zooms in, <1 zooms out slightly if map is larger than canvas)
  function getZoomBounds() {
    const minZoomAllowed = 0.25; // match slider OUT value
    const maxZoomAllowed = 3.6;  // match slider IN value (additional 20%)
    return { min: minZoomAllowed, max: maxZoomAllowed };
  }
  function clampZoom(z) {
    const b = getZoomBounds();
    return Math.max(b.min, Math.min(z, b.max));
  }
  function zoomAt(factor, px, py) {
    // Keep the world point under (px,py) stable while zooming
    const before = screenToWorld(px, py);
    camera.zoom = clampZoom(camera.zoom * factor);
    const after = screenToWorld(px, py);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    camera.cx -= dx;
    camera.cy -= dy;
  }

  // Zoom Slider UI (top-left)
  const zoomSlider = { x: 16, y: 16, w: 22, h: 160, dragging: false };
  function zoomFromSliderPos(py) {
    const { y, h } = zoomSlider;
    // Inverted: top = zoom OUT (more map), bottom = zoom IN (more detail)
    const s = Math.max(0, Math.min(1, (py - y) / h)); // 0 top, 1 bottom
    const { min, max } = getZoomBounds();
    const ratio = max / min;
    const z = min * Math.pow(ratio, 1 - s); // s=0 -> max, s=1 -> min
    return clampZoom(z);
  }
  function sliderPosFromZoom() {
    const { min, max } = getZoomBounds();
    const z = clampZoom(camera.zoom);
    const ratio = max / min;
    const sRaw = Math.log(z / min) / Math.log(ratio); // 0..1, 0=min (zoom in), 1=max (zoom out)
    const s = 1 - (isFinite(sRaw) ? Math.max(0, Math.min(1, sRaw)) : 0);
    return zoomSlider.y + s * zoomSlider.h; // s=0 top, s=1 bottom
  }
  function drawZoomSlider() {
    const { x, y, w, h } = zoomSlider;
    ctx.save();
    // Brass track
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#3a3a3a');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#bfa76a';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // Knob (brass)
    const py = sliderPosFromZoom();
    const knobW = w + 12, knobH = 12;
    const kg = ctx.createLinearGradient(0, py - knobH/2, 0, py + knobH/2);
    kg.addColorStop(0, '#e7e1c1');
    kg.addColorStop(1, '#9e8f5a');
    ctx.fillStyle = kg;
    ctx.strokeStyle = '#5a4f2e';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 6, Math.round(py) - knobH/2, knobW, knobH);
    ctx.strokeRect(x - 6, Math.round(py) - knobH/2, knobW, knobH);
    // Icons
    ctx.fillStyle = '#bfa76a';
    ctx.font = 'bold 14px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('+', x + w/2, y - 4);
    ctx.textBaseline = 'top';
    ctx.fillText('-', x + w/2, y + h + 4);
    ctx.restore();
  }
  function hitZoomSlider(px, py) {
    const { x, y, w, h } = zoomSlider;
    return px >= x - 8 && px <= x + w + 8 && py >= y && py <= y + h;
  }

  function getViewRect() {
    // Base scale to fit entire map inside the canvas at zoom=1
    const baseScale = Math.min(width / mapPixelSize.w, height / mapPixelSize.h);
    const z = clampZoom(camera.zoom);
    const scale = baseScale * z;
    // View size in world pixels that maps exactly to canvas size
    let vw = Math.max(1, Math.round(width / scale));
    let vh = Math.max(1, Math.round(height / scale));
    // Centered at camera (no clamping -> free exploration, letterbox beyond edges)
    let sx = Math.round(camera.cx - vw / 2);
    let sy = Math.round(camera.cy - vh / 2);
    return { sx, sy, sw: vw, sh: vh, scale };
  }

  function worldToScreen(x, y) {
    const vr = currentViewRect || getViewRect();
    const { sx, sy, scale, sw, sh } = vr;
    return {
      x: (x - sx) * scale,
      y: (y - sy) * scale,
      sx, sy, sw, sh,
    };
  }

  function updateCamera() {
    // Follow either fleet leader, gunnery target, or player depending on view follow state
    try {
      const vf = window.viewFollow || { enabled: false, mode: 'player', fleetId: 1 };
      if (vf.enabled) {
        if (vf.mode === 'fleet') {
          const fid = vf.fleetId || (window.IronTideSelectedFleet || 1);
          const leader = getFleetLeader ? getFleetLeader(fid) : null;
          if (leader && leader.state && leader.state.ship) {
            camera.cx = leader.state.ship.x;
            camera.cy = leader.state.ship.y;
          } else {
            // Fallback to player if no leader found
            camera.cx = ship.x; camera.cy = ship.y;
          }
        } else if (vf.mode === 'ship') {
          // Follow a specific ship by id (used by Eye button HUD cycle)
          try {
            const idStr = vf.shipId != null ? String(vf.shipId) : '';
            if (idStr === 'player') {
              camera.cx = ship.x; camera.cy = ship.y;
            } else {
              const handle = (typeof getShipHandleById === 'function') ? getShipHandleById(idStr) : null;
              const isSunk = !!(handle && handle.state && (handle.state.effects?.sunk || handle.state.sunk));
              if (handle && handle.ship && !isSunk) {
                camera.cx = handle.ship.x; camera.cy = handle.ship.y;
              } else {
                // Stop following sunk/missing targets and fall back to player
                try { window.viewFollow.enabled = false; } catch {}
                camera.cx = ship.x; camera.cy = ship.y;
              }
            }
          } catch { camera.cx = ship.x; camera.cy = ship.y; }
        } else if (vf.mode === 'gunnery') {
          let tx = null, ty = null;
          try {
            const targets = collectOtherShips ? collectOtherShips() : [];
            const idx = window.FleetGunneryCycle && window.FleetGunneryCycle[1] ? window.FleetGunneryCycle[1].index : -1;
            const t = (targets && targets.length && idx >= 0) ? targets[idx % targets.length] : null;
            if (t) { tx = t.x; ty = t.y; }
          } catch {}
          if (tx == null && typeof firingSolution === 'object' && firingSolution && firingSolution.target) {
            tx = firingSolution.target.x; ty = firingSolution.target.y;
          }
          if (tx != null && ty != null) { camera.cx = tx; camera.cy = ty; }
          else { camera.cx = ship.x; camera.cy = ship.y; }
        } else {
          // Unknown mode -> follow player
          camera.cx = ship.x; camera.cy = ship.y;
        }
      } else {
        // Default: follow player ship
        camera.cx = ship.x;
        camera.cy = ship.y;
      }
    } catch {
      camera.cx = ship.x; camera.cy = ship.y;
    }
    currentViewRect = getViewRect();
  }

  function screenToWorld(px, py) {
    const vr = currentViewRect || getViewRect();
    const { sx, sy, scale } = vr;
    return {
      x: sx + px / scale,
      y: sy + py / scale,
    };
  }

  function collidesAt(x, y) {
    // Check dynamic colliders (e.g., islands)
    try {
      if (Array.isArray(islands) && islands.length) {
        // Approximate ship hull as a circle
        const r = 18; // world px radius
        const samples = 12;
        for (let i=0;i<samples;i++){
          const a = (i / samples) * Math.PI * 2;
          const sx = x + Math.cos(a) * r;
          const sy = y + Math.sin(a) * r;
          if (islandSolidAtWorld(sx, sy)) return true;
        }
      }
    } catch {}
    return false;
  }

  // Pattern/route planning state
  const patterns = {
    selected: null,         // 'zigzag' | 'box' | 'circle' | null
    placingPin: false,      // awaiting first click for pattern
    pin: null,              // Legacy zig end pin (kept for compatibility)
    path: [],               // [{x,y}] polyline for current plan
    loop: false,            // continuous loop (for box/circle later)
    currentIdx: 0,          // current waypoint index
    draggingPin: false,     // pin drag state
    zigForward: true,       // direction along zig-zag when looping (ping-pong)
    guiding: true,          // whether we actively guide along the zig-zag
    pendingSelection: null, // when switching patterns, hold new type until pin placed
    boxPins: [],            // temporary pins while plotting box patrol
    boxLoop: true,
    boxCw: true,
    boxDraggingIndex: -1,   // which box pin/corner is being dragged (-1 = none)
    // Zig-Zag two-pin mode
    zigPins: [],            // [ {x,y}, {x,y} ] => start, end
    zigDraggingIndex: -1,   // 0 or 1 when dragging a zig pin
    // Tight Circle
    circlePins: [],         // [ startPoint, oppositePoint ]
    circleCw: true,
    circleLoop: true,
    circleDraggingIndex: -1,
    // Free Draw
    freeDrawPins: [],       // [ {x,y}, {x,y}, ... ] => custom waypoints
    freeDrawCw: true,
    freeDrawLoop: true,
    freeDrawDraggingIndex: -1, // which free draw pin is being dragged (-1 = none)
    freeDrawComplete: false,   // true when loop is closed by clicking first pin
    // Figure Eight
    figurePins: [],         // [ centerPoint ] => center of figure eight
    figureCw: true,
    figureLoop: true,
    figureDraggingIndex: -1,
    // Oval Patrol
    ovalPins: [],           // [ centerPoint ] => center of oval
    ovalCw: true,
    ovalLoop: true,
    ovalDraggingIndex: -1
  };
  
  // Fleet-specific patterns - each fleet has its own pattern state
  window.FleetPatterns = window.FleetPatterns || {
    1: JSON.parse(JSON.stringify(patterns)), // Deep copy of default pattern state
    2: JSON.parse(JSON.stringify(patterns)),
    3: JSON.parse(JSON.stringify(patterns))
  };
  
  // Helper function to get the current fleet's pattern object
  function getFleetPatterns(fleetId) {
    const fleet = fleetId || (window.IronTideSelectedFleet || 1);
    if (!window.FleetPatterns[fleet]) {
      window.FleetPatterns[fleet] = JSON.parse(JSON.stringify(patterns));
    }
    return window.FleetPatterns[fleet];
  }
  
  // Clear only the specified fleet's pattern state
  function clearFleetPattern(fleetId) {
    try {
      const fp = getFleetPatterns(fleetId);
      fp.selected = null;
      fp.placingPin = false;
      fp.pendingSelection = null;
      fp.pin = null;
      fp.path = [];
      fp.loop = false;
      fp.currentIdx = 0;
      fp.guiding = true;
      fp.boxPins = [];
      fp.boxLoop = true;
      fp.boxCw = true;
      fp.boxDraggingIndex = -1;
      fp.zigPins = [];
      fp.zigDraggingIndex = -1;
      fp.circlePins = [];
      fp.circleCw = true;
      fp.circleLoop = true;
      fp.circleDraggingIndex = -1;
      // Persist in settings UI state
      try {
        if (window.IronTideFleetSettings && window.IronTideFleetSettings[fleetId]) {
          window.IronTideFleetSettings[fleetId].pattern = '';
        }
      } catch {}
      // If the currently selected fleet matches, do not disturb other fleets' UI
      return true;
    } catch (e) {
      console.error('clearFleetPattern failed for fleet', fleetId, e);
      return false;
    }
  }
  try { window.clearFleetPattern = clearFleetPattern; } catch {}
  
  function clearPattern(fleetId) {
    const fleet = fleetId || (window.IronTideSelectedFleet || 1);
    const fleetPatterns = getFleetPatterns(fleet);
    
    fleetPatterns.selected = null;
    fleetPatterns.placingPin = false;
    fleetPatterns.pin = null;
    fleetPatterns.path = [];
    fleetPatterns.loop = false;
    fleetPatterns.currentIdx = 0;
    fleetPatterns.guiding = true;
    // Clear Free Draw specific properties
    fleetPatterns.freeDrawPins = [];
    fleetPatterns.freeDrawComplete = false;
    // Clear Zig-Zag specific properties
    fleetPatterns.zigPins = [];
    fleetPatterns.zigDraggingIndex = -1;
    // Clear Box Patrol specific properties
    fleetPatterns.boxPins = [];
    fleetPatterns.boxDraggingIndex = -1;
    // Clear Circle specific properties
    fleetPatterns.circlePins = [];
    setPinCursor(false);
    if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
    
    // Also clear global patterns for backward compatibility with current fleet
    if (fleet === (window.IronTideSelectedFleet || 1)) {
      patterns.selected = null;
      patterns.placingPin = false;
      patterns.pin = null;
      patterns.path = [];
      patterns.loop = false;
      patterns.currentIdx = 0;
      patterns.guiding = true;
      // Clear Free Draw specific properties
      patterns.freeDrawPins = [];
      patterns.freeDrawComplete = false;
      // Clear Zig-Zag specific properties
      patterns.zigPins = [];
      patterns.zigDraggingIndex = -1;
      // Clear Box Patrol specific properties
      patterns.boxPins = [];
      patterns.boxDraggingIndex = -1;
      // Clear Circle specific properties
      patterns.circlePins = [];
      // Clear Figure Eight specific properties
      patterns.figurePins = [];
      patterns.figureDraggingIndex = -1;
      // Clear Oval specific properties
      patterns.ovalPins = [];
      patterns.ovalDraggingIndex = -1;
    }
  }
  function planZigZagPath(start, end, opts={}) {
    // Make zig-zag more spread out by default; ship can handle wider legs
    const A = opts.amplitude || 50;      // world px side offset default
    const L = opts.wavelength || 420;    // world px between peaks default
    const startPt = { x: start.x, y: start.y };
    const endPt = { x: end.x, y: end.y };
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return [ { ...endPt } ];
    const ux = dx / dist;
    const uy = dy / dist;
    // Normal to the path (rotate +90Â°): ( -uy, ux )
    const nx = -uy;
    const ny = ux;
    // Build points every L/2 so we alternate peaks and cross the centerline at each step
    const step = Math.max(20, L / 2);
    const points = [ startPt ];
    let s = step;
    let sign = 1;
    while (s < dist) {
      const cx = startPt.x + ux * s;
      const cy = startPt.y + uy * s;
      const off = A * sign;
      points.push({ x: cx + nx * off, y: cy + ny * off });
      sign *= -1;
      s += step;
    }
    points.push(endPt);
    return points;
  }
  // Build a circle path from two antipodal points (start and opposite). Returns an array of points
  // forming a closed loop (without duplicating the first point). 'segments' controls smoothness.
  // If cw is true, points progress clockwise when drawn in screen coordinates (y-down).
  function buildCirclePathFromAntipodal(p0, p1, segments=72, cw=true) {
    if (!p0 || !p1) return [];
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    const r = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2;
    if (!isFinite(r) || r <= 1) return [];
    // Angle with 0 pointing up in screen space: use atan2(dx, -dy) to match heading mapping elsewhere
    const ang0 = Math.atan2(p0.x - cx, -(p0.y - cy));
    const count = Math.max(8, Math.floor(segments));
    const dir = cw ? 1 : -1;
    const step = (Math.PI * 2) / count;
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = ang0 + dir * step * i;
      const x = cx + Math.sin(a) * r;
      const y = cy - Math.cos(a) * r;
      pts.push({ x, y });
    }
    return pts;
  }
  // Reusable brass-style waypoint pin renderer at world coordinate (x,y)
  function drawBrassPin(x, y) {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x + 4, y + 6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
    // Spike
    ctx.strokeStyle = '#5a4f2e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x, y + 4); ctx.stroke();
    // Ring
    const g = ctx.createRadialGradient(x, y - 18, 2, x, y - 18, 10);
    g.addColorStop(0, '#fff5cf'); g.addColorStop(1, '#a68f4a');
    ctx.fillStyle = g; ctx.strokeStyle = '#5a4f2e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 18, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Center dot
    ctx.fillStyle = '#5a4f2e'; ctx.beginPath(); ctx.arc(x, y - 18, 2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawPatternOverlaysWorld() {
    // Draw planned path polylines for ALL fleets so you can see where all ships are going
    const currentFleet = window.IronTideSelectedFleet || 1;
    
    // Draw patterns for all fleets
    for (let fleetId = 1; fleetId <= 3; fleetId++) {
      const fleetPatterns = window.FleetPatterns && window.FleetPatterns[fleetId] ? window.FleetPatterns[fleetId] : (fleetId === currentFleet ? patterns : null);
      if (!fleetPatterns || !fleetPatterns.path || fleetPatterns.path.length <= 1) continue;
      
      // Use brass color for all fleets
      const baseColor = 'rgba(231, 225, 193, 0.9)';
      
      // Make current fleet's pattern more prominent
      const isCurrentFleet = (fleetId === currentFleet);
      const alpha = isCurrentFleet ? 1.0 : 0.6;
      
      // Draw this fleet's pattern
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // Use stored path order; dash animation direction will indicate CW/CCW
      let drawPts = fleetPatterns.path;
      
      // Outer dark edging
      ctx.strokeStyle = `rgba(20,20,20,${0.85 * alpha})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(drawPts[0].x, drawPts[0].y);
      for (let i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i].x, drawPts[i].y);
      // Close the loop visually for closed-loop patterns (Box/Circle), and for Free Draw only after completion
      if (((fleetPatterns.selected === 'box' || fleetPatterns.selected === 'circle') ||
           (fleetPatterns.selected === 'freedraw' && !!fleetPatterns.freeDrawComplete))
          && drawPts.length > 2) {
        ctx.lineTo(drawPts[0].x, drawPts[0].y);
      }
      ctx.stroke();
      
      // Inner colored line
      ctx.strokeStyle = baseColor;
      ctx.setLineDash([18, 10]);
      const dashSpeed = 20;
      const tSec = performance.now() / 1000;
      // Reverse animation direction for CCW patterns
      let animDirection = -1; // Default clockwise
      if (fleetPatterns.selected === 'box' && !fleetPatterns.boxCw) animDirection = 1;
      else if (fleetPatterns.selected === 'circle' && !fleetPatterns.circleCw) animDirection = 1;
      else if (fleetPatterns.selected === 'freedraw' && !fleetPatterns.freeDrawCw) animDirection = 1;
      ctx.lineDashOffset = tSec * dashSpeed * animDirection;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(drawPts[0].x, drawPts[0].y);
      for (let i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i].x, drawPts[i].y);
      if (((fleetPatterns.selected === 'box' || fleetPatterns.selected === 'circle') ||
           (fleetPatterns.selected === 'freedraw' && !!fleetPatterns.freeDrawComplete))
          && drawPts.length > 2) {
        ctx.lineTo(drawPts[0].x, drawPts[0].y);
      }
      ctx.stroke();
      ctx.restore();
    }
    
    // Draw pins only for the current fleet to avoid clutter
    // IMPORTANT: While placing a pattern (placingPin or pendingSelection), use the live `patterns`
    // object so pins appear immediately as the user clicks, even if FleetPatterns has a saved copy.
    const useLive = !!(patterns && (patterns.placingPin || patterns.pendingSelection));
    const currentFleetPatterns = (window.FleetPatterns && window.FleetPatterns[currentFleet] && !useLive)
      ? window.FleetPatterns[currentFleet]
      : patterns;
    
    // Draw Zig-Zag pins (two-pin mode)
    if ((currentFleetPatterns.selected === 'zigzag' && currentFleetPatterns.zigPins && currentFleetPatterns.zigPins.length)
        || (currentFleetPatterns.pendingSelection === 'zigzag' && currentFleetPatterns.zigPins && currentFleetPatterns.zigPins.length)) {
      for (let i = 0; i < currentFleetPatterns.zigPins.length; i++) {
        const p = currentFleetPatterns.zigPins[i]; if (!p) continue;
        ctx.save();
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
        // Spike
        ctx.strokeStyle = '#5a4f2e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
        // Ring
        const g = ctx.createRadialGradient(p.x, p.y - 18, 2, p.x, p.y - 18, 10);
        g.addColorStop(0, '#fff5cf'); g.addColorStop(1, '#a68f4a');
        ctx.fillStyle = g; ctx.strokeStyle = '#5a4f2e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y - 18, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        // Center dot
        ctx.fillStyle = '#5a4f2e'; ctx.beginPath(); ctx.arc(p.x, p.y - 18, 2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
    // Draw Circle pins (two antipodal points), both during placement and after finalize
    if ((currentFleetPatterns.selected === 'circle' && currentFleetPatterns.circlePins && currentFleetPatterns.circlePins.length)
        || (currentFleetPatterns.pendingSelection === 'circle' && currentFleetPatterns.circlePins && currentFleetPatterns.circlePins.length)) {
      for (let i = 0; i < currentFleetPatterns.circlePins.length; i++) {
        const p = currentFleetPatterns.circlePins[i]; if (!p) continue;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#5a4f2e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
        const g = ctx.createRadialGradient(p.x, p.y - 18, 2, p.x, p.y - 18, 10);
        g.addColorStop(0, '#fff5cf'); g.addColorStop(1, '#a68f4a');
        ctx.fillStyle = g; ctx.strokeStyle = '#5a4f2e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y - 18, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a4f2e'; ctx.beginPath(); ctx.arc(p.x, p.y - 18, 2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
    // Draw Figure Eight pins (center point)
    if ((currentFleetPatterns.selected === 'figure' && currentFleetPatterns.figurePins && currentFleetPatterns.figurePins.length)
        || (currentFleetPatterns.pendingSelection === 'figure' && currentFleetPatterns.figurePins && currentFleetPatterns.figurePins.length)) {
      for (let i = 0; i < currentFleetPatterns.figurePins.length; i++) {
        const p = currentFleetPatterns.figurePins[i]; if (!p) continue;
        drawBrassPin(p.x, p.y);
      }
    }
    // Draw Oval pins (center point)
    if ((currentFleetPatterns.selected === 'oval' && currentFleetPatterns.ovalPins && currentFleetPatterns.ovalPins.length)
        || (currentFleetPatterns.pendingSelection === 'oval' && currentFleetPatterns.ovalPins && currentFleetPatterns.ovalPins.length)) {
      for (let i = 0; i < currentFleetPatterns.ovalPins.length; i++) {
        const p = currentFleetPatterns.ovalPins[i]; if (!p) continue;
        drawBrassPin(p.x, p.y);
      }
    }
    // Draw start pin mirroring the end pin (first point of the path) for non-circle patterns
    if (currentFleetPatterns.path && currentFleetPatterns.path.length > 0 && currentFleetPatterns.selected !== 'circle') {
      const s = currentFleetPatterns.path[0];
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(s.x + 4, s.y + 6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#5a4f2e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 18); ctx.lineTo(s.x, s.y + 4); ctx.stroke();
      const g2 = ctx.createRadialGradient(s.x, s.y - 18, 2, s.x, s.y - 18, 10);
      g2.addColorStop(0, '#fff5cf'); g2.addColorStop(1, '#a68f4a');
      ctx.fillStyle = g2; ctx.strokeStyle = '#5a4f2e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y - 18, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a4f2e'; ctx.beginPath(); ctx.arc(s.x, s.y - 18, 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // While placing Box Patrol, show brass pins at each chosen corner in real-time
    if (currentFleetPatterns.pendingSelection === 'box' && currentFleetPatterns.boxPins && currentFleetPatterns.boxPins.length) {
      for (let i = 0; i < currentFleetPatterns.boxPins.length; i++) {
        const bp = currentFleetPatterns.boxPins[i];
        drawBrassPin(bp.x, bp.y);
      }
    }
    // While placing Free Draw, show brass pins at each chosen waypoint in real-time
    if (currentFleetPatterns.pendingSelection === 'freedraw' && currentFleetPatterns.freeDrawPins && currentFleetPatterns.freeDrawPins.length) {
      for (let i = 0; i < currentFleetPatterns.freeDrawPins.length; i++) {
        const fp = currentFleetPatterns.freeDrawPins[i];
        drawBrassPin(fp.x, fp.y);
        // Draw connection lines between pins
        if (i > 0) {
          const prevPin = currentFleetPatterns.freeDrawPins[i-1];
          ctx.save();
          ctx.strokeStyle = '#d4af37';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(prevPin.x, prevPin.y);
          ctx.lineTo(fp.x, fp.y);
          ctx.stroke();
          ctx.restore();
        }
        // Do not draw a closing line preview; user closes by clicking first pin
      }
    }
    // After Box Patrol is finalized, draw pins at each path corner
    if (currentFleetPatterns.selected === 'box' && currentFleetPatterns.path && currentFleetPatterns.path.length) {
      for (let i = 0; i < currentFleetPatterns.path.length; i++) {
        const cp = currentFleetPatterns.path[i];
        drawBrassPin(cp.x, cp.y);
      }
    }
    // After Free Draw is finalized, draw pins at each path waypoint
    if (currentFleetPatterns.selected === 'freedraw' && currentFleetPatterns.path && currentFleetPatterns.path.length) {
      for (let i = 0; i < currentFleetPatterns.path.length; i++) {
        const cp = currentFleetPatterns.path[i];
        drawBrassPin(cp.x, cp.y);
      }
    }
  }

  // Brass pin cursor (SVG data URL) helper
  function setPinCursor(on) {
    if (!canvas) return;
    if (on) {
      const svg = encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='32' viewBox='0 0 24 32'>
          <defs><linearGradient id='g' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stop-color='#e7e1c1'/><stop offset='100%' stop-color='#9e8f5a'/></linearGradient></defs>
          <g stroke='#5a4f2e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>
            <path d='M12 2 C7 2 4 5.5 4 10 c0 6 8 14 8 14 s8-8 8-14 c0-4.5-3-8-8-8z' fill='url(#g)'/>
            <circle cx='12' cy='10' r='3' fill='#fff5cf'/>
          </g>
        </svg>`
      );
      canvas.style.cursor = `url("data:image/svg+xml,${svg}") 12 2, crosshair`;
    } else {
      canvas.style.cursor = 'default';
    }
  }

  function hitTestPin(px, py) {
    if (!patterns.pin) return false;
    // Convert screen to world, compare to pin in world units
    const w = screenToWorld(px, py);
    // Hit radius in world units; scale-insensitive approximate
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale || 1;
    const hitScreenRadius = 14; // px on screen feels right
    const hitWorldRadius = hitScreenRadius / scale;
    // Base of pin
    const dxBase = w.x - patterns.pin.x;
    const dyBase = w.y - patterns.pin.y;
    if (Math.hypot(dxBase, dyBase) <= hitWorldRadius) return true;
    // Ring/head of pin sits at y-18 (world units)
    const dxRing = w.x - patterns.pin.x;
    const dyRing = w.y - (patterns.pin.y - 18);
    if (Math.hypot(dxRing, dyRing) <= hitWorldRadius) return true;
    return false;
  }

  function updateCursorForPointer(px, py) {
    // Priority: placing pin -> brass pin cursor
    if (patterns.placingPin) { setPinCursor(true); return; }
    // Dragging pin -> grabbing cursor
    if (patterns.draggingPin) { canvas.style.cursor = 'grabbing'; return; }
    // Hover over Zig-Zag pins -> grab
    const zigHit = hitTestZigPin(px, py);
    if (zigHit >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Legacy: hover over single zig pin
    if (patterns.pin && hitTestPin(px, py)) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Hover over a Circle pin -> grab
    if (hitTestCirclePin(px, py) >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Hover over a Box corner -> grab
    if (hitTestBoxPin(px, py) >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Hover over a Free Draw pin -> grab
    if (hitTestFreeDrawPin(px, py) >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Hover over a Figure Eight pin -> grab
    if (hitTestFigurePin(px, py) >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Hover over an Oval pin -> grab
    if (hitTestOvalPin(px, py) >= 0) {
      canvas.style.cursor = 'grab';
      return;
    }
    // Default
    canvas.style.cursor = 'default';
  }

  function update(dt) {
    // Mirror target speed from central state each frame (UI or other systems may have changed it)
    const effects = getEffects();
    try { speedKts = shipState.speedKts; } catch {}
    // Auto-promote fleet leaders if sunk
    try { promoteFleetLeaderIfSunk(1); } catch {}
    try { promoteFleetLeaderIfSunk(2); } catch {}
    try { promoteFleetLeaderIfSunk(3); } catch {}
    // Enforce dynamic speed cap (from damage effects)
    if (speedKts > effects.speedCapKts) {
      speedKts = effects.speedCapKts;
      try { shipState.speedKts = speedKts; } catch {}
      try {
        if (speedSliderEl && speedSliderEl.value !== String(speedKts)) speedSliderEl.value = String(speedKts);
        if (speedReadoutEl) speedReadoutEl.textContent = speedKts + ' kts';
      } catch {}
    }
    // Keys adjust desired heading (rudder command); actual heading turns slowly toward it
    const desiredChangeRate = 60; // deg/sec for commanded change
    
    // Fleet-aware keyboard controls
    const currentFleet = window.IronTideSelectedFleet || 1;
    const fleetLeader = getFleetLeader(currentFleet);
    
    if (currentFleet === 1) {
      // Fleet 1: control player ship directly (original logic)
      if (!(shipState && shipState.effects && shipState.effects.rudderJam)) {
        if (keys.left) ship.desiredHeading = (ship.desiredHeading - desiredChangeRate * dt + 360) % 360;
        if (keys.right) ship.desiredHeading = (ship.desiredHeading + desiredChangeRate * dt) % 360;
      }
    } else {
      // Fleet 2/3: control fleet leader
      if (fleetLeader && fleetLeader.state) {
        if (keys.left) {
          fleetLeader.state.desiredHeading = (fleetLeader.state.desiredHeading - desiredChangeRate * dt + 360) % 360;
          if (fleetLeader.state.ship) fleetLeader.state.ship.desiredHeading = fleetLeader.state.desiredHeading;
        }
        if (keys.right) {
          fleetLeader.state.desiredHeading = (fleetLeader.state.desiredHeading + desiredChangeRate * dt + 360) % 360;
          if (fleetLeader.state.ship) fleetLeader.state.ship.desiredHeading = fleetLeader.state.desiredHeading;
        }
      }
    }
    // Smooth acceleration toward target speed (both directions), scaled by damage effects
    const diffSpeed = speedKts - actualSpeedKts;
    const accel = Math.max(0, ACCEL_KTS_PER_SEC * (effects.accelFactor || 1));
    const stepKts = Math.max(-accel * dt, Math.min(accel * dt, diffSpeed));
    actualSpeedKts = actualSpeedKts + stepKts;
    // Sync back to central state for audio/effects modules
    if (shipState) {
      try { shipState.actualSpeedKts = actualSpeedKts; } catch {}
    }

    // Perpetual throttle: direction from actual speed sign (reverse/neutral/forward)
    let move = (actualSpeedKts < 0) ? -1 : (actualSpeedKts > 0 ? 1 : 0);

    // Fleet 1 Pattern Following (using fleet-specific patterns only)
    let zigGuided = false;
    const fleet1Patterns = (window.FleetPatterns && window.FleetPatterns[1]) || null;
    
    // Zigzag pattern following
    if (fleet1Patterns && fleet1Patterns.selected === 'zigzag' && fleet1Patterns.guiding !== false) {
      const hasZigTwoPins = !!(fleet1Patterns.zigPins && fleet1Patterns.zigPins.length === 2);
      const hasZigLegacyPin = !!fleet1Patterns.pin;
      
      if (hasZigTwoPins || hasZigLegacyPin) {
        const params = getZigParams();
        const cp = closestPointOnPolyline(fleet1Patterns.path, ship.x, ship.y);
        const joinThresh = 10 + Math.max(20, params.amplitude * 0.8);
        
        // If close to end pin, stop guiding
        const endPin = hasZigTwoPins ? fleet1Patterns.zigPins[1] : fleet1Patterns.pin;
        const pinDX = endPin.x - ship.x, pinDY = endPin.y - ship.y;
        const pinDist = Math.hypot(pinDX, pinDY);
        const finishRadius = Math.max(30, params.wavelength * 0.2);
        
        if (!fleet1Patterns.loop && pinDist <= finishRadius) {
          fleet1Patterns.guiding = false;
          ship.desiredHeading = ship.heading; // lock to current heading
        } else if (cp && cp.dist > joinThresh) {
          const dx = cp.point.x - ship.x;
          const dy = cp.point.y - ship.y;
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          ship.desiredHeading = desired;
        } else if (cp) {
          // Follow the path with ping-pong support
          const ktsAbs = Math.abs(actualSpeedKts);
          const lookahead = zigLookaheadForSpeed(params, ktsAbs);
          const zigFwd = (fleet1Patterns.zigForward !== false);
          const distSigned = zigFwd ? lookahead : -lookahead;
          const ahead = moveAlongPath(fleet1Patterns.path, cp.segIndex, cp.t, distSigned) || fleet1Patterns.path[1];
          // Flip direction at ends when looping
          if (fleet1Patterns.loop) {
            const atStart = (cp.segIndex <= 0 && cp.t < 0.02);
            const atEnd = (cp.segIndex >= fleet1Patterns.path.length - 2 && cp.t > 0.98);
            if (atEnd && zigFwd) fleet1Patterns.zigForward = false;
            else if (atStart && !zigFwd) fleet1Patterns.zigForward = true;
          }
          const dx = ahead.x - ship.x;
          const dy = ahead.y - ship.y;
          const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
          ship.desiredHeading = desired;
        }
        
        move = 1;
        // Pattern is LOCKED - no manual overrides allowed
        zigGuided = true;
      }
    }
    
    // Box pattern following
    else if (fleet1Patterns && fleet1Patterns.selected === 'box' && fleet1Patterns.path && fleet1Patterns.path.length > 1 && fleet1Patterns.guiding !== false) {
      const cp = closestPointOnLoop(fleet1Patterns.path, ship.x, ship.y);
      let perim = 0; 
      for (let i=0; i<fleet1Patterns.path.length; i++) { 
        const a = fleet1Patterns.path[i], b = fleet1Patterns.path[(i+1) % fleet1Patterns.path.length]; 
        perim += Math.hypot(b.x-a.x, b.y-a.y); 
      }
      const avgSeg = Math.max(30, perim / fleet1Patterns.path.length);
      const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(actualSpeedKts));
      const distSigned = !fleet1Patterns.boxCw ? -lookahead : lookahead;
      const ahead = cp ? moveAlongPathLooped(fleet1Patterns.path, cp.segIndex, cp.t, distSigned) : fleet1Patterns.path[1];
      const dx = ahead.x - ship.x;
      const dy = ahead.y - ship.y;
      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      ship.desiredHeading = desired;
      
      move = 1;
      // Pattern is LOCKED - no manual overrides allowed
      zigGuided = true;
    }
    
    // Free Draw pattern following
    else if (fleet1Patterns && fleet1Patterns.selected === 'freedraw' && fleet1Patterns.path && fleet1Patterns.path.length > 1 && fleet1Patterns.guiding !== false) {
      const cp = closestPointOnLoop(fleet1Patterns.path, ship.x, ship.y);
      let perim = 0; 
      for (let i=0; i<fleet1Patterns.path.length; i++) { 
        const a = fleet1Patterns.path[i], b = fleet1Patterns.path[(i+1) % fleet1Patterns.path.length]; 
        perim += Math.hypot(b.x-a.x, b.y-a.y); 
      }
      const avgSeg = Math.max(30, perim / fleet1Patterns.path.length);
      const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(actualSpeedKts));
      const distSigned = !fleet1Patterns.freeDrawCw ? -lookahead : lookahead;
      const ahead = cp ? moveAlongPathLooped(fleet1Patterns.path, cp.segIndex, cp.t, distSigned) : fleet1Patterns.path[1];
      const dx = ahead.x - ship.x;
      const dy = ahead.y - ship.y;
      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      ship.desiredHeading = desired;
      
      move = 1;
      // Pattern is LOCKED - no manual overrides allowed
      zigGuided = true;
    }
    
    // Circle pattern following
    else if (fleet1Patterns && fleet1Patterns.selected === 'circle' && fleet1Patterns.path && fleet1Patterns.path.length > 1 && fleet1Patterns.guiding !== false) {
      const cp = closestPointOnLoop(fleet1Patterns.path, ship.x, ship.y);
      let perim = 0; 
      for (let i=0; i<fleet1Patterns.path.length; i++) { 
        const a = fleet1Patterns.path[i], b = fleet1Patterns.path[(i+1) % fleet1Patterns.path.length]; 
        perim += Math.hypot(b.x-a.x, b.y-a.y); 
      }
      const avgSeg = Math.max(20, perim / fleet1Patterns.path.length);
      const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(actualSpeedKts));
      const distSigned = !fleet1Patterns.circleCw ? -lookahead : lookahead;
      const ahead = cp ? moveAlongPathLooped(fleet1Patterns.path, cp.segIndex, cp.t, distSigned) : fleet1Patterns.path[1];
      const dx = ahead.x - ship.x;
      const dy = ahead.y - ship.y;
      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      ship.desiredHeading = desired;
      
      move = 1;
      // Pattern is LOCKED - no manual overrides allowed
      zigGuided = true;
    }

    // Click-to-move takes precedence if set and no manual reverse key pressed
    let vx = 0, vy = 0;
    if (!zigGuided && ship.moveTarget && move >= 0) {
      const dx = ship.moveTarget.x - ship.x;
      const dy = ship.moveTarget.y - ship.y;
      const dist = Math.hypot(dx, dy);
      const hasPattern = patterns.path && patterns.path.length > 0;
      const arriveTol = 6;
      if (dist < arriveTol) {
        ship.moveTarget = null;
      } else {
        // Steer toward the target with limited turn rate, and move forward
        const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        ship.desiredHeading = desired;
        move = 1;
      }
    } else {
      // manual throttle above determines move
    }

    // Apply speed-dependent turning: turn rate scales with rudder effectiveness and damage effects
    // Fleet 1 manual heading hold: scale linearly 0..30 kts (0 => no turn, 30+ => full)
    let effRudder = rudderEffectiveness(Math.abs(actualSpeedKts)) * (effects.rudderEffectivenessScale || 1);
    try {
      const hold = !!(window.IronTideManualHeadingHold && window.IronTideManualHeadingHold[1]);
      const fp1 = (window.FleetPatterns && window.FleetPatterns[1]) || null;
      const patternActive1 = !!(fp1 && fp1.selected && fp1.path && fp1.path.length > 1 && fp1.guiding !== false);
      if (hold && !patternActive1) {
        const ktsAbs = Math.abs(actualSpeedKts||0);
        // No turning at or below 0.5 kts for realism
        if (ktsAbs <= 0.5) {
          effRudder = 0;
        } else {
          const scale = Math.max(0, Math.min(1, ktsAbs / 30));
          effRudder = effRudder * scale;
        }
      }
    } catch {}
    const maxTurnRate = TURN_RATE_MAX_FULL * (effects.turnRateFactor || 1) * effRudder; // deg/sec
    // Determine effective direction: live input first, otherwise latched
    let dirToUse = turnDir !== 0 ? turnDir : latchedTurnDir;
    // Apply rudder jam effect (forces a direction)
    if (effects.rudderJam === 'left') {
      if (dirToUse >= 0) dirToUse = -1;
    } else if (effects.rudderJam === 'right') {
      if (dirToUse <= 0) dirToUse = 1;
    }
    // If latched, clear it when we've finished the arc in that direction
    if (latchedTurnDir !== 0) {
      const cur = angleNorm360(ship.heading);
      const tgt = angleNorm360(ship.desiredHeading);
      const cwRem = (tgt - cur + 360) % 360;   // remaining CW arc
      const ccwRem = (cur - tgt + 360) % 360;  // remaining CCW arc
      const eps = 0.25; // degrees
      if ((latchedTurnDir > 0 && cwRem <= eps) || (latchedTurnDir < 0 && ccwRem <= eps)) {
        latchedTurnDir = 0;
        dirToUse = turnDir; // may be 0
      }
    }
    ship.heading = stepHeadingOneDir(ship.heading, ship.desiredHeading, maxTurnRate * dt, dirToUse);

    // Compute velocity from current heading and throttle
    // Quadratic easing for low-speed movement (<5 kts) for smoothness
    let ktsAbs = Math.abs(actualSpeedKts);
    const ktsEff = (ktsAbs >= 5) ? ktsAbs : (ktsAbs / 5) * (ktsAbs / 5) * 5; // 0..5 mapped quadratically
    const speed = ship.speed * (ktsEff / 15) * (move !== 0 ? (move > 0 ? 1 : -1) : 0);
    const rad = (ship.heading) * Math.PI / 180; // 0 up system
    vx = Math.sin(rad) * speed * dt;
    vy = -Math.cos(rad) * speed * dt;

    let nx = ship.x + vx;
    let ny = ship.y + vy;

    // Collision: separate axis resolution
    if (!collidesAt(nx, ship.y)) ship.x = nx;
    if (!collidesAt(ship.x, ny)) ship.y = ny;

    // Update UI indicator for actual speed
    updateSpeedIndicatorPosition();
    // Drive ship audio volumes
    updateShipAudio(dt, actualSpeedKts);
    // Fleet 2/3 friendly leader FIRE scheduling using per-fleet gunnery state
    try {
      [2,3].forEach(fid => {
        const g = window.FleetGunnery && window.FleetGunnery[fid];
        if (!g || !g.fireEnabled || !g.targetId) return;
        // Enforce: must wait for solution to complete before firing
        try {
          const sc = (window.FleetSolutionCalc && window.FleetSolutionCalc[fid]) || {};
          if (sc.active) return; // still computing â€” not ready to fire
        } catch {}
        const leader = getFleetLeader(fid);
        if (!leader || !leader.state || !leader.profile) return;
        const ids = ['t1','t2','t3','t4'];
        g.lastTurretAt = g.lastTurretAt || { t1:-1e9,t2:-1e9,t3:-1e9,t4:-1e9 };
        const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
        const tid = String(g.targetId);
        let tgt = others.find(s => String(s.id) === tid);
        if (!tgt) return;
        ids.forEach(id => {
          const res = (typeof getNpcTurretMuzzleWorldFor === 'function') ? getNpcTurretMuzzleWorldFor(leader, id) : null;
          if (!res) return;
          const ready = (simTime - (g.lastTurretAt[id] || -1e9) >= (g.intervalSec || 10));
          if (!ready) return;
          // Lead target at fire time, then apply small lateral deviation
          const v = getEntityVelocityEstimate(tgt, String(tgt.id));
          const ps = getShellSpeedWorldPerSec();
          const lead = predictIntercept({ x: res.x, y: res.y }, { x: tgt.x, y: tgt.y }, v, ps);
          const dx0 = lead.x - res.x, dy0 = lead.y - res.y; const dist0 = Math.hypot(dx0,dy0) || 1;
          const px = dy0 / dist0, py = -dx0 / dist0; const dev = dist0 * 0.03 * (Math.random()*2 - 1);
          const aimX = lead.x + px * dev, aimY = lead.y + py * dev;
          const adx = aimX - res.x, ady = aimY - res.y;
          const aimDeg = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
          spawnShell(res.x, res.y, aimDeg, id, { x: aimX, y: aimY });
          try { spawnBlackSmoke(res.x, res.y, 6); } catch {}
          g.lastTurretAt[id] = simTime;
        });
      });
    } catch {}
    // NPC FIRE scheduling (legacy for npc1)
    if (npc1 && npc1.state && npc1.profile && npc1.damageModel) {
      // Ensure per-turret schedule exists
      const idsNpc = ['t1','t2','t3','t4'];
      if (!Array.isArray(npcGunnery.schedule)) npcGunnery.schedule = [];
      idsNpc.forEach(id => {
        if (!npcGunnery.schedule.some(s => s && s.id === id)) {
          const jitter = Math.random() * 0.7;
          const nextT = Math.max(simTime, (npcGunnery.lastTurretAt[id] || -1e9) + npcGunnery.intervalSec) + jitter;
          npcGunnery.schedule.push({ id, t: nextT });
        }
      });
      // Fire when due
      if (npcGunnery.schedule.length) {
        const remainingNpc = [];
        for (let i=0;i<npcGunnery.schedule.length;i++){
          const item = npcGunnery.schedule[i];
          if (simTime >= item.t) {
            const res = getNpcTurretMuzzleWorld(item.id);
            if (res) {
              const can = canNpcTurretFire(item.id);
              // Validate player as a target (alive, present in fleet, not despawned)
              const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
              const palive = !!(window.shipState && !(window.shipState.effects?.sunk || window.shipState.sunk));
              const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
              // Check if player is in ANY fleet, not just Fleet 1
              const inFleet = !!(
                (fa[1] instanceof Set && fa[1].has(pid)) ||
                (fa[2] instanceof Set && fa[2].has(pid)) ||
                (fa[3] instanceof Set && fa[3].has(pid))
              );
              const notDespawned = !(window.PlayerDespawned === true);
              const canTargetPlayer = palive && inFleet && notDespawned && ship && typeof ship.x === 'number' && typeof ship.y === 'number';
              // Range check: only allow firing if player is within max range from this muzzle
              let inRange = true;
              try {
                const maxR = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 1e9;
                const rdx = ship.x - res.x; const rdy = ship.y - res.y;
                inRange = (Math.hypot(rdx, rdy) <= maxR);
              } catch {}
              const ready = !!(can.ok && canTargetPlayer && inRange && (simTime - (npcGunnery.lastTurretAt[item.id] || -1e9) >= npcGunnery.intervalSec));
              if (ready) {
                // Aim at player with lead and small lateral deviation
                let aim = (can.aimDeg != null ? can.aimDeg : (res.aimDeg != null ? res.aimDeg : res.worldDeg));
                let tgt = null;
                if (canTargetPlayer) {
                  const v = getEntityVelocityEstimate(window.shipState.ship, String(window.shipState.id));
                  const ps = getShellSpeedWorldPerSec();
                  const lead = predictIntercept({ x: res.x, y: res.y }, { x: ship.x, y: ship.y }, v, ps);
                  const dx = lead.x - res.x; const dy = lead.y - res.y;
                  const dist = Math.hypot(dx, dy) || 1;
                  const px = dy / dist, py = -dx / dist; // perpendicular
                  const dev = dist * 0.05 * (Math.random()*2 - 1);
                  const devX = lead.x + px * dev;
                  const devY = lead.y + py * dev;
                  tgt = { x: devX, y: devY };
                  const adx = tgt.x - res.x; const ady = tgt.y - res.y;
                  aim = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
                }
                spawnShell(res.x, res.y, aim, 'et'+item.id.substring(1), tgt);
                try { spawnBlackSmoke(res.x, res.y, 6); } catch {}
                npcGunnery.lastTurretAt[item.id] = simTime;
                const jitterNext = Math.random() * 0.7;
                item.t = simTime + npcGunnery.intervalSec + jitterNext;
                remainingNpc.push(item);
              } else {
                remainingNpc.push(item);
              }
            }
          } else {
            remainingNpc.push(item);
          }
        }
        npcGunnery.schedule = remainingNpc;
      }
      // NPC turret auto-aim toward player with dead zones
      if (npc1.state.npcTurretAnglesRelDeg && turretPoints && shipImg) {
        const topDeadStart = 145, topDeadEnd = 235;
        const bottomDeadStart = 325, bottomDeadEnd = 55;
        const vrN = currentViewRect || getViewRect();
        const scaleN = vrN.scale || 1;
        const targetHBaseN = 96;
        const targetHScreenN = Math.round(targetHBaseN * (zoomOutSlider.value || 1));
        const worldHN = Math.max(1, targetHScreenN / scaleN);
        const worldWN = shipImg && shipImg.width && shipImg.height ? Math.round(worldHN * (shipImg.width / shipImg.height)) : worldHN;
        const sxN = shipImg && shipImg.width ? (worldWN / shipImg.width) : 1;
        const syN = shipImg && shipImg.height ? (worldHN / shipImg.height) : 1;
        const byIdN = update.__npcTurretMap || new Map(turretPoints.map(p => [p.id, p]));
        update.__npcTurretMap = byIdN;
        idsNpc.forEach(id => {
          const isTop = (id === 't1' || id === 't2');
          const ds = isTop ? topDeadStart : bottomDeadStart;
          const de = isTop ? topDeadEnd : bottomDeadEnd;
          const cur = npc1.state.npcTurretAnglesRelDeg[id] ?? (isTop ? 0 : 180);
          let targetRel = isTop ? 0 : 180;
          const tp = byIdN.get(id);
          // Validate player target for auto-aim
          const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
          const palive = !!(window.shipState && !(window.shipState.effects?.sunk || window.shipState.sunk));
          const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
          // Check if player is in ANY fleet, not just Fleet 1
          const inFleet = !!(
            (fa[1] instanceof Set && fa[1].has(pid)) ||
            (fa[2] instanceof Set && fa[2].has(pid)) ||
            (fa[3] instanceof Set && fa[3].has(pid))
          );
          const notDespawned = !(window.PlayerDespawned === true);
          if (ship && tp && palive && inFleet && notDespawned) {
            const tx = (tp.x - shipImg.width / 2) * sxN;
            const ty = (tp.y - shipImg.height / 2) * syN;
            const forwardDelta = (id === 't1') ? (5 / scaleN) : 0;
            const hr = (npc1.state.ship.heading || 0) * Math.PI/180;
            const lx = tx; const ly = ty - forwardDelta;
            const twx = npc1.state.ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
            const twy = npc1.state.ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
            const wdx = ship.x - twx; const wdy = ship.y - twy;
            const desiredWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
            targetRel = angleNorm360(desiredWorld - (npc1.state.ship.heading || 0));
          }
          let stepTo;
          if (inDeadZone(targetRel, ds, de)) {
            stepTo = isTop ? (Math.abs(angDist(cur, ds)) <= Math.abs(angDist(cur, de)) ? ds : de) : cur;
          } else {
            stepTo = targetRel;
          }
          npc1.state.npcTurretAnglesRelDeg[id] = stepAngleAvoidingDeadZone(cur, stepTo, ds, de, turretMaxSpeedDeg, dt);
        });
      }
    }

    // New: FIRE scheduling for ALL NPCs (beyond npc1)
    try {
      if (Array.isArray(window.NPCs)) {
        // Per-NPC gunnery state map
        window.NpcGunsById = window.NpcGunsById || {};
        const fleetA = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
        const enemySet = window.EnemyFleet1 instanceof Set ? window.EnemyFleet1 : new Set();
        const playerHasPin = !!(firingSolution && firingSolution.target);
        // Helper: resolve a world point to an enemy NPC center if the point lies over it; otherwise null
        function resolvePointToEnemyTarget(pt){
          try {
            if (!pt || !Array.isArray(window.NPCs)) return null;
            const enemySet2 = window.EnemyFleet1 instanceof Set ? window.EnemyFleet1 : new Set();
            let best = null; let bestD = 1e12;
            // Compute dynamic acceptance radius based on current sprite world size
            const vr = currentViewRect || getViewRect();
            const scale = vr.scale || 1;
            const targetHBase = 96;
            const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
            const worldH = Math.max(1, targetHScreen / scale);
            // Base threshold scaled to ship visual size
            const baseR = worldH * 0.9; // generous capture radius around center
            for (let k=0;k<window.NPCs.length;k++){
              const onpc = window.NPCs[k];
              if (!onpc || !onpc.state || !onpc.state.ship) continue;
              const idStr2 = String(onpc.state.id);
              if (!enemySet2.has(idStr2)) continue; // only consider enemies
              const dx = pt.x - onpc.state.ship.x; const dy = pt.y - onpc.state.ship.y;
              const d = Math.hypot(dx, dy);
              const acceptR = baseR; // could vary per sprite if needed
              if (d <= acceptR && d < bestD) { best = { x: onpc.state.ship.x, y: onpc.state.ship.y }; bestD = d; }
            }
            return best; // center of nearest enemy ship within radius
          } catch { return null; }
        }
        for (let i=0;i<window.NPCs.length;i++){
          const npc = window.NPCs[i];
          if (!npc || !npc.state || !npc.profile || !npc.damageModel) continue;
          // Skip legacy npc1 to avoid double-firing (handled above)
          if (npc === npc1) continue;
          // Skip Transport ships - they have no turrets and cannot fire
          const shipType = (npc.profile && npc.profile.type) ? String(npc.profile.type).toLowerCase() : '';
          if (shipType === 'transport') continue;
          const idStr = String(npc.state.id);
          const isFriendlyFleet1 = !!(fleetA[1] instanceof Set && fleetA[1].has(idStr));
          const isFriendlyFleet2 = !!(fleetA[2] instanceof Set && fleetA[2].has(idStr));
          const isFriendlyFleet3 = !!(fleetA[3] instanceof Set && fleetA[3].has(idStr));
          const isEnemy = enemySet.has(idStr);
          
          // Determine which fleet this ship belongs to and get its firing state
          let fleetId = 0;
          let fleetFiring = false;
          let fleetTarget = null;
          
          if (isFriendlyFleet1) {
            fleetId = 1;
            // Fleet 1 only fires if Fleet 1 is selected AND gunnery is enabled
            const selectedFleet = window.IronTideSelectedFleet || 1;
            const playerFiring = selectedFleet === 1 && (
              !!(typeof gunneryFire === 'object' && gunneryFire && gunneryFire.enabled)
              || (!!(firingSolution && firingSolution.target) && !(solutionCalc && solutionCalc.active))
            );
            fleetFiring = playerFiring;
            fleetTarget = firingSolution && firingSolution.target;
          } else if (isFriendlyFleet2) {
            fleetId = 2;
            const fleetSettings = window.IronTideFleetSettings && window.IronTideFleetSettings[2];
            fleetFiring = fleetSettings && fleetSettings.fireEnabled;
            fleetTarget = fleetSettings && fleetSettings.firingSolution && fleetSettings.firingSolution.target;
          } else if (isFriendlyFleet3) {
            fleetId = 3;
            const fleetSettings = window.IronTideFleetSettings && window.IronTideFleetSettings[3];
            fleetFiring = fleetSettings && fleetSettings.fireEnabled;
            fleetTarget = fleetSettings && fleetSettings.firingSolution && fleetSettings.firingSolution.target;
          }
          
          // Determine target point
          let targetPoint = null;
          if (fleetId > 0) {
            // Only allow friendly fire while fleet is firing
            if (!fleetFiring) { continue; }
            // Friendlies: fire directly at manual target or fleet's pin (no enemy resolution required)
            if (npc.state.manualTarget && typeof npc.state.manualTarget.x === 'number' && typeof npc.state.manualTarget.y === 'number') {
              targetPoint = { x: npc.state.manualTarget.x, y: npc.state.manualTarget.y };
            } else if (fleetTarget) {
              targetPoint = { x: fleetTarget.x, y: fleetTarget.y };
            } else {
              // No pin and no manual override -> do not fire
              continue;
            }
          } else if (isEnemy) {
            // Enemy: select the largest alive opposing ship (player or friendlies)
            try {
              const enemySet2 = window.EnemyFleet1 instanceof Set ? window.EnemyFleet1 : new Set();
              const myId = String(npc.state.id);
              const myIsEnemy = enemySet2.has(myId);
              
              // Check if current target is still alive, if not clear it
              if (npc.state.currentTargetId) {
                const currentTargetId = String(npc.state.currentTargetId);
                let currentTargetAlive = false;
                
                // Check if current target is player
                const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
                if (currentTargetId === pid) {
                  const palive = !!(window.shipState && !(window.shipState.effects?.sunk || window.shipState.sunk));
                  const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
                  // Check if player is in ANY fleet, not just Fleet 1
                  const inFleet = !!(
                    (fa[1] instanceof Set && fa[1].has(pid)) ||
                    (fa[2] instanceof Set && fa[2].has(pid)) ||
                    (fa[3] instanceof Set && fa[3].has(pid))
                  );
                  const notDespawned = !(window.PlayerDespawned === true);
                  currentTargetAlive = palive && inFleet && notDespawned;
                }
                
                // Check if current target is an NPC
                if (!currentTargetAlive && Array.isArray(window.IronTideFleet)) {
                  for (let k=0; k<window.IronTideFleet.length; k++){
                    const h = window.IronTideFleet[k];
                    if (h && h.state && String(h.state.id) === currentTargetId) {
                      currentTargetAlive = !(h.state.effects?.sunk || h.state.sunk);
                      break;
                    }
                  }
                }
                
                // Clear dead target
                if (!currentTargetAlive) {
                  npc.state.currentTargetId = null;
                }
              }
              
              const candidates = [];
              // Consider player if alive
              try {
                const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
                const palive = !!(window.shipState && !(window.shipState.effects?.sunk || window.shipState.sunk));
                const pIsEnemy = enemySet2.has(pid);
                // Also require player to be present in FleetAssignments (not despawned) and not explicitly flagged as despawned
                const fa = window.IronTideFleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
                // Check if player is in ANY fleet, not just Fleet 1
                const inFleet = !!(
                  (fa[1] instanceof Set && fa[1].has(pid)) ||
                  (fa[2] instanceof Set && fa[2].has(pid)) ||
                  (fa[3] instanceof Set && fa[3].has(pid))
                );
                const notDespawned = !(window.PlayerDespawned === true);
                if (palive && myIsEnemy && !pIsEnemy && window.shipState.ship && inFleet && notDespawned) {
                  candidates.push({ id: pid, x: window.shipState.ship.x, y: window.shipState.ship.y, profile: window.shipProfile });
                }
              } catch {}
              // Consider any friendly NPCs that are alive
              if (Array.isArray(window.IronTideFleet)) {
                for (let k=0; k<window.IronTideFleet.length; k++){
                  const h = window.IronTideFleet[k]; if (!h || !h.state || !h.state.ship) continue;
                  const idStr = String(h.state.id);
                  const alive = !(h.state.effects?.sunk || h.state.sunk);
                  const isEnemyH = enemySet2.has(idStr);
                  if (alive && myIsEnemy && !isEnemyH) {
                    candidates.push({ id: idStr, x: h.state.ship.x, y: h.state.ship.y, profile: h.profile });
                  }
                }
              }
              if (candidates.length) {
                candidates.sort((a,b)=>{
                  const da = (a.profile && typeof a.profile.displacement_tons === 'number') ? a.profile.displacement_tons : 0;
                  const db = (b.profile && typeof b.profile.displacement_tons === 'number') ? b.profile.displacement_tons : 0;
                  return db - da;
                });
                const tgt = candidates[0];
                targetPoint = { x: tgt.x, y: tgt.y };
                try { npc.state.currentTargetId = String(tgt.id); } catch {}
                // Convert chosen target to a lead point (approximate shooter as NPC ship center)
                try {
                  const tid = String(npc.state.currentTargetId);
                  const ent = resolveShipEntityById(tid);
                  if (ent && typeof ent.x === 'number' && typeof ent.y === 'number') {
                    const v = getEntityVelocityEstimate(ent, tid);
                    const ps = getShellSpeedWorldPerSec();
                    const lead = predictIntercept({ x: npc.state.ship.x, y: npc.state.ship.y }, { x: ent.x, y: ent.y }, v, ps);
                    targetPoint = { x: lead.x, y: lead.y };
                  }
                } catch {}
              } else {
                // No valid targets - clear current target and don't fire
                try { npc.state.currentTargetId = null; } catch {}
                continue;
              }
            } catch { continue; }
          } else {
            // Unknown side -> skip
            continue;
          }

          // Auto-aim turrets for this NPC toward the chosen target with dead zones
          try {
            if (npc.state.npcTurretAnglesRelDeg && turretPoints && shipImg && targetPoint) {
              const vrN = currentViewRect || getViewRect();
              const scaleN = vrN.scale || 1;
              const targetHBaseN = 96;
              const targetHScreenN = Math.round(targetHBaseN * (zoomOutSlider.value || 1));
              const worldHN = Math.max(1, targetHScreenN / scaleN);
              const worldWN = shipImg && shipImg.width && shipImg.height ? Math.round(worldHN * (shipImg.width / shipImg.height)) : worldHN;
              const sxN = shipImg && shipImg.width ? (worldWN / shipImg.width) : 1;
              const syN = shipImg && shipImg.height ? (worldHN / shipImg.height) : 1;
              const byIdN = update.__npcTurretMapAll || new Map(turretPoints.map(p => [p.id, p]));
              update.__npcTurretMapAll = byIdN;
              ['t1','t2','t3','t4'].forEach(id => {
                const isTop = (id === 't1' || id === 't2');
                const ds = isTop ? 145 : 325;
                const de = isTop ? 235 : 55;
                const cur = npc.state.npcTurretAnglesRelDeg[id] ?? (isTop ? 0 : 180);
                let targetRel = isTop ? 0 : 180;
                const tp = byIdN.get(id);
                if (tp) {
                  const tx = (tp.x - shipImg.width / 2) * sxN;
                  const ty = (tp.y - shipImg.height / 2) * syN;
                  const forwardDelta = (id === 't1') ? (5 / scaleN) : 0;
                  const hr = (npc.state.ship.heading || 0) * Math.PI/180;
                  const lx = tx; const ly = ty - forwardDelta;
                  const twx = npc.state.ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
                  const twy = npc.state.ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
                  const wdx = targetPoint.x - twx; const wdy = targetPoint.y - twy;
                  const desiredWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
                  targetRel = angleNorm360(desiredWorld - (npc.state.ship.heading || 0));
                }
                let stepTo;
                if (inDeadZone(targetRel, ds, de)) {
                  stepTo = isTop ? (Math.abs(angDist(cur, ds)) <= Math.abs(angDist(cur, de)) ? ds : de) : cur;
                } else {
                  stepTo = targetRel;
                }
                npc.state.npcTurretAnglesRelDeg[id] = stepAngleAvoidingDeadZone(cur, stepTo, ds, de, turretMaxSpeedDeg, dt);
              });
            }
          } catch {}

          // Ensure per-turret schedule exists for this NPC
          const gun = (window.NpcGunsById[idStr] = window.NpcGunsById[idStr] || { intervalSec: 12, lastTurretAt: { t1:-1e9,t2:-1e9,t3:-1e9,t4:-1e9 }, schedule: [] });
          const idsNpc = ['t1','t2','t3','t4'];
          if (!Array.isArray(gun.schedule)) gun.schedule = [];
          idsNpc.forEach(tid => {
            if (!gun.schedule.some(s => s && s.id === tid)) {
              const jitter = Math.random() * 0.7;
              const nextT = Math.max(simTime, (gun.lastTurretAt[tid] || -1e9) + gun.intervalSec) + jitter;
              gun.schedule.push({ id: tid, t: nextT });
            }
          });
          if (gun.schedule.length) {
            const remainingNpc = [];
            for (let j=0;j<gun.schedule.length;j++){
              const item = gun.schedule[j];
              if (simTime >= item.t) {
                const res = getNpcTurretMuzzleWorldFor(npc, item.id);
                if (res) {
                  const can = canNpcTurretFireFor(npc, item.id, targetPoint);
                  const cooldownReady = (simTime - (gun.lastTurretAt[item.id] || -1e9) >= gun.intervalSec);
                  const needTarget = !!isEnemy; // enemies must have a valid target point
                  const hasTarget = !!(targetPoint && typeof targetPoint.x === 'number' && typeof targetPoint.y === 'number');
                  // Range check vs targetPoint from this muzzle
                  let inRange = true;
                  try {
                    const maxR = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 1e9;
                    if (hasTarget) {
                      const rdx = targetPoint.x - res.x; const rdy = targetPoint.y - res.y;
                      inRange = (Math.hypot(rdx, rdy) <= maxR);
                    }
                  } catch {}
                  const ready = !!(can.ok && cooldownReady && (!needTarget || hasTarget) && inRange);
                  if (ready) {
                    // Compute aim toward targetPoint with small lateral deviation
                    let aim = (can.aimDeg != null ? can.aimDeg : (res.aimDeg != null ? res.aimDeg : res.worldDeg));
                    let tgt = null;
                    if (targetPoint) {
                      // If we have a concrete target id, refine lead using the actual muzzle position
                      try {
                        if (npc.state.currentTargetId) {
                          const tid = String(npc.state.currentTargetId);
                          const ent = resolveShipEntityById(tid);
                          if (ent && typeof ent.x === 'number' && typeof ent.y === 'number') {
                            const v2 = getEntityVelocityEstimate(ent, tid);
                            const ps2 = getShellSpeedWorldPerSec();
                            const lead2 = predictIntercept({ x: res.x, y: res.y }, { x: ent.x, y: ent.y }, v2, ps2);
                            targetPoint = { x: lead2.x, y: lead2.y };
                          }
                        }
                      } catch {}
                      const dx = targetPoint.x - res.x; const dy = targetPoint.y - res.y;
                      const dist = Math.hypot(dx, dy) || 1;
                      const px = dy / dist, py = -dx / dist;
                      const dev = dist * 0.05 * (Math.random()*2 - 1);
                      const devX = targetPoint.x + px * dev;
                      const devY = targetPoint.y + py * dev;
                      tgt = { x: devX, y: devY };
                      const adx = tgt.x - res.x; const ady = tgt.y - res.y;
                      aim = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
                    }
                    const projIdPrefix = isEnemy ? 'et' : 'ft';
                    spawnShell(res.x, res.y, aim, projIdPrefix + item.id.substring(1), tgt);
                    try { spawnBlackSmoke(res.x, res.y, 6); } catch {}
                    gun.lastTurretAt[item.id] = simTime;
                    const jitterNext = Math.random() * 0.7;
                    item.t = simTime + gun.intervalSec + jitterNext;
                    remainingNpc.push(item);
                  } else {
                    remainingNpc.push(item);
                  }
                }
              } else {
                remainingNpc.push(item);
              }
            }
            gun.schedule = remainingNpc;
          }
        }
      }
    } catch {}

    // AI gunnery for friendly ships in IronTideFleet (non-player)
    // Enables friendly cruisers (and any friendly with turrets) to fire using the same scheduler as NPCs
    try {
      if (Array.isArray(window.IronTideFleet)) {
        const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
        window.NpcGunsById = window.NpcGunsById || {};
        for (let i = 0; i < window.IronTideFleet.length; i++) {
          const npc = window.IronTideFleet[i];
          if (!npc || !npc.state || !npc.profile || !npc.damageModel) continue;
          const idStr = String(npc.state.id || '');
          if (playerId && idStr === playerId) continue; // skip player ship
          // Requires turrets data to be present
          if (!npc.state.npcTurretAnglesRelDeg) continue;
          // Determine fleet id for this friendly ship
          let fid = 1;
          try {
            const A = window.IronTideFleetAssignments || {};
            const idNumNpc = npc && npc.state && npc.state.id != null ? Number(npc.state.id) : NaN;
            const inSet = (s) => !!(s && (s.has(idStr) || (!Number.isNaN(idNumNpc) && s.has(idNumNpc))));
            if (A[2] instanceof Set && inSet(A[2])) fid = 2;
            else if (A[3] instanceof Set && inSet(A[3])) fid = 3;
            else fid = 1;
          } catch {}
          // Choose target: Fleet 1 uses player's firingSolution, Fleet 2/3 use FleetGunnery[fid]
          let targetPoint = null;
          let targetIdStr = null;
          try {
            if (fid === 1) {
              if (typeof firingSolution === 'object') {
                if (firingSolution.target && Number.isFinite(firingSolution.target.x) && Number.isFinite(firingSolution.target.y)) {
                  targetPoint = { x: firingSolution.target.x, y: firingSolution.target.y };
                } else if (firingSolution.targetId != null && typeof resolveShipEntityById === 'function') {
                  targetIdStr = String(firingSolution.targetId);
                  const ent = resolveShipEntityById(targetIdStr);
                  if (ent && Number.isFinite(ent.x) && Number.isFinite(ent.y)) targetPoint = { x: ent.x, y: ent.y };
                }
              }
            } else if (fid === 2 || fid === 3) {
              const FG = window.FleetGunnery && window.FleetGunnery[fid];
              if (FG && FG.target && Number.isFinite(FG.target.x) && Number.isFinite(FG.target.y)) {
                targetPoint = { x: FG.target.x, y: FG.target.y };
              } else if (FG && FG.targetId != null && typeof resolveShipEntityById === 'function') {
                targetIdStr = String(FG.targetId);
                const ent = resolveShipEntityById(targetIdStr);
                if (ent && Number.isFinite(ent.x) && Number.isFinite(ent.y)) targetPoint = { x: ent.x, y: ent.y };
              }
            }
          } catch {}
          const gun = (window.NpcGunsById[idStr] = window.NpcGunsById[idStr] || { intervalSec: 12, lastTurretAt: { t1:-1e9,t2:-1e9,t3:-1e9,t4:-1e9 }, schedule: [] });
          const idsNpc = ['t1','t2','t3','t4'];
          if (!Array.isArray(gun.schedule)) gun.schedule = [];
          idsNpc.forEach(tid => {
            if (!gun.schedule.some(s => s && s.id === tid)) {
              const jitter = Math.random() * 0.7;
              const nextT = Math.max(simTime, (gun.lastTurretAt[tid] || -1e9) + gun.intervalSec) + jitter;
              gun.schedule.push({ id: tid, t: nextT });
            }
          });
          if (gun.schedule.length) {
            const remainingNpc = [];
            for (let j=0;j<gun.schedule.length;j++){
              const item = gun.schedule[j];
              if (simTime >= item.t) {
                const res = getNpcTurretMuzzleWorldFor(npc, item.id);
                if (res) {
                  const can = canNpcTurretFireFor(npc, item.id, targetPoint);
                  const cooldownReady = (simTime - (gun.lastTurretAt[item.id] || -1e9) >= gun.intervalSec);
                  // Require a valid target
                  const hasTarget = !!(targetPoint && typeof targetPoint.x === 'number' && typeof targetPoint.y === 'number');
                  let inRange = true;
                  try {
                    const maxR = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 1e9;
                    if (hasTarget) {
                      const rdx = targetPoint.x - res.x; const rdy = targetPoint.y - res.y;
                      inRange = (Math.hypot(rdx, rdy) <= maxR);
                    }
                  } catch {}
                  const ready = !!(can.ok && cooldownReady && hasTarget && inRange);
                  if (ready) {
                    let aim = (can.aimDeg != null ? can.aimDeg : (res.aimDeg != null ? res.aimDeg : res.worldDeg));
                    let tgt = null;
                    if (hasTarget) {
                      // If we have a concrete target id, refine lead using the actual muzzle position
                      try {
                        if (targetIdStr) {
                          const ent = resolveShipEntityById(targetIdStr);
                          if (ent && typeof ent.x === 'number' && typeof ent.y === 'number') {
                            const v2 = getEntityVelocityEstimate(ent, targetIdStr);
                            const ps2 = getShellSpeedWorldPerSec();
                            const lead2 = predictIntercept({ x: res.x, y: res.y }, { x: ent.x, y: ent.y }, v2, ps2);
                            targetPoint = { x: lead2.x, y: lead2.y };
                          }
                        }
                      } catch {}
                      const dx = targetPoint.x - res.x; const dy = targetPoint.y - res.y;
                      const dist = Math.hypot(dx, dy) || 1;
                      const px = dy / dist, py = -dx / dist;
                      const dev = dist * 0.05 * (Math.random()*2 - 1);
                      const devX = targetPoint.x + px * dev;
                      const devY = targetPoint.y + py * dev;
                      tgt = { x: devX, y: devY };
                      const adx = tgt.x - res.x; const ady = tgt.y - res.y;
                      aim = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
                    }
                    spawnShell(res.x, res.y, aim, 'ft' + item.id.substring(1), tgt);
                    try { spawnBlackSmoke(res.x, res.y, 6); } catch {}
                    gun.lastTurretAt[item.id] = simTime;
                    const jitterNext = Math.random() * 0.7;
                    item.t = simTime + gun.intervalSec + jitterNext;
                    remainingNpc.push(item);
                  } else {
                    remainingNpc.push(item);
                  }
                }
              } else {
                remainingNpc.push(item);
              }
            }
            gun.schedule = remainingNpc;
          }
        }
      }
    } catch {}

    // Keep target pin following a live ship if targetId points to one; else clear and disable FIRE
    try {
      if (firingSolution && firingSolution.targetId) {
        const tid = String(firingSolution.targetId);
        let tx = null, ty = null, alive = false;
        // Check npc1
        try { if (npc1 && npc1.state && String(npc1.state.id) === tid) { const s=npc1.state.ship; if (s) { tx=s.x; ty=s.y; } alive = !(npc1.state.effects?.sunk || npc1.state.sunk); } } catch {}
        // Check additional NPCs
        if (!tx && Array.isArray(window.NPCs)) {
          for (let i=0;i<window.NPCs.length;i++){
            const n = window.NPCs[i];
            try {
              if (n && n.state && String(n.state.id) === tid) {
                const s = n.state.ship; if (s) { tx=s.x; ty=s.y; }
                alive = !(n.state.effects?.sunk || n.state.sunk);
                break;
              }
            } catch {}
          }
        }
        if (alive && tx != null && ty != null) {
          firingSolution.target = { x: tx, y: ty };
        } else {
          // Target died or missing: clear and disable FIRE to avoid shooting the sea
          firingSolution.target = null; firingSolution.targetId = null;
          try { if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false); } catch {}
        }
      }
    } catch {}

    // FIRE scheduling: one salvo every intervalSec while enabled; random per-turret delays
    // Helper: are we allowed to fire? Only when a target exists AND solution calc is finished AND target is in range
    const solutionReady = !!(firingSolution && firingSolution.target) && !(solutionCalc && solutionCalc.active);
    
    // Continuous range check - disable firing if target moves out of range
    if (gunneryFire.enabled && firingSolution && firingSolution.target) {
      try {
        const maxRange = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : 1000;
        const dx = firingSolution.target.x - ship.x;
        const dy = firingSolution.target.y - ship.y;
        const distance = Math.hypot(dx, dy);
        if (distance > maxRange) {
          // Target moved out of range - disable firing
          if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false);
        }
      } catch {}
    }
    
    if (!gunneryFire.enabled) {
      gunneryFire.schedule.length = 0;
    } else {
      // Ensure per-turret cooldown state exists
      if (!gunneryFire.lastTurretAt) gunneryFire.lastTurretAt = { t1: -1e9, t2: -1e9, t3: -1e9, t4: -1e9 };
      const ids = ['t1','t2','t3','t4'];
      // Ensure one persistent schedule item per turret; its 't' is the next eligible time based on cooldown
      if (!Array.isArray(gunneryFire.schedule)) gunneryFire.schedule = [];
      for (const id of ids) {
        if (!gunneryFire.schedule.some(s => s && s.id === id)) {
          const jitter = Math.random() * 0.5;
          const nextT = Math.max(simTime, (gunneryFire.lastTurretAt[id] || -1e9) + gunneryFire.intervalSec) + jitter;
          gunneryFire.schedule.push({ id, t: nextT });
        }
      }
      // Fire any shots whose time has come; if not ready, keep and try again as soon as conditions allow
      if (gunneryFire.schedule.length) {
        const remaining = [];
        for (let i=0;i<gunneryFire.schedule.length;i++){
          const item = gunneryFire.schedule[i];
          if (simTime >= item.t) {
            // Spawn a shell from this turret's muzzle
            const res = getTurretMuzzleWorld(item.id);
            if (res) {
              // Only fire if this turret is aligned (green) and not occluded by bridge
              const can = canTurretFire(item.id);
              // Only fire when solution exists, turret is clear, and cooldown has elapsed
              const ready = !!(solutionReady && can.ok && (simTime - (gunneryFire.lastTurretAt[item.id] || -1e9) >= gunneryFire.intervalSec));
              if (ready) {
                let tgt = null; let aim = (can.aimDeg != null ? can.aimDeg : (res.aimDeg != null ? res.aimDeg : res.worldDeg));
                // If we have a targetId, compute lead at fire time
                if (firingSolution && firingSolution.targetId != null) {
                  try {
                    const tid = String(firingSolution.targetId);
                    const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
                    const s = others.find(o => String(o.id) === tid);
                    if (s) {
                      const v = getEntityVelocityEstimate(s, tid);
                      const ps = getShellSpeedWorldPerSec();
                      const lead = predictIntercept({ x: res.x, y: res.y }, { x: s.x, y: s.y }, v, ps);
                      const dx = lead.x - res.x; const dy = lead.y - res.y;
                      const dist = Math.hypot(dx, dy) || 1;
                      const px = dy / dist; const py = -dx / dist;
                      const dev = dist * 0.05 * (Math.random()*2 - 1);
                      const devX = lead.x + px * dev;
                      const devY = lead.y + py * dev;
                      tgt = { x: devX, y: devY };
                      const adx = tgt.x - res.x; const ady = tgt.y - res.y;
                      aim = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
                    }
                  } catch {}
                } else if (firingSolution && firingSolution.target) {
                  // Try to infer a moving ship near the pin and lead it; fallback to pin
                  const pin = firingSolution.target;
                  let near = null;
                  try {
                    const others = (typeof collectOtherShips === 'function') ? collectOtherShips() : [];
                    let bestD = 1e9;
                    for (let i=0;i<others.length;i++) {
                      const s2 = others[i];
                      const d2 = Math.hypot((s2.x - pin.x), (s2.y - pin.y));
                      if (d2 < bestD) { bestD = d2; near = s2; }
                    }
                    // Only snap if close enough to the pin to be intentional
                    if (near && bestD <= 300) {
                      const v = getEntityVelocityEstimate(near, String(near.id));
                      const ps = getShellSpeedWorldPerSec();
                      const lead = predictIntercept({ x: res.x, y: res.y }, { x: near.x, y: near.y }, v, ps);
                      const dx = lead.x - res.x; const dy = lead.y - res.y;
                      const dist = Math.hypot(dx, dy) || 1;
                      const px = dy / dist; const py = -dx / dist;
                      const dev = dist * 0.05 * (Math.random()*2 - 1);
                      const devX = lead.x + px * dev;
                      const devY = lead.y + py * dev;
                      tgt = { x: devX, y: devY };
                      const adx = tgt.x - res.x; const ady = tgt.y - res.y;
                      aim = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
                    }
                  } catch {}
                  if (!tgt) {
                    // Lateral deviation = +/-5% of distance to target point
                    const dx = pin.x - res.x; const dy = pin.y - res.y;
                    const dist = Math.hypot(dx, dy) || 1;
                    const px = dy / dist; // unit perpendicular (left)
                    const py = -dx / dist;
                    const dev = dist * 0.05 * (Math.random()*2 - 1);
                    const devX = pin.x + px * dev;
                    const devY = pin.y + py * dev;
                    tgt = { x: devX, y: devY };
                    const adx = tgt.x - res.x; const ady = tgt.y - res.y;
                    aim = (Math.atan2(adx, -ady) * 180 / Math.PI + 360) % 360;
                  }
                }
                spawnShell(res.x, res.y, aim, item.id, tgt);
                // Visual effect: larger puff of black smoke at the firing turret, wind-affected
                try { spawnBlackSmoke(res.x, res.y, 6); } catch {}
                // Mark last fire time for this turret and schedule its next eligible time (cooldown + jitter)
                gunneryFire.lastTurretAt[item.id] = simTime;
                const jitterNext = Math.random() * 0.5;
                item.t = simTime + gunneryFire.intervalSec + jitterNext;
                // Schedule reload sound only once initially after enabling; keep previous behavior optional
                if (!gunneryFire.reloadScheduled) {
                  gunneryFire.reloadScheduled = true;
                  try { setTimeout(() => { try { playShellLoadSound(); } catch {} }, 5000); } catch {}
                }
                // Keep the item for the next cycle
                remaining.push(item);
              } else {
                // Not ready to fire yet â€” keep item so it can fire as soon as conditions allow
                remaining.push(item);
              }
            }
          } else {
            remaining.push(item);
          }
        }
        gunneryFire.schedule = remaining;
      }
    }

    // Apply turret dead zones and auto-rotate smoothly
    // Dead zones
    const topDeadStart = 145, topDeadEnd = 235;   // top (t1,t2) cannot traverse bridge
    const bottomDeadStart = 325, bottomDeadEnd = 55; // bottom (t3,t4) opposite dead zone (wrap)
    // Compute drawShipWorld-equivalent turret offsets to get turret world positions
    const vrUpd = currentViewRect || getViewRect();
    const scaleUpd = vrUpd.scale || 1;
    const targetHBaseUpd = 96;
    const targetHScreenUpd = Math.round(targetHBaseUpd * (zoomOutSlider.value || 1));
    const worldHUpd = Math.max(1, targetHScreenUpd / scaleUpd);
    let worldWUpd = worldHUpd;
    if (shipImg && shipImg.width && shipImg.height) {
      worldWUpd = Math.round(worldHUpd * (shipImg.width / shipImg.height));
    }
    const sxUpd = shipImg && shipImg.width ? (worldWUpd / shipImg.width) : 1;
    const syUpd = shipImg && shipImg.height ? (worldHUpd / shipImg.height) : 1;
    // Per-turret steering
    const ids = ['t1','t2','t3','t4'];
    ids.forEach(id => {
      const isTop = (id === 't1' || id === 't2');
      const cur = turretAnglesRelDeg[id] ?? 0;
      const ds = isTop ? topDeadStart : bottomDeadStart;
      const de = isTop ? topDeadEnd : bottomDeadEnd;
      // Default desired based on global desiredTurretWorldDeg if no target pin
      let targetRel = angleNorm360(desiredTurretWorldDeg - ship.heading);
      // When not in use (no firing solution), tuck turrets: top (t1,t2) -> 0Â°, bottom (t3,t4) -> 180Â° relative to ship
      if (!(firingSolution && firingSolution.target)) {
        targetRel = isTop ? 0 : 180;
      }
      // If a target pin exists, compute desired based on turret's own world position (parallax-correct)
      if (firingSolution && firingSolution.target && turretPoints && shipImg) {
        const byId = update.__turretMap || new Map(turretPoints.map(p => [p.id, p]));
        update.__turretMap = byId;
        const tp = byId.get(id);
        if (tp) {
          const tx = (tp.x - shipImg.width / 2) * sxUpd;
          const ty = (tp.y - shipImg.height / 2) * syUpd;
          const forwardDelta = (id === 't1') ? (5 / scaleUpd) : 0;
          const hr = ship.heading * Math.PI/180;
          const lx = tx;
          const ly = ty - forwardDelta;
          const twx = ship.x + (lx * Math.cos(hr) - ly * Math.sin(hr));
          const twy = ship.y + (lx * Math.sin(hr) + ly * Math.cos(hr));
          const wdx = firingSolution.target.x - twx;
          const wdy = firingSolution.target.y - twy;
          const desiredWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
          targetRel = angleNorm360(desiredWorld - ship.heading);
        }
      }
      // Apply dead-zone strategy
      let stepTo;
      if (inDeadZone(targetRel, ds, de)) {
        stepTo = isTop ? (Math.abs(angDist(cur, ds)) <= Math.abs(angDist(cur, de)) ? ds : de) : cur;
      } else {
        stepTo = targetRel;
      }
      turretAnglesRelDeg[id] = stepAngleAvoidingDeadZone(cur, stepTo, ds, de, turretMaxSpeedDeg, dt);
      // Recoil decay: smooth return toward 0 (screen-constant rate)
      try {
        const vr = currentViewRect || getViewRect(); const scale = vr.scale || 1;
        const retRate = 12 / scale; // world units per second to recover ~4px in ~0.33s
        if (turretRecoil && turretRecoil[id] > 0) {
          turretRecoil[id] = Math.max(0, turretRecoil[id] - retRate * dt);
        }
      } catch {}
    });

    // Fleet 2/3 Leader Turret Control and Firing
    for (let fleetId = 2; fleetId <= 3; fleetId++) {
      const fleetLeader = getFleetLeader(fleetId);
      const fleetSettings = window.IronTideFleetSettings[fleetId];
      
      if (fleetLeader && fleetLeader.state && fleetSettings && fleetSettings.firingSolution && fleetSettings.firingSolution.target) {
        const leaderState = fleetLeader.state;
        const leaderShip = leaderState.ship;
        const target = fleetSettings.firingSolution.target;
        
        // Initialize turret angles if not present
        if (!leaderState.npcTurretAnglesRelDeg) {
          leaderState.npcTurretAnglesRelDeg = { t1: 0, t2: 0, t3: 180, t4: 180 };
        }
        
        // Update turret angles to track target
        const turretIds = ['t1', 't2', 't3', 't4'];
        turretIds.forEach(id => {
          const isTop = (id === 't1' || id === 't2');
          const cur = leaderState.npcTurretAnglesRelDeg[id] ?? (isTop ? 0 : 180);
          const ds = isTop ? 145 : 325; // dead zone start
          const de = isTop ? 235 : 55;  // dead zone end
          
          // Calculate desired angle to target
          let targetRel = isTop ? 0 : 180; // default tuck position
          
          if (turretPoints && shipImg) {
            const tp = turretPoints.find(p => p.id === id);
            if (tp) {
              const tx = (tp.x - shipImg.width / 2) * sxUpd;
              const ty = (tp.y - shipImg.height / 2) * syUpd;
              const hr = leaderShip.heading * Math.PI/180;
              const twx = leaderShip.x + (tx * Math.cos(hr) - ty * Math.sin(hr));
              const twy = leaderShip.y + (tx * Math.sin(hr) + ty * Math.cos(hr));
              const wdx = target.x - twx;
              const wdy = target.y - twy;
              const desiredWorld = (Math.atan2(wdx, -wdy) * 180 / Math.PI + 360) % 360;
              targetRel = angleNorm360(desiredWorld - leaderShip.heading);
            }
          }
          
          // Apply dead-zone avoidance
          let stepTo;
          if (inDeadZone(targetRel, ds, de)) {
            stepTo = isTop ? (Math.abs(angDist(cur, ds)) <= Math.abs(angDist(cur, de)) ? ds : de) : cur;
          } else {
            stepTo = targetRel;
          }
          
          leaderState.npcTurretAnglesRelDeg[id] = stepAngleAvoidingDeadZone(cur, stepTo, ds, de, turretMaxSpeedDeg, dt);
        });
        
        // Fleet-specific firing logic
        if (fleetSettings.fireEnabled) {
          // Initialize fleet gunnery if not present
          if (!leaderState.fleetGunnery) {
            leaderState.fleetGunnery = {
              lastTurretAt: { t1: -1e9, t2: -1e9, t3: -1e9, t4: -1e9 },
              schedule: []
            };
          }
          
          const fleetGunnery = leaderState.fleetGunnery;
          const cooldown = 3.5; // seconds between shots
          
          // Process firing schedule
          const remaining = [];
          for (const item of fleetGunnery.schedule) {
            const lastFired = fleetGunnery.lastTurretAt[item.id] || -1e9;
            const readyTime = lastFired + cooldown;
            
            if (simTime >= readyTime && simTime >= item.t) {
              // Check if turret can fire (alignment and dead zone)
              const turretCheck = getNpcTurretAimFor(fleetLeader, item.id, target);
              if (turretCheck && turretCheck.ok && turretCheck.aligned && !turretCheck.occluded) {
                // Fire the turret
                const res = getNpcTurretMuzzleWorldFor(fleetLeader, item.id);
                if (res) {
                  const projIdPrefix = 'f' + fleetId + 't'; // f2t1, f3t2, etc.
                  spawnShell(res.x, res.y, turretCheck.aimDeg, projIdPrefix + item.id.substring(1), target);
                  try { spawnBlackSmoke(res.x, res.y, 6); } catch {}
                  fleetGunnery.lastTurretAt[item.id] = simTime;
                  
                  // Schedule next shot with jitter
                  const jitterNext = Math.random() * 0.7;
                  fleetGunnery.schedule.push({ id: item.id, t: simTime + cooldown + jitterNext });
                }
              } else {
                // Not ready to fire yet, keep trying
                remaining.push(item);
              }
            } else {
              remaining.push(item);
            }
          }
          fleetGunnery.schedule = remaining;
          
          // Add turrets to firing schedule if not already scheduled
          turretIds.forEach(id => {
            const alreadyScheduled = fleetGunnery.schedule.some(item => item.id === id);
            if (!alreadyScheduled) {
              fleetGunnery.schedule.push({ id: id, t: simTime + Math.random() * 0.5 });
            }
          });
        }
      }
    }

    // Handle sunk transitions (spawn one-shot animation and despawn entities)
    try {
      window.__SunkIds = window.__SunkIds || new Set();
      function markSunkHandled(id){ try { if (id != null) window.__SunkIds.add(String(id)); } catch {} }
      function alreadyHandled(id){ try { return id != null && window.__SunkIds.has(String(id)); } catch { return false; } }
      function removeFromFleets(idStr){
        try {
          const fa = window.IronTideFleetAssignments;
          if (fa) { [1,2,3].forEach(k=>{ if (fa[k] instanceof Set) fa[k].delete(idStr); }); }
        } catch {}
        try { if (window.EnemyFleet1 instanceof Set) window.EnemyFleet1.delete(idStr); } catch {}
      }
      // Player sunk
      try {
        const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
        const sunk = !!(window.shipState && (window.shipState.effects?.sunk || window.shipState.sunk));
        if (sunk && !alreadyHandled(pid)) {
          spawnSinkingFor({ id: pid, kind: 'player', ship });
          try { spawnMightyExplosion(ship.x, ship.y); } catch {}
          try { playExplodeSound(); playSinkSound(); } catch {}
          markSunkHandled(pid);
          // Stop movement
          try { shipState.speedKts = 0; shipState.actualSpeedKts = 0; } catch {}
          // Cleanup HUD/camera/cycles for player ship sink
          try { if (typeof cleanupSunkShipById === 'function') cleanupSunkShipById(pid); } catch {}
          try { wake.enabled = false; } catch {}
          // Clear target from all fleets if they were targeting this player
          try {
            for (let fleetId = 1; fleetId <= 3; fleetId++) {
              const fleetSettings = window.IronTideFleetSettings[fleetId];
              if (fleetSettings && fleetSettings.firingSolution && fleetSettings.firingSolution.targetId && String(fleetSettings.firingSolution.targetId) === pid) {
                fleetSettings.firingSolution.target = null;
                fleetSettings.firingSolution.targetId = null;
                fleetSettings.fireEnabled = false;
              }
            }
            // Also clear global if it was targeting this player
            if (firingSolution && firingSolution.targetId && String(firingSolution.targetId) === pid) {
              firingSolution.target = null; firingSolution.targetId = null;
              if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false);
            }
          } catch {}
          // Cleanup smoke emitters and active damage emitters for this ship
          try { cleanupShipResources(pid, ship); } catch {}
          // Dispose the player's damage model timers and release references
          try { if (window.damageModel && typeof window.damageModel.dispose === 'function') window.damageModel.dispose(); } catch {}
          // Remove old player handle from IronTideFleet to reduce memory
          try {
            if (Array.isArray(window.IronTideFleet)) {
              window.IronTideFleet = window.IronTideFleet.filter(e => !(e && e.state && String(e.state.id) === pid));
            }
          } catch {}
          // Attempt takeover of nearest friendly ship
          try { if (typeof window.takeoverNearestFriendly === 'function') window.takeoverNearestFriendly(ship.x, ship.y); } catch {}
        }
      } catch {}
      // npc1 sunk
      try {
        if (npc1 && npc1.state && npc1.state.id != null) {
          const idStr = String(npc1.state.id);
          const sunk = !!(npc1.state.effects?.sunk || npc1.state.sunk);
          if (sunk && !alreadyHandled(idStr)) {
            spawnSinkingFor({ id: idStr, kind: 'npc', ship: npc1.state.ship });
            try { spawnMightyExplosion(npc1.state.ship.x, npc1.state.ship.y); } catch {}
            try { playExplodeSound(); playSinkSound(); } catch {}
            markSunkHandled(idStr);
            removeFromFleets(idStr);
            // Despawn if helper exists; else null it out
            try { if (typeof cleanupSunkShipById === 'function') cleanupSunkShipById(idStr); } catch {}
            try { if (typeof window.despawnNpcById === 'function') window.despawnNpcById(idStr); else npc1 = null; } catch { npc1 = null; }
            // Clear target from all fleets if they were targeting this ship
            try {
              for (let fleetId = 1; fleetId <= 3; fleetId++) {
                const fleetSettings = window.IronTideFleetSettings[fleetId];
                if (fleetSettings && fleetSettings.firingSolution && fleetSettings.firingSolution.targetId && String(fleetSettings.firingSolution.targetId) === idStr) {
                  fleetSettings.firingSolution.target = null;
                  fleetSettings.firingSolution.targetId = null;
                  fleetSettings.fireEnabled = false;
                }
              }
              // Also clear global if it was targeting this ship
              if (firingSolution && firingSolution.targetId && String(firingSolution.targetId) === idStr) {
                firingSolution.target = null; firingSolution.targetId = null;
                if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false);
              }
            } catch {}
          }
        }
      } catch {}
      // Generic NPCs sunk
      try {
        if (Array.isArray(window.NPCs) && window.NPCs.length) {
          const remain = [];
          for (let i=0;i<window.NPCs.length;i++){
            const n = window.NPCs[i];
            if (!n || !n.state || n === npc1) { if (n) remain.push(n); continue; }
            const idStr = (n.state && n.state.id != null) ? String(n.state.id) : '';
            const sunk = !!(n.state.effects?.sunk || n.state.sunk);
            if (sunk && !alreadyHandled(idStr)) {
              spawnSinkingFor({ id: idStr, kind: 'npc', ship: n.state.ship });
              try { spawnMightyExplosion(n.state.ship.x, n.state.ship.y); } catch {}
              try { playExplodeSound(); playSinkSound(); } catch {}
              markSunkHandled(idStr);
              removeFromFleets(idStr);
              try { if (typeof window.despawnNpcById === 'function') window.despawnNpcById(idStr); } catch {}
              try { if (typeof cleanupSunkShipById === 'function') cleanupSunkShipById(idStr); } catch {}
              // Do not keep in remain (despawned)
              // Clear target from all fleets if they were targeting this ship
              try {
                for (let fleetId = 1; fleetId <= 3; fleetId++) {
                  const fleetSettings = window.IronTideFleetSettings[fleetId];
                  if (fleetSettings && fleetSettings.firingSolution && fleetSettings.firingSolution.targetId && String(fleetSettings.firingSolution.targetId) === idStr) {
                    fleetSettings.firingSolution.target = null;
                    fleetSettings.firingSolution.targetId = null;
                    fleetSettings.fireEnabled = false;
                  }
                }
                // Also clear global if it was targeting this ship
                if (firingSolution && firingSolution.targetId && String(firingSolution.targetId) === idStr) {
                  firingSolution.target = null; firingSolution.targetId = null;
                  if (typeof window.setFireEnabled === 'function') window.setFireEnabled(false);
                }
              } catch {}
            } else if (!sunk) {
              remain.push(n);
            }
          }
          window.NPCs = remain;
        }
      } catch {}
    } catch {}
    // NPC ship movement - update all NPC ships based on their state
    try {
      if (Array.isArray(window.IronTideFleet)) {
        if (window.VerboseLogs) console.log(`NPC Movement: Processing ${window.IronTideFleet.length} ships in IronTideFleet`);
        for (let i = 0; i < window.IronTideFleet.length; i++) {
          const npc = window.IronTideFleet[i];
          if (!npc || !npc.state || !npc.state.ship) continue;
          
          const state = npc.state;
          const ship = state.ship;
          if (window.VerboseLogs) console.log(`Processing ship ${state.id}, speedKts=${state.speedKts}, desiredHeading=${state.desiredHeading}`);
          
          // Initialize movement properties if missing
          if (typeof state.speedKts !== 'number') state.speedKts = 0;
          if (typeof state.actualSpeedKts !== 'number') state.actualSpeedKts = 0;
          if (typeof state.desiredHeading !== 'number') state.desiredHeading = ship.heading || 0;
          
          // Handle patterns and click-to-move for ALL fleet leaders (including Fleet 1 NPCs)
          for (let fleetId = 1; fleetId <= 3; fleetId++) {
            const leaderId = getFleetLeaderId(fleetId);
            if (leaderId && String(state.id) === leaderId) {
              // This NPC is a fleet leader
              let patternGuided = false;
              
              // Check for fleet-specific patterns only (do not use global 'patterns' for following)
              const fleetPatterns = (window.FleetPatterns && window.FleetPatterns[fleetId]);
              if (fleetPatterns && fleetPatterns.selected && fleetPatterns.path && fleetPatterns.path.length > 1 && state.actualSpeedKts >= 0) {
                
                // Zigzag pattern following
                if (fleetPatterns.selected === 'zigzag' && fleetPatterns.guiding !== false) {
                  const hasZigTwoPins = !!(fleetPatterns.zigPins && fleetPatterns.zigPins.length === 2);
                  const hasZigLegacyPin = !!fleetPatterns.pin;
                  
                  if (hasZigTwoPins || hasZigLegacyPin) {
                    const params = getZigParams();
                    const cp = closestPointOnPolyline(fleetPatterns.path, ship.x, ship.y);
                    const joinThresh = 10 + Math.max(20, params.amplitude * 0.8);
                    
                    // If close to end pin, stop guiding
                    const endPin = hasZigTwoPins ? fleetPatterns.zigPins[1] : fleetPatterns.pin;
                    const pinDX = endPin.x - ship.x, pinDY = endPin.y - ship.y;
                    const pinDist = Math.hypot(pinDX, pinDY);
                    const finishRadius = Math.max(30, params.wavelength * 0.2);
                    
                    if (!fleetPatterns.loop && pinDist <= finishRadius) {
                      fleetPatterns.guiding = false;
                      state.desiredHeading = ship.heading; // lock to current heading
                    } else if (cp && cp.dist > joinThresh) {
                      const dx = cp.point.x - ship.x;
                      const dy = cp.point.y - ship.y;
                      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                      state.desiredHeading = desired;
                    } else {
                      // Follow the path with ping-pong support
                      const ktsAbs = Math.abs(state.actualSpeedKts);
                      const lookahead = zigLookaheadForSpeed(params, ktsAbs);
                      const zigFwd = (fleetPatterns.zigForward !== false);
                      const distSigned = zigFwd ? lookahead : -lookahead;
                      const ahead = cp ? moveAlongPath(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                      if (fleetPatterns.loop) {
                        const atStart = (cp.segIndex <= 0 && cp.t < 0.02);
                        const atEnd = (cp.segIndex >= fleetPatterns.path.length - 2 && cp.t > 0.98);
                        if (atEnd && zigFwd) fleetPatterns.zigForward = false;
                        else if (atStart && !zigFwd) fleetPatterns.zigForward = true;
                      }
                      const dx = ahead.x - ship.x;
                      const dy = ahead.y - ship.y;
                      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                      state.desiredHeading = desired;
                    }
                    
                    if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                    patternGuided = true;
                  }
                }
                
                // Box pattern following
                else if (fleetPatterns.selected === 'box') {
                  const cp = closestPointOnLoop(fleetPatterns.path, ship.x, ship.y);
                  let perim = 0; 
                  for (let i=0; i<fleetPatterns.path.length; i++) { 
                    const a = fleetPatterns.path[i], b = fleetPatterns.path[(i+1) % fleetPatterns.path.length]; 
                    perim += Math.hypot(b.x-a.x, b.y-a.y); 
                  }
                  const avgSeg = Math.max(30, perim / fleetPatterns.path.length);
                  const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
                  const distSigned = !fleetPatterns.boxCw ? -lookahead : lookahead;
                  const ahead = cp ? moveAlongPathLooped(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                  patternGuided = true;
                }
                
                // Free Draw pattern following
                else if (fleetPatterns.selected === 'freedraw') {
                  const cp = closestPointOnLoop(fleetPatterns.path, ship.x, ship.y);
                  let perim = 0; 
                  for (let i=0; i<fleetPatterns.path.length; i++) { 
                    const a = fleetPatterns.path[i], b = fleetPatterns.path[(i+1) % fleetPatterns.path.length]; 
                    perim += Math.hypot(b.x-a.x, b.y-a.y); 
                  }
                  const avgSeg = Math.max(30, perim / fleetPatterns.path.length);
                  const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
                  const distSigned = !fleetPatterns.freeDrawCw ? -lookahead : lookahead;
                  const ahead = cp ? moveAlongPathLooped(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                  patternGuided = true;
                }
                
                // Circle pattern following
                else if (fleetPatterns.selected === 'circle') {
                  const cp = closestPointOnLoop(fleetPatterns.path, ship.x, ship.y);
                  let perim = 0; 
                  for (let i=0; i<fleetPatterns.path.length; i++) { 
                    const a = fleetPatterns.path[i], b = fleetPatterns.path[(i+1) % fleetPatterns.path.length]; 
                    perim += Math.hypot(b.x-a.x, b.y-a.y); 
                  }
                  const avgSeg = Math.max(20, perim / fleetPatterns.path.length);
                  const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
                  const distSigned = !fleetPatterns.circleCw ? -lookahead : lookahead;
                  const ahead = cp ? moveAlongPathLooped(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                  patternGuided = true;
                }
              }
              
              // Only check click-to-move if not following a pattern
              if (!patternGuided && window.IronTideFleetStates && window.IronTideFleetStates[fleetId] && window.IronTideFleetStates[fleetId].moveTarget) {
                const moveTarget = window.IronTideFleetStates[fleetId].moveTarget;
                const dx = moveTarget.x - ship.x;
                const dy = moveTarget.y - ship.y;
                const dist = Math.hypot(dx, dy);
                const arriveTol = 6;
                
                if (dist < arriveTol) {
                  // Arrived at target
                  window.IronTideFleetStates[fleetId].moveTarget = null;
                } else {
                  // Steer toward the target and move forward
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed
                }
              }
              break; // Found the fleet, no need to check others
            }
          }
          
          // Pattern following for ALL Fleet 1 ships (including non-leaders)
          const shipId = String(state.id);
          const fa = window.IronTideFleetAssignments || {};
          const isFleet1Ship = fa[1] && fa[1].has(shipId);
          
          // Use Fleet 1's specific patterns only (never fall back to global 'patterns')
          const fleet1Patterns = window.FleetPatterns && window.FleetPatterns[1];
          
          if (isFleet1Ship && fleet1Patterns && fleet1Patterns.selected && fleet1Patterns.path && fleet1Patterns.path.length > 1 && state.actualSpeedKts >= 0) {
            let patternGuided = false;
            
            // Zigzag pattern following
            if (fleet1Patterns.selected === 'zigzag' && fleet1Patterns.guiding !== false) {
              const hasZigTwoPins = !!(fleet1Patterns.zigPins && fleet1Patterns.zigPins.length === 2);
              const hasZigLegacyPin = !!fleet1Patterns.pin;
              
              if (hasZigTwoPins || hasZigLegacyPin) {
                const params = getZigParams();
                const cp = closestPointOnPolyline(fleet1Patterns.path, ship.x, ship.y);
                const joinThresh = 10 + Math.max(20, params.amplitude * 0.8);
                
                // If close to end pin, stop guiding
                const endPin = hasZigTwoPins ? fleet1Patterns.zigPins[1] : fleet1Patterns.pin;
                const pinDX = endPin.x - ship.x, pinDY = endPin.y - ship.y;
                const pinDist = Math.hypot(pinDX, pinDY);
                const finishRadius = Math.max(30, params.wavelength * 0.2);
                
                if (!fleet1Patterns.loop && pinDist <= finishRadius) {
                  fleet1Patterns.guiding = false;
                  state.desiredHeading = ship.heading; // lock to current heading
                } else if (cp && cp.dist > joinThresh) {
                  const dx = cp.point.x - ship.x;
                  const dy = cp.point.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                } else {
                  // Follow the path
                  const ktsAbs = Math.abs(state.actualSpeedKts);
                  const lookahead = zigLookaheadForSpeed(params, ktsAbs);
                  const ahead = cp ? aheadPointOnPath(fleet1Patterns.path, cp.segIndex, cp.t, lookahead) : fleet1Patterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                }
                
                if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                patternGuided = true;
              }
            }
            
            // Box pattern following
            else if (fleet1Patterns.selected === 'box') {
              const cp = closestPointOnLoop(fleet1Patterns.path, ship.x, ship.y);
              let perim = 0; 
              for (let i=0; i<fleet1Patterns.path.length; i++) { 
                const a = fleet1Patterns.path[i], b = fleet1Patterns.path[(i+1) % fleet1Patterns.path.length]; 
                perim += Math.hypot(b.x-a.x, b.y-a.y); 
              }
              const avgSeg = Math.max(30, perim / fleet1Patterns.path.length);
              const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
              const distSigned = !fleet1Patterns.boxCw ? -lookahead : lookahead;
              const ahead = cp ? moveAlongPathLooped(fleet1Patterns.path, cp.segIndex, cp.t, distSigned) : fleet1Patterns.path[1];
              const dx = ahead.x - ship.x;
              const dy = ahead.y - ship.y;
              const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
              state.desiredHeading = desired;
              
              if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
              patternGuided = true;
            }
            
            // Circle pattern following
            else if (fleet1Patterns.selected === 'circle') {
              const cp = closestPointOnLoop(fleet1Patterns.path, ship.x, ship.y);
              let perim = 0; 
              for (let i=0; i<fleet1Patterns.path.length; i++) { 
                const a = fleet1Patterns.path[i], b = fleet1Patterns.path[(i+1) % fleet1Patterns.path.length]; 
                perim += Math.hypot(b.x-a.x, b.y-a.y); 
              }
              const avgSeg = Math.max(20, perim / fleet1Patterns.path.length);
              const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
              const distSigned = !fleet1Patterns.circleCw ? -lookahead : lookahead;
              const ahead = cp ? moveAlongPathLooped(fleet1Patterns.path, cp.segIndex, cp.t, distSigned) : fleet1Patterns.path[1];
              const dx = ahead.x - ship.x;
              const dy = ahead.y - ship.y;
              const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
              state.desiredHeading = desired;
              
              if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
              patternGuided = true;
            }
          }
          
          // Pattern following for ALL Fleet 2 and 3 ships (including non-leaders)
          for (let fleetId = 2; fleetId <= 3; fleetId++) {
            const fa = window.IronTideFleetAssignments || {};
            const isFleetShip = fa[fleetId] && fa[fleetId].has(shipId);
            
            if (isFleetShip) {
              const fleetPatterns = window.FleetPatterns && window.FleetPatterns[fleetId];
              
              if (fleetPatterns && fleetPatterns.selected && fleetPatterns.path && fleetPatterns.path.length > 1 && state.actualSpeedKts >= 0) {
                let patternGuided = false;
                
                // Zigzag pattern following
                if (fleetPatterns.selected === 'zigzag' && fleetPatterns.guiding !== false) {
                  const hasZigTwoPins = !!(fleetPatterns.zigPins && fleetPatterns.zigPins.length === 2);
                  const hasZigLegacyPin = !!fleetPatterns.pin;
                  
                  if (hasZigTwoPins || hasZigLegacyPin) {
                    const params = getZigParams();
                    const cp = closestPointOnPolyline(fleetPatterns.path, ship.x, ship.y);
                    const joinThresh = 10 + Math.max(20, params.amplitude * 0.8);
                    
                    // If close to end pin, stop guiding
                    const endPin = hasZigTwoPins ? fleetPatterns.zigPins[1] : fleetPatterns.pin;
                    const pinDX = endPin.x - ship.x, pinDY = endPin.y - ship.y;
                    const pinDist = Math.hypot(pinDX, pinDY);
                    const finishRadius = Math.max(30, params.wavelength * 0.2);
                    
                    if (!fleetPatterns.loop && pinDist <= finishRadius) {
                      fleetPatterns.guiding = false;
                      state.desiredHeading = ship.heading; // lock to current heading
                    } else if (cp && cp.dist > joinThresh) {
                      const dx = cp.point.x - ship.x;
                      const dy = cp.point.y - ship.y;
                      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                      state.desiredHeading = desired;
                    } else {
                      // Follow the path
                      const ktsAbs = Math.abs(state.actualSpeedKts);
                      const lookahead = zigLookaheadForSpeed(params, ktsAbs);
                      const ahead = cp ? aheadPointOnPath(fleetPatterns.path, cp.segIndex, cp.t, lookahead) : fleetPatterns.path[1];
                      const dx = ahead.x - ship.x;
                      const dy = ahead.y - ship.y;
                      const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                      state.desiredHeading = desired;
                    }
                    
                    if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                    patternGuided = true;
                  }
                }
                
                // Box pattern following
                else if (fleetPatterns.selected === 'box') {
                  const cp = closestPointOnLoop(fleetPatterns.path, ship.x, ship.y);
                  let perim = 0; 
                  for (let i=0; i<fleetPatterns.path.length; i++) { 
                    const a = fleetPatterns.path[i], b = fleetPatterns.path[(i+1) % fleetPatterns.path.length]; 
                    perim += Math.hypot(b.x-a.x, b.y-a.y); 
                  }
                  const avgSeg = Math.max(30, perim / fleetPatterns.path.length);
                  const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
                  const distSigned = !fleetPatterns.boxCw ? -lookahead : lookahead;
                  const ahead = cp ? moveAlongPathLooped(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                  patternGuided = true;
                }
                
                // Free Draw pattern following
                else if (fleetPatterns.selected === 'freedraw') {
                  const cp = closestPointOnLoop(fleetPatterns.path, ship.x, ship.y);
                  let perim = 0; 
                  for (let i=0; i<fleetPatterns.path.length; i++) { 
                    const a = fleetPatterns.path[i], b = fleetPatterns.path[(i+1) % fleetPatterns.path.length]; 
                    perim += Math.hypot(b.x-a.x, b.y-a.y); 
                  }
                  const avgSeg = Math.max(30, perim / fleetPatterns.path.length);
                  const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
                  const distSigned = !fleetPatterns.freeDrawCw ? -lookahead : lookahead;
                  const ahead = cp ? moveAlongPathLooped(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                  patternGuided = true;
                }
                
                // Circle pattern following
                else if (fleetPatterns.selected === 'circle') {
                  const cp = closestPointOnLoop(fleetPatterns.path, ship.x, ship.y);
                  let perim = 0; 
                  for (let i=0; i<fleetPatterns.path.length; i++) { 
                    const a = fleetPatterns.path[i], b = fleetPatterns.path[(i+1) % fleetPatterns.path.length]; 
                    perim += Math.hypot(b.x-a.x, b.y-a.y); 
                  }
                  const avgSeg = Math.max(20, perim / fleetPatterns.path.length);
                  const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(state.actualSpeedKts));
                  const distSigned = !fleetPatterns.circleCw ? -lookahead : lookahead;
                  const ahead = cp ? moveAlongPathLooped(fleetPatterns.path, cp.segIndex, cp.t, distSigned) : fleetPatterns.path[1];
                  const dx = ahead.x - ship.x;
                  const dy = ahead.y - ship.y;
                  const desired = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                  state.desiredHeading = desired;
                  
                  if (state.speedKts <= 0) state.speedKts = 10; // Auto-set forward speed only if stopped
                  patternGuided = true;
                }
                
                // If following a pattern, skip formation logic
                if (patternGuided) break;
              }
              break; // Found the fleet, no need to check others
            }
          }
          
          
          // Smooth acceleration toward target speed
          const diffSpeed = state.speedKts - state.actualSpeedKts;
          const accel = 2; // knots per second acceleration
          const stepKts = Math.max(-accel * dt, Math.min(accel * dt, diffSpeed));
          state.actualSpeedKts += stepKts;
          
          // Smooth heading turn toward desired heading
          const headingDiff = angDist(ship.heading, state.desiredHeading);
          const turnRate = 30; // degrees per second
          const turnStep = Math.max(-turnRate * dt, Math.min(turnRate * dt, headingDiff));
          ship.heading = (ship.heading + turnStep + 360) % 360;
          
          // Move ship based on actual speed and heading (same logic as player ship)
          if (Math.abs(state.actualSpeedKts) > 0.1) {
            // Use same speed calculation as player ship
            let ktsAbs = Math.abs(state.actualSpeedKts);
            const ktsEff = (ktsAbs >= 5) ? ktsAbs : (ktsAbs / 5) * (ktsAbs / 5) * 5; // quadratic easing for low speeds
            const move = state.actualSpeedKts > 0 ? 1 : (state.actualSpeedKts < 0 ? -1 : 0);
            const speed = (ship.speed || 1) * (ktsEff / 15) * move;
            const headingRad = ship.heading * Math.PI / 180;
            const vx = Math.sin(headingRad) * speed * dt;
            const vy = -Math.cos(headingRad) * speed * dt;
            
            // Apply collision detection: separate axis resolution (same as player ship)
            const nx = ship.x + vx;
            const ny = ship.y + vy;
            if (!collidesAt(nx, ship.y)) ship.x = nx;
            if (!collidesAt(ship.x, ny)) ship.y = ny;
          }
        }
      }
    } catch {}
    
    // Formation guidance - apply to each fleet independently
    try {
      for (let fleetId = 1; fleetId <= 3; fleetId++) {
        // Only apply formation if fleet has ships
        const fleetMembers = getFleetMembers(fleetId);
        if (!fleetMembers || fleetMembers.length === 0) continue;
        
        const fname = getSelectedFormationName(fleetId) || '';
        const lname = String(fname).toLowerCase();
        console.log(`Fleet ${fleetId}: formation='${fname}', members=${fleetMembers.length}`);
        if (lname.includes('double') && lname.includes('line') && lname.includes('ahead')) {
          updateFormationDoubleLineAhead(dt, fleetId);
        } else if (lname.includes('line') && lname.includes('ahead')) {
          updateFormationLineAhead(dt, fleetId);
        } else if (lname.includes('echelon')) {
          updateFormationEchelon(dt, fleetId);
        } else if (lname.includes('wedge')) {
          updateFormationWedge(dt, fleetId);
        }
      }
    } catch {}
  }

  // Solid background (remove 4096pacific image); map annotations are drawn separately
  function drawBackground() {
    ctx.fillStyle = '#0b0a32';
    ctx.fillRect(0, 0, width, height);
  }

  // Draw maritime-style degree annotations at top (longitude) and left (latitude)
  function drawMapAnnotations(){
    try {
      const mapBtn = document.querySelector('#navalDock .tactical-map-btn');
      const show = !!(mapBtn && mapBtn.classList && mapBtn.classList.contains('brass-selected'));
      if (!show) return;
      const vr = currentViewRect || getViewRect();
      const { sx, sy, sw, sh, scale } = vr;
      // Define degree span across the full map (choose 16Â° span by default if dimensions known)
      const spanLonDeg = 16; // total degrees across map width
      const spanLatDeg = 16; // total degrees across map height
      const wpx = Math.max(1, mapPixelSize && mapPixelSize.w ? mapPixelSize.w : 4096);
      const hpx = Math.max(1, mapPixelSize && mapPixelSize.h ? mapPixelSize.h : 4096);
      const degPerPxX = spanLonDeg / wpx;
      const degPerPxY = spanLatDeg / hpx;
      const baseLat = 35;   // 35N at y=0
      const baseLon = 135;  // 135E at x=0

      // Screen helpers
      function worldXToScreen(wx){ return (wx - sx) * scale; }
      function worldYToScreen(wy){ return (wy - sy) * scale; }

      ctx.save();
      // Brass styling for ticks/labels
      ctx.fillStyle = '#bfa76a';
      ctx.strokeStyle = '#bfa76a';
      ctx.lineWidth = 1;
      ctx.font = '10px Orbitron, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Very thin green grid lines every 5 degrees across the visible view
      try {
        ctx.save();
        ctx.lineWidth = 1; // very thin
        ctx.strokeStyle = 'rgba(40,220,60,0.6)';
        // Vertical lines: longitudes
        const lonStart = baseLon + sx * degPerPxX;
        const lonEnd   = baseLon + (sx + sw) * degPerPxX;
        const firstGridLon = Math.ceil(lonStart / 5) * 5;
        for (let lon = firstGridLon; lon <= Math.floor(lonEnd); lon += 5) {
          const wx = (lon - baseLon) / degPerPxX;
          const x = Math.round(worldXToScreen(wx)) + 0.5; // crisp line
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        // Horizontal lines: latitudes (note: lat decreases downward on screen)
        const latStart = baseLat - sy * degPerPxY; // at top of view
        const latEnd   = baseLat - (sy + sh) * degPerPxY; // at bottom of view
        // Determine direction and first multiple of 5 appropriately
        const minLat = Math.min(latStart, latEnd);
        const maxLat = Math.max(latStart, latEnd);
        const firstGridLat = Math.ceil(minLat / 5) * 5;
        for (let lat = firstGridLat; lat <= Math.floor(maxLat); lat += 5) {
          const wy = (baseLat - lat) / degPerPxY;
          const y = Math.round(worldYToScreen(wy)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        ctx.restore();
      } catch {}

      // Helpers to format hemispheres (never show minus signs)
      function formatLon(lon){
        const n = Number(lon);
        if (!isFinite(n)) return '';
        const v = Math.round(n);
        const a = Math.abs(v);
        if (v === 0) return '0';
        return v < 0 ? `${a}W` : `${a}E`;
      }
      function formatLat(lat){
        const n = Number(lat);
        if (!isFinite(n)) return '';
        const v = Math.round(n);
        const a = Math.abs(v);
        if (v === 0) return '0';
        return v < 0 ? `${a}S` : `${a}N`;
      }

      // Adaptive grid labels: every 5 degrees with density/size based on zoom
      // Compute pixel spacing per degree on screen
      const pxPerDegX = (scale / degPerPxX);
      const pxPerDegY = (scale / degPerPxY);
      // Determine step multipliers to avoid spam when zoomed out
      function stepFromPx(pxPer5){
        if (pxPer5 < 10) return 40; // every 200 deg (unlikely visible)
        if (pxPer5 < 20) return 20; // every 100 deg
        if (pxPer5 < 40) return 10; // every 50 deg
        return 5;                    // every 25 deg (base)
      }
      const pxPer5X = pxPerDegX * 5;
      const pxPer5Y = pxPerDegY * 5;
      const stepLonDeg = stepFromPx(pxPer5X);
      const stepLatDeg = stepFromPx(pxPer5Y);
      // Font scales with zoom; keep size at max zoom, shrink 50% slower when zooming out
      // Effective scale halves the shrink from 1.0 -> 0.5 + 0.5*scale
      const sClamped = Math.max(0.3, Math.min(2, scale));
      const effScale = 0.5 + 0.5 * sClamped; // at scale=1 =>1, at 0.5 =>0.75
      const fontPx = Math.max(11, Math.min(16, Math.round(9 * 1.3 * effScale)));
      ctx.font = `${fontPx}px Orbitron, Arial, sans-serif`;

      // Top axis: longitudes (E/W) at multiples of stepLonDeg
      const lonStart = baseLon + sx * degPerPxX;
      const lonEnd   = baseLon + (sx + sw) * degPerPxX;
      const firstLonGrid = Math.ceil(lonStart / stepLonDeg) * stepLonDeg;
      for (let lon = firstLonGrid; lon <= Math.floor(lonEnd); lon += stepLonDeg) {
        const wx = (lon - baseLon) / degPerPxX;
        const x = Math.round(worldXToScreen(wx));
        // Small tick
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, Math.max(4, Math.round(fontPx * 0.8)));
        ctx.stroke();
        // Label (e.g., 145E)
        const label = formatLon(lon);
        ctx.fillText(label, x, Math.max(6, Math.round(fontPx * 0.6)));
      }

      // Left axis: latitudes with S/N notation using formatLat()
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const latTop = baseLat - sy * degPerPxY; // at top of view
      const latBottom = baseLat - (sy + sh) * degPerPxY; // at bottom of view
      const minLat = Math.min(latTop, latBottom);
      const maxLat = Math.max(latTop, latBottom);
      const firstLatGrid = Math.ceil(minLat / stepLatDeg) * stepLatDeg;
      for (let lat = firstLatGrid; lat <= Math.floor(maxLat); lat += stepLatDeg) {
        const wy = (baseLat - lat) / degPerPxY;
        const y = Math.round(worldYToScreen(wy));
        // Small tick
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(Math.max(4, Math.round(fontPx * 1.2)), y);
        ctx.stroke();
        // Label (e.g., 45S)
        const label = formatLat(lat);
        ctx.fillText(label, Math.max(24, Math.round(fontPx * 2.6)), y);
      }
      ctx.restore();
    } catch {}
  }

  function drawShip() {
    // Base target at max zoom-in; apply zoom-out factor to shrink
    const targetHBase = 96;
    const targetH = Math.round(targetHBase * zoomOutSlider.value);
    ctx.save();
    // Ensure red max-range circle also renders in this screen-space path (mobile)
    try {
      const vr = currentViewRect || getViewRect();
      const scale = vr.scale || 1;
      const isTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
      const desktopGate = (typeof gunnery !== 'undefined' && gunnery && gunnery.enabled);
      const mobileGate = isTouch || (typeof gunneryFire !== 'undefined' && gunneryFire && gunneryFire.enabled) || (isTouch && ((firingSolution && (firingSolution.placing || firingSolution.target))));
      if (desktopGate || mobileGate) {
        const radiusWorld = (typeof getMaxRangeWorld === 'function') ? getMaxRangeWorld() : (16.8 * Math.max(1, targetH / Math.max(1, scale)));
        const radiusScreen = radiusWorld * scale;
        let lw = Math.max(1, 2 / (scale || 1));
        if (isTouch) lw = Math.max(lw, 2.25);
        // White halo underlay on touch
        
        if (isTouch) {
          ctx.save();
          ctx.lineWidth = Math.max(1, lw + 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.beginPath();
          ctx.arc(Math.round(ship.x), Math.round(ship.y), radiusScreen, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // Primary red stroke
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = 'rgba(220, 30, 30, 0.98)';
        ctx.beginPath();
        ctx.arc(Math.round(ship.x), Math.round(ship.y), radiusScreen, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } catch {}
    // Snap to integer pixels to avoid subpixel blur
    const sxPix = Math.round(ship.x);
    const syPix = Math.round(ship.y);
    ctx.translate(sxPix, syPix);
    ctx.rotate((ship.heading) * Math.PI / 180);

    if (shipImg) {
      const aspect = shipImg.width / shipImg.height;
      // Clamp scale to a sweet spot relative to native sprite size to avoid heavy resampling
      const nativeH = shipImg.height;
      const desiredScale = targetH / nativeH;
      const clampedScale = Math.min(desiredScale, 3.6); // allow shrinking freely; cap upscale at 3.6x native
      const finalH = Math.round(nativeH * clampedScale);
      const finalW = Math.round(finalH * aspect);
      const prevSmooth = ctx.imageSmoothingEnabled;
      const prevQual = ctx.imageSmoothingQuality;
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'high'; } catch {}
      ctx.drawImage(shipImg, -finalW / 2, -finalH / 2, finalW, finalH);
      ctx.imageSmoothingEnabled = prevSmooth;
      try { ctx.imageSmoothingQuality = prevQual; } catch {}

      // Draw turrets if available (despawn with explosion at 100% damage)
      if (turretImg && turretPoints && turretPoints.length) {
        const sx = finalW / shipImg.width;
        const sy = finalH / shipImg.height;
        // Turrets reduced by 30% from 25% => 0.25 * 0.7 = 0.175 of hull width
        const turretW = Math.round(finalW * 0.175);
        const tAspect = turretImg.width / turretImg.height;
        const turretH = Math.round(turretW / tAspect);

        // Draw order from bottom to top: t1, t4, t3, t2 (t2 and t3 are above t1 and t4)
        const order = ['t1', 't4', 't3', 't2'];
        const byId = new Map(turretPoints.map(p => [p.id, p]));
        // One-shot explosion flags for player turrets
        window.PlayerTurretDestroyed = window.PlayerTurretDestroyed || { turret1:false, turret2:false, turret3:false, turret4:false };
        const hbMap = (window.shipProfile && window.shipProfile.damage && window.shipProfile.damage.hitboxes) ? window.shipProfile.damage.hitboxes : {};
        order.forEach(id => {
          const p = byId.get(id);
          if (!p) return;
          const tx = (p.x - shipImg.width / 2) * sx; // center origin
          const ty = (p.y - shipImg.height / 2) * sy;
          // Determine turret relative angle per group (in radians)
          // t1 and t2 are top turrets, t3 and t4 are bottom turrets
          const relDeg = (id === 't1' || id === 't2') ? turretTopAngleRelDeg : turretBottomAngleRelDeg;
          const extraRot = relDeg * Math.PI / 180; // rotate relative to ship forward
          // Damage/despawn check
          const hbKey = id.replace(/^t/, 'turret');
          const hb = hbMap ? hbMap[hbKey] : null;
          let destroyed = false;
          if (hb) {
            const maxhp = typeof hb.max_hp === 'number' ? hb.max_hp : 0;
            const hp = typeof hb.hp === 'number' ? hb.hp : maxhp;
            const dp = (typeof hb.damage_percent === 'number') ? hb.damage_percent : (maxhp > 0 ? (100 - Math.round((hp / Math.max(1,maxhp)) * 100)) : 0);
            destroyed = (maxhp > 0 && hp <= 0) || dp >= 100 || !!hb.destroyed;
          }
          const flagKey = hbKey; // e.g., turret1
          if (destroyed) {
            if (!window.PlayerTurretDestroyed[flagKey]) {
              // Compute world coords of turret anchor and explode once
              const hr = (ship.heading || 0) * Math.PI/180;
              const wx = ship.x + (tx * Math.cos(hr) - ty * Math.sin(hr));
              const wy = ship.y + (tx * Math.sin(hr) + ty * Math.cos(hr));
              try { spawnExplosion(wx, wy); } catch {}
              try { spawnBlackSmoke(wx, wy, 8); } catch {}
              window.PlayerTurretDestroyed[flagKey] = true;
            }
            // Skip drawing destroyed turret
            return;
          }
          ctx.save();
          // Snap turret position; shift only t1 forward by 5px toward bow (up)
          const shiftY = (id === 't1') ? (ty - 5) : ty;
          ctx.translate(Math.round(tx), Math.round(shiftY));
          ctx.rotate(extraRot);
          const prevSmoothT = ctx.imageSmoothingEnabled;
          const prevQualT = ctx.imageSmoothingQuality;
          ctx.imageSmoothingEnabled = true;
          try { ctx.imageSmoothingQuality = 'high'; } catch {}
          ctx.drawImage(turretImg, -turretW / 2, -turretH / 2, turretW, turretH);
          ctx.imageSmoothingEnabled = prevSmoothT;
          try { ctx.imageSmoothingQuality = prevQualT; } catch {}
          ctx.restore();
        });
      }
    } else {
      // Fallback: simple triangle if ship image not loaded yet
      ctx.fillStyle = '#ffe8a3';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -ship.r);
      ctx.lineTo(ship.r * 0.65, ship.r);
      ctx.lineTo(-ship.r * 0.65, ship.r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // DOM compasses inside dock
  function buildDomCompassTicks(root) {
    const ticks = root.querySelector('.ticks');
    if (!ticks) return;
    ticks.innerHTML = '';
    const dial = root.querySelector('.dial');
    const w = dial ? dial.clientWidth : root.clientWidth;
    const h = dial ? dial.clientHeight : root.clientHeight;
    const r = Math.min(w, h) / 2;
    // Protrude tick ends ~5px beyond rim by positioning the tick center
    // at (r + protrude - tickH/2)
    const tickH = 14; // px
    const protrude = 5; // px past the rim
    const tickRadius = Math.max(0, (r + protrude - tickH / 2));
    // Move degree labels outward to avoid overlap
    const labelRadius = Math.max(0, r - 10);
    for (let d = 0; d < 360; d += 30) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.style.height = tickH + 'px';
      t.style.transform = `translate(-50%, -50%) rotate(${d}deg) translate(0, -${tickRadius}px)`;
      ticks.appendChild(t);
      const lbl = document.createElement('div');
      lbl.className = 'deg';
      lbl.textContent = String(d);
      // Keep text upright by counter-rotating
      lbl.style.transform = `translate(-50%, -50%) rotate(${d}deg) translate(0, -${labelRadius}px) rotate(${-d}deg)`;
      ticks.appendChild(lbl);
    }
  }
  function setNeedle(el, deg) {
    if (!el) return;
    // CSS rotate with 0deg at up (matching our 0=up convention)
    el.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
  }
  function initDomCompasses() {
    const fleet = document.getElementById('fleetCompass');
    const turret = document.getElementById('turretCompass');
    if (fleet) buildDomCompassTicks(fleet);
    if (turret) buildDomCompassTicks(turret);
    // Build ticks for fleet-specific turret compasses
    const turret2 = document.getElementById('turretCompass2');
    const turret3 = document.getElementById('turretCompass3');
    if (turret2) buildDomCompassTicks(turret2);
    if (turret3) buildDomCompassTicks(turret3);

    function pointerAngleDeg(evt, elem) {
      const r = elem.getBoundingClientRect();
      const px = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
      const py = (evt.touches ? evt.touches[0].clientY : evt.clientY) - r.top;
      const dx = px - r.width / 2;
      const dy = py - r.height / 2;
      let angRad = Math.atan2(dy, dx);
      let deg = angRad * 180 / Math.PI; // 0 right
      deg = (deg + 450) % 360; // 0 up
      return deg;
    }

    function bindCompass(elem, type) {
      if (!elem) return;
      let dragging = false;
      const onDown = (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        dragging = true;
        const d = pointerAngleDeg(e, elem);
        if (type==='fleet') {
          const sel = (window.IronTideSelectedFleet || 1);
          // Apply heading to the selected fleet's leader (works for fleets 1-3)
          try {
            const leader = (typeof getFleetLeader === 'function') ? getFleetLeader(sel) : null;
            if (!leader || !leader.state) return;
            // If player rudder jammed, block
            if (leader.isPlayer && leader.state && leader.state.effects && leader.state.effects.rudderJam) return;
            leader.state.desiredHeading = d;
            if (leader.state.ship) leader.state.ship.desiredHeading = d;
            const planned = elem.querySelector('.needle.planned');
            if (planned) setNeedle(planned, d);
          } catch {}
        } else {
          desiredTurretWorldDeg = d;
        }
      };
      const onMove = (e) => {
        if (!dragging) return;
        const d = pointerAngleDeg(e, elem);
        if (type==='fleet') {
          const sel = (window.IronTideSelectedFleet || 1);
          try {
            const leader = (typeof getFleetLeader === 'function') ? getFleetLeader(sel) : null;
            if (!leader || !leader.state) return;
            if (leader.isPlayer && leader.state && leader.state.effects && leader.state.effects.rudderJam) return;
            leader.state.desiredHeading = d;
            if (leader.state.ship) leader.state.ship.desiredHeading = d;
            const planned = elem.querySelector('.needle.planned');
            if (planned) setNeedle(planned, d);
          } catch {}
        } else {
          desiredTurretWorldDeg = d;
        }
      };
      const onUp = (e) => { dragging = false; };
      // Ensure compass always receives interaction, even in modes that add other handlers
      try { elem.style.pointerEvents = 'auto'; } catch {}
      elem.addEventListener('mousedown', onDown, { capture: true });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      // Pointer Events path
      elem.addEventListener('pointerdown', onDown, { capture: true });
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      // Touch fallback
      elem.addEventListener('touchstart', onDown, { passive: false, capture: true });
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    bindCompass(fleet, 'fleet');
    bindCompass(turret, 'turret');
    // Bind fleet-specific turret compasses
    const turret2El = document.getElementById('turretCompass2');
    const turret3El = document.getElementById('turretCompass3');
    if (turret2El) bindCompass(turret2El, 'turret');
    if (turret3El) bindCompass(turret3El, 'turret');

    // Rebuild ticks/labels on resize to keep perfect centering
    window.addEventListener('resize', () => {
      if (fleet) buildDomCompassTicks(fleet);
      if (turret) buildDomCompassTicks(turret);
      const turret2 = document.getElementById('turretCompass2');
      const turret3 = document.getElementById('turretCompass3');
      if (turret2) buildDomCompassTicks(turret2);
      if (turret3) buildDomCompassTicks(turret3);
      // Also rebuild for formation-specific compasses if present
      const ce = document.getElementById('circularEscortCompass');
      const sc = document.getElementById('screenCompass');
      if (ce && ce.offsetParent) buildDomCompassTicks(ce);
      if (sc && sc.offsetParent) buildDomCompassTicks(sc);
    });
  }

  let rafHandle = 0;
  let simTime = 0; // seconds since start
  function gameLoop(ts) {
    if (!gameLoop.last) gameLoop.last = ts;
    const dt = Math.min(0.05, (ts - gameLoop.last) / 1000);
    gameLoop.last = ts;
    simTime += dt;

    // Update wind each frame (affects smoke drift and future aiming)
    updateWind(dt);
    // Intermittent ambient SFX
    tryPlayAmbient(simTime);

    update(dt);
    // Recompute effects every frame so HUD bounds reflect current damage for both player and NPC
    try { if (typeof damageModel === 'object' && damageModel && typeof damageModel.recomputeEffects === 'function') damageModel.recomputeEffects(); } catch {}
    try { if (typeof npc1 === 'object' && npc1 && npc1.damageModel && typeof npc1.damageModel.recomputeEffects === 'function') npc1.damageModel.recomputeEffects(); } catch {}
    // Apply damage control repairs each frame (1% of max HP per second)
    try { damageControlTick(dt); } catch {}
    // Monitor for continuous damage smoke on 70%+ damaged components
    try { monitorContinuousDamageSmoke(); } catch {}

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Sync camera.zoom to slider; do NOT force recenter on player (preserve follow target)
    const newZ = zoomOutSlider.value || 1;
    if (camera.zoom !== newZ) {
      camera.zoom = newZ;
    }
    // Always run camera update so follow state applies every frame
    updateCamera();
    // Update compass needles every frame for real-time feedback
    try { 
      const currentFleet = window.IronTideSelectedFleet || 1;
      const settings = window.IronTideFleetSettings && window.IronTideFleetSettings[currentFleet];
      if (settings) updateCompassNeedles(settings);
    } catch {}
    // Drive solution calc progress UI
    try { updateSolutionProgress(performance.now()); } catch {}
    // Draw background using current cam view
    drawBackground();
    // Overlay coordinate annotations (only appears when Map is toggled)
    drawMapAnnotations();

    // Draw world-space ship so it scales consistently with map
    const vr = currentViewRect || getViewRect();
    const scale = vr.scale;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-vr.sx, -vr.sy);
    // Route overlays beneath wake/ship
    drawPatternOverlaysWorld();
    // Islands: draw under ships and effects
    drawIslandsWorld();
    // Draw wake beneath ship
    if (wake.enabled) updateAndDrawWakeWorld(dt);
    drawShipWorld();
    // Draw stationary NPC ship (Battleship 2)
    drawNpcShipWorld();
    drawFriendlyFleetShips(); // Draw friendly ships from IronTideFleet
    drawAdditionalNpcs(); // Draw enemy ships from NPCs
    // Render ALL fleet turret lines so we can see other fleets' lines
    try { drawFleetTurretLinesWorld(1); } catch {}
    try { drawFleetTurretLinesWorld(2); } catch {}
    try { drawFleetTurretLinesWorld(3); } catch {}
    // Draw sinking animations (world space) after ships so they appear above wakes but beneath effects
    updateAndDrawSinkingWorld(dt);
    // Effects in world space
    updateAndDrawGunPuffsWorld(dt);
    updateAndDrawShellsWorld(dt);
    updateAndDrawSplashesWorld(dt);
    // Draw smoke above ship
    updateAndDrawSmokeWorld(dt);
    // New: over-ship hits â€” explosions and black smoke
    updateExplosionsAndSmoke(dt);
    drawExplosionsAndSmoke();
    ctx.restore();
    // UI overlays (screen-space)
    // DOM compasses are now used; skip canvas compass rendering
    drawZoomOutSlider();

    // Sync DOM compass needles and speed UI according to selected fleet
    const selFleet = (window.IronTideSelectedFleet || 1);
    const fcPlanned = document.querySelector('#fleetCompass .needle.planned');
    const fcActual  = document.querySelector('#fleetCompass .needle.actual');
    // Get turret compass for current fleet
    const tcPlanned = document.querySelector(`#turretCompass${selFleet === 1 ? '' : selFleet} .needle.planned`);
    const tcActual  = document.querySelector(`#turretCompass${selFleet === 1 ? '' : selFleet} .needle.actual`);
    const speedSliderEl = document.getElementById('speedSlider');
    const dockEl = document.getElementById('navalDock');
    const speedReadoutEl = dockEl ? dockEl.querySelector('.speed-readout') : null;
    if (selFleet === 1) {
      if (fcPlanned) setNeedle(fcPlanned, ship.desiredHeading);
      if (fcActual)  setNeedle(fcActual, ship.heading);
      if (tcPlanned) setNeedle(tcPlanned, desiredTurretWorldDeg);
      if (tcActual && turretAnglesRelDeg) {
        const ids = ['t1','t2','t3','t4'];
        let bestWorld = null, bestErr = 1e9;
        for (const id of ids) {
          const rel = typeof turretAnglesRelDeg[id] === 'number' ? turretAnglesRelDeg[id] : 0;
          const worldAng = angleNorm360(ship.heading + rel);
          const err = Math.abs(angDist(worldAng, desiredTurretWorldDeg));
          if (err < bestErr) { bestErr = err; bestWorld = worldAng; }
        }
        if (bestWorld != null) setNeedle(tcActual, bestWorld);
      }
      // Let speed slider/readout reflect live ship
      if (speedReadoutEl && typeof shipState?.speedKts === 'number') {
        speedReadoutEl.textContent = `${Math.round(shipState.speedKts)} kts`;
      }
    } else {
      // Fleet 2/3: show fleet leader's instruments
      const fleetLeader = getFleetLeader(selFleet);
      if (fleetLeader && fleetLeader.state) {
        const desiredHeading = fleetLeader.state.desiredHeading || fleetLeader.state.ship?.desiredHeading || 0;
        const actualHeading = fleetLeader.state.ship?.heading || 0;
        const speed = fleetLeader.state.speedKts || 0;
        
        if (fcPlanned) setNeedle(fcPlanned, desiredHeading);
        if (fcActual) setNeedle(fcActual, actualHeading);
        if (speedSliderEl) { try { speedSliderEl.value = speed; } catch {} }
        if (speedReadoutEl) speedReadoutEl.textContent = speed + ' kts';
      } else {
        // No ships in fleet - show neutral instruments
        if (fcPlanned) setNeedle(fcPlanned, 0);
        if (fcActual) setNeedle(fcActual, 0);
        if (speedSliderEl) { try { speedSliderEl.value = 0; } catch {} }
        if (speedReadoutEl) speedReadoutEl.textContent = '0 kts';
      }
      // Turret compass always neutral for Fleet 2/3 (no player ship)
      if (tcPlanned) setNeedle(tcPlanned, 0);
      if (tcActual) setNeedle(tcActual, 0);
    }

    // Simple FIRE UI: countdown and ready lights (textual)
    try {
      const dock = document.getElementById('navalDock');
      if (dock) {
        let hud = document.getElementById('fireHud');
        if (!hud) {
          hud = document.createElement('div');
          hud.id = 'fireHud';
          hud.style.position = 'absolute';
          hud.style.right = '12px';
          hud.style.bottom = '12px';
          hud.style.padding = '6px 8px';
          hud.style.background = 'rgba(0,0,0,0.35)';
          hud.style.color = '#eee';
          hud.style.font = '12px system-ui, sans-serif';
          hud.style.borderRadius = '6px';
          hud.style.pointerEvents = 'none';
          document.body.appendChild(hud);
        }
        const next = Math.max(0, gunneryFire.intervalSec - (simTime - gunneryFire.lastSalvoAt));
        const ready = ['t1','t2','t3','t4'].map(id => {
          const sch = gunneryFire.schedule.find(s=>s.id===id);
          const r = !gunneryFire.enabled ? '-' : (sch ? Math.max(0, sch.t - simTime).toFixed(1)+'s' : 'READY');
          return id+': '+r;
        }).join(' | ');
        hud.textContent = `FIRE ${gunneryFire.enabled?'ON':'OFF'} Â· next salvo in ${next.toFixed(1)}s Â· ${ready}`;
      }
    } catch {}

    // Expose transform helpers for external renderers (overlay)
try { if (typeof window.screenToWorld !== 'function' && typeof screenToWorld === 'function') window.screenToWorld = screenToWorld; } catch {}
try { if (typeof window.worldToScreen !== 'function' && typeof worldToScreen === 'function') window.worldToScreen = worldToScreen; } catch {}
try { if (typeof window.getViewRect !== 'function' && typeof getViewRect === 'function') window.getViewRect = getViewRect; } catch {}
rafHandle = requestAnimationFrame(gameLoop);
    window.__NAUTICAL_RAF__ = rafHandle;
  }

  // Start
  (async function() {
    try {
      // Load large ocean background and ship/turrets
      pacificImg = await loadImage('assets/4096pacific.png');
      if (pacificImg && pacificImg.width && pacificImg.height) {
        pacificSize.w = pacificImg.width;
        pacificSize.h = pacificImg.height;
      }
      await loadShipTMX('assets/BSTMX.tmx');
    } catch (err) {
      console.error('Failed to load assets.', err);
    }
    // Initialize DOM compass widgets (ticks + interactions)
    initDomCompasses();
    // Auto-scale dock on mobile so entire UI fits at bottom
    setupDockAutoScaleMobile();
    window.addEventListener('resize', setupDockAutoScaleMobile);
    // Startup: enforce strict ID policy and controlled spawns
    try {
      // Purge any existing ships except ID 1 (friendly) and ID 50 (enemy)
      const keepIds = new Set(['1','50',1,50]);
      try {
        if (Array.isArray(window.IronTideFleet)) {
          window.IronTideFleet = window.IronTideFleet.filter(h => {
            try { const sid = String(h && h.state && h.state.id); return keepIds.has(sid); } catch { return false; }
          });
        }
      } catch {}
      try {
        if (Array.isArray(window.NPCs)) {
          window.NPCs = window.NPCs.filter(n => {
            try { const sid = String(n && n.state && n.state.id); return keepIds.has(sid); } catch { return false; }
          });
        }
      } catch {}
      // Reset registries to avoid duplicate/defunct references
      try { window.ShipHandlesById = window.ShipHandlesById || {}; Object.keys(window.ShipHandlesById).forEach(k=>{ if (!keepIds.has(k) && !keepIds.has(Number(k))) delete window.ShipHandlesById[k]; }); } catch {}
      try { window.EnemyFleet1 = new Set(); } catch {}
      try {
        window.IronTideFleetAssignments = { 1: new Set(), 2: new Set(), 3: new Set() };
        // Ensure player ID 1 is in Fleet 1; do NOT assign 50 to any friendly fleet
        window.IronTideFleetAssignments[1].add('1');
        // explicitly ensure 50 is not present
        ['1','2','3'].forEach(fid=>{ try { window.IronTideFleetAssignments[fid].delete('50'); } catch {} });
      } catch {}
      // Also reset legacy fleet maps (fa, fleetAssignments)
      try {
        window.fa = { 1: new Set(), 2: new Set(), 3: new Set() };
        window.fa[1].add('1');
        ['1','2','3'].forEach(fid=>{ try { window.fa[fid].delete('50'); } catch {} });
      } catch {}
      try {
        window.fleetAssignments = { 1: new Set(), 2: new Set(), 3: new Set() };
        window.fleetAssignments[1].add('1');
        ['1','2','3'].forEach(fid=>{ try { window.fleetAssignments[fid].delete('50'); } catch {} });
      } catch {}
      // Ensure player ship has ID 1
      try {
        if (window.shipState) {
          window.shipState.id = 1;
          try { window.shipState.side = 'friendly'; } catch {}
          if (window.ShipHandlesById) window.ShipHandlesById['1'] = (window.ShipHandlesById['1'] || window.IronTideFleet?.find(h=>String(h?.state?.id)==='1')) || null;
        }
      } catch {}
      // Spawn exactly one enemy battleship with fixed ID 50 if not present
      try {
        const has50 = (function(){
          try {
            const arrs = [window.NPCs, window.IronTideFleet];
            for (const arr of arrs) {
              if (Array.isArray(arr)) { for (let i=0;i<arr.length;i++){ const sid = String(arr[i]?.state?.id); if (sid==='50') return true; } }
            }
          } catch {}
          return false;
        })();
        if (!has50) {
          // Place 400px east of player start if possible
          const ps = (window.shipState && window.shipState.ship) ? window.shipState.ship : { x: 512, y: 512 };
          const spawn = (typeof window.spawnNpcAt === 'function') ? window.spawnNpcAt(ps.x + 1600, ps.y, { heading: 0, speedKts: 0, side: 'enemy', typeLabel: 'Battleship' }) : null;
          const h = (spawn && spawn.state) ? spawn : null;
          let handle = null;
          if (h) {
            // Find the handle in IronTideFleet/NPCs
            try {
              const idStr = String(h.state.id);
              // Assign fixed ID 50 and side enemy
              h.state.id = 50;
              try { h.state.side = 'enemy'; } catch {}
              h.state.displayName = 'Enemy Battleship 1';
              // Update registrations
              window.EnemyFleet1.add('50');
              window.ShipHandlesById = window.ShipHandlesById || {};
              window.ShipHandlesById['50'] = h;
              // Update fleet arrays to reflect new id and enemy side
              try { if (Array.isArray(window.IronTideFleet)) {
                for (let i=0;i<window.IronTideFleet.length;i++){
                  const st = window.IronTideFleet[i]?.state; if (!st) continue;
                  if (String(st.id)===idStr){ st.id = 50; try { st.side = 'enemy'; } catch {} }
                  if (String(st.id)==='50'){ try { st.side = 'enemy'; } catch {} }
                }
              } } catch {}
              try { if (Array.isArray(window.NPCs)) {
                for (let i=0;i<window.NPCs.length;i++){
                  const st = window.NPCs[i]?.state; if (!st) continue;
                  if (String(st.id)===idStr){ st.id = 50; try { st.side = 'enemy'; } catch {}; handle = window.NPCs[i]; }
                  if (String(st.id)==='50'){ try { st.side = 'enemy'; } catch {} }
                }
              } } catch {}
            } catch {}
          }
        } else {
          // Ensure enemy registries include 50
          try { window.EnemyFleet1.add('50'); } catch {}
        }
      } catch {}
      // After enforcement, remove any leftovers not ID 1 or 50 again for safety
      try {
        const keep = new Set(['1','50',1,50]);
        if (Array.isArray(window.IronTideFleet)) {
          // Filter and keep only friendly ships (ID 1), remove all enemies from IronTideFleet
          window.IronTideFleet = window.IronTideFleet.filter(h => {
            const id = String(h?.state?.id);
            const side = String(h?.state?.side||'').toLowerCase();
            // Keep only ID 1 (friendly battleship)
            return id === '1' && side === 'friendly';
          });
          // Ensure side correctness
          const h1 = window.IronTideFleet.find(h => String(h?.state?.id) === '1');
          if (h1 && h1.state) { try { h1.state.side = 'friendly'; } catch {} }
        }
        if (Array.isArray(window.NPCs)) {
          // Filter and keep only enemy ships (ID 50), remove all friendlies from NPCs
          window.NPCs = window.NPCs.filter(n => {
            const id = String(n?.state?.id);
            const side = String(n?.state?.side||'').toLowerCase();
            // Keep only ID 50 (enemy battleship)
            return id === '50' && side === 'enemy';
          });
          // Ensure side correctness
          const n50 = window.NPCs.find(n => String(n?.state?.id) === '50');
          if (n50 && n50.state) { try { n50.state.side = 'enemy'; } catch {} }
        }
      } catch {}
    } catch {}
    // Record initial spawn positions (player and NPC)
    try {
      if (!window.InitialSpawns) window.InitialSpawns = {};
      if (ship && typeof ship.x === 'number' && typeof ship.y === 'number') {
        window.InitialSpawns.player = { x: ship.x, y: ship.y };
      }
      if (npc1 && npc1.state && npc1.state.ship) {
        window.InitialSpawns.npc1 = { x: npc1.state.ship.x, y: npc1.state.ship.y };
      }
    } catch {}
    // Reset dynamic islands to avoid duplicates across hot reloads
    try { if (Array.isArray(islands)) islands.length = 0; } catch {}
    // Load island image and place it at 40N, 130E (transparent PNG) using degree mapping
    try {
      const islImg = await loadImage('assets/pngislandbig3.png');
      const p = mapDegToWorld(40, 130);
      islands.push({ img: islImg, cx: p.x, cy: p.y, mask: makeHitMaskFromImage(islImg) });
    } catch {}
    // Load second island image and place it at 9N, 180E (transparent PNG) using degree mapping
    try {
      const islImg2 = await loadImage('assets/pngislandbig1.png');
      const p2 = mapDegToWorld(9, 180);
      islands.push({ img: islImg2, cx: p2.x, cy: p2.y, mask: makeHitMaskFromImage(islImg2) });
    } catch {}
    // Prepare HUDs (default OFF): left = player (Battleship 1), right = NPC (Battleship 2)
    try {
      const hudL = document.getElementById('shipHud');
      const hudR = document.getElementById('shipHudRight');
      const playerId = (window.shipState && window.shipState.id) ? String(window.shipState.id) : '1';
      const npcId = (typeof npc1 === 'object' && npc1 && npc1.state && npc1.state.id) ? String(npc1.state.id) : '';
      console.log('=== HUD STARTUP DEBUG ===');
      console.log('Player ID:', playerId);
      console.log('NPC ID:', npcId);
      console.log('npc1 exists:', !!npc1);
      console.log('npc1.state exists:', !!(npc1 && npc1.state));
      
      if (hudL) {
        hudL.style.display = 'none'; // HIDE at startup - user clicks to show
        try { hudL.dataset.shipId = playerId; } catch {}
        console.log('Player HUD (left) hidden at startup, assigned ID:', playerId);
      }
      if (hudR) {
        if (npcId) { 
          hudR.style.display = 'block'; // SHOW Bismarck HUD at startup
          try { hudR.dataset.shipId = npcId; } catch {} 
          console.log('NPC HUD (right) SHOWN at startup for Bismarck ID:', npcId);
        } else {
          hudR.style.display = 'none';
          console.log('NPC HUD (right) hidden - no NPC ID available');
        }
      }
      // Initialize Multi-HUD System - each ship gets its own HUD container
      window.ShipHUDs = window.ShipHUDs || {};
      // Public API: register a ship HUD mapping so EYE/right HUD cycling can include it
      if (typeof window.registerHudForShip !== 'function') {
        window.registerHudForShip = function registerHudForShip(shipId, containerId, canvasId, opts){
          try {
            const id = String(shipId);
            window.ShipHUDs[id] = Object.assign({ containerId, canvasId, initialized: false }, opts || {});
            console.log('[HUD-REG]', id, '=>', containerId, '/', canvasId);
          } catch (e) { console.warn('registerHudForShip failed for', shipId, e); }
        };
      }
      
      // Backfill registration for any NPCs spawned before game.js loaded (e.g., transports)
      try {
        if (Array.isArray(window.NPCs)) {
          window.NPCs.forEach(n => {
            try {
              if (!n || !n.state || n.state.id == null) return;
              const id = String(n.state.id);
              if (window.ShipHUDs[id]) return; // already registered
              const ptype = (n.profile && n.profile.type) ? String(n.profile.type).toLowerCase() : '';
              if (ptype === 'transport') {
                if (typeof window.registerHudForShip === 'function') window.registerHudForShip(id, 'shipHudTransport', 'shipHudCanvasTransport');
              } else if (ptype === 'cruiser') {
                if (typeof window.registerHudForShip === 'function') window.registerHudForShip(id, 'shipHudCruiser', 'shipHudCanvasCruiser');
              } else {
                if (typeof window.registerHudForShip === 'function') window.registerHudForShip(id, 'shipHudRight', 'shipHudCanvasRight');
              }
            } catch {}
          });
        }
      } catch {}
      
      // Pre-initialize HUDs for known ships
      if (playerId) {
        window.ShipHUDs[playerId] = { containerId: 'shipHud', canvasId: 'shipHudCanvas', initialized: false };
        console.log('Registered player HUD for ID:', playerId);
        
        // ALSO register player for right HUD cycling (EYE button should include player ship)
        // We'll create a separate entry for right HUD cycling
        const playerRightId = playerId + '_right';
        window.ShipHUDs[playerRightId] = { containerId: 'shipHudRight', canvasId: 'shipHudCanvasRight', initialized: false, originalId: playerId };
        console.log('Registered player for right HUD cycling with ID:', playerRightId);
        
        // Register in global handle registry for quick lookup
        window.ShipHandlesById = window.ShipHandlesById || {};
        if (window.shipState) {
          const playerHandle = { state: window.shipState, profile: window.shipProfile };
          window.ShipHandlesById[playerId] = playerHandle;
          window.ShipHandlesById[playerRightId] = playerHandle; // Same handle, different HUD
        }
      }
      if (npcId) {
        window.ShipHUDs[npcId] = { containerId: 'shipHudRight', canvasId: 'shipHudCanvasRight', initialized: false };
        console.log('Registered NPC HUD for ID:', npcId);
        
        // Initialize Bismarck HUD at startup since it's visible
        try { 
          initShipHudFor('shipHudRight', 'shipHudCanvasRight'); 
          window.ShipHUDs[npcId].initialized = true;
          console.log('Initialized Bismarck HUD at startup for ID:', npcId);
        } catch {}
      }
      
      // Multi-HUD Management Functions
      window.currentVisibleHudShipId = npcId; // Track which HUD is currently visible (start with Bismarck)
      
      window.showHudForShip = function(shipId) {
        try {
          console.log('=== MULTI-HUD: Showing HUD for ship ID:', shipId);
          
          // If already showing this ship's HUD, do nothing (prevent flashing)
          if (window.currentVisibleHudShipId === shipId) {
            console.log('HUD already showing for ship ID:', shipId, '- skipping to prevent flash');
            return true;
          }
          
          // Hide all currently visible RIGHT HUDs (don't touch left player HUD)
          const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
          Object.keys(window.ShipHUDs).forEach(id => {
            if (id !== playerId) { // Don't hide player HUD
              const hudInfo = window.ShipHUDs[id];
              const container = document.getElementById(hudInfo.containerId);
              if (container) {
                container.style.display = 'none';
                console.log('Hidden right HUD for ship ID:', id);
              }
            }
          });
          
          // Show the requested ship's HUD
          const targetHud = window.ShipHUDs[shipId];
          if (targetHud) {
            const container = document.getElementById(targetHud.containerId);
            if (container) {
              // For player ship cycling, use the original ID for HUD data
              const displayId = targetHud.originalId || shipId;
              container.dataset.shipId = displayId;
              container.style.display = 'block';
              
              // Ensure proper positioning for right-side HUDs
              if (targetHud.containerId === 'shipHudTransport') {
                // Transport HUD uses same position as Bismarck HUD but different container
                container.style.position = 'fixed';
                container.style.bottom = '20px';
                container.style.right = '20px';
                container.style.zIndex = '1000';
              }
              
              // Initialize HUD if not already done
              if (!targetHud.initialized) {
                console.log('Initializing HUD for ship ID:', shipId, 'display ID:', displayId);
                initShipHudFor(targetHud.containerId, targetHud.canvasId);
                targetHud.initialized = true;
              }
              
              window.currentVisibleHudShipId = shipId; // Track current HUD
              console.log('Showed HUD for ship ID:', shipId, 'display ID:', displayId, 'using container:', targetHud.containerId);
              return true;
            }
          }
          
          console.warn('No HUD registered for ship ID:', shipId);
          return false;
        } catch (e) {
          console.error('Error showing HUD for ship:', shipId, e);
          return false;
        }
      };
      
      window.registerHudForShip = function(shipId, containerId, canvasId) {
        try {
          window.ShipHUDs[shipId] = { containerId, canvasId, initialized: false };
          console.log('Registered new HUD for ship ID:', shipId, 'container:', containerId);
        } catch (e) {
          console.error('Error registering HUD for ship:', shipId, e);
        }
      };
      
      window.hideAllHuds = function() {
        try {
          // Hide all registered HUDs
          Object.keys(window.ShipHUDs).forEach(id => {
            const hudInfo = window.ShipHUDs[id];
            const container = document.getElementById(hudInfo.containerId);
            if (container) {
              container.style.display = 'none';
              console.log('Hidden HUD for ship ID:', id);
            }
          });
          
          // Also hide player HUD explicitly (in case it's not in registry)
          const playerHud = document.getElementById('shipHud');
          if (playerHud) {
            playerHud.style.display = 'none';
            console.log('Hidden player HUD');
          }
          
          window.currentVisibleHudShipId = null;
          console.log('All HUDs hidden');
        } catch (e) {
          console.error('Error hiding all HUDs:', e);
        }
      };
      
    } catch {}
    // Eye buttons (Fleet 1/2/3): toggle camera follow of HUD ship cycle (snap + follow)
    try {
      const eyeBtns = Array.from(document.querySelectorAll('.gunnery-view-btn'));
      eyeBtns.forEach((eyeBtn)=>{
        if (eyeBtn.__eyeBound__) return; // avoid double-binding
        eyeBtn.__eyeBound__ = true;
        eyeBtn.addEventListener('click', ()=>{
          try {
            console.log('=== EYE BUTTON: Right HUD Cycling ===');
            
            // Build cycle from RIGHT HUD ships only (strictly exclude player and any left-HUD proxies)
            const cycle = [];
            const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
            
            if (window.ShipHUDs) {
              Object.keys(window.ShipHUDs).forEach(shipId => {
                const hudInfo = window.ShipHUDs[shipId];
                if (!hudInfo) return;
                // Exclusions:
                // - direct player id (left HUD entry)
                // - any HUD registered against the left container
                // NOTE: allow right-HUD surrogate even if it points back to player via originalId
                if (shipId === playerId) return;
                if (hudInfo.containerId === 'shipHud') return;
                // Exclude HUDs marked sunk and ships whose state is sunk
                try {
                  if (hudInfo.sunk) return;
                  const h = window.ShipHandlesById && window.ShipHandlesById[shipId];
                  const sunk = !!(h && h.state && (h.state.effects?.sunk || h.state.sunk));
                  if (!h || sunk) return;
                } catch {}

                // Find ship position
                let shipX = 0, shipY = 0;
                try {
                  const handle = window.ShipHandlesById && window.ShipHandlesById[shipId];
                  if (handle && handle.state && handle.state.ship) {
                    shipX = handle.state.ship.x;
                    shipY = handle.state.ship.y;
                  }
                } catch {}

                let shipType = 'battleship';
                if (hudInfo.containerId === 'shipHudTransport') shipType = 'transport';
                else if (hudInfo.containerId === 'shipHudCruiser') shipType = 'cruiser';
                cycle.push({ id: shipId, x: shipX, y: shipY, type: shipType });
              });
            }
            
            console.log('Eye cycle ships (right HUD only):', cycle.map(s => `${s.id}(${s.type})`));
            
            // Maintain a dedicated cycle index for Eye
            window.viewCycleEye = window.viewCycleEye || { index: -1 };
            window.viewFollow = window.viewFollow || { enabled: false };
            
            if (!window.viewFollow.enabled || cycle.length === 0) {
              if (cycle.length === 0) {
                // No ships to cycle, just disable
                eyeBtn.classList.remove('brass-selected');
                eyeBtn.setAttribute('aria-pressed','false');
                window.viewFollow.enabled = false;
                return;
              }
              // Enable follow and start at first
              eyeBtn.classList.add('brass-selected');
              eyeBtn.setAttribute('aria-pressed','true');
              window.viewFollow.enabled = true;
              window.viewCycleEye.index = 0;
            } else {
              // Advance to next ship, or close if at end
              window.viewCycleEye.index++;
              if (window.viewCycleEye.index >= cycle.length) {
                // Close right HUD and disable follow
                console.log('Eye cycling: closing right HUD');
                eyeBtn.classList.remove('brass-selected');
                eyeBtn.setAttribute('aria-pressed','false');
                window.viewFollow.enabled = false;
                
                // Hide only right HUD ships (keep left HUD independent)
                Object.keys(window.ShipHUDs).forEach(id => {
                  if (id !== playerId) { // Don't touch player HUD
                    const hudInfo = window.ShipHUDs[id];
                    const container = document.getElementById(hudInfo.containerId);
                    if (container) {
                      container.style.display = 'none';
                    }
                  }
                });
                window.currentVisibleHudShipId = null;
                return;
              }
            }

            const currentShip = cycle[window.viewCycleEye.index];
            if (!currentShip) return;
            
            console.log('Eye cycling to ship:', currentShip.id, 'type:', currentShip.type);
            
            // Snap camera to ship and set up following
            camera.cx = currentShip.x; 
            camera.cy = currentShip.y; 
            currentViewRect = getViewRect();
            
            // Set up camera following for this ship
            window.viewFollow = window.viewFollow || {};
            window.viewFollow.enabled = true;
            window.viewFollow.mode = 'ship';
            
            // Handle special case for player ship cycling (use original ID for following)
            const followId = currentShip.id.endsWith('_right') ? currentShip.id.replace('_right', '') : currentShip.id;
            window.viewFollow.shipId = followId;
            
            console.log('Camera following ship ID:', followId);
            
            // Show ship's HUD using multi-HUD system (right HUD only)
            window.showHudForShip(currentShip.id);
            
          } catch (e) {
            console.error('Error in eye button cycling:', e);
          }
        });
      });
    } catch {}
    try {
      const canvasEl = document.getElementById('gameCanvas');
      if (canvasEl) {
        // Track last pointer world position for debug placement and UX
        const updateLastPointer = (evt)=>{
          try {
            const rect = canvasEl.getBoundingClientRect();
            const px = evt.clientX - rect.left; const py = evt.clientY - rect.top;
            const wpt = screenToWorld(px, py);
            window.lastPointerWorld = { x: wpt.x, y: wpt.y };
          } catch {}
        };
        canvasEl.addEventListener('mousemove', updateLastPointer);
        canvasEl.addEventListener('mousedown', updateLastPointer);
        canvasEl.addEventListener('touchstart', (evt)=>{ try { const t = evt.touches && evt.touches[0]; if (t) updateLastPointer(t); } catch {} });

        canvasEl.addEventListener('click', (evt)=>{
          try {
            // Debug placement mode: if pending, place ship at click and consume event
            if (window.DebugPlaceMode && window.DebugPlaceMode.pending) {
              try {
                // Update pointer and compute world position
                updateLastPointer(evt);
                const wx = (window.lastPointerWorld && window.lastPointerWorld.x) || ship.x;
                const wy = (window.lastPointerWorld && window.lastPointerWorld.y) || ship.y;
                const opts = {
                  heading: Number(window.DebugPlaceMode.heading) || 0,
                  speedKts: Number(window.DebugPlaceMode.speedKts) || 0,
                  side: (window.DebugPlaceMode.side === 'friendly') ? 'friendly' : 'enemy',
                  typeLabel: window.DebugPlaceMode.typeLabel || (window.shipProfile && window.shipProfile.type) || 'Ship',
                  shipKind: (window.DebugPlaceMode.shipKind || window.DebugPlaceMode.shipType || '').toLowerCase()
                };
                let created = null;
                try {
                  // Force Transport path to use transport.js factory directly
                  if (opts.shipKind === 'transport' && typeof window.spawnTransport === 'function') {
                    console.log('=== TRANSPORT SPAWN DEBUG START ===');
                    console.log('Spawning transport with side:', opts.side);
                    console.log('Current player ship before spawn:', window.shipState);
                    console.log('Current IronTideFleet before spawn:', window.IronTideFleet?.length || 0, 'ships');
                    console.log('Current NPCs before spawn:', window.NPCs?.length || 0, 'ships');
                    
                    const transportNpc = window.spawnTransport(opts.side, wx, wy, opts);
                    const st = transportNpc.state;
                    
                    console.log('=== TRANSPORT CREATED ===');
                    console.log('Transport NPC:', transportNpc);
                    console.log('Transport state:', st);
                    console.log('Transport ID:', st?.id);
                    console.log('Transport displayName:', st?.displayName);
                    console.log('Transport profile type:', st?.profile?.type);
                    console.log('Transport profile image:', st?.profile?.image);
                    console.log('IronTideFleet after spawn:', window.IronTideFleet?.length || 0, 'ships');
                    console.log('NPCs after spawn:', window.NPCs?.length || 0, 'ships');
                    
                    // Check if Transport is actually in IronTideFleet
                    if (window.IronTideFleet) {
                      const transportInFleet = window.IronTideFleet.find(h => h.state?.id === st?.id);
                      console.log('Transport found in IronTideFleet:', !!transportInFleet);
                      if (transportInFleet) {
                        console.log('Transport handle in fleet:', transportInFleet);
                      }
                    }
                    try {
                      if (st && st.ship) {
                        let px = wx, py = wy, pHead = opts.heading;
                        // Place at clicked location, not behind Bismarck
                        st.ship.x = px; st.ship.y = py;
                        st.heading = pHead; st.ship.heading = pHead; st.ship.desiredHeading = pHead;
                        st.speedKts = opts.speedKts; st.actualSpeedKts = opts.speedKts;
                        console.log('Transport positioned at:', wx, wy, 'with profile:', st.profile?.type);
                        // Mark as Fleet 1 for formation/follow logic consumers
                        try { st.fleetId = 1; } catch {}
                        
                        // Find the transport in IronTideFleet and mark it properly
                        try { 
                          if (Array.isArray(window.IronTideFleet)) {
                            for (let i=0;i<window.IronTideFleet.length;i++) {
                              const h = window.IronTideFleet[i]; 
                              if (h && h.state === st) { 
                                h.fleetId = 1; 
                                if (h.state) h.state.fleetId = 1; 
                                if (h.profile) h.profile.fleetId = 1; 
                                // Make it fully integrated like Bismarck
                                h.isActive = true;
                                h.isControllable = true;
                                h.canTakeHits = true;
                                h.participatesInCombat = true;
                                // Register handle globally for HUD / Fleet UI resolution
                                try {
                                  window.ShipHandlesById = window.ShipHandlesById || {};
                                  const key = String(st.id);
                                  h.id = h.id || st.id;
                                  h.displayName = h.displayName || st.displayName;
                                  window.ShipHandlesById[key] = h;
                                  console.log('Registered Transport handle in ShipHandlesById:', key, h);
                                } catch {}

                        // Rebuild Fleet 1 manager list now that sets are updated
                        try { if (typeof window.rebuildFleetList === 'function') window.rebuildFleetList(1); } catch {}
                                break; 
                              }
                            }
                          } 
                        } catch {}
                        
                        // Mark as placed by debug to distinguish from any non-user spawns
                        try { st.debugPlaced = true; } catch {}
                        
                        // COMPLETELY REWRITE Transport integration to be IDENTICAL to Bismarck
                        try {
                          console.log('=== COMPLETE TRANSPORT INTEGRATION REWRITE ===');
                          
                          // STEP 1: Make Transport IDENTICAL to Bismarck in all systems
                          // Force Transport to have Bismarck-like properties
                          st.isPlayerShip = false; // Not the main player ship, but still controllable
                          st.isControllable = true;
                          st.canTakeHits = true;
                          st.isSelectable = true;
                          st.participatesInFleet = true;
                          st.fleetId = 1;
                          st.shipType = 'Transport'; // Override type
                          
                          // STEP 2: Add to ship cycle for HUD navigation (Eye button)
                          if (!window.shipCycle) window.shipCycle = [];
                          if (!window.shipCycle.find(s => s.id === st.id)) {
                            window.shipCycle.push(st);
                            console.log('Added Transport to shipCycle. Total ships:', window.shipCycle.length);
                          }
                          
                          // FORCE into ALL Fleet 1 assignment systems
                          // Initialize all possible fleet assignment systems
                          if (!window.fleetAssignments) {
                            window.fleetAssignments = { 1: new Set(), 2: new Set(), 3: new Set() };
                          }
                          if (!window.fa) {
                            window.fa = { 1: new Set(), 2: new Set(), 3: new Set() };
                          }
                          if (!window.fleetMembers) {
                            window.fleetMembers = { 1: [], 2: [], 3: [] };
                          }
                          
                          // Add Transport to ALL Fleet 1 systems
                          const transportId = String(st.id);
                          window.fleetAssignments[1].add(transportId);
                          window.fa[1].add(transportId);
                          // Store HANDLES in fleetMembers, just like Bismarck
                          const transportHandle2 = (Array.isArray(window.IronTideFleet) ? window.IronTideFleet.find(h => h && h.state === st) : null);
                          if (!window.fleetMembers[1].find(m => (m && (m.id === st.id || m.state?.id === st.id)))) {
                            window.fleetMembers[1].push(transportHandle2 || { state: st, profile: st.profile, id: st.id, displayName: st.displayName });
                          }
                          // FORCE Transport into Fleet 1 using the general assignment system
                          try {
                            console.log('=== FORCING TRANSPORT INTO FLEET 1 ===');
                            console.log('Transport ID:', st.id);
                            console.log('Transport displayName:', st.displayName);
                            console.log('Transport profile type:', st.profile?.type);
                            if (typeof window.assignShipToFleet === 'function') {
                              window.assignShipToFleet(st, 1);
                              console.log('Called assignShipToFleet for Transport', st.id);
                              // Verify assignment worked
                              setTimeout(()=>{
                                try {
                                  console.log('=== FLEET 1 VERIFICATION ===');
                                  console.log('fa[1] contains Transport ID:', window.fa?.[1]?.has(String(st.id)));
                                  console.log('fleetMembers[1] count:', window.fleetMembers?.[1]?.length || 0);
                                  console.log('Transport state.fleetId:', st.fleetId);
                                  const handle = window.ShipHandlesById?.[String(st.id)];
                                  console.log('Handle found in registry:', !!handle);
                                  console.log('Handle fleetId:', handle?.fleetId);
                                  // Force another assignment if needed
                                  if (!window.fa?.[1]?.has(String(st.id))) {
                                    console.log('RETRY: Transport not in Fleet 1, forcing again...');
                                    window.assignShipToFleet(st, 1);
                                  }
                                } catch (e) { console.log('Fleet verification error:', e); }
                              }, 200);
                            }
                          } catch (e) { console.log('Fleet assignment error:', e); }
                          
                          // Ensure Transport is recognized as Fleet 1 leader follower
                          if (!window.fleet1Ships) window.fleet1Ships = [];
                          if (!window.fleet1Ships.find(s => s.id === st.id)) {
                            window.fleet1Ships.push(st);
                          }
                          
                          // Make it part of the fleet control system
                          if (window.fleetShips) {
                            if (!window.fleetShips.find(s => s.id === st.id)) {
                              window.fleetShips.push(st);
                            }
                          } else {
                            window.fleetShips = [st];
                          }
                          
                          // Force update Fleet 1 ship list UI
                          try {
                            const fleetList = document.getElementById('fleetShipsList1');
                            if (fleetList) {
                              const shipDiv = document.createElement('div');
                              shipDiv.className = 'fleet-ship-item';
                              shipDiv.dataset.shipId = String(st.id);
                              shipDiv.textContent = st.displayName || `Transport ${st.id}`;
                              fleetList.appendChild(shipDiv);
                            }
                          } catch {}
                          
                          // STEP 3: FORCE Transport to be recognized as a Fleet 1 ship EVERYWHERE
                          // Create a complete ship handle that matches Bismarck's structure
                          const transportHandle = {
                            state: st,
                            profile: st.profile,
                            id: st.id,
                            displayName: st.displayName,
                            shipType: 'Transport',
                            fleetId: 1,
                            isControllable: true,
                            canTakeHits: true
                          };
                          
                          // STEP 4: Add Transport to ALL possible fleet tracking systems
                          // Add to global ship tracking
                          if (!window.allShips) window.allShips = [];
                          if (!window.allShips.find(s => s.id === st.id)) {
                            window.allShips.push(transportHandle);
                          }
                          
                          // Add to controllable ships
                          if (!window.controllableShips) window.controllableShips = [];
                          if (!window.controllableShips.find(s => s.id === st.id)) {
                            window.controllableShips.push(transportHandle);
                          }
                          
                          // ENSURE BISMARCK IS ALSO IN FLEET 1 SYSTEMS (as leader)
                          try {
                            if (window.shipState && window.shipState.id) {
                              const bismarckId = String(window.shipState.id);
                              window.fleetAssignments[1].add(bismarckId);
                              window.fa[1].add(bismarckId);
                              if (!window.fleetMembers[1].find(m => m.id === window.shipState.id)) {
                                window.fleetMembers[1].unshift(window.shipState); // Leader at front
                              }
                              if (!window.fleet1Ships.find(s => s.id === window.shipState.id)) {
                                window.fleet1Ships.unshift(window.shipState); // Leader at front
                              }
                            }
                          } catch {}
                          
                          console.log('=== FLEET ASSIGNMENT DEBUG ===');
                          console.log('TRANSPORT FORCED INTO FLEET 1:', st.id, st.displayName);
                          console.log('window.fa[1] exists:', !!window.fa[1]);
                          console.log('Fleet 1 assignments:', Array.from(window.fa[1] || []));
                          console.log('window.fleetMembers[1] exists:', !!window.fleetMembers[1]);
                          console.log('Fleet 1 members:', (window.fleetMembers[1] || []).map(m => m.displayName));
                          console.log('window.fleetAssignments[1] exists:', !!window.fleetAssignments[1]);
                          console.log('Fleet assignments 1:', Array.from(window.fleetAssignments[1] || []));
                          
                          // Check Fleet 1 UI
                          const fleetList2 = document.getElementById('fleetShipsList1');
                          console.log('Fleet 1 UI element exists:', !!fleetList2);
                          if (fleetList2) {
                            console.log('Fleet 1 UI children count:', fleetList2.children.length);
                            console.log('Fleet 1 UI contents:', Array.from(fleetList2.children).map(c => c.textContent));
                          }
                        } catch {}
                        
                        // Fleet Manager: helper to rebuild list from authoritative sets
                        try {
                          if (typeof window.rebuildFleetList !== 'function') {
                            window.rebuildFleetList = function rebuildFleetList(fleetId){
                              try {
                                const listEl = document.getElementById(`fleetShipsList${fleetId}`);
                                if (!listEl) return;
                                while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
                                const ids = Array.from((window.fa && window.fa[fleetId]) ? window.fa[fleetId] : []);
                                ids.forEach(idStr => {
                                  const h = (window.ShipHandlesById && window.ShipHandlesById[idStr]) || (Array.isArray(window.IronTideFleet) ? window.IronTideFleet.find(e => String(e.state?.id) === String(idStr)) : null);
                                  if (!h) return;
                                  const div = document.createElement('div');
                                  div.className = 'fleet-ship-item';
                                  div.dataset.shipId = String(idStr);
                                  div.textContent = (h.state?.displayName) || (h.displayName) || `Ship ${idStr}`;
                                  listEl.appendChild(div);
                                });
                              } catch {}
                            };
                          }
                        } catch {}

                        // General fleet assignment: move ship to any fleet (1..3)
                        try {
                          if (typeof window.assignShipToFleet !== 'function') {
                            window.assignShipToFleet = function assignShipToFleet(ship, fleetId){
                              try {
                                const fid = Number(fleetId);
                                if (!(fid===1||fid===2||fid===3)) return;
                                const id = (ship && ship.id != null) ? String(ship.id) : (ship && ship.state && ship.state.id != null ? String(ship.state.id) : '')
                                  || (typeof ship === 'string' ? ship : '');
                                if (!id) return;
                                window.fa = window.fa || { 1: new Set(), 2: new Set(), 3: new Set() };
                                window.fleetAssignments = window.fleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };
                                window.fleetMembers = window.fleetMembers || { 1: [], 2: [], 3: [] };
                                // Resolve handle by id
                                const h = (window.ShipHandlesById && window.ShipHandlesById[id]) || (Array.isArray(window.IronTideFleet) ? window.IronTideFleet.find(e => String(e.state?.id) === String(id)) : null);
                                if (!h) return;
                                // Remove from any existing fleets
                                [1,2,3].forEach(f=>{
                                  try { window.fa[f].delete(id); } catch {}
                                  try { window.fleetAssignments[f].delete(id); } catch {}
                                  try {
                                    const arr = window.fleetMembers[f];
                                    const idx = arr.findIndex(m => (m && ((m.id === id) || (String(m.state?.id) === id))));
                                    if (idx >= 0) arr.splice(idx,1);
                                  } catch {}
                                });
                                // Set flags
                                try { if (h.state) h.state.fleetId = fid; h.fleetId = fid; } catch {}
                                // Add to target fleet
                                window.fa[fid].add(id);
                                window.fleetAssignments[fid].add(id);
                                if (!window.fleetMembers[fid].find(m => (m && ((m.id === h.id) || (m.state?.id === h.state?.id))))) {
                                  window.fleetMembers[fid].push(h);
                                }
                                // Legacy compatibility for Fleet 1 list
                                try {
                                  if (fid === 1) {
                                    window.fleet1Ships = window.fleet1Ships || [];
                                    if (!window.fleet1Ships.find(s => (s && ((s.id === h.state?.id) || (s.state?.id === h.state?.id))))) window.fleet1Ships.push(h.state || h);
                                  }
                                } catch {}
                                // Rebuild source/target Fleet UI lists
                                try { if (typeof window.rebuildFleetList === 'function') { [1,2,3].forEach(f=>window.rebuildFleetList(f)); } } catch {}
                                console.log('[FLEET] Assigned ship', id, 'to Fleet', fid);
                              } catch (e) { console.log('[FLEET] assignShipToFleet error', e); }
                            };
                          }
                        } catch {}

                        // STEP 5: COMPLETELY REWRITE HUD SYSTEM FOR TRANSPORT
                        try {
                          // Make Transport globally accessible for HUD system
                          if (!window.transportShips) window.transportShips = [];
                          if (!window.transportShips.find(t => t.id === st.id)) {
                            window.transportShips.push(st);
                          }
                          
                          // Override the HUD image detection for THIS Transport
                          const originalHudImgSrc = 'assets/bismarck1.png';
                          const transportHudImgSrc = 'assets/trans.png';
                          
                          // FORCE HUD to recognize Transport
                          st.hudImageOverride = transportHudImgSrc;
                          st.hudTmxOverride = 'assets/transtmx.tmx';
                          
                          // Auto-open right HUD for this transport - let normal HUD logic handle it
                          const hudR = document.getElementById('shipHudRight');
                          // DON'T FORCE HUD SWITCH - let user keep viewing current ship
                          // Just register the Transport so it can be selected later
                          console.log('=== TRANSPORT SPAWNED ===');
                          console.log('Transport ID:', st.id);
                          console.log('Transport profile type:', st.profile?.type);
                          console.log('Transport profile image:', st.profile?.image);
                          console.log('Transport profile tmx:', st.profile?.tmx);
                          console.log('Transport available for selection, but not forcing HUD switch');
                        } catch {}
                        // Don't make transports the active player ship - keep Bismarck as player
                      }
                    } catch {}
                    created = { state: st };
                  } else if (opts.shipKind === 'prinzeugen' && typeof window.spawnPrinzEugen === 'function') {
                    console.log('=== PRINZ EUGEN SPAWN DEBUG START ===');
                    const pe = window.spawnPrinzEugen(opts.side, wx, wy, opts);
                    const st = pe && pe.state;
                    if (st && st.ship) {
                      // Ensure exact placement and initial state
                      st.ship.x = wx; st.ship.y = wy;
                      const hd = Number(opts.heading)||0;
                      st.heading = hd; st.ship.heading = hd; st.ship.desiredHeading = hd;
                      const sp = Number(opts.speedKts)||0; st.speedKts = sp; st.actualSpeedKts = sp;
                      try { st.debugPlaced = true; } catch {}
                    }
                    created = { state: st };
                  } else if (typeof window.spawnNpcAt === 'function') {
                    created = window.spawnNpcAt(wx, wy, opts);
                  }
                } catch {}
                // Optional despawn timer
                try {
                  const sec = Number(window.DebugPlaceMode.despawnSec) || 0;
                  if (created && created.state && sec > 0) {
                    setTimeout(()=>{ try { if (typeof window.despawnNpcById === 'function') window.despawnNpcById(created.state.id); } catch {} }, Math.round(sec*1000));
                  }
                } catch {}
              } catch {}
              // Exit placement mode and reset cursor
              try { window.DebugPlaceMode.pending = false; } catch {}
              try { document.body.style.cursor = ''; } catch {}
              return; // consume; do not open HUD on this click
            }
            // Do not open HUDs while a firing target is selected
            if (window.firingSolution && window.firingSolution.target) return;
            updateLastPointer(evt);
            const wx = (window.lastPointerWorld && window.lastPointerWorld.x) || ship.x;
            const wy = (window.lastPointerWorld && window.lastPointerWorld.y) || ship.y;
            // Distances to player and npc ships
            let dPlayer = Infinity, dNpc = Infinity;
            try { if (window.shipState && window.shipState.ship) dPlayer = Math.hypot(wx - window.shipState.ship.x, wy - window.shipState.ship.y); } catch {}
            try { if (window.npc1 && window.npc1.state && window.npc1.state.ship) dNpc = Math.hypot(wx - window.npc1.state.ship.x, wy - window.npc1.state.ship.y); } catch {}
            const hudL = document.getElementById('shipHud');
            const hudR = document.getElementById('shipHudRight');
            const radius = 120; // click radius in world units
            if (dPlayer <= radius || dNpc <= radius) {
              if (dPlayer <= dNpc) {
                if (hudL) hudL.style.display = 'block';
              } else {
                // Bind NPC id if not bound yet
                try {
                  const npcId = (window.npc1 && window.npc1.state && window.npc1.state.id) ? String(window.npc1.state.id) : '';
                  if (hudR && npcId) hudR.dataset.shipId = npcId;
                } catch {}
                if (hudR) hudR.style.display = 'block';
              }
            }
          } catch {}
        });
      }
    } catch {}
    // Hook smokescreen button
    const smokeBtn = document.querySelector('.smokescreen-btn');
    if (smokeBtn) {
      smokeBtn.addEventListener('click', ()=>{ smoke.smokescreen = !smoke.smokescreen; smokeBtn.classList.toggle('active', smoke.smokescreen); });
    }
    // Hook formation selector and options HUD
    const formationSel = document.getElementById('formationSelect');
    if (formationSel) {
      formationSelEl = formationSel;
      // Query HUD elements
      formationOptionsEl    = document.getElementById('formationOptions');
      formationCloseBtn     = document.getElementById('formationCloseBtn');
      formationTurnSeqBtn   = document.getElementById('formationTurnSeqBtn');
      formationTurnTogetherBtn = document.getElementById('formationTurnTogetherBtn');
      formationIntervalEl   = document.getElementById('formationInterval');
      formationFormUpBtn    = document.getElementById('formationFormUpBtn');
      formationFormUpBtnEchelon = document.getElementById('formationFormUpBtnEchelon');
      formationAnchorBtn    = document.getElementById('formationAnchorBtn');
      const formationTurningRow = document.getElementById('formationTurningRow');
      const circularEscortExtra = document.getElementById('circularEscortExtra');
      const screenExtra = document.getElementById('screenExtra');
      echelonDirRow         = document.getElementById('echelonDirRow');
      echelonLeftBtn        = document.getElementById('echelonLeftBtn');
      echelonRightBtn       = document.getElementById('echelonRightBtn');

      // Helper updaters to keep UI and state in sync
      function setTurning(mode) {
        formationState.turning = (mode === 'together') ? 'together' : 'sequence';
        if (formationTurnSeqBtn && formationTurnTogetherBtn) {
          const seq = formationState.turning === 'sequence';
          formationTurnSeqBtn.classList.toggle('active', seq);
          formationTurnTogetherBtn.classList.toggle('active', !seq);
          try {
            formationTurnSeqBtn.setAttribute('aria-pressed', String(seq));
            formationTurnTogetherBtn.setAttribute('aria-pressed', String(!seq));
          } catch {}
        }
      }
      function setStation(mode) {
        formationState.station = (mode === 'anchor') ? 'anchor' : 'formup';
        if (formationFormUpBtn && formationAnchorBtn) {
          const fu = formationState.station === 'formup';
          formationFormUpBtn.classList.toggle('active', fu);
          formationAnchorBtn.classList.toggle('active', !fu);
          try {
            formationFormUpBtn.setAttribute('aria-pressed', String(fu));
            formationAnchorBtn.setAttribute('aria-pressed', String(!fu));
          } catch {}
        }
        if (formationFormUpBtnEchelon) {
          const fu = formationState.station === 'formup';
          formationFormUpBtnEchelon.classList.toggle('active', fu);
          try { formationFormUpBtnEchelon.setAttribute('aria-pressed', String(fu)); } catch {}
        }
      }
      function applyIntervalFromInput() {
        let v = 300;
        if (formationIntervalEl) v = parseFloat(formationIntervalEl.value) || 300;
        if (v < 0) v = 0;
        formationState.intervalMeters = v;
        if (formationIntervalEl) formationIntervalEl.value = String(v);
      }

      function setEchelonDir(dir){
        const leftOn = (dir === 'left');
        formationState.echelonDir = leftOn ? 'left' : 'right';
        // Save to fleet settings
        try {
          const currentFleet = window.IronTideSelectedFleet || 1;
          const settings = window.IronTideFleetSettings && window.IronTideFleetSettings[currentFleet];
          if (settings) {
            settings.echelonDirection = leftOn ? 'left' : 'right';
          }
        } catch {}
        if (echelonLeftBtn && echelonRightBtn) {
          echelonLeftBtn.classList.toggle('active', leftOn);
          echelonRightBtn.classList.toggle('active', !leftOn);
          try {
            echelonLeftBtn.setAttribute('aria-pressed', String(leftOn));
            echelonRightBtn.setAttribute('aria-pressed', String(!leftOn));
          } catch {}
        }
      }

      function updateEchelonDirVisibility(){
        if (!echelonDirRow) return;
        const val = (formationSelEl && formationSelEl.value) ? String(formationSelEl.value).toLowerCase() : '';
        const isEchelon = val.includes('echelon');
        echelonDirRow.style.display = isEchelon ? 'flex' : 'none';
        try { echelonDirRow.setAttribute('aria-hidden', String(!isEchelon)); } catch {}
        // Standalone Form Up visible for non-Echelon only
        if (formationFormUpBtn) {
          formationFormUpBtn.style.display = isEchelon ? 'none' : '';
          try { formationFormUpBtn.setAttribute('aria-hidden', String(isEchelon)); } catch {}
        }
      }

      function updateFormationSpecificExtras(){
        const val = (formationSelEl && formationSelEl.value) ? String(formationSelEl.value).toLowerCase() : '';
        const isCircularEscort = val.includes('circular escort');
        const isScreen = val.includes('screen') && !val.includes('battle line with screen');
        // Show extras only for their matching formation
        if (circularEscortExtra) {
          const show = isCircularEscort;
          circularEscortExtra.style.display = show ? 'block' : 'none';
          try { circularEscortExtra.setAttribute('aria-hidden', String(!show)); } catch {}
          if (show) {
            const ce = document.getElementById('circularEscortCompass');
            if (ce && typeof buildDomCompassTicks === 'function') {
              // Defer to ensure layout has applied so widths/heights are non-zero
              requestAnimationFrame(() => buildDomCompassTicks(ce));
            }
          }
        }
        if (screenExtra) {
          const show = isScreen;
          screenExtra.style.display = show ? 'block' : 'none';
          try { screenExtra.setAttribute('aria-hidden', String(!show)); } catch {}
          if (show) {
            const sc = document.getElementById('screenCompass');
            if (sc && typeof buildDomCompassTicks === 'function') {
              requestAnimationFrame(() => buildDomCompassTicks(sc));
            }
          }
        }
        // Hide turning controls only for these two formations
        if (formationTurningRow) {
          const hideTurning = isCircularEscort || isScreen;
          formationTurningRow.style.display = hideTurning ? 'none' : '';
          try { formationTurningRow.setAttribute('aria-hidden', String(hideTurning)); } catch {}
        }
      }

      // Initialize UI to default state
      setTurning(formationState.turning);
      setStation(formationState.station);
      applyIntervalFromInput();
      setEchelonDir(formationState.echelonDir);
      updateEchelonDirVisibility();
      updateFormationSpecificExtras();

      // Track when dropdown was opened
      let dropdownOpenedAt = 0;
      
      // When dropdown gets focus (opens)
      formationSel.addEventListener('focus', ()=>{
        dropdownOpenedAt = Date.now();
      });
      
      // When user clicks on the select
      formationSel.addEventListener('click', ()=>{
        const timeSinceFocus = Date.now() - dropdownOpenedAt;
        // If more than 200ms since focus, dropdown was already open and they clicked an option
        if (timeSinceFocus > 200) {
          setTimeout(() => {
            updateEchelonDirVisibility();
            updateFormationSpecificExtras();
            if (formationOptionsEl) {
              formationOptionsEl.classList.add('show');
              formationOptionsEl.setAttribute('aria-hidden', 'false');
            }
          }, 50);
        }
        // Otherwise, they just opened the dropdown (do nothing)
      });
      
      // Also open window when selecting a different formation
      formationSel.addEventListener('change', ()=>{
        updateEchelonDirVisibility();
        updateFormationSpecificExtras();
        if (formationOptionsEl) {
          formationOptionsEl.classList.add('show');
          formationOptionsEl.setAttribute('aria-hidden', 'false');
        }
      });
      if (formationCloseBtn) formationCloseBtn.addEventListener('click', ()=>{
        if (formationOptionsEl) {
          formationOptionsEl.classList.remove('show');
          formationOptionsEl.setAttribute('aria-hidden', 'true');
        }
      });
      if (formationTurnSeqBtn) formationTurnSeqBtn.addEventListener('click', ()=> setTurning('sequence'));
      if (formationTurnTogetherBtn) formationTurnTogetherBtn.addEventListener('click', ()=> setTurning('together'));
      if (formationFormUpBtn) formationFormUpBtn.addEventListener('click', ()=> setStation('formup'));
      if (formationFormUpBtnEchelon) formationFormUpBtnEchelon.addEventListener('click', ()=> setStation('formup'));
      if (formationAnchorBtn) formationAnchorBtn.addEventListener('click', ()=> setStation('anchor'));
      if (formationIntervalEl) formationIntervalEl.addEventListener('input', applyIntervalFromInput);
      if (echelonLeftBtn) echelonLeftBtn.addEventListener('click', ()=> setEchelonDir('left'));
      if (echelonRightBtn) echelonRightBtn.addEventListener('click', ()=> setEchelonDir('right'));
    }
    // Hook pattern selector
    const patternSel = document.getElementById('patternSelect');
    if (patternSel) {
      patternSelEl = patternSel;
      // Pattern Options refs
      patternOptionsEl = document.getElementById('patternOptions');
      zigAmpEl = document.getElementById('zigAmp');
      zigWaveEl = document.getElementById('zigWave');
      zigLoopBtn = document.getElementById('zigLoopBtn');
      zigResetBtn = document.getElementById('zigReset');
      patternCloseBtn = document.getElementById('patternCloseBtn');
      // Box options refs
      boxOptionsEl = document.getElementById('boxOptions');
      boxCloseBtn = document.getElementById('boxCloseBtn');
      boxLoopBtn = document.getElementById('boxLoopBtn');
      boxDirCwBtn = document.getElementById('boxDirCwBtn');
      boxDirCcwBtn = document.getElementById('boxDirCcwBtn');
      // Circle options refs
      circleOptionsEl = document.getElementById('circleOptions');
      circleCloseBtn = document.getElementById('circleCloseBtn');
      circleLoopBtn = document.getElementById('circleLoopBtn');
      circleDirCwBtn = document.getElementById('circleDirCwBtn');
      circleDirCcwBtn = document.getElementById('circleDirCcwBtn');
      circleResetBtn = document.getElementById('circleReset');
      // Figure Eight refs
      figureOptionsEl = document.getElementById('figureOptions');
      figureCloseBtn = document.getElementById('figureCloseBtn');
      figureLoopBtn = document.getElementById('figureLoopBtn');
      figureDirCwBtn = document.getElementById('figureDirCwBtn');
      figureDirCcwBtn = document.getElementById('figureDirCcwBtn');
      figureResetBtn = document.getElementById('figureReset');
      // Oval Patrol refs
      ovalOptionsEl = document.getElementById('ovalOptions');
      ovalCloseBtn = document.getElementById('ovalCloseBtn');
      ovalLoopBtn = document.getElementById('ovalLoopBtn');
      ovalDirCwBtn = document.getElementById('ovalDirCwBtn');
      ovalDirCcwBtn = document.getElementById('ovalDirCcwBtn');
      ovalResetBtn = document.getElementById('ovalReset');
      // Free Draw refs
      freeDrawOptionsEl = document.getElementById('freeDrawOptions');
      freeDrawCloseBtn = document.getElementById('freeDrawCloseBtn');
      freeDrawDirCwBtn = document.getElementById('freeDrawDirCwBtn');
      freeDrawDirCcwBtn = document.getElementById('freeDrawDirCcwBtn');
      freeDrawLoopBtn = document.getElementById('freeDrawLoopBtn');
      freeDrawResetBtn = document.getElementById('freeDrawReset');
      // Initialize loop state from button class
      if (boxLoopBtn) {
        const initialOn = boxLoopBtn.classList.contains('active');
        patterns.boxLoop = initialOn;
        try { boxLoopBtn.setAttribute('aria-pressed', String(initialOn)); } catch {}
      }
      patternSel.addEventListener('change', (e) => {
        const val = String(e.target.value || '').toLowerCase();
        // Fleet-specific remove pattern
        if (val === 'remove') {
          const currentFleet = window.IronTideSelectedFleet || 1;
          // Clear only this fleet's saved pattern state
          clearFleetPattern(currentFleet);
          // Reset the working UI pattern object for the active fleet
          patterns.selected = null;
          patterns.placingPin = false;
          patterns.pendingSelection = null;
          patterns.pin = null;
          patterns.path = [];
          patterns.loop = false;
          patterns.currentIdx = 0;
          patterns.guiding = true;
          // Reset select back to default and hide helpers
          try { if (patternSelEl) patternSelEl.value = ''; } catch {}
          if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden','true'); }
          if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden','true'); }
          if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden','true'); }
          if (freeDrawOptionsEl) { freeDrawOptionsEl.classList.remove('show'); freeDrawOptionsEl.setAttribute('aria-hidden','true'); }
          setPinCursor(false);
          return;
        }
        if (val.includes('zig')) {
          // Defer clearing until user clicks a new Zig-Zag pin
          patterns.pendingSelection = 'zigzag';
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          // Show Zig-Zag options; hide Box options (only one helper window visible)
          if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
          if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden', 'true'); }
          // Do not clear existing pattern until pin click
          ship.moveTarget = null;
        } else if (val.includes('box')) {
          // Begin Box Patrol planning: do NOT clear Zig-Zag yet; collect 4 pins first
          patterns.pendingSelection = 'box';
          patterns.boxPins = [];
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          // Show Box options; hide Zig-Zag options
          if (boxOptionsEl) { boxOptionsEl.classList.add('show'); boxOptionsEl.setAttribute('aria-hidden', 'false'); }
          if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden', 'true'); }
          // Sync button highlight to current direction
          try { if (typeof setBoxDir === 'function') setBoxDir(!!patterns.boxCw); } catch {}
        } else if (val.includes('tight circle')) {
          // Begin Tight Circle planning: collect 2 antipodal points
          patterns.pendingSelection = 'circle';
          patterns.circlePins = [];
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          // Show Circle options; hide others
          if (circleOptionsEl) { circleOptionsEl.classList.add('show'); circleOptionsEl.setAttribute('aria-hidden', 'false'); }
          if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden', 'true'); }
          // Initialize circle direction UI
          try { if (typeof setCircleDir === 'function') setCircleDir(!!patterns.circleCw); } catch {}
        } else if (val.includes('free draw')) {
          // Begin Free Draw planning: collect unlimited pins, close loop by clicking first pin
          patterns.pendingSelection = 'freedraw';
          patterns.freeDrawPins = [];
          patterns.freeDrawComplete = false;
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          // Show Free Draw options; hide others
          if (freeDrawOptionsEl) { freeDrawOptionsEl.classList.add('show'); freeDrawOptionsEl.setAttribute('aria-hidden', 'false'); }
          if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden', 'true'); }
          // Sync button highlight to current direction
          try { if (typeof setFreeDrawDir === 'function') setFreeDrawDir(!!patterns.freeDrawCw); } catch {}
        } else {
          // Other patterns could be added; for now, enter generic placement without clearing Zig-Zag
          patterns.pendingSelection = val;
          patterns.placingPin = true;
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (boxOptionsEl) { boxOptionsEl.classList.remove('show'); boxOptionsEl.setAttribute('aria-hidden', 'true'); }
          if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden', 'true'); }
        }
      });

      // Live replan when Amplitude/Wavelength change
      const onOptChange = () => {
        if (patterns.selected === 'zigzag') {
          if (patterns.zigPins && patterns.zigPins.length === 2) {
            const start = patterns.zigPins[0];
            const end = patterns.zigPins[1];
            patterns.path = planZigZagPath(start, end, getZigParams());
            patterns.currentIdx = Math.min(1, patterns.path.length - 1);
            if (patterns.path.length > 1) ship.moveTarget = { x: patterns.path[1].x, y: patterns.path[1].y };
          } else if (patterns.pin) {
            // Legacy single-pin fallback
            patterns.path = planZigZagPath({ x: ship.x, y: ship.y }, patterns.pin, getZigParams());
            patterns.currentIdx = Math.min(1, patterns.path.length - 1);
            if (patterns.path.length > 1) ship.moveTarget = { x: patterns.path[1].x, y: patterns.path[1].y };
          }
        }
      };
      if (zigAmpEl) zigAmpEl.addEventListener('input', onOptChange);
      if (zigWaveEl) zigWaveEl.addEventListener('input', onOptChange);
      if (zigLoopBtn) zigLoopBtn.addEventListener('click', ()=>{
        const on = !zigLoopBtn.classList.contains('active');
        zigLoopBtn.classList.toggle('active', on);
        try { zigLoopBtn.setAttribute('aria-pressed', String(on)); } catch {}
        patterns.loop = on;
        if (on) {
          // Immediately reverse current travel direction along the zig-zag
          patterns.zigForward = !patterns.zigForward;
          // Resume guidance if it was stopped at the end
          patterns.guiding = true;
        }
        // Sync loop and direction to fleet-specific patterns so followers use it
        try {
          const currentFleet = window.IronTideSelectedFleet || 1;
          if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
            window.FleetPatterns[currentFleet].loop = !!on;
            // Initialize zigForward if missing
            if (typeof window.FleetPatterns[currentFleet].zigForward !== 'boolean') {
              window.FleetPatterns[currentFleet].zigForward = true;
            }
            if (on) {
              window.FleetPatterns[currentFleet].zigForward = !window.FleetPatterns[currentFleet].zigForward;
              window.FleetPatterns[currentFleet].guiding = true;
            }
          }
        } catch {}
      });
      if (zigResetBtn) zigResetBtn.addEventListener('click', ()=>{
        // Reset parameters to defaults
        if (zigAmpEl) zigAmpEl.value = 50;
        if (zigWaveEl) zigWaveEl.value = 420;
        // reset loop toggle button state
        if (zigLoopBtn) {
          zigLoopBtn.classList.remove('active');
          try { zigLoopBtn.setAttribute('aria-pressed', 'false'); } catch {}
        }
        
        // Clear the current fleet's zigzag pattern
        const currentFleet = window.IronTideSelectedFleet || 1;
        const fleetPatterns = getFleetPatterns(currentFleet);
        
        fleetPatterns.loop = false;
        // Clear current route and pin; enter placement mode for Zig-Zag
        if (fleetPatterns.selected === 'zigzag') {
          clearPattern(currentFleet);
          fleetPatterns.selected = 'zigzag';
          fleetPatterns.placingPin = true;
          
          // Also update global patterns for current fleet
          if (currentFleet === (window.IronTideSelectedFleet || 1)) {
            patterns.loop = false;
            patterns.selected = 'zigzag';
            patterns.placingPin = true;
          }
          
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          // Keep options visible while in zig-zag mode
          if (patternOptionsEl) { patternOptionsEl.classList.add('show'); patternOptionsEl.setAttribute('aria-hidden', 'false'); }
        }
      });

      // Circle option listeners
      function setCircleDir(cw) {
        patterns.circleCw = !!cw;
        if (circleDirCwBtn && circleDirCcwBtn) {
          circleDirCwBtn.classList.toggle('active', !!cw);
          circleDirCcwBtn.classList.toggle('active', !cw);
        }
        // Sync to current fleet's persisted patterns
        try {
          const currentFleet = window.IronTideSelectedFleet || 1;
          if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
            window.FleetPatterns[currentFleet].circleCw = !!cw;
          }
        } catch {}
        // Immediately update desired heading along selected travel direction
        if (patterns.selected === 'circle' && patterns.path && patterns.path.length > 2) {
          try {
            const cp = closestPointOnLoop(patterns.path, ship.x, ship.y);
            let perim = 0; for (let i=0;i<patterns.path.length;i++){ const a=patterns.path[i], b=patterns.path[(i+1)%patterns.path.length]; perim += Math.hypot(b.x-a.x,b.y-a.y); }
            const avgSeg = Math.max(20, perim / patterns.path.length);
            const lookahead = zigLookaheadForSpeed({ wavelength: avgSeg }, Math.abs(actualSpeedKts||0));
            const distSigned = patterns.circleCw ? lookahead : -lookahead;
            const ahead = cp ? moveAlongPathLooped(patterns.path, cp.segIndex, cp.t, distSigned) : patterns.path[1];
            if (ahead) {
              const dxC = ahead.x - ship.x;
              const dyC = ahead.y - ship.y;
              const desiredC = (Math.atan2(dxC, -dyC) * 180 / Math.PI + 360) % 360;
              ship.desiredHeading = desiredC;
            }
            patterns.guiding = true;
          } catch {}
        }
      }
      // Bind Circle direction buttons
      if (circleDirCwBtn) circleDirCwBtn.addEventListener('click', ()=> setCircleDir(true));
      if (circleDirCcwBtn) circleDirCcwBtn.addEventListener('click', ()=> setCircleDir(false));
      if (circleDirCwBtn) circleDirCwBtn.addEventListener('click', ()=> setCircleDir(true));
      if (circleDirCcwBtn) circleDirCcwBtn.addEventListener('click', ()=> setCircleDir(false));
      if (circleLoopBtn) circleLoopBtn.addEventListener('click', ()=>{
        const on = !circleLoopBtn.classList.contains('active');
        circleLoopBtn.classList.toggle('active', on);
        try { circleLoopBtn.setAttribute('aria-pressed', String(on)); } catch {}
        patterns.circleLoop = on;
        patterns.loop = on;
      });
      if (circleCloseBtn) circleCloseBtn.addEventListener('click', ()=>{
        if (circleOptionsEl) { circleOptionsEl.classList.remove('show'); circleOptionsEl.setAttribute('aria-hidden','true'); }
        // Do not clear any circle planning/pins; just hide UI and end placement
        patterns.placingPin = false;
        setPinCursor(false);
        if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
        try { if (patternSelEl) patternSelEl.value = ''; } catch {}
      });
      if (circleResetBtn) circleResetBtn.addEventListener('click', ()=>{
        // Clear the current fleet's circle pattern and re-enter placement
        const currentFleet = window.IronTideSelectedFleet || 1;
        const fleetPatterns = getFleetPatterns(currentFleet);
        
        if (fleetPatterns.selected === 'circle' || fleetPatterns.pendingSelection === 'circle') {
          clearPattern(currentFleet);
          fleetPatterns.selected = 'circle';
          fleetPatterns.pendingSelection = 'circle';
          fleetPatterns.placingPin = true;
          
          // Also update global patterns for current fleet
          if (currentFleet === (window.IronTideSelectedFleet || 1)) {
            patterns.selected = 'circle';
            patterns.pendingSelection = 'circle';
            patterns.placingPin = true;
          }
          
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          if (circleOptionsEl) { circleOptionsEl.classList.add('show'); circleOptionsEl.setAttribute('aria-hidden','false'); }
        }
      });

      // Free Draw option listeners (guard against duplicates)
      if (!window.__freeDrawDirHandlersAdded__) {
        // Direction buttons bound near setter
        if (freeDrawLoopBtn) freeDrawLoopBtn.addEventListener('click', ()=>{
          const on = !freeDrawLoopBtn.classList.contains('active');
          freeDrawLoopBtn.classList.toggle('active', on);
          try { freeDrawLoopBtn.setAttribute('aria-pressed', String(on)); } catch {}
          patterns.freeDrawLoop = on;
          patterns.loop = on;
          // Sync to current fleet patterns
          try {
            const currentFleet = window.IronTideSelectedFleet || 1;
            if (window.FleetPatterns && window.FleetPatterns[currentFleet]) {
              window.FleetPatterns[currentFleet].freeDrawLoop = !!on;
              window.FleetPatterns[currentFleet].loop = !!on;
            }
          } catch {}
        });
        if (freeDrawResetBtn) freeDrawResetBtn.addEventListener('click', ()=>{
          const currentFleet = window.IronTideSelectedFleet || 1;
          const fleetPatterns = getFleetPatterns(currentFleet);
          // Clear the current Free Draw pattern and re-enter placement mode
          clearPattern(currentFleet);
          fleetPatterns.selected = 'freedraw';
          fleetPatterns.pendingSelection = 'freedraw';
          fleetPatterns.placingPin = true;
          fleetPatterns.path = [];
          fleetPatterns.freeDrawPins = [];
          fleetPatterns.freeDrawComplete = false;
          fleetPatterns.guiding = true;
          fleetPatterns.freeDrawDraggingIndex = -1;
          // Persist
          try {
            if (window.FleetPatterns) {
              window.FleetPatterns[currentFleet] = JSON.parse(JSON.stringify(fleetPatterns));
            }
          } catch {}
          // Sync live patterns for immediate first-click behavior
          patterns.selected = 'freedraw';
          patterns.pendingSelection = 'freedraw';
          patterns.placingPin = true;
          patterns.path = [];
          patterns.freeDrawPins = [];
          patterns.freeDrawComplete = false;
          patterns.guiding = true;
          patterns.freeDrawDraggingIndex = -1;
          // UI state
          if (patternSelEl) patternSelEl.classList.add('pattern-placing');
          setPinCursor(true);
          if (freeDrawOptionsEl) { freeDrawOptionsEl.classList.add('show'); freeDrawOptionsEl.setAttribute('aria-hidden','false'); }
        });
        window.__freeDrawDirHandlersAdded__ = true;
      }

      // Close button hides the floating window but keeps any existing zig-zag on the map
      if (patternCloseBtn) {
        patternCloseBtn.addEventListener('click', () => {
          if (patternOptionsEl) { patternOptionsEl.classList.remove('show'); patternOptionsEl.setAttribute('aria-hidden', 'true'); }
          // Do NOT clear pattern or pin; leave zig-zag visible
          // Also end placement cursor if it was active
          patterns.placingPin = false;
          setPinCursor(false);
          if (patternSelEl) patternSelEl.classList.remove('pattern-placing');
          // Revert dropdown to placeholder without firing change logic
          if (patternSelEl) {
            try { patternSelEl.value = ''; } catch {}
          }
        });
      }
    }
    // patternSelEl is already assigned above from module scope
    // Ship HUD: bottom-left overlay rendering ship and damage hitboxes
    function initShipHudFor(containerId, canvasId){
      // Prevent unnecessary reinitializations that cause flashing
      const container = document.getElementById(containerId);
      if (container && container.dataset.lastInitializedShipId) {
        const currentShipId = String(container.dataset.shipId || '');
        if (currentShipId === container.dataset.lastInitializedShipId) {
          console.log('HUD already initialized for ship ID:', currentShipId, '- skipping to prevent flash');
          return;
        }
      }
      const canvas = document.getElementById(canvasId);
      if (!container || !canvas) return;
      // HARD-PIN Transport HUD to bottom-right with no gap
      try {
        if (container.id === 'shipHudTransport') {
          const cs = container.style;
          cs.position = 'fixed';
          cs.right = '0px';
          cs.bottom = '0px';
          cs.left = 'auto';
          cs.margin = '0px';
          cs.padding = '0px';
          cs.borderRadius = '10px';
          cs.boxShadow = '';
        }
      } catch {}
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const IMG_W = 1024, IMG_H = 1536; // from BSTMX.tmx and bismarck1.png
      const sx = W / IMG_W, sy = H / IMG_H;

      // Pick HUD image by ship type (NO DEFAULT - force detection)
      let hudImgSrc = null;
      try {
        const sid = (container && container.dataset) ? String(container.dataset.shipId||'') : '';
        
        console.log('=== HUD CONTAINER DEBUG ===');
        console.log('Container ID:', container?.id);
        console.log('Container dataset.shipId:', sid);
        console.log('Looking for ship with ID:', sid);
        
        // NO MORE LOCKING - just detect ship type properly
        
        // Get the actual ship ID that should be displayed in this HUD
        let actualSid = sid;
        
        const findById = (idStr)=>{
          try {
            const sid2 = String(idStr||'');
            console.log('=== FINDBYID DEBUG ===');
            console.log('Looking for ship ID:', sid2);
            console.log('Available ship IDs in ShipHandlesById:', window.ShipHandlesById ? Object.keys(window.ShipHandlesById) : 'NO REGISTRY');
            // 1) Check global handle registry first
            try {
              if (window.ShipHandlesById && window.ShipHandlesById[sid2]) {
                console.log('FOUND SHIP IN ShipHandlesById:', window.ShipHandlesById[sid2]);
                const handle = window.ShipHandlesById[sid2];
                console.log('Handle profile type:', handle?.profile?.type);
                console.log('Handle state profile type:', handle?.state?.profile?.type);
                return handle;
              } else {
                console.log('NOT FOUND in ShipHandlesById for ID:', sid2);
              }
            } catch {}
            if (Array.isArray(window.IronTideFleet)) {
              console.log('Checking IronTideFleet with', window.IronTideFleet.length, 'ships');
              for (let i=0;i<window.IronTideFleet.length;i++){ 
                const h=window.IronTideFleet[i]; 
                console.log('Fleet ship', i, ':', h?.state?.id, h?.state?.displayName, h?.profile?.type);
                if (h&&h.state&&String(h.state.id)===sid2) {
                  console.log('FOUND SHIP IN FLEET:', h);
                  // Cache in registry for future fast lookup
                  try { window.ShipHandlesById = window.ShipHandlesById || {}; window.ShipHandlesById[sid2] = h; } catch {}
                  return h;
                }
              }
            }
            if (Array.isArray(window.NPCs)) {
              console.log('Checking NPCs with', window.NPCs.length, 'ships');
              for (let i=0;i<window.NPCs.length;i++){ 
                const n=window.NPCs[i]; 
                console.log('NPC ship', i, ':', n?.state?.id, n?.state?.displayName, n?.profile?.type);
                if (n&&n.state&&String(n.state.id)===sid2) {
                  console.log('FOUND SHIP IN NPCS:', n);
                  try { window.ShipHandlesById = window.ShipHandlesById || {}; window.ShipHandlesById[sid2] = n; } catch {}
                  return n;
                }
              }
            }
          } catch {}
          console.log('SHIP NOT FOUND');
          return null;
        };
        const handle = actualSid ? findById(actualSid) : null;
        const p = (handle && handle.profile) ? handle.profile : (window.shipProfile||null);
        const t = (p && p.type) ? String(p.type).toLowerCase() : '';
        
        // Debug log to see what we're getting
        console.log('=== HUD IMAGE DETECTION DEBUG ===');
        console.log('HUD Debug:', { sid, handle: !!handle, profileType: t, profileImage: p?.image, profileName: p?.name });
        console.log('Container element:', container?.id);
        console.log('Container dataset:', container?.dataset);
        
        // Check if HUD is forced to use Transport assets
        const isForceTransport = (container && container.dataset && container.dataset.forceTransportAssets === 'true');
        const containerType = (container && container.dataset && container.dataset.shipType) || '';
        
        console.log('Force Transport checks:');
        console.log('- isForceTransport:', isForceTransport);
        console.log('- containerType:', containerType);
        console.log('- profileType t:', t);
        console.log('- profile name includes transport:', p && p.name && String(p.name).toLowerCase().includes('transport'));
        console.log('- profile type is transport:', p && p.type && String(p.type).toLowerCase() === 'transport');
        
        // DIRECT OVERRIDE: If this is ship ID 4, it's ALWAYS a Transport
        const isTransportById = (actualSid === '4');
        
        // EXPLICIT BISMARCK DETECTION - never let Bismarck be detected as Transport
        const isBismarckShip = (p && p.name && String(p.name).toLowerCase().includes('bismarck')) ||
                              (p && p.type && String(p.type).toLowerCase().includes('bismarck')) ||
                              (actualSid === '1' || actualSid === '2' || actualSid === '3'); // Player=1, Initial Bismarck=2, Other Bismarck=3+
        
        // ONLY detect Transport ships by profile.type OR by ID 4, BUT NEVER if it's a Bismarck
        const isTransportShip = !isBismarckShip && (isTransportById || (p && p.type && String(p.type).toLowerCase() === 'transport'));
        
        console.log('=== PROFILE DETECTION DETAILED ===');
        console.log('Original Ship ID:', sid);
        console.log('Actual Ship ID:', actualSid);
        console.log('isTransportById (ID=4):', isTransportById);
        console.log('isBismarckShip:', isBismarckShip);
        console.log('Profile p exists:', !!p);
        console.log('Profile p.name:', p?.name);
        console.log('Profile p.type exists:', !!(p && p.type));
        console.log('Profile p.type value:', p?.type);
        console.log('Profile p.type lowercased:', p?.type ? String(p.type).toLowerCase() : 'NO TYPE');
        console.log('Is exactly "transport":', p?.type ? String(p.type).toLowerCase() === 'transport' : false);
        console.log('Final isTransportShip result:', isTransportShip);
        
        console.log('=== HUD SHIP DETECTION DEBUG ===');
        console.log('Ship ID:', actualSid);
        console.log('Handle found:', !!handle);
        console.log('Handle type:', handle?.constructor?.name);
        console.log('Handle.state:', !!handle?.state);
        console.log('Handle.profile:', !!handle?.profile);
        console.log('Profile from handle:', handle?.profile?.type);
        console.log('Profile from state:', handle?.state?.profile?.type);
        console.log('Profile p:', p?.type);
        console.log('isTransportShip:', isTransportShip);
        
        if (isTransportShip) {
          // FORCE Transport assets - NO FALLBACK to Bismarck
          hudImgSrc = 'assets/trans.png';
          console.log('FORCED Transport image:', hudImgSrc);
        } else {
          // This is Bismarck or other Battleship - use Battleship assets
          if (p && typeof p.image === 'string' && p.image) {
            hudImgSrc = p.image;
            console.log('Using Battleship profile image:', p.image);
          } else {
            hudImgSrc = 'assets/bismarck1.png';
            console.log('Using default Battleship image');
          }
        }
        
        // SAFETY CHECK - if still null, something went wrong
        if (!hudImgSrc) {
          console.error('HUD IMAGE SOURCE IS NULL! This should never happen.');
          console.error('Original Ship ID:', sid);
          console.error('Actual Ship ID:', actualSid);
          console.error('Handle:', handle);
          console.error('Profile:', p);
          console.error('isTransportShip:', isTransportShip);
          hudImgSrc = 'assets/bismarck1.png'; // Emergency fallback
        }
        
        console.log('FINAL HUD Image Source:', hudImgSrc);
      } catch {}
      const shipImg = new Image(); shipImg.src = hudImgSrc;
      // DO NOT add global hudRefresh listener for image changes - it affects all HUDs
      let imgLoaded = false; shipImg.onload = ()=>{ imgLoaded = true; };
      // Close button rect (updated each draw), used for click hit-test
      let closeBtnRect = { x: W-26, y: 4, w: 20, h: 18 };
      // Damage Control UI global state reference (assignments persist)
      const dcState = (window.DamageControl = window.DamageControl || { mode: 0, team1: null, team2: null, cursorOn: false });
      // Per-HUD label rects for click hit-test
      let hudLabelRects = [];
      // Per-HUD turret icon rects for click hit-test
      let turretIconRects = [];
      // Small DOM menu for Team selection
      let repairMenuEl = null;
      function hideRepairMenu(){ try { if (repairMenuEl) { repairMenuEl.remove(); repairMenuEl = null; } } catch {} }
      function showRepairMenu(clientX, clientY, hitboxName){
        try {
          hideRepairMenu();
          const rect = container.getBoundingClientRect();
          const menu = document.createElement('div');
          menu.style.position = 'absolute';
          // initial position; will be clamped after measuring
          menu.style.left = Math.round(clientX - rect.left) + 'px';
          menu.style.top = Math.round(clientY - rect.top) + 'px';
          menu.style.background = 'rgba(0,0,0,0.75)';
          menu.style.color = '#eee';
          menu.style.font = '12px system-ui, sans-serif';
          menu.style.border = '1px solid rgba(255,255,255,0.2)';
          menu.style.borderRadius = '6px';
          menu.style.padding = '6px';
          menu.style.zIndex = '10';
          menu.style.backdropFilter = 'blur(2px)';
          // vertical layout, two stacked buttons, easy to read
          menu.style.display = 'block';
          menu.style.whiteSpace = 'normal';
          menu.style.visibility = 'hidden';
          const btn = (txt)=>{ const b=document.createElement('button'); b.textContent=txt; b.style.margin='2px 0'; b.style.display='block'; b.style.background='#2a3540'; b.style.color='#eee'; b.style.border='1px solid #4a5a6a'; b.style.borderRadius='4px'; b.style.padding='6px 10px'; b.style.fontSize='13px'; b.style.whiteSpace='nowrap'; b.style.cursor='pointer'; b.onmouseenter=()=>{b.style.background='#364554'}; b.onmouseleave=()=>{b.style.background='#2a3540'}; return b; };
          const t1 = btn('Send Damage Control Team 1');
          const t2 = btn('Send Damage Control Team 2');
          t1.addEventListener('click', ()=>{
            try {
              window.DamageControl.team1 = hitboxName;
              // Target the ship whose HUD we clicked in
              const sid = (container && container.dataset) ? container.dataset.shipId : '';
              window.DamageControl.team1ShipId = sid ? String(sid) : String(window.shipState && window.shipState.id);
            } catch {}
            hideRepairMenu();
          });
          t2.addEventListener('click', ()=>{
            try {
              window.DamageControl.team2 = hitboxName;
              const sid = (container && container.dataset) ? container.dataset.shipId : '';
              window.DamageControl.team2ShipId = sid ? String(sid) : String(window.shipState && window.shipState.id);
            } catch {}
            hideRepairMenu();
          });
          menu.appendChild(t1); menu.appendChild(t2);
          container.appendChild(menu);
          // After attach, size and clamp within container bounds
          try {
            // Measure natural width with nowrap to keep text on one line
            let mrect = menu.getBoundingClientRect();
            const pad = 6;
            let x = clientX - rect.left;
            let y = clientY - rect.top;
            let fs = 13;
            const maxWidth = rect.width - pad*2;
            // Calculate required width to keep both buttons on one line without wrapping
            let requiredWidth = menu.scrollWidth + 2; // natural content width
            // If required width exceeds container, reduce font slightly but keep >= 11px
            while (requiredWidth > maxWidth && fs > 11) {
              fs -= 1;
              menu.style.fontSize = fs + 'px';
              t1.style.fontSize = fs + 'px';
              t2.style.fontSize = fs + 'px';
              requiredWidth = menu.scrollWidth + 2;
            }
            // Set menu width to the needed width (capped to container)
            const finalWidth = Math.min(requiredWidth, maxWidth);
            menu.style.width = Math.round(finalWidth) + 'px';
            // Recompute rect with final width
            mrect = menu.getBoundingClientRect();
            // Prefer showing below the click; if it overflows bottom, place above
            if (y + mrect.height > rect.height - pad) {
              y = Math.max(pad, y - mrect.height - 8);
            }
            // Clamp horizontally inside container
            if (x + mrect.width > rect.width - pad) {
              // shift left so full menu fits
              x = Math.max(pad, rect.width - pad - mrect.width);
            }
            if (x < pad) x = pad;
            if (y < pad) y = pad;
            menu.style.left = Math.round(x) + 'px';
            menu.style.top  = Math.round(y) + 'px';
          } catch {}
          // reveal once positioned
          menu.style.visibility = 'visible';
          repairMenuEl = menu;
        } catch {}
      }

      // Parse TMX hitboxes (objectgroup names map to hitbox keys)
      const hitShapes = [];
      function parseTMX(xmlStr){
        try {
          const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
          const groups = [...doc.querySelectorAll('objectgroup')];
          groups.forEach(g => {
            const groupName = g.getAttribute('name');
            if (!groupName) return;
            // Include all groups; actual per-ship availability is filtered during draw via that ship's hitboxes
            const objs = [...g.querySelectorAll('object')];
            objs.forEach(o => {
              const ox = parseFloat(o.getAttribute('x')||'0');
              const oy = parseFloat(o.getAttribute('y')||'0');
              const w  = parseFloat(o.getAttribute('width')||'0');
              const h  = parseFloat(o.getAttribute('height')||'0');
              const polyEl = o.querySelector('polygon');
              if (polyEl) {
                const ptsAttr = polyEl.getAttribute('points')||'';
                const pts = ptsAttr.split(/\s+/).map(pair=>{
                  const [px,py] = pair.split(',').map(parseFloat);
                  return { x:(ox + (px||0))*sx, y:(oy + (py||0))*sy };
                });
                hitShapes.push({ type:'poly', name: groupName, pts });
              } else if (w && h) {
                hitShapes.push({ type:'rect', name: groupName, x: ox*sx, y: oy*sy, w: Math.max(1,w*sx), h: Math.max(1,h*sy) });
              } else {
                // Point hitbox
                hitShapes.push({ type:'point', name: groupName, x: ox*sx, y: oy*sy });
              }
            });
          });
        } catch {}
      }

      // Load TMX for the specific ship shown in this HUD
      function loadHudTmx(){
        try { hitShapes.length = 0; } catch {}
        let tmxUrl = 'assets/BSTMX.tmx';
        try {
          const ctxObj = getContext();
          const st = ctxObj && ctxObj.st ? ctxObj.st : {};
          const prof = ctxObj && ctxObj.prof ? ctxObj.prof : {};
          // DIRECT OVERRIDE: If this is ship ID 4, it's ALWAYS a Transport for TMX
          const ctxShipId = (ctxObj && ctxObj.container && ctxObj.container.dataset) ? String(ctxObj.container.dataset.shipId||'') : '';
          const isTransportByIdForTmx = (ctxShipId === '4');
          
          // EXPLICIT BISMARCK DETECTION FOR TMX - never let Bismarck use Transport TMX
          const isBismarckForTmx = (prof && prof.name && String(prof.name).toLowerCase().includes('bismarck')) ||
                                  (prof && prof.type && String(prof.type).toLowerCase().includes('bismarck')) ||
                                  (ctxShipId === '1' || ctxShipId === '2' || ctxShipId === '3'); // Player=1, Initial Bismarck=2, Other Bismarck=3+
          
          // Check multiple ways to detect Transport ships for TMX, BUT NEVER if it's a Bismarck
          const isTransportForTmx = !isBismarckForTmx && (isTransportByIdForTmx || (prof && prof.type && String(prof.type).toLowerCase() === 'transport'));

          // Cruiser (Prinz Eugen) detection for TMX
          const isCruiserForTmx = !isBismarckForTmx && (prof && (
            String(prof.type||'').toLowerCase() === 'cruiser' ||
            String(prof.name||'').toLowerCase().includes('prinz')
          ));
          
          console.log('=== TMX DETECTION DEBUG ===');
          console.log('Context ship ID:', ctxShipId);
          console.log('isTransportByIdForTmx (ID=4):', isTransportByIdForTmx);
          console.log('isBismarckForTmx:', isBismarckForTmx);
          console.log('Profile name:', prof?.name);
          console.log('Profile type detection:', prof?.type);
          console.log('Final isTransportForTmx:', isTransportForTmx);
          console.log('Final isCruiserForTmx:', isCruiserForTmx);
          
          if (isTransportForTmx) {
            // FORCE Transport TMX - NO FALLBACK to Bismarck
            tmxUrl = 'assets/transtmx.tmx';
            console.log('FORCED Transport TMX:', tmxUrl, 'for ship ID:', ctxShipId);
          } else if (isCruiserForTmx) {
            // FORCE Cruiser TMX - Prinz Eugen hitboxes
            tmxUrl = 'assets/prinztmx.tmx';
            console.log('FORCED Cruiser TMX:', tmxUrl, 'for ship ID:', ctxShipId);
          } else {
            // Keep default BSTMX.tmx for Battleships
            console.log('Loading Battleship TMX:', tmxUrl, 'for ship ID:', ctxShipId);
          }
          // For all other ships (Bismarck, etc.), use default BSTMX.tmx
        } catch {}
        fetch(tmxUrl).then(r=>r.text()).then(parseTMX).catch(()=>{});
      }
      loadHudTmx();
      // DO NOT add global hudRefresh listener - it causes all HUDs to reload with wrong assets

      function hbColor(hb){
        const dp = Math.max(0, Math.min(100, hb.damage_percent || 0));
        if (dp < 30) return 'rgba(40,200,60,0.8)';     // green
        if (dp <= 70) return 'rgba(240,160,40,0.85)';  // orange
        return 'rgba(230,40,40,0.9)';                   // red
      }
      function shouldFlash(hb){
        // Flash only when flooding is active AND damage is at least 50% for that compartment
        const floodActive = (hb && typeof hb.flood_level === 'number' ? hb.flood_level : 0) > 0;
        const damageP = hb && typeof hb.damage_percent === 'number' ? hb.damage_percent : 0;
        const floodFlash = floodActive && (damageP >= 50);
        const onFire = !!(hb && hb.on_fire) || ((window.shipProfile?.damage?.fire?.level_percent||0) > 0);
        return floodFlash || onFire;
      }
      // Cosmetic pretty name mapping for labels
      function prettyName(key){
        const map = {
          aa1: 'AA Battery 1', aa2: 'AA Battery 2',
          bow: 'Bow', bridge: 'Bridge',
          damagecontrol1: 'Damage Control 1', damagecontrol2: 'Damage Control 2',
          engine: 'Engine', funnel: 'Funnel',
          hullaft1: 'Hull Aft 1', hullaft2: 'Hull Aft 2',
          hullfore1: 'Hull Fore 1', hullfore2: 'Hull Fore 2', hullmid: 'Hull Mid',
          magazine: 'Magazine', prop: 'Prop Shaft', rangefinder: 'Rangefinder',
          rudder: 'Rudder', torpedotube1: 'Torpedo Tube 1', torpedotube2: 'Torpedo Tube 2',
          turret1: 'Turret 1', turret2: 'Turret 2', turret3: 'Turret 3', turret4: 'Turret 4',
        };
        if (map[key]) return map[key];
        // Fallback: Title Case words split by digits/underscores
        return key.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
      }

      // Compute top-of-HUD summary stats
      function getContext(){
        const id = (container && container.dataset) ? container.dataset.shipId : '';
        let prof = null, st = null;
        // CRITICAL: Check ShipHandlesById first (fastest lookup and works for both sides)
        try {
          if (id && window.ShipHandlesById && window.ShipHandlesById[id]) {
            const handle = window.ShipHandlesById[id];
            prof = handle.profile || null;
            st = handle.state || null;
          }
        } catch {}
        // Fallback: search IronTideFleet (friendly ships)
        try {
          if ((!prof || !st) && id && window.IronTideFleet && window.IronTideFleet.length) {
            const it = window.IronTideFleet.find(e => String(e.state && e.state.id) === String(id));
            if (it) { prof = it.profile || null; st = it.state || null; }
          }
        } catch {}
        // Fallback: search NPCs (enemy ships)
        try {
          if ((!prof || !st) && id && window.NPCs && window.NPCs.length) {
            const npc = window.NPCs.find(n => String(n.state && n.state.id) === String(id));
            if (npc) { prof = npc.profile || null; st = npc.state || null; }
          }
        } catch {}
        // Final fallback only if the requested id matches the current player id explicitly
        try {
          const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
          if ((!prof || !st) && id && playerId && id === playerId) {
            prof = window.shipProfile || prof;
            st = window.shipState || st;
          }
        } catch {}
        return { prof: prof || {}, st: st || {}, container };
      }

      // Compute effective min/max speeds for HUD from base state and effects
      function getEffectiveSpeedBounds(ctxObj){
        const st = ctxObj && ctxObj.st ? ctxObj.st : {};
        const eff = (st && st.effects) || {};
        const baseMin = (st && typeof st.SPEED_MIN === 'number') ? st.SPEED_MIN : -8;
        const baseMax = (st && typeof st.SPEED_MAX === 'number') ? st.SPEED_MAX : 30;
        const effMax = (typeof eff.speedCapKts === 'number') ? eff.speedCapKts : baseMax;
        // If we later add logic to reduce reverse/min speed, plug it here
        const effMin = baseMin;
        return { baseMin, baseMax, effMin, effMax };
      }

      function computeStats(){
        const ctxObj = getContext();
        const prof = ctxObj.prof || {};
        const eff = (ctxObj.st && ctxObj.st.effects) || {};
        const profName = prof.name || 'Unknown';
        const displayName = (ctxObj.st && ctxObj.st.displayName) || 'Battleship';
        const type = prof.type || 'Ship';
        const speed = Math.round(Math.abs((ctxObj.st && ctxObj.st.actualSpeedKts) || 0));
        const bounds = getEffectiveSpeedBounds(ctxObj);
        const minS = bounds.baseMin;
        const maxS = bounds.baseMax;
        const effMinS = bounds.effMin;
        const effMaxS = bounds.effMax;
        // Turning Ability: reflect actual turning capability => turnRateFactor * rudderEffectivenessScale
        const turnF  = Math.max(0, Math.min(1, eff.turnRateFactor != null ? eff.turnRateFactor : 1));
        const rudF   = Math.max(0, Math.min(1, eff.rudderEffectivenessScale != null ? eff.rudderEffectivenessScale : 1));
        const maneuvering = Math.round((turnF * rudF) * 100);
        // Access hitboxes and helper for HP percent
        const hbs = (prof.damage && prof.damage.hitboxes) || {};
        function hpPct(key){
          const hb = hbs[key];
          if (!hb) return 1;
          // Prefer explicit damage_percent if available to ensure 100% damage -> 0% health exactly
          if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) {
            return Math.max(0, Math.min(1, 1 - hb.damage_percent/100));
          }
          if (!hb.max_hp) return 1;
          return Math.max(0, Math.min(1, (typeof hb.hp === 'number' ? hb.hp : hb.max_hp) / hb.max_hp));
        }
        // Hull Integrity
        const hull = prof.damage && prof.damage.hullIntegrity;
        const hullPct = hull && hull.maxHP ? Math.round((hull.currentHP / hull.maxHP) * 100) : 100;
        // Flooding (HUD rule): six compartments contribute up to 20% each => cap displayed at 100%
        // Compartments: Bow, Hull Fore 1, Hull Fore 2, Hull Mid, Hull Aft 1, Hull Aft 2
        // Use damage percent for each as contribution (100% damage -> +20%)
        const floodKeys = ['bow','hullfore1','hullfore2','hullmid','hullaft1','hullaft2'];
        let flooding = 0;
        for (const key of floodKeys){
          const hb = hbs[key];
          if (!hb) continue;
          let dmgP;
          if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) {
            dmgP = hb.damage_percent;
          } else if (typeof hb.max_hp === 'number' && hb.max_hp > 0) {
            const hp = (typeof hb.hp === 'number') ? hb.hp : hb.max_hp;
            const hpP = Math.max(0, Math.min(1, hp / hb.max_hp));
            dmgP = Math.round((1 - hpP) * 100);
          } else {
            dmgP = 0;
          }
          const contrib = Math.max(0, Math.min(20, (dmgP / 100) * 20));
          flooding += contrib;
        }
        flooding = Math.round(Math.max(0, Math.min(100, flooding)));
        // Targeting Systems base: exclude rangefinder to avoid double-counting (it applies as up to -50% later)
        const rangefinderP = hpPct('rangefinder');
        const aa1P = hpPct('aa1'), aa2P = hpPct('aa2');
        const aaP = (aa1P + aa2P) / 2 || 1;
        const t1=hpPct('turret1'), t2=hpPct('turret2'), t3=hpPct('turret3'), t4=hpPct('turret4');
        const turretsP = (t1+t2+t3+t4)/4 || 1;
        let targetingBase = ((aaP + turretsP)/2);
        // Apply additive penalties from Rangefinder and Bridge damage: up to -50% each, summing to -100%
        const bridgeP = hpPct('bridge');
        const rfDamage = 1 - rangefinderP; // 0..1 damage
        const brDamage = 1 - bridgeP;      // 0..1 damage
        const totalRed = Math.max(0, Math.min(1, 0.5 * rfDamage + 0.5 * brDamage));
        const targeting = Math.round(Math.max(0, targetingBase * (1 - totalRed)) * 100);
        // Damage Control Efficiency
        const dcEff = eff && eff.repairEfficiency != null ? Math.round(Math.max(0, Math.min(1, eff.repairEfficiency)) * 100) : 100;
        // Fire percent (HUD rule): engine, bridge, magazine, turret1-4 each contribute up to 20% at 100% damage.
        // Turret contributions can be locked at 20% once a turret reaches 100% damage (state.fireLocks.turretN=true).
        let firePct = 0;
        try {
          const hbMap = (prof.damage && prof.damage.hitboxes) || {};
          const locks = (ctxObj.st && ctxObj.st.fireLocks) || {};
          const parts = [
            { key: 'engine', locked: false },
            { key: 'bridge', locked: false },
            { key: 'magazine', locked: false },
            { key: 'turret1', locked: !!locks.turret1 },
            { key: 'turret2', locked: !!locks.turret2 },
            { key: 'turret3', locked: !!locks.turret3 },
            { key: 'turret4', locked: !!locks.turret4 },
          ];
          for (const p of parts){
            const hb = hbMap[p.key];
            if (!hb) continue;
            let contrib;
            if (p.locked) {
              contrib = 20; // locked 20% regardless of current damage
            } else {
              const dp = Math.max(0, Math.min(100, typeof hb.damage_percent === 'number' ? hb.damage_percent : (hb.max_hp>0 ? Math.round((1 - (hb.hp/(hb.max_hp||hb.hp||1))) * 100) : 0)));
              contrib = Math.max(0, Math.min(20, (dp/100) * 20));
            }
            firePct += contrib;
          }
          firePct = Math.round(Math.max(0, Math.min(100, firePct)));
        } catch { firePct = 0; }
        return { profName, displayName, type, speed, minS, maxS, effMinS, effMaxS, maneuvering, hullPct, flooding, firePct, targeting, dcEff };
      }

      function draw(){
        ctx.clearRect(0,0,W,H);
        // Overlay hitboxes
        const ctxObj = getContext();
        const hitboxes = (ctxObj.prof && ctxObj.prof.damage && ctxObj.prof.damage.hitboxes) || {};
        const t = Date.now(); const flashOn = (Math.floor(t/350) % 2) === 0;
        ctx.save();
        ctx.lineWidth = 1;
        // Header stats at top
        const stats = computeStats();
        ctx.fillStyle = 'rgba(231,225,193,0.98)';
        ctx.font = 'bold 12px Orbitron, Arial, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const lineH = 14; let y = 4; const padX = 6;
        // Title on left: profile name (e.g., Bismarck) in brass | display name (e.g., Enemy Battleship 1) in red for enemies
        ctx.fillStyle = 'rgba(231,225,193,0.95)'; // brass for profile name
        ctx.fillText(stats.profName, padX, y);
        const profNameW = ctx.measureText(stats.profName).width;
        
        ctx.fillStyle = 'rgba(231,225,193,0.95)'; // brass for separator
        const separator = ' | ';
        ctx.fillText(separator, padX + profNameW, y);
        const sepW = ctx.measureText(separator).width;
        
        // Check if this is an enemy ship by looking at displayName
        const isEnemy = stats.displayName && stats.displayName.toLowerCase().includes('enemy');
        ctx.fillStyle = isEnemy ? 'rgba(220,60,60,0.98)' : 'rgba(231,225,193,0.95)'; // red for enemies, brass for friendlies
        ctx.fillText(stats.displayName, padX + profNameW + sepW, y);
        // Brass close button aligned right on same line
        const btnW = 20, btnH = 16; const btnPad = 6;
        const bx = W - btnPad - btnW; const by = y;
        closeBtnRect = { x: bx, y: by, w: btnW, h: btnH };
        // Draw brass button
        ctx.save();
        const grad = ctx.createLinearGradient(bx, by, bx, by+btnH);
        grad.addColorStop(0, '#d6c691');
        grad.addColorStop(0.45, '#bda66e');
        grad.addColorStop(0.46, '#9e8f5a');
        grad.addColorStop(1, '#7c6f46');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#bfa76a';
        ctx.lineWidth = 1;
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(bx+r, by);
        ctx.lineTo(bx+btnW-r, by);
        ctx.quadraticCurveTo(bx+btnW, by, bx+btnW, by+r);
        ctx.lineTo(bx+btnW, by+btnH-r);
        ctx.quadraticCurveTo(bx+btnW, by+btnH, bx+btnW-r, by+btnH);
        ctx.lineTo(bx+r, by+btnH);
        ctx.quadraticCurveTo(bx, by+btnH, bx, by+btnH-r);
        ctx.lineTo(bx, by+r);
        ctx.quadraticCurveTo(bx, by, bx+r, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // X mark
        ctx.strokeStyle = '#232c32'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx+5, by+4); ctx.lineTo(bx+btnW-5, by+btnH-4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx+btnW-5, by+4); ctx.lineTo(bx+5, by+btnH-4); ctx.stroke();
        ctx.restore();
        // Advance header line
        y += lineH;
        // Draw Speed line with colored min/max if reduced by damage
        (function(){
          const baseColor = 'rgba(231,225,193,0.98)';
          const warnColor = 'rgba(240,160,40,0.95)'; // orange
          const okColor = 'rgba(40,200,60,0.98)'; // green when moving
          ctx.fillStyle = baseColor;
          ctx.textAlign = 'left';
          let x = padX;
          const parts = [];
          const fmt = (n)=> (typeof n === 'number' ? (Math.round(n*10)/10).toFixed(1) : String(n));
          const minReduced = (typeof stats.effMinS === 'number') && (Math.abs(stats.effMinS - stats.minS) > 0.05);
          const maxReduced = (typeof stats.effMaxS === 'number') && ((stats.maxS - stats.effMaxS) > 0.05);
          parts.push({ text: 'Speed: ', color: baseColor });
          const moving = (typeof stats.speed === 'number') && (stats.speed > 0);
          parts.push({ text: `${fmt(stats.speed)} kts `, color: moving ? okColor : baseColor });
          parts.push({ text: '(min ', color: baseColor });
          parts.push({ text: String(minReduced ? fmt(stats.effMinS) : fmt(stats.minS)), color: minReduced ? warnColor : baseColor });
          parts.push({ text: ', ', color: baseColor });
          parts.push({ text: 'max ', color: maxReduced ? warnColor : baseColor });
          parts.push({ text: String(maxReduced ? fmt(stats.effMaxS) : fmt(stats.maxS)), color: maxReduced ? warnColor : baseColor });
          parts.push({ text: ')', color: baseColor });
          for (const p of parts){ ctx.fillStyle = p.color; ctx.fillText(p.text, x, y); x += ctx.measureText(p.text).width; }
          y += lineH;
        })();
        // Turning Ability row with colored %
        (function(){
          const baseColor = 'rgba(231,225,193,0.98)';
          const green = 'rgba(40,200,60,0.98)';
          const amber = 'rgba(240,160,40,0.98)';
          const red = 'rgba(230,40,40,0.98)';
          const pct = Math.max(0, Math.min(100, stats.maneuvering || 0));
          let pctColor = green;
          if (pct <= 29) pctColor = red; else if (pct <= 69) pctColor = amber; else pctColor = green;
          ctx.textAlign = 'left';
          // Label
          ctx.fillStyle = baseColor;
          const label = 'Turning Ability: ';
          ctx.fillText(label, padX, y);
          // Value in color
          const labelW = ctx.measureText(label).width;
          ctx.fillStyle = pctColor;
          ctx.fillText(`${pct}%`, padX + labelW, y);
          y += lineH;
        })();
        // Hull Integrity: label base, number green
        (function(){
          const baseColor = 'rgba(231,225,193,0.98)';
          const green = 'rgba(40,200,60,0.98)';
          const label = 'Hull Integrity: ';
          ctx.fillStyle = baseColor; ctx.textAlign='left';
          ctx.fillText(label, padX, y);
          const lw = ctx.measureText(label).width;
          ctx.fillStyle = green;
          ctx.fillText(`${stats.hullPct}%`, padX + lw, y);
          y += lineH;
        })();
        // Flooding and Fire on the same line with a brass divider (numbers green only)
        const baseColor = 'rgba(231,225,193,0.98)';
        const green = 'rgba(40,200,60,0.98)';
        const amber = 'rgba(240,160,40,0.98)';
        const red = 'rgba(230,40,40,0.98)';
        // Draw Flooding label + value
        const floodLabel = 'Flooding: ';
        ctx.fillStyle = baseColor; ctx.textAlign='left';
        ctx.fillText(floodLabel, padX, y);
        const floodLabelW = ctx.measureText(floodLabel).width;
        const floodValNum = Math.max(0, Math.min(100, stats.flooding||0));
        let floodColor = green; if (floodValNum >= 70) floodColor = red; else if (floodValNum >= 30) floodColor = amber;
        ctx.fillStyle = floodColor;
        const floodVal = `${floodValNum}%`;
        ctx.fillText(floodVal, padX + floodLabelW, y);
        const floodValW = ctx.measureText(floodVal).width;
        // Measure total left block width to position divider and Fire
        const floodW = floodLabelW + floodValW;
        const gap = 8;
        // Brass divider (vertical)
        const dvX = padX + floodW + gap;
        const dvY = y + 2;
        const dvH = 10;
        // Draw brass-looking line using same palette as mute/trim
        const g = ctx.createLinearGradient(dvX, dvY, dvX, dvY+dvH);
        g.addColorStop(0, '#d6c691'); g.addColorStop(0.5, '#9e8f5a'); g.addColorStop(1, '#7c6f46');
        ctx.fillStyle = g;
        ctx.fillRect(dvX, dvY, 2, dvH);
        // Fire label + value to the right of divider (no flashing; threshold colors like Flooding)
        const fireLabel = 'Fire: ';
        const fx = dvX + 2 + gap;
        ctx.fillStyle = baseColor; ctx.fillText(fireLabel, fx, y);
        const fireLabelW = ctx.measureText(fireLabel).width;
        const fireValNum = Math.max(0, Math.min(100, stats.firePct||0));
        let fireColor = green; if (fireValNum >= 70) fireColor = red; else if (fireValNum >= 30) fireColor = amber;
        ctx.fillStyle = fireColor; ctx.fillText(`${fireValNum}%`, fx + fireLabelW, y);
        y += lineH;
        // Targeting Systems: threshold colored number
        (function(){
          const baseColor = 'rgba(231,225,193,0.98)';
          const green = 'rgba(40,200,60,0.98)';
          const amber = 'rgba(240,160,40,0.98)';
          const red = 'rgba(230,40,40,0.98)';
          const val = Math.max(0, Math.min(100, stats.targeting||0));
          let col = green; if (val <= 29) col = red; else if (val <= 69) col = amber;
          const label = 'Targeting Systems: ';
          ctx.fillStyle = baseColor; ctx.textAlign='left';
          ctx.fillText(label, padX, y);
          const lw = ctx.measureText(label).width;
          ctx.fillStyle = col;
          ctx.fillText(`${val}%`, padX + lw, y);
          y += lineH;
        })();
        // Damage Control Efficiency: threshold colored number
        (function(){
          const baseColor = 'rgba(231,225,193,0.98)';
          const green = 'rgba(40,200,60,0.98)';
          const amber = 'rgba(240,160,40,0.98)';
          const red = 'rgba(230,40,40,0.98)';
          const val = Math.max(0, Math.min(100, stats.dcEff||0));
          let col = green; if (val <= 29) col = red; else if (val <= 69) col = amber;
          const label = 'Damage Control Efficiency: ';
          ctx.fillStyle = baseColor; ctx.textAlign='left';
          ctx.fillText(label, padX, y);
          const lw = ctx.measureText(label).width;
          ctx.fillStyle = col;
          ctx.fillText(`${val}%`, padX + lw, y);
          y += lineH;
        })();
        // Leave a small gap below header
        const headerBottom = y + 2;
        // Rendering scale for ship and overlays (shrink by 25%)
        const S = 0.75;
        const offX = (W - W * S) / 2;
        const offY = headerBottom + ((H - headerBottom) - (H * S)) / 2;
        // First draw: base ship image scaled and clipped below header
        // Clip drawing to area below header so image/overlays don't overlap stats
        ctx.save();
        ctx.beginPath(); ctx.rect(0, headerBottom, W, H - headerBottom); ctx.clip();
        if (imgLoaded) {
          ctx.globalAlpha = 1.0;
          ctx.drawImage(shipImg, offX, offY, W * S, H * S);
        }
        // First pass: draw filled hitbox overlays only (no labels)
        hitShapes.forEach(s=>{
          const hb = hitboxes[s.name]; if (!hb) return;
          let color = hbColor(hb);
          if (shouldFlash(hb) && flashOn) color = 'rgba(255,40,40,0.95)';
          ctx.strokeStyle = 'rgba(0,0,0,0.9)';
          ctx.fillStyle = color;
          if (s.type === 'rect'){
            const rx = offX + S * s.x;
            const ry = offY + S * s.y;
            const rw = Math.max(1, S * s.w);
            const rh = Math.max(1, S * s.h);
            ctx.globalAlpha = 0.35; ctx.fillRect(rx, ry, rw, rh);
            ctx.globalAlpha = 1.0; ctx.strokeRect(rx, ry, rw, rh);
          } else if (s.type === 'poly'){
            ctx.beginPath();
            for (let i=0;i<s.pts.length;i++){
              const p = s.pts[i];
              const px = offX + S * p.x;
              const py = offY + S * p.y;
              if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
            }
            ctx.closePath();
            ctx.globalAlpha = 0.35; ctx.fill();
            ctx.globalAlpha = 1.0; ctx.stroke();
          } else if (s.type === 'point'){
            const r = 5; const px = offX + S * s.x, py = offY + S * s.y;
            ctx.globalAlpha=0.35; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1.0; ctx.stroke();
          }
        });
        // Draw turret status icons (actual turret PNG) only for ships that have turrets
        try {
          const ctxObj2 = getContext();
          const hbMap = (ctxObj2.prof && ctxObj2.prof.damage && ctxObj2.prof.damage.hitboxes) || {};
          const isTransportHud = ((ctxObj2.prof && ctxObj2.prof.type) ? String(ctxObj2.prof.type).toLowerCase() : '') === 'transport';
          const hasAnyTurret = !!(hbMap.turret1 || hbMap.turret2 || hbMap.turret3 || hbMap.turret4);
          const shouldDrawTurrets = !isTransportHud && hasAnyTurret;
          if (!shouldDrawTurrets) { turretIconRects = []; }
          if (shouldDrawTurrets) {
            // Always render 4 turret icons in order 1..4
            const keys = ['turret1','turret2','turret3','turret4'];
            const padX = 8; // from image edge (right)
            const padY = 12; // extra top spacing so icons don't touch the ship image
            const gap = 6; // between icons
            const iconH = 28; // 25% bigger than original (22 * 1.25 = 27.5 â‰ˆ 28)
            // Compute icon width preserving turret PNG aspect
            const tAspect = turretImg && turretImg.height ? (turretImg.width / turretImg.height) : 1.8;
            const iconW = Math.round(iconH * tAspect);
            // Total row width aligned to right edge of the HUD window (canvas width)
            const totalW = keys.length * iconW + Math.max(0, keys.length - 1) * gap;
            const rowX0 = W - padX - totalW; // right-aligned to HUD window
            const extraPct = Math.round(H * 0.01); // ~1% of HUD height
// Shift turret header/icons down ONLY for Cruiser HUD; keep Battleship at original position
const hudType = (ctxObj2.prof && ctxObj2.prof.type) ? String(ctxObj2.prof.type).toLowerCase() : '';
const isCruiserHud = hudType === 'cruiser';
const turretYOffset = isCruiserHud ? 70 : 0;
const rowY = headerBottom + padY + 8 + extraPct + turretYOffset; // shifted down by 70px
            turretIconRects = [];
            // Label above the row, right-aligned
            ctx.save();
            ctx.font = 'bold 12px Orbitron, Arial, sans-serif';
            ctx.fillStyle = 'rgba(231,225,193,0.92)';
            ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          // Move label down only for Cruiser; Battleship retains original label position
          const labelYOffset = isCruiserHud ? 70 : 0;
          const labelY = headerBottom + padY + 8 + labelYOffset;
          ctx.fillText('Turrets', rowX0 + totalW, labelY);
          ctx.restore();
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const x = rowX0 + i * (iconW + gap);
            const y = rowY;
            ctx.save();
            // Base tile backdrop to ensure visibility over ship art
            const hb = hbMap[key];
            const dp = hb && typeof hb.damage_percent === 'number' ? Math.max(0, Math.min(100, hb.damage_percent)) : 0;
            const isOnFire = !!(hb && hb.on_fire);
            const severeDam = dp >= 70;
            if ((isOnFire || severeDam) && flashOn) {
              // Flash red border/fill when turret is on fire
              ctx.fillStyle = 'rgba(230,40,40,0.25)';
              ctx.strokeStyle = 'rgba(230,40,40,0.9)';
              ctx.lineWidth = 2;
            } else {
              ctx.fillStyle = 'rgba(20,26,30,0.55)';
              ctx.strokeStyle = '#bfa76a';
              ctx.lineWidth = 1;
            }
            ctx.beginPath(); ctx.rect(x, y, iconW, iconH); ctx.fill(); ctx.stroke();
            // Actual turret sprite
            if (turretImg) {
              const prevSmoothT = ctx.imageSmoothingEnabled;
              const prevQualT = ctx.imageSmoothingQuality;
              ctx.imageSmoothingEnabled = true;
              try { ctx.imageSmoothingQuality = 'high'; } catch {}
              ctx.drawImage(turretImg, x + 1, y + 1, iconW - 2, iconH - 2);
              ctx.imageSmoothingEnabled = prevSmoothT;
              try { ctx.imageSmoothingQuality = prevQualT; } catch {}
            } else {
              // Fallback glyph
              ctx.strokeStyle = '#e7e1c1'; ctx.lineWidth = 1;
              ctx.strokeRect(x + 3, y + 4, iconW - 6, iconH - 8);
              ctx.beginPath();
              ctx.moveTo(x + iconW/2 - 2, y + 2);
              ctx.lineTo(x + iconW/2 - 2, y + 8);
              ctx.moveTo(x + iconW/2 + 2, y + 2);
              ctx.lineTo(x + iconW/2 + 2, y + 8);
              ctx.stroke();
            }
            // Damage fill (red rising from bottom inside the icon box)
            // dp already computed above
            if (dp > 0) {
              const fillH = Math.round((dp / 100) * (iconH - 2));
              const fy = y + (iconH - 1) - fillH;
              ctx.fillStyle = 'rgba(230,40,40,0.7)';
              ctx.fillRect(x + 1, fy, iconW - 2, fillH);
            }
            if (dp >= 100) {
              ctx.fillStyle = 'rgba(160,160,160,0.6)';
              ctx.fillRect(x + 1, y + 1, iconW - 2, iconH - 2);
            }
            // Small damage percentage label centered just below each turret icon
            try {
              ctx.save();
              ctx.font = '10px Orbitron, Arial, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              // Brass-like color for consistency with HUD accents
              ctx.fillStyle = 'rgba(231,225,193,0.95)';
              const tx = Math.round(x + iconW / 2);
              const ty = Math.round(y + iconH + 2);
              ctx.fillText(`${dp}%`, tx, ty);
              ctx.restore();
            } catch {}
            ctx.restore();
            turretIconRects.push({ name: key, x, y, w: iconW, h: iconH });
          }
          // Close conditional turret drawing block
          }
        } catch {}
        ctx.restore();
        // Second pass: compute centroids and draw connector lines + side labels
        ctx.globalAlpha = 1.0;
        ctx.font = '11px Orbitron, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        const leftLabels = [], rightLabels = [];
        // reset label rects before layout
        hudLabelRects = [];
        hitShapes.forEach(s=>{
          const hb = hitboxes[s.name]; if (!hb) return;
          // centroid
          let cx, cy;
          if (s.type === 'rect') { cx = s.x + s.w/2; cy = s.y + s.h/2; }
          else if (s.type === 'poly') { cx = 0; cy = 0; s.pts.forEach(p=>{ cx+=p.x; cy+=p.y; }); cx/=s.pts.length; cy/=s.pts.length; }
          else { cx = s.x; cy = s.y; }
          // scale and offset centroid to match shrunken render
          cx = offX + S * cx;
          cy = offY + S * cy;
          // keep labels below header area
          cy = Math.max(cy, headerBottom + 6);
          const side = (cx < W/2) ? 'left' : 'right';
          // Display as whole numbers only (floor so countdown reaches 0)
          const dp = Math.floor(Math.max(0, Math.min(100, hb.damage_percent || 0)));
          let color = hbColor(hb);
          if (shouldFlash(hb) && flashOn) color = 'rgba(255,40,40,0.95)';
          const item = { name: s.name, dp, cx, cy, side, color };
          if (side === 'left') leftLabels.push(item); else rightLabels.push(item);
        });
        // stack labels to avoid overlap per side
        function layout(list, isLeft){
          list.sort((a,b)=> a.cy - b.cy);
          const minGap = 14;
          let lastY = 10;
          for (let i=0;i<list.length;i++){
            let y = Math.max(lastY, Math.min(H-10, list[i].cy));
            list[i].ly = y;
            list[i].lx = isLeft ? 10 : (W - 10);
            lastY = y + minGap;
          }
        }
        layout(leftLabels, true);
        layout(rightLabels, false);
        // draw connectors and labels
        function drawLabels(list, isLeft){
          ctx.textAlign = isLeft ? 'left' : 'right';
          list.forEach(it=>{
            const color = it.color;
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            // connector line
            ctx.beginPath();
            ctx.moveTo(it.cx, it.cy);
            // draw only a short stub away from the hitbox toward the label side
            // 5x longer than previous by default, with per-hitbox adjustments
            // Defaults
            let stub = 60; // px
            // Keep Damage Control extra short
            if (it.name === 'damagecontrol1' || it.name === 'damagecontrol2') {
              stub = 12;
            } else if (/^hull/.test(it.name)) {
              // Hull hitboxes shorter by 30%
              stub = Math.round(60 * 0.7); // 42
            } else if (/^aa/.test(it.name)) {
              // AA shorter by 30%
              stub = Math.round(60 * 0.7); // 42
            } else if (it.name === 'rangefinder') {
              // Rangefinder shorter by 40%
              stub = Math.round(60 * 0.6); // 36
            } else if (it.name === 'prop') {
              // Prop shaft shorter by 20%
              stub = Math.round(60 * 0.8); // 48
            } else if (it.name === 'rudder') {
              // Rudder shorter by 20%
              stub = Math.round(60 * 0.8); // 48
            }
            const endX = it.cx + (isLeft ? -stub : stub);
            ctx.lineTo(endX, it.cy);
            ctx.stroke();
            // label text
            const label = `${prettyName(it.name)} ${it.dp}%`;
            ctx.font = '11px Orbitron, Arial, sans-serif';
            const padding = 4;
            const tx = isLeft ? (it.lx + 2 + padding) : (it.lx - 2 - padding);
            ctx.fillText(label, tx, it.ly);
            // store label clickable rect (approximate)
            const tw = ctx.measureText(label).width;
            const th = 12; // approx line height
            const lx0 = isLeft ? tx : (tx - tw);
            const ly0 = it.ly - th/2;
            hudLabelRects.push({ name: it.name, x: lx0, y: ly0, w: tw, h: th });
          });
        }
        drawLabels(leftLabels, true);
        drawLabels(rightLabels, false);
        // Instruction: only when there's at least one repairable hitbox
        try {
          let hasRepairable = false;
          for (const k in hitboxes) {
            const hb = hitboxes[k];
            if (!hb || typeof hb.max_hp !== 'number') continue;
            const maxhp = hb.max_hp;
            const cur = typeof hb.hp === 'number' ? hb.hp : maxhp;
            if (cur < maxhp) { hasRepairable = true; break; }
          }
          if (hasRepairable) {
            ctx.save();
            ctx.font = 'bold 12px Orbitron, Arial, sans-serif';
            ctx.fillStyle = 'rgba(231,225,193,0.92)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('Click To Repair', Math.floor(W/2), H - 6);
            ctx.restore();
          }
        } catch {}
        ctx.restore();
      }
      // Refresh regularly; HUD is small so light cost
      setInterval(draw, 250);
      // Click handler for close button and hitbox/label selection to open repair menu
      canvas.addEventListener('click', (e)=>{
        try {
          const rect = canvas.getBoundingClientRect();
          const rx = e.clientX - rect.left; const ry = e.clientY - rect.top;
          // Map to canvas coordinate space to account for CSS transforms (e.g., mobile scale)
          const scaleX = rect.width ? (canvas.width / rect.width) : 1;
          const scaleY = rect.height ? (canvas.height / rect.height) : 1;
          const x = rx * scaleX; const y = ry * scaleY;
          if (x >= closeBtnRect.x && x <= closeBtnRect.x + closeBtnRect.w && y >= closeBtnRect.y && y <= closeBtnRect.y + closeBtnRect.h) {
            container.style.display = 'none';
            hideRepairMenu();
            return;
          }
          // Click to repair flow: clicking a damaged hitbox overlay or its label opens a Team choice menu
          const ctxObj = getContext();
          const hitboxes = (ctxObj.prof && ctxObj.prof.damage && ctxObj.prof.damage.hitboxes) || {};
          // turret icons first
          for (let i=0;i<turretIconRects.length;i++){
            const r = turretIconRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              const sel = r.name;
              const hb = hitboxes[sel];
              if (hb) {
                const maxhp = hb.max_hp || 0; const hp = hb.hp != null ? hb.hp : maxhp;
                const dp = (typeof hb.damage_percent === 'number')
                  ? Math.max(0, Math.min(100, hb.damage_percent))
                  : (maxhp > 0 ? Math.max(0, Math.min(100, 100 - Math.round((hp / maxhp) * 100))) : 0);
                const destroyed = (maxhp > 0 && hp <= 0) || dp >= 100 || !!hb.destroyed;
                if (destroyed) { hideRepairMenu(); return; }
                const damaged = maxhp > 0 && hp < maxhp;
                if (damaged) { showRepairMenu(e.clientX, e.clientY, sel); } else { hideRepairMenu(); }
                return;
              }
            }
          }
          // hit-test labels first for ease
          let selName = null;
          for (let i=0;i<hudLabelRects.length;i++){
            const r = hudLabelRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { selName = r.name; break; }
          }
          // If not from label, try hitbox overlay hit-test
          if (!selName) {
            // Recreate same transform offsets used in draw()
            const lineH = 14; let yTop = 4; yTop += lineH*7; // 7 lines including headers above before headerBottom calc
            const headerBottom = yTop + 2;
            const S = 0.7; const offX = (W - W * S) / 2; const offY = headerBottom + ((H - headerBottom) - (H * S)) / 2;
            for (let i=0;i<hitShapes.length;i++){
              const s = hitShapes[i]; const hb = hitboxes[s.name]; if (!hb) continue;
              if (s.type === 'rect'){
                const rx0 = offX + S * s.x; const ry0 = offY + S * s.y; const rw = Math.max(1, S * s.w); const rh = Math.max(1, S * s.h);
                if (x >= rx0 && x <= rx0+rw && y >= ry0 && y <= ry0+rh) { selName = s.name; break; }
              } else if (s.type === 'poly'){
                // point-in-polygon test
                let inside = false;
                for (let j=0,k=s.pts.length-1;j<s.pts.length;k=j++){
                  const pj = s.pts[j], pk = s.pts[k];
                  const pxj = offX + S * pj.x, pyj = offY + S * pj.y;
                  const pxk = offX + S * pk.x, pyk = offY + S * pk.y;
                  const intersect = ((pyj>y)!=(pyk>y)) && (x < (pxk-pxj)*(y-pyj)/(pyk-pyj+1e-6)+pxj);
                  if (intersect) inside = !inside;
                }
                if (inside) { selName = s.name; break; }
              } else if (s.type === 'point'){
                const px0 = offX + S * s.x, py0 = offY + S * s.y; const rr = 6;
                if (Math.abs(x-px0) <= rr && Math.abs(y-py0) <= rr) { selName = s.name; break; }
              }
            }
          }
          if (selName && hitboxes[selName]){
            const hb = hitboxes[selName];
            const maxhp = hb.max_hp || 0; const hp = hb.hp != null ? hb.hp : maxhp;
            const damaged = maxhp > 0 && hp < maxhp;
            if (damaged) {
              showRepairMenu(e.clientX, e.clientY, selName);
            } else {
              hideRepairMenu();
            }
            return;
          }
          // clicking elsewhere inside HUD hides menu
          hideRepairMenu();
        } catch {}
      });
      // Mobile-only tap handler for close button (coarse pointer devices)
      try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
          canvas.addEventListener('touchstart', (e) => {
            try {
              const t = e.touches && e.touches[0];
              if (!t) return;
              const rect = canvas.getBoundingClientRect();
              const rx = t.clientX - rect.left; const ry = t.clientY - rect.top;
              // Map to canvas coordinate space to account for CSS transforms (e.g., mobile scale)
              const scaleX = rect.width ? (canvas.width / rect.width) : 1;
              const scaleY = rect.height ? (canvas.height / rect.height) : 1;
              const x = rx * scaleX; const y = ry * scaleY;
              // Slightly expand hit area on touch for usability
              const pad = 6;
              if (x >= (closeBtnRect.x - pad) && x <= (closeBtnRect.x + closeBtnRect.w + pad) && y >= (closeBtnRect.y - pad) && y <= (closeBtnRect.y + closeBtnRect.h + pad)) {
                e.preventDefault();
                container.style.display = 'none';
                hideRepairMenu();
              }
            } catch {}
          }, { passive: false });
          // Pointer Events: handle touch pointer as well (some browsers prefer this path)
          canvas.addEventListener('pointerdown', (e) => {
            try {
              if (e.pointerType !== 'touch') return;
              const rect = canvas.getBoundingClientRect();
              const rx = e.clientX - rect.left; const ry = e.clientY - rect.top;
              const scaleX = rect.width ? (canvas.width / rect.width) : 1;
              const scaleY = rect.height ? (canvas.height / rect.height) : 1;
              const x = rx * scaleX; const y = ry * scaleY;
              const pad = 6;
              if (x >= (closeBtnRect.x - pad) && x <= (closeBtnRect.x + closeBtnRect.w + pad) && y >= (closeBtnRect.y - pad) && y <= (closeBtnRect.y + closeBtnRect.h + pad)) {
                e.preventDefault();
                container.style.display = 'none';
                try { container.dataset.shipId = ''; } catch {}
                hideRepairMenu();
              }
            } catch {}
          }, { passive: false });
        }
      } catch {}
      // Hide repair menu on any click outside the HUD container
      document.addEventListener('click', (e)=>{
        try {
          if (!container) return;
          if (e.target === canvas || container.contains(e.target)) return;
          hideRepairMenu();
        } catch {}
      });
      
      // Track which ship ID this HUD was last initialized for
      try {
        const currentShipId = String(container.dataset.shipId || '');
        container.dataset.lastInitializedShipId = currentShipId;
        console.log('HUD initialized and tracked for ship ID:', currentShipId);
      } catch {}
    }

  // Hover pointer + click handlers to open HUDs for player (left) and NPC (right)
  try {
    const gameCanvas = document.getElementById('gameCanvas');
    if (gameCanvas && !gameCanvas.__shipHudInputBound__) {
      // Helper to compute current drawn ship height in world units
      function currentShipWorldSize(){
        const vr = currentViewRect || getViewRect();
        const scale = vr.scale || 1;
        const targetHBase = 96;
        const targetHScreen = Math.round(targetHBase * (zoomOutSlider.value || 1));
        const worldH = Math.max(1, targetHScreen / scale);
        const aspect = shipImg ? (shipImg.width / shipImg.height) : 1.0;
        const worldW = Math.round(worldH * aspect);
        return { worldW, worldH };
      }
      function overPlayerShip(wx, wy){
        const sz = currentShipWorldSize();
        const r = Math.max(sz.worldH, sz.worldW) * 0.55; // cover the whole sprite
        const dx = wx - ship.x; const dy = wy - ship.y;
        return Math.hypot(dx, dy) <= r;
      }
      function overNpcShip(wx, wy){
        if (!npc1 || !npc1.state || !npc1.state.ship) return false;
        const sz = currentShipWorldSize();
        const r = Math.max(sz.worldH, sz.worldW) * 0.55;
        const dx = wx - npc1.state.ship.x; const dy = wy - npc1.state.ship.y;
        return Math.hypot(dx, dy) <= r;
      }
      // Friendly fleet ship hit-test (for any ship in IronTideFleet apart from the player sprite)
      function overFleetShip(wx, wy){
        try {
          if (!Array.isArray(window.IronTideFleet) || !window.IronTideFleet.length) return null;
          // Use same hit radius logic as NPCs for consistent clicking across all fleets
          const vr = currentViewRect || getViewRect();
          const scale = vr.scale || 1;
          const targetHBase = 96;
          const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
          const r = Math.max(1, targetHScreen / scale) * 0.9;
          let best = null; let bestD = 1e12;
          const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
          for (let i=0;i<window.IronTideFleet.length;i++){
            const h = window.IronTideFleet[i];
            if (!h || !h.state || !h.state.ship) continue;
            // Skip the main player sprite which is handled by overPlayerShip
            const hid = (h.state.id != null) ? String(h.state.id) : '';
            if (pid && hid && pid === hid) continue;
            const dx = wx - h.state.ship.x; const dy = wy - h.state.ship.y;
            const d = Math.hypot(dx, dy);
            if (d <= r && d < bestD) { best = h; bestD = d; }
          }
          return best; // returns the fleet handle or null
        } catch { return null; }
      }
      // Cursor change on hover
      gameCanvas.addEventListener('mousemove', (e) => {
        try {
          if (window.DamageControl && window.DamageControl.mode !== 0) { gameCanvas.style.cursor = window.SpannerCursor || 'crosshair'; return; }
          const rect = gameCanvas.getBoundingClientRect();
          const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
          const w = screenToWorld(sx, sy);
          const onShip = overPlayerShip(w.x, w.y) || overNpcShip(w.x, w.y) || !!overFleetShip(w.x, w.y);
          gameCanvas.style.cursor = onShip ? 'pointer' : '';
        } catch { gameCanvas.style.cursor = ''; }
      });
      // Click toggles HUDs: player -> left only, NPC -> right only
      gameCanvas.addEventListener('click', (e) => {
        try {
          const rect = gameCanvas.getBoundingClientRect();
          const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
          const w = screenToWorld(sx, sy);
          const hudL = document.getElementById('shipHud');
          const hudR = document.getElementById('shipHudRight');
          // If firing solution target pin is active (placing or currently set), do not open ship HUDs yet
          const solutionActive = !!(typeof firingSolution === 'object' && firingSolution && (firingSolution.placing || firingSolution.target));
          if (solutionActive) return;

          // First: try NPC under cursor (ENEMY ONLY) and toggle right HUD
          if (Array.isArray(window.NPCs) && window.NPCs.length) {
            const vr = currentViewRect || getViewRect();
            const scale = vr.scale || 1;
            const targetHBase = 96;
            const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
            const worldH = Math.max(1, targetHScreen / scale);
            const hitR = worldH * 0.9;
            let best = null; let bestD = 1e12;
            for (let i=0;i<window.NPCs.length;i++){
              const n = window.NPCs[i];
              if (!n || !n.state || !n.state.ship) continue;
              // Skip FRIENDLY NPCs here; they will be handled by the friendly ship block to avoid left HUD conflicts
              const pside = (n.state && n.state.side) ? String(n.state.side).toLowerCase() : ((n.profile && n.profile.side) ? String(n.profile.side).toLowerCase() : '');
              if (pside !== 'enemy') continue;
              const dx = w.x - n.state.ship.x; const dy = w.y - n.state.ship.y;
              const d = Math.hypot(dx, dy);
              if (d <= hitR && d < bestD) { best = n; bestD = d; }
            }
            if (best && hudR) {
              const idStr = String(best.state.id);
              // Use Multi-HUD system for NPC clicks
              if (typeof window.showHudForShip === 'function') {
                // Check if this HUD is already showing for this ship
                const isCurrentlyShowing = hudR.style.display === 'block' && hudR.dataset.shipId === idStr;
                if (isCurrentlyShowing) {
                  // Hide all HUDs (toggle off)
                  window.hideAllHuds();
                } else {
                  // Show this ship's HUD
                  window.showHudForShip(idStr);
                }
              } else {
                // Fallback to old system
                const isOpenSame = hudR.style.display === 'block' && hudR.dataset.shipId === idStr;
                if (isOpenSame) {
                  hudR.style.display = 'none';
                  try { hudR.dataset.shipId = ''; } catch {}
                } else {
                  try { 
                    hudR.dataset.shipId = idStr; 
                    console.log('SET HUD FOR NPC SHIP ID:', idStr);
                  } catch {}
                  hudR.style.display = 'block';
                  try { initShipHudFor('shipHudRight', 'shipHudCanvasRight'); } catch {}
                }
              }
              return; // handled NPC click
            }
          }

          // Next: try friendly ships in ANY fleet (non-player). Transports open LEFT TRANSPORT HUD; others toggle RIGHT HUD
          try {
            const fh = (function overFriendlyAny(wx, wy){
              try {
                const vr = currentViewRect || getViewRect();
                const scale = vr.scale || 1;
                const targetHBase = 96;
                const targetHScreen = Math.round(targetHBase * (zoomOutSlider ? zoomOutSlider.value : 1));
                const r = Math.max(1, targetHScreen / scale) * 0.9;
                let best = null; let bestD = 1e12;
                const pid = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
                // Scan IronTideFleet first
                if (Array.isArray(window.IronTideFleet)) {
                  for (const h of window.IronTideFleet){
                    if (!h || !h.state || !h.state.ship) continue;
                    const hid = (h.state.id != null) ? String(h.state.id) : '';
                    if (pid && hid && pid === hid) continue; // skip player
                    const side = (h.state && h.state.side) ? String(h.state.side).toLowerCase() : ((h.profile && h.profile.side) ? String(h.profile.side).toLowerCase() : 'friendly');
                    if (side !== 'friendly') continue;
                    const dx = wx - h.state.ship.x; const dy = wy - h.state.ship.y;
                    const d = Math.hypot(dx, dy);
                    if (d <= r && d < bestD) { best = h; bestD = d; }
                  }
                }
                // Also scan friendly NPCs (e.g., transports or ships moved to other fleets)
                if (!best && Array.isArray(window.NPCs)){
                  for (const n of window.NPCs){
                    if (!n || !n.state || !n.state.ship) continue;
                    const side = (n.state && n.state.side) ? String(n.state.side).toLowerCase() : ((n.profile && n.profile.side) ? String(n.profile.side).toLowerCase() : '');
                    if (side !== 'friendly') continue;
                    const hid = (n.state.id != null) ? String(n.state.id) : '';
                    if (pid && hid && pid === hid) continue;
                    const dx = wx - n.state.ship.x; const dy = wy - n.state.ship.y;
                    const d = Math.hypot(dx, dy);
                    if (d <= r && d < bestD) { best = n; bestD = d; }
                  }
                }
                return best;
              } catch { return null; }
            })(w.x, w.y);
            if (fh && fh.state && fh.state.id != null && hudR) {
              const idStr = String(fh.state.id);
              // If this is a TRANSPORT, open on LEFT HUD independently
              const isTransport = !!(fh.profile && typeof fh.profile.type === 'string' && fh.profile.type.toLowerCase() === 'transport');
              if (isTransport) {
                const hudLT = document.getElementById('shipHudLeftTransport');
                const isCurrentlyShowingLeft = hudLT && hudLT.style.display === 'block' && hudLT.dataset.shipId === idStr;
                if (isCurrentlyShowingLeft) {
                  // Toggle off left transport HUD
                  hudLT.style.display = 'none';
                  try { hudLT.dataset.shipId = ''; } catch {}
                  console.log('Hidden LEFT HUD for transport ID:', idStr);
                } else {
                  // Show transport HUD on LEFT TRANSPORT container (do NOT touch right HUDs)
                  if (hudLT) {
                    // Hide the player left HUD to avoid overlap/conflict
                    const hudLPlayer = document.getElementById('shipHud');
                    if (hudLPlayer) { hudLPlayer.style.display = 'none'; try { hudLPlayer.dataset.shipId = ''; } catch {} }

                    hudLT.dataset.shipId = idStr;
                    hudLT.style.display = 'block';
                    // Initialize if needed
                    try {
                      if (!window.__leftTransportHudInit) {
                        initShipHudFor('shipHudLeftTransport', 'shipHudCanvasLeftTransport');
                        window.__leftTransportHudInit = true;
                      }
                    } catch {}
                    console.log('Shown LEFT Transport HUD for ID:', idStr);
                  }
                }
                return; // handled transport click
              }

              // Otherwise, use Multi-HUD system for fleet ship clicks on RIGHT
              if (typeof window.showHudForShip === 'function') {
                // Check if this HUD is already showing for this ship
                const isCurrentlyShowing = hudR.style.display === 'block' && hudR.dataset.shipId === idStr;
                if (isCurrentlyShowing) {
                  // Hide all HUDs (toggle off)
                  window.hideAllHuds();
                } else {
                  // Show this ship's HUD
                  window.showHudForShip(idStr);
                }
              } else {
                // Fallback to old system
                const isOpenSame = hudR.style.display === 'block' && hudR.dataset.shipId === idStr;
                if (isOpenSame) {
                  hudR.style.display = 'none';
                  try { hudR.dataset.shipId = ''; } catch {}
                } else {
                  try { 
                    hudR.dataset.shipId = idStr; 
                    console.log('SET HUD FOR FLEET SHIP ID:', idStr);
                  } catch {}
                  hudR.style.display = 'block';
                  try { initShipHudFor('shipHudRight', 'shipHudCanvasRight'); } catch {}
                }
              }
              return; // handled friendly fleet click
            }
          } catch {}

          // Next: toggle player HUD on left if clicking player sprite (transport uses dedicated LEFT transport HUD)
          if (overPlayerShip(w.x, w.y)) {
            const shipId = (window.shipState && window.shipState.id) ? String(window.shipState.id) : '1';
            console.log('=== PLAYER SHIP CLICKED ===');
            console.log('Player ship ID:', shipId);
            
            // If player ship is a TRANSPORT, use the LEFT TRANSPORT HUD to avoid conflicts with Bismarck HUD
            const isPlayerTransport = !!(window.shipProfile && typeof window.shipProfile.type === 'string' && window.shipProfile.type.toLowerCase() === 'transport');
            if (isPlayerTransport) {
              const hudLT = document.getElementById('shipHudLeftTransport');
              if (hudLT) {
                const isShowingLT = hudLT.style.display === 'block' && hudLT.dataset.shipId === shipId;
                if (isShowingLT) {
                  hudLT.style.display = 'none';
                  hudLT.dataset.shipId = '';
                  console.log('Hidden LEFT Transport HUD (player transport)');
                } else {
                  // Hide player left HUD to prevent conflict
                  if (hudL) { hudL.style.display = 'none'; try { hudL.dataset.shipId = ''; } catch {} }
                  hudLT.dataset.shipId = shipId;
                  hudLT.style.display = 'block';
                  try {
                    if (!window.__leftTransportHudInit) {
                      initShipHudFor('shipHudLeftTransport', 'shipHudCanvasLeftTransport');
                      window.__leftTransportHudInit = true;
                    }
                  } catch {}
                  console.log('Showed LEFT Transport HUD for player transport');
                }
              }
              return;
            }

            // Player HUD is independent - don't touch right HUDs (non-transport)
            if (hudL) {
              const isCurrentlyShowing = hudL.style.display === 'block' && hudL.dataset.shipId === shipId;
              if (isCurrentlyShowing) {
                // Just hide player HUD (keep right HUDs independent)
                hudL.style.display = 'none';
                hudL.dataset.shipId = '';
                console.log('Hidden player HUD');
              } else {
                // Show player HUD on left (don't touch right HUDs)
                // Also hide left transport HUD to prevent conflicts/flashing
                try {
                  const hudLT = document.getElementById('shipHudLeftTransport');
                  if (hudLT) { hudLT.style.display = 'none'; try { hudLT.dataset.shipId = ''; } catch {} }
                } catch {}
                hudL.dataset.shipId = shipId;
                hudL.style.display = 'block';
                
                // Initialize if needed
                if (window.ShipHUDs[shipId] && !window.ShipHUDs[shipId].initialized) {
                  console.log('Initializing player HUD for ID:', shipId);
                  initShipHudFor('shipHud', 'shipHudCanvas');
                  window.ShipHUDs[shipId].initialized = true;
                }
                
                console.log('Showed player HUD for ID:', shipId);
              }
            }
            return;
          }
        } catch {}
      });
      gameCanvas.__shipHudInputBound__ = true;
    }
  } catch {}

if (rafHandle) cancelAnimationFrame(rafHandle);
rafHandle = requestAnimationFrame(gameLoop);
window.__NAUTICAL_RAF__ = rafHandle;
})();

})();



