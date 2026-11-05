/**
 * Skyline and hand cut silhouettes used in every guide. Teams set their logos in the `style` setting.
 */
export default abstract class BrandArt {
    /** Path of the four point star. */
    static readonly STAR =
        "M185.4,777.33l.22.55c2.51,6.27,7.49,11.25,13.76,13.76l.55.22c2.16.87,2.16,3.93,0,4.79l-.55.22c-6.27,2.51-11.25,7.49-13.76,13.76l-.22.55c-.87,2.16-3.93,2.16-4.79,0l-.22-.55c-2.51-6.27-7.49-11.25-13.76-13.76l-.55-.22c-2.16-.87-2.16-3.93,0-4.79l.55-.22c6.27-2.51,11.25-7.49,13.76-13.76l.22-.55c.87-2.16,3.93-2.16,4.79,0Z";

    /** Center and radius of the star. */
    static readonly STAR_BOUNDS = { centerX: 183, centerY: 794.03, radius: 18.3 };

    /** Stepped tower silhouettes that stand on the line `y = 1000`. */
    static readonly TOWERS: readonly { path: string; originX: number }[] = [
        {
            path: "M52.43,1000v-51.11c0-12.52,10.15-22.67,22.67-22.67h35.52c12.52,0,22.67-10.15,22.67-22.67v-37.29c0-12.52,10.15-22.67,22.67-22.67h51.46c12.52,0,22.67,10.15,22.67,22.67v24.9c0,12.52,10.15,22.67,22.67,22.67h40.24c12.52,0,22.67,10.15,22.67,22.67v63.5H52.43Z",
            originX: 52.43,
        },
        {
            path: "M450.24,1000v-112.92c0-12.29,9.96-22.25,22.25-22.25h33.42c12.29,0,22.25-9.96,22.25-22.25v-44.63c0-12.29,9.96-22.25,22.25-22.25h70.6c12.29,0,22.25,9.96,22.25,22.25v110.74c0,12.29,9.96,22.25,22.25,22.25h58.8c12.29,0,22.25,9.96,22.25,22.25v46.81h-296.3Z",
            originX: 450.24,
        },
        {
            path: "M921.25,1000v-78.41c0-12.44,10.08-22.52,22.52-22.52h60.03c12.44,0,22.52-10.08,22.52-22.52v-78.33c0-12.44,10.08-22.52,22.52-22.52h54.13c12.44,0,22.52,10.08,22.52,22.52v201.77h-204.22Z",
            originX: 921.25,
        },
        {
            path: "M1265.1,1000v-250.06c0-12.49,10.13-22.62,22.62-22.62h56.92c12.49,0,22.62,10.13,22.62,22.62v103.6c0,12.49,10.13,22.62,22.62,22.62h44.48c12.49,0,22.62,10.13,22.62,22.62v101.22h-191.89Z",
            originX: 1265.1,
        },
    ];

    /** Line that the towers stand on. */
    static readonly TOWER_BASE_Y = 1000;

    /** Shape with a wave along its top edge, high on the right. Units are a 100 by 100 box. */
    static readonly WAVE_LEFT =
        "M0,100h100V3.65s-9.25-1.32-12.32-.97c-3.98.46-11.32,4.3-15.29,4.84-5.18.7-15.71-1.41-20.9-.77-4.65.57-13.34,4.71-18,5.23-3.9.43-11.8-1.61-15.68-.97C13.06,11.8,0,18.36,0,18.36v81.64Z";

    /** Shape with a wave along its top edge, high on the left. Units are a 100 by 100 box. */
    static readonly WAVE_RIGHT =
        "M100,100.06H0V3.71s9.25-1.32,12.32-.97c3.98.46,11.32,4.3,15.29,4.84,5.18.7,15.71-1.41,20.9-.77,4.65.57,13.34,4.71,18,5.23,3.9.43,11.8-1.61,15.68-.97,4.75.79,17.81,7.35,17.81,7.35v81.64Z";

    /** Bends of the hand drawn rule as share of the width and offset in points. They differ but stay in a narrow range. */
    static readonly RULE_BENDS: readonly (readonly [number, number])[] = [
        [0, 0],
        [0.13, 1.8],
        [0.3, -1.5],
        [0.49, 1.7],
        [0.67, -1.8],
        [0.86, 1.5],
        [1, 0],
    ];

