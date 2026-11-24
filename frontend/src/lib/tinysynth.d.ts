declare module "webaudio-tinysynth" {
  export default class Synth {
    constructor(options: {quality:number;voices:number});
    getAudioContext():AudioContext;
    loadMIDI(bytes:ArrayBuffer):void;
    playMIDI():void;
    stopMIDI():void;
    locateMIDI(tick:number):void;
    getPlayStatus():{play:number;maxTick:number;curTick:number};
  }
}
