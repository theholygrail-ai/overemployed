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
      headers: { 'User-Agent': 'OverEmployed Job Scraper' },
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
