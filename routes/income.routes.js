const express = require("express");
const { getROIIncomeHistory } = require("../controllers/income.controller");

const router = express.Router();

router.route("/roi/:MID").get(getROIIncomeHistory);

module.exports = router;
