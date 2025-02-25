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
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 🔹 Ambil data kasir berdasarkan customerId
        const userSnapshot = await db.ref(`Users/${customerId}`).once("value");
        const userData = userSnapshot.val();

        if (!userData) {
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
            redirect_to_receipt: false
        });

        res.json({
            token: response.data.token,
            redirectUrl: response.data.redirect_url,
            orderId: uniqueOrderId,
        });

    } catch (error) {
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
        const { order_id: orderId, transaction_status: transactionStatus, transaction_id: transactionId, payment_type: paymentType, va_numbers: vaNumbers, gross_amount: grossAmount } = req.body;

        if (!orderId || !transactionStatus || !transactionId || !paymentType) {
            return res.status(400).json({ error: "Invalid notification data" });
        }

        const transactionRef = db.ref(`transactions/online/${orderId}`);
        const transactionSnapshot = await transactionRef.once("value");
        const existingTransaction = transactionSnapshot.val();

        if (!existingTransaction) {
            return res.status(404).json({ error: "Transaksi tidak ditemukan di Firebase" });
        }

        let finalStatus = transactionStatus;

        if (paymentType === "bank_transfer" && transactionStatus === "pending") {
            finalStatus = "settlement";
        }

        await transactionRef.update({
            transaction_id: transactionId,
            status: finalStatus,
            payment_method: paymentType,
            gross_amount: parseFloat(grossAmount),
            va_numbers: vaNumbers || [],
            timestamp: moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
            redirect_to_receipt: finalStatus === "settlement"
        });

        if (finalStatus === "settlement") {
            await kurangiStokBahan(existingTransaction.items);
            if (existingTransaction.dine_option === "Take Away") {
                await kurangiStokPeralatanTakeAway(existingTransaction.items);
            }
        }

        res.status(200).json({ message: "Status transaksi diperbarui dan stok dikurangi" });

    } catch (error) {
        res.status(500).json({ error: "Gagal memperbarui status transaksi", details: error.message });
    }
});

/**
 * ✅ **Kurangi stok Kertas Nasi & Sendok & Garpu untuk Take Away & Catat Log**
 */
async function kurangiStokPeralatanTakeAway(items) {
    const bahanDatabase = db.ref("bahanBaku");
    const logDatabase = db.ref("log_stok");

    const peralatan = {
        "sendokGarpu": "-OJACyMD5f1IXG3C8h86",
        "kertasNasi": "-OIT9Mu862KCenndpRwi"
    };

    let totalPesanan = items.reduce((sum, item) => sum + item.quantity, 0);
    const tanggalHariIni = moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    for (const key in peralatan) {
        const bahanRef = bahanDatabase.child(peralatan[key]);
        const logRef = logDatabase.child(`${tanggalHariIni}/pemasukan/${peralatan[key]}`);

        // 🔹 Ambil satuan bahan baku dari Firebase
        const bahanSnapshot = await bahanRef.once("value");
        if (!bahanSnapshot.exists()) continue;

        const satuanBahan = bahanSnapshot.child("satuan").val() || "-"; // 🔹 Gunakan satuan dari bahan baku

        // 🔹 Kurangi stok di Firebase
        await bahanRef.update({
            stok: admin.database.ServerValue.increment(-totalPesanan),
        });

        // 🔹 Perbarui log stok di `log_stok/{tanggal}/pemasukan/{idBahan}`
        const logSnapshot = await logRef.once("value");
        const pemakaianSebelumnya = logSnapshot.child("total_pemakaian").val() || 0;
        const pemakaianBaru = pemakaianSebelumnya + totalPesanan;

        const logData = {
            nama: key === "sendokGarpu" ? "Sendok & Garpu" : "Kertas Nasi",
            total_pemakaian: pemakaianBaru,
            satuan: satuanBahan // 🔹 Pakai satuan dari database bahan baku
        };

        await logRef.set(logData);
        console.log(`✅ Log Stok ${logData.nama} diperbarui: ${pemakaianSebelumnya} → ${pemakaianBaru} ${satuanBahan}`);
    }
}



/**
 * ✅ **Kurangi stok Kertas Nasi & Sendok & Garpu untuk Take Away & Catat Log**
 */
async function kurangiStokPeralatanTakeAway(items) {
    const bahanDatabase = db.ref("bahanBaku");
    const logDatabase = db.ref("log_stok");

    const peralatan = {
        "sendokGarpu": "-OJACyMD5f1IXG3C8h86",
        "kertasNasi": "-OIT9Mu862KCenndpRwi"
    };

    let totalPesanan = items.reduce((sum, item) => sum + item.quantity, 0);
    const tanggalHariIni = moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    for (const key in peralatan) {
        const bahanRef = bahanDatabase.child(peralatan[key]);
        const logRef = logDatabase.child(`${tanggalHariIni}/pemasukan/${peralatan[key]}`); // 🔹 Log ke dalam "pemasukan"

        // 🔹 Kurangi stok di Firebase
        await bahanRef.update({
            stok: admin.database.ServerValue.increment(-totalPesanan),
        });

        // 🔹 Perbarui log stok di `log_stok/{tanggal}/pemasukan/{idBahan}`
        const logSnapshot = await logRef.once("value");
        const pemakaianSebelumnya = logSnapshot.child("total_pemakaian").val() || 0;
        const pemakaianBaru = pemakaianSebelumnya + totalPesanan;

        const logData = {
            nama: key === "sendokGarpu" ? "Sendok & Garpu" : "Kertas Nasi",
            total_pemakaian: pemakaianBaru,
            satuan: "unit"
        };

        await logRef.set(logData);
        console.log(`✅ Log Stok ${logData.nama} diperbarui: ${pemakaianSebelumnya} → ${pemakaianBaru}`);
    }
}


exports.api = functions.https.onRequest(app);
