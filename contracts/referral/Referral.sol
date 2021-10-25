// SPDX-License-Identifier: GPL-3.0

pragma solidity =0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IReferral.sol";

contract Referral is IReferral, ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Account {
        address referrer;
        uint256 referredCount;
        uint256 reward;
        uint256 activeTime;
    }

    event Activate(address referee, address referrer);
    event ClaimReward(address accountAddress, uint256 reward);
    event UpdateReferralReward(address referee, address referrer, uint256 reward);

    address public masterChef;
    IERC20 public token;
    mapping(address => Account) public accounts;

    bytes32 public immutable DOMAIN_SEPARATOR;
    // keccak256("Activate(address referee,address referrer)")
    bytes32 public constant ACTIVATE_TYPEHASH =
        0x4b1fc20d2fd2102f86b90df2c22a6641f5ef4f7fd96d33e36ab9bd6fbad1cf30;

    constructor(address _tokenAddress, address _masterChef) public {
        token = IERC20(_tokenAddress);
        masterChef = _masterChef;

        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Referral"),
                keccak256("1"),
                chainId,
                address(this)
            )
        );
    }

    modifier onlyMasterChef() {
        require(msg.sender == masterChef, "only masterChef");
        _;
    }

    function updateMasterChef(address _masterChef) public override onlyOwner {
        require(_masterChef != address(0), "invalid _masterChef");

        masterChef = _masterChef;
    }

    function activate(address referrer) external override {
        _activate(msg.sender, referrer);
    }

    function activateBySign(address referee, address referrer, uint8 v, bytes32 r, bytes32 s) external override {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(ACTIVATE_TYPEHASH, referee, referrer))
            )
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer == referee, "invalid signature");

        _activate(referee, referrer);
    }

    function _activate(address referee, address referrer) internal {
        require(referee != address(0), "invalid referee");
        require(referee != referrer, "referee = referrer");
        require(accounts[referee].activeTime == 0, "referee account have been activated");
        if (referrer != address(0)) {
            require(
                accounts[referrer].activeTime > 0,
                "referrer account is not activated"
            );
        }

        accounts[referee].referrer = referrer;
        accounts[referee].activeTime = block.timestamp;
        if (referrer != address(0)) {
            accounts[referrer].referredCount = accounts[referrer]
                .referredCount
                .add(1);
        }

        emit Activate(referee, referrer);
    }

    function isActivated(address _address) public override view returns (bool) {
        return accounts[_address].activeTime > 0;
    }

    function updateReferralReward(address accountAddress, uint256 reward) external override onlyMasterChef {
        if (accounts[accountAddress].referrer != address(0)) {
            Account storage referrerAccount = accounts[accounts[accountAddress].referrer];
            referrerAccount.reward = referrerAccount.reward.add(reward);

            emit UpdateReferralReward(accountAddress, accounts[accountAddress].referrer, reward);
        }
    }

    function claimReward() external override nonReentrant {
        require(accounts[msg.sender].activeTime > 0, "account is not activated");
        require(accounts[msg.sender].reward > 0, "reward amount = 0");

        Account storage account = accounts[msg.sender];
        uint256 reward = account.reward;
        account.reward = 0;
        token.safeTransfer(address(msg.sender), reward);

        emit ClaimReward(msg.sender, reward);
    }
}
