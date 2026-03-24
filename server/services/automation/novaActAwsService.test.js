import { describe, it, expect, afterEach } from 'vitest';
import { isNovaActAwsApplyConfigured } from './novaActAwsService.js';

describe('novaActAwsService', () => {
  const prev = process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME;

  afterEach(() => {
    if (prev === undefined) delete process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME;
    else process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME = prev;
  });

  it('isNovaActAwsApplyConfigured is false when unset', () => {
    delete process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME;
    expect(isNovaActAwsApplyConfigured()).toBe(false);
  });

  it('isNovaActAwsApplyConfigured is true when name is set', () => {
    process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME = 'my-workflow-def';
    expect(isNovaActAwsApplyConfigured()).toBe(true);
  });
});
