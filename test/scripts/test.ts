import hre from "hardhat";
import { Storage__factory } from "../typechain-types";
import fs from "fs";


async function main() {
    const storageFactory = new Storage__factory((await hre.ethers.getSigners())[0]);
    const storage = await storageFactory.deploy();
    const tx = await (await storage.setValue(42)).wait();

    if (hre.network.name == "hardhat") {
        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction", [tx.transactionHash]);
        fs.writeFileSync("debug_trace.txt", JSON.stringify(debugTrace, null, 4));
    }
    else if (hre.network.name == "anvil") {
        const trace = await hre.ethers.provider.send("trace_transaction", [tx.transactionHash]);
        fs.writeFileSync("trace.txt", JSON.stringify(trace, null, 4));
    }
    else {
        throw new Error("what network is this?");
    }
}

main().catch(e => console.error(e));
