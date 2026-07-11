const fs = require('fs');
const content = fs.readFileSync('full_migration_with_data.sql', 'utf8');

// Find occurrences of "storage.objects" or "objects" in storage schema
const storageInserts = [];
let index = 0;
while (true) {
  index = content.indexOf('storage.objects', index);
  if (index === -1) break;
  storageInserts.push(content.substring(index - 50, index + 100));
  index += 15;
}

console.log(`Found ${storageInserts.length} occurrences of storage.objects:`);
storageInserts.forEach((str, i) => console.log(`[${i}] ${str.replace(/\r?\n/g, ' ')}`));

// Also let's check for "storage.buckets"
const bucketInserts = [];
index = 0;
while (true) {
  index = content.indexOf('storage.buckets', index);
  if (index === -1) break;
  bucketInserts.push(content.substring(index - 50, index + 100));
  index += 15;
}
console.log(`\nFound ${bucketInserts.length} occurrences of storage.buckets:`);
bucketInserts.forEach((str, i) => console.log(`[${i}] ${str.replace(/\r?\n/g, ' ')}`));
