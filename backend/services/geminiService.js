const { GoogleGenerativeAI } = require('@google/generative-ai');

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
  process.env.DIFY_API_URL || 'https://api.dify.ai/v1';

const DIFY_API_KEY = process.env.DIFY_API_KEY;


function withTimeout(promise, ms = 15000, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// ==========================================
// BILLMATE AI CHAT - DIFY
// ==========================================

async function generateChatResponse(query, bills) {
  try {
    // If Dify API key is missing, use fallback
    if (!DIFY_API_KEY) {
      console.warn(
        '⚠️ DIFY_API_KEY is not set. Using fallback AI response.'
      );

      return generateFallbackChatResponse(query, bills);
    }

    // Prepare actual MongoDB bill data
    const billsSummary = bills.map((b) => ({
      name: b.name,
      amount: b.amount,
      date: b.date,
      category: b.category,
      status: b.status || 'Unpaid'
    }));

    // We send both the user's question and their actual bill data
    const fullMessage = `
User question:
${query}

Here is the user's actual BillMate bill data:

${JSON.stringify(billsSummary, null, 2)}

Important:
Answer the user's question using the bill data above when relevant.
Do not invent bills, amounts, dates, or payment information.
`;

    // Call Dify Workflow API with 15s timeout
    const fetchOptions = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {
          message: fullMessage
        },
        response_mode: 'blocking',
        user: 'billmate-user'
      })
    };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      fetchOptions.signal = AbortSignal.timeout(15000);
    }

    const response = await fetch(
      `${DIFY_API_URL}/workflows/run`,
      fetchOptions
    );

    const data = await response.json();

    // Handle Dify API errors
    if (!response.ok) {
      console.error(
        'Dify API Error:',
        data
      );

      return generateFallbackChatResponse(query, bills);
    }

    console.log(
      'Dify Response:',
      JSON.stringify(data, null, 2)
    );

    // Dify workflow response
    const answer =
      data?.data?.outputs?.text ||
      data?.data?.outputs?.result ||
      data?.data?.outputs?.answer ||
      data?.data?.outputs?.reply;

    // If workflow returned a valid answer
    if (answer) {
      return answer;
    }

    // Sometimes the workflow output key can be different
    // This logs available outputs for debugging
    console.warn(
      '⚠️ No expected output found from Dify:',
      data?.data?.outputs
    );

    return 'I received your request, but I could not generate a response. Please try again.';

  } catch (error) {
    console.error(
      'Dify Chat Error:',
      error
    );

    return generateFallbackChatResponse(query, bills);
  }
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