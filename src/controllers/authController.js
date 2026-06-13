const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Admin, Subscription, Plan, Category } = require('../models');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/token');
const ResponseBuilder = require('../utils/response');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}
const {
  merchantRegisterSchema,
  adminRegisterSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} = require('../validators/auth');

class AuthController {
  /**
   * Merchant Registration
   */
  async registerMerchant(req, res, next) {
    try {
      const { error, value } = merchantRegisterSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, password, businessName, categoryId } = value;

      // 1. Check if category exists
      const category = await Category.findByPk(categoryId);
      if (!category) {
        return ResponseBuilder.error(res, 'Selected business category does not exist', 400);
      }

      // 2. Check if user already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return ResponseBuilder.error(res, 'Email address already registered', 400);
      }

      // 3. Hash Password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 4. Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // 5. Create Merchant User
      const merchant = await User.create({
        email,
        passwordHash,
        businessName,
        categoryId,
        verificationToken,
      });

      // 6. Setup Initial Starter Subscription Plan
      let starterPlan = await Plan.findOne({ where: { name: 'Starter' } });
      if (!starterPlan) {
        // Seed default Starter plan if it doesn't exist
        starterPlan = await Plan.create({
          name: 'Starter',
          price: 0.00,
          callLimit: 5,
          maxConcurrentCalls: 1,
        });
      }

      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setMonth(now.getMonth() + 1); // 1 month expiration

      await Subscription.create({
        userId: merchant.id,
        planId: starterPlan.id,
        activePlan: starterPlan.name,
        startDate: now,
        expiryDate,
        callsUsed: 0,
        callsRemaining: starterPlan.callLimit,
        status: 'active',
      });

      // Send verification email in the background
      await sendVerificationEmail(email, verificationToken);

      // Response (Excludes password hash)
      const userResponse = {
        id: merchant.id,
        email: merchant.email,
        businessName: merchant.businessName,
        categoryId: merchant.categoryId,
        isVerified: merchant.isVerified,
      };

      return ResponseBuilder.success(
        res,
        { user: userResponse },
        'Merchant registered successfully. Please verify your email.',
        201
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Super Admin Registration
   */
  async registerAdmin(req, res, next) {
    try {
      const { error, value } = adminRegisterSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, password, firstName, lastName } = value;

      const existingAdmin = await Admin.findOne({ where: { email } });
      if (existingAdmin) {
        return ResponseBuilder.error(res, 'Admin email already registered', 400);
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const verificationToken = crypto.randomBytes(32).toString('hex');

      const admin = await Admin.create({
        email,
        passwordHash,
        firstName,
        lastName,
        role: 'super_admin',
        isVerified: true, // admin auto-verified for local dev simplicity, token is saved
        verificationToken,
      });

      const adminResponse = {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      };

      return ResponseBuilder.success(
        res,
        { admin: adminResponse },
        'Super Admin registered successfully',
        201
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Login (Unified Admin and Merchant)
   */
  async login(req, res, next) {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, password, role } = value;

      let account = null;

      if (role === 'super_admin') {
        account = await Admin.findOne({ where: { email } });
      } else {
        account = await User.findOne({ where: { email } });
      }

      if (!account) {
        return ResponseBuilder.error(res, 'Invalid email or password', 401);
      }

      // Check Password
      const isMatch = await bcrypt.compare(password, account.passwordHash);
      if (!isMatch) {
        return ResponseBuilder.error(res, 'Invalid email or password', 401);
      }

      // Check Verification
      if (!account.isVerified && role !== 'super_admin') {
        return ResponseBuilder.error(res, 'Please verify your email before logging in', 403);
      }

      // Tokens
      const tokenPayload = { id: account.id, email: account.email, role };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Save Refresh Token for validation (hashed)
      if (role === 'merchant') {
        account.refreshToken = hashToken(refreshToken);
        await account.save();
      }

      const profile = {
        id: account.id,
        email: account.email,
        role,
        ...(role === 'merchant' ? { businessName: account.businessName } : { firstName: account.firstName, lastName: account.lastName }),
      };

      return ResponseBuilder.success(
        res,
        { profile, accessToken, refreshToken },
        'Logged in successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Refresh Token
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return ResponseBuilder.error(res, 'Refresh token is required', 400);
      }

      const decoded = verifyRefreshToken(refreshToken);
      if (!decoded) {
        return ResponseBuilder.error(res, 'Invalid or expired refresh token', 401);
      }

      let account = null;
      if (decoded.role === 'super_admin') {
        account = await Admin.findByPk(decoded.id);
      } else {
        account = await User.findByPk(decoded.id);
        if (account && account.refreshToken !== hashToken(refreshToken)) {
          return ResponseBuilder.error(res, 'Session expired or revoked', 401);
        }
      }

      if (!account) {
        return ResponseBuilder.error(res, 'Account not found', 401);
      }

      const tokenPayload = { id: account.id, email: account.email, role: decoded.role };
      const newAccessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      if (decoded.role === 'merchant') {
        account.refreshToken = hashToken(newRefreshToken);
        await account.save();
      }

      return ResponseBuilder.success(
        res,
        { accessToken: newAccessToken, refreshToken: newRefreshToken },
        'Token refreshed successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Verify Email
   */
  async verifyEmail(req, res, next) {
    try {
      const { error, value } = verifyEmailSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { token, role } = value;

      if (role === 'super_admin') {
        const admin = await Admin.findOne({ where: { verificationToken: token } });
        if (!admin) {
          return ResponseBuilder.error(res, 'Invalid verification token', 400);
        }
        admin.isVerified = true;
        admin.verificationToken = null;
        await admin.save();
        return ResponseBuilder.success(res, null, 'Admin email verified successfully');
      } else {
        const user = await User.findOne({ where: { verificationToken: token } });
        if (!user) {
          return ResponseBuilder.error(res, 'Invalid verification token', 400);
        }
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();
        return ResponseBuilder.success(res, null, 'Merchant email verified successfully');
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * Forgot Password
   */
  async forgotPassword(req, res, next) {
    try {
      const { error, value } = forgotPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, role } = value;

      let account = null;
      if (role === 'super_admin') {
        account = await Admin.findOne({ where: { email } });
      } else {
        account = await User.findOne({ where: { email } });
      }

      if (!account) {
        // Return 200 for security, to prevent username enumeration
        return ResponseBuilder.success(res, null, 'If this email exists, a password reset link has been sent');
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

      account.resetToken = resetToken;
      account.resetTokenExpires = resetTokenExpires;
      await account.save();

      // Send password reset email in the background
      await sendPasswordResetEmail(email, resetToken, role);

      return ResponseBuilder.success(
        res,
        null,
        'If this email exists, a password reset link has been sent'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset Password
   */
  async resetPassword(req, res, next) {
    try {
      const { error, value } = resetPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { token, password, role } = value;

      let account = null;
      if (role === 'super_admin') {
        account = await Admin.findOne({
          where: { resetToken: token },
        });
      } else {
        account = await User.findOne({
          where: { resetToken: token },
        });
      }

      if (!account || !account.resetTokenExpires || account.resetTokenExpires < new Date()) {
        return ResponseBuilder.error(res, 'Reset token is invalid or has expired', 400);
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      account.passwordHash = passwordHash;
      account.resetToken = null;
      account.resetTokenExpires = null;
      if (role === 'merchant') {
        account.refreshToken = null; // Revoke refresh tokens on password reset
      }
      await account.save();

      return ResponseBuilder.success(res, null, 'Password reset successfully. You can now login.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
