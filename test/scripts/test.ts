import hre from "hardhat";
import { Storage__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString } from "../../src";


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

    const buildInfo = await hre.artifacts.getBuildInfo("contracts/Storage.sol:Storage");
    if (!buildInfo) {
        throw new Error("couldn't find build info");
    }
    const output = buildInfo.output.contracts["contracts/Storage.sol"]["Storage"];

    const result = profile(JSON.parse(fs.readFileSync("debug_trace.txt").toString()),
        {
            bytecode: {
                bytecode: output.evm.bytecode.object,
                sourceMap: output.evm.bytecode.sourceMap,
                generatedSources: (output.evm.bytecode as any).generatedSources || []
            },
            deployedBytecode: {
                bytecode: output.evm.deployedBytecode.object,
                sourceMap: output.evm.deployedBytecode.sourceMap,
                generatedSources: (output.evm.deployedBytecode as any).generatedSources || []
            },
            sources: buildInfo.output.sources
        },
        buildInfo.input);

    fs.writeFileSync("sources.txt", sourcesProfileToString(result.sources));
    fs.writeFileSync("instructions.txt", instructionsProfileToString(result.instructions));
}

main().catch(e => console.error(e));
