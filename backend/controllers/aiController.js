const Conversation = require('../models/Conversation');
const Bill = require('../models/Bill');
const PendingAction = require('../models/PendingAction');
const geminiService = require('../services/geminiService');
const { createDifyUserContext } = require('../utils/aiContext');

async function handleChat(req, res) {
  try {
    const { message } = req.body || {};
    const userId = req.user.id;

    const trimmedMessage = typeof message === 'string' ? message.trim().slice(0, 4000) : '';
    if (!trimmedMessage) {
      return res.status(400).json({ msg: 'Please enter a message.' });
    }

    // Retrieve active conversation or create one
    let conversation = await Conversation.findOne({ userId });
    if (!conversation) {
      conversation = new Conversation({ userId, messages: [] });
    }

    // Fetch user's actual bills from MongoDB (correct query using user ref)
    const bills = await Bill.find({ user: userId }).sort({ date: 1 });

    // Generate AI response passing the actual bills to ground the responses
    const contextToken = createDifyUserContext(userId);
    const aiResponse = await geminiService.generateChatResponse(
      trimmedMessage,
      bills,
      contextToken,
      userId,
      conversation.difyConversationId
    );
    const aiResponseText = typeof aiResponse === 'string' ? aiResponse : aiResponse.reply;
    if (aiResponse?.conversationId) conversation.difyConversationId = aiResponse.conversationId;
    const requestedActions = Array.isArray(aiResponse?.pendingActions) ? aiResponse.pendingActions : [];
    const pendingActions = [];

    for (const requested of requestedActions.slice(0, 5)) {
      if (!requested || typeof requested.confirmationToken !== 'string') continue;
      const action = await PendingAction.findOne({
        userId,
        confirmationHash: requested.confirmationToken,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      }).select('preview expiresAt');
      if (action) {
        pendingActions.push({
          confirmationToken: requested.confirmationToken,
          preview: action.preview,
          expiresAt: action.expiresAt
        });
      }
    }

    // Save to conversation history
    conversation.messages.push({ role: 'user', content: trimmedMessage });
    conversation.messages.push({ role: 'assistant', content: aiResponseText });
    await conversation.save();

    return res.json({
      reply: aiResponseText,
      pendingActions,
      executionStatus: pendingActions.length ? 'confirmation_required' : 'complete',
      history: conversation.messages
    });
  } catch (err) {
    console.error('Chat controller error:', err.message);
    const status = err.code === 'DIFY_UNAVAILABLE' ? 502 : err.code === 'DIFY_CONFIGURATION_ERROR' ? 503 : 500;
    return res.status(status).json({
      success: false,
      msg: err.code === 'DIFY_UNAVAILABLE'
        ? 'The AI service is temporarily unavailable. Please try again.'
        : 'The AI assistant is temporarily unavailable. Please try again.'
    });
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

async function getPendingActions(req, res) {
  try {
    const actions = await PendingAction.find({
      userId: req.user.id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).limit(10).select('confirmationHash preview expiresAt');
    return res.json(actions.map((action) => ({
      confirmationToken: action.confirmationHash,
      preview: action.preview,
      expiresAt: action.expiresAt
    })));
  } catch (error) {
    console.error('Pending action lookup error:', error.message);
    return res.status(500).json({ msg: 'Failed to load pending actions.' });
  }
}

module.exports = {
  handleChat,
  getChatHistory,
  clearChatHistory,
  getPendingActions
};
