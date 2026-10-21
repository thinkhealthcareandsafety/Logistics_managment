const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({ label: String, sub: String, href: String }, { _id: false });
const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, default: '', maxlength: 4000 },
    items: { type: [itemSchema], default: [] },
    suggestions: { type: [String], default: [] },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * One assistant conversation on one device (several people share one sign-in, so chats
 * are kept per browser). `context` is what the last answer was about, so a follow-up -
 * "how many of them are from Gujarat?" - builds on it. Small text only; capped at 200
 * messages, and a chat untouched for 90 days is deleted by the database itself.
 */
const assistantChatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    messages: { type: [messageSchema], default: [] },
    context: { type: mongoose.Schema.Types.Mixed, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
assistantChatSchema.index({ userId: 1, deviceId: 1, closedAt: 1 });
assistantChatSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AssistantChat', assistantChatSchema);
