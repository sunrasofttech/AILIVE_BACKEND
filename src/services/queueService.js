const { redisClient } = require('../config/redis');

class QueueService {
  constructor() {
    this.SCHEDULE_SET = 'campaign_schedule';
    this.CALL_QUEUE = 'call_queue';
  }

  /**
   * Schedule a job in Redis Sorted Set (ZSET)
   * @param {string} type - Job type (e.g. 'START_CAMPAIGN', 'PLACE_CALL')
   * @param {object} payload - Job metadata
   * @param {number} timestamp - Epoch timestamp (ms) when this job should run
   */
  async scheduleJob(type, payload, timestamp) {
    const jobData = JSON.stringify({
      type,
      payload,
      scheduledTime: timestamp,
      createdAt: Date.now(),
    });
    
    // ZADD: Score is the timestamp, value is jobData
    await redisClient.zAdd(this.SCHEDULE_SET, {
      score: timestamp,
      value: jobData,
    });
  }

  /**
   * Push a job directly to active FIFO execution queue
   * @param {string} type - Job type (e.g., 'PLACE_CALL')
   * @param {object} payload - Job details
   */
  async enqueueJob(type, payload) {
    const jobData = JSON.stringify({
      type,
      payload,
      createdAt: Date.now(),
    });

    // RPUSH: Pushes job to the right side of the list
    await redisClient.rPush(this.CALL_QUEUE, jobData);
  }

  /**
   * Get and remove scheduled jobs that are ready to run (score <= current time)
   * @param {number} maxTimestamp - Maximum timestamp (typically Date.now())
   * @returns {Array<object>} Ready jobs
   */
  async fetchReadyScheduledJobs(maxTimestamp = Date.now()) {
    // 1. ZRANGEBYSCORE to get all jobs up to maxTimestamp
    const rawJobs = await redisClient.zRangeByScore(
      this.SCHEDULE_SET,
      0,
      maxTimestamp
    );

    if (!rawJobs || rawJobs.length === 0) {
      return [];
    }

    // 2. Remove those jobs from ZSET to prevent multiple workers from picking them up
    // Using ZREM
    for (const job of rawJobs) {
      await redisClient.zRem(this.SCHEDULE_SET, job);
    }

    return rawJobs.map((rj) => JSON.parse(rj));
  }

  /**
   * Increment active call count for a campaign
   * @param {string} campaignId 
   * @returns {number} New call count
   */
  async incrementActiveCalls(campaignId) {
    const key = `active_calls:${campaignId}`;
    return await redisClient.incr(key);
  }

  /**
   * Decrement active call count for a campaign
   * @param {string} campaignId 
   * @returns {number} New call count
   */
  async decrementActiveCalls(campaignId) {
    const key = `active_calls:${campaignId}`;
    const val = await redisClient.decr(key);
    if (val < 0) {
      await redisClient.set(key, 0);
      return 0;
    }
    return val;
  }

  /**
   * Get active call count for a campaign
   * @param {string} campaignId 
   */
  async getActiveCalls(campaignId) {
    const key = `active_calls:${campaignId}`;
    const val = await redisClient.get(key);
    return val ? parseInt(val, 10) : 0;
  }

  /**
   * Clear active call counter for a campaign
   * @param {string} campaignId 
   */
  async clearActiveCalls(campaignId) {
    const key = `active_calls:${campaignId}`;
    await redisClient.del(key);
  }
}

module.exports = new QueueService();
