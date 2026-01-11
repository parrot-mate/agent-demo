import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

type WebSearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
};

const webSearchTool = tool({
  name: 'web_search',
  description: 'Search the web for current information.',
  parameters: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ query }: { query: string }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set.');
    }
    const model = process.env.OPENAI_WEB_SEARCH_MODEL ?? 'gpt-4.1-mini';
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        tools: [{ type: 'web_search' }],
        input: query,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Web search failed (${resp.status}): ${text}`);
    }
    const data = (await resp.json()) as {
      output?: Array<Record<string, unknown>>;
    };
    const outputItems = Array.isArray(data.output) ? data.output : [];
    const results: WebSearchResult[] = [];
    for (const item of outputItems) {
      if ((item as { type?: string }).type !== 'web_search_call') {
        continue;
      }
      const rawResults =
        (item as { results?: unknown }).results ??
        (item as { result?: unknown }).result ??
        (item as { data?: unknown }).data ??
        (item as { output?: unknown }).output ??
        [];
      if (Array.isArray(rawResults)) {
        for (const entry of rawResults) {
          if (typeof entry !== 'object' || entry === null) {
            continue;
          }
          const record = entry as WebSearchResult;
          results.push({
            title: record.title,
            url: record.url,
            snippet: record.snippet,
          });
        }
      }
    }
    if (results.length === 0) {
      return `No web results found for: ${query}`;
    }
    const top = results.slice(0, 5);
    const lines = top.map((result, index) => {
      const title = result.title ?? 'Untitled';
      const url = result.url ?? 'No URL';
      const snippet = result.snippet ? `\n${result.snippet}` : '';
      return `${index + 1}. ${title} - ${url}${snippet}`;
    });
    return `Results for "${query}":\n${lines.join('\n')}`;
  },
});

const scheduleAlarmTool = tool({
  name: 'schedule_alarm',
  description:
    'Schedule a virtual alarm at a specific ISO datetime with a label.',
  parameters: z.object({
    timeISO: z.string().describe('ISO timestamp for the alarm time'),
    label: z.string().describe('Short label for the alarm'),
  }),
  execute: async ({
    timeISO,
    label,
  }: {
    timeISO: string;
    label: string;
  }) => {
    const target = new Date(timeISO);
    if (Number.isNaN(target.getTime())) {
      return `Could not parse alarm time: ${timeISO}`;
    }
    const delay = target.getTime() - Date.now();
    if (delay <= 0) {
      return `Alarm time is in the past: ${timeISO}`;
    }
    setTimeout(() => {
      console.log(`[ALARM] ${label} (${timeISO})`);
    }, delay);
    return `Alarm set for ${timeISO} — ${label}`;
  },
});

const agent = new Agent({
  name: 'Alarm Assistant',
  instructions: [
    'You are a CLI assistant that schedules virtual alarms and confirms them.',
    'When a request requires up-to-date info (events, schedules), use the web_search tool and extract a specific datetime.',
    'If a user asks for an alarm based on a specific time, convert it to an ISO timestamp and call schedule_alarm.',
    'If the date/time is ambiguous, ask a short follow-up question.',
    'Respond briefly with the confirmation returned by tools.',
  ].join(' '),
  tools: [webSearchTool, scheduleAlarmTool],
});

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log('Alarm assistant ready. Type a request, or "exit" to quit.');
  try {
    while (true) {
      const line = await rl.question('> ');
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.toLowerCase() === 'exit') {
        break;
      }
      try {
        const result = await run(agent, trimmed);
        console.log(result.finalOutput);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`Error: ${message}`);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${message}`);
});
