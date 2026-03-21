import pkg from 'linkedin-jobs-scraper';

const { LinkedinScraper, relevanceFilter, timeFilter, onSiteOrRemoteFilter } = pkg;

function normalizeJob(data) {
  return {
    title: data.title || '',
    company: data.company || '',
    location: data.place || 'Remote',
    url: data.link || '',
    description: (data.description || '').slice(0, 1000),
    salary: null,
    source: 'linkedin',
    tags: [],
    datePosted: data.date || null,
  };
}

async function runScraper({ keywords, location, limit, liAtCookie }) {
  if (liAtCookie) {
    process.env.LI_AT_COOKIE = liAtCookie;
  }

  const scraper = new LinkedinScraper({
    headless: true,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const jobs = [];

  scraper.on(pkg.events.scraper.data, (data) => {
    jobs.push(normalizeJob(data));
  });

  scraper.on(pkg.events.scraper.error, () => {});
  scraper.on(pkg.events.scraper.invalidSession, () => {});

  const queries = (keywords || []).slice(0, 3).map(kw => ({
    query: kw,
    options: {
      locations: [location],
      limit,
      filters: {
        relevance: relevanceFilter.RELEVANT,
        time: timeFilter.MONTH,
        onSiteOrRemote: onSiteOrRemoteFilter.REMOTE,
      },
    },
  }));

  try {
    await scraper.run(queries);
  } catch {}

  try { await scraper.close(); } catch {}

  process.stdout.write('\n__LINKEDIN_RESULT__' + JSON.stringify(jobs) + '__END__\n');
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', async () => {
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    input = {};
  }

  const {
    keywords = [],
    location = 'Remote',
    limit = 15,
    liAtCookie,
  } = input;

  try {
    await runScraper({ keywords, location, limit, liAtCookie });
    process.exit(0);
  } catch (err) {
    const msg = err?.message || String(err);
    process.stderr.write(msg + '\n');
    process.stdout.write('\n__LINKEDIN_RESULT__[]__END__\n');
    process.exit(1);
  }
});
