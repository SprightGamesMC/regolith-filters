"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTENT_TYPE_PACK_RULES = exports.REQUIRED_ROLES_BY_TYPE = exports.MARKETING_ART_SPECS = exports.STORE_ART_SPECS = void 0;
exports.STORE_ART_SPECS = {
    key_art: {
        width: 800,
        height: 450,
        formats: ["jpeg"],
        dpi: 72,
    },
    screenshots: {
        width: 800,
        height: 450,
        formats: ["jpeg"],
        count: 5,
        dpi: 72,
    },
    panorama: {
        minWidth: 1000,
        maxWidth: 4000,
        height: 450,
        formats: ["jpeg"],
        dpi: 72,
    },
    pack_icon: {
        width: 256,
        height: 256,
        formats: ["jpeg"],
        dpi: 72,
    },
};
exports.MARKETING_ART_SPECS = {
    key_art: {
        width: 1920,
        height: 1080,
        formats: ["jpeg", "psd"],
        dpi: 300,
    },
    screenshots: {
        width: 1920,
        height: 1080,
        formats: ["jpeg", "psd"],
        minCount: 5,
        dpi: 300,
    },
    partner_art: {
        width: 1920,
        height: 1080,
        formats: ["jpeg", "psd"],
        dpi: 300,
    },
};
exports.REQUIRED_ROLES_BY_TYPE = {
    addon: {
        store: ["key_art", "screenshots", "panorama", "pack_icon"],
        marketing: ["key_art", "screenshots", "partner_art"],
    },
    world: {
        store: ["key_art", "screenshots", "panorama", "pack_icon"],
        marketing: ["key_art", "screenshots", "partner_art"],
    },
    texture_pack: {
        store: ["key_art", "screenshots", "panorama", "pack_icon"],
        marketing: ["key_art", "screenshots", "partner_art"],
    },
    skin_pack: {
        store: ["key_art"],
        marketing: ["key_art", "partner_art"],
    },
};
exports.CONTENT_TYPE_PACK_RULES = {
    addon: {
        gameExtension: "mcaddon",
        requiresBehaviorPack: true,
        requiresResourcePack: true,
        requiresSkinPack: false,
        requiresWorldTemplate: false,
    },
    world: {
        gameExtension: "mctemplate",
        requiresBehaviorPack: false,
        requiresResourcePack: false,
        requiresSkinPack: false,
        requiresWorldTemplate: true,
    },
    texture_pack: {
        gameExtension: "mcpack",
        requiresBehaviorPack: false,
        requiresResourcePack: true,
        requiresSkinPack: false,
        requiresWorldTemplate: false,
    },
    skin_pack: {
        gameExtension: "mcpack",
        requiresBehaviorPack: false,
        requiresResourcePack: false,
        requiresSkinPack: true,
        requiresWorldTemplate: false,
    },
};
