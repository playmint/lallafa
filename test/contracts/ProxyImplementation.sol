// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/ERC1967/ERC1967UpgradeUpgradeable.sol";

contract TestProxyImplementation is ERC1967UpgradeUpgradeable {
    uint256 _value;

    function init(uint256 value) public initializer {
        __ERC1967Upgrade_init();
        setValue(value);
    }

    function setValue(uint256 value) public {
        _value = value;
    }

    function upgradeTo(address newImplementation) external {
        _upgradeTo(newImplementation);
    }
}
