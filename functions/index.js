const functions = require("firebase-functions");
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const admin = require("firebase-admin");
const moment = require("moment-timezone");

// 🔹 Inisialisasi Firebase Admin
admin.initializeApp();
const db = admin.database();
const app = express();

// 🔹 Ambil MIDTRANS_SERVER_KEY dari Firebase Config
const MIDTRANS_SERVER_KEY = functions.config().midtrans.server_key;

if (!MIDTRANS_SERVER_KEY) {
    console.error("❌ MIDTRANS_SERVER_KEY tidak ditemukan! Pastikan sudah diset di Firebase Config.");
    process.exit(1);
}

// 🔹 Middleware Logging
app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(`[${moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss")}] ${req.method} ${req.url}`);
    next();
});

/**
 * ✅ API GET SNAP TOKEN (Membuat transaksi & menyimpan ke Firebase dengan status "pending")
 */
app.post("/getSnapToken", async (req, res) => {
    try {
        const { orderId, customerId, items, dineOption } = req.body;

        if (!orderId || !customerId || !items || items.length === 0) {
            console.error("❌ Data tidak lengkap:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 🔹 Ambil data kasir berdasarkan customerId
        const userSnapshot = await db.ref(`Users/${customerId}`).once("value");
        const userData = userSnapshot.val();

        if (!userData) {
            console.error(`❌ Kasir ID ${customerId} tidak ditemukan`);
            return res.status(404).json({ error: "Kasir tidak ditemukan" });
        }

        const customerDetails = {
            first_name: userData.name || "Unknown",
            email: userData.email || "unknown@gmail.com",
            phone: userData.phone || "0000000000",
        };

        const grossAmount = items.reduce((total, item) => total + item.price * item.quantity, 0);
        const uniqueOrderId = `${orderId}-${Date.now()}`;

        const transactionDetails = {
            transaction_details: { order_id: uniqueOrderId, gross_amount: grossAmount },
            customer_details: customerDetails,
            item_details: items,
        };

        console.log("🔹 Mengirim transaksi ke Midtrans:", JSON.stringify(transactionDetails, null, 2));

        const response = await axios.post(
            "https://app.sandbox.midtrans.com/snap/v1/transactions",
            transactionDetails,
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64")}`,
                },
            }
        );

        console.log("✅ Respon Midtrans:", JSON.stringify(response.data, null, 2));

        if (!response.data.token) {
            throw new Error("Snap Token tidak ditemukan dalam response");
        }

        // ✅ Simpan transaksi ke Firebase
        await db.ref(`transactions/online/${uniqueOrderId}`).set({
            transaction_id: null,
            order_id: uniqueOrderId,
            status: "pending",
            payment_method: "unknown",
            gross_amount: grossAmount,
            timestamp: moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
            items: items,
            dine_option: dineOption || "Dine In",
            va_numbers: [],
            cashier_id: userData.name || "unknown",
            redirect_to_receipt: false // ✅ Tambahkan flag untuk redirect setelah sukses
        });

        console.log("✅ Transaksi berhasil disimpan:", uniqueOrderId);

        res.json({
            token: response.data.token,
            redirectUrl: response.data.redirect_url,
            orderId: uniqueOrderId,
        });

    } catch (error) {
        console.error("❌ Error mendapatkan Snap Token:", error.response ? error.response.data : error.message);
        res.status(500).json({
            error: "Gagal mendapatkan Snap Token",
            details: error.response ? error.response.data : error.message,
        });
    }
});

/**
 * ✅ API WEBHOOK MIDTRANS (Memperbarui status transaksi di Firebase & Kurangi Stok Bahan Baku)
 */
app.post("/midtrans-notification", async (req, res) => {
    try {
        const { 
            order_id: orderId,
            transaction_status: transactionStatus,
            transaction_id: transactionId,
            payment_type: paymentType,
            va_numbers: vaNumbers,
            gross_amount: grossAmount
        } = req.body;

        if (!orderId || !transactionStatus || !transactionId || !paymentType) {
            return res.status(400).json({ error: "Invalid notification data" });
        }

        console.log("🔹 Notifikasi dari Midtrans:", JSON.stringify(req.body, null, 2));

        const transactionRef = db.ref(`transactions/online/${orderId}`);
        const transactionSnapshot = await transactionRef.once("value");
        const existingTransaction = transactionSnapshot.val();

        if (!existingTransaction) {
            console.error("❌ Transaksi tidak ditemukan di Firebase:", orderId);
            return res.status(404).json({ error: "Transaksi tidak ditemukan di Firebase" });
        }

        const timestamp = moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");

        let finalStatus = transactionStatus;

        // ✅ Jika pembayaran bank_transfer masih "pending" di Sandbox, ubah ke "settlement" otomatis
        if (paymentType === "bank_transfer" && transactionStatus === "pending") {
            console.log("⚠ Simulasi Sandbox: Bank Transfer otomatis ke 'settlement'");
            finalStatus = "settlement";
        }

        // ✅ **Update transaksi di Firebase**
        await transactionRef.update({
            transaction_id: transactionId,
            status: finalStatus,
            payment_method: paymentType,
            gross_amount: parseFloat(grossAmount),
            va_numbers: vaNumbers || [],
            timestamp,
            redirect_to_receipt: finalStatus === "settlement"
        });

        console.log(`✅ Transaksi ${orderId} diperbarui dengan status: ${finalStatus}`);

        // ✅ Jika dine_option "Take Away", kurangi stok Sendok & Garpu
        if (existingTransaction.dine_option === "Take Away") {
            const cutleryRef = db.ref("bahanBaku/-OJACyMD5f1IXG3C8h86"); // ID Sendok & Garpu
            const cutlerySnapshot = await cutleryRef.once("value");

            if (cutlerySnapshot.exists()) {
                const cutleryData = cutlerySnapshot.val();
                const totalPesanan = existingTransaction.items.reduce((sum, item) => sum + item.quantity, 0);
                const updatedStok = cutleryData.stok - totalPesanan;

                if (updatedStok >= 0) {
                    await cutleryRef.update({ stok: updatedStok });
                    console.log(`✅ Stok Sendok & Garpu dikurangi sebanyak ${totalPesanan}. Stok sekarang: ${updatedStok}`);
                } else {
                    console.warn(`⚠ Stok Sendok & Garpu tidak cukup!`);
                }
            } else {
                console.warn(`⚠ Data Sendok & Garpu tidak ditemukan di database!`);
            }
        }

        res.status(200).json({ message: "Status transaksi diperbarui" });

    } catch (error) {
        console.error("❌ Error memperbarui transaksi:", error);
        res.status(500).json({ error: "Gagal memperbarui status transaksi", details: error.message });
    }
});

/**
 * ✅ API CHECK STATUS SERVER
 */
app.get("/", (req, res) => {
    res.send("Midtrans Payment Gateway Server is Running!");
});

/**
 * ✅ Firebase Cloud Functions Export
 */
exports.api = functions.https.onRequest(app);
