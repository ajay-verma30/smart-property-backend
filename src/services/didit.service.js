const crypto = require('crypto');

const DIDIT_API_KEY = process.env.DIDIT_API_KEY;
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID;
const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL;

async function createVerificationSession(userId) {
  const response = await fetch('https://verification.didit.me/v3/session/', {
    method: 'POST',
    headers: {
      'x-api-key': DIDIT_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workflow_id: DIDIT_WORKFLOW_ID,
      callback: `${process.env.FRONTEND_BASE_URL}/verification-complete`,
      callback_method: 'both',
      vendor_data: String(userId)
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Didit session creation failed: ${response.status} ${errText}`);
  }

  return response.json();
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) {
    console.log("No Didit signature received");
    return false;
  }

  const expectedSig = crypto
    .createHmac('sha256', DIDIT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  console.log("Received signature:", signatureHeader);
  console.log("Expected signature:", expectedSig);

  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}

module.exports = {
  createVerificationSession,
  verifyWebhookSignature
};