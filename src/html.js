import {createSignal, onMount, For, Switch, Match, createRoot, createEffect, createMemo, Show, onCleanup, createComputed, createDeferred} from 'solid-js';
// import SolidHyper from 'solid-js/h';
import SolidHTML from 'solid-js/html';
import { insert } from "solid-js/web";
import { createStore } from "solid-js/store"; 
// import { withSolid, customElement } from 'solid-element';

function render(code, element, init, options = {}) {
    let disposer;
    createRoot(dispose => {
      disposer = dispose;
      insert(element, code(), element.firstChild ? null : undefined, init);
    }, options.owner);
    return disposer
  }

const SolidJS = {
    createSignal, onMount,
    html: SolidHTML, render,
    // h: SolidHyper,
    createStore,
    // withSolid,
    // customElement,
    For,
    Switch,
    Match,
    createEffect,
    createMemo,
    Show,
    onCleanup,
    createComputed,
    createDeferred
}

self.SolidJS = SolidJS;

/** @typedef { typeof SolidJS } SolidJS */