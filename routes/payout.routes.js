const express = require("express");
const { getPayoutHistory } = require("../controllers/payout.controller");
const router = express.Router();

router.route("/history/:MID").get(getPayoutHistory);

module.exports = router;
