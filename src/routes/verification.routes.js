const express = require('express');
const router = express.Router();

const diditService = require('../services/didit.service');
const db = require('../../db/conn');

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['x-signature-v2'];
      const rawBody = req.body;

      if (!diditService.verifyWebhookSignature(rawBody, signature)) {
        console.warn('Invalid Didit webhook signature');
        return res.status(401).send('Invalid signature');
      }
      const event = JSON.parse(rawBody.toString());
      const {
        status,
        vendor_data: userId
      } = event;

      if (!userId) {
        console.warn("No vendor_data/userId received");
        return res.status(400).send("Missing vendor_data");
      }

      if (status === 'Approved') {
        const result = await db.query(
          `UPDATE users
           SET identity_verified = true,
               updated_at = NOW()
           WHERE id = $1`,
          [userId]
        );
      }

      return res.status(200).send('OK');

    } catch (err) {
      return res.status(500).send('Webhook processing failed');
    }
  }
);

module.exports = router;