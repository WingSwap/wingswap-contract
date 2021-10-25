import chai from "chai";
import { ethers, upgrades, waffle } from "hardhat";
import {
  Stake,
  ShipBooster,
  WING,
  MasterChef,
  MockWBNB,
  WingNFT,
  WingNFT__factory,
  OGOwnerToken,
  SimpleToken,
  WNativeRelayer,
} from "../../typechain";
import { solidity } from "ethereum-waffle";
import { BigNumber, constants, Signer } from "ethers";
import { wingNFTUnitTestFixture } from "../helpers/fixtures/WingNFT";
import exp from "constants";
import { getAddress } from "@ethersproject/address";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";
import { ModifiableContract } from "@eth-optimism/smock";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { latestBlockNumber } from "../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("WingNFT", () => {
  // WingNFT instances
  let wingNFT: WingNFT;
  let wingNFTAsBob: WingNFT;
  let wingNFTAsAlice: WingNFT;

  // Contracts
  let wingToken: WING;
  let masterChef: ModifiableContract;
  let shipboosterConfig: ModifiableContract;
  let nftToken: ModifiableContract;
  let stakingTokens: SimpleToken[];
  let shipbooster: ShipBooster;
  let stake: Stake;
  let wbnb: MockWBNB;
  let wNativeRelayer: WNativeRelayer;
  let ogOwnerToken: ModifiableContract;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;
  let dev: Signer;

  beforeEach(async () => {
    [deployer, alice, bob, dev] = await ethers.getSigners();
    ({ wingNFT, wNativeRelayer, wbnb, stakingTokens, masterChef, stake, wingToken, ogOwnerToken } =
      await waffle.loadFixture(wingNFTUnitTestFixture));
    expect(await wingNFT.masterChef()).to.eq(masterChef.address);
    expect(await wingNFT.wing()).to.eq(wingToken.address);
    wingNFTAsBob = WingNFT__factory.connect(wingNFT.address, bob);
    wingNFTAsAlice = WingNFT__factory.connect(wingNFT.address, alice);
  });

  describe("#currentTokenId", () => {
    it("should update current token id", async () => {
      // MOCK that master chef has enough WING
      await wingToken.transfer(stake.address, parseEther("100"));

      expect(await wingNFT.currentTokenId()).to.eq(0);
      await wingNFT.mint(await bob.getAddress(), 0, "tokenURI");
      expect(await wingNFT.currentTokenId()).to.eq(1);
    });
  });

  describe("#currentCategoryId", () => {
    it("should update current token id", async () => {
      expect(await wingNFT.currentCategoryId()).to.eq(0);
      await wingNFT.addCategoryInfo("first cat", "");
      expect(await wingNFT.currentCategoryId()).to.eq(1);
      await wingNFT.addCategoryInfo("second cat", "");
      expect(await wingNFT.currentCategoryId()).to.eq(2);
    });
  });

  describe("#categoryToWingSwapNFTList()", () => {
    it("should return a list of tokenIds", async () => {
      // mock this so that mintBatch of category #1 can pass the master chef
      await wingNFT.setCategoryOGOwnerToken(1, ogOwnerToken.address);

      await wingNFT.mintBatch(await deployer.getAddress(), 0, "", 5);
      await wingNFT.addCategoryInfo("foo0", "bar0"); //add category info 0, now current is 1
      await wingNFT.addCategoryInfo("foo1", "bar1"); //add category info 1, now current is 2
      await wingNFT.mintBatch(await deployer.getAddress(), 1, "", 1);
      await wingNFT.mintBatch(await deployer.getAddress(), 0, "", 5);

      expect(
        (await wingNFT.categoryToWingSwapNFTList(0)).map((tokenId: BigNumber) => {
          return tokenId.toNumber();
        })
      ).to.deep.eq([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]);

      expect(
        (await wingNFT.categoryToWingSwapNFTList(1)).map((tokenId: BigNumber) => {
          return tokenId.toNumber();
        })
      ).to.deep.eq([5]);

      expect(
        (await wingNFT.categoryToWingSwapNFTList(2)).map((tokenId: BigNumber) => {
          return tokenId.toNumber();
        })
      ).to.deep.eq([]);
    });
  });

  describe("#categoryURI()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingNFT.categoryURI(99)).to.revertedWith("WingNFT::onlyExistingCategoryId::categoryId not existed");
      });
    });
    context("when there is no baseURI", () => {
      it("should only return categoryURI", async () => {
        await wingNFT.setBaseURI("");
        await wingNFT.addCategoryInfo("foo", "bar");
        expect(await wingNFT.categoryURI(0)).to.eq("bar");
      });
    });

    context("when there are baseURI and categoryURI", () => {
      it("should only return baseURI + categoryURI", async () => {
        await wingNFT.addCategoryInfo("foo", "bar");
        expect(await wingNFT.categoryURI(0)).to.eq(`${await wingNFT.baseURI()}bar`);
      });
    });

    context("when there is baseURI but no categoryURI", () => {
      it("should return baseURI + categoryID", async () => {
        expect(await wingNFT.categoryURI(0)).to.eq(`${await wingNFT.baseURI()}0`);
      });
    });
  });

  describe("#tokenURI()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingNFT.tokenURI(99)).to.revertedWith("WingNFT::tokenURI:: token not existed");
      });
    });
    context("when there is no baseURI", () => {
      it("should only return tokenURI", async () => {
        await wingNFT.setBaseURI("");
        await wingNFT.mint(await deployer.getAddress(), 0, "bar");
        expect(await wingNFT.tokenURI(0)).to.eq("bar");
      });
    });

    context("when there are baseURI and tokenURI", () => {
      it("should only return baseURI + tokenURI", async () => {
        await wingNFT.mint(await deployer.getAddress(), 0, "bar");
        expect(await wingNFT.tokenURI(0)).to.eq(`${await wingNFT.baseURI()}bar`);
      });
    });

    context("when there are baseURI, categoryURI, but no tokenURI", () => {
      it("should only return baseURI + categoryURI", async () => {
        await wingNFT.mint(await deployer.getAddress(), 0, "");
        await wingNFT.addCategoryInfo("foo", "baz");
        expect(await wingNFT.tokenURI(0)).to.eq(`${await wingNFT.baseURI()}baz`);
      });
    });

    context("when there is baseURI but no categoryURI and tokenURI", () => {
      it("should return baseURI + tokenID", async () => {
        await wingNFT.mint(await deployer.getAddress(), 0, "");
        expect(await wingNFT.tokenURI(0)).to.eq(`${await wingNFT.baseURI()}0`);
      });
    });
  });

  describe("#addCategoryInfo()", () => {
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingNFTAsBob.addCategoryInfo("NewCatagoryInfo", "/foo/bar")).to.be.revertedWith(
          "WingNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when add catagory info", async () => {
      it("should added category info", async () => {
        expect(await wingNFT.addCategoryInfo("NewCatagoryInfo", "/foo/bar"));
        const { name, timestamp } = await wingNFT.categoryInfo(0);
        expect(name).to.be.eq("NewCatagoryInfo");
      });
    });
  });

  describe("#updateCategoryInfo()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingNFT.updateCategoryInfo(99, "updatedCategoryName", "/foo/bar")).to.be.revertedWith(
          "WingNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingNFTAsBob.updateCategoryInfo(0, "updatedCategoryName", "/foo/bar")).to.be.revertedWith(
          "WingNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when update category info", async () => {
      it("should updated category info", async () => {
        expect(await wingNFT.updateCategoryInfo(0, "updatedCategoryName", "/foo/bar"));
        const { name, timestamp } = await wingNFT.categoryInfo(0);
        expect(name).to.be.eq("updatedCategoryName");
      });

      it("should updated category with some category has been set", async () => {
        expect(await wingNFT.updateCategoryInfo(0, "beforeCategoryName", "/foo/bar"));
        let name = await (await wingNFT.categoryInfo(0)).name;
        expect(name).to.be.eq("beforeCategoryName");

        expect(await wingNFT.updateCategoryInfo(0, "afterCategoryName", "/foo/bar"));
        name = await (await wingNFT.categoryInfo(0)).name;
        expect(name).to.be.eq("afterCategoryName");
      });
    });
  });

  describe("#updateTokenCategory()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingNFT.updateTokenCategory(0, 99)).to.be.revertedWith(
          "WingNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingNFTAsBob.updateTokenCategory(0, 0)).to.be.revertedWith(
          "WingNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when update token category", async () => {
      it("should update token category", async () => {
        await wingNFT.mint(await alice.getAddress(), 0, "tokenURI");
        await wingNFT.addCategoryInfo("foo", "bar");
        expect(await wingNFT.updateTokenCategory(0, 1));
        const tokenCategory = await wingNFT.wingswapNFTToCategory(0);
        expect(tokenCategory).to.be.eq(1);
      });
    });
  });

  describe("#getWingNameOfTokenId()", () => {
    context("when get wing name of token id", async () => {
      it("should get wing name", async () => {
        expect(await wingNFT.getWingNameOfTokenId(0)).to.be.eq("");
      });
    });
  });

  describe("#mint()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingNFT.mint(await alice.getAddress(), 99, "tokenUrl")).to.be.revertedWith(
          "WingNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingNFTAsBob.mint(await alice.getAddress(), 1, "tokenUrl")).to.be.revertedWith(
          "WingNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when caller used to be minter", async () => {
      it("should reverted", async () => {
        await wingNFT.revokeRole(await wingNFT.MINTER_ROLE(), await deployer.getAddress());
        await expect(wingNFT.mint(await alice.getAddress(), 1, "tokenUrl")).to.be.revertedWith(
          "WingNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when paused", async () => {
      it("should reverted", async () => {
        await wingNFT.pause();
        await expect(wingNFT.mint(await alice.getAddress(), 0, "tokenUrl")).to.be.revertedWith(
          "ERC721Pausable: token transfer while paused"
        );
      });
    });

    context("when parameters are valid", async () => {
      context("without rewards to be harvest()", () => {
        context("when category 0", () => {
          it("should mint", async () => {
            const _masterChef = masterChef as unknown as MasterChef;
            await wingNFT.mint(await alice.getAddress(), 0, "tokenUrl");
            const categoryId = await wingNFT.wingswapNFTToCategory(0);
            expect(categoryId).to.be.eq(0);
            const userInfo = await _masterChef.userInfo(ogOwnerToken.address, await alice.getAddress());
            expect(userInfo.fundedBy).to.eq(wingNFT.address);
            expect(userInfo.amount).to.eq(parseEther("1"));
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(
              parseEther("1")
            );
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);
          });
        });

        context("when category > 0", () => {
          it("should mint", async () => {
            const _masterChef = masterChef as unknown as MasterChef;
            // mock this so that mintBatch of category #1 can pass the master chef
            await wingNFT.setCategoryOGOwnerToken(1, ogOwnerToken.address);
            await wingNFT.addCategoryInfo("foo", "bar");
            await wingNFT.mint(await alice.getAddress(), 1, "tokenUrl");
            const categoryId = await wingNFT.wingswapNFTToCategory(0);
            expect(categoryId).to.be.eq(1);
            const userInfo = await _masterChef.userInfo(ogOwnerToken.address, await alice.getAddress());
            expect(userInfo.fundedBy).to.eq(wingNFT.address);
            expect(userInfo.amount).to.eq(parseEther("1"));
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(
              parseEther("1")
            );
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);
          });
        });
      });
      context("with rewards to be harvest()", () => {
        context("when category 0", () => {
          it("should mint along with claiming a reward", async () => {
            const wingNftOwnerAddress = await alice.getAddress();
            const snapshotBlock = await latestBlockNumber();
            await masterChef.smodify.put({
              poolInfo: {
                [ogOwnerToken.address]: {
                  lastRewardBlock: snapshotBlock,
                  accWingPerShare: parseUnits("10", 12).toString(),
                },
              },
              userInfo: {
                [ogOwnerToken.address]: {
                  [wingNftOwnerAddress]: {
                    amount: parseEther("10").toString(),
                    fundedBy: wingNFT.address,
                  },
                },
              },
            });
            // MOCK that master chef has enough WING
            await wingToken.transfer(stake.address, parseEther("100"));
            const _masterChef = masterChef as unknown as MasterChef;
            await wingNFT.mint(wingNftOwnerAddress, 0, "tokenUrl");
            const categoryId = await wingNFT.wingswapNFTToCategory(0);
            expect(categoryId).to.be.eq(0);
            const userInfo = await _masterChef.userInfo(ogOwnerToken.address, wingNftOwnerAddress);
            expect(userInfo.fundedBy).to.eq(wingNFT.address);
            expect(userInfo.amount).to.eq(parseEther("11"));
            // owner is expected to get 100 reward
            expect(await wingToken.balanceOf(wingNftOwnerAddress)).to.eq(parseEther("100"));
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(
              parseEther("1")
            );
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);
          });
        });

        context("when category > 0", () => {
          it("should mint", async () => {
            const wingNftOwnerAddress = await alice.getAddress();
            const snapshotBlock = await latestBlockNumber();
            await masterChef.smodify.put({
              poolInfo: {
                [ogOwnerToken.address]: {
                  lastRewardBlock: snapshotBlock,
                  accWingPerShare: parseUnits("10", 12).toString(),
                },
              },
              userInfo: {
                [ogOwnerToken.address]: {
                  [wingNftOwnerAddress]: {
                    amount: parseEther("10").toString(),
                    fundedBy: wingNFT.address,
                  },
                },
              },
            });
            // MOCK that master chef has enough WING
            await wingToken.transfer(stake.address, parseEther("100"));
            const _masterChef = masterChef as unknown as MasterChef;
            // mock this so that mintBatch of category #1 can pass the master chef
            await wingNFT.setCategoryOGOwnerToken(1, ogOwnerToken.address);
            await wingNFT.addCategoryInfo("foo", "bar");
            await wingNFT.mint(wingNftOwnerAddress, 1, "tokenUrl");
            const categoryId = await wingNFT.wingswapNFTToCategory(0);
            expect(categoryId).to.be.eq(1);
            const userInfo = await _masterChef.userInfo(ogOwnerToken.address, wingNftOwnerAddress);
            expect(userInfo.fundedBy).to.eq(wingNFT.address);
            expect(userInfo.amount).to.eq(parseEther("11"));
            // owner is expected to get 100 reward
            expect(await wingToken.balanceOf(wingNftOwnerAddress)).to.eq(parseEther("100"));
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(
              parseEther("1")
            );
            expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);
          });
        });
      });
    });
  });

  describe("#mintBatch()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingNFT.mintBatch(await alice.getAddress(), 99, "tokenURI", 100)).to.be.revertedWith(
          "WingNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingNFTAsBob.mintBatch(await alice.getAddress(), 0, "tokenURI", 100)).to.be.revertedWith(
          "WingNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when caller used to be minter", async () => {
      it("should reverted", async () => {
        await wingNFT.revokeRole(await wingNFT.MINTER_ROLE(), await deployer.getAddress());
        await expect(wingNFT.mintBatch(await alice.getAddress(), 0, "tokenURI", 100)).to.be.revertedWith(
          "WingNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when paused", async () => {
      it("should reverted", async () => {
        await wingNFT.pause();
        await expect(wingNFT.mintBatch(await alice.getAddress(), 0, "tokenURI", 100)).to.be.revertedWith(
          "ERC721Pausable: token transfer while paused"
        );
      });
    });

    context("when size is zero", async () => {
      it("should reverted", async () => {
        await expect(wingNFT.mintBatch(await alice.getAddress(), 0, "tokenURI", 0)).to.be.revertedWith(
          "WingNFT::mintBatch::size must be granter than zero"
        );
      });
    });

    context("when parameters are valid", async () => {
      context("without rewards to be harvested", () => {
        it("should mint batch", async () => {
          const _masterChef = masterChef as unknown as MasterChef;
          await wingNFT.mintBatch(await alice.getAddress(), 0, "tokenURI", 3);
          expect((await wingNFT.categoryToWingSwapNFTList(0)).length).to.be.eq(3);
          expect(
            (await wingNFT.categoryToWingSwapNFTList(0)).reduce((accum: boolean, tokenId: BigNumber, index: number) => {
              return accum && tokenId.eq(BigNumber.from(index));
            }, true)
          ).to.be.true;
          expect(await wingNFT.wingswapNFTToCategory(0)).to.be.eq(0);
          expect(await wingNFT.wingswapNFTToCategory(1)).to.be.eq(0);
          expect(await wingNFT.wingswapNFTToCategory(2)).to.be.eq(0);
          const userInfo = await _masterChef.userInfo(ogOwnerToken.address, await alice.getAddress());
          expect(userInfo.fundedBy).to.eq(wingNFT.address);
          expect(userInfo.amount).to.eq(parseEther("3"));
        });
      });

      context("with rewards to be harvested", () => {
        it("should mint batch", async () => {
          const wingNftOwnerAddress = await alice.getAddress();
          const snapshotBlock = await latestBlockNumber();
          await masterChef.smodify.put({
            poolInfo: {
              [ogOwnerToken.address]: {
                lastRewardBlock: snapshotBlock,
                accWingPerShare: parseUnits("10", 12).toString(),
              },
            },
            userInfo: {
              [ogOwnerToken.address]: {
                [wingNftOwnerAddress]: {
                  amount: parseEther("10").toString(),
                  fundedBy: wingNFT.address,
                },
              },
            },
          });
          // MOCK that master chef has enough WING
          await wingToken.transfer(stake.address, parseEther("100"));
          const _masterChef = masterChef as unknown as MasterChef;
          await wingNFT.mintBatch(wingNftOwnerAddress, 0, "tokenURI", 3);
          expect((await wingNFT.categoryToWingSwapNFTList(0)).length).to.be.eq(3);
          expect(
            (await wingNFT.categoryToWingSwapNFTList(0)).reduce((accum: boolean, tokenId: BigNumber, index: number) => {
              return accum && tokenId.eq(BigNumber.from(index));
            }, true)
          ).to.be.true;
          expect(await wingNFT.wingswapNFTToCategory(0)).to.be.eq(0);
          expect(await wingNFT.wingswapNFTToCategory(1)).to.be.eq(0);
          expect(await wingNFT.wingswapNFTToCategory(2)).to.be.eq(0);
          const userInfo = await _masterChef.userInfo(ogOwnerToken.address, wingNftOwnerAddress);
          expect(userInfo.fundedBy).to.eq(wingNFT.address);
          expect(userInfo.amount).to.eq(parseEther("13"));
          // owner is expected to get 100 reward
          expect(await wingToken.balanceOf(wingNftOwnerAddress)).to.eq(parseEther("100"));
        });
      });
    });
  });

  describe("#unstake()", () => {
    context("when without og owner token", () => {
      it("should revert", async () => {
        await wingNFT.setCategoryOGOwnerToken(0, constants.AddressZero);
        await expect(wingNFT.unstake(0)).to.revertedWith("WingNFT::withOGOwnerToken:: og owner token not set");
      });
    });

    context("when unstake a non-staking nft", () => {
      it("should revert", async () => {
        await expect(wingNFT.unstake(0)).to.revertedWith("WingNFT::_unstake:: invalid token to be unstaked");
      });
    });

    context("with rewards to be harvest", () => {
      it("should burn an og owner token with a reward harvested", async () => {
        // mock master chef reward for stakingToken[0]
        const ownerAddress = await alice.getAddress();
        // #block 0
        const snapshotBlock = await latestBlockNumber();
        // to avoid "WingNFT::_unstake:: invalid token to be unstaked"
        await wingNFT.mint(ownerAddress, 0, "tokenUrl");
        expect(await wingNFT.ownerOf(0)).to.eq(wingNFT.address);

        // MOCK master chef storages
        await masterChef.smodify.put({
          totalAllocPoint: 1000, // mock that there is only a single pool getting ALL rewards
          poolInfo: {
            [ogOwnerToken.address]: {
              lastRewardBlock: snapshotBlock.sub(7).toString(), // want to have a gap between last reward block and unstake block
            },
          },
        });

        // MOCK that master chef has enough WING
        await wingToken.transfer(stake.address, parseEther("100"));
        const _masterChef = masterChef as unknown as MasterChef;
        await wingNFTAsAlice.unstake(0);
        let userInfo = await _masterChef.userInfo(ogOwnerToken.address, ownerAddress);
        expect(userInfo.fundedBy).to.eq(constants.AddressZero);
        expect(userInfo.amount).to.eq(parseEther("0"));
        // owner is expected to get 100 reward
        expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("100"));
        expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(0);
        expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);

        await wingNFTAsAlice.approve(wingNFT.address, 0);
        await wingNFTAsAlice.stake(0);
        const categoryId = await wingNFT.wingswapNFTToCategory(0);
        expect(categoryId).to.be.eq(0);
        userInfo = await _masterChef.userInfo(ogOwnerToken.address, ownerAddress);
        expect(userInfo.fundedBy).to.eq(wingNFT.address);
        expect(userInfo.amount).to.eq(parseEther("1"));
        expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(parseEther("1"));
        expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);
      });
    });

    context("without rewards to be harvest", () => {
      it("should burn an og owner token", async () => {
        // mock master chef reward for stakingToken[0]
        const ownerAddress = await alice.getAddress();
        // #block 0
        const snapshotBlock = await latestBlockNumber();
        // to avoid "WingNFT::_unstake:: invalid token to be unstaked"
        await wingNFT.mint(ownerAddress, 0, "tokenUrl");
        expect(await wingNFT.ownerOf(0)).to.eq(wingNFT.address);

        // MOCK master chef storages
        await masterChef.smodify.put({
          totalAllocPoint: 1000, // mock that there is only a single pool getting ALL rewards
          poolInfo: {
            [ogOwnerToken.address]: {
              lastRewardBlock: snapshotBlock.add(2).toString(), // want to have ZERO a gap between last reward block and unstake block
            },
          },
        });

        // MOCK that master chef has enough WING
        const _masterChef = masterChef as unknown as MasterChef;
        await wingNFTAsAlice.unstake(0);
        const userInfo = await _masterChef.userInfo(ogOwnerToken.address, ownerAddress);
        expect(userInfo.fundedBy).to.eq(constants.AddressZero);
        expect(userInfo.amount).to.eq(parseEther("0"));
        // owner is expected to get 100 reward
        expect(await wingToken.balanceOf(ownerAddress)).to.eq(parseEther("0"));
        expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(masterChef.address)).to.eq(0);
        expect(await (ogOwnerToken as unknown as OGOwnerToken).balanceOf(wingNFT.address)).to.eq(0);
      });
    });
  });

  describe("#setWingName()", () => {
    context("when caller is not a governance", async () => {
      it("should reverted", async () => {
        await expect(wingNFTAsBob.setWingName(0, "settedName")).to.be.revertedWith(
          "WingNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when caller used to be governance", async () => {
      it("should reverted", async () => {
        await wingNFT.revokeRole(await wingNFT.GOVERNANCE_ROLE(), await deployer.getAddress());
        await expect(wingNFT.setWingName(0, "settedName")).to.be.revertedWith(
          "WingNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when set wing name", async () => {
      it("should setted wing name", async () => {
        expect(await wingNFT.setWingName(0, "settedName"));
        expect(await wingNFT.wingNames(0)).to.be.eq("settedName");
      });
    });
  });

  describe("#pause()", () => {
    context("when paused", async () => {
      it("should reverted", async () => {
        await wingNFT.pause();
        await expect(wingNFT.pause()).to.be.revertedWith("Pausable: paused");
      });
    });
    context("when not paused", async () => {
      it("should paused", async () => {
        await wingNFT.pause();
        expect(await wingNFT.paused()).to.be.true;
      });
    });
  });

  describe("#unpause()", () => {
    context("when the owner is a governance", () => {
      context("when paused", async () => {
        it("should unpause", async () => {
          await wingNFT.pause();
          expect(await wingNFT.unpause());
          expect(await wingNFT.paused()).to.be.false;
        });
      });

      context("when not paused", async () => {
        it("should reverted", async () => {
          await expect(wingNFT.unpause()).to.be.revertedWith("Pausable: not paused");
        });
      });
    });
    context("when the own is not a governance", () => {
      it("should not be able to unpause or pause", async () => {
        await wingNFT.renounceRole(await wingNFT.GOVERNANCE_ROLE(), await deployer.getAddress());
        await expect(wingNFT.pause()).to.revertedWith("WingNFT::onlyGovernance::only GOVERNANCE role");
        await expect(wingNFT.unpause()).to.revertedWith("WingNFT::onlyGovernance::only GOVERNANCE role");
      });
    });
  });

  describe("#harvest()", () => {
    context("when incorrect category (og owner token for this category not set)", () => {
      it("should revert", async () => {
        const wingNftOwnerAddress = await alice.getAddress();
        const snapshotBlock = await latestBlockNumber();
        await masterChef.smodify.put({
          poolInfo: {
            [ogOwnerToken.address]: {
              lastRewardBlock: snapshotBlock,
              accWingPerShare: parseUnits("10", 12).toString(),
            },
          },
          userInfo: {
            [ogOwnerToken.address]: {
              [wingNftOwnerAddress]: {
                amount: parseEther("10").toString(),
                fundedBy: wingNFT.address,
              },
            },
          },
        });
        // MOCK that master chef has enough WING
        await wingToken.transfer(stake.address, parseEther("100"));
        await expect(wingNFTAsAlice["harvest(uint256)"](50)).to.revertedWith("WingNFT::harvest:: og owner token not set");
      });
    });
    context("when single harvest()", () => {
      it("should successfully harvest", async () => {
        const wingNftOwnerAddress = await alice.getAddress();
        const snapshotBlock = await latestBlockNumber();
        await masterChef.smodify.put({
          poolInfo: {
            [ogOwnerToken.address]: {
              lastRewardBlock: snapshotBlock,
              accWingPerShare: parseUnits("10", 12).toString(),
            },
          },
          userInfo: {
            [ogOwnerToken.address]: {
              [wingNftOwnerAddress]: {
                amount: parseEther("10").toString(),
                fundedBy: wingNFT.address,
              },
            },
          },
        });
        // MOCK that master chef has enough WING
        await wingToken.transfer(stake.address, parseEther("100"));
        const _masterChef = masterChef as unknown as MasterChef;
        await wingNFTAsAlice["harvest(uint256)"](0);
        expect((await wingNFT.categoryToWingSwapNFTList(0)).length).to.be.eq(0);
        expect(
          (await wingNFT.categoryToWingSwapNFTList(0)).reduce((accum: boolean, tokenId: BigNumber, index: number) => {
            return accum && tokenId.eq(BigNumber.from(index));
          }, true)
        ).to.be.true;
        const userInfo = await _masterChef.userInfo(ogOwnerToken.address, wingNftOwnerAddress);
        expect(userInfo.fundedBy).to.eq(wingNFT.address);
        expect(userInfo.amount).to.eq(parseEther("10"));
        // owner is expected to get 100 reward
        expect(await wingToken.balanceOf(wingNftOwnerAddress)).to.eq(parseEther("100"));
      });
    });
  });
});
