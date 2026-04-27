const fs = require("fs");
const path = require("path");
const AssetOutputNames = require("./AssetOutputNames.js");

/**
 * Copies and renames art files from source folders into the staging directory
 * using the Marketplace naming convention.
 */
class AssetStager {
  /**
   * Stages all store art assets into the staging directory.
   *
   * @param {object} args - Validated packager arguments.
   * @param {string} stagingRootPath - Absolute staging root path.
   *
   * @returns {Promise<string>} Absolute staged store-art directory path.
   */
  static async stageStoreArt(args, stagingRootPath) {
    const storeArtPath = path.resolve(stagingRootPath, "Store Art");
    const writeTasks = [];

    fs.mkdirSync(storeArtPath, { recursive: true });

    writeTasks.push(
      this.writeAssetVariant(
        args.art.store.key_art,
        path.resolve(storeArtPath, AssetOutputNames.createStoreKeyArtName(args.storeAssetContentName))
      )
    );

    if (Array.isArray(args.art.store.screenshots)) {
      for (let index = 0; index < args.art.store.screenshots.length; index += 1) {
        writeTasks.push(
          this.writeAssetVariant(
            args.art.store.screenshots[index],
            path.resolve(storeArtPath, AssetOutputNames.createStoreScreenshotName(args.storeAssetContentName, index))
          )
        );
      }
    }

    if (args.art.store.panorama) {
      writeTasks.push(
        this.writeAssetVariant(
          args.art.store.panorama,
          path.resolve(storeArtPath, AssetOutputNames.createStorePanoramaName(args.storeAssetContentName))
        )
      );
    }

    if (args.art.store.pack_icon) {
      writeTasks.push(
        this.writeAssetVariant(
          args.art.store.pack_icon,
          path.resolve(storeArtPath, AssetOutputNames.createStorePackIconName(args.storeAssetContentName))
        )
      );
    }

    await Promise.all(writeTasks);

    return storeArtPath;
  }

  /**
   * Stages all marketing art assets into the staging directory.
   *
   * @param {object} args - Validated packager arguments.
   * @param {string} stagingRootPath - Absolute staging root path.
   *
   * @returns {Promise<string>} Absolute staged marketing-art directory path.
   */
  static async stageMarketingArt(args, stagingRootPath) {
    const marketingArtPath = path.resolve(stagingRootPath, "Marketing Art");
    const writeTasks = [];

    fs.mkdirSync(marketingArtPath, { recursive: true });

    writeTasks.push(
      this.writeAssetVariant(
        args.art.marketing.key_art,
        path.resolve(
          marketingArtPath,
          AssetOutputNames.createMarketingKeyArtName(args.marketingAssetContentName, args.art.marketing.key_art)
        )
      )
    );

    if (Array.isArray(args.art.marketing.screenshots)) {
      for (let index = 0; index < args.art.marketing.screenshots.length; index += 1) {
        writeTasks.push(
          this.writeAssetVariant(
            args.art.marketing.screenshots[index],
            path.resolve(
              marketingArtPath,
              AssetOutputNames.createMarketingScreenshotName(
                args.marketingAssetContentName,
                index,
                args.art.marketing.screenshots[index]
              )
            )
          )
        );
      }
    }

    if (args.art.marketing.partner_art) {
      writeTasks.push(
        this.writeAssetVariant(
          args.art.marketing.partner_art,
          path.resolve(
            marketingArtPath,
            AssetOutputNames.createMarketingPartnerArtName(
              args.marketingAssetContentName,
              args.art.marketing.partner_art
            )
          )
        )
      );
    }

    await Promise.all(writeTasks);

    return marketingArtPath;
  }

  /**
   * Writes a staged asset file.
   *
   * @param {{ fileName: string; sourcePath: string }} asset - Resolved asset record.
   * @param {string} destinationPath - Absolute output file path.
   */
  static async writeAssetVariant(asset, destinationPath) {
    fs.copyFileSync(asset.sourcePath, destinationPath);
  }
}

module.exports = AssetStager;
