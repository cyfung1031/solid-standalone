import {
    createSignal, createEffect, createMemo, createComputed, createResource,
    createDeferred, createRenderEffect, createReaction, createSelector,
    createUniqueId
} from 'solid-js';
import { createStore } from "solid-js/store";

const SolidJS = {
    createSignal,
    createEffect,
    createMemo,
    
    createStore,
    
    createResource,

    createDeferred,
    createRenderEffect,
    createReaction,
    createSelector,
    
    createUniqueId
}

self.SolidJS = SolidJS;

/** @typedef { typeof SolidJS } SolidJS */