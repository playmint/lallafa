//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./CallTestB.sol";

contract CallTestA {
    CallTestB public _b;
    uint256 _value;

    function setB(CallTestB b) external {
        _b = b;
    }

    function simple(uint256 value) external {
        _b.simple(value);
    }

    function complex(uint256 value) external {
        _b.complex(value);
    }

    function complex2(uint256 value) external {
        _value = value;
    }
}
