# push_parts.ps1
# Script to push project parts at uneven intervals

$remoteUrl = "https://github.com/college-hack24-nov26/hack-garjana.git"

# Ensure remote is set
if (!(git remote | Select-String "origin")) {
    git remote add origin $remoteUrl
}
git branch -M main

# Define parts
$parts = @(
    @{ "name" = "Part 1: Config and Root Files"; "path" = ".gitignore .gitattributes README.md package.json tsconfig.json vite.config.ts index.html Backend/backend/requirements.txt" },
    @{ "name" = "Part 2: Backend API and Core"; "path" = "Backend/backend/app/api/ Backend/backend/app/core/ Backend/backend/app/db/" },
    @{ "name" = "Part 3: Backend Engineering"; "path" = "Backend/backend/app/engineering/" },
    @{ "name" = "Part 4: Backend Services and Schemas"; "path" = "Backend/backend/app/services/ Backend/backend/app/schemas/ Backend/backend/app/tests/" },
    @{ "name" = "Part 5: Frontend Components"; "path" = "Backend/frontend/src/components/ Backend/frontend/src/engine/" },
    @{ "name" = "Part 6: Frontend Pages and Rest"; "path" = "Backend/frontend/src/pages/ Backend/frontend/src/services/ Backend/frontend/src/store/ Backend/frontend/src/types/ Backend/frontend/src/viewer/ Backend/frontend/src/wizard/ Backend/frontend/App.tsx Backend/frontend/main.tsx" },
    @{ "name" = "Part 7: Remaining Files"; "path" = "." }
)

# Intervals in seconds: 10 min, 15 min, 20 min, 20 min, 15 min, 5 min
$intervals = @(600, 900, 1200, 1200, 900, 300)

for ($i = 0; $i -lt $parts.Count; $i++) {
    $part = $parts[$i]
    Write-Host "Pushing $($part.name)..."
    
    # Add files for this part
    foreach ($p in $part.path -split " ") {
        if ($p -ne "") {
            git add $p
        }
    }
    
    # Commit and push
    git commit -m "Upload $($part.name)"
    git push origin main
    
    if ($i -lt $intervals.Count) {
        $interval = $intervals[$i]
        $nextTime = (Get-Date).AddSeconds($interval)
        Write-Host "Waiting for $($interval/60) minutes... Next push at $($nextTime.ToString('HH:mm:ss'))"
        Start-Sleep -Seconds $interval
    }
}

Write-Host "Task completed by 2 AM (or earlier)."
