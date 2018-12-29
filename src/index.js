import Babel from '@babel/standalone';
import JSXDOMExpressions from 'babel-plugin-jsx-dom-expressions/lib/plugin';
import * as Solid from 'solid-js';
import * as SolidDOM from 'solid-js/dom'

// Lifted and modified to work with Solid from Surplus Toys https://github.com/adamhaile/surplus-toys
window.Solid = Solid;
window.SolidDOM = SolidDOM;

document.addEventListener("DOMContentLoaded", compileSolid);

function compileSolid() {
  let scriptIn,
      scriptOut,
      source,
      compiled;

  Babel.registerPlugin('jsx-dom-expressions', JSXDOMExpressions)

  while (scriptIn = document.querySelector("script[type='text/solid']")) {
    scriptIn.type += '-processed';

    source = scriptIn.textContent || scriptIn.innerText || scriptIn.innerHTML;
    compiled = Babel.transform(source, { plugins: [['jsx-dom-expressions', {moduleName: 'SolidDOM.r'}]]});

    scriptOut = document.createElement('script');
    scriptOut.type = 'text/javascript';
    scriptOut.src  = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled.code);
    scriptOut.async = scriptIn.async;
    scriptOut.defer = scriptIn.defer;

    if (scriptIn.nextSibling) {
      scriptIn.parentNode.insertBefore(scriptOut, scriptIn.nextSibling);
    } else {
      scriptIn.parentNode.appendChild(scriptOut);
    }
  }
}