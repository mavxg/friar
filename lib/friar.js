'use strict';

var PROPERTY = 0x4;



var isDOMAttribute = {
	id: PROPERTY,
	className: function(action, node, value) {
		if (node.namespaceURI === document.body.namespaceURI)	
			if (action==='delete') 
				node.className = "";
			else
				node.className = value;
		else {
			if (action==='delete')
				node.removeAttributeNS(null,'class');
			else
				node.setAttributeNS(null,'class',value);
		}

	},
	value: PROPERTY,
	href: PROPERTY,
	spellcheck: PROPERTY,
	title: true,
	type: true,
	name: PROPERTY,
	placeholder: PROPERTY,
	src: true,
	alt: true,
	'xlink:href': function(action, node, value) {
		if (action==='delete')
			node.removeAttributeNS("http://www.w3.org/1999/xlink",'href');
		else
			node.setAttributeNS("http://www.w3.org/1999/xlink",'href',value);
	},
	colSpan: function(action, node, value) { 
		if (action==='delete') node.colSpan = 1; node.colSpan = value; 
	},
	rowSpan: function(action, node, value) { 
		if (action==='delete') node.rowSpan = 1; node.rowSpan = value; 
	},
};

function isListener(key) {
	return /^on[A-Z][a-zA-Z]+$/.test(key);
}

function keyToEvent(key) {
	return key.slice(2).toLowerCase();
}

function shouldUpdateComponent(prev, next) {
	if (prev && next && prev.type === next.type) return true;
	return false;
}

function Base() {}

Base.prototype.construct = function(props, children) {
	if (this.type === DOM.text.type) {
		this.props = { text: props };
		this.node = null;
		return;
	}

	this.props = props || {};
	this.node = null;

	if (this.props.children) {
		//Don't overwrite children if we are given them in props
	} else if (arguments.length === 2) {
		if (typeof children == 'string' || typeof children === 'number') {
			this.props.children = [DOM.text(
				typeof children === 'number' ? '' + children : children)];
		} else {
			this.props.children = children; //passed an array of nodes (assumes we already mapped to text).
		}
	} else {
		var childArr = [];
		var prevChild, child;
		for (var i = 1; i < arguments.length; i++) {
			child = arguments[i];
			if (typeof child == 'string' || typeof child === 'number') {
				child = DOM.text(typeof child === 'number' ? '' + child : child);
			}
			if (prevChild &&
			    child.type === DOM.text.type &&
			    prevChild.type === DOM.text.type) {
				prevChild.props.text += child.props.text; //join text nodes together
			} else {
				childArr.push(child);
				prevChild = child;
			}
		}
		this.props.children = childArr;
	}
};

Base.prototype.unmount = function() {
	//remove listeners
	if (this._listeners && this.node) {
		for (var lk in this._listeners) {
			if (this._listeners.hasOwnProperty(lk)) {
				this.node.removeEventListener(lk, this._listeners[lk]);
			}
		}
	}
	//unmount children
	delete this.node;
};

Base.prototype.performUpdateIfNecessary = function() {
	if (this._pendingProps === null) {
		return;
	}
	var prevProps = this.props;
	this.props = this._pendingProps;
	this._pendingProps = null;
	this.updateComponent(prevProps);
};

Base.prototype.receiveComponent = function(nextComponent) {
	 this._pendingProps = nextComponent.props;
	 this.performUpdateIfNecessary();
	 //copy over our properties (TODO: probably better to use the ref stuff used by React)
	 nextComponent.node = this.node;
	 if (this._rendered) nextComponent._rendered = this._rendered;
};

function WrapBase(element) {
	this.node = element; this.props = { node: element };
}

WrapBase.prototype = new Base();

WrapBase.prototype.mount = function() {
	return this.node;
};

WrapBase.prototype.updateComponent = function(prevProps) {
	if (this.props.node === prevProps.node) return;
	prevProps.node.parentNode.replaceChild(this.props.node, prevProps.node);
	this.node = this.props.node;
};

