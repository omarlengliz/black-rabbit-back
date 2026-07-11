const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Read files from zip directory
const zipDir = 'supabase-files';
const zipFiles = fs.readdirSync(zipDir).map(file => {
  const filepath = path.join(zipDir, file);
  const size = fs.statSync(filepath).size;
  return { file, filepath, size };
});

// 2. Read files from uploads directory
const uploadsDir = 'uploads';
const uploadFiles = fs.readdirSync(uploadsDir).map(file => {
  const filepath = path.join(uploadsDir, file);
  const size = fs.statSync(filepath).size;
  return { file, filepath, size };
});

// 3. Parse SQL file for menu items
const sqlContent = fs.readFileSync('full_migration_with_data.sql', 'utf8');

// Parse the menu items from SQL
// Example: ('0090d588-313b-45e3-b91e-d0fc7899926d', 'Cappuccino ', '', '5.00', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779461668947-6rvhs0v.jpeg', true, false, 0, '[]', '[]'),
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
    id: match[1],
    name: match[2],
    description: match[3] || '',
    price: match[4],
    categoryId: match[5] || null,
    imageUrl: match[6] || ''
  });
}

console.log(`Parsed ${sqlItems.length} menu items from SQL.`);

// Normalize names for comparison
function normalizeName(name) {
  return name.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-\s\(\),']/g, '');
}

// Map upload file to menu item
const uploadFileToItem = [];
uploadFiles.forEach(uf => {
  const ufNorm = normalizeName(uf.file.split('.')[0]);
  
  // Find a menu item that matches the upload filename
  let bestItem = sqlItems.find(item => normalizeName(item.name) === ufNorm);
  
  if (!bestItem) {
    // Try substring matching
    bestItem = sqlItems.find(item => {
      const itemNorm = normalizeName(item.name);
      return itemNorm.includes(ufNorm) || ufNorm.includes(itemNorm);
    });
  }
  
  if (bestItem) {
    uploadFileToItem.push({ uploadFile: uf, item: bestItem });
  }
});

console.log(`Mapped ${uploadFileToItem.length} / ${uploadFiles.length} upload files to menu items.`);

// Map zip file to upload file (by MD5 or exact size or name)
const zipFileToItem = [];
const mappedZipFiles = new Set();

// Strategy 1: MD5 Match
zipFiles.forEach(zf => {
  const zfMd5 = crypto.createHash('md5').update(fs.readFileSync(zf.filepath)).digest('hex');
  
  const uploadMatch = uploadFiles.find(uf => {
    const ufMd5 = crypto.createHash('md5').update(fs.readFileSync(uf.filepath)).digest('hex');
    return ufMd5 === zfMd5;
  });
  
  if (uploadMatch) {
    const mapped = uploadFileToItem.find(m => m.uploadFile.file === uploadMatch.file);
    if (mapped) {
      zipFileToItem.push({
        zipFile: zf,
        item: mapped.item,
        strategy: 'MD5 match to ' + uploadMatch.file
      });
      mappedZipFiles.add(zf.file);
    }
  }
});

// Strategy 2: Exact size match
zipFiles.forEach(zf => {
  if (mappedZipFiles.has(zf.file)) return;
  
  const uploadMatch = uploadFiles.find(uf => uf.size === zf.size);
  if (uploadMatch) {
    const mapped = uploadFileToItem.find(m => m.uploadFile.file === uploadMatch.file);
    if (mapped) {
      zipFileToItem.push({
        zipFile: zf,
        item: mapped.item,
        strategy: 'Size match to ' + uploadMatch.file
      });
      mappedZipFiles.add(zf.file);
    }
  }
});

// Strategy 3: Substring name match in original SQL URL
// E.g. SQL URL: .../1779461668947-6rvhs0v.jpeg
// Zip filename: 1774405255370-xqt8m.png
// (No, we know timestamps don't match, but maybe we can look at the clean name if there's any other indicator)

console.log(`\nMapped ${zipFileToItem.length} / ${zipFiles.length} zip files to SQL menu items:`);
zipFileToItem.forEach(m => {
  console.log(` - ${m.zipFile.file} -> "${m.item.name}" (${m.strategy})`);
});

// Print unmatched zip files
const unmatchedZip = zipFiles.filter(zf => !mappedZipFiles.has(zf.file));
console.log(`\nUnmatched zip files (${unmatchedZip.length}):`);
unmatchedZip.forEach(zf => {
  console.log(` - ${zf.file} (size: ${zf.size})`);
});
