/**
 * Local proof: Browserbase env + Stagehand LLM key + optional live API project lookup.
 * Usage: npm run probe:browserbase
 *        npm run probe:browserbase -- --verify
 */
import 'dotenv/config';
import process from 'node:process';

const { isBrowserbaseApplyConfigured, probeBrowserbaseApply } = await import(
  '../server/services/automation/browserbaseApplyService.js'
);

const verify = process.argv.includes('--verify');

console.log('--- Browserbase / Stagehand apply probe ---');
console.log('BROWSERBASE_API_KEY set:', Boolean(String(process.env.BROWSERBASE_API_KEY || '').trim()));
console.log('BROWSERBASE_PROJECT_ID:', String(process.env.BROWSERBASE_PROJECT_ID || '(missing)').slice(0, 40));
console.log('STAGEHAND_MODEL:', process.env.STAGEHAND_MODEL || '(default openai/gpt-4o)');
console.log('isBrowserbaseApplyConfigured:', isBrowserbaseApplyConfigured());
console.log('probeBrowserbaseApply (env + LLM key):', probeBrowserbaseApply());

if (!isBrowserbaseApplyConfigured()) {
  console.log('\nSet BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in .env (gitignored).');
  process.exit(1);
}

if (!probeBrowserbaseApply()) {
  console.log('\nSet the API key for your STAGEHAND_MODEL provider (e.g. OPENAI_API_KEY or GROQ_API_KEY).');
  process.exit(1);
}

if (verify) {
  const { default: Browserbase } = await import('@browserbasehq/sdk');
  const apiKey = String(process.env.BROWSERBASE_API_KEY || '').trim();
  const projectId = String(process.env.BROWSERBASE_PROJECT_ID || '').trim();
  try {
    const bb = new Browserbase({ apiKey });
    const project = await bb.projects.retrieve(projectId);
    console.log('\n--- Browserbase API verify OK ---');
    console.log('Project:', project.name, `(${project.id})`);
  } catch (e) {
    console.error('\n--- Browserbase API verify FAILED ---');
    console.error(e?.message || e);
    process.exit(1);
  }
} else {
  console.log('\nTip: npm run probe:browserbase -- --verify   # calls Browserbase API');
}

console.log('\nOK — apply will use Browserbase + Stagehand when you run the API server.');
process.exit(0);