function Wrap(element) {
	return new WrapBase(element);
}

WrapBase.prototype.type = WrapBase;
Wrap.type = WrapBase;


function DOMClass(tag, ns) {
	this.tag = tag;
	if (ns !== undefined)
		this.ns = ns;
}

DOMClass.prototype = new Base();

DOMClass.prototype.mount = function() {
	if (this.node !== null) {
		return this.node;
	}
	if (this.type === DOM.text.type) {
		this.node = document.createTextNode(this.props.text);
	} else {
		if (this.ns)
			this.node = document.createElementNS(this.ns, this.tag);
		else
			this.node = document.createElement(this.tag);
		for (var prop in this.props) {
			if (isDOMAttribute[prop]) {
				if (isDOMAttribute[prop] === PROPERTY) {
					this.node[prop] = this.props[prop];
				} else if (typeof isDOMAttribute[prop] === 'function') {
					isDOMAttribute[prop]('set', this.node, this.props[prop]);
				} else {
					if (this.ns)
						this.node.setAttributeNS(null, prop, this.props[prop]);
					else
						this.node.setAttribute(prop, this.props[prop]);
				}
			} else if (prop === STYLE) {
				setValueForStyles(this.node, this.props[prop]);
			} else if (isListener(prop)) {
				this.addListener(prop, this.props[prop]);
			}
		}
		var node = this.node;
		this.props.children.forEach(function(child, index) { 
			child._mountIndex = index;
			node.appendChild(child.mount());
		});
	}
	return this.node;
};

DOMClass.prototype.addListener = function(key, func) {
	this._listeners = this._listeners || {};
	var name = keyToEvent(key);
	if (this._listeners.hasOwnProperty[name]) {
		this.node.removeEventListener(name, this._listeners[name]);
	}
	this._listeners[name] = function(e) { return func(e); };
	this.node.addEventListener(name, this._listeners[name]);
};

DOMClass.prototype.removeListener = function(key) {
	this._listeners = this._listeners || {};
	var name = keyToEvent(key);
	if (this._listeners.hasOwnProperty[name]) {
		this.node.removeEventListener(name, this._listeners[name]);
	}
};

function insertAt(parentNode, childNode, index) {
	var beforeNode = index >= parentNode.childNodes.length ? null : parentNode.childNodes[index];
	parentNode.insertBefore(childNode, beforeNode);
}

function doRemove(parentNode, childNode) {
	parentNode.removeChild(childNode);
}

function doMountAtIndex(me, child, index) {
	me.mountChildAtIndex(child, index);
}

//Different to React.js -- no nested children (arrays of arrays)
// will not be assuming that an objects keys are itterated over in order (not to js spec)
DOMClass.prototype.updateChildren = function(nextChildren, prevChildren) {
	var me = this;
	var name;
	if (!nextChildren && !prevChildren) {
		return;
	}
	prevChildren = prevChildren || [];
	nextChildren = nextChildren || [];
	var prevChildrenByName = {};
	var pi = 0, ni = 0;
	prevChildren.forEach(function(c,i) { 
		var name = c.props.key ? '$' + c.props.key : (c.props.id ? '$' + c.props.id : '.' + (pi++));
		prevChildrenByName[name] = c;
	});
	var nextChildrenByName = {};
	var lastIndex = 0;
	//we need to do all the removes before all the inserts so we queue
	//up the inserts and removes
	var queue = [];
	//TODO: this algorithm doesn't work with a mix of keyed and unkeyed.
	for (var nextIndex = 0; nextIndex < nextChildren.length; nextIndex ++) {
		var child = nextChildren[nextIndex];
	//nextChildren.forEach(function(child, nextIndex) {
		name = child.props.key ? '$' + child.props.key : (child.props.id ? '$' + child.props.id : '.' + (ni++));
		nextChildrenByName[name] = child;
		var prevChild = prevChildrenByName[name];
		if (shouldUpdateComponent(prevChild, child)) {
			//update
			//TODO: change this so that we update the
			//prevChild and not child
			prevChild.receiveComponent(child);
			if (prevChild._mountIndex < lastIndex) {//move child
				queue.unshift({f:doRemove, args:[this.node, prevChild.node]});
				queue.push({f:insertAt, args:[this.node, prevChild.node, nextIndex]});
			}
			lastIndex = Math.max(prevChild._mountIndex, lastIndex);
			prevChild._mountIndex = nextIndex;
			child._mountIndex = nextIndex;
			nextChildren[nextIndex] = prevChild;
		} else {
			if (prevChild) {
				//replace
				lastIndex = Math.max(prevChild._mountIndex, lastIndex);
				me.unmountChild(prevChild);
				prevChild._mountIndex = null;
			}
			queue.push({f:doMountAtIndex, args:[me, child, nextIndex]});
		}
	}//);
	//delete
	for (name in prevChildrenByName) {
		if (prevChildrenByName.hasOwnProperty(name) &&
			!nextChildrenByName[name]) {
			me.unmountChild(prevChildrenByName[name]);
		}
	}
	//apply the queue
	for (var i = 0; i < queue.length; i++) {
		var op = queue[i];
		op.f.apply(null, op.args);
	};
};

