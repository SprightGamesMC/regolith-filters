/**
 * Normalizes Minecraft identifiers and creates readable names from them.
 */
export default abstract class Identifiers {
    /** Namespace of vanilla content. */
    static readonly VANILLA_NAMESPACE = "minecraft";

    /**
     * Removes a data value and adds the vanilla namespace when none is present.
     *
     * @param raw - Identifier such as `apple` or `minecraft:wool:3`.
     *
     * @returns Identifier such as `minecraft:apple` or `minecraft:wool`.
     */
    static base(raw: string): string {
        const [first, second] = raw.split(":");

        return second === undefined ? `${Identifiers.VANILLA_NAMESPACE}:${first}` : `${first}:${second}`;
    }

    /**
     * Checks for vanilla content.
     *
     * @param identifier - Namespaced identifier.
     *
     * @returns `true` if the namespace is vanilla, `false` otherwise.
     */
    static isVanilla(identifier: string): boolean {
        return identifier.startsWith(`${Identifiers.VANILLA_NAMESPACE}:`);
    }

    /**
     * Creates a readable name from the part after the namespace.
     *
     * @param identifier - Identifier such as `my_pack:block.lucky_break`.
     *
     * @returns Name such as `Block Lucky Break`.
     */
    static humanize(identifier: string): string {
        const name = identifier.slice(identifier.indexOf(":") + 1);

        return name
            .split(/[._\s]+/)
            .filter((word) => word !== "")
            .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(" ");
    }
}
