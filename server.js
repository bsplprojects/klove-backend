require("dotenv").config();

const express = require("express");
const app = require("./app");

/* ================= BASIC CONFIG ================= */

const PORT = process.env.PORT || 5000;

/* ================= STATIC FOLDER ================= */
// PDF / Images access
app.use("/uploads", express.static("uploads"));

/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
