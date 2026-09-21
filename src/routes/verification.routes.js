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

    if (!diditService.verifyWebhookSignature(rawBody, signature)) {
      console.warn('Invalid Didit webhook signature — ignoring');
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(rawBody.toString());
    const { status, vendor_data: userId } = event.data;
    // status: "APPROVED" | "DECLINED" | "IN_REVIEW" ...

    try {
      await db.query(
        `UPDATE users SET identity_verified=$1, updated_at=NOW() WHERE id=$2`,
        [status === 'APPROVED', userId]
      );
      console.log(`User ${userId} identity_verified set to: ${status === 'APPROVED'}`);
    } catch (err) {
      console.error('Failed to update identity_verified for user', userId, err);
      return res.status(500).send('DB update failed'); // Didit retry karega
    }

    res.status(200).send('OK');
  }
);

module.exports = router;