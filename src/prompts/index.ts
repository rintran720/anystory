import type{GenreId}from"../types.js";import type{GenrePrompts}from"./core.js";import{DRAMA}from"./drama.js";
export{P}from"./core.js";export type{GenrePrompts}from"./core.js";
const ALL:Record<GenreId,GenrePrompts>={drama:DRAMA} as any;
export const GENRES:{id:GenreId;label:string}[]=[{id:"drama",label:DRAMA.label}];
export function getGenre(id?:string):GenrePrompts{return(id&&(ALL as any)[id])||ALL.drama}
