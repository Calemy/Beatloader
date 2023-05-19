import {
    standard, taiko, ctb, mania, allModes,
    graveyard, wip, pending, ranked, approved, qualified, loved, all,
    ar, cs, hp, od, bpm, length, difficulty, date, playcount, nsfw, creator
} from "./enums.js"

export const showOnDiscord = true

export const modes = [allModes]
export const status = [all]
export const attributes = `` //Example: `${creator}=Sotarks AND ${length} <= 120`
export const search = "" //Example: "(Asterisk DnB Remix)"
export const downloadVideo = true

export function custom(data){ //Please use this only if you know what you are doing
    //Refer to response: https://catboy.best/api/v2/s/1
    /*
        for(let i = 0; i < data.beatmaps.length; i++){
            if(data[i].version.startsWith("Reform's")) return true;
        }
    */
   return true;
}