(function(){
  try {
    // Panel-only Ships list injector (no floating window, no toggle, no console spam)

    // Try to attach to the in-game debug menu (speedDebug) when available
    function ensurePanelSection(){
      try {
        const dbg = document.getElementById('speedDebug');
        if (!dbg) return false;
        const body = dbg.querySelector('.speed-debug-body');
        if (!body) return false;
        if (document.getElementById('shipsDebugSection')) return true;
        const sec = document.createElement('details');
        sec.className = 'speed-debug-section';
        sec.id = 'shipsDebugSection';
        sec.open = true;
        const sum = document.createElement('summary');
        sum.textContent = 'Ships';
        const secBody = document.createElement('div');
        secBody.className = 'speed-debug-section-body';
        const actionsRow = document.createElement('div');
        actionsRow.className = 'dbg-row';
        actionsRow.style.gridTemplateColumns = '1fr auto';
        const hint = document.createElement('span');
        hint.className = 'dbg-label';
        hint.textContent = 'All ships in game';
        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'opt-btn';
        refreshBtn.textContent = 'Refresh';
        const pre = document.createElement('pre');
        pre.id = 'shipsDebugListPanel';
        pre.style.margin = '6px 0 0 0';
        pre.style.maxHeight = '180px';
        pre.style.overflow = 'auto';
        pre.style.whiteSpace = 'pre';
        pre.style.fontSize = '12px';
        pre.style.lineHeight = '1.2';
        refreshBtn.addEventListener('click', render);
        actionsRow.appendChild(hint);
        actionsRow.appendChild(refreshBtn);
        secBody.appendChild(actionsRow);
        secBody.appendChild(pre);
        sec.appendChild(sum);
        sec.appendChild(secBody);
        body.appendChild(sec);
        return true;
      } catch { return false; }
    }

    // Removed: floating window and toggle button

    function getFleetAssignmentMap(){
      const maps = [];
      try { if (window.IronTideFleetAssignments) maps.push(window.IronTideFleetAssignments); } catch {}
      try { if (window.fleetAssignments) maps.push(window.fleetAssignments); } catch {}
      try { if (window.fa) maps.push(window.fa); } catch {}
      const byId = new Map();
      for (const m of maps) {
        try {
          [1,2,3].forEach(fid => {
            try {
              const s = m && m[fid];
              if (s && typeof s.forEach === 'function') s.forEach(id => byId.set(String(id), fid));
            } catch {}
          });
        } catch {}
      }
      return byId;
    }

    function collectShips(){
      const out = [];
      const fmap = getFleetAssignmentMap();
      try {
        if (Array.isArray(window.IronTideFleet)) {
          for (let i=0;i<window.IronTideFleet.length;i++){
            const h = window.IronTideFleet[i];
            if (!h || !h.state) continue;
            const st = h.state;
            const prof = h.profile || st.profile || {};
            const id = String(st.id);
            const type = String(prof.type || prof.name || 'Unknown');
            const name = String(st.displayName || prof.name || '');
            const sunk = !!((st.effects && st.effects.sunk) || st.sunk);
            // Exclude all sunk ships; include all alive ships (including transports)
            if (sunk) continue;
            const fleet = fmap.get(id) || 1;
            out.push({ id, side: 'friendly', fleet, type, name, status: sunk ? 'SUNK' : 'alive' });
          }
        }
      } catch {}
      try {
        if (Array.isArray(window.NPCs)) {
          for (let i=0;i<window.NPCs.length;i++){
            const n = window.NPCs[i];
            if (!n || !n.state) continue;
            const st = n.state;
            const prof = n.profile || st.profile || (n.damageModel && n.damageModel.profile) || {};
            const id = String(st.id);
            const type = String(prof.type || prof.name || 'Unknown');
            const name = String(st.displayName || prof.name || '');
            const sunk = !!((st.effects && st.effects.sunk) || st.sunk);
            const side = (String(st.side||'').toLowerCase()==='friendly') ? 'friendly' : 'enemy';
            // Exclude all sunk ships; include all alive ships (including transports)
            if (sunk) continue;
            // Enemy ships belong to NPC fleet; never show them in Fleet 1 even if erroneously present in assignment maps
            const fleet = (side === 'enemy') ? '-' : (fmap.get(id) || 1);
            out.push({ id, side, fleet, type, name, status: sunk ? 'SUNK' : 'alive' });
          }
        }
      } catch {}
      return out;
    }

    function render(){
      const list = collectShips();
      const header = 'ID     | Side     | Fleet | Type        | Name\n' +
                     '-------+----------+-------+-------------+------------------------------';
      const rows = list
        .sort((a,b)=> Number(a.id)-Number(b.id))
        .map(s => {
          const id = (s.id||'').padEnd(6,' ');
          const side = (s.side||'').padEnd(8,' ');
          const fleet = String(s.fleet||'-').padEnd(5,' ');
          const type = (s.type||'').slice(0,11).padEnd(11,' ');
          const nm = (s.name||'').slice(0,30);
          const status = s.status==='SUNK' ? ' [SUNK]' : '';
          return `${id} | ${side} | ${fleet} | ${type} | ${nm}${status}`;
        });
      const prePanel = document.getElementById('shipsDebugListPanel');
      if (prePanel) prePanel.textContent = header + '\n' + (rows.join('\n')||'(none)');
    }

    function heartbeat(){
      try {
        const f = Array.isArray(window.IronTideFleet) ? window.IronTideFleet.length : 0;
        const e = Array.isArray(window.NPCs) ? window.NPCs.length : 0;
        console.log(LOG_TAG, `Friendly:${f} Enemy:${e}`);
      } catch {}
    }

    function start(){
      // Attach to panel; retry while UI builds
      let attached = ensurePanelSection();
      let tries = 0;
      const retry = setInterval(()=>{
        if (!attached && tries < 10) {
          attached = ensurePanelSection();
          tries++;
        } else {
          clearInterval(retry);
        }
      }, 1000);
      render();
      try { setInterval(render, 1000); } catch {}
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  } catch (err) {
    try { console.error('[ShipsDebugJS] error', err); } catch {}
  }
})();
