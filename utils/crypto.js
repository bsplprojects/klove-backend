const crypto = require("crypto");

/* ================= ENV SECRET ================= */

const SECRET_KEY = process.env.CRYPTO_SECRET;
const ALGORITHM = "aes-256-cbc";

/* ================= VALIDATION ================= */

if (!SECRET_KEY) {
  throw new Error("CRYPTO_SECRET missing in .env");
}

const key = crypto.createHash("sha256").update(SECRET_KEY).digest();

/* ================= ENCRYPT ================= */

exports.encryptPassword = (password) => {
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
};

/* ================= DECRYPT ================= */

exports.decryptPassword = (encryptedPassword) => {
  const [ivHex, encryptedText] = encryptedPassword.split(":");

  const iv = Buffer.from(ivHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};
