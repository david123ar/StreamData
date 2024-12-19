// interceptRequests.js (or your relevant file)

async function interceptRequests(page, { urlToVisit, timeout = 5000, waitUntil = 'networkidle2' }) {
  const m3u8Urls = [];
  const tiddiesUrls = [];

  try {
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('.m3u8')) {
        m3u8Urls.push(url);
      }
      request.continue();
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.toLowerCase().includes('tiddies')) {
        try {
          const responseBody = await response.text();
          tiddiesUrls.push({ url, responseBody });
        } catch (error) {
          console.error(`Error fetching response for ${url}:`, error);
        }
      }
    });

    await page.goto(urlToVisit, { waitUntil });
    await page.waitForTimeout(timeout);

  } catch (error) {
    console.error(`Error during intercepting requests for ${urlToVisit}:`, error);
  }

  return { m3u8Urls, tiddiesUrls };
}

module.exports = { interceptRequests };  // Make sure this line exists!
