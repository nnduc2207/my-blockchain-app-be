const { Blockchain, Transaction } = require("../blockchain")
const EC = require("elliptic").ec
const ec = new EC("secp256k1")

const blockchain = new Blockchain()

const middleware = async (req, res, next) => {
  // Cập nhật chuỗi dữ liệu
  await blockchain.replaceChain()
  next()
}

const generateWallet = () => {
  // Tự sính khoá ngẫu nhiên mới
  const mykey = ec.genKeyPair()
  // Lấy địa chỉ ví từ khoá
  const publicKey = mykey.getPublic("hex")
  // Lấy mã bí mật từ khoá
  const privateKey = mykey.getPrivate("hex")
  return { privateKey, publicKey }
}

const getChain = () => {
  // Trả về chuỗi dữ liệu
  return blockchain.chain
}

const getLatestBlock = () => {
  return blockchain.getLatestBlock()
}

const mine = async (address) => {
  return await blockchain.minePendingTransactions(address)
}

const sendToken = (from, to, amount, privateKey) => {
  // Tạo giao dịch
  const transaction = new Transaction(from, to, amount)
  // Kí giao dịch
  transaction.signTransaction(privateKey)
  // Thêm giao dịch vào danh sách chờ (pending transaction)
  blockchain.addTransaction(transaction)
  return transaction
}

const getBalance = (address) => {
  return blockchain.getBalanceOfAddress(address)
}

const replaceChain = async () => {
  return await blockchain.replaceChain()
}

const pendingTransactions = () => {
  return blockchain.pendingTransactions
}

const getAllPendingTransactions = async () => {
  return await blockchain.getAllPendingTransaction()
}

const getValidPendingTransactions = async () => {
  const pendingTransactions = await getAllPendingTransactions();
  const validPendingTransactions = blockchain.validatePendingTransactions(pendingTransactions);
  return validPendingTransactions;
}

const getTransactionsByAddress = (address) => {
  const txs = blockchain.getAllTransactionsForWallet(address);
  return txs.sort((x, y) => x.timestamp - y.timestamp);
}

module.exports = {
  generateWallet,
  getChain,
  getLatestBlock,
  mine,
  sendToken,
  getBalance,
  replaceChain,
  pendingTransactions,
  getAllPendingTransactions,
  getValidPendingTransactions,
  getTransactionsByAddress,
  middleware,
}
