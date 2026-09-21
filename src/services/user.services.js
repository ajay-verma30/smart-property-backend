const db = require("../../db/conn");
const { hashValue } = require("../utils/hash");
const {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/token");
const { sendVerificationEmail } = require("./emailService");
const diditService = require("./didit.service"); // NEW
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const registerUser = async (data) => {
  const { full_name, email, phone, password, role } = data;
  if (!full_name || !email || !phone || !password) {
    throw {
      type: "VALIDATION",
      message: "Required fields missing",
    };
  }
  if (!["owner", "buyer", "tenant"].includes(role)) {
    throw { type: "VALIDATION", message: "Invalid role" };
  }

  const email_hash = hashValue(email);
  const phone_hash = hashValue(phone);

  const hashPass = await bcrypt.hash(password, 12);

  // check duplicate
  const existing = await db.query(
    `SELECT id FROM users WHERE email_hash=$1 OR phone_hash=$2`,
    [email_hash, phone_hash],
  );

  if (existing.rows.length) {
    throw { type: "DUPLICATE", message: "User already exists" };
  }

  // create user
  const userRes = await db.query(
    `
    INSERT INTO users (full_name, email_enc, phone_enc, email_hash, phone_hash, password, role)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id, email_enc
    `,
    [full_name, email, phone, email_hash, phone_hash, hashPass, role],
  );

  const user = userRes.rows[0];

  // generate token
  const token = generateToken();

  // save token (24h expiry)
  await db.query(
    `
    INSERT INTO email_verifications (user_id, token, expires_at)
    VALUES ($1,$2, NOW() + interval '24 hours')
    `,
    [user.id, token],
  );

  // send email
  await sendVerificationEmail(email, token);

  // --- NEW: kick off Didit KYC session for this user (buyer or owner, both) ---
  let verificationUrl = null;
  try {
    const session = await diditService.createVerificationSession(user.id);
    verificationUrl = session.url;
  } catch (err) {
    // Don't block signup if Didit call fails — log it and let user retry verification later
    console.error("Didit session creation failed for user", user.id, err);
  }

  return {
    message: "User created. Verification email sent.",
    user_id: user.id,
    verificationUrl, // frontend redirects here to complete identity verification
  };
};

const verifyEmail = async (token) => {
  if (!token) {
    throw { type: "VALIDATION", message: "Token missing" };
  }

  const result = await db.query(
    `
    SELECT user_id FROM email_verifications
    WHERE token=$1 AND expires_at > NOW()
    `,
    [token],
  );

  if (!result.rows.length) {
    throw { type: "VALIDATION", message: "Invalid or expired token" };
  }

  const user_id = result.rows[0].user_id;

  await db.query(
    `UPDATE users SET email_verified=true, updated_at=NOW() WHERE id=$1`,
    [user_id],
  );

  await db.query(`DELETE FROM email_verifications WHERE user_id=$1`, [user_id]);

  return { user_id };
};

const loginUser = async (data) => {
  const { email, password } = data;

  if (!email || !password) {
    throw {
      type: "VALIDATION",
      message: "Email and Password are required",
    };
  }

  const email_hash = hashValue(email);

  const userRes = await db.query(
    `SELECT 
       id,
       password,
       role,
       email_verified,
       identity_verified,
       is_active,
       is_banned
     FROM users 
     WHERE email_hash = $1`,
    [email_hash]
  );

  if (!userRes.rows.length) {
    throw {
      type: "VALIDATION",
      message: "User not found",
    };
  }

  const user = userRes.rows[0];

  // Account inactive
  if (!user.is_active) {
    throw {
      type: "VALIDATION",
      message: "Account is inactive",
    };
  }

  // Account banned
  if (user.is_banned) {
    throw {
      type: "VALIDATION",
      message: "Your account has been banned",
    };
  }

  // Email not verified
  if (!user.email_verified) {
    throw {
      type: "VALIDATION",
      message: "Please verify your email before logging in",
    };
  }

  // Password verification
  const passwordCheck = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordCheck) {
    throw {
      type: "VALIDATION",
      message: "Credentials do not match!",
    };
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Hash refresh token before storing it
  const refreshTokenHash = hashValue(refreshToken);

  await db.query(
    `INSERT INTO refresh_tokens
      (user_id, token_hash, expires_at)
     VALUES
      ($1, $2, NOW() + interval '7 days')`,
    [user.id, refreshTokenHash]
  );

  // Update last login
  await db.query(
    `UPDATE users
     SET last_login_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  return {
    user: {
      id: user.id,
      role: user.role,
      verified: user.identity_verified
    },
    accessToken,
    refreshToken,
  };
};

const refreshToken = async (token) => {
  if (!token) {
    throw {
      type: "VALIDATION",
      message: "Refresh token missing",
    };
  }

  // Hash the raw token received from cookie
  const tokenHash = hashValue(token);

  const result = await db.query(
    `
    SELECT *
    FROM refresh_tokens
    WHERE token_hash=$1
      AND revoked=false
      AND expires_at > NOW()
    `,
    [tokenHash]
  );

  if (!result.rows.length) {
    throw {
      type: "VALIDATION",
      message: "Invalid refresh token",
    };
  }

  let decoded;

  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET
    );
  } catch (err) {
    throw {
      type: "VALIDATION",
      message: "Invalid refresh token",
    };
  }

  // Fetch full user row so the new access token has the exact same
  // shape/payload as the one generated during login — avoids relying
  // on decoded.userId alone, which may not match what generateAccessToken expects.
  const userRes = await db.query(
    `SELECT id, role, email_verified FROM users WHERE id=$1`,
    [decoded.userId]
  );

  if (!userRes.rows.length) {
    throw {
      type: "VALIDATION",
      message: "User not found",
    };
  }

  const user = userRes.rows[0];

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
  };
};

const getMe = async (userId) => {
  const result = await db.query(
    `SELECT id, email_enc, role, email_verified, identity_verified FROM users WHERE id=$1`,
    [userId]
  );

  if (!result.rows.length) {
    throw { type: "VALIDATION", message: "User not found" };
  }

  const user = result.rows[0];

  return {
    id: user.id,
    email: user.email_enc,
    role: user.role,
    email_verified: user.email_verified,
    identity_verified: user.identity_verified,
  };
};

module.exports = { registerUser, verifyEmail, loginUser, refreshToken, getMe };