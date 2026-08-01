const { GoogleGenAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  // Use new GoogleGenAI SDK or standard google-genai structure
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  ai = new GoogleGenerativeAI(apiKey);
} else {
  console.warn('⚠️ GEMINI_API_KEY is not set. Gemini responses will fall back to rule-based mocks.');
}

async function getGeminiModel() {
  if (!ai) return null;
  return ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

async function generateChatResponse(query, bills) {
  const model = await getGeminiModel();
  if (!model) {
    return generateFallbackChatResponse(query, bills);
  }

  const billsSummary = bills.map(b => ({
    name: b.name,
    amount: b.amount,
    date: b.date,
    category: b.category,
    status: b.status || 'Unpaid'
  }));

  const prompt = `
You are BillMate's financial AI assistant. Below is the list of the user's current bills:
${JSON.stringify(billsSummary, null, 2)}

User question: "${query}"

Guidelines:
1. Provide extremely accurate answers based on the provided bills data. Do not guess or make up numbers.
2. If they ask about total spend, sum up all "Paid" or "Unpaid" bills as requested, or calculate monthly totals.
3. Be friendly, clean, and write responses in short, neat bullet points or brief markdown paragraphs.
4. Keep currency formatting in Rupees (₹) when referencing amounts.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini Chat Error:', error);
    return generateFallbackChatResponse(query, bills);
  }
}

async function parseReceiptText(ocrText) {
  const model = await getGeminiModel();
  if (!model) {
    return generateFallbackReceiptParse(ocrText);
  }

  const prompt = `
Extract transaction details from this raw OCR receipt text. Output ONLY a valid JSON object matching the schema below. Do not wrap the JSON in markdown code blocks. If a field is not found, leave it as null (do not guess).

Expected JSON Schema:
{
  "merchant": "Merchant Name (string)",
  "amount": 123.45 (number),
  "due_date": "YYYY-MM-DD (string, approximate due date if not stated, otherwise use today or the receipt date)",
  "bill_number": "Bill/Invoice Number (string or null)",
  "category": "One of: Rent, Food, Bills, Other (string)",
  "gst": 12.34 (number or null),
  "payment_reference": "Reference number/transaction ID if paid (string or null)",
  "currency": "INR or USD (string)",
  "notes": "Any other key details extracted (string)"
}

Raw OCR Text:
"${ocrText}"
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();
    
    // Clean markdown code blocks if Gemini returns them
    if (text.startsWith('```')) {
      text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    }
    
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini Receipt Parse Error:', error);
    return generateFallbackReceiptParse(ocrText);
  }
}

async function generateReportInsights(reportData) {
  const model = await getGeminiModel();
  if (!model) {
    return [
      "Spent ₹0 more than last month.",
      "Check your monthly trend to optimize utility bills.",
      "Review subscriptions to find yearly savings."
    ];
  }

  const prompt = `
Generate 4-5 bulleted financial insights based on this monthly billing report data:
${JSON.stringify(reportData, null, 2)}

Provide specific, actionable bullet points comparing categories, highlighting large expenses, suggesting savings (e.g. on subscriptions or recurring bills), and checking budget health. Respond with clean, plain markdown list items.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().split('\n').filter(line => line.trim().startsWith('*') || line.trim().startsWith('-'));
  } catch (error) {
    console.error('Gemini Insights Error:', error);
    return [
      "Save money by cutting down food delivery costs.",
      "You have pending utility bills that might incur late charges soon."
    ];
  }
}

// Fallback logic when Gemini API key is missing
function generateFallbackChatResponse(query, bills) {
  const q = query.toLowerCase();
  const unpaid = bills.filter(b => (b.status || 'Unpaid') === 'Unpaid');
  const paid = bills.filter(b => b.status === 'Paid');

  if (q.includes('unpaid') || q.includes('due')) {
    if (unpaid.length === 0) return "You have no unpaid bills! Great job! 🎉";
    return `You have ${unpaid.length} unpaid bill(s):\n` + unpaid.map(b => `• ${b.name}: ₹${b.amount} (Due: ${b.date})`).join('\n');
  }

  if (q.includes('spend') || q.includes('paid')) {
    const totalPaid = paid.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    return `You have spent ₹${totalPaid} on paid bills this month.`;
  }

  return "I am the BillMate AI Assistant. You can ask me about your bills, spending, or reports, and I will parse your MongoDB data to answer!";
}

function generateFallbackReceiptParse(ocrText) {
  // Regex extracts for fallback
  const amountMatch = ocrText.match(/(?:total|amount|net|due|rs\.?|inr)\s*[:=]?\s*₹?\s*([0-9]+(?:\.[0-9]{2})?)/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
  
  return {
    merchant: "Extracted Merchant",
    amount: amount || 1500,
    due_date: new Date().toISOString().split('T')[0],
    bill_number: "BILL-" + Math.floor(Math.random() * 100000),
    category: "Bills",
    gst: null,
    payment_reference: null,
    currency: "INR",
    notes: "Local OCR Parser Fallback"
  };
}

module.exports = {
  generateChatResponse,
  parseReceiptText,
  generateReportInsights
};