    /** Points of the control outline as distance from the left, right, top, and bottom. Each axis has one value and one `null`. */
    static readonly CONTROL_OUTLINE: readonly (readonly (number | null)[])[] = [
        [34, null, 0, null],
        [null, 30, 0, null],
        [null, 24.54, 0.03, null],
        [null, 21.47, 0.13, null],
        [null, 18.95, 0.3, null],
        [null, 16.75, 0.53, null],
        [null, 14.78, 0.82, null],
        [null, 12.98, 1.19, null],
        [null, 11.33, 1.61, null],
        [null, 9.83, 2.11, null],
        [null, 8.44, 2.67, null],
        [null, 7.17, 3.31, null],
        [null, 6.01, 4.01, null],
        [null, 4.96, 4.78, null],
        [null, 4.01, 5.63, null],
        [null, 3.17, 6.55, null],
        [null, 2.42, 7.56, null],
        [null, 1.78, 8.65, null],
        [null, 1.23, 9.85, null],
        [null, 0.79, 11.17, null],
        [null, 0.44, 12.64, null],
        [null, 0.2, 14.31, null],
        [null, 0.05, 16.36, null],
        [null, 0, 20, null],
        [null, 0, null, 21],
        [null, 0.07, null, 18.24],
        [null, 0.28, null, 16.31],
        [null, 0.63, null, 14.62],
        [null, 1.13, null, 13.07],
        [null, 1.76, null, 11.65],
        [null, 2.53, null, 10.32],
        [null, 3.44, null, 9.07],
        [null, 4.48, null, 7.92],
        [null, 5.66, null, 6.84],
        [null, 6.98, null, 5.84],
        [null, 8.42, null, 4.91],
        [null, 10.01, null, 4.07],
        [null, 11.72, null, 3.3],
        [null, 13.57, null, 2.61],
        [null, 15.56, null, 2.01],
        [null, 17.68, null, 1.48],
        [null, 19.96, null, 1.03],
        [null, 22.41, null, 0.66],
        [null, 25.06, null, 0.37],
        [null, 27.97, null, 0.16],
        [null, 31.28, null, 0.04],
        [null, 36, null, 0],
        [31, null, null, 0],
        [25.67, null, null, 0.03],
        [22.55, null, null, 0.14],
        [19.96, null, null, 0.31],
        [17.68, null, null, 0.54],
        [15.62, null, null, 0.85],
        [13.74, null, null, 1.22],
        [12.02, null, null, 1.67],
        [10.43, null, null, 2.18],
        [8.96, null, null, 2.76],
        [7.62, null, null, 3.41],
        [6.4, null, null, 4.13],
        [5.28, null, null, 4.92],
        [4.27, null, null, 5.78],
        [3.37, null, null, 6.73],
        [2.58, null, null, 7.75],
        [1.9, null, null, 8.87],
        [1.32, null, null, 10.08],
        [0.84, null, null, 11.4],
        [0.47, null, null, 12.88],
        [0.21, null, null, 14.55],
        [0.05, null, null, 16.56],
        [0, null, null, 20],
        [0, null, 21, null],
        [0.06, null, 18.03, null],
        [0.26, null, 16.05, null],
        [0.58, null, 14.33, null],
        [1.03, null, 12.78, null],
        [1.6, null, 11.36, null],
        [2.3, null, 10.04, null],
        [3.13, null, 8.82, null],
        [4.09, null, 7.68, null],
        [5.17, null, 6.63, null],
        [6.37, null, 5.65, null],
        [7.7, null, 4.75, null],
        [9.15, null, 3.93, null],
        [10.73, null, 3.19, null],
        [12.44, null, 2.52, null],
        [14.28, null, 1.93, null],
        [16.26, null, 1.42, null],
        [18.4, null, 0.99, null],
        [20.7, null, 0.63, null],
        [23.2, null, 0.36, null],
        [25.98, null, 0.16, null],
        [29.19, null, 0.04, null],
    ];
}
