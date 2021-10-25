import { Signer } from "ethers";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades, waffle } from "hardhat";
import { ShipBoosterConfig, ShipBoosterConfig__factory } from "../../typechain";
import chai from "chai";
import exp from "constants";
import { shipboosterConfigUnitTestFixture } from "../helpers/fixtures/ShipBoosterConfig";
import { ModifiableContract } from "@eth-optimism/smock";

chai.use(solidity);
const { expect } = chai;

describe("ShipBoosterConfig", () => {
  // ShipBoosterConfig instances
  let shipboosterConfig: ShipBoosterConfig;
  let shipboosterConfigAsBob: ShipBoosterConfig;
  let shipboosterConfigAsAlice: ShipBoosterConfig;
  let wingswapNft: ModifiableContract;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    ({ shipboosterConfig, wingswapNft } = await waffle.loadFixture(shipboosterConfigUnitTestFixture));

    shipboosterConfigAsBob = ShipBoosterConfig__factory.connect(shipboosterConfig.address, bob);
    shipboosterConfigAsAlice = ShipBoosterConfig__factory.connect(shipboosterConfig.address, alice);
  });
  describe("#consumeEnergy()", () => {
    context("if the energy hasn't been set before", async () => {
      it("should be reverted", async () => {
        await shipboosterConfig.setCallerAllowance(await bob.getAddress(), true);
        await expect(shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 2)).to.be.revertedWith(
          "ShipBoosterConfig::consumeEnergy:: invalid nft to be updated"
        );
      });
    });

    context("if the energy has been set", async () => {
      context("set by using shipbooster energy", () => {
        context("when energy to be consumed is < currentEnergy", () => {
          it("should revert", async () => {
            await shipboosterConfig.setCallerAllowance(await bob.getAddress(), true);
            await shipboosterConfig.setShipBoosterNFTEnergyInfo({
              nftAddress: wingswapNft.address,
              nftTokenId: 0,
              maxEnergy: 100,
              boostBps: 100,
            });
            await expect(shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 101)).to.revertedWith(
              "SafeMath: subtraction overflow"
            );
          });
        });
        it("should be successfully set", async () => {
          await shipboosterConfig.setCallerAllowance(await bob.getAddress(), true);
          await shipboosterConfig.setShipBoosterNFTEnergyInfo({
            nftAddress: wingswapNft.address,
            nftTokenId: 0,
            maxEnergy: 100,
            boostBps: 100,
          });
          await shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 2);
          const energyInfo = await shipboosterConfigAsBob.energyInfo(wingswapNft.address, 0);
          expect(energyInfo.maxEnergy).to.eq(100);
          expect(energyInfo.currentEnergy).to.eq(98);
          expect(energyInfo.boostBps).to.eq(100);
        });
      });
      context("set by using category", () => {
        context("when energy to be consumed is < currentEnergy", () => {
          it("should revert", async () => {
            await shipboosterConfig.setCallerAllowance(await bob.getAddress(), true);
            await shipboosterConfig.setCategoryNFTEnergyInfo({
              nftAddress: wingswapNft.address,
              nftCategoryId: 1,
              maxEnergy: 111,
              boostBps: 100,
            });
            await expect(shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 112)).to.revertedWith(
              "SafeMath: subtraction overflow"
            );
          });
        });
        it("should be successfully set", async () => {
          await shipboosterConfig.setCallerAllowance(await bob.getAddress(), true);
          await shipboosterConfig.setCategoryNFTEnergyInfo({
            nftAddress: wingswapNft.address,
            nftCategoryId: 1,
            maxEnergy: 111,
            boostBps: 100,
          });
          await shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 2);
          let energyInfo = await shipboosterConfigAsBob.energyInfo(wingswapNft.address, 0);
          expect(energyInfo.maxEnergy).to.eq(111);
          expect(energyInfo.currentEnergy).to.eq(109);
          expect(energyInfo.boostBps).to.eq(100);

          await shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 9);
          energyInfo = await shipboosterConfigAsBob.energyInfo(wingswapNft.address, 0);
          expect(energyInfo.maxEnergy).to.eq(111);
          expect(energyInfo.currentEnergy).to.eq(100);
          expect(energyInfo.boostBps).to.eq(100);
        });
      });
      context("if not set by both shipbooster and category", () => {
        it("should revert", async () => {
          await shipboosterConfig.setCallerAllowance(await bob.getAddress(), true);
          await expect(shipboosterConfigAsBob.consumeEnergy(wingswapNft.address, 0, 2)).to.revertedWith(
            "ShipBoosterConfig::consumeEnergy:: invalid nft to be updated"
          );
        });
      });
    });

    context("when the caller is not allowance", async () => {
      it("should reverted", async () => {
        await expect(shipboosterConfigAsAlice.consumeEnergy(await eve.getAddress(), 1, 2)).to.be.revertedWith(
          "ShipBoosterConfig::onlyCaller::only eligible caller"
        );
      });
    });
  });

  describe("#setStakeTokenAllowance()", () => {
    context("when set stake token allowance", async () => {
      it("should set stake token allowance", async () => {
        expect(await shipboosterConfig.setStakeTokenAllowance(await eve.getAddress(), true));
        expect(await shipboosterConfig.stakeTokenAllowance(await eve.getAddress())).to.be.true;
      });
    });

    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(shipboosterConfigAsAlice.setStakeTokenAllowance(await eve.getAddress(), true)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when stake token is address zero", async () => {
      it("should reverted", async () => {
        await expect(shipboosterConfig.setStakeTokenAllowance(ethers.constants.AddressZero, true)).to.be.revertedWith(
          "ShipBoosterConfig::setStakeTokenAllowance::_stakeToken must not be address(0)"
        );
      });
    });
  });

  describe("#setCallerAllowance()", () => {
    context("when set caller allowance", async () => {
      it("should set caller allowance", async () => {
        expect(await shipboosterConfig.setCallerAllowance(await eve.getAddress(), true));
        expect(await shipboosterConfig.callerAllowance(await eve.getAddress())).to.be.true;
      });
    });

    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(shipboosterConfigAsBob.setCallerAllowance(await eve.getAddress(), true)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when caller is address zero", async () => {
      it("should reverted", async () => {
        await expect(shipboosterConfig.setCallerAllowance(ethers.constants.AddressZero, true)).to.be.revertedWith(
          "ShipBoosterConfig::setCallerAllowance::_caller must not be address(0)"
        );
      });
    });
  });

  describe("#setBatchShipBoosterNFTEnergyInfo()", () => {
    context("when set batch shipbooster NFT energy info", async () => {
      it("sould set batch shipbooster NFT energy info", async () => {
        const nft1 = { nftAddress: wingswapNft.address, nftTokenId: 1, maxEnergy: 2, boostBps: 3 };
        const nft2 = { nftAddress: wingswapNft.address, nftTokenId: 2, maxEnergy: 4, boostBps: 5 };
        await expect(shipboosterConfig.setBatchShipBoosterNFTEnergyInfo([nft1, nft2]));
        const energyInfoNFT1 = await shipboosterConfig.energyInfo(wingswapNft.address, 1);
        expect(energyInfoNFT1.maxEnergy).to.be.eq(2);
        expect(energyInfoNFT1.currentEnergy).to.be.eq(2);
        expect(energyInfoNFT1.boostBps).to.be.eq(3);
        const energyInfoNFT2 = await shipboosterConfig.energyInfo(wingswapNft.address, 2);
        expect(energyInfoNFT2.maxEnergy).to.be.eq(4);
        expect(energyInfoNFT2.currentEnergy).to.be.eq(4);
        expect(energyInfoNFT2.boostBps).to.be.eq(5);
      });
    });

    context("when caller is not owner", async () => {
      it("should revert", async () => {
        const nft1 = { nftAddress: wingswapNft.address, nftTokenId: 1, maxEnergy: 5, boostBps: 10 };
        const nft2 = { nftAddress: wingswapNft.address, nftTokenId: 2, maxEnergy: 5, boostBps: 10 };
        await expect(shipboosterConfigAsBob.setBatchShipBoosterNFTEnergyInfo([nft1, nft2])).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  describe("#setShipBoosterNFTEnergyInfo()", () => {
    it("should return default energy into as 0", async () => {
      const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
      expect(energyInfo.maxEnergy).to.be.eq(0);
      expect(energyInfo.currentEnergy).to.be.eq(0);
      expect(energyInfo.boostBps).to.be.eq(0);
    });
    context("when set shipbooster NFT energy info", async () => {
      it("should set shipbooster NFT energy info", async () => {
        const nft = { nftAddress: wingswapNft.address, nftTokenId: 1, maxEnergy: 5, boostBps: 10 };
        expect(await shipboosterConfig.setShipBoosterNFTEnergyInfo(nft));
        const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 1);
        expect(energyInfo.maxEnergy).to.be.eq(5);
        expect(energyInfo.currentEnergy).to.be.eq(5);
        expect(energyInfo.boostBps).to.be.eq(10);
      });
    });

    context("when set shipbooster NFT energy info with some NFTEnergyinfo has been set", async () => {
      it("should set shipbooster NFT energy info", async () => {
        const nft = { nftAddress: wingswapNft.address, nftTokenId: 1, maxEnergy: 5, boostBps: 10 };
        expect(await shipboosterConfig.setShipBoosterNFTEnergyInfo(nft));
        const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 1);
        expect(energyInfo.maxEnergy).to.be.eq(5);
        expect(energyInfo.currentEnergy).to.be.eq(5);
        expect(energyInfo.boostBps).to.be.eq(10);

        const newNFGInfo = { nftAddress: wingswapNft.address, nftTokenId: 1, maxEnergy: 9, boostBps: 12 };
        expect(await shipboosterConfig.setShipBoosterNFTEnergyInfo(newNFGInfo));
        const setNewEnergyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 1);
        expect(setNewEnergyInfo.maxEnergy).to.be.eq(9);
        expect(setNewEnergyInfo.currentEnergy).to.be.eq(9);
        expect(setNewEnergyInfo.boostBps).to.be.eq(12);
      });
    });

    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        const nft = { nftAddress: wingswapNft.address, nftTokenId: 2, maxEnergy: 5, boostBps: 10 };
        await expect(shipboosterConfigAsBob.setShipBoosterNFTEnergyInfo(nft)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  describe("#setCategoryNFTEnergyInfo()", () => {
    it("should return default energy into as 0", async () => {
      const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
      expect(energyInfo.maxEnergy).to.be.eq(0);
      expect(energyInfo.currentEnergy).to.be.eq(0);
      expect(energyInfo.boostBps).to.be.eq(0);
    });

    context("when set category NFT energy info", async () => {
      it("should set category NFT energy info", async () => {
        const nft = { nftAddress: wingswapNft.address, nftCategoryId: 1, maxEnergy: 5, boostBps: 10 };
        expect(await shipboosterConfig.setCategoryNFTEnergyInfo(nft));
        const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
        expect(energyInfo.maxEnergy).to.be.eq(5);
        expect(energyInfo.currentEnergy).to.be.eq(5);
        expect(energyInfo.boostBps).to.be.eq(10);
      });
    });

    context("when set category NFT energy info with some CategoryEnergyinfo has been set", async () => {
      it("should set category NFT energy info", async () => {
        const nft = { nftAddress: wingswapNft.address, nftCategoryId: 1, maxEnergy: 5, boostBps: 10 };
        expect(await shipboosterConfig.setCategoryNFTEnergyInfo(nft));
        const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
        expect(energyInfo.maxEnergy).to.be.eq(5);
        expect(energyInfo.currentEnergy).to.be.eq(5);
        expect(energyInfo.boostBps).to.be.eq(10);

        const newNFGInfo = { nftAddress: wingswapNft.address, nftCategoryId: 1, maxEnergy: 9, boostBps: 12 };
        expect(await shipboosterConfig.setCategoryNFTEnergyInfo(newNFGInfo));
        const setNewEnergyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
        expect(setNewEnergyInfo.maxEnergy).to.be.eq(9);
        expect(setNewEnergyInfo.currentEnergy).to.be.eq(9);
        expect(setNewEnergyInfo.boostBps).to.be.eq(12);
      });
    });

    context("when setting a category NFT energy info with ShipBoosterEnergyInfo has been set", async () => {
      it("s' energy info should yield a result from categoryNFTEnergyInfo first, after that, should return a result from shipboosterEnergyInfo", async () => {
        const nft = { nftAddress: wingswapNft.address, nftCategoryId: 1, maxEnergy: 5, boostBps: 10 };
        expect(await shipboosterConfig.setCategoryNFTEnergyInfo(nft));
        const energyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
        expect(energyInfo.maxEnergy).to.be.eq(5);
        expect(energyInfo.currentEnergy).to.be.eq(5);
        expect(energyInfo.boostBps).to.be.eq(10);

        const newNFGInfo = { nftAddress: wingswapNft.address, nftTokenId: 0, maxEnergy: 9, boostBps: 12 };
        expect(await shipboosterConfig.setShipBoosterNFTEnergyInfo(newNFGInfo));
        const setNewEnergyInfo = await shipboosterConfig.energyInfo(wingswapNft.address, 0);
        expect(setNewEnergyInfo.maxEnergy).to.be.eq(9);
        expect(setNewEnergyInfo.currentEnergy).to.be.eq(9);
        expect(setNewEnergyInfo.boostBps).to.be.eq(12);
      });
    });

    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        const nft = { nftAddress: wingswapNft.address, nftCategoryId: 2, maxEnergy: 5, boostBps: 10 };
        await expect(shipboosterConfigAsBob.setCategoryNFTEnergyInfo(nft)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  describe("#setStakingTokenShipBoosterAllowance()", () => {
    context("when set staking token shipbooster allowance", async () => {
      it("should set staking token shipbooster allowance", async () => {
        await shipboosterConfig.setStakeTokenAllowance(await alice.getAddress(), true);
        const allowance = [{ nftAddress: wingswapNft.address, nftTokenId: 1, allowance: true }];
        const shipboosterAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        expect(await shipboosterConfig.setStakingTokenShipBoosterAllowance(shipboosterAllowanceParams));
        const shipboosterAllowance = await shipboosterConfig.shipboosterNftAllowance(
          await alice.getAddress(),
          allowance[0].nftAddress,
          allowance[0].nftTokenId
        );
        expect(shipboosterAllowance).to.be.true;
      });
    });

    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        const allowance = [{ nftAddress: wingswapNft.address, nftTokenId: 1, allowance: true }];
        const shipboosterAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        await expect(shipboosterConfigAsBob.setStakingTokenShipBoosterAllowance(shipboosterAllowanceParams)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when staking token shipbooster is not allowance", async () => {
      it("should reverted", async () => {
        const allowance = [{ nftAddress: wingswapNft.address, nftTokenId: 1, allowance: false }];
        const shipboosterAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        await expect(shipboosterConfig.setStakingTokenShipBoosterAllowance(shipboosterAllowanceParams)).to.be.revertedWith(
          "ShipBoosterConfig::setStakingTokenShipBoosterAllowance:: bad staking token"
        );
      });
    });
  });

  describe("#setStakingTokenCategoryAllowance()", () => {
    context("when stakingTokenShipBoosterAllowance not set", () => {
      it("should set staking token category allowance with shipboosterNftAllowance getting from category", async () => {
        await wingswapNft.smodify.put({
          wingswapNFTToCategory: {
            1: 0,
          },
        });
        await shipboosterConfig.setStakeTokenAllowance(await alice.getAddress(), true);
        const allowance = [{ nftAddress: wingswapNft.address, nftCategoryId: 0, allowance: true }];
        const categoryAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        await shipboosterConfig.setStakingTokenCategoryAllowance(categoryAllowanceParams);
        const shipboosterAllowance = await shipboosterConfig.shipboosterNftAllowance(
          await alice.getAddress(),
          allowance[0].nftAddress,
          1
        );
        expect(shipboosterAllowance).to.be.true;
      });
    });

    context("when stakingTokenShipBoosterAllowance is false", () => {
      it("should set staking token category allowance with shipboosterNftAllowance getting from category", async () => {
        await wingswapNft.smodify.put({
          wingswapNFTToCategory: {
            1: 0,
          },
        });
        await shipboosterConfig.setStakeTokenAllowance(await alice.getAddress(), true);
        const shipboosterAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: [{ nftAddress: wingswapNft.address, nftTokenId: 1, allowance: false }],
        };
        await shipboosterConfig.setStakingTokenShipBoosterAllowance(shipboosterAllowanceParams);

        const allowance = [{ nftAddress: wingswapNft.address, nftCategoryId: 0, allowance: true }];
        const categoryAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        await shipboosterConfig.setStakingTokenCategoryAllowance(categoryAllowanceParams);
        const shipboosterAllowance = await shipboosterConfig.shipboosterNftAllowance(
          await alice.getAddress(),
          allowance[0].nftAddress,
          1
        );
        expect(shipboosterAllowance).to.be.true;
      });
    });

    context("when stakingTokenShipBoosterAllowance has been set", () => {
      it("should set staking token category allowance with shipboosterNftAllowance getting from category", async () => {
        await wingswapNft.smodify.put({
          wingswapNFTToCategory: {
            1: 0,
          },
        });
        await shipboosterConfig.setStakeTokenAllowance(await alice.getAddress(), true);
        const shipboosterAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: [{ nftAddress: wingswapNft.address, nftTokenId: 1, allowance: true }],
        };
        await shipboosterConfig.setStakingTokenShipBoosterAllowance(shipboosterAllowanceParams);

        const categoryAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: [{ nftAddress: wingswapNft.address, nftCategoryId: 0, allowance: false }],
        };
        await shipboosterConfig.setStakingTokenCategoryAllowance(categoryAllowanceParams);

        const shipboosterAllowance = await shipboosterConfig.shipboosterNftAllowance(await alice.getAddress(), wingswapNft.address, 1);
        expect(shipboosterAllowance).to.be.true;
      });
    });

    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await wingswapNft.smodify.put({
          wingswapNFTToCategory: {
            1: 0,
          },
        });
        const allowance = [{ nftAddress: wingswapNft.address, nftCategoryId: 0, allowance: true }];
        const categoryAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        await expect(shipboosterConfigAsBob.setStakingTokenCategoryAllowance(categoryAllowanceParams)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when staking token shipbooster is not allowance", async () => {
      it("should reverted", async () => {
        await wingswapNft.smodify.put({
          wingswapNFTToCategory: {
            1: 0,
          },
        });
        const allowance = [{ nftAddress: wingswapNft.address, nftCategoryId: 0, allowance: false }];
        const categoryAllowanceParams = {
          stakingToken: await alice.getAddress(),
          allowance: allowance,
        };
        await expect(shipboosterConfig.setStakingTokenCategoryAllowance(categoryAllowanceParams)).to.be.revertedWith(
          "ShipBoosterConfig::setStakingTokenCategoryAllowance:: bad staking token"
        );
      });
    });
  });
});
