const slotService = require("../services/slot.service");

const STATUS_MAP = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

const handleError = (res, err) => {
  console.error("Slot error:", err);
  const status = STATUS_MAP[err.type] || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Something went wrong",
  });
};

const generateSlots = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { entries } = req.body;

    const slots = await slotService.generateSlots(
      req.user.id,
      propertyId,
      entries
    );

    res.status(201).json({ success: true, slots });
  } catch (err) {
    handleError(res, err);
  }
};

const getAvailableSlots = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const slots = await slotService.getAvailableSlots(propertyId);

    res.status(200).json({ success: true, slots });
  } catch (err) {
    handleError(res, err);
  }
};

const bookSlot = async (req, res) => {
  try {
    const { slotId } = req.params;

    const slot = await slotService.bookSlot(req.user.id, slotId);

    res.status(200).json({ success: true, slot });
  } catch (err) {
    handleError(res, err);
  }
};

module.exports = {
  generateSlots,
  getAvailableSlots,
  bookSlot,
};