const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Initialize PDF Document
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  bufferPages: true // Enable buffering to count total pages dynamically for footer
});

const outputPath = path.join(__dirname, '../API_Documentation.pdf');
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Styling Palettes
const COLORS = {
  bgDark: '#0f172a',     // Slate 900
  textLight: '#f8fafc',  // Slate 50
  textMuted: '#64748b',  // Slate 500
  primary: '#0ea5e9',    // Sky 500
  secondary: '#38bdf8',  // Sky 400
  textDark: '#1e293b',   // Slate 800
  cardBg: '#f8fafc',     // Slate 50
  border: '#e2e8f0',     // Slate 200
  methods: {
    GET: '#16a34a',      // Green 600
    POST: '#2563eb',     // Blue 600
    PUT: '#ea580c',      // Orange 600
    DELETE: '#dc2626'    // Red 600
  }
};

// ----------------------------------------------------
// 1. COVER PAGE
// ----------------------------------------------------
// Draw dark background for cover
doc.rect(0, 0, 595.28, 841.89).fill(COLORS.bgDark);

// Top Decorative Gradient Bar
doc.rect(0, 0, 595.28, 20).fill(COLORS.primary);

// App Title / Branding
doc.fillColor(COLORS.secondary)
   .font('Helvetica-Bold')
   .fontSize(16)
   .text('A I L I V E   P L A T F O R M', 70, 250);

// Document Title
doc.fillColor(COLORS.textLight)
   .font('Helvetica-Bold')
   .fontSize(32)
   .text('Outbound AI Calling System', 70, 280, { lineGap: 10 });

doc.fillColor(COLORS.secondary)
   .font('Helvetica-Bold')
   .fontSize(28)
   .text('API Reference Manual', 70, 350);

// Horizontal Line Divider
doc.moveTo(70, 410)
   .lineTo(525, 410)
   .lineWidth(2)
   .strokeColor(COLORS.primary)
   .stroke();

// Description
doc.fillColor(COLORS.textMuted)
   .font('Helvetica')
   .fontSize(12)
   .text('Comprehensive API specification and developer integration guide for custom voice agents, contact imports, Outbound Vobiz dialer campaigns, and real-time call analytics.', 70, 440, { width: 455, lineGap: 6 });

// Metadata Info
doc.fillColor(COLORS.textLight)
   .font('Helvetica-Bold')
   .fontSize(11)
   .text('Target Audience: ', 70, 620)
   .font('Helvetica')
   .text('Frontend & App Developers', 170, 620);

doc.font('Helvetica-Bold')
   .text('Base URL: ', 70, 642)
   .font('Helvetica')
   .text('https://api.ailive.com/api/v1', 170, 642);

doc.font('Helvetica-Bold')
   .text('Version: ', 70, 664)
   .font('Helvetica')
   .text('v1.0.0 (Production-Ready)', 170, 664);

doc.font('Helvetica-Bold')
   .text('Author: ', 70, 686)
   .font('Helvetica')
   .text('AILIVE Engineering Team', 170, 686);

doc.font('Helvetica-Bold')
   .text('Generated Date: ', 70, 708)
   .font('Helvetica')
   .text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 170, 708);

// Add page break for main content
doc.addPage();

