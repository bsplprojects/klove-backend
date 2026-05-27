const express = require("express");
const router = express.Router();
const adminAuth = require("../controllers/admin.auth");

router.post("/login", adminAuth.adminLogin);

module.exports = router;