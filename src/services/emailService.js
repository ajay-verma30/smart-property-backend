const SibApiV3Sdk = require("sib-api-v3-sdk");

// create client
const client = SibApiV3Sdk.ApiClient.instance;

// set API key (IMPORTANT FIX)
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendVerificationEmail = async (toEmail, token) => {
  const link = `http://localhost:5000/api/users/verify-email?token=${token}`;

  const sendSmtpEmail = {
    to: [{ email: toEmail }],
    sender: {
      email: process.env.BREVO_SENDER_EMAIL,
      name: "Daft Clone"
    },
    subject: "Verify your email",
    htmlContent: `
      <h2>Email Verification</h2>
      <p>Click below to verify your email:</p>
      <a href="${link}">Verify Email</a>
    `
  };

  return apiInstance.sendTransacEmail(sendSmtpEmail);
};

module.exports = { sendVerificationEmail };