DOMClass.prototype.moveChild = function(child, toIndex, lastIndex) {
	if (child._mountIndex < lastIndex) {
		this.mountChildAtIndex(child, toIndex);
	}
};

DOMClass.prototype.mountChildAtIndex = function(child, index) {
	child._mountIndex = index;
	var childNode = child.mount();
	var parentNode = this.node;
	var childNodes = parentNode.childNodes;
	if (childNodes[index] === childNode) {
		return;
	}
	if (childNode.parentNode === parentNode) {
		parentNode.removeChild(childNode);
	}
	if (index >= childNodes.length) {
		parentNode.appendChild(childNode);
	} else {
		parentNode.insertBefore(childNode, childNodes[index]);
	}
};

DOMClass.prototype.unmountChild = function(child) {
	this.node.removeChild(child.node);
	child.unmount();
};

DOMClass.prototype.replaceChild = function(newChild, oldChild) {
	this.node.replaceChild(newChild.mount(), oldChild.node);
	oldChild.unmount();
};

DOMClass.prototype.updateComponent = function(prevProps) {
	if (this.type === DOM.text.type) {
		if (this.props.text != prevProps.text) {
			this.node.textContent = this.props.text;
		}
		return;
	}
	this._updateDOMProperties(prevProps);
	this.updateChildren(this.props.children, prevProps.children);
};

var STYLE = 'style';

