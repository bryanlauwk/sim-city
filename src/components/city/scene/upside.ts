import { createContext } from "react";
import { CENTER } from "./common";

/** True inside the Upside Down's copy of the town: meshes come out drained and dead. */
export const UpsideContext = createContext(false);

/** Where the gate first opened: under Hollow Point Lab. */
export const GATE = { x: 26 - CENTER, z: 3 - CENTER };
