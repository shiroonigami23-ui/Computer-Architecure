// This file is the "engine" of the simulator.
// --- *** MODIFICATION: Refactored Save/Load logic *** ---
// Now supports both auto-save and named saves.

const Simulator = {
    allComponents: [], // Master list of all gates, inputs, outputs
    allWires: [],      // Master list of all wires
    
    // --- Public API ---

    /**
     * Adds a new component (gate, input, output) to the simulation.
     * @param {BaseGate} component - An instance of a class from components.js
     */
    addComponent: function(component) {
        this.allComponents.push(component);
    },

    /**
     * Adds a new wire to the simulation and connects it to the nodes.
     * @param {Wire} wire - An instance of the Wire class
     */
    addWire: function(wire) {
        this.allWires.push(wire);
        // Link the wire to its parent nodes
        wire.startNode.connections.push(wire);
        wire.endNode.connections.push(wire);
    },

    /**
     * Finds a component or node at a specific (x,y) coordinate.
     * @param {number} x - The x coordinate
     * @param {number} y - The y coordinate
     * @returns {object|null} - The found component or node, or null
     */
    getObjectAt: function(x, y) {
        // Check nodes first
        for (const component of this.allComponents) {
            for (const node of component.getAllNodes()) {
                // Calculate absolute node position
                const nodeX = component.x + node.relX;
                const nodeY = component.y + node.relY;
                
                // Simple circular hit detection
                const distance = Math.sqrt(Math.pow(x - nodeX, 2) + Math.pow(y - nodeY, 2));
                if (distance < 6) { // 6px radius for node click
                    return node;
                }
            }
        }
        
        // Check components next
        for (const component of this.allComponents) {
            if (x >= component.x && x <= component.x + component.width &&
                y >= component.y && y <= component.y + component.height) {
                return component;
            }
        }
        
        return null;
    },
    
    /**
     * Toggles an InputToggle component.
     * This NO LONGER runs the simulation, it just changes the state.
     * @param {BaseGate} component - The component to toggle
     */
    toggleInput: function(component) {
        if (component instanceof InputToggle) {
            component.toggle();
            // The simulation will now be started by main.js
        }
    },

    /**
     * Resets the entire simulation to its initial state.
     * --- MODIFIED: No longer saves automatically ---
     */
    resetSimulation: function() {
        console.log("Resetting simulation...");
        this.allComponents = [];
        this.allWires = [];
        
        // Tell the AnimationManager to reset too
        AnimationManager.resetSimulation();
    },

    /**
     * Removes a component and all its connected wires from the simulation.
     * @param {BaseGate} componentToDelete - The component to remove.
     */
    deleteComponent: function(componentToDelete) {
        if (!componentToDelete) return;

        // Find and delete all connected wires first
        const nodes = componentToDelete.getAllNodes();
        
        for (const node of nodes) {
            this.deleteWiresForNode(node);
        }

        // Now remove the component itself
        this.allComponents = this.allComponents.filter(c => c.id !== componentToDelete.id);
    },

    /**
     * Deletes all wires connected to a single node.
     * @param {Node} node - The node whose wires should be deleted.
     */
    deleteWiresForNode: function(node) {
        if (!node || !node.connections) return;

        const wiresToDelete = [...node.connections];
        
        for (const wire of wiresToDelete) {
            this.deleteWire(wire);
        }
    },

    /**
     * Safely removes a single wire from the simulation.
     * @param {Wire} wireToDelete - The wire to remove.
     */
    deleteWire: function(wireToDelete) {
        if (!wireToDelete) return;

        // Remove wire from its node connection lists
        wireToDelete.startNode.connections = wireToDelete.startNode.connections.filter(w => w.id !== wireToDelete.id);
        wireToDelete.endNode.connections = wireToDelete.endNode.connections.filter(w => w.id !== wireToDelete.id);

        // Remove wire from the master list
        this.allWires = this.allWires.filter(w => w.id !== wireToDelete.id);
    },


    // --- *** NEW SIMULATION LOGIC *** ---

    /**
     * Builds the *initial* queue for the simulation engine.
     * @returns {Array} - An *initial* queue of simulation events.
     */
    buildSimulationQueue: function() {
        let queue = [];
        
        // 1. Get initial states from all input sources
        for (const component of this.allComponents) {
            if (component instanceof InputToggle) {
                queue.push({
                    type: 'UPDATE_INPUT',
                    component: component
                });
            }
        }
        
        return queue;
    },

    // --- *** SAVE/LOAD FUNCTIONS *** ---

    /**
     * --- NEW ---
     * Serializes the current circuit state into a JSON-friendly object.
     * Used by both auto-save and named saves.
     * @returns {object|null} - The circuit data object, or null on error.
     */
    getCircuitData: function() {
        try {
            // 1. Serialize Components
            const serializableComponents = this.allComponents.map(c => ({
                // Store essential info needed to recreate the component
                type: c.label, // The class name (e.g., 'AND', 'INPUT')
                x: c.x,
                y: c.y,
                customLabel: c.customLabel,
                inputCount: c.inputNodes.length, // Store current input count
                // --- NEW: Store InputToggle state ---
                state: (c instanceof InputToggle) ? c.state : undefined
            }));

            // 2. Serialize Wires
            const serializableWires = this.allWires.map(w => {
                // Find the index of the component in the *current* allComponents array
                const fromComponentIndex = this.allComponents.indexOf(w.startNode.parentComponent);
                const toComponentIndex = this.allComponents.indexOf(w.endNode.parentComponent);

                // Find the index of the node within its parent's node list
                const fromNodeIndex = w.startNode.parentComponent.outputNodes.indexOf(w.startNode);
                const toNodeIndex = w.endNode.parentComponent.inputNodes.indexOf(w.endNode);

                if (fromComponentIndex === -1 || toComponentIndex === -1 || fromNodeIndex === -1 || toNodeIndex === -1) {
                    // This should not happen if the circuit is valid
                    console.warn("Could not find index for wire connection during save:", w);
                    return null; // Mark this wire as invalid
                }

                return {
                    fromComponentIndex,
                    fromNodeIndex,
                    toComponentIndex,
                    toNodeIndex
                };
            }).filter(w => w !== null); // Remove any invalid wires

            return {
                components: serializableComponents,
                wires: serializableWires
            };
        } catch (error) {
            console.error("Failed to serialize circuit data:", error);
            AnimationManager.logError("Error: Could not prepare circuit data for saving.");
            return null;
        }
    },
    
    /**
     * --- NEW ---
     * Loads a circuit state from a data object, replacing the current circuit.
     * Used only by the named load function in storage_manager.js.
     * @param {object} data - The circuit data object (from getCircuitData).
     * @throws {Error} If the data is invalid.
     */
    loadCircuitData: function(data) {
        if (!data || !data.components || !data.wires) {
            throw new Error("Invalid circuit data format.");
        }

        this.resetSimulation(); // Clear the current board
        const loadedComponents = []; // Keep track of new components in order

        // 1. Re-hydrate Components
        for (const c of data.components) {
            let newComponent;
            // Create component based on its type string
            switch (c.type) {
                case 'INPUT': newComponent = new InputToggle(c.x, c.y); break;
                case 'OUTPUT': newComponent = new OutputLed(c.x, c.y); break;
                case 'AND': newComponent = new AndGate(c.x, c.y); break;
                case 'OR': newComponent = new OrGate(c.x, c.y); break;
                case 'NOT': newComponent = new NotGate(c.x, c.y); break;
                case 'XOR': newComponent = new XorGate(c.x, c.y); break;
                case 'NAND': newComponent = new NandGate(c.x, c.y); break;
                case 'NOR': newComponent = new NorGate(c.x, c.y); break;
                case 'XNOR': newComponent = new XnorGate(c.x, c.y); break;
                default:
                    throw new Error(`Unknown component type in save file: ${c.type}`);
            }

            // Restore properties
            if (newComponent.setCustomLabel) {
                newComponent.setCustomLabel(c.customLabel || "");
            }
            if (newComponent.setInputCount && c.inputCount) {
                // Ensure input count is applied *before* adding wires
                newComponent.setInputCount(c.inputCount);
            }
            // --- NEW: Restore InputToggle state ---
            if (newComponent instanceof InputToggle && c.state !== undefined) {
                 newComponent.state = c.state;
                 newComponent.outputNodes[0].state = c.state; // Ensure node state matches
            }
            
            this.addComponent(newComponent);
            loadedComponents.push(newComponent); // Add to array *in order*
        }

        // 2. Re-hydrate Wires
        for (const w of data.wires) {
            // Find components and nodes based on saved indexes using the *newly created* components
            const fromComp = loadedComponents[w.fromComponentIndex];
            const toComp = loadedComponents[w.toComponentIndex];
            
            if (!fromComp || !toComp) {
                console.warn("Skipping wire during load due to missing component reference.", w);
                continue; // Skip this wire if components weren't found (shouldn't happen)
            }

            const fromNode = fromComp.outputNodes[w.fromNodeIndex];
            const toNode = toComp.inputNodes[w.toNodeIndex];

            if (!fromNode || !toNode) {
                console.warn("Skipping wire during load due to missing node reference.", w);
                continue; // Skip this wire if nodes weren't found (e.g., if input count changed incorrectly)
            }

            const newWire = new Wire(fromNode, toNode);
            this.addWire(newWire);
        }
        
        console.log("Circuit data loaded successfully.");
    },


    /**
     * --- RENAMED & MODIFIED ---
     * Saves the current circuit to the single auto-save slot in localStorage.
     */
    autoSaveCircuit: function() {
        const circuitData = this.getCircuitData();
        if (!circuitData) return; // Don't save if serialization failed
        
        try {
            localStorage.setItem('webLogisimCircuit', JSON.stringify(circuitData));
            // console.log("Circuit auto-saved to localStorage."); // Optional: for debugging
        } catch (error) {
            console.error("Failed to auto-save circuit:", error);
            // Optionally notify user, but avoid spamming
        }
    },

    /**
     * --- RENAMED & MODIFIED ---
     * Loads the circuit from the single auto-save slot in localStorage.
     * @returns {boolean} - True if an auto-saved circuit was loaded, false otherwise.
     */
    loadAutoSaveCircuit: function() {
        const savedData = localStorage.getItem('webLogisimCircuit');
        if (!savedData) {
            console.log("No auto-saved circuit found.");
            return false;
        }

        console.log("Loading auto-saved circuit...");
        
        try {
            const data = JSON.parse(savedData);
            this.loadCircuitData(data); // Use the common loading function
            return true;
        } catch (error) {
            console.error("Failed to load auto-saved circuit:", error);
            AnimationManager.logError("Error: Could not load auto-saved circuit.");
            localStorage.removeItem('webLogisimCircuit'); // Clear potentially corrupted data
            return false;
        }
    }
};
