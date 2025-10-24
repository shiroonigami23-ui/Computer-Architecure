// This file defines the "data models" for our circuit components.
// It's the "brain" of each component, separated from the "drawing" logic (canvas.js)
// and the "simulation" logic (simulator.js).

// A simple counter to ensure every component has a unique ID.
let componentIdCounter = 0;

// --- 1. The Core Building Block: Node ---
// A Node is a connection point (either input or output) on a component.
class Node {
    constructor(parentComponent, type, label) {
        this.id = `node_${componentIdCounter++}`;
        this.parentComponent = parentComponent; // The gate this node belongs to
        this.type = type; // 'input' or 'output'
        this.label = label;
        this.state = 0; // 0 (LOW) or 1 (HIGH)
        this.connections = []; // Wires connected to this node
        
        // Relative position to the parent component's (x,y)
        this.relX = 0;
        this.relY = 0;
    }
}

// --- 2. The Base Class for all Gates ---
// This holds common properties for all logical components.
// --- MODIFIED: Now supports custom labels and dynamic inputs ---
class BaseGate {
    constructor(x, y, label) {
        this.id = `gate_${componentIdCounter++}`;
        this.x = x;
        this.y = y;
        this.label = label; // This is the component *type* (e.g., 'AND', 'OR')
        this.customLabel = ""; // This is the user-defined *name*
        this.width = 120; // Standard gate width
        this.height = 60; // Standard gate height
        this.inputNodes = [];
        this.outputNodes = [];
    }

    /**
     * Gets all nodes (input and output) for this component.
     * @returns {Array<Node>}
     */
    getAllNodes() {
        return [...this.inputNodes, ...this.outputNodes];
    }
    
    // Stub method - this will be overridden by each specific gate
    // This is the core logic of the gate (e.g., A & B = C)
    calculate() {
        // Implemented in child classes
        return 0; // Default return
    }
    
    /**
     * --- NEW ---
     * Sets the user-defined label for this component.
     * @param {string} newLabel - The new custom label.
     */
    setCustomLabel(newLabel) {
        this.customLabel = newLabel.trim();
    }

    /**
     * --- NEW ---
     * Placeholder for changing the number of inputs.
     * @param {number} count - The new number of inputs.
     */
    setInputCount(count) {
        // Implemented in child classes that support it
    }

    /**
     * --- NEW ---
     * Helper function to dynamically rebuild input nodes.
     * This resizes the gate and recalculates all node positions.
     * @param {number} count - The new number of inputs.
     */
    rebuildInputNodes(count) {
        count = parseInt(count, 10);
        if (isNaN(count) || count < 2) count = 2; // Min 2 inputs for most gates
        if (count > 8) count = 8; // Max 8 inputs

        this.inputNodes = []; // Clear old nodes
        
        // --- Recalculate component height ---
        const nodeSpacing = 20;
        this.height = Math.max(60, count * nodeSpacing + (nodeSpacing / 2));
        
        // Re-add nodes with new positions
        for (let i = 0; i < count; i++) {
            // Evenly space nodes along the left edge
            const relY = (this.height * (i + 1)) / (count + 1);
            
            let node = new Node(this, 'input', String.fromCharCode(65 + i)); // A, B, C...
            node.relX = 0;
            node.relY = relY;
            this.inputNodes.push(node);
        }
        
        // Reposition the output node to the new middle
        if (this.outputNodes.length > 0) {
            this.outputNodes[0].relY = this.height / 2;
        }
    }

    /**
     * --- NEW ---
     * Returns a list of editable properties for the properties panel.
     */
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' }
        ];
    }
    
    /**
     * --- NEW: Helper for easy wiring ---
     * Gets the first (default) output node.
     * @returns {Node|null}
     */
    getDefaultOutputNode() {
        return this.outputNodes.length > 0 ? this.outputNodes[0] : null;
    }

    /**
     * --- NEW: Helper for easy wiring ---
     * Finds the first input node that doesn't have a wire connected.
     * @returns {Node|null}
     */
    getAvailableInputNode() {
        for (const node of this.inputNodes) {
            if (node.connections.length === 0) {
                return node; // Found an empty input
            }
        }
        return null; // All inputs are full
    }
}

// --- 3. Input/Output Components ---

class InputToggle extends BaseGate {
    constructor(x, y) {
        super(x, y, 'INPUT');
        this.height = 40; // Smaller
        this.width = 40;
        
        // An input toggle has one output node
        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        out.relY = this.height / 2;
        this.outputNodes.push(out);
        
        // Default state is OFF (0)
        this.state = 0;
        this.outputNodes[0].state = this.state;
    }

    // This is the user-interaction method
    toggle() {
        this.state = this.state === 0 ? 1 : 0;
        this.outputNodes[0].state = this.state;
    }

    // InputToggles don't calculate, they are a source
    // This is called by the 'UPDATE_INPUT' event
    calculate() {
        // State is set by user via toggle()
        this.outputNodes[0].state = this.state;
        return this.state; // Return it just for consistency
    }
    
    // --- OVERRIDE: InputToggle only has a Label property ---
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' }
        ];
    }
    
    /**
     * --- OVERRIDE: Input has no inputs to find ---
     * @returns {null}
     */
    getAvailableInputNode() {
        return null; 
    }
}

class OutputLed extends BaseGate {
    constructor(x, y) {
        super(x, y, 'OUTPUT');
        this.height = 40; // Smaller
        this.width = 40;

        // An output LED has one input node
        let inp = new Node(this, 'input', 'in');
        inp.relX = 0;
        inp.relY = this.height / 2;
        this.inputNodes.push(inp);

        this.state = 0; // The "lit" state
    }

