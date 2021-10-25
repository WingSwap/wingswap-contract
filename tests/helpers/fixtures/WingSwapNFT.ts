import { WingSwapNFT, WingSwapNFT__factory } from "../../../typechain";
import { ethers, upgrades } from "hardhat";

export interface IWingConfigUnitTestFixtureDTO {
  wingswapNFT: WingSwapNFT;
}

export async function wingswapNFTUnitTestFixture(): Promise<IWingConfigUnitTestFixtureDTO> {
  const [deployer, alice, bob, eve] = await ethers.getSigners();

  // Deploy WingSwapNFT
  const WingSwapNFT = (await ethers.getContractFactory("WingSwapNFT", deployer)) as WingSwapNFT__factory;
  const wingswapNFT = (await upgrades.deployProxy(WingSwapNFT, ["baseURI"])) as WingSwapNFT;
  await wingswapNFT.deployed();

  return { wingswapNFT };
}