// ----------------------------------------------------
// API ENDPOINTS DEFINITIONS ARRAY
// ----------------------------------------------------
const apiGroups = [
  {
    title: '1. Authentication Service',
    description: 'Endpoints for merchant and super-admin accounts onboarding, logging in, token refreshment, and passwords management.',
    routes: [
      {
        method: 'POST',
        path: '/auth/register',
        auth: 'Public',
        desc: 'Registers a new Merchant account and attaches a free "Starter" plan subscription. Also triggers a verification email.',
        body: [
          { field: 'email', type: 'String', req: 'Yes', desc: 'Valid email address' },
          { field: 'password', type: 'String', req: 'Yes', desc: 'Strong password (min 6 characters)' },
          { field: 'businessName', type: 'String', req: 'Yes', desc: 'Legal business or merchant name' },
          { field: 'categoryId', type: 'UUID', req: 'Yes', desc: 'Associated business Category ID' }
        ],
        response: '201 Created on success, returning user object metadata. 400 Bad Request if validation or duplicate check fails.'
      },
      {
        method: 'POST',
        path: '/auth/admin/register',
        auth: 'Internal',
        desc: 'Internal endpoint to register a new Super Admin account. Auto-verified in development mode.',
        body: [
          { field: 'email', type: 'String', req: 'Yes', desc: 'Admin email address' },
          { field: 'password', type: 'String', req: 'Yes', desc: 'Strong password' },
          { field: 'firstName', type: 'String', req: 'Yes', desc: 'First name' },
          { field: 'lastName', type: 'String', req: 'Yes', desc: 'Last name' }
        ],
        response: '201 Created with admin profile details.'
      },
      {
        method: 'POST',
        path: '/auth/login',
        auth: 'Public',
        desc: 'Unified endpoint for Merchants and Admins to authenticate. Verifies credentials, checked role, and returns access & refresh tokens.',
        body: [
          { field: 'email', type: 'String', req: 'Yes', desc: 'Account email' },
          { field: 'password', type: 'String', req: 'Yes', desc: 'Account password' },
          { field: 'role', type: 'String', req: 'No', desc: 'Optionally "merchant" or "super_admin" (defaults to merchant)' }
        ],
        response: '200 OK with accessToken (JWT), refreshToken, and profile details. 401 Unauthorized if mismatch.'
      },
      {
        method: 'POST',
        path: '/auth/refresh-token',
        auth: 'Public',
        desc: 'Obtains a new pair of short-lived Access Tokens using a valid Refresh Token.',
        body: [
          { field: 'refreshToken', type: 'String', req: 'Yes', desc: 'Valid HTTP-only or request refresh token' }
        ],
        response: '200 OK with new accessToken and refreshToken. 401 if expired or session revoked.'
      },
      {
        method: 'POST',
        path: '/auth/verify-email',
        auth: 'Public',
        desc: 'Verifies email address using the token received in the verification email.',
        body: [
          { field: 'token', type: 'String', req: 'Yes', desc: 'Token sent to email' },
          { field: 'role', type: 'String', req: 'No', desc: '"merchant" or "super_admin"' }
        ],
        response: '200 OK with success confirmation. 400 Bad Request if invalid token.'
      },
      {
        method: 'POST',
        path: '/auth/forgot-password',
        auth: 'Public',
        desc: 'Triggers password reset flow, generating a reset token and sending instructions email.',
        body: [
          { field: 'email', type: 'String', req: 'Yes', desc: 'Account email' },
          { field: 'role', type: 'String', req: 'Yes', desc: '"merchant" or "super_admin"' }
        ],
        response: '200 OK confirming email sent (sent regardless of presence to prevent username enumeration).'
      },
      {
        method: 'POST',
        path: '/auth/reset-password',
        auth: 'Public',
        desc: 'Resets the password to a new value using a valid reset token.',
        body: [
          { field: 'token', type: 'String', req: 'Yes', desc: 'Reset token' },
          { field: 'password', type: 'String', req: 'Yes', desc: 'New password' },
          { field: 'role', type: 'String', req: 'Yes', desc: '"merchant" or "super_admin"' }
        ],
        response: '200 OK password updated successfully.'
      }
    ]
  },
  {
    title: '2. Business Category Service',
    description: 'APIs to manage industry categories. Used to associate merchant accounts with their fields of operation.',
    routes: [
      {
        method: 'GET',
        path: '/categories',
        auth: 'Authenticated',
        desc: 'Fetches all categories available for merchant onboarding.',
        body: [],
        response: '200 OK returning array of Category objects.'
      },
      {
        method: 'GET',
        path: '/categories/:id',
        auth: 'Authenticated',
        desc: 'Fetches a single business category details by ID.',
        body: [],
        response: '200 OK or 404 Not Found.'
      },
      {
        method: 'POST',
        path: '/categories',
        auth: 'Super Admin',
        desc: 'Creates a new business category.',
        body: [
          { field: 'name', type: 'String', req: 'Yes', desc: 'Category display name (e.g. Healthcare, Real Estate)' },
          { field: 'description', type: 'String', req: 'No', desc: 'Brief summary of industry' }
        ],
        response: '201 Created. 403 Forbidden for merchants.'
      },
      {
        method: 'PUT',
        path: '/categories/:id',
        auth: 'Super Admin',
        desc: 'Updates an existing category detail.',
        body: [
          { field: 'name', type: 'String', req: 'No', desc: 'Updated name' },
          { field: 'description', type: 'String', req: 'No', desc: 'Updated description' }
        ],
        response: '200 OK category updated.'
      },
      {
        method: 'DELETE',
        path: '/categories/:id',
        auth: 'Super Admin',
        desc: 'Deletes a category from the platform databases.',
        body: [],
        response: '200 OK on deletion.'
      }
    ]
  },
  {
    title: '3. Subscription Plans Service',
    description: 'Admin endpoints to model SaaS plan structures, pricing, Outbound concurrent call boundaries, and calling limits.',
    routes: [
      {
        method: 'GET',
        path: '/plans',
        auth: 'Authenticated',
        desc: 'Lists all subscription tiers available (Starter, Pro, Enterprise).',
        body: [],
        response: '200 OK with array of plans.'
      },
      {
        method: 'GET',
        path: '/plans/:id',
        auth: 'Authenticated',
        desc: 'Fetches details of a specific plan by ID.',
        body: [],
        response: '200 OK or 404 Not Found.'
      },
      {
        method: 'POST',
        path: '/plans',
        auth: 'Super Admin',
        desc: 'Creates a new Subscription Plan tier.',
        body: [
          { field: 'name', type: 'String', req: 'Yes', desc: 'Plan name (unique)' },
          { field: 'price', type: 'Decimal', req: 'Yes', desc: 'Monthly recurring cost (USD)' },
          { field: 'callLimit', type: 'Integer', req: 'Yes', desc: 'Maximum total voice calls allowed' },
          { field: 'maxConcurrentCalls', type: 'Integer', req: 'Yes', desc: 'Simultaneous dial limits' }
        ],
        response: '201 Created on success.'
      },
      {
        method: 'PUT',
        path: '/plans/:id',
        auth: 'Super Admin',
        desc: 'Updates subscription plan boundaries.',
        body: [
          { field: 'name', type: 'String', req: 'No', desc: 'New name' },
          { field: 'price', type: 'Decimal', req: 'No', desc: 'New price' },
          { field: 'callLimit', type: 'Integer', req: 'No', desc: 'New call limit' },
          { field: 'maxConcurrentCalls', type: 'Integer', req: 'No', desc: 'New concurrency limit' }
        ],
        response: '200 OK.'
      },
      {
        method: 'DELETE',
        path: '/plans/:id',
        auth: 'Super Admin',
        desc: 'Removes a subscription plan tier from database.',
        body: [],
        response: '200 OK.'
      }
    ]
  },
  {
    title: '4. Subscription Management',
    description: 'Handles upgrades, current billing cycles, and utilization counters for active merchant accounts.',
    routes: [
      {
        method: 'GET',
        path: '/subscriptions/my',
        auth: 'Merchant',
        desc: 'Gets currently logged-in merchant\'s active plan, start date, expiry date, calls used, and remaining quota.',
        body: [],
        response: '200 OK returning Active Subscription model object.'
      },
      {
        method: 'POST',
        path: '/subscriptions/upgrade',
        auth: 'Merchant',
        desc: 'Upgrades the merchant account to a new plan tier (simulates payment checkout).',
        body: [
          { field: 'planId', type: 'UUID', req: 'Yes', desc: 'Plan ID to upgrade to' }
        ],
        response: '200 OK. Reset calling limit counters relative to the new plan.'
      },
      {
        method: 'GET',
        path: '/subscriptions/merchant/:merchantId',
        auth: 'Super Admin',
        desc: 'Administrative route to fetch any merchant\'s subscription status.',
        body: [],
        response: '200 OK.'
      }
    ]
  },
  {
    title: '5. Vobiz Telecom Gateway',
    description: 'Integrates Vobiz VoIP platform for making and receiving telephone calls. Requires API authentication keys.',
    routes: [
      {
        method: 'POST',
        path: '/vobiz/connect',
        auth: 'Merchant',
        desc: 'Saves or updates the merchant\'s Vobiz credentials (encrypted prior to database write).',
        body: [
          { field: 'vobizApiKey', type: 'String', req: 'Yes', desc: 'Vobiz client api key' },
          { field: 'vobizApiSecret', type: 'String', req: 'Yes', desc: 'Vobiz secret key' },
          { field: 'vobizAccountId', type: 'String', req: 'Yes', desc: 'Associated Account UUID/ID' }
        ],
        response: '200 OK credentials validation result.'
      },
      {
        method: 'GET',
        path: '/vobiz/account',
        auth: 'Merchant',
        desc: 'Gets credentials connection status for Vobiz integration.',
        body: [],
        response: '200 OK credentials details (censored api keys).'
      },
      {
        method: 'GET',
        path: '/vobiz/numbers',
        auth: 'Merchant',
        desc: 'Lists available rented phone numbers from Vobiz for making outbound campaign dialings.',
        body: [],
        response: '200 OK returning array of phone numbers.'
      },
      {
        method: 'POST',
        path: '/vobiz/numbers',
        auth: 'Merchant',
        desc: 'Configures a phone number owned by merchant for outgoing dialing.',
        body: [
          { field: 'phoneNumber', type: 'String', req: 'Yes', desc: 'Phone number in international standard format' },
          { field: 'displayName', type: 'String', req: 'No', desc: 'Friendly name' }
        ],
        response: '201 Created.'
      },
      {
        method: 'DELETE',
        path: '/vobiz/numbers/:id',
        auth: 'Merchant',
        desc: 'Removes vobiz number configuration from AI platform database.',
        body: [],
        response: '200 OK.'
      }
    ]
  },
  {
    title: '6. Custom Voice Agents Service',
    description: 'Configure intelligent conversational agents powered by Gemini LLM. Sets prompts, speech tone, and behavior patterns.',
    routes: [
      {
        method: 'GET',
        path: '/agents',
        auth: 'Merchant',
        desc: 'Lists all AI calling agents created by the merchant.',
        body: [],
        response: '200 OK containing list of Agent configurations.'
      },
      {
        method: 'GET',
        path: '/agents/:id',
        auth: 'Merchant',
        desc: 'Retrieves detail parameters for a specific agent.',
        body: [],
        response: '200 OK.'
      },
      {
        method: 'POST',
        path: '/agents',
        auth: 'Merchant',
        desc: 'Creates a new customizable AI Voice Agent with Gemini prompt engineering settings.',
        body: [
          { field: 'name', type: 'String', req: 'Yes', desc: 'Agent name/label' },
          { field: 'systemPrompt', type: 'Text', req: 'Yes', desc: 'Instructions guiding Gemini behavior' },
          { field: 'firstSentence', type: 'String', req: 'No', desc: 'Greeting sentence spoken instantly when call picks up' },
          { field: 'voiceId', type: 'String', req: 'Yes', desc: 'Chosen default voice identifier (Cartesia/Sarvam/Elevenlabs)' },
          { field: 'language', type: 'String', req: 'No', desc: 'Target spoken language (e.g. en-US, hi-IN)' },
          { field: 'allowInterruption', type: 'Boolean', req: 'No', desc: 'Allows the user to speak over the AI agent (defaults to true)' }
        ],
        response: '201 Created.'
      },
      {
        method: 'PUT',
        path: '/agents/:id',
        auth: 'Merchant',
        desc: 'Modifies active prompt or configurations for an existing agent.',
        body: [
          { field: 'name', type: 'String', req: 'No' },
          { field: 'systemPrompt', type: 'Text', req: 'No' },
          { field: 'voiceId', type: 'String', req: 'No' },
          { field: 'allowInterruption', type: 'Boolean', req: 'No' }
        ],
        response: '200 OK updated agent settings.'
      },
      {
        method: 'DELETE',
        path: '/agents/:id',
        auth: 'Merchant',
        desc: 'Deletes an agent.',
        body: [],
        response: '200 OK.'
      }
    ]
  },
  {
    title: '7. Customer Management & Imports',
    description: 'Create lists of contacts to assign outbound calls. Supports single additions, bulk CSV uploads, and segment categories.',
    routes: [
      {
        method: 'GET',
        path: '/customers',
        auth: 'Merchant',
        desc: 'Lists all customer contact records registered under the merchant.',
        body: [],
        response: '200 OK list array.'
      },
      {
        method: 'POST',
        path: '/customers',
        auth: 'Merchant',
        desc: 'Creates a single customer contact entry.',
        body: [
          { field: 'name', type: 'String', req: 'Yes', desc: 'Customer name' },
          { field: 'phone', type: 'String', req: 'Yes', desc: 'Customer contact phone number' },
          { field: 'email', type: 'String', req: 'No', desc: 'Customer email' },
          { field: 'customVariables', type: 'Object', req: 'No', desc: 'Metadata payload (e.g. { age: 30, city: "London" })' }
        ],
        response: '201 Created.'
      },
      {
        method: 'POST',
        path: '/customers/upload',
        auth: 'Merchant',
        desc: 'Uploads a customer contact database using a standard CSV file. Uses multipart/form-data. Parses columns mapping: name, phone, email, and metadata tags.',
        body: [
          { field: 'file', type: 'Binary/File', req: 'Yes', desc: 'CSV file (max size: 5MB)' }
        ],
        response: '200 OK with summary numbers of newly created contacts and duplicate skips count.'
      },
      {
        method: 'GET',
        path: '/customers/lists/all',
        auth: 'Merchant',
        desc: 'Fetches all custom groups or target calling list segments created by the merchant.',
        body: [],
        response: '200 OK lists array.'
      },
      {
        method: 'POST',
        path: '/customers/lists',
        auth: 'Merchant',
        desc: 'Creates a blank list directory structure.',
        body: [
          { field: 'name', type: 'String', req: 'Yes', desc: 'Segment name (e.g., Lead Followups Q2)' }
        ],
        response: '201 Created.'
      }
    ]
  },
  {
    title: '8. Campaign & Calling Orchestration',
    description: 'Outbound campaign engine controls. Enforces dialing queues, scheduling, concurrent call limits, and retry tasks.',
    routes: [
      {
        method: 'GET',
        path: '/campaigns',
        auth: 'Merchant',
        desc: 'Lists dial campaigns created by merchant.',
        body: [],
        response: '200 OK.'
      },
      {
        method: 'POST',
        path: '/campaigns',
        auth: 'Merchant',
        desc: 'Creates outbound dialer campaign and schedules its task queue.',
        body: [
          { field: 'name', type: 'String', req: 'Yes', desc: 'Campaign campaign name' },
          { field: 'vobizNumberId', type: 'UUID', req: 'Yes', desc: 'The phone number config to dial from' },
          { field: 'agentId', type: 'UUID', req: 'Yes', desc: 'Associated AI Agent' },
          { field: 'customerListId', type: 'UUID', req: 'Yes', desc: 'Contact target list ID' },
          { field: 'startTime', type: 'DateTime', req: 'Yes', desc: 'Scheduled calling start date' },
          { field: 'intervalBetweenCalls', type: 'Integer', req: 'No', desc: 'Delay in seconds between successive calls (default 5)' },
          { field: 'maxConcurrentCalls', type: 'Integer', req: 'No', desc: 'Maximum concurrent active channels (limits default to Subscription tier)' }
        ],
        response: '201 Created.'
      },
      {
        method: 'POST',
        path: '/campaigns/:id/start',
        auth: 'Merchant',
        desc: 'Triggers or schedules campaign execution worker tasks in the Redis queue.',
        body: [],
        response: '200 OK campaign status changes to "running".'
      },
      {
        method: 'POST',
        path: '/campaigns/:id/pause',
        auth: 'Merchant',
        desc: 'Pauses active dials. Current active calls will complete; next ones are held back.',
        body: [],
        response: '200 OK status changed.'
      },
      {
        method: 'POST',
        path: '/campaigns/:id/resume',
        auth: 'Merchant',
        desc: 'Resumes a paused dialer campaign queue.',
        body: [],
        response: '200 OK status changed.'
      },
      {
        method: 'POST',
        path: '/campaigns/:id/stop',
        auth: 'Merchant',
        desc: 'Terminates campaign execution completely.',
        body: [],
        response: '200 OK status set to stopped.'
      },
      {
        method: 'POST',
        path: '/campaigns/:id/retry',
        auth: 'Merchant',
        desc: 'Re-enqueues failed dial attempts (busy/no response/etc.) in a campaign to run again.',
        body: [],
        response: '200 OK retries scheduled.'
      }
    ]
  },
  {
    title: '9. Call Analytics Service',
    description: 'Provides business intelligence metrics regarding dial operations, customer sentiment, call outcomes, and plan quotas.',
    routes: [
      {
        method: 'GET',
        path: '/analytics/campaign',
        auth: 'Merchant',
        desc: 'Retrieves aggregated statistics for a specific outbound campaign.',
        body: [
          { field: 'campaignId', type: 'UUID Query Param', req: 'Yes', desc: 'Target campaign UUID identifier' }
        ],
        response: '200 OK returning totals: totalCalls, completed, failed, totalDuration, answeredRate, averageDuration.'
      },
      {
        method: 'GET',
        path: '/analytics/leads',
        auth: 'Merchant',
        desc: 'Gets lead summary metrics. Aggregates conversion rates, interested status count, and negative call outcome analytics.',
        body: [],
        response: '200 OK lead statistics payload.'
      },
      {
        method: 'GET',
        path: '/analytics/plan',
        auth: 'Merchant',
        desc: 'Gets current plan API quota utilization (percentage of used minutes, remaining limits).',
        body: [],
        response: '200 OK utilization statistics.'
      }
    ]
  },
  {
    title: '10. Call Reports & Transcripts',
    description: 'Query detailed logs, conversation transcription logs, and audio recordings for individual calls.',
    routes: [
      {
        method: 'GET',
        path: '/reports',
        auth: 'Merchant',
        desc: 'Lists historical calls reports table. Supports filtering by status or campaign.',
        body: [],
        response: '200 OK list of call reports (includes duraton, cost, and basic outcomes).'
      },
      {
        method: 'GET',
        path: '/reports/session/:sessionId',
        auth: 'Merchant',
        desc: 'Retrieves the complete report details of a specific calling session. Includes the full conversation text transcript between customer and Gemini, as well as the audio recording download link.',
        body: [],
        response: '200 OK detailing call events, full text conversation script logs, and audio URL.'
      }
    ]
  },
  {
    title: '11. Voice Engine & Synthesis',
    description: 'Enables configuration of AI synthesis voices, supports voice seeding for Bulbul:v3 / Cartesia, and audio generation previews.',
    routes: [
      {
        method: 'GET',
        path: '/voices',
        auth: 'Merchant',
        desc: 'Retrieves the database list of available provider voices (Elevenlabs, Cartesia, Sarvam bulbul:v3) with support tags (gender, region, accents, languages).',
        body: [],
        response: '200 OK list of voice records.'
      },
      {
        method: 'POST',
        path: '/voices/preview',
        auth: 'Merchant',
        desc: 'Generates or loads a cached audio voice preview sample using default TTS seeding text.',
        body: [
          { field: 'voiceId', type: 'String', req: 'Yes', desc: 'UUID or name tag of the target voice' }
        ],
        response: '200 OK binary stream with headers: content-type: audio/wav (cached on file disk to optimize provider costs).'
      }
    ]
  }
];

