  // Formation guidance for Echelon (diagonal / or \ formation)
  function updateFormationEchelon(dt, fleetId){
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
      const interval = Math.max(30, Number(fleetSettings.formationInterval) || Number(formationState.intervalMeters) || 300);
      const together = (fleetSettings.formationTurning === 'together') || (formationState.turning === 'together');
      const formUp = (fleetSettings.formationStation === 'formup') || (formationState.station === 'formup');
      const dir = (fleetSettings.echelonDirection || formationState.echelonDir || 'left');
      const angleDeg = Number(fleetSettings.formationAngleDeg) || 30;
      const anchorMap = (ff.anchor = ff.anchor || {});
      for (let i=0;i<followers.length;i++){
        const rank = i + 1;
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
        // Echelon formation: ships position at a diagonal angle behind the leader
        let target = null;
        if (together) {
          // Turn Together: Position at diagonal behind leader, match heading instantly
          const hr = (leader.ship.heading || 0) * Math.PI/180;
          const back = rank * interval;
          // Calculate diagonal offset: back along heading, then perpendicular offset based on echelon direction
          const backX = -Math.sin(hr) * back;
          const backY = Math.cos(hr) * back;
          // Perpendicular offset (left is negative angle, right is positive)
          const perpAngle = (dir === 'left') ? (leader.ship.heading - 90) : (leader.ship.heading + 90);
          const perpRad = perpAngle * Math.PI/180;
          const perpDist = back * Math.tan(angleDeg * Math.PI/180);
          const perpX = Math.sin(perpRad) * perpDist;
          const perpY = -Math.cos(perpRad) * perpDist;
          target = { x: leader.ship.x + backX + perpX, y: leader.ship.y + backY + perpY };
          s.heading = leader.ship.heading || 0;
          s.desiredHeading = s.heading;
        } else {
          // Turn in Sequence: Follow trail with diagonal offset
          const trailPos = trailPointBack(ff, rank * interval) || { x: leader.ship.x, y: leader.ship.y };
          const perpAngle = (dir === 'left') ? (leader.ship.heading - 90) : (leader.ship.heading + 90);
          const perpRad = perpAngle * Math.PI/180;
          const perpDist = (rank * interval) * Math.tan(angleDeg * Math.PI/180);
          const perpX = Math.sin(perpRad) * perpDist;
          const perpY = -Math.cos(perpRad) * perpDist;
          target = { x: trailPos.x + perpX, y: trailPos.y + perpY };
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
          : (h.profile && h.profile.propulsion && typeof h.profile.propulsion.max_speed_knots === 'number'
            ? h.profile.propulsion.max_speed_knots
            : 30);
        const fallInBuffer = Math.max(10, interval * 0.15);
        let targetKts;
        if (dist > (interval + fallInBuffer)) {
          targetKts = followerCap;
        } else {
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
