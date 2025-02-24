const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const admin = require("firebase-admin");
const moment = require("moment-timezone");
require("dotenv").config();

console.log("Midtrans Server Key:", process.env.SERVER_KEY ? "Loaded Successfully" : "Not Found");

// 🔹 Inisialisasi Firebase
const serviceAccount = require("./service-account.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://gadjahdjaya-78fdf-default-rtdb.firebaseio.com",
});

const db = admin.database();
const app = express();
const PORT = 3000;

const SERVER_KEY = process.env.SERVER_KEY;
const MIDTRANS_API = "https://app.sandbox.midtrans.com/snap/v1/transactions";

app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(`[${moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss")}] Request: ${req.method} ${req.url}`);
    console.log("Request Body:", JSON.stringify(req.body, null, 2));
    next();
});

/**
 * ✅ GET SNAP TOKEN (Mendapatkan token pembayaran Midtrans)
 */
app.post("/getSnapToken", async (req, res) => {
    try {
        const { order_id, customer_details, payment_type, items, uid, takeaway } = req.body;

        if (!order_id || !customer_details || !payment_type || !items || items.length === 0 || !uid) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const gross_amount = items.reduce((total, item) => total + item.price * item.quantity, 0);
        const uniqueOrderId = `${order_id}-${Date.now()}`;

        // 🔹 Ambil nama kasir dari Firebase Authentication
        const userSnapshot = await admin.auth().getUser(uid);
        const cashier_name = userSnapshot.displayName || "Unknown";

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

        // 🔹 Simpan ke Firebase
        await db.ref(`transactions/${uniqueOrderId}`).set({
            transaction_id: null,
            order_id: uniqueOrderId,
            status: "pending",
            payment_method: payment_type,
            gross_amount,
            timestamp: moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
            cashier_name,
            takeaway, // 🔥 Simpan info dine-in atau takeaway
            items, 
        });

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
 * ✅ MIDTRANS WEBHOOK (Update status transaksi & kurangi stok otomatis)
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
        } = req.body;

        if (!order_id || !transaction_status || !transaction_id) {
            console.error("❌ Missing fields in Midtrans notification", req.body);
            return res.status(400).json({ error: "Invalid notification data" });
        }

        console.log("🔹 Notification received from Midtrans:", JSON.stringify(req.body, null, 2));

        const transactionRef = db.ref(`transactions/${order_id}`);
        const transactionSnapshot = await transactionRef.once("value");
        const existingTransaction = transactionSnapshot.val();

        if (!existingTransaction) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        const { items, takeaway } = existingTransaction;

        await transactionRef.update({
            transaction_id,
            status: transaction_status,
            payment_method: payment_type,
            gross_amount,
            va_numbers: va_numbers || [],
            timestamp: moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
        });

        // 🔥 Jika transaksi sukses, kurangi stok bahan baku
        if (transaction_status === "settlement" || transaction_status === "capture") {
            await kurangiStokBahan(items, takeaway);
        }

        console.log(`✅ Transaction ${order_id} updated with status: ${transaction_status}`);
        res.status(200).json({ message: "Transaction status updated" });
    } catch (error) {
        console.error("❌ Error updating transaction status:", error);
        res.status(500).json({ error: "Failed to update transaction status", details: error.message });
    }
});

/**
 * ✅ **Kurangi stok bahan baku**
 */
async function kurangiStokBahan(items, takeaway) {
    const bahanDatabase = db.ref("bahanBaku");
    const batchUpdates = {};

    items.forEach((menuItem) => {
        menuItem.bahanBakuDibutuhkan.forEach((bahan) => {
            batchUpdates[bahan.idBahan] = (batchUpdates[bahan.idBahan] || 0) - (bahan.jumlah * menuItem.quantity);
        });
    });

    // 🔥 Jika takeaway, kurangi stok Sendok & Garpu
    if (takeaway) {
        const sendokGarpuRef = await bahanDatabase.orderByChild("nama").equalTo("Sendok & Garpu").once("value");
        sendokGarpuRef.forEach((snap) => {
            const bahanId = snap.key;
            batchUpdates[bahanId] = (batchUpdates[bahanId] || 0) - items.length;
        });
    }

    console.log("🔹 Stock Updates:", batchUpdates);
    await bahanDatabase.update(batchUpdates);
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
