const Conversation = require('../models/Conversation');
const Bill = require('../models/Bill');
const geminiService = require('../services/geminiService');

async function handleChat(req, res) {
  try {
    const { message } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ msg: 'Message content is required.' });
    }

    // Retrieve active conversation or create one
    let conversation = await Conversation.findOne({ userId });
    if (!conversation) {
      conversation = new Conversation({ userId, messages: [] });
    }

    // Fetch user's actual bills from MongoDB
    const bills = await Bill.find({ userId });

    // Generate AI response passing the actual bills to ground the responses
    const aiResponseText = await geminiService.generateChatResponse(message, bills);

    // Save to conversation history
    conversation.messages.push({ role: 'user', content: message });
    conversation.messages.push({ role: 'assistant', content: aiResponseText });
    await conversation.save();

    return res.json({
      reply: aiResponseText,
      history: conversation.messages
    });
  } catch (err) {
    console.error('Chat controller error:', err);
    return res.status(500).json({ msg: 'Internal server error during chat.' });
  }
}

async function getChatHistory(req, res) {
  try {
    const userId = req.user.id;
    const conversation = await Conversation.findOne({ userId });
    
    return res.json(conversation ? conversation.messages : []);
  } catch (err) {
    console.error('Chat history error:', err);
    return res.status(500).json({ msg: 'Internal server error fetching chat history.' });
  }
}

async function clearChatHistory(req, res) {
  try {
    const userId = req.user.id;
    await Conversation.findOneAndDelete({ userId });
    return res.json({ msg: 'Chat history cleared successfully.' });
  } catch (err) {
    console.error('Clear chat error:', err);
    return res.status(500).json({ msg: 'Internal server error clearing chat.' });
  }
}

module.exports = {
  handleChat,
  getChatHistory,
  clearChatHistory
};
