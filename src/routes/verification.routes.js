const express = require('express');
const router = express.Router();

const diditService = require('../services/didit.service');
const db = require('../../db/conn');

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {

    const signature = req.headers['x-didit-signature'];
    const rawBody = req.body;

    console.log("========== DIDIT WEBHOOK ==========");
    console.log("Signature:", signature);
    console.log("Content-Type:", req.headers['content-type']);
    console.log("Raw body type:", typeof rawBody);
    console.log("Raw body length:", rawBody?.length);
    console.log("===================================");

    // 1. Verify Didit signature
    if (!diditService.verifyWebhookSignature(rawBody, signature)) {
      console.warn('Invalid Didit webhook signature');
      return res.status(401).send('Invalid signature');
    }

    try {

      // 2. Parse webhook
      const event = JSON.parse(rawBody.toString());

      const {
        status,
        vendor_data: userId
      } = event.data;

      console.log('Didit webhook received');
      console.log('User:', userId);
      console.log('Status:', status);

      // 3. Only APPROVED changes identity_verified
      if (status === 'APPROVED') {

        const result = await db.query(
          `UPDATE users
           SET identity_verified = true,
               updated_at = NOW()
           WHERE id = $1`,
          [userId]
        );

        if (result.rowCount === 0) {
          console.warn(`User not found: ${userId}`);
          return res.status(404).send('User not found');
        }

        console.log(
          `User ${userId} identity_verified = true`
        );
      }

      // 4. Other statuses don't verify the user
      else {
        console.log(
          `Verification status for ${userId}: ${status}`
        );
      }

      // 5. Tell Didit webhook was successfully received
      return res.status(200).send('OK');

    } catch (err) {

      console.error(
        'Failed to process Didit webhook',
        err
      );

      // Didit can retry
      return res.status(500).send('Webhook processing failed');
    }
  }
);

module.exports = router;