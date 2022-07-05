import hre from "hardhat";
import { Storage__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString } from "../../src";


async function main() {
    if (!fs.existsSync("test_debug_trace.txt") ||
        !fs.existsSync("deploy_debug_trace.txt")) {
        const storageFactory = new Storage__factory((await hre.ethers.getSigners())[0]);
        const storage = await storageFactory.deploy();
        const tx = await (await storage.test(42)).wait();

        await saveDebugTrace("deploy_debug_trace.txt", (await storage.deployTransaction.wait()).transactionHash);
        await saveDebugTrace("test_debug_trace.txt", tx.transactionHash);
    }

    const buildInfo = await hre.artifacts.getBuildInfo("contracts/Storage.sol:Storage");
    if (!buildInfo) {
        throw new Error("couldn't find build info");
    }
    const output = buildInfo.output.contracts["contracts/Storage.sol"]["Storage"];

    const compilerOutput = {
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
    };

    let result = profile(
        JSON.parse(fs.readFileSync("deploy_debug_trace.txt").toString()),
        true,
        compilerOutput,
        buildInfo.input);

    fs.writeFileSync("deploy_profile_sources.txt", sourcesProfileToString(result.sources));
    fs.writeFileSync("deploy_profile_instructions.txt", instructionsProfileToString(result.instructions));

    result = profile(
        JSON.parse(fs.readFileSync("test_debug_trace.txt").toString()),
        false,
        compilerOutput,
        buildInfo.input);

    fs.writeFileSync("test_profile_sources.txt", sourcesProfileToString(result.sources));
    fs.writeFileSync("test_profile_instructions.txt", instructionsProfileToString(result.instructions));
}

async function saveDebugTrace(filePath: string, txHash: string) {
    const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
        [txHash, {
            "disableStack": true,
            "disableMemory": true,
            "disableStorage": true
        }]);
    fs.writeFileSync(filePath, JSON.stringify(debugTrace, null, 4));
}

main().catch(e => console.error(e));
