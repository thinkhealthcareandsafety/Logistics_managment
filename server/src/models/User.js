const mongoose = require('mongoose');

const { STATUSES } = require('../utils/statusMap');

const notificationPreferencesSchema = new mongoose.Schema(
  {
    emailEnabled: { type: Boolean, default: true },
    inAppEnabled: { type: Boolean, default: true },
    whatsappEnabled: { type: Boolean, default: false },
    whatsappNumber: { type: String, default: '' },
    notifyOnStatuses: {
      type: [String],
      enum: STATUSES,
      default: ['out_for_delivery', 'delivered', 'exception'],
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    company: { type: String, default: 'ThinkHealth' },
    notificationPreferences: { type: notificationPreferencesSchema, default: () => ({}) },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    company: this.company,
    notificationPreferences: this.notificationPreferences,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
