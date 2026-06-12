const { verifyAccessToken } = require('../utils/token');
const { User, Admin } = require('../models');
const ResponseBuilder = require('../utils/response');

/**
 * Authentication check middleware.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ResponseBuilder.error(res, 'Authentication token missing or invalid format', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return ResponseBuilder.error(res, 'Invalid or expired authentication token', 401);
    }

    let userObj = null;

    if (decoded.role === 'super_admin') {
      userObj = await Admin.findByPk(decoded.id);
    } else {
      userObj = await User.findByPk(decoded.id, {
        include: ['category'],
      });
    }

    if (!userObj) {
      return ResponseBuilder.error(res, 'User profile not found', 401);
    }

    // Attach to request
    req.user = userObj;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return ResponseBuilder.error(res, 'Internal authentication error', 500);
  }
};

/**
 * Super Admin check
 */
const isAdmin = (req, res, next) => {
  if (req.userRole !== 'super_admin') {
    return ResponseBuilder.error(res, 'Forbidden: Admin access only', 403);
  }
  next();
};

/**
 * Merchant check
 */
const isMerchant = (req, res, next) => {
  if (req.userRole !== 'merchant') {
    return ResponseBuilder.error(res, 'Forbidden: Merchant access only', 403);
  }
  next();
};

module.exports = {
  authenticate,
  isAdmin,
  isMerchant,
};
