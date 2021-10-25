import { ethers, waffle } from "hardhat";
import { Overrides, BigNumberish, utils, BigNumber, Signer, constants } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  WingMarket,
  WingMarket__factory,
  WingSwapNFT,
  MockWBNB,
  SimpleToken,
  SimpleToken__factory,
  WNativeRelayer,
} from "../../typechain";
import { ModifiableContract } from "@eth-optimism/smock";
import { wingMarketUnitTestFixture } from "../helpers";
import { parseEther } from "ethers/lib/utils";
import { advanceBlockTo, latestBlockNumber } from "../helpers/time";
import { O_TRUNC } from "constants";

chai.use(solidity);
const { expect } = chai;

describe("WingMarket", () => {
  // from the fixture
  let FEE_ADDR: string;
  let FEE_BPS: number;
  let stakingTokens: Array<SimpleToken>;
  let wbnb: MockWBNB;
  let wNativeRelayer: WNativeRelayer;
  let wingswapNFT: ModifiableContract;
  let wingMarket: WingMarket;
  let startingBlock: BigNumber;

  // actors
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  // binding
  let wingMarketAsAlice: WingMarket;
  let wingMarketAsBob: WingMarket;

  // Lambdas
  let signatureFn: (signer: Signer, msg?: string) => Promise<string>;
  let signatureAsDeployer: string;
  let signatureAsAlice: string;
  let signatureAsBob: string;

  beforeEach(async () => {
    ({ stakingTokens, signatureFn, wbnb, wNativeRelayer, wingswapNFT, wingMarket, startingBlock } =
      await waffle.loadFixture(wingMarketUnitTestFixture));
    [deployer, alice, bob, dev] = await ethers.getSigners();

    // binding
    wingMarketAsAlice = WingMarket__factory.connect(wingMarket.address, alice);
    wingMarketAsBob = WingMarket__factory.connect(wingMarket.address, bob);
    signatureAsDeployer = await signatureFn(deployer);
    signatureAsAlice = await signatureFn(alice);
    signatureAsBob = await signatureFn(bob);
  });

  describe("#readyToSellNFT()", () => {
    context("if the nft hasn't been supported", () => {
      it("should revert", async () => {
        await expect(
          wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(100),
            startingBlock.add(101),
            stakingTokens[0].address
          )
        ).to.revertedWith("WingMarket::onlySupportedNFT::unsupported nft");
      });
    });

    context("if the seller is not a governance", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await expect(
          wingMarketAsAlice.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(100),
            startingBlock.add(101),
            stakingTokens[0].address
          )
        ).to.revertedWith("WingMarket::onlyGovernance::only GOVERNANCE role");
      });
    });

    context("if the nft to sell already in the auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(100),
          startingBlock.add(101),
          stakingTokens[0].address
        );
        await expect(
          wingMarketAsAlice.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(100),
            startingBlock.add(101),
            stakingTokens[0].address
          )
        ).to.revertedWith("WingMarket::onlyNonBiddingNFT::only selling token can be used here");
      });
    });

    context("when the quoteToken is address(0)", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await expect(
          wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("0"),
            1,
            startingBlock.add(100),
            startingBlock.add(101),
            constants.AddressZero
          )
        ).to.revertedWith("WingMarket::_setCurrentPrice::invalid quote token");
      });
    });

    context("when invalid block", () => {
      context("when starting < current block", () => {
        it("should revert", async () => {
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await expect(
            wingMarket.readyToSellNFT(wingswapNFT.address, 0, parseEther("0"), 1, 0, 1, stakingTokens[0].address)
          ).to.revertedWith("WingMarket::_setWingSwapNFTMetadata::invalid start or end block");
        });
      });

      context("when starting >= end block", () => {
        it("should revert", async () => {
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await expect(
            wingMarket.readyToSellNFT(
              wingswapNFT.address,
              0,
              parseEther("0"),
              1,
              startingBlock.add(100),
              startingBlock.add(99),
              stakingTokens[0].address
            )
          ).to.revertedWith("WingMarket::_setWingSwapNFTMetadata::invalid start or end block");
        });
      });
    });

    context("when duplicate sell", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await expect(
          wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(100),
            startingBlock.add(101),
            stakingTokens[0].address
          )
        )
          .to.emit(wingMarket, "Ask")
          .withArgs(await deployer.getAddress(), wingswapNFT.address, 0, parseEther("10"), stakingTokens[0].address)
          .to.emit(wingMarket, "SetWingSwapNFTMetadata")
          .withArgs(wingswapNFT.address, 0, 1, startingBlock.add(100), startingBlock.add(101));
        const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
        expect(metadata.isBidding).to.eq(false);
        expect(metadata.quoteBep20).to.eq(stakingTokens[0].address);
        expect(metadata.cap).to.eq(1);
        expect(metadata.startBlock).to.eq(startingBlock.add(100));
        expect(metadata.endBlock).to.eq(startingBlock.add(101));
        expect(metadata.price).to.eq(parseEther("10"));

        await expect(
          wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(100),
            startingBlock.add(101),
            stakingTokens[0].address
          )
        ).to.revertedWith("WingMarket::_readyToSellNFTTo::duplicated entry");
      });
    });

    it("should create a correct wingswapNFTMetadata", async () => {
      await wingMarket.setSupportNFT([wingswapNFT.address], true);
      await expect(
        wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(100),
          startingBlock.add(101),
          stakingTokens[0].address
        )
      )
        .to.emit(wingMarket, "Ask")
        .withArgs(await deployer.getAddress(), wingswapNFT.address, 0, parseEther("10"), stakingTokens[0].address)
        .to.emit(wingMarket, "SetWingSwapNFTMetadata")
        .withArgs(wingswapNFT.address, 0, 1, startingBlock.add(100), startingBlock.add(101));
      const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
      expect(metadata.isBidding).to.eq(false);
      expect(metadata.quoteBep20).to.eq(stakingTokens[0].address);
      expect(metadata.cap).to.eq(1);
      expect(metadata.startBlock).to.eq(startingBlock.add(100));
      expect(metadata.endBlock).to.eq(startingBlock.add(101));
      expect(metadata.price).to.eq(parseEther("10"));
    });
  });

  describe("#buyNFT", () => {
    context("when buying a non-support nft", () => {
      it("should revert", async () => {
        await expect(wingMarketAsAlice.buyNFT(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::onlySupportedNFT::unsupported nft"
        );
      });
    });
    context("when the selling nft is not within the blockrange", () => {
      it("should revert", async () => {
        // selling phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(100),
          startingBlock.add(101),
          stakingTokens[0].address
        );

        // buying phase
        await expect(wingMarketAsAlice.buyNFT(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::withinBlockRange:: invalid block number"
        );
      });
    });

    context("when the selling nft is already in the auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.buyNFT(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::onlyNonBiddingNFT::only selling token can be used here"
        );
      });
    });

    context("when reaching a maximum cap", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          0,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.buyNFT(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::_decreaseCap::maximum mint cap reached"
        );
      });
    });

    context("when a token is a native", () => {
      context("with msg.value", () => {
        context("when amount != msg.value", () => {
          it("should revert", async () => {
            const seller = await deployer.getAddress();
            // preparation phase
            const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
            await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
            // sell phase
            await wingMarket.setSupportNFT([wingswapNFT.address], true);
            await wingMarket.readyToSellNFT(
              wingswapNFT.address,
              0,
              parseEther("10"),
              1,
              startingBlock.add(4),
              startingBlock.add(10),
              wbnb.address
            );

            // buy phase
            await expect(
              wingMarketAsAlice.buyNFT(wingswapNFT.address, 0, {
                value: parseEther("11"),
              })
            ).to.revertedWith("wingMarket::_safeWrap:: value != msg.value");
          });
        });
      });
      it("should be able to mint a token with transfer wNative back to the seller", async () => {
        const seller = await deployer.getAddress();
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // sell phase
        const latestBlock = await latestBlockNumber();
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(4),
          startingBlock.add(10),
          wbnb.address
        );

        // buy phase
        const balBefore = await alice.getBalance();
        const tx = await wingMarketAsAlice.buyNFT(wingswapNFT.address, 0, {
          value: parseEther("10"),
        });
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed;
        const balAfter = await alice.getBalance();
        expect(await wbnb.balanceOf(await dev.getAddress())).to.eq(parseEther("1"));
        expect(await wbnb.balanceOf(seller)).to.eq(parseEther("9"));
        expect(balAfter).to.eq(balBefore.sub(parseEther("10").add((await ethers.provider.getGasPrice()).mul(gasUsed))));
        expect(await _wingswapNFT.ownerOf(0)).to.eq(await alice.getAddress());
      });
    });

    context("when a token is not a native", () => {
      context("with msg.value", () => {
        it("should revert", async () => {
          const seller = await deployer.getAddress();
          // preparation phase
          const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
          await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
          // sell phase
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(4),
            startingBlock.add(10),
            stakingTokens[0].address
          );

          // buy phase
          await expect(
            wingMarketAsAlice.buyNFT(wingswapNFT.address, 0, {
              value: parseEther("10"),
            })
          ).to.revertedWith("wingMarket::_safeWrap:: baseToken is not wNative");
        });
      });

      context("when cancel", () => {
        it("should revert with within block range", async () => {
          const seller = await deployer.getAddress();
          // preparation phase
          const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
          await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
          // sell phase
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(4),
            startingBlock.add(10),
            stakingTokens[0].address
          );

          await wingMarket.cancelSellNFT(wingswapNFT.address, 0);
          expect(await wingMarket.tokenCategorySellers(wingswapNFT.address, 0)).to.eq(constants.AddressZero);
          const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
          expect(metadata.isBidding).to.eq(false);
          expect(metadata.quoteBep20).to.eq(constants.AddressZero);
          expect(metadata.cap).to.eq(0);
          expect(metadata.startBlock).to.eq(0);
          expect(metadata.endBlock).to.eq(0);
          expect(metadata.price).to.eq(parseEther("0"));

          // buy phase
          await expect(wingMarketAsAlice.buyNFT(wingswapNFT.address, 0)).to.revertedWith(
            "WingMarket::withinBlockRange:: invalid block number"
          );
        });
      });
      it("should be able to mint a token with transfer a token back to the seller", async () => {
        const seller = await deployer.getAddress();
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // sell phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(4),
          startingBlock.add(10),
          stakingTokens[0].address
        );

        // buy phase
        const stakingTokenAsAlice = SimpleToken__factory.connect(stakingTokens[0].address, alice);
        await stakingTokens[0].mint(await alice.getAddress(), parseEther("10"));
        await stakingTokenAsAlice.approve(wingMarket.address, parseEther("10"));
        await wingMarketAsAlice.buyNFT(wingswapNFT.address, 0);
        expect(await stakingTokens[0].balanceOf(await dev.getAddress())).to.eq(parseEther("1"));
        expect(await stakingTokens[0].balanceOf(seller)).to.eq(parseEther("9"));
        expect(await _wingswapNFT.ownerOf(0)).to.eq(await alice.getAddress());
        expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(0);
      });
    });
  });

  describe("#buyBatchNFT", () => {
    context("when buying a non-support nft", () => {
      it("should revert", async () => {
        await expect(wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2)).to.revertedWith(
          "WingMarket::onlySupportedNFT::unsupported nft"
        );
      });
    });
    context("when the selling nft is not within the blockrange", () => {
      it("should revert", async () => {
        // selling phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(100),
          startingBlock.add(101),
          stakingTokens[0].address
        );

        // buying phase
        await expect(wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2)).to.revertedWith(
          "WingMarket::buyBatchNFT:: invalid block number"
        );
      });
    });

    context("when the selling nft is already in the auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2)).to.revertedWith(
          "WingMarket::onlyNonBiddingNFT::only selling token can be used here"
        );
      });
    });

    context("when exceeds a maximum cap", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2)).to.revertedWith(
          "WingMarket::_decreaseCap::maximum mint cap reached"
        );
      });
    });

    context("when a token is a native", () => {
      context("with msg.value", () => {
        context("when amount != msg.value", () => {
          it("should revert", async () => {
            const seller = await deployer.getAddress();
            // preparation phase
            const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
            await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
            // sell phase
            await wingMarket.setSupportNFT([wingswapNFT.address], true);
            await wingMarket.readyToSellNFT(
              wingswapNFT.address,
              0,
              parseEther("10"),
              2,
              startingBlock.add(4),
              startingBlock.add(10),
              wbnb.address
            );

            // buy phase
            await expect(
              wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2, {
                value: parseEther("11"),
              })
            ).to.revertedWith("wingMarket::_safeWrap:: value != msg.value");
          });
        });
      });
      it("should be able to mint a token with transfer wNative back to the seller", async () => {
        const seller = await deployer.getAddress();
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // sell phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          3,
          startingBlock.add(4),
          startingBlock.add(10),
          wbnb.address
        );

        // buy phase
        const balBefore = await alice.getBalance();
        const tx = await wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2, {
          value: parseEther("20"),
        });
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed;
        const balAfter = await alice.getBalance();
        expect(await wbnb.balanceOf(await dev.getAddress())).to.eq(parseEther("2"));
        expect(await wbnb.balanceOf(seller)).to.eq(parseEther("18"));
        expect(balAfter).to.eq(balBefore.sub(parseEther("20").add((await ethers.provider.getGasPrice()).mul(gasUsed))));
        expect(await _wingswapNFT.ownerOf(0)).to.eq(await alice.getAddress());
        expect((await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0)).cap).to.eq(1);
      });
    });

    context("when a token is not a native", () => {
      context("with msg.value", () => {
        it("should revert", async () => {
          const seller = await deployer.getAddress();
          // preparation phase
          const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
          await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
          // sell phase
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            2,
            startingBlock.add(4),
            startingBlock.add(10),
            stakingTokens[0].address
          );

          // buy phase
          await expect(
            wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2, {
              value: parseEther("10"),
            })
          ).to.revertedWith("wingMarket::_safeWrap:: baseToken is not wNative");
        });
      });

      context("when cancel", () => {
        it("should revert with within block range", async () => {
          const seller = await deployer.getAddress();
          // preparation phase
          const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
          await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
          // sell phase
          const latestBlock = await latestBlockNumber();
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await wingMarket.readyToSellNFT(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(4),
            startingBlock.add(10),
            stakingTokens[0].address
          );

          await wingMarket.cancelSellNFT(wingswapNFT.address, 0);
          expect(await wingMarket.tokenCategorySellers(wingswapNFT.address, 0)).to.eq(constants.AddressZero);
          const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
          expect(metadata.isBidding).to.eq(false);
          expect(metadata.quoteBep20).to.eq(constants.AddressZero);
          expect(metadata.cap).to.eq(0);
          expect(metadata.startBlock).to.eq(0);
          expect(metadata.endBlock).to.eq(0);
          expect(metadata.price).to.eq(parseEther("0"));

          // buy phase
          await expect(wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2)).to.revertedWith(
            "WingMarket::buyBatchNFT:: invalid block number"
          );
        });
      });
      it("should be able to mint a token with transfer a token back to the seller", async () => {
        const seller = await deployer.getAddress();
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // sell phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          3,
          startingBlock.add(4),
          startingBlock.add(10),
          stakingTokens[0].address
        );

        // buy phase
        const stakingTokenAsAlice = SimpleToken__factory.connect(stakingTokens[0].address, alice);
        await stakingTokens[0].mint(await alice.getAddress(), parseEther("20"));
        await stakingTokenAsAlice.approve(wingMarket.address, parseEther("20"));
        await wingMarketAsAlice.buyBatchNFT(wingswapNFT.address, 0, 2);
        expect(await stakingTokens[0].balanceOf(await dev.getAddress())).to.eq(parseEther("2"));
        expect(await stakingTokens[0].balanceOf(seller)).to.eq(parseEther("18"));
        expect(await _wingswapNFT.ownerOf(0)).to.eq(await alice.getAddress());
        expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(0);
        expect((await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0)).cap).to.eq(1);
      });
    });
  });

  describe("#setCurrentPrice", () => {
    context("when setting price of a token that is in an auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarket.setCurrentPrice(wingswapNFT.address, 0, parseEther("50"), wbnb.address)).to.revertedWith(
          "WingMarket::onlyNonBiddingNFT::only selling token can be used here"
        );
      });
    });

    context("when setting price of a token if address(0)", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(
          wingMarket.setCurrentPrice(wingswapNFT.address, 0, parseEther("50"), constants.AddressZero)
        ).to.revertedWith("WingMarket::onlyNonBiddingNFT::only selling token can be used here");
      });
    });

    context("when setting price of a token that is NOT in an auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await wingMarket.setCurrentPrice(wingswapNFT.address, 0, parseEther("50"), wbnb.address);
        const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
        expect(metadata.isBidding).to.eq(false);
        expect(metadata.quoteBep20).to.eq(wbnb.address);
        expect(metadata.cap).to.eq(1);
        expect(metadata.startBlock).to.eq(startingBlock.add(3));
        expect(metadata.endBlock).to.eq(startingBlock.add(10));
        expect(metadata.price).to.eq(parseEther("50"));
      });
    });
  });

  describe("#readyToStartAuction()", () => {
    context("if the nft hasn't been supported", () => {
      it("should revert", async () => {
        await expect(
          wingMarket.readyToStartAuction(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(2),
            startingBlock.add(10),
            stakingTokens[0].address
          )
        ).to.revertedWith("WingMarket::onlySupportedNFT::unsupported nft");
      });
    });

    context("if the seller is not a governance", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await expect(
          wingMarketAsAlice.readyToStartAuction(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(3),
            startingBlock.add(10),
            stakingTokens[0].address
          )
        ).to.revertedWith("WingMarket::onlyGovernance::only GOVERNANCE role");
      });
    });

    context("when recreate an auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await expect(
          wingMarket.readyToStartAuction(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(3),
            startingBlock.add(10),
            stakingTokens[0].address
          )
        )
          .to.emit(wingMarket, "Ask")
          .withArgs(await deployer.getAddress(), wingswapNFT.address, 0, parseEther("10"), stakingTokens[0].address)
          .to.emit(wingMarket, "SetWingSwapNFTMetadata")
          .withArgs(wingswapNFT.address, 0, 1, startingBlock.add(3), startingBlock.add(10));
        const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
        expect(metadata.isBidding).to.eq(true);
        expect(metadata.quoteBep20).to.eq(stakingTokens[0].address);
        expect(metadata.cap).to.eq(1);
        expect(metadata.startBlock).to.eq(startingBlock.add(3));
        expect(metadata.endBlock).to.eq(startingBlock.add(10));
        expect(metadata.price).to.eq(parseEther("10"));

        await expect(
          wingMarket.readyToStartAuction(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(4),
            startingBlock.add(10),
            wbnb.address
          )
        ).revertedWith("WingMarket::onlyNonBiddingNFT::only selling token can be used here");
      });
    });

    it("should create a correct wingswapNFTMetadata", async () => {
      await wingMarket.setSupportNFT([wingswapNFT.address], true);
      await expect(
        wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        )
      )
        .to.emit(wingMarket, "Ask")
        .withArgs(await deployer.getAddress(), wingswapNFT.address, 0, parseEther("10"), stakingTokens[0].address)
        .to.emit(wingMarket, "SetWingSwapNFTMetadata")
        .withArgs(wingswapNFT.address, 0, 1, startingBlock.add(3), startingBlock.add(10));
      const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
      expect(metadata.isBidding).to.eq(true);
      expect(metadata.quoteBep20).to.eq(stakingTokens[0].address);
      expect(metadata.cap).to.eq(1);
      expect(metadata.startBlock).to.eq(startingBlock.add(3));
      expect(metadata.endBlock).to.eq(startingBlock.add(10));
      expect(metadata.price).to.eq(parseEther("10"));
    });
  });

  describe("#bidNFT()", () => {
    context("when bidding a non-support nft", () => {
      it("should revert", async () => {
        await expect(wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("1"))).to.revertedWith(
          "WingMarket::onlySupportedNFT::unsupported nft"
        );
      });
    });
    context("when the bidding nft is not within the blockrange", () => {
      it("should revert", async () => {
        // selling phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(100),
          startingBlock.add(101),
          stakingTokens[0].address
        );

        // buying phase
        await expect(wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("1"))).to.revertedWith(
          "WingMarket::withinBlockRange:: invalid block number"
        );
      });
    });

    context("when the bidding nft is not in the action", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("1"))).to.revertedWith(
          "WingMarket::onlyBiddingNFT::only bidding token can be used here"
        );
      });
    });
    context("when the bidder is an owner", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarket.bidNFT(wingswapNFT.address, 0, parseEther("1"))).to.revertedWith(
          "WingMarket::_bidNFT::Owner cannot bid"
        );
      });
    });
    context("when the input bid is < starting bid", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("1"))).to.revertedWith(
          "WingMarket::_bidNFT::price cannot be lower than or equal to the starting bid"
        );
      });
    });
    context("when the quote is a native", () => {
      context("with existing previous bid", () => {
        context("when the current input bid is < the prev bid", () => {
          it("should revert", async () => {
            // preparation phase
            const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
            await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
            // start auction phase
            await wingMarket.setSupportNFT([wingswapNFT.address], true);
            await wingMarket.readyToStartAuction(
              wingswapNFT.address,
              0,
              parseEther("10"),
              1,
              startingBlock.add(4),
              startingBlock.add(10),
              wbnb.address
            );

            // bid phase
            await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("12"), {
              value: parseEther("12"),
            });
            const bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
            expect(bid.bidder).to.eq(await alice.getAddress());
            expect(bid.price).to.eq(parseEther("12"));

            await expect(
              wingMarketAsBob.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
                value: parseEther("11"),
              })
            ).to.revertedWith("WingMarket::_bidNFT::price cannot be lower than or equal to the latest bid");
          });
        });

        context("when the prev bid and the request bid is the user", () => {
          it("should successfully add up a bid with requiring only an amount left", async () => {
            it("should successfully replace a bid with the previous bid returned to the user", async () => {
              // preparation phase
              const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
              await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
              // start auction phase
              await wingMarket.setSupportNFT([wingswapNFT.address], true);
              await wingMarket.readyToStartAuction(
                wingswapNFT.address,
                0,
                parseEther("10"),
                1,
                startingBlock.add(4),
                startingBlock.add(10),
                wbnb.address
              );

              // bid phase
              let aliceBalBefore = await alice.getBalance();
              let aliceTx = await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
                value: parseEther("11"),
              });
              let aliceReceipt = await aliceTx.wait();
              let aliceGasUsed = aliceReceipt.gasUsed;
              let aliceBalAfter = await alice.getBalance();
              let bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
              expect(bid.bidder).to.eq(await alice.getAddress());
              expect(bid.price).to.eq(parseEther("11"));
              expect(aliceBalAfter).to.eq(
                aliceBalBefore.sub(parseEther("11").add((await ethers.provider.getGasPrice()).mul(aliceGasUsed)))
              );

              aliceBalBefore = await alice.getBalance();
              aliceTx = await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("12"), {
                value: parseEther("12"),
              });
              aliceReceipt = await aliceTx.wait();
              aliceGasUsed = aliceReceipt.gasUsed;
              aliceBalAfter = await alice.getBalance();
              bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
              expect(bid.bidder).to.eq(await alice.getAddress());
              expect(bid.price).to.eq(parseEther("12"));
              expect(aliceBalAfter).to.eq(
                aliceBalBefore
                  .add(parseEther("11"))
                  .sub(parseEther("12").add((await ethers.provider.getGasPrice()).mul(aliceGasUsed)))
              );
            });
          });
        });
        context("when the prev bid and the request bid is not the same user", () => {
          it("should successfully replace a bid with the previous bid returned to the user", async () => {
            // preparation phase
            const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
            await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
            // start auction phase
            const latestBlock = await latestBlockNumber();
            await wingMarket.setSupportNFT([wingswapNFT.address], true);
            await wingMarket.readyToStartAuction(
              wingswapNFT.address,
              0,
              parseEther("10"),
              1,
              startingBlock.add(4),
              startingBlock.add(10),
              wbnb.address
            );

            // bid phase
            const aliceBalBefore = await alice.getBalance();
            const aliceTx = await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
              value: parseEther("11"),
            });
            const aliceReceipt = await aliceTx.wait();
            const aliceGasUsed = aliceReceipt.gasUsed;
            const aliceBalAfter = await alice.getBalance();
            let bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
            expect(bid.bidder).to.eq(await alice.getAddress());
            expect(bid.price).to.eq(parseEther("11"));
            expect(aliceBalAfter).to.eq(
              aliceBalBefore.sub(parseEther("11").add((await ethers.provider.getGasPrice()).mul(aliceGasUsed)))
            );

            const bobBalBefore = await bob.getBalance();
            const bobTx = await wingMarketAsBob.bidNFT(wingswapNFT.address, 0, parseEther("12"), {
              value: parseEther("12"),
            });
            const bobReceipt = await bobTx.wait();
            const bobGasUsed = bobReceipt.gasUsed;
            const bobBalAfter = await bob.getBalance();
            bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
            expect(bid.bidder).to.eq(await bob.getAddress());
            expect(bid.price).to.eq(parseEther("12"));
            expect(bobBalAfter).to.eq(
              bobBalBefore.sub(parseEther("12").add((await ethers.provider.getGasPrice()).mul(bobGasUsed)))
            );
            expect(await alice.getBalance()).to.eq(aliceBalAfter.add(parseEther("11")));
          });
        });
      });
      it("should successfully create a bid entry", async () => {
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // start auction phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(4),
          startingBlock.add(10),
          wbnb.address
        );

        // bid phase
        const balBefore = await alice.getBalance();
        const tx = await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
          value: parseEther("11"),
        });
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed;
        const balAfter = await alice.getBalance();
        const bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
        expect(bid.bidder).to.eq(await alice.getAddress());
        expect(bid.price).to.eq(parseEther("11"));
        expect(balAfter).to.eq(balBefore.sub(parseEther("11").add((await ethers.provider.getGasPrice()).mul(gasUsed))));
      });
    });

    context("when the quote is NOT native", () => {
      context("with existing previous bid", () => {
        context("when the current input bid is < the prev bid", () => {
          it("should revert", async () => {
            // preparation phase
            const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
            await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
            // start auction phase
            await wingMarket.setSupportNFT([wingswapNFT.address], true);
            await wingMarket.readyToStartAuction(
              wingswapNFT.address,
              0,
              parseEther("10"),
              1,
              startingBlock.add(4),
              startingBlock.add(10),
              stakingTokens[0].address
            );

            //mint staking tokens
            await stakingTokens[0].mint(await alice.getAddress(), parseEther("100"));
            await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
              wingMarket.address,
              parseEther("12")
            );

            // bid phase
            await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("12"));
            const bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
            expect(bid.bidder).to.eq(await alice.getAddress());
            expect(bid.price).to.eq(parseEther("12"));

            await expect(
              wingMarketAsBob.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
                value: parseEther("11"),
              })
            ).to.revertedWith("WingMarket::_bidNFT::price cannot be lower than or equal to the latest bid");
          });
        });

        context("when the prev bid and the request bid is the user", () => {
          it("should successfully add up a bid with requiring only an amount left", async () => {
            it("should successfully replace a bid with the previous bid returned to the user", async () => {
              // preparation phase
              const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
              await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
              // start auction phase
              await wingMarket.setSupportNFT([wingswapNFT.address], true);
              await wingMarket.readyToStartAuction(
                wingswapNFT.address,
                0,
                parseEther("10"),
                1,
                startingBlock.add(4),
                startingBlock.add(10),
                stakingTokens[0].address
              );

              //mint staking tokens
              await stakingTokens[0].mint(await alice.getAddress(), parseEther("100"));
              await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
                wingMarket.address,
                parseEther("11")
              );

              // bid phase
              await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"));
              let bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
              expect(bid.bidder).to.eq(await alice.getAddress());
              expect(bid.price).to.eq(parseEther("11"));
              expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(parseEther("89"));

              await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
                wingMarket.address,
                parseEther("1")
              );

              await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("12"));
              bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
              expect(bid.bidder).to.eq(await alice.getAddress());
              expect(bid.price).to.eq(parseEther("12"));
              expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(parseEther("88"));
            });
          });
        });
        context("when the prev bid and the request bid is not the same user", () => {
          it("should successfully replace a bid with the previous bid returned to the user", async () => {
            // preparation phase
            const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
            await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
            // start auction phase
            await wingMarket.setSupportNFT([wingswapNFT.address], true);
            await wingMarket.readyToStartAuction(
              wingswapNFT.address,
              0,
              parseEther("10"),
              1,
              startingBlock.add(4),
              startingBlock.add(10),
              stakingTokens[0].address
            );

            // bid phase
            //mint staking tokens
            await stakingTokens[0].mint(await alice.getAddress(), parseEther("100"));
            await stakingTokens[0].mint(await bob.getAddress(), parseEther("100"));
            await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
              wingMarket.address,
              parseEther("11")
            );
            await SimpleToken__factory.connect(stakingTokens[0].address, bob).approve(
              wingMarket.address,
              parseEther("12")
            );

            // bid phase
            await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"));
            let bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
            expect(bid.bidder).to.eq(await alice.getAddress());
            expect(bid.price).to.eq(parseEther("11"));
            expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(parseEther("89"));

            await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
              wingMarket.address,
              parseEther("1")
            );

            await wingMarketAsBob.bidNFT(wingswapNFT.address, 0, parseEther("12"));
            bid = await wingMarketAsBob.getBid(wingswapNFT.address, 0);
            expect(bid.bidder).to.eq(await bob.getAddress());
            expect(bid.price).to.eq(parseEther("12"));
            expect(await stakingTokens[0].balanceOf(await bob.getAddress())).to.eq(parseEther("88"));
          });
        });
      });
      it("should successfully create a bid entry", async () => {
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // start auction phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(4),
          startingBlock.add(10),
          stakingTokens[0].address
        );

        // bid phase
        //mint staking tokens
        await stakingTokens[0].mint(await alice.getAddress(), parseEther("100"));
        await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
          wingMarket.address,
          parseEther("11")
        );

        // bid phase
        await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"));
        const bid = await wingMarketAsAlice.getBid(wingswapNFT.address, 0);
        expect(bid.bidder).to.eq(await alice.getAddress());
        expect(bid.price).to.eq(parseEther("11"));
        expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(parseEther("89"));
      });
    });
  });

  describe("#concludeAuction()", () => {
    context("if the nft hasn't been supported", () => {
      it("should revert", async () => {
        await expect(wingMarket.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::onlySupportedNFT::unsupported nft"
        );
      });
    });

    context("when the seller is not a governance", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::onlyGovernance::only GOVERNANCE role"
        );
      });
    });

    context("when the nft to sell not in the auction", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToSellNFT(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarketAsAlice.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::onlyBiddingNFT::only bidding token can be used here"
        );
      });
    });

    context("when the block number isn NOT ready to be concluded", () => {
      it("should revert", async () => {
        const latestBlock = await latestBlockNumber();
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(10),
          stakingTokens[0].address
        );
        await expect(wingMarket.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::_concludeAuction::Unable to conclude auction now, bad block number"
        );
      });
    });

    context("when the bidder is not existed", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(3),
          startingBlock.add(4),
          stakingTokens[0].address
        );
        await advanceBlockTo(startingBlock.add(4).toNumber());
        await expect(wingMarket.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::_concludeAuction::Bidder does not exist"
        );
      });
    });

    context("when reaching a maximum cap", () => {
      it("should revert", async () => {
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // start auction phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          0,
          startingBlock.add(4),
          startingBlock.add(5),
          wbnb.address
        );

        // bid phase
        await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
          value: parseEther("11"),
        });

        // conclude phase
        await expect(wingMarket.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::_decreaseCap::maximum mint cap reached"
        );
      });
    });

    context("when cancel auction", () => {
      context("when there is an existing bidder", () => {
        it("should revert", async () => {
          // preparation phase
          const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
          await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
          // start auction phase
          await wingMarket.setSupportNFT([wingswapNFT.address], true);
          await wingMarket.readyToStartAuction(
            wingswapNFT.address,
            0,
            parseEther("10"),
            1,
            startingBlock.add(4),
            startingBlock.add(6),
            stakingTokens[0].address
          );
          await stakingTokens[0].mint(await alice.getAddress(), parseEther("100"));
          await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
            wingMarket.address,
            parseEther("11")
          );
          // bid phase
          await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"));
          expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(parseEther("89"));
          await expect(wingMarket.cancelBiddingNFT(wingswapNFT.address, 0)).to.revertedWith(
            "WingMarket::cancelBiddingNFT::auction already has a bidder"
          );
          expect(await stakingTokens[0].balanceOf(await alice.getAddress())).to.eq(parseEther("89"));
        });
      });

      it("should be able to cancel", async () => {
        // preparation phase
        const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
        await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
        // start auction phase
        await wingMarket.setSupportNFT([wingswapNFT.address], true);
        await wingMarket.readyToStartAuction(
          wingswapNFT.address,
          0,
          parseEther("10"),
          1,
          startingBlock.add(4),
          startingBlock.add(6),
          stakingTokens[0].address
        );
        await stakingTokens[0].mint(await alice.getAddress(), parseEther("100"));
        await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
          wingMarket.address,
          parseEther("11")
        );
        // bid phase
        await wingMarket.cancelBiddingNFT(wingswapNFT.address, 0);
        expect(await wingMarket.tokenCategorySellers(wingswapNFT.address, 0)).to.eq(constants.AddressZero);
        const metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
        expect(metadata.isBidding).to.eq(false);
        expect(metadata.quoteBep20).to.eq(constants.AddressZero);
        expect(metadata.cap).to.eq(0);
        expect(metadata.startBlock).to.eq(0);
        expect(metadata.endBlock).to.eq(0);
        expect(metadata.price).to.eq(parseEther("0"));

        // conclude phase
        await expect(wingMarket.concludeAuction(wingswapNFT.address, 0)).to.revertedWith(
          "WingMarket::onlyBiddingNFT::only bidding token can be used here"
        );
        await SimpleToken__factory.connect(stakingTokens[0].address, alice).approve(
          wingMarket.address,
          parseEther("11")
        );
        // bid phase
        await expect(wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"))).to.revertedWith(
          "WingMarket::withinBlockRange:: invalid block number"
        );
      });
    });

    it("should successfully conclude an auction", async () => {
      // preparation phase
      const _wingswapNFT = wingswapNFT as unknown as WingSwapNFT;
      await _wingswapNFT.grantRole(await _wingswapNFT.MINTER_ROLE(), wingMarket.address);
      // start auction phase
      await wingMarket.setSupportNFT([wingswapNFT.address], true);
      await wingMarket.readyToStartAuction(
        wingswapNFT.address,
        0,
        parseEther("10"),
        1,
        startingBlock.add(4),
        startingBlock.add(5),
        wbnb.address
      );

      // bid phase
      await wingMarketAsAlice.bidNFT(wingswapNFT.address, 0, parseEther("11"), {
        value: parseEther("11"),
      });

      // conclude phase
      await wingMarket.concludeAuction(wingswapNFT.address, 0);
      expect(await _wingswapNFT.ownerOf(0)).to.eq(await alice.getAddress());
      expect(await wbnb.balanceOf(await deployer.getAddress())).to.eq(parseEther("9.9"));
      expect(await wbnb.balanceOf(await dev.getAddress())).to.eq(parseEther("1.1"));
    });
  });

  describe("#setWingSwapNFTMetadata", () => {
    context("when setting unsupported nft", () => {
      it("should revert", async () => {
        await wingMarket.setSupportNFT([wingswapNFT.address], false);
        await expect(
          wingMarket.setWingSwapNFTMetadata([
            {
              nftAddress: wingswapNFT.address,
              nftCategoryId: 0,
              cap: 1,
              startBlock: startingBlock.add(100),
              endBlock: startingBlock.add(101),
            },
          ])
        ).to.revertedWith("WingMarket::setWingSwapNFTMetadata::unsupported nft");
      });
    });
    it("should set a correct param", async () => {
      await wingMarket.setSupportNFT([wingswapNFT.address], true);
      await wingMarket.setWingSwapNFTMetadata([
        {
          nftAddress: wingswapNFT.address,
          nftCategoryId: 0,
          cap: 1,
          startBlock: startingBlock.add(100),
          endBlock: startingBlock.add(101),
        },
        {
          nftAddress: wingswapNFT.address,
          nftCategoryId: 1,
          cap: 2,
          startBlock: startingBlock.add(102),
          endBlock: startingBlock.add(103),
        },
      ]);
      const category0Metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 0);
      const category1Metadata = await wingMarket.wingswapNFTMetadata(wingswapNFT.address, 1);
      expect(category0Metadata.isBidding).to.eq(false);
      expect(category0Metadata.quoteBep20).to.eq(constants.AddressZero);
      expect(category0Metadata.cap).to.eq(1);
      expect(category0Metadata.startBlock).to.eq(startingBlock.add(100));
      expect(category0Metadata.endBlock).to.eq(startingBlock.add(101));
      expect(category0Metadata.price).to.eq(parseEther("0"));

      expect(category1Metadata.isBidding).to.eq(false);
      expect(category1Metadata.quoteBep20).to.eq(constants.AddressZero);
      expect(category1Metadata.cap).to.eq(2);
      expect(category1Metadata.startBlock).to.eq(startingBlock.add(102));
      expect(category1Metadata.endBlock).to.eq(startingBlock.add(103));
      expect(category1Metadata.price).to.eq(parseEther("0"));
    });
  });
});
