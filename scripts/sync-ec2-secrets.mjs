/**
 * Merge repo .env into AWS Secrets Manager secret `overemployed/ec2-env`
 * (used by EC2 user-data / SSM to write /opt/overemployed/.env).
 *
 * Usage: node scripts/sync-ec2-secrets.mjs
 * Requires: AWS CLI credentials, .env in repo root (see .env.example).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadDotEnv() {
  const p = path.join(root, '.env');
  if (!fs.existsSync(p)) {
    console.error('Missing .env — copy from .env.example and fill keys.');
    process.exit(1);
  }
  const out = {};
  const raw = fs.readFileSync(p, 'utf-8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function awsJson(cmd) {
  return JSON.parse(execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function main() {
  const region = process.env.AWS_REGION || 'eu-north-1';
  const secretId = 'overemployed/ec2-env';
  const ec2Ip = process.env.OVEREMPLOYED_EC2_IP || '51.20.53.192';

  const local = loadDotEnv();
  const cur = JSON.parse(
    execSync(
      `aws secretsmanager get-secret-value --region ${region} --secret-id ${secretId} --query SecretString --output text`,
      { encoding: 'utf-8' },
    ),
  );

  const merged = {
    ...cur,
    GROQ_API_KEY: local.GROQ_API_KEY || cur.GROQ_API_KEY || '',
    NOVA_ACT_API_KEY: local.NOVA_ACT_API_KEY || cur.NOVA_ACT_API_KEY || '',
    NOVA_ACT_WORKFLOW_DEFINITION_NAME:
      local.NOVA_ACT_WORKFLOW_DEFINITION_NAME || cur.NOVA_ACT_WORKFLOW_DEFINITION_NAME || '',
    NOVA_ACT_MODEL_ID: local.NOVA_ACT_MODEL_ID || cur.NOVA_ACT_MODEL_ID || 'nova-act-latest',
    ADZUNA_APP_ID: local.ADZUNA_APP_ID || cur.ADZUNA_APP_ID || '',
    ADZUNA_APP_KEY: local.ADZUNA_APP_KEY || cur.ADZUNA_APP_KEY || '',
    LINKEDIN_CLIENT_ID: local.LINKEDIN_CLIENT_ID || cur.LINKEDIN_CLIENT_ID || '',
    LINKEDIN_CLIENT_SECRET: local.LINKEDIN_CLIENT_SECRET || cur.LINKEDIN_CLIENT_SECRET || '',
    LINKEDIN_REDIRECT_URI:
      local.LINKEDIN_REDIRECT_URI?.includes('localhost')
        ? `http://${ec2Ip}:4900/api/auth/linkedin/callback`
        : local.LINKEDIN_REDIRECT_URI || cur.LINKEDIN_REDIRECT_URI || `http://${ec2Ip}:4900/api/auth/linkedin/callback`,
    FRONTEND_URL: local.FRONTEND_URL || cur.FRONTEND_URL || '',
    FRONTEND_URLS:
      local.FRONTEND_URLS ||
      process.env.FRONTEND_URLS ||
      cur.FRONTEND_URLS ||
      '',
    API_KEY: local.API_KEY || cur.API_KEY || '',
    DATA_S3_BUCKET: local.DATA_S3_BUCKET || cur.DATA_S3_BUCKET || '',
    DYNAMODB_TABLE_NAME: local.DYNAMODB_TABLE_NAME || cur.DYNAMODB_TABLE_NAME || 'TheHolyGrail-Applications',
    AWS_REGION: local.AWS_REGION || region,
    PORT: local.PORT || cur.PORT || '4900',
  };

  const tmp = path.join(root, '.ec2-secret.tmp.json');
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf-8');
  try {
    execSync(
      `aws secretsmanager put-secret-value --region ${region} --secret-id ${secretId} --secret-string file://${tmp.replace(/\\/g, '/')}`,
      { stdio: 'inherit' },
    );
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log('Updated Secrets Manager secret:', secretId, '(' + region + ')');
}

main();
