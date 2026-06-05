const express = require("express");
const router = express.Router();
const { adminLogin } = require("../controllers/admin.auth");
const { updateRequestStatus } = require("../controllers/admin.controller");

router.post("/login", adminLogin);
router.put("/request/:id", updateRequestStatus);

module.exports = router;
