import hre from "hardhat";
import { TestProxy__factory, TestProxyImplementation__factory } from "../typechain-types";
import fs from "fs";
import { profile, sourcesProfileToString, instructionsProfileToString, ContractInfoMap } from "../../src";


async function main() {
    const implFactory = new TestProxyImplementation__factory((await hre.ethers.getSigners())[0]);
    const impl = await implFactory.deploy();

    const proxyFactory = new TestProxy__factory((await hre.ethers.getSigners())[0]);
    const proxy = await proxyFactory.deploy(impl.address, impl.interface.encodeFunctionData("init", [100]));

    const proxyImpl = implFactory.attach(proxy.address);

    const tx = await (await proxyImpl.setValue(42)).wait();

    const proxyBuildInfo = await hre.artifacts.getBuildInfo("contracts/Proxy.sol:TestProxy");
    const implBuildInfo = await hre.artifacts.getBuildInfo("contracts/ProxyImplementation.sol:TestProxyImplementation");
    if (!proxyBuildInfo || !implBuildInfo) {
        throw new Error("couldn't find build info");
    }

    const contracts: ContractInfoMap = {}
    contracts[proxy.address] = {
        input: proxyBuildInfo.input,
        output: proxyBuildInfo.output,
        sourceName: "contracts/Proxy.sol",
        contractName: "TestProxy"
    };
    contracts[impl.address] = {
        input: implBuildInfo.input,
        output: implBuildInfo.output,
        sourceName: "contracts/ProxyImplementation.sol",
        contractName: "TestProxyImplementation"
    };

    if (!fs.existsSync("output")) {
        fs.mkdirSync("output");
    }

    {
        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [(await proxy.deployTransaction.wait()).transactionHash, {
                "disableStack": false,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            true, // isDeployment
            proxy.address,
            contracts);

        fs.writeFileSync("output/proxy_deploy_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/proxy_deploy_instructions_profile.txt", instructionsProfileToString(result));
    }

    {
        const debugTrace = await hre.ethers.provider.send("debug_traceTransaction",
            [tx.transactionHash, {
                "disableStack": false,
                "disableMemory": true,
                "disableStorage": true
            }]);

        const result = profile(
            debugTrace,
            false, // isDeployment
            proxy.address,
            contracts);

        if (!fs.existsSync("output")) {
            fs.mkdirSync("output");
        }
        fs.writeFileSync("output/proxy_setValue_sources_profile.txt", sourcesProfileToString(result));
        fs.writeFileSync("output/proxy_setValue_instruction_profile.txt", instructionsProfileToString(result));
    }
}

main().catch(e => console.error(e));