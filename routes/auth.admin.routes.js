const express = require("express");
const router = express.Router();
const { adminLogin } = require("../controllers/admin.auth");
const {
  updateRequestStatus,
  addUPIId,
  updateWithdrawalRequestStatus,
  addNotice,
  getNotices,
  deleteNotice,
} = require("../controllers/admin.controller");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },

  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
});

router.post("/login", adminLogin);
router.post("/notice", upload.single("file"), addNotice);
router.get("/notice", getNotices);
router.delete("/notice/:id", deleteNotice);
router.put("/request/:id", updateRequestStatus);
router.put("/request/withdrawal/:id", updateWithdrawalRequestStatus);
router.put("/upi/:id", addUPIId);

module.exports = router;
