const crypto = require("crypto");

function hashValue(value) {
  if (!value) return null;

  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}


function hashValueWithSalt(value, salt) {
  if (!value || !salt) return null;

  return crypto
    .createHmac("sha256", salt)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

module.exports = {
  hashValue,
  hashValueWithSalt
};