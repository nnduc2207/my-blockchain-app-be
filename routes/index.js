var express = require('express');
var router = express.Router();
const {
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
} = require('../controllers/index')

/* GET home page. */
router.get('/', function(req, res) {
  try {
    return res.send("Hello");
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.get('/generate-wallet', function(req, res) {
  try {
  return res.send(generateWallet());
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.get('/chain', function(req, res) {
  try {
  return res.send(getChain());
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.get('/latest-block', middleware, function(req, res) {
  try {
  return res.send(getLatestBlock());
} catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.post('/mine', middleware, async function(req, res) {
  try {
    const { address } = req.body;
    if (!address) throw "ADDRESS IS REQUIRED";
    return res.send( await mine(address));
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.post('/send-token', middleware, function(req, res) {
  try {
    const { from, to, amount, privateKey } = req.body;
    if (!from) throw "FROM IS REQUIRED";
    if (!to) throw "TO IS REQUIRED";
    if (!amount || amount < 0) throw "AMOUNT IS REQUIRED";
    if (!privateKey) throw "PRIVATEKEY IS REQUIRED";
    const transaction = sendToken(from, to, amount, privateKey);
    return res.send(transaction);
  } catch (error) {
    console.log(error);
    return res.status(400).send({ error: error.toString() })
  }
});

router.post('/balance', middleware, function(req, res) {
  try {
    const { address } = req.body;
    if (!address) throw "ADDRESS IS REQUIRED";
    const balance = getBalance(address)
    return res.send({ balance });
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.get('/replace-chain', middleware, async function(req, res) {
  try {
    const result = replaceChain()
    return res.send(JSON.stringify(result));
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

router.get('/pending-transactions', middleware, function(req, res) {
  try {
    const result = pendingTransactions();
    return res.send(JSON.stringify(result));
  } catch (error) {
    return res.status(400).send({ error: error.toString() })
  }
});

module.exports = router;
