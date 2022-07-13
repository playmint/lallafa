//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./CallTestA.sol";

contract CallTestB {
    CallTestA public _a;
    uint256 _value;

    function setA(CallTestA a) external {
        _a = a;
    }

    function simple(uint256 value) public {
        _value = value;
    }

    function complex(uint256 value) public {
        _a.complex2(value);
    }
}
