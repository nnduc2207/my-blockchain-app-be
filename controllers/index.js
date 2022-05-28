const { Blockchain, Transaction } = require('../blockchain');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

const blockchain = new Blockchain()

const middleware = async (req, res, next) => {
  await blockchain.replaceChain();
  next();
}

const generateWallet = () => {
  const mykey = ec.genKeyPair();
  const publicKey = mykey.getPublic('hex');
  const privateKey = mykey.getPrivate('hex');
  return { privateKey, publicKey }
}

const getChain = () => {
  return blockchain.chain;
}

const getLatestBlock = () => {
  return blockchain.getLatestBlock();
}

const mine = async (address) => {
  return await blockchain.minePendingTransactions(address);
}

const sendToken = (from, to, amount, privateKey) => {
  const transaction = new Transaction(from, to, amount);
  transaction.signTransaction(privateKey);
  blockchain.addTransaction(transaction);
  return transaction;
}

const getBalance = (address) => {
  return blockchain.getBalanceOfAddress(address);
}

const addNodes = (nodes) => {
  blockchain.addNodes(nodes);
}

const replaceChain = async () => {
  return await blockchain.replaceChain();
}

const pendingTransactions = () => {
  return blockchain.pendingTransactions;
}

module.exports = {
  generateWallet,
  getChain,
  getLatestBlock,
  mine,
  sendToken,
  getBalance,
  addNodes,
  replaceChain,
  pendingTransactions,
  middleware,
}