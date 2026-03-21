import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function chatCompletion(messages, options = {}) {
  const { temperature, max_tokens, model } = options;

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
  return client;
}
