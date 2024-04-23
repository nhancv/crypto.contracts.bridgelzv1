const ethers = require('ethers');
const fromExponential = require('from-exponential');
const { prettyNum, PRECISION_SETTING, ROUNDING_MODE } = require('pretty-num');

// Init web3 timeout
const initWeb3Timeout = (web3) => {
  // Config web3 timeout
  /**
   * The transactionBlockTimeout is used over socket-based connections.
   * This option defines the amount of new blocks it should wait until the first confirmation happens,
   * otherwise the PromiseEvent rejects with a timeout error. Default is 50
   */
  web3.eth.transactionBlockTimeout = 100;
  /**
   * This defines the number of blocks it requires until a transaction is considered confirmed. Default is 24
   * Set to 1 to save Infura requests
   */
  web3.eth.transactionConfirmationBlocks = 1;
  /**
   * The transactionPollingTimeout is used over HTTP connections and it is quite different from transactionBlockTimeout.
   * It defines the number of seconds Web3 will wait for a receipt which confirms that a transaction was mined by the network.
   * Note that If this method times out, the transaction may still be pending. Default is 750 seconds
   */
  web3.eth.transactionPollingTimeout = 3600;
};

// Delay with progress
// https://www.npmjs.com/package/cli-progress
const cliProgress = require('cli-progress');
const sleepWithProgress = (ms) => {
  const bar1 = new cliProgress.SingleBar(
    {
      format: 'Sleeping | {bar} {percentage}% | ETA: {eta}s | {value}/{total} | {status}: {duration}s',
      hideCursor: true,
      barsize: 10,
      barCompleteChar: '*',
      barIncompleteChar: '-',
    },
    cliProgress.Presets.shades_classic,
  );
  return new Promise((resolve) => {
    const tick = 10;
    // Start progress with total 100 and start value of 0
    bar1.start(ms, 0, { status: 'Start' });
    // Update progress with interval
    const intervalId = setInterval(() => bar1.increment(tick), tick);

    // Delay with timeout
    const timeOutId = setTimeout(() => {
      resolve();
      bar1.update(ms, { status: 'Done' });
      bar1.stop();
      clearInterval(intervalId);
      clearTimeout(timeOutId);
    }, ms);
  });
};

// delay
const sleep = (ms) => {
  console.log('sleep:', ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// 1e18 => '1'
const fromWei = (amount, decimals = 18) => {
  return ethers.utils.formatUnits(
    prettyNum(fromExponential(amount || 0), { precision: decimals, roundingMode: ROUNDING_MODE.DOWN }),
    decimals,
  );
};

// 1 => '1000000000000000000'
const toWei = (amount, decimals = 18) => {
  return ethers.utils
    .parseUnits(
      prettyNum(fromExponential(amount || 0), { precision: decimals, roundingMode: ROUNDING_MODE.DOWN }),
      decimals,
    )
    .toString();
};

/**
 * Extract gas fee from truffle receipt
 * const fFunction = await contract.fFunction();
 * const fFunctionFee = await getTxFee(fFunction.receipt, web3);
 * console.log(`fee@fFunction: ${fFunctionFee.fee} ETH (${fromWei(fFunctionFee.gasPrice, 9)} Gwei, ${fFunctionFee.gasUsed} used)`);
 * @param receipt - truffle tx
 * @param web3_ - can be skip in unit test script
 * @returns {Promise<{gasUsed: *, fee: number, gasPrice: number}>}
 */
const getTxFee = async (receipt, web3_ = undefined) => {
  const gasPrice = await (web3_ || web3).eth.getGasPrice();
  const gasUsed = receipt.gasUsed;
  return { gasUsed, gasPrice, fee: gasUsed * fromWei(gasPrice) };
};

// Remove number as key
const normObj = (obj, stringify = false) => {
  for (const [key, value] of Object.entries(obj)) {
    if (!isNaN(key)) delete obj[key];
    else obj[key] = value.toString();
  }
  return stringify ? JSON.stringify(obj) : obj;
};

// await revert2Str(async () => console.log(await something));
const revert2Str = async (asyncCallBack) => {
  try {
    await asyncCallBack();
  } catch (e) {
    console.log(e.toString());
  }
};

module.exports = {
  initWeb3Timeout,
  sleep,
  sleepWithProgress,
  toWei,
  fromWei,
  getTxFee,
  normObj,
  revert2Str,
};
