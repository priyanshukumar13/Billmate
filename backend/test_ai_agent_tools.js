const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.DIFY_API_KEY = 'app-test-agent-key';
process.env.DIFY_API_URL = 'https://dify.test/v1';
process.env.JWT_SECRET = 'test-jwt-secret-for-billmate-ai-tests';
delete process.env.GEMINI_API_KEY;

const Bill = require('./models/Bill');
const Conversation = require('./models/Conversation');
const PendingAction = require('./models/PendingAction');
const aiToolsController = require('./controllers/aiToolsController');
const aiController = require('./controllers/aiController');
const difyToolAuth = require('./middleware/difyToolAuth');
const { createDifyUserContext } = require('./utils/aiContext');
const geminiService = require('./services/geminiService');

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439012';
const TOOL_SECRET = 'test-dify-tool-secret';
process.env.DIFY_BACKEND_TOOL_SECRET = TOOL_SECRET;

function makeRequest({ userId, tokenLocation = 'query', body = {}, headers = {}, query = {} } = {}) {
  const contextToken = userId ? createDifyUserContext(userId) : '';
  const allHeaders = {
    'x-dify-tool-secret': TOOL_SECRET,
    ...headers
  };
  if (tokenLocation === 'header') allHeaders['x-billmate-context'] = contextToken;
  if (tokenLocation === 'query') query.contextToken = contextToken;
  if (tokenLocation === 'body') body.contextToken = contextToken;

  return {
    headers: allHeaders,
    query,
    body,
    params: {},
    get(name) {
      return this.headers[name.toLowerCase()];
    }
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

async function authorize(req, res) {
  let allowed = false;
  difyToolAuth(req, res, () => {
    allowed = true;
  });
  return allowed;
}

test('financial payload validation matches the persisted Bill amount constraints', () => {
  const valid = aiToolsController.helpers.validateFinancialPayload('add_expense', {
    description: 'Lunch',
    amount: 0.01,
    date: '2026-11-25'
  });
  assert.equal(valid.amount, 0.01);
  assert.equal(aiToolsController.helpers.validateFinancialPayload('add_expense', {
    description: 'Lunch',
    amount: 0.005,
    date: '2026-11-25'
  }), null);
  assert.equal(aiToolsController.helpers.validateFinancialPayload('create_bill', {
    name: 'Rent',
    amount: 9000,
    date: '2026-02-29'
  }), null);
});

test('tool auth rejects missing or invalid credentials and binds the JWT subject', async () => {
  const validReq = makeRequest({ userId: USER_A });
  const validRes = makeResponse();
  assert.equal(await authorize(validReq, validRes), true);
  assert.equal(validReq.user.id, USER_A);

  const wrongSecret = makeRequest({ userId: USER_A, headers: { 'x-dify-tool-secret': 'wrong' } });
  const wrongSecretRes = makeResponse();
  assert.equal(await authorize(wrongSecret, wrongSecretRes), false);
  assert.equal(wrongSecretRes.statusCode, 401);

  const signedOtherUserContext = makeRequest({ userId: USER_A });
  signedOtherUserContext.query.contextToken = jwt.sign(
    { scope: 'ai:tools' },
    process.env.JWT_SECRET,
    { subject: USER_B, issuer: 'billmate', audience: 'dify-tools', expiresIn: '5m' }
  );
  const signedOtherUserRes = makeResponse();
  assert.equal(await authorize(signedOtherUserContext, signedOtherUserRes), true);
  assert.equal(signedOtherUserContext.user.id, USER_B);

  const invalidContext = makeRequest({ userId: USER_A });
  invalidContext.query.contextToken = 'not-a-signed-context';
  const invalidContextRes = makeResponse();
  assert.equal(await authorize(invalidContext, invalidContextRes), false);
  assert.equal(invalidContextRes.statusCode, 401);
});

test('tool reads are isolated by signed user and financial writes only create pending actions', async (t) => {
  const originals = {
    find: Bill.find,
    findOneAndUpdate: Bill.findOneAndUpdate,
    pendingFindOne: PendingAction.findOne,
    pendingCreate: PendingAction.create
  };
  t.after(() => {
    Bill.find = originals.find;
    Bill.findOneAndUpdate = originals.findOneAndUpdate;
    PendingAction.findOne = originals.pendingFindOne;
    PendingAction.create = originals.pendingCreate;
  });

  const observedBillUsers = [];
  Bill.find = (filter) => {
    observedBillUsers.push(filter.user);
    return { sort: () => ({ lean: async () => [] }) };
  };
  let billWrites = 0;
  Bill.findOneAndUpdate = async () => {
    billWrites += 1;
    return null;
  };
  PendingAction.findOne = async () => null;
  let createdAction;
  PendingAction.create = async (action) => {
    createdAction = action;
    return action;
  };

  for (const userId of [USER_A, USER_B]) {
    const req = makeRequest({ userId });
    const res = makeResponse();
    assert.equal(await authorize(req, res), true);
    await aiToolsController.getBills(req, res);
    assert.equal(res.statusCode, 200);
  }
  assert.deepEqual(observedBillUsers, [USER_A, USER_B]);

  const req = makeRequest({
    userId: USER_B,
    tokenLocation: 'body',
    headers: { 'idempotency-key': 'ai-write-test-0001' },
    body: {
      description: 'Lunch',
      amount: 125,
      date: '2026-11-25',
      category: 'Food',
      userId: USER_A
    }
  });
  const res = makeResponse();
  assert.equal(await authorize(req, res), true);
  await aiToolsController.addExpense(req, res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, 'confirmation_required');
  assert.equal(createdAction.userId, USER_B);
  assert.equal(createdAction.operation, 'add_expense');
  assert.equal(billWrites, 0);

  const missingKeyRequest = makeRequest({
    userId: USER_A,
    tokenLocation: 'body',
    body: { description: 'Lunch', amount: 125, date: '2026-11-25' }
  });
  const missingKeyResponse = makeResponse();
  assert.equal(await authorize(missingKeyRequest, missingKeyResponse), true);
  await aiToolsController.addExpense(missingKeyRequest, missingKeyResponse);
  assert.equal(missingKeyResponse.statusCode, 400);
  assert.equal(billWrites, 0);
});

test('Agent API uses streamed chat messages, stable user identity, and returns tool confirmation tokens', async () => {
  const originalFetch = global.fetch;
  const confirmationToken = 'a'.repeat(64);
  const userAContext = createDifyUserContext(USER_A);
  const events = [
    {
      event: 'agent_thought',
      conversation_id: 'agent-conversation-1',
      observation: JSON.stringify({
        success: true,
        status: 'confirmation_required',
        confirmationToken
      })
    },
    { event: 'agent_message', conversation_id: 'agent-conversation-1', answer: 'I can create that expense.' },
    { event: 'message', conversation_id: 'agent-conversation-1', answer: 'I can create that expense.' },
    { event: 'message_end', conversation_id: 'agent-conversation-1' }
  ];
  const sse = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join('');
  const encodedStream = new TextEncoder().encode(sse);
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    const body = new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < encodedStream.length; offset += 19) {
          controller.enqueue(encodedStream.slice(offset, offset + 19));
        }
        controller.close();
      }
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  };

  try {
    const first = await geminiService.generateChatResponse(
      'Record lunch',
      [],
      userAContext,
      USER_A,
      'previous-agent-conversation'
    );
    const second = await geminiService.generateChatResponse(
      'Show my budget',
      [],
      createDifyUserContext(USER_B),
      USER_B
    );

    assert.equal(requests[0].url, 'https://dify.test/v1/chat-messages');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer app-test-agent-key');
    assert.equal(requests[0].body.response_mode, 'streaming');
    assert.equal(requests[0].body.query, 'Record lunch');
    assert.equal(requests[0].body.conversation_id, 'previous-agent-conversation');
    assert.equal(requests[0].body.inputs.billmate_context_token, userAContext);
    assert.notEqual(requests[0].body.user, USER_A);
    assert.notEqual(requests[0].body.user, requests[1].body.user);
    assert.equal(first.reply, 'I can create that expense.');
    assert.equal(first.conversationId, 'agent-conversation-1');
    assert.deepEqual(first.pendingActions, [{ confirmationToken }]);
    assert.equal(second.reply, first.reply);
    assert.equal(typeof geminiService.parseReceiptText, 'function');
    assert.equal(typeof geminiService.generateReportInsights, 'function');
  } finally {
    global.fetch = originalFetch;
  }
});

