const functions = require("firebase-functions");
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const admin = require("firebase-admin");
const moment = require("moment-timezone");
require("dotenv").config();

// 🔹 Inisialisasi Firebase
admin.initializeApp();

const db = admin.database();
const app = express();

// 🔹 Konfigurasi Midtrans
const SERVER_KEY = process.env.SERVER_KEY;
const MIDTRANS_API = "https://app.sandbox.midtrans.com/snap/v1/transactions";

// 🔹 Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(`[${moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss")}] ${req.method} ${req.url}`);
    next();
});

/**
 * **✅ GET SNAP TOKEN**
 */
app.post("/getSnapToken", async (req, res) => {
    try {
        const { orderId, customerDetails, paymentType, items } = req.body;

        // ✅ Validasi input
        if (!orderId || !customerDetails || !paymentType || !items || items.length === 0) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Hitung total pembayaran
        const grossAmount = items.reduce((total, item) => total + item.price * item.quantity, 0);
        const uniqueOrderId = `${orderId}-${Date.now()}`;

        // ✅ Detail transaksi
        const transactionDetails = {
            transaction_details: { order_id: uniqueOrderId, gross_amount: grossAmount },
            customer_details: customerDetails,
            item_details: items,
        };

        console.log("🔹 Sending to Midtrans:", JSON.stringify(transactionDetails, null, 2));

        // ✅ Kirim permintaan ke Midtrans
        const response = await axios.post(MIDTRANS_API, transactionDetails, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${Buffer.from(SERVER_KEY).toString("base64")}`,
            },
        });

        if (!response.data.token) {
            throw new Error("Snap Token not found in response");
        }

        res.json({
            token: response.data.token,
            redirectUrl: response.data.redirect_url,
        });
    } catch (error) {
        res.status(500).json({
            error: "Failed to get Snap Token",
            details: error.response ? error.response.data : error.message,
        });
    }
});

/**
 * **✅ WEBHOOK MIDTRANS**
 */
app.post("/midtrans-notification", async (req, res) => {
    try {
        const {
            order_id: orderId,
            transaction_status: transactionStatus,
            transaction_id: transactionId,
            payment_type: paymentType,
            gross_amount: grossAmount,
            va_numbers: vaNumbers,
            item_details: itemDetails,
        } = req.body;

        if (!orderId || !transactionStatus || !transactionId) {
            return res.status(400).json({ error: "Invalid notification data" });
        }

        console.log("🔹 Webhook received:", JSON.stringify(req.body, null, 2));

        // ✅ Simpan ke Firebase
        const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
        const transactionRef = db.ref(`transactions/${orderId}`);

        await transactionRef.set({
            transactionId,
            orderId,
            status: transactionStatus,
            paymentMethod: paymentType,
            grossAmount,
            vaNumbers: vaNumbers || [],
            timestamp,
            items: itemDetails || [],
        });

        res.status(200).json({ message: "Transaction updated" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update transaction", details: error.message });
    }
});

/**
 * **✅ Firebase Cloud Functions Export**
 */
exports.api = functions.https.onRequest(app);
