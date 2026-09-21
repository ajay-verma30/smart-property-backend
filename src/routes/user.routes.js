const express =  require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const tokenAuth = require('../middlewares/tokenAuth');
const diditService = require('../services/didit.service');

router.post('/register', userController.registerUser);
router.get("/verify-email", userController.verifyEmail);
router.post("/login", userController.loginUser);
router.post("/refresh", userController.refreshToken);
router.get("/me", tokenAuth, userController.getMe);
router.post('/verify-me', tokenAuth, async (req, res) => {
  if (!req.user.email_verified) {
    return res.status(403).json({ success: false, message: 'Verify your email first' });
  }
  try {
    const session = await diditService.createVerificationSession(req.user.id);
    res.json({ success: true, verificationUrl: session.url });
  } catch (err) {
    console.error('Verification session creation failed', err);
    res.status(500).json({ success: false, message: 'Could not start verification' });
  }
});

router.get('/verification-complete', async (req, res) => {
  const { verificationSessionId, status } = req.query;

  console.log('Didit verification completed');
  console.log('Session ID:', verificationSessionId);
  console.log('Status:', status);

  res.json({
    success: true,
    verificationSessionId,
    status
  });
});

module.exports = router;