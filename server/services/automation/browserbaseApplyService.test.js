import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isBrowserbaseApplyConfigured,
  probeBrowserbaseApply,
} from './browserbaseApplyService.js';

describe('browserbaseApplyService config', () => {
  const prev = {
    bbKey: process.env.BROWSERBASE_API_KEY,
    bbProj: process.env.BROWSERBASE_PROJECT_ID,
    openai: process.env.OPENAI_API_KEY,
    model: process.env.STAGEHAND_MODEL,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };

  beforeEach(() => {
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
    delete process.env.OPENAI_API_KEY;
    delete process.env.STAGEHAND_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (prev.bbKey === undefined) delete process.env.BROWSERBASE_API_KEY;
    else process.env.BROWSERBASE_API_KEY = prev.bbKey;
    if (prev.bbProj === undefined) delete process.env.BROWSERBASE_PROJECT_ID;
    else process.env.BROWSERBASE_PROJECT_ID = prev.bbProj;
    if (prev.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev.openai;
    if (prev.model === undefined) delete process.env.STAGEHAND_MODEL;
    else process.env.STAGEHAND_MODEL = prev.model;
    if (prev.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev.anthropic;
  });

  it('isBrowserbaseApplyConfigured is false without keys', () => {
    expect(isBrowserbaseApplyConfigured()).toBe(false);
    expect(probeBrowserbaseApply()).toBe(false);
  });

  it('isBrowserbaseApplyConfigured is true with api key and project id', () => {
    process.env.BROWSERBASE_API_KEY = 'bb-key';
    process.env.BROWSERBASE_PROJECT_ID = 'proj-1';
    expect(isBrowserbaseApplyConfigured()).toBe(true);
  });

  it('probeBrowserbaseApply requires provider key for default openai model', () => {
    process.env.BROWSERBASE_API_KEY = 'bb-key';
    process.env.BROWSERBASE_PROJECT_ID = 'proj-1';
    expect(probeBrowserbaseApply()).toBe(false);
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(probeBrowserbaseApply()).toBe(true);
  });

  it('probeBrowserbaseApply respects STAGEHAND_MODEL provider', () => {
    process.env.BROWSERBASE_API_KEY = 'bb-key';
    process.env.BROWSERBASE_PROJECT_ID = 'proj-1';
    process.env.STAGEHAND_MODEL = 'anthropic/claude-sonnet-4-6';
    expect(probeBrowserbaseApply()).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    expect(probeBrowserbaseApply()).toBe(true);
  });
});
