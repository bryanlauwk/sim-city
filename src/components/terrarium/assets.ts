import jar from "@/assets/terrarium/jar.png";
import subCoir from "@/assets/terrarium/sub-coir.png";
import subLoam from "@/assets/terrarium/sub-loam.png";
import subSandy from "@/assets/terrarium/sub-sandy.png";
import subSphagnum from "@/assets/terrarium/sub-sphagnum.png";
import plantFern from "@/assets/terrarium/plant-fern.png";
import plantMoss from "@/assets/terrarium/plant-moss.png";
import plantPilea from "@/assets/terrarium/plant-pilea.png";
import plantLichen from "@/assets/terrarium/plant-lichen.png";
import plantOrchid from "@/assets/terrarium/plant-orchid.png";
import faunaSpringtail from "@/assets/terrarium/fauna-springtail.png";
import faunaIsopod from "@/assets/terrarium/fauna-isopod.png";
import faunaSnail from "@/assets/terrarium/fauna-snail.png";
import faunaAnt from "@/assets/terrarium/fauna-ant.png";
import mold from "@/assets/terrarium/mold.png";
import glassHighlight from "@/assets/terrarium/glass-highlight.png";

export const ASSETS = {
  jar,
  mold,
  glassHighlight,
  substrate: {
    coir: subCoir,
    loam: subLoam,
    sandy: subSandy,
    sphagnum: subSphagnum,
  },
  plant: {
    fern: plantFern,
    moss: plantMoss,
    pilea: plantPilea,
    lichen: plantLichen,
    orchid: plantOrchid,
  },
  fauna: {
    springtail: faunaSpringtail,
    isopod: faunaIsopod,
    snail: faunaSnail,
    ant: faunaAnt,
  },
} as const;