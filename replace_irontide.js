// Script to replace all IronTideFleet references with Fleet 1/2/3 system
// This script will perform the necessary replacements in the game files

const fs = require('fs');
const path = require('path');

// Files to process
const filesToProcess = [
  'game.js',
  'start.js', 
  'bismarck.js',
  'prinzeugen.js',
  'transport.js'
];

// Replacements to make
const replacements = [
  // Replace IronTideFleetAssignments with FleetAssignments
  { from: /window\.IronTideFleetAssignments/g, to: 'window.FleetAssignments' },
  { from: /IronTideFleetAssignments/g, to: 'FleetAssignments' },
  
  // Replace IronTideSelectedFleet with SelectedFleet
  { from: /window\.IronTideSelectedFleet/g, to: 'window.SelectedFleet' },
  { from: /IronTideSelectedFleet/g, to: 'SelectedFleet' },
  
  // Replace IronTideFleetSettings with FleetSettings
  { from: /window\.IronTideFleetSettings/g, to: 'window.FleetSettings' },
  { from: /IronTideFleetSettings/g, to: 'FleetSettings' },
  
  // Replace IronTideFleetNextId with NextShipId
  { from: /window\.IronTideFleetNextId/g, to: 'window.NextShipId' },
  { from: /IronTideFleetNextId/g, to: 'NextShipId' },
  
  // Replace IronTideAudio with GameAudio
  { from: /window\.IronTideAudio/g, to: 'window.GameAudio' },
  { from: /IronTideAudio/g, to: 'GameAudio' },
  
  // Replace other IronTide variables
  { from: /IronTideManualHeadingHold/g, to: 'ManualHeadingHold' },
  { from: /IronTide_Fleet/g, to: 'Fleet' },
];

// Function to process a file
function processFile(filename) {
  const filepath = path.join(__dirname, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`File ${filename} not found, skipping...`);
    return;
  }
  
  let content = fs.readFileSync(filepath, 'utf8');
  let modified = false;
  
  replacements.forEach(replacement => {
    const before = content.length;
    content = content.replace(replacement.from, replacement.to);
    if (content.length !== before) {
      modified = true;
      console.log(`Applied replacement in ${filename}: ${replacement.from} -> ${replacement.to}`);
    }
  });
  
  // Special handling for IronTideFleet array references that need to be replaced with Fleet1/2/3
  // This is more complex and needs context-aware replacement
  
  // Pattern: if (Array.isArray(window.IronTideFleet)) should check Fleet1, Fleet2, Fleet3 instead
  const ironTideFleetArrayPattern = /if \(Array\.isArray\(window\.IronTideFleet\)\)/g;
  if (ironTideFleetArrayPattern.test(content)) {
    // This needs manual review as it depends on context
    console.log(`WARNING: Found IronTideFleet array check in ${filename} - needs manual review`);
  }
  
  // Pattern: window.IronTideFleet.forEach should iterate over Fleet1, Fleet2, Fleet3
  const ironTideFleetForEachPattern = /window\.IronTideFleet\.forEach/g;
  if (ironTideFleetForEachPattern.test(content)) {
    console.log(`WARNING: Found IronTideFleet.forEach in ${filename} - needs manual review`);
  }
  
  if (modified) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`✅ Updated ${filename}`);
  } else {
    console.log(`No changes needed in ${filename}`);
  }
}

// Process all files
console.log('Starting IronTideFleet replacement process...\n');
filesToProcess.forEach(processFile);
console.log('\n✅ Replacement process complete!');
console.log('\nIMPORTANT: Some IronTideFleet array references need manual review.');
console.log('Look for warnings above and update those sections manually.');
