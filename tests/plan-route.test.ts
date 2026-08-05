import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '../app/api/plan/route.ts';

test('the planner returns a goal-aware fallback instead of an error when AI is unavailable', async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Source comparison essay', projectGoal: 'essay_report', description: 'Compare two primary sources', rubricText: '', today: '2026-08-05', deadline: '2026-08-10', unreadAttachmentNames: [] }),
    });
    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.source, 'fallback');
    assert.equal(body.plan.projectType, 'writing');
    assert.match(body.plan.tasks[1].title, /Draft/);
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});
