const Joi = require('joi');

const merchantRegisterSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please enter a valid email address',
    'any.required': 'Email is required',
  }),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please enter a valid international mobile number',
    'any.required': 'Mobile number is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required',
  }),
  businessName: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Business name must be at least 2 characters long',
    'any.required': 'Business name is required',
  }),
  categoryId: Joi.string().uuid().required().messages({
    'string.uuid': 'Invalid category ID format',
    'any.required': 'Business category is required',
  }),
});

const adminRegisterSchema = Joi.object({
  email: Joi.string().email().required(),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
});

const verifyOtpSchema = Joi.object({
  otp: Joi.string().length(6).required(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
});

module.exports = {
  merchantRegisterSchema,
  adminRegisterSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOtpSchema,
};
