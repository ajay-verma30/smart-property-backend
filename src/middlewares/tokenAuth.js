const jwt = require("jsonwebtoken");
const db = require("../../db/conn");

const tokenAuth = async (req, res, next) => {
  try {
    // 1. get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // 2. verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Token expired or invalid" });
    }

    // 3. check user exists in DB
    const result = await db.query(
      `SELECT id, role, email_verified, is_banned, is_active
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = result.rows[0];

    // 4. extra checks (important for marketplace)
    if (!user.is_active) {
      return res.status(403).json({ error: "Account inactive" });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: "Account banned" });
    }

    // 5. attach user to request
    req.user = {
      id: user.id,
      role: user.role,
      email_verified: user.email_verified
    };

    next();

  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Auth failure" });
  }
};

module.exports = tokenAuth;