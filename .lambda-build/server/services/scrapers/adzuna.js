import axios from 'axios';

const COUNTRIES = ['us', 'gb'];
const PAGES_PER_KEYWORD = 2;

function normalizeJob(result) {
  const salary = result.salary_min && result.salary_max
    ? `${result.salary_min} - ${result.salary_max}`
    : result.salary_min || result.salary_max || null;

  return {
    title: result.title || '',
    company: result.company?.display_name || '',
    location: result.location?.display_name || 'Remote',
    url: result.redirect_url || '',
    description: result.description || '',
    salary,
    source: 'adzuna',
    tags: [],
    datePosted: result.created || null,
  };
}

export async function scrapeAdzuna(keywords) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) return [];

  try {
    const seen = new Set();
    const results = [];

    for (const keyword of keywords) {
      for (const country of COUNTRIES) {
        for (let page = 1; page <= PAGES_PER_KEYWORD; page++) {
          try {
            const { data } = await axios.get(
              `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
              {
                params: {
                  app_id: appId,
                  app_key: appKey,
                  what: keyword,
                  what_or: 'remote',
                  results_per_page: 20,
                },
                timeout: 10000,
              },
            );

            for (const result of data?.results || []) {
              const id = result.redirect_url || result.id || result.title;
              if (!seen.has(id)) {
                seen.add(id);
                results.push(normalizeJob(result));
              }
            }
          } catch {
            break;
          }
        }
      }
    }

    return results;
  } catch (err) {
    console.error('[adzuna] Scrape failed:', err.message);
    return [];
  }
}
