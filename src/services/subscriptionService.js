const { Subscription, Plan } = require('../models');

class SubscriptionService {
  /**
   * Validates if a merchant user has active call credits and is within plan expiration limits
   * @param {string} userId - The Merchant User UUID
   * @returns {Promise<{ isValid: boolean, reason?: string, maxConcurrent?: number }>}
   */
  async validateCallLimits(userId) {
    const subscription = await Subscription.findOne({
      where: { userId },
      include: [{ model: Plan, as: 'plan' }],
    });

    if (!subscription) {
      return { isValid: false, reason: 'No active subscription plan found.' };
    }

    if (subscription.status !== 'active') {
      return { isValid: false, reason: `Subscription is currently: ${subscription.status}` };
    }

    // Check plan expiration
    if (subscription.expiryDate && new Date(subscription.expiryDate) < new Date()) {
      // Mark as expired in DB
      subscription.status = 'expired';
      await subscription.save();
      return { isValid: false, reason: 'Subscription plan has expired.' };
    }

    // Starter plan: Max 5 calls, but wait, Starter has callLimit = 5
    // Validate call quota. (Starter is free, no credits required but Max 5 calls total)
    // Basic/Pro have limits. Unlimited plans might have callLimit = -1
    const callLimit = subscription.plan.callLimit;
    
    if (callLimit !== -1 && subscription.callsRemaining <= 0) {
      return { isValid: false, reason: 'Call quota limit reached for the current billing cycle.' };
    }

    return {
      isValid: true,
      maxConcurrent: subscription.plan.maxConcurrentCalls,
    };
  }

  /**
   * Deduct 1 call credit and record usage
   * @param {string} userId 
   */
  async recordCallUsage(userId) {
    const subscription = await Subscription.findOne({ where: { userId } });
    if (!subscription) return;

    subscription.callsUsed += 1;
    if (subscription.callsRemaining > 0) {
      subscription.callsRemaining -= 1;
    }
    await subscription.save();
  }
}

module.exports = new SubscriptionService();