// Helper to draw clean header & footer
const drawPageDecorations = (documentInstance) => {
  const pages = documentInstance.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    documentInstance.switchToPage(i);
    
    // Skip cover page
    if (i === 0) continue;

    // Header
    documentInstance.fillColor(COLORS.textMuted)
                    .font('Helvetica-Bold')
                    .fontSize(8)
                    .text('AILIVE PLATFORM API SPECIFICATION', 50, 25);
    
    documentInstance.font('Helvetica')
                    .text('Version 1.0.0 (Stable)', 480, 25);
                    
    documentInstance.moveTo(50, 35)
                    .lineTo(545, 35)
                    .lineWidth(0.5)
                    .strokeColor(COLORS.border)
                    .stroke();

    // Footer
    documentInstance.moveTo(50, 805)
                    .lineTo(545, 805)
                    .lineWidth(0.5)
                    .strokeColor(COLORS.border)
                    .stroke();

    const pageString = `Page ${i + 1} of ${pages.count}`;
    documentInstance.fillColor(COLORS.textMuted)
                    .font('Helvetica')
                    .fontSize(8)
                    .text(pageString, 50, 815, { align: 'center', width: 495 });
  }
};

// ----------------------------------------------------
// 2. MAIN DOCUMENT GENERATION
// ----------------------------------------------------
apiGroups.forEach((group, groupIndex) => {
  // Add spacing before group header
  doc.fillColor(COLORS.textDark)
     .font('Helvetica-Bold')
     .fontSize(18)
     .text(group.title, 50, doc.y + 15);

  doc.fillColor(COLORS.textMuted)
     .font('Helvetica')
     .fontSize(10)
     .text(group.description, 50, doc.y + 5, { width: 495, lineGap: 4 })
     .moveDown(1);

  group.routes.forEach((route) => {
    // Route Container/Card Box
    const startY = doc.y;
    
    // Estimate heights to prevent orphan blocks (page boundary checks)
    const estimatedHeight = 120 + (route.body.length * 20);
    if (startY + estimatedHeight > 760) {
      doc.addPage();
    }

    const cardStartY = doc.y;
    
    // Left Method Tag
    const methodColor = COLORS.methods[route.method] || COLORS.primary;
    doc.rect(50, cardStartY, 65, 20).fill(methodColor);
    
    doc.fillColor(COLORS.textLight)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text(route.method, 50, cardStartY + 5, { width: 65, align: 'center' });

    // Path
    doc.fillColor(COLORS.textDark)
       .font('Helvetica-Bold')
       .fontSize(11)
       .text(route.path, 125, cardStartY + 5);

    // Auth Label Tag on right
    doc.rect(460, cardStartY, 85, 18).fill(COLORS.cardBg);
    doc.rect(460, cardStartY, 85, 18).strokeColor(COLORS.border).lineWidth(1).stroke();
    
    doc.fillColor(COLORS.textMuted)
       .font('Helvetica-Bold')
       .fontSize(8)
       .text(route.auth.toUpperCase(), 460, cardStartY + 5, { width: 85, align: 'center' });

    // Description text
    doc.y = cardStartY + 30;
    doc.fillColor(COLORS.textDark)
       .font('Helvetica')
       .fontSize(10)
       .text(route.desc, 50, doc.y, { width: 495, lineGap: 3 })
       .moveDown(0.5);

    // Request Parameters table (if parameters exist)
    if (route.body && route.body.length > 0) {
      doc.fillColor(COLORS.textMuted)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('Request Body / Query Params:', 50, doc.y);

      // Simple Table Headers
      const tableStartY = doc.y + 6;
      doc.rect(50, tableStartY, 495, 16).fill(COLORS.cardBg);
      
      doc.fillColor(COLORS.textDark)
         .font('Helvetica-Bold')
         .fontSize(8)
         .text('Field Name', 60, tableStartY + 4)
         .text('Type', 160, tableStartY + 4)
         .text('Required', 220, tableStartY + 4)
         .text('Description', 280, tableStartY + 4);

      let rowY = tableStartY + 16;
      route.body.forEach((param, rowIndex) => {
        // Alternating row backgrounds
        if (rowIndex % 2 === 1) {
          doc.rect(50, rowY, 495, 16).fill('#f1f5f9');
        }
        
        doc.fillColor(COLORS.textDark)
           .font('Courier-Bold')
           .fontSize(8)
           .text(param.field, 60, rowY + 4)
           .font('Courier')
           .text(param.type, 160, rowY + 4)
           .font('Helvetica')
           .text(param.req, 220, rowY + 4)
           .text(param.desc, 280, rowY + 4, { width: 255 });
        rowY += 16;
      });
      doc.y = rowY + 5;
    }

    // Response Details
    doc.fillColor(COLORS.textMuted)
       .font('Helvetica-Bold')
       .fontSize(9)
       .text('Response details: ', 50, doc.y, { continued: true })
       .font('Helvetica')
       .fillColor(COLORS.textDark)
       .text(route.response)
       .moveDown(1.5);
       
    // Visual spacer line between endpoints
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .lineWidth(0.5)
       .strokeColor(COLORS.border)
       .stroke()
       .moveDown(1);
  });
  
  // Create space or new page for next category if near bottom
  if (doc.y > 680 && groupIndex < apiGroups.length - 1) {
    doc.addPage();
  }
});

// ----------------------------------------------------
// 3. FINALIZE AND BUILD PAGE DECORATIONS
// ----------------------------------------------------
drawPageDecorations(doc);
doc.end();

stream.on('finish', () => {
  console.log('API PDF generated successfully!');
});
