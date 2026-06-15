const {
  sequelize,
  User,
  Campaign,
  CampaignCustomer,
  Customer,
  CustomerList,
  CustomerListMember,
  Plan,
  Subscription,
  VobizNumber,
  Voice,
  Category,
  Agent,
  CallSession,
  VobizAccount
} = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/models');

const QueueService = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/services/queueService');
const { redisClient } = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/config/redis');
const { encrypt, decrypt } = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/utils/crypto');
const { startAiWorker } = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/workers/aiWorker');
const { startScheduler } = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/workers/schedulerWorker');
const { startCallWorker } = require('/Users/navneetgupta/Library/Mobile Documents/com~apple~CloudDocs/Desktop/sunra-projects/AILIVE_BACKEND/src/workers/callWorker');

async function runTests() {
  console.log('--- STARTING BACKEND REFRACTOR VALIDATION SUITE ---');

  // 1. Verify Database and Redis Connectivity
  await sequelize.authenticate();
  console.log('Database and Redis connections authenticated.');

  // Sync / Reset tables for test
  console.log('Syncing tables...');
  await sequelize.sync({ force: true });

  // ============================================
  // TEST 1: AES-256-GCM Encryption & Decryption
  // ============================================
  console.log('\n--- TEST 1: AES-256-GCM Encryption & Decryption ---');
  const secretData = 'my_super_secret_vobiz_api_key_2026';
  const encrypted = encrypt(secretData);
  console.log('Encrypted text:', encrypted);

  if (!encrypted || encrypted.split(':').length !== 3) {
    throw new Error('FAIL: AES Encryption failed to generate standard iv:ciphertext:tag format.');
  }

  const decrypted = decrypt(encrypted);
  console.log('Decrypted text:', decrypted);

  if (decrypted === secretData) {
    console.log('SUCCESS: AES encryption and decryption verified successfully.');
  } else {
    throw new Error(`FAIL: Decrypted data "${decrypted}" does not match original "${secretData}"`);
  }

  // ============================================
  // TEST 2: ZSET-based Active Calls Concurrency
  // ============================================
  console.log('\n--- TEST 2: ZSET-based Active Calls Concurrency ---');
  const campaignId = '77777777-7777-7777-7777-777777777777';
  
  // Register 3 active calls
  await QueueService.registerActiveCall(campaignId, 'session-1');
  await QueueService.registerActiveCall(campaignId, 'session-2');
  await QueueService.registerActiveCall(campaignId, 'session-3', -10000); // Already expired (score in past)

  const activeCount = await QueueService.getActiveCalls(campaignId);
  console.log('Active call count (should be 2 due to 1 expired):', activeCount);

  if (activeCount === 2) {
    console.log('SUCCESS: Active call count with TTL expiration pruning works correctly.');
  } else {
    throw new Error(`FAIL: Active call count is ${activeCount}, expected 2`);
  }

  // Deregister a call
  await QueueService.deregisterActiveCall(campaignId, 'session-1');
  const newActiveCount = await QueueService.getActiveCalls(campaignId);
  console.log('Active call count after deregistration:', newActiveCount);

  if (newActiveCount === 1) {
    console.log('SUCCESS: Deregistering call session updates count successfully.');
  } else {
    throw new Error(`FAIL: Active call count after deregistration is ${newActiveCount}, expected 1`);
  }

  // Clean ZSET
  await QueueService.clearActiveCalls(campaignId);

  // ============================================
  // TEST 3: Campaign Dispatcher & Database Pacing
  // ============================================
  console.log('\n--- TEST 3: Campaign Dispatcher & Database Pacing ---');

  // Seed minimum models
  const voice = await Voice.create({
    name: 'Amrit',
    provider: 'sarvam',
    voiceId: 'amrit',
    language: 'en-IN',
    gender: 'male'
  });
  
  const category = await Category.create({
    name: 'Support',
    defaultPrompt: 'You are support.',
    defaultVoiceId: voice.id,
    defaultLanguage: 'en-IN'
  });
  
  const user = await User.create({
    email: 'test@example.com',
    passwordHash: 'hashed',
    businessName: 'Scale Testing',
    categoryId: category.id,
    isVerified: true
  });
  
  const plan = await Plan.create({
    name: 'Scale Plan',
    price: 0,
    callLimit: 50,
    maxConcurrentCalls: 5
  });
  
  const subscription = await Subscription.create({
    userId: user.id,
    planId: plan.id,
    activePlan: plan.name,
    startDate: new Date(),
    callsUsed: 0,
    callsRemaining: 50,
    status: 'active'
  });

  const vobizNum = await VobizNumber.create({
    userId: user.id,
    number: '+1234567',
    status: 'active'
  });

  // Encrypt VoBiz Credentials
  const vobizAcc = await VobizAccount.create({
    userId: user.id,
    customerId: 'cust-1',
    apiKey: encrypt('secret_key_123'),
    apiSecret: encrypt('secret_secret_123')
  });

  const agent = await Agent.create({
    userId: user.id,
    name: 'Agent X',
    systemPrompt: 'Greet user',
    language: 'en-IN',
    voiceId: voice.id,
    categoryId: category.id
  });

  const list = await CustomerList.create({
    userId: user.id,
    name: 'Test List'
  });

  // Seed 5 customers
  for (let i = 0; i < 5; i++) {
    const c = await Customer.create({
      userId: user.id,
      name: `Customer ${i}`,
      mobile: `+1555000${i}`
    });
    await CustomerListMember.create({
      customerListId: list.id,
      customerId: c.id
    });
  }

  // Create Campaign
  const campaign = await Campaign.create({
    userId: user.id,
    name: 'Refactor Validation Campaign',
    vobizNumberId: vobizNum.id,
    agentId: agent.id,
    customerListId: list.id,
    startTime: new Date(),
    intervalBetweenCalls: 5, // 5s pacing
    maxConcurrentCalls: 2,   // Max 2 concurrent
    status: 'running' // Mark running to trigger dispatcher scan
  });

  // Link campaign customers
  await sequelize.query(
    `INSERT IGNORE INTO campaign_customers (id, campaign_id, customer_id, call_status, retry_count, created_at, updated_at)
     SELECT UUID(), :campaignId, customer_id, 'pending', 0, NOW(), NOW()
     FROM customer_list_members
     WHERE customer_list_id = :listId`,
    {
      replacements: { campaignId: campaign.id, listId: list.id },
      type: sequelize.QueryTypes.INSERT
    }
  );

  console.log('Seeded database and linked customers.');

  // Run dispatcher logic in background (simulate scheduler loop)
  // Let's start scheduler and callWorker
  startScheduler();
  startCallWorker();
  startAiWorker();

  console.log('Waiting for workers to dispatch calls...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Verify that only 1 call was dispatched because intervalBetweenCalls = 5 (pacing)
  // Wait, if pacing spacingMs = 5000, the first dispatch dispatches 1 call, then sets last_dispatch, and skips subsequent iterations for 5 seconds.
  // So exactly 1 call should be in call_queue or initiated.
  const activeCountAfterDispatch = await QueueService.getActiveCalls(campaign.id);
  const queueLength = await redisClient.lLen(QueueService.CALL_QUEUE);
  const callingCustomers = await CampaignCustomer.count({
    where: { campaignId: campaign.id, callStatus: 'calling' }
  });

  console.log('Active ZSET calls:', activeCountAfterDispatch);
  console.log('CALL_QUEUE Length:', queueLength);
  console.log('Database CampaignCustomer calling count:', callingCustomers);

  if (callingCustomers === 1) {
    console.log('SUCCESS: Campaign dispatcher pacing (intervalBetweenCalls) respected (dispatched exactly 1 call).');
  } else {
    throw new Error(`FAIL: Expected exactly 1 call dispatched. Found ${callingCustomers} calling customers.`);
  }

  // ============================================
  // TEST 4: Reliable REPORT_QUEUE
  // ============================================
  console.log('\n--- TEST 4: Reliable REPORT_QUEUE ---');

  // Find the calling session
  const session = await CallSession.findOne({ where: { campaignId: campaign.id } });
  if (!session) {
    throw new Error('FAIL: CallSession not found.');
  }

  // Push a mock report event to REPORT_QUEUE
  const reportEvent = {
    callSessionId: session.id,
    userId: user.id,
    campaignId: campaign.id,
    vobizNumberId: vobizNum.id,
    customerId: session.customerId,
    transcript: 'Hello. Yes interested.',
    duration: 12,
    recordingUrl: '/uploads/mock.wav'
  };

  await QueueService.enqueueReport(reportEvent);
  console.log('Enqueued report event into reliable REPORT_QUEUE list.');

  console.log('Waiting for AI worker to pop and process...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Reload report in DB
  const report = await sequelize.models.CallReport.findOne({ where: { callSessionId: session.id } });
  if (report) {
    console.log('SUCCESS: AI Worker successfully processed report from reliable REPORT_QUEUE list.');
    console.log('Outcome:', report.outcome);
  } else {
    throw new Error('FAIL: CallReport was not created by AI worker.');
  }

  // ============================================
  // TEST 5: Idempotent Reporting (Double process protection)
  // ============================================
  console.log('\n--- TEST 5: Idempotent Reporting ---');
  // Attempt to enqueue and process the exact same report event again
  await QueueService.enqueueReport(reportEvent);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const reportCount = await sequelize.models.CallReport.count({ where: { callSessionId: session.id } });
  console.log('Report count in DB for same session:', reportCount);

  if (reportCount === 1) {
    console.log('SUCCESS: Idempotency guard prevents duplicate CallReports.');
  } else {
    throw new Error(`FAIL: Expected exactly 1 report. Found ${reportCount}`);
  }

  console.log('\n--- ALL REFRACTOR VALIDATION TESTS COMPLETED SUCCESSFULLY! ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Validation Suite Failed:', err);
  process.exit(1);
});
