import { ethers, waffle } from "hardhat";
import { Overrides, BigNumberish, utils, BigNumber, Signer, constants } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  Stake,
  Stake__factory,
  ShipBooster,
  ShipBoosterConfig,
  ShipBooster__factory,
  WING,
  WING__factory,
  MasterChef,
  MasterChef__factory,
  MockStakeTokenCallerContract,
  MockWBNB,
  SimpleToken,
  SimpleToken__factory,
  WNativeRelayer,
} from "../../typechain";
import { assertAlmostEqual } from "../helpers/assert";
import { advanceBlock, advanceBlockTo, latestBlockNumber } from "../helpers/time";
import exp from "constants";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { shipboosterUnitTestFixture } from "../helpers";
import { ModifiableContract } from "@eth-optimism/smock";
import { MockERC721 } from "../../typechain/MockERC721";
import { MockERC721__factory } from "../../typechain/factories/MockERC721__factory";
import { AddressZero, MaxUint256, Zero } from "@ethersproject/constants";
import { Address } from "ethereumjs-util";
import { logData } from "../helpers/logData";

chai.use(solidity);
const { expect } = chai;

describe("ShipBooster", () => {
  let WING_START_BLOCK: number;
  let WING_PER_BLOCK: BigNumber;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  // Lambdas
  let signatureFn: (signer: Signer, msg?: string) => Promise<string>;

  // Contracts
  let wingToken: WING;
  let masterChef: ModifiableContract;
  let shipboosterConfig: ModifiableContract;
  let nftToken: ModifiableContract;
  let stakingTokens: SimpleToken[];
  let shipbooster: ShipBooster;
  let stake: Stake;
  let wbnb: MockWBNB;
  let wingswapNft: ModifiableContract;

  // Bindings
  let shipboosterAsAlice: ShipBooster;
  let nftTokenAsAlice: MockERC721;
  let signatureAsDeployer: string;
  let signatureAsAlice: string;

  beforeEach(async () => {
    ({
      shipbooster,
      masterChef,
      shipboosterConfig,
      stakingTokens,
      wingToken,
      nftToken,
      stake,
      signatureFn,
      wbnb,
      wingswapNft,
    } = await waffle.loadFixture(shipboosterUnitTestFixture));
    [deployer, alice, bob, dev] = await ethers.getSigners();

    shipboosterAsAlice = ShipBooster__factory.connect(shipbooster.address, alice) as ShipBooster;
    nftTokenAsAlice = MockERC721__factory.connect(nftToken.address, alice) as MockERC721;

    signatureAsDeployer = await signatureFn(deployer);
    signatureAsAlice = await signatureFn(alice);
  });

  describe("#stakeNFT()", () => {
    context("when stake token is not allowed in the config", () => {
      it("should revert", async () => {
        // set stake token allowance to be true
        await shipboosterConfig.smodify.put({
          stakeTokenAllowance: {
            [stakingTokens[0].address]: false,
          },
        });
        await expect(shipbooster.stakeNFT(stakingTokens[0].address, nftToken.address, 1)).to.be.revertedWith(
          "ShipBooster::isStakeTokenOK::bad stake token"
        );
      });
    });

    context("when nft is not allowed in the config", () => {
      it("should revert", async () => {
        await wingswapNft.smodify.put({
          wingswapNFTToCategory: {
            1: 0,
          },
        });
        // set stake token allowance to be true
        await shipboosterConfig.smodify.put({
          stakeTokenAllowance: {
            [stakingTokens[0].address]: true,
          },
        });
        // set shipbooster nft allowance to be false / revert case
        await shipboosterConfig.smodify.put({
          shipboosterNftAllowanceConfig: {
            [stakingTokens[0].address]: {
              [wingswapNft.address]: {
                1: false,
              },
            },
          },
        });

        await expect(shipbooster.stakeNFT(stakingTokens[0].address, wingswapNft.address, 1)).to.be.revertedWith(
          "ShipBooster::isShipBoosterNftOK::bad nft"
        );
      });
    });

    context("when stake token and nft are allowed", () => {
      context("when nft to stake is identical to the one that already staked", () => {
        context("on the same stakeToken", () => {
          it("should revert", async () => {
            const deployerAddr = await deployer.getAddress();

            // mint and approve nft
            await (nftToken as unknown as MockERC721).mint(deployerAddr, 1);
            await (nftToken as unknown as MockERC721).approve(shipbooster.address, 1);

            // set stake token allowance to be true
            await shipboosterConfig.smodify.put({
              stakeTokenAllowance: {
                [stakingTokens[0].address]: true,
              },
            });
            // set shipbooster nft allowance to be false / revert case
            await shipboosterConfig.smodify.put({
              shipboosterNftAllowanceConfig: {
                [stakingTokens[0].address]: {
                  [nftToken.address]: {
                    1: true,
                  },
                },
              },
            });
            await shipbooster.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
            // owner of a shipbooster contract should be changed
            expect(await (nftToken as unknown as MockERC721).ownerOf(1)).to.eq(shipbooster.address);
            await expect(shipbooster.stakeNFT(stakingTokens[0].address, nftToken.address, 1)).to.be.revertedWith(
              "ShipBooster::stakeNFT:: nft already staked"
            );
          });
        });

        context("when nft to stake has been staked in another pool", () => {
          it("should revert", async () => {
            const deployerAddr = await deployer.getAddress();

            // mint and approve nft
            await (nftToken as unknown as MockERC721).mint(deployerAddr, 1);
            await (nftToken as unknown as MockERC721).approve(shipbooster.address, 1);

            // set stake token allowance to be true
            await shipboosterConfig.smodify.put({
              stakeTokenAllowance: {
                [stakingTokens[0].address]: true,
                [stakingTokens[1].address]: true,
              },
            });
            // set shipbooster nft allowance to be false / revert case
            await shipboosterConfig.smodify.put({
              shipboosterNftAllowanceConfig: {
                [stakingTokens[0].address]: {
                  [nftToken.address]: {
                    1: true,
                  },
                },
                [stakingTokens[1].address]: {
                  [nftToken.address]: {
                    1: true,
                  },
                },
              },
            });
            await shipbooster.stakeNFT(stakingTokens[1].address, nftToken.address, 1);
            // owner of a shipbooster contract should be changed
            expect(await (nftToken as unknown as MockERC721).ownerOf(1)).to.eq(shipbooster.address);
            await expect(shipbooster.stakeNFT(stakingTokens[0].address, nftToken.address, 1)).to.be.revertedWith(
              "ERC721: transfer of token that is not own"
            );
          });
        });
      });

      context("when there is no reward to harvest", () => {
        it("should successfully stake nft", async () => {
          const deployerAddr = await deployer.getAddress();

          // mint and approve nft
          await (nftToken as unknown as MockERC721).mint(deployerAddr, 1);
          await (nftToken as unknown as MockERC721).approve(shipbooster.address, 1);

          // set stake token allowance to be true
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [stakingTokens[0].address]: true,
            },
          });
          // set shipbooster nft allowance to be false / revert case
          await shipboosterConfig.smodify.put({
            shipboosterNftAllowanceConfig: {
              [stakingTokens[0].address]: {
                [nftToken.address]: {
                  1: true,
                },
              },
            },
          });
          await shipbooster.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
          // owner of a shipbooster contract should be changed
          expect(await (nftToken as unknown as MockERC721).ownerOf(1)).to.eq(shipbooster.address);
          // should expect some storage changes in a shipbooster
          expect(
            (await shipbooster.userStakingNFT(stakingTokens[0].address, deployerAddr)).nftAddress.toLowerCase()
          ).to.eq(nftToken.address.toLowerCase());
          expect((await shipbooster.userStakingNFT(stakingTokens[0].address, deployerAddr)).nftTokenId).to.eq(1);
        });
      });

      context("when there is a reward to harvest", () => {
        context("with some energy", () => {
          it("should successfully claim a reward along with staking an nft with extra energy minted", async () => {
            // mock master chef reward for stakingToken[0]
            const ownerAddress = await alice.getAddress();
            const snapshotBlock = await latestBlockNumber();

            // mint and approve nft
            await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
            await nftTokenAsAlice.approve(shipbooster.address, 1);
            await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
            await nftTokenAsAlice.approve(shipbooster.address, 2);

            // MOCK a shipbooster config storage
            await shipboosterConfig.smodify.put({
              stakeTokenAllowance: {
                [stakingTokens[0].address]: true,
              },
              shipboosterNftAllowanceConfig: {
                [stakingTokens[0].address]: {
                  [nftToken.address]: {
                    1: true,
                    2: true,
                  },
                },
              },
              shipboosterEnergyInfo: {
                [nftToken.address]: {
                  1: {
                    currentEnergy: parseEther("10").toString(),
                    boostBps: "1000",
                    updatedAt: 1,
                  },
                },
              },
              callerAllowance: {
                [shipbooster.address]: true,
              },
            });
            // stake for the first time, its' energy will be used to amplify
            await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
            // should expect some storage changes in a shipbooster
            expect(
              (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
            ).to.eq(nftToken.address.toLowerCase());
            expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(1);

            await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");

            // MOCK master chef storages
            await masterChef.smodify.put({
              poolInfo: {
                [stakingTokens[0].address]: {
                  lastRewardBlock: snapshotBlock,
                  accWingPerShare: parseUnits("10", 12).toString(),
                },
              },
              userInfo: {
                [stakingTokens[0].address]: {
                  [ownerAddress]: {
                    amount: parseEther("10").toString(),
                    fundedBy: shipbooster.address,
                  },
                },
              },
              stakeTokenCallerAllowancePool: {
                [stakingTokens[0].address]: true,
              },
            });
            await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
              stakingTokens[0].address,
              shipbooster.address
            );

            // MOCK that master barista has enough LATTE
            await wingToken.transfer(stake.address, parseEther("100"));
            await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 2);
            // owner is expected to get 100 reward + 10 extra rewards from staking an nft
            expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100").add(parseEther("10")));
            // since 10 extra rewards has been mint, current energy should be drained to 0
            expect(
              (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).currentEnergy
            ).to.eq(0);
            expect(
              (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).boostBps
            ).to.eq("1000");
            // should update a user staking nft info
            expect(
              (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
            ).to.eq(nftToken.address.toLowerCase());
            expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(2);
          });
        });

        context("without energy", () => {
          it("should successfully claim a reward along with staking an nft with no extra energy minted", async () => {
            // mock master chef reward for stakingToken[0]
            const ownerAddress = await alice.getAddress();
            const snapshotBlock = await latestBlockNumber();

            // mint and approve nft
            await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
            await nftTokenAsAlice.approve(shipbooster.address, 1);
            await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
            await nftTokenAsAlice.approve(shipbooster.address, 2);

            // MOCK a shipbooster config storage
            await shipboosterConfig.smodify.put({
              stakeTokenAllowance: {
                [stakingTokens[0].address]: true,
              },
              shipboosterNftAllowanceConfig: {
                [stakingTokens[0].address]: {
                  [nftToken.address]: {
                    1: true,
                    2: true,
                  },
                },
              },
              callerAllowance: {
                [shipbooster.address]: true,
              },
              shipboosterEnergyInfo: {
                [nftToken.address]: {
                  1: {
                    updatedAt: 1,
                  },
                },
              },
            });
            // stake for the first time, its' energy will be used to amplify
            await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
            // should expect some storage changes in a shipbooster
            expect(
              (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
            ).to.eq(nftToken.address.toLowerCase());
            expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(1);

            await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");

            // MOCK master chef storages
            await masterChef.smodify.put({
              poolInfo: {
                [stakingTokens[0].address]: {
                  lastRewardBlock: snapshotBlock,
                  accWingPerShare: parseUnits("10", 12).toString(),
                },
              },
              userInfo: {
                [stakingTokens[0].address]: {
                  [ownerAddress]: {
                    amount: parseEther("10").toString(),
                    fundedBy: shipbooster.address,
                  },
                },
              },
              stakeTokenCallerAllowancePool: {
                [stakingTokens[0].address]: true,
              },
            });
            await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
              stakingTokens[0].address,
              shipbooster.address
            );

            // MOCK that master chef has enough WING
            await wingToken.transfer(stake.address, parseEther("100"));
            await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 2);
            // owner is expected to get 100 reward
            expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100"));
            // since 10 extra rewards has been mint, current energy should be drained to 0
            expect(
              (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).currentEnergy
            ).to.eq(0);
            // should update a user staking nft info
            expect(
              (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
            ).to.eq(nftToken.address.toLowerCase());
            expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(2);
          });
        });
      });
    });
  });

  describe("#unstakeNFT()", () => {
    context("when stake token is not allowed in the config", () => {
      it("should revert", async () => {
        // set stake token allowance to be true
        await shipboosterConfig.smodify.put({
          stakeTokenAllowance: {
            [stakingTokens[0].address]: false,
          },
        });

        await expect(shipbooster.unstakeNFT(stakingTokens[0].address)).to.be.revertedWith(
          "ShipBooster::isStakeTokenOK::bad stake token"
        );
      });
    });

    context("when there is no reward to harvest", () => {
      it("should successfully unstake nft", async () => {
        const deployerAddr = await deployer.getAddress();

        // mint and approve nft
        await (nftToken as unknown as MockERC721).mint(deployerAddr, 1);
        await (nftToken as unknown as MockERC721).approve(shipbooster.address, 1);

        // set stake token allowance to be true
        await shipboosterConfig.smodify.put({
          stakeTokenAllowance: {
            [stakingTokens[0].address]: true,
          },
        });
        // set shipbooster nft allowance to be false / revert case
        await shipboosterConfig.smodify.put({
          shipboosterNftAllowanceConfig: {
            [stakingTokens[0].address]: {
              [nftToken.address]: {
                1: true,
              },
            },
          },
        });
        await shipbooster.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
        // owner of a shipbooster contract should be changed
        expect(await (nftToken as unknown as MockERC721).ownerOf(1)).to.eq(shipbooster.address);
        // should expect some storage changes in a shipbooster
        expect(
          (await shipbooster.userStakingNFT(stakingTokens[0].address, deployerAddr)).nftAddress.toLowerCase()
        ).to.eq(nftToken.address.toLowerCase());
        expect((await shipbooster.userStakingNFT(stakingTokens[0].address, deployerAddr)).nftTokenId).to.eq(1);

        await shipbooster.unstakeNFT(stakingTokens[0].address);
        // owner of a shipbooster contract should be changed
        expect(await (nftToken as unknown as MockERC721).ownerOf(1)).to.eq(deployerAddr);
        // should expect some storage changes in a shipbooster
        expect(
          (await shipbooster.userStakingNFT(stakingTokens[0].address, deployerAddr)).nftAddress.toLowerCase()
        ).to.eq(AddressZero);
        expect((await shipbooster.userStakingNFT(stakingTokens[0].address, deployerAddr)).nftTokenId).to.eq(0);
      });
    });

    context("when there is a reward to harvest", () => {
      context("with some energy", () => {
        it("should successfully claim a reward along with staking an nft with extra energy minted", async () => {
          // mock master chef reward for stakingToken[0]
          const ownerAddress = await alice.getAddress();
          const snapshotBlock = await latestBlockNumber();

          // mint and approve nft
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
          await nftTokenAsAlice.approve(shipbooster.address, 1);
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
          await nftTokenAsAlice.approve(shipbooster.address, 2);

          // MOCK a shipbooster config storage
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [stakingTokens[0].address]: true,
            },
            shipboosterNftAllowanceConfig: {
              [stakingTokens[0].address]: {
                [nftToken.address]: {
                  1: true,
                },
              },
            },
            shipboosterEnergyInfo: {
              [nftToken.address]: {
                1: {
                  currentEnergy: parseEther("10").toString(),
                  boostBps: "1000",
                  updatedAt: 1,
                },
              },
            },
            callerAllowance: {
              [shipbooster.address]: true,
            },
          });
          // stake for the first time, its' energy will be used to amplify
          await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
          // should expect some storage changes in a shipbooster
          expect(
            (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
          ).to.eq(nftToken.address.toLowerCase());
          expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(1);

          await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");

          // MOCK master chef storages
          await masterChef.smodify.put({
            poolInfo: {
              [stakingTokens[0].address]: {
                lastRewardBlock: snapshotBlock,
                accWingPerShare: parseUnits("10", 12).toString(),
              },
            },
            userInfo: {
              [stakingTokens[0].address]: {
                [ownerAddress]: {
                  amount: parseEther("10").toString(),
                  fundedBy: shipbooster.address,
                },
              },
            },
            stakeTokenCallerAllowancePool: {
              [stakingTokens[0].address]: true,
            },
          });
          await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
            stakingTokens[0].address,
            shipbooster.address
          );

          // MOCK that master chef has enough WING
          await wingToken.transfer(stake.address, parseEther("100"));
          await shipboosterAsAlice.unstakeNFT(stakingTokens[0].address);
          // owner is expected to get 100 reward + 10 extra rewards from staking an nft
          expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100").add(parseEther("10")));
          // since 10 extra rewards has been mint, current energy should be drained to 0
          expect(
            (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).currentEnergy
          ).to.eq(0);
          expect(
            (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).boostBps
          ).to.eq("1000");
          // should update a user staking nft info
          expect(
            (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
          ).to.eq(AddressZero);
          expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(0);
        });
      });

      context("without energy", () => {
        it("should successfully claim a reward along with staking an nft with extra energy minted", async () => {
          // mock master chef reward for stakingToken[0]
          const ownerAddress = await alice.getAddress();
          const snapshotBlock = await latestBlockNumber();

          // mint and approve nft
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
          await nftTokenAsAlice.approve(shipbooster.address, 1);
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
          await nftTokenAsAlice.approve(shipbooster.address, 2);

          // MOCK a shipbooster config storage
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [stakingTokens[0].address]: true,
            },
            shipboosterNftAllowanceConfig: {
              [stakingTokens[0].address]: {
                [nftToken.address]: {
                  1: true,
                },
              },
            },
            shipboosterEnergyInfo: {
              [nftToken.address]: {
                1: {
                  currentEnergy: "0",
                  boostBps: "1000",
                  updatedAt: 1,
                },
              },
            },
            callerAllowance: {
              [shipbooster.address]: true,
            },
          });
          // stake for the first time, its' energy will be used to amplify
          await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
          // should expect some storage changes in a shipbooster
          expect(
            (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
          ).to.eq(nftToken.address.toLowerCase());
          expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(1);

          await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");

          // MOCK master chef storages
          await masterChef.smodify.put({
            poolInfo: {
              [stakingTokens[0].address]: {
                lastRewardBlock: snapshotBlock,
                accWingPerShare: parseUnits("10", 12).toString(),
              },
            },
            userInfo: {
              [stakingTokens[0].address]: {
                [ownerAddress]: {
                  amount: parseEther("10").toString(),
                  fundedBy: shipbooster.address,
                },
              },
            },
            stakeTokenCallerAllowancePool: {
              [stakingTokens[0].address]: true,
            },
          });
          await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
            stakingTokens[0].address,
            shipbooster.address
          );

          // MOCK that master chef has enough WING
          await wingToken.transfer(stake.address, parseEther("100"));
          await shipboosterAsAlice.unstakeNFT(stakingTokens[0].address);
          // owner is expected to get 100 reward
          expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100"));
          // since 10 extra rewards has been mint, current energy should be drained to 0
          expect(
            (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).currentEnergy
          ).to.eq(0);
          expect(
            (await (shipboosterConfig as unknown as ShipBoosterConfig).energyInfo(nftToken.address, 1)).boostBps
          ).to.eq("1000");
          // should update a user staking nft info
          expect(
            (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
          ).to.eq(AddressZero);
          expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(0);
        });
      });
    });
  });

  describe("#harvest()", () => {
    context("when sending multiple stake tokens", () => {
      it("should harvest multiple stake tokens", async () => {
        // mock master chef reward for stakingToken[0]
        const ownerAddress = await alice.getAddress();
        const snapshotBlock = await latestBlockNumber();

        // mint and approve nft
        await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
        await nftTokenAsAlice.approve(shipbooster.address, 1);
        await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
        await nftTokenAsAlice.approve(shipbooster.address, 2);

        // MOCK a shipbooster config storage
        await shipboosterConfig.smodify.put({
          stakeTokenAllowance: {
            [stakingTokens[0].address]: true,
            [stakingTokens[1].address]: true,
          },
          shipboosterNftAllowanceConfig: {
            [stakingTokens[0].address]: {
              [nftToken.address]: {
                1: true,
              },
            },
            [stakingTokens[1].address]: {
              [nftToken.address]: {
                2: true,
              },
            },
          },
          shipboosterEnergyInfo: {
            [nftToken.address]: {
              1: {
                currentEnergy: parseEther("10").toString(),
                boostBps: "1000",
                updatedAt: 1,
              },
              2: {
                currentEnergy: parseEther("10").toString(),
                boostBps: "1000",
                updatedAt: 1,
              },
            },
          },
          callerAllowance: {
            [shipbooster.address]: true,
          },
        });
        // stake for the first time, its' energy will be used to amplify
        await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
        await shipboosterAsAlice.stakeNFT(stakingTokens[1].address, nftToken.address, 2);
        // should expect some storage changes in a shipbooster
        expect(
          (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
        ).to.eq(nftToken.address.toLowerCase());
        expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(1);
        expect(
          (await shipbooster.userStakingNFT(stakingTokens[1].address, ownerAddress)).nftAddress.toLowerCase()
        ).to.eq(nftToken.address.toLowerCase());
        expect((await shipbooster.userStakingNFT(stakingTokens[1].address, ownerAddress)).nftTokenId).to.eq(2);

        await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");
        await (masterChef as unknown as MasterChef).addPool(stakingTokens[1].address, "1000");

        // MOCK master chef storages
        await masterChef.smodify.put({
          poolInfo: {
            [stakingTokens[0].address]: {
              lastRewardBlock: snapshotBlock,
              accWingPerShare: parseUnits("10", 12).toString(),
            },
            [stakingTokens[1].address]: {
              lastRewardBlock: snapshotBlock,
              accWingPerShare: parseUnits("10", 12).toString(),
            },
          },
          userInfo: {
            [stakingTokens[0].address]: {
              [ownerAddress]: {
                amount: parseEther("10").toString(),
                fundedBy: shipbooster.address,
              },
            },
            [stakingTokens[1].address]: {
              [ownerAddress]: {
                amount: parseEther("10").toString(),
                fundedBy: shipbooster.address,
              },
            },
          },
          stakeTokenCallerAllowancePool: {
            [stakingTokens[0].address]: true,
            [stakingTokens[1].address]: true,
          },
        });
        await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
          stakingTokens[0].address,
          shipbooster.address
        );
        await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
          stakingTokens[1].address,
          shipbooster.address
        );

        // MOCK that master chef has enough WING
        await wingToken.transfer(stake.address, parseEther("200"));
        await expect(shipboosterAsAlice["harvest(address[])"]([stakingTokens[0].address, stakingTokens[1].address]))
          .to.emit(shipbooster, "Harvest")
          .withArgs(ownerAddress, stakingTokens[0].address, parseEther("100").add(parseEther("10")))
          .to.emit(shipbooster, "Harvest")
          .withArgs(ownerAddress, stakingTokens[1].address, parseEther("100").add(parseEther("10")));
        // owner is expected to get 100 reward + 10 extra rewards from staking an nft * 2 for 2 stake tokens
        expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100").add(parseEther("10")).mul(2));
      });
    });

    context("when the pool ain't the same as a reward", () => {
      context("when harvest an disallowed token", () => {
        it("should reverted", async () => {
          await expect(shipbooster["harvest(address)"](stakingTokens[0].address)).to.revertedWith(
            "ShipBooster::isStakeTokenOK::bad stake token"
          );
        });
      });

      context("without energy", () => {
        it("should emit a Harvest with 0 reward", async () => {
          // MOCK a shipbooster config storage
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [stakingTokens[0].address]: true,
            },
          });
          const ownerAddress = await deployer.getAddress();
          await expect(shipbooster["harvest(address)"](stakingTokens[0].address))
            .to.emit(shipbooster, "Harvest")
            .withArgs(ownerAddress, stakingTokens[0].address, 0);
        });
      });

      context("with some energy", () => {
        it("should harvest the reward", async () => {
          // mock master chef reward for stakingToken[0]
          const ownerAddress = await alice.getAddress();
          const snapshotBlock = await latestBlockNumber();

          // mint and approve nft
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
          await nftTokenAsAlice.approve(shipbooster.address, 1);
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
          await nftTokenAsAlice.approve(shipbooster.address, 2);

          // MOCK a shipbooster config storage
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [stakingTokens[0].address]: true,
            },
            shipboosterNftAllowanceConfig: {
              [stakingTokens[0].address]: {
                [nftToken.address]: {
                  1: true,
                },
              },
            },
            shipboosterEnergyInfo: {
              [nftToken.address]: {
                1: {
                  currentEnergy: parseEther("10").toString(),
                  boostBps: "1000",
                  updatedAt: 1,
                },
              },
            },
            callerAllowance: {
              [shipbooster.address]: true,
            },
          });
          // stake for the first time, its' energy will be used to amplify
          await shipboosterAsAlice.stakeNFT(stakingTokens[0].address, nftToken.address, 1);
          // should expect some storage changes in a shipbooster
          expect(
            (await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftAddress.toLowerCase()
          ).to.eq(nftToken.address.toLowerCase());
          expect((await shipbooster.userStakingNFT(stakingTokens[0].address, ownerAddress)).nftTokenId).to.eq(1);

          await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");

          // MOCK master chef storages
          await masterChef.smodify.put({
            poolInfo: {
              [stakingTokens[0].address]: {
                lastRewardBlock: snapshotBlock,
                accWingPerShare: parseUnits("10", 12).toString(),
              },
            },
            userInfo: {
              [stakingTokens[0].address]: {
                [ownerAddress]: {
                  amount: parseEther("10").toString(),
                  fundedBy: shipbooster.address,
                },
              },
            },
            stakeTokenCallerAllowancePool: {
              [stakingTokens[0].address]: true,
            },
          });
          await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
            stakingTokens[0].address,
            shipbooster.address
          );

          // MOCK that master chef has enough WING
          await wingToken.transfer(stake.address, parseEther("100"));
          await expect(shipboosterAsAlice["harvest(address)"](stakingTokens[0].address))
            .to.emit(shipbooster, "Harvest")
            .withArgs(ownerAddress, stakingTokens[0].address, parseEther("100").add(parseEther("10")));
          // owner is expected to get 100 reward + 10 extra rewards from staking an nft
          expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100").add(parseEther("10")));
        });
      });
    });

    context("when the pool is the same as a reward", () => {
      context("when harvest an disallowed token", () => {
        it("should reverted", async () => {
          await expect(shipbooster["harvest(address)"](wingToken.address)).to.revertedWith(
            "ShipBooster::isStakeTokenOK::bad stake token"
          );
        });
      });

      context("without energy", () => {
        it("should emit a Harvest with 0 reward", async () => {
          // MOCK a shipbooster config storage
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [wingToken.address]: true,
            },
          });
          const ownerAddress = await deployer.getAddress();
          await expect(shipbooster["harvest(address)"](wingToken.address))
            .to.emit(shipbooster, "Harvest")
            .withArgs(ownerAddress, wingToken.address, 0);
        });
      });

      context("with some energy", () => {
        it("should harvest the reward", async () => {
          // mock master chef reward for stakingToken[0]
          const ownerAddress = await alice.getAddress();
          const snapshotBlock = await latestBlockNumber();

          // mint and approve nft
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 1);
          await nftTokenAsAlice.approve(shipbooster.address, 1);
          await (nftToken as unknown as MockERC721).mint(ownerAddress, 2);
          await nftTokenAsAlice.approve(shipbooster.address, 2);

          // MOCK a shipbooster config storage
          await shipboosterConfig.smodify.put({
            stakeTokenAllowance: {
              [wingToken.address]: true,
            },
            shipboosterNftAllowanceConfig: {
              [wingToken.address]: {
                [nftToken.address]: {
                  1: true,
                },
              },
            },
            shipboosterEnergyInfo: {
              [nftToken.address]: {
                1: {
                  currentEnergy: parseEther("10").toString(),
                  boostBps: "1000",
                  updatedAt: 1,
                },
              },
            },
            callerAllowance: {
              [shipbooster.address]: true,
            },
          });
          // stake for the first time, its' energy will be used to amplify
          await shipboosterAsAlice.stakeNFT(wingToken.address, nftToken.address, 1);
          // should expect some storage changes in a shipbooster
          expect((await shipbooster.userStakingNFT(wingToken.address, ownerAddress)).nftAddress.toLowerCase()).to.eq(
            nftToken.address.toLowerCase()
          );
          expect((await shipbooster.userStakingNFT(wingToken.address, ownerAddress)).nftTokenId).to.eq(1);
          // MOCK master chef storages
          await masterChef.smodify.put({
            poolInfo: {
              [wingToken.address]: {
                lastRewardBlock: snapshotBlock,
                accWingPerShare: parseUnits("10", 12).toString(),
              },
            },
            userInfo: {
              [wingToken.address]: {
                [ownerAddress]: {
                  amount: parseEther("10").toString(),
                  fundedBy: shipbooster.address,
                },
              },
            },
            stakeTokenCallerAllowancePool: {
              [wingToken.address]: true,
            },
          });
          await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
            wingToken.address,
            shipbooster.address
          );
          // MOCK that master chef has enough WING
          await wingToken.transfer(stake.address, parseEther("100"));
          // expect to harvest with the reward that is not include the wing portion that is sent in the previous statement
          await expect(shipboosterAsAlice["harvest(address)"](wingToken.address))
            .to.emit(shipbooster, "Harvest")
            .withArgs(ownerAddress, wingToken.address, parseEther("100").add(parseEther("10")));
          // owner is expected to get 100 reward + 10 extra rewards from staking an nft
          expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100").add(parseEther("10")));
        });
      });
    });
  });

  describe("#emergencyWithdraw()", () => {
    context("when stake a disallowed token", () => {
      it("should revert", async () => {
        await expect(shipbooster.emergencyWithdraw(stakingTokens[0].address)).to.revertedWith(
          "ShipBooster::isStakeTokenOK::bad stake token"
        );
      });
    });
    it("should ble able to withdraw the staking token considerless the reward", async () => {
      // mock master chef reward for stakingToken[0]
      const ownerAddress = await alice.getAddress();
      const snapshotBlock = await latestBlockNumber();

      // MOCK a shipbooster config storage
      await shipboosterConfig.smodify.put({
        stakeTokenAllowance: {
          [stakingTokens[0].address]: true,
        },
        shipboosterNftAllowanceConfig: {
          [stakingTokens[0].address]: {
            [nftToken.address]: {
              1: true,
            },
          },
        },
        shipboosterEnergyInfo: {
          [nftToken.address]: {
            1: {
              currentEnergy: parseEther("10").toString(),
              boostBps: "1000",
              updatedAt: 1,
            },
          },
        },
        callerAllowance: {
          [shipbooster.address]: true,
        },
      });

      await (masterChef as unknown as MasterChef).addPool(stakingTokens[0].address, "1000");
      // MOCK master chef storages
      await masterChef.smodify.put({
        poolInfo: {
          [stakingTokens[0].address]: {
            lastRewardBlock: snapshotBlock,
            accWingPerShare: parseUnits("10", 12).toString(),
          },
        },
        userInfo: {
          [stakingTokens[0].address]: {
            [ownerAddress]: {
              amount: parseEther("10").toString(),
              fundedBy: shipbooster.address,
            },
          },
        },
        stakeTokenCallerAllowancePool: {
          [stakingTokens[0].address]: true,
        },
      });
      await (masterChef as unknown as MasterChef).addStakeTokenCallerContract(
        stakingTokens[0].address,
        shipbooster.address
      );
      // MOCK that master chef has enough WING
      await wingToken.transfer(stake.address, parseEther("100"));
      await stakingTokens[0].mint(masterChef.address, parseEther("10"));

      await expect(shipboosterAsAlice.emergencyWithdraw(stakingTokens[0].address))
        .to.emit(shipbooster, "EmergencyWithdraw")
        .withArgs(ownerAddress, stakingTokens[0].address, parseEther("10"));
      expect(await stakingTokens[0].balanceOf(ownerAddress)).to.eq(parseEther("10"));
    });
  });
});
