# PowerShell script to replace all IronTideFleet references

$files = @("game.js", "start.js", "bismarck.js", "prinzeugen.js", "transport.js")

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Processing $file..." -ForegroundColor Green
        
        $content = Get-Content $file -Raw
        
        # Count replacements for reporting
        $count1 = ([regex]::Matches($content, "IronTideFleetAssignments")).Count
        $count2 = ([regex]::Matches($content, "IronTideSelectedFleet")).Count  
        $count3 = ([regex]::Matches($content, "IronTideFleetSettings")).Count
        $count4 = ([regex]::Matches($content, "IronTideFleetNextId")).Count
        $count5 = ([regex]::Matches($content, "IronTideAudio")).Count
        
        # Perform replacements
        $content = $content -replace "IronTideFleetAssignments", "FleetAssignments"
        $content = $content -replace "IronTideSelectedFleet", "SelectedFleet"
        $content = $content -replace "IronTideFleetSettings", "FleetSettings"
        $content = $content -replace "IronTideFleetNextId", "NextShipId"
        $content = $content -replace "IronTideAudio", "GameAudio"
        $content = $content -replace "IronTideManualHeadingHold", "ManualHeadingHold"
        $content = $content -replace "IronTide_Fleet_", "Fleet_"
        
        # Save the file
        Set-Content $file -Value $content -NoNewline
        
        # Report replacements
        Write-Host "  Replaced IronTideFleetAssignments: $count1 times" -ForegroundColor Yellow
        Write-Host "  Replaced IronTideSelectedFleet: $count2 times" -ForegroundColor Yellow
        Write-Host "  Replaced IronTideFleetSettings: $count3 times" -ForegroundColor Yellow
        Write-Host "  Replaced IronTideFleetNextId: $count4 times" -ForegroundColor Yellow
        Write-Host "  Replaced IronTideAudio: $count5 times" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "File $file not found, skipping..." -ForegroundColor Red
    }
}

Write-Host "Replacement complete!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: IronTideFleet array references still need manual review!" -ForegroundColor Cyan
Write-Host "Search for 'IronTideFleet' in the files to find remaining references." -ForegroundColor Cyan
