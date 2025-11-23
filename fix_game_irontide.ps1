# PowerShell script to fix all remaining IronTideFleet references in game.js
# This is a comprehensive replacement to migrate from IronTideFleet to Fleet1/2/3

Write-Host "Fixing ALL IronTideFleet references in game.js..." -ForegroundColor Green
Write-Host ""

$gameFile = "game.js"
if (Test-Path $gameFile) {
    $content = Get-Content $gameFile -Raw
    
    # Count initial references
    $initialCount = ([regex]::Matches($content, "IronTideFleet(?![A-Za-z])")).Count
    Write-Host "Found $initialCount IronTideFleet references to fix" -ForegroundColor Yellow
    
    # Replace IronTideFleetStates with FleetStates
    $content = $content -replace "window\.IronTideFleetStates", "window.FleetStates"
    $content = $content -replace "IronTideFleetStates", "FleetStates"
    
    # Pattern 1: When checking if IronTideFleet exists and is array
    # Replace: if (Array.isArray(window.IronTideFleet))
    # With: appropriate Fleet1/2/3 checks
    
    # For ship sinking (lines around 436-450)
    $content = $content -replace @'
if \(Array\.isArray\(window\.IronTideFleet\)\) \{
          const before = window\.IronTideFleet\.length;
          console\.log\(`\[SHIP-SUNK\] IronTideFleet before removal:`, window\.IronTideFleet\.map\(h => `ID:\$\{h\?\.state\?\.id\}`\)\.join\(', '\)\);
          console\.log\(`\[SHIP-SUNK\] Removing ID \$\{idStr\} from IronTideFleet\.\.\.\`\);
          window\.IronTideFleet = window\.IronTideFleet\.filter\(h => \{
            const keepShip = !\(h && h\.state && String\(h\.state\.id\) === idStr\);
            if \(!keepShip\) \{
              console\.log\(`\[SHIP-SUNK\] Filtering OUT ship ID \$\{h\.state\.id\} \(\$\{h\.state\.displayName\}\)\`\);
            \}
            return keepShip;
          \}\);
          const after = window\.IronTideFleet\.length;
          console\.log\(`\[SHIP-SUNK\] IronTideFleet after removal:`, window\.IronTideFleet\.map\(h => `ID:\$\{h\?\.state\?\.id\}`\)\.join\(', '\)\);
          if \(before !== after\) console\.log\(`\[SHIP-SUNK\] Removed ID \$\{idStr\} from IronTideFleet \(\$\{before\} -> \$\{after\}\)\`\);
        \}
'@, @'
// Remove from all fleet arrays
        const fleets = [window.Fleet1, window.Fleet2, window.Fleet3];
        fleets.forEach((fleet, index) => {
          if (Array.isArray(fleet)) {
            const before = fleet.length;
            const newFleet = fleet.filter(h => !(h && h.state && String(h.state.id) === idStr));
            if (before !== newFleet.length) {
              console.log(`[SHIP-SUNK] Removed ID ${idStr} from Fleet${index + 1} (${before} -> ${newFleet.length})`);
              if (index === 0) window.Fleet1 = newFleet;
              else if (index === 1) window.Fleet2 = newFleet;
              else window.Fleet3 = newFleet;
            }
          }
        });
'@
    
    # For finding ship in IronTideFleet (around line 652-657)
    $content = $content -replace @'
if \(Array\.isArray\(window\.IronTideFleet\)\) \{
          for \(let i = 0; i < window\.IronTideFleet\.length; i\+\+\) \{
            const cand = window\.IronTideFleet\[i\];
            if \(cand && cand\.state && String\(cand\.state\.id\) === String\(idStr\)\) \{ 
              h = cand; 
              console\.log\(`\[TAKEOVER\] Found ship ID \$\{idStr\} in IronTideFleet at index \$\{i\}\`\);
'@, @'
const fleets = [window.Fleet1, window.Fleet2, window.Fleet3];
        for (let f = 0; f < fleets.length; f++) {
          if (Array.isArray(fleets[f])) {
            for (let i = 0; i < fleets[f].length; i++) {
              const cand = fleets[f][i];
              if (cand && cand.state && String(cand.state.id) === String(idStr)) { 
                h = cand; 
                console.log(`[TAKEOVER] Found ship ID ${idStr} in Fleet${f+1} at index ${i}`);
'@
    
    # For drawFriendlyFleetShips function (around line 1672-1710)
    $content = $content -replace @'
if \(!Array\.isArray\(window\.IronTideFleet\)\) return;
      const playerId = \(window\.shipState && window\.shipState\.id != null\) \? String\(window\.shipState\.id\) : '1';
      console\.log\(`\[DRAW-FRIENDLY\] IronTideFleet has \$\{window\.IronTideFleet\.length\} ships: \$\{window\.IronTideFleet\.map\(s => `ID:\$\{s\?\.state\?\.id\}`\)\.join\(', '\)\}, player ID: \$\{playerId\}\`\);
'@, @'
const fleets = [window.Fleet1, window.Fleet2, window.Fleet3];
      const allShips = [];
      fleets.forEach(fleet => { if (Array.isArray(fleet)) allShips.push(...fleet); });
      if (!allShips.length) return;
      const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '1';
      console.log(`[DRAW-FRIENDLY] All fleets have ${allShips.length} ships: ${allShips.map(s => `ID:${s?.state?.id}`).join(', ')}, player ID: ${playerId}`);
'@
    
    # For looping through IronTideFleet (around line 1705-1710)
    $content = $content -replace @'
for \(let i=0;i<window\.IronTideFleet\.length;i\+\+\)\{
        const ship = window\.IronTideFleet\[i\];
        if \(!ship \|\| !ship\.state \|\| !ship\.state\.ship\) continue;
        const shipId = String\(ship\.state\.id\);
        console\.log\(`\[FRIENDLY-RENDER\] Ship ID \$\{shipId\} in IronTideFleet at pos
'@, @'
for (let i=0;i<allShips.length;i++){
        const ship = allShips[i];
        if (!ship || !ship.state || !ship.state.ship) continue;
        const shipId = String(ship.state.id);
        console.log(`[FRIENDLY-RENDER] Ship ID ${shipId} in Fleet at pos
'@
    
    # Simple replacements for array checks and filters
    $content = $content -replace "if \(npc1 && npc1\.state && npc1\.state\.id != null && Array\.isArray\(window\.IronTideFleet\)\)", "if (npc1 && npc1.state && npc1.state.id != null)"
    $content = $content -replace "window\.IronTideFleet = window\.IronTideFleet\.filter\(e => !\(e && e\.state && String\(e\.state\.id\) === idStr\)\);", @'
// Remove from all fleets
        [window.Fleet1, window.Fleet2, window.Fleet3].forEach(fleet => {
          if (Array.isArray(fleet)) {
            const index = fleet.findIndex(e => e && e.state && String(e.state.id) === idStr);
            if (index !== -1) fleet.splice(index, 1);
          }
        });
'@
    
    # For despawn functions
    $content = $content -replace "if \(Array\.isArray\(window\.IronTideFleet\)\) \{[\s\n\r]+window\.IronTideFleet = window\.IronTideFleet\.filter\(e => !\(e && e\.state && String\(e\.state\.id\) === idStr\)\);[\s\n\r]+\}", @'
// Remove from all fleets
        [window.Fleet1, window.Fleet2, window.Fleet3].forEach(fleet => {
          if (Array.isArray(fleet)) {
            const index = fleet.findIndex(e => e && e.state && String(e.state.id) === idStr);
            if (index !== -1) fleet.splice(index, 1);
          }
        });
'@
    
    # For pushing to IronTideFleet
    $content = $content -replace "window\.IronTideFleet = window\.IronTideFleet \|\| \[\];[\s\n\r]+window\.IronTideFleet\.push", @'
window.Fleet1 = window.Fleet1 || [];
        window.Fleet1.push'@
    
    # For getShipHandleById function (around line 7644-7652)
    $content = $content -replace @'
// Check IronTideFleet first \(friendly ships\)
      if \(Array\.isArray\(window\.IronTideFleet\)\) \{
        for \(let i=0;i<window\.IronTideFleet\.length;i\+\+\)\{
          const h = window\.IronTideFleet\[i\];
          try \{
            if \(h && h\.state && String\(h\.state\.id\) === idStr\) return \{ kind: 'friendly', id: idStr, ship: h\.state\.ship, state: h\.state, profile: h\.profile \};
          \} catch \{\}
        \}
      \}
'@, @'
// Check all fleets for friendly ships
      const fleets = [window.Fleet1, window.Fleet2, window.Fleet3];
      for (let f = 0; f < fleets.length; f++) {
        if (Array.isArray(fleets[f])) {
          for (let i = 0; i < fleets[f].length; i++) {
            const h = fleets[f][i];
            try {
              if (h && h.state && String(h.state.id) === idStr) 
                return { kind: 'friendly', id: idStr, ship: h.state.ship, state: h.state, profile: h.profile };
            } catch {}
          }
        }
      }
'@
    
    # For getFleetMembers function (around line 7669)
    $content = $content -replace "const fa = window\.FleetAssignments \|\| \{ 1: new Set\(\), 2: new Set\(\), 3: new Set\(\) \};", "const fa = window.FleetAssignments || { 1: new Set(), 2: new Set(), 3: new Set() };"
    
    # For used ID collection (around line 3782)
    $content = $content -replace "try \{ if \(Array\.isArray\(window\.IronTideFleet\)\) window\.IronTideFleet\.forEach\(h=>\{ const id=String\(h\?\.state\?\.id\); if \(id\) used\.add\(id\); \}\); \} catch \{\}", @'
try { 
        [window.Fleet1, window.Fleet2, window.Fleet3].forEach(fleet => {
          if (Array.isArray(fleet)) fleet.forEach(h=>{ const id=String(h?.state?.id); if (id) used.add(id); });
        });
      } catch {}'@
    
    # For finding handles (around line 5396-5472)
    $content = $content -replace "try \{ if \(Array\.isArray\(window\.IronTideFleet\)\) window\.IronTideFleet\.forEach\(h=>\{ if \(h && h\.state\) pushIf\(h\.state\.id\); \}\); \} catch \{\}", @'
try { 
            [window.Fleet1, window.Fleet2, window.Fleet3].forEach(fleet => {
              if (Array.isArray(fleet)) fleet.forEach(h=>{ if (h && h.state) pushIf(h.state.id); });
            });
          } catch {}'@
    
    $content = $content -replace @'
if \(Array\.isArray\(window\.IronTideFleet\)\)\{
            for \(const h of window\.IronTideFleet\)\{ if \(h && h\.state && String\(h\.state\.id\) === sid\) return h; \}
          \}
'@, @'
const fleets = [window.Fleet1, window.Fleet2, window.Fleet3];
          for (const fleet of fleets) {
            if (Array.isArray(fleet)) {
              for (const h of fleet) { if (h && h.state && String(h.state.id) === sid) return h; }
            }
          }
'@
    
    # For enemy targeting (around line 6803-6811)
    $content = $content -replace @'
if \(Array\.isArray\(window\.IronTideFleet\)\) \{
            const playerId = \(window\.shipState && window\.shipState\.id != null\) \? String\(window\.shipState\.id\) : '';
            for \(let fi = 0; fi < window\.IronTideFleet\.length; fi\+\+\) \{
              const h = window\.IronTideFleet\[fi\];
              if \(!h \|\| !h\.state\) continue;
              const hid = String\(h\.state\.id\);
              if \(hid && hid === playerId\) continue; // exclude player ship \(handled separately\)
'@, @'
const fleets = [window.Fleet1, window.Fleet2, window.Fleet3];
          const playerId = (window.shipState && window.shipState.id != null) ? String(window.shipState.id) : '';
          for (const fleet of fleets) {
            if (!Array.isArray(fleet)) continue;
            for (let fi = 0; fi < fleet.length; fi++) {
              const h = fleet[fi];
              if (!h || !h.state) continue;
              const hid = String(h.state.id);
              if (hid && hid === playerId) continue; // exclude player ship (handled separately)
'@
    
    # Save the modified content
    Set-Content $gameFile -Value $content -NoNewline
    
    # Count remaining references
    $finalCount = ([regex]::Matches($content, "IronTideFleet(?![A-Za-z])")).Count
    
    Write-Host ""
    Write-Host "Replacement complete!" -ForegroundColor Green
    Write-Host "  Initial IronTideFleet references: $initialCount" -ForegroundColor Yellow
    Write-Host "  Remaining IronTideFleet references: $finalCount" -ForegroundColor Yellow
    
    if ($finalCount -gt 0) {
        Write-Host ""
        Write-Host "Some references still remain. These may need manual review." -ForegroundColor Cyan
        Write-Host "Run this command to find them:" -ForegroundColor Cyan
        Write-Host '  Select-String -Pattern "IronTideFleet" -Path "game.js" | Select-Object -First 10' -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "✅ ALL IronTideFleet references have been successfully removed!" -ForegroundColor Green
    }
} else {
    Write-Host "game.js not found!" -ForegroundColor Red
}
