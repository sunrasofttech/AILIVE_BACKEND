const { Plan } = require('../models');
const ResponseBuilder = require('../utils/response');
const { createPlanSchema, updatePlanSchema } = require('../validators/plan');

class PlanController {
  /**
   * Get all plans
   */
  async getAll(req, res, next) {
    try {
      const plans = await Plan.findAll();
      return ResponseBuilder.success(res, plans, 'Plans retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get plan by ID
   */
  async getById(req, res, next) {
    try {
      const plan = await Plan.findByPk(req.params.id);
      if (!plan) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }
      return ResponseBuilder.success(res, plan, 'Plan retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create Plan (Admin Only)
   */
  async create(req, res, next) {
    try {
      const { error, value } = createPlanSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, price, callLimit, maxConcurrentCalls } = value;

      // Check if plan already exists with same name
      const existingPlan = await Plan.findOne({ where: { name } });
      if (existingPlan) {
        return ResponseBuilder.error(res, `Plan with name '${name}' already exists`, 400);
      }

      const plan = await Plan.create({
        name,
        price,
        callLimit,
        maxConcurrentCalls,
      });

      return ResponseBuilder.success(res, plan, 'Plan created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Plan (Admin Only)
   */
  async update(req, res, next) {
    try {
      const { error, value } = updatePlanSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const plan = await Plan.findByPk(req.params.id);
      if (!plan) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }

      const { price, callLimit, maxConcurrentCalls } = value;

      await plan.update({
        price: price !== undefined ? price : plan.price,
        callLimit: callLimit !== undefined ? callLimit : plan.callLimit,
        maxConcurrentCalls: maxConcurrentCalls !== undefined ? maxConcurrentCalls : plan.maxConcurrentCalls,
      });

      return ResponseBuilder.success(res, plan, 'Plan updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete Plan (Admin Only)
   */
  async delete(req, res, next) {
    try {
      const plan = await Plan.findByPk(req.params.id);
      if (!plan) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }

      await plan.destroy();
      return ResponseBuilder.success(res, null, 'Plan deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PlanController();
