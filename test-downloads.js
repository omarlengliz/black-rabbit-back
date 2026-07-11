const fs = require('fs');
const axios = require('axios');

async function testDownload() {
  const urls = [
    'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779461668947-6rvhs0v.jpeg',
    'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/eau.jpeg',
    'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778620005102-pfda9j.jpeg'
  ];

  for (const url of urls) {
    try {
      console.log(`Testing download of ${url}...`);
      const response = await axios.head(url);
      console.log(`  -> Success! Status: ${response.status}`);
    } catch (err) {
      console.log(`  -> Failed: ${err.message}`);
    }
  }
}

testDownload();
