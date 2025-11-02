// Minimal start script. Wire up HUD close buttons and mobile behaviors.
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Hook close (X) buttons to hide only their own HUD container
    document.querySelectorAll('.ship-hud .hud-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hud = btn.closest('.ship-hud');
        if (hud) hud.style.display = 'none';
      });
    });
  } catch {}

  // === HUDSystem setup ===
  try {
    if (!window.HUDSystem) {
      window.HUDSystem = {
        _huds: new Map(),

        register(hud) {
          try {
            if (!hud || !hud.shipId) return false;

            // Bind to DOM container via existing register function if present
            if (typeof window.registerHudForShip === 'function' && hud.containerId && hud.canvasId) {
              window.registerHudForShip(String(hud.shipId), hud.containerId, hud.canvasId);
            }

            this._huds.set(String(hud.shipId), hud);
            return true;
          } catch {
            return false;
          }
        },

        get(shipId) {
          return this._huds.get(String(shipId));
        },

        unregister(shipId) {
          try {
            const hud = this._huds.get(String(shipId));
            if (hud) {
              const el = document.getElementById(hud.containerId);
              if (el) el.remove(); // remove DOM element
              this._huds.delete(String(shipId));
            }
          } catch {}
        },
      };
    }

    // === HUD constructor ===
    window.HUD = function (shipContainer) {
      this.shipId = shipContainer.state.id;
      const type = shipContainer.state.type || (shipContainer.profile && shipContainer.profile.type && String(shipContainer.profile.type).toLowerCase()) || '';

      // Generate unique container IDs per ship
      if (type === 'transport') {
        this.containerId = `shipHudTransport_${this.shipId}`;
        this.canvasId = `shipHudCanvasTransport_${this.shipId}`;
      } else if (type === 'cruiser') {
        this.containerId = `shipHudCruiser_${this.shipId}`;
        this.canvasId = `shipHudCanvasCruiser_${this.shipId}`;
      } else {
        this.containerId = `shipHudRight_${this.shipId}`;
        this.canvasId = `shipHudCanvasRight_${this.shipId}`;
      }

      // Create the DOM container if it doesn't exist
      let container = document.getElementById(this.containerId);
      if (!container) {
        container = document.createElement('div');
        container.id = this.containerId;
        container.className = 'ship-hud';
        try { container.dataset.shipId = String(this.shipId); } catch {}
        document.body.appendChild(container);

        // Create canvas inside container
        const canvas = document.createElement('canvas');
        canvas.id = this.canvasId;
        container.appendChild(canvas);
      }

      this.container = container;
      try { this.container.dataset.shipId = String(this.shipId); } catch {}
      this.canvas = document.getElementById(this.canvasId);
    };

    // === When spawning a ship ===
    window.spawnShip = function spawnShip(shipContainer) {
      if (typeof window.HUD === 'function') {
        shipContainer.hud = new window.HUD(shipContainer);
        try {
          if (window.HUDSystem && typeof window.HUDSystem.register === 'function') {
            window.HUDSystem.register(shipContainer.hud);
          }
        } catch {}
      }
    };

    // === When a ship sinks ===
    window.despawnShip = function despawnShip(shipId) {
      if (window.HUDSystem) {
        window.HUDSystem.unregister(shipId);
      }
      // Other ship cleanup here...
    };
  } catch {}

