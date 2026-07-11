const fs = require('fs');
const path = require('path');

// Image dimension reader helper
function getImageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.readUInt32BE(0) === 0x89504E47 && buffer.readUInt32BE(4) === 0x0D0A1A0A) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { type: 'png', width, height };
  }
  if (buffer.readUInt16BE(0) === 0xFFD8) {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer.readUInt16BE(offset);
      offset += 2;
      if ((marker >= 0xFFC0 && marker <= 0xFFC3) || (marker >= 0xFFC5 && marker <= 0xFFC7) || (marker >= 0xFFC9 && marker <= 0xFFCB) || (marker >= 0xFFCD && marker <= 0xFFCF)) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return { type: 'jpeg', width, height };
      }
      if (offset < buffer.length) {
        const length = buffer.readUInt16BE(offset);
        offset += length;
      }
    }
  }
  return null;
}

const unmatched = [
  '1774405255370-xqt8m.png',
  '1774966454596-c1ybvn.jpg',
  '1774967394474-kvhpzq.jpg',
  '1775151368488-bbm12g.jpeg',
  '1775164377431-sfzqm.jpeg',
  '1775221817274-c27o8.jpeg',
  '1777062036931-86qg7.jpeg'
];

const uploadsDir = 'uploads';
const uploadFiles = fs.readdirSync(uploadsDir).map(file => {
  const filepath = path.join(uploadsDir, file);
  const size = fs.statSync(filepath).size;
  const dims = getImageDimensions(filepath);
  return { file, size, dims };
});

unmatched.forEach(ufName => {
  const zfPath = path.join('supabase-files', ufName);
  const zfSize = fs.statSync(zfPath).size;
  const zfDims = getImageDimensions(zfPath);
  
  console.log(`\nUnmatched Zip File: ${ufName} (dims: ${zfDims ? `${zfDims.width}x${zfDims.height}` : 'unknown'}, size: ${zfSize})`);
  
  const matches = uploadFiles.map(uf => {
    let score = 0;
    // Difference in file size
    const sizeDiff = Math.abs(uf.size - zfSize);
    
    // Difference in dimensions
    let dimDiff = Infinity;
    if (zfDims && uf.dims) {
      dimDiff = Math.abs(uf.dims.width - zfDims.width) + Math.abs(uf.dims.height - zfDims.height);
    }
    
    return { uf, sizeDiff, dimDiff };
  });
  
  // Sort by size difference
  matches.sort((a, b) => a.sizeDiff - b.sizeDiff);
  
  console.log('  Top size matches:');
  matches.slice(0, 5).forEach(m => {
    const uDims = m.uf.dims ? `${m.uf.dims.width}x${m.uf.dims.height}` : 'unknown';
    console.log(`   - ${m.uf.file} (dims: ${uDims}, size: ${m.uf.size}, sizeDiff: ${m.sizeDiff})`);
  });
  
  // Sort by dimension difference
  matches.sort((a, b) => a.dimDiff - b.dimDiff);
  console.log('  Top dimension matches:');
  matches.slice(0, 3).forEach(m => {
    const uDims = m.uf.dims ? `${m.uf.dims.width}x${m.uf.dims.height}` : 'unknown';
    console.log(`   - ${m.uf.file} (dims: ${uDims}, size: ${m.uf.size}, dimDiff: ${m.dimDiff}, sizeDiff: ${m.sizeDiff})`);
  });
});
