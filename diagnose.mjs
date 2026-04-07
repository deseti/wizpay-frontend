import { createPublicClient, http, parseAbiItem } from "viem";

const WIZPAY_ADDRESS = "0x87ACE45582f45cC81AC1E627E875AE84cbd75946";
const WIZPAY_BATCH_PAYMENT_ROUTED_EVENT = parseAbiItem(
  "event BatchPaymentRouted(address indexed sender, address tokenIn, address tokenOut, uint256 totalAmountIn, uint256 totalAmountOut, uint256 totalFees, uint256 recipientCount, string referenceId)"
);

const publicClient = createPublicClient({
  transport: http("https://rpc.testnet.arc.network"),
});

async function main() {
  const currentBlock = await publicClient.getBlockNumber();
  console.log("Current block:", currentBlock);

  console.log("Fetching logs with block range 10,000...");
  try {
    const logs = await publicClient.getLogs({
      address: WIZPAY_ADDRESS,
      event: WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
      fromBlock: currentBlock - 10000n,
      toBlock: "latest",
    });
    console.log("Success! Found:", logs.length);
    for (const log of logs) {
      console.log(`Block ${log.blockNumber}: Hash ${log.transactionHash}`);
      console.log("Sender:", log.args.sender);
    }
  } catch (err) {
    console.error("10k chunk failed:", err.message);
  }
}

main().catch(console.error);
