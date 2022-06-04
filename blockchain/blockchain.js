const crypto = require('crypto');
const axios = require('axios');
const { removeNode, listNodesWithoutMe } = require('../utils');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

class Transaction {
  constructor(fromAddress, toAddress, amount) {
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.timestamp = Date.now();
    this.signature = '';
  }

  static importData({ fromAddress, toAddress, amount, timestamp, signature }) {
    const newTxn = new Transaction(undefined, undefined, undefined);
    newTxn.fromAddress = fromAddress;
    newTxn.toAddress = toAddress;
    newTxn.amount = amount;
    newTxn.timestamp = timestamp;
    newTxn.signature = signature;
    return newTxn;
  }

  calculateHash() {
    return crypto.createHash('sha256').update(this.fromAddress + this.toAddress + this.amount + this.timestamp).digest('hex');
  }

  signTransaction(privateKey) {
    // Chỉ có thể tạo giao dịch từ ví của bản thân vì thế cần khoá bí mật xác nhận
    // Thư viện elliptic có thể dễ dàng tìm kiếm một chiều từ privatekey ra publickey bằng cách tìm ra signingkey
    const signingKey = ec.keyFromPrivate(privateKey);
    if (signingKey.getPublic('hex') !== this.fromAddress) {
      throw new Error('You cannot sign transactions for other wallets!');
    }
    
    // Tính chuỗi băm của giao dịch và kí nó với khoá kí của cặp khoá (private-public)
    // và lưu trữ vào giao dịch để xác thực về sau
    const hashTx = this.calculateHash();
    const sig = signingKey.sign(hashTx, 'base64');
    this.signature = sig.toDER('hex');
  }

  /**
   * Checks if the signature is valid (transaction has not been tampered with).
   * It uses the fromAddress as the public key.
   *
   * @returns {boolean}
   */
  isValid() {
    // Nếu giao dịch không có địa chỉ đi thì trả về true
    // Vì đây là giao dịch thưởng
    // Nếu không phải thì kiểm tra chữ kí
    if (this.fromAddress === null) return true;

    if (!this.signature || this.signature.length === 0) {
      throw new Error('No signature in this transaction');
    }

    const publicKey = ec.keyFromPublic(this.fromAddress, 'hex');
    return publicKey.verify(this.calculateHash(), this.signature);
  }
}

class Block {
  constructor(timestamp, transactions, previousHash = '') {
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  static importData({ previousHash, timestamp, transactions, nonce, hash }) {
    const newBlock = new Block(undefined, undefined, undefined)
    newBlock.previousHash = previousHash;
    newBlock.timestamp = timestamp;
    newBlock.transactions = [];
    newBlock.nonce = nonce;
    newBlock.hash = hash;
    for (const txn of transactions) {
      newBlock.transactions.push(Transaction.importData(txn));
    }
    return newBlock;
  }

  calculateHash() {
    return crypto.createHash('sha256').update(this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce).digest('hex');
  }

  mineBlock(difficulty) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
  }

  hasValidTransactions() {
    for (const tx of this.transactions) {
      if (!tx.isValid()) {
        return false;
      }
    }

    return true;
  }
}

class Blockchain {
  constructor() {
    this.chain = [];
    this.difficulty = 4;
    this.pendingTransactions = [];
    this.miningReward = 100;
  }

  static importData(chain) {
    const newBlockchain = new Blockchain()
    for (const blockData of chain) {
      const block = Block.importData(blockData);
      newBlockchain.chain.push(block)
    }
    return newBlockchain;
  }

  async replaceChain() {
    let chain = this.chain;
    // Danh sách các node khác đăng ký vào mạng blockchain
    const nodes = listNodesWithoutMe(`http://localhost:${process.env.PORT}`);

    // Kiểm tra từng node và cập nhật chain nếu có node chứa chuỗi dài hơn và hợp lệ
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      try {
        const response = await axios.get(`${node}/chain`)
        const data = response.data;
        const newChain = Blockchain.importData(data);
        if (newChain.chain.length > chain.length && newChain.isChainValid()) {
          chain = data
          this.pendingTransactions = []
        }
      } catch (error) {
        removeNode(node);
      }
    }
    this.chain = chain