//Inspired by React.js
DOMClass.prototype._updateDOMProperties = function(prevProps) {
	var nextProps = this.props;
	var styleUpdates;
	var key;
	var styleName;
	for (key in prevProps) {
		if (nextProps.hasOwnProperty(key) ||
			!prevProps.hasOwnProperty(key)) {
				continue;
		}
		if (key === STYLE) {
			var prevStyle = prevProps[STYLE];
			for (styleName in prevStyle) {
				if (prevStyle.hasOwnProperty(styleName)) {
					styleUpdates = styleUpdates || {};
					styleUpdates[styleName] = '';
				}
			}
		} else if (isDOMAttribute[key]) {
			if (isDOMAttribute[key] === PROPERTY) {
				delete this.node[key];
			} else if (typeof isDOMAttribute[key] === 'function') {
				isDOMAttribute[key]('delete', this.node);
			} else {
				this.node.removeAttribute(key);
			}
		} else if (isListener(key)) {
			this.removeListener(key);
		}
	}
	for (key in nextProps) {
    	var nextProp = nextProps[key];
    	var prevProp = prevProps[key];
		if (!nextProps.hasOwnProperty(key) || nextProp === prevProp) {
			continue;
		}
		if (key === STYLE) {
			if (prevProp) {
				for (styleName in prevProp) {
					if (prevProp.hasOwnProperty(styleName) &&
						!nextProp.hasOwnProperty(styleName)) {
						styleUpdates = styleUpdates || {};
						styleUpdates[styleName] = '';
					}
				}
				for (styleName in nextProp) {
					if (nextProp.hasOwnProperty(styleName) &&
						prevProp[styleName] !== nextProp[styleName]) {
						styleUpdates = styleUpdates || {};
						styleUpdates[styleName] = nextProp[styleName];
					}
				}
			} else {
				styleUpdates = nextProp;
			}
		} else if (isDOMAttribute[key] === PROPERTY) {
			if (nextProp === null) {
				delete this.node[key];
			} else {
				this.node[key] = '' + nextProp;
			}
		} else if (typeof isDOMAttribute[key] === 'function') {
			if (nextProp === null) {
				isDOMAttribute[key]('delete', this.node);
			} else {
				isDOMAttribute[key]('set', this.node, nextProp);
			}
		} else if (isDOMAttribute[key]) {
			if (nextProp === null) {
				this.node.removeAttribute(key);
			} else {
				this.node.setAttribute(key, '' + nextProp);
			}
		} else if (isListener(key)) {
			this.addListener(key, nextProp); //addListener will remove old prop
		}
		if (styleUpdates) {
			setValueForStyles(this.node, styleUpdates);
		}
	}
};

function setValueForStyles(node, styles) {
  for (var styleName in styles) {
    if (!styles.hasOwnProperty(styleName)) {
      continue;
    }
    node.style[styleName] = styles[styleName];
	}
}

//Inspired by React.js
function createDOMClass(tag, ns) {
	var Constructor = function() {};
	Constructor.prototype = new DOMClass(tag, ns);
	Constructor.displayName = tag;

	var ConvConstructor = function(props, children) {
		var instance = new Constructor();
		instance.construct.apply(instance, arguments);
		return instance;
	};

	ConvConstructor.type = Constructor;
	Constructor.prototype.type = Constructor;

	return ConvConstructor;
}

var svgNS = "http://www.w3.org/2000/svg";

var DOM = {};
[
	['a'],
	['blockquote'],
	['br'],
	['button'],
	['code'],
	['del'],
	['div'],
	['em'],
	['figure'],
	['figcaption'],
	['form'],
	['h1'],
	['h2'],
	['h3'],
	['h4'],
	['h5'],
	['h6'],
	['hr'],
	['img'],
	['input'],
	['li'],
	['ol'],
	['p'],
	['pre'],
	['section'],
	['span'],
	['strong'],
	['sub'],
	['sup'],
	['svg',svgNS],
	['table'],
	['tbody'],
	['td'],
	['tfoot'],
	['th'],
	['thead'],
	['tr'],
	['ul'],
	['use',svgNS],
	['text'],
	['textarea'],
].forEach(function(k,i) { DOM[k[0]] = createDOMClass(k[0],k[1]); });


var ComponentInterface = {
	render: true,
	didUpdate: true,
	willUpdate: true,
	didMount: true,
	willUnmount: true,
	getInitialState: true,
};

function ComponentBase() {}

ComponentBase.prototype = new Base();

ComponentBase.prototype.mount = function() {
	if (this.node) return this.node;

	//process props to include defaults
	this.state = this.getInitialState? this.getInitialState() : {};

	this._pendingState = null;
	this._pendingProps = null;
	this._pendingUpdate = false;
	//pendingForceUpdate = false

	//auto map (bind function to this)
	if (this.type._autoMap) {
		var autoMap = this.type._autoMap;
		for (var name in autoMap) {
			if (autoMap.hasOwnProperty(name)) {
				this[name] = autoMap[name].bind(this);
			}
		}
	}

	this._rendered = this.render();
	this.node = this._rendered.mount();
	if (this.didMount) this.didMount(); 
	return this.node;
};

