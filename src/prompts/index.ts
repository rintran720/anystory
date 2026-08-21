import type{GenreId,SettingId}from"../types.js";import type{GenrePrompts}from"./core.js";import{DRAMA}from"./drama.js";import{NGONTINH}from"./ngontinh.js";
export{P}from"./core.js";export type{GenrePrompts}from"./core.js";
export{SETTINGS,settingVars}from"./settings.js";export type{SettingPack}from"./settings.js";
const ALL:Record<GenreId,GenrePrompts>={drama:DRAMA,ngontinh:NGONTINH};
export const GENRES:{id:GenreId;label:string}[]=[{id:"drama",label:DRAMA.label},{id:"ngontinh",label:NGONTINH.label}];
export function getGenre(id?:string):GenrePrompts{return(id&&(ALL as any)[id])||ALL.drama}
export const resolveSetting=(genre:string|undefined,setting:string|undefined):SettingId=>setting==="vietnam"||setting==="china"?setting:getGenre(genre).defaultSetting;
