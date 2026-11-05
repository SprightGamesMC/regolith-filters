"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Identifiers_1 = __importDefault(require("./Identifiers"));
/**
 * Reads the items that loot tables and trade tables give.
 */
class ItemTables {
    /**
     * Collects the items in a loot table, including nested loot tables.
     *
     * @param tablePath - Loot table path relative to the pack root.
     * @param tables - Parsed loot tables by path.
     * @param visitedPaths - Tables already read, which stops reference loops.
     *
     * @returns Item identifiers without duplicates.
     */
    static lootItems(tablePath, tables, visitedPaths = new Set()) {
        if (visitedPaths.has(tablePath)) {
            return [];
        }
        visitedPaths.add(tablePath);
        const items = this.findEntries(tables.get(tablePath)).flatMap((entry) => {
            if (entry.type === "item" && typeof entry.name === "string") {
                return [Identifiers_1.default.base(entry.name)];
            }
            return entry.type === "loot_table" && typeof entry.name === "string" ? this.lootItems(entry.name, tables, visitedPaths) : [];
        });
        return [...new Set(items)];
    }
    /**
     * Collects the items that a trade table gives.
     *
     * @param value - Parsed trade table or a part of it.
     *
     * @returns Item identifiers without duplicates.
     */
    static tradeItems(value) {
        if (!value || typeof value !== "object") {
            return [];
        }
        const items = Object.entries(value).flatMap(([key, child]) => key === "gives" ? this.findItemNames(child) : this.tradeItems(child));
        return [...new Set(items)];
    }
    /**
     * Collects the entries of every pool in a loot table, including pools nested in entries.
     *
     * @param value - Parsed loot table or entry.
     *
     * @returns Entry objects.
     */
    static findEntries(value) {
        const pools = value?.pools;
        if (!Array.isArray(pools)) {
            return [];
        }
        return pools.flatMap((pool) => {
            const entries = pool?.entries;
            if (!Array.isArray(entries)) {
                return [];
            }
            return entries.flatMap((entry) => [entry, ...this.findEntries(entry)]);
        });
    }
    /**
     * Collects every `item` value under a part of a trade.
     *
     * @param value - Parsed `gives` value or a part of it.
     *
     * @returns Item identifiers.
     */
    static findItemNames(value) {
        if (!value || typeof value !== "object") {
            return [];
        }
        return Object.entries(value).flatMap(([key, child]) => {
            if (key === "item" && typeof child === "string") {
                return [Identifiers_1.default.base(child)];
            }
            return this.findItemNames(child);
        });
    }
}
exports.default = ItemTables;
