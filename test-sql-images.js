const fs = require('fs');
const content = fs.readFileSync('full_migration_with_data.sql', 'utf8');

// Find all matches for https://... or any image filename
const urlRegex = /https?:\/\/[^\s',)]+/g;
const urls = content.match(urlRegex) || [];

console.log(`Found ${urls.length} URLs in the SQL file:`);
const uniqueUrls = [...new Set(urls)].filter(url => {
  return url.toLowerCase().includes('.jpeg') || 
         url.toLowerCase().includes('.jpg') || 
         url.toLowerCase().includes('.png') || 
         url.toLowerCase().includes('.webp') ||
         url.includes('menu-images');
});

console.log(`Found ${uniqueUrls.length} unique image URLs:`);
uniqueUrls.forEach(url => console.log(' - ' + url));
