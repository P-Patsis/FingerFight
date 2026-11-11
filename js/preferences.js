// Choose first-run defaults once; an existing choice (including silence) remains the user's choice.
export function initialFavourites(read,arenaCount,songCount,random=Math.random){
 const pick=n=>Math.min(n-1,Math.max(0,Math.floor(random()*n)));
 const background=read('ff-favbg')??read('ff-bg'),song=read('ff-favsong')??read('ff-music');
 const bg=background===null?pick(arenaCount):Number(background),music=song===null?pick(songCount):Number(song);
 return {bg:Number.isInteger(bg)&&bg>=0&&bg<arenaCount?bg:0,music:Number.isInteger(music)&&music>=-1&&music<songCount?music:pick(songCount)};
}
