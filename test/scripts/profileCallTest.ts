import hre from "hardhat";
import { CallTestA__factory, CallTestB__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString, ContractInfoMap } from "../../src";


async function main() {
    const callTestAFactory = new CallTestA__factory((await hre.ethers.getSigners())[0]);
    const callTestBFactory = new CallTestB__factory((await hre.ethers.getSigners())[0]);
    const a = await callTestAFactory.deploy();
    const b = await callTestBFactory.deploy();

    await (await a.setB(b.address)).wait();
    await (await b.setA(a.address)).wait();

    const buildInfoA = await hre.artifacts.getBuildInfo("contracts/CallTestA.sol:CallTestA");
    const buildInfoB = await hre.artifacts.getBuildInfo("contracts/CallTestB.sol:CallTestB");
    if (!buildInfoA || !buildInfoB) {
        throw new Error("couldn't find build info for CallTest");
    }
    const outputA = buildInfoA.output.contracts["contracts/CallTestA.sol"]["CallTestA"];
    const outputB = buildInfoB.output.contracts["contracts/CallTestB.sol"]["CallTestB"];

    const contractInfo: ContractInfoMap = {};
    contractInfo[a.address] = {
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
    contractInfo[b.address] = {
        output: {
            bytecode: {
                bytecode: outputB.evm.bytecode.object,
                sourceMap: outputB.evm.bytecode.sourceMap,
                generatedSources: (outputB.evm.bytecode as any).generatedSources || []
            },
            deployedBytecode: {
                bytecode: outputB.evm.deployedBytecode.object,
                sourceMap: outputB.evm.deployedBytecode.sourceMap,
                generatedSources: (outputB.evm.deployedBytecode as any).generatedSources || []
            },
            sources: buildInfoB.output.sources
        },
        input: buildInfoB.input
    };

    if (!fs.existsSync("output")) {
        fs.mkdirSync("output");
    }

    {
        const tx = await (await a.simple(42)).wait();

        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [tx.transactionHash, {
                "disableStack": false,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            false, // isDeployment
            a.address,
            contractInfo);

        fs.writeFileSync("output/calltest_simple_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/calltest_simple_instructions_profile.txt", instructionsProfileToString(result));
    }

    {
        const tx = await (await a.complex(42)).wait();

        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [tx.transactionHash, {
                "disableStack": false,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            false, // isDeployment
            a.address,
            contractInfo);

        fs.writeFileSync("output/calltest_complex_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/calltest_complex_instructions_profile.txt", instructionsProfileToString(result));
    }
}

main().catch(e => console.error(e));
