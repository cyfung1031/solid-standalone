
/** @type {import('../src/html.js').SolidJS}.SolidJS */
const { createSignal, onMount, createStore, html, render } = SolidJS;

const myValue = { b11: { s: 1 }, a: 5, b: 9 };

const [dataw, setDataw] = createStore(myValue);

const createSolidElement = (() => {
  const dummy = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  return ((p, q) => {

    return new Promise(resolve => {

      let dispose;
      const o = {};

      const App = () => {
        const [el, $el] = createSignal(0);
        onMount(() => {
          o.dom = el();
          if (o.dom && o.dispose) resolve(o);
        });
        return p({ $el, ...q });
      }
      o.dispose = render(App, dummy);
      if (o.dom && o.dispose) resolve(o);
    })

  })
})();

const p = ({ $el, dx, counter }) => {
  return html`<div ref=${$el}>
        <div>${() => dx.b11.s}</div>
        <div>${() => dx.a}</div>
        <div>${() => dx.b}</div>
        ${counter}
        </div>`;
}

(async () => {
  const [counter, setCounter] = createSignal(0);
  setInterval(() => setCounter(c => c + 1), 1000);
  const solid = await createSolidElement(p, { dx: dataw, counter });
  console.log('dom', solid)
  document.body.appendChild(solid.dom)

  setTimeout(() => {

    setDataw({ b11: { s: 199 }, a: 5, b: 9 })

  }, 1000)

})()
