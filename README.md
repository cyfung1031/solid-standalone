# Solid.js Standalone

2024/12/13 Update:

 - Changed from Rollup to Vite 6 to build SolidJS 1.9.3

 - See https://github.com/solidjs-web/SolidJS-Web

-----------

## Tagged Template Literals
```html
<script src="https://unpkg.com/solid-standalone/html.min.js"></script>
<script>
  const { createSignal } = Solid;
  const { html, render } = SolidDOM;

  const App = () => {
    const [counter, setCounter] = createSignal(0);
    setInterval(() => setCounter(c => c + 1), 1000);
    return html`<div>${() => counter()}</div>`;
  }
  render(App, document.body);
</script>
```

## HyperScript
```html
<script src="https://unpkg.com/solid-standalone/h.min.js"></script>
<script>
  const { createSignal } = Solid;
  const { h, render } = SolidDOM;

  const App = () => {
    const [counter, setCounter] = createSignal(0);
    setInterval(() => setCounter(c => c + 1), 1000);
    return h('div', () => counter());
  }
  render(App, document.body);
</script>
```
