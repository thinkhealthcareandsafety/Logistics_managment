const mongoose = require('mongoose');

/**
 * Customer feedback on a delivered shipment, submitted from the public
 * /feedback/:trackingNumber page - no login, same access model as public tracking
 * (the tracking number is the credential).
 *
 * One document per shipment: a customer who submits twice is correcting themselves,
 * not filing a second review, so the controller upserts rather than appending.
 */
const feedbackSchema = new mongoose.Schema(
  {
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
      unique: true,
      index: true,
    },
    trackingNumber: { type: String, required: true, trim: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true, maxlength: 2000 },

    // Snapshotted so the feedback still reads sensibly if the shipment's customer
    // details are later edited or the shipment is deleted.
    customerName: { type: String, default: '' },

    // Publishing a review takes BOTH of these. `consentToPublish` is the customer
    // ticking the box on the feedback form - we don't put someone's words and name on
    // a public marketing page without them agreeing to it. `isPublished` is the ops
    // team then choosing to feature it. Neither alone is enough.
    consentToPublish: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },

    // Whose book of business this belongs to - lets analytics scope by user the same
    // way every other query does, without a join back to the shipment.
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
