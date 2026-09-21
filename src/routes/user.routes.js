const express =  require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const tokenAuth = require('../middlewares/tokenAuth');

router.post('/register', userController.registerUser);
router.get("/verify-email", userController.verifyEmail);
router.post("/login", userController.loginUser);
router.post("/refresh", userController.refreshToken);
router.get("/me", tokenAuth, userController.getMe);

module.exports = router;