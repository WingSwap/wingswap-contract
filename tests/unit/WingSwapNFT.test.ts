import chai from "chai";
import { ethers, upgrades, waffle } from "hardhat";
import { WingSwapNFT, WingSwapNFT__factory } from "../../typechain";
import { solidity } from "ethereum-waffle";
import { BigNumber, Signer } from "ethers";
import { wingswapNFTUnitTestFixture } from "../helpers/fixtures/WingSwapNFT";
import { countReset } from "console";
import exp from "constants";
import { getAddress } from "@ethersproject/address";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

chai.use(solidity);
const { expect } = chai;

describe("WingSwapNFT", () => {
  // WingSwapNFT instances
  let wingswapNFT: WingSwapNFT;
  let wingswapNFTAsBob: WingSwapNFT;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    ({ wingswapNFT } = await waffle.loadFixture(wingswapNFTUnitTestFixture));

    wingswapNFTAsBob = WingSwapNFT__factory.connect(wingswapNFT.address, bob);
  });

  describe("#currentTokenId", () => {
    it("should update current token id", async () => {
      expect(await wingswapNFT.currentTokenId()).to.eq(0);
      await wingswapNFT.mint(await eve.getAddress(), 0, "tokenURI");
      expect(await wingswapNFT.currentTokenId()).to.eq(1);
    });
  });

  describe("#currentTokenId", () => {
    it("should update current token id", async () => {
      expect(await wingswapNFT.currentCategoryId()).to.eq(0);
      await wingswapNFT.addCategoryInfo("first cat", "");
      expect(await wingswapNFT.currentCategoryId()).to.eq(1);
      await wingswapNFT.addCategoryInfo("second cat", "");
      expect(await wingswapNFT.currentCategoryId()).to.eq(2);
    });
  });

  describe("#categoryToWingSwapNFTList()", () => {
    it("should return a list of tokenIds", async () => {
      await wingswapNFT.mintBatch(await deployer.getAddress(), 0, "", 5);
      await wingswapNFT.addCategoryInfo("foo0", "bar0"); //add category info 0, now current is 1
      await wingswapNFT.addCategoryInfo("foo1", "bar1"); //add category info 1, now current is 2
      await wingswapNFT.mintBatch(await deployer.getAddress(), 1, "", 1);
      await wingswapNFT.mintBatch(await deployer.getAddress(), 0, "", 5);

      expect(
        (await wingswapNFT.categoryToWingSwapNFTList(0)).map((tokenId: BigNumber) => {
          return tokenId.toNumber();
        })
      ).to.deep.eq([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]);

      expect(
        (await wingswapNFT.categoryToWingSwapNFTList(1)).map((tokenId: BigNumber) => {
          return tokenId.toNumber();
        })
      ).to.deep.eq([5]);

      expect(
        (await wingswapNFT.categoryToWingSwapNFTList(2)).map((tokenId: BigNumber) => {
          return tokenId.toNumber();
        })
      ).to.deep.eq([]);
    });
  });

  describe("#categoryURI()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingswapNFT.categoryURI(99)).to.revertedWith(
          "WingSwapNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when there is no baseURI", () => {
      it("should only return categoryURI", async () => {
        await wingswapNFT.setBaseURI("");
        await wingswapNFT.addCategoryInfo("foo", "bar");
        expect(await wingswapNFT.categoryURI(0)).to.eq("bar");
      });
    });

    context("when there are baseURI and categoryURI", () => {
      it("should only return baseURI + categoryURI", async () => {
        await wingswapNFT.addCategoryInfo("foo", "bar");
        expect(await wingswapNFT.categoryURI(0)).to.eq(`${await wingswapNFT.baseURI()}bar`);
      });
    });

    context("when there is baseURI but no categoryURI", () => {
      it("should return baseURI + categoryID", async () => {
        expect(await wingswapNFT.categoryURI(0)).to.eq(`${await wingswapNFT.baseURI()}0`);
      });
    });
  });

  describe("#tokenURI()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingswapNFT.tokenURI(99)).to.revertedWith("WingSwapNFT::tokenURI:: token not existed");
      });
    });
    context("when there is no baseURI", () => {
      it("should only return tokenURI", async () => {
        await wingswapNFT.setBaseURI("");
        await wingswapNFT.mint(await deployer.getAddress(), 0, "bar");
        expect(await wingswapNFT.tokenURI(0)).to.eq("bar");
      });
    });

    context("when there are baseURI and tokenURI", () => {
      it("should only return baseURI + tokenURI", async () => {
        await wingswapNFT.mint(await deployer.getAddress(), 0, "bar");
        expect(await wingswapNFT.tokenURI(0)).to.eq(`${await wingswapNFT.baseURI()}bar`);
      });
    });

    context("when there are baseURI, categoryURI, but no tokenURI", () => {
      it("should only return baseURI + categoryURI", async () => {
        await wingswapNFT.mint(await deployer.getAddress(), 0, "");
        await wingswapNFT.addCategoryInfo("foo", "baz");
        expect(await wingswapNFT.tokenURI(0)).to.eq(`${await wingswapNFT.baseURI()}baz`);
      });
    });

    context("when there is baseURI but no categoryURI and tokenURI", () => {
      it("should return baseURI + tokenID", async () => {
        await wingswapNFT.mint(await deployer.getAddress(), 0, "");
        expect(await wingswapNFT.tokenURI(0)).to.eq(`${await wingswapNFT.baseURI()}0`);
      });
    });
  });

  describe("#addCategoryInfo()", () => {
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFTAsBob.addCategoryInfo("NewCatagoryInfo", "/foo/bar")).to.be.revertedWith(
          "WingSwapNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when add catagory info", async () => {
      it("should added category info", async () => {
        expect(await wingswapNFT.addCategoryInfo("NewCatagoryInfo", "/foo/bar"));
        const { name, timestamp } = await wingswapNFT.categoryInfo(0);
        expect(name).to.be.eq("NewCatagoryInfo");
      });
    });
  });

  describe("#updateCategoryInfo()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingswapNFT.updateCategoryInfo(99, "updatedCategoryName", "/foo/bar")).to.be.revertedWith(
          "WingSwapNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFTAsBob.updateCategoryInfo(0, "updatedCategoryName", "/foo/bar")).to.be.revertedWith(
          "WingSwapNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when update category info", async () => {
      it("should updated category info", async () => {
        expect(await wingswapNFT.updateCategoryInfo(0, "updatedCategoryName", "/foo/bar"));
        const { name, timestamp } = await wingswapNFT.categoryInfo(0);
        expect(name).to.be.eq("updatedCategoryName");
      });

      it("should updated category with some category has been set", async () => {
        expect(await wingswapNFT.updateCategoryInfo(0, "beforeCategoryName", "/foo/bar"));
        let name = await (await wingswapNFT.categoryInfo(0)).name;
        expect(name).to.be.eq("beforeCategoryName");

        expect(await wingswapNFT.updateCategoryInfo(0, "afterCategoryName", "/foo/bar"));
        name = await (await wingswapNFT.categoryInfo(0)).name;
        expect(name).to.be.eq("afterCategoryName");
      });
    });
  });

  describe("#updateTokenCategory()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingswapNFT.updateTokenCategory(0, 99)).to.be.revertedWith(
          "WingSwapNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFTAsBob.updateTokenCategory(0, 0)).to.be.revertedWith(
          "WingSwapNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when update token category", async () => {
      it("should update token category", async () => {
        await wingswapNFT.mint(await eve.getAddress(), 0, "tokenURI");
        await wingswapNFT.addCategoryInfo("foo", "bar");
        expect(await wingswapNFT.updateTokenCategory(0, 1));
        const tokenCategory = await wingswapNFT.wingswapNFTToCategory(0);
        expect(tokenCategory).to.be.eq(1);
      });
    });
  });

  describe("#getWingNameOfTokenId()", () => {
    context("when get wing name of token id", async () => {
      it("should get wing name", async () => {
        expect(await wingswapNFT.getWingNameOfTokenId(0)).to.be.eq("");
      });
    });
  });

  describe("#mint()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingswapNFT.mint(await eve.getAddress(), 99, "tokenUrl")).to.be.revertedWith(
          "WingSwapNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFTAsBob.mint(await eve.getAddress(), 1, "tokenUrl")).to.be.revertedWith(
          "WingSwapNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when caller used to be minter", async () => {
      it("should reverted", async () => {
        await wingswapNFT.revokeRole(await wingswapNFT.MINTER_ROLE(), await deployer.getAddress());
        await expect(wingswapNFT.mint(await eve.getAddress(), 1, "tokenUrl")).to.be.revertedWith(
          "WingSwapNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when paused", async () => {
      it("should reverted", async () => {
        await wingswapNFT.pause();
        await expect(wingswapNFT.mint(await eve.getAddress(), 0, "tokenUrl")).to.be.revertedWith(
          "ERC721Pausable: token transfer while paused"
        );
      });
    });

    context("when mint", async () => {
      context("when category 0", () => {
        it("should mint", async () => {
          expect(await wingswapNFT.mint(await eve.getAddress(), 0, "tokenUrl"));
          const categoryId = await wingswapNFT.wingswapNFTToCategory(0);
          expect(categoryId).to.be.eq(0);
        });
      });

      context("when category > 0", () => {
        it("should mint", async () => {
          await wingswapNFT.addCategoryInfo("foo", "bar");
          expect(await wingswapNFT.mint(await eve.getAddress(), 1, "tokenUrl"));
          const categoryId = await wingswapNFT.wingswapNFTToCategory(0);
          expect(categoryId).to.be.eq(1);
        });
      });
    });
  });

  describe("#mintBatch()", () => {
    context("when category is yet to be existed", () => {
      it("should revert", async () => {
        await expect(wingswapNFT.mintBatch(await eve.getAddress(), 99, "tokenURI", 100)).to.be.revertedWith(
          "WingSwapNFT::onlyExistingCategoryId::categoryId not existed"
        );
      });
    });
    context("when caller is not owner", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFTAsBob.mintBatch(await eve.getAddress(), 0, "tokenURI", 100)).to.be.revertedWith(
          "WingSwapNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when caller used to be minter", async () => {
      it("should reverted", async () => {
        await wingswapNFT.revokeRole(await wingswapNFT.MINTER_ROLE(), await deployer.getAddress());
        await expect(wingswapNFT.mintBatch(await eve.getAddress(), 0, "tokenURI", 100)).to.be.revertedWith(
          "WingSwapNFT::onlyMinter::only MINTER role"
        );
      });
    });

    context("when paused", async () => {
      it("should reverted", async () => {
        await wingswapNFT.pause();
        await expect(wingswapNFT.mintBatch(await eve.getAddress(), 0, "tokenURI", 100)).to.be.revertedWith(
          "ERC721Pausable: token transfer while paused"
        );
      });
    });

    context("when size is zero", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFT.mintBatch(await eve.getAddress(), 0, "tokenURI", 0)).to.be.revertedWith(
          "WingSwapNFT::mintBatch::size must be granter than zero"
        );
      });
    });

    context("when mint batch", async () => {
      it("should mint batch", async () => {
        await expect(wingswapNFT.mintBatch(await eve.getAddress(), 0, "tokenURI", 3));

        expect((await wingswapNFT.categoryToWingSwapNFTList(0)).length).to.be.eq(3);
        expect(
          (await wingswapNFT.categoryToWingSwapNFTList(0)).reduce((accum: boolean, tokenId: BigNumber, index: number) => {
            return accum && tokenId.eq(BigNumber.from(index));
          }, true)
        ).to.be.true;
        expect(await wingswapNFT.wingswapNFTToCategory(0)).to.be.eq(0);
        expect(await wingswapNFT.wingswapNFTToCategory(1)).to.be.eq(0);
        expect(await wingswapNFT.wingswapNFTToCategory(2)).to.be.eq(0);
      });
    });
  });

  describe("#setWingName()", () => {
    context("when caller is not a governance", async () => {
      it("should reverted", async () => {
        await expect(wingswapNFTAsBob.setWingName(0, "settedName")).to.be.revertedWith(
          "WingSwapNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when caller used to be governance", async () => {
      it("should reverted", async () => {
        await wingswapNFT.revokeRole(await wingswapNFT.GOVERNANCE_ROLE(), await deployer.getAddress());
        await expect(wingswapNFT.setWingName(0, "settedName")).to.be.revertedWith(
          "WingSwapNFT::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when set wing name", async () => {
      it("should setted wing name", async () => {
        expect(await wingswapNFT.setWingName(0, "settedName"));
        expect(await wingswapNFT.wingNames(0)).to.be.eq("settedName");
      });
    });
  });

  describe("#pause()", () => {
    context("when paused", async () => {
      it("should reverted", async () => {
        await wingswapNFT.pause();
        await expect(wingswapNFT.pause()).to.be.revertedWith("Pausable: paused");
      });
    });
    context("when not paused", async () => {
      it("should paused", async () => {
        await wingswapNFT.pause();
        expect(await wingswapNFT.paused()).to.be.true;
      });
    });
  });

  describe("#unpause()", () => {
    context("when the owner is a governance", () => {
      context("when paused", async () => {
        it("should unpause", async () => {
          await wingswapNFT.pause();
          expect(await wingswapNFT.unpause());
          expect(await wingswapNFT.paused()).to.be.false;
        });
      });

      context("when not paused", async () => {
        it("should reverted", async () => {
          await expect(wingswapNFT.unpause()).to.be.revertedWith("Pausable: not paused");
        });
      });
    });
    context("when the own is not a governance", () => {
      it("should not be able to unpause or pause", async () => {
        await wingswapNFT.renounceRole(await wingswapNFT.GOVERNANCE_ROLE(), await deployer.getAddress());
        await expect(wingswapNFT.pause()).to.revertedWith("WingSwapNFT::onlyGovernance::only GOVERNANCE role");
        await expect(wingswapNFT.unpause()).to.revertedWith("WingSwapNFT::onlyGovernance::only GOVERNANCE role");
      });
    });
  });
});
