const fs = require('fs');
const content = fs.readFileSync('full_migration_with_data.sql', 'utf8');

const regex = /177\d{10}/g;
const matches = content.match(regex) || [];
console.log(`Found ${matches.length} timestamps starting with 177:`);
const unique = [...new Set(matches)];
console.log(`Unique timestamps starting with 177: ${unique.length}`);
console.log(unique.sort().slice(0, 20));
