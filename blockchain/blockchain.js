const crypto = require('crypto');
const axios = require('axios');
const { removeNode, listNodesWithoutMe } = require('../utils');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

class Transaction {
  /**
   * @param {string} fromAddress
   * @param {string} toAddress
   * @param {number} amount
   */
  constructor(fromAddress, toAddress, amount) {
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.timestamp = Date.now();
  }

  /**
   * Creates a SHA256 hash of the transaction
   *
   * @returns {string}
   */
  calculateHash() {
    return crypto.createHash('sha256').update(this.fromAddress + this.toAddress + this.amount + this.timestamp).digest('hex');
  }

  /**
   * Signs a transaction with the given signingKey (which is an Elliptic keypair
   * object that contains a private key). The signature is then stored inside the
   * transaction object and later stored on the blockchain.
   *
   * @param {string} signingKey
   */
  signTransaction(privateKey) {
    // You can only send a transaction from the wallet that is linked to your
    // key. So here we check if the fromAddress matches your publicKey
    const signingKey = ec.keyFromPrivate(privateKey);
    if (signingKey.getPublic('hex') !== this.fromAddress) {
      throw new Error('You cannot sign transactions for other wallets!');
    }
    

    // Calculate the hash of this transaction, sign it with the key
    // and store it inside the transaction object
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
    // If the transaction doesn't have a from address we assume it's a
    // mining reward and that it's valid. You could verify this in a
    // different way (special field for instance)
    if (this.fromAddress === null) return true;

    if (!this.signature || this.signature.length === 0) {
      throw new Error('No signature in this transaction');
    }

    const publicKey = ec.keyFromPublic(this.fromAddress, 'hex');
    return publicKey.verify(this.calculateHash(), this.signature);
  }
}

class Block {
  /**
   * @param {number} timestamp
   * @param {Transaction[]} transactions
   * @param {string} previousHash
   */
  constructor(timestamp, transactions, previousHash = '') {
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  /**
   * Returns the SHA256 of this block (by processing all the data stored
   * inside this block)
   *
   * @returns {string}
   */
  calculateHash() {
    return crypto.createHash('sha256').update(this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce).digest('hex');
  }

  /**
   * Starts the mining process on the block. It changes the 'nonce' until the hash
   * of the block starts with enough zeros (= difficulty)
   *
   * @param {number} difficulty
   */
  mineBlock(difficulty) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
  }

