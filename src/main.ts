import "dotenv/config";
import fs from "node:fs";
import csv from "csv-parser";
import {
  http,
  createConfig,
  simulateContract,
  writeContract,
} from "@wagmi/core";
import { base } from "@wagmi/core/chains";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import path from "node:path";

type Entry = {
  wallet: `0x${string}`;
};

const abi = [
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
      },
      {
        name: "to",
        type: "address",
      },
      {
        name: "id",
        type: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

function getClient() {
  if (typeof process.env.RPC_URL === undefined) {
    throw new Error("RPC_URL required");
  }

  if (typeof process.env.PRIVATE_KEY === undefined) {
    throw new Error("write account private key required");
  }

  const config = createConfig({
    chains: [base],
    transports: {
      [base.id]: http(process.env.RPC_URL),
    },
  });
  const writeAccount = privateKeyToAccount(
    process.env.PRIVATE_KEY as `0x${string}`,
  );
  return { config, writeAccount };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csvFilePath = path.join(__dirname, "wallets.csv");
const checkpointFilePath = path.join(__dirname, "checkpoint.txt");

const { config, writeAccount } = getClient();

async function processData(data: Entry) {
  const contractArgs: readonly [
    `0x${string}`,
    `0x${string}`,
    bigint,
    bigint,
    `0x${string}`,
  ] = ["0x193caa0449Ec1135A4c3FACd198da66DE72aC4Ed", data.wallet, 3n, 1n, "0x"];

  await simulateContract(config, {
    abi,
    address: "0xaB5354c2f18Fb7546Af08BC41428242e891477a7",
    functionName: "safeTransferFrom",
    args: contractArgs,
    account: writeAccount,
  });

  const hash = await writeContract(config, {
    abi,
    address: "0xaB5354c2f18Fb7546Af08BC41428242e891477a7",
    functionName: "safeTransferFrom",
    args: contractArgs,
    account: writeAccount,
  });

  console.log("token airdropped 🫳 ", hash);
}

async function processQueue(queue: Entry[], startIndex: number) {
  let index = startIndex;
  for (const entry of queue.slice(startIndex)) {
    console.log(`Processing transfer for wallet ${entry.wallet}`);
    await processData(entry);
    await new Promise((resolve) => setTimeout(resolve, 500));
    index++;
    await fs.promises.writeFile(checkpointFilePath, index.toString());
  }
  console.log("Done processing all entries.");
}

async function getLastProcessedIndex(): Promise<number> {
  try {
    const data = await fs.promises.readFile(checkpointFilePath, "utf-8");
    return parseInt(data, 10);
  } catch (error) {
    if (error instanceof Error) {
      console.log(error.message);
    }
    return 0;
  }
}

const entryQueue: Entry[] = [];

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on("data", (data: Entry) => {
    entryQueue.push(data);
  })
  .on("end", async () => {
    console.log(`Found ${entryQueue.length} entries in the CSV file.`);
    const lastProcessedIndex = await getLastProcessedIndex();
    console.log(`Starting from index ${lastProcessedIndex}.`);
    await processQueue(entryQueue, lastProcessedIndex);
  });
