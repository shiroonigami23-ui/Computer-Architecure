// --- Animation & Simulation Log Manager ---
// This file controls the step-by-step execution, delay,
// animations, and log panel.
// --- MODIFIED: Now an event-driven simulation engine ---
// --- MODIFIED: Runs instantly (delay 0) and is always "on" ---

const AnimationManager = {
    // --- Configuration ---
    SIMULATION_DELAY: 0, // --- MODIFIED: 0ms delay for instant updates ---
    MAX_SIMULATION_STEPS: 1000, // Safety break for infinite loops

    // --- State ---
    simulationQueue: [], // A list of events to process
    activeAnimations: [], // A list of visual animations (e.g., wire pulses)
    logElement: null, // The HTML element for the log content
    simulationStepCounter: 0, // Counter for the safety break
    simulationTimeoutId: null, // --- NEW: To cancel pending simulations
    
    /**
     * Initializes the manager and finds the log element.
     */
    init: function() {
        this.logElement = document.getElementById('log-content');
        this.clearLog();
    },

    // --- Log Panel Methods ---

    /**
     * Adds a message to the simulation log.
     * @param {string} message - The text to log.
     * @param {string} type - The class to apply ('log-step', 'log-calc', 'log-error')
     */
    log: function(message, type = 'log-calc') {
        if (!this.logElement) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        // Basic Markdown-like formatting for emphasis or code
        message = message.replace(/`([^`]+)`/g, '<code>$1</code>');
        entry.innerHTML = message; // Use innerHTML for code tags
        
        // --- MODIFIED: Add new logs to the top ---
        this.logElement.prepend(entry);
        
        // --- MODIFIED: Remove auto-scroll to bottom ---
    },

    logStep: function(message) {
        this.log(message, 'log-step');
    },

    logError: function(message) {
        this.log(`⚠️ ${message}`, 'log-error'); // Add a warning icon
    },

    clearLog: function() {
        if (this.logElement) {
            this.logElement.innerHTML = '';
        }
        // --- More human text ---
        this.log("Ready when you are! Use the tools or ask the AI Assistant.", 'log-step');
    },

    // --- Animation Methods ---
    
    /**
     * Adds a new visual animation to be drawn by the canvas.
     * @param {string} type - e.g., 'pulse'
     * @param {object} target - The component to animate (e.g., a Wire)
     * @param {number} duration - How long the animation should last (in ms)
     */
    addAnimation: function(type, target, duration) {
        // With a 0ms delay, pulses are too fast. Let's give them a minimum duration.
        const animDuration = Math.max(duration, 300); // 300ms pulse
        const animation = {
            type: type,
            target: target,
            startTime: Date.now(),
            duration: animDuration
        };
        this.activeAnimations.push(animation);
    },

    /**
     * Clears out old animations and returns the active list.
     * This is called by canvas.js on every frame.
     */
    getActiveAnimations: function() {
        const now = Date.now();
        // Filter out animations that have expired
        this.activeAnimations = this.activeAnimations.filter(anim => {
            return (now - anim.startTime) < anim.duration;
        });
        return this.activeAnimations;
    },

    // --- Simulation Control Methods ---

    /**
     * --- MODIFIED: This is now the "live update" trigger ---
     * Starts the step-by-step simulation.
     */
    startSimulation: function() {
        // --- NEW: Clear any pending simulation from the *last* change ---
        if (this.simulationTimeoutId) {
            clearTimeout(this.simulationTimeoutId);
            this.simulationTimeoutId = null;
        }

        this.simulationStepCounter = 0; // Reset safety counter
        this.clearLog(); // Clear log for a fresh run
        // --- More human text ---
        this.logStep("Recalculating simulation...");

        this.simulationQueue = Simulator.buildSimulationQueue();
        
        if (this.simulationQueue.length === 0) {
            // --- More human text ---
            this.logError("Hmm, doesn't look like there's anything connected to simulate. Try adding some wires or inputs?");
            return;
        }

        // --- More human text ---
        this.logStep(`Got ${this.simulationQueue.length} starting component(s). Here we go...`);
        this.processQueue(); // Start processing
    },

    /**
     * --- MODIFIED: pauseSimulation function removed ---
     */

    /**
     * Resets the simulation and all animations.
     * Called by Simulator.resetSimulation()
     */
    resetSimulation: function() {
        // --- NEW: Clear any pending simulation ---
        if (this.simulationTimeoutId) {
            clearTimeout(this.simulationTimeoutId);
            this.simulationTimeoutId = null;
        }
        this.simulationQueue = [];
        this.activeAnimations = [];
        this.clearLog(); // Adds the "Ready" message
    },

    /**
     * The core animation loop. Processes one event from the queue.
     * --- THIS IS THE NEW EVENT-DRIVEN ENGINE ---
     */
    processQueue: function() {
        // --- 1. Check stop conditions ---
        // --- MODIFIED: Removed all `isStepping` checks ---
        if (this.simulationQueue.length === 0) {
             // --- More human text ---
            this.logStep("Looks like that's everything! Simulation finished.");
            this.simulationTimeoutId = null; // --- NEW: Mark as finished
            return;
        }

        // --- 2. Safety check for infinite loops ---
        this.simulationStepCounter++;
        if (this.simulationStepCounter > this.MAX_SIMULATION_STEPS) {
            this.logError(`Simulation limit reached (${this.MAX_SIMULATION_STEPS} steps). This might be an infinite loop (like a clock!). Stopping simulation.`);
            this.simulationTimeoutId = null; // --- NEW: Mark as finished
            return;
        }

        // --- 3. Process the next event ---
        const event = this.simulationQueue.shift();

        try { 
            switch (event.type) {
                
                // --- An InputToggle was changed ---
                case 'UPDATE_INPUT': {
                    const component = event.component;
                    
                    // --- *** BUG FIX *** ---
                    // component.calculate(); // REMOVED! State is already set by toggle().
                    // --- *** ---
                    
                    this.logStep(`Input \`${component.label || component.id}\` value is now \`${component.state}\``);
                    
                    // Add new events for all connected wires
                    const outputNode = component.outputNodes[0];
                    for (const wire of outputNode.connections) {
                        this.simulationQueue.push({
                            type: 'PROPAGATE',
                            wire: wire,
                            newState: outputNode.state // Propagate the state set by toggle()
                        });
                    }
                    break;
                }
                
                // --- A Wire is propagating a signal ---
                case 'PROPAGATE': {
                    const wire = event.wire;
                    const newState = event.newState;

                    // Only proceed if the state is *actually* changing
                    if (wire.state === newState && wire.endNode.state === newState) {
                        break; // No change, stop propagation
                    }
                    
                    const oldWireState = wire.state;
                    wire.state = newState;
                    wire.endNode.state = newState;
                    
                    if (oldWireState !== newState) {
                        const fromLabel = wire.startNode.parentComponent.label || wire.startNode.parentComponent.id;
                        const toLabel = wire.endNode.parentComponent.label || wire.endNode.parentComponent.id;
                        this.log(`   Signal \`${newState}\` is heading from \`${fromLabel}\` towards \`${toLabel}\``);
                        // --- Use a fixed duration for pulse since delay is 0 ---
                        this.addAnimation('pulse', wire, 300); // 300ms pulse
                    }
                    
                    // Add a new event for the component this wire connects to
                    const nextComponent = wire.endNode.parentComponent;
                    if (nextComponent && !(nextComponent instanceof InputToggle)) {
                        this.simulationQueue.push({
                            type: 'CALCULATE',
                            component: nextComponent
                        });
                    }
                    break;
                }
                
                // --- A Gate or OutputLed is calculating its state ---
                case 'CALCULATE': {
                    const gate = event.component;
                    const isOutputLed = gate instanceof OutputLed;
                    const oldState = isOutputLed ? gate.state : (gate.outputNodes[0]?.state ?? 0);
                    
                    const newState = gate.calculate(); 
                    
                    // Only proceed if the output state *actually* changed
                    // (But always update/log LEDs)
                    if (oldState === newState && !isOutputLed) {
                        break; // No change, stop propagation
                    }

                    const inputs = gate.inputNodes.map(n => n.state).join(', ');
                    const gateLabel = gate.label || gate.id;

                    if (isOutputLed) {
                        gate.state = newState; // Update the LED's internal state
                        this.logStep(`Output \`${gateLabel}\` turned ${newState === 1 ? 'ON' : 'OFF'} (Input was: \`${inputs}\`)`);
                    } else {
                        // It's a gate, update its output node
                        gate.outputNodes[0].state = newState;
                        this.log(`   Gate \`${gateLabel}\` figured out: inputs [\`${inputs}\`] result in \`${newState}\``, 'log-calc');
                        this.logStep(`   ...so, \`${gateLabel}\`'s output changed: \`${oldState}\` -> \`${newState}\``);

                        // Add new events for all connected output wires
                        for (const wire of gate.outputNodes[0].connections) {
                            this.simulationQueue.push({
                                type: 'PROPAGATE',
                                wire: wire,
                                newState: newState
                            });
                        }
                    }
                    break;
                }

                default:
                    console.warn("Unknown event type in queue:", event);
                    this.logError(`Hmm, I encountered an unknown step type: ${event.type}`);
            }
        } catch (execError) {
             console.error("Error executing simulation event:", execError, event);
             this.logError(`Oops! Something went wrong during simulation: ${execError.message}`);
             this.simulationTimeoutId = null; // --- NEW: Mark as finished
             return;
        }

        // --- 4. Schedule the next step ---
        // --- MODIFIED: Store the timeout ID ---
        this.simulationTimeoutId = setTimeout(() => {
            this.processQueue();
        }, this.SIMULATION_DELAY);
    }
};

// --- *** BUG FIX *** ---
// The line below was causing a crash because it ran before the HTML was loaded.
// Main.init() now correctly calls this function at the right time.
// AnimationManager.init(); // <-- REMOVED THIS LINE