import { ethers, waffle } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  Stake,
  Stake__factory,
  WING,
  WING__factory,
  MasterChef,
  MasterChef__factory,
  MockStakeTokenCallerContract,
  SimpleToken,
  SimpleToken__factory,
} from "../../typechain";
import { assertAlmostEqual } from "../helpers/assert";
import { advanceBlock, advanceBlockTo, latestBlockNumber } from "../helpers/time";
import { masterChefUnitTestFixture } from "../helpers/fixtures/MasterChef";
import exp from "constants";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";
import { parseEther } from "ethers/lib/utils";

chai.use(solidity);
const { expect } = chai;

describe("MasterChef", () => {
  let WING_START_BLOCK: number;
  let WING_PER_BLOCK: BigNumber;
  let WING_BONUS_LOCK_UP_BPS: number;

  // Contract as Signer
  let wingAsAlice: WING;
  let wingAsBob: WING;
  let wingAsDev: WING;

  let stoken0AsDeployer: SimpleToken;
  let stoken0AsAlice: SimpleToken;
  let stoken0AsBob: SimpleToken;
  let stoken0AsDev: SimpleToken;

  let stoken1AsDeployer: SimpleToken;
  let stoken1AsAlice: SimpleToken;
  let stoken1AsBob: SimpleToken;
  let stoken1AsDev: SimpleToken;

  let masterChefAsDeployer: MasterChef;
  let masterChefAsAlice: MasterChef;
  let masterChefAsBob: MasterChef;
  let masterChefAsDev: MasterChef;

  let mockStakeTokenCaller: MockStakeTokenCallerContract;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  let wingToken: WING;
  let stake: Stake;
  let masterChef: MasterChef;
  let stakingTokens: SimpleToken[];

  beforeEach(async () => {
    ({
      wingToken,
      stake,
      masterChef,
      stakingTokens,
      WING_START_BLOCK,
      WING_PER_BLOCK,
      WING_BONUS_LOCK_UP_BPS,
      mockStakeTokenCaller,
    } = await waffle.loadFixture(masterChefUnitTestFixture));
    [deployer, alice, bob, dev] = await ethers.getSigners();

    wingAsAlice = WING__factory.connect(wingToken.address, alice);
    wingAsBob = WING__factory.connect(wingToken.address, bob);
    wingAsDev = WING__factory.connect(wingToken.address, dev);

    stoken0AsDeployer = SimpleToken__factory.connect(stakingTokens[0].address, deployer);
    stoken0AsAlice = SimpleToken__factory.connect(stakingTokens[0].address, alice);
    stoken0AsBob = SimpleToken__factory.connect(stakingTokens[0].address, bob);
    stoken0AsDev = SimpleToken__factory.connect(stakingTokens[0].address, dev);

    stoken1AsDeployer = SimpleToken__factory.connect(stakingTokens[1].address, deployer);
    stoken1AsAlice = SimpleToken__factory.connect(stakingTokens[1].address, alice);
    stoken1AsBob = SimpleToken__factory.connect(stakingTokens[1].address, bob);
    stoken1AsDev = SimpleToken__factory.connect(stakingTokens[1].address, dev);

    masterChefAsDeployer = MasterChef__factory.connect(masterChef.address, deployer);
    masterChefAsAlice = MasterChef__factory.connect(masterChef.address, alice);
    masterChefAsBob = MasterChef__factory.connect(masterChef.address, bob);
    masterChefAsDev = MasterChef__factory.connect(masterChef.address, dev);
  });

  describe("#setpool()", () => {
    context("when adding a new pool", () => {
      it("should add new pool and update pool having a bps alloc point", async () => {
        /// poolAlloc -> alloc point for each of new pools
        const poolAlloc = 1000;
        /// totalAllco point started with 1000 due to WING->WING start with 1000 alloc point
        for (let i = 0; i < stakingTokens.length; i++) {
          await masterChef.addPool(stakingTokens[i].address, poolAlloc);

          const totalAlloc = await masterChef.totalAllocPoint();
          const [wingAllocPoint] = await masterChef.poolInfo(wingToken.address);
          const [stokenAllocPoint, stokenLastRewardBlock] = await masterChef.poolInfo(stakingTokens[i].address);

          expect(await masterChef.poolLength()).to.eq(i + 2);
          assertAlmostEqual(wingAllocPoint.div(totalAlloc).toString(), BigNumber.from(1000).div(8000).toString());
          expect(stokenAllocPoint).to.be.eq(1000);
          expect(stokenLastRewardBlock).to.be.eq(stokenLastRewardBlock);
        }
      });
    });

    context("when the stakeToken is already added to the pool", () => {
      it("should revert", async () => {
        /// poolAlloc -> alloc point for each of new pools
        const poolAlloc = 1000;
        for (let i = 0; i < stakingTokens.length; i++) {
          await masterChef.addPool(stakingTokens[i].address, poolAlloc);
        }
        expect(await masterChef.poolLength()).to.eq(stakingTokens.length + 1);

        await expect(masterChef.addPool(stakingTokens[0].address, poolAlloc)).to.be.revertedWith(
          "addPool: _stakeToken duplicated"
        );
      });
    });

    context("when the admin try to add address(0)", () => {
      it("should revert", async () => {
        await expect(masterChef.addPool(ethers.constants.AddressZero, 1000)).to.be.revertedWith(
          "addPool: _stakeToken must not be address(0) or address(1)"
        );
      });
    });

    context("when the admin try to add address(1)", () => {
      it("should revert", async () => {
        await expect(masterChef.addPool("0x0000000000000000000000000000000000000001", 1000)).to.be.revertedWith(
          "addPool: _stakeToken must not be address(0) or address(1)"
        );
      });
    });

    context("when the admin try to add duplicated token", () => {
      it("should revert", async () => {
        await expect(masterChef.addPool(wingToken.address, 1000)).to.be.revertedWith(
          "addPool: _stakeToken duplicated"
        );
      });
    });

    context("when admin try to set address(0)", () => {
      it("should revert", async () => {
        await expect(masterChef.setPool(ethers.constants.AddressZero, 1000)).to.be.revertedWith(
          "setPool: _stakeToken must not be address(0) or address(1)"
        );
      });
    });

    context("when admin try to add address(1)", () => {
      it("should revert", async () => {
        await expect(masterChef.setPool("0x0000000000000000000000000000000000000001", 1000)).to.be.revertedWith(
          "setPool: _stakeToken must not be address(0) or address(1)"
        );
      });
    });
  });

  describe("#harvest()", () => {
    context("the caller is not a funder", () => {
      it("should revert", async () => {
        await stakingTokens[0].mint(mockStakeTokenCaller.address, parseEther("100"));
        await masterChef.addPool(stakingTokens[0].address, 1000);
        await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
        await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, mockStakeTokenCaller.address);
        mockStakeTokenCaller.stake(stakingTokens[0].address, ethers.utils.parseEther("100"));
        await expect(
          masterChef["harvest(address,address)"](await deployer.getAddress(), wingToken.address)
        ).to.be.revertedWith("_harvest: only funder");
      });
    });

    context("when harvesting through a stake token caller contract", () => {
      it("should notify a _onBeforeLock", async () => {
        const currentBlock = await latestBlockNumber();
        await stakingTokens[0].mint(mockStakeTokenCaller.address, parseEther("100"));
        await masterChef.addPool(stakingTokens[0].address, 1000);
        await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
        await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, mockStakeTokenCaller.address);
        mockStakeTokenCaller.stake(stakingTokens[0].address, ethers.utils.parseEther("100"));

        await advanceBlockTo(currentBlock.add(10).toNumber());

        await expect(mockStakeTokenCaller.harvest(stakingTokens[0].address)).to.emit(
          mockStakeTokenCaller,
          "OnBeforeLock"
        );
      });
    });
  });

  describe("#setStakeTokenCallerAllowancePool()", () => {
    it("should set an allowance based on an argument", async () => {
      await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
      expect(await masterChef.stakeTokenCallerAllowancePool(stakingTokens[0].address)).to.eq(true);
      await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, false);
      expect(await masterChef.stakeTokenCallerAllowancePool(stakingTokens[0].address)).to.eq(false);
    });
  });

  describe("#addStakeTokenCallerContract", () => {
    context("when the pool does not allow adding a corresponding stake token caller", () => {
      it("should revert", async () => {
        const stakeCallerContract = await alice.getAddress();
        await expect(
          masterChef.addStakeTokenCallerContract(stakingTokens[0].address, stakeCallerContract)
        ).to.be.revertedWith("");
      });
    });

    context("when the pool allowed adding a corresponding stake token caller", () => {
      it("should successfully add a new pool", async () => {
        await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
        await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, await alice.getAddress());
        let callerCount = await masterChef.stakeTokenCallerContracts(stakingTokens[0].address);
        expect(callerCount).to.eq(1);
        await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, await bob.getAddress());
        callerCount = await masterChef.stakeTokenCallerContracts(stakingTokens[0].address);
        expect(callerCount).to.eq(2);
      });
    });
  });

  describe("#deposit()", () => {
    context("when the pool has been assigned as stakeTokenCallerPool through stakeTokenCallerAllowancePool", () => {
      context("when the caller is not a stake token caller contract", () => {
        it("should revert", async () => {
          // pretend that alice is a stake caller contract
          const stakeCallerContract = await alice.getAddress();
          await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
          await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, stakeCallerContract);
          await expect(
            masterChef.deposit(await deployer.getAddress(), stakingTokens[0].address, ethers.utils.parseEther("100"))
          ).to.be.revertedWith("onlyPermittedTokenFunder: caller is not permitted");
        });
      });

      context("when the caller is a stake token caller contract", () => {
        it("should successfully deposit", async () => {
          const stakingToken0AsAlice = SimpleToken__factory.connect(stakingTokens[0].address, alice);
          // pretend that alice is a stake caller contract
          await stakingTokens[0].mint(await alice.getAddress(), parseEther("200"));
          await stakingToken0AsAlice.approve(masterChef.address, parseEther("200"));

          const stakeCallerContract = await alice.getAddress();
          await masterChef.addPool(stakingTokens[0].address, 1000);
          await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
          await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, stakeCallerContract);
          const tx = await masterChefAsAlice.deposit(
            await deployer.getAddress(),
            stakingTokens[0].address,
            ethers.utils.parseEther("100")
          );

          const userInfo = await masterChef.userInfo(stakingTokens[0].address, await deployer.getAddress());
          const poolInfo = await masterChef.poolInfo(stakingTokens[0].address);
          expect(userInfo.amount).to.eq(ethers.utils.parseEther("100"));
          expect(userInfo.fundedBy).to.eq(await alice.getAddress());
          expect(poolInfo.lastRewardBlock).to.eq(tx.blockNumber);
        });
      });

      context("when the caller has been revoked after the first deposit", () => {
        it("should revert", async () => {
          const stakingToken0AsAlice = SimpleToken__factory.connect(stakingTokens[0].address, alice);
          // pretend that alice is a stake caller contract
          await stakingTokens[0].mint(await alice.getAddress(), parseEther("200"));
          await stakingToken0AsAlice.approve(masterChef.address, parseEther("200"));

          const stakeCallerContract = await alice.getAddress();
          await masterChef.addPool(stakingTokens[0].address, 1000);
          await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
          await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, stakeCallerContract);
          await masterChefAsAlice.deposit(
            await deployer.getAddress(),
            stakingTokens[0].address,
            ethers.utils.parseEther("100")
          );

          // when revoke a stakeCallerContract, shouldn't be able to call a deposit
          await masterChef.removeStakeTokenCallerContract(stakingTokens[0].address, stakeCallerContract);
          await expect(
            masterChefAsAlice.deposit(
              await deployer.getAddress(),
              stakingTokens[0].address,
              ethers.utils.parseEther("100")
            )
          ).to.be.revertedWith("onlyPermittedTokenFunder: caller is not permitted");
        });
      });
    });

    context("when the pool hasn't been assigned as stakeTokenCallerPool", () => {
      context("when the caller is not a _for", () => {
        it("should revert", async () => {
          await expect(
            masterChef.deposit(await alice.getAddress(), stakingTokens[0].address, ethers.utils.parseEther("100"))
          ).to.be.revertedWith("onlyPermittedTokenFunder: caller is not permitted");
        });
      });

      context("when the caller is the same as _for", () => {
        it("should successfully deposit", async () => {
          await stakingTokens[0].mint(await deployer.getAddress(), parseEther("200"));
          await stakingTokens[0].approve(masterChef.address, parseEther("200"));

          await masterChef.addPool(stakingTokens[0].address, 1000);
          const tx = await masterChef.deposit(
            await deployer.getAddress(),
            stakingTokens[0].address,
            ethers.utils.parseEther("100")
          );

          const userInfo = await masterChef.userInfo(stakingTokens[0].address, await deployer.getAddress());
          const poolInfo = await masterChef.poolInfo(stakingTokens[0].address);
          expect(userInfo.amount).to.eq(ethers.utils.parseEther("100"));
          expect(userInfo.fundedBy).to.eq(await deployer.getAddress());
          expect(poolInfo.lastRewardBlock).to.eq(tx.blockNumber);
        });
      });
    });
    context("when the pool is not existed", () => {
      it("should revert", async () => {
        await expect(
          masterChef.deposit(await deployer.getAddress(), stakingTokens[0].address, ethers.utils.parseEther("100"))
        ).to.be.revertedWith("deposit: no pool");
      });
    });
  });

  describe("#depositWing()", () => {
    context("when the pool has been assigned as stakeTokenCallerPool through stakeTokenCallerAllowancePool", () => {
      context("when the caller is not a stake token caller contract", () => {
        it("should revert", async () => {
          // pretend that alice is a stake caller contract
          const stakeCallerContract = await alice.getAddress();
          await masterChef.setStakeTokenCallerAllowancePool(wingToken.address, true);
          await masterChef.addStakeTokenCallerContract(wingToken.address, stakeCallerContract);
          await expect(
            masterChef.depositWing(await deployer.getAddress(), ethers.utils.parseEther("100"))
          ).to.be.revertedWith("onlyPermittedTokenFunder: caller is not permitted");
        });
      });

      context("when the caller is a stake token caller contract", () => {
        it("should successfully deposit", async () => {
          const stakingToken0AsAlice = SimpleToken__factory.connect(wingToken.address, alice);
          // pretend that alice is a stake caller contract
          await wingToken.transfer(await alice.getAddress(), parseEther("200"));
          await stakingToken0AsAlice.approve(masterChef.address, parseEther("200"));

          const stakeCallerContract = await alice.getAddress();
          await masterChef.setStakeTokenCallerAllowancePool(wingToken.address, true);
          await masterChef.addStakeTokenCallerContract(wingToken.address, stakeCallerContract);
          const tx = await masterChefAsAlice.depositWing(
            await deployer.getAddress(),
            ethers.utils.parseEther("100")
          );

          const userInfo = await masterChef.userInfo(wingToken.address, await deployer.getAddress());
          const poolInfo = await masterChef.poolInfo(wingToken.address);
          expect(userInfo.amount).to.eq(ethers.utils.parseEther("100"));
          expect(userInfo.fundedBy).to.eq(await alice.getAddress());
          expect(poolInfo.lastRewardBlock).to.eq(tx.blockNumber);
        });
      });

      context("when the caller has been revoked after the first deposit", () => {
        it("should revert", async () => {
          const wingTokenAsAlice = WING__factory.connect(wingToken.address, alice);
          // pretend that alice is a stake caller contract
          await wingToken.transfer(await alice.getAddress(), parseEther("200"));
          await wingTokenAsAlice.approve(masterChef.address, parseEther("200"));

          const stakeCallerContract = await alice.getAddress();
          await masterChef.setStakeTokenCallerAllowancePool(wingToken.address, true);
          await masterChef.addStakeTokenCallerContract(wingToken.address, stakeCallerContract);
          await masterChefAsAlice.depositWing(await deployer.getAddress(), ethers.utils.parseEther("100"));

          // when revoke a stakeCallerContract, shouldn't be able to call a deposit
          await masterChef.removeStakeTokenCallerContract(wingToken.address, stakeCallerContract);
          await expect(
            masterChefAsAlice.depositWing(await deployer.getAddress(), ethers.utils.parseEther("100"))
          ).to.be.revertedWith("onlyPermittedTokenFunder: caller is not permitted");
        });
      });
    });

    context("when the pool hasn't been assigned as stakeTokenCallerPool", () => {
      context("when the caller is not a _for", () => {
        it("should revert", async () => {
          await expect(
            masterChef.depositWing(await alice.getAddress(), ethers.utils.parseEther("100"))
          ).to.be.revertedWith("onlyPermittedTokenFunder: caller is not permitted");
        });
      });

      context("when the caller is the same as _for", () => {
        it("should successfully deposit", async () => {
          await wingToken.approve(masterChef.address, parseEther("200"));

          const tx = await masterChef.depositWing(await deployer.getAddress(), ethers.utils.parseEther("100"));

          const userInfo = await masterChef.userInfo(wingToken.address, await deployer.getAddress());
          const poolInfo = await masterChef.poolInfo(wingToken.address);
          expect(userInfo.amount).to.eq(ethers.utils.parseEther("100"));
          expect(userInfo.fundedBy).to.eq(await deployer.getAddress());
          expect(poolInfo.lastRewardBlock).to.eq(tx.blockNumber);
        });
      });
    });
  });

  describe("#emergencyWithdraw", () => {
    it("should return a stake token to _for rather than msg sender", async () => {
      const stakingToken0AsAlice = SimpleToken__factory.connect(stakingTokens[0].address, alice);
      // pretend that alice is a stake caller contract
      await stakingTokens[0].mint(await alice.getAddress(), parseEther("200"));
      await stakingToken0AsAlice.approve(masterChef.address, parseEther("200"));

      const stakeCallerContract = await alice.getAddress();
      await masterChef.addPool(stakingTokens[0].address, 1000);
      await masterChef.setStakeTokenCallerAllowancePool(stakingTokens[0].address, true);
      await masterChef.addStakeTokenCallerContract(stakingTokens[0].address, stakeCallerContract);
      await masterChefAsAlice.deposit(
        await deployer.getAddress(),
        stakingTokens[0].address,
        ethers.utils.parseEther("100")
      );
      await masterChefAsAlice.emergencyWithdraw(await deployer.getAddress(), stakingTokens[0].address);
      expect(await stakingTokens[0].balanceOf(await deployer.getAddress())).to.eq(ethers.utils.parseEther("100"));
      expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("100"));
    });
  });
});