test('chat reuses and persists Dify conversation IDs while keeping BillMate transcript history', async (t) => {
  const originals = {
    conversationFindOne: Conversation.findOne,
    billFind: Bill.find,
    generateChatResponse: geminiService.generateChatResponse
  };
  t.after(() => {
    Conversation.findOne = originals.conversationFindOne;
    Bill.find = originals.billFind;
    geminiService.generateChatResponse = originals.generateChatResponse;
  });

  const conversation = {
    difyConversationId: 'previous-agent-conversation',
    messages: [{ role: 'user', content: 'Earlier question' }],
    saved: false,
    async save() {
      this.saved = true;
    }
  };
  Conversation.findOne = async () => conversation;
  Bill.find = () => ({ sort: async () => [] });
  let serviceArguments;
  geminiService.generateChatResponse = async (...args) => {
    serviceArguments = args;
    return { reply: 'Agent answer', conversationId: 'continued-agent-conversation', pendingActions: [] };
  };

  const req = { user: { id: USER_A }, body: { message: 'Continue please' } };
  const res = makeResponse();
  await aiController.handleChat(req, res);

  assert.equal(serviceArguments[4], 'previous-agent-conversation');
  assert.equal(conversation.difyConversationId, 'continued-agent-conversation');
  assert.equal(conversation.saved, true);
  assert.deepEqual(conversation.messages.slice(-2).map((message) => message.content), ['Continue please', 'Agent answer']);
  assert.equal(res.body.reply, 'Agent answer');
});

