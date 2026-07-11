const fs = require('fs');
const content = fs.readFileSync('full_migration_with_data.sql', 'utf8');

const zipDir = 'supabase-files';
const zipFiles = fs.readdirSync(zipDir);

console.log('Searching for zip file names in the SQL file...');
let foundCount = 0;
zipFiles.forEach(file => {
  const base = file.split('.')[0];
  const parts = base.split('-');
  const idPart = parts[parts.length - 1]; // e.g. xqt8m or jjsbt
  
  if (content.includes(idPart)) {
    console.log(`Found match for zip file "${file}" using part "${idPart}"`);
    foundCount++;
  }
});

console.log(`Total matched files: ${foundCount} / ${zipFiles.length}`);