function _equal(a, b) {
	for (var k in a) {
		if (typeof a[k] !== typeof b[k]) return false;
		if (a[k] === undefined && b[k] === undefined) continue;
		if (k === 'children') {
			if (a[k].length !== b[k].length) return false;
			for (var i = a[k].length - 1; i >= 0; i--) {
				if (a[k][i] !== b[k][i]) return false;
			};
		} else if (a[k] !== b[k]) {
			return false;
		}
	}
	for (var k in b) {
		if (a[k] === undefined && b[k] !== undefined) return false;
	}
	return true;
}

//TODO: why was this debounced in the old code?

ComponentBase.prototype.performUpdateIfNecessary = function() {
	if (this._pendingProps === null && 
		(this._pendingState === null || this._pendingState === undefined) && 
		!this._pendingUpdate) return;

	if ((this._pendingState === null || this._pendingState === undefined)	&& 
		!this._pendingUpdate &&
		(this._pendingProps === this.props ||
		 _equal(this._pendingProps, this.props))) {
		this._pendingProps = null;
		return;
	}

	
	var nextState = this._pendingState || this.state;
	var nextProps = this._pendingProps || this.props;
	var prevProps = this.props;
	var prevState = this.state;
	
	this._pendingState = null;
	this._pendingProps = null;
	this._pendingUpdate = false;

	if (this.shouldComponentUpdate &&
		!(this.shouldComponentUpdate(nextProps, nextState)))
		return;

  if (this.willUpdate) {
    this.willUpdate(nextProps, nextState);
  }

  this.props = nextProps;
  this.state = nextState;

  this.updateComponent(prevProps, prevState);

  if (this.didUpdate) {
		this.didUpdate(prevProps, prevState);
  }
};

ComponentBase.prototype.updateComponent = function(prevProps) {
	var prevRendered = this._rendered;
	var nextRendered = this.render();
	if (shouldUpdateComponent(prevRendered, nextRendered)) {
		prevRendered.receiveComponent(nextRendered);
	} else {
		//TODO: should we be calling didMount?
		this._rendered = nextRendered;
		var node = this._rendered.mount();
		this.node.parentNode.replaceChild(node, prevRendered.node);
		prevRendered.unmount();
	}
};

ComponentBase.prototype.forceUpdate = function() {
	this._pendingUpdate = true;
	this.performUpdateIfNecessary();
};

ComponentBase.prototype.setState = function(obj) {
	this._pendingState = merge(this._pendingState || this.state, obj);
	this.performUpdateIfNecessary();
};

function merge(base, upd) {
	var result = {};
	var k;
	for (k in base) result[k] = base[k];
	for (k in upd) result[k] = upd[k];
	return result;
}

/*
TextNode.prototype.receiveComponent = function(nextComponent) {
    var nextProps = nextComponent.props;
    if (nextProps.text !== this.props.text) {
      this.props.text = nextProps.text;
		  this.node.textContent = this.props.text;
    }
};
*/

function createClass(spec) {
	var Constructor = function() {};
	Constructor.prototype = new ComponentBase();

	var ConvConstructor = function(props, children) {
		var instance = new Constructor();
		instance.construct.apply(instance, arguments);
		return instance;
	};

	//mixin
	for (var name in spec) {
		if (!spec.hasOwnProperty(name)) continue;
		Constructor.prototype[name] = spec[name];
		var property = spec[name];
		var isFunction = typeof property === 'function';
		var isInterface = name in ComponentInterface;
		if (isFunction && !isInterface) {
			Constructor._autoMap = Constructor._autoMap || {};
			Constructor._autoMap[name] = property;
		}
	}

	ConvConstructor.type = Constructor;
	Constructor.prototype.type = Constructor;

	return ConvConstructor;
}

function renderComponent(component, element) {
	element.appendChild(component.mount());
}

module.exports = {
	DOM: DOM,
	Wrap: Wrap,
	renderComponent: renderComponent,
	createClass: createClass,
};
