const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Upload limits (multer) are the caller's mistake, not a server fault.
  if (err && err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large - use a smaller one' : err.message;
    return res.status(400).json({ message });
  }
  const statusCode = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  if (statusCode >= 500) {
    logger.error(err.stack || err.message);
  }
  res.status(statusCode).json({
    message: err.message || 'Internal server error',
    details: err.details,
  });
}

module.exports = { notFoundHandler, errorHandler };
