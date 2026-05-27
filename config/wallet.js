const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(
  "https://polygon-rpc.com"
);

const adminWallet = new ethers.Wallet(
  process.env.ADMIN_PRIVATE_KEY,
  provider
);

module.exports = { provider, adminWallet };