    // Nếu tất cả các node đều chưa có khối nào thì tạo khối Genesis
    if (this.chain.length == 0) this.chain = [this.createGenesisBlock()]
  }

  createGenesisBlock() {
    return new Block(Date.now(), [], '0');
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  async minePendingTransactions(miningRewardAddress) {
    //Lấy danh sách tất cả pending transaction trên tất cả node
    const pendingTransactions = await this.getAllPendingTransaction();

    //Kiểm tra danh sách hợp lệ
    this.pendingTransactions = this.validatePendingTransactions(pendingTransactions);

    // Phần thưởng cho miner
    const rewardTx = new Transaction(null, miningRewardAddress, this.miningReward);
    this.pendingTransactions.push(rewardTx);

    // mine
    const lastBlock1 = this.getLatestBlock()
    const block = new Block(Date.now(), this.pendingTransactions, lastBlock1.hash);
    block.mineBlock(this.difficulty);

    // Kiểm tra blockchain đã được mine trong khoảng thời gian này hay không
    await this.replaceChain()
    const lastBlock2 = this.getLatestBlock()
    if (lastBlock1.hash === lastBlock2.hash) {
      this.chain.push(block);
      
      // empty pending list
      this.pendingTransactions = [];
      return block;
    }
    throw 'There is someone has mined before you';
  }

  addTransaction(transaction) {
    if (!transaction.fromAddress || !transaction.toAddress) {
      throw new Error('Transaction must include from and to address');
    }
    // Xác thực chữ kí
    if (!transaction.isValid()) {
      throw new Error('Cannot add invalid transaction to chain');
    }
    if (transaction.amount <= 0) {
      throw new Error('Transaction amount should be higher than 0');
    }
    // Kiểm tra số dư ví
    const walletBalance = this.getBalanceOfAddress(transaction.fromAddress);
    if (walletBalance < transaction.amount) {
      throw new Error('Not enough balance');
    }

    // Kiểm tra số dư ví với các giao dịch chờ
    const pendingTxForWallet = this.pendingTransactions
      .filter(tx => tx.fromAddress === transaction.fromAddress);
    if (pendingTxForWallet.length > 0) {
      const totalPendingAmount = pendingTxForWallet
        .map(tx => tx.amount)
        .reduce((prev, curr) => prev + curr);

      const totalAmount = totalPendingAmount + transaction.amount;
      if (totalAmount > walletBalance) {
        throw new Error('Pending transactions for this wallet is higher than its balance.');
      }
    }
                                    
    this.pendingTransactions.push(transaction);
  }

  getBalanceOfAddress(address) {
    let balance = 0;

    for (const block of this.chain) {
      for (const trans of block.transactions) {
        if (trans.fromAddress === address) {
          balance -= trans.amount;
        }

        if (trans.toAddress === address) {
          balance += trans.amount;
        }
      }
    }

    return balance;
  }

  getAllTransactionsForWallet(address) {
    const txs = [];

    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.fromAddress === address || tx.toAddress === address) {
          txs.push(tx);
        }
      }
    }
    return txs;
  }

  isChainValid() {
    // Kiểm tra các khối trên chuỗi có chuỗi băm và chữ kí hợp lệ hay không
    for (let i = 0; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i != 0 ? i - 1 : 0];

      if (i === 0) {  // Khối genesis
        if (currentBlock.previousHash !== "0") return false;
      }
      else {
        if (previousBlock.hash !== currentBlock.previousHash) {
          return false;
        }
      }
      // Kiểm tra chuỗi băm
      const hash = crypto.createHash('sha256').update(currentBlock.previousHash + currentBlock.timestamp + JSON.stringify(currentBlock.transactions) + currentBlock.nonce).digest('hex');
      if (currentBlock.hash !== hash) {
        return false;
      }
      if (i !== 0 && currentBlock.hash.substring(0, this.difficulty) !== Array(this.difficulty + 1).join('0')) {
        return false;
      }
      // Kiểm tra các giao dịch trong các khối
      if (currentBlock.hasValidTransactions() === false) return false;
    }
    return true;
  }

  async getAllPendingTransaction() {
    // Lấy danh sách các node đăng kí trong mạng blockchain trừ bản thân
    const nodes = listNodesWithoutMe(`http://localhost:${process.env.PORT}`)
    let pendingTransactions = [...this.pendingTransactions]
    // Gom danh sách pending transaction ở các node khác
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const response = await axios.get(`${node}/pending-transactions`)
      const data = response.data
      for (const element of data) {
        const txn = Transaction.importData(element)
        if (txn.isValid() === true) {
          pendingTransactions.push(txn);
        }
      }
    }

    //Sắp xếp danh sách theo thời gian tăng dần
    pendingTransactions = pendingTransactions.sort((x, y) => x.timestamp - y.timestamp)
    return pendingTransactions;
  }

  validatePendingTransactions(pendingTransactions) {
    // Sắp xếp danh sách pending transaction theo thời gian tăng dần
    pendingTransactions = pendingTransactions.sort((x, y) => x.timestamp - y.timestamp)
    const wallets = {};
    const validTransactions = [];
    for (let i = 0; i < pendingTransactions.length; i++) {
      const tx = pendingTransactions[i];
      // Kiểm tra xác thực giao dịch
      if (tx.isValid() === false) continue;
      // Kiểm tra số dư của ví
      wallets[tx.fromAddress] = (wallets[tx.fromAddress] !== undefined) ? wallets[tx.fromAddress] : this.getBalanceOfAddress(tx.fromAddress)
      if (wallets[tx.fromAddress] - tx.amount >= 0) {
        validTransactions.push(tx);
        wallets[tx.fromAddress] = wallets[tx.fromAddress] - tx.amount
        wallets[tx.toAddress] = ((wallets[tx.toAddress] !== undefined) ? wallets[tx.toAddress] : this.getBalanceOfAddress(tx.toAddress)) + tx.amount
      }
    }
    return validTransactions;
  }

}

module.exports.Blockchain = Blockchain;
module.exports.Block = Block;
module.exports.Transaction = Transaction;
