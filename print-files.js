const fs = require('fs');
const files = fs.readdirSync('supabase-files');

const parsed = files.map(file => {
  const parts = file.split('-');
  const timestamp = parseInt(parts[0], 10);
  const suffix = parts.slice(1).join('-');
  return { file, timestamp, suffix };
});

parsed.sort((a, b) => a.timestamp - b.timestamp);

console.log('Files in supabase-files folder sorted by timestamp:');
parsed.forEach(p => {
  console.log(` - ${p.file} (${new Date(p.timestamp).toISOString()})`);
});
