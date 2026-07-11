const fs = require('fs');
const path = require('path');

// 1. Read zip folder files
const zipDir = 'supabase-files';
const zipFiles = fs.readdirSync(zipDir);
console.log(`Zip contains ${zipFiles.length} files.`);

// 2. Parse SQL file for menu items inserts
const content = fs.readFileSync('full_migration_with_data.sql', 'utf8');

// The format of insert:
// INSERT INTO "public"."menu_items" (...) VALUES
// ('id', 'name', 'desc', 'price', 'category_id', 'image_url', ...)
// Let's find the main INSERT INTO "public"."menu_items" statement
const menuItemsSectionStart = content.indexOf('INSERT INTO "public"."menu_items"');
if (menuItemsSectionStart === -1) {
  console.log('Could not find menu_items insert statement');
  process.exit(1);
}

// Find the end of this INSERT statement (ends with a semicolon)
const menuItemsSectionEnd = content.indexOf(';', menuItemsSectionStart);
const menuItemsSection = content.substring(menuItemsSectionStart, menuItemsSectionEnd);

// Parse the rows
// Format: ('id', 'name', 'desc', 'price', 'category_id', 'image_url', ...)
// Let's split by '), \n' or similar, or just parse using regex
const rowRegex = /\(\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*(?:'([^']*)'|null)\s*,\s*'([^']+)'\s*,\s*(?:'([^']+)'|null)\s*,\s*'([^']*)'\s*,/g;
let match;
const sqlItems = [];
while ((match = rowRegex.exec(menuItemsSection)) !== null) {
  sqlItems.push({
    id: match[1],
    name: match[2],
    description: match[3] || '',
    price: match[4],
    categoryId: match[5] || null,
    imageUrl: match[6] || ''
  });
}

console.log(`Parsed ${sqlItems.length} menu items from SQL.`);

// Try to match each menu item's image URL filename with the zip files
// Example URL: https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779461668947-6rvhs0v.jpeg
// Suffix/filename is 1779461668947-6rvhs0v.jpeg
// Let's check how many match exactly by name, and how many don't.
const matches = [];
const missing = [];
sqlItems.forEach(item => {
  if (!item.imageUrl) {
    missing.push({ item, reason: 'No image URL' });
    return;
  }
  
  // Extract filename
  const filename = path.basename(decodeURIComponent(item.imageUrl));
  
  // Check if this file exists in zipFiles
  const zipMatch = zipFiles.find(zf => zf.toLowerCase() === filename.toLowerCase());
  if (zipMatch) {
    matches.push({ item, filename, zipMatch });
  } else {
    // Try fuzzy match: does the item name or some part of URL match?
    // E.g. raw github URL: https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Ice%20spanish%20latte.jpeg
    // Filename: Ice spanish latte.jpeg
    // Maybe the zip file has a timestamp prefix like: 1775226173807-0nad0a.jpeg?
    missing.push({ item, filename });
  }
});

console.log(`\nExact matches: ${matches.length}`);
console.log(`Unmatched: ${missing.length}`);

console.log('\n--- Sample unmatched items ---');
missing.slice(0, 15).forEach(m => {
  console.log(`Item Name: "${m.item.name}"`);
  console.log(`  SQL URL: ${m.item.imageUrl}`);
  console.log(`  SQL Filename: ${m.filename || 'None'}`);
});
