import hre from "hardhat";
import { Storage__factory } from "../typechain-types";
import fs from "fs";


async function main() {
    const storageFactory = new Storage__factory((await hre.ethers.getSigners())[0]);
    const storage = await storageFactory.deploy();
    const tx = await (await storage.test(42)).wait();

    const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
        [tx.transactionHash, {
            "disableStack": true,
            "disableMemory": true,
            "disableStorage": true
        }]);
    fs.writeFileSync("debug_trace.txt", JSON.stringify(debugTrace, null, 4));
}

main().catch(e => console.error(e));
