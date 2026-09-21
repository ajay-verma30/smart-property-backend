const userService = require('../services/user.services');

const registerUser = async (req, res) => {
  try {
    const result = await userService.registerUser(req.body);

    return res.status(201).json({
      message: "User registered successfully",
      user: result
    });

  } catch (err) {
    console.error("Controller error:", err.message);

    if (err.type === "VALIDATION") {
      return res.status(400).json({ error: err.message });
    }

    if (err.type === "DUPLICATE") {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
};

// Verify Email
const verifyEmail = async (req, res) => {
  try {
    const result = await userService.verifyEmail(req.query.token);

    return res.json({
      message: "Email verified successfully",
      user: result
    });
  } catch (err) {
    console.error("Verify error:", err.message);
    return res.status(400).json({ error: err.message });
  }
};


//Login User
const loginUser = async (req, res) => {
  try {
    const result = await userService.loginUser(req.body);

    // 🍪 set refresh token in cookie
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // access token in response
    return res.json({
      message: "Login successful",
      accessToken: result.accessToken,
      user: result.user
    });

  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(400).json({
      error: err.message
    });
  }
};

//refresh token
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({
        error: "No refresh token found"
      });
    }

    const result = await userService.refreshToken(token);

    return res.json(result);

  } catch (err) {
    return res.status(401).json({
      error: err.message
    });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await userService.getMe(req.user.id);

    return res.json({
      user: result
    });
  } catch (err) {
    console.error("GetMe error:", err.message);
    return res.status(400).json({ error: err.message });
  }
};



module.exports = {
  registerUser,
  verifyEmail,
  loginUser,
  refreshToken,
  getMe
};