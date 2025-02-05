const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const admin = require("firebase-admin");
const moment = require("moment-timezone");
require("dotenv").config(); // Untuk membaca file .env saat pengembangan lokal

// 🔹 Inisialisasi Firebase menggunakan SERVICE_ACCOUNT dari environment variable
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DATABASE_URL, // Pastikan DATABASE_URL ada di Render.com Environment Variables
});

const db = admin.database();
const app = express();

// 🔹 Midtrans Configuration
const SERVER_KEY = process.env.SERVER_KEY;
const MIDTRANS_API = "https://app.sandbox.midtrans.com/snap/v1/transactions";

// 🔹 Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
  console.log(`[${moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss")}] Request: ${req.method} ${req.url}`);
  console.log("Request Body:", JSON.stringify(req.body, null, 2));
  next();
});

/**
 * ✅ **GET SNAP TOKEN**
 */
app.post("/getSnapToken", async (req, res) => {
  try {
    const { order_id, customer_details, payment_type, items } = req.body;

    if (!order_id || !customer_details || !payment_type || !items || items.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const gross_amount = items.reduce((total, item) => total + item.price * item.quantity, 0);
    const uniqueOrderId = `${order_id}-${Date.now()}`;

    const transactionDetails = {
      transaction_details: { order_id: uniqueOrderId, gross_amount },
      customer_details,
      item_details: items,
    };

    console.log("🔹 Transaction Details Sent to Midtrans:", JSON.stringify(transactionDetails, null, 2));

    const response = await axios.post(MIDTRANS_API, transactionDetails, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(SERVER_KEY).toString("base64")}`,
      },
    });

    console.log("✅ Response from Midtrans:", JSON.stringify(response.data, null, 2));

    if (!response.data.token) {
      throw new Error("Snap Token not found in response");
    }

    res.json({
      token: response.data.token,
      redirect_url: response.data.redirect_url,
      order_id: uniqueOrderId,
    });
  } catch (error) {
    console.error("❌ Error from Midtrans:", error.response ? error.response.data : error.message);
    res.status(500).json({
      error: "Failed to get Snap Token",
      details: error.response ? error.response.data : error.message,
    });
  }
});

/**
 * ✅ **WEBHOOK MIDTRANS**
 */
app.post("/midtrans-notification", async (req, res) => {
  try {
    const {
      order_id,
      transaction_status,
      transaction_id,
      payment_type,
      gross_amount,
      va_numbers,
      item_details,
    } = req.body;

    if (!order_id || !transaction_status || !transaction_id) {
      console.error("❌ Missing fields in Midtrans notification", req.body);
      return res.status(400).json({ error: "Invalid notification data" });
    }

    console.log("🔹 Notification received from Midtrans:", JSON.stringify(req.body, null, 2));

    const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");

    const transactionRef = db.ref(`transactions/${order_id}`);

    await transactionRef.set({
      transaction_id,
      order_id,
      status: transaction_status,
      payment_method: payment_type,
      gross_amount,
      va_numbers: va_numbers || [],
      timestamp,
      items: item_details || [],
    });

    console.log(`✅ Transaction ${order_id} updated with status: ${transaction_status}`);
    res.status(200).json({ message: "Transaction status updated" });
  } catch (error) {
    console.error("❌ Error updating transaction status:", error);
    res.status(500).json({ error: "Failed to update transaction status", details: error.message });
  }
});

// ✅ Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
