const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Pure JS PNG/JPEG dimension reader
function getImageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  
  // Check PNG signature
  if (buffer.readUInt32BE(0) === 0x89504E47 && buffer.readUInt32BE(4) === 0x0D0A1A0A) {
    // PNG IHDR chunk starts at byte 12. Width is at 16, height at 20 (both 32-bit BE integers)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { type: 'png', width, height };
  }
  
  // Check JPEG signature
  if (buffer.readUInt16BE(0) === 0xFFD8) {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer.readUInt16BE(offset);
      offset += 2;
      
      // SOF0 (Start of Frame 0) is 0xFFC0, SOF2 is 0xFFC2
      // Standard JPEG SOF markers are FFC0-FFC3, FFC5-FFC7, FFC9-FFCB, FFCD-FFCF
      if ((marker >= 0xFFC0 && marker <= 0xFFC3) || (marker >= 0xFFC5 && marker <= 0xFFC7) || (marker >= 0xFFC9 && marker <= 0xFFCB) || (marker >= 0xFFCD && marker <= 0xFFCF)) {
        // Skip length (2 bytes) and precision (1 byte)
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return { type: 'jpeg', width, height };
      }
      
      // Skip chunk length
      if (offset < buffer.length) {
        const length = buffer.readUInt16BE(offset);
        offset += length;
      }
    }
  }
  
  return null;
}

const zipDir = 'supabase-files';
const uploadsDir = 'uploads';

const zipFiles = fs.readdirSync(zipDir).map(file => {
  const filepath = path.join(zipDir, file);
  const size = fs.statSync(filepath).size;
  const md5 = crypto.createHash('md5').update(fs.readFileSync(filepath)).digest('hex');
  const dims = getImageDimensions(filepath);
  return { file, filepath, size, md5, dims };
});

const uploadFiles = fs.readdirSync(uploadsDir).map(file => {
  const filepath = path.join(uploadsDir, file);
  const size = fs.statSync(filepath).size;
  const md5 = crypto.createHash('md5').update(fs.readFileSync(filepath)).digest('hex');
  const dims = getImageDimensions(filepath);
  return { file, filepath, size, md5, dims };
});

console.log(`Loaded ${zipFiles.length} zip files and ${uploadFiles.length} upload files.`);

const matched = [];
const unmatched = [];

zipFiles.forEach(zf => {
  // 1. MD5 match
  let match = uploadFiles.find(uf => uf.md5 === zf.md5);
  let method = 'MD5 Match';
  
  // 2. Dimension and size match
  if (!match && zf.dims) {
    // Find all uploads with exact width and height
    const candidateUploads = uploadFiles.filter(uf => uf.dims && uf.dims.width === zf.dims.width && uf.dims.height === zf.dims.height);
    if (candidateUploads.length === 1) {
      match = candidateUploads[0];
      method = 'Unique Dimension Match';
    } else if (candidateUploads.length > 1) {
      // Find the one closest in file size
      candidateUploads.sort((a, b) => Math.abs(a.size - zf.size) - Math.abs(b.size - zf.size));
      match = candidateUploads[0];
      method = `Dimension Match + Closest Size (diff: ${Math.abs(match.size - zf.size)})`;
    }
  }
  
  // 3. Closest size match as final fallback if size diff is < 5000 bytes
  if (!match) {
    const sortedBySize = [...uploadFiles].sort((a, b) => Math.abs(a.size - zf.size) - Math.abs(b.size - zf.size));
    const best = sortedBySize[0];
    const diff = Math.abs(best.size - zf.size);
    if (diff < 5000) {
      match = best;
      method = `Fuzzy Size Match (diff: ${diff})`;
    }
  }

  if (match) {
    matched.push({ zip: zf, upload: match, method });
  } else {
    unmatched.push(zf);
  }
});

console.log(`\nSuccessfully matched ${matched.length} / ${zipFiles.length} zip files:`);
matched.forEach(m => {
  const zDims = m.zip.dims ? `${m.zip.dims.width}x${m.zip.dims.height}` : 'unknown';
  const uDims = m.upload.dims ? `${m.upload.dims.width}x${m.upload.dims.height}` : 'unknown';
  console.log(` - ${m.zip.file} (${zDims}) -> ${m.upload.file} (${uDims}) via [${m.method}]`);
});

if (unmatched.length > 0) {
  console.log(`\nUnmatched zip files (${unmatched.length}):`);
  unmatched.forEach(zf => {
    const dims = zf.dims ? `${zf.dims.width}x${zf.dims.height}` : 'unknown';
    console.log(` - ${zf.file} (dims: ${dims}, size: ${zf.size})`);
  });
}