    // The LED's state is determined by its input
    // This is a "sink", so it just updates its own internal state
    calculate() {
        this.state = this.inputNodes[0].state;
        return this.state; // Return it just for consistency
    }
    
    // --- OVERRIDE: OutputLed only has a Label property ---
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' }
        ];
    }
    
    /**
     * --- OVERRIDE: Output has no outputs to find ---
     * @returns {null}
     */
    getDefaultOutputNode() {
        return null;
    }
}


// --- 4. Logic Gate Components ---
// --- *** ALL GATES NOW SUPPORT DYNAMIC INPUTS AND NEW CALCULATE() LOGIC *** ---

class AndGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'AND');
        
        // One output node
        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        this.outputNodes.push(out);
        
        // --- MODIFIED: Use helper to build inputs ---
        this.setInputCount(2); // Default to 2 inputs
    }
    
    setInputCount(count) {
        this.rebuildInputNodes(count);
    }
    
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' },
            { name: 'Inputs', type: 'select', value: this.inputNodes.length, options: [2, 3, 4, 5, 6, 7, 8], prop: 'inputCount' }
        ];
    }

    calculate() {
        // --- MODIFIED: Loop all inputs ---
        // 'every' returns true if all inputs are 1
        return this.inputNodes.every(node => node.state === 1) ? 1 : 0;
    }
}

class OrGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'OR');

        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        this.outputNodes.push(out);
        
        this.setInputCount(2);
    }
    
    setInputCount(count) {
        this.rebuildInputNodes(count);
    }
    
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' },
            { name: 'Inputs', type: 'select', value: this.inputNodes.length, options: [2, 3, 4, 5, 6, 7, 8], prop: 'inputCount' }
        ];
    }

    calculate() {
        // --- MODIFIED: Loop all inputs ---
        // 'some' returns true if *any* input is 1
        return this.inputNodes.some(node => node.state === 1) ? 1 : 0;
    }
}

class NotGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'NOT');
        this.width = 80; // Smaller

        let inp = new Node(this, 'input', 'in');
        inp.relX = 0;
        inp.relY = this.height / 2;
        this.inputNodes.push(inp);
        
        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        out.relY = this.height / 2;
        this.outputNodes.push(out);
    }
    
    // --- OVERRIDE: NOT gate only has a Label property ---
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' }
        ];
    }

    calculate() {
        const in_state = this.inputNodes[0].state;
        return (in_state === 1) ? 0 : 1;
    }
}

class XorGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'XOR');

        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        this.outputNodes.push(out);
        
        this.setInputCount(2);
    }
    
    setInputCount(count) {
        this.rebuildInputNodes(count);
    }
    
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' },
            { name: 'Inputs', type: 'select', value: this.inputNodes.length, options: [2, 3, 4, 5, 6, 7, 8], prop: 'inputCount' }
        ];
    }

    calculate() {
        // --- MODIFIED: Multi-input XOR ---
        // Output is 1 if an ODD number of inputs are 1
        const highInputs = this.inputNodes.filter(node => node.state === 1).length;
        return (highInputs % 2 === 1) ? 1 : 0;
    }
}

class NandGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'NAND');

        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        this.outputNodes.push(out);
        
        this.setInputCount(2);
    }
    
    setInputCount(count) {
        this.rebuildInputNodes(count);
    }
    
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' },
            { name: 'Inputs', type: 'select', value: this.inputNodes.length, options: [2, 3, 4, 5, 6, 7, 8], prop: 'inputCount' }
        ];
    }

    calculate() {
        // --- MODIFIED: Loop all inputs ---
        const andResult = this.inputNodes.every(node => node.state === 1);
        return andResult ? 0 : 1; // Invert the AND
    }
}

class NorGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'NOR');

        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        this.outputNodes.push(out);
        
        this.setInputCount(2);
    }
    
    setInputCount(count) {
        this.rebuildInputNodes(count);
    }
    
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' },
            { name: 'Inputs', type: 'select', value: this.inputNodes.length, options: [2, 3, 4, 5, 6, 7, 8], prop: 'inputCount' }
        ];
    }

    calculate() {
        // --- MODIFIED: Loop all inputs ---
        const orResult = this.inputNodes.some(node => node.state === 1);
        return orResult ? 0 : 1; // Invert the OR
    }
}

class XnorGate extends BaseGate {
    constructor(x, y) {
        super(x, y, 'XNOR');

        let out = new Node(this, 'output', 'out');
        out.relX = this.width;
        this.outputNodes.push(out);
        
        this.setInputCount(2);
    }
    
    setInputCount(count) {
        this.rebuildInputNodes(count);
    }
    
    getProperties() {
        return [
            { name: 'Label', type: 'text', value: this.customLabel, prop: 'customLabel' },
            { name: 'Inputs', type: 'select', value: this.inputNodes.length, options: [2, 3, 4, 5, 6, 7, 8], prop: 'inputCount' }
        ];
    }

    calculate() {
        // --- MODIFIED: Multi-input XNOR ---
        // Output is 1 if an EVEN number of inputs are 1
        const highInputs = this.inputNodes.filter(node => node.state === 1).length;
        return (highInputs % 2 === 0) ? 1 : 0;
    }
}


// --- 5. The Wire Component ---
// This connects two Nodes together.
class Wire {
    constructor(startNode, endNode) {
        this.id = `wire_${componentIdCounter++}`;
        this.startNode = startNode; // Should be an 'output' node
        this.endNode = endNode;     // Should be an 'input' node
        this.state = 0;
    }

    // The wire's job is to propagate the state.
    // This is now called by the 'PROPAGATE' event in AnimationManager
    update() {
        this.state = this.startNode.state;
        this.endNode.state = this.state;
    }
}