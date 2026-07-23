declare module "gl" {
    /**
     * Creates a headless WebGL rendering context.
     *
     * @param width - Framebuffer width in pixels.
     * @param height - Framebuffer height in pixels.
     * @param options - Optional WebGL context attributes.
     *
     * @returns Headless WebGLRenderingContext.
     */
    function createContext(width: number, height: number, options?: Record<string, unknown>): WebGLRenderingContext;

    export = createContext;
}
