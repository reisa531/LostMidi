export type Recording = { key:string; name:string; mime:string };
export type Song = {id:string; title:string; slug:string; versions:Recording[]; cover?:string; game?:string};
