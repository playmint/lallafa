//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract Storage {
    uint256 _value;

    function setValue(uint256 value) public {
        _value = value;
    }
}
