const Joi = require('joi');

const createPlanSchema = Joi.object({
  name: Joi.string().valid('Starter', 'Basic', 'Pro', 'Enterprise').required(),
  price: Joi.number().precision(2).min(0).required(),
  callLimit: Joi.number().integer().min(-1).required(), // -1 is unlimited
  maxConcurrentCalls: Joi.number().integer().min(1).required(),
});

const updatePlanSchema = Joi.object({
  price: Joi.number().precision(2).min(0).optional(),
  callLimit: Joi.number().integer().min(-1).optional(),
  maxConcurrentCalls: Joi.number().integer().min(1).optional(),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
};
