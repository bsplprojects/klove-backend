const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const { insertDeposit } = require("../controllers/deposit.controller");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
});

router.route("/").post(upload.single("file"), insertDeposit);

module.exports = router;
