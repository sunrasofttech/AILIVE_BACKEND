const { redisClient } = require('../config/redis');

class QueueService {
  constructor() {
    this.SCHEDULE_SET = 'campaign_schedule';
    this.CALL_QUEUE = 'call_queue';
    this.REPORT_QUEUE = 'report_queue';
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
   * Enqueue a call report payload for reliable analysis
   * @param {object} payload 
   */
  async enqueueReport(payload) {
    await redisClient.rPush(this.REPORT_QUEUE, JSON.stringify(payload));
  }

  /**
   * Get and remove scheduled jobs that are ready to run (score <= current time)
   * @param {number} maxTimestamp - Maximum timestamp (typically Date.now())
   * @returns {Array<object>} Ready jobs
   */
  async fetchReadyScheduledJobs(maxTimestamp = Date.now()) {
    // Execute atomic Lua script to prevent race conditions among multiple workers
    const rawJobs = await redisClient.eval(
      `local jobs = redis.call('zrangebyscore', KEYS[1], 0, ARGV[1])
       if #jobs > 0 then
         redis.call('zremrangebyscore', KEYS[1], 0, ARGV[1])
       end
       return jobs`,
      {
        keys: [this.SCHEDULE_SET],
        arguments: [String(maxTimestamp)]
      }
    );

    if (!rawJobs || rawJobs.length === 0) {
      return [];
    }

    return rawJobs.map((rj) => JSON.parse(rj));
  }

  /**
   * Register a new active call session with a TTL to prevent stuck counters
   * @param {string} campaignId 
   * @param {string} callSessionId 
   * @param {number} ttlMs 
   */
  async registerActiveCall(campaignId, callSessionId, ttlMs = 3600000) {
    const key = `active_calls_zset:${campaignId}`;
    const score = Date.now() + ttlMs;
    await redisClient.zAdd(key, {
      score,
      value: String(callSessionId),
    });
  }

  /**
   * Deregister an active call session
   * @param {string} campaignId 
   * @param {string} callSessionId 
   */
  async deregisterActiveCall(campaignId, callSessionId) {
    const key = `active_calls_zset:${campaignId}`;
    await redisClient.zRem(key, String(callSessionId));
  }

  /**
   * Get current active call count, pruning any that expired
   * @param {string} campaignId 
   */
  async getActiveCalls(campaignId) {
    const key = `active_calls_zset:${campaignId}`;
    const now = Date.now();
    // Clean up expired calls
    await redisClient.zRemRangeByScore(key, 0, now);
    return await redisClient.zCard(key);
  }

  /**
   * Clear all active calls for a campaign
   * @param {string} campaignId 
   */
  async clearActiveCalls(campaignId) {
    const key = `active_calls_zset:${campaignId}`;
    await redisClient.del(key);
  }
}

module.exports = new QueueService();
