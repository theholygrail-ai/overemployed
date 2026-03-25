import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** Lazy so importing agents/app in CI (no GROQ_API_KEY) does not throw at module load. */
let _client;

function groqClient() {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !String(apiKey).trim()) {
      throw new Error('GROQ_API_KEY is not set — required for LLM calls.');
    }
    _client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }
  return _client;
}

export async function chatCompletion(messages, options = {}) {
  const { temperature, max_tokens, model } = options;
  const client = groqClient();

  try {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      messages,
      ...(temperature !== undefined && { temperature }),
      ...(max_tokens !== undefined && { max_tokens }),
    });
    return response.choices[0].message.content;
  } catch (err) {
    if (err.message?.includes('Tool choice is none')) {
      const response = await client.chat.completions.create({
        model: model || DEFAULT_MODEL,
        messages,
        tool_choice: 'none',
        ...(temperature !== undefined && { temperature }),
        ...(max_tokens !== undefined && { max_tokens }),
      });
      return response.choices[0].message.content;
    }
    throw err;
  }
}

export function getClient() {
  return groqClient();
}