// --- Lightweight Ships Overlay Renderer (for new ship types like Transport) ---
(function setupShipsOverlay(){
  try {
    // Block transports from spawning until user explicitly places one
    try { if (typeof window.AllowTransportSpawns === 'undefined') window.AllowTransportSpawns = false; } catch {}

    // Purge any rogue transports that may have been added by other scripts before user placement
    function purgeRogueTransports(){
      try {
        const isUserPlaced = (h)=> !!(h && h.state && h.state.debugPlaced);
        if (Array.isArray(window.IronTideFleet)) {
          window.IronTideFleet = window.IronTideFleet.filter(h => {
            const t = (h && (h.profile||h.state?.profile) && (h.profile||h.state?.profile).type) ? String((h.profile||h.state.profile).type).toLowerCase() : '';
            return t !== 'transport' || isUserPlaced(h);
          });
        }
        if (Array.isArray(window.NPCs)) {
          window.NPCs = window.NPCs.filter(h => {
            const t = (h && (h.profile||h.state?.profile) && (h.profile||h.state?.profile).type) ? String((h.profile||h.state?.profile).type).toLowerCase() : '';
            return t !== 'transport' || isUserPlaced(h);
          });
        }
      } catch {}
    }
    try { purgeRogueTransports(); } catch {}

    const baseCanvas = document.getElementById('gameCanvas');
    const overlay = document.getElementById('shipsOverlay');
    if (!baseCanvas || !overlay) return;
    const octx = overlay.getContext('2d');

    // Image cache by src
    const imgCache = new Map();
    function getImage(src){
      if (!src) return null;
      if (imgCache.has(src)) return imgCache.get(src);
      const im = new Image(); im.src = src; imgCache.set(src, im); return im;
    }

    function syncSize(){
      try {
        const rect = baseCanvas.getBoundingClientRect();
        // Use CSS pixel size to match screenToWorld inputs (which take screen px)
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (overlay.width !== w) overlay.width = w;
        if (overlay.height !== h) overlay.height = h;
        overlay.style.width = w + 'px';
        overlay.style.height = h + 'px';
      } catch {}
    }

    function getWorldToScreen(){
      // Infer linear transform by sampling screenToWorld at two corners
      try {
        if (typeof window.screenToWorld !== 'function') return null;
        const rect = baseCanvas.getBoundingClientRect();
        const W = Math.max(1, Math.round(rect.width));
        const H = Math.max(1, Math.round(rect.height));
        const wa = window.screenToWorld(0, 0);
        const wb = window.screenToWorld(W, H);
        if (!wa || !wb) return null;
        const sx = (wb.x - wa.x) / Math.max(1, W);
        const sy = (wb.y - wa.y) / Math.max(1, H);
        return {
          toScreen(wx, wy){
            const x = (wx - wa.x) / (sx || 1);
            const y = (wy - wa.y) / (sy || 1);
            return { x, y };
          }
        };
      } catch { return null; }
    }

    function drawShipHandle(handle){
      if (!handle || !handle.state || !handle.state.ship) return;
      const st = handle.state;
      const prof = handle.profile || st.profile || {};
      const ship = st.ship;
      // Skip drawing if ship is sunk
      try { if (st && (st.effects?.sunk || st.sunk)) return; } catch {}
      // Only render Transport on this overlay to avoid duplicates/mis-mapping for other ships
      if (String(prof.type||'').toLowerCase() !== 'transport') return;
      const src = (prof && prof.image) ? prof.image : ((prof && String(prof.type).toLowerCase()==='transport') ? 'assets/trans.png' : 'assets/bismarck1.png');
      const img = getImage(src);
      if (!img) return;
      // Map to screen
      const ts = getWorldToScreen(); if (!ts) return;
      const p = ts.toScreen(ship.x, ship.y);
      // Determine on-screen size; use radius when available, fallback to 64px height
      const radius = (prof && prof.dimensions && typeof prof.dimensions.radius === 'number') ? prof.dimensions.radius : 14;
      const pr = ts.toScreen(ship.x + radius, ship.y);
      const pxPerWorld = Math.abs(pr.x - p.x) || 1;
      let spriteH = Math.max(24, Math.round(pxPerWorld * radius * 2));
      // Make transports 33% smaller
      spriteH = Math.max(16, Math.round(spriteH * 0.67));
      const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 1024/1536;
      const spriteW = Math.round(spriteH * aspect);
      // Draw rotated about center
      octx.save();
      octx.translate(p.x, p.y);
      const rad = ((ship.heading || 0) * Math.PI) / 180;
      octx.rotate(rad);
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        octx.drawImage(img, -spriteW/2, -spriteH/2, spriteW, spriteH);
      } else {
        // Fallback: draw a visible marker so the ship is always visible
        octx.fillStyle = (String(prof.type).toLowerCase()==='transport') ? 'rgba(0,200,255,0.8)' : 'rgba(255,255,255,0.8)';
        const r = Math.max(8, Math.round(spriteH*0.4));
        octx.beginPath();
        octx.moveTo(0, -r);
        octx.lineTo(r*0.75, r);
        octx.lineTo(-r*0.75, r);
        octx.closePath();
        octx.fill();
      }
      octx.restore();
    }

    function render(){
      syncSize();
      octx.clearRect(0, 0, overlay.width, overlay.height);
      try {
        if (Array.isArray(window.IronTideFleet)) {
          for (let i=0;i<window.IronTideFleet.length;i++) drawShipHandle(window.IronTideFleet[i]);
        }
      } catch {}
      try {
        if (Array.isArray(window.NPCs)) {
          for (let i=0;i<window.NPCs.length;i++) drawShipHandle(window.NPCs[i]);
        }
      } catch {}
      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  } catch {}
})();
  // Provide global spawn/despawn helpers used by DebugPlaceMode in game.js
  try {
    if (!window.spawnNpcAt) {
      window.spawnNpcAt = function spawnNpcAt(x, y, opts){
        try {
          const side = (opts && opts.side === 'friendly') ? 'friendly' : 'enemy';
          const heading = (opts && typeof opts.heading === 'number') ? opts.heading : 0;
          const speedKts = (opts && typeof opts.speedKts === 'number') ? opts.speedKts : 0;
          const kind = (opts && (opts.shipKind || '').toLowerCase()) || ((opts && (opts.typeLabel||'')).toLowerCase().includes('transport') ? 'transport' : 'bismarck');

          if (kind === 'transport' && typeof window.spawnTransport === 'function') {
            const npc = window.spawnTransport(side, x, y, { heading, speedKts });
            return { state: npc.state };
          }
          // Fallback: spawn a Battleship-like NPC by cloning the Bismarck profile
          const baseProf = (window.shipProfile && typeof window.shipProfile === 'object') ? structuredClone(window.shipProfile) : {
            name: 'Battleship', type: 'Battleship', dimensions: { length: 250, beam: 36, draft: 10, radius: 14 }, movement: { min_speed_knots: -8, max_speed_knots: 30, base_speed: 40, rudder_effectiveness: { effectiveness_at_5kts: 0.1 } }, armor: { belt_mm: 500, turrets_mm: 500 }
          };
          // Build independent state/profile and runtime systems
          const inst = { profile: baseProf, ship: { x, y, r: baseProf.dimensions.radius, heading, desiredHeading: heading, speed: baseProf.movement.base_speed * 0.5, moveTarget: null } };
          const state = {
            profile: baseProf,
            ship: inst.ship,
            id: undefined,
            displayName: '',
            SPEED_MIN: baseProf.movement.min_speed_knots,
            SPEED_MAX: baseProf.movement.max_speed_knots,
            ACCEL_KTS_PER_SEC: 2,
            speedKts: speedKts,
            actualSpeedKts: speedKts,
            setSpeedFromSlider: (v)=> (state.speedKts = Math.max(state.SPEED_MIN, Math.min(state.SPEED_MAX, v|0))),
            adjustSpeed: (d)=> state.setSpeedFromSlider((state.speedKts||0) + (d>0?1:-1)),
            rudderEffectiveness: (k)=>{ const eff5 = (baseProf.movement.rudder_effectiveness && baseProf.movement.rudder_effectiveness.effectiveness_at_5kts) || 0.1; const t=Math.max(0,Math.min(1,(Math.abs(k)-5)/(30-5))); return (Math.abs(k)<=5)?(eff5*(Math.abs(k)/5)):(eff5+(1-eff5)*t); },
          };
          // Assign ID and push into correct collection
          window.IronTideFleetNextId = (window.IronTideFleetNextId || 0) + 1;
          state.id = state.id || window.IronTideFleetNextId;
          const idx = window.IronTideFleetNextId;
          // Build independent runtime systems and container
          const shipPNG = 'assets/bismarck1.png';
          const shipTMX = 'assets/BSTMX.tmx';
          let damageModel = null;
          let firingSolution = null;
          try { if (typeof window.DamageModel === 'function') damageModel = new window.DamageModel(state); } catch {}
          try { if (typeof window.FiringSolution === 'function' && damageModel) firingSolution = new window.FiringSolution(state, damageModel); } catch {}
          const fleetName = (side === 'enemy') ? 'EnemyFleet1' : 'IronTideFleet';
          const shipContainer = {
            id: state.id,
            profile: baseProf,
            damageModel,
            firingSolution,
            png: shipPNG,
            tmx: shipTMX,
            fleet: fleetName,
            state,
          };

          // Create and register per-ship HUD
          try {
            if (typeof window.HUD === 'function') {
              shipContainer.hud = new window.HUD(shipContainer);
              try { if (window.HUDSystem && typeof window.HUDSystem.register === 'function') window.HUDSystem.register(shipContainer.hud); } catch {}
            }
          } catch {}

          if (side === 'enemy') {
            state.displayName = `Enemy Battleship ${idx}`;
            window.EnemyFleet1 = Array.isArray(window.EnemyFleet1) ? window.EnemyFleet1 : [];
            window.EnemyFleet1.push(shipContainer);
            try {
              const idStr = String(state.id);
              window.ShipHandlesById = window.ShipHandlesById || {};
              window.ShipHandlesById[idStr] = shipContainer;
            } catch {}
          } else {
            state.displayName = `Battleship ${idx}`;
            window.Fleet1 = Array.isArray(window.Fleet1) ? window.Fleet1 : [];
            window.Fleet1.push(shipContainer);
            try {
              const idStr = String(state.id);
              window.ShipHandlesById = window.ShipHandlesById || {};
              window.ShipHandlesById[idStr] = shipContainer;
            } catch {}
          }
          return { state };
        } catch { return null; }
      };
    }
  } catch {}
  try {
    if (!window.despawnNpcById) {
      window.despawnNpcById = function despawnNpcById(id){
        try {
          const sid = String(id);
          if (Array.isArray(window.Fleet1)) window.Fleet1 = window.Fleet1.filter(n => !(n && n.state && String(n.state.id) === sid));
          if (Array.isArray(window.Fleet2)) window.Fleet2 = window.Fleet2.filter(n => !(n && n.state && String(n.state.id) === sid));
          if (Array.isArray(window.Fleet3)) window.Fleet3 = window.Fleet3.filter(n => !(n && n.state && String(n.state.id) === sid));
          if (Array.isArray(window.EnemyFleet1)) window.EnemyFleet1 = window.EnemyFleet1.filter(n => !(n && n.state && String(n.state.id) === sid));
          if (Array.isArray(window.EnemyFleet2)) window.EnemyFleet2 = window.EnemyFleet2.filter(n => !(n && n.state && String(n.state.id) === sid));
          if (Array.isArray(window.EnemyFleet3)) window.EnemyFleet3 = window.EnemyFleet3.filter(n => !(n && n.state && String(n.state.id) === sid));
        } catch {}
      };
    }
  } catch {}

  try {
    // On mobile only: ensure HUDs are not auto-opened at start
    const isMobile = (typeof window !== 'undefined') && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768);
    if (isMobile) {
      document.querySelectorAll('.ship-hud').forEach(hud => {
        if (!hud.hasAttribute('data-force-open')) hud.style.display = 'none';
      });
      // Adjust viewport for extra zoom-out on mobile portrait only; landscape unchanged
      const applyViewport = () => {
        try {
          const isPortrait = window.matchMedia('(orientation: portrait)').matches;
          const minScale = isPortrait ? 0.5 : 1.0; // 2x more map in portrait; landscape stays like desktop
          const initScale = isPortrait ? 0.5 : 1.0;
          // Recreate meta to force some mobile browsers (iOS Safari/Chrome) to apply changes
          const head = document.getElementsByTagName('head')[0];
          let meta = document.getElementById('viewportMeta');
          if (meta) head.removeChild(meta);
          meta = document.createElement('meta');
          meta.id = 'viewportMeta';
          meta.name = 'viewport';
          meta.setAttribute('content', `width=device-width, initial-scale=${initScale}, minimum-scale=${minScale}, maximum-scale=3.0, user-scalable=yes`);
          head.appendChild(meta);
        } catch {}
      };
      applyViewport();
      try { window.addEventListener('orientationchange', applyViewport); window.addEventListener('resize', applyViewport); } catch {}
    }
  } catch {}
  // Wire Debug controls on all devices
  try {
    const debugDetails = document.getElementById('speedDebug');
    const slider = document.getElementById('dbgRange');
    const out = document.getElementById('dbgRangeVal');
    const dmgContainer = document.getElementById('dbgDamageContainer');
    const dmgTargetSel = document.getElementById('dbgDamageTarget');
    if (debugDetails) {
      // Initialize from storage
      const saved = (()=>{ try { return Number(localStorage.getItem('DebugRangeScale')); } catch { return NaN; } })();
      // Mobile-only: set or clamp to 0.60x (desktop 1.30x)
      const isMobile2 = (typeof window !== 'undefined') && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768);
      let startVal;
      if (isMobile2) {
        if (!isFinite(saved) || saved <= 0 || saved > 0.6) {
          startVal = 0.6;
          try { localStorage.setItem('DebugRangeScale', String(startVal)); } catch {}
        } else {
          startVal = saved;
        }
      } else {
        startVal = (isFinite(saved) && saved > 0) ? saved : 1.3;
        try { if (!isFinite(saved) || saved <= 0) localStorage.setItem('DebugRangeScale', String(startVal)); } catch {}
      }
      if (slider) slider.value = String(startVal);
      if (out) out.textContent = `${startVal.toFixed(2)}x`;
      window.DebugRangeScale = startVal;
      if (slider) {
        slider.addEventListener('input', ()=>{
          const v = Number(slider.value);
          const val = (isFinite(v) && v > 0) ? v : 1;
          window.DebugRangeScale = val;
          try { localStorage.setItem('DebugRangeScale', String(val)); } catch {}
          if (out) out.textContent = `${val.toFixed(2)}x`;
        });
      }


      // Damage Controls: target selection lists all ships by ID; sliders bind to that ship's profile
      const rebuildDamageTargetOptions = () => {
        if (!dmgTargetSel) return;
        // Preserve current selection if possible
        const cur = dmgTargetSel.value;
        dmgTargetSel.innerHTML = '';
        const mk = (val, label) => { const o = document.createElement('option'); o.value = val; o.textContent = label; return o; };
        // No Player entry (per request)
        const seen = new Set();
        const pushIfNew = (id, label) => { const sid = String(id||''); if (!sid) return; if (seen.has(sid)) return; seen.add(sid); dmgTargetSel.appendChild(mk(sid, label)); };
        const sideHint = (st, id) => {
          try {
            const sid = String(id||'');
            // Prefer explicit membership in core arrays to avoid relying on transient sets/flags
            const isInNPCs = (()=>{ try { return Array.isArray(window.NPCs) && window.NPCs.some(h=> String(h?.state?.id||'')===sid); } catch { return false; } })();
            const isInFleet = (()=>{ try { return Array.isArray(window.IronTideFleet) && window.IronTideFleet.some(h=> String(h?.state?.id||'')===sid); } catch { return false; } })();
            if (isInNPCs) return 'E';
            if (isInFleet) return 'F';
            let side = String(st?.side || '');
            if (!side) {
              const enemy = (()=>{ try { return !!(window.EnemyFleet1 && (window.EnemyFleet1.has(sid) || window.EnemyFleet1.has(Number(sid)))); } catch { return false; } })();
              side = enemy ? 'E' : 'F';
            } else {
              side = side.toLowerCase()==='enemy' ? 'E' : 'F';
            }
            return side;
          } catch { return 'F'; }
        };
        // Friendly fleet entries (exclude sunk)
        try {
          if (Array.isArray(window.IronTideFleet)) {
            window.IronTideFleet.forEach(h => {
              try {
                const id = String(h?.state?.id ?? ''); if (!id) return;
                const name = h?.state?.displayName || h?.profile?.name || 'Ship';
                const sunk = !!(h?.state?.effects?.sunk || h?.state?.sunk);
                if (sunk) return;
                const lab = `[F] ID ${id} - ${name}`;
                pushIfNew(id, lab);
              } catch {}
            });
          }
        } catch {}
        // Enemy entries (NPCs array, exclude sunk)
        try {
          if (Array.isArray(window.NPCs)) {
            window.NPCs.forEach(h => {
              try {
                const id = String(h?.state?.id ?? ''); if (!id) return;
                const name = h?.state?.displayName || h?.profile?.name || 'Enemy Ship';
                const sunk = !!(h?.state?.effects?.sunk || h?.state?.sunk);
                if (sunk) return;
                const lab = `[E] ID ${id} - ${name}`;
                pushIfNew(id, lab);
              } catch {}
            });
          }
        } catch {}
        // Legacy npc1 if present
        try {
          if (window.npc1 && window.npc1.state && window.npc1.state.id != null) {
            const id = String(window.npc1.state.id);
            const name = window.npc1.state.displayName || window.npc1.profile?.name || 'Enemy Ship';
            const sunk = !!(window.npc1.state.effects?.sunk || window.npc1.state.sunk);
            if (!sunk) {
              const lab = `[E] ID ${id} - ${name}`;
              pushIfNew(id, lab);
            }
          }
        } catch {}
        // Any other registered ships via global registry
        // Any other registered ships (ensure truly every ship appears, e.g., ID 50)
        try {
          if (window.ShipHandlesById && typeof window.ShipHandlesById === 'object') {
            Object.keys(window.ShipHandlesById).forEach(id => {
              try {
                const sid = String(id);
                // Skip HUD alias keys like '1_right'/'1_left' etc.; only include pure numeric IDs here
                if (!/^[0-9]+$/.test(sid)) return;
                const h = window.ShipHandlesById[sid]; if (!h || !h.state) return;
                const st = h.state; const prof = h.profile || st.profile || {};
                const sunk = !!(st.effects?.sunk || st.sunk);
                if (sunk) return;
                // Only include if this id corresponds to a live ship present in NPCs or IronTideFleet
                const presentInNPCs = (()=>{ try { return Array.isArray(window.NPCs) && window.NPCs.some(n=> String(n?.state?.id||'')===sid && !(n?.state?.effects?.sunk || n?.state?.sunk)); } catch { return false; } })();
                const presentInFleet = (()=>{ try { return Array.isArray(window.IronTideFleet) && window.IronTideFleet.some(f=> String(f?.state?.id||'')===sid && !(f?.state?.effects?.sunk || f?.state?.sunk)); } catch { return false; } })();
                if (!presentInNPCs && !presentInFleet) return; // avoid ghost/alias-only entries
                const name = st.displayName || prof.name || 'Ship';
                const side = sideHint(st, sid);
                const lab = `[${side}] ID ${sid} - ${name}`;
                pushIfNew(sid, lab);
              } catch {}
            });
          }
        } catch {}
        // IDs from assignment maps even if handle array not populated yet
        try {
          const maps = [window.IronTideFleetAssignments, window.fleetAssignments, window.fa];
          maps.forEach(m => {
            try {
              [1,2,3].forEach(fid => {
                const set = m && m[fid];
                if (set && typeof set.forEach === 'function') {
                  set.forEach(rawId => {
                    const id = String(rawId);
                    try {
                      const res = (typeof window.resolveShipById === 'function') ? window.resolveShipById(id) : null;
                      const st = res?.state; if (!st) return;
                      const sunk = !!(st?.effects?.sunk || st?.sunk); if (sunk) return;
                      // Only include if this id corresponds to a live ship present in NPCs or IronTideFleet
                      const presentInNPCs = (()=>{ try { return Array.isArray(window.NPCs) && window.NPCs.some(n=> String(n?.state?.id||'')===id && !(n?.state?.effects?.sunk || n?.state?.sunk)); } catch { return false; } })();
                      const presentInFleet = (()=>{ try { return Array.isArray(window.IronTideFleet) && window.IronTideFleet.some(f=> String(f?.state?.id||'')===id && !(f?.state?.effects?.sunk || f?.state?.sunk)); } catch { return false; } })();
                      if (!presentInNPCs && !presentInFleet) return; // skip stale assignment-only ids
                      const name = st?.displayName || res?.profile?.name || 'Ship';
                      const side = sideHint(st, id);
                      const lab = `[${side}] ID ${id} - ${name}`;
                      pushIfNew(id, lab);
                    } catch { /* skip unresolved to avoid ghosts */ }
                  });
                }
              });
            } catch {}
          });
        } catch {}
        // Restore selection if still present; else select first available ship
        try {
          const has = Array.from(dmgTargetSel.options).some(o => o.value === cur);
          if (has && cur) {
            dmgTargetSel.value = cur;
          } else if (dmgTargetSel.options.length > 0) {
            // Select first non-empty option so sliders target a real ship
            const first = Array.from(dmgTargetSel.options).find(o => o.value && o.value !== 'player');
            if (first) dmgTargetSel.value = first.value;
          }
        } catch {}
      };
      const getTargetProfile = () => {
        const choice = (dmgTargetSel && dmgTargetSel.value) || 'player';
        if (choice === 'player') {
          try { return (window.shipProfile) ? window.shipProfile : null; } catch { return null; }
        }
        try {
          if (typeof window.resolveShipById === 'function') {
            const r = window.resolveShipById(String(choice)) || {};
            return r.profile || null;
          }
        } catch {}
        return null;
      };
      const computeDamagePercent = (hb) => {
        if (!hb) return 0;
        if (typeof hb.damage_percent === 'number' && isFinite(hb.damage_percent)) return Math.max(0, Math.min(100, hb.damage_percent));
        const maxhp = (typeof hb.max_hp === 'number') ? hb.max_hp : 0;
        if (maxhp > 0) {
          const hp = (typeof hb.hp === 'number') ? hb.hp : maxhp;
          const hpP = Math.max(0, Math.min(1, hp / maxhp));
          return Math.round((1 - hpP) * 100);
        }
        return 0;
      };
      const applyDamagePercent = (hb, val) => {
        if (!hb) return;
        const v = Math.max(0, Math.min(100, Number(val) || 0));
        hb.damage_percent = v;
        // Optionally sync hp if max_hp present
        if (typeof hb.max_hp === 'number' && hb.max_hp > 0) {
          hb.hp = Math.max(0, Math.round((1 - v/100) * hb.max_hp));
        }
      };
      const populateDamageSliders = () => {
        if (!dmgContainer) return;
        // Clear
        dmgContainer.innerHTML = '';
        const selId = (dmgTargetSel && dmgTargetSel.value) ? String(dmgTargetSel.value) : '';
        // Prefer live hitboxes so sliders reflect the actual ship model
        let hitboxes = null;
        try { if (selId && window.getShipHitboxesById) hitboxes = window.getShipHitboxesById(selId); } catch {}
        if (!hitboxes) {
          const prof = getTargetProfile();
          hitboxes = (prof && prof.damage && prof.damage.hitboxes) ? prof.damage.hitboxes : null;
        }
        if (!hitboxes) {
          const p = document.createElement('div'); p.textContent = 'No hitboxes available.'; p.style.opacity = '0.8'; dmgContainer.appendChild(p); return;
        }
        // Create slider for each hitbox key
        Object.keys(hitboxes).forEach((key) => {
          const hb = hitboxes[key]; if (!hb || typeof hb !== 'object') return;
          const row = document.createElement('div');
          row.className = 'dbg-row';
          row.style.display = 'grid';
          row.style.gridTemplateColumns = 'auto 1fr auto';
          row.style.columnGap = '8px';
          row.style.alignItems = 'center';
          const label = document.createElement('label'); label.textContent = key; label.className = 'dbg-label';
          const inp = document.createElement('input'); inp.type = 'range'; inp.min = '0'; inp.max = '100'; inp.step = '1'; inp.value = String(computeDamagePercent(hb));
          const val = document.createElement('span'); val.className = 'dbg-value'; val.textContent = `${inp.value}%`;
          inp.addEventListener('input', ()=>{
            const p = Number(inp.value) || 0;
            val.textContent = `${p}%`;
            // 1) Update UI-local profile copy so the slider reflects immediately
            try { applyDamagePercent(hb, p); } catch {}
            // 2) Apply to live ship by ID via game API (includes detonation checks)
            let ok = false;
            try { if (selId && window.applyDamageToShipId) ok = !!window.applyDamageToShipId(selId, key, p); } catch {}
            // 3) Fallback: write into live hitboxes directly and trigger detonation
            if (!ok) {
              try {
                const liveHbs = (window.getShipHitboxesById && selId) ? window.getShipHitboxesById(selId) : null;
                if (liveHbs && liveHbs[key]) {
                  try {
                    const lhb = liveHbs[key]; lhb.damage_percent = p; if (typeof lhb.max_hp==='number' && lhb.max_hp>0) lhb.hp = Math.max(0, Math.round((1-p/100)*lhb.max_hp));
                  } catch {}
                  try {
                    if (window.resolveHandleByIdStrict && window.checkCatastrophicDetonation) {
                      const r = window.resolveHandleByIdStrict(selId);
                      if (r && r.handle) window.checkCatastrophicDetonation(r.handle);
                    }
                  } catch {}
                }
              } catch {}
            }
          });
          row.appendChild(label); row.appendChild(inp); row.appendChild(val);
          dmgContainer.appendChild(row);
        });
      };
      // Rebuild target list when opening Debug and periodically while open (NPCs can spawn after load)
      try {
        if (debugDetails) {
          debugDetails.addEventListener('toggle', () => { if (debugDetails.open) { rebuildDamageTargetOptions(); populateDamageSliders(); } });
        }
      } catch {}
      rebuildDamageTargetOptions();
      if (dmgTargetSel) dmgTargetSel.addEventListener('change', populateDamageSliders);
      populateDamageSliders();

      // Periodically refresh the target list while Debug is open, to include newly spawned NPCs/friendlies
      try {
        let lastSignature = '';
        setInterval(() => {
          try {
            if (!debugDetails || !debugDetails.open) return;
            // Build a lightweight signature of current ships to detect changes
            const ids = [];
            try { if (Array.isArray(window.IronTideFleet)) window.IronTideFleet.forEach(h=>{ const id=String(h?.state?.id||''); const sunk=!!(h?.state?.effects?.sunk||h?.state?.sunk); if (id && !sunk) ids.push(id); }); } catch {}
            try { if (Array.isArray(window.NPCs)) window.NPCs.forEach(h=>{ const id=String(h?.state?.id||''); const sunk=!!(h?.state?.effects?.sunk||h?.state?.sunk); if (id && !sunk) ids.push(id); }); } catch {}
            try { if (window.ShipHandlesById) ids.push(...Object.keys(window.ShipHandlesById).filter(k=>/^[0-9]+$/.test(String(k)))); } catch {}
            ids.sort();
            const sig = ids.join(',');
            if (sig !== lastSignature) {
              const prev = (dmgTargetSel && dmgTargetSel.value) || 'player';
              rebuildDamageTargetOptions();
              // Restore selection and refresh sliders
              try { if (dmgTargetSel) dmgTargetSel.value = prev; } catch {}
              populateDamageSliders();
              lastSignature = sig;
            }
          } catch {}
        }, 1000);
      } catch {}

      // Debug: Place Ship controls
      try {
        const typeSel = document.getElementById('dbgPlaceType');
        const headingInp = document.getElementById('dbgPlaceHeading');
        const speedInp = document.getElementById('dbgPlaceSpeed');
        const sideSel = document.getElementById('dbgPlaceSide');
        const despawnInp = document.getElementById('dbgPlaceDespawn');
        const placeBtn = document.getElementById('dbgPlaceBtn');
          if (placeBtn) {
            placeBtn.addEventListener('click', () => {
              try {
                const shipType = (typeSel && typeSel.value) || 'bismarck';
                const heading = Math.max(0, Math.min(359, Number(headingInp && headingInp.value))) || 0;
                const speed = Math.max(0, Math.min(30, Number(speedInp && speedInp.value))) || 0;
                const side = (sideSel && sideSel.value) || 'enemy';
                const despawn = Math.max(0, Number(despawnInp && despawnInp.value)) || 0;

                // Currently supported spawn: Bismarck (NPC)
                if (shipType === 'bismarck') {
                  // Enter placement mode: next click on canvas will place the ship
                  try {
                    const typeLabel = 'Battleship';
                    window.DebugPlaceMode = {
                      pending: true,
                      side,
                      heading,
                      speedKts: speed,
                      despawnSec: despawn,
                      shipType: shipType,
                      shipKind: shipType,
                      typeLabel,
                    };
                    // Change cursor to hand pointer while placing
                    try { document.body.style.cursor = 'pointer'; } catch {}
                  } catch {}
                } else if (shipType === 'transport') {
                  try {
                    const typeLabel = 'Transport';
                    window.DebugPlaceMode = {
                      pending: true,
                      side,
                      heading,
                      speedKts: speed,
                      despawnSec: despawn,
                      shipType: shipType,
                      shipKind: shipType,
                      typeLabel,
                    };
                    try { document.body.style.cursor = 'pointer'; } catch {}
                  } catch {}
                } else if (shipType === 'prinzeugen') {
                  try {
                    const typeLabel = 'Cruiser';
                    window.DebugPlaceMode = {
                      pending: true,
                      side,
                      heading,
                      speedKts: speed,
                      despawnSec: despawn,
                      shipType: shipType,
                      shipKind: shipType,
                      typeLabel,
                    };
                    try { document.body.style.cursor = 'pointer'; } catch {}
                  } catch {}
                }
              } catch {}
            });
          }
      } catch {}
    }
  } catch {}
});
