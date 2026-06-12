const Joi = require('joi');

const upgradeSubscriptionSchema = Joi.object({
  planId: Joi.string().uuid().required().messages({
    'string.uuid': 'Invalid plan ID format',
    'any.required': 'Plan ID is required',
  }),
});

module.exports = {
  upgradeSubscriptionSchema,
};
