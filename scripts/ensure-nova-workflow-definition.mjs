#!/usr/bin/env node
/**
 * One-shot helper: list Nova Act workflow definitions in us-east-1, optionally create from JSON.
 *
 * Usage:
 *   NOVA_ACT_WORKFLOW_DEFINITION_NAME=my-wf node scripts/ensure-nova-workflow-definition.mjs
 *   NOVA_ACT_WORKFLOW_DEFINITION_NAME=my-wf node scripts/ensure-nova-workflow-definition.mjs ./path/to/extra-fields.json
 *
 * The JSON file (optional) may include description, exportConfig, clientToken — merged with name from env.
 * Full API shape: https://docs.aws.amazon.com/nova-act/latest/APIReference/API_CreateWorkflowDefinition.html
 * Samples: https://github.com/amazon-agi-labs/nova-act-samples
 */

import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  NovaActClient,
  ListWorkflowDefinitionsCommand,
  CreateWorkflowDefinitionCommand,
} from '@aws-sdk/client-nova-act';

const REGION = 'us-east-1';

async function listAllDefinitions(client) {
  const out = [];
  let nextToken;
  do {
    const page = await client.send(
      new ListWorkflowDefinitionsCommand({ maxResults: 50, nextToken }),
    );
    out.push(...(page.workflowDefinitionSummaries || []));
    nextToken = page.nextToken;
  } while (nextToken);
  return out;
}

async function main() {
  const name = String(process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME || '').trim();
  if (!name) {
    console.error('Set NOVA_ACT_WORKFLOW_DEFINITION_NAME (1–40 chars, [a-zA-Z0-9_-]+).');
    process.exit(1);
  }

  const client = new NovaActClient({ region: REGION });
  const all = await listAllDefinitions(client);
  const exists = all.some(d => d.workflowDefinitionName === name);
  if (exists) {
    console.log(`Workflow definition "${name}" already exists in ${REGION}.`);
    process.exit(0);
  }

  const specPath = process.argv[2] || String(process.env.NOVA_ACT_WORKFLOW_DEFINITION_SPEC_PATH || '').trim();
  if (!specPath) {
    console.error(
      `No definition named "${name}". Create it in the AWS console, Nova Act CLI, or CDK (see nova-act-samples),`,
    );
    console.error('then re-run this script to verify, or pass a JSON file path for extra CreateWorkflowDefinition fields.');
    process.exit(2);
  }

  const raw = await fs.readFile(specPath, 'utf8');
  const extra = JSON.parse(raw);
  const clientToken =
    extra.clientToken || `ensure-wf-${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
  if (clientToken.length < 33) {
    console.error('clientToken must be at least 33 characters (or omit for auto-generated).');
    process.exit(1);
  }

  const { name: _n, ...rest } = extra;
  const input = {
    name,
    ...rest,
    clientToken,
  };

  const created = await client.send(new CreateWorkflowDefinitionCommand(input));
  console.log(`Created workflow definition "${name}" in ${REGION}. status=${created.status ?? '?'}`);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
