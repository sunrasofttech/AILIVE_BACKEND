const ResponseBuilder = require('../utils/response');

/**
 * Global error handling middleware.
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled Error:', err);

  // Sequelize Unique Constraint Error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    return ResponseBuilder.error(res, 'Validation error: Unique constraint violated', 400, details);
  }

  // Sequelize ValidationError
  if (err.name === 'SequelizeValidationError') {
    const details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    return ResponseBuilder.error(res, 'Validation error', 400, details);
  }

  // Custom rate-limit errors or standard operational errors
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred';
  
  return ResponseBuilder.error(
    res,
    message,
    statusCode,
    process.env.NODE_ENV === 'development' ? { stack: err.stack } : null
  );
}

module.exports = errorHandler;
