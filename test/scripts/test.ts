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

    let biggestGasNumber = 0;
    for (const sourceId in result.sources) {
        for (const line of result.sources[sourceId].lines) {
            biggestGasNumber = Math.max(biggestGasNumber, line.gas);
        }
    }
    const gasDigits = Math.floor(Math.log10(biggestGasNumber)) + 1;

    let outFile = "";
    for (const sourceId in result.sources) {
        outFile += `// ${result.sources[sourceId].name}\n\n`;
        for (const line of result.sources[sourceId].lines) {
            outFile += `${line.gas.toString().padStart(gasDigits, "0")}\t${line.text}\n`;
        }
    }

    fs.writeFileSync("out.txt", outFile);
}

main().catch(e => console.error(e));
