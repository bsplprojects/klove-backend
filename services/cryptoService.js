const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(
  "https://polygon-rpc.com"
);

const adminWallet = new ethers.Wallet(
  process.env.ADMIN_PRIVATE_KEY,
  provider
);

// USDT Polygon Contract
const USDT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const ABI = [
  "function transfer(address to, uint amount) returns (bool)"
];

exports.sendUSDT = async (to, amount) => {
  const contract = new ethers.Contract(USDT, ABI, adminWallet);

  const decimals = 6; // USDT (Polygon)

  const tx = await contract.transfer(
    to,
    ethers.parseUnits(amount.toString(), decimals)
  );

  await tx.wait();

  return tx;
};