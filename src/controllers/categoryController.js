const { Category, Voice } = require('../models');
const ResponseBuilder = require('../utils/response');
const { createCategorySchema, updateCategorySchema } = require('../validators/category');

class CategoryController {
  /**
   * Get all categories
   */
  async getAll(req, res, next) {
    try {
      const categories = await Category.findAll({
        include: [{ model: Voice, as: 'defaultVoice' }],
      });
      return ResponseBuilder.success(res, categories, 'Categories retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single category
   */
  async getById(req, res, next) {
    try {
      const category = await Category.findByPk(req.params.id, {
        include: [{ model: Voice, as: 'defaultVoice' }],
      });
      if (!category) {
        return ResponseBuilder.error(res, 'Category not found', 404);
      }
      return ResponseBuilder.success(res, category, 'Category retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create category (Admin Only)
   */
  async create(req, res, next) {
    try {
      const { error, value } = createCategorySchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, defaultPrompt, defaultVoiceId, defaultLanguage, defaultAgentConfig } = value;

      // Check if voice exists (if defaultVoiceId provided)
      if (defaultVoiceId) {
        const voice = await Voice.findByPk(defaultVoiceId);
        if (!voice) {
          return ResponseBuilder.error(res, 'Default Voice not found', 400);
        }
      }

      const category = await Category.create({
        name,
        defaultPrompt,
        defaultVoiceId,
        defaultLanguage,
        defaultAgentConfig,
      });

      return ResponseBuilder.success(res, category, 'Category created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update category (Admin Only)
   */
  async update(req, res, next) {
    try {
      const { error, value } = updateCategorySchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return ResponseBuilder.error(res, 'Category not found', 404);
      }

      const { name, defaultPrompt, defaultVoiceId, defaultLanguage, defaultAgentConfig } = value;

      if (defaultVoiceId) {
        const voice = await Voice.findByPk(defaultVoiceId);
        if (!voice) {
          return ResponseBuilder.error(res, 'Default Voice not found', 400);
        }
      }

      await category.update({
        name: name !== undefined ? name : category.name,
        defaultPrompt: defaultPrompt !== undefined ? defaultPrompt : category.defaultPrompt,
        defaultVoiceId: defaultVoiceId !== undefined ? defaultVoiceId : category.defaultVoiceId,
        defaultLanguage: defaultLanguage !== undefined ? defaultLanguage : category.defaultLanguage,
        defaultAgentConfig: defaultAgentConfig !== undefined ? defaultAgentConfig : category.defaultAgentConfig,
      });

      return ResponseBuilder.success(res, category, 'Category updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete category (Admin Only)
   */
  async delete(req, res, next) {
    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return ResponseBuilder.error(res, 'Category not found', 404);
      }

      await category.destroy();
      return ResponseBuilder.success(res, null, 'Category deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CategoryController();
