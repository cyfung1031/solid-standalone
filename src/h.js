import * as Solid from 'solid-js';
import SolidHyper from 'solid-js/h';
import { render } from "solid-js/web";

window.Solid = Solid;
window.SolidDOM = { h: SolidHyper, render };