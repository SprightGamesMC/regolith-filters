import type { ArtSpecMap, ContentType, PackRules, RequiredRoles } from "../Types/PackagerTypes";

export const STORE_ART_SPECS: ArtSpecMap = {
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

export const MARKETING_ART_SPECS: ArtSpecMap = {
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

export const REQUIRED_ROLES_BY_TYPE: Record<ContentType, RequiredRoles> = {
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

export const CONTENT_TYPE_PACK_RULES: Record<ContentType, PackRules> = {
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
