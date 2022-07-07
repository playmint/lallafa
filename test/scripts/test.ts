import hre from "hardhat";
import { CallTestA__factory, CallTestB__factory, Storage__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString, ContractInfoMap } from "../../src";


async function main() {
    {
        if (!fs.existsSync("storage_test_debug_trace.txt") ||
            !fs.existsSync("storage_deploy_debug_trace.txt")) {
            const storageFactory = new Storage__factory((await hre.ethers.getSigners())[0]);
            const storage = await storageFactory.deploy();
            const tx = await (await storage.test(42)).wait();

            await saveDebugTrace("storage_deploy_debug_trace.txt", (await storage.deployTransaction.wait()).transactionHash, { storage: storage.address });
            await saveDebugTrace("storage_test_debug_trace.txt", tx.transactionHash, { storage: storage.address });
        }

        const contractAddresses = JSON.parse(fs.readFileSync("storage_deploy_debug_trace.txt").toString()).contractAddresses;

        const buildInfo = await hre.artifacts.getBuildInfo("contracts/Storage.sol:Storage");
        if (!buildInfo) {
            throw new Error("couldn't find build info");
        }
        const output = buildInfo.output.contracts["contracts/Storage.sol"]["Storage"];

        const contracts: ContractInfoMap = {}
        contracts[contractAddresses.storage] = {
            output: {
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
            input: buildInfo.input
        };

        let result = profile(
            JSON.parse(fs.readFileSync("storage_deploy_debug_trace.txt").toString()).trace,
            true,
            contractAddresses.storage,
            contracts);

        fs.writeFileSync("storage_deploy_profile_sources.txt", sourcesProfileToString(result));
        fs.writeFileSync("storage_deploy_profile_instructions.txt", instructionsProfileToString(result));

        result = profile(
            JSON.parse(fs.readFileSync("storage_test_debug_trace.txt").toString()).trace,
            false,
            contractAddresses.storage,
            contracts);

        fs.writeFileSync("storage_test_profile_sources.txt", sourcesProfileToString(result));
        fs.writeFileSync("storage_test_profile_instructions.txt", instructionsProfileToString(result));
    }
    {
        if (!fs.existsSync("calltest_simple_debug_trace.txt") ||
            !fs.existsSync("calltest_complex_debug_trace.txt")) {
            const callTestAFactory = new CallTestA__factory((await hre.ethers.getSigners())[0]);
            const callTestBFactory = new CallTestB__factory((await hre.ethers.getSigners())[0]);
            const a = await callTestAFactory.deploy();
            const b = await callTestBFactory.deploy();

            await (await a.setB(b.address)).wait();
            await (await b.setA(a.address)).wait();

            const simpleTx = await (await a.simple(42)).wait();
            const complexTx = await (await a.complex(42)).wait();

            await saveDebugTrace("calltest_simple_debug_trace.txt", simpleTx.transactionHash, { a: a.address, b: b.address }, false);
            await saveDebugTrace("calltest_complex_debug_trace.txt", complexTx.transactionHash, { a: a.address, b: b.address }, false);
        }

        const contractAddresses = JSON.parse(fs.readFileSync("calltest_simple_debug_trace.txt").toString()).contractAddresses;

        const buildInfoA = await hre.artifacts.getBuildInfo("contracts/CallTest.sol:CallTestA");
        if (!buildInfoA) {
            throw new Error("couldn't find build info for CallTestA");
        }
        const outputA = buildInfoA.output.contracts["contracts/CallTest.sol"]["CallTestA"];

        const contractInfo: ContractInfoMap = {};
        contractInfo[contractAddresses.a] = {
            output: {
                bytecode: {
                    bytecode: outputA.evm.bytecode.object,
                    sourceMap: outputA.evm.bytecode.sourceMap,
                    generatedSources: (outputA.evm.bytecode as any).generatedSources || []
                },
                deployedBytecode: {
                    bytecode: outputA.evm.deployedBytecode.object,
                    sourceMap: outputA.evm.deployedBytecode.sourceMap,
                    generatedSources: (outputA.evm.deployedBytecode as any).generatedSources || []
                },
                sources: buildInfoA.output.sources
            },
            input: buildInfoA.input
        };

        let result = profile(
            JSON.parse(fs.readFileSync("calltest_simple_debug_trace.txt").toString()).trace,
            false,
            contractAddresses.a,
            contractInfo);

        fs.writeFileSync("calltest_simple_profile_sources.txt", sourcesProfileToString(result));
        fs.writeFileSync("calltest_simple_profile_instructions.txt", instructionsProfileToString(result));

        result = profile(
            JSON.parse(fs.readFileSync("calltest_complex_debug_trace.txt").toString()).trace,
            false,
            contractAddresses.a,
            contractInfo);

        fs.writeFileSync("calltest_complex_profile_sources.txt", sourcesProfileToString(result));
        fs.writeFileSync("calltest_complex_profile_instructions.txt", instructionsProfileToString(result));
    }
}

async function saveDebugTrace(filePath: string, txHash: string, contractAddresses: { [name: string]: string }, disableStack = true) {
    const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
        [txHash, {
            "disableStack": disableStack,
            "disableMemory": true,
            "disableStorage": true
        }]);
    fs.writeFileSync(filePath, JSON.stringify({ trace: debugTrace, contractAddresses: contractAddresses }, null, 4));
}

main().catch(e => console.error(e));
