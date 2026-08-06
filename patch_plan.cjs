const fs = require('fs');
const content = fs.readFileSync('src/repositories/TripsRepository.ts', 'utf8');
console.log(content.match(/loadLegacyTripsOnce/g)?.length || 0);
console.log(content.match(/loadCompanyLegacyTripsOnce/g)?.length || 0);
console.log(content.match(/loadDriverLegacyTripsOnce/g)?.length || 0);
