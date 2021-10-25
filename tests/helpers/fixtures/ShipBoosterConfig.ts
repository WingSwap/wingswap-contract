import { ShipBoosterConfig, ShipBoosterConfig__factory, WingSwapNFT } from "../../../typechain";
import { ethers, upgrades } from "hardhat";
import { ModifiableContract, smoddit } from "@eth-optimism/smock";

export interface IShipBoosterConfigUnitTestFixtureDTO {
  shipboosterConfig: ShipBoosterConfig;
  wingswapNft: ModifiableContract;
}

export async function shipboosterConfigUnitTestFixture(): Promise<IShipBoosterConfigUnitTestFixtureDTO> {
  const [deployer, alice, bob, eve] = await ethers.getSigners();

  // Deploy ShipBoosterConfig
  const ShipBoosterConfig = (await ethers.getContractFactory("ShipBoosterConfig", deployer)) as ShipBoosterConfig__factory;
  const shipboosterConfig = (await upgrades.deployProxy(ShipBoosterConfig)) as ShipBoosterConfig;
  await shipboosterConfig.deployed();

  const WingSwapNft = await smoddit("WingSwapNFT", deployer);
  const wingswapNft = await WingSwapNft.deploy();
  await (wingswapNft as unknown as WingSwapNFT).initialize("baseURI");
  await wingswapNft.smodify.put({
    wingswapNFTToCategory: {
      0: 1,
    },
  });

  return { shipboosterConfig, wingswapNft };
}
