const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

// ==========================================
// GEMINI CONFIGURATION
// Used for Receipt Parsing and Report Insights
// ==========================================

const apiKey = process.env.GEMINI_API_KEY;

let ai = null;

if (apiKey) {
  ai = new GoogleGenerativeAI(apiKey);
} else {
  console.warn(
    '⚠️ GEMINI_API_KEY is not set. Gemini features will use fallback responses.'
  );
}

async function getGeminiModel() {
  if (!ai) return null;

  return ai.getGenerativeModel({
    model: 'gemini-1.5-flash'
  });
}


// ==========================================
// DIFY CONFIGURATION
// Used for BillMate AI Chat
// ==========================================

const DIFY_API_URL =
  (process.env.DIFY_API_URL || process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1').replace(/\/+$/, '');

const DIFY_API_KEY = process.env.DIFY_APP_API_KEY || process.env.DIFY_API_KEY;
const DIFY_TIMEOUT_MS = 60000;


function withTimeout(promise, ms = 15000, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// ==========================================
// BILLMATE AI CHAT - DIFY
// ==========================================

function createDifyError(message) {
  const error = new Error(message);
  error.code = 'DIFY_UNAVAILABLE';
  return error;
}

function stableDifyUserId(userId) {
  if (typeof userId !== 'string' || !userId.trim() || !DIFY_API_KEY) {
    const error = new Error('A Dify API key and authenticated BillMate user are required.');
    error.code = 'DIFY_CONFIGURATION_ERROR';
    throw error;
  }
  return `bm_${crypto.createHmac('sha256', DIFY_API_KEY).update(String(userId)).digest('hex').slice(0, 32)}`;
}

function collectConfirmationTokens(value, tokens) {
  if (typeof value === 'string') {
    const pattern = /"(?:confirmationToken|confirmation_token)"\s*:\s*"([a-f0-9]{64})"/g;
    let match;
    while ((match = pattern.exec(value))) tokens.add(match[1]);
    try {
      collectConfirmationTokens(JSON.parse(value), tokens);
    } catch (_error) {
      // Tool observations may be plain text around a JSON response.
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectConfirmationTokens(item, tokens));
    return;
  }
  if (!value || typeof value !== 'object') return;

  Object.entries(value).forEach(([key, item]) => {
    if (
      (key === 'confirmationToken' || key === 'confirmation_token')
      && typeof item === 'string'
      && /^[a-f0-9]{64}$/.test(item)
    ) {
      tokens.add(item);
    } else {
      collectConfirmationTokens(item, tokens);
    }
  });
}

async function parseAgentStream(response) {
  if (!response.body) throw createDifyError('Dify returned an empty Agent stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let streamedAnswer = '';
  let conversationId = null;
  let completed = false;
  const confirmationTokens = new Set();

  function processFrame(frame) {
    const lines = frame.split(/\r?\n/);
    const data = lines.filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;

    let event;
    try {
      event = JSON.parse(data);
    } catch (_error) {
      throw createDifyError('Dify returned an invalid Agent stream event.');
    }

    event.event ||= lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    if (typeof event.conversation_id === 'string' && event.conversation_id) {
      conversationId = event.conversation_id;
    }
    if (event.event === 'error') {
      throw createDifyError('Dify reported an Agent execution error.');
    }
    if (event.event === 'agent_thought') {
      collectConfirmationTokens(event.observation, confirmationTokens);
    } else if (event.event === 'agent_message' && typeof event.answer === 'string') {
      streamedAnswer += event.answer;
    } else if (event.event === 'message' && typeof event.answer === 'string') {
      answer = event.answer;
    } else if (event.event === 'message_replace' && typeof event.answer === 'string') {
      answer = event.answer;
    } else if (event.event === 'message_end') {
      completed = true;
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let separator;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        processFrame(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
      }
      if (done) break;
    }
    if (buffer.trim()) processFrame(buffer);
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error.code === 'DIFY_UNAVAILABLE') throw error;
    throw createDifyError('Dify Agent stream could not be read.');
  } finally {
    reader.releaseLock();
  }

  const finalAnswer = answer || streamedAnswer;
  if (!completed || !finalAnswer.trim() || !conversationId) {
    throw createDifyError('Dify Agent stream ended before a complete response was received.');
  }

  return {
    reply: finalAnswer,
    conversationId,
    pendingActions: [...confirmationTokens].slice(0, 5).map((confirmationToken) => ({ confirmationToken }))
  };
}

async function generateChatResponse(query, bills, contextToken, userId, conversationId) {
  if (!DIFY_API_KEY) {
    console.warn('DIFY_APP_API_KEY is not set. Using the local assistant fallback.');
    return { reply: generateFallbackChatResponse(query, bills), pendingActions: [] };
  }
  if (typeof contextToken !== 'string' || !contextToken) {
    const error = new Error('A signed BillMate user context is required for Dify tools.');
    error.code = 'DIFY_CONFIGURATION_ERROR';
    throw error;
  }
  const difyUserId = stableDifyUserId(String(userId || ''));

  const fetchOptions = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: {
        billmate_context_token: contextToken
      },
      query,
      response_mode: 'streaming',
      conversation_id: conversationId || '',
      user: difyUserId
    })
  };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    fetchOptions.signal = AbortSignal.timeout(DIFY_TIMEOUT_MS);
  }

  let response;
  try {
    response = await fetch(`${DIFY_API_URL}/chat-messages`, fetchOptions);
  } catch (_error) {
    throw createDifyError('Dify could not be reached.');
  }

  if (!response.ok) {
    console.error('Dify request failed with status:', response.status);
    throw createDifyError('Dify returned an unsuccessful response.');
  }

  return parseAgentStream(response);
}


