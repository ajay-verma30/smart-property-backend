const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

require('dotenv').config();

const userRoutes = require('./src/routes/user.routes');
const propertyRoutes = require('./src/routes/property.routes');
const verificationRoutes = require('./src/routes/verification.routes');
const slotRoutes = require('./src/routes/slot.routes');
const db = require('./db/conn');

db.testConnection();

// Dynamic & Credential-Enabled CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin
      // (Postman, server-to-server, mobile apps, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS policy violation: Access denied.'));
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept'
    ]
  })
);


app.use('/verification', verificationRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Application API Routes
app.use('/api/slots', slotRoutes);
app.use('/api/users', userRoutes);
app.use('/api/property', propertyRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  if (err.message.includes('CORS policy')) {
    return res.status(403).json({
      success: false,
      message: err.message
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  });
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});