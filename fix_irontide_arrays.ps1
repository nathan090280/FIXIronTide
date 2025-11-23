# PowerShell script to fix remaining IronTideFleet array references
# This replaces IronTideFleet with Fleet1, Fleet2, Fleet3 arrays

Write-Host "Fixing remaining IronTideFleet array references..." -ForegroundColor Green
Write-Host ""

# Fix bismarck.js
$bismarckFile = "bismarck.js"
if (Test-Path $bismarckFile) {
    Write-Host "Fixing $bismarckFile..." -ForegroundColor Yellow
    $content = Get-Content $bismarckFile -Raw
    
    # Replace IronTideFleet initialization and push
    $content = $content -replace "global\.IronTideFleet = global\.IronTideFleet \|\| \[\];", "global.Fleet1 = global.Fleet1 || [];"
    $content = $content -replace "global\.IronTideFleet\.push\(__bmHandle\);", "global.Fleet1.push(__bmHandle);"
    
    Set-Content $bismarckFile -Value $content -NoNewline
    Write-Host "  Fixed bismarck.js" -ForegroundColor Green
}

# Fix prinzeugen.js
$prinzFile = "prinzeugen.js"
if (Test-Path $prinzFile) {
    Write-Host "Fixing $prinzFile..." -ForegroundColor Yellow
    $content = Get-Content $prinzFile -Raw
    
    # Replace fleetName assignment to use Fleet1 instead of IronTideFleet
    $content = $content -replace "const fleetName = \(sideKey === 'enemy'\) \? 'EnemyFleet1' : 'IronTideFleet';", "const fleetName = (sideKey === 'enemy') ? 'EnemyFleet1' : 'Fleet1';"
    
    Set-Content $prinzFile -Value $content -NoNewline
    Write-Host "  Fixed prinzeugen.js" -ForegroundColor Green
}

# Fix start.js - more complex replacements
$startFile = "start.js"
if (Test-Path $startFile) {
    Write-Host "Fixing $startFile..." -ForegroundColor Yellow
    $content = Get-Content $startFile -Raw
    
    # Replace fleetName for battleships
    $content = $content -replace "const fleetName = \(side === 'enemy'\) \? 'EnemyFleet1' : 'IronTideFleet';", "const fleetName = (side === 'enemy') ? 'EnemyFleet1' : 'Fleet1';"
    
    # Replace purgeRogueTransports to check all fleets
    $content = $content -replace "if \(Array\.isArray\(window\.IronTideFleet\)\) \{[\s\S]*?window\.IronTideFleet = window\.IronTideFleet\.filter\(h => \{[\s\S]*?return t !== 'transport' \|\| isUserPlaced\(h\);[\s\S]*?\}\);", @'
if (Array.isArray(window.Fleet1)) {
          window.Fleet1 = window.Fleet1.filter(h => {
            const t = (h && (h.profile||h.state?.profile) && (h.profile||h.state?.profile).type) ? String((h.profile||h.state.profile).type).toLowerCase() : '';
            return t !== 'transport' || isUserPlaced(h);
          });
        }
        if (Array.isArray(window.Fleet2)) {
          window.Fleet2 = window.Fleet2.filter(h => {
            const t = (h && (h.profile||h.state?.profile) && (h.profile||h.state?.profile).type) ? String((h.profile||h.state.profile).type).toLowerCase() : '';
            return t !== 'transport' || isUserPlaced(h);
          });
        }
        if (Array.isArray(window.Fleet3)) {
          window.Fleet3 = window.Fleet3.filter(h => {
            const t = (h && (h.profile||h.state?.profile) && (h.profile||h.state?.profile).type) ? String((h.profile||h.state.profile).type).toLowerCase() : '';
            return t !== 'transport' || isUserPlaced(h);
          });'@
    
    # Replace render function to draw all fleets
    $content = $content -replace "if \(Array\.isArray\(window\.IronTideFleet\)\) \{[\s\S]*?for \(let i=0;i<window\.IronTideFleet\.length;i\+\+\) drawShipHandle\(window\.IronTideFleet\[i\]\);[\s\S]*?\}", @'
if (Array.isArray(window.Fleet1)) {
          for (let i=0;i<window.Fleet1.length;i++) drawShipHandle(window.Fleet1[i]);
        }
        if (Array.isArray(window.Fleet2)) {
          for (let i=0;i<window.Fleet2.length;i++) drawShipHandle(window.Fleet2[i]);
        }
        if (Array.isArray(window.Fleet3)) {
          for (let i=0;i<window.Fleet3.length;i++) drawShipHandle(window.Fleet3[i]);
        }'@
    
    # Replace isInFleet checks
    $content = $content -replace "const isInFleet = \(\(\)=>\{ try \{ return Array\.isArray\(window\.IronTideFleet\) && window\.IronTideFleet\.some\(h=> String\(h\?\.state\?\.id\|\|''\)===sid\); \} catch \{ return false; \} \}\)\(\);", @'
const isInFleet = (()=>{ 
              try { 
                return (Array.isArray(window.Fleet1) && window.Fleet1.some(h=> String(h?.state?.id||'')===sid)) ||
                       (Array.isArray(window.Fleet2) && window.Fleet2.some(h=> String(h?.state?.id||'')===sid)) ||
                       (Array.isArray(window.Fleet3) && window.Fleet3.some(h=> String(h?.state?.id||'')===sid));
              } catch { return false; } 
            })();'@
    
    Set-Content $startFile -Value $content -NoNewline
    Write-Host "  Fixed start.js" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Array replacement script complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Now running final check for any remaining IronTideFleet references..." -ForegroundColor Yellow

# Count remaining references
$remaining = 0
$files = @("game.js", "start.js", "bismarck.js", "prinzeugen.js", "transport.js")
foreach ($file in $files) {
    if (Test-Path $file) {
        $count = (Select-String -Pattern "IronTideFleet[^A-Za-z]" -Path $file).Count
        if ($count -gt 0) {
            Write-Host "  WARNING: $file still has $count IronTideFleet references" -ForegroundColor Red
            $remaining += $count
        }
    }
}

if ($remaining -eq 0) {
    Write-Host "✅ All IronTideFleet references have been removed!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️ $remaining IronTideFleet references still remain. These need manual fixing in game.js" -ForegroundColor Yellow
}