// ==========================================
// RECEIPT PARSING - GEMINI
// ==========================================

async function parseReceiptText(ocrText) {
  const model = await getGeminiModel();

  if (!model) {
    return generateFallbackReceiptParse(ocrText);
  }

  const prompt = `
Extract transaction details from this raw OCR receipt text.

Output ONLY a valid JSON object matching the schema below.

Do not wrap the JSON in markdown code blocks.

If a field is not found, leave it as null.
Do not guess.

Expected JSON Schema:

{
  "merchant": "Merchant Name (string)",
  "amount": 123.45,
  "due_date": "YYYY-MM-DD",
  "bill_number": "Bill/Invoice Number or null",
  "category": "One of: Rent, Food, Bills, Other",
  "gst": 12.34,
  "payment_reference": "Reference number or transaction ID if paid",
  "currency": "INR or USD",
  "notes": "Any other key details extracted"
}

Raw OCR Text:

"${ocrText}"
`;

  try {
    const result = await withTimeout(
      model.generateContent(prompt),
      15000,
      'Gemini receipt parsing timed out'
    );

    const response = await result.response;

    let text = response.text().trim();

    // Remove markdown JSON blocks if returned
    if (text.startsWith('```')) {
      text = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/, '')
        .trim();
    }

    return JSON.parse(text);

  } catch (error) {
    console.error(
      'Gemini Receipt Parse Error:',
      error
    );

    return generateFallbackReceiptParse(ocrText);
  }
}


// ==========================================
// REPORT INSIGHTS - GEMINI
// ==========================================

async function generateReportInsights(reportData) {
  const model = await getGeminiModel();

  if (!model) {
    return [
      'Spent ₹0 more than last month.',
      'Check your monthly trend to optimize utility bills.',
      'Review subscriptions to find yearly savings.'
    ];
  }

  const prompt = `
Generate 4-5 useful financial insights based on this monthly
BillMate report data:

${JSON.stringify(reportData, null, 2)}

Rules:

1. Highlight large expenses.
2. Compare spending categories.
3. Suggest realistic ways to save money.
4. Check budget health if budget information exists.
5. Keep the response concise.
6. Return clean markdown bullet points.
`;

  try {
    const result = await withTimeout(
      model.generateContent(prompt),
      15000,
      'Gemini report insights timed out'
    );

    const response = await result.response;

    return response
      .text()
      .split('\n')
      .filter(
        (line) =>
          line.trim().startsWith('*') ||
          line.trim().startsWith('-')
      );

  } catch (error) {
    console.error(
      'Gemini Insights Error:',
      error
    );

    return [
      'Save money by reviewing recurring expenses.',
      'Check upcoming unpaid bills to avoid late charges.'
    ];
  }
}


// ==========================================
// FALLBACK CHAT
// ==========================================

function generateFallbackChatResponse(query, bills) {
  const q = query.toLowerCase();

  const unpaid = bills.filter(
    (b) => (b.status || 'Unpaid') === 'Unpaid'
  );

  const paid = bills.filter(
    (b) => b.status === 'Paid'
  );

  // Unpaid / Due bills
  if (
    q.includes('unpaid') ||
    q.includes('due')
  ) {
    if (unpaid.length === 0) {
      return 'You have no unpaid bills! Great job! 🎉';
    }

    return (
      `You have ${unpaid.length} unpaid bill(s):\n\n` +
      unpaid
        .map(
          (b) =>
            `• ${b.name}: ₹${b.amount} (Due: ${b.date})`
        )
        .join('\n')
    );
  }

  // Paid / Spending
  if (
    q.includes('spend') ||
    q.includes('spent') ||
    q.includes('paid')
  ) {
    const totalPaid = paid.reduce(
      (sum, b) =>
        sum + Number(b.amount || 0),
      0
    );

    return `You have spent ₹${totalPaid} on paid bills.`;
  }

  // Total bills
  if (
    q.includes('total') ||
    q.includes('how much')
  ) {
    const total = bills.reduce(
      (sum, b) =>
        sum + Number(b.amount || 0),
      0
    );

    return `Your total bill amount is ₹${total}.`;
  }

  return `
Hi! 👋 I am the BillMate AI Assistant.

You can ask me about:

• Your unpaid bills
• Upcoming due dates
• Your spending
• Total bill amounts
• Payment status
• Budget and bill management
`;
}


// ==========================================
// FALLBACK RECEIPT PARSER
// ==========================================

function generateFallbackReceiptParse(ocrText) {
  const amountMatch = ocrText.match(
    /(?:total|amount|net|due|rs\.?|inr)\s*[:=]?\s*₹?\s*([0-9]+(?:\.[0-9]{2})?)/i
  );

  const amount = amountMatch
    ? parseFloat(amountMatch[1])
    : 0;

  return {
    merchant: 'Extracted Merchant',

    amount: amount || 1500,

    due_date: new Date()
      .toISOString()
      .split('T')[0],

    bill_number:
      'BILL-' +
      Math.floor(Math.random() * 100000),

    category: 'Bills',

    gst: null,

    payment_reference: null,

    currency: 'INR',

    notes: 'Local OCR Parser Fallback'
  };
}


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  generateChatResponse,
  parseReceiptText,
  generateReportInsights
};