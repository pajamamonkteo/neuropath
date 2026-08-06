import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import test from 'node:test';

import { POST } from '../app/api/plan/route.ts';

const pdfWarning = 'We couldn\'t fully read this PDF. You can continue with your description or upload the relevant page as an image.';

async function requestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

function mockPlan(documentAssessments: unknown[], summary: string) {
  return {
    projectSummary: summary,
    projectType: 'studying',
    planningMode: 'finite',
    assumptions: [],
    tasks: [
      { title: 'Open the source', description: 'Open the supplied material and identify the first requirement.', estimatedMinutes: 5, dayNumber: 1, scheduledDate: '2026-08-06', type: 'quick_start', dueDate: null, subtasks: [{ title: 'Open the source', estimatedMinutes: 5 }] },
      { title: 'Build the deliverable', description: 'Use the identified requirements to produce the requested work.', estimatedMinutes: 20, dayNumber: 2, scheduledDate: '2026-08-07', type: 'work', dueDate: '2026-08-10', subtasks: [{ title: 'Draft the response', estimatedMinutes: 10 }, { title: 'Check the requirements', estimatedMinutes: 10 }] },
    ],
    documentAssessments,
  };
}

async function withMockOpenAI(
  options: { assessment: Record<string, unknown> | null; summary: string; rejectUpload?: boolean },
  run: (captured: { uploads: Buffer[]; responses: Record<string, unknown>[] }) => Promise<void>,
) {
  const captured = { uploads: [] as Buffer[], responses: [] as Record<string, unknown>[] };
  const server = createServer(async (request, response) => {
    const body = await requestBody(request);
    if (request.url === '/v1/files') {
      captured.uploads.push(body);
      if (options.rejectUpload) return json(response, 400, { error: { message: 'Synthetic upload failure', type: 'invalid_request_error' } });
      return json(response, 200, { id: 'file-test-pdf', object: 'file', bytes: body.length, created_at: 1, filename: 'fixture.pdf', purpose: 'user_data', status: 'processed', status_details: null });
    }
    if (request.url === '/v1/responses') {
      const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
      captured.responses.push(parsed);
      const output = mockPlan(options.assessment ? [options.assessment] : [], options.summary);
      const outputText = JSON.stringify(output);
      return json(response, 200, { id: 'resp-test', object: 'response', created_at: 1, status: 'completed', model: 'gpt-4.1-mini', output: [{ id: 'msg-test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: outputText, annotations: [] }] }], error: null, incomplete_details: null, metadata: {}, tools: [], tool_choice: 'auto', parallel_tool_calls: true });
    }
    return json(response, 404, { error: { message: 'Unexpected mock path' } });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  try {
    await run(captured);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
  }
}

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
    assert.equal(body.plan.planningMode, 'finite');
    assert.match(body.plan.tasks[1].title, /Draft/);
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test('an explicitly ongoing plan reports phased scheduling and its full duration', async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Year-long learning plan', projectGoal: 'general_study', description: 'An ongoing plan that grows as I progress', rubricText: '', today: '2026-08-06', deadline: '2027-08-06', unreadAttachmentNames: [] }),
    });
    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.plan.planningMode, 'phased');
    assert.equal(body.planDurationDays, 365);
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test('the Portuguese C2 example is deterministically resolved as phased', async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Learn Portuguese to C2 level using research-based language acquisition principles', projectGoal: 'general_study', description: '', rubricText: '', today: '2026-08-06', deadline: '2027-11-25', unreadAttachmentNames: [] }),
    });
    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.plan.planningMode, 'phased');
    assert.equal(body.planDurationDays, 476);
    assert.deepEqual(body.planningModeResolution, { model: null, resolved: 'phased', source: 'deterministic_fallback' });
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test('the planner combines typed context with an optional extracted file', async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const formData = new FormData();
    formData.append('project', JSON.stringify({ title: 'Biology review', projectGoal: 'general_study', description: 'Review the lecture notes', rubricText: '', today: '2026-08-05', deadline: '2026-08-10', unreadAttachmentNames: [] }));
    formData.append('fileIds', 'file-one');
    formData.append('files', new File(['The syllabus emphasizes cellular respiration and photosynthesis.'], 'syllabus.txt', { type: 'text/plain' }));
    const response = await POST(new Request('http://localhost/api/plan', { method: 'POST', body: formData }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.attachmentResults[0].id, 'file-one');
    assert.equal(body.attachmentResults[0].status, 'extracted');
    assert.match(body.plan.projectSummary, /lecture notes/i);
    assert.match(body.plan.projectSummary, /cellular respiration/i);
    assert.equal(JSON.stringify(body).includes('extractedText'), false);
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test('an unreadable file does not block a typed-description plan', async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const formData = new FormData();
    formData.append('project', JSON.stringify({ title: 'History essay', projectGoal: 'essay_report', description: 'Compare two primary sources', rubricText: '', today: '2026-08-05', deadline: '2026-08-10', unreadAttachmentNames: [] }));
    formData.append('fileIds', 'bad-file');
    formData.append('files', new File([''], 'blank.txt', { type: 'text/plain' }));
    const response = await POST(new Request('http://localhost/api/plan', { method: 'POST', body: formData }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.attachmentResults[0].status, 'unreadable');
    assert.match(body.plan.projectSummary, /Compare two primary sources/i);
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test('PDF fixtures are uploaded as real OpenAI file inputs and assessed without overclaiming', async () => {
  const cases = [
    { filename: 'digital-text.pdf', id: 'digital-pdf', assessment: { attachmentId: 'digital-pdf', usableDocumentContentReferenced: true, contentBasis: 'text', containsComplexVisuals: false, complexVisualsReferenced: false }, status: 'extracted', warning: false, summary: 'Plan the ATP comparison and worked yield example from the study brief.' },
    { filename: 'scanned-image-only.pdf', id: 'scanned-pdf', assessment: { attachmentId: 'scanned-pdf', usableDocumentContentReferenced: true, contentBasis: 'page_images', containsComplexVisuals: false, complexVisualsReferenced: false }, status: 'incomplete', warning: true, summary: 'Plan the mangrove salinity and crab-burrow fieldwork comparison.' },
    { filename: 'rubric-table.pdf', id: 'rubric-pdf', assessment: { attachmentId: 'rubric-pdf', usableDocumentContentReferenced: true, contentBasis: 'text_and_page_images', containsComplexVisuals: true, complexVisualsReferenced: true }, status: 'extracted', warning: false, summary: 'Plan an essay around the argument, evidence, structure, and style rubric rows.' },
    { filename: 'charts-and-diagrams.pdf', id: 'visual-pdf', assessment: { attachmentId: 'visual-pdf', usableDocumentContentReferenced: true, contentBasis: 'text_and_page_images', containsComplexVisuals: true, complexVisualsReferenced: true }, status: 'extracted', warning: false, summary: 'Use the 42-to-91 percent chart trend and the collect-analyze-revise process.' },
  ] as const;

  for (const fixture of cases) {
      const pdfPath = path.join(process.cwd(), 'tests', 'fixtures', 'pdfs', fixture.filename);
      const pdfBytes = await readFile(pdfPath);
      await withMockOpenAI({ assessment: fixture.assessment, summary: fixture.summary }, async (captured) => {
        const formData = new FormData();
        formData.append('project', JSON.stringify({ title: 'PDF-backed project', projectGoal: 'general_study', description: 'Use my written fallback description.', rubricText: 'Keep every required criterion.', pacing: 'gentle', today: '2026-08-06', deadline: '2026-08-10', unreadAttachmentNames: [] }));
        formData.append('fileIds', fixture.id);
        formData.append('files', new File([new Uint8Array(pdfBytes)], fixture.filename, { type: 'application/pdf' }));
        const response = await POST(new Request('http://localhost/api/plan', { method: 'POST', body: formData }));
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.source, 'ai');
        assert.equal(body.attachmentResults[0].status, fixture.status);
        assert.equal(body.plan.projectSummary, fixture.summary);
        assert.equal(body.plan.projectSummary.includes(pdfWarning), false);
        assert.equal(body.warning === pdfWarning, fixture.warning);
        assert.equal(captured.uploads.length, 1);
        assert.notEqual(captured.uploads[0].indexOf(pdfBytes), -1, 'the multipart OpenAI upload must contain the original PDF bytes');
        assert.match(captured.uploads[0].toString('latin1'), /name="purpose"\r\n\r\nuser_data/);
        assert.match(captured.uploads[0].toString('latin1'), /Content-Type: application\/pdf/);
        assert.equal(captured.responses.length, 1);
        const responseRequest = JSON.stringify(captured.responses[0]);
        assert.match(responseRequest, /"type":"input_file"/);
        assert.match(responseRequest, /"file_id":"file-test-pdf"/);
        assert.match(responseRequest, /"detail":"high"/);
        assert.match(responseRequest, /PDF-backed project/);
        assert.match(responseRequest, /2026-08-10/);
        assert.match(responseRequest, /Use my written fallback description/);
        assert.match(responseRequest, /pacing choice is gentle/);
      });
  }
});

test('a failed direct PDF upload continues from the description and returns the exact transient warning', async () => {
  const pdfPath = path.join(process.cwd(), 'tests', 'fixtures', 'pdfs', 'digital-text.pdf');
  const pdfBytes = await readFile(pdfPath);
  await withMockOpenAI({ assessment: null, summary: 'Continue using the written fallback description.', rejectUpload: true }, async () => {
    const formData = new FormData();
    formData.append('project', JSON.stringify({ title: 'Fallback project', projectGoal: 'general_study', description: 'Written fallback description', rubricText: '', pacing: 'balanced', today: '2026-08-06', deadline: '2026-08-10', unreadAttachmentNames: [] }));
    formData.append('fileIds', 'failed-pdf');
    formData.append('files', new File([new Uint8Array(pdfBytes)], 'digital-text.pdf', { type: 'application/pdf' }));
    const response = await POST(new Request('http://localhost/api/plan', { method: 'POST', body: formData }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.source, 'ai');
    assert.equal(body.attachmentResults[0].status, 'unreadable');
    assert.equal(body.warning, pdfWarning);
    assert.equal(body.plan.projectSummary, 'Continue using the written fallback description.');
    assert.equal(body.plan.projectSummary.includes(pdfWarning), false);
  });
});