test('Agent API fails closed when signed user context is missing or the SSE stream errors', async () => {
  await assert.rejects(
    geminiService.generateChatResponse('Hello', [], null, USER_A),
    { code: 'DIFY_CONFIGURATION_ERROR' }
  );

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    `data: ${JSON.stringify({ event: 'error', code: 'agent_run_limit_exceeded' })}\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
  try {
    await assert.rejects(
      geminiService.generateChatResponse('Hello', [], createDifyUserContext(USER_A), USER_A),
      { code: 'DIFY_UNAVAILABLE' }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('Dify non-2xx diagnostics include safe JSON and plain-text errors', async () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const contextToken = createDifyUserContext(USER_A);
  const toolSecret = process.env.DIFY_BACKEND_TOOL_SECRET;
  const loggedDiagnostics = [];
  console.error = (...args) => loggedDiagnostics.push(args);

  try {
    global.fetch = async () => new Response(JSON.stringify({
      code: 'forbidden',
      message: `Dify denied token ${contextToken}; email user@example.com; API key app-test-agent-key`
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(
      geminiService.generateChatResponse('Hello', [], contextToken, USER_A),
      { code: 'DIFY_UNAVAILABLE' }
    );

    global.fetch = async () => new Response(
      `Forbidden: bearer ${contextToken}; secret ${toolSecret}; Authorization: Bearer app-test-agent-key`,
      { status: 403, headers: { 'Content-Type': 'text/plain' } }
    );
    await assert.rejects(
      geminiService.generateChatResponse('Hello', [], contextToken, USER_A),
      { code: 'DIFY_UNAVAILABLE' }
    );
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  assert.equal(loggedDiagnostics.length, 2);
  assert.deepEqual(loggedDiagnostics.map((entry) => entry[1].httpStatus), [403, 403]);
  assert.equal(loggedDiagnostics[0][1].errorCode, 'forbidden');
  assert.match(loggedDiagnostics[0][1].errorMessage, /Dify denied token \[REDACTED\]/);
  assert.match(loggedDiagnostics[0][1].errorMessage, /\[REDACTED_EMAIL\]/);
  assert.equal(loggedDiagnostics[1][1].errorCode, 'HTTP_403');
  assert.match(loggedDiagnostics[1][1].errorMessage, /Forbidden/);
  const serializedLogs = JSON.stringify(loggedDiagnostics);
  assert.equal(serializedLogs.includes(contextToken), false);
  assert.equal(serializedLogs.includes(toolSecret), false);
  assert.doesNotMatch(serializedLogs, /app-test-agent-key|Authorization: Bearer/);
  assert.doesNotMatch(serializedLogs, /user@example\.com/);
});

test('Gemini receipt parsing and report insight fallback remain available', async () => {
  const receipt = await geminiService.parseReceiptText('Merchant: Cafe\nTotal: Rs. 12.50');
  const insights = await geminiService.generateReportInsights({});
  assert.equal(typeof receipt.merchant, 'string');
  assert.equal(typeof receipt.amount, 'number');
  assert.ok(Array.isArray(insights) && insights.length > 0);
});

test('OpenAPI tool contract documents all eight secured operations and context/idempotency fields', () => {
  const specification = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'docs', 'billmate-openapi.json'),
    'utf8'
  ));
  const operations = Object.entries(specification.paths).flatMap(([route, pathItem]) => (
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post'].includes(method))
      .map(([method, operation]) => ({ route, method, operation }))
  ));

  assert.equal(operations.length, 8);
  assert.deepEqual(
    operations.map(({ method, route }) => `${method.toUpperCase()} ${route}`).sort(),
    [
      'GET /tools/bills',
      'GET /tools/budget',
      'GET /tools/expenses',
      'POST /tools/automations',
      'POST /tools/bills',
      'POST /tools/bills/mark-paid',
      'POST /tools/expenses',
      'POST /tools/reminders'
    ]
  );
  assert.ok(specification.security[0].DifyToolSecret);
  for (const { method, operation } of operations) {
    assert.ok(operation.responses['500']);
    if (method === 'get') {
      assert.ok(operation.parameters.some((parameter) => parameter.$ref?.endsWith('/ContextTokenQuery')));
      continue;
    }

    const checkReferences = (value) => {
      if (Array.isArray(value)) {
        value.forEach(checkReferences);
      } else if (value && typeof value === 'object') {
        if (typeof value.$ref === 'string') {
          assert.ok(value.$ref.startsWith('#/'), `Expected local reference: ${value.$ref}`);
          const target = value.$ref.slice(2).split('/').reduce((current, segment) => current?.[segment], specification);
          assert.notEqual(target, undefined, `Unresolved reference: ${value.$ref}`);
        }
        Object.values(value).forEach(checkReferences);
      }
    };
    checkReferences(specification);

    assert.ok(operation.parameters.some((parameter) => parameter.$ref?.endsWith('/IdempotencyKey')));
    const requestSchema = operation.requestBody.content['application/json'].schema;
    assert.ok(requestSchema.$ref);
    const schemaName = requestSchema.$ref.split('/').pop();
    const bodySchema = specification.components.schemas[schemaName];
    assert.ok(bodySchema.required.includes('contextToken'));
    assert.equal(bodySchema.properties.contextToken.$ref, '#/components/schemas/ContextToken');
  }

  const frontendFiles = [
    '../frontend/assistant.js',
    '../frontend/assistant-page.js',
    '../frontend/src/components/FloatingAssistant.jsx'
  ];
  for (const relativePath of frontendFiles) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
    assert.doesNotMatch(source, /DIFY_BACKEND_TOOL_SECRET|X-Dify-Tool-Secret/);
  }
});
