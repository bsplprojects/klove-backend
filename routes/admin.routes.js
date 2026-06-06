const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");

router.get("/member-report", adminController.memberReport);

router.post("/activate-account", adminController.activateAccount);

router.post("/send-fund", adminController.sendfund);

router.get("/topup-report", adminController.topupReport);

router.get("/withdrawal-report", adminController.withdrawReport);

module.exports = router;
