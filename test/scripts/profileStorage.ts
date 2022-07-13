import hre from "hardhat";
import { Storage__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString, ContractInfoMap } from "../../src";


async function main() {
    const storageFactory = new Storage__factory((await hre.ethers.getSigners())[0]);
    const storage = await storageFactory.deploy();
    const tx = await (await storage.setValue(42)).wait();

    const buildInfo = await hre.artifacts.getBuildInfo("contracts/Storage.sol:Storage");
    if (!buildInfo) {
        throw new Error("couldn't find build info");
    }
    const output = buildInfo.output.contracts["contracts/Storage.sol"]["Storage"];

    const contracts: ContractInfoMap = {}
    contracts[storage.address] = {
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

    {
        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [(await storage.deployTransaction.wait()).transactionHash, {
                "disableStack": true,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            true, // isDeployment
            storage.address,
            contracts);

        fs.writeFileSync("output/storage_deploy_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/storage_deploy_instructions_profile.txt", instructionsProfileToString(result));
    }

    {
        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [tx.transactionHash, {
                "disableStack": true,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            false, // isDeployment
            storage.address,
            contracts);

        if (!fs.existsSync("output")) {
            fs.mkdirSync("output");
        }
        fs.writeFileSync("output/storage_setValue_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/storage_setValue_instruction_profile.txt", instructionsProfileToString(result));
    }
}

main().catch(e => console.error(e));