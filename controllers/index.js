const { Blockchain, Transaction } = require("../blockchain")
const EC = require("elliptic").ec
const ec = new EC("secp256k1")

const blockchain = new Blockchain()

const middleware = async (req, res, next) => {
  await blockchain.replaceChain()
  next()
}

const generateWallet = () => {
  const mykey = ec.genKeyPair()
  const publicKey = mykey.getPublic("hex")
  const privateKey = mykey.getPrivate("hex")
  return { privateKey, publicKey }
}

const getChain = () => {
  return blockchain.chain
}

const getLatestBlock = () => {
  return blockchain.getLatestBlock()
}

const mine = async (address) => {
  return await blockchain.minePendingTransactions(address)
}

const sendToken = (from, to, amount, privateKey) => {
  const transaction = new Transaction(from, to, amount)
  transaction.signTransaction(privateKey)
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
