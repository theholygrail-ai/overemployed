#!/usr/bin/env node
/**
 * AWS-only EC2 API deploy: git archive → S3 → SSM RunShellScript on overemployed-api.
 * Requires: AWS CLI (same account as EC2), instance online in SSM.
 *
 * Usage: node scripts/deploy-ec2-api.mjs
 * Env:   AWS_REGION=eu-north-1 (default), EC2_INSTANCE_ID, S3_BUCKET, S3_KEY_PREFIX
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const REGION = process.env.AWS_REGION || 'eu-north-1';
const INSTANCE_ID = process.env.EC2_INSTANCE_ID || 'i-04d5210ffc3132ada';
const BUCKET = process.env.S3_BUCKET || 'overemployed-code-974560757141';
const PREFIX = process.env.S3_KEY_PREFIX || 'releases';

function sh(bin, args, opts = {}) {
  execFileSync(bin, args, { stdio: 'inherit', ...opts });
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const tmp = mkdtempSync(join(tmpdir(), 'oe-deploy-'));
const tarPath = join(tmp, 'oe-main.tar.gz');
try {
  sh('git', ['-C', root, 'archive', '--format=tar.gz', '-o', tarPath, 'HEAD']);
  const namedKey = `${PREFIX}/oe-main-${sha.slice(0, 7)}.tar.gz`;
  const latestKey = `${PREFIX}/oe-main-latest.tar.gz`;
  sh('aws', ['s3', 'cp', tarPath, `s3://${BUCKET}/${namedKey}`, '--region', REGION]);
  sh('aws', ['s3', 'cp', `s3://${BUCKET}/${namedKey}`, `s3://${BUCKET}/${latestKey}`, '--region', REGION]);

  const paramsPath = join(root, 'scripts', 'aws-provision', 'ssm-deploy-s3-tarball.json');
  const parameters = JSON.parse(readFileSync(paramsPath, 'utf8'));

  const reqFile = join(tmp, 'ssm-input.json');
  writeFileSync(
    reqFile,
    JSON.stringify({
      InstanceIds: [INSTANCE_ID],
      DocumentName: 'AWS-RunShellScript',
      Comment: `overemployed API deploy ${sha.slice(0, 7)} via S3+SSM`,
      TimeoutSeconds: 900,
      Parameters: parameters,
    }),
  );

  const out = execFileSync(
    'aws',
    [
      'ssm',
      'send-command',
      '--region',
      REGION,
      '--cli-input-json',
      pathToFileURL(reqFile).href,
      '--output',
      'json',
    ],
    { encoding: 'utf8' },
  );
  const { Command } = JSON.parse(out);
  const cmdId = Command.CommandId;
  console.log(`SSM CommandId=${cmdId}`);
  console.log(
    `Poll: aws ssm get-command-invocation --region ${REGION} --command-id ${cmdId} --instance-id ${INSTANCE_ID} --query Status`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
