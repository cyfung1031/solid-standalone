

/** @type {import('../src/html.js').SolidJS}.SolidJS */
const { createSignal, onMount, createStore, html, render } = SolidJS;

const myValue = { b11: { s: 1 }, a: 5, b: 9 };
const myValue2 = { b11: { s: 3 }, a: 4, b: 2 };

const [dataw, setDataw] = createStore(myValue);
const [dataw2, setDataw2] = createStore(myValue2);


const solidWrap = (() => {
  const dummy = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  return ((SolidElement) => {
    let dispose = null;
    let dom = null;
    let _resolve = null;
    const $el = (el) => {
      if (el) dom = el;
      if (dom && dispose && _resolve) _resolve = (_resolve([dom, {dispose}]), null);
    }
    const $bind = [$el, null]
    const SolidElementWrapped = SolidElement.bind(null, $bind);
    return ($props) => {
      $bind[1] = $props;
      dispose = dom = _resolve = null;
      return new Promise(resolve => {
        _resolve = resolve;
        dispose = render(SolidElementWrapped, dummy);
        $el();
      });
    }
  })
})();



const SolidElement = ([$el, { dx, counter }]) => {
  return html`<div ref=${$el}>
        <div>${() => dx.b11.s}</div>
        <div>${() => dx.a}</div>
        <div>${() => dx.b}</div>
        ${counter}
        </div>`;
};





(async () => {
  const [counter, setCounter] = createSignal(0);
  setInterval(() => setCounter(c => c + 1), 1000);
  const SolidElementWrapped = solidWrap(SolidElement);
  const [elm1, solid1] = await SolidElementWrapped({ dx: dataw, counter });
  document.body.appendChild(elm1)
  const [elm2, solid2] = await SolidElementWrapped({ dx: dataw2, counter });
  document.body.appendChild(elm2)

  setTimeout(() => {

    setDataw({ b11: { s: 199 }, a: 5, b: 9 })

  }, 1000)
  setTimeout(() => {

    setDataw2({ b11: { s: counter }, a: 2, b: 3 })

  }, 2000)

})()