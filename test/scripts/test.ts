import hre from "hardhat";
import { CallTestA__factory, CallTestB__factory, Storage__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString } from "../../src";


async function main() {
    {
        if (!fs.existsSync("storage_test_debug_trace.txt") ||
            !fs.existsSync("storage_deploy_debug_trace.txt")) {
            const storageFactory = new Storage__factory((await hre.ethers.getSigners())[0]);
            const storage = await storageFactory.deploy();
            const tx = await (await storage.test(42)).wait();

            await saveDebugTrace("storage_deploy_debug_trace.txt", (await storage.deployTransaction.wait()).transactionHash);
            await saveDebugTrace("storage_test_debug_trace.txt", tx.transactionHash);
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
            JSON.parse(fs.readFileSync("storage_deploy_debug_trace.txt").toString()),
            true,
            compilerOutput,
            buildInfo.input);

        fs.writeFileSync("storage_deploy_profile_sources.txt", sourcesProfileToString(result.sources));
        fs.writeFileSync("storage_deploy_profile_instructions.txt", instructionsProfileToString(result.instructions));

        result = profile(
            JSON.parse(fs.readFileSync("storage_test_debug_trace.txt").toString()),
            false,
            compilerOutput,
            buildInfo.input);

        fs.writeFileSync("storage_test_profile_sources.txt", sourcesProfileToString(result.sources));
        fs.writeFileSync("storage_test_profile_instructions.txt", instructionsProfileToString(result.instructions));
    }
    {
        if (!fs.existsSync("calltest_simple_test_debug_trace.txt") ||
            !fs.existsSync("calltest_complex_debug_trace.txt")) {
            const callTestAFactory = new CallTestA__factory((await hre.ethers.getSigners())[0]);
            const callTestBFactory = new CallTestB__factory((await hre.ethers.getSigners())[0]);
            const a = await callTestAFactory.deploy();
            const b = await callTestBFactory.deploy();

            await (await a.setB(b.address)).wait();
            await (await b.setA(a.address)).wait();

            const simpleTx = await (await a.simple(42)).wait();
            const complexTx = await (await a.complex(42)).wait();

            await saveDebugTrace("calltest_simple_test_debug_trace.txt", simpleTx.transactionHash);
            await saveDebugTrace("calltest_complex_debug_trace.txt", complexTx.transactionHash);
        }
    }
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
