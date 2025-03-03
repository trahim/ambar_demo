// Spec
//    = { tag : string
//      , attributes : { attribute: string }
//      , listeners : { event: listener } -- support a single listener
//      , children : [Spec]
//      }
//    | { textContent : string }
//    | { empty : true }      -- an element that doesn't render anything
//
// ElementDiff
//    = Replace Element
//    | Remove
//    | Create Element
//    | Modify ContentsDiff
//    | Noop
//
// ContentsDiff
//    = { removeAttr :: [String]
//      , setAttr :: { attribute: value }
//      , removeListeners :: { event: f }
//      , addListeners :: { event: f }
//      , children : [ElementDiff]
//      }
//
const UI = (function () {

function eventName(str) {
  if (str.indexOf("on") == 0) {
    return str.slice(2).toLowerCase();
  }
  return null;
}

// diff two specs
function diffOne(l, r) {
  let isText = l.textContent !== undefined;
  if (isText) {
    return l.textContent !== r.textContent
      ? { replace: r }
      : { noop: true };
  }

  if (l.tag !== r.tag) {
    return { replace: r };
  }

  const removeAttr = [];
  const setAttr = {};
  const removeListeners = {};
  const addListeners = {};
  for (const attr in l.attributes) {
    if (r.attributes[attr] === undefined) {
      let event = eventName(attr);
      if (event !== null) {
        removeListeners[event] = l.attributes[attr];
      } else {
        removeAttr.push(attr);
      }
    }
  }

  for (const attr in r.attributes) {
    if (r.attributes[attr] !== l.attributes[attr]) {
      let event = eventName(attr);
      if (event === null) {
        setAttr[attr] = r.attributes[attr];
      } else {
        removeListeners[event] = l.attributes[attr];
        addListeners[event] = r.attributes[attr];
      }
    }
  }

  const children = diffList(l.children, r.children);
  const noChildrenChange = children.every(e => e.noop);
  const noAttributeChange =
        (removeAttr.length === 0) &&
        (Array.from(Object.keys(setAttr)).length == 0)

  if (noChildrenChange && noAttributeChange) {
    return { noop : true }
  }

  return { modify: { removeAttr, setAttr, removeListeners, addListeners, children } };
}

function removeEmpty(els) {
  return Array.from(els).filter(e => !e.empty);
}

function diffList(ls_raw, rs_raw) {
  let ls = removeEmpty(ls_raw);
  let rs = removeEmpty(rs_raw);
  let len = Math.max(ls.length, rs.length);
  let diffs = [];
  for (let i = 0; i < len; i++) {
    diffs.push(
      ls[i] === undefined
      ? { create: rs[i] }
      : rs[i] == undefined
      ? { remove: true }
      : diffOne(ls[i], rs[i])
    );
  }
  return diffs;
}

function create(enqueue, spec) {
  if (spec.textContent !== undefined) {
    let el = document.createTextNode(spec.textContent);
    return el;
  }

  let el = document.createElement(spec.tag);

  for (const attr in spec.attributes) {
    let event = eventName(attr);
    let value = spec.attributes[attr];
    event
      ? el.addEventListener(event, () => enqueue(value))
      : el.setAttribute(attr, value);
  }

  let children = removeEmpty(spec.children);
  for (let i in children) {
    const childSpec = spec.children[i];
    const child = create(enqueue, childSpec);
    el.appendChild(child);
  }

  return el;
}

function modify(el, enqueue, diff) {
  for (const attr in diff.removeAttr) {
    el.removeAttribute(attr);
  }
  for (const attr in diff.setAttr) {
    el.setAttribute(attr, diff.setAttr[attr]);
  }
  for (const event in diff.removeListeners) {
    el.removeEventListener(event, diff.removeListeners[event]);
  }
  for (const event in diff.addListeners) {
    let msg = diff.addListeners[event];
    el.addEventListener(event, () => enqueue(msg));
  }
  if (diff.children.length < el.childNodes.length) {
    throw new Error("unmatched children lengths");
  }

  apply(el, enqueue, diff.children);
}

function apply(el, enqueue, childrenDiff) {
  for (let i = 0, k = 0; i < childrenDiff.length; i++, k++) {
    let diff = childrenDiff[i];
    if (diff.remove) {
      el.childNodes[k].remove();
      k--;
    } else if (diff.modify !== undefined) {
      modify(el.childNodes[k], enqueue, diff.modify);
    } else if (diff.create !== undefined) {
      if (k < el.childNodes.length) {
        throw new Error("Adding in the middle of children: " + k + " " + el.childNodes.length);
      }
      let child = create(enqueue, diff.create);
      el.appendChild(child);
    } else if (diff.replace !== undefined) {
      let child = create(enqueue, diff.replace);
      el.childNodes[k].replaceWith(child);
    } else if (diff.noop) {
    } else {
      throw new Error("Unexpected diff option: " + Object.keys(diff));
    }
  }
}

// Create an HTML element
function h(tag, attributes, children) {
  return { tag, attributes, children };
}

// Create a text element
function text(textContent) {
  return { textContent }
}

// Create an elements that will be disregarded.
function empty() {
  return { empty : true }
}

// Start managing the contents of an HTML node.
function init(root, initialState, update, view) {
  let state = initialState; // client application state
  let spec = []; // elements spec
  let queue = []; // msg queue

  function enqueue(msg) {
    queue.push(msg);
  }

  // draws the current state
  function draw() {
    let newSpec = view(state);
    apply(root, enqueue, diffList(spec, newSpec));
    spec = newSpec;
  }

  function updateState() {
    if (queue.length > 0) {
      let msgs = queue;
      queue = [];

      msgs.forEach(msg => {
        state = update(state, msg, enqueue);
      });

      draw();
    }

    window.requestAnimationFrame(updateState);
  }

  draw();
  updateState();

  return { enqueue };
}

return { init, h, empty, text };
})();
