const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXP }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXP }
  );
};

module.exports = { 
    generateToken,
    generateAccessToken,
    generateRefreshToken
 };