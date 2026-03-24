import axios from 'axios';

const API_URL = 'https://remotive.com/api/remote-jobs?category=software-dev';

function matchesKeywords(job, keywords) {
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const tagString = (job.tags || []).join(' ').toLowerCase();

  return lowerKeywords.some(kw =>
    title.includes(kw) || description.includes(kw) || tagString.includes(kw)
  );
}

function normalizeJob(job) {
  return {
    title: job.title || '',
    company: job.company_name || '',
    location: job.candidate_required_location || 'Remote',
    url: job.url || '',
    description: job.description || '',
    salary: job.salary || null,
    source: 'remotive',
    tags: job.tags || [],
    datePosted: job.publication_date || null,
  };
}

export async function scrapeRemotive(keywords) {
  try {
    const { data } = await axios.get(API_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      timeout: 20000,
    });

    const jobs = data?.jobs || [];

    const filtered = keywords && keywords.length
      ? jobs.filter(job => matchesKeywords(job, keywords))
      : jobs;

    return filtered.map(normalizeJob);
  } catch (err) {
    console.error('[remotive] Scrape failed:', err.message);
    return [];
  }
}
