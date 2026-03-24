import axios from 'axios';

const API_URL = 'https://remoteok.com/api';

function matchesKeywords(job, keywords) {
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const position = (job.position || '').toLowerCase();
  const company = (job.company || '').toLowerCase();
  const tagString = (job.tags || []).join(' ').toLowerCase();

  return lowerKeywords.some(kw =>
    position.includes(kw) || company.includes(kw) || tagString.includes(kw)
  );
}

function normalizeJob(job) {
  const slug = job.slug ? `/remote-jobs/${job.slug}` : job.url || '';
  return {
    title: job.position || '',
    company: job.company || '',
    location: 'Remote',
    url: `https://remoteok.com${slug}`,
    description: job.description || '',
    salary: job.salary || null,
    source: 'remoteok',
    tags: job.tags || [],
    datePosted: job.date || null,
  };
}

export async function scrapeRemoteOK(keywords) {
  try {
    const { data } = await axios.get(API_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://remoteok.com/',
      },
      timeout: 20000,
    });

    const jobs = Array.isArray(data) ? data.slice(1) : [];

    const filtered = keywords && keywords.length
      ? jobs.filter(job => matchesKeywords(job, keywords))
      : jobs;

    return filtered.map(normalizeJob);
  } catch (err) {
    console.error('[remoteok] Scrape failed:', err.message);
    return [];
  }
}
