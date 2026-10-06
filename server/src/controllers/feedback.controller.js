const Shipment = require('../models/Shipment');
const Feedback = require('../models/Feedback');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { deliveryChannels, RETRY_WINDOW_DAYS } = require('../services/customerNotification.service');

/** Any courier; the most recently added shipment with this AWB. */
function findByTrackingNumber(trackingNumber) {
  return Shipment.findOne({ trackingNumber }).sort({ createdAt: -1 });
}

/** Never leak customer contact details onto a page whose only credential is the AWB. */
function publicView(feedback) {
  if (!feedback) return null;
  return {
    rating: feedback.rating,
    comment: feedback.comment,
    consentToPublish: !!feedback.consentToPublish,
    submittedAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
}

/**
 * What the public feedback page needs to render itself: enough to confirm the
 * customer is rating the right parcel, plus whatever they already submitted so the
 * form comes back pre-filled instead of pretending it's their first visit.
 */
const getPublicFeedback = asyncHandler(async (req, res) => {
  const shipment = await findByTrackingNumber(req.params.trackingNumber);
  if (!shipment) throw new ApiError(404, 'No shipment found for this tracking number');

  const feedback = await Feedback.findOne({ shipmentId: shipment._id });

  res.json({
    trackingNumber: shipment.trackingNumber,
    productName: shipment.productDetails?.name || '',
    status: shipment.status,
    // Feedback is about a completed delivery - the form stays closed until then.
    isDelivered: shipment.status === 'delivered',
    deliveredAt: shipment.status === 'delivered' ? shipment.deliveredAt || shipment.updatedAt : null,
    feedback: publicView(feedback),
  });
});

/**
 * Reviews for the public marketing page. Only feedback the customer agreed to publish
 * AND the ops team chose to feature - never "every rating we ever got". Returns first
 * name + initial rather than the full customer name, which is the most a B2B contact
 * usually expects to see of themselves on a vendor's homepage.
 */
const listPublicReviews = asyncHandler(async (req, res) => {
  const reviews = await Feedback.find({ isPublished: true, consentToPublish: true, comment: { $ne: '' } })
    .sort({ updatedAt: -1 })
    .limit(12);

  res.json({
    reviews: reviews.map((f) => ({
      id: f._id,
      rating: f.rating,
      comment: f.comment,
      customerName: f.customerName || 'Verified customer',
      submittedAt: f.createdAt,
    })),
  });
});

const submitPublicFeedback = asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 2000) : '';
  const consentToPublish = req.body.consentToPublish === true;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be a whole number from 1 to 5');
  }

  const shipment = await findByTrackingNumber(req.params.trackingNumber);
  if (!shipment) throw new ApiError(404, 'No shipment found for this tracking number');
  if (shipment.status !== 'delivered') {
    throw new ApiError(409, 'This shipment has not been delivered yet');
  }

  // Upsert, not insert: a customer who submits twice is correcting their own answer,
  // not filing a second review.
  const feedback = await Feedback.findOneAndUpdate(
    { shipmentId: shipment._id },
    {
      $set: {
        rating,
        comment,
        consentToPublish,
        trackingNumber: shipment.trackingNumber,
        customerName: shipment.customerInfo?.name || '',
        ownerId: shipment.createdBy,
      },
      // Withdrawing consent on a re-submit must pull the review off the site, so
      // un-publish it too rather than leaving a featured quote with no permission.
      ...(consentToPublish ? {} : { $unset: { isPublished: '' } }),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  res.status(201).json({ feedback: publicView(feedback) });
});

/** Dashboard-side read, scoped to the signed-in user's own shipments. */
const getShipmentFeedback = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne({
    _id: req.params.id,
    createdBy: req.userId,
  });
  if (!shipment) throw new ApiError(404, 'Shipment not found');

  const feedback = await Feedback.findOne({ shipmentId: shipment._id });
  res.json({
    feedback: feedback
      ? { ...publicView(feedback), customerName: feedback.customerName, isPublished: !!feedback.isPublished }
      : null,
    deliveryNoticeSentAt: shipment.deliveryNoticeSentAt || null,
    // Lets the panel explain *why* nothing has gone out yet, not just that it hasn't.
    channels: deliveryChannels(),
    retryWindowDays: RETRY_WINDOW_DAYS,
  });
});

/** Ops featuring (or un-featuring) a review on the public site. */
const setFeedbackPublished = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findOne({
    _id: req.params.id,
    createdBy: req.userId,
  });
  if (!shipment) throw new ApiError(404, 'Shipment not found');

  const feedback = await Feedback.findOne({ shipmentId: shipment._id });
  if (!feedback) throw new ApiError(404, 'No feedback on this shipment yet');

  const isPublished = req.body.isPublished === true;
  if (isPublished && !feedback.consentToPublish) {
    throw new ApiError(409, 'This customer did not agree to have their review published');
  }
  if (isPublished && !feedback.comment) {
    throw new ApiError(409, 'A review needs a written comment before it can be featured');
  }

  feedback.isPublished = isPublished;
  await feedback.save();
  res.json({ isPublished: feedback.isPublished });
});

module.exports = {
  getPublicFeedback,
  submitPublicFeedback,
  listPublicReviews,
  getShipmentFeedback,
  setFeedbackPublished,
};
