const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getMd5(filepath) {
  const data = fs.readFileSync(filepath);
  return crypto.createHash('md5').update(data).digest('hex');
}

const zipDir = 'supabase-files';
const uploadsDir = 'uploads';

const zipFiles = fs.readdirSync(zipDir).map(file => {
  const filepath = path.join(zipDir, file);
  const size = fs.statSync(filepath).size;
  return { file, filepath, size, md5: getMd5(filepath) };
});

const uploadFiles = fs.readdirSync(uploadsDir).map(file => {
  const filepath = path.join(uploadsDir, file);
  const size = fs.statSync(filepath).size;
  return { file, filepath, size, md5: getMd5(filepath) };
});

console.log(`Zip files: ${zipFiles.length}, Upload files: ${uploadFiles.length}`);

// Find exact md5 matches
const exactMatches = [];
zipFiles.forEach(zf => {
  const match = uploadFiles.find(uf => uf.md5 === zf.md5);
  if (match) {
    exactMatches.push({ zip: zf.file, upload: match.file });
  }
});

console.log(`\nExact MD5 matches: ${exactMatches.length}`);
exactMatches.forEach(m => console.log(` - ${m.zip} === ${m.upload}`));

// Let's print some unmatched zip files sizes and try to find closest sizes in uploads
console.log('\nClosest size matches for first 10 zip files:');
zipFiles.slice(0, 10).forEach(zf => {
  const diffs = uploadFiles.map(uf => ({ uf, diff: Math.abs(uf.size - zf.size) }));
  diffs.sort((a, b) => a.diff - b.diff);
  console.log(`Zip: ${zf.file} (size: ${zf.size})`);
  console.log(`  Closest: ${diffs[0].uf.file} (size: ${diffs[0].uf.size}, diff: ${diffs[0].diff})`);
});
