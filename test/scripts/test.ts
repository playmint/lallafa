import hre from "hardhat";
import { Storage__factory } from "../typechain-types";
import fs from "fs";
import { profile } from "../../src";


async function main() {
    if (!fs.existsSync("debug_trace.txt")) {
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

    profile(JSON.parse(fs.readFileSync("debug_trace.txt").toString()));
}

main().catch(e => console.error(e));
