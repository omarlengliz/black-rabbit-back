const fs = require('fs');

const sqlContent = fs.readFileSync('full_migration_with_data.sql', 'utf8');

const menuItemsSectionStart = sqlContent.indexOf('INSERT INTO "public"."menu_items"');
if (menuItemsSectionStart === -1) {
  console.error('Could not find menu_items insert statement in SQL');
  process.exit(1);
}
const menuItemsSectionEnd = sqlContent.indexOf(';', menuItemsSectionStart);
const menuItemsSection = sqlContent.substring(menuItemsSectionStart, menuItemsSectionEnd);

const rowRegex = /\(\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*(?:'([^']*)'|null)\s*,\s*'([^']+)'\s*,\s*(?:'([^']+)'|null)\s*,\s*'([^']*)'\s*,/g;
let match;
const sqlItems = [];
while ((match = rowRegex.exec(menuItemsSection)) !== null) {
  sqlItems.push({
    name: match[2],
    imageUrl: match[6] || ''
  });
}

console.log('SQL Menu Items and their images:');
sqlItems.forEach((item, index) => {
  console.log(`${index + 1}. Name: "${item.name}" -> URL: "${item.imageUrl}"`);
});
