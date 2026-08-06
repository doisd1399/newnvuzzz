const fs = require('fs');
const content = fs.readFileSync('src/repositories/TripsRepository.ts', 'utf8');
console.log(content.includes('legacyTripsCache = null;'));
