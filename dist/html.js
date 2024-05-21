(function () {
  'use strict';

  let taskIdCounter = 1,
    isCallbackScheduled = false,
    isPerformingWork = false,
    taskQueue = [],
    currentTask = null,
    shouldYieldToHost = null,
    yieldInterval = 5,
    deadline = 0,
    maxYieldInterval = 300,
    scheduleCallback = null,
    scheduledCallback = null;
  const maxSigned31BitInt = 1073741823;
  function setupScheduler() {
    const channel = new MessageChannel(),
      port = channel.port2;
    scheduleCallback = () => port.postMessage(null);
    channel.port1.onmessage = () => {
      if (scheduledCallback !== null) {
        const currentTime = performance.now();
        deadline = currentTime + yieldInterval;
        const hasTimeRemaining = true;
        try {
          const hasMoreWork = scheduledCallback(hasTimeRemaining, currentTime);
          if (!hasMoreWork) {
            scheduledCallback = null;
          } else port.postMessage(null);
        } catch (error) {
          port.postMessage(null);
          throw error;
        }
      }
    };
    if (navigator && navigator.scheduling && navigator.scheduling.isInputPending) {
      const scheduling = navigator.scheduling;
      shouldYieldToHost = () => {
        const currentTime = performance.now();
        if (currentTime >= deadline) {
          if (scheduling.isInputPending()) {
            return true;
          }
          return currentTime >= maxYieldInterval;
        } else {
          return false;
        }
      };
    } else {
      shouldYieldToHost = () => performance.now() >= deadline;
    }
  }
  function enqueue(taskQueue, task) {
    function findIndex() {
      let m = 0;
      let n = taskQueue.length - 1;
      while (m <= n) {
        const k = (n + m) >> 1;
        const cmp = task.expirationTime - taskQueue[k].expirationTime;
        if (cmp > 0) m = k + 1;
        else if (cmp < 0) n = k - 1;
        else return k;
      }
      return m;
    }
    taskQueue.splice(findIndex(), 0, task);
  }
  function requestCallback(fn, options) {
    if (!scheduleCallback) setupScheduler();
    let startTime = performance.now(),
      timeout = maxSigned31BitInt;
    if (options && options.timeout) timeout = options.timeout;
    const newTask = {
      id: taskIdCounter++,
      fn,
      startTime,
      expirationTime: startTime + timeout
    };
    enqueue(taskQueue, newTask);
    if (!isCallbackScheduled && !isPerformingWork) {
      isCallbackScheduled = true;
      scheduledCallback = flushWork;
      scheduleCallback();
    }
    return newTask;
  }
  function flushWork(hasTimeRemaining, initialTime) {
    isCallbackScheduled = false;
    isPerformingWork = true;
    try {
      return workLoop(hasTimeRemaining, initialTime);
    } finally {
      currentTask = null;
      isPerformingWork = false;
    }
  }
  function workLoop(hasTimeRemaining, initialTime) {
    let currentTime = initialTime;
    currentTask = taskQueue[0] || null;
    while (currentTask !== null) {
      if (currentTask.expirationTime > currentTime && (!hasTimeRemaining || shouldYieldToHost())) {
        break;
      }
      const callback = currentTask.fn;
      if (callback !== null) {
        currentTask.fn = null;
        const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
        callback(didUserCallbackTimeout);
        currentTime = performance.now();
        if (currentTask === taskQueue[0]) {
          taskQueue.shift();
        }
      } else taskQueue.shift();
      currentTask = taskQueue[0] || null;
    }
    return currentTask !== null;
  }

  const equalFn = (a, b) => a === b;
  const $PROXY = Symbol("solid-proxy");
  const $TRACK = Symbol("solid-track");
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let ExternalSourceConfig = null;
  let Listener = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
      owner = Owner,
      unowned = fn.length === 0,
      current = detachedOwner === undefined ? owner : detachedOwner,
      root = unowned
        ? UNOWNED
        : {
            owned: null,
            cleanups: null,
            context: current ? current.context : null,
            owner: current
          },
      updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createComputed(fn, value, options) {
    const c = createComputation(fn, value, true, STALE);
    updateComputation(c);
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE),
      s = SuspenseContext && useContext(SuspenseContext);
    if (s) c.suspense = s;
    if (!options || !options.render) c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function createDeferred(source, options) {
    let t,
      timeout = options ? options.timeoutMs : undefined;
    const node = createComputation(
      () => {
        if (!t || !t.fn)
          t = requestCallback(
            () => setDeferred(() => node.value),
            timeout !== undefined
              ? {
                  timeout
                }
              : undefined
          );
        return source();
      },
      undefined,
      true
    );
    const [deferred, setDeferred] = createSignal(
      node.value,
      options
    );
    updateComputation(node);
    setDeferred(() =>
      node.value
    );
    return deferred;
  }
  function batch(fn) {
    return runUpdates(fn, false);
  }
  function untrack(fn) {
    if (Listener === null) return fn();
    const listener = Listener;
    Listener = null;
    try {
      if (ExternalSourceConfig) ;
      return fn();
    } finally {
      Listener = listener;
    }
  }
  function onMount(fn) {
    createEffect(() => untrack(fn));
  }
  function onCleanup(fn) {
    if (Owner === null);
    else if (Owner.cleanups === null) Owner.cleanups = [fn];
    else Owner.cleanups.push(fn);
    return fn;
  }
  function getListener() {
    return Listener;
  }
  function useContext(context) {
    return Owner && Owner.context && Owner.context[context.id] !== undefined
      ? Owner.context[context.id]
      : context.defaultValue;
  }
  function children(fn) {
    const children = createMemo(fn);
    const memo = createMemo(() => resolveChildren(children()));
    memo.toArray = () => {
      const c = memo();
      return Array.isArray(c) ? c : c != null ? [c] : [];
    };
    return memo;
  }
  let SuspenseContext;
  function readSignal() {
    if (this.sources && (this.state)) {
      if ((this.state) === STALE) updateComputation(this);
      else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!this.observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        this.observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current =
      node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0; i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o)) ;
            if (TransitionRunning ? !o.tState : !o.state) {
              if (o.pure) Updates.push(o);
              else Effects.push(o);
              if (o.observers) markDownstream(o);
            }
            if (!TransitionRunning) o.state = STALE;
          }
          if (Updates.length > 10e5) {
            Updates = [];
            if (false);
            throw new Error();
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const time = ExecCount;
    runComputation(
      node,
      node.value,
      time
    );
  }
  function runComputation(node, value, time) {
    let nextValue;
    const owner = Owner,
      listener = Listener;
    Listener = Owner = node;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) {
        {
          node.state = STALE;
          node.owned && node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
      node.updatedAt = time + 1;
      return handleError(err);
    } finally {
      Listener = listener;
      Owner = owner;
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: Owner ? Owner.context : null,
      pure
    };
    if (Owner === null);
    else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];
        else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    if ((node.state) === 0) return;
    if ((node.state) === PENDING) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if ((node.state) === STALE) {
        updateComputation(node);
      } else if ((node.state) === PENDING) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;
    else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!wait) Effects = null;
      Updates = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    const e = Effects;
    Effects = null;
    if (e.length) runUpdates(() => runEffects(e), false);
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
      userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);
      else queue[userLength++] = e;
    }
    for (i = 0; i < userLength; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        const state = source.state;
        if (state === STALE) {
          if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount))
            runTop(source);
        } else if (state === PENDING) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);
        else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
          index = node.sourceSlots.pop(),
          obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
            s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.owned) {
      for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
  }
  function castError(err) {
    if (err instanceof Error) return err;
    return new Error(typeof err === "string" ? err : "Unknown error", {
      cause: err
    });
  }
  function handleError(err, owner = Owner) {
    const error = castError(err);
    throw error;
  }
  function resolveChildren(children) {
    if (typeof children === "function" && !children.length) return resolveChildren(children());
    if (Array.isArray(children)) {
      const results = [];
      for (let i = 0; i < children.length; i++) {
        const result = resolveChildren(children[i]);
        Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
      }
      return results;
    }
    return children;
  }

  const FALLBACK = Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [],
      mapped = [],
      disposers = [],
      len = 0,
      indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [],
        i,
        j;
      newItems[$TRACK];
      return untrack(() => {
        let newLen = newItems.length,
          newIndices,
          newIndicesNext,
          temp,
          tempdisposers,
          tempIndexes,
          start,
          end,
          newEnd,
          item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        } else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (
            start = 0, end = Math.min(len, newLen);
            start < end && items[start] === newItems[start];
            start++
          );
          for (
            end = len - 1, newEnd = newLen - 1;
            end >= start && newEnd >= start && items[end] === newItems[newEnd];
            end--, newEnd--
          ) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === undefined ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== undefined && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, (len = newLen));
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }
  function trueFn() {
    return true;
  }
  const propTraps = {
    get(_, property, receiver) {
      if (property === $PROXY) return receiver;
      return _.get(property);
    },
    has(_, property) {
      if (property === $PROXY) return true;
      return _.has(property);
    },
    set: trueFn,
    deleteProperty: trueFn,
    getOwnPropertyDescriptor(_, property) {
      return {
        configurable: true,
        enumerable: true,
        get() {
          return _.get(property);
        },
        set: trueFn,
        deleteProperty: trueFn
      };
    },
    ownKeys(_) {
      return _.keys();
    }
  };
  function resolveSource(s) {
    return !(s = typeof s === "function" ? s() : s) ? {} : s;
  }
  function resolveSources() {
    for (let i = 0, length = this.length; i < length; ++i) {
      const v = this[i]();
      if (v !== undefined) return v;
    }
  }
  function mergeProps(...sources) {
    let proxy = false;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      proxy = proxy || (!!s && $PROXY in s);
      sources[i] = typeof s === "function" ? ((proxy = true), createMemo(s)) : s;
    }
    if (proxy) {
      return new Proxy(
        {
          get(property) {
            for (let i = sources.length - 1; i >= 0; i--) {
              const v = resolveSource(sources[i])[property];
              if (v !== undefined) return v;
            }
          },
          has(property) {
            for (let i = sources.length - 1; i >= 0; i--) {
              if (property in resolveSource(sources[i])) return true;
            }
            return false;
          },
          keys() {
            const keys = [];
            for (let i = 0; i < sources.length; i++)
              keys.push(...Object.keys(resolveSource(sources[i])));
            return [...new Set(keys)];
          }
        },
        propTraps
      );
    }
    const sourcesMap = {};
    const defined = Object.create(null);
    for (let i = sources.length - 1; i >= 0; i--) {
      const source = sources[i];
      if (!source) continue;
      const sourceKeys = Object.getOwnPropertyNames(source);
      for (let i = sourceKeys.length - 1; i >= 0; i--) {
        const key = sourceKeys[i];
        if (key === "__proto__" || key === "constructor") continue;
        const desc = Object.getOwnPropertyDescriptor(source, key);
        if (!defined[key]) {
          defined[key] = desc.get
            ? {
                enumerable: true,
                configurable: true,
                get: resolveSources.bind((sourcesMap[key] = [desc.get.bind(source)]))
              }
            : desc.value !== undefined
            ? desc
            : undefined;
        } else {
          const sources = sourcesMap[key];
          if (sources) {
            if (desc.get) sources.push(desc.get.bind(source));
            else if (desc.value !== undefined) sources.push(() => desc.value);
          }
        }
      }
    }
    const target = {};
    const definedKeys = Object.keys(defined);
    for (let i = definedKeys.length - 1; i >= 0; i--) {
      const key = definedKeys[i],
        desc = defined[key];
      if (desc && desc.get) Object.defineProperty(target, key, desc);
      else target[key] = desc ? desc.value : undefined;
    }
    return target;
  }

  const narrowedError = name => `Stale read from <${name}>.`;
  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback || undefined));
  }
  function Show(props) {
    const keyed = props.keyed;
    const condition = createMemo(() => props.when, undefined, {
      equals: (a, b) => (keyed ? a === b : !a === !b)
    });
    return createMemo(
      () => {
        const c = condition();
        if (c) {
          const child = props.children;
          const fn = typeof child === "function" && child.length > 0;
          return fn
            ? untrack(() =>
                child(
                  keyed
                    ? c
                    : () => {
                        if (!untrack(condition)) throw narrowedError("Show");
                        return props.when;
                      }
                )
              )
            : child;
        }
        return props.fallback;
      },
      undefined,
      undefined
    );
  }
  function Switch(props) {
    let keyed = false;
    const equals = (a, b) => (keyed ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2];
    const conditions = children(() => props.children),
      evalConditions = createMemo(
        () => {
          let conds = conditions();
          if (!Array.isArray(conds)) conds = [conds];
          for (let i = 0; i < conds.length; i++) {
            const c = conds[i].when;
            if (c) {
              keyed = !!conds[i].keyed;
              return [i, c, conds[i]];
            }
          }
          return [-1];
        },
        undefined,
        {
          equals
        }
      );
    return createMemo(
      () => {
        const [index, when, cond] = evalConditions();
        if (index < 0) return props.fallback;
        const c = cond.children;
        const fn = typeof c === "function" && c.length > 0;
        return fn
          ? untrack(() =>
              c(
                keyed
                  ? when
                  : () => {
                      if (untrack(evalConditions)[0] !== index) throw narrowedError("Match");
                      return cond.when;
                    }
              )
            )
          : c;
      },
      undefined,
      undefined
    );
  }
  function Match(props) {
    return props;
  }

  const booleans = [
    "allowfullscreen",
    "async",
    "autofocus",
    "autoplay",
    "checked",
    "controls",
    "default",
    "disabled",
    "formnovalidate",
    "hidden",
    "indeterminate",
    "inert",
    "ismap",
    "loop",
    "multiple",
    "muted",
    "nomodule",
    "novalidate",
    "open",
    "playsinline",
    "readonly",
    "required",
    "reversed",
    "seamless",
    "selected"
  ];
  const Properties = /*#__PURE__*/ new Set([
    "className",
    "value",
    "readOnly",
    "formNoValidate",
    "isMap",
    "noModule",
    "playsInline",
    ...booleans
  ]);
  const ChildProperties = /*#__PURE__*/ new Set([
    "innerHTML",
    "textContent",
    "innerText",
    "children"
  ]);
  const Aliases = /*#__PURE__*/ Object.assign(Object.create(null), {
    className: "class",
    htmlFor: "for"
  });
  const PropAliases = /*#__PURE__*/ Object.assign(Object.create(null), {
    class: "className",
    formnovalidate: {
      $: "formNoValidate",
      BUTTON: 1,
      INPUT: 1
    },
    ismap: {
      $: "isMap",
      IMG: 1
    },
    nomodule: {
      $: "noModule",
      SCRIPT: 1
    },
    playsinline: {
      $: "playsInline",
      VIDEO: 1
    },
    readonly: {
      $: "readOnly",
      INPUT: 1,
      TEXTAREA: 1
    }
  });
  function getPropAlias(prop, tagName) {
    const a = PropAliases[prop];
    return typeof a === "object" ? (a[tagName] ? a["$"] : undefined) : a;
  }
  const DelegatedEvents = /*#__PURE__*/ new Set([
    "beforeinput",
    "click",
    "dblclick",
    "contextmenu",
    "focusin",
    "focusout",
    "input",
    "keydown",
    "keyup",
    "mousedown",
    "mousemove",
    "mouseout",
    "mouseover",
    "mouseup",
    "pointerdown",
    "pointermove",
    "pointerout",
    "pointerover",
    "pointerup",
    "touchend",
    "touchmove",
    "touchstart"
  ]);
  const SVGElements = /*#__PURE__*/ new Set([
    "altGlyph",
    "altGlyphDef",
    "altGlyphItem",
    "animate",
    "animateColor",
    "animateMotion",
    "animateTransform",
    "circle",
    "clipPath",
    "color-profile",
    "cursor",
    "defs",
    "desc",
    "ellipse",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
    "filter",
    "font",
    "font-face",
    "font-face-format",
    "font-face-name",
    "font-face-src",
    "font-face-uri",
    "foreignObject",
    "g",
    "glyph",
    "glyphRef",
    "hkern",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "metadata",
    "missing-glyph",
    "mpath",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "set",
    "stop",
    "svg",
    "switch",
    "symbol",
    "text",
    "textPath",
    "tref",
    "tspan",
    "use",
    "view",
    "vkern"
  ]);
  const SVGNamespace = {
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace"
  };

  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
      aEnd = a.length,
      bEnd = bLength,
      aStart = 0,
      bStart = 0,
      after = a[aEnd - 1].nextSibling,
      map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? (bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart]) : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
              sequence = 1,
              t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }

  const $$EVENTS = "_$DX_DELEGATE";
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function setAttribute(node, name, value) {
    if (value == null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }
  function setAttributeNS(node, namespace, name, value) {
    if (value == null) node.removeAttributeNS(namespace, name);
    else node.setAttributeNS(namespace, name, value);
  }
  function className(node, value) {
    if (value == null) node.removeAttribute("class");
    else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, (handler[0] = e => handlerFn.call(node, handler[1], e)));
    } else node.addEventListener(name, handler);
  }
  function classList(node, value, prev = {}) {
    const classKeys = Object.keys(value || {}),
      prevKeys = Object.keys(prev);
    let i, len;
    for (i = 0, len = prevKeys.length; i < len; i++) {
      const key = prevKeys[i];
      if (!key || key === "undefined" || value[key]) continue;
      toggleClassKey(node, key, false);
      delete prev[key];
    }
    for (i = 0, len = classKeys.length; i < len; i++) {
      const key = classKeys[i],
        classValue = !!value[key];
      if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
      toggleClassKey(node, key, true);
      prev[key] = classValue;
    }
    return prev;
  }
  function style(node, value, prev) {
    if (!value) return prev ? setAttribute(node, "style") : value;
    const nodeStyle = node.style;
    if (typeof value === "string") return (nodeStyle.cssText = value);
    typeof prev === "string" && (nodeStyle.cssText = prev = undefined);
    prev || (prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function spread(node, props = {}, isSVG, skipChildren) {
    const prevProps = {};
    if (!skipChildren) {
      createRenderEffect(
        () => (prevProps.children = insertExpression(node, props.children, prevProps.children))
      );
    }
    createRenderEffect(() =>
      typeof props.ref === "function" ? use(props.ref, node) : (props.ref = node)
    );
    createRenderEffect(() => assign(node, props, isSVG, true, prevProps, true));
    return prevProps;
  }
  function dynamicProperty(props, key) {
    const src = props[key];
    Object.defineProperty(props, key, {
      get() {
        return src();
      },
      enumerable: true
    });
    return props;
  }
  function use(fn, element, arg) {
    return untrack(() => fn(element, arg));
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
    props || (props = {});
    for (const prop in prevProps) {
      if (!(prop in props)) {
        if (prop === "children") continue;
        prevProps[prop] = assignProp(node, prop, null, prevProps[prop], isSVG, skipRef);
      }
    }
    for (const prop in props) {
      if (prop === "children") {
        if (!skipChildren) insertExpression(node, props.children);
        continue;
      }
      const value = props[prop];
      prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef);
    }
  }
  function toPropertyName$1(name) {
    return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
  }
  function toggleClassKey(node, key, value) {
    const classNames = key.trim().split(/\s+/);
    for (let i = 0, nameLen = classNames.length; i < nameLen; i++)
      node.classList.toggle(classNames[i], value);
  }
  function assignProp(node, prop, value, prev, isSVG, skipRef) {
    let isCE, isProp, isChildProp, propAlias, forceProp;
    if (prop === "style") return style(node, value, prev);
    if (prop === "classList") return classList(node, value, prev);
    if (value === prev) return prev;
    if (prop === "ref") {
      if (!skipRef) value(node);
    } else if (prop.slice(0, 3) === "on:") {
      const e = prop.slice(3);
      prev && node.removeEventListener(e, prev);
      value && node.addEventListener(e, value);
    } else if (prop.slice(0, 10) === "oncapture:") {
      const e = prop.slice(10);
      prev && node.removeEventListener(e, prev, true);
      value && node.addEventListener(e, value, true);
    } else if (prop.slice(0, 2) === "on") {
      const name = prop.slice(2).toLowerCase();
      const delegate = DelegatedEvents.has(name);
      if (!delegate && prev) {
        const h = Array.isArray(prev) ? prev[0] : prev;
        node.removeEventListener(name, h);
      }
      if (delegate || value) {
        addEventListener(node, name, value, delegate);
        delegate && delegateEvents([name]);
      }
    } else if (prop.slice(0, 5) === "attr:") {
      setAttribute(node, prop.slice(5), value);
    } else if (
      (forceProp = prop.slice(0, 5) === "prop:") ||
      (isChildProp = ChildProperties.has(prop)) ||
      (!isSVG &&
        ((propAlias = getPropAlias(prop, node.tagName)) || (isProp = Properties.has(prop)))) ||
      (isCE = node.nodeName.includes("-"))
    ) {
      if (forceProp) {
        prop = prop.slice(5);
        isProp = true;
      }
      if (prop === "class" || prop === "className") className(node, value);
      else if (isCE && !isProp && !isChildProp) node[toPropertyName$1(prop)] = value;
      else node[propAlias || prop] = value;
    } else {
      const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
      if (ns) setAttributeNS(node, ns, prop, value);
      else setAttribute(node, Aliases[prop] || prop, value);
    }
    return value;
  }
  function eventHandler(e) {
    const key = `$$${e.type}`;
    let node = (e.composedPath && e.composedPath()[0]) || e.target;
    if (e.target !== node) {
      Object.defineProperty(e, "target", {
        configurable: true,
        value: node
      });
    }
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    while (node) {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node = node._$host || node.parentNode || node.host;
    }
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
      multi = marker !== undefined;
    parent = (multi && current[0] && current[0].parentNode) || parent;
    if (t === "string" || t === "number") {
      if (t === "number") value = value.toString();
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data !== value && (node.data = value);
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => (current = insertExpression(parent, array, current, marker, true)));
        return () => current;
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value.nodeType) {
      if (Array.isArray(current)) {
        if (multi) return (current = cleanChildren(parent, current, marker, value));
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else;
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
        prev = current && current[normalized.length],
        t;
      if (item == null || item === true || item === false);
      else if ((t = typeof item) === "object" && item.nodeType) {
        normalized.push(item);
      } else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if (t === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic =
            normalizeIncomingArray(
              normalized,
              Array.isArray(item) ? item : [item],
              Array.isArray(prev) ? prev : [prev]
            ) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);
        else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker = null) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return (parent.textContent = "");
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i)
            isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);
          else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }

  const tagRE = /(?:<!--[\S\s]*?-->|<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>)/g;
  const attrRE =
    /(?:\s(?<boolean>[^/\s><=]+?)(?=[\s/>]))|(?:(?<name>\S+?)(?:\s*=\s*(?:(['"])(?<quotedValue>[\s\S]*?)\3|(?<unquotedValue>[^\s>]+))))/g;
  const lookup = {
    area: true,
    base: true,
    br: true,
    col: true,
    embed: true,
    hr: true,
    img: true,
    input: true,
    keygen: true,
    link: true,
    menuitem: true,
    meta: true,
    param: true,
    source: true,
    track: true,
    wbr: true
  };
  function parseTag(tag) {
    const res = {
      type: "tag",
      name: "",
      voidElement: false,
      attrs: [],
      children: []
    };
    const tagMatch = tag.match(/<\/?([^\s]+?)[/\s>]/);
    if (tagMatch) {
      res.name = tagMatch[1];
      if (lookup[tagMatch[1].toLowerCase()] || tag.charAt(tag.length - 2) === "/") {
        res.voidElement = true;
      }
      if (res.name.startsWith("!--")) {
        const endIndex = tag.indexOf("-->");
        return {
          type: "comment",
          comment: endIndex !== -1 ? tag.slice(4, endIndex) : ""
        };
      }
    }
    const reg = new RegExp(attrRE);
    for (const match of tag.matchAll(reg)) {
      if ((match[1] || match[2]).startsWith("use:")) {
        res.attrs.push({
          type: "directive",
          name: match[1] || match[2],
          value: match[4] || match[5] || ""
        });
      } else {
        res.attrs.push({
          type: "attr",
          name: match[1] || match[2],
          value: match[4] || match[5] || ""
        });
      }
    }
    return res;
  }
  function pushTextNode(list, html, start) {
    const end = html.indexOf("<", start);
    const content = html.slice(start, end === -1 ? void 0 : end);
    if (!/^\s*$/.test(content)) {
      list.push({
        type: "text",
        content: content
      });
    }
  }
  function pushCommentNode(list, tag) {
    const content = tag.replace("<!--", "").replace("-->", "");
    if (!/^\s*$/.test(content)) {
      list.push({
        type: "comment",
        content: content
      });
    }
  }
  function parse(html) {
    const result = [];
    let current = void 0;
    let level = -1;
    const arr = [];
    const byTag = {};
    html.replace(tagRE, (tag, index) => {
      const isOpen = tag.charAt(1) !== "/";
      const isComment = tag.slice(0, 4) === "<!--";
      const start = index + tag.length;
      const nextChar = html.charAt(start);
      let parent = void 0;
      if (isOpen && !isComment) {
        level++;
        current = parseTag(tag);
        if (!current.voidElement && nextChar && nextChar !== "<") {
          pushTextNode(current.children, html, start);
        }
        byTag[current.tagName] = current;
        if (level === 0) {
          result.push(current);
        }
        parent = arr[level - 1];
        if (parent) {
          parent.children.push(current);
        }
        arr[level] = current;
      }
      if (isComment) {
        if (level < 0) {
          pushCommentNode(result, tag);
        } else {
          pushCommentNode(arr[level].children, tag);
        }
      }
      if (isComment || !isOpen || current.voidElement) {
        if (!isComment) {
          level--;
        }
        if (nextChar !== "<" && nextChar) {
          parent = level === -1 ? result : arr[level].children;
          pushTextNode(parent, html, start);
        }
      }
    });
    return result;
  }
  function attrString(attrs) {
    const buff = [];
    for (const attr of attrs) {
      buff.push(attr.name + '="' + attr.value.replace(/"/g, "&quot;") + '"');
    }
    if (!buff.length) {
      return "";
    }
    return " " + buff.join(" ");
  }
  function stringifier(buff, doc) {
    switch (doc.type) {
      case "text":
        return buff + doc.content;
      case "tag":
        buff +=
          "<" + doc.name + (doc.attrs ? attrString(doc.attrs) : "") + (doc.voidElement ? "/>" : ">");
        if (doc.voidElement) {
          return buff;
        }
        return buff + doc.children.reduce(stringifier, "") + "</" + doc.name + ">";
      case "comment":
        return (buff += "<!--" + doc.content + "-->");
    }
  }
  function stringify(doc) {
    return doc.reduce(function (token, rootEl) {
      return token + stringifier("", rootEl);
    }, "");
  }
  const cache = new Map();
  const VOID_ELEMENTS =
    /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i;
  const spaces = " \\f\\n\\r\\t";
  const almostEverything = "[^" + spaces + "\\/>\"'=]+";
  const attrName = "[ " + spaces + "]+(?:use:<!--#-->|" + almostEverything + ")";
  const tagName = "<([A-Za-z$#]+[A-Za-z0-9:_-]*)((?:";
  const attrPartials =
    "(?:\\s*=\\s*(?:'[^']*?'|\"[^\"]*?\"|\\([^)]*?\\)|<[^>]*?>|" + almostEverything + "))?)";
  const attrSeeker = new RegExp(tagName + attrName + attrPartials + "+)([ " + spaces + "]*/?>)", "g");
  const findAttributes = new RegExp(
    "(" + attrName + "\\s*=\\s*)(<!--#-->|['\"(]([\\w\\s]*<!--#-->[\\w\\s]*)*['\")])",
    "gi"
  );
  const selfClosing = new RegExp(tagName + attrName + attrPartials + "*)([ " + spaces + "]*/>)", "g");
  const marker = "<!--#-->";
  const reservedNameSpaces = new Set(["class", "on", "oncapture", "style", "use", "prop", "attr"]);
  function attrReplacer($0, $1, $2, $3) {
    return "<" + $1 + $2.replace(findAttributes, replaceAttributes) + $3;
  }
  function replaceAttributes($0, $1, $2) {
    return (
      $1.replace(/<!--#-->/g, "###") +
      ($2[0] === '"' || $2[0] === "'" ? $2.replace(/<!--#-->/g, "###") : '"###"')
    );
  }
  function fullClosing($0, $1, $2) {
    return VOID_ELEMENTS.test($1) ? $0 : "<" + $1 + $2 + "></" + $1 + ">";
  }
  function toPropertyName(name) {
    return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
  }
  function parseDirective(name, value, tag, options) {
    if (name === "use:###" && value === "###") {
      const count = options.counter++;
      options.exprs.push(
        `typeof exprs[${count}] === "function" ? r.use(exprs[${count}], ${tag}, exprs[${options.counter++}]) : (()=>{throw new Error("use:### must be a function")})()`
      );
    } else {
      throw new Error(`Not support syntax ${name} must be use:{function}`);
    }
  }
  function createHTML(
    r,
    { delegateEvents = true, functionBuilder = (...args) => new Function(...args) } = {}
  ) {
    let uuid = 1;
    r.wrapProps = props => {
      const d = Object.getOwnPropertyDescriptors(props);
      for (const k in d) {
        if (typeof d[k].value === "function" && !d[k].value.length) r.dynamicProperty(props, k);
      }
      return props;
    };
    function createTemplate(statics, opt) {
      let i = 0,
        markup = "";
      for (; i < statics.length - 1; i++) {
        markup = markup + statics[i] + "<!--#-->";
      }
      markup = markup + statics[i];
      const replaceList = [
        [selfClosing, fullClosing],
        [/<(<!--#-->)/g, "<###"],
        [/\.\.\.(<!--#-->)/g, "###"],
        [attrSeeker, attrReplacer],
        [/>\n+\s*/g, ">"],
        [/\n+\s*</g, "<"],
        [/\s+</g, " <"],
        [/>\s+/g, "> "]
      ];
      markup = replaceList.reduce((acc, x) => {
        return acc.replace(x[0], x[1]);
      }, markup);
      const pars = parse(markup);
      const [html, code] = parseTemplate(pars, opt.funcBuilder),
        templates = [];
      for (let i = 0; i < html.length; i++) {
        templates.push(document.createElement("template"));
        templates[i].innerHTML = html[i];
        const nomarkers = templates[i].content.querySelectorAll("script,style");
        for (let j = 0; j < nomarkers.length; j++) {
          const d = nomarkers[j].firstChild?.data || "";
          if (d.indexOf(marker) > -1) {
            const parts = d.split(marker).reduce((memo, p, i) => {
              i && memo.push("");
              memo.push(p);
              return memo;
            }, []);
            nomarkers[i].firstChild.replaceWith(...parts);
          }
        }
      }
      templates[0].create = code;
      cache.set(statics, templates);
      return templates;
    }
    function parseKeyValue(node, tag, name, value, isSVG, isCE, options) {
      let expr =
          value === "###"
            ? `!doNotWrap ? exprs[${options.counter}]() : exprs[${options.counter++}]`
            : value
                .split("###")
                .map((v, i) =>
                  i
                    ? ` + (typeof exprs[${options.counter}] === "function" ? exprs[${
                      options.counter
                    }]() : exprs[${options.counter++}]) + "${v}"`
                    : `"${v}"`
                )
                .join(""),
        parts,
        namespace;
      if ((parts = name.split(":")) && parts[1] && reservedNameSpaces.has(parts[0])) {
        name = parts[1];
        namespace = parts[0];
      }
      const isChildProp = r.ChildProperties.has(name);
      const isProp = r.Properties.has(name);
      if (name === "style") {
        const prev = `_$v${uuid++}`;
        options.decl.push(`${prev}={}`);
        options.exprs.push(`r.style(${tag},${expr},${prev})`);
      } else if (name === "classList") {
        const prev = `_$v${uuid++}`;
        options.decl.push(`${prev}={}`);
        options.exprs.push(`r.classList(${tag},${expr},${prev})`);
      } else if (
        namespace !== "attr" &&
        (isChildProp ||
          (!isSVG && (r.getPropAlias(name, node.name.toUpperCase()) || isProp)) ||
          isCE ||
          namespace === "prop")
      ) {
        if (isCE && !isChildProp && !isProp && namespace !== "prop") name = toPropertyName(name);
        options.exprs.push(
          `${tag}.${r.getPropAlias(name, node.name.toUpperCase()) || name} = ${expr}`
        );
      } else {
        const ns = isSVG && name.indexOf(":") > -1 && r.SVGNamespace[name.split(":")[0]];
        if (ns) options.exprs.push(`r.setAttributeNS(${tag},"${ns}","${name}",${expr})`);
        else options.exprs.push(`r.setAttribute(${tag},"${r.Aliases[name] || name}",${expr})`);
      }
    }
    function parseAttribute(node, tag, name, value, isSVG, isCE, options) {
      if (name.slice(0, 2) === "on") {
        if (!name.includes(":")) {
          const lc = name.slice(2).toLowerCase();
          const delegate = delegateEvents && r.DelegatedEvents.has(lc);
          options.exprs.push(
            `r.addEventListener(${tag},"${lc}",exprs[${options.counter++}],${delegate})`
          );
          delegate && options.delegatedEvents.add(lc);
        } else {
          let capture = name.startsWith("oncapture:");
          options.exprs.push(
            `${tag}.addEventListener("${name.slice(capture ? 10 : 3)}",exprs[${options.counter++}]${
            capture ? ",true" : ""
          })`
          );
        }
      } else if (name === "ref") {
        options.exprs.push(`exprs[${options.counter++}](${tag})`);
      } else {
        const childOptions = Object.assign({}, options, {
            exprs: []
          }),
          count = options.counter;
        parseKeyValue(node, tag, name, value, isSVG, isCE, childOptions);
        options.decl.push(
          `_fn${count} = (${value === "###" ? "doNotWrap" : ""}) => {\n${childOptions.exprs.join(
          ";\n"
        )};\n}`
        );
        if (value === "###") {
          options.exprs.push(
            `typeof exprs[${count}] === "function" ? r.effect(_fn${count}) : _fn${count}(true)`
          );
        } else {
          let check = "";
          for (let i = count; i < childOptions.counter; i++) {
            i !== count && (check += " || ");
            check += `typeof exprs[${i}] === "function"`;
          }
          options.exprs.push(check + ` ? r.effect(_fn${count}) : _fn${count}()`);
        }
        options.counter = childOptions.counter;
        options.wrap = false;
      }
    }
    function processChildren(node, options) {
      const childOptions = Object.assign({}, options, {
        first: true,
        multi: false,
        parent: options.path
      });
      if (node.children.length > 1) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (
            (child.type === "comment" && child.content === "#") ||
            (child.type === "tag" && child.name === "###")
          ) {
            childOptions.multi = true;
            break;
          }
        }
      }
      let i = 0;
      while (i < node.children.length) {
        const child = node.children[i];
        if (child.name === "###") {
          if (childOptions.multi) {
            node.children[i] = {
              type: "comment",
              content: "#"
            };
            i++;
          } else node.children.splice(i, 1);
          processComponent(child, childOptions);
          continue;
        }
        parseNode(child, childOptions);
        if (!childOptions.multi && child.type === "comment" && child.content === "#")
          node.children.splice(i, 1);
        else i++;
      }
      options.counter = childOptions.counter;
      options.templateId = childOptions.templateId;
      options.hasCustomElement = options.hasCustomElement || childOptions.hasCustomElement;
    }
    function processComponentProps(propGroups) {
      let result = [];
      for (const props of propGroups) {
        if (Array.isArray(props)) {
          if (!props.length) continue;
          result.push(`r.wrapProps({${props.join(",") || ""}})`);
        } else result.push(props);
      }
      return result.length > 1 ? `r.mergeProps(${result.join(",")})` : result[0];
    }
    function processComponent(node, options) {
      let props = [];
      const keys = Object.keys(node.attrs),
        propGroups = [props],
        componentIdentifier = options.counter++;
      for (let i = 0; i < keys.length; i++) {
        const { type, name, value } = node.attrs[i];
        if (type === "attr") {
          if (name === "###") {
            propGroups.push(`exprs[${options.counter++}]`);
            propGroups.push((props = []));
          } else if (value === "###") {
            props.push(`${name}: exprs[${options.counter++}]`);
          } else props.push(`${name}: "${value}"`);
        } else if (type === "directive") {
          const tag = `_$el${uuid++}`;
          const topDecl = !options.decl.length;
          options.decl.push(
            topDecl ? "" : `${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`
          );
          parseDirective(name, value, tag, options);
        }
      }
      if (
        node.children.length === 1 &&
        node.children[0].type === "comment" &&
        node.children[0].content === "#"
      ) {
        props.push(`children: () => exprs[${options.counter++}]`);
      } else if (node.children.length) {
        const children = {
            type: "fragment",
            children: node.children
          },
          childOptions = Object.assign({}, options, {
            first: true,
            decl: [],
            exprs: [],
            parent: false
          });
        parseNode(children, childOptions);
        props.push(`children: () => { ${childOptions.exprs.join(";\n")}}`);
        options.templateId = childOptions.templateId;
        options.counter = childOptions.counter;
      }
      let tag;
      if (options.multi) {
        tag = `_$el${uuid++}`;
        options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
      }
      if (options.parent)
        options.exprs.push(
          `r.insert(${
          options.parent
        }, r.createComponent(exprs[${componentIdentifier}],${processComponentProps(propGroups)})${
          tag ? `, ${tag}` : ""
        })`
        );
      else
        options.exprs.push(
          `${
          options.fragment ? "" : "return "
        }r.createComponent(exprs[${componentIdentifier}],${processComponentProps(propGroups)})`
        );
      options.path = tag;
      options.first = false;
    }
    function parseNode(node, options) {
      if (node.type === "fragment") {
        const parts = [];
        node.children.forEach(child => {
          if (child.type === "tag") {
            if (child.name === "###") {
              const childOptions = Object.assign({}, options, {
                first: true,
                fragment: true,
                decl: [],
                exprs: []
              });
              processComponent(child, childOptions);
              parts.push(childOptions.exprs[0]);
              options.counter = childOptions.counter;
              options.templateId = childOptions.templateId;
              return;
            }
            options.templateId++;
            const id = uuid;
            const childOptions = Object.assign({}, options, {
              first: true,
              decl: [],
              exprs: []
            });
            options.templateNodes.push([child]);
            parseNode(child, childOptions);
            parts.push(
              `function() { ${
              childOptions.decl.join(",\n") +
              ";\n" +
              childOptions.exprs.join(";\n") +
              `;\nreturn _$el${id};\n`
            }}()`
            );
            options.counter = childOptions.counter;
            options.templateId = childOptions.templateId;
          } else if (child.type === "text") {
            parts.push(`"${child.content}"`);
          } else if (child.type === "comment") {
            if (child.content === "#") parts.push(`exprs[${options.counter++}]`);
            else if (child.content) {
              for (let i = 0; i < child.content.split("###").length - 1; i++) {
                parts.push(`exprs[${options.counter++}]`);
              }
            }
          }
        });
        options.exprs.push(`return [${parts.join(", \n")}]`);
      } else if (node.type === "tag") {
        const tag = `_$el${uuid++}`;
        const topDecl = !options.decl.length;
        const templateId = options.templateId;
        options.decl.push(
          topDecl ? "" : `${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`
        );
        const isSVG = r.SVGElements.has(node.name);
        const isCE = node.name.includes("-");
        options.hasCustomElement = isCE;
        if (node.attrs.some(e => e.name === "###")) {
          const spreadArgs = [];
          let current = "";
          const newAttrs = [];
          for (let i = 0; i < node.attrs.length; i++) {
            const { type, name, value } = node.attrs[i];
            if (type === "attr") {
              if (value.includes("###")) {
                let count = options.counter++;
                current += `${name}: ${
                name !== "ref" ? `typeof exprs[${count}] === "function" ? exprs[${count}]() : ` : ""
              }exprs[${count}],`;
              } else if (name === "###") {
                if (current.length) {
                  spreadArgs.push(`()=>({${current}})`);
                  current = "";
                }
                spreadArgs.push(`exprs[${options.counter++}]`);
              } else {
                newAttrs.push(node.attrs[i]);
              }
            } else if (type === "directive") {
              parseDirective(name, value, tag, options);
            }
          }
          node.attrs = newAttrs;
          if (current.length) {
            spreadArgs.push(`()=>({${current}})`);
          }
          options.exprs.push(
            `r.spread(${tag},${
            spreadArgs.length === 1
              ? `typeof ${spreadArgs[0]} === "function" ? r.mergeProps(${spreadArgs[0]}) : ${spreadArgs[0]}`
              : `r.mergeProps(${spreadArgs.join(",")})`
          },${isSVG},${!!node.children.length})`
          );
        } else {
          for (let i = 0; i < node.attrs.length; i++) {
            const { type, name, value } = node.attrs[i];
            if (type === "directive") {
              parseDirective(name, value, tag, options);
              node.attrs.splice(i, 1);
              i--;
            } else if (type === "attr") {
              if (value.includes("###")) {
                node.attrs.splice(i, 1);
                i--;
                parseAttribute(node, tag, name, value, isSVG, isCE, options);
              }
            }
          }
        }
        options.path = tag;
        options.first = false;
        processChildren(node, options);
        if (topDecl) {
          options.decl[0] = options.hasCustomElement
            ? `const ${tag} = r.untrack(() => document.importNode(tmpls[${templateId}].content.firstChild, true))`
            : `const ${tag} = tmpls[${templateId}].content.firstChild.cloneNode(true)`;
        }
      } else if (node.type === "text") {
        const tag = `_$el${uuid++}`;
        options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
        options.path = tag;
        options.first = false;
      } else if (node.type === "comment") {
        const tag = `_$el${uuid++}`;
        options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
        if (node.content === "#") {
          if (options.multi) {
            options.exprs.push(`r.insert(${options.parent}, exprs[${options.counter++}], ${tag})`);
          } else options.exprs.push(`r.insert(${options.parent}, exprs[${options.counter++}])`);
        }
        options.path = tag;
        options.first = false;
      }
    }
    function parseTemplate(nodes, funcBuilder) {
      const options = {
          path: "",
          decl: [],
          exprs: [],
          delegatedEvents: new Set(),
          counter: 0,
          first: true,
          multi: false,
          templateId: 0,
          templateNodes: []
        },
        id = uuid,
        origNodes = nodes;
      let toplevel;
      if (nodes.length > 1) {
        nodes = [
          {
            type: "fragment",
            children: nodes
          }
        ];
      }
      if (nodes[0].name === "###") {
        toplevel = true;
        processComponent(nodes[0], options);
      } else parseNode(nodes[0], options);
      r.delegateEvents(Array.from(options.delegatedEvents));
      const templateNodes = [origNodes].concat(options.templateNodes);
      return [
        templateNodes.map(t => stringify(t)),
        funcBuilder(
          "tmpls",
          "exprs",
          "r",
          options.decl.join(",\n") +
            ";\n" +
            options.exprs.join(";\n") +
            (toplevel ? "" : `;\nreturn _$el${id};\n`)
        )
      ];
    }
    function html(statics, ...args) {
      const templates =
        cache.get(statics) ||
        createTemplate(statics, {
          funcBuilder: functionBuilder
        });
      return templates[0].create(templates, args, r);
    }
    return html;
  }

  const html = createHTML({
    effect: createRenderEffect,
    style,
    insert,
    untrack,
    spread,
    createComponent,
    delegateEvents,
    classList,
    mergeProps,
    dynamicProperty,
    setAttribute,
    setAttributeNS,
    addEventListener,
    Aliases,
    getPropAlias,
    Properties,
    ChildProperties,
    DelegatedEvents,
    SVGElements,
    SVGNamespace
  });

  const $RAW = Symbol("store-raw"),
    $NODE = Symbol("store-node"),
    $HAS = Symbol("store-has"),
    $SELF = Symbol("store-self");
  function wrap$1(value) {
    let p = value[$PROXY];
    if (!p) {
      Object.defineProperty(value, $PROXY, {
        value: (p = new Proxy(value, proxyTraps$1))
      });
      if (!Array.isArray(value)) {
        const keys = Object.keys(value),
          desc = Object.getOwnPropertyDescriptors(value);
        for (let i = 0, l = keys.length; i < l; i++) {
          const prop = keys[i];
          if (desc[prop].get) {
            Object.defineProperty(value, prop, {
              enumerable: desc[prop].enumerable,
              get: desc[prop].get.bind(p)
            });
          }
        }
      }
    }
    return p;
  }
  function isWrappable(obj) {
    let proto;
    return (
      obj != null &&
      typeof obj === "object" &&
      (obj[$PROXY] ||
        !(proto = Object.getPrototypeOf(obj)) ||
        proto === Object.prototype ||
        Array.isArray(obj))
    );
  }
  function unwrap(item, set = new Set()) {
    let result, unwrapped, v, prop;
    if ((result = item != null && item[$RAW])) return result;
    if (!isWrappable(item) || set.has(item)) return item;
    if (Array.isArray(item)) {
      if (Object.isFrozen(item)) item = item.slice(0);
      else set.add(item);
      for (let i = 0, l = item.length; i < l; i++) {
        v = item[i];
        if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
      }
    } else {
      if (Object.isFrozen(item)) item = Object.assign({}, item);
      else set.add(item);
      const keys = Object.keys(item),
        desc = Object.getOwnPropertyDescriptors(item);
      for (let i = 0, l = keys.length; i < l; i++) {
        prop = keys[i];
        if (desc[prop].get) continue;
        v = item[prop];
        if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
      }
    }
    return item;
  }
  function getNodes(target, symbol) {
    let nodes = target[symbol];
    if (!nodes)
      Object.defineProperty(target, symbol, {
        value: (nodes = Object.create(null))
      });
    return nodes;
  }
  function getNode(nodes, property, value) {
    if (nodes[property]) return nodes[property];
    const [s, set] = createSignal(value, {
      equals: false,
      internal: true
    });
    s.$ = set;
    return (nodes[property] = s);
  }
  function proxyDescriptor$1(target, property) {
    const desc = Reflect.getOwnPropertyDescriptor(target, property);
    if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE)
      return desc;
    delete desc.value;
    delete desc.writable;
    desc.get = () => target[$PROXY][property];
    return desc;
  }
  function trackSelf(target) {
    getListener() && getNode(getNodes(target, $NODE), $SELF)();
  }
  function ownKeys(target) {
    trackSelf(target);
    return Reflect.ownKeys(target);
  }
  const proxyTraps$1 = {
    get(target, property, receiver) {
      if (property === $RAW) return target;
      if (property === $PROXY) return receiver;
      if (property === $TRACK) {
        trackSelf(target);
        return receiver;
      }
      const nodes = getNodes(target, $NODE);
      const tracked = nodes[property];
      let value = tracked ? tracked() : target[property];
      if (property === $NODE || property === $HAS || property === "__proto__") return value;
      if (!tracked) {
        const desc = Object.getOwnPropertyDescriptor(target, property);
        if (
          getListener() &&
          (typeof value !== "function" || target.hasOwnProperty(property)) &&
          !(desc && desc.get)
        )
          value = getNode(nodes, property, value)();
      }
      return isWrappable(value) ? wrap$1(value) : value;
    },
    has(target, property) {
      if (
        property === $RAW ||
        property === $PROXY ||
        property === $TRACK ||
        property === $NODE ||
        property === $HAS ||
        property === "__proto__"
      )
        return true;
      getListener() && getNode(getNodes(target, $HAS), property)();
      return property in target;
    },
    set() {
      return true;
    },
    deleteProperty() {
      return true;
    },
    ownKeys: ownKeys,
    getOwnPropertyDescriptor: proxyDescriptor$1
  };
  function setProperty(state, property, value, deleting = false) {
    if (!deleting && state[property] === value) return;
    const prev = state[property],
      len = state.length;
    if (value === undefined) {
      delete state[property];
      if (state[$HAS] && state[$HAS][property] && prev !== undefined) state[$HAS][property].$();
    } else {
      state[property] = value;
      if (state[$HAS] && state[$HAS][property] && prev === undefined) state[$HAS][property].$();
    }
    let nodes = getNodes(state, $NODE),
      node;
    if ((node = getNode(nodes, property, prev))) node.$(() => value);
    if (Array.isArray(state) && state.length !== len) {
      for (let i = state.length; i < len; i++) (node = nodes[i]) && node.$();
      (node = getNode(nodes, "length", len)) && node.$(state.length);
    }
    (node = nodes[$SELF]) && node.$();
  }
  function mergeStoreNode(state, value) {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      setProperty(state, key, value[key]);
    }
  }
  function updateArray(current, next) {
    if (typeof next === "function") next = next(current);
    next = unwrap(next);
    if (Array.isArray(next)) {
      if (current === next) return;
      let i = 0,
        len = next.length;
      for (; i < len; i++) {
        const value = next[i];
        if (current[i] !== value) setProperty(current, i, value);
      }
      setProperty(current, "length", len);
    } else mergeStoreNode(current, next);
  }
  function updatePath(current, path, traversed = []) {
    let part,
      prev = current;
    if (path.length > 1) {
      part = path.shift();
      const partType = typeof part,
        isArray = Array.isArray(current);
      if (Array.isArray(part)) {
        for (let i = 0; i < part.length; i++) {
          updatePath(current, [part[i]].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "function") {
        for (let i = 0; i < current.length; i++) {
          if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "object") {
        const { from = 0, to = current.length - 1, by = 1 } = part;
        for (let i = from; i <= to; i += by) {
          updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (path.length > 1) {
        updatePath(current[part], path, [part].concat(traversed));
        return;
      }
      prev = current[part];
      traversed = [part].concat(traversed);
    }
    let value = path[0];
    if (typeof value === "function") {
      value = value(prev, traversed);
      if (value === prev) return;
    }
    if (part === undefined && value == undefined) return;
    value = unwrap(value);
    if (part === undefined || (isWrappable(prev) && isWrappable(value) && !Array.isArray(value))) {
      mergeStoreNode(prev, value);
    } else setProperty(current, part, value);
  }
  function createStore(...[store, options]) {
    const unwrappedStore = unwrap(store || {});
    const isArray = Array.isArray(unwrappedStore);
    const wrappedStore = wrap$1(unwrappedStore);
    function setStore(...args) {
      batch(() => {
        isArray && args.length === 1
          ? updateArray(unwrappedStore, args[0])
          : updatePath(unwrappedStore, args);
      });
    }
    return [wrappedStore, setStore];
  }

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
      html: html, render,
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
  };

  self.SolidJS = SolidJS;

  /** @typedef { typeof SolidJS } SolidJS */

})();