  /**
   * Validates all the transactions inside this block (signature + hash) and
   * returns true if everything checks out. False if the block is invalid.
   *
   * @returns {boolean}
   */
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
    this.difficulty = 2;
    this.pendingTransactions = [];
    this.miningReward = 100;
  }

  async replaceChain() {
    let chain = this.chain;
    const nodes = listNodesWithoutMe(`http://localhost:${process.env.PORT}`);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      try {
        const response = await axios.get(`${node}/chain`)
        const data = response.data
        if (data.length > chain.length && this.isChainValid(data)) {
          chain = data
          this.pendingTransactions = []
        }
      } catch (error) {
        console.log(error);
        removeNode(node);
      }
    }
    this.chain = chain
    if (this.chain.length == 0) this.chain = [this.createGenesisBlock()]
  }

  /**
   * @returns {Block}
   */
  createGenesisBlock() {
    return new Block(Date.now(), [], '0');
  }

  /**
   * Returns the latest block on our chain. Useful when you want to create a
   * new Block and you need the hash of the previous Block.
   *
   * @returns {Block[]}
   */
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  /**
   * Takes all the pending transactions, puts them in a Block and starts the
   * mining process. It also adds a transaction to send the mining reward to
   * the given address.
   *
   * @param {string} miningRewardAddress
   */
  async minePendingTransactions(miningRewardAddress) {
    //Get all transactions from all nodes
    const pendingTransactions = await this.getAllPendingTransaction();

    //Check valid transactions
    this.pendingTransactions = this.validatePendingTransactions(pendingTransactions);

    // Reward for miner
    const rewardTx = new Transaction(null, miningRewardAddress, this.miningReward);
    this.pendingTransactions.push(rewardTx);

    // mine
    const block = new Block(Date.now(), this.pendingTransactions, this.getLatestBlock().hash);
    block.mineBlock(this.difficulty);
    this.chain.push(block);

    // empty pending list
    this.pendingTransactions = [];

    return block;
  }

  /**
   * Add a new transaction to the list of pending transactions (to be added
   * next time the mining process starts). This verifies that the given
   * transaction is properly signed.
   *
   * @param {Transaction} transaction
   */
  addTransaction(transaction) {
    if (!transaction.fromAddress || !transaction.toAddress) {
      throw new Error('Transaction must include from and to address');
    }

    // Verify the transactiion
    if (!transaction.isValid()) {
      throw new Error('Cannot add invalid transaction to chain');
    }
    
    if (transaction.amount <= 0) {
      throw new Error('Transaction amount should be higher than 0');
    }
    
    // Making sure that the amount sent is not greater than existing balance
    const walletBalance = this.getBalanceOfAddress(transaction.fromAddress);
    if (walletBalance < transaction.amount) {
      throw new Error('Not enough balance');
    }

    // Get all other pending transactions for the "from" wallet
    const pendingTxForWallet = this.pendingTransactions
      .filter(tx => tx.fromAddress === transaction.fromAddress);

    // If the wallet has more pending transactions, calculate the total amount
    // of spend coins so far. If this exceeds the balance, we refuse to add this
    // transaction.
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

  /**
   * Returns the balance of a given wallet address.
   *
   * @param {string} address
   * @returns {number} The balance of the wallet
   */
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

  /**
   * Returns a list of all transactions that happened
   * to and from the given wallet address.
   *
   * @param  {string} address
   * @return {Transaction[]}
   */
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

  /**
   * Loops over all the blocks in the chain and verify if they are properly
   * linked together and nobody has tampered with the hashes. By checking
   * the blocks it also verifies the (signed) transactions inside of them.
   *
   * @returns {boolean}
   */
  isChainValid(chain) {
    // Check the remaining blocks on the chain to see if there hashes and
    // signatures are correct
    for (let i = 0; i < chain.length; i++) {
      const currentBlock = chain[i];
      const previousBlock = chain[i != 0 ? i - 1 : 0];

      if (i === 0) {
        if (currentBlock.previousHash !== "0") return false;
      }
      else {
        if (previousBlock.hash !== currentBlock.previousHash) {
          return false;
        }
      }

      // check hash
      const hash = crypto.createHash('sha256').update(currentBlock.previousHash + currentBlock.timestamp + JSON.stringify(currentBlock.transactions) + currentBlock.nonce).digest('hex');
      if (currentBlock.hash !== hash) {
        return false;
      }
      if (i !== 0 && currentBlock.hash.substring(0, this.difficulty) !== Array(this.difficulty + 1).join('0')) {
        return false;
      }
    }

    return true;
  }

  async getAllPendingTransaction() {
    const nodes = listNodesWithoutMe(`http://localhost:${process.env.PORT}`)
    let pendingTransactions = this.pendingTransactions
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const response = await axios.get(`${node}/pending-transactions`)
      const data = response.data
      pendingTransactions = [...pendingTransactions, ...data]
    }

    //Check valid transactions
    pendingTransactions = pendingTransactions.sort((x, y) => x.timestamp - y.timestamp)
    return pendingTransactions;
  }

  validatePendingTransactions(pendingTransactions) {
    pendingTransactions = pendingTransactions.sort((x, y) => x.timestamp - y.timestamp)
    const wallets = {};
    const validTransactions = [];
    for (let i = 0; i < pendingTransactions.length; i++) {
      const tx = pendingTransactions[i];
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
