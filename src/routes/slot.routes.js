const express = require("express");
const router = express.Router();

const tokenAuth = require("../middlewares/tokenAuth");
const slotController = require("../controllers/slot.controller");

// Owner generates slots for a property
router.post(
  "/properties/:propertyId/slots",
  tokenAuth,
  slotController.generateSlots
);

// Anyone can view available slots (no auth needed)
router.get(
  "/:propertyId/slots",
  slotController.getAvailableSlots
);

// Tenant/buyer books a slot — must be identity verified
router.post(
  "/slots/:slotId/book",
  tokenAuth,
  (req, res, next) => {
    if (!req.user.identity_verified) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        message: "Verify your identity before booking a viewing",
      });
    }
    next();
  },
  slotController.bookSlot
);

module.exports = router;