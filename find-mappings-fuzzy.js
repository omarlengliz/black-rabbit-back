const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Read files from zip directory
const zipDir = 'supabase-files';
const zipFiles = fs.readdirSync(zipDir).map(file => {
  const filepath = path.join(zipDir, file);
  const size = fs.statSync(filepath).size;
  const md5 = crypto.createHash('md5').update(fs.readFileSync(filepath)).digest('hex');
  return { file, filepath, size, md5 };
});

// 2. Read files from uploads directory
const uploadsDir = 'uploads';
const uploadFiles = fs.readdirSync(uploadsDir).map(file => {
  const filepath = path.join(uploadsDir, file);
  const size = fs.statSync(filepath).size;
  const md5 = crypto.createHash('md5').update(fs.readFileSync(filepath)).digest('hex');
  return { file, filepath, size, md5 };
});

// 3. Parse SQL file for menu items
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
    id: match[1],
    name: match[2],
    description: match[3] || '',
    price: match[4],
    categoryId: match[5] || null,
    imageUrl: match[6] || ''
  });
}

console.log(`Parsed ${sqlItems.length} menu items from SQL.`);

// Helper to normalize names for mapping
function cleanString(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/_d_jeuner_/g, 'dejeuner') // fix specific common typos/replacements
    .replace(/_d_jeuners_/g, 'dejeuner')
    .replace(/_d_/g, 'de') // e.g. Petit_D_jeuner -> Petit_Dejeuner
    .replace(/cr_pe/g, 'crepe') // e.g. Cr_pe -> crepe
    .replace(/g_teau/g, 'gateau')
    .replace(/fa_on/g, 'facon')
    .replace(/pan_/g, 'pane')
    .replace(/apr_s/g, 'apres')
    .replace(/caf_/g, 'cafe')
    .replace(/pi_ce/g, 'piece')
    .replace(/t_te/g, 'tete')
    .replace(/hach_e/g, 'hachee')
    .replace(/sal_e/g, 'salee')
    .replace(/sal_/g, 'sale')
    .replace(/boisson_chaude_/g, 'boissonchaude')
    .replace(/[^a-z0-9]/g, ''); // strip all other punctuation
}

// Map each upload file to a menu item
const uploadFileToItem = [];
uploadFiles.forEach(uf => {
  const ufClean = cleanString(uf.file.split('.')[0]);
  
  // Find a menu item that matches the upload filename
  let bestItem = sqlItems.find(item => cleanString(item.name) === ufClean);
  
  if (!bestItem) {
    // Try substring matching
    bestItem = sqlItems.find(item => {
      const itemClean = cleanString(item.name);
      return itemClean.includes(ufClean) || ufClean.includes(itemClean);
    });
  }
  
  if (bestItem) {
    uploadFileToItem.push({ uploadFile: uf, item: bestItem });
  } else {
    // console.log(`Could not map upload file: ${uf.file} (cleaned: ${ufClean})`);
  }
});

console.log(`Mapped ${uploadFileToItem.length} / ${uploadFiles.length} upload files to menu items.`);

// Map zip file to menu item
const mappedZip = [];
const unmappedZip = [];

zipFiles.forEach(zf => {
  // Strategy 1: Exact MD5 match to upload file
  let match = uploadFiles.find(uf => uf.md5 === zf.md5);
  let strategy = 'MD5 Match';
  
  // Strategy 2: Exact Size match to upload file
  if (!match) {
    match = uploadFiles.find(uf => uf.size === zf.size);
    strategy = 'Size Match';
  }
  
  // Strategy 3: Check if zip filename substring matches any SQL item's image URL filename
  if (!match) {
    const zfName = zf.file.toLowerCase();
    // Maybe the zip file name itself is in the SQL URL?
    const sqlItem = sqlItems.find(item => {
      if (!item.imageUrl) return false;
      const sqlFilename = path.basename(decodeURIComponent(item.imageUrl)).toLowerCase();
      return sqlFilename.includes(zfName) || zfName.includes(sqlFilename);
    });
    if (sqlItem) {
      mappedZip.push({ zip: zf, item: sqlItem, strategy: 'Filename Match in SQL URL' });
      return;
    }
  }

  if (match) {
    // Find the item mapped to this upload file
    const itemMap = uploadFileToItem.find(m => m.uploadFile.file === match.file);
    if (itemMap) {
      mappedZip.push({ zip: zf, item: itemMap.item, strategy: `${strategy} (${match.file})` });
    } else {
      // Try fuzzy matching the upload filename directly to menu items
      const ufClean = cleanString(match.file.split('.')[0]);
      const bestItem = sqlItems.find(item => cleanString(item.name) === ufClean);
      if (bestItem) {
        mappedZip.push({ zip: zf, item: bestItem, strategy: `${strategy} (Fuzzy fallback ${match.file})` });
      } else {
        unmappedZip.push({ zip: zf, uploadFile: match, reason: `Upload file ${match.file} is not mapped to any SQL item` });
      }
    }
  } else {
    unmappedZip.push({ zip: zf, reason: 'No MD5 or Size match to any upload file' });
  }
});

console.log(`\nSuccessfully mapped ${mappedZip.length} / ${zipFiles.length} zip files:`);
mappedZip.forEach(m => {
  console.log(` - ${m.zip.file} -> "${m.item.name}" [${m.strategy}]`);
});

if (unmappedZip.length > 0) {
  console.log(`\nUnmapped zip files (${unmappedZip.length}):`);
  unmappedZip.forEach(u => {
    if (u.uploadFile) {
      console.log(` - ${u.zip.file} (matched upload ${u.uploadFile.file} but no SQL item)`);
    } else {
      console.log(` - ${u.zip.file} (${u.reason})`);
    }
  });
}
