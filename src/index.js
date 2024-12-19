const axios = require('axios');
const puppeteer = require('puppeteer-core'); // Use puppeteer-core for specifying executablePath
const mysql = require('mysql2'); // MySQL package

const baseUrl = 'https://vimal.animoon.me/api/az-list?page=1'; // Anime list API
const infoUrl = 'https://hianimes.animoon.me/anime/info?id='; // Anime info API
const episodesUrl = 'https://hianimes.animoon.me/anime/episodes/'; // Episodes API
const watchUrl = 'https://gojo.wtf/watch/'; // Watch page URL
const providers = ['vibe', 'roro', 'zaza', 'shashh']; // List of providers

// MySQL connection setup
const db = mysql.createConnection({
  host: '145.223.118.168', // replace with your VPS IP or hostname
  user: 'king', // replace with your MySQL username
  password: 'Imperial_king2004', // replace with your MySQL password
  database: 'my_database' // replace with your MySQL database name
});

(async () => {
  const allResults = {
    m3u8Urls: [],
    tiddiesUrls: [],
    erroredEpisodes: []
  };

  // Step 1: Fetch anime list
  const response = await axios.get(baseUrl);
  const { totalPages, data } = response.data.results;

  // Step 2: Iterate through pages
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageData = await axios.get(`${baseUrl.replace('page=1', `page=${pageNum}`)}`);
    const animeList = pageData.data.results.data;

    // Step 3: Process each anime
    for (const anime of animeList) {
      const animeId = anime.data_id.split('/')[1];
      const animeInfo = await axios.get(`${infoUrl}${animeId}`);
      const { anilistId, name } = animeInfo.data.anime.info;

      let animeLink = anilistId;
      if (anilistId === 0) {
        console.log(`Anilist ID is 0. Searching for ${name} on Gojo.`);

        // Step 4: Use Puppeteer to find anime link
        animeLink = await fetchAnimeLinkWithPuppeteer(name);
        if (!animeLink) {
          console.log(`No valid anime link found for "${name}". Skipping this anime.`);
          continue; // Skip this anime and move to the next one
        }
      }

      // Skip to the next anime if no valid anime link is found (Anilist ID 0 and no Gojo link)
      if (animeLink === 0 || !animeLink) {
        console.log(`Skipping anime: ${name}, no valid anime link.`);
        continue; // Skip to the next anime if no valid anime link is found
      }

      // Step 6: Fetch episodes if animeLink is valid
      const episodesData = await axios.get(`${episodesUrl}${animeId}`);
      const { episodes } = episodesData.data;

      // Process episodes only if animeLink is valid
      for (const episode of episodes) {
        const ep = episode.number;

        // Step 7: Visit each provider's URL if animeLink is valid
        for (const provider of providers) {
          const watchPageUrl = `${watchUrl}${animeLink}?ep=${ep}&provider=${provider}`.replace('//anime/', '/');
          console.log(`Visiting: ${watchPageUrl} for provider: ${provider}`);

          try {
            // Use Puppeteer to extract m3u8 and tiddies URLs
            const { m3u8Urls, tiddiesUrls } = await extractM3u8Urls(watchPageUrl);

            // Aggregate results
            allResults.m3u8Urls.push(...m3u8Urls);
            allResults.tiddiesUrls.push(...tiddiesUrls);

            // Store data in MySQL database
            await storeEpisodeDataInDatabase(animeId, ep, provider, m3u8Urls, tiddiesUrls);
            console.log(`Extracted m3u8 URLs for ${watchPageUrl}:`, m3u8Urls);
            console.log(`Tiddies Requests for ${watchPageUrl}:`, tiddiesUrls);
          } catch (error) {
            // If error occurs, store the errored episode ID
            allResults.erroredEpisodes.push({ animeId, episode: ep, provider, error: error.message });
            await storeErroredEpisode(animeId, ep, provider, error.message);
            console.log(`Error extracting URLs for ${watchPageUrl} (Episode: ${ep}, Provider: ${provider}):`, error.message);
          }
        }
      }
    }
  }

  // Step 8: Log results
  logResults(allResults);
  db.end();
})();

// Function to fetch anime link using Puppeteer by searching HTML content
async function fetchAnimeLinkWithPuppeteer(animeName) {
  const browser = await puppeteer.launch({
    headless: false, // Run in non-headless mode
    executablePath: '/usr/bin/google-chrome', // Path to the installed Chrome version
    args: [
      '--no-sandbox', // Disables sandboxing
      '--disable-setuid-sandbox', // Disables setuid sandboxing
      '--disable-infobars', // Disables infobars
      '--disable-extensions', // Disables extensions
      '--disable-gpu', // Disables GPU acceleration
      '--remote-debugging-port=9222' // Enables remote debugging on port 9222
    ]
  });
  const page = await browser.newPage();

  const searchUrl = `https://gojo.wtf/search?query=${animeName}`;
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });

    // Fetch the page's HTML content
    const htmlContent = await page.content();

    // Use a regex to find the first href containing "/anime/"
    const match = htmlContent.match(/href="(\/anime\/[^"]+)"/);
    if (match && match[1]) {
      const animeLink = match[1];
      console.log(`Anime link for "${animeName}" found: ${animeLink}`);
      await browser.close();
      return animeLink;
    } else {
      console.log(`No /anime/ link found for "${animeName}".`);
    }
  } catch (error) {
    console.error(`Error fetching search page for ${animeName}:`, error.message);
  } finally {
    await browser.close();
  }
  return null;
}

// Function to extract m3u8 and tiddies URLs using Puppeteer
async function extractM3u8Urls(url) {
  const browser = await puppeteer.launch({
    headless: false, // Run in non-headless mode
    executablePath: '/usr/bin/google-chrome', // Path to the installed Chrome version
    args: [
      '--no-sandbox', // Disables sandboxing
      '--disable-setuid-sandbox', // Disables setuid sandboxing
      '--disable-infobars', // Disables infobars
      '--disable-extensions', // Disables extensions
      '--disable-gpu', // Disables GPU acceleration
      '--remote-debugging-port=9222' // Enables remote debugging on port 9222
    ]
  });
  const page = await browser.newPage();

  const m3u8Urls = [];
  const tiddiesUrls = [];

  // Intercept network requests
  page.on('response', async (response) => {
    const requestUrl = response.url();
    if (requestUrl.includes('.m3u8')) {
      m3u8Urls.push(requestUrl);
    }
    if (requestUrl.includes('tiddies')) {
      tiddiesUrls.push(requestUrl);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Log the fetched HTML
    await page.waitForTimeout(5000); // Wait for network activity
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
  }

  await browser.close();
  return { m3u8Urls, tiddiesUrls };
}

// Function to store episode data in MySQL database
async function storeEpisodeDataInDatabase(animeId, episode, provider, m3u8Urls, tiddiesUrls) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO episodes (anime_id, episode_number, provider, m3u8_urls, tiddies_urls)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.execute(query, [animeId, episode, provider, JSON.stringify(m3u8Urls), JSON.stringify(tiddiesUrls)], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// Function to store errored episode in MySQL database
async function storeErroredEpisode(animeId, episodeNumber, provider, errorMessage) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO errored_episodes (anime_id, episode_number, provider, error_message)
      VALUES (?, ?, ?, ?)
    `;
    db.execute(query, [animeId, episodeNumber, provider, errorMessage], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// Function to log results
function logResults(allResults) {
  console.log('All Results:', allResults);
  // Save results to a file or database as needed
}
