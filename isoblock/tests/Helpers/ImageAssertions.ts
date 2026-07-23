import type { PNG } from "pngjs";

/**
 * Pixel checks for rendered PNG images.
 */
export default abstract class ImageAssertions {
    /**
     * Checks whether any pixel has a non-zero alpha.
     *
     * @param image - Decoded PNG image.
     *
     * @returns `true` when at least one pixel is visible, `false` otherwise.
     */
    static hasVisiblePixels(image: PNG): boolean {
        for (let offset = 3; offset < image.data.length; offset += 4) {
            if (image.data[offset] > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Counts visible pixels on the outermost one-pixel border. A non-zero
     * count means the model touches the image edge and is likely cut off.
     *
     * @param image - Decoded PNG image.
     *
     * @returns Visible border pixel count.
     */
    static countVisibleBorderPixels(image: PNG): number {
        let count = 0;

        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                if (x !== 0 && y !== 0 && x !== image.width - 1 && y !== image.height - 1) {
                    continue;
                }
                if (image.data[(y * image.width + x) * 4 + 3] > 0) {
                    count++;
                }
            }
        }

        return count;
    }
}
